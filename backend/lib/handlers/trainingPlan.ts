import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { Logger } from '@aws-lambda-powertools/logger';
import { LambdaClient, InvokeCommand } from '@aws-sdk/client-lambda';
import {
    getTrainingPlanItem,
    startTrainingPlanGeneration,
    failTrainingPlanGeneration,
    setRunManualCompletions,
    getSyncMeta,
    queryActivities,
} from '../services/activityCache';
import { trainingPlanWeekDateRange, computeAutoCompletedRunMatches } from '../services/statsAggregation';
import { resolveAthleteId } from '../utils/resolveAthlete';
import type { RaceDistance, TrainingPlanRequest, TrainingPlan, TrainingPlanItem, TrainingPlanRunCompletion } from '../types/trainingPlan';
import type { CachedActivity } from '../types/activity';

type SyncStatus = 'ready' | 'in_progress' | 'not_started';

const logger = new Logger({ serviceName: 'trainingPlan' });
const lambdaClient = new LambdaClient({});

const RACE_DISTANCES: RaceDistance[] = ['5K', '10K', 'Half Marathon', 'Marathon'];
const MS_PER_DAY = 24 * 60 * 60 * 1000;
const MAX_WEEKS_OUT = 52;
const MAX_TARGET_TIME_SECONDS = 24 * 60 * 60;
// Floors roughly in line with current world-record pace for each distance — anything
// faster isn't a real target for this app's users. Matches the frontend's dropdown range.
const MIN_TARGET_TIME_SECONDS: Record<RaceDistance, number> = {
    '5K': 12 * 60,
    '10K': 25 * 60,
    'Half Marathon': 60 * 60,
    'Marathon': 2 * 60 * 60,
};
// A generation that's been "in progress" longer than this is assumed to have
// crashed (e.g. the worker Lambda errored before it could mark itself failed) —
// self-heal on read so the frontend doesn't poll forever.
const STUCK_GENERATION_THRESHOLD_SECONDS = 2 * 60;
const MIN_DAYS_PER_WEEK = 1;
const MAX_DAYS_PER_WEEK = 7;

function todayDateString(): string {
    return new Date().toISOString().slice(0, 10);
}

// Recomputes auto-detection fresh from currently-cached activities (never persisted, so
// a plan never needs "refreshing" as new activities sync in) and merges it with each
// run's stored, permanent manual overrides. `manualCompletions` itself is never sent to
// the frontend — only the merged, effective `completions` array.
function buildEffectivePlan(plan: TrainingPlan, raceDate: string, activities: CachedActivity[]) {
    const totalWeeks = plan.weeks.length;
    return {
        ...plan,
        weeks: plan.weeks.map(week => {
            const { start, end } = trainingPlanWeekDateRange(raceDate, totalWeeks, week.weekNumber);
            const autoMatches = computeAutoCompletedRunMatches(week.runs, start, end, activities);
            return {
                ...week,
                runs: week.runs.map((run, i) => {
                    const runAutoMatches = autoMatches[i];
                    const { manualCompletions, ...rest } = run;
                    // Plans generated before this field existed have no manualCompletions
                    // stored — treat every instance as having no manual override yet.
                    const effectiveManualCompletions = manualCompletions ?? Array(run.count).fill(null);
                    const completions: TrainingPlanRunCompletion[] = effectiveManualCompletions.map((manual, instanceIndex) => {
                        if (manual !== null) return { completed: manual, manual: true };
                        const match = runAutoMatches[instanceIndex];
                        if (!match) return { completed: false, manual: false };
                        return {
                            completed: true,
                            manual: false,
                            autoActivity: { id: match.activityId, name: match.activityName, date: match.date },
                        };
                    });
                    return { ...rest, completions };
                }),
            };
        }),
    };
}

async function buildResponseItem(athleteId: number, item: TrainingPlanItem) {
    if (!item.plan) return item;
    const activities = await queryActivities(athleteId, {});
    return { ...item, plan: buildEffectivePlan(item.plan, item.request.raceDate, activities) };
}

