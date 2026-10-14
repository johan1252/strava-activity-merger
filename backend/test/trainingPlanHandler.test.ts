const mockSend = jest.fn();
const mockCache = {
    listTrainingPlanItems: jest.fn(),
    getTrainingPlanItem: jest.fn(),
    deleteTrainingPlan: jest.fn(),
    startTrainingPlanGeneration: jest.fn(),
    failTrainingPlanGeneration: jest.fn(),
    setRunManualCompletions: jest.fn(),
    startTrainingPlanRevision: jest.fn(),
    getSyncMeta: jest.fn(),
    queryActivities: jest.fn(),
    incrementDailyUsage: jest.fn(),
    refundDailyUsage: jest.fn(),
};

jest.mock('@aws-sdk/client-lambda', () => ({
    LambdaClient: jest.fn(() => ({ send: mockSend })),
    InvokeCommand: jest.fn((input: unknown) => input),
}));
jest.mock('../lib/services/activityCache', () => mockCache);
jest.mock('../lib/utils/resolveAthlete', () => ({ resolveAthleteId: jest.fn().mockResolvedValue(42) }));

import type { APIGatewayProxyEvent } from 'aws-lambda';
import { handler } from '../lib/handlers/trainingPlan';

process.env.GENERATE_TRAINING_PLAN_FUNCTION_ARN = 'generate-arn';
process.env.REVISE_TRAINING_PLAN_FUNCTION_ARN = 'revise-arn';

function futureDate(days: number): string {
    return new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);
}

function event(httpMethod: string, resource: string, pathParameters: Record<string, string> | null = null, body?: unknown) {
    return {
        httpMethod,
        resource,
        pathParameters,
        headers: { Authorization: 'Bearer token' },
        body: body === undefined ? null : JSON.stringify(body),
    } as unknown as APIGatewayProxyEvent;
}

const planBody = () => ({ raceDistance: '10K', raceDate: futureDate(30), targetTimeSeconds: 3000 });
const storedItem = (overrides = {}) => ({
    status: 'complete',
    request: { raceDistance: '10K', raceDate: futureDate(30), targetTimeSeconds: 3000 },
    requestedAt: 1,
    ...overrides,
});

beforeEach(() => {
    jest.clearAllMocks();
    mockCache.getSyncMeta.mockResolvedValue({ fullSyncDone: true });
    mockCache.queryActivities.mockResolvedValue([]);
    mockCache.listTrainingPlanItems.mockResolvedValue([]);
    mockCache.getTrainingPlanItem.mockResolvedValue(null);
    mockCache.incrementDailyUsage.mockResolvedValue({ allowed: true, used: 1 });
});

describe('training plan routes', () => {
    it('lists plans with the plan limit', async () => {
        mockCache.listTrainingPlanItems.mockResolvedValue([{ id: 'a', item: storedItem() }, { id: 'main', item: storedItem() }]);

        const response = await handler(event('GET', '/training-plan'));
        const body = JSON.parse(response.body);

        expect(response.statusCode).toBe(200);
        expect(body.maxPlans).toBe(5);
        expect(body.plans.map((p: { id: string }) => p.id)).toEqual(['a', 'main']);
    });

    it('creates a plan with a new id and starts the worker', async () => {
        const response = await handler(event('POST', '/training-plan', null, planBody()));
        const body = JSON.parse(response.body);

        expect(response.statusCode).toBe(202);
        expect(mockCache.startTrainingPlanGeneration).toHaveBeenCalledWith(42, body.id, expect.objectContaining({ raceDistance: '10K' }));
        expect(mockSend).toHaveBeenCalledWith(expect.objectContaining({ FunctionName: 'generate-arn' }));
    });

    it('refuses a sixth plan', async () => {
        mockCache.listTrainingPlanItems.mockResolvedValue(Array.from({ length: 5 }, (_, i) => ({ id: `p${i}`, item: storedItem() })));

        const response = await handler(event('POST', '/training-plan', null, planBody()));

        expect(response.statusCode).toBe(409);
        expect(JSON.parse(response.body).code).toBe('plan_limit');
        expect(mockCache.startTrainingPlanGeneration).not.toHaveBeenCalled();
        expect(mockSend).not.toHaveBeenCalled();
    });

    it('returns 404 for a plan that does not exist', async () => {
        const response = await handler(event('GET', '/training-plan/{planId}', { planId: 'missing' }));

        expect(response.statusCode).toBe(404);
    });

    it('rejects a malformed plan id', async () => {
        const response = await handler(event('GET', '/training-plan/{planId}', { planId: 'a#b' }));

        expect(response.statusCode).toBe(400);
        expect(mockCache.getTrainingPlanItem).not.toHaveBeenCalled();
    });

    it("never sends the coach's working state to the client", async () => {
        mockCache.getTrainingPlanItem.mockResolvedValue(storedItem({
            plan: { weeks: [] },
            preferences: ['Swim on Tuesdays'],
            pendingGoalChange: { request: {}, at: 1 },
            chat: [{ role: 'user', content: 'hi', at: 1 }],
        }));

        const response = await handler(event('GET', '/training-plan/{planId}', { planId: 'abc' }));
        const { item } = JSON.parse(response.body);

        expect(item.chat).toHaveLength(1);
        expect(item).not.toHaveProperty('preferences');
        expect(item).not.toHaveProperty('pendingGoalChange');
    });

    it('regenerates an existing plan under its own id', async () => {
        mockCache.getTrainingPlanItem.mockResolvedValue(storedItem());

        const response = await handler(event('POST', '/training-plan/{planId}', { planId: 'abc' }, planBody()));

        expect(response.statusCode).toBe(202);
        expect(mockCache.startTrainingPlanGeneration).toHaveBeenCalledWith(42, 'abc', expect.anything());
    });

    it('does not regenerate a plan that does not exist', async () => {
        const response = await handler(event('POST', '/training-plan/{planId}', { planId: 'abc' }, planBody()));

        expect(response.statusCode).toBe(404);
        expect(mockCache.startTrainingPlanGeneration).not.toHaveBeenCalled();
    });

    it('deletes a plan', async () => {
        const response = await handler(event('DELETE', '/training-plan/{planId}', { planId: 'abc' }));

        expect(response.statusCode).toBe(200);
        expect(mockCache.deleteTrainingPlan).toHaveBeenCalledWith(42, 'abc');
    });

    it('sends a chat message to the plan it belongs to', async () => {
        mockCache.getTrainingPlanItem.mockResolvedValue(storedItem({ plan: { weeks: [] } }));
        mockCache.startTrainingPlanRevision.mockResolvedValue(true);

        const response = await handler(event('POST', '/training-plan/{planId}/chat', { planId: 'abc' }, { message: 'Add a swim' }));

        expect(response.statusCode).toBe(202);
        expect(mockCache.startTrainingPlanRevision).toHaveBeenCalledWith(42, 'abc', 'Add a swim');
        expect(mockSend).toHaveBeenCalledWith(expect.objectContaining({ FunctionName: 'revise-arn' }));
    });
});

