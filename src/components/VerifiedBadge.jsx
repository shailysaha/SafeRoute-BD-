import { FaCheckCircle } from "react-icons/fa";
import "./VerifiedBadge.css";

const VerifiedBadge = ({ small = false }) => {
  return (
    <span
      className={`verified-badge ${
        small ? "verified-badge-small" : ""
      }`}
      title="Verified organization"
    >
      <FaCheckCircle />
      <span>VERIFIED</span>
    </span>
  );
};

export default VerifiedBadge;