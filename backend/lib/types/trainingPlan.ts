export type RaceDistance = '5K' | '10K' | 'Half Marathon' | 'Marathon';

export interface TrainingPlanRequest {
    raceDistance: RaceDistance;
    raceDate: string; // 'YYYY-MM-DD'
    targetTimeSeconds?: number;
}

export interface TrainingPlanRun {
    count: number; // e.g. 2 for "two tempo runs"
    label: string; // e.g. "Easy run", "Long run", "Tempo run", "Rest"
    distanceKm: number; // distance per single instance
    notes: string; // e.g. "with 4-5km at race pace" — empty string if nothing extra to add
}

export interface TrainingPlanWeek {
    weekNumber: number;
    totalDistanceKm: number;
    focus: 'Base' | 'Build' | 'Peak' | 'Taper' | 'Race Week';
    runs: TrainingPlanRun[];
}

export interface TrainingPlan {
    weeks: TrainingPlanWeek[];
    realismScore: number; // 0-100
    realismRationale: string;
    difficultyScore: number; // 0-100
    difficultyRationale: string;
}

export type TrainingPlanStatus = 'generating' | 'complete' | 'failed';

export interface TrainingPlanItem {
    status: TrainingPlanStatus;
    request: TrainingPlanRequest;
    requestedAt: number; // epoch seconds
    plan?: TrainingPlan; // present once at least one generation has succeeded; left untouched on a later failure
    generatedAt?: number; // epoch seconds of the last successful generation
    errorMessage?: string; // present when status === 'failed'
}

// Payload passed from the request-facing handler to the async worker Lambda —
// not an APIGatewayProxyEvent, since the worker has no API Gateway route.
export interface GenerateTrainingPlanEvent {
    athleteId: number;
    request: TrainingPlanRequest;
}
