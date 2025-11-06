# Strava Activity Merger (streventools.com)

Hosted version available at [streventools.com](https://streventools.com)

A tool that lets you:
- Combine multiple Strava activities into one
- Round up/down activity distances to nice numbers (like 5km, 10km, etc.)

## Quick Start

Visit [streventools.com](https://streventools.com) and authorize with your Strava account to use the hosted version.

## Development

### Prerequisites
- Node.js 18+ and npm
- AWS CDK CLI (`npm install -g aws-cdk`)
- AWS CLI configured with appropriate credentials
- A Strava API application (see [Strava API docs](https://developers.strava.com))

### Local Frontend Development
```bash
cd frontend
npm ci
npm start
```
The app will be available at http://localhost:3000

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

# Deploy the stack
cdk deploy
```

### Frontend Deployment
```bash
cd frontend
npm ci

# l
npm run deploy
```

## Architecture

The application uses:
- Frontend: React + TypeScript
- Backend: AWS Lambda + API Gateway
- Storage: S3 for temporary GPX files
- CDK for Infrastructure as Code
- [strava-v3](https://github.com/node-strava/node-strava-v3) Node.js library for Strava API integration

## Strava API Approval

This application went through Strava's API approval process in September 2025. More information in [Strava Developers Documentation](https://developers.strava.com).

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
