import React from 'react';
import Header from '../components/Header';
import Footer from '../components/Footer';
import { usePageMeta } from '../utils/pageMeta';

const NotFound: React.FC = () => {
    usePageMeta({
        title: 'Page not found | Streven',
        description: 'This page does not exist.',
        path: '/',
        noindex: true,
    });

    return (
        <div className="App" style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', maxWidth: '100vw', justifyContent: 'space-between' }}>
            <Header />
            <main style={{ maxWidth: '600px', margin: '40px auto', padding: '20px', textAlign: 'center' }}>
                <h1>Page not found</h1>
                <p>We couldn't find that page. <a href="/" style={{ color: '#FC4C02' }}>Go to the Streven home page</a>.</p>
            </main>
            <Footer />
        </div>
    );
};

export default NotFound;
