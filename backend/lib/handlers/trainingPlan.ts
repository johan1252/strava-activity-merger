import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { Logger } from '@aws-lambda-powertools/logger';
import { LambdaClient, InvokeCommand } from '@aws-sdk/client-lambda';
import { randomUUID } from 'crypto';
import {
    listTrainingPlanItems,
    getTrainingPlanItem,
    deleteTrainingPlan,
    startTrainingPlanGeneration,
    failTrainingPlanGeneration,
    setRunManualCompletions,
    startTrainingPlanRevision,
    getSyncMeta,
    queryActivities,
} from '../services/activityCache';
import { trainingPlanWeekDateRange, computeAutoCompletedRunMatches } from '../services/statsAggregation';
import { resolveAthleteId } from '../utils/resolveAthlete';
import { todayDateString, validateRequest } from '../services/trainingPlanRequest';
import { consumeDailyUsage, limitMessage, refundDailyUsageUnit } from '../services/usageLimits';
import type { TrainingPlan, TrainingPlanItem, TrainingPlanRunCompletion } from '../types/trainingPlan';
import type { CachedActivity } from '../types/activity';

type SyncStatus = 'ready' | 'in_progress' | 'not_started';

const logger = new Logger({ serviceName: 'trainingPlan' });
const lambdaClient = new LambdaClient({});

// A generation that's been "in progress" longer than this is assumed to have
// crashed (e.g. the worker Lambda errored before it could mark itself failed) —
// self-heal on read so the frontend doesn't poll forever.
const STUCK_GENERATION_THRESHOLD_SECONDS = 3 * 60;
const MAX_PLANS = 5;
const PLAN_ID_PATTERN = /^[A-Za-z0-9-]{1,40}$/;
const MAX_CHAT_MESSAGE_LENGTH = 1000;

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

function jsonResponse(statusCode: number, body: Record<string, unknown>): APIGatewayProxyResult {
    return { statusCode, body: JSON.stringify(body) };
}

function getSyncStatus(syncMeta: Awaited<ReturnType<typeof getSyncMeta>>): SyncStatus {
    // A brand-new athlete's cache may only hold a partial/first page of activities
    // while the background full sync (triggered by the Activities tab) is still
    // running — surfaced to the frontend so it can show a "come back later" state
    // instead of letting the user generate a plan from incomplete data.
    return !syncMeta ? 'not_started' : !syncMeta.fullSyncDone ? 'in_progress' : 'ready';
}

// Marks a generation that has run too long as failed so the frontend stops polling it.
async function healStuckGeneration(athleteId: number, planId: string, item: TrainingPlanItem): Promise<TrainingPlanItem> {
    if (item.status !== 'generating' || Math.floor(Date.now() / 1000) - item.requestedAt <= STUCK_GENERATION_THRESHOLD_SECONDS) {
        return item;
    }
    logger.warn('Training plan generation appears stuck — marking as failed', { planId });
    await failTrainingPlanGeneration(athleteId, planId, 'Generation timed out. Please try again.');
    return (await getTrainingPlanItem(athleteId, planId)) ?? item;
}

function summarizePlan(id: string, item: TrainingPlanItem, activities: CachedActivity[]) {
    let sessionsDone = 0;
    let sessionsTotal = 0;
    if (item.plan) {
        const effective = buildEffectivePlan(item.plan, item.request.raceDate, activities);
        for (const week of effective.weeks) {
            for (const run of week.runs) {
                sessionsTotal += run.count;
                sessionsDone += run.completions.filter(c => c.completed).length;
            }
        }
    }
    return {
        id,
        status: item.status,
        request: item.request,
        requestedAt: item.requestedAt,
        generatedAt: item.generatedAt,
        errorMessage: item.errorMessage,
        isPast: item.request.raceDate < todayDateString(),
        hasPlan: !!item.plan,
        totalWeeks: item.plan?.weeks.length ?? 0,
        sessionsDone,
        sessionsTotal,
    };
}

async function handleList(athleteId: number, syncStatus: SyncStatus): Promise<APIGatewayProxyResult> {
    const entries = await listTrainingPlanItems(athleteId);
    const healed = await Promise.all(entries.map(async ({ id, item }) => ({ id, item: await healStuckGeneration(athleteId, id, item) })));
    const activities = healed.some(e => e.item.plan) ? await queryActivities(athleteId, {}) : [];
    const plans = healed.map(({ id, item }) => summarizePlan(id, item, activities));
    return jsonResponse(200, { plans, syncStatus, maxPlans: MAX_PLANS });
}

async function handleGetPlan(athleteId: number, planId: string, syncStatus: SyncStatus): Promise<APIGatewayProxyResult> {
    const stored = await getTrainingPlanItem(athleteId, planId);
    if (!stored) return jsonResponse(404, { message: 'Training plan not found' });

    const item = await healStuckGeneration(athleteId, planId, stored);
    const isPast = item.request.raceDate < todayDateString();
    // preferences and pendingGoalChange are the coach's working state, not shown to athletes
    const { preferences, pendingGoalChange, ...visibleItem } = await buildResponseItem(athleteId, item) as TrainingPlanItem;
    return jsonResponse(200, { item: { ...visibleItem, id: planId, isPast }, syncStatus });
}

async function handleToggleCompletion(athleteId: number, planId: string, rawBody: string | null, syncStatus: SyncStatus): Promise<APIGatewayProxyResult> {
    const item = await getTrainingPlanItem(athleteId, planId);
    if (!item?.plan) return jsonResponse(404, { message: 'Training plan not found' });

    if (!rawBody) throw new Error('Missing request body');
    const { weekNumber, runIndex, instanceIndex, completed } = JSON.parse(rawBody) as Record<string, unknown>;

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
    await setRunManualCompletions(athleteId, planId, weekIndex, runIndex, manualCompletions);

    return handleGetPlan(athleteId, planId, syncStatus);
}

