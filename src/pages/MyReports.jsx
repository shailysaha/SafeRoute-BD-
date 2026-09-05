import { useEffect, useState, useCallback } from "react";

import { onAuthStateChanged } from "firebase/auth";

import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  query,
  updateDoc,
  where,
  serverTimestamp,
} from "firebase/firestore";

import { auth, db } from "../firebase/firebase";

import DashboardLayout from "../layout/DashboardLayout";
import { notify } from "../utils/notify";
import "./MyReports.css";

// =========================================================
// DATE HELPERS
// =========================================================

const getDateValue = (createdAt) => {
  if (!createdAt) return 0;

  try {
    const date =
      typeof createdAt?.toDate === "function"
        ? createdAt.toDate()
        : new Date(createdAt);

    return Number.isNaN(date.getTime())
      ? 0
      : date.getTime();
  } catch {
    return 0;
  }
};

const formatDate = (createdAt) => {
  if (!createdAt) {
    return "Time unavailable";
  }

  try {
    const date =
      typeof createdAt?.toDate === "function"
        ? createdAt.toDate()
        : new Date(createdAt);

    if (Number.isNaN(date.getTime())) {
      return "Time unavailable";
    }

    return date.toLocaleString("en-BD", {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
  } catch {
    return "Time unavailable";
  }
};

// =========================================================
// COMPONENT
// =========================================================

function MyReports() {
  const [reports, setReports] = useState([]);

  const [currentUser, setCurrentUser] =
    useState(null);

  const [loading, setLoading] =
    useState(true);

  const [editingId, setEditingId] =
    useState(null);

  const [editingSource, setEditingSource] =
    useState(null);

  const [editData, setEditData] =
    useState({
      dangerType: "",
      severity: "",
      description: "",
    });

  // =======================================================
  // DELETE CONFIRMATION STATES
  // =======================================================

  const [deleteTarget, setDeleteTarget] =
    useState(null);

  const [deleting, setDeleting] =
    useState(false);

  // =======================================================
  // LOAD MY REPORTS
  // =======================================================

  const loadMyReports = useCallback(
    async (userId) => {
      if (!userId) {
        setReports([]);
        setLoading(false);
        return;
      }

      setLoading(true);

      try {
        // =================================================
        // NEW INCIDENTS
        // =================================================

        const incidentsQuery = query(
          collection(db, "incidents"),
          where("reporterId", "==", userId)
        );

        // =================================================
        // OLD REPORTS
        // =================================================

        const oldReportsQuery = query(
          collection(db, "reports"),
          where("userId", "==", userId)
        );

        const [
          incidentsSnapshot,
          oldReportsSnapshot,
        ] = await Promise.all([
          getDocs(incidentsQuery),
          getDocs(oldReportsQuery),
        ]);

        // =================================================
        // NORMALIZE INCIDENTS
        // =================================================

        const incidentReports =
          incidentsSnapshot.docs.map(
            (document) => {
              const data = document.data();

              return {
                id: document.id,

                ...data,

                source: "incident",

                dangerType:
                  data.dangerType ||
                  data.incidentType ||
                  "",

                incidentType:
                  data.incidentType ||
                  data.dangerType ||
                  "Road Incident",

                reporterId:
                  data.reporterId ||
                  data.userId ||
                  "",

                userId:
                  data.userId ||
                  data.reporterId ||
                  "",

                severity:
                  data.severity ||
                  "Medium",

                description:
                  data.description ||
                  "",

                status:
                  data.status ||
                  "Unverified",

                confirmationCount:
                  Number(
                    data.confirmationCount || 0
                  ),

                rejectionCount:
                  Number(
                    data.rejectionCount || 0
                  ),

                reportCount:
                  Number(
                    data.reportCount || 1
                  ),

                evidence:
                  Array.isArray(data.evidence)
                    ? data.evidence
                    : [],
              };
            }
          );

        // =================================================
        // NORMALIZE OLD REPORTS
        // =================================================

        const oldReports =
          oldReportsSnapshot.docs.map(
            (document) => {
              const data = document.data();

              return {
                id: document.id,

                ...data,

                source: "report",

                dangerType:
                  data.dangerType ||
                  data.incidentType ||
                  "",

                incidentType:
                  data.incidentType ||
                  data.dangerType ||
                  "Road Incident",

                reporterId:
                  data.reporterId ||
                  data.userId ||
                  "",

                userId:
                  data.userId ||
                  data.reporterId ||
                  "",

                severity:
                  data.severity ||
                  "Medium",

                description:
                  data.description ||
                  "",

                status:
                  data.status ||
                  "Unverified",

                confirmationCount:
                  Number(
                    data.confirmationCount || 0
                  ),

                rejectionCount:
                  Number(
                    data.rejectionCount || 0
                  ),

                reportCount:
                  Number(
                    data.reportCount || 1
                  ),

                evidence:
                  Array.isArray(data.evidence)
                    ? data.evidence
                    : [],
              };
            }
          );

        // =================================================
        // COMBINE
        // =================================================

        const combinedReports = [
          ...incidentReports,
          ...oldReports,
        ];

        // =================================================
        // REMOVE DUPLICATES
        // =================================================

        const uniqueReports = [];

        const seen = new Set();

        combinedReports.forEach((report) => {
          const key =
            `${report.source}-${report.id}`;

          if (!seen.has(key)) {
            seen.add(key);
            uniqueReports.push(report);
          }
        });

        // =================================================
        // SORT NEWEST FIRST
        // =================================================

        uniqueReports.sort(
          (first, second) =>
            getDateValue(second.createdAt) -
            getDateValue(first.createdAt)
        );

        setReports(uniqueReports);

      } catch (error) {
        console.error(
          "My reports loading error:",
          error
        );

        console.error(
          "Error code:",
          error?.code
        );

        console.error(
          "Error message:",
          error?.message
        );

        if (
          error?.code ===
          "permission-denied"
        ) {
          notify(
            "❌ Firestore permission denied while loading your reports."
          );
        } else {
          notify(
            "❌ Unable to load your reports."
          );
        }

      } finally {
        setLoading(false);
      }
    },
    []
  );

  // =======================================================
  // AUTH LISTENER
  // =======================================================

  useEffect(() => {
    let isMounted = true;

    const unsubscribe =
      onAuthStateChanged(
        auth,
        async (user) => {
          if (!isMounted) {
            return;
          }

          setCurrentUser(user);

          if (!user) {
            setReports([]);
            setLoading(false);
            return;
          }

          await loadMyReports(user.uid);
        }
      );

    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, [loadMyReports]);

  // =======================================================
  // BEGIN EDIT
  // =======================================================

  const beginEdit = (report) => {
    if (!currentUser) {
      notify("Please log in.");
      return;
    }

    // IMPORTANT:
    // Check actual ownership before allowing edit.

    const ownerId =
      report.source === "incident"
        ? report.reporterId || report.userId
        : report.userId || report.reporterId;

    if (ownerId !== currentUser.uid) {
      notify(
        "❌ You can edit only your own report."
      );
      return;
    }

    setEditingId(report.id);

    setEditingSource(report.source);

    setEditData({
      dangerType:
        report.dangerType ||
        report.incidentType ||
        "",

      severity:
        report.severity ||
        "",

      description:
        report.description ||
        "",
    });
  };

  // =======================================================
  // CANCEL EDIT
  // =======================================================

  const cancelEdit = () => {
    setEditingId(null);

    setEditingSource(null);

    setEditData({
      dangerType: "",
      severity: "",
      description: "",
    });
  };

  // =======================================================
  // SAVE EDIT
  // =======================================================

  const saveEdit = async (report) => {
    if (!currentUser) {
      notify("Please log in.");
      return;
    }

    // =====================================================
    // OWNER CHECK
    // =====================================================

    const ownerId =
      report.source === "incident"
        ? report.reporterId || report.userId
        : report.userId || report.reporterId;

    if (ownerId !== currentUser.uid) {
      notify(
        "❌ You can edit only your own report."
      );
      return;
    }

    if (
      !editData.dangerType.trim() ||
      !editData.severity
    ) {
      notify(
        "Please select danger type and severity."
      );
      return;
    }

    try {
      const collectionName =
        report.source === "incident"
          ? "incidents"
          : "reports";

      const reportRef = doc(
        db,
        collectionName,
        report.id
      );

      // ===================================================
      // UPDATE DATA
      // ===================================================

      const updateData = {
        dangerType:
          editData.dangerType.trim(),

        severity:
          editData.severity,

        description:
          editData.description.trim(),

        updatedAt:
          serverTimestamp(),
      };

      // ===================================================
      // KEEP INCIDENT TYPE SYNCHRONIZED
      // ===================================================

      if (
        report.source === "incident"
      ) {
        updateData.incidentType =
          editData.dangerType.trim();
      }

      // ===================================================
      // UPDATE FIRESTORE
      // ===================================================

      await updateDoc(
        reportRef,
        updateData
      );

      // ===================================================
      // UPDATE LOCAL UI
      // ===================================================

      setReports(
        (previousReports) =>
          previousReports.map((item) => {
            if (
              item.id === report.id &&
              item.source === report.source
            ) {
              return {
                ...item,

                ...updateData,

                // serverTimestamp() is unresolved locally,
                // so keep the current time for immediate UI.
                updatedAt: new Date(),
              };
            }

            return item;
          })
      );

      cancelEdit();

      notify(
        "✅ Report updated successfully."
      );

    } catch (error) {
      console.error(
        "❌ Report update error:",
        error
      );

      console.error(
        "Error code:",
        error?.code
      );

      console.error(
        "Error message:",
        error?.message
      );

      if (
        error?.code ===
        "permission-denied"
      ) {
        notify(
          "❌ Firestore rejected the edit.\n\n" +
          "Make sure your Firestore rules allow the report owner to update this document."
        );
      } else if (
        error?.code ===
        "not-found"
      ) {
        notify(
          "❌ This report no longer exists."
        );

        setReports(
          (previousReports) =>
            previousReports.filter(
              (item) =>
                !(
                  item.id === report.id &&
                  item.source === report.source
                )
            )
        );

        cancelEdit();

      } else {
        notify(
          `❌ Failed to update report.\n\n${
            error?.message ||
            "Unknown error"
          }`
        );
      }
    }
  };

  // =======================================================
  // REQUEST DELETE REPORT
  // =======================================================

  const requestDeleteReport = (report) => {
    if (!currentUser) {
      notify("Please log in.");
      return;
    }

    const ownerId =
      report.source === "incident"
        ? report.reporterId || report.userId
        : report.userId || report.reporterId;

    if (ownerId !== currentUser.uid) {
      notify(
        "❌ You can delete only your own report."
      );
      return;
    }

    setDeleteTarget(report);
  };

  // =======================================================
  // CONFIRM DELETE REPORT
  // =======================================================

  const confirmDeleteReport = async () => {
    if (!deleteTarget || !currentUser) {
      return;
    }

    const report = deleteTarget;

    const ownerId =
      report.source === "incident"
        ? report.reporterId || report.userId
        : report.userId || report.reporterId;

    if (ownerId !== currentUser.uid) {
      notify(
        "❌ You can delete only your own report."
      );

      setDeleteTarget(null);
      return;
    }

    setDeleting(true);

    try {
      const collectionName =
        report.source === "incident"
          ? "incidents"
          : "reports";

      const reportRef = doc(
        db,
        collectionName,
        report.id
      );

      console.log(
        "🗑 Deleting report:",
        {
          collection: collectionName,
          id: report.id,
          owner: ownerId,
          currentUser: currentUser.uid,
        }
      );

      // ===================================================
      // DELETE FROM FIRESTORE
      // ===================================================

      await deleteDoc(reportRef);

      // ===================================================
      // REMOVE FROM UI
      // ===================================================

      setReports(
        (previousReports) =>
          previousReports.filter(
            (item) =>
              !(
                item.id === report.id &&
                item.source === report.source
              )
          )
      );

      // ===================================================
      // CLOSE EDIT FORM IF NECESSARY
      // ===================================================

      if (
        editingId === report.id &&
        editingSource === report.source
      ) {
        cancelEdit();
      }

      setDeleteTarget(null);

      notify(
        " Report deleted successfully."
      );

    } catch (error) {
      console.error(
        " Report delete error:",
        error
      );

      console.error(
        "Error code:",
        error?.code
      );

      console.error(
        "Error message:",
        error?.message
      );

      if (
        error?.code ===
        "permission-denied"
      ) {
        notify(
          "❌ Firestore rejected the deletion.\n\n" +
          "Your Firestore rules must allow the report owner to delete the document."
        );

      } else if (
        error?.code ===
        "not-found"
      ) {
        setReports(
          (previousReports) =>
            previousReports.filter(
              (item) =>
                !(
                  item.id === report.id &&
                  item.source === report.source
                )
            )
        );

        setDeleteTarget(null);

        notify(
          "The report was already deleted."
        );

      } else {
        notify(
          `❌ Failed to delete report.\n\n${
            error?.message ||
            "Unknown error"
          }`
        );
      }

    } finally {
      setDeleting(false);
    }
  };

  // =======================================================
  // SEVERITY CLASS
  // =======================================================

  const getSeverityClass = (severity) => {
    switch (
      severity?.toLowerCase()
    ) {
      case "high":
        return "my-severity-high";

      case "medium":
        return "my-severity-medium";

      case "low":
        return "my-severity-low";

      default:
        return "";
    }
  };

  // =======================================================
  // RENDER
  // =======================================================

  return (
    <DashboardLayout>

      <main className="my-reports-page">

        {/* =================================================
            HEADER
        ================================================= */}

        <header className="my-reports-header">

          <div>

            <h1>
              📄 My Reports
            </h1>

            <p>
              View, edit or delete reports
              submitted by your account.
            </p>

          </div>

          <button
            type="button"
            className="reload-my-reports"
            onClick={() =>
              currentUser &&
              loadMyReports(
                currentUser.uid
              )
            }
          >
            🔄 Refresh
          </button>

        </header>

        {/* =================================================
            COUNT
        ================================================= */}

        <div className="my-reports-count">

          Your reports:{" "}

          <strong>
            {reports.length}
          </strong>

        </div>

        {/* =================================================
            LOADING
        ================================================= */}

        {loading ? (

          <div className="my-reports-message">
            Loading your reports...
          </div>

        ) : reports.length === 0 ? (

          <div className="my-reports-message">

            <span>
              📭
            </span>

            <h2>
              No reports yet
            </h2>

            <p>
              Reports you submit will appear here.
            </p>

          </div>

        ) : (

          <div className="my-reports-grid">

            {reports.map((report) => {

              const editing =
                editingId === report.id &&
                editingSource === report.source;

              return (

                <article
                  className="my-report-card"
                  key={`${report.source}-${report.id}`}
                >

                  {/* =======================================
                      CARD TOP
                  ======================================= */}

                  <div className="my-report-card-top">

                    <div>

                      <h2>
                        📍{" "}
                        {report.area ||
                          "Unknown area"}
                      </h2>

                      <p>
                        {report.district ||
                          "District unavailable"}
                      </p>

                    </div>

                    {!editing && (

                      <span
                        className={`my-severity ${getSeverityClass(
                          report.severity
                        )}`}
                      >
                        {report.severity ||
                          "Unknown"}
                      </span>

                    )}

                  </div>

                  {/* =======================================
                      EDIT FORM
                  ======================================= */}

                  {editing ? (

                    <div className="my-report-edit-form">

                      <label>
                        Danger type

                        <select
                          value={
                            editData.dangerType
                          }
                          onChange={(event) =>
                            setEditData({
                              ...editData,
                              dangerType:
                                event.target.value,
                            })
                          }
                        >

                          <option value="">
                            Select danger
                          </option>

                          <option value="Robbery">
                            Robbery
                          </option>

                          <option value="Harassment">
                            Harassment
                          </option>

                          <option value="Road Accident">
                            Road Accident
                          </option>

                          <option value="Poor Lighting">
                            Poor Lighting
                          </option>

                          <option value="Flood">
                            Flood
                          </option>

                          <option value="Heavy Rain">
                            Heavy Rain
                          </option>

                          <option value="Road Block">
                            Road Block
                          </option>

                          <option value="Other">
                            Other
                          </option>

                        </select>
                      </label>

                      <label>
                        Severity

                        <select
                          value={
                            editData.severity
                          }
                          onChange={(event) =>
                            setEditData({
                              ...editData,
                              severity:
                                event.target.value,
                            })
                          }
                        >

                          <option value="">
                            Select severity
                          </option>

                          <option value="Low">
                            Low
                          </option>

                          <option value="Medium">
                            Medium
                          </option>

                          <option value="High">
                            High
                          </option>

                        </select>
                      </label>

                      <label>
                        Description

                        <textarea
                          value={
                            editData.description
                          }
                          onChange={(event) =>
                            setEditData({
                              ...editData,
                              description:
                                event.target.value,
                            })
                          }
                        />
                      </label>

                      <div className="my-report-edit-actions">

                        <button
                          type="button"
                          className="save-report-button"
                          onClick={() =>
                            saveEdit(report)
                          }
                        >
                          Save changes
                        </button>

                        <button
                          type="button"
                          className="cancel-report-button"
                          onClick={cancelEdit}
                        >
                          Cancel
                        </button>

                      </div>

                    </div>

                  ) : (

                    <>

                      {/* =================================
                          DANGER
                      ================================= */}

                      <div className="my-report-danger">

                        <small>
                          Danger type
                        </small>

                        <strong>
                          {report.dangerType ||
                            report.incidentType ||
                            "Not specified"}
                        </strong>

                      </div>

                      {/* =================================
                          DESCRIPTION
                      ================================= */}

                      <p className="my-report-description">

                        {report.description ||
                          "No description provided."}

                      </p>

                      {/* =================================
                          STATUS
                      ================================= */}

                      <div className="my-report-meta">

                        <span>
                          📌 Status:{" "}
                          <strong>
                            {report.status ||
                              "Unverified"}
                          </strong>
                        </span>

                      </div>

                      {/* =================================
                          VERIFICATION
                      ================================= */}

                      <div className="my-report-meta">

                        <span>
                          ✅ Confirmed:{" "}
                          {report.confirmationCount ||
                            0}
                        </span>

                        <span>
                          ❌ Rejected:{" "}
                          {report.rejectionCount ||
                            0}
                        </span>

                        <span>
                          📊 Reports:{" "}
                          {report.reportCount ||
                            1}
                        </span>

                      </div>

                      {/* =================================
                          DATES
                      ================================= */}

                      <div className="my-report-meta">

                        <span>
                          🕒{" "}
                          {formatDate(
                            report.createdAt
                          )}
                        </span>

                        {report.updatedAt && (

                          <span>
                            ✏️ Edited{" "}
                            {formatDate(
                              report.updatedAt
                            )}
                          </span>

                        )}

                      </div>

                      {/* =================================
                          EVIDENCE
                      ================================= */}

                      {Array.isArray(
                        report.evidence
                      ) &&
                        report.evidence.length > 0 && (

                          <div className="my-report-meta">

                            <span>
                              📎 Evidence:{" "}
                              {
                                report.evidence.length
                              }{" "}
                              file(s)
                            </span>

                          </div>

                        )}

                      {/* =================================
                          SOURCE
                      ================================= */}

                      <div className="my-report-meta">

                        <span>
                          🗂️ Source:{" "}
                          {report.source ===
                          "incident"
                            ? "Incident"
                            : "Report"}
                        </span>

                      </div>

                      {/* =================================
                          ACTIONS
                      ================================= */}

                      <div className="my-report-actions">

                        <button
                          type="button"
                          className="edit-report-button"
                          onClick={() =>
                            beginEdit(report)
                          }
                        >
                          ✏️ Edit
                        </button>

                        <button
                          type="button"
                          className="delete-report-button"
                          onClick={() =>
                            requestDeleteReport(report)
                          }
                        >
                          🗑 Delete
                        </button>

                      </div>

                    </>

                  )}

                </article>

              );
            })}

          </div>

        )}

      </main>

      {/* =====================================================
          DELETE CONFIRMATION MODAL
      ===================================================== */}

      {deleteTarget && (

        <div
          className="delete-confirm-overlay"
          onClick={() => {
            if (!deleting) {
              setDeleteTarget(null);
            }
          }}
        >

          <div
            className="delete-confirm-modal"
            onClick={(event) =>
              event.stopPropagation()
            }
          >

            <div className="delete-confirm-icon">
              🗑️
            </div>

            <h2>
              Delete Report?
            </h2>

            <p>
              Are you sure you want to delete this report?
            </p>

            <small>
              This action will permanently remove the report
              from SafeRoute BD.
            </small>

            <div className="delete-confirm-actions">

              <button
                type="button"
                className="delete-cancel-button"
                disabled={deleting}
                onClick={() =>
                  setDeleteTarget(null)
                }
              >
                Cancel
              </button>

              <button
                type="button"
                className="delete-confirm-button"
                disabled={deleting}
                onClick={confirmDeleteReport}
              >
                {deleting
                  ? "Deleting..."
                  : "Yes, Delete"}
              </button>

            </div>

          </div>

        </div>

      )}

    </DashboardLayout>
  );
}

export default MyReports;
