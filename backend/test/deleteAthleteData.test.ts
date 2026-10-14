const mockS3Send = jest.fn();
const mockStrava = { client: jest.fn(), athlete: { get: jest.fn() } };
const mockDeleteItems = jest.fn();
const mockGetValidAccessToken = jest.fn();

jest.mock('@aws-sdk/client-s3', () => ({
    S3Client: jest.fn(() => ({ send: mockS3Send })),
    ListObjectsV2Command: jest.fn((input: object) => ({ kind: 'list', ...input })),
    DeleteObjectsCommand: jest.fn((input: object) => ({ kind: 'delete', ...input })),
}));
jest.mock('strava-v3', () => ({ __esModule: true, default: mockStrava }));
jest.mock('../lib/services/activityCache', () => ({ deleteAthleteItems: mockDeleteItems }));
jest.mock('../lib/services/athleteToken', () => ({ getValidAccessToken: mockGetValidAccessToken }));

import { handler } from '../lib/handlers/deleteAthleteData';

process.env.STREVEN_TMP_BUCKET_NAME = 'tmp-bucket';

const stravaError = (statusCode: number) => Object.assign(new Error(`Strava ${statusCode}`), { statusCode });

beforeEach(() => {
    jest.clearAllMocks();
    mockGetValidAccessToken.mockResolvedValue('access-token');
    mockStrava.athlete.get.mockResolvedValue({ id: 42 });
    mockDeleteItems.mockResolvedValue(10);
    mockS3Send.mockImplementation(async (command: { kind: string }) => command.kind === 'list'
        ? { Contents: [{ Key: 'Jane-42/2026/a.gpx' }, { Key: 'Bob-420/2026/b.gpx' }, { Key: 'Cy-142/2026/c.gpx' }, { Key: 'Dee-42/2026/d.gpx' }] }
        : {});
});

const deletedKeys = () => mockS3Send.mock.calls
    .map(([command]) => command)
    .filter((command: { kind: string }) => command.kind === 'delete')
    .flatMap((command: { Delete: { Objects: { Key: string }[] } }) => command.Delete.Objects.map(o => o.Key));

describe('deleteAthleteData', () => {
    it('does nothing when Strava still accepts the athlete\'s token (a forged event)', async () => {
        await handler({ athleteId: 42 });

        expect(mockDeleteItems).not.toHaveBeenCalled();
        expect(mockS3Send).not.toHaveBeenCalled();
    });

    it('deletes everything, and only this athlete\'s file backups, when Strava rejects the token', async () => {
        mockStrava.athlete.get.mockRejectedValue(stravaError(401));

        await handler({ athleteId: 42 });

        expect(mockDeleteItems).toHaveBeenCalledWith(42, false);
        expect(deletedKeys()).toEqual(['Jane-42/2026/a.gpx', 'Dee-42/2026/d.gpx']);
    });

    it('treats a failed token refresh as a revocation', async () => {
        mockGetValidAccessToken.mockRejectedValue(stravaError(400));

        await handler({ athleteId: 42 });

        expect(mockDeleteItems).toHaveBeenCalledWith(42, false);
    });

    it('deletes only rebuildable data when there is no stored token to check', async () => {
        mockGetValidAccessToken.mockResolvedValue(null);

        await handler({ athleteId: 42 });

        expect(mockDeleteItems).toHaveBeenCalledWith(42, true);
        expect(mockS3Send).not.toHaveBeenCalled();
    });

    it('throws, so the invocation is retried, on errors that are not a revocation', async () => {
        mockStrava.athlete.get.mockRejectedValue(stravaError(500));

        await expect(handler({ athleteId: 42 })).rejects.toThrow('Strava 500');
        expect(mockDeleteItems).not.toHaveBeenCalled();
    });
});
