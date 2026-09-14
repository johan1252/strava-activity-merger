import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { Logger } from '@aws-lambda-powertools/logger';
import { queryActivities } from '../services/activityCache';
import { resolveAthlete } from '../utils/resolveAthlete';
import {
    computeVolumeTrend,
    computePaceTrend,
    computeStreak,
    computeWeekStreak,
    computeSportBreakdown,
    computeCalendarDays,
} from '../services/statsAggregation';
import type { StatsResponse, GearStat } from '../types/stats';

const logger = new Logger({ serviceName: 'getStats' });

const getStats = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
    logger.info('Entered handler');
    try {
        if (!event?.headers?.Authorization) {
            throw new Error('No Authorization information provided');
        }

        const accessToken = event.headers.Authorization.split(' ')[1];
        const athlete = await resolveAthlete(accessToken);
        const athleteId = athlete.id;
        logger.appendKeys({ athleteId });

        // Relies on the activity cache already being populated/kept warm by the
        // Activities tab (the default tab) — this endpoint does not trigger a sync
        // of its own, it just aggregates whatever is currently cached.
        const activities = await queryActivities(athleteId, {});

        const gear: GearStat[] = [
            ...(athlete.shoes ?? []).map(g => ({ id: g.id, name: g.name, type: 'shoe' as const, distance: g.distance })),
            ...(athlete.bikes ?? []).map(g => ({ id: g.id, name: g.name, type: 'bike' as const, distance: g.distance })),
        ];

        const response: StatsResponse = {
            volumeTrend: computeVolumeTrend(activities),
            paceTrend: computePaceTrend(activities),
            streak: computeStreak(activities),
            weekStreak: computeWeekStreak(activities),
            sportBreakdown: computeSportBreakdown(activities),
            calendar: computeCalendarDays(activities),
            gear,
        };

        logger.info(`Computed stats from ${activities.length} cached activities`);

        return {
            statusCode: 200,
            body: JSON.stringify(response),
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

const handler = getStats;

export { handler };
