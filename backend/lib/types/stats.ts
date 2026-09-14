export type Timeframe = '7d' | '3m' | '6m' | '1y';

export interface VolumeTrendPoint {
    periodStart: string; // ISO date — a single day (7d timeframe) or the Monday of a week (others)
    distance: number; // meters
    count: number;
}

export interface PaceTrendPoint {
    periodStart: string; // ISO date — a single day (7d timeframe) or the Monday of a week (others)
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
    streak: StreakInfo; // consecutive days
    weekStreak: StreakInfo; // consecutive weeks with at least one activity
    calendar: CalendarDay[];
    gear: GearStat[];
}
