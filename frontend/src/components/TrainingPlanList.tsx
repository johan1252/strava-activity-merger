import React, { useCallback, useEffect, useState } from 'react';
import { fetchWithAuth } from '../utils/api';
import LoadingIndicator from './LoadingIndicator';
import { Banner, SYNC_STATUS_MESSAGE, SyncStatus, cardStyle, formatDuration, formatFullDate } from './trainingShared';

interface TrainingPlanSummary {
    id: string;
    status: 'generating' | 'complete' | 'failed';
    request: {
        raceDistance: string;
        raceDate: string;
        targetTimeSeconds: number;
    };
    isPast: boolean;
    hasPlan: boolean;
    totalWeeks: number;
    sessionsDone: number;
    sessionsTotal: number;
}

interface TrainingPlanListProps {
    onOpen: (planId: string) => void;
    onNew: () => void;
}

// Upcoming races first (soonest at the top), then past races (most recent first).
function sortPlans(plans: TrainingPlanSummary[]): TrainingPlanSummary[] {
    const byDate = (a: TrainingPlanSummary, b: TrainingPlanSummary) => a.request.raceDate.localeCompare(b.request.raceDate);
    const upcoming = plans.filter(p => !p.isPast).sort(byDate);
    const past = plans.filter(p => p.isPast).sort((a, b) => byDate(b, a));
    return [...upcoming, ...past];
}

const TrashIcon: React.FC = () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <polyline points="3 6 5 6 21 6" />
        <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
        <path d="M10 11v6" />
        <path d="M14 11v6" />
        <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
    </svg>
);

const StatusBadge: React.FC<{ plan: TrainingPlanSummary }> = ({ plan }) => {
    const label = plan.status === 'generating' ? 'Generating…'
        : plan.status === 'failed' ? 'Failed'
        : plan.isPast ? 'Race passed'
        : null;
    if (!label) return null;

    const failed = plan.status === 'failed';
    return (
        <span
            style={{
                fontSize: '0.75rem',
                fontWeight: 600,
                color: failed ? '#a33' : '#FC4C02',
                background: failed ? '#fdecea' : '#fff7f2',
                border: `1px solid ${failed ? '#f5c2c0' : '#ffd9c2'}`,
                borderRadius: '10px',
                padding: '2px 8px',
                whiteSpace: 'nowrap',
            }}
        >
            {label}
        </span>
    );
};

const TrainingPlanList: React.FC<TrainingPlanListProps> = ({ onOpen, onNew }) => {
    const [plans, setPlans] = useState<TrainingPlanSummary[]>([]);
    const [maxPlans, setMaxPlans] = useState(5);
    const [syncStatus, setSyncStatus] = useState<SyncStatus>('ready');
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const loadPlans = useCallback(async () => {
        try {
            const data = await fetchWithAuth('/training-plan');
            setPlans(data.plans ?? []);
            setMaxPlans(data.maxPlans ?? 5);
            setSyncStatus(data.syncStatus ?? 'ready');
        } catch (err) {
            console.error('Error fetching training plans:', err);
            setError('Could not load your training plans. Please try again.');
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        loadPlans();
    }, [loadPlans]);

    const anyGenerating = plans.some(p => p.status === 'generating');
    useEffect(() => {
        if (!anyGenerating) return;
        const interval = setInterval(loadPlans, 3000);
        return () => clearInterval(interval);
    }, [anyGenerating, loadPlans]);

    const deletePlan = async (plan: TrainingPlanSummary) => {
        const name = `${plan.request.raceDistance} on ${formatFullDate(plan.request.raceDate)}`;
        if (!window.confirm(`Delete your ${name} plan? This cannot be undone.`)) return;

        setError(null);
        try {
            await fetchWithAuth(`/training-plan/${plan.id}`, { method: 'DELETE' });
            setPlans(prev => prev.filter(p => p.id !== plan.id));
        } catch (err) {
            console.error('Error deleting training plan:', err);
            setError('Failed to delete the plan. Please try again.');
        }
    };

    if (isLoading) {
        return (
            <div style={{ maxWidth: '700px', margin: '0 auto' }}>
                <LoadingIndicator message="Loading your training plans..." />
            </div>
        );
    }

    const notSynced = syncStatus !== 'ready';
    const atLimit = plans.length >= maxPlans;
    const canAdd = !notSynced && !atLimit;

    return (
        <div style={{ maxWidth: '700px', margin: '0 auto', padding: '4px 16px 16px', textAlign: 'left' }}>
            {notSynced && <Banner>{SYNC_STATUS_MESSAGE[syncStatus as Exclude<SyncStatus, 'ready'>]}</Banner>}
            {error && <Banner tone="error">{error}</Banner>}

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
                <h2 style={{ margin: 0, fontSize: '1.2rem' }}>Training plans</h2>
                <button
                    type="button"
                    onClick={onNew}
                    disabled={!canAdd}
                    style={{
                        padding: '10px 16px',
                        borderRadius: '8px',
                        border: 'none',
                        background: canAdd ? '#FC4C02' : '#f0a878',
                        color: '#fff',
                        fontWeight: 700,
                        cursor: canAdd ? 'pointer' : 'default',
                    }}
                >
                    New training plan
                </button>
            </div>
            <div style={{ color: '#888', fontSize: '0.85rem', marginBottom: '16px' }}>
                {atLimit
                    ? `You have ${maxPlans} of ${maxPlans} plans. Delete one to add another.`
                    : `${plans.length} of ${maxPlans} plans`}
            </div>

            {plans.length === 0 && (
                <div style={{ ...cardStyle, color: '#666', textAlign: 'center' }}>
                    You don't have a training plan yet. Create one to get a week-by-week plan for your next race.
                </div>
            )}

            {sortPlans(plans).map(plan => (
                <div
                    key={plan.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => onOpen(plan.id)}
                    onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(plan.id); } }}
                    style={{ ...cardStyle, marginBottom: '10px', cursor: 'pointer', opacity: plan.isPast ? 0.75 : 1 }}
                >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontWeight: 700 }}>
                            {plan.request.raceDistance} — {formatFullDate(plan.request.raceDate)}
                        </span>
                        <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <StatusBadge plan={plan} />
                            <button
                                type="button"
                                aria-label={`Delete ${plan.request.raceDistance} plan`}
                                onClick={e => { e.stopPropagation(); deletePlan(plan); }}
                                onKeyDown={e => e.stopPropagation()}
                                title="Delete plan"
                                style={{ background: 'none', border: 'none', color: '#a33', cursor: 'pointer', padding: '4px', display: 'flex', alignItems: 'center' }}
                            >
                                <TrashIcon />
                            </button>
                        </span>
                    </div>
                    <div style={{ color: '#555', fontSize: '0.9rem', marginTop: '6px', display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
                        <span><strong style={{ color: '#333' }}>Target:</strong> {formatDuration(plan.request.targetTimeSeconds)}</span>
                        {plan.hasPlan && (
                            <>
                                <span>{plan.totalWeeks} weeks</span>
                                <span>{plan.sessionsDone}/{plan.sessionsTotal} sessions done</span>
                            </>
                        )}
                    </div>
                </div>
            ))}
        </div>
    );
};

export default TrainingPlanList;
