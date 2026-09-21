import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
    DynamoDBDocumentClient,
    GetCommand,
    PutCommand,
    UpdateCommand,
    BatchWriteCommand,
    QueryCommand,
} from '@aws-sdk/lib-dynamodb';
import type { StravaActivity, CachedActivity, ActivityFilters, SyncMeta } from '../types/activity';
import type { TrainingPlanItem, TrainingPlanRequest, TrainingPlan } from '../types/trainingPlan';

const TABLE_NAME = process.env.ACTIVITY_CACHE_TABLE_NAME!;
const STALE_SYNC_THRESHOLD_SECONDS = 30 * 60;

// removeUndefinedValues: optional fields (e.g. TrainingPlanRequest.daysPerWeek) are
// often built as object literals with an explicit `undefined` value rather than the
// key being omitted — DynamoDB has no concept of `undefined`, and the client rejects
// it by default instead of silently dropping it.
const client = DynamoDBDocumentClient.from(new DynamoDBClient({}), {
    marshallOptions: { removeUndefinedValues: true },
});

// --- Key helpers ---

function athletePK(athleteId: number): string {
    return `ATHLETE#${athleteId}`;
}

function activitySK(activity: StravaActivity): string {
    return `ACTIVITY#${activity.start_date}#${activity.id}`;
}

function paddedNumber(n: number): string {
    return Math.round(n).toString().padStart(10, '0');
}

function distanceSK(activity: StravaActivity): string {
    return `DIST#${paddedNumber(activity.distance)}#${activity.id}`;
}

function computePace(activity: StravaActivity): number | undefined {
    if (!activity.distance || activity.distance === 0) return undefined;
    return (activity.elapsed_time / activity.distance) * 1000;
}

function paceSK(pace: number, activityId: number): string {
    return `PACE#${paddedNumber(pace)}#${activityId}`;
}

// Internal bookkeeping attributes added on top of the raw Strava activity —
// stripped back off in fromDbItem so callers only ever see Strava's own fields
// plus our computed pace_per_km.
const INTERNAL_KEYS = ['PK', 'SK', 'gsi1pk', 'gsi1sk', 'gsi2pk', 'gsi2sk', 'gsi3pk', 'gsi3sk', 'gsi4sk', 'gsi5sk'] as const;

function toDbItem(athleteId: number, activity: StravaActivity): Record<string, unknown> {
    const pace = computePace(activity);
    const pk = athletePK(athleteId);
    const sk = activitySK(activity);
    const sportPK = `${pk}#SPORT#${activity.sport_type}`;

    // Store the complete raw activity object from Strava (whatever fields it contains —
    // average_heartrate, average_watts, kudos_count, etc.) then layer our own key/index
    // attributes on top so they can't be shadowed by a same-named field from Strava.
    const item: Record<string, unknown> = {
        ...activity,
        PK: pk,
        SK: sk,
        gsi1pk: sportPK,
        gsi1sk: sk,
        gsi2pk: pk,
        gsi2sk: distanceSK(activity),
        gsi3pk: sportPK,
        gsi3sk: distanceSK(activity),
    };

    // Sparse GSIs — only written when distance > 0
    if (pace !== undefined) {
        item.pace_per_km = pace;
        item.gsi4sk = paceSK(pace, activity.id);
        item.gsi5sk = paceSK(pace, activity.id);
    }

    return item;
}

function fromDbItem(item: Record<string, unknown>): CachedActivity {
    const activity = { ...item };
    for (const key of INTERNAL_KEYS) delete activity[key];
    return activity as CachedActivity;
}

// --- Public API ---

export async function getSyncMeta(athleteId: number): Promise<SyncMeta | null> {
    const result = await client.send(new GetCommand({
        TableName: TABLE_NAME,
        Key: { PK: athletePK(athleteId), SK: 'SYNC_META' },
    }));
    if (!result.Item) return null;
    return {
        lastSyncStartedAt: result.Item.lastSyncStartedAt as number,
        lastSyncCompletedAt: result.Item.lastSyncCompletedAt as number | undefined,
        fullSyncDone: result.Item.fullSyncDone as boolean,
    };
}

export function isSyncStale(meta: SyncMeta): boolean {
    if (meta.fullSyncDone) return false;
    const nowEpoch = Math.floor(Date.now() / 1000);
    return nowEpoch - meta.lastSyncStartedAt > STALE_SYNC_THRESHOLD_SECONDS;
}

