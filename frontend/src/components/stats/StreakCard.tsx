import React from 'react';

interface Streak {
    current: number;
    longest: number;
}

const StatBox: React.FC<{ value: number; label: string; highlight?: boolean }> = ({ value, label, highlight }) => (
    <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: '2rem', fontWeight: 700, color: highlight ? '#FC4C02' : '#333' }}>{value}</div>
        <div style={{ color: '#888', fontSize: '0.9rem' }}>{label}</div>
    </div>
);

const StreakCard: React.FC<{ dayStreak: Streak; weekStreak: Streak }> = ({ dayStreak, weekStreak }) => {
    return (
        <div style={{ background: '#fff', borderRadius: '10px', padding: '16px', marginBottom: '16px', boxShadow: '0 2px 8px rgba(0,0,0,0.07)' }}>
            <div style={{ display: 'flex', gap: '32px', justifyContent: 'center', marginBottom: '16px' }}>
                <StatBox value={dayStreak.current} label="Current streak (days)" highlight />
                <StatBox value={dayStreak.longest} label="Longest streak (days)" />
            </div>
            <div style={{ display: 'flex', gap: '32px', justifyContent: 'center', paddingTop: '16px', borderTop: '1px solid #eee' }}>
                <StatBox value={weekStreak.current} label="Current streak (weeks)" highlight />
                <StatBox value={weekStreak.longest} label="Longest streak (weeks)" />
            </div>
        </div>
    );
};

export default StreakCard;
