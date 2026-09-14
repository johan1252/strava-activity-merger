/**
 * Manually trigger a full activity sync for an athlete by invoking the
 * deployed syncActivities Lambda directly. Useful for backfilling newly
 * added cache fields, or recovering from a stuck/stale sync, since a full
 * sync never re-triggers automatically once fullSyncDone is true.
 *
 * Usage:
 *   ATHLETE_ID=<id> ACCESS_TOKEN=<token> FUNCTION_NAME=<lambda-name> npx tsx runners/triggerFullSync.ts
 *
 * Find FUNCTION_NAME with:
 *   aws lambda list-functions --query "Functions[?contains(FunctionName, 'SyncActivities')].FunctionName" --output text
 *
 * ACCESS_TOKEN can be grabbed from the browser console while logged into the
 * app: JSON.parse(localStorage.getItem('token')).accessToken
 */

import { LambdaClient, InvokeCommand } from '@aws-sdk/client-lambda';

const ATHLETE_ID = parseInt(process.env.ATHLETE_ID ?? '0');
const ACCESS_TOKEN = process.env.ACCESS_TOKEN;
const FUNCTION_NAME = process.env.FUNCTION_NAME;

if (!ATHLETE_ID || !ACCESS_TOKEN || !FUNCTION_NAME) {
    console.error('Error: ATHLETE_ID, ACCESS_TOKEN, and FUNCTION_NAME env vars are required.\n');
    console.error('Example:');
    console.error('  ATHLETE_ID=12345 ACCESS_TOKEN=abc123 FUNCTION_NAME=CdkAccessTokenApiStack-SyncActivitiesHandler... \\');
    console.error('    npx tsx runners/triggerFullSync.ts\n');
    console.error('Find FUNCTION_NAME with:');
    console.error(`  aws lambda list-functions --query "Functions[?contains(FunctionName, 'SyncActivities')].FunctionName" --output text`);
    process.exit(1);
}

const client = new LambdaClient({});

(async () => {
    console.log(`Invoking ${FUNCTION_NAME} for athlete ${ATHLETE_ID}...`);
    console.log('This runs synchronously and may take a while for athletes with many activities (Lambda timeout: 15 minutes).\n');

    const response = await client.send(new InvokeCommand({
        FunctionName: FUNCTION_NAME,
        InvocationType: 'RequestResponse',
        Payload: Buffer.from(JSON.stringify({ athleteId: ATHLETE_ID, accessToken: ACCESS_TOKEN })),
    }));

    if (response.FunctionError) {
        console.error(`Lambda returned an error: ${response.FunctionError}`);
        if (response.Payload) {
            console.error(Buffer.from(response.Payload).toString());
        }
        process.exit(1);
    }

    console.log('Sync completed successfully.');
    if (response.Payload) {
        const payloadStr = Buffer.from(response.Payload).toString();
        if (payloadStr && payloadStr !== 'null') {
            console.log('Response:', payloadStr);
        }
    }
})();