async function startGeneration(athleteId: number, planId: string, rawBody: string | null): Promise<APIGatewayProxyResult> {
    if (!rawBody) throw new Error('Missing request body');
    const request = validateRequest(JSON.parse(rawBody));

    if (!(await consumeDailyUsage(athleteId, 'build'))) {
        return jsonResponse(429, { message: limitMessage('build'), code: 'daily_limit' });
    }

    await startTrainingPlanGeneration(athleteId, planId, request);
    await lambdaClient.send(new InvokeCommand({
        FunctionName: process.env.GENERATE_TRAINING_PLAN_FUNCTION_ARN,
        InvocationType: 'Event',
        Payload: Buffer.from(JSON.stringify({ athleteId, planId, request })),
    }));
    return jsonResponse(202, { status: 'generating', id: planId });
}

async function handleCreate(athleteId: number, rawBody: string | null, syncStatus: SyncStatus): Promise<APIGatewayProxyResult> {
    if (syncStatus !== 'ready') {
        logger.info('Rejecting plan generation — full activity sync not complete yet', { syncStatus });
        return jsonResponse(200, { status: 'not_synced', syncStatus });
    }

    const existing = await listTrainingPlanItems(athleteId);
    if (existing.length >= MAX_PLANS) {
        return jsonResponse(409, { message: `You can have up to ${MAX_PLANS} training plans — delete one to add another`, code: 'plan_limit' });
    }

    return startGeneration(athleteId, randomUUID(), rawBody);
}

async function handleRegenerate(athleteId: number, planId: string, rawBody: string | null, syncStatus: SyncStatus): Promise<APIGatewayProxyResult> {
    if (syncStatus !== 'ready') {
        logger.info('Rejecting plan generation — full activity sync not complete yet', { syncStatus });
        return jsonResponse(200, { status: 'not_synced', syncStatus });
    }
    if (!(await getTrainingPlanItem(athleteId, planId))) return jsonResponse(404, { message: 'Training plan not found' });

    return startGeneration(athleteId, planId, rawBody);
}

// Saves the athlete's message and starts the async revision worker; the reply and the
// revised plan arrive through the same GET polling used for plan generation.
async function handleChatMessage(athleteId: number, planId: string, rawBody: string | null): Promise<APIGatewayProxyResult> {
    const item = await getTrainingPlanItem(athleteId, planId);
    if (!item?.plan) return jsonResponse(404, { message: 'Training plan not found' });
    if (item.request.raceDate < todayDateString()) {
        return jsonResponse(400, { message: 'This race date has passed — set a new goal first' });
    }

    const body = rawBody ? JSON.parse(rawBody) : {};
    const message = typeof body.message === 'string' ? body.message.trim() : '';
    if (!message || message.length > MAX_CHAT_MESSAGE_LENGTH) {
        return jsonResponse(400, { message: `message must be 1-${MAX_CHAT_MESSAGE_LENGTH} characters` });
    }

    if (!(await consumeDailyUsage(athleteId, 'chat'))) {
        return jsonResponse(429, { message: limitMessage('chat'), code: 'daily_limit' });
    }

    const started = await startTrainingPlanRevision(athleteId, planId, message);
    if (!started) {
        await refundDailyUsageUnit(athleteId, 'chat');
        return jsonResponse(409, { message: 'Your plan is still updating — wait for it to finish' });
    }

    await lambdaClient.send(new InvokeCommand({
        FunctionName: process.env.REVISE_TRAINING_PLAN_FUNCTION_ARN,
        InvocationType: 'Event',
        Payload: Buffer.from(JSON.stringify({ athleteId, planId })),
    }));
    return jsonResponse(202, { status: 'generating' });
}

const trainingPlan = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
    logger.info('Entered handler', { method: event.httpMethod, resource: event.resource });
    try {
        if (!event?.headers?.Authorization) {
            throw new Error('No Authorization information provided');
        }
        const accessToken = event.headers.Authorization.split(' ')[1];
        const athleteId = await resolveAthleteId(accessToken);
        logger.appendKeys({ athleteId });

        const syncStatus = getSyncStatus(await getSyncMeta(athleteId));
        const method = event.httpMethod;
        const planId = event.pathParameters?.planId;
        const isChat = !!event.resource?.endsWith('/chat');

        if (!planId) {
            if (method === 'GET') return await handleList(athleteId, syncStatus);
            if (method === 'POST') return await handleCreate(athleteId, event.body, syncStatus);
            return jsonResponse(405, { message: 'Method Not Allowed' });
        }

        if (!PLAN_ID_PATTERN.test(planId)) return jsonResponse(400, { message: 'Invalid plan id' });
        logger.appendKeys({ planId });

        if (isChat) {
            if (method === 'POST') return await handleChatMessage(athleteId, planId, event.body);
            return jsonResponse(405, { message: 'Method Not Allowed' });
        }

        if (method === 'GET') return await handleGetPlan(athleteId, planId, syncStatus);
        if (method === 'PATCH') return await handleToggleCompletion(athleteId, planId, event.body, syncStatus);
        if (method === 'POST') return await handleRegenerate(athleteId, planId, event.body, syncStatus);
        if (method === 'DELETE') {
            await deleteTrainingPlan(athleteId, planId);
            return jsonResponse(200, { status: 'deleted' });
        }
        return jsonResponse(405, { message: 'Method Not Allowed' });
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
