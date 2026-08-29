import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";

import {
  MapContainer,
  TileLayer,
  Marker,
  Popup,
} from "react-leaflet";

import {
  doc,
  getDoc,
} from "firebase/firestore";

import { db } from "../firebase/firebase";

import DashboardLayout from "../layout/DashboardLayout";

import { redIcon } from "../utils/markerIcons";

import "./EmergencyTrack.css";

function EmergencyTrack() {
  const { notificationId } = useParams();

  const [notification, setNotification] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadNotification();
  }, [notificationId]);

  const loadNotification = async () => {
    try {
      setLoading(true);

      const notificationRef = doc(
        db,
        "notifications",
        notificationId
      );

      const snapshot = await getDoc(notificationRef);

      if (snapshot.exists()) {
        setNotification({
          id: snapshot.id,
          ...snapshot.data(),
        });
      } else {
        setNotification(null);
      }
    } catch (error) {
      console.error(
        "Tracking load error:",
        error
      );

      setNotification(null);
    } finally {
      setLoading(false);
    }
  };

  // Loading
  if (loading) {
    return (
      <DashboardLayout>
        <div className="emergency-track-page">
          <div className="track-loading">
            <h2>🚨 Loading Emergency Alert...</h2>
            <p>
              Please wait while we load the emergency
              location.
            </p>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  // Not found
  if (!notification) {
    return (
      <DashboardLayout>
        <div className="emergency-track-page">
          <div className="track-error">
            <h2>❌ Emergency Alert Not Found</h2>
            <p>
              This emergency notification could not
              be found.
            </p>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  const lat = Number(notification.lat);
  const lng = Number(notification.lng);

  const validCoordinates =
    Number.isFinite(lat) &&
    Number.isFinite(lng);

  // Sender information
  const senderName =
    notification.userName ||
    notification.senderName ||
    notification.displayName ||
    "Unknown User";

  const senderEmail =
    notification.userEmail ||
    notification.senderEmail ||
    "-";

  // Location
  const locationName =
    notification.locationName ||
    notification.displayName ||
    [notification.area, notification.district]
      .filter(Boolean)
      .join(", ") ||
    "Unknown Location";

  // Status
  const status =
    notification.status || "ACTIVE";

  // Time
  let alertTime = "Time unavailable";

  if (notification.createdAt?.toDate) {
    alertTime =
      notification.createdAt
        .toDate()
        .toLocaleString();
  }

  return (
    <DashboardLayout>
      <div className="emergency-track-page">

        {/* Header */}
        <div className="track-header">
          <div>
            <h1>🚨 Emergency Alert</h1>

            <p>
              Track the reported SOS location
            </p>
          </div>

          <div
            className={`status-badge ${
              status === "RESOLVED"
                ? "resolved"
                : "active"
            }`}
          >
            {status === "RESOLVED"
              ? "✓ RESOLVED"
              : "● ACTIVE"}
          </div>
        </div>

        {/* Details */}
        <div className="track-details">

          <div className="detail-card">
            <span className="detail-icon">
              👤
            </span>

            <div>
              <small>Sender</small>
              <strong>{senderName}</strong>
            </div>
          </div>

          <div className="detail-card">
            <span className="detail-icon">
              ✉️
            </span>

            <div>
              <small>Email</small>
              <strong>{senderEmail}</strong>
            </div>
          </div>

          <div className="detail-card">
            <span className="detail-icon">
              📍
            </span>

            <div>
              <small>Location</small>
              <strong>{locationName}</strong>
            </div>
          </div>

          <div className="detail-card">
            <span className="detail-icon">
              🕐
            </span>

            <div>
              <small>Alert Time</small>
              <strong>{alertTime}</strong>
            </div>
          </div>

          <div className="detail-card">
            <span className="detail-icon">
              📊
            </span>

            <div>
              <small>Status</small>
              <strong>
                {status}
              </strong>
            </div>
          </div>

        </div>

        {/* Map */}
        {validCoordinates ? (
          <div className="track-map-container">

            <div className="map-title">
              <h2>📍 SOS Location</h2>

              <p>
                The emergency location is shown
                below.
              </p>
            </div>

            <MapContainer
              center={[lat, lng]}
              zoom={16}
              className="emergency-track-map"
            >

              <TileLayer
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              />

              <Marker
                position={[lat, lng]}
                icon={redIcon}
              >
                <Popup>
                  <div>
                    <strong>
                      🚨 SOS Location
                    </strong>

                    <br />

                    <span>
                      {locationName}
                    </span>

                    <br />

                    <small>
                      Sender: {senderName}
                    </small>

                    <br />

                    <small>
                      Status: {status}
                    </small>
                  </div>
                </Popup>
              </Marker>

            </MapContainer>

            {/* Coordinates */}
            <div className="coordinates">
              <span>
                Latitude: {lat.toFixed(5)}
              </span>

              <span>
                Longitude: {lng.toFixed(5)}
              </span>
            </div>

          </div>
        ) : (
          <div className="track-error">
            <h3>📍 Location Unavailable</h3>
            <p>
              Valid GPS coordinates were not found
              for this emergency alert.
            </p>
          </div>
        )}

      </div>
    </DashboardLayout>
  );
}

export default EmergencyTrack;