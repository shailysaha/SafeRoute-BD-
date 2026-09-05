import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { useLocation, useNavigate } from "react-router-dom";

import {
  MapContainer,
  TileLayer,
  Marker,
  Popup,
  Polyline,
  Circle,
  useMap,
} from "react-leaflet";

import L from "leaflet";
import "leaflet/dist/leaflet.css";

import {
  collection,
  onSnapshot,
} from "firebase/firestore";

import { auth, db } from "../firebase/firebase";

import DashboardLayout from "../layout/DashboardLayout";

import {
  redIcon,
  orangeIcon,
  greenIcon,
  blueIcon,
} from "../utils/markerIcons";

import "./JourneyMonitor.css";

/* =========================================================
   CONSTANTS
========================================================= */

const ROUTE_HAZARD_THRESHOLD_KM = 0.7;

const ARRIVAL_DISTANCE_KM = 0.15;

const IMPORTANT_NOTIFICATION_COOLDOWN = 10 * 60 * 1000;

/* =========================================================
   DISTANCE
========================================================= */

const calculateDistanceKm = (
  lat1,
  lng1,
  lat2,
  lng2
) => {
  const R = 6371;

  const dLat =
    ((lat2 - lat1) * Math.PI) / 180;

  const dLng =
    ((lng2 - lng1) * Math.PI) / 180;

  const a =
    Math.sin(dLat / 2) *
      Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);

  const c =
    2 *
    Math.atan2(
      Math.sqrt(a),
      Math.sqrt(1 - a)
    );

  return R * c;
};

/* =========================================================
   ROUTE DISTANCE
========================================================= */

const calculateRouteDistanceKm = (
  coordinates
) => {
  if (
    !Array.isArray(coordinates) ||
    coordinates.length < 2
  ) {
    return 0;
  }

  let total = 0;

  for (
    let i = 1;
    i < coordinates.length;
    i++
  ) {
    const previous = coordinates[i - 1];
    const current = coordinates[i];

    const lat1 = Number(previous?.lat);
    const lng1 = Number(previous?.lng);

    const lat2 = Number(current?.lat);
    const lng2 = Number(current?.lng);

    if (
      !Number.isFinite(lat1) ||
      !Number.isFinite(lng1) ||
      !Number.isFinite(lat2) ||
      !Number.isFinite(lng2)
    ) {
      continue;
    }

    total += calculateDistanceKm(
      lat1,
      lng1,
      lat2,
      lng2
    );
  }

  return total;
};

/* =========================================================
   INCIDENT HELPERS
========================================================= */

const normalizeIncident = (incident) => {
  const lat = Number(
    incident?.lat ??
      incident?.latitude
  );

  const lng = Number(
    incident?.lng ??
      incident?.longitude ??
      incident?.lon
  );

  return {
    ...incident,
    lat,
    lng,
  };
};

const isIncidentActive = (incident) => {
  const status = String(
    incident?.status || ""
  ).trim().toLowerCase();

  return ![
    "resolved",
    "closed",
    "inactive",
    "rejected",
    "false report",
  ].includes(status);
};

const getSeverityWeight = (severity) => {
  switch (
    String(severity || "")
      .trim()
      .toLowerCase()
  ) {
    case "high":
      return 3;

    case "medium":
      return 2;

    case "low":
      return 1;

    default:
      return 1;
  }
};

const getSeverityClass = (severity) => {
  switch (
    String(severity || "")
      .trim()
      .toLowerCase()
  ) {
    case "high":
      return "jm-risk-high";

    case "medium":
      return "jm-risk-medium";

    case "low":
      return "jm-risk-low";

    default:
      return "jm-risk-safe";
  }
};

const getIncidentType = (incident) => {
  return (
    incident?.incidentType ||
    incident?.dangerType ||
    incident?.type ||
    "Road Hazard"
  );
};

const isMajorHazard = (incident) => {
  const text = getIncidentType(
    incident
  ).toLowerCase();

  return (
    incident?.severity
      ?.toLowerCase() === "high" ||
    text.includes("accident") ||
    text.includes("collision") ||
    text.includes("crash") ||
    text.includes("road block") ||
    text.includes("block") ||
    text.includes("closure") ||
    text.includes("fire")
  );
};

const getIncidentDelay = (incident) => {
  const severity = String(
    incident?.severity || ""
  ).toLowerCase();

  const type = getIncidentType(
    incident
  ).toLowerCase();

  let delay = 3;

  if (severity === "high") {
    delay = 15;
  } else if (severity === "medium") {
    delay = 8;
  } else if (severity === "low") {
    delay = 3;
  }

  if (
    type.includes("block") ||
    type.includes("closure")
  ) {
    delay += 10;
  }

  if (
    type.includes("accident") ||
    type.includes("collision") ||
    type.includes("crash")
  ) {
    delay += 5;
  }

  if (
    type.includes("traffic") ||
    type.includes("congestion")
  ) {
    delay += 5;
  }

  return delay;
};

