import React, { useEffect, useState } from 'react';
import { fetchWithAuth } from '../utils/api';
import VolumeTrendChart from './stats/VolumeTrendChart';
import PaceTrendChart from './stats/PaceTrendChart';
import StreakCard from './stats/StreakCard';
import SportBreakdown from './stats/SportBreakdown';
import GearMileage from './stats/GearMileage';
import ActivityCalendar from './stats/ActivityCalendar';

interface StatsResponse {
    volumeTrend: { weekStart: string; distance: number; count: number }[];
    paceTrend: { weekStart: string; avgPaceSecPerKm: number }[];
    streak: { current: number; longest: number };
    sportBreakdown: { sportType: string; distance: number; count: number }[];
    calendar: { date: string; count: number; distance: number }[];
    gear: { id: string; name: string; type: 'shoe' | 'bike'; distance: number }[];
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const Stats: React.FC<{ athlete: any }> = ({ athlete }) => {
    const [stats, setStats] = useState<StatsResponse | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;
        const load = async () => {
            setIsLoading(true);
            setError(null);
            try {
                const data = await fetchWithAuth('/stats');
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
    }, []);

    if (isLoading) {
        return <div style={{ marginTop: '40px', color: '#888', fontSize: '1.1em' }}>Loading stats...</div>;
    }

    if (error) {
        return <div style={{ marginTop: '40px', color: '#d32f2f', fontSize: '1.1em' }}>{error}</div>;
    }

    if (!stats) return null;

    return (
        <div style={{ maxWidth: '700px', margin: '0 auto', padding: '16px', textAlign: 'left' }}>
            <StreakCard current={stats.streak.current} longest={stats.streak.longest} />
            <VolumeTrendChart data={stats.volumeTrend} />
            <PaceTrendChart data={stats.paceTrend} />
            <ActivityCalendar data={stats.calendar} />
            <SportBreakdown data={stats.sportBreakdown} />
            <GearMileage data={stats.gear} />
        </div>
    );
};

export default Stats;
