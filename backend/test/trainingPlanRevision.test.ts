import { claimsGoalChange, cleanPreferences, decideGoalChange, mergeRevisedWeeks, planHasDays, stripDays } from '../lib/services/trainingPlanRevision';
import { computeAutoCompletedRunMatches } from '../lib/services/statsAggregation';
import type { TrainingPlanRun, TrainingPlanWeek } from '../lib/types/trainingPlan';
import type { CachedActivity } from '../lib/types/activity';

function run(overrides: Partial<TrainingPlanRun> = {}): TrainingPlanRun {
    return { count: 1, label: 'Easy run', distanceKm: 5, notes: '', manualCompletions: [null], ...overrides };
}

function week(weekNumber: number, runs: TrainingPlanRun[]): TrainingPlanWeek {
    return { weekNumber, totalDistanceKm: 0, focus: 'Base', runs };
}

function activity(overrides: Partial<CachedActivity>): CachedActivity {
    return {
        id: 1,
        name: 'Activity',
        sport_type: 'Run',
        distance: 5000,
        elapsed_time: 1800,
        moving_time: 1800,
        start_date: '2026-10-12T20:00:00Z',
        start_date_local: '2026-10-13T07:00:00Z',
        ...overrides,
    } as CachedActivity;
}

describe('mergeRevisedWeeks', () => {
    it('leaves weeks before the editable week untouched', () => {
        const original = [week(1, [run({ manualCompletions: [true] })]), week(2, [run()])];
        const revised = [week(1, [run({ distanceKm: 99 })]), week(2, [run({ distanceKm: 8 })])];

        const merged = mergeRevisedWeeks(original, revised, 2);

        expect(merged[0]).toBe(original[0]);
        expect(merged[1].runs[0].distanceKm).toBe(8);
    });

    it('keeps manual completions on unchanged sessions only', () => {
        const original = [week(1, [run({ manualCompletions: [true] }), run({ label: 'Long run', distanceKm: 12, manualCompletions: [true] })])];
        const revised = [week(1, [run(), run({ label: 'Long run', distanceKm: 14 })])];

        const [merged] = mergeRevisedWeeks(original, revised, 1);

        expect(merged.runs[0].manualCompletions).toEqual([true]);
        expect(merged.runs[1].manualCompletions).toEqual([null]);
    });

    it('recomputes week distance from run sessions only', () => {
        const original = [week(1, [run()])];
        const revised = [week(1, [
            run({ count: 3, distanceKm: 6, manualCompletions: [null, null, null] }),
            run({ label: 'Strength', activityType: 'Weights', distanceKm: 0, durationMinutes: 40 }),
            run({ label: 'Swim', activityType: 'Swim', distanceKm: 1.5 }),
        ])];

        const [merged] = mergeRevisedWeeks(original, revised, 1);

        expect(merged.totalDistanceKm).toBe(18);
    });

    it('keeps the original week when the model omits it', () => {
        const original = [week(1, [run()]), week(2, [run({ distanceKm: 7 })])];

        const merged = mergeRevisedWeeks(original, [week(1, [run({ distanceKm: 6 })])], 1);

        expect(merged[1]).toBe(original[1]);
    });
});

describe('computeAutoCompletedRunMatches with cross-training', () => {
    const start = '2026-10-12';
    const end = '2026-10-18';

    it('matches a time-based weights session to a WeightTraining activity by duration', () => {
        const runs = [run({ label: 'Strength', activityType: 'Weights', distanceKm: 0, durationMinutes: 40 })];
        const activities = [activity({ id: 2, name: 'Gym', sport_type: 'WeightTraining', distance: 0, moving_time: 2400 })];

        const [matches] = computeAutoCompletedRunMatches(runs, start, end, activities);

        expect(matches.map(m => m.activityId)).toEqual([2]);
    });

    it('does not match a weights session to a run, or one that is much too short', () => {
        const runs = [run({ label: 'Strength', activityType: 'Weights', distanceKm: 0, durationMinutes: 40 })];
        const activities = [
            activity({ id: 3, sport_type: 'Run', distance: 0, moving_time: 3600 }),
            activity({ id: 4, sport_type: 'WeightTraining', distance: 0, moving_time: 600 }),
        ];

        const [matches] = computeAutoCompletedRunMatches(runs, start, end, activities);

        expect(matches).toEqual([]);
    });

    it('matches runs and swims independently and never reuses an activity', () => {
        const runs = [run(), run({ label: 'Swim', activityType: 'Swim', distanceKm: 1.5 })];
        const activities = [
            activity({ id: 5, sport_type: 'Run', distance: 5200 }),
            activity({ id: 6, sport_type: 'Swim', distance: 1600 }),
        ];

        const matches = computeAutoCompletedRunMatches(runs, start, end, activities);

        expect(matches[0].map(m => m.activityId)).toEqual([5]);
        expect(matches[1].map(m => m.activityId)).toEqual([6]);
    });

    it('still treats runs without an activityType as runs', () => {
        const activities = [activity({ id: 7, sport_type: 'Run', distance: 5100 })];

        const [matches] = computeAutoCompletedRunMatches([run()], start, end, activities);

        expect(matches.map(m => m.activityId)).toEqual([7]);
    });
});

