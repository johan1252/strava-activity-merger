const mockStrava = {
    config: jest.fn(),
    oauth: {
        refreshToken: jest.fn(),
        getToken: jest.fn(),
    },
};

jest.mock('strava-v3', () => ({ __esModule: true, default: mockStrava }));
jest.mock('../lib/utils/resolveAthlete', () => ({ resolveAthleteId: jest.fn().mockResolvedValue(7) }));
jest.mock('../lib/services/athleteToken', () => ({ saveAthleteTokens: jest.fn().mockResolvedValue(undefined) }));

import type { APIGatewayProxyEvent } from 'aws-lambda';
import { handler as refreshTokenHandler } from '../lib/handlers/refreshToken';
import { handler as getAccessTokenHandler } from '../lib/handlers/getAccessToken';

const SECRET_ACCESS = 'secret-access-token-value';
const SECRET_REFRESH = 'secret-refresh-token-value';

const stravaTokens = {
    access_token: SECRET_ACCESS,
    refresh_token: SECRET_REFRESH,
    expires_at: 1900000000,
    expires_in: 21600,
    token_type: 'Bearer',
};

function event(body: unknown) {
    return { body: JSON.stringify(body) } as unknown as APIGatewayProxyEvent;
}

describe('OAuth handlers keep tokens and profile details out of the logs', () => {
    let output: string;

    beforeEach(() => {
        process.env.STRAVA_CLIENT_ID = 'client-id';
        process.env.STRAVA_CLIENT_SECRET = 'client-secret';
        process.env.STRAVA_REDIRECT_URI = 'https://example.test/callback';
        process.env.STRAVA_ACCESS_TOKEN = 'app-access-token';
        process.env.STRAVA_REFRESH_TOKEN = 'app-refresh-token';

        mockStrava.oauth.refreshToken.mockResolvedValue(stravaTokens);
        mockStrava.oauth.getToken.mockResolvedValue({ ...stravaTokens, athlete: { id: 7, firstname: 'Jane', lastname: 'Runner', profile: 'https://example.test/jane.png' } });

        output = '';
        const capture = (chunk: unknown) => { output += String(chunk); return true; };
        jest.spyOn(process.stdout, 'write').mockImplementation(capture as typeof process.stdout.write);
        jest.spyOn(console, 'log').mockImplementation((...args: unknown[]) => { output += args.map(a => (typeof a === 'string' ? a : JSON.stringify(a))).join(' '); });
        jest.spyOn(console, 'info').mockImplementation((...args: unknown[]) => { output += args.map(a => (typeof a === 'string' ? a : JSON.stringify(a))).join(' '); });
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    it('does not log the tokens when a token is refreshed, but still returns them to the app', async () => {
        const response = await refreshTokenHandler(event({ refreshToken: 'old-refresh-token' }));

        expect(response.statusCode).toBe(200);
        expect(JSON.parse(response.body).accessToken).toBe(SECRET_ACCESS);
        expect(output).toContain('Token refreshed');
        expect(output).not.toContain(SECRET_ACCESS);
        expect(output).not.toContain(SECRET_REFRESH);
    });

    it('does not log the tokens or the athlete profile when a code is exchanged', async () => {
        const response = await getAccessTokenHandler(event({ authorizationCode: 'code' }));

        expect(response.statusCode).toBe(200);
        expect(output).toContain('Authorization code exchanged');
        expect(output).not.toContain(SECRET_ACCESS);
        expect(output).not.toContain(SECRET_REFRESH);
        expect(output).not.toContain('Jane');
        expect(output).not.toContain('jane.png');
    });
});
