// Fails the staging deploy when .env.staging is missing a value. Without it the build
// silently falls back to the production API URL in src/config.ts.
const fs = require('fs');

const FILE = '.env.staging';
const REQUIRED = ['REACT_APP_STRAVA_CLIENT_ID', 'REACT_APP_API_BASE_URL'];

const values = {};
if (fs.existsSync(FILE)) {
    for (const line of fs.readFileSync(FILE, 'utf8').split('\n')) {
        const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
        if (match) values[match[1]] = match[2];
    }
}

const missing = REQUIRED.filter(name => !values[name]);
if (missing.length > 0) {
    console.error(`Staging deploy blocked: ${missing.join(', ')} not set in frontend/${FILE}.`);
    process.exit(1);
}
