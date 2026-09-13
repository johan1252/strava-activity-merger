/**
 * Test script for Strava webhook handler.
 * Sends mock webhook events directly to the deployed endpoint.
 *
 * Usage:
 *   ACTIVITY_ID=<id> ATHLETE_ID=<id> npx tsx runners/testWebhook.ts
 *
 * Optional env vars:
 *   WEBHOOK_URL  - defaults to https://staging.streventools.com/api/webhook/strava
 *   EVENT        - one of: update-title, update-type, update-visibility, delete, all (default: all)
 */

const WEBHOOK_URL = process.env.WEBHOOK_URL ?? 'https://staging.streventools.com/api/webhook/strava';
const ACTIVITY_ID = parseInt(process.env.ACTIVITY_ID ?? '0');
const ATHLETE_ID = parseInt(process.env.ATHLETE_ID ?? '0');
const EVENT = process.env.EVENT ?? 'all';

if (!ACTIVITY_ID || !ATHLETE_ID) {
    console.error('Error: ACTIVITY_ID and ATHLETE_ID env vars are required.');
    console.error('Example: ACTIVITY_ID=12345 ATHLETE_ID=67890 npx tsx runners/testWebhook.ts');
    process.exit(1);
}

async function sendEvent(label: string, payload: object): Promise<void> {
    console.log(`\n--- ${label} ---`);
    console.log('Payload:', JSON.stringify(payload, null, 2));

    const res = await fetch(WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
    });

    const text = await res.text();
    console.log(`Status: ${res.status}`);
    console.log(`Response: ${text}`);
}

const base = { object_type: 'activity', object_id: ACTIVITY_ID, owner_id: ATHLETE_ID };

const events: Record<string, () => Promise<void>> = {
    'update-title': () => sendEvent(
        'Update title',
        { ...base, aspect_type: 'update', updates: { title: `Renamed via webhook test ${Date.now()}` } },
    ),
    'update-type': () => sendEvent(
        'Update sport type → Ride',
        { ...base, aspect_type: 'update', updates: { type: 'Ride' } },
    ),
    'update-visibility': () => sendEvent(
        'Update visibility → private',
        { ...base, aspect_type: 'update', updates: { private: true } },
    ),
    'delete': () => sendEvent(
        'Delete activity',
        { ...base, aspect_type: 'delete' },
    ),
};

(async () => {
    console.log(`Webhook URL: ${WEBHOOK_URL}`);
    console.log(`Activity ID: ${ACTIVITY_ID}  Athlete ID: ${ATHLETE_ID}`);

    if (EVENT === 'all') {
        for (const [, fn] of Object.entries(events).filter(([key]) => key !== 'delete')) {
            await fn();
        }
    } else if (events[EVENT]) {
        await events[EVENT]();
    } else {
        console.error(`Unknown EVENT "${EVENT}". Valid options: ${Object.keys(events).join(', ')}, all`);
        process.exit(1);
    }
})();
