import { validateRequest } from './trainingPlanRequest';
import type { PendingGoalChange, TrainingPlanRequest, TrainingPlanRun, TrainingPlanWeek } from '../types/trainingPlan';

function runKey(run: TrainingPlanRun): string {
    return [run.activityType ?? 'Run', run.label, run.count, run.distanceKm, run.durationMinutes ?? 0].join('|');
}

function runningDistanceKm(runs: TrainingPlanRun[]): number {
    const total = runs
        .filter(r => (r.activityType ?? 'Run') === 'Run')
        .reduce((sum, r) => sum + r.count * r.distanceKm, 0);
    return Math.round(total * 10) / 10;
}

// Unchanged sessions in the revised week keep their manual completion marks; anything
// the model added or edited starts unmarked. Weeks the model did not return keep the original.
export function mergeRevisedWeeks(
    original: TrainingPlanWeek[],
    revised: TrainingPlanWeek[],
    editableFrom: number,
): TrainingPlanWeek[] {
    const revisedByNumber = new Map(revised.map(w => [w.weekNumber, w]));

    return original.map(week => {
        const next = week.weekNumber >= editableFrom ? revisedByNumber.get(week.weekNumber) : undefined;
        if (!next) return week;

        const unused = [...week.runs];
        const runs = next.runs.map(run => {
            const matchIndex = unused.findIndex(old => runKey(old) === runKey(run));
            if (matchIndex === -1) return run;
            const [old] = unused.splice(matchIndex, 1);
            return { ...run, manualCompletions: old.manualCompletions ?? run.manualCompletions };
        });

        return { ...next, totalDistanceKm: runningDistanceKm(runs), runs };
    });
}

export function planHasDays(weeks: TrainingPlanWeek[]): boolean {
    return weeks.some(w => w.runs.some(r => r.days && r.days.length > 0));
}

export function stripDays(weeks: TrainingPlanWeek[]): TrainingPlanWeek[] {
    return weeks.map(w => ({ ...w, runs: w.runs.map(({ days, ...run }) => run) }));
}

// --- Race goal changes asked for in chat ---

const PENDING_GOAL_TTL_SECONDS = 30 * 60;

export interface GoalChangeFields {
    goalAction: string;
    goalRaceDistance: string;
    goalRaceDate: string;
    goalTargetTimeSeconds: number;
}

export type GoalChangeOutcome =
    | { kind: 'none' }
    | { kind: 'propose'; request: TrainingPlanRequest }
    | { kind: 'invalid' }
    | { kind: 'confirm'; request: TrainingPlanRequest }
    | { kind: 'cancel' };

// Turns the model's read of the athlete's message into what the app does. A change only
// reaches 'confirm' when a recent proposal is waiting, so a stray "yes" can't rebuild a plan.
export function decideGoalChange(
    fields: GoalChangeFields,
    current: TrainingPlanRequest,
    pending: PendingGoalChange | undefined,
    now: number,
): GoalChangeOutcome {
    const pendingValid = !!pending && now - pending.at <= PENDING_GOAL_TTL_SECONDS;

    if (fields.goalAction === 'confirm') return pendingValid ? { kind: 'confirm', request: pending!.request } : { kind: 'none' };
    if (fields.goalAction === 'cancel') return pendingValid ? { kind: 'cancel' } : { kind: 'none' };
    if (fields.goalAction !== 'propose') return { kind: 'none' };

    // A change that follows a waiting proposal ("yes, but make it 2 hours") builds on that
    // proposal, not on the plan's current goal.
    const base = pendingValid ? pending!.request : current;
    const proposed = {
        ...base,
        raceDistance: fields.goalRaceDistance || base.raceDistance,
        raceDate: fields.goalRaceDate || base.raceDate,
        targetTimeSeconds: fields.goalTargetTimeSeconds > 0 ? fields.goalTargetTimeSeconds : base.targetTimeSeconds,
    };
    if (proposed.raceDistance === current.raceDistance
        && proposed.raceDate === current.raceDate
        && proposed.targetTimeSeconds === current.targetTimeSeconds) {
        return { kind: 'none' };
    }

    try {
        return { kind: 'propose', request: validateRequest(proposed) };
    } catch {
        return { kind: 'invalid' };
    }
}

const MAX_PREFERENCES = 12;
const MAX_PREFERENCE_LENGTH = 160;

// The model returns the whole list each time; keep it tidy so a bad response can't bloat the item.
export function cleanPreferences(raw: unknown): string[] {
    if (!Array.isArray(raw)) return [];
    const seen = new Set<string>();
    const cleaned: string[] = [];
    for (const entry of raw) {
        if (typeof entry !== 'string') continue;
        const text = entry.trim().slice(0, MAX_PREFERENCE_LENGTH);
        const key = text.toLowerCase();
        if (!text || seen.has(key)) continue;
        seen.add(key);
        cleaned.push(text);
    }
    return cleaned.slice(0, MAX_PREFERENCES);
}

export const REPLAY_FAILURE_MESSAGE = "I rebuilt your plan, but I couldn't re-apply your earlier preferences. Tell me what you'd like added, such as swimming or weights, and I'll do it.";

export const NO_GOAL_CHANGE_MESSAGE = "I haven't changed your race goal. To change the race date, distance or target time, tell me the new value and I'll ask you to confirm before rebuilding your plan.";

// Only the app changes a race goal, and only after the athlete confirms. A reply that says it
// already did is wrong, so it is replaced rather than shown.
export function claimsGoalChange(reply: string): boolean {
    const goalWords = /\b(race date|race distance|target time|goal time|new goal|rebuil(?:t|d|ding))\b/i;
    const changeWords = /\b(updated|changed|moved|switched|rescheduled|set|rebuil(?:t|ding))\b/i;
    return goalWords.test(reply) && changeWords.test(reply);
}
