import React from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';

interface PaceTrendPoint {
    periodStart: string;
    avgPaceSecPerKm: number;
}

function formatPace(secPerKm: number): string {
    const min = Math.floor(secPerKm / 60);
    const sec = Math.round(secPerKm % 60);
    return `${min}:${sec.toString().padStart(2, '0')}`;
}

const PaceTrendChart: React.FC<{ data: PaceTrendPoint[] }> = ({ data }) => {
    if (data.length === 0) {
        return (
            <div style={{ background: '#fff', borderRadius: '10px', padding: '16px', marginBottom: '16px', boxShadow: '0 2px 8px rgba(0,0,0,0.07)', color: '#888' }}>
                <h3 style={{ margin: '0 0 12px', fontSize: '1.1rem' }}>Running Pace Trend</h3>
                No runs in this time range yet.
            </div>
        );
    }

    const chartData = data.map(d => ({
        period: new Date(d.periodStart).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
        pace: Math.round(d.avgPaceSecPerKm),
    }));

    // Pace values sit far from zero (e.g. 250-400 sec/km), so a 0-based axis makes
    // every bar look nearly the same height. Scale to the actual data range instead,
    // with a little padding so bars don't touch the top/bottom edges.
    const paceValues = chartData.map(d => d.pace);
    const minPace = Math.min(...paceValues);
    const maxPace = Math.max(...paceValues);
    const padding = Math.max(10, Math.round((maxPace - minPace) * 0.1));
    const yDomain: [number, number] = [Math.max(0, minPace - padding), maxPace + padding];

    return (
        <div style={{ background: '#fff', borderRadius: '10px', padding: '16px', marginBottom: '16px', boxShadow: '0 2px 8px rgba(0,0,0,0.07)' }}>
            <h3 style={{ margin: '0 0 12px', fontSize: '1.1rem' }}>Running Pace Trend</h3>
            <ResponsiveContainer width="100%" height={220}>
                <BarChart data={chartData} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="period" tick={{ fontSize: 11 }} interval={Math.ceil(chartData.length / 8)} />
                    <YAxis domain={yDomain} tick={{ fontSize: 11 }} tickFormatter={formatPace} width={45} />
                    <Tooltip formatter={(value: any) => [`${formatPace(value)} /km`, 'Avg pace']} />
                    <Bar dataKey="pace" fill="#FC4C02" radius={[4, 4, 0, 0]} />
                </BarChart>
            </ResponsiveContainer>
        </div>
    );
};

export default PaceTrendChart;
