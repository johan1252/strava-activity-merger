import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { fetchWithAuth } from '../utils/api';
import LoadingIndicator from './LoadingIndicator';
import VolumeTrendChart from './stats/VolumeTrendChart';
import PaceTrendChart from './stats/PaceTrendChart';
import HeartRateTrendChart from './stats/HeartRateTrendChart';
import StreakCard from './stats/StreakCard';
import GearMileage from './stats/GearMileage';
import ActivityCalendar from './stats/ActivityCalendar';
import RacePredictions from './stats/RacePredictions';
import TrainingSummary from './stats/TrainingSummary';

type Timeframe = '7d' | '3m' | '6m' | '1y' | '5y';

const TIMEFRAME_OPTIONS: { value: Timeframe; label: string; fullLabel: string }[] = [
    { value: '7d', label: '7D', fullLabel: '7 Days' },
    { value: '3m', label: '3M', fullLabel: '3 Months' },
    { value: '6m', label: '6M', fullLabel: '6 Months' },
    { value: '1y', label: '1Y', fullLabel: '1 Year' },
    { value: '5y', label: '5Y', fullLabel: '5 Years' },
];

type BucketUnit = 'day' | 'week' | 'month';

const Spinner: React.FC = () => (
    <>
        <div
            style={{
                width: '14px',
                height: '14px',
                border: '2px solid rgba(0, 0, 0, 0.1)',
                borderTop: '2px solid #FC4C02',
                borderRadius: '50%',
                animation: 'statsSpin 0.8s linear infinite',
                display: 'inline-block',
            }}
        />
        <style>{`
            @keyframes statsSpin {
                0% { transform: rotate(0deg); }
                100% { transform: rotate(360deg); }
            }
        `}</style>
    </>
);

interface StatsResponse {
    volumeTrend: { periodStart: string; distance: number; count: number }[];
    paceTrend: { periodStart: string; avgPaceSecPerKm: number }[];
    heartRateTrend: { periodStart: string; avgHeartrate: number; maxHeartrate: number }[];
    trendBucketUnit: BucketUnit;
    streak: { current: number; longest: number };
    weekStreak: { current: number; longest: number };
    calendar: { date: string; count: number; distance: number; sportTypes: string[] }[];
    gear: { id: string; name: string; type: 'shoe' | 'bike'; distance: number }[];
    racePredictions: { distanceLabel: string; distanceMeters: number; predictedSeconds: number; sourceActivityId: number }[];
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const Stats: React.FC<{ athlete: any }> = ({ athlete }) => {
    const [stats, setStats] = useState<StatsResponse | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [searchParams, setSearchParams] = useSearchParams();
    const [timeframe, setTimeframe] = useState<Timeframe>(() => {
        const requested = searchParams.get('timeframe');
        return TIMEFRAME_OPTIONS.some(opt => opt.value === requested) ? (requested as Timeframe) : '3m';
    });

    // Keep the timeframe reflected in the URL so links/refreshes stay on the right view.
    useEffect(() => {
        setSearchParams(prev => {
            const next = new URLSearchParams(prev);
            if (timeframe === '3m') next.delete('timeframe');
            else next.set('timeframe', timeframe);
            return next;
        }, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [timeframe]);

    useEffect(() => {
        let cancelled = false;
        const load = async () => {
            setIsLoading(true);
            setError(null);
            try {
                const data = await fetchWithAuth(`/stats?timeframe=${timeframe}`);
                if (!cancelled) setStats(data);
            } catch (err) {
                console.error('Error fetching stats:', err);
                if (!cancelled) setError('Failed to load stats.');
            } finally {
                if (!cancelled) setIsLoading(false);
            }
        };
        load();
        return () => { cancelled = true; };
    }, [timeframe]);

    // Only show the full-page loading state before we have any data at all —
    // switching timeframe re-fetches in the background without blanking the charts.
    if (isLoading && !stats) {
        return <LoadingIndicator message="Loading your stats..." />;
    }

    if (error && !stats) {
        return <div style={{ marginTop: '40px', color: '#d32f2f', fontSize: '1.1em' }}>{error}</div>;
    }

    if (!stats) return null;

    return (
        <div style={{ maxWidth: '700px', margin: '0 auto', padding: '16px', textAlign: 'left' }}>
            <TrainingSummary />
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '16px' }}>
                {TIMEFRAME_OPTIONS.map(opt => (
                    <button
                        key={opt.value}
                        onClick={() => setTimeframe(opt.value)}
                        title={opt.fullLabel}
                        style={{
                            flex: '1 1 0',
                            maxWidth: '52px',
                            padding: '6px 4px',
                            borderRadius: '16px',
                            border: timeframe === opt.value ? '2px solid #FC4C02' : '1px solid #ddd',
                            background: timeframe === opt.value ? '#FC4C02' : '#fff',
                            color: timeframe === opt.value ? '#fff' : '#333',
                            fontWeight: 600,
                            fontSize: '0.8rem',
                            cursor: 'pointer',
                        }}
                    >
                        {opt.label}
                    </button>
                ))}
                <div style={{ width: '14px', height: '14px', flexShrink: 0 }}>
                    {isLoading && <Spinner />}
                </div>
            </div>
            <VolumeTrendChart data={stats.volumeTrend} bucketUnit={stats.trendBucketUnit} />
            <PaceTrendChart data={stats.paceTrend} bucketUnit={stats.trendBucketUnit} />
            <HeartRateTrendChart data={stats.heartRateTrend} bucketUnit={stats.trendBucketUnit} />
            <RacePredictions data={stats.racePredictions} />
            <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', alignItems: 'flex-start' }}>
                <div style={{ flex: '1 1 260px' }}>
                    <StreakCard dayStreak={stats.streak} weekStreak={stats.weekStreak} />
                </div>
                <div style={{ flex: '1 1 260px' }}>
                    <ActivityCalendar data={stats.calendar} />
                </div>
            </div>
            <GearMileage data={stats.gear} />
        </div>
    );
};

export default Stats;
