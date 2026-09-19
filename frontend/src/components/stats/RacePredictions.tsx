import React from 'react';

interface RacePrediction {
    distanceLabel: string;
    distanceMeters: number;
    predictedSeconds: number;
    sourceActivityId: number;
}

function formatDuration(totalSeconds: number): string {
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = Math.round(totalSeconds % 60);
    const mm = hours > 0 ? String(minutes).padStart(2, '0') : String(minutes);
    const ss = String(seconds).padStart(2, '0');
    return hours > 0 ? `${hours}:${mm}:${ss}` : `${mm}:${ss}`;
}

const RacePredictions: React.FC<{ data: RacePrediction[] }> = ({ data }) => {
    if (data.length === 0) {
        return (
            <div style={{ background: '#fff', borderRadius: '10px', padding: '16px', marginBottom: '16px', boxShadow: '0 2px 8px rgba(0,0,0,0.07)', color: '#888' }}>
                <h3 style={{ margin: '0 0 8px', fontSize: '1.1rem' }}>Race Predictions</h3>
                Not enough recent running data yet — log a few runs of 3km or more to see predicted race times.
            </div>
        );
    }

    return (
        <div style={{ background: '#fff', borderRadius: '10px', padding: '16px', marginBottom: '16px', boxShadow: '0 2px 8px rgba(0,0,0,0.07)' }}>
            <h3 style={{ margin: '0 0 4px', fontSize: '1.1rem' }}>Race Predictions</h3>
            <div style={{ color: '#888', fontSize: '0.8rem', marginBottom: '12px' }}>
                Based on your best runs over the last ~4 months
            </div>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                {data.map(p => (
                    <div key={p.distanceLabel} style={{ flex: '1 1 100px', textAlign: 'center', padding: '10px 6px', background: '#fff7f2', borderRadius: '8px' }}>
                        <div style={{ fontSize: '0.8rem', color: '#888', fontWeight: 600 }}>{p.distanceLabel}</div>
                        <div style={{ fontSize: '1.3rem', fontWeight: 700, color: '#FC4C02' }}>{formatDuration(p.predictedSeconds)}</div>
                    </div>
                ))}
            </div>
        </div>
    );
};

export default RacePredictions;
