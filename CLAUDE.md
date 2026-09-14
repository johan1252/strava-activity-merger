# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Git

Do **not** include `Co-Authored-By` lines in commit messages.

## Commands

### Frontend (`/frontend`)
```bash
npm start              # dev server at localhost:3000
npm test               # run tests (watch mode)
npm run build          # production build
npm run deploy         # build + cdk deploy + CloudFront invalidation (production)
npm run deploy:staging # build + cdk deploy + CloudFront invalidation (staging)
```

### Backend (`/backend`)
```bash
npm run build          # tsc compile
npm test               # jest
npx cdk diff           # preview infra changes before deploying
npm run deploy         # build + deploy stack to AWS (production)
npm run deploy:staging # build + deploy stack to AWS (staging)
```

### Local backend testing (runners)
Runners import Lambda handlers directly with mock event payloads — no AWS needed.
```bash
cd backend
export TEMP_ACCESS_TOKEN=<stravaAccessToken>
npx tsx runners/combineActivities.ts
npx tsx runners/roundUp.ts
# etc. — see /backend/runners/ for all available runners
```

The backend `.env` file supplies `STRAVA_*` env vars for CDK and runners.

## Architecture

### Overview
Hosted at streventools.com. Single-page React app (Create React App) served from S3/CloudFront. All backend logic runs as individual AWS Lambda functions behind API Gateway, also fronted by CloudFront at `/api/*`. Everything is defined as code in a single CDK stack.

### CDK Stack (`backend/lib/cdk-access-token-api-stack.ts`)
The single source of truth for all infrastructure: Lambda functions, API Gateway routes, S3 buckets, DynamoDB table, CloudFront distribution, Route 53, and ACM certificate. All Lambda env vars and IAM permissions are granted here.

### Lambda Handlers (`backend/lib/handlers/`)
Each handler follows the same pattern: extract Bearer token from `Authorization` header → call `await strava.client(accessToken)` → do work → return `{ statusCode, body }`. Logging uses `@aws-lambda-powertools/logger` with `serviceName` set per handler.

| Handler | Route | Purpose |
|---------|-------|---------|
| `getAccessToken` | POST /api/access-token | Strava OAuth code exchange |
| `refreshToken` | POST /api/refresh-token | Token refresh |
| `getActivities` | GET /api/activities | Paginated activity list (DynamoDB cache) |
| `syncActivities` | (async, no route) | Background full-sync of all Strava activities |
| `combineActivities` | POST /api/activities/combine | Merge two activities into one GPX |
| `roundUp` | POST /api/activities/roundup | Extend distance to round number |
| `roundDown` | POST /api/activities/rounddown | Trim distance to round number |
| `stravaWebhook` | GET+POST /api/webhook/strava | Strava webhook validation + real-time event handling |

### Strava Auth Flow
OAuth tokens are stored in `localStorage` (`token` and `athlete` keys). `frontend/src/utils/api.ts` exports `fetchWithAuth`, which auto-refreshes the token if it expires within 5 minutes before every API call. The frontend never calls Strava directly — all Strava API calls go through the backend using the Bearer token passed in the `Authorization` header.

### DynamoDB Activity Cache (`StravaActivityCache`)
Activities are cached per athlete with three item types:
- **ACTIVITY**: `PK = ATHLETE#{athleteId}`, `SK = ACTIVITY#{start_date}#{activityId}`. Includes computed `pace_per_km` and GSI projection keys.
- **SYNC_META**: `PK = ATHLETE#{athleteId}`, `SK = SYNC_META`. Tracks `lastSyncStartedAt`, `lastSyncCompletedAt`, and `fullSyncDone`.
- **ACTIVITYLOOKUP**: `PK = ACTIVITYLOOKUP#{activityId}`, `SK = META`. Reverse index written alongside each activity so the webhook handler can resolve an `activityId` → full DynamoDB keys without knowing `start_date`.

Five GSIs enable efficient server-side filtering by sport type, distance range, and pace range. The cache service is in `backend/lib/services/activityCache.ts`.

**Cache flow**: On first visit (no `SYNC_META`), `getActivities` returns Strava page 1 directly, then atomically claims a sync slot and fires `syncActivities` asynchronously. On subsequent visits, it fetches only activities newer than `lastSyncCompletedAt` from Strava, upserts them, then serves from DynamoDB. A sync is considered stale if not completed within 30 minutes.

### GPX Generation (combine/roundUp/roundDown)
These handlers fetch activity streams from Strava (`time`, `distance`, `latlng`, `altitude`, `heartrate`, etc.), manipulate the data points, build a GPX file using `gpx-builder`, write it to Lambda's `/tmp`, upload to Strava as a two-part upload, then optionally back up to S3. The processed activities are tagged with an `external_id` prefix (`streven-cb-*`, `streven-ru-*`, `streven-rd-*`) to prevent re-processing in the UI.

### Frontend (`frontend/src/`)
- `App.tsx` — routing (`/`, `/strava-callback`, `/privacy-policy`, `/faq`, `/terms-of-service`), Strava OAuth handling, token/athlete state
- `components/ActivityList.tsx` — the main UI: activity cards, combine/round-up/round-down modals, sport type and distance filters
- `config.ts` — `STRAVA_CLIENT_ID` and `API_BASE_URL` (points to `streventools.com/api`)

For local frontend development against the real backend, `API_BASE_URL` in `config.ts` points to production. To test with a local backend, update that value or proxy requests.
