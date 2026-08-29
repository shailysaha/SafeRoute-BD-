import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import {
  collection,
  onSnapshot,
  query,
  where,
  orderBy,
  deleteDoc,
  doc,
} from "firebase/firestore";

import { auth, db } from "../firebase/firebase";
import DashboardLayout from "../layout/DashboardLayout";

import "./Notifications.css";

function Notifications() {
  const navigate = useNavigate();

  const [notifications, setNotifications] = useState([]);
  const [sosNotifications, setSosNotifications] = useState([]);
  const [routeNotifications, setRouteNotifications] = useState([]);

  // IDs of road incidents hidden by this user/browser
  const [hiddenIncidentIds, setHiddenIncidentIds] = useState(() => {
    try {
      const saved = localStorage.getItem("hiddenIncidentNotifications");

      return saved ? JSON.parse(saved) : [];
    } catch (error) {
      console.error("Failed to load hidden incidents:", error);
      return [];
    }
  });

  /* =========================================================
     ROAD INCIDENT NOTIFICATIONS
     ========================================================= */

  useEffect(() => {
    const incidentQuery = query(
      collection(db, "incidents"),
      orderBy("createdAt", "desc")
    );

    const unsubscribe = onSnapshot(
      incidentQuery,
      (snapshot) => {
        const data = snapshot.docs.map((docItem) => ({
          id: docItem.id,
          ...docItem.data(),
        }));

        const importantIncidents = data.filter(
          (incident) =>
            incident.status !== "Resolved" &&
            !hiddenIncidentIds.includes(incident.id)
        );

        setNotifications(importantIncidents);
      },
      (error) => {
        console.error("Road incident listener error:", error);
      }
    );

    return () => unsubscribe();
  }, [hiddenIncidentIds]);

  /* =========================================================
     USER-SPECIFIC NOTIFICATIONS
     SOS + SAVED ROUTE / JOURNEY
     ========================================================= */

  useEffect(() => {
    const currentUser = auth.currentUser;

    if (!currentUser) return;

    const notificationQuery = query(
      collection(db, "notifications"),
      where("recipientId", "==", currentUser.uid)
    );

    const unsubscribe = onSnapshot(
      notificationQuery,
      (snapshot) => {
        const allNotifications = snapshot.docs.map((docItem) => ({
          id: docItem.id,
          ...docItem.data(),
        }));

        /* -----------------------------
           SOS
           ----------------------------- */

        const sosData = allNotifications
          .filter((item) => item.type === "SOS")
          .sort((a, b) => {
            const aTime = a.createdAt?.seconds || 0;
            const bTime = b.createdAt?.seconds || 0;

            return bTime - aTime;
          });

        /* -----------------------------
           ROUTE ALERT & SAVED JOURNEY
           ----------------------------- */

        const routeData = allNotifications
          .filter(
            (item) =>
              item.type === "ROUTE_ALERT" ||
              item.type === "SAVED_JOURNEY"
          )
          .sort((a, b) => {
            const aTime = a.createdAt?.seconds || 0;
            const bTime = b.createdAt?.seconds || 0;

            return bTime - aTime;
          });

        setSosNotifications(sosData);
        setRouteNotifications(routeData);
      },
      (error) => {
        console.error("Notification listener error:", error);
      }
    );

    return () => unsubscribe();
  }, []);

  /* =========================================================
     DELETE USER NOTIFICATION
     ========================================================= */

  const handleDeleteNotification = async (notificationId) => {
    const confirmed = window.confirm("Delete this notification?");

    if (!confirmed) return;

    try {
      await deleteDoc(doc(db, "notifications", notificationId));

      console.log("Notification deleted:", notificationId);
    } catch (error) {
      console.error("Failed to delete notification:", error);

      alert("❌ Failed to delete notification.");
    }
  };

  /* =========================================================
     HIDE ROAD INCIDENT ALERT
     ========================================================= */

  const handleHideIncident = (incidentId) => {
    const updatedIds = [...hiddenIncidentIds, incidentId];

    setHiddenIncidentIds(updatedIds);

    localStorage.setItem(
      "hiddenIncidentNotifications",
      JSON.stringify(updatedIds)
    );
  };

  /* =========================================================
     FORMAT DATE
     ========================================================= */

  const formatDate = (timestamp) => {
    if (!timestamp) return "";

    try {
      let date;

      if (timestamp.seconds) {
        date = new Date(timestamp.seconds * 1000);
      } else {
        date = new Date(timestamp);
      }

      if (isNaN(date.getTime())) return "";

      return date.toLocaleString();
    } catch (error) {
      return "";
    }
  };

  /* =========================================================
     EVIDENCE COMPONENT
     ========================================================= */

  const EvidencePreview = ({ evidence }) => {
    if (!Array.isArray(evidence) || evidence.length === 0) {
      return null;
    }

    return (
      <div className="notification-evidence">
        <h4>📎 Evidence</h4>

        <div className="notification-evidence-grid">
          {evidence.map((file, index) => {
            const fileUrl =
              file?.url ||
              file?.secure_url ||
              file?.downloadURL ||
              "";

            const resourceType =
              file?.resourceType || file?.resource_type || "";

            if (!fileUrl) return null;

            const isVideo =
              resourceType === "video" ||
              file?.type?.startsWith("video/") ||
              file?.mimeType?.startsWith("video/") ||
              /\.(mp4|webm|mov|avi)$/i.test(fileUrl);

            return (
              <div
                className="notification-evidence-item"
                key={file.publicId || file.public_id || index}
              >
                {isVideo ? (
                  <video
                    src={fileUrl}
                    controls
                    className="notification-evidence-media"
                  />
                ) : (
                  <img
                    src={fileUrl}
                    alt={`Incident evidence ${index + 1}`}
                    className="notification-evidence-media"
                    onError={(event) => {
                      event.currentTarget.style.display = "none";
                    }}
                  />
                )}

                <a
                  href={fileUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="view-evidence-link"
                >
                  View Evidence
                </a>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  /* =========================================================
     PAGE
     ========================================================= */

  return (
    <DashboardLayout>
      <div className="notifications-page">
        <h1>🔔 Alerts & Notifications</h1>

        <p className="notifications-subtitle">
          Live road incident updates and emergency SOS alerts from SafeRoute BD.
        </p>

        {/* =====================================================
            SOS EMERGENCY NOTIFICATIONS
            ===================================================== */}

        {sosNotifications.length > 0 && (
          <div className="sos-notification-section">
            <h2>🚨 Emergency Alerts</h2>

            {sosNotifications.map((notification) => (
              <div key={notification.id} className="sos-notification-card">
                {/* DELETE BUTTON */}
                <button
                  type="button"
                  className="notification-delete-btn"
                  title="Delete notification"
                  onClick={() => handleDeleteNotification(notification.id)}
                >
                  🗑️
                </button>

                <h3>
                  🚨 {notification.title || "Emergency Alert"}
                </h3>

                <p>{notification.message}</p>

                <p>
                  <strong>Location:</strong>{" "}
                  {notification.displayName ||
                    `${notification.area || "-"}, ${
                      notification.district || "-"
                    }`}
                </p>

                <p>
                  <strong>Coordinates:</strong> {notification.lat},{" "}
                  {notification.lng}
                </p>

                {notification.createdAt && (
                  <p>
                    <strong>Time:</strong>{" "}
                    {formatDate(notification.createdAt)}
                  </p>
                )}

                <button
                  className="track-location-btn"
                  onClick={() =>
                    navigate(`/emergency-track/${notification.id}`)
                  }
                >
                  📍 Track Location
                </button>
              </div>
            ))}
          </div>
        )}

        {/* =====================================================
            SAVED ROUTE NOTIFICATIONS
            ===================================================== */}

        {routeNotifications.length > 0 && (
          <div className="route-notification-section">
            <div className="notification-section-header">
              <div>
                <h2>🛣 Saved Route Alerts</h2>
                <p>
                  Important hazards detected along your saved journeys.
                </p>
              </div>

              <span>{routeNotifications.length}</span>
            </div>

            <div className="route-notification-list">
              {routeNotifications.map((notification) => (
                <div
                  className={`route-notification-card ${
                    notification.severity?.toLowerCase() || ""
                  }`}
                  key={notification.id}
                >
                  {/* DELETE BUTTON */}
                  <button
                    type="button"
                    className="notification-delete-btn route-delete-btn"
                    title="Delete notification"
                    onClick={() => handleDeleteNotification(notification.id)}
                  >
                    🗑️
                  </button>

                  <div className="route-alert-icon">
                    {notification.type === "SAVED_JOURNEY" ? "🛣️" : "⚠️"}
                  </div>

                  <div className="route-alert-content">
                    <div className="route-alert-heading">
                      <div>
                        <span className="route-alert-label">
                          {notification.type === "SAVED_JOURNEY"
                            ? "SAVED JOURNEY"
                            : "ROUTE ALERT"}
                        </span>

                        <h3>
                          {notification.title ||
                            (notification.type === "SAVED_JOURNEY"
                              ? "Journey Saved"
                              : "Route Alert")}
                        </h3>
                      </div>

                      {notification.type === "ROUTE_ALERT" &&
                        notification.severity && (
                          <span
                            className={`route-notification-severity ${notification.severity.toLowerCase()}`}
                          >
                            {notification.severity}
                          </span>
                        )}
                    </div>

                    <p className="route-alert-message">
                      {notification.message}
                    </p>

                    <div className="route-notification-details">
                      <div>
                        <small>Journey</small>
                        <strong>
                          {notification.routeName || "Saved Journey"}
                        </strong>
                      </div>

                      <div>
                        <small>From</small>
                        <strong>
                          {notification.startName ||
                            notification.startArea ||
                            "Starting point"}
                        </strong>
                      </div>

                      <div>
                        <small>To</small>
                        <strong>
                          {notification.destinationName ||
                            notification.destinationArea ||
                            "Destination"}
                        </strong>
                      </div>

                      <div>
                        <small>Distance</small>
                        <strong>
                          {notification.distanceKm !== undefined
                            ? `${Number(notification.distanceKm).toFixed(1)} km`
                            : "-"}
                        </strong>
                      </div>

                      <div>
                        <small>Route Alerts</small>
                        <strong>{notification.alertCount ?? 0}</strong>
                      </div>
                    </div>

                    <button
                      type="button"
                      className="view-saved-route-btn"
                      onClick={() => navigate("/my-journeys")}
                    >
                      🗺 View Saved Journey
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* =====================================================
            ROAD INCIDENT NOTIFICATIONS
            ===================================================== */}

        <h2>🛣️ Road Alerts</h2>

        {notifications.length === 0 ? (
          <div className="no-notifications">No active road alerts.</div>
        ) : (
          <div className="notification-list">
            {notifications.map((incident) => (
              <div
                key={incident.id}
                className={`notification-card ${
                  incident.severity?.toLowerCase() || ""
                }`}
              >
                {/* HIDE BUTTON */}
                <button
                  type="button"
                  className="notification-delete-btn"
                  title="Hide this alert"
                  onClick={() => handleHideIncident(incident.id)}
                >
                  🗑️
                </button>

                <div className="notification-icon">⚠</div>

                <div className="notification-content">
                  <h3>{incident.incidentType || "Road Incident"}</h3>

                  <p>
                    <strong>Location:</strong> {incident.area || "-"},{" "}
                    {incident.district || "-"}
                  </p>

                  <p>
                    <strong>Severity:</strong> {incident.severity || "-"}
                  </p>

                  <p>
                    <strong>Status:</strong> {incident.status || "Unverified"}
                  </p>

                  <p>{incident.description || ""}</p>

                  {/* GPS */}
                  {incident.lat !== undefined && incident.lng !== undefined && (
                    <p>
                      📍 <strong>Coordinates:</strong>{" "}
                      {Number(incident.lat).toFixed(5)},{" "}
                      {Number(incident.lng).toFixed(5)}
                    </p>
                  )}

                  {/* TIMESTAMP */}
                  {incident.createdAt && (
                    <p>
                      🕒 <strong>Reported:</strong>{" "}
                      {formatDate(incident.createdAt)}
                    </p>
                  )}

                  {/* CONFIRMATION */}
                  {incident.confirmationCount !== undefined && (
                    <p>
                      👥 <strong>Community confirmations:</strong>{" "}
                      {incident.confirmationCount}
                    </p>
                  )}

                  {/* EVIDENCE */}
                  <EvidencePreview evidence={incident.evidence} />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}

export default Notifications;