import { useEffect, useState } from "react";

import {
  FaAmbulance,
  FaHospital,
  FaShieldAlt,
  FaTruck,
  FaCarCrash,
  FaTools,
  FaMapMarkerAlt,
  FaTimes,
  FaCheckCircle,
  FaSpinner,
  FaArrowLeft,
  FaBan,
} from "react-icons/fa";


import {
  createAssistanceRequest,
  cancelAssistanceRequest,
} from "../services/assistanceService";

import OrganizationCard from "./OrganizationCard";
import { auth } from "../firebase/firebase";
import { notify } from "../utils/notify";

import "./NeedHelpModal.css";

// ======================================================
// SERVICE OPTIONS
// ======================================================

const SERVICE_OPTIONS = [
  {
    type: "ambulance",
    label: "Ambulance",
    description: "Medical emergency assistance",
    icon: FaAmbulance,
  },
  {
    type: "hospital",
    label: "Hospital",
    description: "Find a verified hospital",
    icon: FaHospital,
  },
  {
    type: "police",
    label: "Police",
    description: "Police and security assistance",
    icon: FaShieldAlt,
  },
  {
    type: "towing",
    label: "Towing",
    description: "Vehicle towing assistance",
    icon: FaTruck,
  },
  {
    type: "vehicle_recovery",
    label: "Vehicle Recovery",
    description: "Recover a damaged vehicle",
    icon: FaCarCrash,
  },
  {
    type: "repair_service",
    label: "Repair Service",
    description: "Vehicle repair assistance",
    icon: FaTools,
  },
];

// ======================================================
// STATUS CONFIG
// ======================================================

const STATUS_CONFIG = {
  requested: {
    label: "Request Sent",
    description: "Your assistance request has been submitted.",
    className: "status-requested",
  },
  searching: {
    label: "Searching",
    description: "Waiting for the provider to respond.",
    className: "status-searching",
  },
  accepted: {
    label: "Accepted",
    description: "The provider has accepted your request.",
    className: "status-accepted",
  },
  en_route: {
    label: "Provider En Route",
    description: "The provider is travelling to your location.",
    className: "status-en-route",
  },
  arrived: {
    label: "Provider Arrived",
    description: "The provider has arrived at your location.",
    className: "status-arrived",
  },
  completed: {
    label: "Completed",
    description: "Your assistance request has been completed.",
    className: "status-completed",
  },
  cancelled: {
    label: "Cancelled",
    description: "This assistance request has been cancelled.",
    className: "status-cancelled",
  },
  failed: {
    label: "Failed",
    description: "The assistance request could not be completed.",
    className: "status-failed",
  },
};

// ======================================================
// COMPONENT
// ======================================================