// Atomically claims the sync slot. Returns true if this caller won the lock.
export async function claimSyncSlot(athleteId: number, existingMeta: SyncMeta | null): Promise<boolean> {
    const nowEpoch = Math.floor(Date.now() / 1000);
    const pk = athletePK(athleteId);
    try {
        if (!existingMeta) {
            await client.send(new PutCommand({
                TableName: TABLE_NAME,
                Item: { PK: pk, SK: 'SYNC_META', lastSyncStartedAt: nowEpoch, fullSyncDone: false },
                ConditionExpression: 'attribute_not_exists(SK)',
            }));
        } else {
            // Stale sync — update lastSyncStartedAt to claim ownership
            const staleCutoff = nowEpoch - STALE_SYNC_THRESHOLD_SECONDS;
            await client.send(new UpdateCommand({
                TableName: TABLE_NAME,
                Key: { PK: pk, SK: 'SYNC_META' },
                UpdateExpression: 'SET lastSyncStartedAt = :now',
                ConditionExpression: 'fullSyncDone = :false AND lastSyncStartedAt < :staleCutoff',
                ExpressionAttributeValues: {
                    ':now': nowEpoch,
                    ':false': false,
                    ':staleCutoff': staleCutoff,
                },
            }));
        }
        return true;
    } catch (err: unknown) {
        if ((err as { name?: string }).name === 'ConditionalCheckFailedException') return false;
        throw err;
    }
}

export async function markSyncComplete(athleteId: number): Promise<void> {
    const nowEpoch = Math.floor(Date.now() / 1000);
    await client.send(new UpdateCommand({
        TableName: TABLE_NAME,
        Key: { PK: athletePK(athleteId), SK: 'SYNC_META' },
        UpdateExpression: 'SET lastSyncCompletedAt = :now, fullSyncDone = :true',
        ExpressionAttributeValues: { ':now': nowEpoch, ':true': true },
    }));
}

export async function updateLastSyncCompletedAt(athleteId: number): Promise<void> {
    const nowEpoch = Math.floor(Date.now() / 1000);
    await client.send(new UpdateCommand({
        TableName: TABLE_NAME,
        Key: { PK: athletePK(athleteId), SK: 'SYNC_META' },
        UpdateExpression: 'SET lastSyncCompletedAt = :now',
        ExpressionAttributeValues: { ':now': nowEpoch },
    }));
}

export interface TrainingSummaryCache {
    summary: string;
    generatedAt: number; // epoch seconds
}

export async function getCachedTrainingSummary(athleteId: number): Promise<TrainingSummaryCache | null> {
    const result = await client.send(new GetCommand({
        TableName: TABLE_NAME,
        Key: { PK: athletePK(athleteId), SK: 'TRAINING_SUMMARY' },
    }));
    if (!result.Item) return null;
    return {
        summary: result.Item.summary as string,
        generatedAt: result.Item.generatedAt as number,
    };
}

export async function saveTrainingSummary(athleteId: number, summary: string): Promise<void> {
    await client.send(new PutCommand({
        TableName: TABLE_NAME,
        Item: {
            PK: athletePK(athleteId),
            SK: 'TRAINING_SUMMARY',
            summary,
            generatedAt: Math.floor(Date.now() / 1000),
        },
    }));
}

// --- Training plan (one active plan per athlete, generated asynchronously) ---

export async function getTrainingPlanItem(athleteId: number): Promise<TrainingPlanItem | null> {
    const result = await client.send(new GetCommand({
        TableName: TABLE_NAME,
        Key: { PK: athletePK(athleteId), SK: 'TRAINING_PLAN' },
    }));
    if (!result.Item) return null;
    return result.Item as unknown as TrainingPlanItem;
}

// Marks a new generation as in-progress without touching any previously
// generated `plan` — so a stale-but-valid plan stays visible while a new one
// generates, and isn't lost if the new generation fails.
export async function startTrainingPlanGeneration(athleteId: number, request: TrainingPlanRequest): Promise<void> {
    await client.send(new UpdateCommand({
        TableName: TABLE_NAME,
        Key: { PK: athletePK(athleteId), SK: 'TRAINING_PLAN' },
        UpdateExpression: 'SET #status = :generating, #request = :request, requestedAt = :now REMOVE errorMessage',
        ExpressionAttributeNames: { '#status': 'status', '#request': 'request' },
        ExpressionAttributeValues: {
            ':generating': 'generating',
            ':request': request,
            ':now': Math.floor(Date.now() / 1000),
        },
    }));
}

export async function completeTrainingPlanGeneration(athleteId: number, plan: TrainingPlan): Promise<void> {
    await client.send(new UpdateCommand({
        TableName: TABLE_NAME,
        Key: { PK: athletePK(athleteId), SK: 'TRAINING_PLAN' },
        UpdateExpression: 'SET #status = :complete, #plan = :plan, generatedAt = :now REMOVE errorMessage',
        ExpressionAttributeNames: { '#status': 'status', '#plan': 'plan' },
        ExpressionAttributeValues: {
            ':complete': 'complete',
            ':plan': plan,
            ':now': Math.floor(Date.now() / 1000),
        },
    }));
}

