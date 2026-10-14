import React from 'react';

export type SyncStatus = 'ready' | 'in_progress' | 'not_started';

export const SYNC_STATUS_MESSAGE: Record<Exclude<SyncStatus, 'ready'>, string> = {
    in_progress: "We're still importing your Strava history — check back in a few minutes to set a race goal.",
    not_started: 'Visit the Activities tab to start importing your Strava history, then come back here to set a race goal.',
};

export const cardStyle: React.CSSProperties = {
    background: '#fff',
    borderRadius: '10px',
    padding: '16px',
    marginBottom: '16px',
    boxShadow: '0 2px 8px rgba(0,0,0,0.07)',
};

export function formatDuration(totalSeconds: number): string {
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = Math.round(totalSeconds % 60);
    const mm = hours > 0 ? String(minutes).padStart(2, '0') : String(minutes);
    const ss = String(seconds).padStart(2, '0');
    return hours > 0 ? `${hours}:${mm}:${ss}` : `${mm}:${ss}`;
}

export function formatFullDate(dateStr: string): string {
    const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' };
    return new Date(`${dateStr}T00:00:00Z`).toLocaleDateString(undefined, opts);
}

export const Banner: React.FC<{ children: React.ReactNode; tone?: 'info' | 'error' }> = ({ children, tone = 'info' }) => (
    <div
        style={{
            ...cardStyle,
            background: tone === 'error' ? '#fdecea' : '#fff7f2',
            border: `1px solid ${tone === 'error' ? '#f5c2c0' : '#ffd9c2'}`,
            color: tone === 'error' ? '#a33' : '#555',
            fontSize: '0.9rem',
        }}
    >
        {children}
    </div>
);
