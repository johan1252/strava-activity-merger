import { DynamoDBClient, ConditionalCheckFailedException } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import { KMSClient, EncryptCommand, DecryptCommand } from '@aws-sdk/client-kms';
import strava from 'strava-v3';

const TABLE_NAME = process.env.ACTIVITY_CACHE_TABLE_NAME!;
const KMS_KEY_ID = process.env.ATHLETE_TOKEN_KMS_KEY_ID!;
const EXPIRY_BUFFER_SECONDS = 5 * 60;

const client = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const kms = new KMSClient({});

export interface StravaTokens {
    accessToken: string;
    refreshToken: string;
    expiresAt: number;
}

interface StoredTokenItem {
    ciphertext: string;
    expiresAt: number;
    version: number;
}

function tokenKey(athleteId: number) {
    return { PK: `ATHLETE#${athleteId}`, SK: 'STRAVA_TOKEN' };
}

async function encrypt(tokens: StravaTokens): Promise<string> {
    const result = await kms.send(new EncryptCommand({
        KeyId: KMS_KEY_ID,
        Plaintext: Buffer.from(JSON.stringify(tokens)),
    }));
    return Buffer.from(result.CiphertextBlob!).toString('base64');
}

async function decrypt(ciphertext: string): Promise<StravaTokens> {
    const result = await kms.send(new DecryptCommand({
        KeyId: KMS_KEY_ID,
        CiphertextBlob: Buffer.from(ciphertext, 'base64'),
    }));
    return JSON.parse(Buffer.from(result.Plaintext!).toString());
}

async function getStoredItem(athleteId: number): Promise<StoredTokenItem | null> {
    const result = await client.send(new GetCommand({ TableName: TABLE_NAME, Key: tokenKey(athleteId) }));
    return (result.Item as StoredTokenItem | undefined) ?? null;
}

/** Overwrites the stored tokens. Use when Strava just issued fresh tokens at login or refresh. */
export async function saveAthleteTokens(athleteId: number, tokens: StravaTokens): Promise<void> {
    const existing = await getStoredItem(athleteId);
    await client.send(new PutCommand({
        TableName: TABLE_NAME,
        Item: {
            ...tokenKey(athleteId),
            ciphertext: await encrypt(tokens),
            expiresAt: tokens.expiresAt,
            version: (existing?.version ?? 0) + 1,
        },
    }));
}

/**
 * Returns a valid access token for the athlete, refreshing it if it expires within 5 minutes.
 * Returns null when no token is stored.
 */
export async function getValidAccessToken(athleteId: number): Promise<string | null> {
    const item = await getStoredItem(athleteId);
    if (!item) return null;

    const tokens = await decrypt(item.ciphertext);
    if (tokens.expiresAt - Math.floor(Date.now() / 1000) > EXPIRY_BUFFER_SECONDS) {
        return tokens.accessToken;
    }

    strava.config({
        client_id: process.env.STRAVA_CLIENT_ID!,
        client_secret: process.env.STRAVA_CLIENT_SECRET!,
        redirect_uri: process.env.STRAVA_REDIRECT_URI ?? '',
        access_token: '',
    });
    const refreshed = await strava.oauth.refreshToken(tokens.refreshToken);
    const fresh: StravaTokens = {
        accessToken: refreshed.access_token,
        refreshToken: refreshed.refresh_token,
        expiresAt: refreshed.expires_at,
    };

    // Write only if no other invocation rotated the tokens since we read them.
    try {
        await client.send(new PutCommand({
            TableName: TABLE_NAME,
            Item: {
                ...tokenKey(athleteId),
                ciphertext: await encrypt(fresh),
                expiresAt: fresh.expiresAt,
                version: item.version + 1,
            },
            ConditionExpression: 'version = :v',
            ExpressionAttributeValues: { ':v': item.version },
        }));
        return fresh.accessToken;
    } catch (error) {
        if (!(error instanceof ConditionalCheckFailedException)) throw error;
        const winner = await getStoredItem(athleteId);
        return winner ? (await decrypt(winner.ciphertext)).accessToken : null;
    }
}
