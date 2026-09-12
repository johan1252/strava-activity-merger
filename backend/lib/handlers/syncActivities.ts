import { Logger } from '@aws-lambda-powertools/logger';
import strava from 'strava-v3';
import { upsertActivities, markSyncComplete } from '../services/activityCache';
import type { StravaActivity } from '../types/activity';

const logger = new Logger({ serviceName: 'syncActivities' });

interface SyncPayload {
    athleteId: number;
    accessToken: string;
}

const syncActivities = async (event: SyncPayload): Promise<void> => {
    const { athleteId, accessToken } = event;
    logger.appendKeys({ athleteId });
    logger.info('Starting full sync');

    await strava.client(accessToken);

    let page = 1;
    let totalSynced = 0;

    while (true) {
        const activities: StravaActivity[] = await strava.athlete.listActivities({ page, per_page: 100 });
        if (!activities || activities.length === 0) break;

        await upsertActivities(athleteId, activities);
        totalSynced += activities.length;
        logger.info(`Synced page ${page} (${activities.length} activities)`);

        if (activities.length < 100) break;
        page++;
    }

    await markSyncComplete(athleteId);
    logger.info(`Full sync complete. Total activities: ${totalSynced}`);
};

const handler = syncActivities;

export { handler };
