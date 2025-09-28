import { handler } from "#handlers/roundDown.ts";
import { Logger } from '@aws-lambda-powertools/logger';
import 'dotenv/config';

const logger = new Logger();

(async () => {
	const event = {
		body: JSON.stringify({
			activity: {
                    id: 15937324087,
                    startDate: "2025-09-25T22:52:51Z",
                    name: "Hi Bondi 👋",
					distance: 6013.9, // in meters
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