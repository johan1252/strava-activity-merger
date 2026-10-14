import { Logger } from '@aws-lambda-powertools/logger';
import { LambdaClient, InvokeCommand } from '@aws-sdk/client-lambda';
import OpenAI from 'openai';
import {
    getTrainingPlanItem,
    queryActivities,
    completeTrainingPlanRevision,
    failTrainingPlanRevision,
    startGoalChangeRegeneration,
    failTrainingPlanGeneration,
} from '../services/activityCache';
import { computeVolumeTrend, trainingPlanWeekDateRange } from '../services/statsAggregation';
import { NO_GOAL_CHANGE_MESSAGE, REPLAY_FAILURE_MESSAGE, claimsGoalChange, cleanPreferences, decideGoalChange, mergeRevisedWeeks, planHasDays } from '../services/trainingPlanRevision';
import { RACE_DISTANCES } from '../services/trainingPlanRequest';
import {
    BEDROCK_MODEL_ID,
    createBedrockClient,
    formatDuration,
    parseScores,
    parseWeeks,
} from '../services/trainingPlanModel';
import { SESSION_TYPES, WEEK_DAYS } from '../types/trainingPlan';
import type {
    PendingGoalChange,
    ReviseTrainingPlanEvent,
    TrainingPlan,
    TrainingPlanChatMessage,
    TrainingPlanWeek,
} from '../types/trainingPlan';

const logger = new Logger({ serviceName: 'reviseTrainingPlan' });
const lambdaClient = new LambdaClient({});

// Only the most recent messages are sent back to the model — older ones add cost
// without changing what it needs to know about the athlete's current preferences.
const MAX_CONTEXT_MESSAGES = 12;
const GENERIC_FAILURE_MESSAGE = "Sorry, I couldn't update your plan just now. Please try again.";
const REPLAY_MESSAGE = 'Apply my saved preferences to this new plan.';

const sessionSchema = {
    type: 'object',
    additionalProperties: false,
    required: ['count', 'label', 'activityType', 'distanceKm', 'durationMinutes', 'days', 'notes'],
    properties: {
        count: { type: 'integer' },
        label: { type: 'string' },
        activityType: { type: 'string', enum: [...SESSION_TYPES] },
        distanceKm: { type: 'number' },
        durationMinutes: { type: 'integer' },
        days: { type: 'array', items: { type: 'string', enum: [...WEEK_DAYS] } },
        notes: { type: 'string' },
    },
};

const weekSchema = {
    type: 'object',
    additionalProperties: false,
    required: ['weekNumber', 'totalDistanceKm', 'focus', 'runs'],
    properties: {
        weekNumber: { type: 'integer' },
        totalDistanceKm: { type: 'number' },
        focus: { type: 'string', enum: ['Base', 'Build', 'Peak', 'Taper', 'Race Week'] },
        runs: { type: 'array', items: sessionSchema },
    },
};

const revisionSchema = {
    type: 'object',
    additionalProperties: false,
    required: [
        'reply', 'weeks', 'realismScore', 'realismRationale', 'difficultyScore', 'difficultyRationale',
        'goalAction', 'goalRaceDistance', 'goalRaceDate', 'goalTargetTimeSeconds', 'preferences',
    ],
    properties: {
        reply: { type: 'string' },
        preferences: { type: 'array', items: { type: 'string' } },
        goalAction: { type: 'string', enum: ['none', 'propose', 'confirm', 'cancel'] },
        goalRaceDistance: { type: 'string', enum: ['', ...RACE_DISTANCES] },
        goalRaceDate: { type: 'string' },
        goalTargetTimeSeconds: { type: 'integer' },
        weeks: { type: 'array', items: weekSchema },
        realismScore: { type: 'integer' },
        realismRationale: { type: 'string' },
        difficultyScore: { type: 'integer' },
        difficultyRationale: { type: 'string' },
    },
};

