import {
  FaHospital,
  FaAmbulance,
  FaShieldAlt,
  FaTruck,
  FaCarCrash,
  FaTools,
  FaPhone,
  FaMapMarkerAlt,
  FaCheckCircle,
} from "react-icons/fa";

import VerifiedBadge from "./VerifiedBadge";

import "./OrganizationCard.css";

const typeConfig = {
  hospital: {
    label: "Hospital",
    icon: <FaHospital />,
  },
  ambulance: {
    label: "Ambulance Service",
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
    label: "Towing Service",
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

const OrganizationCard = ({
  organization,
  onNeedHelp,
  onCall,
  showNeedHelpButton = true, // New prop to control button visibility
}) => {
  if (!organization) return null;

  const isVerified = organization.verification?.status === "verified";

  const type = typeConfig[organization.type] || {
    label: "Organization",
    icon: <FaHospital />,
  };

  const handleCall = () => {
    const phone = organization.emergencyPhone || organization.phone;
    if (!phone) return;

    if (onCall) {
      onCall(organization);
      return;
    }

    window.location.href = `tel:${phone}`;
  };

  const handleNeedHelp = () => {
    if (onNeedHelp) {
      onNeedHelp(organization);
    }
  };

  return (
    <div className="organization-card">
      {/* HEADER */}
      <div className="organization-card-header">
        <div className="organization-card-icon">
          {type.icon}
        </div>

        <div className="organization-card-title">
          <div className="organization-card-name-row">
            <h3>
              {organization.name || "Unnamed Organization"}
            </h3>
            {isVerified && <VerifiedBadge />}
          </div>
          <span className="organization-card-type">
            {type.label}
          </span>
        </div>
      </div>

      {/* DESCRIPTION */}
      {organization.description && (
        <p className="organization-card-description">
          {organization.description}
        </p>
      )}

      {/* LOCATION */}
      {(organization.area || organization.district || organization.address) && (
        <div className="organization-card-location">
          <FaMapMarkerAlt />
          <span>
            {organization.area && `${organization.area}, `}
            {organization.district}
            {organization.address && ` • ${organization.address}`}
          </span>
        </div>
      )}

      {/* SERVICES */}
      {Array.isArray(organization.services) && organization.services.length > 0 && (
        <div className="organization-card-services">
          {organization.services.map((service) => (
            <span key={service}>{service}</span>
          ))}
        </div>
      )}

      {/* FOOTER */}
      <div className="organization-card-footer">
        <div className="organization-card-status">
          {isVerified ? (
            <>
              <FaCheckCircle />
              <span>Verified Organization</span>
            </>
          ) : (
            <span>Organization</span>
          )}
        </div>

        <div className="organization-card-actions">
          {(organization.phone || organization.emergencyPhone) && (
            <button
              type="button"
              className="organization-card-call"
              onClick={handleCall}
            >
              <FaPhone />
              Call
            </button>
          )}

          {onNeedHelp && showNeedHelpButton && (
            <button
              type="button"
              className="organization-need-help-btn"
              onClick={handleNeedHelp}
            >
              🆘 Need Help
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default OrganizationCard;