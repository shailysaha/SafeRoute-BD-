import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import "./OrganizationProfile.css"; // <-- Add this line
import {
  FaBuilding,
  FaHospital,
  FaAmbulance,
  FaShieldAlt,
  FaTruck,
  FaCar,
  FaTools,
  FaMapMarkerAlt,
  FaPhone,
  FaEnvelope,
  FaClock,
  FaSave,
  FaArrowLeft,
  FaCheckCircle,
} from "react-icons/fa";

import { auth } from "../firebase/firebase";

// ======================================================
// ORGANIZATION TYPE CONFIG
// ======================================================

const ORGANIZATION_TYPE_CONFIG = {
  hospital: {
    label: "Hospital",
    icon: FaHospital,
    description:
      "Hospital or emergency medical facility",
  },

  ambulance: {
    label: "Ambulance Provider",
    icon: FaAmbulance,
    description:
      "Emergency ambulance and patient transport",
  },

  police: {
    label: "Police",
    icon: FaShieldAlt,
    description:
      "Police or authorized law enforcement organization",
  },

  authorized_agency: {
    label: "Authorized Agency",
    icon: FaShieldAlt,
    description:
      "Government or officially authorized safety agency",
  },

  transport_company: {
    label: "Transport Company",
    icon: FaTruck,
    description:
      "Transport or fleet organization",
  },

  towing: {
    label: "Towing Service",
    icon: FaTruck,
    description:
      "Vehicle towing and roadside assistance",
  },

  vehicle_recovery: {
    label: "Vehicle Recovery",
    icon: FaCar,
    description:
      "Vehicle recovery and accident recovery service",
  },

  repair_service: {
    label: "Repair Service",
    icon: FaTools,
    description:
      "Vehicle repair and roadside repair service",
  },
};

// ======================================================
// DEFAULT FORM
// ======================================================

const DEFAULT_FORM = {
  name: "",
  type: "",
  description: "",

  email: "",
  phone: "",
  emergencyPhone: "",

  address: "",
  area: "",
  district: "",

  latitude: "",
  longitude: "",

  operatingHours: "",

  services: {
    ambulance: false,
    hospital: false,
    police: false,
    towing: false,
    vehicleRecovery: false,
    repair: false,
  },
};

// ======================================================
// COMPONENT
// ======================================================

