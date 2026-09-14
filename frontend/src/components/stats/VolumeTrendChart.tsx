import React from 'react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { formatTrendLabel, BucketUnit } from '../../utils/formatTrendLabel';

interface VolumeTrendPoint {
    periodStart: string;
    distance: number;
    count: number;
}

const VolumeTrendChart: React.FC<{ data: VolumeTrendPoint[]; bucketUnit: BucketUnit }> = ({ data, bucketUnit }) => {
    const chartData = data.map(d => ({
        period: formatTrendLabel(d.periodStart, bucketUnit),
        km: Math.round((d.distance / 1000) * 10) / 10,
    }));

    return (
        <div style={{ background: '#fff', borderRadius: '10px', padding: '16px', marginBottom: '16px', boxShadow: '0 2px 8px rgba(0,0,0,0.07)' }}>
            <h3 style={{ margin: '0 0 12px', fontSize: '1.1rem' }}>Distance</h3>
            <ResponsiveContainer width="100%" height={220}>
                <LineChart data={chartData} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="period" tick={{ fontSize: 11 }} interval={Math.ceil(chartData.length / 8)} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip formatter={(value: any) => [`${value} km`, 'Distance']} />
                    <Line type="monotone" dataKey="km" stroke="#FC4C02" strokeWidth={2} dot={{ r: 3 }} />
                </LineChart>
            </ResponsiveContainer>
        </div>
    );
};

export default VolumeTrendChart;
