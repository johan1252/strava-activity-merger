import React, { useState } from 'react';
import { LineChart, Line, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, CartesianGrid } from 'recharts';
import { formatTrendLabel, BucketUnit } from '../../utils/formatTrendLabel';
import { sportTypeToIcon } from '../../utils/sportTypeToIcon';
import { sportTypes } from '../SportTypeDropdown';

interface VolumeTrendPoint {
    periodStart: string;
    distance: number;
    count: number;
}

export type VolumeTrendSportFilter = 'All' | 'Ride' | 'Run' | 'Walk' | 'Hike' | 'Swim';

const INDIVIDUAL_SPORTS: Exclude<VolumeTrendSportFilter, 'All'>[] = ['Ride', 'Run', 'Walk', 'Hike', 'Swim'];

// Distinct per-sport colors for the "All" overlay view. Run keeps the Strava brand orange
// used for the single-sport line elsewhere, since it's the primary activity for most users.
const SPORT_COLORS: Record<Exclude<VolumeTrendSportFilter, 'All'>, string> = {
    Run: '#FC4C02',
    Ride: '#1E88E5',
    Walk: '#43A047',
    Hike: '#8E24AA',
    Swim: '#00ACC1',
};

const VolumeTrendChart: React.FC<{
    volumeTrendBySport: Record<VolumeTrendSportFilter, VolumeTrendPoint[]>;
    bucketUnit: BucketUnit;
    sportFilter: VolumeTrendSportFilter;
    onSportFilterChange: (sport: VolumeTrendSportFilter) => void;
}> = ({ volumeTrendBySport, bucketUnit, sportFilter, onSportFilterChange }) => {
    const isAll = sportFilter === 'All';
    // Legend-click selection, independent of the icon filter above. null means "showing
    // everything" (the default). The first click isolates to just that sport; clicking a
    // further sport adds it to the visible set instead of replacing it; clicking a visible
    // sport removes it, and removing the last one falls back to showing everything again.
    const [visibleSports, setVisibleSports] = useState<Set<string> | null>(null);
    const toggleSportVisible = (sport: string) => {
        setVisibleSports(prev => {
            if (prev === null) return new Set([sport]);
            const next = new Set(prev);
            if (next.has(sport)) next.delete(sport); else next.add(sport);
            return next.size === 0 ? null : next;
        });
    };

    // In "All" mode, overlay one line per sport instead of a single combined total. Every
    // sport's trend is bucketed from the same timeframe (computeVolumeTrend pre-seeds every
    // bucket key regardless of activity data), so they share an identical period sequence
    // and can be zipped together by index into one multi-series dataset.
    const chartData = isAll
        ? volumeTrendBySport.Run.map((_, i) => {
            const point: Record<string, string | number> = {
                period: formatTrendLabel(volumeTrendBySport.Run[i].periodStart, bucketUnit),
            };
            for (const sport of INDIVIDUAL_SPORTS) {
                point[sport] = Math.round((volumeTrendBySport[sport][i].distance / 1000) * 10) / 10;
            }
            return point;
        })
        : volumeTrendBySport[sportFilter].map(d => ({
            period: formatTrendLabel(d.periodStart, bucketUnit),
            km: Math.round((d.distance / 1000) * 10) / 10,
        }));

    // Skip a sport's line entirely (and its legend entry) when it has zero distance across
    // the whole visible range — otherwise it's just a flat line at 0 cluttering the chart.
    const activeSports = isAll
        ? INDIVIDUAL_SPORTS.filter(sport => volumeTrendBySport[sport].some(p => p.distance > 0))
        : [];

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
                    <Tooltip formatter={(value: any, name: string) => [`${value} km`, name]} />
                    {isAll ? (
                        <>
                            <Legend
                                wrapperStyle={{ fontSize: '0.75rem' }}
                                iconSize={10}
                                onClick={entry => toggleSportVisible(entry.dataKey as string)}
                                formatter={(value, entry) => {
                                    const isHidden = visibleSports !== null && !visibleSports.has(entry.dataKey as string);
                                    return (
                                        <span style={{ cursor: 'pointer', opacity: isHidden ? 0.4 : 1, textDecoration: isHidden ? 'line-through' : 'none' }}>
                                            {value}
                                        </span>
                                    );
                                }}
                            />
                            {activeSports.map(sport => (
                                <Line
                                    key={sport}
                                    type="monotone"
                                    dataKey={sport}
                                    name={sport}
                                    stroke={SPORT_COLORS[sport]}
                                    strokeWidth={2}
                                    dot={{ r: 2 }}
                                    hide={visibleSports !== null && !visibleSports.has(sport)}
                                />
                            ))}
                        </>
                    ) : (
                        <Line type="monotone" dataKey="km" name="Distance" stroke="#FC4C02" strokeWidth={2} dot={{ r: 3 }} />
                    )}
                </LineChart>
            </ResponsiveContainer>
        </div>
    );
};

export default VolumeTrendChart;
