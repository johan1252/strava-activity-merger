import React, { useCallback, useEffect, useState } from 'react';
import { fetchWithAuth } from '../utils/api';
import LoadingIndicator from './LoadingIndicator';

type RaceDistance = '5K' | '10K' | 'Half Marathon' | 'Marathon';

const RACE_DISTANCES: RaceDistance[] = ['5K', '10K', 'Half Marathon', 'Marathon'];
const MAX_WEEKS_OUT = 52;

interface TrainingPlanRequest {
    raceDistance: RaceDistance;
    raceDate: string;
    targetTimeSeconds?: number;
}

interface TrainingPlanWeek {
    weekNumber: number;
    totalDistanceKm: number;
    longRunKm: number;
    focus: 'Base' | 'Build' | 'Peak' | 'Taper' | 'Race Week';
    description: string;
}

interface TrainingPlan {
    weeks: TrainingPlanWeek[];
    realismScore: number;
    realismRationale: string;
    difficultyScore: number;
    difficultyRationale: string;
}

interface TrainingPlanItem {
    status: 'generating' | 'complete' | 'failed';
    request: TrainingPlanRequest;
    requestedAt: number;
    plan?: TrainingPlan;
    generatedAt?: number;
    errorMessage?: string;
    isPast?: boolean;
}

function formatDuration(totalSeconds: number): string {
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = Math.round(totalSeconds % 60);
    const mm = hours > 0 ? String(minutes).padStart(2, '0') : String(minutes);
    const ss = String(seconds).padStart(2, '0');
    return hours > 0 ? `${hours}:${mm}:${ss}` : `${mm}:${ss}`;
}

// Accepts "mm:ss" or "hh:mm:ss". Returns undefined for an empty string (no target
// time given), or throws if the text is non-empty but not a valid duration.
function parseTargetTime(input: string): number | undefined {
    const trimmed = input.trim();
    if (!trimmed) return undefined;
    const parts = trimmed.split(':');
    if (parts.length < 2 || parts.length > 3 || parts.some(p => !/^\d{1,2}$/.test(p))) {
        throw new Error('Target time must be in mm:ss or hh:mm:ss format');
    }
    return parts.map(Number).reduce((seconds, n) => seconds * 60 + n, 0);
}

function tomorrowDateString(): string {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return d.toISOString().slice(0, 10);
}

function maxDateString(): string {
    const d = new Date();
    d.setDate(d.getDate() + MAX_WEEKS_OUT * 7);
    return d.toISOString().slice(0, 10);
}

