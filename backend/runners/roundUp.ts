import { handler } from "#handlers/roundUp.ts";
import { Logger } from '@aws-lambda-powertools/logger';
import 'dotenv/config';

const logger = new Logger();

(async () => {
	const event = {
		body: JSON.stringify({
			activity: {
                    id: 15858215927,
                    startDate: "2025-09-18T19:47:16Z",
                    name: "Afternoon Run",
					distance: 6502, // in meters
					sport_type: "Run"
            }
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