import React from 'react';
import { LineChart, Line, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, CartesianGrid } from 'recharts';
import { formatTrendLabel, BucketUnit } from '../../utils/formatTrendLabel';

interface HeartRateTrendPoint {
    periodStart: string;
    avgHeartrate: number;
    maxHeartrate: number;
}

const SERIES_LABELS: Record<string, string> = { avg: 'Avg HR', max: 'Max HR' };

const HeartRateTrendChart: React.FC<{ data: HeartRateTrendPoint[]; bucketUnit: BucketUnit }> = ({ data, bucketUnit }) => {
    if (data.length === 0) {
        return (
            <div style={{ background: '#fff', borderRadius: '10px', padding: '16px', marginBottom: '16px', boxShadow: '0 2px 8px rgba(0,0,0,0.07)', color: '#888' }}>
                <h3 style={{ margin: '0 0 12px', fontSize: '1.1rem' }}>Heart Rate Trend</h3>
                No heart rate data in this time range yet.
            </div>
        );
    }

    const chartData = data.map(d => ({
        period: formatTrendLabel(d.periodStart, bucketUnit),
        avg: Math.round(d.avgHeartrate),
        max: Math.round(d.maxHeartrate),
    }));

    // HR values sit far from zero, so scale to the actual data range (same reasoning
    // as the pace chart) rather than defaulting to a 0-based axis.
    const allValues = chartData.flatMap(d => [d.avg, d.max]);
    const minVal = Math.min(...allValues);
    const maxVal = Math.max(...allValues);
    const padding = Math.max(5, Math.round((maxVal - minVal) * 0.1));
    const yDomain: [number, number] = [Math.max(0, minVal - padding), maxVal + padding];

    return (
        <div style={{ background: '#fff', borderRadius: '10px', padding: '16px', marginBottom: '16px', boxShadow: '0 2px 8px rgba(0,0,0,0.07)' }}>
            <h3 style={{ margin: '0 0 12px', fontSize: '1.1rem' }}>Heart Rate Trend</h3>
            <ResponsiveContainer width="100%" height={220}>
                <LineChart data={chartData} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="period" tick={{ fontSize: 11 }} interval={Math.ceil(chartData.length / 8)} />
                    <YAxis domain={yDomain} tick={{ fontSize: 11 }} width={35} />
                    <Tooltip formatter={(value: any, name: any) => [`${value} bpm`, SERIES_LABELS[name] ?? name]} />
                    <Legend formatter={(value: string) => SERIES_LABELS[value] ?? value} wrapperStyle={{ fontSize: '0.8rem' }} />
                    <Line type="monotone" dataKey="avg" stroke="#FC4C02" strokeWidth={2} dot={{ r: 3 }} />
                    <Line type="monotone" dataKey="max" stroke="#888" strokeWidth={2} strokeDasharray="4 4" dot={{ r: 3 }} />
                </LineChart>
            </ResponsiveContainer>
        </div>
    );
};

export default HeartRateTrendChart;
