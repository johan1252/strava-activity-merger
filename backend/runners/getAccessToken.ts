import { handler } from "#handlers/getAccessToken.mts";
import type { Context } from "aws-lambda";
import { Logger } from '@aws-lambda-powertools/logger';

const logger = new Logger();

(async () => {
	const event = {
		body: JSON.stringify({
			code: "your_authorization_code_here",
		})
	};
	const context = {} as Context;
	const result = await handler(event, context);
	logger.info({ message: "result", result });
})();