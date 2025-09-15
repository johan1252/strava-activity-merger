import React from 'react';

const Header: React.FC = () => (
    <header className="App-header" style={{ textAlign: 'center', padding: '20px', backgroundColor: '#FC4C02', color: 'white' }}>
        <a href="/" style={{ textDecoration: 'none', color: 'inherit' }}>
            <h1 style={{ margin: '0', fontSize: '2.5rem' }}>Streven</h1>
        </a>
        <p style={{ margin: '0', fontSize: '1.2rem' }}>Collection of tools to correct your Strava activities</p>
    </header>
);

export default Header;
