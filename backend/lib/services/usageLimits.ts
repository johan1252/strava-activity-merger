import { incrementDailyUsage, refundDailyUsage } from './activityCache';

// Per-athlete limits on the requests that start a Bedrock call, counted per UTC day.
export const DAILY_LIMITS = {
    chat: 50, // chat messages to the plan coach
    build: 10, // plan builds and rebuilds
} as const;

export type UsageKind = keyof typeof DAILY_LIMITS;

const COUNTER_TTL_SECONDS = 3 * 24 * 60 * 60;

export const USAGE_LABELS: Record<UsageKind, string> = {
    chat: 'chat messages',
    build: 'plan builds',
};

export function limitMessage(kind: UsageKind): string {
    return `You've reached today's limit of ${DAILY_LIMITS[kind]} ${USAGE_LABELS[kind]}. It resets at midnight UTC, so try again tomorrow.`;
}

function dateKey(now: Date): string {
    return now.toISOString().slice(0, 10);
}

export async function consumeDailyUsage(athleteId: number, kind: UsageKind, now = new Date()): Promise<boolean> {
    const expiresAt = Math.floor(now.getTime() / 1000) + COUNTER_TTL_SECONDS;
    const { allowed } = await incrementDailyUsage(athleteId, kind, dateKey(now), DAILY_LIMITS[kind], expiresAt);
    return allowed;
}

export async function refundDailyUsageUnit(athleteId: number, kind: UsageKind, now = new Date()): Promise<void> {
    await refundDailyUsage(athleteId, kind, dateKey(now));
}
