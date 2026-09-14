import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { Logger } from '@aws-lambda-powertools/logger';
import { queryActivities } from '../services/activityCache';
import { resolveAthlete } from '../utils/resolveAthlete';
import {
    computeVolumeTrend,
    computePaceTrend,
    computeStreak,
    computeWeekStreak,
    computeCalendarDays,
} from '../services/statsAggregation';
import type { StatsResponse, GearStat, Timeframe } from '../types/stats';

const logger = new Logger({ serviceName: 'getStats' });
const VALID_TIMEFRAMES: Timeframe[] = ['7d', '3m', '6m', '1y'];

const getStats = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
    logger.info('Entered handler');
    try {
        if (!event?.headers?.Authorization) {
            throw new Error('No Authorization information provided');
        }

        const requestedTimeframe = event.queryStringParameters?.timeframe;
        const timeframe: Timeframe = VALID_TIMEFRAMES.includes(requestedTimeframe as Timeframe)
            ? (requestedTimeframe as Timeframe)
            : '6m';

        const accessToken = event.headers.Authorization.split(' ')[1];
        const athlete = await resolveAthlete(accessToken);
        const athleteId = athlete.id;
        logger.appendKeys({ athleteId, timeframe });

        // Relies on the activity cache already being populated/kept warm by the
        // Activities tab (the default tab) — this endpoint does not trigger a sync
        // of its own, it just aggregates whatever is currently cached.
        const activities = await queryActivities(athleteId, {});

        const gear: GearStat[] = [
            ...(athlete.shoes ?? []).map(g => ({ id: g.id, name: g.name, type: 'shoe' as const, distance: g.distance })),
            ...(athlete.bikes ?? []).map(g => ({ id: g.id, name: g.name, type: 'bike' as const, distance: g.distance })),
        ];

        const response: StatsResponse = {
            volumeTrend: computeVolumeTrend(activities, timeframe),
            paceTrend: computePaceTrend(activities, timeframe),
            streak: computeStreak(activities),
            weekStreak: computeWeekStreak(activities),
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
