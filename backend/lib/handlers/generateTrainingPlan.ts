import { Logger } from '@aws-lambda-powertools/logger';
import OpenAI, { BedrockOpenAI } from 'openai';
import { getTokenProvider } from '@aws/bedrock-token-generator';
import {
    queryActivities,
    completeTrainingPlanGeneration,
    failTrainingPlanGeneration,
} from '../services/activityCache';
import {
    computeVolumeTrend,
    computePaceTrend,
    computeRacePredictions,
} from '../services/statsAggregation';
import type { GenerateTrainingPlanEvent, TrainingPlan, TrainingPlanWeek, TrainingPlanRun } from '../types/trainingPlan';

const logger = new Logger({ serviceName: 'generateTrainingPlan' });
const MS_PER_DAY = 24 * 60 * 60 * 1000;

// Same model/client pattern as getTrainingSummary.ts — see that file for the fuller
// rationale (Bedrock Mantle bearer-token auth minted from this Lambda's own execution
// role via @aws/bedrock-token-generator, no API key/secret to manage).
const BEDROCK_MODEL_ID = 'xai.grok-4.3';
const provideBedrockToken = getTokenProvider();

const MAX_WEEKS = 60;

function formatDuration(totalSeconds: number): string {
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.round((totalSeconds % 3600) / 60);
    return hours > 0 ? `${hours}h${String(minutes).padStart(2, '0')}m` : `${minutes}m`;
}

const runItemSchema = {
    type: 'object',
    additionalProperties: false,
    required: ['count', 'label', 'distanceKm', 'notes'],
    properties: {
        count: { type: 'integer' },
        label: { type: 'string' },
        distanceKm: { type: 'number' },
        notes: { type: 'string' },
    },
};

const weekItemSchema = {
    type: 'object',
    additionalProperties: false,
    required: ['weekNumber', 'totalDistanceKm', 'focus', 'runs'],
    properties: {
        weekNumber: { type: 'integer' },
        totalDistanceKm: { type: 'number' },
        focus: { type: 'string', enum: ['Base', 'Build', 'Peak', 'Taper', 'Race Week'] },
        runs: { type: 'array', items: runItemSchema },
    },
};

const planSchema = {
    type: 'object',
    additionalProperties: false,
    required: ['weeks', 'realismScore', 'realismRationale', 'difficultyScore', 'difficultyRationale'],
    properties: {
        weeks: { type: 'array', items: weekItemSchema },
        realismScore: { type: 'integer' },
        realismRationale: { type: 'string' },
        difficultyScore: { type: 'integer' },
        difficultyRationale: { type: 'string' },
    },
};

const SYSTEM_PROMPT = `You are an experienced running and endurance coach designing a personalized week-by-week training plan. You will be given a compact JSON summary of an athlete's current fitness (recent weekly running volume, running pace trend) and their race goal (distance, weeks available until race day, and optionally a target finish time with the athlete's current Riegel-predicted time for that distance for comparison).

Design a training plan from now until race day, broken into weeks. Each week needs a total distance (km), a focus tag (one of: Base, Build, Peak, Taper, Race Week — the plan should progress through these in a sensible order, ending with Taper then Race Week), and a list of the individual runs that make up that week — this is a weekly overview, not a full daily schedule, so only list the runs that matter (skip easy filler/rest days unless they're the only thing that week). Each run needs:
- count: how many times this exact run repeats that week (e.g. 2 for "two tempo runs" — don't list the same run twice, use count instead)
- label: a short name, e.g. "Easy run", "Long run", "Tempo run", "Interval run"
- distanceKm: the distance of a single instance of this run
- notes: a short extra detail when relevant (e.g. "with 4-5km at race pace"), or an empty string when there's nothing more to add

For example, a week's runs might be:
1. Easy run — 5km
2. Long run — 12km, notes: "with 4-5km of race pace"
3. Tempo run — 5km, count: 2 ("two tempo runs")

Make sure totalDistanceKm for the week is consistent with summing (count × distanceKm) across that week's runs. The number of running days in a week is the sum of count across its runs (each run instance is its own day, never doubled up with another run the same day) — if preferredRunDaysPerWeek is given (non-null), keep every week within ±1 of that number (Race Week and any very light recovery week are the natural exceptions); if it's null, use your own judgment (commonly 4-5 days/week for these distances).

Also produce two distinct scores, each 0-100, where 100 always means the best possible outcome for that score (100 realism = fully achievable/already within reach; 100 difficulty = extremely hard) — never invert this scale. Each needs a one-sentence rationale:
- realismScore: purely about whether the target time is mathematically plausible given the current predicted time and the weeks available — a pure "is this achievable in this timeframe" question. Use the precomputed paceComparison field directly rather than comparing currentPredictedTimeForThisDistance and targetTime yourself: if paceComparison.targetAlreadyAchieved is true, the goal is already within reach by paceComparison.differenceFromTarget — score this 90-100, not low, regardless of how much time is available, and say so plainly (the target is already met, not something to "improve" toward). If hasBaseline is false, paceComparison will be null — base realism on whether the timeframe is reasonable to safely reach that target from scratch instead.
- difficultyScore: about how much the plan demands relative to the athlete's *current lived training pattern* — specifically their recent weekly running volume (last3MonthsWeeklyRunVolumeKm) compared to what the plan's weekly distances ask for, and whether their pace is already improving or flat. This is a "how much lifestyle disruption/effort" question, independent of realism. Do not factor in consistency streaks — base this purely on running volume and pace trend.

Before responding, check that each score's direction matches its own rationale — e.g. a realismRationale that describes the target as already met, trivial, or easily achievable must pair with a high realismScore (90+), never a low one.

These two scores must be able to diverge. Example: an athlete already running 60km/week chasing a modest, statistically realistic PR should score high realism, low difficulty. An athlete running just 15km/week chasing that exact same realistic PR should score the same realism but high difficulty — the target is equally plausible on paper, but far harder for this athlete to actually execute given their current running volume.

Write both rationales speaking directly to the athlete — use "you"/"your", never "the athlete" or third person. Whenever a rationale references a number (a time, a pace, a weekly distance, a week count), state the actual figure from the context rather than a vague qualifier — e.g. "your current pace predicts 52:00, and your target is 48:00" rather than "your target is somewhat faster than your current pace."

If the context says hasBaseline is false (no recent effort at or near this distance to extrapolate from), say so in the rationale and caveat your confidence rather than inventing a precise-sounding number. If the athlete's data is sparse overall, design a conservative, safe base-building plan and note that explicitly.

Respond with JSON matching the required schema — nothing else.`;

