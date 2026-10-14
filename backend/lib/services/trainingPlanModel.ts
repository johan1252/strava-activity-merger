import { BedrockOpenAI } from 'openai';
import { getTokenProvider } from '@aws/bedrock-token-generator';
import { SESSION_TYPES, WEEK_DAYS } from '../types/trainingPlan';
import type { TrainingPlan, TrainingPlanWeek, TrainingPlanRun, SessionType, WeekDay } from '../types/trainingPlan';

// Same model/client pattern as getTrainingSummary.ts — see that file for the fuller
// rationale (Bedrock Mantle bearer-token auth minted from the Lambda's own execution
// role via @aws/bedrock-token-generator, no API key/secret to manage).
export const BEDROCK_MODEL_ID = 'xai.grok-4.3';
const provideBedrockToken = getTokenProvider();

export function createBedrockClient(): BedrockOpenAI {
    return new BedrockOpenAI({ bedrockTokenProvider: provideBedrockToken, awsRegion: process.env.AWS_REGION });
}

export const MAX_WEEKS = 60;
const FOCUS_VALUES = ['Base', 'Build', 'Peak', 'Taper', 'Race Week'];
const DEFAULT_SESSION_MINUTES = 30;

export function formatDuration(totalSeconds: number): string {
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.round((totalSeconds % 3600) / 60);
    return hours > 0 ? `${hours}h${String(minutes).padStart(2, '0')}m` : `${minutes}m`;
}

export function clampScore(value: unknown): number {
    const n = typeof value === 'number' && Number.isFinite(value) ? value : 0;
    return Math.max(0, Math.min(100, Math.round(n)));
}

function parseRun(r: Record<string, unknown>, weekLabel: string, j: number): TrainingPlanRun {
    const distanceKm = Number(r.distanceKm);
    if (!Number.isFinite(distanceKm)) {
        throw new Error(`${weekLabel}, run ${j + 1} has a non-numeric distanceKm`);
    }
    const count = Number.isFinite(Number(r.count)) && Number(r.count) > 0 ? Math.round(Number(r.count)) : 1;
    const activityType: SessionType = SESSION_TYPES.includes(r.activityType as SessionType) ? r.activityType as SessionType : 'Run';
    const run: TrainingPlanRun = {
        count,
        label: typeof r.label === 'string' && r.label ? r.label : activityType,
        distanceKm,
        notes: typeof r.notes === 'string' ? r.notes : '',
        manualCompletions: Array(count).fill(null),
    };

    // One day per instance; anything else is dropped so the UI never shows a half-assigned session.
    if (Array.isArray(r.days) && r.days.length === count && r.days.every(d => WEEK_DAYS.includes(d as WeekDay))) {
        run.days = r.days as WeekDay[];
    }

    // Plans only record an activityType/duration for cross-training, so run items
    // stay identical to those generated before cross-training existed.
    if (activityType !== 'Run') {
        const durationMinutes = Math.round(Number(r.durationMinutes));
        run.activityType = activityType;
        run.durationMinutes = durationMinutes > 0 ? durationMinutes : (distanceKm > 0 ? 0 : DEFAULT_SESSION_MINUTES);
    }
    return run;
}

// Grok's structured-output mode enforces required fields/enums reliably, but not numeric
// bounds or array length — so those are re-checked here rather than trusted from the schema.
export function parseWeeks(rawWeeks: unknown): TrainingPlanWeek[] {
    if (!Array.isArray(rawWeeks) || rawWeeks.length === 0 || rawWeeks.length > MAX_WEEKS) {
        throw new Error(`Plan has an invalid week count: ${Array.isArray(rawWeeks) ? rawWeeks.length : rawWeeks}`);
    }

    return rawWeeks.map((w: Record<string, unknown>, i: number) => {
        const totalDistanceKm = Number(w.totalDistanceKm);
        if (!Number.isFinite(totalDistanceKm)) {
            throw new Error(`Week ${i + 1} has a non-numeric totalDistanceKm`);
        }
        if (!Array.isArray(w.runs)) {
            throw new Error(`Week ${i + 1} is missing a runs array`);
        }

        return {
            weekNumber: Number.isFinite(Number(w.weekNumber)) ? Number(w.weekNumber) : i + 1,
            totalDistanceKm,
            focus: (FOCUS_VALUES.includes(w.focus as string) ? w.focus : 'Base') as TrainingPlanWeek['focus'],
            runs: w.runs.map((r: Record<string, unknown>, j: number) => parseRun(r, `Week ${i + 1}`, j)),
        };
    });
}

export function parseScores(parsed: Record<string, unknown>) {
    return {
        realismScore: clampScore(parsed.realismScore),
        realismRationale: typeof parsed.realismRationale === 'string' ? parsed.realismRationale : '',
        difficultyScore: clampScore(parsed.difficultyScore),
        difficultyRationale: typeof parsed.difficultyRationale === 'string' ? parsed.difficultyRationale : '',
    };
}

export function parseAndValidatePlan(rawContent: string): TrainingPlan {
    const parsed = JSON.parse(rawContent);
    return { weeks: parseWeeks(parsed.weeks), ...parseScores(parsed) };
}