/* =========================================================
   FIND INCIDENTS NEAR ROUTE
========================================================= */

const getRouteHazards = (
  routeCoordinates,
  incidents
) => {
  if (
    !Array.isArray(routeCoordinates) ||
    routeCoordinates.length === 0
  ) {
    return [];
  }

  return incidents
    .filter(isIncidentActive)
    .filter((incident) => {
      const incidentLat = Number(
        incident?.lat
      );

      const incidentLng = Number(
        incident?.lng
      );

      if (
        !Number.isFinite(incidentLat) ||
        !Number.isFinite(incidentLng)
      ) {
        return false;
      }

      return routeCoordinates.some(
        (point) => {
          const routeLat = Number(
            point?.lat
          );

          const routeLng = Number(
            point?.lng
          );

          if (
            !Number.isFinite(routeLat) ||
            !Number.isFinite(routeLng)
          ) {
            return false;
          }

          return (
            calculateDistanceKm(
              routeLat,
              routeLng,
              incidentLat,
              incidentLng
            ) <=
            ROUTE_HAZARD_THRESHOLD_KM
          );
        }
      );
    });
};

/* =========================================================
   MAP AUTO FIT
========================================================= */

function FitJourneyMap({
  coordinates,
}) {
  const map = useMap();

  useEffect(() => {
    if (
      !Array.isArray(coordinates) ||
      coordinates.length === 0
    ) {
      return;
    }

    const validPoints = coordinates
      .map((point) => [
        Number(point?.lat),
        Number(point?.lng),
      ])
      .filter(
        ([lat, lng]) =>
          Number.isFinite(lat) &&
          Number.isFinite(lng)
      );

    if (validPoints.length > 1) {
      const bounds =
        L.latLngBounds(validPoints);

      map.fitBounds(bounds, {
        padding: [40, 40],
      });
    }
  }, [coordinates, map]);

  return null;
}

/* =========================================================
   MAIN COMPONENT
========================================================= */

