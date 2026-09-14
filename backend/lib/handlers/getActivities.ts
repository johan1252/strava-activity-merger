import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { Logger } from '@aws-lambda-powertools/logger';
import { LambdaClient, InvokeCommand } from '@aws-sdk/client-lambda';
import strava from 'strava-v3';
import {
    getSyncMeta,
    isSyncStale,
    claimSyncSlot,
    upsertActivities,
    updateLastSyncCompletedAt,
    queryActivities,
} from '../services/activityCache';
import type { ActivityFilters } from '../types/activity';

const logger = new Logger({ serviceName: 'getActivities' });
const lambdaClient = new LambdaClient({});
const PAGE_SIZE = 25;

// Cache athlete IDs per access token across warm Lambda invocations to avoid
// calling strava.athlete.get() on every request.
const athleteIdCache = new Map<string, number>();

const getActivities = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
    logger.info('Entered handler');
    try {
        if (!event?.headers?.Authorization) {
            throw new Error('No Authorization information provided');
        }

        const qs = event.queryStringParameters ?? {};
        const page = qs.page ? Math.max(1, parseInt(qs.page)) : 1;
        if (isNaN(page)) throw new Error('Invalid page number');

        const filters: ActivityFilters = {
            sportType: qs.sportType || undefined,
            minDistance: qs.minDistance ? parseFloat(qs.minDistance) : undefined,
            maxDistance: qs.maxDistance ? parseFloat(qs.maxDistance) : undefined,
            minPace: qs.minPace ? parseFloat(qs.minPace) : undefined,
            maxPace: qs.maxPace ? parseFloat(qs.maxPace) : undefined,
        };

        const accessToken = event.headers.Authorization.split(' ')[1];
        await strava.client(accessToken);

        let athleteId = athleteIdCache.get(accessToken);
        if (!athleteId) {
            const athlete = await (strava.athlete.get({}) as unknown as Promise<{ id: number }>);
            athleteId = athlete.id;
            athleteIdCache.set(accessToken, athleteId);
        }
        logger.appendKeys({ athleteId });

        const syncMeta = await getSyncMeta(athleteId);
        const needsFullSync = !syncMeta || isSyncStale(syncMeta);

        if (needsFullSync) {
            logger.info('Cache miss — returning Strava page directly and triggering async sync');

            const activities = await strava.athlete.listActivities({ page, per_page: PAGE_SIZE });

            // Best-effort: write this page to the cache
            if (Array.isArray(activities) && activities.length) {
                await upsertActivities(athleteId, activities).catch(() => {});
            }

            // Claim the sync slot atomically — only one Lambda triggers the background sync
            const claimed = await claimSyncSlot(athleteId, syncMeta);
            if (claimed) {
                logger.info('Claimed sync slot — invoking background sync Lambda');
                await lambdaClient.send(new InvokeCommand({
                    FunctionName: process.env.SYNC_ACTIVITIES_FUNCTION_ARN,
                    InvocationType: 'Event',
                    Payload: Buffer.from(JSON.stringify({ athleteId, accessToken })),
                }));
            }

            return {
                statusCode: 200,
                body: JSON.stringify({ activities, page }),
            };
        }

        // Cache hit — check for any new activities since last sync
        logger.info('Cache hit — checking for new activities since last sync');
        if (syncMeta.lastSyncCompletedAt) {
            const newActivities = await strava.athlete.listActivities({
                after: syncMeta.lastSyncCompletedAt,
                per_page: 100,
            });
            if (Array.isArray(newActivities) && newActivities.length) {
                logger.info(`Found ${newActivities.length} new activities — upserting`);
                await upsertActivities(athleteId, newActivities);
                await updateLastSyncCompletedAt(athleteId);
            }
        }

        // Fetch all matching items then paginate in-memory. Distance/pace filters require
        // an in-memory sort regardless (DynamoDB returns them in distance/pace order, not date),
        // so a consistent approach across all filter types is simpler than mixing DynamoDB
        // cursor pagination for some cases and in-memory for others. 
        //
        // Revisit if athletes with very large activity counts (10k+) become a concern.
        const allItems = await queryActivities(athleteId, filters);
        const startIndex = (page - 1) * PAGE_SIZE;
        const activities = allItems.slice(startIndex, startIndex + PAGE_SIZE);
        const hasMore = allItems.length > startIndex + PAGE_SIZE;

        logger.info(`Serving ${activities.length} activities from cache (page ${page} of ${Math.ceil(allItems.length / PAGE_SIZE)})`);

        return {
            statusCode: 200,
            body: JSON.stringify({ activities, page, hasMore }),
        };
    } catch (error) {
        logger.error({ message: 'Error in handler', error });
        return {
            statusCode: 500,
            body: JSON.stringify({
                message: 'Internal Server Error',
                // @ts-ignore
                error: error.message,
            }),
        };
    }
};

const handler = getActivities;

export { handler };