export async function failTrainingPlanGeneration(athleteId: number, errorMessage: string): Promise<void> {
    await client.send(new UpdateCommand({
        TableName: TABLE_NAME,
        Key: { PK: athletePK(athleteId), SK: 'TRAINING_PLAN' },
        UpdateExpression: 'SET #status = :failed, errorMessage = :errorMessage',
        ExpressionAttributeNames: { '#status': 'status' },
        ExpressionAttributeValues: {
            ':failed': 'failed',
            ':errorMessage': errorMessage,
        },
    }));
}

// Sends a BatchWrite and retries any UnprocessedItems (DynamoDB returns these
// when throttled). Gives up after 3 retries to avoid infinite loops.
async function batchWriteWithRetry(items: Record<string, unknown>[]): Promise<void> {
    let requestItems: Record<string, unknown>[] = items;
    for (let attempt = 0; attempt < 3 && requestItems.length > 0; attempt++) {
        if (attempt > 0) {
            await new Promise(resolve => setTimeout(resolve, 100 * Math.pow(2, attempt)));
        }
        const response = await client.send(new BatchWriteCommand({
            RequestItems: { [TABLE_NAME]: requestItems },
        }));
        requestItems = (response.UnprocessedItems?.[TABLE_NAME] ?? []) as Record<string, unknown>[];
    }
}

export async function upsertActivities(athleteId: number, activities: StravaActivity[]): Promise<void> {
    const BATCH_SIZE = 25;
    const pk = athletePK(athleteId);
    for (let i = 0; i < activities.length; i += BATCH_SIZE) {
        const batch = activities.slice(i, i + BATCH_SIZE);
        await batchWriteWithRetry(batch.map(activity => ({
            PutRequest: { Item: toDbItem(athleteId, activity) },
        })));
        // Write reverse lookup items so webhook handler can find activities by ID
        await batchWriteWithRetry(batch.map(activity => ({
            PutRequest: {
                Item: {
                    PK: lookupPK(activity.id),
                    SK: 'META',
                    athletePK: pk,
                    activitySK: activitySK(activity),
                },
            },
        })));
    }
}

// --- Webhook support ---

function lookupPK(activityId: number): string {
    return `ACTIVITYLOOKUP#${activityId}`;
}

export async function getLookupItem(activityId: number): Promise<{ athletePK: string; activitySK: string } | null> {
    const result = await client.send(new GetCommand({
        TableName: TABLE_NAME,
        Key: { PK: lookupPK(activityId), SK: 'META' },
    }));
    if (!result.Item) return null;
    return {
        athletePK: result.Item.athletePK as string,
        activitySK: result.Item.activitySK as string,
    };
}

export async function getActivityItem(actPK: string, actSK: string): Promise<Record<string, unknown> | null> {
    const result = await client.send(new GetCommand({
        TableName: TABLE_NAME,
        Key: { PK: actPK, SK: actSK },
    }));
    return (result.Item as Record<string, unknown>) ?? null;
}

export async function updateActivityItem(
    existing: Record<string, unknown>,
    updates: { title?: string; type?: string; visibility?: string },
): Promise<void> {
    const updated = { ...existing };

    if (updates.title !== undefined) {
        updated.name = updates.title;
    }

    if (updates.type !== undefined) {
        updated.sport_type = updates.type;
        // Recompute GSI keys that embed sport type
        const sportPK = `${existing.PK}#SPORT#${updates.type}`;
        updated.gsi1pk = sportPK;
        updated.gsi3pk = sportPK;
    }

    // Strava sends the exact visibility enum ('everyone' | 'followers_only' | 'only_me')
    // directly in the webhook payload — use it as-is rather than inferring from `private`,
    // which is a lossy two-state boolean (and arrives as a string, not a JSON boolean).
    if (updates.visibility !== undefined) {
        updated.visibility = updates.visibility;
    }

    await client.send(new PutCommand({ TableName: TABLE_NAME, Item: updated }));
}

export async function deleteActivityItem(actPK: string, actSK: string, activityId: number): Promise<void> {
    await client.send(new BatchWriteCommand({
        RequestItems: {
            [TABLE_NAME]: [
                { DeleteRequest: { Key: { PK: actPK, SK: actSK } } },
                { DeleteRequest: { Key: { PK: lookupPK(activityId), SK: 'META' } } },
            ],
        },
    }));
}