const generateTrainingPlan = async (event: GenerateTrainingPlanEvent): Promise<void> => {
    const { athleteId, request } = event;
    logger.appendKeys({ athleteId });
    logger.info('Generating training plan', { request });

    try {
        const activities = await queryActivities(athleteId, {});

        const raceDateMs = new Date(`${request.raceDate}T00:00:00Z`).getTime();
        const weeksUntilRace = Math.max(1, Math.ceil((raceDateMs - Date.now()) / (7 * MS_PER_DAY)));

        const racePredictions = computeRacePredictions(activities);
        const baseline = racePredictions.find(p => p.distanceLabel === request.raceDistance);

        // Precomputed here rather than left for the model to work out from the two
        // formatted duration strings — with reasoning disabled (see below), asking it to
        // parse "1h55m" vs "1h40m" and subtract them itself is exactly the kind of small
        // arithmetic step that was producing self-contradictory rationale text in
        // practice (correctly stating the current time was faster, then in the same
        // breath describing the target as needing an "improvement"). Handing it the
        // already-computed answer removes the need for it to derive this at all.
        const paceComparison = baseline ? {
            targetAlreadyAchieved: baseline.predictedSeconds <= request.targetTimeSeconds,
            differenceFromTarget: formatDuration(Math.abs(request.targetTimeSeconds - baseline.predictedSeconds)),
        } : null;

        const trainingContext = {
            raceDistance: request.raceDistance,
            weeksUntilRace,
            targetTime: formatDuration(request.targetTimeSeconds),
            hasBaseline: !!baseline,
            currentPredictedTimeForThisDistance: baseline ? formatDuration(baseline.predictedSeconds) : null,
            paceComparison,
            preferredRunDaysPerWeek: request.daysPerWeek ?? null,
            // Run-only — difficultyScore is meant to weigh running volume specifically,
            // not a mix of other sports that don't stress the same running fitness.
            last3MonthsWeeklyRunVolumeKm: computeVolumeTrend(activities.filter(a => a.sport_type === 'Run'), '3m').map(w => ({
                weekStart: w.periodStart,
                km: Math.round(w.distance / 100) / 10,
                activityCount: w.count,
            })),
            last3MonthsRunPaceTrendMinPerKm: computePaceTrend(activities, '3m').map(p => ({
                weekStart: p.periodStart,
                avgPaceMinPerKm: Math.round((p.avgPaceSecPerKm / 60) * 10) / 10,
            })),
        };

        const client = new BedrockOpenAI({ bedrockTokenProvider: provideBedrockToken, awsRegion: process.env.AWS_REGION });

        const response = await client.chat.completions.create({
            model: BEDROCK_MODEL_ID,
            max_completion_tokens: 4000,
            // Deliberately disabled, same reasoning as getTrainingSummary.ts: weeksUntilRace
            // and the Riegel baseline are precomputed and handed to the model, so this is
            // pattern-completion over a well-worn genre, not multi-step reasoning — and
            // leaving reasoning on risks it silently consuming the whole output budget.
            reasoning_effort: 'none',
            response_format: {
                type: 'json_schema',
                json_schema: { name: 'training_plan', strict: true, schema: planSchema },
            },
            messages: [
                { role: 'system', content: SYSTEM_PROMPT },
                { role: 'user', content: JSON.stringify(trainingContext) },
            ],
        });

        const rawContent = response.choices[0]?.message?.content ?? '';
        logger.info('Received plan response', {
            finishReason: response.choices[0]?.finish_reason,
            usage: response.usage,
        });

        const plan = parseAndValidatePlan(rawContent);

        // Deterministic safety net for one unambiguous case: if the athlete's current
        // predicted time already meets or beats the target, realism is mathematically
        // guaranteed to be high — this isn't a judgment call the model can get "wrong" in
        // a defensible way. Guards against exactly the inconsistency seen in practice: a
        // rationale describing the goal as already beaten, paired with a low score.
        if (baseline && baseline.predictedSeconds <= request.targetTimeSeconds) {
            plan.realismScore = Math.max(plan.realismScore, 90);
        }

        await completeTrainingPlanGeneration(athleteId, plan);
        logger.info('Training plan generation complete', { weekCount: plan.weeks.length });
    } catch (error) {
        if (error instanceof OpenAI.AuthenticationError) {
            logger.error({ message: 'Bedrock authentication failed — check bedrock-mantle:* grants and Bedrock console model access', error });
        } else if (error instanceof OpenAI.RateLimitError) {
            logger.error({ message: 'Bedrock throttled the request', error });
        } else if (error instanceof OpenAI.APIError) {
            logger.error({ message: 'Bedrock API error', status: error.status, error });
        } else {
            logger.error({ message: 'Error generating training plan', error });
        }
        await failTrainingPlanGeneration(athleteId, 'Failed to generate a training plan. Please try again.');
    }
};

