import { Logger } from '@aws-lambda-powertools/logger';
import strava from 'strava-v3';
import { upsertActivities } from '../services/activityCache';
import { getValidAccessToken } from '../services/athleteToken';
import type { StravaActivity } from '../types/activity';

const logger = new Logger({ serviceName: 'upsertWebhookActivity' });

interface UpsertPayload {
    athleteId: number;
    activityId: number;
}

// Fields only present on Strava's detailed activity, dropped to keep cached items small
const DETAIL_ONLY_FIELDS = [
    'splits_metric', 'splits_standard', 'laps', 'segment_efforts', 'best_efforts',
    'photos', 'highlighted_kudosers', 'similar_activities', 'available_zones', 'stats_visibility',
];

const upsertWebhookActivity = async (event: UpsertPayload): Promise<void> => {
    const { athleteId, activityId } = event;
    logger.appendKeys({ athleteId, activityId });

    const accessToken = await getValidAccessToken(athleteId);
    if (!accessToken) {
        logger.info('No stored token for athlete — skipping upsert');
        return;
    }

    await strava.client(accessToken);
    const detailed = await strava.activities.get({ id: activityId }) as unknown as Record<string, unknown>;
    for (const field of DETAIL_ONLY_FIELDS) delete detailed[field];
    await upsertActivities(athleteId, [detailed as unknown as StravaActivity]);
    logger.info('Upserted activity from webhook');
};

const handler = upsertWebhookActivity;

export { handler };