const SYSTEM_PROMPT = `You are an experienced running and endurance coach. An athlete already has a week-by-week training plan for a race and has just sent you a message asking to change it, or asking a question about it. You will be given a JSON object with the race goal, the athlete's recent running volume, the conversation so far, the athlete's new message, and the weeks of the plan that can still be changed (editableWeeks, from the current week onward — earlier weeks are locked and not shown).

Respond with:
- reply: one to three short sentences speaking directly to the athlete ("you"/"your"). Say what you changed and why, or answer their question. If you could not or would not make a requested change, say so plainly.
- weeks: every editable week, with the same weekNumber values in the same order. If the message needs no change to the plan (a question, thanks, or an unsafe or unrelated request), return the editable weeks exactly as given.
- realismScore, realismRationale, difficultyScore, difficultyRationale: the current values from the context, unless your change makes them clearly different. Keep 100 meaning most realistic / most difficult, write the rationale to the athlete in one sentence, and cite the actual numbers.

Each editable week also has a startDate (its Monday) and an endDate (its Sunday); use them to match dates the athlete mentions to weeks. Do not return these two fields.

How a week is described: weeks have a focus (Base, Build, Peak, Taper or Race Week; keep the order Base → Build → Peak → Taper → Race Week and keep the final week as Race Week) and a list of sessions. Each session has:
- count: how many times it repeats that week (each instance is its own day)
- label: a short name, e.g. "Easy run", "Long run", "Strength session", "Swim"
- activityType: one of Run, Swim, Ride, Weights, Yoga, Walk
- distanceKm: distance of one instance. Required for Run. For Swim, Ride and Walk it may be 0 when the session is time-based. Always 0 for Weights and Yoga.
- durationMinutes: minutes for one instance. Always 0 for Run. Required (greater than 0) for Weights, Yoga, Swim, Ride and Walk unless distanceKm is given.
- days: the weekday of each instance, one entry per instance (the array length equals count), chosen from Monday to Sunday. Fill it for every session when includeDays is true in the context, or when the athlete asks for days of the week (now or earlier in the conversation). Otherwise return an empty array. If the athlete asks to remove the days, return an empty array for every session. Only one session per day unless the athlete asks otherwise (for example swimming and weights on the same day).
- notes: a short extra detail, or an empty string

totalDistanceKm for a week is the running distance only: the sum of count × distanceKm over the Run sessions. Cross-training never counts toward it.

Rules for changing the plan:
- Number of running days in a week is the sum of count over its Run sessions. When the athlete asks for N running days a week, give every editable week N running days, except Race Week or a very light recovery week. Move the distance into fewer, longer runs instead of dropping the weekly volume, but do not raise a week's running distance more than about 10% above the previous week, and keep the long run safe for the athlete's longest recent run.
- Cross-training the athlete asks for (weights, swimming, cycling, yoga, walking) goes in as its own sessions in the editable weeks. Use sensible durations (for example 30-45 minutes of weights, 30 minutes of swimming). Keep it off the hardest run days, ease it in the taper, and drop it from Race Week unless asked otherwise. Keep cross-training already in the plan unless the athlete asks to remove it.
- Days (when they are in use): keep the days already in the plan unless the change needs them to move. Honour day requests exactly ("I can't run on Wednesdays", "long run on Saturday", "swim on Tuesdays"). When the athlete cannot train on a day, move that session to another free day — never delete it, and never lower the number of sessions or the weekly distance — unless they also ask to train less. Otherwise space hard runs (tempo, intervals, long run) so they are not on back-to-back days, put the long run on a weekend day, and keep cross-training off the day before the long run. If a session has no day yet, give it one.
- Preferences the athlete gave earlier in the conversation still apply to the weeks you return, unless the new message overrides them.
- Never change the race, the race date, the number of weeks or the weekNumber values in the weeks you return. A change of race goal is handled with goalAction, below. Do not write medical advice; for injury or pain, recommend resting and seeing a professional, and ease the plan if asked.

Standing preferences: also return preferences, the complete list of standing preferences that apply to the athlete's plan after this message, as short plain phrases such as "Run 3 days a week", "One 40-minute weights session each week", "Swim on Tuesdays", "Cannot run on Wednesdays" or "Show the day of the week for every session". Start from savedPreferences in the context, add what the athlete's message adds, change what it changes and remove what it drops. Also include time-bound constraints such as a holiday, travel, an injury or a busy spell, written with exact calendar dates, for example "1-2 runs a week from 1 to 14 November 2026 (holiday)". Use today in the context to turn phrases like "the first two weeks of November" into dates. Drop a time-bound preference once all of its dates are in the past. Leave out goal changes (race, date, target time), questions, thanks and remarks that do not affect the plan. Write at most 12, each under 120 characters. If nothing changed, return savedPreferences as given.

Re-applying preferences: when applyingSavedPreferences is true, the plan was just rebuilt from a new goal and contains only runs, and there is no new athlete message. Apply every saved preference that still makes sense for the new plan (run days, cross-training, days of the week, easier or harder weeks, and dated constraints such as a holiday, which apply to the editable weeks whose startDate to endDate overlap the dates), return the editable weeks, and in reply say in one or two sentences what you re-applied and anything you left out and why. Set goalAction to "none" and return preferences exactly as given.

Changing the race goal: if the athlete asks to change the race distance, the race date or the target finish time, do not edit the weeks. Set goalAction to "propose" and fill goalRaceDistance, goalRaceDate (YYYY-MM-DD; use today in the context to turn something like "March 3" into the next such date) and goalTargetTimeSeconds with the new values for only what they asked to change, using "" or 0 for anything that stays the same. If they change the distance but give no new target time, leave goalTargetTimeSeconds as 0. Use "propose" even when the new value looks invalid (for example a date in the past); the app checks it. A follow-up such as "change the date" or "yes, do that" refers to the goal discussed earlier in the conversation, so take the values from there. Never refuse or postpone a goal change because of where the athlete is in their current plan (for example the taper): propose it and let them confirm. Races can only be 5K, 10K, Half Marathon or Marathon; if the athlete asks for another distance (50 km, an ultra, a 15K), say so in reply, use "none" unless they also asked for a date or time change you can propose, and offer the closest supported distance. Never say or imply that you changed the race date, distance or target time, or rebuilt the plan: only the app does that, after the athlete confirms. The app writes the confirmation question itself from the values you fill in, so leave reply empty unless part of what the athlete asked for cannot be done (such as an unsupported distance); then say so in one short sentence. This is required for an unsupported distance: write a sentence such as "I can only plan 5K, 10K, half marathon and marathon races, so I've left your distance as it is." even when you propose a date change in the same message. When pendingGoalChange is present in the context and the athlete's new message plainly agrees to it with nothing else ("yes", "go ahead", "do it"), set goalAction to "confirm" and leave the goal fields empty. If they agree but also change something ("yes but use a 2 hour target", "yes, make it the 10th"), set goalAction to "propose" and fill only the values they changed (for example goalTargetTimeSeconds 7200); the app keeps the rest of pendingGoalChange and asks them to confirm again; when the message declines it or says to keep the plan, set goalAction to "cancel". In every other case set goalAction to "none" and leave the goal fields empty. Whenever goalAction is not "none", return the editable weeks exactly as given.

Respond with JSON matching the required schema — nothing else.`;

