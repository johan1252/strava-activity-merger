import React, { useEffect, useState } from 'react';
import { BrowserRouter as Router, Route, Routes, useLocation } from 'react-router-dom';
import './App.css';
import querystring from 'querystring';
import { API_BASE_URL, STRAVA_CLIENT_ID } from './config';
import ActivityList from './components/ActivityList';

const getStraveAuthorizeUrl = (clientId: string, redirectURI: string) => {
    var url = 'https://www.strava.com/oauth/authorize?';
    var oauthArgs = {
        client_id: clientId,
        redirect_uri: redirectURI,
        response_type: 'code',
        scope: 'activity:write,activity:read,activity:read_all',
    };

    var qs = querystring.stringify(oauthArgs);

    url += qs;
    return url;
};

const handleAuthorizeClick = () => {
    const clientId = STRAVA_CLIENT_ID;
    // Use either localhost or your production URL (https://streventools.com/strava-callback)   
    // Make sure to set the redirect URI (authorization callback domain) in your Strava app settings to match this URL
    const redirectURI = window.location.hostname === 'localhost'
        ? 'http://localhost:3000/strava-callback'
        : 'https://streventools.com/strava-callback';
    const url = getStraveAuthorizeUrl(clientId, redirectURI);
    window.location.href = url;
};

const Home: React.FC = () => {
    const [athlete, setAthlete] = useState<any>(null);
    const [activities, setActivities] = useState<any[]>([]);

    const reloadActivities = () => {
        const token = sessionStorage.getItem('token');
        if (token) {
            const parsedToken = JSON.parse(token);
            fetch(`${API_BASE_URL}/activities`, {
                method: 'GET',
                headers: {
                    Authorization: `Bearer ${parsedToken.accessToken}`,
                },
            })
                .then((response) => {
                    if (!response.ok) {
                        throw new Error('Failed to fetch activities');
                    }
                    return response.json();
                })
                .then((data) => {
                    setActivities(data.activities);
                })
                .catch((error) => {
                    console.error('Error fetching activities:', error);
                });
        }
    };

    useEffect(() => {
        const token = sessionStorage.getItem('token');
        const athleteInfo = sessionStorage.getItem('athlete');

        if (token) {
            const parsedToken = JSON.parse(token);
            const currentTime = Math.floor(Date.now() / 1000); // Current time in seconds
            if (parsedToken.expiresAt > currentTime) {
                if (athleteInfo) {
                    setAthlete(JSON.parse(athleteInfo));
                }
            } else {
                sessionStorage.removeItem('token');
                sessionStorage.removeItem('athlete');
            }
        }
    }, []);

    useEffect(() => {
        if (athlete) {
            reloadActivities();
        }
    }, [athlete]);

    const handleLogout = () => {
        sessionStorage.removeItem('token');
        sessionStorage.removeItem('athlete');
        setAthlete(null);
        setActivities([]);
        window.location.reload(); // Reload the page to reset the state
    };

    return (
        <div className="App" style={{ display: 'flex', flexDirection: 'column', minHeight: '85vh', maxWidth: '100vw', justifyContent: 'space-between' }}>
            <header className="App-header" style={{ textAlign: 'center', padding: '20px', backgroundColor: '#FC4C02', color: 'white' }}>
                <h1 style={{ margin: '0', fontSize: '2.5rem' }}>Streven</h1>
                <p style={{ margin: '0', fontSize: '1.2rem' }}>Collection of tools to correct your Strava activities</p>
            </header>

            <main style={{ padding: '20px', textAlign: 'center' }}>
                {athlete ? (
                    <div>
                        <button
                            onClick={handleLogout}
                            style={{
                                position: 'absolute',
                                top: '10px',
                                right: '10px',
                                backgroundColor: '#FC4C02',
                                color: 'white',
                                border: 'none',
                                padding: '10px 20px',
                                fontSize: '14px',
                                cursor: 'pointer',
                                borderRadius: '5px',
                                boxShadow: '0px 4px 6px rgba(0, 0, 0, 0.1)',
                            }}
                        >
                            Log Out
                        </button>
                        <h1>Welcome, {athlete.firstname} {athlete.lastname}!</h1>
                        <img src={athlete.profile} alt="Athlete Profile" style={{ borderRadius: '50%', width: '100px', height: '100px' }} />
                        <p>Strava ID: {athlete.id}</p>
                        {activities.length > 0 ? (
                            <ActivityList activities={activities} reloadActivities={reloadActivities} />
                        ) : athlete ? (
                            <p>Loading activities...</p>
                        ) : (
                            <p>No activities found.</p>
                        )}
                    </div>
                ) : (
                    <section style={{ marginTop: '50px' }}>
                        <h2>Getting Started</h2>
                        <button
                            style={{
                                padding: '10px 20px',
                                cursor: 'pointer',
                                transition: 'color 0.3s ease',
                                border: 'none',
                            }}
                            onClick={handleAuthorizeClick}
                            onMouseEnter={(e) => {
                                e.currentTarget.style.opacity = '0.8';
                            }}
                            onMouseLeave={(e) => {
                                e.currentTarget.style.opacity = '1';
                            }}
                        >
                            <img
                                src="/connect-with-strava.svg"
                                alt="Connect with Strava"
                                style={{ width: '200px', height: 'auto' }}
                            />
                        </button>
                    </section>
                )}
            </main>

            <footer style={{ textAlign: 'center', padding: '20px', backgroundColor: '#FC4C02', color: 'white', marginTop: 'auto' }}>
                <p style={{ margin: '0', fontSize: '0.9rem' }}>
                    <a href="/faq" style={{ margin: '0 10px', color: 'white', textDecoration: 'none' }}>FAQ</a>
                    <a href="/privacy-policy" style={{ margin: '0 10px', color: 'white', textDecoration: 'none' }}>Privacy Policy</a>
                    <a href="/terms-of-service" style={{ margin: '0 10px', color: 'white', textDecoration: 'none' }}>Terms of Service</a>
                </p>
            </footer>
        </div>
    );
};

