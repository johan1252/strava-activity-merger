import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { Logger } from '@aws-lambda-powertools/logger';
import { LambdaClient, InvokeCommand } from '@aws-sdk/client-lambda';
import {
    getTrainingPlanItem,
    startTrainingPlanGeneration,
    failTrainingPlanGeneration,
} from '../services/activityCache';
import { resolveAthleteId } from '../utils/resolveAthlete';
import type { RaceDistance, TrainingPlanRequest } from '../types/trainingPlan';

const logger = new Logger({ serviceName: 'trainingPlan' });
const lambdaClient = new LambdaClient({});

const RACE_DISTANCES: RaceDistance[] = ['5K', '10K', 'Half Marathon', 'Marathon'];
const MS_PER_DAY = 24 * 60 * 60 * 1000;
const MAX_WEEKS_OUT = 52;
const MAX_TARGET_TIME_SECONDS = 24 * 60 * 60;
// A generation that's been "in progress" longer than this is assumed to have
// crashed (e.g. the worker Lambda errored before it could mark itself failed) —
// self-heal on read so the frontend doesn't poll forever.
const STUCK_GENERATION_THRESHOLD_SECONDS = 2 * 60;

function todayDateString(): string {
    return new Date().toISOString().slice(0, 10);
}

function validateRequest(body: unknown): TrainingPlanRequest {
    const { raceDistance, raceDate, targetTimeSeconds } = (body ?? {}) as Record<string, unknown>;

    if (typeof raceDistance !== 'string' || !RACE_DISTANCES.includes(raceDistance as RaceDistance)) {
        throw new Error(`raceDistance must be one of: ${RACE_DISTANCES.join(', ')}`);
    }

    if (typeof raceDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(raceDate)) {
        throw new Error('raceDate must be a YYYY-MM-DD date string');
    }
    const raceDateMs = new Date(`${raceDate}T00:00:00Z`).getTime();
    if (isNaN(raceDateMs)) {
        throw new Error('raceDate is not a valid date');
    }
    const todayMs = new Date(`${todayDateString()}T00:00:00Z`).getTime();
    if (raceDateMs <= todayMs) {
        throw new Error('raceDate must be in the future');
    }
    if (raceDateMs - todayMs > MAX_WEEKS_OUT * 7 * MS_PER_DAY) {
        throw new Error(`raceDate must be within ${MAX_WEEKS_OUT} weeks from today`);
    }

    let parsedTargetTimeSeconds: number | undefined;
    if (targetTimeSeconds !== undefined && targetTimeSeconds !== null) {
        if (typeof targetTimeSeconds !== 'number' || !Number.isFinite(targetTimeSeconds)
            || targetTimeSeconds <= 0 || targetTimeSeconds > MAX_TARGET_TIME_SECONDS) {
            throw new Error(`targetTimeSeconds must be a positive number under ${MAX_TARGET_TIME_SECONDS}`);
        }
        parsedTargetTimeSeconds = targetTimeSeconds;
    }

    return {
        raceDistance: raceDistance as RaceDistance,
        raceDate,
        targetTimeSeconds: parsedTargetTimeSeconds,
    };
}

const trainingPlan = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
    logger.info('Entered handler', { method: event.httpMethod });
    try {
        if (!event?.headers?.Authorization) {
            throw new Error('No Authorization information provided');
        }
        const accessToken = event.headers.Authorization.split(' ')[1];
        const athleteId = await resolveAthleteId(accessToken);
        logger.appendKeys({ athleteId });

        if (event.httpMethod === 'GET') {
            let item = await getTrainingPlanItem(athleteId);

            if (item?.status === 'generating' && Math.floor(Date.now() / 1000) - item.requestedAt > STUCK_GENERATION_THRESHOLD_SECONDS) {
                logger.warn('Training plan generation appears stuck — marking as failed');
                await failTrainingPlanGeneration(athleteId, 'Generation timed out. Please try again.');
                item = await getTrainingPlanItem(athleteId);
            }

            if (!item) {
                return { statusCode: 200, body: JSON.stringify({ item: null }) };
            }

            const isPast = item.request.raceDate < todayDateString();
            return { statusCode: 200, body: JSON.stringify({ item: { ...item, isPast } }) };
        }

        if (event.httpMethod === 'POST') {
            if (!event.body) throw new Error('Missing request body');
            const request = validateRequest(JSON.parse(event.body));

            await startTrainingPlanGeneration(athleteId, request);
            await lambdaClient.send(new InvokeCommand({
                FunctionName: process.env.GENERATE_TRAINING_PLAN_FUNCTION_ARN,
                InvocationType: 'Event',
                Payload: Buffer.from(JSON.stringify({ athleteId, request })),
            }));

            return { statusCode: 202, body: JSON.stringify({ status: 'generating' }) };
        }

        return { statusCode: 405, body: JSON.stringify({ message: 'Method Not Allowed' }) };
    } catch (error) {
        logger.error({ message: 'Error in handler', error });
        return {
            statusCode: 500,
            body: JSON.stringify({
                message: 'Internal Server Error',
                error: (error as Error).message,
            }),
        };
    }
};

const handler = trainingPlan;

export { handler };
