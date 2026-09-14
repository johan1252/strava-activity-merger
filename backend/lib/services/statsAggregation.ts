import type { CachedActivity } from '../types/activity';
import type {
    VolumeTrendPoint,
    PaceTrendPoint,
    StreakInfo,
    SportBreakdownEntry,
    CalendarDay,
} from '../types/stats';

const TREND_WEEKS = 26;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

// Strava's start_date_local carries a trailing 'Z' despite representing local time
// (a known quirk), so the first 10 characters are the athlete's local calendar date —
// safe to slice directly rather than parsing through a Date object (which would
// otherwise reinterpret it as UTC and risk shifting the day).
function localDate(activity: CachedActivity): string {
    return activity.start_date_local.slice(0, 10);
}

function mondayOf(dateStr: string): string {
    const d = new Date(`${dateStr}T00:00:00Z`);
    const day = d.getUTCDay(); // 0 = Sunday
    const diffToMonday = day === 0 ? 6 : day - 1;
    d.setUTCDate(d.getUTCDate() - diffToMonday);
    return d.toISOString().slice(0, 10);
}

function addDays(dateStr: string, days: number): string {
    const d = new Date(`${dateStr}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString().slice(0, 10);
}

export function computeVolumeTrend(activities: CachedActivity[]): VolumeTrendPoint[] {
    const currentWeekStart = mondayOf(new Date().toISOString().slice(0, 10));
    const oldestWeekStart = addDays(currentWeekStart, -7 * (TREND_WEEKS - 1));

    const buckets = new Map<string, { distance: number; count: number }>();
    for (let i = 0; i < TREND_WEEKS; i++) {
        buckets.set(addDays(oldestWeekStart, i * 7), { distance: 0, count: 0 });
    }

    for (const activity of activities) {
        const week = mondayOf(localDate(activity));
        const bucket = buckets.get(week);
        if (!bucket) continue; // outside the trend window
        bucket.distance += activity.distance ?? 0;
        bucket.count += 1;
    }

    return Array.from(buckets.entries()).map(([weekStart, { distance, count }]) => ({
        weekStart,
        distance,
        count,
    }));
}

export function computePaceTrend(activities: CachedActivity[]): PaceTrendPoint[] {
    const currentWeekStart = mondayOf(new Date().toISOString().slice(0, 10));
    const oldestWeekStart = addDays(currentWeekStart, -7 * (TREND_WEEKS - 1));

    const buckets = new Map<string, { totalPace: number; count: number }>();

    for (const activity of activities) {
        if (activity.sport_type !== 'Run' || activity.pace_per_km === undefined) continue;
        const week = mondayOf(localDate(activity));
        if (week < oldestWeekStart || week > currentWeekStart) continue;
        const bucket = buckets.get(week) ?? { totalPace: 0, count: 0 };
        bucket.totalPace += activity.pace_per_km;
        bucket.count += 1;
        buckets.set(week, bucket);
    }

    return Array.from(buckets.entries())
        .map(([weekStart, { totalPace, count }]) => ({
            weekStart,
            avgPaceSecPerKm: totalPace / count,
        }))
        .sort((a, b) => a.weekStart.localeCompare(b.weekStart));
}

export function computeStreak(activities: CachedActivity[]): StreakInfo {
    const activeDates = new Set(activities.map(localDate));
    if (activeDates.size === 0) return { current: 0, longest: 0 };

    const sortedDates = Array.from(activeDates).sort();

    let longest = 1;
    let run = 1;
    for (let i = 1; i < sortedDates.length; i++) {
        const diffDays = Math.round(
            (new Date(`${sortedDates[i]}T00:00:00Z`).getTime() -
                new Date(`${sortedDates[i - 1]}T00:00:00Z`).getTime()) / MS_PER_DAY,
        );
        run = diffDays === 1 ? run + 1 : 1;
        longest = Math.max(longest, run);
    }

    // Current streak, anchored to server UTC "today" — a minor simplification that can
    // be off by a day right around midnight in the athlete's own timezone.
    let cursor = new Date().toISOString().slice(0, 10);
    if (!activeDates.has(cursor)) {
        cursor = addDays(cursor, -1);
    }
    let current = 0;
    while (activeDates.has(cursor)) {
        current += 1;
        cursor = addDays(cursor, -1);
    }

    return { current, longest };
}

export function computeWeekStreak(activities: CachedActivity[]): StreakInfo {
    const activeWeeks = new Set(activities.map(a => mondayOf(localDate(a))));
    if (activeWeeks.size === 0) return { current: 0, longest: 0 };

    const sortedWeeks = Array.from(activeWeeks).sort();

    let longest = 1;
    let run = 1;
    for (let i = 1; i < sortedWeeks.length; i++) {
        const diffDays = Math.round(
            (new Date(`${sortedWeeks[i]}T00:00:00Z`).getTime() -
                new Date(`${sortedWeeks[i - 1]}T00:00:00Z`).getTime()) / MS_PER_DAY,
        );
        run = diffDays === 7 ? run + 1 : 1;
        longest = Math.max(longest, run);
    }

    // Current streak — if the in-progress week has no activity yet, anchor to last
    // week instead so the streak stays "alive" until the current week actually ends.
    let cursor = mondayOf(new Date().toISOString().slice(0, 10));
    if (!activeWeeks.has(cursor)) {
        cursor = addDays(cursor, -7);
    }
    let current = 0;
    while (activeWeeks.has(cursor)) {
        current += 1;
        cursor = addDays(cursor, -7);
    }

    return { current, longest };
}

export function computeSportBreakdown(activities: CachedActivity[]): SportBreakdownEntry[] {
    const byType = new Map<string, { distance: number; count: number }>();
    for (const activity of activities) {
        const entry = byType.get(activity.sport_type) ?? { distance: 0, count: 0 };
        entry.distance += activity.distance ?? 0;
        entry.count += 1;
        byType.set(activity.sport_type, entry);
    }
    return Array.from(byType.entries())
        .map(([sportType, { distance, count }]) => ({ sportType, distance, count }))
        .sort((a, b) => b.distance - a.distance);
}

export function computeCalendarDays(activities: CachedActivity[]): CalendarDay[] {
    const byDate = new Map<string, { distance: number; count: number }>();
    for (const activity of activities) {
        const date = localDate(activity);
        const entry = byDate.get(date) ?? { distance: 0, count: 0 };
        entry.distance += activity.distance ?? 0;
        entry.count += 1;
        byDate.set(date, entry);
    }
    return Array.from(byDate.entries())
        .map(([date, { distance, count }]) => ({ date, distance, count }))
        .sort((a, b) => a.date.localeCompare(b.date));
}