function NeedHelpModal({
  isOpen,
  onClose,
  accidentId = null,
  incidentId = null,
  location = null,
}) {
  // ----------------------------------------------------
  // UI state
  // ----------------------------------------------------

  const [selectedService, setSelectedService] = useState(null);
  const [organizations, setOrganizations] = useState([]);
  const [loadingOrganizations, setLoadingOrganizations] = useState(false);
  const [organizationError, setOrganizationError] = useState("");

  // ----------------------------------------------------
  // Request state
  // ----------------------------------------------------

  const [creatingRequest, setCreatingRequest] = useState(false);
  const [requestError, setRequestError] = useState("");
  const [assistanceRequest, setAssistanceRequest] = useState(null);
  const [cancellingRequest, setCancellingRequest] = useState(false);

  // ====================================================
  // RESET WHEN MODAL CLOSES
  // ====================================================

  useEffect(() => {
    if (!isOpen) {
      setSelectedService(null);
      setOrganizations([]);
      setLoadingOrganizations(false);
      setOrganizationError("");
      setCreatingRequest(false);
      setRequestError("");
      setAssistanceRequest(null);
      setCancellingRequest(false);
    }
  }, [isOpen]);

  // ====================================================
  // LOCATION CHECK
  // ====================================================

  const hasValidLocation = 
    location &&
    (Number.isFinite(Number(location.lat)) || Number.isFinite(Number(location.latitude))) &&
    (Number.isFinite(Number(location.lng)) || Number.isFinite(Number(location.longitude)));

  // Log for debugging
  useEffect(() => {
    if (isOpen) {
      console.log("📍 NeedHelpModal - Location:", location);
      console.log("📍 Has valid location:", hasValidLocation);
      console.log("📋 Accident ID:", accidentId);
      console.log("📋 Incident ID:", incidentId);
      console.log("👤 Current User:", auth.currentUser?.uid);
    }
  }, [isOpen, location, hasValidLocation, accidentId, incidentId]);

  // ====================================================
  // LOAD VERIFIED ORGANIZATIONS
  // ====================================================

  const handleServiceSelect = async (serviceType) => {
    setSelectedService(serviceType);
    setOrganizations([]);
    setOrganizationError("");
    setLoadingOrganizations(true);

    try {
      const providers = await getVerifiedOrganizationsByType(serviceType);
      setOrganizations(providers || []);
      console.log(`✅ Found ${providers?.length || 0} providers for ${serviceType}`);
    } catch (error) {
      console.error("Failed to load verified providers:", error);
      setOrganizationError(
        error.message || "Failed to load assistance providers."
      );
    } finally {
      setLoadingOrganizations(false);
    }
  };

  // ====================================================
  // REQUEST ASSISTANCE - FIXED TO MATCH YOUR SERVICE
  // ====================================================

  const handleRequestAssistance = async (organization) => {
    console.log("🔘 REQUEST BUTTON CLICKED", organization);
    console.log("📍 Current location:", location);
    console.log("🛠️ Selected service:", selectedService);
    console.log("📍 Has valid location:", hasValidLocation);

    // Check if user is logged in
    const currentUser = auth.currentUser;
    if (!currentUser) {
      console.error("❌ User not logged in");
      setRequestError("Please log in to request assistance.");
      notify("❌ Please log in first.");
      return;
    }

    if (!organization?.id) {
      console.error("❌ Invalid organization:", organization);
      setRequestError("Invalid assistance provider.");
      notify("❌ Invalid provider selected.");
      return;
    }

    if (!hasValidLocation) {
      console.error("❌ No valid location:", location);
      setRequestError("Please detect your current location before requesting assistance.");
      notify("📍 Please detect your current location first.");
      return;
    }

    setCreatingRequest(true);
    setRequestError("");

    try {
      // Prepare location data in the format your service expects
      const locationData = {
        lat: Number(location.lat || location.latitude),
        lng: Number(location.lng || location.longitude),
        latitude: Number(location.lat || location.latitude),
        longitude: Number(location.lng || location.longitude),
        area: location.area || "",
        district: location.district || "",
        displayName: location.displayName || location.name || "Current Location",
        name: location.name || location.displayName || "Current Location",
      };

      // Call your service with the exact parameters it expects
      console.log("📤 Calling createAssistanceRequest with:", {
        accidentId,
        incidentId,
        serviceType: selectedService,
        organization: {
          id: organization.id,
          name: organization.name,
          type: organization.type,
        },
        location: locationData,
      });

      const request = await createAssistanceRequest({
        accidentId: accidentId || null,
        incidentId: incidentId || null,
        serviceType: selectedService,
        organization: {
          id: organization.id,
          name: organization.name || "Organization",
          type: organization.type || selectedService,
        },
        location: locationData,
      });

      console.log("✅ ASSISTANCE REQUEST CREATED:", request);

      if (request && request.id) {
        setAssistanceRequest(request);
        notify(`✅ Assistance request sent successfully! Request ID: ${request.id}`);
      } else {
        throw new Error("Request creation failed - no ID returned");
      }
    } catch (error) {
      console.error("❌ ASSISTANCE REQUEST ERROR:", error);
      console.error("Error details:", error.message, error.stack);
      
      // Show user-friendly error message
      let errorMessage = "Failed to create assistance request.";
      if (error.message.includes("verified organizations")) {
        errorMessage = "This organization is not verified.";
      } else if (error.message.includes("inactive")) {
        errorMessage = "This organization is currently inactive.";
      } else if (error.message.includes("logged in")) {
        errorMessage = "Please log in to request assistance.";
      } else {
        errorMessage = error.message || "Failed to create assistance request.";
      }
      
      setRequestError(errorMessage);
      notify(`❌ ${errorMessage}`);
    } finally {
      setCreatingRequest(false);
    }
  };

  // ====================================================
  // CANCEL REQUEST
  // ====================================================

  const handleCancelRequest = async () => {
    if (!assistanceRequest?.id) {
      notify("❌ No request to cancel.");
      return;
    }

    const confirmed = window.confirm(
      "Are you sure you want to cancel this assistance request?"
    );

    if (!confirmed) {
      return;
    }

    setCancellingRequest(true);
    setRequestError("");

    try {
      const cancelledRequest = await cancelAssistanceRequest(assistanceRequest.id);
      setAssistanceRequest((previous) => ({
        ...previous,
        ...cancelledRequest,
        status: "cancelled",
      }));
      notify("✅ Assistance request cancelled.");
    } catch (error) {
      console.error("Cancel assistance request error:", error);
      setRequestError(error.message || "Failed to cancel assistance request.");
      notify("❌ Failed to cancel request.");
    } finally {
      setCancellingRequest(false);
    }
  };

  // ====================================================
  // BACK TO SERVICES
  // ====================================================

  const handleBackToServices = () => {
    setSelectedService(null);
    setOrganizations([]);
    setOrganizationError("");
    setRequestError("");
  };

  // ====================================================
  // CLOSE
  // ====================================================

  const handleClose = () => {
    if (creatingRequest || cancellingRequest) {
      notify("⏳ Please wait for the current operation to complete.");
      return;
    }
    onClose();
  };

  // ====================================================
  // DON'T RENDER
  // ====================================================

  if (!isOpen) {
    return null;
  }

  // ====================================================
  // REQUEST TRACKING VIEW
  // ====================================================

  if (assistanceRequest) {
    const status = assistanceRequest.status || "requested";
    const statusConfig = STATUS_CONFIG[status] || STATUS_CONFIG.requested;

    return (
      <div
        className="need-help-modal-overlay"
        onMouseDown={(event) => {
          if (event.target === event.currentTarget) {
            handleClose();
          }
        }}
      >
        <div className="need-help-modal">
          <div className="need-help-modal-header">
            <div>
              <span className="need-help-header-icon">🆘</span>
              <div>
                <h2>Assistance Requested</h2>
                <p>Your request has been submitted.</p>
              </div>
            </div>

            <button
              type="button"
              className="need-help-close-btn"
              onClick={handleClose}
              disabled={creatingRequest || cancellingRequest}
              aria-label="Close"
            >
              <FaTimes />
            </button>
          </div>

          <div className="assistance-request-content">
            {/* STATUS */}
            <div className={`assistance-status-card ${statusConfig.className}`}>
              <div className="assistance-status-icon">
                {status === "completed" ? <FaCheckCircle /> : <FaSpinner className="spin" />}
              </div>
              <div>
                <strong>{statusConfig.label}</strong>
                <p>{statusConfig.description}</p>
                {assistanceRequest.id && (
                  <small className="request-id-display">Request ID: {assistanceRequest.id}</small>
                )}
              </div>
            </div>

            {/* PROVIDER */}
            <div className="assistance-detail-card">
              <span>Service Provider</span>
              <strong>{assistanceRequest.organizationName || "Selected Provider"}</strong>
              <small>{assistanceRequest.organizationType || assistanceRequest.serviceType}</small>
            </div>

            {/* SERVICE */}
            <div className="assistance-detail-card">
              <span>Requested Service</span>
              <strong>
                {SERVICE_OPTIONS.find(
                  (item) => item.type === assistanceRequest.serviceType
                )?.label || assistanceRequest.serviceType}
              </strong>
            </div>

            {/* LOCATION */}
            <div className="assistance-detail-card">
              <span><FaMapMarkerAlt /> Location</span>
              <strong>
                {assistanceRequest.location?.displayName ||
                 assistanceRequest.location?.area ||
                 "Current Location"}
              </strong>
              {assistanceRequest.location?.district && (
                <small>{assistanceRequest.location.district}</small>
              )}
            </div>

            {/* ERROR */}
            {requestError && (
              <div className="need-help-error">{requestError}</div>
            )}

            {/* ACTIONS */}
            <div className="assistance-request-actions">
              {!["completed", "cancelled", "failed"].includes(status) && (
                <button
                  type="button"
                  className="cancel-assistance-btn"
                  onClick={handleCancelRequest}
                  disabled={cancellingRequest}
                >
                  {cancellingRequest ? (
                    <>
                      <FaSpinner className="spin" />
                      Cancelling...
                    </>
                  ) : (
                    <>
                      <FaBan />
                      Cancel Request
                    </>
                  )}
                </button>
              )}
              <button
                type="button"
                className="close-assistance-btn"
                onClick={handleClose}
              >
                Close
              </button>
            </div>

            <div className="assistance-trust-note">
              <FaCheckCircle />
              <span>Assistance is requested only from verified SafeRoute organizations.</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ====================================================
  // MAIN NEED HELP VIEW
  // ====================================================

  return (
    <div
      className="need-help-modal-overlay"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          handleClose();
        }
      }}
    >
      <div className="need-help-modal">
        {/* HEADER */}
        <div className="need-help-modal-header">
          <div>
            <span className="need-help-header-icon">🆘</span>
            <div>
              <h2>Need Help?</h2>
              <p>Choose the emergency assistance you need.</p>
            </div>
          </div>

          <button
            type="button"
            className="need-help-close-btn"
            onClick={handleClose}
            aria-label="Close"
          >
            <FaTimes />
          </button>
        </div>

        {/* LOCATION STATUS */}
        <div className={`need-help-location-status ${hasValidLocation ? "location-available" : "location-missing"}`}>
          <FaMapMarkerAlt />
          <div>
            <strong>
              {hasValidLocation
                ? "✅ Current location available"
                : "❌ Location required"}
            </strong>
            <p>
              {hasValidLocation
                ? location?.displayName || location?.area || "Your current location will be sent with the request."
                : "Please use 'My Location' on the Emergency page before requesting assistance."}
            </p>
          </div>
        </div>

        {/* USER AUTH STATUS */}
        <div className={`need-help-auth-status ${auth.currentUser ? "auth-available" : "auth-missing"}`}>
          {auth.currentUser ? (
            <>✅ Logged in as: <strong>{auth.currentUser.email}</strong></>
          ) : (
            <>❌ Please log in to request assistance</>
          )}
        </div>

        {/* SERVICE SELECTION */}
        {!selectedService && (
          <div className="need-help-services">
            <div className="need-help-section-title">
              <h3>What do you need?</h3>
              <p>Select an emergency service.</p>
            </div>

            <div className="need-help-service-grid">
              {SERVICE_OPTIONS.map((service) => {
                const Icon = service.icon;
                return (
                  <button
                    type="button"
                    key={service.type}
                    className="need-help-service-option"
                    onClick={() => handleServiceSelect(service.type)}
                  >
                    <span className="need-help-service-icon">
                      <Icon />
                    </span>
                    <strong>{service.label}</strong>
                    <small>{service.description}</small>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* PROVIDER VIEW */}
        {selectedService && (
          <div className="need-help-provider-section">
            <button
              type="button"
              className="need-help-back-btn"
              onClick={handleBackToServices}
              disabled={loadingOrganizations || creatingRequest}
            >
              <FaArrowLeft />
              Back to services
            </button>

            <div className="need-help-section-title">
              <h3>
                Verified{" "}
                {SERVICE_OPTIONS.find((item) => item.type === selectedService)?.label}{" "}
                Providers
              </h3>
              <p>Select a verified provider to request assistance.</p>
            </div>

            {/* LOCATION REQUIRED */}
            {!hasValidLocation && (
              <div className="need-help-warning">
                <FaMapMarkerAlt />
                <div>
                  <strong>📍 Location is required</strong>
                  <p>Return to the Emergency page and detect your current location before requesting assistance.</p>
                </div>
              </div>
            )}

            {/* AUTH REQUIRED */}
            {!auth.currentUser && (
              <div className="need-help-warning">
                <FaTimes />
                <div>
                  <strong>🔐 Login required</strong>
                  <p>Please log in to request assistance.</p>
                </div>
              </div>
            )}

            {/* LOADING */}
            {loadingOrganizations && (
              <div className="need-help-loading">
                <FaSpinner className="spin" />
                <span>Finding verified providers...</span>
              </div>
            )}

            {/* ERROR */}
            {!loadingOrganizations && organizationError && (
              <div className="need-help-error">{organizationError}</div>
            )}

            {/* EMPTY */}
            {!loadingOrganizations && !organizationError && organizations.length === 0 && (
              <div className="need-help-empty">
                <div>
                  <h3>No verified providers found</h3>
                  <p>There are currently no verified providers available for this service.</p>
                </div>
              </div>
            )}

            {/* PROVIDERS */}
            {!loadingOrganizations && !organizationError && organizations.length > 0 && (
              <div className="need-help-provider-list">
                {organizations.map((organization) => (
                  <div key={organization.id} className="need-help-provider-wrapper">
                    <OrganizationCard
                      organization={organization}
                      showNeedHelpButton={false}
                    />
                    
                    <button
                      type="button"
                      className={`request-assistance-btn ${
                        !hasValidLocation || !auth.currentUser ? "disabled" : ""
                      }`}
                      onClick={() => handleRequestAssistance(organization)}
                      disabled={creatingRequest || !hasValidLocation || !auth.currentUser}
                    >
                      {creatingRequest ? (
                        <>
                          <FaSpinner className="spin" />
                          Sending Request...
                        </>
                      ) : (
                        <>🆘 Request Assistance</>
                      )}
                    </button>
                    
                    {!hasValidLocation && (
                      <div className="request-location-warning">
                        <FaMapMarkerAlt />
                        <span>Location required to request assistance</span>
                      </div>
                    )}
                    
                    {!auth.currentUser && (
                      <div className="request-auth-warning">
                        <FaTimes />
                        <span>Login required to request assistance</span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* REQUEST ERROR */}
            {requestError && (
              <div className="need-help-error">{requestError}</div>
            )}

            {/* TRUST NOTE */}
            <div className="need-help-trust-note">
              <FaCheckCircle />
              <span>Providers shown here are verified by SafeRoute administrators.</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default NeedHelpModal;