import strava from 'strava-v3';
import { Logger } from '@aws-lambda-powertools/logger';
import 'dotenv/config';
import { readFileSync, writeFileSync } from "fs";
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const logger = new Logger();

(async () => {

	await strava.client(process.env.TEMP_ACCESS_TOKEN);

	// const files = [
	// 	'assets/testActivityPart1_sample.gpx',
	// 	'assets/testActivityPart2_sample.gpx'
	// ]

	// Test edge case where two activities are reverse of each other
	const files = [
		'assets/testActivityPart1_sample.gpx',
		'assets/testActivityPart1Reverse_sample.gpx'
	]

	// Loop through files and upload them one by one
	for (const file of files) {
		// Update datetime in gpx file to now, so Strava doesn't reject it as a duplicate
		const gpxFilename = '/tmp/gpx_temp.gpx'
		const now = new Date()
		const sampleGpxFilename = path.resolve(__dirname, file);
		let gpx = readFileSync(sampleGpxFilename, 'utf8');
		let timestamp = new Date(now.getTime() - 1000 * 1000); // start 1000 seconds ago
		console.log("Updating GPX timestamps to start at", timestamp.toISOString());
		gpx = gpx.replace(/<time>REPLACE_WITH_TIMESTAMP<\/time>/g, () => {
			const isoString = timestamp.toISOString().split('.')[0] + "Z";
			const result = `<time>${isoString}</time>`;
			timestamp = new Date(timestamp.getTime() + 3 * 1000); // add 3 seconds between each timestamp
			return result;
		});
		writeFileSync(gpxFilename, gpx, 'utf8')



		const firstResp = await strava.uploads.post({
			// @ts-ignore
			activity_type: "Run", // TODO Update strava-v3 types
			sport_type: "Run",
			data_type: 'gpx',
			name: `Test activity ${now.toISOString().split('.')[0]}`,
			description: `Part of two-part upload`,
			// @ts-ignore
			file: gpxFilename,
			external_id: `${now.toISOString().split('.')[0]}`,
		});

		console.log("firstResp", firstResp);

		// @ts-ignore
		const { id: uploadId } = firstResp;

		console.log("Upload ID:", uploadId);

		let response: any = {}
		try {
			// @ts-ignore
			await strava.uploads._check({
				id: uploadId,
				access_token: process.env.TEMP_ACCESS_TOKEN
			}, function (err: any, res: any) {
				console.log("has error", err);
				response = res;
				console.log(err, res);

			});
		} catch (e) {
			logger.error("Error checking upload status", { error: e });
			//throw e;
		}
		let timeout = 0;
		console.log("response", response);
		while (!response?.activity_id && !response?.error && timeout < 120000) {
			console.log("Waiting for upload to complete...");
			timeout += 500;
			await new Promise(resolve => setTimeout(resolve, 500));
		}
		if (timeout >= 30000) {
			throw new Error("Timeout waiting for upload to complete");
		}

		console.log('Second part of upload complete');
	}
})();