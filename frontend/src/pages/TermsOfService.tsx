import React from 'react';
import Header from '../components/Header';
import Footer from '../components/Footer';

const TermsOfService: React.FC = () => (
    <>
        <Header />
        <div style={{ maxWidth: '700px', margin: '40px auto', padding: '20px', background: '#fff', borderRadius: '8px', boxShadow: '0 2px 8px rgba(0,0,0,0.07)' }}>
            <h1>Terms of Service</h1>
            <p>Welcome to Streven. By using our web application, you agree to the following terms and conditions:</p>
            <h2>1. Acceptance of Terms</h2>
            <p>By accessing or using this service, you agree to be bound by these Terms of Service and our Privacy Policy.</p>
            <h2>2. Use of Service</h2>
            <ul>
                <li>You may use this service only for lawful purposes and in accordance with these terms.</li>
                <li>You must not misuse the service or attempt to access it using unauthorized means.</li>
            </ul>
            <h2>3. User Data</h2>
            <ul>
                <li>We do not store your personal information or activity data beyond what is necessary to provide the service.</li>
                <li>Your data is not shared with third parties.</li>
            </ul>
            <h2>4. Intellectual Property</h2>
            <ul>
                <li>All content, trademarks, and data on this site are the property of their respective owners.</li>
                <li>You may not copy, modify, or distribute any part of the service without permission.</li>
            </ul>
            <h2>5. Disclaimer</h2>
            <ul>
                <li>This service is provided "as is" without warranties of any kind.</li>
                <li>We are not responsible for any loss or damage resulting from the use of this service.</li>
            </ul>
            <h2>6. Changes to Terms</h2>
            <p>We reserve the right to update these terms at any time. Continued use of the service after changes constitutes acceptance of those changes.</p>
        </div>
        <Footer />
    </>
);

export default TermsOfService;
