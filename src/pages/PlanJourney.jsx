import { useEffect, useState, useCallback } from "react";
import {
  MapContainer,
  TileLayer,
  Marker,
  Popup,
  useMap,
} from "react-leaflet";

import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "leaflet-routing-machine";
import "leaflet-routing-machine/dist/leaflet-routing-machine.css";

import DashboardLayout from "../layout/DashboardLayout";
import MyLocationButton from "../components/MyLocationButton";
import SearchLocation from "../components/SearchLocation";

import {
  collection,
  getDocs,
  addDoc,
  serverTimestamp,
} from "firebase/firestore";
import { auth, db } from "../firebase/firebase";

import {
  redIcon,
  orangeIcon,
  greenIcon,
  blueIcon,
} from "../utils/markerIcons";

import "./PlanJourney.css";

// Utility function placed outside the component to keep references stable
const calculateDistance = (lat1, lng1, lat2, lng2) => {
  const R = 6371; // Earth radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

function RoutingControl({ startLocation, destination, onRouteFound }) {
  const map = useMap();

  useEffect(() => {
    if (!startLocation || !destination) {
      return;
    }

    const routingControl = L.Routing.control({
      waypoints: [
        L.latLng(Number(startLocation.lat), Number(startLocation.lng)),
        L.latLng(Number(destination.lat), Number(destination.lng)),
      ],
      routeWhileDragging: false,
      addWaypoints: false,
      draggableWaypoints: false,
      fitSelectedRoutes: true,
      show: false,
      createMarker: () => null,
    }).addTo(map);

    routingControl.on("routesfound", (event) => {
      const route = event.routes[0];
      if (!route) return;

      onRouteFound({
        coordinates: route.coordinates,
        distance: route.summary.totalDistance,
        time: route.summary.totalTime,
      });
    });

    return () => {
      try {
        map.removeControl(routingControl);
      } catch (error) {
        console.log("Routing control cleanup:", error);
      }
    };
  }, [map, startLocation, destination, onRouteFound]);

  return null;
}

function PlanJourney() {
  const [startLocation, setStartLocation] = useState(null);
  const [destination, setDestination] = useState(null);
  const [showRoute, setShowRoute] = useState(false);
  const [routeData, setRouteData] = useState(null);
  const [incidents, setIncidents] = useState([]);
  const [routeAlerts, setRouteAlerts] = useState([]);
  const [savingJourney, setSavingJourney] = useState(false);

  useEffect(() => {
    loadIncidents();
  }, []);

  const loadIncidents = async () => {
    try {
      const snapshot = await getDocs(collection(db, "incidents"));
      const data = snapshot.docs.map((docItem) => ({
        id: docItem.id,
        ...docItem.data(),
      }));
      setIncidents(data);
    } catch (error) {
      console.error("Failed to load incidents:", error);
    }
  };

  const getMarkerIcon = (severity) => {
    switch (severity) {
      case "High":
        return redIcon;
      case "Medium":
        return orangeIcon;
      case "Low":
        return greenIcon;
      default:
        return blueIcon;
    }
  };

  // Wrapped in useCallback to prevent infinite effect triggers in RoutingControl
  const handleRouteFound = useCallback(
    (route) => {
      setRouteData(route);

      if (!route?.coordinates) {
        setRouteAlerts([]);
        return;
      }

      const alerts = incidents.filter((incident) => {
        if (incident.status === "Resolved") {
          return false;
        }

        const incidentLat = Number(incident.lat);
        const incidentLng = Number(incident.lng);

        if (!Number.isFinite(incidentLat) || !Number.isFinite(incidentLng)) {
          return false;
        }

        return route.coordinates.some((point) => {
          const distance = calculateDistance(
            Number(point.lat),
            Number(point.lng),
            incidentLat,
            incidentLng
          );
          return distance <= 0.7; // 700m threshold along route
        });
      });

      setRouteAlerts(alerts);
    },
    [incidents]
  );

  const saveJourney = async () => {
    const currentUser = auth.currentUser;

    if (!currentUser) {
      alert("Please login before saving a journey.");
      return;
    }

    if (!startLocation || !destination || !routeData) {
      alert("Generate a route before saving the journey.");
      return;
    }

    try {
      setSavingJourney(true);

      const startName =
        startLocation.name ||
        startLocation.area ||
        "Current Location";

      const destinationName =
        destination.name ||
        destination.area ||
        "Destination";

      const routeName = `${startName.split(",")[0]} → ${
        destinationName.split(",")[0]
      }`;

      // 1. SAVE JOURNEY
      const savedJourney = {
        userId: currentUser.uid,
        userEmail: currentUser.email || "",

        routeName,

        startName,
        startArea: startLocation.area || "",
        startDistrict: startLocation.district || "",
        startLat: Number(startLocation.lat),
        startLng: Number(startLocation.lng),

        destinationName,
        destinationArea: destination.area || "",
        destinationDistrict: destination.district || "",
        destinationLat: Number(destination.lat),
        destinationLng: Number(destination.lng),

        distanceKm: Number(routeData.distance) / 1000,

        durationMinutes: Number(routeData.time) / 60,

        alertCount: routeAlerts.length,

        routeCoordinates:
          routeData.coordinates?.map((point) => ({
            lat: Number(point.lat),
            lng: Number(point.lng),
          })) || [],

        status: "Saved",

        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };

      // 2. STORE IN savedRoutes
      const savedJourneyRef = await addDoc(
        collection(db, "savedRoutes"),
        savedJourney
      );

      console.log("✅ Journey saved:", savedJourneyRef.id);

      // 3. CREATE NOTIFICATION (includes senderId for Firestore rules)
      const savedJourneyNotification = {
        senderId: currentUser.uid,
        recipientId: currentUser.uid,
        recipientEmail: currentUser.email || "",

        type: "SAVED_JOURNEY",

        title: "🛣 Journey Saved",

        message: `Your journey from ${startName.split(",")[0]} to ${
          destinationName.split(",")[0]
        } has been saved successfully.`,

        routeName,

        startName,
        startArea: startLocation.area || "",
        startDistrict: startLocation.district || "",
        startLat: Number(startLocation.lat),
        startLng: Number(startLocation.lng),

        destinationName,
        destinationArea: destination.area || "",
        destinationDistrict: destination.district || "",
        destinationLat: Number(destination.lat),
        destinationLng: Number(destination.lng),

        distanceKm: Number(routeData.distance) / 1000,

        durationMinutes: Number(routeData.time) / 60,

        alertCount: routeAlerts.length,

        status: "Saved",

        createdAt: serverTimestamp(),

        savedJourneyId: savedJourneyRef.id,
      };

      // 4. STORE NOTIFICATION
      const notificationRef = await addDoc(
        collection(db, "notifications"),
        savedJourneyNotification
      );

      console.log(
        "🔔 Saved journey notification created:",
        notificationRef.id
      );

      // 5. SUCCESS
      alert(
        "✅ Journey saved successfully!\n\n🔔 You can see it in Notifications."
      );
    } catch (error) {
      console.error("Save journey error:", error);

      if (error.code === "permission-denied") {
        alert(
          "❌ You do not have permission to save this journey or create notifications."
        );
      } else {
        alert(
          `❌ Failed to save journey.\n\n${
            error.message || "Unknown error"
          }`
        );
      }
    } finally {
      setSavingJourney(false);
    }
  };

  const formatDistance = (meters) => {
    return (meters / 1000).toFixed(1);
  };

  const formatTime = (seconds) => {
    const minutes = Math.round(seconds / 60);

    if (minutes < 60) {
      return `${minutes} min`;
    }

    const hours = Math.floor(minutes / 60);
    const remaining = minutes % 60;

    return `${hours}h ${remaining}m`;
  };

  return (
    <DashboardLayout>
      <div className="plan-journey-page">
        <h1>🛣 Plan Safe Journey</h1>

        <div className="journey-controls">
          <div className="journey-field">
            <h3>Starting Location</h3>

            <div className="journey-location-button">
              <MyLocationButton
                onLocate={(location) => {
                  setStartLocation(location);
                  setRouteData(null);
                  setRouteAlerts([]);
                  setShowRoute(false);
                }}
              />
            </div>

            {startLocation && (
              <p>
                📍{" "}
                {startLocation.area ||
                  startLocation.name ||
                  "My Current Location"}
              </p>
            )}
          </div>

          <div className="journey-field">
            <h3>Destination</h3>

            <SearchLocation
              onLocationSelect={(location) => {
                setDestination(location);
                setRouteData(null);
                setRouteAlerts([]);
                setShowRoute(false);
              }}
            />

            {destination && (
              <p>
                📍{" "}
                {destination.area ||
                  destination.name ||
                  "Selected Destination"}
              </p>
            )}
          </div>
        </div>

        {startLocation && destination && !showRoute && (
          <button
            type="button"
            className="generate-route-btn"
            onClick={() => setShowRoute(true)}
          >
            `🛣 Generate Safe Route`
          </button>
        )}

        {showRoute && startLocation && destination && (
          <div className="route-map-wrapper">
            <MapContainer
              center={[
                Number(startLocation.lat),
                Number(startLocation.lng),
              ]}
              zoom={13}
              className="journey-map"
            >
              <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />

              <RoutingControl
                startLocation={startLocation}
                destination={destination}
                onRouteFound={handleRouteFound}
              />

              <Marker
                position={[
                  Number(startLocation.lat),
                  Number(startLocation.lng),
                ]}
                icon={blueIcon}
              >
                <Popup>Start Location</Popup>
              </Marker>

              <Marker
                position={[
                  Number(destination.lat),
                  Number(destination.lng),
                ]}
                icon={blueIcon}
              >
                <Popup>Destination</Popup>
              </Marker>

              {routeAlerts.map((incident) => (
                <Marker
                  key={incident.id}
                  position={[
                    Number(incident.lat),
                    Number(incident.lng),
                  ]}
                  icon={getMarkerIcon(incident.severity)}
                >
                  <Popup>
                    <strong>
                      ⚠ {incident.incidentType || "Road Incident"}
                    </strong>
                    <br />
                    Severity: {incident.severity || "-"}
                    <br />
                    Status: {incident.status || "Unverified"}
                  </Popup>
                </Marker>
              ))}
            </MapContainer>
          </div>
        )}

        {routeData && (
          <div className="route-summary">
            <div>
              <strong>Distance</strong>
              <p>{formatDistance(routeData.distance)} km</p>
            </div>

            <div>
              <strong>Estimated Time</strong>
              <p>{formatTime(routeData.time)}</p>
            </div>

            <div>
              <strong>Route Alerts</strong>
              <p>{routeAlerts.length}</p>
            </div>
          </div>
        )}

        {routeData && (
          <div className="save-journey-section">
            <button
              type="button"
              className="save-journey-btn"
              onClick={saveJourney}
              disabled={savingJourney}
            >
              {savingJourney ? "Saving Journey..." : "💾 Save Journey"}
            </button>
            <p>
              Save this route to monitor road conditions later from My Journeys.
            </p>
          </div>
        )}

        {routeData && (
          <div className="route-alert-section">
            <h2>Route Safety Alerts</h2>

            {routeAlerts.length === 0 ? (
              <div className="route-safe-message">
                ✅ No active road incidents were found close to this route.
              </div>
            ) : (
              routeAlerts.map((incident) => (
                <div className="route-alert-card" key={incident.id}>
                  <h3>
                    ⚠ {incident.incidentType || "Road Incident"}
                  </h3>
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
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}

export default PlanJourney;