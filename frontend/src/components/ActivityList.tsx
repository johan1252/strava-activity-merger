import React, { useState } from 'react';
import polyline from '@mapbox/polyline';
import { MapContainer, TileLayer, Polyline } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { API_BASE_URL } from '../config';
import { sportTypeToIcon } from '../utils/sportTypeToIcon';

const ActivityList: React.FC<{ activities: any[]; reloadActivities: () => void }> = ({ activities, reloadActivities }) => {
    const [selectedActivities, setSelectedActivities] = useState<any[]>([]);
    const [isLoading, setIsLoading] = useState(false); // State for loading modal
    const [modalContent, setModalContent] = useState<React.ReactNode>(null); // State for modal message
    const [activePopoverId, setActivePopoverId] = useState<string | null>(null); // Track which activity popover is open
    const [popoverButtonPressedId, setPopoverButtonPressedId] = useState<string | null>(null); // Track pressed state for button
    const [showCombineMode, setShowCombineMode] = useState(false); // Track if combine mode is active

    const supportsCombineMode = (activity: any) => {
        return (
            !(activity.external_id?.startsWith('streven-cb'))
            && (
                activity.start_latlng &&
                Array.isArray(activity.start_latlng) &&
                activity.start_latlng.length > 0
            )
        );
    }

    const handleCheckboxChange = (activity: any) => {
        if (selectedActivities.includes(activity)) {
            // Remove activity if already selected
            setSelectedActivities(selectedActivities.filter(existingActivity => existingActivity.id !== activity.id));
        } else if (selectedActivities.length < 2) {
            // Add activity if less than 2 are selected
            setSelectedActivities([...selectedActivities, activity]);
        } else {
            setModalContent(<p>You can only select up to 2 activities.</p>);
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
                    if (response.ok && data.activityId) {
                        setSelectedActivities([]); // Clear selected activities after combining
                        setShowCombineMode(false); // Exit combine mode
                        setModalContent(
                            <>
                                <div>
                                    <strong>Activities combined successfully!</strong>
                                </div>
                                <div style={{ margin: '12px 0' }}>
                                    <a
                                        href={`https://www.strava.com/activities/${data.activityId}`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        style={{
                                            backgroundColor: '#FC4C02',
                                            color: 'white',
                                            padding: '10px 20px',
                                            borderRadius: '6px',
                                            textDecoration: 'none',
                                            fontWeight: 600,
                                            marginRight: '8px',
                                            display: 'inline-block'
                                        }}
                                    >
                                        View New Activity
                                    </a>
                                </div>
                                <div style={{ marginBottom: '8px', fontSize: '15px', color: '#555' }}>
                                    <span>Consider deleting the original activities:</span>
                                </div>
                                <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
                                    {selectedActivities.map(act => (
                                        <a
                                            key={act.id}
                                            href={`https://www.strava.com/activities/${act.id}`}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            style={{
                                                backgroundColor: 'white',
                                                color: '#FC4C02',
                                                border: '2px solid #FC4C02',
                                                padding: '8px 16px',
                                                borderRadius: '6px',
                                                textDecoration: 'none',
                                                fontWeight: 600,
                                                fontSize: '14px'
                                            }}
                                        >
                                            {act.name || `Activity ${act.id}`}
                                        </a>
                                    ))}
                                </div>
                            </>
                        );
                        reloadActivities(); // Reload the activity list
                    } else {
                        console.error('Error combining activities:', await response.json());
                        setModalContent(<p>Failed to combine activities.<br></br>Please try again, if error persists contact us for assistance.</p>);
                    };
                } catch (error) {
                    console.error('Error combining activities:', error);
                    setModalContent(<p>An error occurred while combining activities.</p>);
                } finally {
                    setIsLoading(false); // Hide loading modal
                }
            }

        } else {
            setModalContent(<p>Please select exactly 2 activities to combine.</p>);
        }
    };

    const handleRoundUp = async (activity: any) => {
        const token = sessionStorage.getItem('token');
        if (token) {
            const parsedToken = JSON.parse(token);
            setIsLoading(true);
            try {
                const response = await fetch(`${API_BASE_URL}/activities/roundup`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        Authorization: `Bearer ${parsedToken.accessToken}`,
                    },
                    body: JSON.stringify({
                        activity: {
                            id: activity.id,
                            startDate: activity.start_date,
                            name: activity.name,
                            distance: activity.distance,
                            sport_type: activity.sport_type
                        }
                    }),
                });
                if (response.ok) {
                    const data = await response.json();
                    setModalContent(
                        <>
                            <div>
                                <strong>Activity with updated distance created!</strong>
                            </div>
                            <div style={{ margin: '12px 0' }}>
                                <a
                                    href={`https://www.strava.com/activities/${data.activityId}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    style={{
                                        backgroundColor: '#FC4C02',
                                        color: 'white',
                                        padding: '10px 20px',
                                        borderRadius: '6px',
                                        textDecoration: 'none',
                                        fontWeight: 600,
                                        marginRight: '8px',
                                        display: 'inline-block'
                                    }}
                                >
                                    View New Activity
                                </a>
                            </div>
                            <div style={{ marginBottom: '8px', fontSize: '15px', color: '#555' }}>
                                <span>Consider deleting the original activity:</span>
                            </div>
                            <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
                                <a
                                    key={activity.id}
                                    href={`https://www.strava.com/activities/${activity.id}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    style={{
                                        backgroundColor: 'white',
                                        color: '#FC4C02',
                                        border: '2px solid #FC4C02',
                                        padding: '8px 16px',
                                        borderRadius: '6px',
                                        textDecoration: 'none',
                                        fontWeight: 600,
                                        fontSize: '14px'
                                    }}
                                >
                                    {activity.name || `Activity ${activity.id}`}
                                </a>
                            </div>
                        </>
                    );
                    reloadActivities();
                } else {
                    console.error('Error rounding up activity:', await response.json());
                    setModalContent(<p>Failed to round up activity.<br></br>Please try again, if error persists contact us for assistance.</p>);
                };
            } catch (error) {
                console.error('Error rounding up activity:', error);
                setModalContent(<p>An error occurred while rounding up.<br></br>Please try again, if error persists contact us for assistance.</p>);
            } finally {
                setIsLoading(false);
            }
        }
    };

    const handleRoundDown = async (activity: any) => {
        const token = sessionStorage.getItem('token');
        if (token) {
            const parsedToken = JSON.parse(token);
            setIsLoading(true);
            try {
                const response = await fetch(`${API_BASE_URL}/activities/rounddown`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        Authorization: `Bearer ${parsedToken.accessToken}`,
                    },
                    body: JSON.stringify({
                        activity: {
                            id: activity.id,
                            startDate: activity.start_date,
                            name: activity.name,
                            distance: activity.distance,
                            sport_type: activity.sport_type
                        }
                    }),
                });
                if (response.ok) {
                    const data = await response.json();
                    setModalContent(
                        <>
                            <div>
                                <strong>Activity with updated distance created!</strong>
                            </div>
                            <div style={{ margin: '12px 0' }}>
                                <a
                                    href={`https://www.strava.com/activities/${data.activityId}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    style={{
                                        backgroundColor: '#FC4C02',
                                        color: 'white',
                                        padding: '10px 20px',
                                        borderRadius: '6px',
                                        textDecoration: 'none',
                                        fontWeight: 600,
                                        marginRight: '8px',
                                        display: 'inline-block'
                                    }}
                                >
                                    View New Activity
                                </a>
                            </div>
                            <div style={{ marginBottom: '8px', fontSize: '15px', color: '#555' }}>
                                <span>Consider deleting the original activity:</span>
                            </div>
                            <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
                                <a
                                    key={activity.id}
                                    href={`https://www.strava.com/activities/${activity.id}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    style={{
                                        backgroundColor: 'white',
                                        color: '#FC4C02',
                                        border: '2px solid #FC4C02',
                                        padding: '8px 16px',
                                        borderRadius: '6px',
                                        textDecoration: 'none',
                                        fontWeight: 600,
                                        fontSize: '14px'
                                    }}
                                >
                                    {activity.name || `Activity ${activity.id}`}
                                </a>
                            </div>
                        </>
                    );
                    reloadActivities();
                } else {
                    console.error('Error rounding down activity:', await response.json());
                    setModalContent(<p>Failed to round down activity.<br></br>Please try again, if error persists contact us for assistance.</p>);
                };
            } catch (error) {
                console.error('Error rounding down activity:', error);
                setModalContent(<p>An error occurred while rounding down.<br></br>Please try again, if error persists contact us for assistance.</p>);
            } finally {
                setIsLoading(false);
            }
        }
    };

    const closeModal = () => {
        setModalContent(null); // Close the modal
    };

    return (
        <div
            style={{
                maxHeight: '100svh',
                overflowY: 'auto',
                width: '100vw',
                padding: '10px',
                borderTop: '1px solid #ddd',
                borderBottom: '1px solid #ddd',
                borderRadius: '8px',
                boxSizing: 'border-box',
            }}
            onClick={() => {
                setActivePopoverId(null);
                setPopoverButtonPressedId(null);
            }} // Close popover and button pressed when clicking outside
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
                            {/* Popover for this activity */}
                            {activePopoverId === activity.id && (
                                <div
                                    style={{
                                        position: 'absolute',
                                        top: '50px',
                                        right: '10px',
                                        background: 'white',
                                        border: '1px solid #ccc',
                                        borderRadius: '8px',
                                        boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                                        zIndex: 3000,
                                        padding: '20px 16px',
                                        display: 'flex',
                                        flexDirection: 'column',
                                        gap: '12px',
                                        minWidth: '120px',
                                        alignItems: 'stretch',
                                    }}
                                    onClick={e => e.stopPropagation()} // Prevent closing when clicking inside
                                >
                                    {supportsCombineMode(activity) && (<button
                                        style={{ padding: '10px', borderRadius: '6px', border: 'none', background: '#FC4C02', color: 'white', fontWeight: 600, cursor: 'pointer' }}
                                        onClick={() => {
                                            setShowCombineMode(true);
                                            setActivePopoverId(null);
                                            if (!selectedActivities.includes(activity) && supportsCombineMode(activity)) {
                                                setSelectedActivities([activity]);
                                            }
                                        }}
                                    >
                                        Combine
                                    </button>)}
                                    <button
                                        style={{ padding: '10px', borderRadius: '6px', border: 'none', background: 'blue', color: 'white', fontWeight: 600, cursor: 'pointer' }}
                                        onClick={() => { handleRoundUp(activity); setActivePopoverId(null); }}
                                    >
                                        Round Up
                                    </button>
                                    <button
                                        style={{ padding: '10px', borderRadius: '6px', border: 'none', background: 'grey', color: 'white', fontWeight: 600, cursor: 'pointer' }}
                                        onClick={() => { handleRoundDown(activity); setActivePopoverId(null); }}
                                    >
                                        Round Down
                                    </button>
                                </div>
                            )}
                            <div style={{ display: 'flex', alignItems: 'center' }}>
                                {/* Only show checkboxes in combine mode */}
                                {showCombineMode && supportsCombineMode(activity) && (
                                    <input
                                        type="checkbox"
                                        checked={selectedActivities.includes(activity)}
                                        onChange={() => handleCheckboxChange(activity)}
                                        style={{ marginRight: '10px', height: '20px', width: '20px' }}
                                    />
                                )}
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '8px 0', paddingRight: '5px' }}>
                                    {sportTypeToIcon(activity.sport_type)}
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', paddingBottom: '10px', width: '100%' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', width: '100%' }}>
                                        <h3 style={{ margin: 0 }}>{activity.name}</h3>
                                    </div>
                                    <div style={{ fontSize: '0.95em', color: '#555', marginTop: 2 }}>
                                        {new Date(activity.start_date_local.replace(/Z$/, '')).toLocaleString()}
                                    </div>
                                </div>
                                {(activity.external_id?.startsWith('streven-')) && (
                                    <div
                                        style={{
                                            width: '130px',
                                            backgroundColor: 'blue',
                                            color: 'white',
                                            padding: '5px 10px',
                                            borderRadius: '5px',
                                            fontSize: '12px',
                                            fontWeight: 'bold',
                                            marginRight: '5px',
                                            textAlign: 'center',
                                        }}
                                    >
                                        {activity.external_id?.startsWith('streven-cb-') && 'Combined'}
                                        {activity.external_id?.startsWith('streven-ru') && 'Rounded Up'}
                                        {activity.external_id?.startsWith('streven-rd') && 'Rounded Down'}
                                    </div>
                                )}
                                {/* Popover trigger button in top right */}
                                <button
                                    style={{
                                        background: activePopoverId === activity.id ? '#ddd' : '#eee',
                                        border: 'none',
                                        borderRadius: '8px',
                                        width: '32px',
                                        height: '32px',
                                        cursor: 'pointer',
                                        zIndex: 10,
                                        boxShadow: '0 2px 6px rgba(0,0,0,0.08)',
                                        transition: 'background 0.2s',
                                    }}
                                    aria-label="Show activity actions"
                                    onClick={e => {
                                        e.stopPropagation();
                                        if (activePopoverId === activity.id) {
                                            setActivePopoverId(null);
                                            setPopoverButtonPressedId(null);
                                        } else {
                                            setActivePopoverId(activity.id);
                                            setPopoverButtonPressedId(activity.id);
                                        }
                                    }}
                                    onMouseDown={() => setPopoverButtonPressedId(activity.id)}
                                    onMouseUp={() => setPopoverButtonPressedId(null)}
                                >
                                    <span style={{ fontSize: '20px', color: '#555' }}>⋮</span>
                                </button>

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
                                            // Disable map interactions for better UX on mobile, in future we can allow map interactions when viewing activity details
                                            zoomControl={false}
                                            dragging={false}
                                            touchZoom={false}
                                            scrollWheelZoom={false}
                                            doubleClickZoom={false}
                                            boxZoom={false}
                                            keyboard={false}
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
                            <div style={{ marginTop: '10px', width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
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
                                <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.95em', color: '#555', fontWeight: 500 }}>
                                    {activity.visibility === 'everyone' && (
                                        <>
                                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" >
                                                <circle cx="12" cy="12" r="10" stroke="#888" strokeWidth="2" fill="none" />
                                                <ellipse cx="12" cy="12" rx="6" ry="10" stroke="#888" strokeWidth="2" fill="none" />
                                                <ellipse cx="12" cy="12" rx="10" ry="4" stroke="#888" strokeWidth="2" fill="none" />
                                            </svg>
                                            Everyone
                                        </>
                                    )}
                                    {activity.visibility === 'only_me' && (
                                        <>
                                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" ><rect x="5" y="11" width="14" height="8" rx="2" stroke="#888" strokeWidth="2" fill="none" /><path d="M8 11V8a4 4 0 1 1 8 0v3" stroke="#888" strokeWidth="2" fill="none" /></svg>
                                            Only me
                                        </>
                                    )}
                                    {activity.visibility === 'followers_only' && (
                                        <>
                                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" ><circle cx="8" cy="10" r="3" stroke="#888" strokeWidth="2" fill="none" /><circle cx="16" cy="10" r="3" stroke="#888" strokeWidth="2" fill="none" /><path d="M2 20c0-3.3137 3.134-6 7-6s7 2.6863 7 6" stroke="#888" strokeWidth="2" fill="none" /><path d="M14 20c0-2.2091 2.239-4 5-4s5 1.7909 5 4" stroke="#888" strokeWidth="2" fill="none" /></svg>
                                            Followers Only
                                        </>
                                    )}
                                </div>
                            </div>
                        </li>
                    )
                }
                )}
            </ul>
            {/* Show combine button only in combine mode */}
            {showCombineMode && (
                <div
                    style={{
                        position: 'sticky',
                        // Use env(safe-area-inset-bottom) for iOS safe area, and fallback to 0 if not supported, plus extra space for Android bottom bar
                        bottom: 'calc(env(safe-area-inset-bottom, 0px) + 24px)',
                        display: 'flex',
                        justifyContent: 'center',
                        zIndex: 1000,
                        gap: '16px', // Add gap between buttons
                        pointerEvents: 'none', // Prevents blocking mouse actions in the same area
                        // Add padding for safe area on iOS Safari (so we don't get hidden by bottom bar) and extra for Android bottom bar
                        paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 24px)',
                    }}
                >
                    <button
                        onClick={handleCombineClick}
                        disabled={selectedActivities.length !== 2}
                        style={{
                            backgroundColor: selectedActivities.length === 2 ? '#FC4C02' : 'grey', // Orange when active
                            color: 'white',
                            border: 'none',
                            padding: '15px 30px',
                            fontSize: '18px',
                            cursor: 'pointer',
                            borderRadius: '8px',
                            boxShadow: '0px 4px 6px rgba(0, 0, 0, 0.2)',
                            transition: 'background-color 0.3s ease',
                            pointerEvents: 'auto',  // Allows the button itself to be clickable
                            fontWeight: 600,
                        }}
                        onMouseOver={(e) => (e.currentTarget.style.backgroundColor = selectedActivities.length === 2 ? '#e04a02' : 'grey')}
                        onMouseOut={(e) => (e.currentTarget.style.backgroundColor = selectedActivities.length === 2 ? '#FC4C02' : 'grey')}
                    >
                        Combine Activities
                    </button>
                    <button
                        onClick={() => {
                            setShowCombineMode(false);
                            setSelectedActivities([]);
                        }}
                        style={{
                            backgroundColor: 'white',
                            color: 'blue',
                            border: '2px solid blue',
                            padding: '15px 30px',
                            fontSize: '18px',
                            cursor: 'pointer',
                            borderRadius: '8px',
                            boxShadow: '0px 4px 6px rgba(0, 0, 0, 0.08)',
                            pointerEvents: 'auto',
                            fontWeight: 600,
                        }}
                    >
                        Cancel
                    </button>
                </div>
            )}
            {(isLoading || modalContent) && (
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
                            <p style={{ fontSize: '18px', margin: 0 }}>Creating updated activity, please wait...</p>
                        ) : (
                            <>
                                {modalContent}
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