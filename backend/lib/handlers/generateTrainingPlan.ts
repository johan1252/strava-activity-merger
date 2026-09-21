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
    computeStreak,
    computeWeekStreak,
    computeRacePredictions,
} from '../services/statsAggregation';
import type { GenerateTrainingPlanEvent, TrainingPlan, TrainingPlanWeek } from '../types/trainingPlan';

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

const weekItemSchema = {
    type: 'object',
    additionalProperties: false,
    required: ['weekNumber', 'totalDistanceKm', 'longRunKm', 'focus', 'description'],
    properties: {
        weekNumber: { type: 'integer' },
        totalDistanceKm: { type: 'number' },
        longRunKm: { type: 'number' },
        focus: { type: 'string', enum: ['Base', 'Build', 'Peak', 'Taper', 'Race Week'] },
        description: { type: 'string' },
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

const SYSTEM_PROMPT = `You are an experienced running and endurance coach designing a personalized week-by-week training plan. You will be given a compact JSON summary of an athlete's current fitness (recent weekly volume, running pace trend, consistency streaks) and their race goal (distance, weeks available until race day, and optionally a target finish time with the athlete's current Riegel-predicted time for that distance for comparison).

Design a training plan from now until race day, broken into weeks. Each week needs a total distance (km), a long-run distance (km), a focus tag (one of: Base, Build, Peak, Taper, Race Week — the plan should progress through these in a sensible order, ending with Taper then Race Week), and a short 1-2 sentence description of that week's key workout(s). Keep descriptions brief — this is a weekly overview, not a daily schedule.

Also produce two distinct scores, each 0-100, where 100 always means the best possible outcome for that score (100 realism = fully achievable/already within reach; 100 difficulty = extremely hard) — never invert this scale. Each needs a one-sentence rationale:
- realismScore: purely about whether the target time is mathematically plausible given the current predicted time and the weeks available — a pure "is this achievable in this timeframe" question. If the current predicted time already matches or beats the target time, the goal is already within reach — score this 90-100, not low, regardless of how much time is available. If no target time was given, base this on whether the timeframe is reasonable to safely build up to completing the distance.
- difficultyScore: about how much the plan demands relative to the athlete's *current lived training pattern* — their current weekly volume, consistency/streaks, and whether their pace is already improving or flat. This is a "how much lifestyle disruption/effort" question, independent of realism.

Before responding, check that each score's direction matches its own rationale — e.g. a realismRationale that describes the target as already met, trivial, or easily achievable must pair with a high realismScore (90+), never a low one.

These two scores must be able to diverge. Example: an athlete already running 60km/week with a 40-day streak chasing a modest, statistically realistic PR should score high realism, low difficulty. An athlete with sporadic activity chasing that exact same realistic PR should score the same realism but high difficulty — the target is equally plausible on paper, but far harder for this athlete to actually execute.

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

        const trainingContext = {
            raceDistance: request.raceDistance,
            weeksUntilRace,
            targetTime: request.targetTimeSeconds ? formatDuration(request.targetTimeSeconds) : null,
            hasBaseline: !!baseline,
            currentPredictedTimeForThisDistance: baseline ? formatDuration(baseline.predictedSeconds) : null,
            last3MonthsWeeklyVolumeKm: computeVolumeTrend(activities, '3m').map(w => ({
                weekStart: w.periodStart,
                km: Math.round(w.distance / 100) / 10,
                activityCount: w.count,
            })),
            last3MonthsRunPaceTrendMinPerKm: computePaceTrend(activities, '3m').map(p => ({
                weekStart: p.periodStart,
                avgPaceMinPerKm: Math.round((p.avgPaceSecPerKm / 60) * 10) / 10,
            })),
            currentDayStreak: computeStreak(activities).current,
            currentWeekStreak: computeWeekStreak(activities).current,
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
        if (baseline && request.targetTimeSeconds && baseline.predictedSeconds <= request.targetTimeSeconds) {
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
        const longRunKm = Number(w.longRunKm);
        if (!Number.isFinite(totalDistanceKm) || !Number.isFinite(longRunKm)) {
            throw new Error(`Week ${i + 1} has non-numeric distance fields`);
        }
        return {
            weekNumber: Number.isFinite(Number(w.weekNumber)) ? Number(w.weekNumber) : i + 1,
            totalDistanceKm,
            longRunKm,
            focus: (['Base', 'Build', 'Peak', 'Taper', 'Race Week'].includes(w.focus as string)
                ? w.focus
                : 'Base') as TrainingPlanWeek['focus'],
            description: typeof w.description === 'string' ? w.description : '',
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
