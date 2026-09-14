# Backend

AWS Lambda + API Gateway backend, deployed via AWS CDK.

## Commands

```bash
npm run build       # compile TypeScript
npm run watch       # watch mode
npm test            # jest unit tests
npx cdk diff        # preview infra changes
npm run deploy          # deploy production stack
npm run deploy:staging  # deploy staging stack
npx cdk synth       # emit CloudFormation template
```

## Runners

Use the scripts in `/runners` to invoke Lambda handlers directly for local development and debugging — no AWS deployment needed.

```bash
export TEMP_ACCESS_TOKEN=<stravaAccessToken>
npx tsx runners/roundUp.ts
npx tsx runners/combineActivities.ts
```

## Environment Variables

Copy `.env.example` or create `.env` with:
```
STRAVA_CLIENT_ID=
STRAVA_CLIENT_SECRET=
STRAVA_ACCESS_TOKEN=
STRAVA_REFRESH_TOKEN=
STRAVA_REDIRECT_URI=
```

For staging, create `.env.staging` with the same keys and `STRAVA_REDIRECT_URI=https://staging.streventools.com/strava-callback`. The deploy command loads the stage-specific file automatically.
