import React from 'react';

const Header: React.FC = () => (
    <header className="App-header" style={{ textAlign: 'center', padding: '10px', backgroundColor: '#FC4C02', color: 'white' }}>
        <a href="/" style={{ textDecoration: 'none', color: 'inherit' }}>
            <div style={{ margin: '0', fontSize: '2.3rem', fontWeight: 'bold' }}>Streven</div>
        </a>
        <p style={{ margin: '0', fontSize: '1.0rem' }}>Strava tools to fix your activities and plan your training</p>
    </header>
);

export default Header;
