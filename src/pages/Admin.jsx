import { useEffect, useMemo, useState } from "react";
import "./Admin.css";

import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  updateDoc,
  serverTimestamp,
} from "firebase/firestore";

import { auth, db } from "../firebase/firebase";

function Admin() {
  const [incidents, setIncidents] = useState([]);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const [severityFilter, setSeverityFilter] = useState("All");
  const [typeFilter, setTypeFilter] = useState("All");
  const [districtFilter, setDistrictFilter] = useState("All");

  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState(null);

  // =========================================
  // 1. REAL-TIME INCIDENT LISTENER
  // =========================================

  useEffect(() => {
    const incidentRef = collection(db, "incidents");

    const unsubscribe = onSnapshot(
      incidentRef,

      (snapshot) => {
        const incidentData = snapshot.docs.map((docItem) => ({
          id: docItem.id,
          ...docItem.data(),
        }));

        // Newest incidents first
        incidentData.sort((a, b) => {
          const aTime = a.createdAt?.seconds || 0;
          const bTime = b.createdAt?.seconds || 0;

          return bTime - aTime;
        });

        setIncidents(incidentData);
        setLoading(false);
      },

      (error) => {
        console.error("Admin incident listener error:", error);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, []);

  // =========================================
  // 2. UPDATE INCIDENT STATUS
  // =========================================

  const updateIncidentStatus = async (id, status) => {
    const currentUser = auth.currentUser;

    if (!currentUser) {
      alert("Admin authentication required.");
      return;
    }

    try {
      setUpdatingId(id);

      const incidentRef = doc(db, "incidents", id);

      const updateData = {
        status,
        updatedAt: serverTimestamp(),
      };

      if (status === "Verified") {
        updateData.verifiedBy = currentUser.uid;
        updateData.verifiedAt = serverTimestamp();
      }

      if (status === "Rejected") {
        updateData.rejectedBy = currentUser.uid;
        updateData.rejectedAt = serverTimestamp();
      }

      if (status === "Resolved") {
        updateData.resolvedBy = currentUser.uid;
        updateData.resolvedAt = serverTimestamp();
      }

      await updateDoc(incidentRef, updateData);

      alert(`Status updated to ${status}`);
    } catch (error) {
      console.error("Status update error:", error);

      alert(
        "Failed to update incident status. Check admin role and Firestore rules."
      );
    } finally {
      setUpdatingId(null);
    }
  };

  // =========================================
  // 3. DELETE INCIDENT
  // =========================================

  const deleteIncident = async (id) => {
    const confirmDelete = window.confirm(
      "Are you sure you want to permanently delete this incident?"
    );

    if (!confirmDelete) return;

    try {
      setUpdatingId(id);

      await deleteDoc(doc(db, "incidents", id));

      alert("Incident deleted successfully.");
    } catch (error) {
      console.error("Delete incident error:", error);

      alert(
        "Failed to delete incident. Only an admin can delete incidents."
      );
    } finally {
      setUpdatingId(null);
    }
  };

  // =========================================
  // 4. STATISTICS
  // =========================================

  const total = incidents.length;

  const unverified = incidents.filter(
    (incident) => incident.status === "Unverified"
  ).length;

  const communityConfirmed = incidents.filter(
    (incident) => incident.status === "Community Confirmed"
  ).length;

  const verified = incidents.filter(
    (incident) => incident.status === "Verified"
  ).length;

  const resolved = incidents.filter(
    (incident) => incident.status === "Resolved"
  ).length;

  const rejected = incidents.filter(
    (incident) => incident.status === "Rejected"
  ).length;

  const highRisk = incidents.filter(
    (incident) => incident.severity === "High"
  ).length;

  const active = incidents.filter(
    (incident) =>
      incident.status !== "Resolved" &&
      incident.status !== "Rejected"
  ).length;

  // =========================================
  // 5. GET UNIQUE FILTER VALUES
  // =========================================

  const incidentTypes = useMemo(() => {
    return [
      ...new Set(
        incidents
          .map(
            (incident) =>
              incident.incidentType ||
              incident.dangerType ||
              incident.type
          )
          .filter(Boolean)
      ),
    ];
  }, [incidents]);

  const districts = useMemo(() => {
    return [
      ...new Set(
        incidents
          .map((incident) => incident.district)
          .filter(Boolean)
      ),
    ];
  }, [incidents]);

  // =========================================
  // 6. SEARCH + FILTER
  // =========================================

  const filteredIncidents = useMemo(() => {
    const searchText = search.toLowerCase().trim();

    return incidents.filter((incident) => {
      const area = String(incident.area || "").toLowerCase();

      const district = String(
        incident.district || ""
      ).toLowerCase();

      const type = String(
        incident.incidentType ||
          incident.dangerType ||
          incident.type ||
          ""
      ).toLowerCase();

      const description = String(
        incident.description || ""
      ).toLowerCase();

      const matchesSearch =
        !searchText ||
        area.includes(searchText) ||
        district.includes(searchText) ||
        type.includes(searchText) ||
        description.includes(searchText);

      const matchesStatus =
        statusFilter === "All" ||
        incident.status === statusFilter;

      const matchesSeverity =
        severityFilter === "All" ||
        incident.severity === severityFilter;

      const incidentType =
        incident.incidentType ||
        incident.dangerType ||
        incident.type ||
        "";

      const matchesType =
        typeFilter === "All" ||
        incidentType === typeFilter;

      const matchesDistrict =
        districtFilter === "All" ||
        incident.district === districtFilter;

      return (
        matchesSearch &&
        matchesStatus &&
        matchesSeverity &&
        matchesType &&
        matchesDistrict
      );
    });
  }, [
    incidents,
    search,
    statusFilter,
    severityFilter,
    typeFilter,
    districtFilter,
  ]);

  // =========================================
  // 7. RESET FILTERS
  // =========================================

  const clearFilters = () => {
    setSearch("");
    setStatusFilter("All");
    setSeverityFilter("All");
    setTypeFilter("All");
    setDistrictFilter("All");
  };

  // =========================================
  // 8. STATUS CSS CLASS
  // =========================================

  const getStatusClass = (status) => {
    switch (status) {
      case "Verified":
        return "verified";

      case "Community Confirmed":
        return "community-confirmed";

      case "Rejected":
        return "rejected";

      case "Resolved":
        return "resolved";

      default:
        return "unverified";
    }
  };

  // =========================================
  // 9. SEVERITY CSS CLASS
  // =========================================

  const getSeverityClass = (severity) => {
    return String(severity || "")
      .toLowerCase()
      .replace(/\s+/g, "-");
  };

  // =========================================
  // UI
  // =========================================

  return (
    <div className="admin-page">

      {/* HEADER */}

      <div className="admin-header">
        <div>
          <p className="admin-label">
            ADMINISTRATION
          </p>

          <h1 className="admin-title">
            🛡 SafeRoute BD Admin Dashboard
          </h1>

          <p className="admin-subtitle">
            Monitor, verify and manage road safety incidents.
          </p>
        </div>

        <div className="live-indicator">
          <span className="live-dot"></span>
          Live Monitoring
        </div>
      </div>

      {/* STATISTICS */}

      <div className="admin-stats-grid">

        <div className="admin-stat-card">
          <div className="stat-icon">📊</div>

          <div>
            <h2>{total}</h2>
            <p>Total Incidents</p>
          </div>
        </div>

        <div className="admin-stat-card active-card">
          <div className="stat-icon">⚡</div>

          <div>
            <h2>{active}</h2>
            <p>Active</p>
          </div>
        </div>

        <div className="admin-stat-card pending-card">
          <div className="stat-icon">⏳</div>

          <div>
            <h2>{unverified}</h2>
            <p>Unverified</p>
          </div>
        </div>

        <div className="admin-stat-card community-card">
          <div className="stat-icon">👥</div>

          <div>
            <h2>{communityConfirmed}</h2>
            <p>Community Confirmed</p>
          </div>
        </div>

        <div className="admin-stat-card verified-card">
          <div className="stat-icon">✓</div>

          <div>
            <h2>{verified}</h2>
            <p>Verified</p>
          </div>
        </div>

        <div className="admin-stat-card danger-card">
          <div className="stat-icon">⚠</div>

          <div>
            <h2>{highRisk}</h2>
            <p>High Risk</p>
          </div>
        </div>

        <div className="admin-stat-card resolved-card">
          <div className="stat-icon">✓</div>

          <div>
            <h2>{resolved}</h2>
            <p>Resolved</p>
          </div>
        </div>

        <div className="admin-stat-card rejected-card">
          <div className="stat-icon">✕</div>

          <div>
            <h2>{rejected}</h2>
            <p>Rejected</p>
          </div>
        </div>

      </div>

      {/* FILTER SECTION */}

      <div className="admin-filter-panel">

        <div className="filter-header">
          <div>
            <h2>Incident Verification Queue</h2>

            <p>
              Review community reports and update their verification status.
            </p>
          </div>

          <span className="result-count">
            {filteredIncidents.length} results
          </span>
        </div>

        <div className="admin-toolbar">

          <input
            type="text"
            placeholder="🔍 Search area, district, incident..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />

          <select
            value={statusFilter}
            onChange={(e) =>
              setStatusFilter(e.target.value)
            }
          >
            <option value="All">
              All Status
            </option>

            <option value="Unverified">
              Unverified
            </option>

            <option value="Community Confirmed">
              Community Confirmed
            </option>

            <option value="Verified">
              Verified
            </option>

            <option value="Resolved">
              Resolved
            </option>

            <option value="Rejected">
              Rejected
            </option>
          </select>

          <select
            value={severityFilter}
            onChange={(e) =>
              setSeverityFilter(e.target.value)
            }
          >
            <option value="All">
              All Severity
            </option>

            <option value="High">
              High
            </option>

            <option value="Medium">
              Medium
            </option>

            <option value="Low">
              Low
            </option>
          </select>

          <select
            value={typeFilter}
            onChange={(e) =>
              setTypeFilter(e.target.value)
            }
          >
            <option value="All">
              All Incident Types
            </option>

            {incidentTypes.map((type) => (
              <option
                key={type}
                value={type}
              >
                {type}
              </option>
            ))}
          </select>

          <select
            value={districtFilter}
            onChange={(e) =>
              setDistrictFilter(e.target.value)
            }
          >
            <option value="All">
              All Districts
            </option>

            {districts.map((district) => (
              <option
                key={district}
                value={district}
              >
                {district}
              </option>
            ))}
          </select>

          <button
            className="clear-filter-btn"
            onClick={clearFilters}
          >
            Clear
          </button>

        </div>
      </div>

      {/* TABLE */}

      <div className="admin-table-wrapper">

        {loading ? (
          <div className="admin-loading">
            Loading incidents...
          </div>
        ) : (
          <table className="admin-table">

            <thead>
              <tr>
                <th>Incident</th>
                <th>Location</th>
                <th>Severity</th>
                <th>Community Votes</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>

            <tbody>

              {filteredIncidents.length > 0 ? (

                filteredIncidents.map((incident) => {

                  const incidentType =
                    incident.incidentType ||
                    incident.dangerType ||
                    incident.type ||
                    "Road Incident";

                  return (
                    <tr key={incident.id}>

                      {/* INCIDENT */}

                      <td>
                        <div className="incident-info">
                          <strong>
                            {incidentType}
                          </strong>

                          {incident.description && (
                            <small>
                              {incident.description}
                            </small>
                          )}
                        </div>
                      </td>

                      {/* LOCATION */}

                      <td>
                        <div className="location-info">

                          <strong>
                            {incident.area || "-"}
                          </strong>

                          <small>
                            {incident.district || "-"}
                          </small>

                        </div>
                      </td>

                      {/* SEVERITY */}

                      <td>
                        <span
                          className={`severity-badge ${getSeverityClass(
                            incident.severity
                          )}`}
                        >
                          {incident.severity || "-"}
                        </span>
                      </td>

                      {/* COMMUNITY VOTES */}

                      <td>
                        <div className="vote-box">

                          <span className="confirm-vote">
                            👍{" "}
                            {incident.confirmationCount || 0}
                          </span>

                          <span className="reject-vote">
                            👎{" "}
                            {incident.rejectionCount || 0}
                          </span>

                        </div>
                      </td>

                      {/* STATUS */}

                      <td>
                        <span
                          className={`status-badge ${getStatusClass(
                            incident.status
                          )}`}
                        >
                          {incident.status || "Unverified"}
                        </span>
                      </td>

                      {/* ACTION */}

                      <td>
                        <div className="admin-actions">

                          {incident.status !== "Verified" &&
                            incident.status !== "Resolved" && (
                              <button
                                className="action-btn verify-btn"
                                disabled={
                                  updatingId === incident.id
                                }
                                onClick={() =>
                                  updateIncidentStatus(
                                    incident.id,
                                    "Verified"
                                  )
                                }
                              >
                                ✓ Verify
                              </button>
                            )}

                          {incident.status !== "Rejected" &&
                            incident.status !== "Resolved" && (
                              <button
                                className="action-btn reject-btn"
                                disabled={
                                  updatingId === incident.id
                                }
                                onClick={() =>
                                  updateIncidentStatus(
                                    incident.id,
                                    "Rejected"
                                  )
                                }
                              >
                                ✕ Reject
                              </button>
                            )}

                          {incident.status === "Verified" && (
                            <button
                              className="action-btn resolve-btn"
                              disabled={
                                updatingId === incident.id
                              }
                              onClick={() =>
                                updateIncidentStatus(
                                  incident.id,
                                  "Resolved"
                                )
                              }
                            >
                              ✓ Resolve
                            </button>
                          )}

                          <button
                            className="action-btn delete-btn"
                            disabled={
                              updatingId === incident.id
                            }
                            onClick={() =>
                              deleteIncident(incident.id)
                            }
                          >
                            🗑
                          </button>

                        </div>
                      </td>

                    </tr>
                  );
                })

              ) : (

                <tr>
                  <td
                    colSpan="6"
                    className="no-incidents"
                  >
                    <div>
                      <h3>📭 No incidents found</h3>
                      <p>
                        Try changing the search or filters.
                      </p>
                    </div>
                  </td>
                </tr>

              )}

            </tbody>

          </table>
        )}

      </div>

    </div>
  );
}

export default Admin;