import React, { useEffect, useState } from 'react';
import { BrowserRouter as Router, Route, Routes, useLocation } from 'react-router-dom';
import './App.css';
import querystring from 'querystring';
import { STRAVA_CLIENT_ID } from './config';
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
    const redirectURI = 'http://localhost:3000/strava-callback'; // Replace with your redirect URI
    const url = getStraveAuthorizeUrl(clientId, redirectURI);
    window.location.href = url;
};

const Home: React.FC = () => {
    const [athlete, setAthlete] = useState<any>(null);
    const [activities, setActivities] = useState<any[]>([]);

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
            const token = sessionStorage.getItem('token');
            if (token) {
                const parsedToken = JSON.parse(token);
                fetch('https://sa1sx89h1i.execute-api.us-east-1.amazonaws.com/prod/activities', {
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
        <div className="App" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
            <header className="App-header" style={{ textAlign: 'center' }}>
                {athlete ? (

                    <div>
                        <button
                            onClick={handleLogout}
                            style={{
                                position: 'absolute',
                                top: '10px',
                                right: '10px',
                                backgroundColor: 'red',
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
                            <ActivityList activities={activities} />
                        ) : athlete ? (
                            <p>Loading activities...</p>
                        ) : (
                            <p>No activities found.</p>
                        )}
                    </div>

                ) : (
                    <button
                        style={{
                            backgroundColor: 'orange',
                            color: 'white',
                            border: 'none',
                            padding: '10px 20px',
                            fontSize: '16px',
                            cursor: 'pointer',
                            borderRadius: '5px',
                            boxShadow: '0px 4px 6px rgba(0, 0, 0, 0.1)',
                        }}
                        onClick={handleAuthorizeClick}
                    >
                        Authorize Strava
                    </button>
                )}

            </header>
        </div>
    );
};

const fetchAccessToken = async (code: string) => {
    try {
        const response = await fetch('https://sa1sx89h1i.execute-api.us-east-1.amazonaws.com/prod/access-token', {
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

    React.useEffect(() => {
        const queryParams = new URLSearchParams(location.search);
        const code = queryParams.get('code');
        if (code) {
            console.log('Authorization code:', code);
            // You can now use the `code` to exchange for an access token
        } else {
            console.error('Authorization code not found in query parameters.');
        }

        if (code) {
            const response = fetchAccessToken(code);
            console.log('Response:', response);
        }

    }, [location]);

    return (
        <div className="App">
            <header className="App-header">
                <h1>Strava Callback</h1>
                <p>Processing authorization...</p>
            </header>
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