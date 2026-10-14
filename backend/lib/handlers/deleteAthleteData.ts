import { Logger } from '@aws-lambda-powertools/logger';
import { S3Client, ListObjectsV2Command, DeleteObjectsCommand } from '@aws-sdk/client-s3';
import strava from 'strava-v3';
import { deleteAthleteItems } from '../services/activityCache';
import { getValidAccessToken } from '../services/athleteToken';

const logger = new Logger({ serviceName: 'deleteAthleteData' });
const s3 = new S3Client({});

interface DeleteAthleteDataEvent {
    athleteId: number;
}

type Authorization = 'active' | 'revoked' | 'unknown';

// Strava answers 400 when a refresh token has been revoked and 401 when an access token has.
function isRevocation(error: unknown): boolean {
    const status = (error as { statusCode?: number; status?: number }).statusCode ?? (error as { status?: number }).status;
    return status === 400 || status === 401;
}

// Strava does not sign its webhook events, so a "deauthorized" event is only a hint. Ask Strava
// with the athlete's own stored token before deleting anything. Errors other than a revocation
// (network, Strava outage, rate limit) are thrown so the invocation is retried.
async function checkAuthorization(athleteId: number): Promise<Authorization> {
    try {
        const accessToken = await getValidAccessToken(athleteId);
        if (!accessToken) return 'unknown';

        await strava.client(accessToken);
        await strava.athlete.get({});
        return 'active';
    } catch (error) {
        if (isRevocation(error)) return 'revoked';
        throw error;
    }
}

// Backups of files made by combine and round actions are stored under "<first name>-<athlete id>/".
async function deleteBackups(athleteId: number): Promise<number> {
    const bucket = process.env.STREVEN_TMP_BUCKET_NAME;
    if (!bucket) return 0;

    const keys: string[] = [];
    let continuationToken: string | undefined;
    do {
        const page = await s3.send(new ListObjectsV2Command({ Bucket: bucket, ContinuationToken: continuationToken }));
        for (const object of page.Contents ?? []) {
            if (object.Key && object.Key.split('/')[0].endsWith(`-${athleteId}`)) keys.push(object.Key);
        }
        continuationToken = page.NextContinuationToken;
    } while (continuationToken);

    for (let i = 0; i < keys.length; i += 1000) {
        await s3.send(new DeleteObjectsCommand({
            Bucket: bucket,
            Delete: { Objects: keys.slice(i, i + 1000).map(Key => ({ Key })) },
        }));
    }
    return keys.length;
}

const deleteAthleteData = async (event: DeleteAthleteDataEvent): Promise<void> => {
    const { athleteId } = event;
    logger.appendKeys({ athleteId });

    const authorization = await checkAuthorization(athleteId);

    if (authorization === 'active') {
        logger.warn('Deauthorization event ignored — Strava still accepts this athlete\'s token');
        return;
    }

    // With no stored token there is no way to confirm the event, so only what can be rebuilt
    // from Strava goes; plans and chats stay until the athlete asks for deletion by email.
    const confirmed = authorization === 'revoked';
    const items = await deleteAthleteItems(athleteId, !confirmed);
    const backups = confirmed ? await deleteBackups(athleteId) : 0;
    logger.info('Athlete data deleted', { confirmed, items, backups });
};

const handler = deleteAthleteData;

export { handler, checkAuthorization };
