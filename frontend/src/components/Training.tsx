import React, { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { fetchWithAuth } from '../utils/api';
import LoadingIndicator from './LoadingIndicator';
import TrainingPlanList from './TrainingPlanList';
import { Banner, SYNC_STATUS_MESSAGE, SyncStatus, cardStyle, formatDuration, formatFullDate } from './trainingShared';
import TrainingPlanChat, { TrainingPlanChatMessage } from './TrainingPlanChat';

type RaceDistance = '5K' | '10K' | 'Half Marathon' | 'Marathon';

const RACE_DISTANCES: RaceDistance[] = ['5K', '10K', 'Half Marathon', 'Marathon'];
const MAX_WEEKS_OUT = 52;

// Floors roughly in line with current world-record pace for each distance — anything
// faster isn't a realistic target for this app's users. Mirrored server-side.
const MIN_TARGET_TIME_SECONDS: Record<RaceDistance, number> = {
    '5K': 12 * 60,
    '10K': 25 * 60,
    'Half Marathon': 60 * 60,
    'Marathon': 2 * 60 * 60,
};

const HOUR_OPTIONS = Array.from({ length: 9 }, (_, i) => i); // 0-8
const MINUTE_OPTIONS = Array.from({ length: 60 }, (_, i) => i); // 0-59
const SECOND_OPTIONS = Array.from({ length: 12 }, (_, i) => i * 5); // 0,5,...,55
const DAYS_PER_WEEK_OPTIONS = [1, 2, 3, 4, 5, 6, 7];

interface TrainingPlanRequest {
    raceDistance: RaceDistance;
    raceDate: string;
    targetTimeSeconds: number;
    daysPerWeek?: number;
    includeDays?: boolean;
}

interface TrainingPlanRunCompletion {
    completed: boolean;
    manual: boolean;
    autoActivity?: { id: number; name: string; date: string };
}

interface TrainingPlanRun {
    count: number;
    label: string;
    activityType?: string; // absent on older plans — means 'Run'
    distanceKm: number;
    durationMinutes?: number;
    days?: string[]; // one weekday name per instance; absent on older plans
    notes: string;
    completions: TrainingPlanRunCompletion[];
}

interface TrainingPlanWeek {
    weekNumber: number;
    totalDistanceKm: number;
    focus: 'Base' | 'Build' | 'Peak' | 'Taper' | 'Race Week';
    runs: TrainingPlanRun[];
}

interface TrainingPlan {
    weeks: TrainingPlanWeek[];
    realismScore: number;
    realismRationale: string;
    difficultyScore: number;
    difficultyRationale: string;
}

interface TrainingPlanItem {
    id?: string;
    status: 'generating' | 'complete' | 'failed';
    request: TrainingPlanRequest;
    requestedAt: number;
    plan?: TrainingPlan;
    generatedAt?: number;
    errorMessage?: string;
    isPast?: boolean;
    chat?: TrainingPlanChatMessage[];
}

function formatDistanceKm(distanceKm: number): string {
    return `${Number.isInteger(distanceKm) ? distanceKm : distanceKm.toFixed(1)}km`;
}

// Singular wording regardless of count — the individually-checkable sub-bullets
// ("Run 1", "Run 2", ...) already convey the repetition, so no more "Two tempo runs"
// pluralization of the label here, just an "each" after the distance for count > 1.
function isRunSession(run: TrainingPlanRun): boolean {
    return (run.activityType ?? 'Run') === 'Run';
}

function formatSize(run: TrainingPlanRun): string {
    return [
        run.durationMinutes ? `${run.durationMinutes} min` : '',
        run.distanceKm > 0 ? formatDistanceKm(run.distanceKm) : '',
    ].filter(Boolean).join(', ');
}

function formatRun(run: TrainingPlanRun): string {
    const size = formatSize(run);
    const sizeLabel = run.count > 1 ? `${size} each` : size;
    return `${run.label} — ${sizeLabel}${run.notes ? `, ${run.notes}` : ''}`;
}

const WEEKDAY_ORDER = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

interface DaySession {
    runIndex: number;
    instanceIndex: number;
    day?: string;
    label: string;
}

// One entry per instance, ordered Monday to Sunday (instances without a day go last),
// e.g. "Monday — Swim — 5km". Used instead of the grouped list when days are shown.
function sessionsByDay(runs: TrainingPlanRun[]): DaySession[] {
    const sessions = runs.flatMap((run, runIndex) =>
        Array.from({ length: run.count }, (_, instanceIndex) => {
            const day = run.days?.[instanceIndex];
            const detail = `${run.label} — ${formatSize(run)}${run.notes ? `, ${run.notes}` : ''}`;
            return { runIndex, instanceIndex, day, label: day ? `${day} — ${detail}` : detail };
        }),
    );
    const order = (d?: string) => (d ? WEEKDAY_ORDER.indexOf(d) : WEEKDAY_ORDER.length);
    return sessions.sort((a, b) => order(a.day) - order(b.day));
}

function instanceLabel(run: TrainingPlanRun, instanceIndex: number): string {
    return `${isRunSession(run) ? 'Run' : run.label} ${instanceIndex + 1}`;
}

function countCompletions(runs: TrainingPlanRun[]): { done: number; total: number } {
    return runs.reduce(
        (acc, run) => ({
            done: acc.done + run.completions.filter(c => c.completed).length,
            total: acc.total + run.count,
        }),
        { done: 0, total: 0 },
    );
}

function hmsToSeconds(h: number, m: number, s: number): number {
    return h * 3600 + m * 60 + s;
}

function secondsToHms(totalSeconds: number): { h: number; m: number; s: number } {
    const h = Math.floor(totalSeconds / 3600);
    const m = Math.floor((totalSeconds % 3600) / 60);
    const s = totalSeconds % 60;
    return { h, m, s };
}

// Snaps a h/m/s selection up to the distance's minimum whenever the combination
// (or a distance change) would otherwise put it below the floor.
function clampTargetTime(h: number, m: number, s: number, distance: RaceDistance): { h: number; m: number; s: number } {
    const totalSeconds = hmsToSeconds(h, m, s);
    const min = MIN_TARGET_TIME_SECONDS[distance];
    return totalSeconds < min ? secondsToHms(min) : { h, m, s };
}

function todayDateString(): string {
    return new Date().toISOString().slice(0, 10);
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

const selectStyle: React.CSSProperties = {
    border: '1px solid #ddd',
    borderRadius: 8,
    padding: '8px 10px',
    fontSize: '0.9rem',
    background: '#fff',
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

function ordinal(n: number): string {
    if (n % 100 >= 11 && n % 100 <= 13) return `${n}th`;
    switch (n % 10) {
        case 1: return `${n}st`;
        case 2: return `${n}nd`;
        case 3: return `${n}rd`;
        default: return `${n}th`;
    }
}

function formatCompletionDate(dateStr: string): string {
    const d = new Date(`${dateStr}T00:00:00Z`);
    const month = d.toLocaleDateString(undefined, { month: 'short', timeZone: 'UTC' });
    return `${ordinal(d.getUTCDate())} ${month}`;
}

function hashText(text: string): string {
    let hash = 0;
    for (let i = 0; i < text.length; i++) hash = (hash * 31 + text.charCodeAt(i)) | 0;
    return String(hash);
}

// The score cards open the first time a plan's scores are seen and stay collapsed on later
// visits. They open again when the scores or their explanations change (a revised or rebuilt plan).
const PlanScores: React.FC<{ planId: string | null; plan: TrainingPlan }> = ({ planId, plan }) => {
    const storageKey = `trainingPlanScoresSeen:${planId}`;
    const stamp = hashText(`${plan.realismScore}|${plan.realismRationale}|${plan.difficultyScore}|${plan.difficultyRationale}`);
    const [expanded, setExpanded] = useState(() => {
        try {
            return localStorage.getItem(storageKey) !== stamp;
        } catch {
            return true;
        }
    });

    useEffect(() => {
        try {
            localStorage.setItem(storageKey, stamp);
        } catch {
            // Storage can be unavailable (private mode); the cards then open on every visit
        }
    }, [storageKey, stamp]);

    const toggleStyle: React.CSSProperties = {
        background: 'none',
        border: 'none',
        color: '#888',
        fontWeight: 600,
        fontSize: '0.85rem',
        cursor: 'pointer',
        padding: 0,
    };

    if (!expanded) {
        return (
            <button
                type="button"
                onClick={() => setExpanded(true)}
                style={{ ...cardStyle, ...toggleStyle, display: 'block', width: '100%', textAlign: 'left', padding: '10px 14px', marginBottom: '16px', color: '#555' }}
            >
                <span style={{ color: '#888', marginRight: '6px' }}>▸</span>
                Realism <strong style={{ color: '#333' }}>{plan.realismScore}</strong>
                <span style={{ margin: '0 8px', color: '#ccc' }}>·</span>
                Difficulty <strong style={{ color: '#333' }}>{plan.difficultyScore}</strong>
                <span style={{ float: 'right', color: '#888', fontWeight: 400 }}>Show details</span>
            </button>
        );
    }

    return (
        <div style={{ marginBottom: '16px' }}>
            <button type="button" onClick={() => setExpanded(false)} style={{ ...toggleStyle, marginBottom: '8px' }}>
                ▾ Hide realism and difficulty
            </button>
            <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
                <ScoreCard
                    label="Realism"
                    score={plan.realismScore}
                    rationale={plan.realismRationale}
                    scale={['Unrealistic', 'Uncertain', 'Likely', 'Highly Realistic']}
                />
                <ScoreCard
                    label="Difficulty"
                    score={plan.difficultyScore}
                    rationale={plan.difficultyRationale}
                    scale={['Easy', 'Moderate', 'Hard', 'Very Hard']}
                />
            </div>
        </div>
    );
};

const STRAVA_ACTIVITY_URL = 'https://www.strava.com/activities/';

const RunCheckbox: React.FC<{ completion: TrainingPlanRunCompletion; onChange: (checked: boolean) => void; label: string }> = ({ completion, onChange, label }) => (
    <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
        <input
            type="checkbox"
            checked={completion.completed}
            onChange={e => onChange(e.target.checked)}
            style={{ width: '15px', height: '15px', cursor: 'pointer', flexShrink: 0 }}
        />
        <span style={{ color: completion.completed ? '#999' : '#333' }}>
            <span style={{ textDecoration: completion.completed ? 'line-through' : 'none' }}>{label}</span>
            {completion.completed && completion.manual && ' (Completed)'}
            {completion.completed && !completion.manual && completion.autoActivity && (
                <>
                    {' '}(Completed on {formatCompletionDate(completion.autoActivity.date)} -{' '}
                    <a
                        href={`${STRAVA_ACTIVITY_URL}${completion.autoActivity.id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={e => e.stopPropagation()}
                        style={{ color: '#FC4C02', textDecoration: 'underline' }}
                    >
                        {completion.autoActivity.name}
                    </a>)
                </>
            )}
        </span>
    </label>
);

const WeekCard: React.FC<{
    week: TrainingPlanWeek;
    dateRange: string;
    isPast: boolean;
    onToggle: (runIndex: number, instanceIndex: number, completed: boolean) => void;
}> = ({ week, dateRange, isPast, onToggle }) => {
    const { done, total } = countCompletions(week.runs);
    // Past weeks start collapsed to keep the plan scannable, but the user can still
    // expand one to check past runs — the click just flips a one-time override.
    const [expandedOverride, setExpandedOverride] = useState<boolean | null>(null);
    const expanded = expandedOverride ?? !isPast;
    const dayView = week.runs.some(r => r.days && r.days.length > 0);

    return (
        <div style={{ ...cardStyle, marginBottom: '10px' }}>
            <div
                onClick={() => isPast && setExpandedOverride(!expanded)}
                style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: expanded ? '6px' : 0,
                    cursor: isPast ? 'pointer' : 'default',
                }}
            >
                <span>
                    {isPast && <span style={{ color: '#888', fontSize: '0.8rem', marginRight: '6px' }}>{expanded ? '▾' : '▸'}</span>}
                    <span style={{ fontWeight: 700 }}>Week {week.weekNumber}</span>
                    <span style={{ color: '#888', fontSize: '0.85rem', marginLeft: '8px' }}>{dateRange}</span>
                </span>
                <span style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <span style={{ fontSize: '0.8rem', color: '#888', fontWeight: 600 }}>{done}/{total} done</span>
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
                </span>
            </div>
            {expanded && (
                <>
                    <div style={{ color: '#555', fontSize: '0.9rem', marginBottom: '6px' }}>
                        {week.totalDistanceKm.toFixed(0)} km {week.runs.some(r => !isRunSession(r)) ? 'running' : 'total'}
                    </div>
                    <ul style={{ margin: 0, paddingLeft: '20px', color: '#333', fontSize: '0.9rem', lineHeight: 1.5, listStyle: 'none' }}>
                        {dayView && sessionsByDay(week.runs).map(session => (
                            <li key={`${session.runIndex}-${session.instanceIndex}`} style={{ marginBottom: '4px' }}>
                                <RunCheckbox
                                    completion={week.runs[session.runIndex].completions[session.instanceIndex]}
                                    onChange={completed => onToggle(session.runIndex, session.instanceIndex, completed)}
                                    label={session.label}
                                />
                            </li>
                        ))}
                        {!dayView && week.runs.map((run, runIndex) => (
                            <li key={runIndex} style={{ marginBottom: '4px' }}>
                                {run.count === 1 ? (
                                    <RunCheckbox
                                        completion={run.completions[0]}
                                        onChange={completed => onToggle(runIndex, 0, completed)}
                                        label={formatRun(run)}
                                    />
                                ) : (
                                    <>
                                        <div>{formatRun(run)}</div>
                                        <ul style={{ margin: '2px 0 0', paddingLeft: '18px', listStyle: 'none' }}>
                                            {Array.from({ length: run.count }, (_, instanceIndex) => (
                                                <li key={instanceIndex} style={{ marginBottom: '2px' }}>
                                                    <RunCheckbox
                                                        completion={run.completions[instanceIndex]}
                                                        onChange={completed => onToggle(runIndex, instanceIndex, completed)}
                                                        label={instanceLabel(run, instanceIndex)}
                                                    />
                                                </li>
                                            ))}
                                        </ul>
                                    </>
                                )}
                            </li>
                        ))}
                    </ul>
                </>
            )}
        </div>
    );
};

const CHAT_TIP_STORAGE_KEY = 'trainingPlanChatTipDismissed';

const ChatTip: React.FC = () => {
    const [dismissed, setDismissed] = useState(() => {
        try {
            return localStorage.getItem(CHAT_TIP_STORAGE_KEY) === 'true';
        } catch {
            return false;
        }
    });

    if (dismissed) return null;

    const dismiss = () => {
        setDismissed(true);
        try {
            localStorage.setItem(CHAT_TIP_STORAGE_KEY, 'true');
        } catch {
            // Storage can be unavailable (private mode); the tip then returns on the next visit
        }
    };

    return (
        <div
            style={{
                display: 'flex',
                gap: '10px',
                alignItems: 'flex-start',
                background: '#eef6ff',
                border: '1px solid #cfe3fa',
                borderRadius: '10px',
                padding: '10px 14px',
                marginBottom: '16px',
                fontSize: '0.9rem',
                color: '#355',
            }}
        >
            <span aria-hidden="true" style={{ fontSize: '1.1rem', lineHeight: 1.3 }}>💡</span>
            <div style={{ flex: 1 }}>
                <strong>Did you know?</strong> You can use the chat to customize your plan. Ask for extra training runs,
                swims or weight-lifting sessions, change which days you train, or change your race date or goal time.
            </div>
            <button
                type="button"
                onClick={dismiss}
                aria-label="Dismiss tip"
                style={{ background: 'none', border: 'none', color: '#789', fontSize: '1.1rem', lineHeight: 1, cursor: 'pointer', padding: '0 2px' }}
            >
                ✕
            </button>
        </div>
    );
};

const BackLink: React.FC<{ onClick: () => void }> = ({ onClick }) => (
    <button
        type="button"
        onClick={onClick}
        style={{ background: 'none', border: 'none', color: '#FC4C02', fontWeight: 600, fontSize: '0.9rem', cursor: 'pointer', padding: 0, marginBottom: '12px' }}
    >
        ← All training plans
    </button>
);

interface TrainingPlanViewProps {
    planId: string | null; // null while setting up a new plan
    onBack: () => void;
    onCreated: (planId: string) => void;
}

const TrainingPlanView: React.FC<TrainingPlanViewProps> = ({ planId, onBack, onCreated }) => {
    const [item, setItem] = useState<TrainingPlanItem | null>(null);
    const [syncStatus, setSyncStatus] = useState<SyncStatus>('ready');
    const [isLoadingInitial, setIsLoadingInitial] = useState(planId !== null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [submitError, setSubmitError] = useState<string | null>(null);
    const [chatError, setChatError] = useState<string | null>(null);
    const [raceDistance, setRaceDistance] = useState<RaceDistance>('10K');
    const [raceDate, setRaceDate] = useState('');
    const initialTargetTime = secondsToHms(MIN_TARGET_TIME_SECONDS['10K']);
    const [targetHours, setTargetHours] = useState(initialTargetTime.h);
    const [targetMinutes, setTargetMinutes] = useState(initialTargetTime.m);
    const [targetSeconds, setTargetSeconds] = useState(initialTargetTime.s);
    const [showAdvanced, setShowAdvanced] = useState(false);
    const [daysPerWeek, setDaysPerWeek] = useState<number | undefined>(undefined);
    const [includeDays, setIncludeDays] = useState(false);

    const updateTargetTime = (h: number, m: number, s: number) => {
        const clamped = clampTargetTime(h, m, s, raceDistance);
        setTargetHours(clamped.h);
        setTargetMinutes(clamped.m);
        setTargetSeconds(clamped.s);
    };

    const selectRaceDistance = (d: RaceDistance) => {
        setRaceDistance(d);
        const clamped = clampTargetTime(targetHours, targetMinutes, targetSeconds, d);
        setTargetHours(clamped.h);
        setTargetMinutes(clamped.m);
        setTargetSeconds(clamped.s);
    };

    const loadPlan = useCallback(async () => {
        if (planId === null) return;
        try {
            const data = await fetchWithAuth(`/training-plan/${planId}`);
            setItem(data.item);
            setSyncStatus(data.syncStatus ?? 'ready');
        } catch (err) {
            console.error('Error fetching training plan:', err);
        } finally {
            setIsLoadingInitial(false);
        }
    }, [planId]);

    useEffect(() => {
        loadPlan();
    }, [loadPlan]);

    // Poll while a generation is in progress; stop as soon as the status changes.
    useEffect(() => {
        if (item?.status !== 'generating') return;
        const interval = setInterval(loadPlan, 3000);
        return () => clearInterval(interval);
    }, [item?.status, loadPlan]);

    // Optimistic local update so the checkbox flips instantly, then reconciles with the
    // server's response (which recomputes auto-detection alongside the manual override
    // just written); falls back to a full reload on failure to resync ground truth.
    const toggleRunCompletion = async (weekNumber: number, runIndex: number, instanceIndex: number, completed: boolean) => {
        setItem(prev => {
            if (!prev?.plan) return prev;
            return {
                ...prev,
                plan: {
                    ...prev.plan,
                    weeks: prev.plan.weeks.map(week => week.weekNumber !== weekNumber ? week : {
                        ...week,
                        runs: week.runs.map((run, i) => i !== runIndex ? run : {
                            ...run,
                            completions: run.completions.map((c, j) => j === instanceIndex ? { completed, manual: true } : c),
                        }),
                    }),
                },
            };
        });

        try {
            const data = await fetchWithAuth(`/training-plan/${planId}`, {
                method: 'PATCH',
                body: JSON.stringify({ weekNumber, runIndex, instanceIndex, completed }),
            });
            setItem(data.item);
            setSyncStatus(data.syncStatus ?? 'ready');
        } catch (err) {
            console.error('Error toggling run completion:', err);
            await loadPlan();
        }
    };

    // Shows the athlete's message and the busy state straight away; the revised plan and
    // the coach's reply arrive through the same polling used while a plan generates.
    const sendChatMessage = async (message: string) => {
        setChatError(null);
        setItem(prev => prev ? {
            ...prev,
            status: 'generating',
            chat: [...(prev.chat ?? []), { role: 'user', content: message, at: Math.floor(Date.now() / 1000) }],
        } : prev);

        try {
            await fetchWithAuth(`/training-plan/${planId}/chat`, {
                method: 'POST',
                body: JSON.stringify({ message }),
            });
        } catch (err) {
            console.error('Error sending plan chat message:', err);
            setChatError('Could not send your message. Please try again.');
            await loadPlan();
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setSubmitError(null);

        if (!raceDate) {
            setSubmitError('Please choose a race date.');
            return;
        }

        const targetTimeSeconds = hmsToSeconds(targetHours, targetMinutes, targetSeconds);

        setIsSubmitting(true);
        try {
            const data = await fetchWithAuth(planId ? `/training-plan/${planId}` : '/training-plan', {
                method: 'POST',
                body: JSON.stringify({ raceDistance, raceDate, targetTimeSeconds, daysPerWeek, includeDays }),
            });
            if (data.status === 'not_synced') {
                setSyncStatus(data.syncStatus ?? 'in_progress');
                setSubmitError(null);
                return;
            }
            if (planId === null) {
                onCreated(data.id);
                return;
            }
            await loadPlan();
        } catch (err) {
            console.error('Error starting training plan generation:', err);
            const limitReached = err instanceof Error && err.message.includes('Conflict');
            setSubmitError(limitReached
                ? 'You already have the maximum number of training plans. Delete one to add another.'
                : 'Failed to start generating your plan. Please try again.');
        } finally {
            setIsSubmitting(false);
        }
    };

    if (isLoadingInitial) {
        return (
            <div style={{ maxWidth: '700px', margin: '0 auto', padding: '4px 16px 16px', textAlign: 'left' }}>
                <BackLink onClick={onBack} />
                <LoadingIndicator message="Loading your training plan..." />
            </div>
        );
    }

    const hasPlan = !!item?.plan;
    const isGenerating = item?.status === 'generating';
    const isFailed = item?.status === 'failed';

    if (isGenerating && !hasPlan) {
        return (
            <div style={{ maxWidth: '700px', margin: '0 auto', padding: '4px 16px 16px', textAlign: 'left' }}>
                <BackLink onClick={onBack} />
                <LoadingIndicator message="Designing your training plan... this can take up to a minute." />
            </div>
        );
    }

    const notSynced = syncStatus !== 'ready';
    const displayForm = !notSynced && !hasPlan && !isGenerating;
    const showPlan = !displayForm && hasPlan;

    return (
        <div style={{ maxWidth: showPlan ? '1100px' : '700px', margin: '0 auto', padding: '4px 16px 16px', textAlign: 'left' }}>
            <BackLink onClick={onBack} />
            {notSynced && <Banner>{SYNC_STATUS_MESSAGE[syncStatus as Exclude<SyncStatus, 'ready'>]}</Banner>}
            {/* A chat message in flight shows its own "Thinking…" bubble; the banner is for rebuilds */}
            {isGenerating && hasPlan && item?.chat?.[item.chat.length - 1]?.role !== 'user' && <Banner>Rebuilding your plan...</Banner>}
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
                                    onClick={() => selectRaceDistance(d)}
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
                        <div style={{ position: 'relative', display: 'inline-block' }}>
                            <input
                                type="date"
                                value={raceDate}
                                min={tomorrowDateString()}
                                max={maxDateString()}
                                onChange={e => setRaceDate(e.target.value)}
                                required
                                style={{
                                    border: raceDate ? '1px solid #ddd' : '1.5px solid #FC4C02',
                                    borderRadius: 8,
                                    padding: '8px 12px',
                                    fontSize: '0.9rem',
                                    background: '#fff',
                                    // Some mobile browsers (Android Chrome) don't render the native
                                    // empty-state "dd/mm/yyyy" hint at all — hide it either way and
                                    // show our own overlay text below instead, for a consistent look.
                                    color: raceDate ? '#333' : 'transparent',
                                }}
                            />
                            {!raceDate && (
                                <span
                                    style={{
                                        position: 'absolute',
                                        left: 12,
                                        top: '50%',
                                        transform: 'translateY(-50%)',
                                        color: '#888',
                                        fontSize: '0.9rem',
                                        pointerEvents: 'none',
                                    }}
                                >
                                    Select a date
                                </span>
                            )}
                        </div>
                    </div>

                    <div style={{ marginBottom: '16px' }}>
                        <label style={{ display: 'block', fontSize: '0.85rem', color: '#888', fontWeight: 600, marginBottom: '6px' }}>
                            Target finish time
                        </label>
                        <div style={{ display: 'flex', gap: '6px' }}>
                            <select
                                value={targetHours}
                                onChange={e => updateTargetTime(Number(e.target.value), targetMinutes, targetSeconds)}
                                style={selectStyle}
                            >
                                {HOUR_OPTIONS.map(h => <option key={h} value={h}>{h}h</option>)}
                            </select>
                            <select
                                value={targetMinutes}
                                onChange={e => updateTargetTime(targetHours, Number(e.target.value), targetSeconds)}
                                style={selectStyle}
                            >
                                {MINUTE_OPTIONS.map(m => <option key={m} value={m}>{String(m).padStart(2, '0')}m</option>)}
                            </select>
                            <select
                                value={targetSeconds}
                                onChange={e => updateTargetTime(targetHours, targetMinutes, Number(e.target.value))}
                                style={selectStyle}
                            >
                                {SECOND_OPTIONS.map(s => <option key={s} value={s}>{String(s).padStart(2, '0')}s</option>)}
                            </select>
                        </div>
                    </div>

                    <div style={{ marginBottom: '16px' }}>
                        <button
                            type="button"
                            onClick={() => setShowAdvanced(v => !v)}
                            style={{ background: 'none', border: 'none', color: '#888', fontWeight: 600, fontSize: '0.85rem', cursor: 'pointer', padding: 0 }}
                        >
                            {showAdvanced ? '▾' : '▸'} Advanced
                        </button>
                        {showAdvanced && (
                            <div style={{ marginTop: '10px', marginLeft: '4px', paddingLeft: '14px', borderLeft: '2px solid #eee' }}>
                                <label style={{ display: 'block', fontSize: '0.85rem', color: '#888', fontWeight: 600, marginBottom: '6px' }}>
                                    Preferred running days per week
                                </label>
                                <select
                                    value={daysPerWeek ?? ''}
                                    onChange={e => setDaysPerWeek(e.target.value ? Number(e.target.value) : undefined)}
                                    style={selectStyle}
                                >
                                    <option value="">No preference</option>
                                    {DAYS_PER_WEEK_OPTIONS.map(n => <option key={n} value={n}>{n} {n === 1 ? 'Day' : 'Days'}/week</option>)}
                                </select>

                                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '14px', cursor: 'pointer', fontSize: '0.9rem', color: '#555' }}>
                                    <input
                                        type="checkbox"
                                        checked={includeDays}
                                        onChange={e => setIncludeDays(e.target.checked)}
                                        style={{ width: '15px', height: '15px', cursor: 'pointer' }}
                                    />
                                    Include days of the week in my plan
                                </label>
                            </div>
                        )}
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
                        <button
                            type="button"
                            onClick={onBack}
                            style={{ padding: '10px 20px', borderRadius: '8px', border: '1px solid #ddd', background: '#fff', color: '#666', fontWeight: 600, cursor: 'pointer' }}
                        >
                            Cancel
                        </button>
                    </div>
                </form>
            ) : item?.plan && (
                <div style={{ display: 'flex', gap: '20px', alignItems: 'flex-start', flexWrap: 'wrap' }}>
                    <div style={{ flex: '1 1 480px', minWidth: 0 }}>
                    <h2 style={{ margin: '0 0 8px', fontSize: '1.2rem' }}>
                        {item.request.raceDistance} — {formatFullDate(item.request.raceDate)}
                    </h2>
                    <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', color: '#555', fontSize: '0.9rem', marginBottom: '16px' }}>
                        <span><strong style={{ color: '#333' }}>Plan starts:</strong> {formatFullDate(weekStartDate(item.request.raceDate, item.plan.weeks.length, 1))}</span>
                        <span><strong style={{ color: '#333' }}>Duration:</strong> {item.plan.weeks.length} weeks</span>
                        <span>
                            <strong style={{ color: '#333' }}>Target time:</strong>{' '}
                            {formatDuration(item.request.targetTimeSeconds)}
                        </span>
                        {(() => {
                            const { done, total } = countCompletions(item.plan.weeks.flatMap(w => w.runs));
                            return <span><strong style={{ color: '#333' }}>Progress:</strong> {done}/{total} sessions done</span>;
                        })()}
                    </div>
                    <ChatTip />
                    {/* Keyed on the scores so a revised plan with new scores remounts and opens again */}
                    <PlanScores
                        key={`${planId}-${item.plan.realismScore}-${item.plan.difficultyScore}-${item.plan.realismRationale.length}-${item.plan.difficultyRationale.length}`}
                        planId={planId}
                        plan={item.plan}
                    />
                    {item.plan.weeks.map(week => {
                        const startDate = weekStartDate(item.request.raceDate, item.plan!.weeks.length, week.weekNumber);
                        const weekEndDate = addDays(startDate, 6);
                        return (
                            <WeekCard
                                key={week.weekNumber}
                                week={week}
                                dateRange={formatWeekRange(startDate)}
                                isPast={weekEndDate < todayDateString()}
                                onToggle={(runIndex, instanceIndex, completed) =>
                                    toggleRunCompletion(week.weekNumber, runIndex, instanceIndex, completed)}
                            />
                        );
                    })}
                    </div>
                    <TrainingPlanChat
                        messages={item.chat ?? []}
                        isBusy={isGenerating}
                        error={chatError}
                        onSend={sendChatMessage}
                    />
                </div>
            )}
        </div>
    );
};

// The Training tab: a list of the athlete's plans, and one plan's page once opened. The open
// plan lives in the URL (?plan=<id>, or ?plan=new for the setup form) so Back returns to the list.
const Training: React.FC<{ athlete: any }> = () => {
    const [searchParams, setSearchParams] = useSearchParams();
    const selectedPlan = searchParams.get('plan');

    const selectPlan = (planId: string | null, replace = false) => {
        setSearchParams(prev => {
            const next = new URLSearchParams(prev);
            if (planId) next.set('plan', planId);
            else next.delete('plan');
            return next;
        }, { replace });
    };

    if (!selectedPlan) {
        return <TrainingPlanList onOpen={selectPlan} onNew={() => selectPlan('new')} />;
    }

    return (
        <TrainingPlanView
            key={selectedPlan}
            planId={selectedPlan === 'new' ? null : selectedPlan}
            onBack={() => selectPlan(null)}
            onCreated={planId => selectPlan(planId, true)}
        />
    );
};

export default Training;