// Preferences are re-applied after a rebuild, so only ticked sessions are lost; athletes with no saved preferences have nothing to re-apply.
function confirmPrompt(hasPreferences: boolean): string {
    return `This will rebuild your plan from scratch, so any sessions you've ticked will be reset.${hasPreferences ? " I'll re-apply your earlier preferences, such as cross-training and run days." : ''} Reply "yes" to go ahead or "no" to keep your current plan.`;
}
const INVALID_GOAL_MESSAGE = "I couldn't set that goal. The race date has to be in the future and within 52 weeks, and the target time has to be realistic for the distance. If you're changing the distance, tell me the new target time as well.";

function currentWeekNumber(raceDate: string, plan: TrainingPlan): number {
    const today = new Date().toISOString().slice(0, 10);
    const total = plan.weeks.length;
    const current = plan.weeks.find(w => trainingPlanWeekDateRange(raceDate, total, w.weekNumber).end >= today);
    return current?.weekNumber ?? plan.weeks[total - 1].weekNumber;
}

function pendingForModel(pending: PendingGoalChange | undefined) {
    if (!pending) return null;
    const { raceDistance, raceDate, targetTimeSeconds } = pending.request;
    return { raceDistance, raceDate, targetTimeSeconds, targetTime: formatDuration(targetTimeSeconds) };
}

