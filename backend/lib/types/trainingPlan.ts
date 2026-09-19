export type RaceDistance = '5K' | '10K' | 'Half Marathon' | 'Marathon';

export interface TrainingPlanRequest {
    raceDistance: RaceDistance;
    raceDate: string; // 'YYYY-MM-DD'
    targetTimeSeconds?: number;
}

export interface TrainingPlanWeek {
    weekNumber: number;
    totalDistanceKm: number;
    longRunKm: number;
    focus: 'Base' | 'Build' | 'Peak' | 'Taper' | 'Race Week';
    description: string;
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
