export interface VolumeTrendPoint {
    weekStart: string; // ISO date (Monday of that week)
    distance: number; // meters
    count: number;
}

export interface PaceTrendPoint {
    weekStart: string; // ISO date (Monday of that week)
    avgPaceSecPerKm: number;
}

export interface StreakInfo {
    current: number; // consecutive days up to today/yesterday with an activity
    longest: number;
}

export interface SportBreakdownEntry {
    sportType: string;
    distance: number; // meters
    count: number;
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
    streak: StreakInfo;
    sportBreakdown: SportBreakdownEntry[];
    calendar: CalendarDay[];
    gear: GearStat[];
}
