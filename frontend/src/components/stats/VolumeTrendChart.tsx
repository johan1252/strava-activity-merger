import React from 'react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { formatTrendLabel, BucketUnit } from '../../utils/formatTrendLabel';
import { sportTypeToIcon } from '../../utils/sportTypeToIcon';
import { sportTypes } from '../SportTypeDropdown';

interface VolumeTrendPoint {
    periodStart: string;
    distance: number;
    count: number;
}

export type VolumeTrendSportFilter = 'All' | 'Ride' | 'Run' | 'Walk' | 'Hike' | 'Swim';

const VolumeTrendChart: React.FC<{
    data: VolumeTrendPoint[];
    bucketUnit: BucketUnit;
    sportFilter: VolumeTrendSportFilter;
    onSportFilterChange: (sport: VolumeTrendSportFilter) => void;
}> = ({ data, bucketUnit, sportFilter, onSportFilterChange }) => {
    const chartData = data.map(d => ({
        period: formatTrendLabel(d.periodStart, bucketUnit),
        km: Math.round((d.distance / 1000) * 10) / 10,
    }));

    return (
        <div style={{ background: '#fff', borderRadius: '10px', padding: '16px', marginBottom: '16px', boxShadow: '0 2px 8px rgba(0,0,0,0.07)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                <h3 style={{ margin: 0, fontSize: '1.1rem' }}>Distance</h3>
                <div style={{ display: 'flex', gap: '4px' }}>
                    {sportTypes.map(({ label, value }) => (
                        <button
                            key={value}
                            type="button"
                            title={label}
                            aria-label={label}
                            aria-pressed={sportFilter === value}
                            onClick={() => onSportFilterChange(value as VolumeTrendSportFilter)}
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                width: '26px',
                                height: '26px',
                                padding: 0,
                                borderRadius: '6px',
                                border: sportFilter === value ? '1.5px solid #FC4C02' : '1px solid #ddd',
                                background: sportFilter === value ? '#fff7f2' : '#fff',
                                color: sportFilter === value ? '#FC4C02' : '#888',
                                cursor: 'pointer',
                            }}
                        >
                            <span style={{ width: '16px', height: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                {/* sportTypeToIcon's svgs hardcode width/height="24" as attributes, which a
                                    wrapping span's size can't override — clone with explicit smaller sizing
                                    so the icon actually shrinks to fit the button instead of overflowing it. */}
                                {React.cloneElement(sportTypeToIcon(value), { width: 16, height: 16 })}
                            </span>
                        </button>
                    ))}
                </div>
            </div>
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