function JourneyMonitor() {
  const location = useLocation();
  const navigate = useNavigate();

  const savedJourney =
    location.state?.savedJourney;

  /* =======================================================
     JOURNEY STATE
  ======================================================= */

  const [journeyStatus, setJourneyStatus] =
    useState("Ready");

  const [currentLocation, setCurrentLocation] =
    useState(null);

  const [locationError, setLocationError] =
    useState("");

  const [incidents, setIncidents] =
    useState([]);

  const [lastUpdated, setLastUpdated] =
    useState(null);

  const [warning, setWarning] =
    useState(null);

  const [browserNotificationEnabled, setBrowserNotificationEnabled] =
    useState(false);

  const watchIdRef = useRef(null);

  const notifiedIncidentsRef =
    useRef(new Map());

  /* =======================================================
     VALIDATE JOURNEY
  ======================================================= */

  const routeCoordinates = useMemo(() => {
    if (
      !savedJourney ||
      !Array.isArray(
        savedJourney.routeCoordinates
      )
    ) {
      return [];
    }

    return savedJourney.routeCoordinates
      .map((point) => ({
        lat: Number(point?.lat),
        lng: Number(point?.lng),
      }))
      .filter(
        (point) =>
          Number.isFinite(point.lat) &&
          Number.isFinite(point.lng)
      );
  }, [savedJourney]);

  const startPoint = useMemo(() => {
    if (!savedJourney) {
      return null;
    }

    const lat = Number(
      savedJourney.startLat
    );

    const lng = Number(
      savedJourney.startLng
    );

    if (
      !Number.isFinite(lat) ||
      !Number.isFinite(lng)
    ) {
      return null;
    }

    return { lat, lng };
  }, [savedJourney]);

  const destinationPoint = useMemo(() => {
    if (!savedJourney) {
      return null;
    }

    const lat = Number(
      savedJourney.destinationLat
    );

    const lng = Number(
      savedJourney.destinationLng
    );

    if (
      !Number.isFinite(lat) ||
      !Number.isFinite(lng)
    ) {
      return null;
    }

    return { lat, lng };
  }, [savedJourney]);

  /* =======================================================
     LOAD INCIDENTS IN REAL TIME
  ======================================================= */

  useEffect(() => {
    const unsubscribe = onSnapshot(
      collection(db, "incidents"),
      (snapshot) => {
        const data = snapshot.docs.map(
          (docItem) =>
            normalizeIncident({
              id: docItem.id,
              ...docItem.data(),
            })
        );

        setIncidents(data);
        setLastUpdated(new Date());
      },
      (error) => {
        console.error(
          "Journey monitor incident error:",
          error
        );
      }
    );

    return () => unsubscribe();
  }, []);

  /* =======================================================
     ROUTE HAZARDS
  ======================================================= */

  const routeHazards = useMemo(() => {
    return getRouteHazards(
      routeCoordinates,
      incidents
    );
  }, [
    routeCoordinates,
    incidents,
  ]);

  const highRiskHazards = useMemo(() => {
    return routeHazards.filter(
      (incident) =>
        String(
          incident?.severity || ""
        ).toLowerCase() === "high"
    );
  }, [routeHazards]);

  const majorHazards = useMemo(() => {
    return routeHazards.filter(
      isMajorHazard
    );
  }, [routeHazards]);

  const totalHazardDelay = useMemo(() => {
    return routeHazards.reduce(
      (total, incident) =>
        total +
        getIncidentDelay(incident),
      0
    );
  }, [routeHazards]);

  /* =======================================================
     TOTAL ROUTE DISTANCE
  ======================================================= */

  const totalRouteDistance = useMemo(() => {
    const savedDistance = Number(
      savedJourney?.distanceKm
    );

    if (
      Number.isFinite(savedDistance) &&
      savedDistance > 0
    ) {
      return savedDistance;
    }

    return calculateRouteDistanceKm(
      routeCoordinates
    );
  }, [
    savedJourney,
    routeCoordinates,
  ]);

  /* =======================================================
     FIND CLOSEST ROUTE POINT
  ======================================================= */

  const closestRouteIndex = useMemo(() => {
    if (
      !currentLocation ||
      routeCoordinates.length === 0
    ) {
      return 0;
    }

    let closestIndex = 0;
    let closestDistance =
      Infinity;

    routeCoordinates.forEach(
      (point, index) => {
        const distance =
          calculateDistanceKm(
            currentLocation.lat,
            currentLocation.lng,
            point.lat,
            point.lng
          );

        if (
          distance < closestDistance
        ) {
          closestDistance =
            distance;

          closestIndex = index;
        }
      }
    );

    return closestIndex;
  }, [
    currentLocation,
    routeCoordinates,
  ]);

  /* =======================================================
     REMAINING DISTANCE
  ======================================================= */

  const remainingDistance = useMemo(() => {
    if (
      !currentLocation ||
      !destinationPoint
    ) {
      return totalRouteDistance;
    }

    if (
      routeCoordinates.length === 0
    ) {
      return calculateDistanceKm(
        currentLocation.lat,
        currentLocation.lng,
        destinationPoint.lat,
        destinationPoint.lng
      );
    }

    let remaining = 0;

    remaining +=
      calculateDistanceKm(
        currentLocation.lat,
        currentLocation.lng,
        routeCoordinates[
          closestRouteIndex
        ].lat,
        routeCoordinates[
          closestRouteIndex
        ].lng
      );

    for (
      let i = closestRouteIndex + 1;
      i < routeCoordinates.length;
      i++
    ) {
      remaining +=
        calculateDistanceKm(
          routeCoordinates[i - 1].lat,
          routeCoordinates[i - 1].lng,
          routeCoordinates[i].lat,
          routeCoordinates[i].lng
        );
    }

    return Math.max(
      0,
      remaining
    );
  }, [
    currentLocation,
    destinationPoint,
    routeCoordinates,
    closestRouteIndex,
    totalRouteDistance,
  ]);

  /* =======================================================
     PROGRESS
  ======================================================= */

  const progressPercent = useMemo(() => {
    if (
      totalRouteDistance <= 0
    ) {
      return 0;
    }

    const completed =
      totalRouteDistance -
      remainingDistance;

    return Math.min(
      100,
      Math.max(
        0,
        (completed /
          totalRouteDistance) *
          100
      )
    );
  }, [
    totalRouteDistance,
    remainingDistance,
  ]);

  /* =======================================================
     ETA
  ======================================================= */

  const estimatedArrivalMinutes =
    useMemo(() => {
      const originalDuration =
        Number(
          savedJourney?.durationMinutes
        );

      if (
        !Number.isFinite(
          originalDuration
        ) ||
        originalDuration <= 0
      ) {
        return 0;
      }

      if (
        totalRouteDistance <= 0
      ) {
        return Math.round(
          originalDuration
        );
      }

      const baseRemaining =
        originalDuration *
        (remainingDistance /
          totalRouteDistance);

      return Math.max(
        1,
        Math.round(
          baseRemaining +
            totalHazardDelay
        )
      );
    }, [
      savedJourney,
      remainingDistance,
      totalRouteDistance,
      totalHazardDelay,
    ]);

  /* =======================================================
     FORMAT ETA
  ======================================================= */

  const formatDuration = (minutes) => {
    const value = Math.max(
      0,
      Math.round(
        Number(minutes || 0)
      )
    );

    if (value < 60) {
      return `${value} min`;
    }

    const hours = Math.floor(
      value / 60
    );

    const remaining = value % 60;

    if (remaining === 0) {
      return `${hours}h`;
    }

    return `${hours}h ${remaining}m`;
  };

  /* =======================================================
     SEND IMPORTANT WARNING
  ======================================================= */

  const sendImportantWarning =
    useCallback((incident) => {
      if (!incident?.id) {
        return;
      }

      const now = Date.now();

      const previousTime =
        notifiedIncidentsRef.current.get(
          incident.id
        );

      if (
        previousTime &&
        now - previousTime <
          IMPORTANT_NOTIFICATION_COOLDOWN
      ) {
        return;
      }

      notifiedIncidentsRef.current.set(
        incident.id,
        now
      );

      const type =
        getIncidentType(incident);

      const severity =
        incident.severity ||
        "Important";

      setWarning({
        id: `${incident.id}-${now}`,
        title:
          severity.toLowerCase() ===
          "high"
            ? "🚨 High-Risk Route Alert"
            : "⚠️ Route Alert",
        message: `${type} detected on your planned route.`,
        severity,
      });

      if (
        "Notification" in window &&
        Notification.permission ===
          "granted"
      ) {
        try {
          new Notification(
            severity.toLowerCase() ===
              "high"
              ? "🚨 SafeRoute BD — High Risk"
              : "⚠️ SafeRoute BD — Route Alert",
            {
              body: `${type} detected on your journey route.`,
              tag: `saferoute-${incident.id}`,
            }
          );
        } catch (error) {
          console.error(
            "Browser notification error:",
            error
          );
        }
      }
    }, []);

  /* =======================================================
     WATCH LOCATION
  ======================================================= */

  const stopLocationTracking =
    useCallback(() => {
      if (
        watchIdRef.current !== null &&
        navigator.geolocation
      ) {
        navigator.geolocation.clearWatch(
          watchIdRef.current
        );

        watchIdRef.current = null;
      }
    }, []);

  const startLocationTracking =
    useCallback(() => {
      if (
        !navigator.geolocation
      ) {
        setLocationError(
          "Geolocation is not supported by your browser."
        );

        return;
      }

      setLocationError("");

      const watchId =
        navigator.geolocation.watchPosition(
          (position) => {
            const nextLocation = {
              lat: Number(
                position.coords.latitude
              ),
              lng: Number(
                position.coords.longitude
              ),
              accuracy:
                Number(
                  position.coords.accuracy
                ) || 0,
            };

            setCurrentLocation(
              nextLocation
            );

            setLastUpdated(
              new Date()
            );
          },
          (error) => {
            console.error(
              "Journey location error:",
              error
            );

            if (error.code === 1) {
              setLocationError(
                "Location permission denied. Please allow location access to monitor your journey."
              );
            } else if (
              error.code === 2
            ) {
              setLocationError(
                "Your current location is unavailable."
              );
            } else if (
              error.code === 3
            ) {
              setLocationError(
                "Location request timed out. Trying again..."
              );
            } else {
              setLocationError(
                "Unable to track your current location."
              );
            }
          },
          {
            enableHighAccuracy: true,
            timeout: 15000,
            maximumAge: 5000,
          }
        );

      watchIdRef.current =
        watchId;
    }, []);

  /* =======================================================
     START JOURNEY
  ======================================================= */

  const handleStartJourney =
    async () => {
      if (!savedJourney) {
        return;
      }

      if (
        !auth.currentUser
      ) {
        alert(
          "Please log in before starting a journey."
        );

        return;
      }

      if (
        "Notification" in window
      ) {
        try {
          const permission =
            await Notification.requestPermission();

          setBrowserNotificationEnabled(
            permission === "granted"
          );
        } catch (error) {
          console.error(
            "Notification permission error:",
            error
          );
        }
      }

      setJourneyStatus("Active");

      startLocationTracking();
    };

  /* =======================================================
     STOP / END JOURNEY
  ======================================================= */

  const handleEndJourney = () => {
    stopLocationTracking();

    setJourneyStatus("Completed");
  };

  /* =======================================================
     CLEANUP LOCATION TRACKING
  ======================================================= */

  useEffect(() => {
    return () => {
      if (
        watchIdRef.current !== null &&
        navigator.geolocation
      ) {
        navigator.geolocation.clearWatch(
          watchIdRef.current
        );
      }
    };
  }, []);

  /* =======================================================
     AUTOMATIC ARRIVAL DETECTION
  ======================================================= */

  useEffect(() => {
    if (
      journeyStatus !== "Active" ||
      !currentLocation ||
      !destinationPoint
    ) {
      return;
    }

    const distanceToDestination =
      calculateDistanceKm(
        currentLocation.lat,
        currentLocation.lng,
        destinationPoint.lat,
        destinationPoint.lng
      );

    if (
      distanceToDestination <=
      ARRIVAL_DISTANCE_KM
    ) {
      stopLocationTracking();

      setJourneyStatus("Arrived");

      setWarning({
        id: `arrival-${Date.now()}`,
        title: "🏁 Journey Completed",
        message:
          "You have reached your destination.",
        severity: "Safe",
      });
    }
  }, [
    journeyStatus,
    currentLocation,
    destinationPoint,
    stopLocationTracking,
  ]);

  /* =======================================================
     DETECT IMPORTANT NEW HAZARDS
  ======================================================= */

  useEffect(() => {
    if (
      journeyStatus !== "Active" ||
      routeHazards.length === 0
    ) {
      return;
    }

    const importantHazards =
      routeHazards.filter(
        (incident) =>
          isMajorHazard(
            incident
          )
      );

    importantHazards.forEach(
      (incident) => {
        sendImportantWarning(
          incident
        );
      }
    );
  }, [
    journeyStatus,
    routeHazards,
    sendImportantWarning,
  ]);

  /* =======================================================
     AUTO CLOSE WARNING
  ======================================================= */

  useEffect(() => {
    if (!warning) {
      return;
    }

    const timer = setTimeout(
      () => {
        setWarning(null);
      },
      10000
    );

    return () =>
      clearTimeout(timer);
  }, [warning]);

  /* =======================================================
     ROUTE DISPLAY
  ======================================================= */

  const travelledCoordinates =
    useMemo(() => {
      if (
        routeCoordinates.length === 0
      ) {
        return [];
      }

      if (
        journeyStatus === "Ready" ||
        !currentLocation
      ) {
        return [];
      }

      return [
        ...routeCoordinates.slice(
          0,
          closestRouteIndex + 1
        ),
        {
          lat: currentLocation.lat,
          lng: currentLocation.lng,
        },
      ];
    }, [
      routeCoordinates,
      currentLocation,
      closestRouteIndex,
      journeyStatus,
    ]);

  const remainingCoordinates =
    useMemo(() => {
      if (
        routeCoordinates.length === 0
      ) {
        return [];
      }

      if (
        journeyStatus === "Ready" ||
        !currentLocation
      ) {
        return routeCoordinates;
      }

      return [
        {
          lat: currentLocation.lat,
          lng: currentLocation.lng,
        },
        ...routeCoordinates.slice(
          closestRouteIndex
        ),
      ];
    }, [
      routeCoordinates,
      currentLocation,
      closestRouteIndex,
      journeyStatus,
    ]);

  /* =======================================================
     MARKER ICON
  ======================================================= */

  const getIncidentIcon = (
    severity
  ) => {
    switch (
      String(
        severity || ""
      ).toLowerCase()
    ) {
      case "high":
        return redIcon;

      case "medium":
        return orangeIcon;

      case "low":
        return greenIcon;

      default:
        return blueIcon;
    }
  };

  /* =======================================================
     INVALID JOURNEY
  ======================================================= */

  if (!savedJourney) {
    return (
      <DashboardLayout>
        <div className="journey-monitor-page">
          <div className="jm-empty">
            <div className="jm-empty-icon">
              🛣
            </div>

            <h2>
              No Journey Selected
            </h2>

            <p>
              Open a saved journey from
              My Journeys to start Safe
              Journey Mode.
            </p>

            <button
              type="button"
              onClick={() =>
                navigate(
                  "/my-journeys"
                )
              }
            >
              ← Back to My Journeys
            </button>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  /* =======================================================
     MAP CENTER
  ======================================================= */

  const mapCenter =
    currentLocation ||
    startPoint || {
      lat: 23.8103,
      lng: 90.4125,
    };

  /* =======================================================
     RENDER
  ======================================================= */

  return (
    <DashboardLayout>
      <div className="journey-monitor-page">

        {/* =================================================
            HEADER
        ================================================= */}

        <div className="jm-header">

          <div>
            <span className="jm-label">
              SAFE JOURNEY MODE
            </span>

            <h1>
              🛡 {savedJourney.routeName ||
                "My Journey"}
            </h1>

            <p>
              Real-time route monitoring,
              active hazards and important
              safety warnings.
            </p>
          </div>

          <div
            className={`jm-live-status ${
              journeyStatus
                .toLowerCase()
            }`}
          >
            <span className="jm-live-dot" />

            {journeyStatus ===
            "Active"
              ? "Journey Active"
              : journeyStatus}
          </div>
        </div>

        {/* =================================================
            IMPORTANT WARNING
        ================================================= */}

        {warning && (
          <div
            className={`jm-warning-banner ${getSeverityClass(
              warning.severity
            )}`}
          >
            <div className="jm-warning-icon">
              {warning.severity
                ?.toLowerCase() ===
              "high"
                ? "🚨"
                : warning.title.includes(
                    "Completed"
                  )
                ? "🏁"
                : "⚠️"}
            </div>

            <div className="jm-warning-content">
              <strong>
                {warning.title}
              </strong>

              <p>
                {warning.message}
              </p>
            </div>

            <button
              type="button"
              onClick={() =>
                setWarning(null)
              }
              aria-label="Close warning"
            >
              ×
            </button>
          </div>
        )}

        {/* =================================================
            JOURNEY STATUS
        ================================================= */}

        <div className="jm-status-card">

          <div className="jm-status-main">

            <div className="jm-status-icon">
              {journeyStatus ===
              "Active"
                ? "🚗"
                : journeyStatus ===
                  "Arrived"
                ? "🏁"
                : "🛣"}
            </div>

            <div>
              <span>
                Current Journey Status
              </span>

              <h2>
                {journeyStatus ===
                "Ready"
                  ? "Ready to Start"
                  : journeyStatus ===
                    "Active"
                  ? "You are on the way"
                  : journeyStatus ===
                    "Arrived"
                  ? "Destination Reached"
                  : "Journey Completed"}
              </h2>
            </div>

          </div>

          <div className="jm-status-actions">

            {journeyStatus ===
              "Ready" && (
              <button
                type="button"
                className="jm-start-btn"
                onClick={
                  handleStartJourney
                }
              >
                ▶ Start Journey
              </button>
            )}

            {journeyStatus ===
              "Active" && (
              <button
                type="button"
                className="jm-end-btn"
                onClick={
                  handleEndJourney
                }
              >
                ■ End Journey
              </button>
            )}

            {(journeyStatus ===
              "Completed" ||
              journeyStatus ===
                "Arrived") && (
              <button
                type="button"
                className="jm-back-btn"
                onClick={() =>
                  navigate(
                    "/my-journeys"
                  )
                }
              >
                ← My Journeys
              </button>
            )}

          </div>
        </div>

        {/* =================================================
            LOCATION ERROR
        ================================================= */}

        {locationError && (
          <div className="jm-location-error">
            ⚠️ {locationError}
          </div>
        )}

        {/* =================================================
            LIVE METRICS
        ================================================= */}

        <div className="jm-metrics-grid">

          <div className="jm-metric-card">
            <span>
              Distance Remaining
            </span>

            <strong>
              {remainingDistance.toFixed(
                1
              )} km
            </strong>

            <small>
              of{" "}
              {totalRouteDistance.toFixed(
                1
              )} km
            </small>
          </div>

          <div className="jm-metric-card">
            <span>
              Estimated Arrival
            </span>

            <strong>
              {formatDuration(
                estimatedArrivalMinutes
              )}
            </strong>

            <small>
              remaining
            </small>
          </div>

          <div className="jm-metric-card">
            <span>
              Active Hazards
            </span>

            <strong
              className={
                routeHazards.length >
                0
                  ? "jm-danger-number"
                  : ""
              }
            >
              {routeHazards.length}
            </strong>

            <small>
              near your route
            </small>
          </div>

          <div className="jm-metric-card">
            <span>
              High-Risk Zones
            </span>

            <strong
              className={
                highRiskHazards.length >
                0
                  ? "jm-danger-number"
                  : ""
              }
            >
              {highRiskHazards.length}
            </strong>

            <small>
              high severity
            </small>
          </div>

        </div>

        {/* =================================================
            PROGRESS
        ================================================= */}

        <div className="jm-progress-card">

          <div className="jm-progress-header">
            <strong>
              Journey Progress
            </strong>

            <span>
              {Math.round(
                progressPercent
              )}%
            </span>
          </div>

          <div className="jm-progress-track">
            <div
              className="jm-progress-fill"
              style={{
                width: `${progressPercent}%`,
              }}
            />
          </div>

          <div className="jm-progress-labels">
            <span>
              {savedJourney.startName ||
                "Starting Location"}
            </span>

            <span>
              {savedJourney.destinationName ||
                "Destination"}
            </span>
          </div>

        </div>

        {/* =================================================
            MAP
        ================================================= */}

        <div className="jm-map-section">

          <div className="jm-section-heading">
            <div>
              <h2>
                🗺 Live Journey Map
              </h2>

              <p>
                Your route and active
                hazards are monitored in
                real time.
              </p>
            </div>

            <div className="jm-map-legend">
              <span>
                <i className="legend-safe" />
                Route
              </span>

              <span>
                <i className="legend-danger" />
                High Risk
              </span>

              <span>
                <i className="legend-warning" />
                Hazard
              </span>
            </div>
          </div>

          <div className="jm-map-wrapper">

            <MapContainer
              center={[
                mapCenter.lat,
                mapCenter.lng,
              ]}
              zoom={13}
              className="jm-map"
            >

              <TileLayer
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                attribution="&copy; OpenStreetMap contributors"
              />

              <FitJourneyMap
                coordinates={
                  routeCoordinates
                }
              />

              {/* ORIGINAL ROUTE */}

              {journeyStatus ===
                "Ready" &&
                routeCoordinates.length >
                  1 && (
                  <Polyline
                    positions={routeCoordinates.map(
                      (point) => [
                        point.lat,
                        point.lng,
                      ]
                    )}
                    pathOptions={{
                      color:
                        "#2563eb",
                      weight: 7,
                      opacity: 0.85,
                    }}
                  />
                )}

              {/* TRAVELLED ROUTE */}

              {travelledCoordinates.length >
                1 && (
                <Polyline
                  positions={travelledCoordinates.map(
                    (point) => [
                      point.lat,
                      point.lng,
                    ]
                  )}
                  pathOptions={{
                    color:
                      "#94a3b8",
                    weight: 7,
                    opacity: 0.8,
                  }}
                />
              )}

              {/* REMAINING ROUTE */}

              {remainingCoordinates.length >
                1 && (
                <Polyline
                  positions={remainingCoordinates.map(
                    (point) => [
                      point.lat,
                      point.lng,
                    ]
                  )}
                  pathOptions={{
                    color:
                      "#10b981",
                    weight: 7,
                    opacity: 0.95,
                  }}
                />
              )}

              {/* START */}

              {startPoint && (
                <Marker
                  position={[
                    startPoint.lat,
                    startPoint.lng,
                  ]}
                  icon={blueIcon}
                >
                  <Popup>
                    <strong>
                      📍 Starting Location
                    </strong>

                    <br />

                    {savedJourney.startName ||
                      savedJourney.startArea ||
                      "Start"}
                  </Popup>
                </Marker>
              )}

              {/* DESTINATION */}

              {destinationPoint && (
                <Marker
                  position={[
                    destinationPoint.lat,
                    destinationPoint.lng,
                  ]}
                  icon={blueIcon}
                >
                  <Popup>
                    <strong>
                      🏁 Destination
                    </strong>

                    <br />

                    {savedJourney.destinationName ||
                      savedJourney.destinationArea ||
                      "Destination"}
                  </Popup>
                </Marker>
              )}

              {/* CURRENT LOCATION */}

              {currentLocation && (
                <>
                  <Marker
                    position={[
                      currentLocation.lat,
                      currentLocation.lng,
                    ]}
                    icon={blueIcon}
                  >
                    <Popup>
                      <strong>
                        🚗 Your Current
                        Location
                      </strong>

                      <br />

                      Accuracy:{" "}
                      {Math.round(
                        currentLocation.accuracy
                      )}{" "}
                      m
                    </Popup>
                  </Marker>

                  <Circle
                    center={[
                      currentLocation.lat,
                      currentLocation.lng,
                    ]}
                    radius={Math.max(
                      currentLocation.accuracy ||
                        20,
                      20
                    )}
                    pathOptions={{
                      color:
                        "#2563eb",
                      fillOpacity: 0.08,
                      weight: 1,
                    }}
                  />
                </>
              )}

              {/* ACTIVE HAZARDS */}

              {routeHazards.map(
                (incident) => (
                  <Marker
                    key={incident.id}
                    position={[
                      incident.lat,
                      incident.lng,
                    ]}
                    icon={getIncidentIcon(
                      incident.severity
                    )}
                  >
                    <Popup>
                      <strong>
                        ⚠️{" "}
                        {getIncidentType(
                          incident
                        )}
                      </strong>

                      <br />

                      Severity:{" "}
                      {incident.severity ||
                        "Unknown"}

                      <br />

                      Status:{" "}
                      {incident.status ||
                        "Active"}

                      <br />

                      Estimated impact: +{" "}
                      {getIncidentDelay(
                        incident
                      )}{" "}
                      min
                    </Popup>
                  </Marker>
                )
              )}

              {/* HIGH-RISK ZONES */}

              {highRiskHazards.map(
                (incident) => (
                  <Circle
                    key={`zone-${incident.id}`}
                    center={[
                      incident.lat,
                      incident.lng,
                    ]}
                    radius={700}
                    pathOptions={{
                      color:
                        "#ef4444",
                      fillColor:
                        "#ef4444",
                      fillOpacity: 0.1,
                      weight: 2,
                      dashArray:
                        "8, 8",
                    }}
                  />
                )
              )}

            </MapContainer>

          </div>

        </div>

        {/* =================================================
            ROUTE ALERT SUMMARY
        ================================================= */}

        <div className="jm-alert-section">

          <div className="jm-section-heading">
            <div>
              <h2>
                ⚠ Route Alerts
              </h2>

              <p>
                Only active incidents close
                to your saved route are
                shown here.
              </p>
            </div>

            <span className="jm-refresh-info">
              {lastUpdated
                ? `Updated ${lastUpdated.toLocaleTimeString()}`
                : "Waiting for updates"}
            </span>
          </div>

          {routeHazards.length ===
          0 ? (
            <div className="jm-safe-box">
              <div>
                ✅
              </div>

              <div>
                <strong>
                  No Active Hazards
                </strong>

                <p>
                  No active road incidents
                  are currently detected
                  near your journey route.
                </p>
              </div>
            </div>
          ) : (
            <div className="jm-alert-list">

              {routeHazards.map(
                (incident) => (
                  <div
                    className={`jm-alert-card ${getSeverityClass(
                      incident.severity
                    )}`}
                    key={incident.id}
                  >

                    <div className="jm-alert-card-icon">
                      {String(
                        incident.severity ||
                          ""
                      ).toLowerCase() ===
                      "high"
                        ? "🚨"
                        : "⚠️"}
                    </div>

                    <div className="jm-alert-card-content">

                      <div className="jm-alert-card-title">

                        <h3>
                          {getIncidentType(
                            incident
                          )}
                        </h3>

                        <span>
                          {incident.severity ||
                            "Unknown"}
                        </span>

                      </div>

                      <p>
                        📍{" "}
                        {incident.area ||
                          incident.location ||
                          "Route location"}

                        {incident.district
                          ? `, ${incident.district}`
                          : ""}
                      </p>

                      <p>
                        Estimated impact:{" "}
                        <strong>
                          +{" "}
                          {getIncidentDelay(
                            incident
                          )}{" "}
                          min
                        </strong>
                      </p>

                    </div>

                  </div>
                )
              )}

            </div>
          )}

        </div>

        {/* =================================================
            HIGH RISK ZONES
        ================================================= */}

        <div className="jm-risk-section">

          <div className="jm-section-heading">
            <div>
              <h2>
                🚨 High-Risk Zones
              </h2>

              <p>
                High-severity incidents
                currently affecting your
                route.
              </p>
            </div>
          </div>

          {highRiskHazards.length ===
          0 ? (
            <div className="jm-no-risk">
              ✅ No high-risk zones
              currently detected.
            </div>
          ) : (
            <div className="jm-risk-list">

              {highRiskHazards.map(
                (incident) => (
                  <div
                    className="jm-high-risk-card"
                    key={incident.id}
                  >
                    <strong>
                      🚨{" "}
                      {getIncidentType(
                        incident
                      )}
                    </strong>

                    <span>
                      {incident.area ||
                        incident.location ||
                        "Unknown location"}
                    </span>

                    <small>
                      Avoid if possible.
                      Estimated impact: +{" "}
                      {getIncidentDelay(
                        incident
                      )}{" "}
                      min.
                    </small>
                  </div>
                )
              )}

            </div>
          )}

        </div>

        {/* =================================================
            NOTIFICATION STATUS
        ================================================= */}

        <div className="jm-notification-info">

          <div>
            <strong>
              🔔 Important Warning System
            </strong>

            <p>
              Safe Journey Mode only sends
              important route warnings such
              as major accidents, road blocks
              and high-risk incidents. Repeated
              alerts are limited to avoid
              notification overload.
            </p>
          </div>

          <span
            className={
              browserNotificationEnabled
                ? "notification-on"
                : "notification-off"
            }
          >
            {browserNotificationEnabled
              ? "Browser alerts ON"
              : "In-app alerts active"}
          </span>

        </div>

        {/* =================================================
            BOTTOM ACTION
        ================================================= */}

        <div className="jm-bottom-actions">

          <button
            type="button"
            className="jm-back-btn"
            onClick={() =>
              navigate(
                "/my-journeys"
              )
            }
          >
            ← Back to My Journeys
          </button>

          {journeyStatus ===
            "Ready" && (
            <button
              type="button"
              className="jm-start-btn"
              onClick={
                handleStartJourney
              }
            >
              ▶ Start Safe Journey
            </button>
          )}

        </div>

      </div>
    </DashboardLayout>
  );
}

export default JourneyMonitor;