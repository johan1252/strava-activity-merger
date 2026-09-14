import React, { useState, useMemo } from 'react';

interface CalendarDay {
    date: string; // 'YYYY-MM-DD'
    count: number;
    distance: number;
}

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function toDateKey(year: number, month: number, day: number): string {
    return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

const ActivityCalendar: React.FC<{ data: CalendarDay[] }> = ({ data }) => {
    const today = new Date();
    const [viewYear, setViewYear] = useState(today.getFullYear());
    const [viewMonth, setViewMonth] = useState(today.getMonth()); // 0-indexed

    const byDate = useMemo(() => {
        const map = new Map<string, CalendarDay>();
        for (const d of data) map.set(d.date, d);
        return map;
    }, [data]);

    const firstOfMonth = new Date(viewYear, viewMonth, 1);
    const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
    // getDay(): 0=Sunday..6=Saturday. Convert to Monday-first index (0=Mon..6=Sun).
    const firstWeekday = (firstOfMonth.getDay() + 6) % 7;

    const cells: (number | null)[] = [
        ...Array(firstWeekday).fill(null),
        ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
    ];
    while (cells.length % 7 !== 0) cells.push(null);

    const monthLabel = firstOfMonth.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });

    const goPrev = () => {
        if (viewMonth === 0) { setViewYear(y => y - 1); setViewMonth(11); }
        else setViewMonth(m => m - 1);
    };
    const goNext = () => {
        if (viewMonth === 11) { setViewYear(y => y + 1); setViewMonth(0); }
        else setViewMonth(m => m + 1);
    };

    return (
        <div style={{ background: '#fff', borderRadius: '10px', padding: '16px', marginBottom: '16px', boxShadow: '0 2px 8px rgba(0,0,0,0.07)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                <button onClick={goPrev} style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: '1.2rem', padding: '4px 10px' }}>‹</button>
                <h3 style={{ margin: 0, fontSize: '1.1rem' }}>{monthLabel}</h3>
                <button onClick={goNext} style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: '1.2rem', padding: '4px 10px' }}>›</button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '4px', fontSize: '0.75rem', color: '#888', marginBottom: '4px' }}>
                {DAY_LABELS.map(label => <div key={label} style={{ textAlign: 'center' }}>{label}</div>)}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '4px' }}>
                {cells.map((day, i) => {
                    if (day === null) return <div key={i} />;
                    const dateKey = toDateKey(viewYear, viewMonth, day);
                    const entry = byDate.get(dateKey);
                    const active = !!entry;
                    return (
                        <div
                            key={i}
                            title={active ? `${(entry!.distance / 1000).toFixed(1)} km, ${entry!.count} activit${entry!.count === 1 ? 'y' : 'ies'}` : undefined}
                            style={{
                                aspectRatio: '1',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                borderRadius: '6px',
                                fontSize: '0.8rem',
                                background: active ? '#FC4C02' : '#f0f0f0',
                                color: active ? '#fff' : '#888',
                                fontWeight: active ? 700 : 400,
                            }}
                        >
                            {day}
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

export default ActivityCalendar;
