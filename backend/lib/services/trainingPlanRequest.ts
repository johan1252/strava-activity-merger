import type { RaceDistance, TrainingPlanRequest } from '../types/trainingPlan';

export const RACE_DISTANCES: RaceDistance[] = ['5K', '10K', 'Half Marathon', 'Marathon'];
const MS_PER_DAY = 24 * 60 * 60 * 1000;
export const MAX_WEEKS_OUT = 52;
const MAX_TARGET_TIME_SECONDS = 24 * 60 * 60;
// Floors roughly in line with current world-record pace for each distance — anything
// faster isn't a real target for this app's users. Matches the frontend's dropdown range.
const MIN_TARGET_TIME_SECONDS: Record<RaceDistance, number> = {
    '5K': 12 * 60,
    '10K': 25 * 60,
    'Half Marathon': 60 * 60,
    'Marathon': 2 * 60 * 60,
};
const MIN_DAYS_PER_WEEK = 1;
const MAX_DAYS_PER_WEEK = 7;

export function todayDateString(): string {
    return new Date().toISOString().slice(0, 10);
}

export function validateRequest(body: unknown): TrainingPlanRequest {
    const { raceDistance, raceDate, targetTimeSeconds, daysPerWeek, includeDays } = (body ?? {}) as Record<string, unknown>;

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
        includeDays: includeDays === true,
    };
}
