import React from 'react';

const StreakCard: React.FC<{ current: number; longest: number }> = ({ current, longest }) => {
    return (
        <div style={{ background: '#fff', borderRadius: '10px', padding: '16px', marginBottom: '16px', boxShadow: '0 2px 8px rgba(0,0,0,0.07)', display: 'flex', gap: '32px', justifyContent: 'center' }}>
            <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '2rem', fontWeight: 700, color: '#FC4C02' }}>{current}</div>
                <div style={{ color: '#888', fontSize: '0.9rem' }}>Current streak (days)</div>
            </div>
            <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '2rem', fontWeight: 700, color: '#333' }}>{longest}</div>
                <div style={{ color: '#888', fontSize: '0.9rem' }}>Longest streak (days)</div>
            </div>
        </div>
    );
};

export default StreakCard;
