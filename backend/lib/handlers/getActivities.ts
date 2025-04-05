import type { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { Logger } from '@aws-lambda-powertools/logger';
import strava from 'strava-v3';

const logger = new Logger({ serviceName: 'authorize' });


const getAccessToken = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
    logger.info("Entered handler");
    try {
        if (!event?.headers?.Authorization) {
            throw new Error("No Authorization information provided");
        }
        const accessToken = event.headers.Authorization.split(' ')[1];

        await strava.client(accessToken);

        const activities = await strava.athlete.listActivities({ page: 1, per_page: 10 });

        return {
            statusCode: 200,
            body: JSON.stringify({
                activities
            }),
            headers: {
                'Access-Control-Allow-Origin': '*', // Allow all origins
                'Access-Control-Allow-Credentials': true, // Allow credentials
                'Content-Type': 'application/json',
            }
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