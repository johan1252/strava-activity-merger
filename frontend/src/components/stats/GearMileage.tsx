import React from 'react';

interface GearStat {
    id: string;
    name: string;
    type: 'shoe' | 'bike';
    distance: number;
}

const SHOE_LIFESPAN_KM = 650; // rough midpoint of the commonly cited 500-800km shoe lifespan

const GearMileage: React.FC<{ data: GearStat[] }> = ({ data }) => {
    if (data.length === 0) return null;

    return (
        <div style={{ background: '#fff', borderRadius: '10px', padding: '16px', marginBottom: '16px', boxShadow: '0 2px 8px rgba(0,0,0,0.07)' }}>
            <h3 style={{ margin: '0 0 12px', fontSize: '1.1rem' }}>Gear Mileage</h3>
            {data.map(gear => {
                const km = gear.distance / 1000;
                const isShoe = gear.type === 'shoe';
                const wearPercent = isShoe ? Math.min(100, (km / SHOE_LIFESPAN_KM) * 100) : 0;
                return (
                    <div key={gear.id} style={{ marginBottom: '10px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem', marginBottom: '4px' }}>
                            <span>{gear.name}</span>
                            <span>{km.toFixed(0)} km</span>
                        </div>
                        {isShoe && (
                            <div style={{ background: '#eee', borderRadius: '4px', height: '8px', overflow: 'hidden' }}>
                                <div style={{
                                    width: `${wearPercent}%`,
                                    background: wearPercent > 90 ? '#d32f2f' : wearPercent > 70 ? '#f57c00' : '#4caf50',
                                    height: '100%',
                                }} />
                            </div>
                        )}
                        {isShoe && wearPercent > 80 && (
                            <div style={{ fontSize: '0.8rem', color: '#d32f2f', marginTop: '2px' }}>
                                Getting up there — most shoes last ~500-800km
                            </div>
                        )}
                    </div>
                );
            })}
        </div>
    );
};

export default GearMileage;
