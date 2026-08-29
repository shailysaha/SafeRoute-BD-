import { doc, updateDoc, increment } from "firebase/firestore";
import { db } from "../../firebase/firebase";

function VerificationButtons({ incident, onUpdate }) {
  const handleVerify = async (type) => {
    if (!incident?.id) return;

    try {
      const incidentRef = doc(db, "incidents", incident.id);

      if (type === "confirm") {
        await updateDoc(incidentRef, {
          confirmationCount: increment(1),
        });
      } else if (type === "reject") {
        await updateDoc(incidentRef, {
          rejectionCount: increment(1),
        });
      }

      if (onUpdate) onUpdate();
    } catch (error) {
      console.error("Error updating verification count:", error);
    }
  };

  return (
    <div className="verification-buttons" style={{ marginTop: "8px", display: "flex", gap: "6px" }}>
      <button
        type="button"
        onClick={() => handleVerify("confirm")}
        style={{ padding: "4px 8px", background: "#22c55e", color: "#fff", border: "none", borderRadius: "4px", cursor: "pointer" }}
      >
        Confirm 👍
      </button>

      <button
        type="button"
        onClick={() => handleVerify("reject")}
        style={{ padding: "4px 8px", background: "#ef4444", color: "#fff", border: "none", borderRadius: "4px", cursor: "pointer" }}
      >
        Not There 👎
      </button>
    </div>
  );
}

export default VerificationButtons;