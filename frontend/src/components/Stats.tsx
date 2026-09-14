import React, { useEffect, useState } from 'react';
import { fetchWithAuth } from '../utils/api';
import VolumeTrendChart from './stats/VolumeTrendChart';
import PaceTrendChart from './stats/PaceTrendChart';
import StreakCard from './stats/StreakCard';
import SportBreakdown from './stats/SportBreakdown';
import GearMileage from './stats/GearMileage';
import ActivityCalendar from './stats/ActivityCalendar';

type Timeframe = '7d' | '3m' | '6m' | '1y';

const TIMEFRAME_OPTIONS: { value: Timeframe; label: string }[] = [
    { value: '7d', label: '7 Days' },
    { value: '3m', label: '3 Months' },
    { value: '6m', label: '6 Months' },
    { value: '1y', label: '1 Year' },
];

interface StatsResponse {
    volumeTrend: { periodStart: string; distance: number; count: number }[];
    paceTrend: { periodStart: string; avgPaceSecPerKm: number }[];
    streak: { current: number; longest: number };
    weekStreak: { current: number; longest: number };
    sportBreakdown: { sportType: string; distance: number; count: number }[];
    calendar: { date: string; count: number; distance: number }[];
    gear: { id: string; name: string; type: 'shoe' | 'bike'; distance: number }[];
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const Stats: React.FC<{ athlete: any }> = ({ athlete }) => {
    const [stats, setStats] = useState<StatsResponse | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [timeframe, setTimeframe] = useState<Timeframe>('6m');

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

    if (isLoading) {
        return <div style={{ marginTop: '40px', color: '#888', fontSize: '1.1em' }}>Loading stats...</div>;
    }

    if (error) {
        return <div style={{ marginTop: '40px', color: '#d32f2f', fontSize: '1.1em' }}>{error}</div>;
    }

    if (!stats) return null;

    return (
        <div style={{ maxWidth: '700px', margin: '0 auto', padding: '16px', textAlign: 'left' }}>
            <StreakCard dayStreak={stats.streak} weekStreak={stats.weekStreak} />
            <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', flexWrap: 'wrap' }}>
                {TIMEFRAME_OPTIONS.map(opt => (
                    <button
                        key={opt.value}
                        onClick={() => setTimeframe(opt.value)}
                        style={{
                            padding: '6px 14px',
                            borderRadius: '20px',
                            border: timeframe === opt.value ? '2px solid #FC4C02' : '1px solid #ddd',
                            background: timeframe === opt.value ? '#FC4C02' : '#fff',
                            color: timeframe === opt.value ? '#fff' : '#333',
                            fontWeight: 600,
                            fontSize: '0.85rem',
                            cursor: 'pointer',
                        }}
                    >
                        {opt.label}
                    </button>
                ))}
            </div>
            <VolumeTrendChart data={stats.volumeTrend} />
            <PaceTrendChart data={stats.paceTrend} />
            <ActivityCalendar data={stats.calendar} />
            <SportBreakdown data={stats.sportBreakdown} />
            <GearMileage data={stats.gear} />
        </div>
    );
};

export default Stats;
