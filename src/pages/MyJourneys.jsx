import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  where,
} from "firebase/firestore";

import { auth, db } from "../firebase/firebase";

import DashboardLayout from "../layout/DashboardLayout";
import { notify } from "../utils/notify";
import "./MyJourneys.css";

function MyJourneys() {
  const navigate = useNavigate();

  const [journeys, setJourneys] = useState([]);
  const [incidents, setIncidents] = useState([]);

  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [deletingId, setDeletingId] = useState(null);

  // =========================================================
  // LOAD SAVED JOURNEYS
  // =========================================================

  useEffect(() => {
    const currentUser = auth.currentUser;

    if (!currentUser) {
      setJourneys([]);
      setLoading(false);
      return;
    }

    const journeyQuery = query(
      collection(db, "savedRoutes"),
      where("userId", "==", currentUser.uid)
    );

    const unsubscribe = onSnapshot(
      journeyQuery,
      (snapshot) => {
        const data = snapshot.docs.map((docItem) => ({
          id: docItem.id,
          ...docItem.data(),
        }));

        data.sort((a, b) => {
          const aTime = a.createdAt?.seconds || 0;
          const bTime = b.createdAt?.seconds || 0;

          return bTime - aTime;
        });

        setJourneys(data);
        setLoading(false);
      },
      (error) => {
        console.error("Saved journey loading error:", error);
        setLoading(false);

        notify(
          "Unable to load saved journeys. Please check your connection."
        );
      }
    );

    return () => unsubscribe();
  }, []);

  // =========================================================
  // LOAD INCIDENTS
  // =========================================================

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
        console.error("Incident loading error:", error);
      }
    );

    return () => unsubscribe();
  }, []);

  // =========================================================
  // DISTANCE HELPER
  // =========================================================

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

  // =========================================================
  // ROUTE HAZARD DETECTION
  // =========================================================

  const getJourneyHazards = (journey) => {
    if (
      !Array.isArray(
        journey.routeCoordinates
      ) ||
      journey.routeCoordinates.length === 0
    ) {
      return [];
    }

    return incidents.filter((incident) => {
      // Ignore inactive incidents
      if (
        incident.status === "Rejected" ||
        incident.status === "False Report" ||
        incident.status === "Resolved"
      ) {
        return false;
      }

      const incidentLat = Number(
        incident.lat
      );

      const incidentLng = Number(
        incident.lng
      );

      if (
        !Number.isFinite(incidentLat) ||
        !Number.isFinite(incidentLng)
      ) {
        return false;
      }

      return journey.routeCoordinates.some(
        (coordinate) => {
          const routeLat = Number(
            coordinate?.lat
          );

          const routeLng = Number(
            coordinate?.lng
          );

          if (
            !Number.isFinite(routeLat) ||
            !Number.isFinite(routeLng)
          ) {
            return false;
          }

          const distance =
            calculateDistanceKm(
              routeLat,
              routeLng,
              incidentLat,
              incidentLng
            );

          // 700 metres
          return distance <= 0.7;
        }
      );
    });
  };

  // =========================================================
  // FILTER JOURNEYS
  // =========================================================

  const filteredJourneys = useMemo(() => {
    const text = search
      .trim()
      .toLowerCase();

    if (!text) {
      return journeys;
    }

    return journeys.filter((journey) => {
      const name = String(
        journey.routeName || ""
      ).toLowerCase();

      const start = String(
        journey.startName ||
          journey.startArea ||
          ""
      ).toLowerCase();

      const destination = String(
        journey.destinationName ||
          journey.destinationArea ||
          ""
      ).toLowerCase();

      return (
        name.includes(text) ||
        start.includes(text) ||
        destination.includes(text)
      );
    });
  }, [journeys, search]);

  // =========================================================
  // DELETE SAVED JOURNEY
  //
  // IMPORTANT:
  // No window.confirm().
  // The journey is removed directly.
  // Firestore rules still protect ownership.
  // =========================================================

  const handleDeleteJourney = async (id) => {
    if (!id) {
      notify("Invalid journey.");
      return;
    }

    const currentUser = auth.currentUser;

    if (!currentUser) {
      notify(
        "Please log in to remove a saved journey."
      );
      return;
    }

    try {
      setDeletingId(id);

      const journey = journeys.find(
        (item) => item.id === id
      );

      if (!journey) {
        notify("Journey not found.");
        return;
      }

      // Extra client-side ownership check.
      // This does NOT replace Firestore security rules.
      if (
        journey.userId &&
        journey.userId !== currentUser.uid
      ) {
        notify(
          "You can only remove your own saved journeys."
        );
        return;
      }

      await deleteDoc(
        doc(db, "savedRoutes", id)
      );

      notify("Journey removed successfully.");
    } catch (error) {
      console.error(
        "Delete journey error:",
        error
      );

      if (
        error?.code ===
        "permission-denied"
      ) {
        notify(
          "You do not have permission to remove this journey."
        );
      } else {
        notify(
          `Failed to remove journey: ${
            error?.message ||
            "Unknown error"
          }`
        );
      }
    } finally {
      setDeletingId(null);
    }
  };

  // =========================================================
  // OPEN JOURNEY MONITOR
  // =========================================================

  const handleOpenJourney = (journey) => {
    navigate("/journey-monitor", {
      state: {
        savedJourney: journey,
      },
    });
  };

  // =========================================================
  // DATE FORMAT
  // =========================================================

  const formatDate = (timestamp) => {
    if (!timestamp) {
      return "-";
    }

    let date;

    try {
      if (timestamp?.toDate) {
        date = timestamp.toDate();
      } else if (
        timestamp?.seconds
      ) {
        date = new Date(
          timestamp.seconds * 1000
        );
      } else {
        date = new Date(timestamp);
      }
    } catch (error) {
      console.error(
        "Date formatting error:",
        error
      );

      return "-";
    }

    if (
      Number.isNaN(date.getTime())
    ) {
      return "-";
    }

    return date.toLocaleDateString(
      "en-GB",
      {
        day: "2-digit",
        month: "short",
        year: "numeric",
      }
    );
  };

  // =========================================================
  // LOADING
  // =========================================================

  if (loading) {
    return (
      <DashboardLayout>
        <div className="journey-loading">
          Loading your saved journeys...
        </div>
      </DashboardLayout>
    );
  }

  // =========================================================
  // UI
  // =========================================================

  return (
    <DashboardLayout>
      <div className="my-journeys-page">

        {/* =================================================
            HEADER
        ================================================= */}

        <div className="journeys-header">
          <div>
            <span className="journey-label">
              SAVED ROUTES
            </span>

            <h1>
              🛣 My Journeys
            </h1>

            <p>
              Review saved routes and check
              current road hazards before
              travelling.
            </p>
          </div>

          <button
            type="button"
            className="new-journey-btn"
            onClick={() =>
              navigate("/plan-journey")
            }
          >
            + Plan New Journey
          </button>
        </div>

        {/* =================================================
            SUMMARY
        ================================================= */}

        <div className="journey-summary-grid">

          <div className="journey-summary-card">
            <div className="journey-summary-icon">
              🛣
            </div>

            <div>
              <h2>
                {journeys.length}
              </h2>

              <p>
                Saved Journeys
              </p>
            </div>
          </div>

          <div className="journey-summary-card">
            <div className="journey-summary-icon">
              ⚠
            </div>

            <div>
              <h2>
                {
                  journeys.filter(
                    (journey) =>
                      getJourneyHazards(
                        journey
                      ).length > 0
                  ).length
                }
              </h2>

              <p>
                Routes With Alerts
              </p>
            </div>
          </div>

        </div>

        {/* =================================================
            SEARCH
        ================================================= */}

        <div className="journey-search-panel">

          <input
            type="text"
            placeholder="🔍 Search saved journey..."
            value={search}
            onChange={(event) =>
              setSearch(
                event.target.value
              )
            }
          />

          <span>
            {filteredJourneys.length} routes
          </span>

        </div>

        {/* =================================================
            JOURNEY LIST
        ================================================= */}

        {filteredJourneys.length > 0 ? (

          <div className="journey-list">

            {filteredJourneys.map(
              (journey) => {

                const hazards =
                  getJourneyHazards(
                    journey
                  );

                const isDeleting =
                  deletingId ===
                  journey.id;

                return (
                  <div
                    className="journey-card"
                    key={journey.id}
                  >

                    {/* =================================================
                        CARD TOP
                    ================================================= */}

                    <div className="journey-card-top">

                      <div className="journey-route-heading">

                        <div className="route-icon">
                          🛣
                        </div>

                        <div>

                          <h2>
                            {journey.routeName ||
                              "Saved Journey"}
                          </h2>

                          <small>
                            Saved{" "}
                            {formatDate(
                              journey.createdAt
                            )}
                          </small>

                        </div>

                      </div>

                      <span
                        className={
                          hazards.length > 0
                            ? "journey-status warning"
                            : "journey-status safe"
                        }
                      >
                        {hazards.length > 0
                          ? `${hazards.length} Alert${
                              hazards.length >
                              1
                                ? "s"
                                : ""
                            }`
                          : "No Active Alerts"}
                      </span>

                    </div>

                    {/* =================================================
                        ROUTE DISPLAY
                    ================================================= */}

                    <div className="journey-route">

                      <div className="route-point">

                        <span className="point-marker start">
                          A
                        </span>

                        <div>

                          <small>
                            Starting Location
                          </small>

                          <strong>
                            {journey.startName ||
                              journey.startArea ||
                              "Starting location"}
                          </strong>

                        </div>

                      </div>

                      <div className="route-line">
                        <span />
                      </div>

                      <div className="route-point">

                        <span className="point-marker destination">
                          B
                        </span>

                        <div>

                          <small>
                            Destination
                          </small>

                          <strong>
                            {journey.destinationName ||
                              journey.destinationArea ||
                              "Destination"}
                          </strong>

                        </div>

                      </div>

                    </div>

                    {/* =================================================
                        JOURNEY META
                    ================================================= */}

                    <div className="journey-meta-grid">

                      <div>
                        <span>
                          Distance
                        </span>

                        <strong>
                          {journey.distanceKm !=
                          null
                            ? `${Number(
                                journey.distanceKm
                              ).toFixed(
                                1
                              )} km`
                            : "-"}
                        </strong>
                      </div>

                      <div>
                        <span>
                          Estimated Time
                        </span>

                        <strong>
                          {journey.durationMinutes !=
                          null
                            ? `${Math.round(
                                Number(
                                  journey.durationMinutes
                                )
                              )} min`
                            : "-"}
                        </strong>
                      </div>

                      <div>
                        <span>
                          Current Alerts
                        </span>

                        <strong
                          className={
                            hazards.length > 0
                              ? "alert-number"
                              : ""
                          }
                        >
                          {hazards.length}
                        </strong>
                      </div>

                    </div>

                    {/* =================================================
                        ACTIVE HAZARDS
                    ================================================= */}

                    {hazards.length > 0 && (

                      <div className="journey-alert-box">

                        <div className="journey-alert-title">
                          ⚠ Active Hazards Along Route
                        </div>

                        {hazards
                          .slice(0, 3)
                          .map(
                            (incident) => (

                              <div
                                className="journey-alert-item"
                                key={
                                  incident.id
                                }
                              >

                                <div>

                                  <strong>
                                    {incident.incidentType ||
                                      incident.dangerType ||
                                      "Road Incident"}
                                  </strong>

                                  <small>
                                    {incident.area ||
                                      "-"}
                                    ,{" "}
                                    {incident.district ||
                                      "-"}
                                  </small>

                                </div>

                                <span
                                  className={`saved-route-severity ${
                                    incident.severity
                                      ?.toLowerCase() ||
                                    ""
                                  }`}
                                >
                                  {incident.severity ||
                                    "Unknown"}
                                </span>

                              </div>

                            )
                          )}

                        {hazards.length >
                          3 && (

                          <p className="more-route-alerts">
                            +{" "}
                            {hazards.length -
                              3}{" "}
                            more active hazard
                            {hazards.length -
                              3 >
                            1
                              ? "s"
                              : ""}
                          </p>

                        )}

                      </div>

                    )}

                    {/* =================================================
                        BUTTONS
                    ================================================= */}

                    <div className="journey-card-actions">

                      <button
                        type="button"
                        className="open-journey-btn"
                        onClick={() =>
                          handleOpenJourney(
                            journey
                          )
                        }
                        disabled={
                          isDeleting
                        }
                      >
                        📍 Monitor Journey
                      </button>

                      <button
                        type="button"
                        className="remove-journey-btn"
                        onClick={() =>
                          handleDeleteJourney(
                            journey.id
                          )
                        }
                        disabled={
                          isDeleting
                        }
                      >
                        {isDeleting
                          ? "Removing..."
                          : "Remove"}
                      </button>

                    </div>

                  </div>
                );
              }
            )}

          </div>

        ) : (

          /* =================================================
             EMPTY STATE
          ================================================= */

          <div className="no-saved-journeys">

            <div className="empty-route-icon">
              🛣
            </div>

            <h2>
              No saved journeys yet
            </h2>

            <p>
              Plan a journey and save it
              to monitor route conditions
              and road hazards.
            </p>

            <button
              type="button"
              onClick={() =>
                navigate(
                  "/plan-journey"
                )
              }
            >
              Plan Your First Journey
            </button>

          </div>

        )}

      </div>
    </DashboardLayout>
  );
}

export default MyJourneys;