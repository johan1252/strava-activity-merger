import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { Logger } from '@aws-lambda-powertools/logger';
import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';
import {
    getLookupItem,
    getActivityItem,
    updateActivityItem,
    deleteActivityItem,
} from '../services/activityCache';

const secretsClient = new SecretsManagerClient({});
let cachedVerifyToken: string | undefined;

async function getVerifyToken(): Promise<string> {
    if (!cachedVerifyToken) {
        const result = await secretsClient.send(new GetSecretValueCommand({
            SecretId: process.env.STRAVA_WEBHOOK_VERIFY_TOKEN_SECRET_ARN!,
        }));
        cachedVerifyToken = result.SecretString!;
    }
    return cachedVerifyToken;
}

const logger = new Logger({ serviceName: 'stravaWebhook' });

interface WebhookEvent {
    aspect_type: 'create' | 'update' | 'delete';
    object_type: 'activity' | 'athlete';
    object_id: number;
    owner_id: number;
    updates?: {
        title?: string;
        type?: string;
        visibility?: string;
    };
}

const stravaWebhook = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
    logger.info('Entered handler', { method: event.httpMethod });

    try {
        if (event.httpMethod === 'GET') {
            return await handleValidation(event);
        }
        if (event.httpMethod === 'POST') {
            return await handleEvent(event);
        }
        return { statusCode: 405, body: JSON.stringify({ message: 'Method Not Allowed' }) };
    } catch (error) {
        logger.error({ message: 'Error in handler', error });
        return {
            statusCode: 500,
            body: JSON.stringify({ message: 'Internal Server Error', error: (error as Error).message }),
        };
    }
};

async function handleValidation(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
    const qs = event.queryStringParameters ?? {};
    const verifyToken = qs['hub.verify_token'];
    const challenge = qs['hub.challenge'];

    const expectedToken = await getVerifyToken();
    if (verifyToken !== expectedToken) {
        logger.warn('Webhook validation failed — invalid verify token');
        return { statusCode: 403, body: JSON.stringify({ message: 'Forbidden' }) };
    }

    logger.info('Webhook validation successful');
    return { statusCode: 200, body: JSON.stringify({ 'hub.challenge': challenge }) };
}

async function handleEvent(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
    if (!event.body) {
        return { statusCode: 400, body: JSON.stringify({ message: 'Missing body' }) };
    }

    // Strava does not sign webhook event POSTs (no X-Hub-Signature or equivalent) —
    // the verify_token is only used during the one-time GET subscription handshake.
    // Blast radius is bounded: unknown activityIds are no-ops (see getLookupItem below),
    // so a forged event can only affect an activity already present in our own cache.
    const payload: WebhookEvent = JSON.parse(event.body);
    const { aspect_type, object_type, object_id: activityId, owner_id: athleteId, updates } = payload;
    logger.appendKeys({ activityId, athleteId, aspect_type });

    if (object_type !== 'activity') {
        logger.info('Ignoring non-activity event');
        return { statusCode: 200, body: 'OK' };
    }

    if (aspect_type === 'create') {
        // New activities are picked up by the incremental sync on the next user visit
        logger.info('Create event — no-op (incremental sync will handle it)');
        return { statusCode: 200, body: 'OK' };
    }

    const lookup = await getLookupItem(activityId);
    if (!lookup) {
        logger.info('Activity not in cache — no-op');
        return { statusCode: 200, body: 'OK' };
    }

    const { athletePK, activitySK } = lookup;

    if (aspect_type === 'delete') {
        logger.info('Deleting activity from cache');
        await deleteActivityItem(athletePK, activitySK, activityId);
        return { statusCode: 200, body: 'OK' };
    }

    if (aspect_type === 'update') {
        logger.info('Updating activity in cache', { updates });
        const existing = await getActivityItem(athletePK, activitySK);
        if (!existing) {
            logger.warn('Activity lookup resolved but item not found — skipping');
            return { statusCode: 200, body: 'OK' };
        }
        await updateActivityItem(existing, updates ?? {});
        return { statusCode: 200, body: 'OK' };
    }

    return { statusCode: 200, body: 'OK' };
}

const handler = stravaWebhook;

export { handler };
