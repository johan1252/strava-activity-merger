import React from 'react';
import Header from '../components/Header';
import Footer from '../components/Footer';

const PrivacyPolicy: React.FC = () => (
    <div className="App" style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', maxWidth: '100vw', justifyContent: 'space-between' }}>
        <Header />
        <div style={{ maxHeight: '100vh', maxWidth: '700px', margin: '40px auto', padding: '20px', background: '#fff', borderRadius: '8px', boxShadow: '0 2px 8px rgba(0,0,0,0.07)' }}>
            <h1>Privacy Policy</h1>
            <p>Your privacy is important to us. This Privacy Policy explains how we collect, use, and protect your information when you use Streven.</p>
            <h2>Information We Collect</h2>
            <ul>
                <li>We do not store your personal information or activity data.</li>
            </ul>
            <h2>How We Use Your Information</h2>
            <ul>
                <li>Your activity data is used solely to merge activities and display results to you.</li>
                <li>We do not share your data with third parties.</li>
            </ul>
            <h2>Data Security</h2>
            <ul>
                <li>We use industry-standard security measures to protect your data.</li>
            </ul>
        </div>
        <Footer />
    </div>
);

export default PrivacyPolicy;
