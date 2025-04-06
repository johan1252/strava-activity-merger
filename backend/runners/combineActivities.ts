import { handler } from "#handlers/combineActivities.ts";
import { Logger } from '@aws-lambda-powertools/logger';
import 'dotenv/config';

const logger = new Logger();

(async () => {
	const event = {
		body: JSON.stringify({
			activities: [
                {
                    id: 14081123417,
                    startDate: "2025-04-04T19:41:08Z",
                    name: "Centennial ParkRun"
                },
                {
                    id: 14081742380,
                    startDate: "2025-04-04T22:01:49Z",
                    name: "Back from ParkRun"
                }
            ]
		}),
        headers: {
			Authorization: `Bearer ${process.env.TEMP_ACCESS_TOKEN}`
		},
		multiValueHeaders: {},
		httpMethod: "POST",
		isBase64Encoded: false,
		path: "/",
		queryStringParameters: null,
		multiValueQueryStringParameters: null,
		pathParameters: null,
		stageVariables: null,
		requestContext: {} as any,
		resource: "/"
	};
	const result = await handler(event);
	logger.info({ message: "result", result });
})();