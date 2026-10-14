export type RaceDistance = '5K' | '10K' | 'Half Marathon' | 'Marathon';

export interface TrainingPlanRequest {
    raceDistance: RaceDistance;
    raceDate: string; // 'YYYY-MM-DD'
    targetTimeSeconds: number;
    daysPerWeek?: number; // preferred number of running days per week, 2-7
    includeDays?: boolean; // assign a weekday to every session; absent on older plans, where it is inferred from the plan
}

export const SESSION_TYPES = ['Run', 'Swim', 'Ride', 'Weights', 'Yoga', 'Walk'] as const;
export type SessionType = typeof SESSION_TYPES[number];

export const WEEK_DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'] as const;
export type WeekDay = typeof WEEK_DAYS[number];

export interface TrainingPlanRun {
    count: number; // e.g. 2 for "two tempo runs"
    label: string; // e.g. "Easy run", "Long run", "Tempo run", "Rest"
    activityType?: SessionType; // absent on plans generated before cross-training existed — means 'Run'
    distanceKm: number; // distance per single instance; 0 for time-based sessions
    durationMinutes?: number; // per instance; set for non-Run sessions that are time-based
    days?: WeekDay[]; // one day per instance (length === count); absent on plans generated before days existed
    notes: string; // e.g. "with 4-5km at race pace" — empty string if nothing extra to add
    manualCompletions: (boolean | null)[]; // length === count; null = no manual override at this index, defer to auto-detection
}

// Wire-format only — never stored. Merges a run instance's persisted manual override
// with fresh auto-detection at read time (see trainingPlan.ts's buildEffectivePlan).
export interface TrainingPlanRunCompletion {
    completed: boolean;
    manual: boolean; // true once the user has ever explicitly toggled this instance
    autoActivity?: { id: number; name: string; date: string }; // present only when completed via auto-detection (never alongside manual)
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

export interface TrainingPlanChatMessage {
    role: 'user' | 'assistant';
    content: string;
    at: number; // epoch seconds
}

// A race-goal change the coach has proposed in chat and is waiting for the athlete to confirm.
export interface PendingGoalChange {
    request: TrainingPlanRequest;
    at: number; // epoch seconds
}

export type TrainingPlanStatus = 'generating' | 'complete' | 'failed';

export interface TrainingPlanItem {
    status: TrainingPlanStatus;
    request: TrainingPlanRequest;
    requestedAt: number; // epoch seconds
    plan?: TrainingPlan; // present once at least one generation has succeeded; left untouched on a later failure
    generatedAt?: number; // epoch seconds of the last successful generation
    errorMessage?: string; // present when status === 'failed'
    chat?: TrainingPlanChatMessage[]; // plan-revision conversation, oldest first
    pendingGoalChange?: PendingGoalChange;
    preferences?: string[]; // standing preferences kept by the coach ("Swim on Tuesdays"); internal, never sent to the client
}

// Payload passed from the request-facing handler to the async worker Lambda —
// not an APIGatewayProxyEvent, since the worker has no API Gateway route.
export interface GenerateTrainingPlanEvent {
    athleteId: number;
    planId: string;
    applyPreferences?: boolean; // run a revision with the saved preferences once the plan is saved
    request: TrainingPlanRequest;
}

// Payload for the async plan-revision worker; the athlete's message is already on item.chat.
export interface ReviseTrainingPlanEvent {
    athleteId: number;
    planId: string;
    applyPreferences?: boolean; // re-apply saved preferences to a freshly rebuilt plan; no athlete message
}
