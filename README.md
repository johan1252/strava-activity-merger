# Strava Activity Merger (streventools.com)

Hosted version available at [streventools.com](https://streventools.com)

A tool that lets you:
- Combine multiple Strava activities into one
- Round up/down activity distances to nice numbers (like 5km, 10km, etc.)

## Quick Start

Visit [streventools.com](https://streventools.com) and authorize with your Strava account to use the hosted version.

## Development

### Prerequisites
- Node.js 22+ and npm
- AWS CDK CLI (`npm install -g aws-cdk`)
- AWS CLI configured with appropriate credentials
- A Strava API application (see [Strava API docs](https://developers.strava.com))

### Local Frontend Development

The recommended development workflow is to run the frontend locally against the **staging backend**. This avoids the Strava single-callback-domain limitation because Strava always permits `localhost` as a redirect URI — no domain swapping needed.

Create `frontend/.env.development` (gitignored) to point at staging:
```
REACT_APP_API_BASE_URL=https://staging.streventools.com/api
```

Then:
```bash
cd frontend
npm ci
npm start
```

The app will be available at http://localhost:3000, with API calls routed to `staging.streventools.com/api`.

### Running Backend Runners (Local Testing)

```bash
cd backend
npm ci

export TEMP_ACCESS_TOKEN=<stravaAccessToken>

# Test combining activities
npx tsx runners/combineActivities.ts
```

See [./backend/runners](./backend/runners) for all available runners.

### Backend Deployment
```bash
cd backend
npm ci

# Preview changes before deploying
npx cdk diff

# Deploy production stack
npx cdk deploy

# Deploy staging stack
npx cdk deploy -c stage=staging
```

### Frontend Deployment

The frontend CDK stack (`frontend/lib/frontend-stack.ts`) uploads the build to S3 and invalidates CloudFront automatically.

```bash
cd frontend
npm ci

# Deploy to production
npm run deploy

# Deploy to staging
npm run deploy:staging
```

The backend stack must be deployed before the frontend stack — the frontend stack imports S3 bucket and CloudFront distribution references from backend stack outputs.

### Staging Environment

Staging runs at [staging.streventools.com](https://staging.streventools.com) and uses separate AWS infrastructure (DynamoDB table, S3 buckets, Secrets Manager secret) but shares the same Strava API application as production.

To set up staging credentials, create `backend/.env.staging` and `frontend/.env.staging` with the same Strava credentials as production but with `STRAVA_REDIRECT_URI=https://staging.streventools.com/strava-callback` and `REACT_APP_API_BASE_URL=https://staging.streventools.com/api`.

> **Callback domain limitation:** Strava only permits one authorization callback domain per API application. To use OAuth on staging, temporarily update the callback domain to `staging.streventools.com` in the [Strava API settings](https://www.strava.com/settings/api), then switch it back to `streventools.com` when done.
>
> **Recommended alternative:** Run the frontend locally (`npm start`) against the staging backend instead of deploying to `staging.streventools.com`. Strava always permits `localhost` as a redirect URI, so no callback domain swap is needed.

### Webhook Setup

The Strava webhook subscription must be created once per environment after the backend is deployed. Strava only allows one active subscription per app.

**1. Get the verify token from Secrets Manager:**
```bash
# Production
VERIFY_TOKEN=$(aws secretsmanager get-secret-value \
  --secret-id strava-webhook-verify-token \
  --query SecretString --output text)

# Staging
VERIFY_TOKEN=$(aws secretsmanager get-secret-value \
  --secret-id strava-webhook-verify-token-staging \
  --query SecretString --output text)
```

**2. Check if a subscription already exists:**
```bash
curl -G https://www.strava.com/api/v3/push_subscriptions \
  -d client_id=<STRAVA_CLIENT_ID> \
  -d client_secret=<STRAVA_CLIENT_SECRET>
```

**3. Create the subscription:**
```bash
# Production
curl -X POST https://www.strava.com/api/v3/push_subscriptions \
  -F client_id=<STRAVA_CLIENT_ID> \
  -F client_secret=<STRAVA_CLIENT_SECRET> \
  -F callback_url=https://streventools.com/api/webhook/strava \
  -F verify_token=$VERIFY_TOKEN

# Staging
curl -X POST https://www.strava.com/api/v3/push_subscriptions \
  -F client_id=<STRAVA_CLIENT_ID> \
  -F client_secret=<STRAVA_CLIENT_SECRET> \
  -F callback_url=https://staging.streventools.com/api/webhook/strava \
  -F verify_token=$VERIFY_TOKEN
```

Strava calls `GET /api/webhook/strava` to validate the endpoint, then returns a `subscription_id` — keep this in case you need to delete the subscription later. Test events using `backend/runners/testWebhook.ts`.

## Architecture

The application uses:
- Frontend: React + TypeScript, served from S3 via CloudFront
- Backend: AWS Lambda + API Gateway, fronted by the same CloudFront distribution at `/api/*`
- Database: DynamoDB (`StravaActivityCache`) for caching Strava activities
- Storage: S3 for temporary GPX files
- CDK for Infrastructure as Code (two stacks: backend in `backend/`, frontend in `frontend/`)
- [strava-v3](https://github.com/node-strava/node-strava-v3) Node.js library for Strava API integration

## Strava API Approval

This application went through Strava's API approval process in September 2025. More information in [Strava Developers Documentation](https://developers.strava.com).

**Important constraints (as of June 2026):**
- Strava allows only one API application registration per user account.
- Users of this application must have an active paid Strava subscription — the API returns `Application Status: Inactive` for apps whose owner does not have a paid subscription.
- Only one authorization callback domain is permitted per application (see staging note above).

## Issues & Support

For bugs or feature requests:
1. Check existing [GitHub issues](https://github.com/johan1252/strava-activity-merger/issues)
2. Create a new issue with:
   - Clear description of the problem/request
   - Steps to reproduce (for bugs)
   - Expected vs actual behavior
   - Screenshots if relevant
   - Device/browser information

## License

Apache License 2.0

This license allows you to:
- Use this software commercially
- Modify the source code
- Distribute copies of the original or modified code
- Use the code in private or public projects
- Receive patent rights and protection

Key requirements:
- Include the original copyright notice and license in any copy
- Document and state significant changes made to the code
- Include notice of any modified files
- Retain all notices about patents, trademarks, and other rights

See the [full Apache License 2.0 text](https://www.apache.org/licenses/LICENSE-2.0) for more details.