function addDays(dateStr: string, days: number): string {
    const d = new Date(`${dateStr}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString().slice(0, 10);
}

function mondayOf(dateStr: string): string {
    const d = new Date(`${dateStr}T00:00:00Z`);
    const day = d.getUTCDay(); // 0 = Sunday
    const diffToMonday = day === 0 ? 6 : day - 1;
    return addDays(dateStr, -diffToMonday);
}

// The plan's last week is the one containing race day — count backward in 7-day
// increments from that week's Monday to find where any earlier week starts.
function weekStartDate(raceDate: string, totalWeeks: number, weekNumber: number): string {
    return addDays(mondayOf(raceDate), -7 * (totalWeeks - weekNumber));
}

function formatWeekRange(startDateStr: string): string {
    const endDateStr = addDays(startDateStr, 6);
    const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', timeZone: 'UTC' };
    const start = new Date(`${startDateStr}T00:00:00Z`).toLocaleDateString(undefined, opts);
    const end = new Date(`${endDateStr}T00:00:00Z`).toLocaleDateString(undefined, opts);
    return `${start} – ${end}`;
}

const cardStyle: React.CSSProperties = {
    background: '#fff',
    borderRadius: '10px',
    padding: '16px',
    marginBottom: '16px',
    boxShadow: '0 2px 8px rgba(0,0,0,0.07)',
};

// Semicircular gauge — angle measured clockwise from the top (0°), so -90°/+90°
// land on the left/right ends and the arc sweeps over the top, dome-shaped.
const GAUGE_SIZE = 140;
const GAUGE_STROKE = 14;
const GAUGE_RADIUS = (GAUGE_SIZE - GAUGE_STROKE) / 2;
const GAUGE_CENTER = GAUGE_SIZE / 2;

function gaugePoint(angleDeg: number): { x: number; y: number } {
    const angleRad = ((angleDeg - 90) * Math.PI) / 180;
    return {
        x: GAUGE_CENTER + GAUGE_RADIUS * Math.cos(angleRad),
        y: GAUGE_CENTER + GAUGE_RADIUS * Math.sin(angleRad),
    };
}

function gaugeArcPath(startAngle: number, endAngle: number): string {
    const start = gaugePoint(endAngle);
    const end = gaugePoint(startAngle);
    const largeArcFlag = endAngle - startAngle <= 180 ? 0 : 1;
    return `M ${start.x} ${start.y} A ${GAUGE_RADIUS} ${GAUGE_RADIUS} 0 ${largeArcFlag} 0 ${end.x} ${end.y}`;
}

// Four equal 0-100 bands, lowest to highest score.
type GaugeScale = [string, string, string, string];

function scoreToWord(score: number, scale: GaugeScale): string {
    const clamped = Math.max(0, Math.min(100, score));
    return scale[Math.min(3, Math.floor(clamped / 25))];
}

const ScoreCard: React.FC<{ label: string; score: number; rationale: string; scale: GaugeScale }> = ({ label, score, rationale, scale }) => {
    const clamped = Math.max(0, Math.min(100, score));
    const scoreAngle = -90 + (clamped / 100) * 180;
    const viewHeight = GAUGE_CENTER + GAUGE_STROKE / 2;

    return (
        <div style={{ ...cardStyle, flex: '1 1 220px', textAlign: 'center' }}>
            <div style={{ fontSize: '0.8rem', color: '#888', fontWeight: 600, marginBottom: '4px' }}>{label}</div>
            <svg width={GAUGE_SIZE} height={viewHeight} viewBox={`0 0 ${GAUGE_SIZE} ${viewHeight}`}>
                <path d={gaugeArcPath(-90, 90)} fill="none" stroke="#f0f0f0" strokeWidth={GAUGE_STROKE} strokeLinecap="round" />
                <path d={gaugeArcPath(-90, scoreAngle)} fill="none" stroke="#FC4C02" strokeWidth={GAUGE_STROKE} strokeLinecap="round" />
                <text x={GAUGE_CENTER} y={GAUGE_CENTER - 4} textAnchor="middle" fontSize="14" fontWeight="700" fill="#FC4C02">
                    {scoreToWord(clamped, scale)}
                </text>
            </svg>
            <div style={{ color: '#555', fontSize: '0.85rem', marginTop: '2px' }}>{rationale}</div>
        </div>
    );
};

const WeekCard: React.FC<{ week: TrainingPlanWeek; dateRange: string }> = ({ week, dateRange }) => (
    <div style={{ ...cardStyle, marginBottom: '10px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
            <span>
                <span style={{ fontWeight: 700 }}>Week {week.weekNumber}</span>
                <span style={{ color: '#888', fontSize: '0.85rem', marginLeft: '8px' }}>{dateRange}</span>
            </span>
            <span
                style={{
                    fontSize: '0.75rem',
                    fontWeight: 600,
                    color: '#FC4C02',
                    background: '#fff7f2',
                    border: '1px solid #ffd9c2',
                    borderRadius: '10px',
                    padding: '2px 8px',
                }}
            >
                {week.focus}
            </span>
        </div>
        <div style={{ display: 'flex', gap: '16px', color: '#555', fontSize: '0.9rem', marginBottom: '6px' }}>
            <span>{week.totalDistanceKm.toFixed(0)} km total</span>
            <span>{week.longRunKm.toFixed(0)} km long run</span>
        </div>
        <p style={{ margin: 0, color: '#333', fontSize: '0.9rem', lineHeight: 1.4 }}>{week.description}</p>
    </div>
);

type SyncStatus = 'ready' | 'in_progress' | 'not_started';

const SYNC_STATUS_MESSAGE: Record<Exclude<SyncStatus, 'ready'>, string> = {
    in_progress: "We're still importing your Strava history — check back in a few minutes to set a race goal.",
    not_started: 'Visit the Activities tab to start importing your Strava history, then come back here to set a race goal.',
};

const Banner: React.FC<{ children: React.ReactNode; tone?: 'info' | 'error' }> = ({ children, tone = 'info' }) => (
    <div
        style={{
            ...cardStyle,
            background: tone === 'error' ? '#fdecea' : '#fff7f2',
            border: `1px solid ${tone === 'error' ? '#f5c2c0' : '#ffd9c2'}`,
            color: tone === 'error' ? '#a33' : '#555',
            fontSize: '0.9rem',
        }}
    >
        {children}
    </div>
);

const Training: React.FC<{ athlete: any }> = () => {
    const [item, setItem] = useState<TrainingPlanItem | null>(null);
    const [syncStatus, setSyncStatus] = useState<SyncStatus>('ready');
    const [isLoadingInitial, setIsLoadingInitial] = useState(true);
    const [showForm, setShowForm] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [submitError, setSubmitError] = useState<string | null>(null);

    const [raceDistance, setRaceDistance] = useState<RaceDistance>('10K');
    const [raceDate, setRaceDate] = useState('');
    const [targetTimeInput, setTargetTimeInput] = useState('');

    const loadPlan = useCallback(async () => {
        try {
            const data = await fetchWithAuth('/training-plan');
            setItem(data.item);
            setSyncStatus(data.syncStatus ?? 'ready');
        } catch (err) {
            console.error('Error fetching training plan:', err);
        } finally {
            setIsLoadingInitial(false);
        }
    }, []);

    useEffect(() => {
        loadPlan();
    }, [loadPlan]);

    // Poll while a generation is in progress; stop as soon as the status changes.
    useEffect(() => {
        if (item?.status !== 'generating') return;
        const interval = setInterval(loadPlan, 3000);
        return () => clearInterval(interval);
    }, [item?.status, loadPlan]);

    const openForm = (prefill?: TrainingPlanRequest) => {
        if (prefill) {
            setRaceDistance(prefill.raceDistance);
            setRaceDate(prefill.raceDate);
            setTargetTimeInput(prefill.targetTimeSeconds ? formatDuration(prefill.targetTimeSeconds) : '');
        }
        setSubmitError(null);
        setShowForm(true);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setSubmitError(null);

        if (!raceDate) {
            setSubmitError('Please choose a race date.');
            return;
        }

        let targetTimeSeconds: number | undefined;
        try {
            targetTimeSeconds = parseTargetTime(targetTimeInput);
        } catch (err) {
            setSubmitError((err as Error).message);
            return;
        }

        setIsSubmitting(true);
        try {
            const data = await fetchWithAuth('/training-plan', {
                method: 'POST',
                body: JSON.stringify({ raceDistance, raceDate, targetTimeSeconds }),
            });
            if (data.status === 'not_synced') {
                setSyncStatus(data.syncStatus ?? 'in_progress');
                setSubmitError(null);
                return;
            }
            setShowForm(false);
            await loadPlan();
        } catch (err) {
            console.error('Error starting training plan generation:', err);
            setSubmitError('Failed to start generating your plan. Please try again.');
        } finally {
            setIsSubmitting(false);
        }
    };

    if (isLoadingInitial) {
        return <LoadingIndicator message="Loading your training plan..." />;
    }

    const hasPlan = !!item?.plan;
    const isGenerating = item?.status === 'generating';
    const isFailed = item?.status === 'failed';

    if (isGenerating && !hasPlan) {
        return <LoadingIndicator message="Designing your training plan... this can take up to a minute." />;
    }

    const notSynced = syncStatus !== 'ready';
    const displayForm = !notSynced && (showForm || (!hasPlan && !isGenerating));

    return (
        <div style={{ maxWidth: '700px', margin: '0 auto', padding: '16px', textAlign: 'left' }}>
            {notSynced && <Banner>{SYNC_STATUS_MESSAGE[syncStatus as Exclude<SyncStatus, 'ready'>]}</Banner>}
            {isGenerating && hasPlan && <Banner>Updating your plan with your new goal...</Banner>}
            {isFailed && (
                <Banner tone="error">
                    {item?.errorMessage || 'Something went wrong generating your plan.'}
                </Banner>
            )}
            {!displayForm && item?.isPast && (
                <Banner>This race date has already passed — set a new goal when you're ready.</Banner>
            )}

            {displayForm ? (
                <form onSubmit={handleSubmit} style={cardStyle}>
                    <h3 style={{ margin: '0 0 12px', fontSize: '1.1rem' }}>Set a race goal</h3>

                    <div style={{ marginBottom: '14px' }}>
                        <label style={{ display: 'block', fontSize: '0.85rem', color: '#888', fontWeight: 600, marginBottom: '6px' }}>
                            Race distance
                        </label>
                        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                            {RACE_DISTANCES.map(d => (
                                <button
                                    key={d}
                                    type="button"
                                    onClick={() => setRaceDistance(d)}
                                    style={{
                                        padding: '6px 14px',
                                        borderRadius: '20px',
                                        border: raceDistance === d ? '2px solid #FC4C02' : '1px solid #ddd',
                                        background: raceDistance === d ? '#FC4C02' : '#fff',
                                        color: raceDistance === d ? '#fff' : '#333',
                                        fontWeight: 600,
                                        fontSize: '0.85rem',
                                        cursor: 'pointer',
                                    }}
                                >
                                    {d}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div style={{ marginBottom: '14px' }}>
                        <label style={{ display: 'block', fontSize: '0.85rem', color: '#888', fontWeight: 600, marginBottom: '6px' }}>
                            Race date
                        </label>
                        <input
                            type="date"
                            value={raceDate}
                            min={tomorrowDateString()}
                            max={maxDateString()}
                            onChange={e => setRaceDate(e.target.value)}
                            required
                            style={{ border: '1.5px solid #FC4C02', borderRadius: 8, padding: '8px 12px', fontSize: '0.9rem' }}
                        />
                    </div>

                    <div style={{ marginBottom: '16px' }}>
                        <label style={{ display: 'block', fontSize: '0.85rem', color: '#888', fontWeight: 600, marginBottom: '6px' }}>
                            Target finish time (optional)
                        </label>
                        <input
                            type="text"
                            placeholder="hh:mm:ss or mm:ss"
                            value={targetTimeInput}
                            onChange={e => setTargetTimeInput(e.target.value)}
                            style={{ border: '1px solid #ddd', borderRadius: 8, padding: '8px 12px', fontSize: '0.9rem', width: '160px' }}
                        />
                    </div>

                    {submitError && <div style={{ color: '#a33', fontSize: '0.85rem', marginBottom: '12px' }}>{submitError}</div>}

                    <div style={{ display: 'flex', gap: '8px' }}>
                        <button
                            type="submit"
                            disabled={isSubmitting}
                            style={{
                                padding: '10px 20px',
                                borderRadius: '8px',
                                border: 'none',
                                background: isSubmitting ? '#f0a878' : '#FC4C02',
                                color: '#fff',
                                fontWeight: 700,
                                cursor: isSubmitting ? 'default' : 'pointer',
                            }}
                        >
                            {isSubmitting ? 'Starting...' : 'Generate Plan'}
                        </button>
                        {hasPlan && (
                            <button
                                type="button"
                                onClick={() => setShowForm(false)}
                                style={{ padding: '10px 20px', borderRadius: '8px', border: '1px solid #ddd', background: '#fff', color: '#666', fontWeight: 600, cursor: 'pointer' }}
                            >
                                Cancel
                            </button>
                        )}
                    </div>
                </form>
            ) : item?.plan && (
                <>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                        <h2 style={{ margin: 0, fontSize: '1.2rem' }}>
                            {item.request.raceDistance} — {item.request.raceDate}
                        </h2>
                        <button
                            onClick={() => openForm(item.request)}
                            style={{ background: 'none', border: '1px solid #ddd', borderRadius: '8px', padding: '6px 12px', color: '#666', fontWeight: 600, cursor: 'pointer', fontSize: '0.85rem' }}
                        >
                            Edit Goal
                        </button>
                    </div>
                    <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', marginBottom: '16px' }}>
                        <ScoreCard
                            label="Realism"
                            score={item.plan.realismScore}
                            rationale={item.plan.realismRationale}
                            scale={['Unrealistic', 'Uncertain', 'Likely', 'Highly Realistic']}
                        />
                        <ScoreCard
                            label="Difficulty"
                            score={item.plan.difficultyScore}
                            rationale={item.plan.difficultyRationale}
                            scale={['Easy', 'Moderate', 'Hard', 'Very Hard']}
                        />
                    </div>
                    {item.plan.weeks.map(week => {
                        const startDate = weekStartDate(item.request.raceDate, item.plan!.weeks.length, week.weekNumber);
                        return <WeekCard key={week.weekNumber} week={week} dateRange={formatWeekRange(startDate)} />;
                    })}
                </>
            )}
        </div>
    );
};

export default Training;
