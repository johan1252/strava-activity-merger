import React from 'react';

const Footer: React.FC = () => (
    <footer style={{ position: 'relative', textAlign: 'center', padding: '20px', backgroundColor: '#FC4C02', color: 'white', marginTop: 'auto' }}>
        <img
            src="/powered-by-strava.svg"
            alt="Powered by Strava"
            style={{
                position: 'absolute',
                left: '20px',
                bottom: '20px',
                height: '20px',
                width: 'auto',
                padding: '2px 6px',
            }}
        />
        <p style={{ margin: '0', fontSize: '0.9rem' }}>
            <a href="/privacy-policy" style={{ margin: '0 10px', color: 'white', textDecoration: 'none' }}>Privacy Policy</a>
            <a href="/terms-of-service" style={{ margin: '0 10px', color: 'white', textDecoration: 'none' }}>Terms of Service</a>
        </p>
    </footer>
);

export default Footer;
