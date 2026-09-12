export interface StravaActivity {
    id: number;
    name: string;
    sport_type: string;
    distance: number;
    elapsed_time: number;
    moving_time?: number;
    start_date: string;
    start_date_local: string;
    device_name: string;
    start_latlng: [number, number];
    map: { summary_polyline: string };
    visibility: string;
    external_id?: string;
}

export interface CachedActivity extends StravaActivity {
    pace_per_km?: number;
}

export interface ActivityFilters {
    sportType?: string;
    minDistance?: number;
    maxDistance?: number;
    minPace?: number;
    maxPace?: number;
}

export interface SyncMeta {
    lastSyncStartedAt: number;
    lastSyncCompletedAt?: number;
    fullSyncDone: boolean;
}

export interface GetActivitiesResponse {
    activities: CachedActivity[];
    page: number;
    hasMore: boolean;
}
