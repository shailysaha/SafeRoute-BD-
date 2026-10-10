import { useEffect, useMemo, useState } from "react";
import "./Admin.css";

import {
  collection,
  doc,
  onSnapshot,
  updateDoc,
  addDoc,
  serverTimestamp,
} from "firebase/firestore";

import { auth, db } from "../firebase/firebase";
import { notify } from "../utils/notify";



function Admin() {
  const [incidents, setIncidents] = useState([]);
  const [moderationReports, setModerationReports] = useState([]);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const [severityFilter, setSeverityFilter] = useState("All");
  const [typeFilter, setTypeFilter] = useState("All");
  const [districtFilter, setDistrictFilter] = useState("All");

  const [moderationFilter, setModerationFilter] = useState("All");

  const [loading, setLoading] = useState(true);
  const [moderationLoading, setModerationLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState(null);

  /* =========================================================
     CUSTOM CONFIRMATION DIALOG
  ========================================================= */

  const [confirmDialog, setConfirmDialog] = useState({
    open: false,
    title: "",
    message: "",
    confirmText: "Yes, Continue",
    action: null,
    data: null,
  });

  const openConfirmDialog = ({
    title,
    message,
    confirmText = "Yes, Continue",
    action,
    data = null,
  }) => {
    setConfirmDialog({
      open: true,
      title,
      message,
      confirmText,
      action,
      data,
    });
  };

  const closeConfirmDialog = () => {
    setConfirmDialog({
      open: false,
      title: "",
      message: "",
      confirmText: "Yes, Continue",
      action: null,
      data: null,
    });
  };

  const handleConfirmAction = async () => {
    const selectedAction = confirmDialog.action;
    const selectedData = confirmDialog.data;

    closeConfirmDialog();

    if (selectedAction === "deleteIncident") {
      await performDeleteIncident(selectedData);
    }

    if (selectedAction === "removeIncident") {
      await performRemoveIncident(selectedData);
    }
  };

  /* =========================================================
     1. REAL-TIME INCIDENT LISTENER
  ========================================================= */

  useEffect(() => {
    const incidentRef = collection(db, "incidents");

    const unsubscribe = onSnapshot(
      incidentRef,
      (snapshot) => {
        const incidentData = snapshot.docs.map((docItem) => ({
          id: docItem.id,
          ...docItem.data(),
        }));

        incidentData.sort((a, b) => {
          const aTime = a.createdAt?.seconds || 0;
          const bTime = b.createdAt?.seconds || 0;

          return bTime - aTime;
        });

        setIncidents(incidentData);
        setLoading(false);
      },
      (error) => {
        console.error(
          "Admin incident listener error:",
          error
        );

        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, []);

  /* =========================================================
     2. MODERATION QUEUE LISTENER
  ========================================================= */

  useEffect(() => {
    const moderationRef = collection(
      db,
      "moderationReports"
    );

    const unsubscribe = onSnapshot(
      moderationRef,
      (snapshot) => {
        const reports = snapshot.docs.map((docItem) => ({
          id: docItem.id,
          ...docItem.data(),
        }));

        reports.sort((a, b) => {
          const aTime = a.createdAt?.seconds || 0;
          const bTime = b.createdAt?.seconds || 0;

          return bTime - aTime;
        });

        setModerationReports(reports);
        setModerationLoading(false);
      },
      (error) => {
        console.error(
          "Moderation queue listener error:",
          error
        );

        setModerationLoading(false);
      }
    );

    return () => unsubscribe();
  }, []);

  /* =========================================================
     3. AUDIT LOG
  ========================================================= */

  const createAuditLog = async ({
    action,
    incidentId = null,
    moderationReportId = null,
    reason = "",
  }) => {
    const currentUser = auth.currentUser;

    if (!currentUser) {
      console.warn(
        "Audit log skipped: no authenticated user."
      );

      return false;
    }

    try {
      await addDoc(
        collection(db, "moderationAuditLogs"),
        {
          action,
          incidentId,
          moderationReportId,
          reason,

          adminId: currentUser.uid,
          adminEmail: currentUser.email || "",

          createdAt: serverTimestamp(),
        }
      );

      return true;
    } catch (error) {
      console.warn(
        "Audit log could not be created. Main action was successful:",
        error
      );

      return false;
    }
  };

  /* =========================================================
     4. UPDATE INCIDENT STATUS
  ========================================================= */

  const updateIncidentStatus = async (id, status) => {
    const currentUser = auth.currentUser;

    if (!currentUser) {
      notify("Admin authentication required.");
      return;
    }

    try {
      setUpdatingId(id);

      const incident = incidents.find(
        (item) => item.id === id
      );

      if (!incident) {
        throw new Error("Incident not found.");
      }

      const reporterId =
        incident.reporterId ||
        incident.userId ||
        "";

      const incidentRef = doc(
        db,
        "incidents",
        id
      );

      /* =====================================================
         VERIFY
      ===================================================== */

      if (status === "Verified") {
        await updateDoc(incidentRef, {
          status: "Verified",
          verificationStatus: "verified",

          verifiedBy: currentUser.uid,
          verifiedAt: serverTimestamp(),

          updatedAt: serverTimestamp(),
        });

        try {
          if (reporterId) {
            await processReportReputation(
              id,
              reporterId,
              "verified"
            );
          }
        } catch (reputationError) {
          console.error(
            "Reputation update error:",
            reputationError
          );
        }

        await createAuditLog({
          action: "VERIFY_INCIDENT",
          incidentId: id,
          reason: "Incident verified by admin.",
        });

        notify(
          "Incident verified successfully."
        );

        return;
      }

      /* =====================================================
         FALSE REPORT / REJECT
      ===================================================== */

      if (
        status === "Rejected" ||
        status === "False Report"
      ) {
        await updateDoc(incidentRef, {
          status: "False Report",
          verificationStatus: "false",

          rejectedBy: currentUser.uid,
          rejectedAt: serverTimestamp(),

          moderationReason:
            "Rejected by administrator.",

          updatedAt: serverTimestamp(),
        });

        try {
          if (reporterId) {
            await processReportReputation(
              id,
              reporterId,
              "false"
            );
          }
        } catch (reputationError) {
          console.error(
            "Reputation update error:",
            reputationError
          );
        }

        await createAuditLog({
          action: "REJECT_INCIDENT",
          incidentId: id,
          reason:
            "Incident rejected as false information.",
        });

        notify(
          "Incident rejected successfully."
        );

        return;
      }

      /* =====================================================
         RESOLVE
      ===================================================== */

      if (status === "Resolved") {
        await updateDoc(incidentRef, {
          status: "Resolved",

          resolvedBy: currentUser.uid,
          resolvedAt: serverTimestamp(),

          updatedAt: serverTimestamp(),
        });

        await createAuditLog({
          action: "RESOLVE_INCIDENT",
          incidentId: id,
          reason: "Incident marked as resolved.",
        });

        notify(
          "Incident resolved successfully."
        );

        return;
      }

      throw new Error(
        `Unsupported incident status: ${status}`
      );
    } catch (error) {
      console.error(
        "Status update error:",
        error
      );

      notify(
        `Failed to update incident: ${
          error?.message ||
          "Unknown error"
        }`
      );
    } finally {
      setUpdatingId(null);
    }
  };

  /* =========================================================
     5. DELETE INCIDENT - OPEN CONFIRMATION
  ========================================================= */

  const deleteIncident = (id) => {
    openConfirmDialog({
      title: "Delete Incident?",
      message:
        "Are you sure you want to permanently remove this incident? This action will also update the reporter's reputation.",
      confirmText: "Yes, Delete",
      action: "deleteIncident",
      data: id,
    });
  };

  /* =========================================================
     6. ACTUAL DELETE INCIDENT
  ========================================================= */

  const performDeleteIncident = async (id) => {
    try {
      setUpdatingId(id);

      await deleteIncidentAndUpdateReputation(id);

      await createAuditLog({
        action: "DELETE_INCIDENT",
        incidentId: id,
        reason:
          "Incident permanently removed by administrator.",
      });

      notify(
        "Incident removed successfully."
      );
    } catch (error) {
      console.error(
        "Delete incident error:",
        error
      );

      notify(
        `Failed to delete incident: ${
          error?.message ||
          "Unknown error"
        }`
      );
    } finally {
      setUpdatingId(null);
    }
  };

  /* =========================================================
     7. MODERATION REPORT ACTION
  ========================================================= */

  const handleModerationAction = async (
    moderationReport,
    action
  ) => {
    const currentUser = auth.currentUser;

    if (!currentUser) {
      notify("Admin authentication required.");
      return;
    }

    const incidentId =
      moderationReport.incidentId;

    if (!incidentId) {
      notify(
        "This moderation report does not contain an incident ID."
      );

      return;
    }

    try {
      setUpdatingId(
        moderationReport.id
      );

      const moderationRef = doc(
        db,
        "moderationReports",
        moderationReport.id
      );

      /* =====================================================
         DISMISS
      ===================================================== */

      if (action === "dismiss") {
        await updateDoc(moderationRef, {
          status: "dismissed",

          reviewedBy: currentUser.uid,
          reviewedAt: serverTimestamp(),

          updatedAt: serverTimestamp(),
        });

        await createAuditLog({
          action:
            "DISMISS_MODERATION_REPORT",

          incidentId,

          moderationReportId:
            moderationReport.id,

          reason:
            moderationReport.reason ||
            "Moderation report dismissed.",
        });

        notify(
          "Moderation report dismissed."
        );

        return;
      }

      /* =====================================================
         REVIEW
      ===================================================== */

      if (action === "review") {
        await updateDoc(moderationRef, {
          status: "reviewed",

          reviewedBy: currentUser.uid,
          reviewedAt: serverTimestamp(),

          updatedAt: serverTimestamp(),
        });

        await createAuditLog({
          action:
            "REVIEW_MODERATION_REPORT",

          incidentId,

          moderationReportId:
            moderationReport.id,

          reason:
            moderationReport.reason ||
            "Moderation report reviewed.",
        });

        notify(
          "Moderation report marked as reviewed."
        );

        return;
      }

      /* =====================================================
         REMOVE INCIDENT

         IMPORTANT:
         Do NOT use window.confirm here.
      ===================================================== */

      if (action === "remove") {
        // Check if incident still exists before showing confirm dialog
        const incidentExists = incidents.some(
          (item) => item.id === incidentId
        );

        if (!incidentExists) {
          notify(
            "This incident has already been removed."
          );
          return;
        }

        openConfirmDialog({
          title: "Remove Reported Incident?",
          message:
            "This will permanently remove the reported incident and update the reporter's reputation. This action cannot be undone.",
          confirmText: "Yes, Remove",
          action: "removeIncident",

          data: {
            moderationReport,
            currentUser,
          },
        });

        return;
      }

      throw new Error(
        `Unsupported moderation action: ${action}`
      );
    } catch (error) {
      console.error(
        "Moderation action error:",
        error
      );

      notify(
        `Moderation action failed: ${
          error?.message ||
          "Unknown error"
        }`
      );
    } finally {
      setUpdatingId(null);
    }
  };

  /* =========================================================
     8. ACTUAL REMOVE REPORTED INCIDENT
  ========================================================= */

  const performRemoveIncident = async ({
    moderationReport,
    currentUser,
  }) => {
    const incidentId =
      moderationReport.incidentId;

    try {
      setUpdatingId(
        moderationReport.id
      );

      // Check if incident still exists before trying to delete
      const incidentExists = incidents.some(
        (item) => item.id === incidentId
      );

      if (incidentExists) {
        /*
         * Remove the actual incident first.
         */
        await deleteIncidentAndUpdateReputation(
          incidentId
        );
      } else {
        console.warn(
          "Incident no longer exists, skipping deletion."
        );
      }

      /*
       * Update moderation report.
       *
       * If this fails, the incident deletion
       * has already succeeded.
       */
      try {
        const moderationRef = doc(
          db,
          "moderationReports",
          moderationReport.id
        );

        await updateDoc(moderationRef, {
          status: "action_taken",

          actionTaken:
            "incident_removed",

          reviewedBy: currentUser.uid,
          reviewedAt: serverTimestamp(),

          updatedAt: serverTimestamp(),
        });
      } catch (moderationUpdateError) {
        console.error(
          "Moderation report status update failed after incident removal:",
          moderationUpdateError
        );
      }

      /*
       * Audit log is non-blocking.
       */
      await createAuditLog({
        action:
          "REMOVE_REPORTED_INCIDENT",

        incidentId,

        moderationReportId:
          moderationReport.id,

        reason:
          moderationReport.reason ||
          "Incident removed after moderation review.",
      });

      notify(
        "Reported incident removed successfully."
      );
    } catch (error) {
      console.error(
        "Remove reported incident error:",
        error
      );

      notify(
        `Failed to remove incident: ${
          error?.message ||
          "Unknown error"
        }`
      );
    } finally {
      setUpdatingId(null);
    }
  };

  /* =========================================================
     9. STATISTICS
  ========================================================= */

  const total = incidents.length;

  const unverified = incidents.filter(
    (incident) =>
      !incident.status ||
      incident.status === "Unverified"
  ).length;

  const communityConfirmed =
    incidents.filter(
      (incident) =>
        incident.status ===
        "Community Confirmed"
    ).length;

  const verified = incidents.filter(
    (incident) =>
      incident.status === "Verified"
  ).length;

  const resolved = incidents.filter(
    (incident) =>
      incident.status === "Resolved"
  ).length;

  const rejected = incidents.filter(
    (incident) =>
      incident.status === "Rejected" ||
      incident.status === "False Report"
  ).length;

  const highRisk = incidents.filter(
    (incident) =>
      String(
        incident.severity || ""
      ).toLowerCase() === "high"
  ).length;

  const active = incidents.filter(
    (incident) =>
      incident.status !== "Resolved" &&
      incident.status !== "Rejected" &&
      incident.status !== "False Report"
  ).length;

  /* =========================================================
     10. MODERATION STATISTICS
  ========================================================= */

  const pendingModeration =
    moderationReports.filter(
      (report) =>
        !report.status ||
        report.status === "pending"
    ).length;

  const duplicateIncidents =
    incidents.filter(
      (incident) =>
        incident.isDuplicate === true ||
        incident.duplicate === true ||
        incident.duplicateDetected === true ||
        incident.moderationFlag ===
          "duplicate"
    ).length;

  const falseInformationReports =
    moderationReports.filter(
      (report) =>
        String(
          report.reason || ""
        ).toLowerCase() ===
        "false information"
    ).length;

  const spamReports =
    moderationReports.filter(
      (report) =>
        String(
          report.reason || ""
        ).toLowerCase() === "spam"
    ).length;

  /*
   * Keep these variables available because
   * they may already be used by your project.
   */
  void falseInformationReports;
  void spamReports;

  /* =========================================================
     11. INCIDENT TYPES
  ========================================================= */

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

  /* =========================================================
     12. DISTRICTS
  ========================================================= */

  const districts = useMemo(() => {
    return [
      ...new Set(
        incidents
          .map(
            (incident) =>
              incident.district
          )
          .filter(Boolean)
      ),
    ];
  }, [incidents]);

  /* =========================================================
     13. SEARCH + FILTER
  ========================================================= */

  const filteredIncidents = useMemo(() => {
    const searchText =
      search.toLowerCase().trim();

    return incidents.filter((incident) => {
      const area = String(
        incident.area || ""
      ).toLowerCase();

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
        incident.status ===
          statusFilter ||
        (
          statusFilter === "Unverified" &&
          !incident.status
        );

      const matchesSeverity =
        severityFilter === "All" ||
        incident.severity ===
          severityFilter;

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
        incident.district ===
          districtFilter;

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

  /* =========================================================
     14. MODERATION FILTER
  ========================================================= */

  const filteredModerationReports =
    useMemo(() => {
      if (
        moderationFilter === "All"
      ) {
        return moderationReports;
      }

      if (moderationFilter === "Pending") {
        return moderationReports.filter(
          (report) =>
            !report.status ||
            report.status === "pending"
        );
      }

      if (moderationFilter === "Reviewed") {
        return moderationReports.filter(
          (report) =>
            report.status === "reviewed"
        );
      }

      if (moderationFilter === "Dismissed") {
        return moderationReports.filter(
          (report) =>
            report.status === "dismissed"
        );
      }

      if (moderationFilter === "Action Taken") {
        return moderationReports.filter(
          (report) =>
            report.status === "action_taken"
        );
      }

      return moderationReports.filter(
        (report) => {
          const reason = String(
            report.reason || ""
          ).toLowerCase();

          if (
            moderationFilter ===
            "False Information"
          ) {
            return (
              reason ===
              "false information"
            );
          }

          if (
            moderationFilter === "Spam"
          ) {
            return reason === "spam";
          }

          if (
            moderationFilter ===
            "Duplicate"
          ) {
            return reason === "duplicate";
          }

          if (
            moderationFilter ===
            "Inappropriate"
          ) {
            return (
              reason ===
                "inappropriate content" ||
              reason === "inappropriate"
            );
          }

          return true;
        }
      );
    }, [
      moderationReports,
      moderationFilter,
    ]);

  /* =========================================================
     15. CLEAR FILTERS
  ========================================================= */

  const clearFilters = () => {
    setSearch("");
    setStatusFilter("All");
    setSeverityFilter("All");
    setTypeFilter("All");
    setDistrictFilter("All");
  };

  /* =========================================================
     16. STATUS CLASS
  ========================================================= */

  const getStatusClass = (status) => {
    switch (status) {
      case "Verified":
        return "verified";

      case "Community Confirmed":
        return "community-confirmed";

      case "Rejected":
      case "False Report":
        return "rejected";

      case "Resolved":
        return "resolved";

      default:
        return "unverified";
    }
  };

  /* =========================================================
     17. SEVERITY CLASS
  ========================================================= */

  const getSeverityClass = (severity) => {
    return String(
      severity || ""
    )
      .toLowerCase()
      .replace(/\s+/g, "-");
  };

  /* =========================================================
     18. UI
  ========================================================= */

  return (
    <div className="admin-page">

      {/* =====================================================
          HEADER
      ===================================================== */}

      <div className="admin-header">

        <div>
          <p className="admin-label">
            ADMINISTRATION
          </p>

          <h1 className="admin-title">
            🛡 SafeRoute BD Admin Dashboard
          </h1>

          <p className="admin-subtitle">
            Monitor, verify, moderate and
            manage road safety incidents.
          </p>
        </div>

        <div className="live-indicator">
          <span className="live-dot"></span>
          Live Monitoring
        </div>

      </div>

      {/* =====================================================
          STATISTICS
      ===================================================== */}

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
            <p>False Reports</p>
          </div>
        </div>

        <div className="admin-stat-card">
          <div className="stat-icon">🚩</div>

          <div>
            <h2>{pendingModeration}</h2>
            <p>Moderation Queue</p>
          </div>
        </div>

        <div className="admin-stat-card danger-card">
          <div className="stat-icon">🔁</div>

          <div>
            <h2>{duplicateIncidents}</h2>
            <p>Possible Duplicates</p>
          </div>
        </div>

      </div>

      {/* =====================================================
          MODERATION QUEUE
      ===================================================== */}

      <div className="admin-filter-panel">

        <div className="filter-header">

          <div>
            <h2>
              🚩 Community Moderation Queue
            </h2>

            <p>
              Review reports submitted by
              users against suspicious or
              inappropriate incidents.
            </p>
          </div>

          <span className="result-count">
            {filteredModerationReports.length} reports
          </span>

        </div>

        <div className="admin-toolbar">

          <select
            value={moderationFilter}
            onChange={(e) =>
              setModerationFilter(
                e.target.value
              )
            }
          >
            <option value="All">
              All Reports
            </option>

            <option value="Pending">
              Pending
            </option>

            <option value="Reviewed">
              Reviewed
            </option>

            <option value="Dismissed">
              Dismissed
            </option>

            <option value="Action Taken">
              Action Taken
            </option>

            <option value="False Information">
              False Information
            </option>

            <option value="Spam">
              Spam
            </option>

            <option value="Duplicate">
              Duplicate
            </option>

            <option value="Inappropriate">
              Inappropriate
            </option>
          </select>

        </div>

        <div
          className="moderation-queue"
          style={{
            marginTop: "18px",
          }}
        >

          {moderationLoading ? (
            <div className="admin-loading">
              Loading moderation reports...
            </div>
          ) : filteredModerationReports.length === 0 ? (
            <div className="no-incidents">
              <h3>
                ✅ No moderation reports
              </h3>

              <p>
                {moderationFilter === "Pending" 
                  ? "The moderation queue is currently clear." 
                  : `No reports found with filter: ${moderationFilter}`}
              </p>
            </div>
          ) : (
            <div
              style={{
                display: "grid",
                gap: "12px",
              }}
            >

              {filteredModerationReports.map(
                (report) => {

                  const incident =
                    incidents.find(
                      (item) =>
                        item.id ===
                        report.incidentId
                    );

                  // Determine badge class based on status
                  let badgeClass = "unverified";
                  let statusDisplay = report.status || "pending";
                  
                  if (report.status === "dismissed") {
                    badgeClass = "rejected";
                  } else if (report.status === "reviewed") {
                    badgeClass = "verified";
                  } else if (report.status === "action_taken") {
                    badgeClass = "verified";
                  }

                  // Check if incident exists (for remove button)
                  const incidentExists = incident !== undefined;

                  return (
                    <div
                      key={report.id}
                      style={{
                        padding: "16px",
                        border:
                          "1px solid #e2e8f0",
                        borderRadius: "14px",
                        background:
                          report.status === "dismissed" || report.status === "action_taken"
                            ? "#f1f5f9"
                            : "#f8fafc",
                        opacity:
                          report.status === "dismissed" || report.status === "action_taken"
                            ? "0.8"
                            : "1",
                      }}
                    >

                      <div
                        style={{
                          display: "flex",
                          justifyContent:
                            "space-between",
                          gap: "15px",
                          flexWrap: "wrap",
                        }}
                      >

                        <div>

                          <strong>
                            🚩{" "}
                            {report.reason ||
                              "Community Report"}
                          </strong>

                          <p
                            style={{
                              margin: "6px 0",
                              color: "#64748b",
                              fontSize: "13px",
                            }}
                          >
                            {report.description ||
                              "No additional description provided."}
                          </p>

                          <small
                            style={{
                              color: "#94a3b8",
                            }}
                          >
                            Incident ID:{" "}
                            {report.incidentId ||
                              "Unknown"}
                          </small>

                          {report.status && (
                            <div
                              style={{
                                marginTop: "4px",
                                fontSize: "11px",
                                color: "#94a3b8",
                              }}
                            >
                              Status: {report.status}
                              {report.reviewedBy && ` • Reviewed by: ${report.reviewedBy.substring(0, 8)}...`}
                            </div>
                          )}

                        </div>

                        <span
                          className={`status-badge ${badgeClass}`}
                        >
                          {statusDisplay}
                        </span>

                      </div>

                      {incident && (
                        <div
                          style={{
                            marginTop: "12px",
                            padding: "12px",
                            background: "#ffffff",
                            borderRadius: "10px",
                            border:
                              "1px solid #e2e8f0",
                          }}
                        >

                          <strong>
                            {incident.incidentType ||
                              incident.dangerType ||
                              incident.type ||
                              "Road Incident"}
                          </strong>

                          <div
                            style={{
                              marginTop: "4px",
                              color: "#64748b",
                              fontSize: "12px",
                            }}
                          >
                            📍{" "}
                            {incident.area || "-"}
                            {", "}
                            {incident.district || "-"}
                          </div>

                          {(incident.isDuplicate ||
                            incident.duplicate ||
                            incident.duplicateDetected) && (
                            <div
                              style={{
                                marginTop: "8px",
                                color: "#b45309",
                                fontWeight: "700",
                                fontSize: "12px",
                              }}
                            >
                              🔁 Possible duplicate
                              incident detected
                            </div>
                          )}

                        </div>
                      )}

                      {!incident && report.incidentId && (
                        <div
                          style={{
                            marginTop: "12px",
                            padding: "8px 12px",
                            background: "#fef2f2",
                            borderRadius: "6px",
                            fontSize: "12px",
                            color: "#dc2626",
                          }}
                        >
                          ⚠️ The associated incident has been removed.
                        </div>
                      )}

                      {/* ALWAYS SHOW ACTION BUTTONS FOR ALL REPORTS */}
                      <div
                        className="admin-actions"
                        style={{
                          marginTop: "12px",
                        }}
                      >

                        <button
                          className="action-btn verify-btn"
                          disabled={
                            updatingId ===
                            report.id ||
                            report.status === "action_taken"
                          }
                          onClick={() =>
                            handleModerationAction(
                              report,
                              "review"
                            )
                          }
                        >
                          ✓ Review
                        </button>

                        <button
                          className="action-btn reject-btn"
                          disabled={
                            updatingId ===
                            report.id ||
                            report.status === "action_taken"
                          }
                          onClick={() =>
                            handleModerationAction(
                              report,
                              "dismiss"
                            )
                          }
                        >
                          ✕ Dismiss
                        </button>

                        {/* Only show Remove Incident button if incident exists and report is pending */}
                        {incidentExists && (
                          <button
                            className="action-btn delete-btn"
                            disabled={
                              updatingId ===
                              report.id ||
                              report.status === "action_taken"
                            }
                            onClick={() =>
                              handleModerationAction(
                                report,
                                "remove"
                              )
                            }
                          >
                            🗑 Remove Incident
                          </button>
                        )}

                      </div>

                      {/* Show status message for non-pending reports */}
                      {(report.status === "reviewed" || 
                        report.status === "dismissed" || 
                        report.status === "action_taken") && (
                        <div
                          style={{
                            marginTop: "8px",
                            padding: "8px 12px",
                            background: "#f1f5f9",
                            borderRadius: "6px",
                            fontSize: "12px",
                            color: "#64748b",
                          }}
                        >
                          {report.status === "reviewed" && "✓ This report has been reviewed"}
                          {report.status === "dismissed" && "✕ This report was dismissed"}
                          {report.status === "action_taken" && "🗑 Action has been taken on this report"}
                        </div>
                      )}

                    </div>
                  );
                }
              )}

            </div>
          )}

        </div>

      </div>

      {/* =====================================================
          INCIDENT VERIFICATION QUEUE
      ===================================================== */}

      <div className="admin-filter-panel">

        <div className="filter-header">

          <div>
            <h2>
              Incident Verification Queue
            </h2>

            <p>
              Review community reports and
              update their verification status.
            </p>
          </div>

          <span className="result-count">
            {filteredIncidents.length} results
          </span>

        </div>

        {/* FILTERS */}

        <div className="admin-toolbar">

          <input
            type="text"
            placeholder="🔍 Search area, district, incident..."
            value={search}
            onChange={(e) =>
              setSearch(e.target.value)
            }
          />

          <select
            value={statusFilter}
            onChange={(e) =>
              setStatusFilter(
                e.target.value
              )
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

            <option value="False Report">
              False Report
            </option>
          </select>

          <select
            value={severityFilter}
            onChange={(e) =>
              setSeverityFilter(
                e.target.value
              )
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
              setTypeFilter(
                e.target.value
              )
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
              setDistrictFilter(
                e.target.value
              )
            }
          >
            <option value="All">
              All Districts
            </option>

            {districts.map(
              (district) => (
                <option
                  key={district}
                  value={district}
                >
                  {district}
                </option>
              )
            )}
          </select>

          <button
            className="clear-filter-btn"
            onClick={clearFilters}
          >
            Clear
          </button>

        </div>

      </div>

      {/* =====================================================
          INCIDENT TABLE
      ===================================================== */}

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
                <th>Moderation</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>

            <tbody>

              {filteredIncidents.length > 0 ? (
                filteredIncidents.map(
                  (incident) => {

                    const incidentType =
                      incident.incidentType ||
                      incident.dangerType ||
                      incident.type ||
                      "Road Incident";

                    const isDuplicate =
                      incident.isDuplicate === true ||
                      incident.duplicate === true ||
                      incident.duplicateDetected === true ||
                      incident.moderationFlag ===
                        "duplicate";

                    const incidentReports =
                      moderationReports.filter(
                        (report) =>
                          report.incidentId ===
                            incident.id &&
                          (
                            !report.status ||
                            report.status ===
                              "pending"
                          )
                      );

                    return (
                      <tr
                        key={incident.id}
                      >

                        {/* INCIDENT */}

                        <td>
                          <div className="incident-info">

                            <strong>
                              {incidentType}
                            </strong>

                            {incident.description && (
                              <small>
                                {
                                  incident.description
                                }
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

                        {/* VOTES */}

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

                        {/* MODERATION */}

                        <td>

                          {isDuplicate && (
                            <span
                              className="status-badge rejected"
                              style={{
                                marginBottom:
                                  "5px",
                              }}
                            >
                              🔁 Duplicate
                            </span>
                          )}

                          {incidentReports.length >
                            0 && (
                            <span
                              className="status-badge unverified"
                            >
                              🚩{" "}
                              {incidentReports.length}{" "}
                              Report
                              {incidentReports.length >
                              1
                                ? "s"
                                : ""}
                            </span>
                          )}

                          {!isDuplicate &&
                            incidentReports.length ===
                              0 && (
                              <span
                                style={{
                                  color:
                                    "#94a3b8",
                                  fontSize:
                                    "11px",
                                }}
                              >
                                Clear
                              </span>
                            )}

                        </td>

                        {/* STATUS */}

                        <td>
                          <span
                            className={`status-badge ${getStatusClass(
                              incident.status
                            )}`}
                          >
                            {incident.status ||
                              "Unverified"}
                          </span>
                        </td>

                        {/* ACTIONS */}

                        <td>
                          <div className="admin-actions">

                            {/* VERIFY */}

                            {incident.status !==
                              "Verified" &&
                              incident.status !==
                                "Resolved" &&
                              incident.status !==
                                "False Report" && (

                              <button
                                className="action-btn verify-btn"
                                disabled={
                                  updatingId ===
                                  incident.id
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

                            {/* REJECT */}

                            {incident.status !==
                              "False Report" &&
                              incident.status !==
                                "Rejected" &&
                              incident.status !==
                                "Resolved" && (

                              <button
                                className="action-btn reject-btn"
                                disabled={
                                  updatingId ===
                                  incident.id
                                }
                                onClick={() =>
                                  updateIncidentStatus(
                                    incident.id,
                                    "False Report"
                                  )
                                }
                              >
                                ✕ Reject
                              </button>

                            )}

                            {/* RESOLVE */}

                            {incident.status ===
                              "Verified" && (

                              <button
                                className="action-btn resolve-btn"
                                disabled={
                                  updatingId ===
                                  incident.id
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

                            {/* DELETE */}

                            <button
                              className="action-btn delete-btn"
                              disabled={
                                updatingId ===
                                incident.id
                              }
                              onClick={() =>
                                deleteIncident(
                                  incident.id
                                )
                              }
                            >
                              🗑
                            </button>

                          </div>
                        </td>

                      </tr>
                    );
                  }
                )
              ) : (

                <tr>

                  <td
                    colSpan="7"
                    className="no-incidents"
                  >

                    <div>

                      <h3>
                        📭 No incidents found
                      </h3>

                      <p>
                        Try changing the
                        search or filters.
                      </p>

                    </div>

                  </td>

                </tr>

              )}

            </tbody>

          </table>
        )}

      </div>

      {/* =====================================================
          CUSTOM CONFIRMATION MODAL
      ===================================================== */}

      {confirmDialog.open && (
        <div
          className="confirm-overlay"
          onMouseDown={(event) => {
            if (
              event.target ===
              event.currentTarget
            ) {
              closeConfirmDialog();
            }
          }}
        >

          <div
            className="confirm-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="confirm-dialog-title"
          >

            <div className="confirm-icon">
              ⚠️
            </div>

            <h2 id="confirm-dialog-title">
              {confirmDialog.title}
            </h2>

            <p>
              {confirmDialog.message}
            </p>

            <div className="confirm-actions">

              <button
                type="button"
                className="confirm-cancel-btn"
                onClick={closeConfirmDialog}
              >
                Cancel
              </button>

              <button
                type="button"
                className="confirm-delete-btn"
                onClick={
                  handleConfirmAction
                }
              >
                {confirmDialog.confirmText}
              </button>

            </div>

          </div>

        </div>
      )}

    </div>
  );
}

export default Admin;