describe('planHasDays and stripDays', () => {
    const withDays = [week(1, [run({ days: ['Monday'] }), run({ label: 'Long run', days: ['Sunday'] })])];
    const withoutDays = [week(1, [run(), run({ days: [] })])];

    it('detects whether any session has a day', () => {
        expect(planHasDays(withDays)).toBe(true);
        expect(planHasDays(withoutDays)).toBe(false);
    });

    it('removes days from every session and keeps the rest', () => {
        const [stripped] = stripDays(withDays);

        expect(stripped.runs.every(r => r.days === undefined)).toBe(true);
        expect(stripped.runs[1].label).toBe('Long run');
        expect(withDays[0].runs[0].days).toEqual(['Monday']);
    });
});

describe('decideGoalChange', () => {
    const now = 1_000_000;
    const raceDate = new Date(Date.now() + 60 * 86400000).toISOString().slice(0, 10);
    const laterDate = new Date(Date.now() + 90 * 86400000).toISOString().slice(0, 10);
    const current = { raceDistance: 'Half Marathon' as const, raceDate, targetTimeSeconds: 6300, includeDays: true };
    const none = { goalAction: 'none', goalRaceDistance: '', goalRaceDate: '', goalTargetTimeSeconds: 0 };
    const pending = { request: { ...current, raceDate: laterDate }, at: now - 60 };

    it('proposes only the fields that changed, keeping the rest of the goal', () => {
        const outcome = decideGoalChange({ ...none, goalAction: 'propose', goalRaceDate: laterDate }, current, undefined, now);

        expect(outcome).toEqual({ kind: 'propose', request: expect.objectContaining({ raceDate: laterDate, raceDistance: 'Half Marathon', targetTimeSeconds: 6300, includeDays: true }) });
    });

    it('rejects a past date or an unrealistic time for the distance', () => {
        const pastDate = decideGoalChange({ ...none, goalAction: 'propose', goalRaceDate: '2020-01-01' }, current, undefined, now);
        const tooFast = decideGoalChange({ ...none, goalAction: 'propose', goalRaceDistance: 'Marathon' }, { ...current, targetTimeSeconds: 3000 }, undefined, now);

        expect(pastDate).toEqual({ kind: 'invalid' });
        expect(tooFast).toEqual({ kind: 'invalid' });
    });

    it('treats a proposal that changes nothing as no change', () => {
        expect(decideGoalChange({ ...none, goalAction: 'propose', goalRaceDate: raceDate }, current, undefined, now)).toEqual({ kind: 'none' });
    });

    it('confirms only when a recent proposal is waiting', () => {
        const confirm = { ...none, goalAction: 'confirm' };

        expect(decideGoalChange(confirm, current, pending, now)).toEqual({ kind: 'confirm', request: pending.request });
        expect(decideGoalChange(confirm, current, undefined, now)).toEqual({ kind: 'none' });
        expect(decideGoalChange(confirm, current, { ...pending, at: now - 31 * 60 }, now)).toEqual({ kind: 'none' });
    });

    it('builds a change that follows a waiting proposal on that proposal', () => {
        const outcome = decideGoalChange({ ...none, goalAction: 'propose', goalTargetTimeSeconds: 7200 }, current, pending, now);

        expect(outcome).toEqual({ kind: 'propose', request: expect.objectContaining({ raceDate: laterDate, targetTimeSeconds: 7200 }) });
    });

    it('builds a change on the current goal when the proposal has expired', () => {
        const outcome = decideGoalChange({ ...none, goalAction: 'propose', goalTargetTimeSeconds: 7200 }, current, { ...pending, at: now - 31 * 60 }, now);

        expect(outcome).toEqual({ kind: 'propose', request: expect.objectContaining({ raceDate, targetTimeSeconds: 7200 }) });
    });

    it('cancels a waiting proposal, and ignores a cancel with nothing waiting', () => {
        const cancel = { ...none, goalAction: 'cancel' };

        expect(decideGoalChange(cancel, current, pending, now)).toEqual({ kind: 'cancel' });
        expect(decideGoalChange(cancel, current, undefined, now)).toEqual({ kind: 'none' });
    });
});

describe('cleanPreferences', () => {
    it('trims, drops blanks and duplicates, and caps the list', () => {
        const many = Array.from({ length: 20 }, (_, i) => `Preference ${i}`);

        expect(cleanPreferences([' Swim on Tuesdays ', 'swim on tuesdays', '', 5, null])).toEqual(['Swim on Tuesdays']);
        expect(cleanPreferences(many)).toHaveLength(12);
        expect(cleanPreferences('not a list')).toEqual([]);
        expect(cleanPreferences(['x'.repeat(500)])[0]).toHaveLength(160);
    });
});

describe('claimsGoalChange', () => {
    it('flags replies that say the race goal was changed or the plan rebuilt', () => {
        expect(claimsGoalChange("I've updated your race date to 1 December 2026 and rebuilt the plan accordingly.")).toBe(true);
        expect(claimsGoalChange('I moved your target time to 1:40.')).toBe(true);
        expect(claimsGoalChange("I've rebuilt your plan.")).toBe(true);
    });

    it('leaves ordinary plan replies alone', () => {
        expect(claimsGoalChange("I've set your swim on Tuesdays and moved the long run to Saturday.")).toBe(false);
        expect(claimsGoalChange('The taper week before race day is lighter now.')).toBe(false);
        expect(claimsGoalChange('Your race date is 9 December.')).toBe(false);
    });
});
