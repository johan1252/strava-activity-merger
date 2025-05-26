import type { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { Logger } from '@aws-lambda-powertools/logger';
import strava from 'strava-v3';

const logger = new Logger({ serviceName: 'authorize' });


const getAccessToken = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
    logger.info("Entered handler");
    try {
        if (!event.body) {
            throw new Error("Request body is null or undefined");
        }
        const body = JSON.parse(event.body);
        const { authorizationCode } = body

        if (!authorizationCode) {
            throw new Error("Authorization code is missing");
        }

        if (!process.env.STRAVA_CLIENT_ID || !process.env.STRAVA_CLIENT_SECRET) {
            throw new Error('Environment variables STRAVA_CLIENT_ID and STRAVA_CLIENT_SECRET must be set.');
        }
        if (!process.env.STRAVA_REDIRECT_URI) {
            throw new Error('Environment variable STRAVA_REDIRECT_URI must be set.');
        }
        if (!process.env.STRAVA_ACCESS_TOKEN) {
            throw new Error('Environment variable STRAVA_ACCESS_TOKEN must be set.');
        }

        strava.config({
            client_id: process.env.STRAVA_CLIENT_ID,
            client_secret: process.env.STRAVA_CLIENT_SECRET,
            redirect_uri: process.env.STRAVA_REDIRECT_URI,
            access_token: process.env.STRAVA_ACCESS_TOKEN,
        });


        const payload = await strava.oauth.getToken(authorizationCode)
        logger.info({ message: "payload", payload });

        return {
            statusCode: 200,
            body: JSON.stringify({
                message: "Success",
                accessToken: payload.access_token,
                refreshToken: payload.refresh_token,
                expiresAt: payload.expires_at,
                tokenType: payload.token_type,
                athlete: payload.athlete,
                scope: payload.scope,
                expiresIn: payload.expires_in,
            })
        };
    } catch (error) {
        logger.error({ message: "Error in handler", error });
        return {
            statusCode: 500,
            body: JSON.stringify({
                message: "Internal Server Error",
                // @ts-ignore
                error: error.message, 
            }),
        };
    }
};

const handler = getAccessToken;

export { handler };