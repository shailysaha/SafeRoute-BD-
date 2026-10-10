import { useEffect, useState } from "react";
import {
  FaBuilding,
  FaCheckCircle,
  FaTimesCircle,
  FaBan,
  FaEye,
  FaSyncAlt,
  FaHospital,
  FaAmbulance,
  FaShieldAlt,
  FaTruck,
  FaCarCrash,
  FaTools,
  FaExclamationTriangle,
} from "react-icons/fa";



import "./AdminOrganizations.css";

const typeConfig = {
  hospital: {
    label: "Hospital",
    icon: <FaHospital />,
  },
  ambulance: {
    label: "Ambulance",
    icon: <FaAmbulance />,
  },
  police: {
    label: "Police",
    icon: <FaShieldAlt />,
  },
  authorized_agency: {
    label: "Authorized Agency",
    icon: <FaShieldAlt />,
  },
  transport_company: {
    label: "Transport Company",
    icon: <FaTruck />,
  },
  towing: {
    label: "Towing",
    icon: <FaTruck />,
  },
  vehicle_recovery: {
    label: "Vehicle Recovery",
    icon: <FaCarCrash />,
  },
  repair_service: {
    label: "Repair Service",
    icon: <FaTools />,
  },
};

const AdminOrganizations = () => {
  const [applications, setApplications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState(null);
  const [selectedApplication, setSelectedApplication] = useState(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const loadApplications = async () => {
    try {
      setLoading(true);
      setError("");

      const data = await getVerificationApplications();

      setApplications(data || []);
    } catch (err) {
      console.error("Failed to load verification applications:", err);

      setError(
        err?.message ||
          "Failed to load organization verification applications."
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadApplications();
  }, []);

  const handleApprove = async (application) => {
    if (!application?.organizationId) {
      setError("Organization ID is missing.");
      return;
    }

    const confirmed = window.confirm(
      `Approve "${application.organizationName}" as a verified organization?`
    );

    if (!confirmed) return;

    try {
      setProcessingId(application.id);
      setError("");
      setSuccess("");

      await approveOrganization(application.organizationId);

      setSuccess(
        `${application.organizationName} has been verified successfully.`
      );

      setSelectedApplication(null);

      await loadApplications();
    } catch (err) {
      console.error("Approval failed:", err);

      setError(
        err?.message ||
          "Unable to approve this organization."
      );
    } finally {
      setProcessingId(null);
    }
  };

  const handleReject = async (application) => {
    if (!application?.organizationId) {
      setError("Organization ID is missing.");
      return;
    }

    const confirmed = window.confirm(
      `Reject verification for "${application.organizationName}"?`
    );

    if (!confirmed) return;

    try {
      setProcessingId(application.id);
      setError("");
      setSuccess("");

      await rejectOrganization(application.organizationId);

      setSuccess(
        `${application.organizationName} verification was rejected.`
      );

      setSelectedApplication(null);

      await loadApplications();
    } catch (err) {
      console.error("Rejection failed:", err);

      setError(
        err?.message ||
          "Unable to reject this organization."
      );
    } finally {
      setProcessingId(null);
    }
  };

  const handleSuspend = async (application) => {
    if (!application?.organizationId) {
      setError("Organization ID is missing.");
      return;
    }

    const confirmed = window.confirm(
      `Suspend "${application.organizationName}"?`
    );

    if (!confirmed) return;

    try {
      setProcessingId(application.id);
      setError("");
      setSuccess("");

      await suspendOrganization(application.organizationId);

      setSuccess(
        `${application.organizationName} has been suspended.`
      );

      setSelectedApplication(null);

      await loadApplications();
    } catch (err) {
      console.error("Suspension failed:", err);

      setError(
        err?.message ||
          "Unable to suspend this organization."
      );
    } finally {
      setProcessingId(null);
    }
  };

  const getTypeConfig = (type) => {
    return (
      typeConfig[type] || {
        label: type || "Organization",
        icon: <FaBuilding />,
      }
    );
  };

  const formatDate = (timestamp) => {
    if (!timestamp) return "N/A";

    try {
      if (timestamp?.toDate) {
        return timestamp.toDate().toLocaleString();
      }

      if (timestamp instanceof Date) {
        return timestamp.toLocaleString();
      }

      return new Date(timestamp).toLocaleString();
    } catch {
      return "N/A";
    }
  };

  return (
    <div className="admin-organizations-page">

      {/* HEADER */}
      <div className="admin-organizations-header">

        <div>
          <div className="admin-organizations-title">
            <div className="admin-organizations-title-icon">
              <FaBuilding />
            </div>

            <div>
              <h1>Organization Verification</h1>
              <p>
                Review and manage organizations requesting verified status.
              </p>
            </div>
          </div>
        </div>

        <button
          type="button"
          className="admin-refresh-btn"
          onClick={loadApplications}
          disabled={loading}
        >
          <FaSyncAlt className={loading ? "spinning" : ""} />
          Refresh
        </button>

      </div>

      {/* ALERTS */}

      {error && (
        <div className="admin-alert admin-alert-error">
          <FaExclamationTriangle />
          <span>{error}</span>
        </div>
      )}

      {success && (
        <div className="admin-alert admin-alert-success">
          <FaCheckCircle />
          <span>{success}</span>
        </div>
      )}

      {/* STATS */}

      <div className="admin-organization-stats">

        <div className="admin-stat-card">
          <div className="admin-stat-icon pending">
            <FaExclamationTriangle />
          </div>

          <div>
            <span>Pending Applications</span>
            <strong>
              {
                applications.filter(
                  (item) =>
                    item.status === "pending"
                ).length
              }
            </strong>
          </div>
        </div>

        <div className="admin-stat-card">
          <div className="admin-stat-icon verified">
            <FaCheckCircle />
          </div>

          <div>
            <span>Verified Applications</span>
            <strong>
              {
                applications.filter(
                  (item) =>
                    item.status === "verified"
                ).length
              }
            </strong>
          </div>
        </div>

        <div className="admin-stat-card">
          <div className="admin-stat-icon rejected">
            <FaTimesCircle />
          </div>

          <div>
            <span>Rejected</span>
            <strong>
              {
                applications.filter(
                  (item) =>
                    item.status === "rejected"
                ).length
              }
            </strong>
          </div>
        </div>

        <div className="admin-stat-card">
          <div className="admin-stat-icon total">
            <FaBuilding />
          </div>

          <div>
            <span>Total Applications</span>
            <strong>{applications.length}</strong>
          </div>
        </div>

      </div>

      {/* APPLICATIONS */}

      <div className="admin-organizations-card">

        <div className="admin-organizations-card-header">
          <div>
            <h2>Verification Applications</h2>
            <p>
              Organizations submitted for verification.
            </p>
          </div>
        </div>

        {loading ? (
          <div className="admin-organizations-loading">
            <FaSyncAlt className="spinning" />
            Loading applications...
          </div>
        ) : applications.length === 0 ? (
          <div className="admin-organizations-empty">
            <FaBuilding />

            <h3>No Verification Applications</h3>

            <p>
              There are currently no organization verification
              applications to review.
            </p>
          </div>
        ) : (
          <div className="admin-organizations-list">

            {applications.map((application) => {
              const type = getTypeConfig(
                application.organizationType
              );

              const status =
                application.status || "pending";

              return (
                <div
                  className="admin-organization-item"
                  key={application.id}
                >

                  {/* ORGANIZATION INFO */}

                  <div className="admin-organization-main">

                    <div className="admin-organization-icon">
                      {type.icon}
                    </div>

                    <div className="admin-organization-info">

                      <div className="admin-organization-name-row">

                        <h3>
                          {application.organizationName ||
                            "Unnamed Organization"}
                        </h3>

                        <span
                          className={`admin-status-badge ${status}`}
                        >
                          {status}
                        </span>

                      </div>

                      <div className="admin-organization-meta">

                        <span>
                          {type.label}
                        </span>

                        {application.email && (
                          <span>
                            {application.email}
                          </span>
                        )}

                        {application.phone && (
                          <span>
                            {application.phone}
                          </span>
                        )}

                      </div>

                      <p className="admin-organization-date">
                        Submitted:{" "}
                        {formatDate(
                          application.createdAt
                        )}
                      </p>

                    </div>

                  </div>

                  {/* ACTIONS */}

                  <div className="admin-organization-actions">

                    <button
                      type="button"
                      className="admin-action-btn view"
                      onClick={() =>
                        setSelectedApplication(application)
                      }
                    >
                      <FaEye />
                      View
                    </button>

                    {status === "pending" && (
                      <>
                        <button
                          type="button"
                          className="admin-action-btn approve"
                          onClick={() =>
                            handleApprove(application)
                          }
                          disabled={
                            processingId === application.id
                          }
                        >
                          <FaCheckCircle />
                          Approve
                        </button>

                        <button
                          type="button"
                          className="admin-action-btn reject"
                          onClick={() =>
                            handleReject(application)
                          }
                          disabled={
                            processingId === application.id
                          }
                        >
                          <FaTimesCircle />
                          Reject
                        </button>
                      </>
                    )}

                    {status === "verified" && (
                      <button
                        type="button"
                        className="admin-action-btn suspend"
                        onClick={() =>
                          handleSuspend(application)
                        }
                        disabled={
                          processingId === application.id
                        }
                      >
                        <FaBan />
                        Suspend
                      </button>
                    )}

                  </div>

                </div>
              );
            })}

          </div>
        )}

      </div>

      {/* DETAILS MODAL */}

      {selectedApplication && (
        <div
          className="admin-organization-modal-overlay"
          onClick={() => setSelectedApplication(null)}
        >

          <div
            className="admin-organization-modal"
            onClick={(event) =>
              event.stopPropagation()
            }
          >

            <div className="admin-modal-header">

              <div>
                <h2>
                  Organization Details
                </h2>

                <p>
                  Review submitted organization information.
                </p>
              </div>

              <button
                type="button"
                className="admin-modal-close"
                onClick={() =>
                  setSelectedApplication(null)
                }
              >
                ×
              </button>

            </div>

            <div className="admin-modal-body">

              <div className="admin-detail-section">

                <h3>Organization</h3>

                <div className="admin-detail-grid">

                  <div>
                    <span>Name</span>
                    <strong>
                      {selectedApplication.organizationName ||
                        "N/A"}
                    </strong>
                  </div>

                  <div>
                    <span>Type</span>
                    <strong>
                      {
                        getTypeConfig(
                          selectedApplication.organizationType
                        ).label
                      }
                    </strong>
                  </div>

                  <div>
                    <span>Email</span>
                    <strong>
                      {selectedApplication.email ||
                        "N/A"}
                    </strong>
                  </div>

                  <div>
                    <span>Phone</span>
                    <strong>
                      {selectedApplication.phone ||
                        "N/A"}
                    </strong>
                  </div>

                  <div>
                    <span>Emergency Phone</span>
                    <strong>
                      {selectedApplication.emergencyPhone ||
                        "N/A"}
                    </strong>
                  </div>

                  <div>
                    <span>District</span>
                    <strong>
                      {selectedApplication.district ||
                        "N/A"}
                    </strong>
                  </div>

                  <div className="full">
                    <span>Address</span>
                    <strong>
                      {selectedApplication.address ||
                        "N/A"}
                    </strong>
                  </div>

                  <div className="full">
                    <span>Description</span>
                    <strong>
                      {selectedApplication.description ||
                        "N/A"}
                    </strong>
                  </div>

                </div>

              </div>

              <div className="admin-detail-section">

                <h3>Verification</h3>

                <div className="admin-verification-detail">

                  <span
                    className={`admin-status-badge ${
                      selectedApplication.status ||
                      "pending"
                    }`}
                  >
                    {selectedApplication.status ||
                      "pending"}
                  </span>

                  <p>
                    Submitted on{" "}
                    {formatDate(
                      selectedApplication.createdAt
                    )}
                  </p>

                </div>

              </div>

            </div>

            <div className="admin-modal-footer">

              {selectedApplication.status === "pending" && (
                <>
                  <button
                    type="button"
                    className="admin-action-btn reject"
                    onClick={() =>
                      handleReject(
                        selectedApplication
                      )
                    }
                    disabled={
                      processingId ===
                      selectedApplication.id
                    }
                  >
                    <FaTimesCircle />
                    Reject
                  </button>

                  <button
                    type="button"
                    className="admin-action-btn approve"
                    onClick={() =>
                      handleApprove(
                        selectedApplication
                      )
                    }
                    disabled={
                      processingId ===
                      selectedApplication.id
                    }
                  >
                    <FaCheckCircle />
                    Approve Organization
                  </button>
                </>
              )}

              {selectedApplication.status === "verified" && (
                <button
                  type="button"
                  className="admin-action-btn suspend"
                  onClick={() =>
                    handleSuspend(
                      selectedApplication
                    )
                  }
                  disabled={
                    processingId ===
                    selectedApplication.id
                  }
                >
                  <FaBan />
                  Suspend Organization
                </button>
              )}

            </div>

          </div>

        </div>
      )}

    </div>
  );
};

export default AdminOrganizations;