function describeGoal(request: PendingGoalChange['request']): string {
    const date = new Date(`${request.raceDate}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
    return `${request.raceDistance} on ${date}, target time ${formatDuration(request.targetTimeSeconds)}`;
}

async function startGeneration(
    athleteId: number,
    planId: string,
    request: PendingGoalChange['request'],
    applyPreferences: boolean,
): Promise<void> {
    await lambdaClient.send(new InvokeCommand({
        FunctionName: process.env.GENERATE_TRAINING_PLAN_FUNCTION_ARN,
        InvocationType: 'Event',
        Payload: Buffer.from(JSON.stringify({ athleteId, planId, request, applyPreferences })),
    }));
}

function toModelWeek(week: TrainingPlanWeek, startDate: string, endDate: string) {
    return {
        weekNumber: week.weekNumber,
        startDate,
        endDate,
        totalDistanceKm: week.totalDistanceKm,
        focus: week.focus,
        runs: week.runs.map(r => ({
            count: r.count,
            label: r.label,
            activityType: r.activityType ?? 'Run',
            distanceKm: r.distanceKm,
            durationMinutes: r.durationMinutes ?? 0,
            days: r.days ?? [],
            notes: r.notes,
        })),
    };
}

const reviseTrainingPlan = async (event: ReviseTrainingPlanEvent): Promise<void> => {
    const { athleteId, planId } = event;
    logger.appendKeys({ athleteId, planId });

    const item = await getTrainingPlanItem(athleteId, planId);
    const replay = !!event.applyPreferences;
    if (!item?.plan || (!replay && !item.chat?.length)) {
        logger.warn('Nothing to revise');
        return;
    }
    const chat: TrainingPlanChatMessage[] = item.chat ?? [];
    const savedPreferences = item.preferences ?? [];
    const { plan, request } = item;

    try {
        // A replay has no athlete message: the saved preferences stand in for one and are never stored in the chat
        const latest: TrainingPlanChatMessage = replay
            ? { role: 'user', content: REPLAY_MESSAGE, at: Math.floor(Date.now() / 1000) }
            : chat[chat.length - 1];
        if (latest.role !== 'user') throw new Error('Last chat message is not from the athlete');

        const editableFrom = currentWeekNumber(request.raceDate, plan);
        const editableWeeks = plan.weeks.filter(w => w.weekNumber >= editableFrom);
        // Plans made before the setting existed carry no flag; their current weeks tell us.
        const includeDays = request.includeDays ?? planHasDays(editableWeeks);
        const activities = await queryActivities(athleteId, {});

        const context = {
            today: new Date().toISOString().slice(0, 10),
            raceDistance: request.raceDistance,
            raceDate: request.raceDate,
            targetTime: formatDuration(request.targetTimeSeconds),
            targetTimeSeconds: request.targetTimeSeconds,
            pendingGoalChange: pendingForModel(item.pendingGoalChange),
            totalWeeks: plan.weeks.length,
            currentWeekNumber: editableFrom,
            preferredRunDaysPerWeek: request.daysPerWeek ?? null,
            includeDays,
            currentScores: {
                realismScore: plan.realismScore,
                realismRationale: plan.realismRationale,
                difficultyScore: plan.difficultyScore,
                difficultyRationale: plan.difficultyRationale,
            },
            last8WeeksRunKm: computeVolumeTrend(activities.filter(a => a.sport_type === 'Run'), '3m').slice(-8).map(w => ({
                weekStart: w.periodStart,
                km: Math.round(w.distance / 100) / 10,
            })),
            savedPreferences,
            applyingSavedPreferences: replay,
            conversation: (replay ? chat : chat.slice(0, -1)).slice(-MAX_CONTEXT_MESSAGES).map(m => ({ role: m.role, content: m.content })),
            athleteMessage: latest.content,
            editableWeeks: editableWeeks.map(w => {
                const { start, end } = trainingPlanWeekDateRange(request.raceDate, plan.weeks.length, w.weekNumber);
                return toModelWeek(w, start, end);
            }),
        };

        const client = createBedrockClient();
        const response = await client.chat.completions.create({
            model: BEDROCK_MODEL_ID,
            max_completion_tokens: 8000,
            reasoning_effort: 'none',
            response_format: {
                type: 'json_schema',
                json_schema: { name: 'training_plan_revision', strict: true, schema: revisionSchema },
            },
            messages: [
                { role: 'system', content: SYSTEM_PROMPT },
                { role: 'user', content: JSON.stringify(context) },
            ],
        });

        const rawContent = response.choices[0]?.message?.content ?? '';
        logger.info('Received revision response', {
            finishReason: response.choices[0]?.finish_reason,
            usage: response.usage,
        });

        const parsed = JSON.parse(rawContent);
        const modelReply = typeof parsed.reply === 'string' ? parsed.reply.trim() : '';
        const now = Math.floor(Date.now() / 1000);
        const send = (content: string): TrainingPlanChatMessage[] => [...chat, { role: 'assistant', content, at: now }];
        const currentIncludeDays = request.includeDays ?? planHasDays(editableWeeks);

        const outcome = decideGoalChange(
            {
                goalAction: replay ? 'none' : parsed.goalAction,
                goalRaceDistance: parsed.goalRaceDistance ?? '',
                goalRaceDate: parsed.goalRaceDate ?? '',
                goalTargetTimeSeconds: Number(parsed.goalTargetTimeSeconds) || 0,
            },
            { ...request, includeDays: currentIncludeDays },
            item.pendingGoalChange,
            now,
        );

        if (outcome.kind === 'confirm') {
            const rebuilding = send(`Okay — rebuilding your plan: ${describeGoal(outcome.request)}. This takes up to a minute.`);
            await startGoalChangeRegeneration(athleteId, planId, outcome.request, rebuilding);
            try {
                await startGeneration(athleteId, planId, outcome.request, savedPreferences.length > 0);
                logger.info('Goal change confirmed — regenerating plan');
            } catch (error) {
                logger.error({ message: 'Could not start plan generation after goal change', error });
                await failTrainingPlanGeneration(athleteId, planId, 'Could not start rebuilding your plan. Please try again.');
            }
            return;
        }

        // Any goal-related outcome leaves the weeks alone; the plan only changes on confirm.
        if (outcome.kind !== 'none') {
            const reply = outcome.kind === 'propose'
                ? `${modelReply && !claimsGoalChange(modelReply) ? `${modelReply} ` : ''}You'd like to change your goal to: ${describeGoal(outcome.request)}. ${confirmPrompt(savedPreferences.length > 0)}`
                : outcome.kind === 'invalid' ? INVALID_GOAL_MESSAGE
                : modelReply || 'No problem — I\'ve kept your current plan.';
            const pending = outcome.kind === 'propose' ? { request: outcome.request, at: now } : null;
            await completeTrainingPlanRevision(athleteId, planId, plan, send(reply), currentIncludeDays, pending, savedPreferences);
            logger.info('Goal change handled', { outcome: outcome.kind });
            return;
        }

        const revisedWeeks = parseWeeks(parsed.weeks);
        const revisedPlan: TrainingPlan = {
            weeks: mergeRevisedWeeks(plan.weeks, revisedWeeks, editableFrom),
            ...parseScores(parsed),
        };
        const unchanged = JSON.stringify(revisedPlan.weeks.map(w => w.runs)) === JSON.stringify(plan.weeks.map(w => w.runs));
        const fallback = unchanged ? "I haven't changed anything in your plan." : 'Done — your plan is updated.';
        const reply = !replay && claimsGoalChange(modelReply) ? NO_GOAL_CHANGE_MESSAGE : (modelReply || fallback);

        // A replay leaves the saved list as it was; a normal revision stores the coach's updated list
        const preferences = replay ? savedPreferences : cleanPreferences(parsed.preferences);
        await completeTrainingPlanRevision(athleteId, planId, revisedPlan, send(reply), planHasDays(revisedWeeks), null, preferences);
        logger.info('Training plan revision complete');
    } catch (error) {
        if (error instanceof OpenAI.AuthenticationError) {
            logger.error({ message: 'Bedrock authentication failed — check bedrock-mantle:* grants and Bedrock console model access', error });
        } else if (error instanceof OpenAI.RateLimitError) {
            logger.error({ message: 'Bedrock throttled the request', error });
        } else if (error instanceof OpenAI.APIError) {
            logger.error({ message: 'Bedrock API error', status: error.status, error });
        } else {
            logger.error({ message: 'Error revising training plan', error });
        }
        await failTrainingPlanRevision(athleteId, planId, chat, replay ? REPLAY_FAILURE_MESSAGE : GENERIC_FAILURE_MESSAGE);
    }
};

const handler = reviseTrainingPlan;

export { handler };
