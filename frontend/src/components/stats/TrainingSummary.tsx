import React, { useEffect, useState } from 'react';
import { fetchWithAuth } from '../../utils/api';

const InlineSpinner: React.FC = () => (
    <>
        <span
            style={{
                display: 'inline-block',
                width: '12px',
                height: '12px',
                border: '2px solid rgba(0, 0, 0, 0.1)',
                borderTop: '2px solid #FC4C02',
                borderRadius: '50%',
                animation: 'trainingSummarySpin 0.8s linear infinite',
            }}
        />
        <style>{`
            @keyframes trainingSummarySpin {
                0% { transform: rotate(0deg); }
                100% { transform: rotate(360deg); }
            }
        `}</style>
    </>
);

const TrainingSummary: React.FC = () => {
    const [summary, setSummary] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [failed, setFailed] = useState(false);
    const [isMinimized, setIsMinimized] = useState(false);

    useEffect(() => {
        let cancelled = false;
        const load = async () => {
            try {
                const data = await fetchWithAuth('/stats/training-summary');
                if (!cancelled) setSummary(data.summary || null);
            } catch (err) {
                console.error('Error fetching training summary:', err);
                if (!cancelled) setFailed(true);
            } finally {
                if (!cancelled) setIsLoading(false);
            }
        };
        load();
        return () => { cancelled = true; };
    }, []);

    // Fails silently — the deterministic stats below stand on their own, and this can
    // fail until Bedrock/Grok access is configured for the environment.
    if (failed || (!isLoading && !summary)) return null;

    // Show the paragraph only once loaded and not manually minimized. While loading,
    // the card stays a thin header bar with just an inline spinner — no need to reserve
    // space for the eventual text before it exists.
    const canToggle = !isLoading && !!summary;
    const showBody = canToggle && !isMinimized;

    const toggle = () => {
        if (canToggle) setIsMinimized(m => !m);
    };

    return (
        <div
            onClick={toggle}
            onKeyDown={e => {
                if (canToggle && (e.key === 'Enter' || e.key === ' ')) {
                    e.preventDefault();
                    toggle();
                }
            }}
            role={canToggle ? 'button' : undefined}
            tabIndex={canToggle ? 0 : undefined}
            aria-expanded={canToggle ? !isMinimized : undefined}
            style={{
                background: 'linear-gradient(135deg, #fff7f2, #ffffff)',
                border: '1px solid #ffd9c2',
                borderRadius: '10px',
                padding: '16px',
                marginBottom: '16px',
                cursor: canToggle ? 'pointer' : 'default',
            }}
        >
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: showBody ? '8px' : 0 }}>
                <span
                    style={{
                        fontSize: '0.65rem',
                        fontWeight: 700,
                        color: '#FC4C02',
                        border: '1px solid #FC4C02',
                        borderRadius: '10px',
                        padding: '1px 7px',
                        letterSpacing: '0.5px',
                    }}
                >
                    AI
                </span>
                <h3 style={{ margin: 0, fontSize: '1rem', flex: 1 }}>Training Summary</h3>
                {isLoading && <InlineSpinner />}
                {canToggle && (
                    <span style={{ fontSize: '0.9rem', color: '#888', padding: '2px 6px', lineHeight: 1 }}>
                        {isMinimized ? '▸' : '▾'}
                    </span>
                )}
            </div>
            {showBody && (
                <p style={{ margin: 0, color: '#333', lineHeight: 1.5, fontSize: '0.95rem' }}>{summary}</p>
            )}
        </div>
    );
};

export default TrainingSummary;
