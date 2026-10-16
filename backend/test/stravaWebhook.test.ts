const mockSend = jest.fn();

jest.mock('@aws-sdk/client-lambda', () => ({
    LambdaClient: jest.fn(() => ({ send: mockSend })),
    InvokeCommand: jest.fn((input: unknown) => input),
}));
jest.mock('../lib/services/activityCache', () => ({
    getLookupItem: jest.fn(),
    getActivityItem: jest.fn(),
    updateActivityItem: jest.fn(),
    deleteActivityItem: jest.fn(),
}));

import type { APIGatewayProxyEvent } from 'aws-lambda';
import { handler } from '../lib/handlers/stravaWebhook';

process.env.UPSERT_ACTIVITY_FUNCTION_ARN = 'upsert-arn';
process.env.DELETE_ATHLETE_DATA_FUNCTION_ARN = 'delete-arn';

function post(payload: Record<string, unknown>) {
    return { httpMethod: 'POST', body: JSON.stringify(payload) } as unknown as APIGatewayProxyEvent;
}

const deauthorization = { object_type: 'athlete', object_id: 42, owner_id: 42, aspect_type: 'update', updates: { authorized: 'false' } };

beforeEach(() => {
    jest.clearAllMocks();
    mockSend.mockResolvedValue({});
});

describe('Strava webhook athlete events', () => {
    it('queues data deletion when an athlete revokes access', async () => {
        const response = await handler(post(deauthorization));

        expect(response.statusCode).toBe(200);
        expect(mockSend).toHaveBeenCalledTimes(1);
        expect(mockSend).toHaveBeenCalledWith(expect.objectContaining({
            FunctionName: 'delete-arn',
            InvocationType: 'Event',
            Payload: Buffer.from(JSON.stringify({ athleteId: 42 })),
        }));
    });

    it('answers an error when the deletion cannot be queued, so Strava sends the event again', async () => {
        mockSend.mockRejectedValue(new Error('throttled'));

        const response = await handler(post(deauthorization));

        expect(response.statusCode).toBe(500);
    });

    it('ignores other athlete updates', async () => {
        const response = await handler(post({ ...deauthorization, updates: { authorized: 'true' } }));
        const noUpdates = await handler(post({ ...deauthorization, updates: undefined }));

        expect(response.statusCode).toBe(200);
        expect(noUpdates.statusCode).toBe(200);
        expect(mockSend).not.toHaveBeenCalled();
    });

    it('still queues an upsert for a new activity', async () => {
        const response = await handler(post({ object_type: 'activity', object_id: 99, owner_id: 42, aspect_type: 'create' }));

        expect(response.statusCode).toBe(200);
        expect(mockSend).toHaveBeenCalledWith(expect.objectContaining({ FunctionName: 'upsert-arn' }));
    });
});
