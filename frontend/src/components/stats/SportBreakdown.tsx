import React from 'react';

interface SportBreakdownEntry {
    sportType: string;
    distance: number;
    count: number;
}

const SportBreakdown: React.FC<{ data: SportBreakdownEntry[] }> = ({ data }) => {
    if (data.length === 0) return null;
    const maxDistance = Math.max(...data.map(d => d.distance));

    return (
        <div style={{ background: '#fff', borderRadius: '10px', padding: '16px', marginBottom: '16px', boxShadow: '0 2px 8px rgba(0,0,0,0.07)' }}>
            <h3 style={{ margin: '0 0 12px', fontSize: '1.1rem' }}>Sport Breakdown</h3>
            {data.map(entry => (
                <div key={entry.sportType} style={{ marginBottom: '10px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem', marginBottom: '4px' }}>
                        <span>{entry.sportType} ({entry.count})</span>
                        <span>{(entry.distance / 1000).toFixed(1)} km</span>
                    </div>
                    <div style={{ background: '#eee', borderRadius: '4px', height: '8px', overflow: 'hidden' }}>
                        <div style={{ width: `${(entry.distance / maxDistance) * 100}%`, background: '#FC4C02', height: '100%' }} />
                    </div>
                </div>
            ))}
        </div>
    );
};

export default SportBreakdown;
