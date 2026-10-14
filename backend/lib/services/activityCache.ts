import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
    DynamoDBDocumentClient,
    GetCommand,
    PutCommand,
    UpdateCommand,
    DeleteCommand,
    BatchWriteCommand,
    QueryCommand,
} from '@aws-sdk/lib-dynamodb';
import type { StravaActivity, CachedActivity, ActivityFilters, SyncMeta } from '../types/activity';
import type { TrainingPlanItem, TrainingPlanRequest, TrainingPlan, TrainingPlanChatMessage, PendingGoalChange } from '../types/trainingPlan';

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

// --- Training plans (several per athlete, each generated asynchronously) ---

// Plans made before multiple plans existed live at SK 'TRAINING_PLAN' with no id in the key;
// they keep working as the plan with this id rather than being migrated.
const LEGACY_PLAN_ID = 'main';
const PLAN_SK_PREFIX = 'TRAINING_PLAN';
const MAX_CHAT_MESSAGES = 40;

function planSK(planId: string): string {
    return planId === LEGACY_PLAN_ID ? PLAN_SK_PREFIX : `${PLAN_SK_PREFIX}#${planId}`;
}

function planIdFromSK(sk: string): string {
    return sk === PLAN_SK_PREFIX ? LEGACY_PLAN_ID : sk.slice(PLAN_SK_PREFIX.length + 1);
}

function planKey(athleteId: number, planId: string) {
    return { PK: athletePK(athleteId), SK: planSK(planId) };
}

// A plan deleted while a worker is still running must stay deleted — an UpdateCommand
// on a missing item would otherwise recreate it with only the worker's fields.
async function updateExistingPlan(input: ConstructorParameters<typeof UpdateCommand>[0]): Promise<void> {
    try {
        await client.send(new UpdateCommand({ ...input, ConditionExpression: 'attribute_exists(PK)' }));
    } catch (error) {
        if ((error as Error).name === 'ConditionalCheckFailedException') return;
        throw error;
    }
}

export async function listTrainingPlanItems(athleteId: number): Promise<{ id: string; item: TrainingPlanItem }[]> {
    const result = await client.send(new QueryCommand({
        TableName: TABLE_NAME,
        KeyConditionExpression: 'PK = :pk AND begins_with(SK, :prefix)',
        ExpressionAttributeValues: { ':pk': athletePK(athleteId), ':prefix': PLAN_SK_PREFIX },
    }));
    return (result.Items ?? []).map(i => ({ id: planIdFromSK(i.SK as string), item: i as unknown as TrainingPlanItem }));
}

export async function getTrainingPlanItem(athleteId: number, planId: string): Promise<TrainingPlanItem | null> {
    const result = await client.send(new GetCommand({
        TableName: TABLE_NAME,
        Key: planKey(athleteId, planId),
    }));
    if (!result.Item) return null;
    return result.Item as unknown as TrainingPlanItem;
}

export async function deleteTrainingPlan(athleteId: number, planId: string): Promise<void> {
    await client.send(new DeleteCommand({
        TableName: TABLE_NAME,
        Key: planKey(athleteId, planId),
    }));
}

// Marks a new generation as in-progress without touching any previously
// generated `plan` — so a stale-but-valid plan stays visible while a new one
// generates, and isn't lost if the new generation fails.
export async function startTrainingPlanGeneration(athleteId: number, planId: string, request: TrainingPlanRequest): Promise<void> {
    await client.send(new UpdateCommand({
        TableName: TABLE_NAME,
        Key: planKey(athleteId, planId),
        UpdateExpression: 'SET #status = :generating, #request = :request, requestedAt = :now REMOVE errorMessage',
        ExpressionAttributeNames: { '#status': 'status', '#request': 'request' },
        ExpressionAttributeValues: {
            ':generating': 'generating',
            ':request': request,
            ':now': Math.floor(Date.now() / 1000),
        },
    }));
}

