import React from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';

interface VolumeTrendPoint {
    weekStart: string;
    distance: number;
    count: number;
}

const VolumeTrendChart: React.FC<{ data: VolumeTrendPoint[] }> = ({ data }) => {
    const chartData = data.map(d => ({
        week: new Date(d.weekStart).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
        km: Math.round((d.distance / 1000) * 10) / 10,
    }));

    return (
        <div style={{ background: '#fff', borderRadius: '10px', padding: '16px', marginBottom: '16px', boxShadow: '0 2px 8px rgba(0,0,0,0.07)' }}>
            <h3 style={{ margin: '0 0 12px', fontSize: '1.1rem' }}>Weekly Distance</h3>
            <ResponsiveContainer width="100%" height={220}>
                <BarChart data={chartData} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="week" tick={{ fontSize: 11 }} interval={Math.ceil(chartData.length / 8)} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip formatter={(value: any) => [`${value} km`, 'Distance']} />
                    <Bar dataKey="km" fill="#FC4C02" radius={[4, 4, 0, 0]} />
                </BarChart>
            </ResponsiveContainer>
        </div>
    );
};

export default VolumeTrendChart;