const fetchAccessToken = async (code: string) => {
    try {
        const response = await fetch(`${API_BASE_URL}/access-token`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ authorizationCode: code }),
        });

        const data = await response.json();
        console.log('Access token response:', data);

        if (data.accessToken) {
            const tokenInfo = {
                accessToken: data.accessToken,
                refreshToken: data.refreshToken,
                expiresAt: data.expiresAt,
                tokenType: data.tokenType,
                scope: data.scope,
                expiresIn: data.expiresIn,
            }
            sessionStorage.setItem('token', JSON.stringify(tokenInfo)); // Store access token securely in session storage
            console.log('Access token stored in session storage.');
        } else {
            console.error('Access token not found in response.');
        }
        if (data.athlete) {
            console.log('Athlete info:', data.athlete);
            sessionStorage.setItem('athlete', JSON.stringify(data.athlete)); // Store athlete info securely in session storage
            console.log('Athlete info stored in session storage.');
        }

        // redirect to home page
        window.location.href = '/';
    } catch (error) {
        console.error('Error fetching access token:', error);
    }
};

const StravaCallback: React.FC = () => {
    const location = useLocation();
    const [error, setError] = useState<string | null>(null);

    React.useEffect(() => {
        const queryParams = new URLSearchParams(location.search);
        const code = queryParams.get('code');
        const errorParam = queryParams.get('error');

        if (errorParam) {
            setError('Failed to authenticate with Strava. Please try again.');
            return;
        }

        if (code) {
            console.log('Authorization code:', code);
            const response = fetchAccessToken(code);
            console.log('Response:', response);
        } else {
            console.error('Authorization code not found in query parameters.');
        }
    }, [location]);

    const handleCloseError = () => {
        setError(null);
        window.location.href = '/';
    };

    return (
        <div className="App" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
            {error && (
                <div className="modal" style={{
                    position: 'fixed',
                    top: 0,
                    left: 0,
                    width: '100%',
                    height: '100%',
                    backgroundColor: 'rgba(0, 0, 0, 0.5)',
                    display: 'flex',
                    justifyContent: 'center',
                    alignItems: 'center',
                    zIndex: 1000,
                }}>
                    <div className="modal-content" style={{
                        backgroundColor: 'white',
                        padding: '20px',
                        borderRadius: '8px',
                        boxShadow: '0px 4px 6px rgba(0, 0, 0, 0.1)',
                        textAlign: 'center',
                    }}>
                        <p>{error}</p>
                        <button onClick={handleCloseError} style={{
                            backgroundColor: '#FC4C02',
                            color: 'white',
                            border: 'none',
                            padding: '10px 20px',
                            cursor: 'pointer',
                            borderRadius: '5px',
                            marginTop: '10px',
                        }}>Close</button>
                    </div>
                </div>
            )}
            <header className="App-header">
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                    <div className="spinner" style={{
                        width: '50px',
                        height: '50px',
                        border: '5px solid rgba(0, 0, 0, 0.1)',
                        borderTop: '5px solid #FC4C02',
                        borderRadius: '50%',
                        animation: 'spin 1s linear infinite',
                    }}></div>
                    <p style={{ marginTop: '20px', fontSize: '1.2rem', color: '#333' }}>Authorizing with Strava...</p>
                </div>
            </header>
            <style>{`
                @keyframes spin {
                    0% { transform: rotate(0deg); }
                    100% { transform: rotate(360deg); }
                }
            `}</style>
        </div>
    );
};

const App: React.FC = () => {
    return (
        <Router>
                <Routes>
                    <Route path="/" element={<Home />} />
                    <Route path="/strava-callback" element={<StravaCallback />} />
                </Routes>
            
        </Router>
    );
};

export default App;