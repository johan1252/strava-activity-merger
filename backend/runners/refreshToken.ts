import { handler } from "#handlers/refreshToken.ts";
import { Logger } from '@aws-lambda-powertools/logger';
import 'dotenv/config';

const logger = new Logger();

(async () => {
	const event = {
		body: JSON.stringify({
			refreshToken: "your_valid_refresh_token_here",
		}),
		headers: {},
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