// `stayGenerating` keeps the plan in 'generating' (with a fresh timer) when a preferences
// revision follows straight away, so the UI doesn't show a half-finished plan as done.
export async function completeTrainingPlanGeneration(
    athleteId: number,
    planId: string,
    plan: TrainingPlan,
    stayGenerating = false,
): Promise<void> {
    const now = Math.floor(Date.now() / 1000);
    await updateExistingPlan({
        TableName: TABLE_NAME,
        Key: planKey(athleteId, planId),
        UpdateExpression: 'SET #status = :status, #plan = :plan, generatedAt = :now, requestedAt = :requestedAt REMOVE errorMessage',
        ExpressionAttributeNames: { '#status': 'status', '#plan': 'plan' },
        ExpressionAttributeValues: {
            ':status': stayGenerating ? 'generating' : 'complete',
            ':plan': plan,
            ':now': now,
            ':requestedAt': now,
        },
    });
}

// Appends the athlete's message and flips the plan to 'generating' in one write. The
// condition rejects a second message while a revision is already running, returning
// false so the caller can answer 409 rather than queueing two overlapping revisions.
export async function startTrainingPlanRevision(athleteId: number, planId: string, message: string): Promise<boolean> {
    const now = Math.floor(Date.now() / 1000);
    const userMessage: TrainingPlanChatMessage = { role: 'user', content: message, at: now };
    try {
        await client.send(new UpdateCommand({
            TableName: TABLE_NAME,
            Key: planKey(athleteId, planId),
            UpdateExpression: 'SET #status = :generating, requestedAt = :now, chat = list_append(if_not_exists(chat, :empty), :message) REMOVE errorMessage',
            ConditionExpression: 'attribute_exists(#plan) AND #status <> :generating',
            ExpressionAttributeNames: { '#status': 'status', '#plan': 'plan' },
            ExpressionAttributeValues: {
                ':generating': 'generating',
                ':now': now,
                ':empty': [],
                ':message': [userMessage],
            },
        }));
        return true;
    } catch (error) {
        if ((error as Error).name === 'ConditionalCheckFailedException') return false;
        throw error;
    }
}

// Saves the revised plan and the full chat (including the assistant's reply), trimmed to
// the latest messages, and records whether the plan now carries weekdays.
export async function completeTrainingPlanRevision(
    athleteId: number,
    planId: string,
    plan: TrainingPlan,
    chat: TrainingPlanChatMessage[],
    includeDays: boolean,
    pendingGoalChange: PendingGoalChange | null,
    preferences: string[],
): Promise<void> {
    await updateExistingPlan({
        TableName: TABLE_NAME,
        Key: planKey(athleteId, planId),
        UpdateExpression: `SET #status = :complete, #plan = :plan, chat = :chat, #request.includeDays = :includeDays, preferences = :preferences, generatedAt = :now${pendingGoalChange ? ', pendingGoalChange = :pending' : ''} REMOVE errorMessage${pendingGoalChange ? '' : ', pendingGoalChange'}`,
        ExpressionAttributeNames: { '#status': 'status', '#plan': 'plan', '#request': 'request' },
        ExpressionAttributeValues: {
            ':complete': 'complete',
            ':plan': plan,
            ':includeDays': includeDays,
            ':preferences': preferences,
            ':chat': chat.slice(-MAX_CHAT_MESSAGES),
            ':now': Math.floor(Date.now() / 1000),
            ...(pendingGoalChange ? { ':pending': pendingGoalChange } : {}),
        },
    });
}

// The athlete confirmed a goal change in chat: store the new goal and the confirmation
// reply, drop the pending proposal, and mark the plan as generating. The caller then
// starts the generator, which replaces the plan once it finishes.
export async function startGoalChangeRegeneration(
    athleteId: number,
    planId: string,
    request: TrainingPlanRequest,
    chat: TrainingPlanChatMessage[],
): Promise<void> {
    await updateExistingPlan({
        TableName: TABLE_NAME,
        Key: planKey(athleteId, planId),
        UpdateExpression: 'SET #status = :generating, #request = :request, requestedAt = :now, chat = :chat REMOVE errorMessage, pendingGoalChange',
        ExpressionAttributeNames: { '#status': 'status', '#request': 'request' },
        ExpressionAttributeValues: {
            ':generating': 'generating',
            ':request': request,
            ':now': Math.floor(Date.now() / 1000),
            ':chat': chat.slice(-MAX_CHAT_MESSAGES),
        },
    });
}

