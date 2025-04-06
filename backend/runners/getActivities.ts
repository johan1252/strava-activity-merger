import { handler } from "#handlers/getActivities.ts";
import { Logger } from '@aws-lambda-powertools/logger';
import 'dotenv/config';

const logger = new Logger();

(async () => {
	const event = {
		body: null,
		headers: {
			Authorization: `Bearer ${process.env.TEMP_ACCESS_TOKEN}`
		},
		multiValueHeaders: {},
		httpMethod: "GET",
		isBase64Encoded: false,
		path: "/",
		queryStringParameters: null,
		multiValueQueryStringParameters: null,
		pathParameters: null,
		stageVariables: null,
		requestContext: {} as any,
		resource: "/"
	};
	console.log({ message: "event", event });
	const result = await handler(event);
	console.log(JSON.stringify(JSON.parse(result.body), null, 2));
})();