function clampScore(value: unknown): number {
    const n = typeof value === 'number' && Number.isFinite(value) ? value : 0;
    return Math.max(0, Math.min(100, Math.round(n)));
}

// Grok's structured-output mode enforces required fields/enums reliably, but not numeric
// bounds or array length — so those are re-checked here rather than trusted from the schema.
function parseAndValidatePlan(rawContent: string): TrainingPlan {
    const parsed = JSON.parse(rawContent);

    if (!Array.isArray(parsed.weeks) || parsed.weeks.length === 0 || parsed.weeks.length > MAX_WEEKS) {
        throw new Error(`Plan has an invalid week count: ${parsed.weeks?.length}`);
    }

    const weeks: TrainingPlanWeek[] = parsed.weeks.map((w: Record<string, unknown>, i: number) => {
        const totalDistanceKm = Number(w.totalDistanceKm);
        if (!Number.isFinite(totalDistanceKm)) {
            throw new Error(`Week ${i + 1} has a non-numeric totalDistanceKm`);
        }
        if (!Array.isArray(w.runs)) {
            throw new Error(`Week ${i + 1} is missing a runs array`);
        }

        const runs: TrainingPlanRun[] = w.runs.map((r: Record<string, unknown>, j: number) => {
            const distanceKm = Number(r.distanceKm);
            if (!Number.isFinite(distanceKm)) {
                throw new Error(`Week ${i + 1}, run ${j + 1} has a non-numeric distanceKm`);
            }
            const count = Number(r.count);
            return {
                count: Number.isFinite(count) && count > 0 ? Math.round(count) : 1,
                label: typeof r.label === 'string' && r.label ? r.label : 'Run',
                distanceKm,
                notes: typeof r.notes === 'string' ? r.notes : '',
            };
        });

        return {
            weekNumber: Number.isFinite(Number(w.weekNumber)) ? Number(w.weekNumber) : i + 1,
            totalDistanceKm,
            focus: (['Base', 'Build', 'Peak', 'Taper', 'Race Week'].includes(w.focus as string)
                ? w.focus
                : 'Base') as TrainingPlanWeek['focus'],
            runs,
        };
    });

    return {
        weeks,
        realismScore: clampScore(parsed.realismScore),
        realismRationale: typeof parsed.realismRationale === 'string' ? parsed.realismRationale : '',
        difficultyScore: clampScore(parsed.difficultyScore),
        difficultyRationale: typeof parsed.difficultyRationale === 'string' ? parsed.difficultyRationale : '',
    };
}

const handler = generateTrainingPlan;

export { handler };
