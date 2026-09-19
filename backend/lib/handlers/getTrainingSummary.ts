import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { Logger } from '@aws-lambda-powertools/logger';
import OpenAI, { BedrockOpenAI } from 'openai';
import { getTokenProvider } from '@aws/bedrock-token-generator';
import { queryActivities, getCachedTrainingSummary, saveTrainingSummary } from '../services/activityCache';
import { resolveAthleteId } from '../utils/resolveAthlete';
import {
    computeVolumeTrend,
    computePaceTrend,
    computeStreak,
    computeWeekStreak,
    computeRacePredictions,
} from '../services/statsAggregation';

const logger = new Logger({ serviceName: 'getTrainingSummary' });
const MS_PER_DAY = 24 * 60 * 60 * 1000;
const SPORT_BREAKDOWN_LOOKBACK_DAYS = 90;
const TRAINING_SUMMARY_CACHE_TTL_SECONDS = 24 * 60 * 60;

// Grok 4.3 via Amazon Bedrock's "Mantle" OpenAI-compatible endpoint — summarizing a small
// pre-aggregated JSON digest is a simple task, well within a smaller/cheaper model's
// capability. Mantle only supports bearer-token auth (not direct SigV4), but
// @aws/bedrock-token-generator mints that bearer token on the fly from the Lambda's own
// execution role — no API key or secret to create/store/rotate.
const BEDROCK_MODEL_ID = 'xai.grok-4.3';

// Invoked fresh before each request, so it always signs with the Lambda's current credentials.
const provideBedrockToken = getTokenProvider();

function formatDuration(totalSeconds: number): string {
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.round((totalSeconds % 3600) / 60);
    return hours > 0 ? `${hours}h${String(minutes).padStart(2, '0')}m` : `${minutes}m`;
}

const SYSTEM_PROMPT = `You are an experienced running and endurance coach. You will be given a compact JSON summary of an athlete's recent training data: weekly volume, running pace trend, consistency streaks, a sport-type breakdown, and predicted race times. Write a short training summary in plain text — 3 to 4 sentences, no markdown, no bullet points, no headings. Call out the most notable trend (volume, consistency, or pace) and end with one specific, actionable suggestion. Interpret the numbers like a coach would rather than simply restating them. If the data is sparse, say so briefly and encourage building a consistent base.`;

const getTrainingSummary = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
    logger.info('Entered handler');
    try {
        if (!event?.headers?.Authorization) {
            throw new Error('No Authorization information provided');
        }

        const accessToken = event.headers.Authorization.split(' ')[1];
        const athleteId = await resolveAthleteId(accessToken);
        logger.appendKeys({ athleteId });

        const nowEpoch = Math.floor(Date.now() / 1000);
        const cached = await getCachedTrainingSummary(athleteId);
        if (cached && nowEpoch - cached.generatedAt < TRAINING_SUMMARY_CACHE_TTL_SECONDS) {
            logger.info('Serving cached training summary', { ageSeconds: nowEpoch - cached.generatedAt });
            return {
                statusCode: 200,
                body: JSON.stringify({ summary: cached.summary }),
            };
        }

        const activities = await queryActivities(athleteId, {});

        const cutoff = Date.now() - SPORT_BREAKDOWN_LOOKBACK_DAYS * MS_PER_DAY;
        const sportCounts: Record<string, number> = {};
        for (const activity of activities) {
            if (new Date(activity.start_date).getTime() < cutoff) continue;
            sportCounts[activity.sport_type] = (sportCounts[activity.sport_type] ?? 0) + 1;
        }

        const trainingContext = {
            last3MonthsWeeklyVolumeKm: computeVolumeTrend(activities, '3m').map(w => ({
                weekStart: w.periodStart,
                km: Math.round(w.distance / 100) / 10,
                activityCount: w.count,
            })),
            last3MonthsRunPaceTrendMinPerKm: computePaceTrend(activities, '3m').map(p => ({
                weekStart: p.periodStart,
                avgPaceMinPerKm: Math.round((p.avgPaceSecPerKm / 60) * 10) / 10,
            })),
            currentDayStreak: computeStreak(activities).current,
            currentWeekStreak: computeWeekStreak(activities).current,
            sportBreakdownLast90Days: sportCounts,
            racePredictions: computeRacePredictions(activities).map(p => ({
                distance: p.distanceLabel,
                predictedTime: formatDuration(p.predictedSeconds),
            })),
        };

        const client = new BedrockOpenAI({ bedrockTokenProvider: provideBedrockToken, awsRegion: process.env.AWS_REGION });

        const response = await client.chat.completions.create({
            model: BEDROCK_MODEL_ID,
            max_completion_tokens: 600,
            // Grok 4.3 has reasoning on by default, and reasoning tokens count against
            // max_completion_tokens — with a small budget that starves the visible
            // response (empty content). This task is plain summarization of a small
            // pre-aggregated digest, not multi-step reasoning, so disable it outright.
            reasoning_effort: 'none',
            messages: [
                { role: 'system', content: SYSTEM_PROMPT },
                { role: 'user', content: JSON.stringify(trainingContext) },
            ],
        });

        const summary = response.choices[0]?.message?.content?.trim() ?? '';
        const logFields = {
            activityCount: activities.length,
            finishReason: response.choices[0]?.finish_reason,
            usage: response.usage,
        };

        if (!summary) {
            logger.warn('Training summary came back empty', logFields);
        } else {
            logger.info('Generated training summary', logFields);
            // Only cache non-empty results, so a failed/empty generation doesn't block
            // retries for the full TTL.
            await saveTrainingSummary(athleteId, summary);
        }

        return {
            statusCode: 200,
            body: JSON.stringify({ summary }),
        };
    } catch (error) {
        if (error instanceof OpenAI.AuthenticationError) {
            logger.error({ message: 'Bedrock authentication failed — check the Lambda role has bedrock:CallWithBearerToken and that model access is enabled in the Bedrock console', error });
        } else if (error instanceof OpenAI.RateLimitError) {
            logger.error({ message: 'Bedrock throttled the request', error });
        } else if (error instanceof OpenAI.APIError) {
            logger.error({ message: 'Bedrock API error', status: error.status, error });
        } else {
            logger.error({ message: 'Error in handler', error });
        }
        return {
            statusCode: 500,
            body: JSON.stringify({
                message: 'Internal Server Error',
                error: (error as Error).message,
            }),
        };
    }
};

const handler = getTrainingSummary;

export { handler };
