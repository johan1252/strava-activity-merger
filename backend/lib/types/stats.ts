export type Timeframe = '7d' | '3m' | '6m' | '1y';
export type BucketUnit = 'day' | 'week' | 'month';

export interface VolumeTrendPoint {
    periodStart: string; // ISO date — meaning depends on bucketUnit (a day, the Monday of a week, or the 1st of a month)
    distance: number; // meters
    count: number;
}

export interface PaceTrendPoint {
    periodStart: string; // ISO date — meaning depends on bucketUnit (a day, the Monday of a week, or the 1st of a month)
    avgPaceSecPerKm: number;
}

export interface StreakInfo {
    current: number; // consecutive days up to today/yesterday with an activity
    longest: number;
}

export interface CalendarDay {
    date: string; // 'YYYY-MM-DD'
    count: number;
    distance: number; // meters
}

export interface GearStat {
    id: string;
    name: string;
    type: 'shoe' | 'bike';
    distance: number; // meters, Strava's own lifetime total
}

export interface StatsResponse {
    volumeTrend: VolumeTrendPoint[];
    paceTrend: PaceTrendPoint[];
    trendBucketUnit: BucketUnit; // granularity used for volumeTrend/paceTrend, so the frontend can format axis labels appropriately
    streak: StreakInfo; // consecutive days
    weekStreak: StreakInfo; // consecutive weeks with at least one activity
    calendar: CalendarDay[];
    gear: GearStat[];
}
