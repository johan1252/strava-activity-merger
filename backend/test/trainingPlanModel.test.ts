import { parseWeeks } from '../lib/services/trainingPlanModel';

function weekWith(run: Record<string, unknown>) {
    return [{ weekNumber: 1, totalDistanceKm: 10, focus: 'Base', runs: [{ count: 1, label: 'Easy run', distanceKm: 5, notes: '', ...run }] }];
}

describe('parseWeeks days', () => {
    it('keeps one valid weekday per instance', () => {
        const [week] = parseWeeks(weekWith({ count: 2, days: ['Tuesday', 'Saturday'] }));

        expect(week.runs[0].days).toEqual(['Tuesday', 'Saturday']);
    });

    it('drops days when the count does not match or a name is invalid', () => {
        const wrongLength = parseWeeks(weekWith({ count: 2, days: ['Tuesday'] }));
        const badName = parseWeeks(weekWith({ days: ['Funday'] }));
        const missing = parseWeeks(weekWith({}));

        expect(wrongLength[0].runs[0].days).toBeUndefined();
        expect(badName[0].runs[0].days).toBeUndefined();
        expect(missing[0].runs[0].days).toBeUndefined();
    });

    it('parses cross-training sessions with a duration', () => {
        const [week] = parseWeeks(weekWith({ label: 'Strength', activityType: 'Weights', distanceKm: 0, durationMinutes: 40, days: ['Monday'] }));

        expect(week.runs[0]).toMatchObject({ activityType: 'Weights', durationMinutes: 40, days: ['Monday'] });
    });
});
