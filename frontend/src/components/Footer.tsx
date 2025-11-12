import React from 'react';

const Footer: React.FC = () => (
    <footer
        style={{
            position: 'relative',
            textAlign: 'center',
            padding: '10px',
            backgroundColor: '#FC4C02',
            color: 'white',
            marginTop: 'auto',
        }}
    >
        <div
            style={{
                display: 'flex',
                flexDirection: 'row',
                flexWrap: 'wrap',
                alignItems: 'center',
                justifyContent: 'center',
            }}
        >
                <p
                style={{
                    margin: 0,
                    fontSize: '0.9rem',
                    width: '100%',
                    textAlign: 'center',
                }}
            >
                <a href="/privacy-policy" style={{ margin: '0 10px', color: 'white', textDecoration: 'none' }}>Privacy Policy</a>
                <a href="/terms-of-service" style={{ margin: '0 10px', color: 'white', textDecoration: 'none' }}>Terms of Service</a>
                <a href="/faq" style={{ margin: '0 10px', color: 'white', textDecoration: 'none' }}>FAQ</a>
            </p>
            <img
                src="/powered-by-strava.svg"
                alt="Powered by Strava"
                style={{
                    height: '20px',
                    width: 'auto',
                    padding: '2px 6px',
                    marginLeft: 'auto',
                }}
            />
        </div>
    </footer>
);
export default Footer;
