import type { CachedActivity } from '../types/activity';
import type {
    VolumeTrendPoint,
    PaceTrendPoint,
    StreakInfo,
    CalendarDay,
    Timeframe,
    BucketUnit,
} from '../types/stats';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

// Bucket granularity scales with the timeframe so each chart shows a sensible
// number of data points: daily for a week, weekly for 3-6 months, monthly for
// a year (52 weekly bars would be too dense to read).
const TIMEFRAME_CONFIG: Record<Timeframe, { bucketCount: number; bucketUnit: BucketUnit }> = {
    '7d': { bucketCount: 7, bucketUnit: 'day' },
    '3m': { bucketCount: 13, bucketUnit: 'week' },
    '6m': { bucketCount: 26, bucketUnit: 'week' },
    '1y': { bucketCount: 12, bucketUnit: 'month' },
};

export function getBucketUnitForTimeframe(timeframe: Timeframe): BucketUnit {
    return TIMEFRAME_CONFIG[timeframe].bucketUnit;
}

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

function firstOfMonth(dateStr: string): string {
    return `${dateStr.slice(0, 7)}-01`;
}

function addMonths(dateStr: string, months: number): string {
    const d = new Date(`${dateStr}T00:00:00Z`);
    d.setUTCMonth(d.getUTCMonth() + months);
    return d.toISOString().slice(0, 10);
}

function bucketKeyFor(dateStr: string, unit: BucketUnit): string {
    if (unit === 'week') return mondayOf(dateStr);
    if (unit === 'month') return firstOfMonth(dateStr);
    return dateStr;
}

// Builds the ordered list of bucket keys (oldest to newest) covering a timeframe,
// so callers can pre-seed empty buckets and get a continuous, gap-free trend line.
function buildBucketKeys(timeframe: Timeframe): { keys: string[]; unit: BucketUnit } {
    const { bucketCount, bucketUnit } = TIMEFRAME_CONFIG[timeframe];
    const todayStr = new Date().toISOString().slice(0, 10);
    const currentBucket = bucketKeyFor(todayStr, bucketUnit);

    const keys: string[] = [];
    if (bucketUnit === 'month') {
        for (let i = 0; i < bucketCount; i++) {
            keys.push(addMonths(currentBucket, -(bucketCount - 1 - i)));
        }
    } else {
        const step = bucketUnit === 'week' ? 7 : 1;
        const oldestBucket = addDays(currentBucket, -step * (bucketCount - 1));
        for (let i = 0; i < bucketCount; i++) {
            keys.push(addDays(oldestBucket, i * step));
        }
    }
    return { keys, unit: bucketUnit };
}

export function computeVolumeTrend(activities: CachedActivity[], timeframe: Timeframe = '6m'): VolumeTrendPoint[] {
    const { keys, unit } = buildBucketKeys(timeframe);
    const buckets = new Map<string, { distance: number; count: number }>();
    for (const key of keys) buckets.set(key, { distance: 0, count: 0 });

    for (const activity of activities) {
        const bucket = buckets.get(bucketKeyFor(localDate(activity), unit));
        if (!bucket) continue; // outside the trend window
        bucket.distance += activity.distance ?? 0;
        bucket.count += 1;
    }

    return keys.map(periodStart => ({ periodStart, ...buckets.get(periodStart)! }));
}

export function computePaceTrend(activities: CachedActivity[], timeframe: Timeframe = '6m'): PaceTrendPoint[] {
    const { keys, unit } = buildBucketKeys(timeframe);
    const keySet = new Set(keys);
    const buckets = new Map<string, { totalPace: number; count: number }>();

    for (const activity of activities) {
        if (activity.sport_type !== 'Run' || activity.pace_per_km === undefined) continue;
        const key = bucketKeyFor(localDate(activity), unit);
        if (!keySet.has(key)) continue;
        const bucket = buckets.get(key) ?? { totalPace: 0, count: 0 };
        bucket.totalPace += activity.pace_per_km;
        bucket.count += 1;
        buckets.set(key, bucket);
    }

    return Array.from(buckets.entries())
        .map(([periodStart, { totalPace, count }]) => ({
            periodStart,
            avgPaceSecPerKm: totalPace / count,
        }))
        .sort((a, b) => a.periodStart.localeCompare(b.periodStart));
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

export function computeCalendarDays(activities: CachedActivity[]): CalendarDay[] {
    const byDate = new Map<string, { distance: number; count: number; sportTypes: Set<string> }>();
    for (const activity of activities) {
        const date = localDate(activity);
        const entry = byDate.get(date) ?? { distance: 0, count: 0, sportTypes: new Set<string>() };
        entry.distance += activity.distance ?? 0;
        entry.count += 1;
        entry.sportTypes.add(activity.sport_type);
        byDate.set(date, entry);
    }
    return Array.from(byDate.entries())
        .map(([date, { distance, count, sportTypes }]) => ({
            date,
            distance,
            count,
            sportTypes: Array.from(sportTypes),
        }))
        .sort((a, b) => a.date.localeCompare(b.date));
}
