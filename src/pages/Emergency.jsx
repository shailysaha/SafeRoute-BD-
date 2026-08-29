import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import {
  MapContainer,
  TileLayer,
  Marker,
  Popup,
  useMap,
} from "react-leaflet";

import {
  collection,
  addDoc,
  getDocs,
  query,
  where,
  serverTimestamp,
} from "firebase/firestore";

import "leaflet/dist/leaflet.css";

import DashboardLayout from "../layout/DashboardLayout";

import MyLocationButton from "../components/MyLocationButton";
import SOSButton from "../components/SOSButton";
import Hospitals from "../components/Hospitals";
import PoliceStations from "../components/PoliceStations";
import EmergencyContacts from "../components/emergency/EmergencyContacts";
import { auth, db } from "../firebase/firebase";
import { blueIcon } from "../utils/markerIcons";

import "./Emergency.css";

// Helper component to auto-center and animate the map to new location coordinates
function EmergencyMapController({ location }) {
  const map = useMap();

  useEffect(() => {
    if (!location) return;

    const lat = Number(location.lat);
    const lng = Number(location.lng);

    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return;
    }

    map.flyTo([lat, lng], 15, {
      duration: 1.2,
    });
  }, [location, map]);

  return null;
}

function Emergency() {
  const navigate = useNavigate();

  const [currentLocation, setCurrentLocation] = useState(null);
  const [sendingSOS, setSendingSOS] = useState(false);
  const [nearestHospital, setNearestHospital] = useState(null);
  const [nearestPolice, setNearestPolice] = useState(null);

  const getLocationName = async (lat, lng) => {
    try {
      const response = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`,
        {
          headers: {
            Accept: "application/json",
          },
        }
      );

      const data = await response.json();
      const address = data.address || {};

      return {
        area:
          address.suburb ||
          address.neighbourhood ||
          address.road ||
          address.village ||
          address.town ||
          address.city ||
          "",

        district:
          address.city ||
          address.county ||
          address.state_district ||
          address.state ||
          "",

        displayName:
          data.display_name ||
          "Current Location",
      };
    } catch (error) {
      console.error(
        "Reverse geocoding failed:",
        error
      );

      return {
        area: "",
        district: "",
        displayName: "Current Location",
      };
    }
  };

  const handleMyLocation = async (location) => {
    if (!location) return;

    const lat = Number(location.lat);
    const lng = Number(location.lng);

    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      alert("Invalid current location.");
      return;
    }

    const locationInfo = await getLocationName(lat, lng);

    const locationData = {
      lat,
      lng,

      area: locationInfo.area,
      district: locationInfo.district,
      displayName: locationInfo.displayName,
      name: locationInfo.displayName,
    };

    console.log("EMERGENCY LOCATION:", locationData);
    setCurrentLocation(locationData);
  };

  const handleSOS = async () => {
    const currentUser = auth.currentUser;

    if (!currentUser) {
      alert("Please login before sending an SOS alert.");
      navigate("/login");
      return;
    }

    if (!currentLocation) {
      alert("Please detect your current location first.");
      return;
    }

    try {
      setSendingSOS(true);

      // 1. Save emergency alert
      const emergencyAlert = {
        userId: currentUser.uid,
        userEmail: currentUser.email || "",
        lat: currentLocation.lat,
        lng: currentLocation.lng,
        area: currentLocation.area || "",
        district: currentLocation.district || "",
        displayName:
          currentLocation.displayName ||
          currentLocation.name ||
          "",
        status: "ACTIVE",
        createdAt: serverTimestamp(),
      };

      const alertRef = await addDoc(
        collection(db, "emergencyAlerts"),
        emergencyAlert
      );

      // 2. Find this user's emergency contacts
      const contactQuery = query(
        collection(db, "emergencyContacts"),
        where("ownerId", "==", currentUser.uid)
      );

      const contactSnapshot = await getDocs(contactQuery);

      const contacts = contactSnapshot.docs.map((docItem) => ({
        id: docItem.id,
        ...docItem.data(),
      }));

      // 3. Keep only registered SafeRoute users
      const linkedContacts = contacts.filter(
        (contact) =>
          contact.isRegisteredUser === true &&
          contact.linkedUserId
      );

      // 4. Create notification for each linked contact
      const notificationPromises = linkedContacts.map((contact) =>
        addDoc(collection(db, "notifications"), {
          type: "SOS",
          senderId: currentUser.uid,
          senderEmail: currentUser.email || "",
          recipientId: contact.linkedUserId,
          emergencyAlertId: alertRef.id,
          title: "Emergency SOS Alert",
          message: "One of your emergency contacts sent an SOS alert.",
          lat: currentLocation.lat,
          lng: currentLocation.lng,
          area: currentLocation.area || "",
          district: currentLocation.district || "",
          displayName:
            currentLocation.displayName ||
            currentLocation.name ||
            "",
          read: false,
          createdAt: serverTimestamp(),
        })
      );

      await Promise.all(notificationPromises);

      if (linkedContacts.length === 0) {
        alert(
          "🚨 SOS sent, but no registered emergency contacts were found."
        );
      } else {
        alert(
          `🚨 SOS sent successfully!\n${linkedContacts.length} emergency contact(s) notified.`
        );
      }
    } catch (error) {
      console.error("SOS error:", error);
      alert("Failed to send SOS alert.");
    } finally {
      setSendingSOS(false);
    }
  };

  return (
    <DashboardLayout>
      <div className="emergency-page">
        <div className="emergency-heading">
          <h1>🚨 Emergency Assistance</h1>
          <p>
            Quickly find nearby emergency services and send an SOS alert.
          </p>
        </div>

        {/* Action Grid (Location & SOS) */}
        <div className="emergency-action-grid">
          {/* LOCATION */}
          <div className="emergency-info-card">
            <h3>📍 Your Current Location</h3>

            <MyLocationButton
              className="emergency-location-btn"
              onLocate={handleMyLocation}
            />

            {currentLocation ? (
              <div className="emergency-location-details">
                <p>
                  <strong>Location:</strong>{" "}
                  {currentLocation.area ||
                    currentLocation.name ||
                    "Current Location"}
                </p>
                <p>
                  <strong>District:</strong>{" "}
                  {currentLocation.district || "-"}
                </p>
                <p>
                  <strong>Latitude:</strong>{" "}
                  {currentLocation.lat.toFixed(6)}
                </p>
                <p>
                  <strong>Longitude:</strong>{" "}
                  {currentLocation.lng.toFixed(6)}
                </p>
              </div>
            ) : (
              <p className="emergency-help-text">
                Detect your location first.
              </p>
            )}
          </div>

          {/* SOS */}
          <div className="emergency-info-card sos-card">
            <h3>🚨 Emergency SOS</h3>

            <p>
              Send your current location to the SafeRoute BD emergency alert
              system.
            </p>

            <SOSButton onSOS={handleSOS} />

            {sendingSOS && (
              <p className="sending-sos">Sending SOS...</p>
            )}
          </div>
        </div>

        {/* Emergency Contacts Section */}
        <div className="emergency-contacts-section">
          <EmergencyContacts />
        </div>

        {/* MAP */}
        <div className="emergency-map-card">
          <div className="emergency-map-heading">
            <h2>Nearby Emergency Services</h2>
            <p>
              Hospitals and police stations near your current location.
            </p>
          </div>

          {/* Service Legend */}
          <div className="emergency-service-legend">
            <span>📍 You</span>
            <span>🏥 Hospital</span>
            <span>🚓 Police</span>
          </div>

          {/* Nearest Services Grid */}
          {currentLocation && (
            <div className="nearest-services-grid">
              <div className="nearest-service-card">
                <span>🏥</span>
                <div>
                  <small>Nearest Hospital</small>
                  {nearestHospital ? (
                    <>
                      <h3>{nearestHospital.name}</h3>
                      <p>
                        📍 {nearestHospital.distance.toFixed(2)} km away
                      </p>
                    </>
                  ) : (
                    <h3>Searching...</h3>
                  )}
                </div>
              </div>

              <div className="nearest-service-card">
                <span>🚓</span>
                <div>
                  <small>Nearest Police Station</small>
                  {nearestPolice ? (
                    <>
                      <h3>{nearestPolice.name}</h3>
                      <p>
                        📍 {nearestPolice.distance.toFixed(2)} km away
                      </p>
                    </>
                  ) : (
                    <h3>Searching...</h3>
                  )}
                </div>
              </div>
            </div>
          )}

          {currentLocation ? (
            <MapContainer
              center={[currentLocation.lat, currentLocation.lng]}
              zoom={14}
              className="emergency-map"
            >
              <EmergencyMapController location={currentLocation} />

              <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />

              <Marker
                position={[currentLocation.lat, currentLocation.lng]}
                icon={blueIcon}
              >
                <Popup>
                  📍 My Current Location
                  <br />
                  {currentLocation.displayName || currentLocation.area || ""}
                </Popup>
              </Marker>

              <Hospitals
                center={currentLocation}
                onNearestChange={setNearestHospital}
              />
              <PoliceStations
                center={currentLocation}
                onNearestChange={setNearestPolice}
              />
            </MapContainer>
          ) : (
            <div className="emergency-map-empty">
              <div>
                <h3>📍 Location Required</h3>
                <p>
                  Click My Location to view nearby hospitals and police
                  stations.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}

export default Emergency;