// A failed revision leaves the existing plan valid, so the status goes back to
// 'complete' and the failure shows up as an assistant message in the chat.
export async function failTrainingPlanRevision(
    athleteId: number,
    planId: string,
    chat: TrainingPlanChatMessage[],
    errorMessage: string,
): Promise<void> {
    const assistantMessage: TrainingPlanChatMessage = { role: 'assistant', content: errorMessage, at: Math.floor(Date.now() / 1000) };
    await updateExistingPlan({
        TableName: TABLE_NAME,
        Key: planKey(athleteId, planId),
        UpdateExpression: 'SET #status = :complete, chat = :chat REMOVE errorMessage',
        ExpressionAttributeNames: { '#status': 'status' },
        ExpressionAttributeValues: {
            ':complete': 'complete',
            ':chat': [...chat, assistantMessage].slice(-MAX_CHAT_MESSAGES),
        },
    });
}

// Replaces the whole manualCompletions array (computed by the caller from the run's
// current state) rather than SET-ing a single index — an indexed SET requires the list
// to already exist at that path, which isn't true for plans generated before this field
// existed. List indices are interpolated directly into the expression string (DynamoDB
// has no way to parameterize them) — safe here since callers validate both as bounded
// integers before calling.
export async function setRunManualCompletions(
    athleteId: number,
    planId: string,
    weekIndex: number,
    runIndex: number,
    manualCompletions: (boolean | null)[],
): Promise<void> {
    await updateExistingPlan({
        TableName: TABLE_NAME,
        Key: planKey(athleteId, planId),
        UpdateExpression: `SET #plan.weeks[${weekIndex}].runs[${runIndex}].manualCompletions = :manualCompletions`,
        ExpressionAttributeNames: { '#plan': 'plan' },
        ExpressionAttributeValues: { ':manualCompletions': manualCompletions },
    });
}

export async function failTrainingPlanGeneration(athleteId: number, planId: string, errorMessage: string): Promise<void> {
    await updateExistingPlan({
        TableName: TABLE_NAME,
        Key: planKey(athleteId, planId),
        UpdateExpression: 'SET #status = :failed, errorMessage = :errorMessage',
        ExpressionAttributeNames: { '#status': 'status' },
        ExpressionAttributeValues: {
            ':failed': 'failed',
            ':errorMessage': errorMessage,
        },
    });
}

// --- Daily usage counters (per-athlete limits on model calls) ---

function usageKey(athleteId: number, kind: string, dateKey: string) {
    return { PK: athletePK(athleteId), SK: `USAGE#${kind}#${dateKey}` };
}

// Adds one to today's counter unless it has already reached `limit`. The condition makes the
// check and the increment one atomic step, so two quick requests can't both pass at limit - 1.
// `expiresAt` (epoch seconds) is the TTL after which DynamoDB deletes the counter.
export async function incrementDailyUsage(
    athleteId: number,
    kind: string,
    dateKey: string,
    limit: number,
    expiresAt: number,
): Promise<{ allowed: boolean; used: number }> {
    try {
        const result = await client.send(new UpdateCommand({
            TableName: TABLE_NAME,
            Key: usageKey(athleteId, kind, dateKey),
            UpdateExpression: 'SET #count = if_not_exists(#count, :zero) + :one, #ttl = :expiresAt',
            ConditionExpression: 'attribute_not_exists(#count) OR #count < :limit',
            ExpressionAttributeNames: { '#count': 'count', '#ttl': 'ttl' },
            ExpressionAttributeValues: { ':zero': 0, ':one': 1, ':limit': limit, ':expiresAt': expiresAt },
            ReturnValues: 'UPDATED_NEW',
        }));
        return { allowed: true, used: Number(result.Attributes?.count ?? 1) };
    } catch (error) {
        if ((error as Error).name === 'ConditionalCheckFailedException') return { allowed: false, used: limit };
        throw error;
    }
}

// Gives back a unit that was taken for a request that then did no work (for example a rejected duplicate).
export async function refundDailyUsage(athleteId: number, kind: string, dateKey: string): Promise<void> {
    try {
        await client.send(new UpdateCommand({
            TableName: TABLE_NAME,
            Key: usageKey(athleteId, kind, dateKey),
            UpdateExpression: 'SET #count = #count - :one',
            ConditionExpression: '#count > :zero',
            ExpressionAttributeNames: { '#count': 'count' },
            ExpressionAttributeValues: { ':one': 1, ':zero': 0 },
        }));
    } catch (error) {
        if ((error as Error).name === 'ConditionalCheckFailedException') return;
        throw error;
    }
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
