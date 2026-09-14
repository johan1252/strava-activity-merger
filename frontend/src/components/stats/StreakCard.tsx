import React from 'react';

interface Streak {
    current: number;
    longest: number;
}

function pluralize(value: number, unit: string): string {
    return value === 1 ? unit : `${unit}s`;
}

const StatBox: React.FC<{ value: number; unit: string; label: string; highlight?: boolean }> = ({ value, unit, label, highlight }) => (
    <div style={{ textAlign: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'center', gap: '4px' }}>
            <span style={{ fontSize: '2rem', fontWeight: 700, color: highlight ? '#FC4C02' : '#333' }}>{value}</span>
            <span style={{ fontSize: '0.85rem', color: '#888', fontWeight: 600 }}>{pluralize(value, unit)}</span>
        </div>
        <div style={{ color: '#888', fontSize: '0.9rem' }}>{label}</div>
    </div>
);

const SectionLabel: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <h4 style={{ margin: '0 0 8px', fontSize: '0.8rem', color: '#888', textTransform: 'uppercase', letterSpacing: '0.5px', textAlign: 'center' }}>
        {children}
    </h4>
);

const StreakCard: React.FC<{ dayStreak: Streak; weekStreak: Streak }> = ({ dayStreak, weekStreak }) => {
    return (
        <div style={{ background: '#fff', borderRadius: '10px', padding: '16px', marginBottom: '16px', boxShadow: '0 2px 8px rgba(0,0,0,0.07)' }}>
            <div style={{ marginBottom: '16px' }}>
                <SectionLabel>Daily Streak</SectionLabel>
                <div style={{ display: 'flex', gap: '16px', justifyContent: 'center' }}>
                    <StatBox value={dayStreak.current} unit="day" label="Current" highlight />
                    <StatBox value={dayStreak.longest} unit="day" label="Longest" />
                </div>
            </div>
            <div style={{ paddingTop: '16px', borderTop: '1px solid #eee' }}>
                <SectionLabel>Weekly Streak</SectionLabel>
                <div style={{ display: 'flex', gap: '16px', justifyContent: 'center' }}>
                    <StatBox value={weekStreak.current} unit="week" label="Current" highlight />
                    <StatBox value={weekStreak.longest} unit="week" label="Longest" />
                </div>
            </div>
        </div>
    );
};

export default StreakCard;
