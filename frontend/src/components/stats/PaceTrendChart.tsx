import React from 'react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';

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

    return (
        <div style={{ background: '#fff', borderRadius: '10px', padding: '16px', marginBottom: '16px', boxShadow: '0 2px 8px rgba(0,0,0,0.07)' }}>
            <h3 style={{ margin: '0 0 12px', fontSize: '1.1rem' }}>Running Pace Trend</h3>
            <ResponsiveContainer width="100%" height={220}>
                <LineChart data={chartData} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="period" tick={{ fontSize: 11 }} interval={Math.ceil(chartData.length / 8)} />
                    <YAxis tick={{ fontSize: 11 }} tickFormatter={formatPace} width={45} />
                    <Tooltip formatter={(value: any) => [`${formatPace(value)} /km`, 'Avg pace']} />
                    <Line type="monotone" dataKey="pace" stroke="#FC4C02" strokeWidth={2} dot={{ r: 3 }} connectNulls={false} />
                </LineChart>
            </ResponsiveContainer>
        </div>
    );
};

export default PaceTrendChart;
