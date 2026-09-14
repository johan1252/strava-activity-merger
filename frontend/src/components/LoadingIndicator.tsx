import React from 'react';

const LoadingIndicator: React.FC<{ message?: string; size?: number; padding?: string }> = ({
    message = 'Loading...',
    size = 40,
    padding = '60px 20px',
}) => (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding, color: '#888', width: '100%' }}>
        <div
            style={{
                width: `${size}px`,
                height: `${size}px`,
                border: '3px solid rgba(0, 0, 0, 0.1)',
                borderTop: '3px solid #FC4C02',
                borderRadius: '50%',
                animation: 'appLoadingSpin 0.8s linear infinite',
            }}
        />
        {message && <p style={{ marginTop: '14px', fontSize: '1rem' }}>{message}</p>}
        <style>{`
            @keyframes appLoadingSpin {
                0% { transform: rotate(0deg); }
                100% { transform: rotate(360deg); }
            }
        `}</style>
    </div>
);

export default LoadingIndicator;