function validateRequest(body: unknown): TrainingPlanRequest {
    const { raceDistance, raceDate, targetTimeSeconds, daysPerWeek } = (body ?? {}) as Record<string, unknown>;

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

    if (typeof targetTimeSeconds !== 'number' || !Number.isFinite(targetTimeSeconds)
        || targetTimeSeconds <= 0 || targetTimeSeconds > MAX_TARGET_TIME_SECONDS) {
        throw new Error(`targetTimeSeconds is required and must be a positive number under ${MAX_TARGET_TIME_SECONDS}`);
    }
    const minForDistance = MIN_TARGET_TIME_SECONDS[raceDistance as RaceDistance];
    if (targetTimeSeconds < minForDistance) {
        throw new Error(`targetTimeSeconds for ${raceDistance} must be at least ${minForDistance} seconds`);
    }

    let parsedDaysPerWeek: number | undefined;
    if (daysPerWeek !== undefined && daysPerWeek !== null) {
        if (typeof daysPerWeek !== 'number' || !Number.isInteger(daysPerWeek)
            || daysPerWeek < MIN_DAYS_PER_WEEK || daysPerWeek > MAX_DAYS_PER_WEEK) {
            throw new Error(`daysPerWeek must be an integer between ${MIN_DAYS_PER_WEEK} and ${MAX_DAYS_PER_WEEK}`);
        }
        parsedDaysPerWeek = daysPerWeek;
    }

    return {
        raceDistance: raceDistance as RaceDistance,
        raceDate,
        targetTimeSeconds,
        daysPerWeek: parsedDaysPerWeek,
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

        // A brand-new athlete's cache may only hold a partial/first page of activities
        // while the background full sync (triggered by the Activities tab) is still
        // running — surfaced to the frontend so it can show a "come back later" state
        // instead of letting the user generate a plan from incomplete data.
        const syncMeta = await getSyncMeta(athleteId);
        const syncStatus: SyncStatus = !syncMeta ? 'not_started' : !syncMeta.fullSyncDone ? 'in_progress' : 'ready';

        if (event.httpMethod === 'GET') {
            let item = await getTrainingPlanItem(athleteId);

            if (item?.status === 'generating' && Math.floor(Date.now() / 1000) - item.requestedAt > STUCK_GENERATION_THRESHOLD_SECONDS) {
                logger.warn('Training plan generation appears stuck — marking as failed');
                await failTrainingPlanGeneration(athleteId, 'Generation timed out. Please try again.');
                item = await getTrainingPlanItem(athleteId);
            }

            if (!item) {
                return { statusCode: 200, body: JSON.stringify({ item: null, syncStatus }) };
            }

            const isPast = item.request.raceDate < todayDateString();
            const responseItem = await buildResponseItem(athleteId, item);
            return { statusCode: 200, body: JSON.stringify({ item: { ...responseItem, isPast }, syncStatus }) };
        }

        if (event.httpMethod === 'PATCH') {
            const item = await getTrainingPlanItem(athleteId);
            if (!item?.plan) throw new Error('No training plan exists to update');

            if (!event.body) throw new Error('Missing request body');
            const { weekNumber, runIndex, instanceIndex, completed } = JSON.parse(event.body) as Record<string, unknown>;

            const weekIndex = item.plan.weeks.findIndex(w => w.weekNumber === weekNumber);
            if (weekIndex === -1) throw new Error(`No week with weekNumber ${weekNumber}`);
            const run = item.plan.weeks[weekIndex].runs[runIndex as number];
            if (typeof runIndex !== 'number' || !run) throw new Error(`Invalid runIndex ${runIndex}`);
            if (typeof instanceIndex !== 'number' || instanceIndex < 0 || instanceIndex >= run.count) {
                throw new Error(`Invalid instanceIndex ${instanceIndex}`);
            }
            if (typeof completed !== 'boolean') throw new Error('completed must be a boolean');

            const existingManualCompletions = run.manualCompletions ?? Array(run.count).fill(null);
            const manualCompletions = existingManualCompletions.map((m, i) => i === instanceIndex ? completed : m);
            await setRunManualCompletions(athleteId, weekIndex, runIndex, manualCompletions);

            const updatedItem = await getTrainingPlanItem(athleteId);
            const isPast = updatedItem!.request.raceDate < todayDateString();
            const responseItem = await buildResponseItem(athleteId, updatedItem!);
            return { statusCode: 200, body: JSON.stringify({ item: { ...responseItem, isPast }, syncStatus }) };
        }

        if (event.httpMethod === 'POST') {
            if (syncStatus !== 'ready') {
                logger.info('Rejecting plan generation — full activity sync not complete yet', { syncStatus });
                return { statusCode: 200, body: JSON.stringify({ status: 'not_synced', syncStatus }) };
            }

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
