import { useEffect, useRef, useState } from "react";
import {
  addDoc,
  collection,
  onSnapshot,
  query,
  serverTimestamp,
  where,
} from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
import { auth, db } from "../firebase/firebase";

// ==========================================
// DISTANCE IN KM (Haversine Formula)
// ==========================================
function calculateDistanceKm(lat1, lng1, lat2, lng2) {
  const R = 6371;

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
}

// ==========================================
// CHECK IF INCIDENT IS NEAR ROUTE
// ==========================================
function isIncidentNearRoute(incident, journey) {
  if (
    !Array.isArray(journey.routeCoordinates) ||
    journey.routeCoordinates.length === 0
  ) {
    return false;
  }

  const incidentLat = Number(incident.lat);
  const incidentLng = Number(incident.lng);

  if (!Number.isFinite(incidentLat) || !Number.isFinite(incidentLng)) {
    return false;
  }

  return journey.routeCoordinates.some((coordinate) => {
    const routeLat = Number(coordinate.lat);
    const routeLng = Number(coordinate.lng);

    if (!Number.isFinite(routeLat) || !Number.isFinite(routeLng)) {
      return false;
    }

    const distance = calculateDistanceKm(
      routeLat,
      routeLng,
      incidentLat,
      incidentLng
    );

    // 700 metres threshold
    return distance <= 0.7;
  });
}

function SavedRouteMonitor() {
  const [currentUser, setCurrentUser] = useState(null);
  const [journeys, setJourneys] = useState([]);
  const [incidents, setIncidents] = useState([]);
  const [existingKeys, setExistingKeys] = useState(new Set());
  const [notificationsReady, setNotificationsReady] = useState(false);

  // Prevent duplicate creation while Firestore listener catches up
  const creatingKeysRef = useRef(new Set());

  // ==========================================
  // AUTH LISTENER
  // ==========================================
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user);

      if (!user) {
        setJourneys([]);
        setExistingKeys(new Set());
        setNotificationsReady(false);
      }
    });

    return () => unsubscribe();
  }, []);

  // ==========================================
  // SAVED ROUTES LISTENER
  // ==========================================
  useEffect(() => {
    if (!currentUser) return;

    const savedRouteQuery = query(
      collection(db, "savedRoutes"),
      where("userId", "==", currentUser.uid)
    );

    const unsubscribe = onSnapshot(
      savedRouteQuery,
      (snapshot) => {
        const data = snapshot.docs.map((docItem) => ({
          id: docItem.id,
          ...docItem.data(),
        }));
        setJourneys(data);
      },
      (error) => {
        console.error("Saved route monitor error:", error);
      }
    );

    return () => unsubscribe();
  }, [currentUser]);

  // ==========================================
  // INCIDENT LISTENER
  // ==========================================
  useEffect(() => {
    const unsubscribe = onSnapshot(
      collection(db, "incidents"),
      (snapshot) => {
        const data = snapshot.docs.map((docItem) => ({
          id: docItem.id,
          ...docItem.data(),
        }));
        setIncidents(data);
      },
      (error) => {
        console.error("Route incident monitor error:", error);
      }
    );

    return () => unsubscribe();
  }, []);

  // ==========================================
  // EXISTING NOTIFICATIONS (Prevent Duplicates)
  // ==========================================
  useEffect(() => {
    if (!currentUser) return;

    setNotificationsReady(false);

    const notificationQuery = query(
      collection(db, "notifications"),
      where("recipientId", "==", currentUser.uid)
    );

    const unsubscribe = onSnapshot(
      notificationQuery,
      (snapshot) => {
        const keys = new Set();

        snapshot.docs.forEach((docItem) => {
          const data = docItem.data();
          if (data.type === "ROUTE_ALERT" && data.uniqueKey) {
            keys.add(data.uniqueKey);
          }
        });

        setExistingKeys(keys);
        setNotificationsReady(true);
      },
      (error) => {
        console.error("Notification monitor error:", error);
      }
    );

    return () => unsubscribe();
  }, [currentUser]);

  // ==========================================
  // CHECK SAVED ROUTES FOR INCIDENTS
  // ==========================================
  useEffect(() => {
    if (
      !currentUser ||
      !notificationsReady ||
      journeys.length === 0 ||
      incidents.length === 0
    ) {
      return;
    }

    let isSubscribed = true;

    const checkRoutes = async () => {
      for (const journey of journeys) {
        for (const incident of incidents) {
          if (!isSubscribed) return;

          // Ignore resolved/rejected reports
          if (
            incident.status === "Resolved" ||
            incident.status === "Rejected"
          ) {
            continue;
          }

          // Only verified/community-confirmed reports trigger alerts
          if (
            incident.status !== "Verified" &&
            incident.status !== "Community Confirmed"
          ) {
            continue;
          }

          const nearRoute = isIncidentNearRoute(incident, journey);
          if (!nearRoute) {
            continue;
          }

          // One notification per: user + route + incident
          const uniqueKey = `${currentUser.uid}_${journey.id}_${incident.id}`;

          if (
            existingKeys.has(uniqueKey) ||
            creatingKeysRef.current.has(uniqueKey)
          ) {
            continue;
          }

          // Immediately lock key to prevent race conditions
          creatingKeysRef.current.add(uniqueKey);

          try {
            const incidentType =
              incident.incidentType ||
              incident.dangerType ||
              "Road Incident";

            await addDoc(collection(db, "notifications"), {
              type: "ROUTE_ALERT",
              uniqueKey,
              senderId: currentUser.uid,
              recipientId: currentUser.uid,
              routeId: journey.id,
              routeName: journey.routeName || "Saved Journey",
              incidentId: incident.id,
              title: "Hazard on Saved Route",
              message: `${incidentType} detected near your saved journey.`,
              incidentType,
              severity: incident.severity || "Unknown",
              incidentStatus: incident.status || "Unverified",
              area: incident.area || "",
              district: incident.district || "",
              lat: Number(incident.lat),
              lng: Number(incident.lng),
              read: false,
              createdAt: serverTimestamp(),
            });

            console.log("✅ Saved route notification created:", uniqueKey);
          } catch (error) {
            console.error("Failed to create route notification:", error);
            creatingKeysRef.current.delete(uniqueKey);
          }
        }
      }
    };

    checkRoutes();

    return () => {
      isSubscribed = false;
    };
  }, [currentUser, journeys, incidents, existingKeys, notificationsReady]);

  return null;
}

export default SavedRouteMonitor;