export async function queryActivities(athleteId: number, filters: ActivityFilters): Promise<CachedActivity[]> {
    const pk = athletePK(athleteId);
    const { sportType, minDistance, maxDistance, minPace, maxPace } = filters;
    const hasSport = !!sportType;
    const hasDist = minDistance !== undefined || maxDistance !== undefined;
    const hasPace = minPace !== undefined || maxPace !== undefined;

    let items: Record<string, unknown>[] = [];

    if (hasDist) {
        const minSk = `DIST#${paddedNumber(minDistance ?? 0)}`;
        const maxSk = `DIST#${paddedNumber(maxDistance ?? 9_999_999)}#9999999999`;
        const indexName = hasSport ? 'GSI3-SportDist' : 'GSI2-AllDist';
        const pkAttr = hasSport ? 'gsi3pk' : 'gsi2pk';
        const pkVal = hasSport ? `${pk}#SPORT#${sportType}` : pk;
        items = await queryIndex(indexName, pkAttr, pkVal, hasSport ? 'gsi3sk' : 'gsi2sk', minSk, maxSk);
    } else if (hasPace) {
        const minSk = `PACE#${paddedNumber(minPace ?? 0)}`;
        const maxSk = `PACE#${paddedNumber(maxPace ?? 9_999_999)}#9999999999`;
        const indexName = hasSport ? 'GSI5-SportPace' : 'GSI4-AllPace';
        const pkAttr = hasSport ? 'gsi3pk' : 'gsi2pk';
        const pkVal = hasSport ? `${pk}#SPORT#${sportType}` : pk;
        items = await queryIndex(indexName, pkAttr, pkVal, hasSport ? 'gsi5sk' : 'gsi4sk', minSk, maxSk);
    } else if (hasSport) {
        // GSI1: sport type, sorted newest first
        items = await queryIndexDesc('GSI1-SportDate', 'gsi1pk', `${pk}#SPORT#${sportType}`, 'gsi1sk', 'ACTIVITY#', 'ACTIVITY$');
    } else {
        // Main table: all activities, newest first
        items = await queryMainTable(pk);
    }

    return items.map(fromDbItem).sort((a, b) => b.start_date.localeCompare(a.start_date));
}

// --- Index query helpers ---

async function queryIndex(
    indexName: string,
    pkAttr: string,
    pkVal: string,
    skAttr: string,
    minSk: string,
    maxSk: string,
): Promise<Record<string, unknown>[]> {
    const results: Record<string, unknown>[] = [];
    let lastKey: Record<string, unknown> | undefined;

    do {
        const response = await client.send(new QueryCommand({
            TableName: TABLE_NAME,
            IndexName: indexName,
            KeyConditionExpression: `${pkAttr} = :pk AND ${skAttr} BETWEEN :min AND :max`,
            ExpressionAttributeValues: { ':pk': pkVal, ':min': minSk, ':max': maxSk },
            ExclusiveStartKey: lastKey,
        }));
        results.push(...(response.Items ?? []) as Record<string, unknown>[]);
        lastKey = response.LastEvaluatedKey as Record<string, unknown> | undefined;
    } while (lastKey);

    return results;
}

async function queryIndexDesc(
    indexName: string,
    pkAttr: string,
    pkVal: string,
    skAttr: string,
    skMin: string,
    skMax: string,
): Promise<Record<string, unknown>[]> {
    const results: Record<string, unknown>[] = [];
    let lastKey: Record<string, unknown> | undefined;

    do {
        const response = await client.send(new QueryCommand({
            TableName: TABLE_NAME,
            IndexName: indexName,
            KeyConditionExpression: `${pkAttr} = :pk AND ${skAttr} BETWEEN :min AND :max`,
            ExpressionAttributeValues: { ':pk': pkVal, ':min': skMin, ':max': skMax },
            ScanIndexForward: false,
            ExclusiveStartKey: lastKey,
        }));
        results.push(...(response.Items ?? []) as Record<string, unknown>[]);
        lastKey = response.LastEvaluatedKey as Record<string, unknown> | undefined;
    } while (lastKey);

    return results;
}

async function queryMainTable(pk: string): Promise<Record<string, unknown>[]> {
    const results: Record<string, unknown>[] = [];
    let lastKey: Record<string, unknown> | undefined;

    do {
        const response = await client.send(new QueryCommand({
            TableName: TABLE_NAME,
            KeyConditionExpression: 'PK = :pk AND SK BETWEEN :min AND :max',
            ExpressionAttributeValues: { ':pk': pk, ':min': 'ACTIVITY#', ':max': 'ACTIVITY$' },
            ScanIndexForward: false,
            ExclusiveStartKey: lastKey,
        }));
        results.push(...(response.Items ?? []) as Record<string, unknown>[]);
        lastKey = response.LastEvaluatedKey as Record<string, unknown> | undefined;
    } while (lastKey);

    return results;
}