describe('daily model limits', () => {
    const limitReached = () => mockCache.incrementDailyUsage.mockResolvedValue({ allowed: false, used: 50 });
    const chatEvent = () => event('POST', '/training-plan/{planId}/chat', { planId: 'abc' }, { message: 'Add a swim' });

    beforeEach(() => {
        mockCache.getTrainingPlanItem.mockResolvedValue(storedItem({ plan: { weeks: [] } }));
        mockCache.startTrainingPlanRevision.mockResolvedValue(true);
    });

    it("counts a chat message against the athlete's daily chat limit", async () => {
        await handler(chatEvent());

        expect(mockCache.incrementDailyUsage).toHaveBeenCalledWith(42, 'chat', new Date().toISOString().slice(0, 10), 50, expect.any(Number));
    });

    it('refuses a chat message once the daily limit is reached, without calling the model', async () => {
        limitReached();

        const response = await handler(chatEvent());

        expect(response.statusCode).toBe(429);
        expect(JSON.parse(response.body)).toEqual(expect.objectContaining({ code: 'daily_limit', message: expect.stringContaining('50 chat messages') }));
        expect(mockCache.startTrainingPlanRevision).not.toHaveBeenCalled();
        expect(mockSend).not.toHaveBeenCalled();
    });

    it('gives the unit back when a duplicate message is rejected', async () => {
        mockCache.startTrainingPlanRevision.mockResolvedValue(false);

        const response = await handler(chatEvent());

        expect(response.statusCode).toBe(409);
        expect(mockCache.refundDailyUsage).toHaveBeenCalledWith(42, 'chat', new Date().toISOString().slice(0, 10));
    });

    it('refuses a new plan once the daily build limit is reached', async () => {
        limitReached();

        const response = await handler(event('POST', '/training-plan', null, planBody()));

        expect(response.statusCode).toBe(429);
        expect(mockCache.incrementDailyUsage).toHaveBeenCalledWith(42, 'build', expect.any(String), 10, expect.any(Number));
        expect(mockCache.startTrainingPlanGeneration).not.toHaveBeenCalled();
        expect(mockSend).not.toHaveBeenCalled();
    });

    it('counts a rebuild of an existing plan as a build', async () => {
        limitReached();

        const response = await handler(event('POST', '/training-plan/{planId}', { planId: 'abc' }, planBody()));

        expect(response.statusCode).toBe(429);
        expect(mockCache.startTrainingPlanGeneration).not.toHaveBeenCalled();
    });

    it('does not count requests that fail validation', async () => {
        mockCache.getTrainingPlanItem.mockResolvedValue(storedItem());

        await handler(event('POST', '/training-plan/{planId}', { planId: 'abc' }, { raceDistance: 'nope' }));

        expect(mockCache.incrementDailyUsage).not.toHaveBeenCalled();
    });
});
