import React from 'react';
import polyline from '@mapbox/polyline'; // Install this package for decoding polylines
import { MapContainer, TileLayer, Polyline } from 'react-leaflet'; // Install react-leaflet for map rendering
import 'leaflet/dist/leaflet.css'; // Import Leaflet styles

const ActivityList: React.FC<{ activities: any[] }> = ({ activities }) => {
  return (
    <div
      style={{
        maxHeight: '70vh',
        overflowY: 'auto',
        width: '100vw', // Full screen width
        padding: '10px',
        border: '1px solid #ddd',
        borderRadius: '8px',
        boxSizing: 'border-box', // Ensures padding is included in width
      }}
    >
      <h2>Your Activities:</h2>
      <ul style={{ listStyleType: 'none', padding: 0, margin: 0, display: 'flex',
          flexDirection: 'column',
          alignItems: 'center' }}>
        {activities.map((activity) => (
          <li
            key={activity.id}
            style={{
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
            <h3>{activity.name}</h3>
            <p>
              <strong>Distance:</strong> {(activity.distance / 1000).toFixed(2)} km
            </p>
            <p>
              <strong>Type:</strong> {activity.type}
            </p>
            <p>
              <strong>Start Date:</strong> {new Date(activity.start_date_local).toLocaleString()}
            </p>
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
                  attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                />
                <Polyline
                  positions={polyline.decode(activity.map.summary_polyline).map(([lat, lng]) => [lat, lng])}
                  // @ts-ignore
                  color="blue"
                />
              </MapContainer>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
};

export default ActivityList;