import type { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { Logger } from '@aws-lambda-powertools/logger';
import strava from 'strava-v3';

const logger = new Logger({ serviceName: 'getActivities' });


const getActivities = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
    logger.info("Entered handler");
    try {
        if (!event?.headers?.Authorization) {
            throw new Error("No Authorization information provided");
        }
        const page = event.queryStringParameters?.page ? parseInt(event.queryStringParameters.page) : 1;
        if (isNaN(page) || page < 1) {
            throw new Error("Invalid page number");
        }

        const accessToken = event.headers.Authorization.split(' ')[1];

        await strava.client(accessToken);

        const activities = await strava.athlete.listActivities({ page: page, per_page: 25 });

        return {
            statusCode: 200,
            body: JSON.stringify({
                activities,
                page
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

const handler = getActivities;

export { handler };