export default function OrganizationProfile() {
  const navigate = useNavigate();

  const [formData, setFormData] =
    useState(DEFAULT_FORM);

  const [organizationId, setOrganizationId] =
    useState(null);

  const [verificationStatus, setVerificationStatus] =
    useState("pending");

  const [loading, setLoading] =
    useState(true);

  const [saving, setSaving] =
    useState(false);

  const [submittingVerification, setSubmittingVerification] =
    useState(false);

  const [error, setError] =
    useState("");

  const [success, setSuccess] =
    useState("");

  // ====================================================
  // LOAD EXISTING ORGANIZATION
  // ====================================================

  useEffect(() => {
    loadOrganization();
  }, []);

  const loadOrganization = async () => {
    try {
      setLoading(true);
      setError("");

      const currentUser = auth.currentUser;

      if (!currentUser) {
        navigate("/login", {
          replace: true,
        });

        return;
      }

      // ----------------------------------------------
      // GET CURRENT USER'S ORGANIZATIONS
      // ----------------------------------------------

      const organizations =
        await getMyOrganizations();

      if (
        organizations &&
        organizations.length > 0
      ) {
        const organization =
          organizations[0];

        setOrganizationId(
          organization.id
        );

        setVerificationStatus(
          organization.verification
            ?.status || "pending"
        );

        setFormData({
          name:
            organization.name || "",

          type:
            organization.type || "",

          description:
            organization.description || "",

          email:
            organization.email ||
            currentUser.email ||
            "",

          phone:
            organization.phone || "",

          emergencyPhone:
            organization.emergencyPhone ||
            "",

          address:
            organization.address || "",

          area:
            organization.area || "",

          district:
            organization.district || "",

          latitude:
            organization.location
              ?.latitude ?? "",

          longitude:
            organization.location
              ?.longitude ?? "",

          operatingHours:
            organization.operatingHours ||
            "",

          services: {
            ambulance:
              organization.services
                ?.ambulance === true,

            hospital:
              organization.services
                ?.hospital === true,

            police:
              organization.services
                ?.police === true,

            towing:
              organization.services
                ?.towing === true,

            vehicleRecovery:
              organization.services
                ?.vehicleRecovery === true,

            repair:
              organization.services
                ?.repair === true,
          },
        });
      } else {
        // New organization
        setFormData((previous) => ({
          ...previous,
          email:
            currentUser.email || "",
        }));
      }
    } catch (err) {
      console.error(
        "Failed to load organization:",
        err
      );

      setError(
        err.message ||
          "Failed to load organization."
      );
    } finally {
      setLoading(false);
    }
  };

  // ====================================================
  // INPUT HANDLER
  // ====================================================

  const handleChange = (event) => {
    const {
      name,
      value,
    } = event.target;

    setFormData((previous) => ({
      ...previous,
      [name]: value,
    }));
  };

  // ====================================================
  // SERVICE HANDLER
  // ====================================================

  const handleServiceChange = (
    service
  ) => {
    setFormData((previous) => ({
      ...previous,

      services: {
        ...previous.services,

        [service]:
          !previous.services[
            service
          ],
      },
    }));
  };

  // ====================================================
  // SAVE ORGANIZATION
  // ====================================================

  const handleSave = async (
    event
  ) => {
    event.preventDefault();

    setError("");
    setSuccess("");

    if (!formData.name.trim()) {
      setError(
        "Please enter the organization name."
      );

      return;
    }

    if (!formData.type) {
      setError(
        "Please select an organization type."
      );

      return;
    }

    if (
      !formData.phone.trim() &&
      !formData.email.trim()
    ) {
      setError(
        "Please provide at least a phone number or email address."
      );

      return;
    }

    try {
      setSaving(true);

      // ----------------------------------------------
      // UPDATE EXISTING ORGANIZATION
      // ----------------------------------------------

      if (organizationId) {
        await updateOrganization(
          organizationId,
          formData
        );

        setSuccess(
          "Organization profile updated successfully."
        );
      }

      // ----------------------------------------------
      // CREATE NEW ORGANIZATION
      // ----------------------------------------------

      else {
        const created =
          await createOrganization(
            formData
          );

        setOrganizationId(
          created.id
        );

        setVerificationStatus(
          "pending"
        );

        setSuccess(
          "Organization created successfully. You can now submit it for verification."
        );
      }
    } catch (err) {
      console.error(
        "Failed to save organization:",
        err
      );

      setError(
        err.message ||
          "Failed to save organization."
      );
    } finally {
      setSaving(false);
    }
  };

  // ====================================================
  // SUBMIT VERIFICATION
  // ====================================================

  const handleSubmitVerification =
    async () => {
      setError("");
      setSuccess("");

      if (!organizationId) {
        setError(
          "Please save your organization profile first."
        );

        return;
      }

      if (
        !formData.name.trim() ||
        !formData.type
      ) {
        setError(
          "Complete the organization profile before submitting verification."
        );

        return;
      }

      try {
        setSubmittingVerification(
          true
        );

        await submitVerification(
          organizationId,
          {
            documents: [],
            notes:
              "Organization verification requested from SafeRoute BD organization profile.",
          }
        );

        setVerificationStatus(
          "pending"
        );

        setSuccess(
          "Verification application submitted successfully. An administrator will review your organization."
        );
      } catch (err) {
        console.error(
          "Verification submission failed:",
          err
        );

        setError(
          err.message ||
            "Failed to submit verification."
        );
      } finally {
        setSubmittingVerification(
          false
        );
      }
    };

  // ====================================================
  // GET CURRENT LOCATION
  // ====================================================

  const handleGetLocation = () => {
    if (!navigator.geolocation) {
      setError(
        "Geolocation is not supported by your browser."
      );

      return;
    }

    setError("");
    setSuccess("");

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setFormData(
          (previous) => ({
            ...previous,

            latitude:
              position.coords.latitude,

            longitude:
              position.coords.longitude,
          })
        );

        setSuccess(
          "Current location added successfully."
        );
      },
      (locationError) => {
        console.error(
          "Location error:",
          locationError
        );

        setError(
          "Unable to get your current location. Please allow location access."
        );
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0,
      }
    );
  };

  // ====================================================
  // LOADING
  // ====================================================

  if (loading) {
    return (
      <div className="organization-page">
        <div className="organization-loading">
          Loading organization profile...
        </div>
      </div>
    );
  }

  // ====================================================
  // RENDER
  // ====================================================

  return (
    <div className="organization-page">

      {/* ==================================================
          HEADER
      ================================================== */}

      <div className="organization-header">

        <button
          type="button"
          className="organization-back-button"
          onClick={() =>
            navigate(-1)
          }
        >
          <FaArrowLeft />
          Back
        </button>

        <div>
          <h1>
            <FaBuilding />
            Organization Profile
          </h1>

          <p>
            Register your organization with
            SafeRoute BD and apply for verification.
          </p>
        </div>

      </div>

      {/* ==================================================
          STATUS
      ================================================== */}

      {organizationId && (
        <div
          className={`verification-status verification-${verificationStatus}`}
        >
          {verificationStatus ===
            "verified" ? (
            <>
              <FaCheckCircle />
              <div>
                <strong>
                  Verified Organization
                </strong>

                <span>
                  Your organization has been
                  verified by SafeRoute BD.
                </span>
              </div>
            </>
          ) : verificationStatus ===
            "pending" ? (
            <>
              <FaClock />
              <div>
                <strong>
                  Verification Pending
                </strong>

                <span>
                  Your organization is waiting
                  for administrator review.
                </span>
              </div>
            </>
          ) : verificationStatus ===
            "rejected" ? (
            <>
              <FaBuilding />
              <div>
                <strong>
                  Verification Rejected
                </strong>

                <span>
                  Please review your information
                  and submit again.
                </span>
              </div>
            </>
          ) : (
            <>
              <FaBuilding />
              <div>
                <strong>
                  Verification Status
                </strong>

                <span>
                  {verificationStatus}
                </span>
              </div>
            </>
          )}
        </div>
      )}

      {/* ==================================================
          MESSAGES
      ================================================== */}

      {error && (
        <div className="organization-message error">
          {error}
        </div>
      )}

      {success && (
        <div className="organization-message success">
          {success}
        </div>
      )}

      {/* ==================================================
          FORM
      ================================================== */}

      <form
        className="organization-form"
        onSubmit={handleSave}
      >

        {/* =================================================
            BASIC INFORMATION
        ================================================= */}

        <section className="organization-section">

          <div className="section-heading">
            <FaBuilding />

            <div>
              <h2>
                Basic Information
              </h2>

              <p>
                Tell users what your organization
                does.
              </p>
            </div>
          </div>

          <div className="form-grid">

            <div className="form-group full-width">
              <label>
                Organization Name *
              </label>

              <input
                type="text"
                name="name"
                value={formData.name}
                onChange={handleChange}
                placeholder="e.g. ABC Hospital"
              />
            </div>

            <div className="form-group full-width">
              <label>
                Organization Type *
              </label>

              <div className="organization-type-grid">

                {ORGANIZATION_TYPES.map(
                  (type) => {
                    const config =
                      ORGANIZATION_TYPE_CONFIG[
                        type
                      ];

                    const Icon =
                      config?.icon ||
                      FaBuilding;

                    const selected =
                      formData.type ===
                      type;

                    return (
                      <button
                        type="button"
                        key={type}
                        className={`organization-type-card ${
                          selected
                            ? "selected"
                            : ""
                        }`}
                        onClick={() =>
                          setFormData(
                            (previous) => ({
                              ...previous,
                              type,
                            })
                          )
                        }
                      >
                        <Icon />

                        <strong>
                          {config.label}
                        </strong>

                        <span>
                          {
                            config.description
                          }
                        </span>
                      </button>
                    );
                  }
                )}

              </div>
            </div>

            <div className="form-group full-width">
              <label>
                Description
              </label>

              <textarea
                name="description"
                value={
                  formData.description
                }
                onChange={handleChange}
                placeholder="Describe your organization and services..."
                rows="4"
              />
            </div>

          </div>

        </section>

        {/* =================================================
            CONTACT INFORMATION
        ================================================= */}

        <section className="organization-section">

          <div className="section-heading">
            <FaPhone />

            <div>
              <h2>
                Contact Information
              </h2>

              <p>
                These details may be shown to
                users when assistance is needed.
              </p>
            </div>
          </div>

          <div className="form-grid">

            <div className="form-group">
              <label>
                <FaEnvelope />
                Email
              </label>

              <input
                type="email"
                name="email"
                value={formData.email}
                onChange={handleChange}
                placeholder="organization@example.com"
              />
            </div>

            <div className="form-group">
              <label>
                <FaPhone />
                Phone
              </label>

              <input
                type="tel"
                name="phone"
                value={formData.phone}
                onChange={handleChange}
                placeholder="01XXXXXXXXX"
              />
            </div>

            <div className="form-group">
              <label>
                <FaPhone />
                Emergency Phone
              </label>

              <input
                type="tel"
                name="emergencyPhone"
                value={
                  formData.emergencyPhone
                }
                onChange={handleChange}
                placeholder="Emergency contact number"
              />
            </div>

            <div className="form-group">
              <label>
                <FaClock />
                Operating Hours
              </label>

              <input
                type="text"
                name="operatingHours"
                value={
                  formData.operatingHours
                }
                onChange={handleChange}
                placeholder="24/7 or 9:00 AM - 6:00 PM"
              />
            </div>

          </div>

        </section>

        {/* =================================================
            LOCATION
        ================================================= */}

        <section className="organization-section">

          <div className="section-heading">
            <FaMapMarkerAlt />

            <div>
              <h2>
                Organization Location
              </h2>

              <p>
                Accurate location helps SafeRoute
                find your service when users need
                assistance.
              </p>
            </div>
          </div>

          <div className="form-grid">

            <div className="form-group full-width">
              <label>
                Address
              </label>

              <input
                type="text"
                name="address"
                value={formData.address}
                onChange={handleChange}
                placeholder="Full organization address"
              />
            </div>

            <div className="form-group">
              <label>
                Area
              </label>

              <input
                type="text"
                name="area"
                value={formData.area}
                onChange={handleChange}
                placeholder="Area"
              />
            </div>

            <div className="form-group">
              <label>
                District
              </label>

              <input
                type="text"
                name="district"
                value={formData.district}
                onChange={handleChange}
                placeholder="District"
              />
            </div>

            <div className="form-group">
              <label>
                Latitude
              </label>

              <input
                type="number"
                step="any"
                name="latitude"
                value={formData.latitude}
                onChange={handleChange}
                placeholder="23.8103"
              />
            </div>

            <div className="form-group">
              <label>
                Longitude
              </label>

              <input
                type="number"
                step="any"
                name="longitude"
                value={formData.longitude}
                onChange={handleChange}
                placeholder="90.4125"
              />
            </div>

          </div>

          <button
            type="button"
            className="location-button"
            onClick={handleGetLocation}
          >
            <FaMapMarkerAlt />
            Use My Current Location
          </button>

        </section>

        {/* =================================================
            SERVICES
        ================================================= */}

        <section className="organization-section">

          <div className="section-heading">
            <FaTools />

            <div>
              <h2>
                Services Provided
              </h2>

              <p>
                Select the emergency services your
                organization provides.
              </p>
            </div>
          </div>

          <div className="services-grid">

            <label className="service-checkbox">
              <input
                type="checkbox"
                checked={
                  formData.services
                    .ambulance
                }
                onChange={() =>
                  handleServiceChange(
                    "ambulance"
                  )
                }
              />

              <FaAmbulance />

              <span>
                Ambulance
              </span>
            </label>

            <label className="service-checkbox">
              <input
                type="checkbox"
                checked={
                  formData.services
                    .hospital
                }
                onChange={() =>
                  handleServiceChange(
                    "hospital"
                  )
                }
              />

              <FaHospital />

              <span>
                Hospital
              </span>
            </label>

            <label className="service-checkbox">
              <input
                type="checkbox"
                checked={
                  formData.services
                    .police
                }
                onChange={() =>
                  handleServiceChange(
                    "police"
                  )
                }
              />

              <FaShieldAlt />

              <span>
                Police
              </span>
            </label>

            <label className="service-checkbox">
              <input
                type="checkbox"
                checked={
                  formData.services
                    .towing
                }
                onChange={() =>
                  handleServiceChange(
                    "towing"
                  )
                }
              />

              <FaTruck />

              <span>
                Towing
              </span>
            </label>

            <label className="service-checkbox">
              <input
                type="checkbox"
                checked={
                  formData.services
                    .vehicleRecovery
                }
                onChange={() =>
                  handleServiceChange(
                    "vehicleRecovery"
                  )
                }
              />

              <FaCar />

              <span>
                Vehicle Recovery
              </span>
            </label>

            <label className="service-checkbox">
              <input
                type="checkbox"
                checked={
                  formData.services
                    .repair
                }
                onChange={() =>
                  handleServiceChange(
                    "repair"
                  )
                }
              />

              <FaTools />

              <span>
                Vehicle Repair
              </span>
            </label>

          </div>

        </section>

        {/* =================================================
            ACTIONS
        ================================================= */}

        <div className="organization-actions">

          <button
            type="button"
            className="secondary-button"
            onClick={() =>
              navigate(-1)
            }
          >
            Cancel
          </button>

          <button
            type="submit"
            className="primary-button"
            disabled={saving}
          >
            <FaSave />

            {saving
              ? "Saving..."
              : organizationId
              ? "Save Changes"
              : "Create Organization"}
          </button>

          {organizationId &&
            verificationStatus !==
              "verified" && (
              <button
                type="button"
                className="verification-button"
                disabled={
                  submittingVerification
                }
                onClick={
                  handleSubmitVerification
                }
              >
                <FaCheckCircle />

                {submittingVerification
                  ? "Submitting..."
                  : "Submit for Verification"}
              </button>
            )}

        </div>

      </form>

    </div>
  );
}