import React, { useState } from 'react';
import polyline from '@mapbox/polyline';
import { MapContainer, TileLayer, Polyline } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { API_BASE_URL } from '../config';
import { sportTypeToIcon } from '../utils/sportTypeToIcon';

const ActivityList: React.FC<{ activities: any[]; reloadActivities: () => void }> = ({ activities, reloadActivities }) => {
    const [selectedActivities, setSelectedActivities] = useState<any[]>([]);
    const [isLoading, setIsLoading] = useState(false); // State for loading modal
    const [modalMessage, setModalMessage] = useState<string | null>(null); // State for modal message

    const handleCheckboxChange = (activity: any) => {
        if (selectedActivities.includes(activity)) {
            // Remove activity if already selected
            setSelectedActivities(selectedActivities.filter(existingActivity => existingActivity.id !== activity.id));
        } else if (selectedActivities.length < 2) {
            // Add activity if less than 2 are selected
            setSelectedActivities([...selectedActivities, activity]);
        } else {
            setModalMessage('You can only select up to 2 activities.');
        }
    };

    const handleCombineClick = async () => {
        if (selectedActivities.length === 2) {
            console.log('Selected activities:', selectedActivities);

            const token = sessionStorage.getItem('token');
            if (token) {
                const parsedToken = JSON.parse(token);
                setIsLoading(true); // Show loading modal
                try {
                    const response = await fetch(`${API_BASE_URL}/activities/combine`, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',

                            Authorization: `Bearer ${parsedToken.accessToken}`,

                        },
                        body: JSON.stringify({
                            activities: [
                                {
                                    id: selectedActivities[0].id,
                                    startDate: selectedActivities[0].start_date,
                                    name: selectedActivities[0].name
                                },
                                {
                                    id: selectedActivities[1].id,
                                    startDate: selectedActivities[1].start_date,
                                    name: selectedActivities[1].name
                                }
                            ]
                        }),
                    });
                    const data = await response.json();
                    console.log('Combine activities response:', data);
                    if (data.activityId) {
                        setSelectedActivities([]); // Clear selected activities after combining
                        setModalMessage(`Activities combined successfully! New activity ID: ${data.activityId}`);
                        reloadActivities(); // Reload the activity list
                    } else {
                        setModalMessage('Failed to combine activities.');
                    }
                } catch (error) {
                    console.error('Error combining activities:', error);
                    setModalMessage('An error occurred while combining activities.');
                } finally {
                    setIsLoading(false); // Hide loading modal
                }
            }

        } else {
            setModalMessage('Please select exactly 2 activities to combine.');
        }
    };

    const closeModal = () => {
        setModalMessage(null); // Close the modal
    };

    return (
        <div
            style={{
                maxHeight: '66vh',
                overflowY: 'auto',
                width: '100vw',
                padding: '10px',
                borderTop: '1px solid #ddd',
                borderBottom: '1px solid #ddd',
                borderRadius: '8px',
                boxSizing: 'border-box',
            }}
        >
            <ul
                style={{
                    listStyleType: 'none',
                    padding: 0,
                    margin: 0,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center', // Center the activity cards
                }}
            >
                {activities.map((activity) => {
                    let distanceKm = '-';
                    let durationStr = '-';
                    let paceStr = '-';
                    if (activity.distance && activity.elapsed_time) {
                        distanceKm = (activity.distance / 1000).toFixed(2);
                        const durationSec = activity.moving_time || activity.elapsed_time || 0;
                        const durationMin = Math.floor(durationSec / 60);
                        const durationSecRemainder = durationSec % 60;
                        durationStr = `${durationMin}m ${durationSecRemainder.toString().padStart(2, '0')}s`;

                        // Calculate pace (min/km)
                        if (activity.distance > 0 && durationSec > 0) {
                            const pace = durationSec / (activity.distance / 1000); // seconds per km
                            const paceMin = Math.floor(pace / 60);
                            const paceSec = Math.round(pace % 60);
                            paceStr = `${paceMin}:${paceSec.toString().padStart(2, '0')} /km`;
                        }
                    }
                    return (

                        <li
                            key={activity.id}
                            style={{
                                position: 'relative', // Add relative positioning for badge placement
                                marginBottom: '20px',
                                padding: '10px',
                                border: '1px solid #ddd',
                                borderRadius: '8px',
                                boxShadow: '0px 4px 6px rgba(0, 0, 0, 0.1)',
                                width: '90%', // Make the activity cards take up 90% of the screen width
                                maxWidth: '600px', // Limit the maximum width of the cards
                                backgroundColor: '#fff', // Add a white background for better contrast
                            }}
                        >
                            {activity.name?.includes('Streven') && (
                                // activity.external_id?.startsWith('streven-')
                                <div
                                    style={{
                                        position: 'absolute',
                                        top: '10px',
                                        right: '10px',
                                        backgroundColor: 'blue',
                                        color: 'white',
                                        padding: '5px 10px',
                                        borderRadius: '5px',
                                        fontSize: '12px',
                                        fontWeight: 'bold',
                                    }}
                                >
                                    Combined
                                </div>
                            )}
                            <div style={{ display: 'flex', alignItems: 'center' }}>
                                <input
                                    type="checkbox"
                                    checked={selectedActivities.includes(activity)}
                                    onChange={() => handleCheckboxChange(activity)}
                                    style={{ marginRight: '10px', height: '20px', width: '20px' }}
                                    disabled={activity.start_latlng && Array.isArray(activity.start_latlng) && activity.start_latlng.length === 0}
                                    title={
                                        !activity.start_latlng || (Array.isArray(activity.start_latlng) && activity.start_latlng.length === 0)
                                            ? 'This activity has no GPS data and cannot be combined.'
                                            : undefined
                                    }
                                />
                                
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '8px 0', paddingRight: '5px' }}>
                                    {sportTypeToIcon(activity.sport_type)}
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', paddingBottom: '10px' }}>
                                    <h3 style={{ margin: 0 }}>{activity.name}</h3>
                                    <div style={{ fontSize: '0.95em', color: '#555', marginTop: 2 }}>
                                        {new Date(activity.start_date_local.replace(/Z$/, '')).toLocaleString()}
                                    </div>
                                </div>
                            </div>
                            {activity.start_latlng && Array.isArray(activity.start_latlng) && activity.start_latlng.length > 1 && (
                                <>
                                    {/* Stats row */}
                                    <div style={{
                                        display: 'flex', gap: 32, marginBottom: 12, justifyContent: 'center', // Center the stats row horizontally
                                        width: '100%',
                                    }}>
                                        <div style={{ textAlign: 'center' }}>
                                            <div style={{ fontSize: '1.3em' }}>{distanceKm} <span style={{ fontWeight: 400, fontSize: '0.8em' }}>km</span></div>
                                            <div style={{ color: '#888', fontSize: '0.9em' }}>Distance</div>
                                        </div>
                                        <div style={{ textAlign: 'center' }}>
                                            <div style={{ fontSize: '1.3em' }}>{paceStr}</div>
                                            <div style={{ color: '#888', fontSize: '0.9em' }}>Pace</div>
                                        </div>
                                        <div style={{ textAlign: 'center' }}>
                                            <div style={{ fontSize: '1.3em' }}>{durationStr}</div>
                                            <div style={{ color: '#888', fontSize: '0.9em' }}>Time</div>
                                        </div>
                                    </div>
                                    <div style={{ height: '300px', marginTop: '10px' }}>
                                        <MapContainer
                                            // @ts-ignore
                                            center={[
                                                activity.start_latlng[0],
                                                activity.start_latlng[1],
                                            ]}
                                            zoom={13}
                                            style={{ height: '100%', width: '100%', borderRadius: '8px' }}
                                        >
                                            <TileLayer
                                                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                                                // @ts-ignore
                                                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' />
                                            <Polyline
                                                positions={polyline.decode(activity.map.summary_polyline).map(([lat, lng]) => [lat, lng])}
                                                // @ts-ignore
                                                color="blue" />
                                        </MapContainer>
                                    </div>
                                </>
                            )}
                            <div style={{ marginTop: '10px', textAlign: 'left' }}>
                                <a
                                    href={`https://www.strava.com/activities/${activity.id}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    style={{
                                        color: '#FC4C02',
                                        textDecoration: 'underline',
                                        fontWeight: 'bold',
                                        fontSize: '0.75em',
                                        background: 'none',
                                        border: 'none',
                                        padding: 0,
                                        boxShadow: 'none',
                                        cursor: 'pointer',
                                    }}
                                >
                                    View on Strava
                                </a>
                            </div>
                        </li>
                    )
                }
                )}
            </ul>
            <div
                style={{
                    position: 'sticky',
                    bottom: '50px',
                    display: 'flex',
                    justifyContent: 'center',
                    zIndex: 1000,
                    pointerEvents: 'none', // Prevents blocking mouse actions in the same area
                }}
            >
                <button
                    onClick={handleCombineClick}
                    disabled={selectedActivities.length !== 2}
                    style={{
                        backgroundColor: selectedActivities.length === 2 ? 'blue' : 'grey',
                        color: 'white',
                        border: 'none',
                        padding: '15px 30px',
                        fontSize: '18px',
                        cursor: 'pointer',
                        borderRadius: '8px',
                        boxShadow: '0px 4px 6px rgba(0, 0, 0, 0.2)',
                        transition: 'background-color 0.3s ease',
                        pointerEvents: 'auto', // Allows the button itself to be clickable
                    }}
                    onMouseOver={(e) => (e.currentTarget.style.backgroundColor = selectedActivities.length === 2 ? 'darkblue' : 'grey')}
                    onMouseOut={(e) => (e.currentTarget.style.backgroundColor = selectedActivities.length === 2 ? 'blue' : 'grey')}
                >
                    Combine Activities
                </button>
            </div>
            {(isLoading || modalMessage) && (
                <div
                    style={{
                        position: 'fixed',
                        top: 0,
                        left: 0,
                        width: '100vw',
                        height: '100vh',
                        backgroundColor: 'rgba(0, 0, 0, 0.5)',
                        display: 'flex',
                        justifyContent: 'center',
                        alignItems: 'center',
                        zIndex: 2000,
                    }}
                >
                    <div
                        style={{
                            backgroundColor: 'white',
                            padding: '20px',
                            borderRadius: '8px',
                            boxShadow: '0px 4px 6px rgba(0, 0, 0, 0.2)',
                            textAlign: 'center',
                        }}
                    >
                        {isLoading ? (
                            <p style={{ fontSize: '18px', margin: 0 }}>Combining activities, please wait...</p>
                        ) : (
                            <>
                                <p style={{ fontSize: '18px', margin: 0 }}>{modalMessage}</p>
                                <button
                                    onClick={closeModal}
                                    style={{
                                        marginTop: '10px',
                                        backgroundColor: 'blue',
                                        color: 'white',
                                        border: 'none',
                                        padding: '10px 20px',
                                        fontSize: '16px',
                                        cursor: 'pointer',
                                        borderRadius: '5px',
                                    }}
                                >
                                    Close
                                </button>
                            </>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

export default ActivityList;