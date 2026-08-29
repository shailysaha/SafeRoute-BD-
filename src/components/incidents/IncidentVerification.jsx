import { useState } from "react";
import {
  doc,
  updateDoc,
  arrayUnion,
  increment,
  serverTimestamp,
} from "firebase/firestore";

import { auth, db } from "../../firebase/firebase";

// =====================================
// CONFIGURATION
// =====================================

// Nearby users must be within 5 KM
const VERIFICATION_RADIUS_KM = 5;

// Minimum confirmations required
// to become Community Confirmed
const COMMUNITY_CONFIRMATION_THRESHOLD = 3;


// =====================================
// DISTANCE CALCULATION
// Haversine Formula
// =====================================
function calculateDistance(
  lat1,
  lng1,
  lat2,
  lng2
) {
  const R = 6371; // Earth radius in KM

  const dLat =
    ((lat2 - lat1) * Math.PI) / 180;

  const dLng =
    ((lng2 - lng1) * Math.PI) / 180;

  const a =
    Math.sin(dLat / 2) *
      Math.sin(dLat / 2) +
    Math.cos(
      (lat1 * Math.PI) / 180
    ) *
      Math.cos(
        (lat2 * Math.PI) / 180
      ) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);

  const c =
    2 *
    Math.atan2(
      Math.sqrt(a),
      Math.sqrt(1 - a)
    );

  return R * c;
}


// =====================================
// COMPONENT
// =====================================
function IncidentVerification({
  incident,
  onUpdate,
}) {
  const [loading, setLoading] =
    useState(false);

  const [message, setMessage] =
    useState("");

  const [userDistance, setUserDistance] =
    useState(null);


  // =====================================
  // GET CURRENT USER
  // =====================================
  const currentUser =
    auth.currentUser;


  // =====================================
  // CHECK USER LOGIN
  // =====================================
  const checkLogin = () => {
    if (!currentUser) {
      setMessage(
        "🔐 Please login before verifying an incident."
      );

      return false;
    }

    return true;
  };


  // =====================================
  // GET USER GPS
  // =====================================
  const getUserLocation = () => {
    return new Promise(
      (resolve, reject) => {
        if (!navigator.geolocation) {
          reject(
            new Error(
              "Geolocation is not supported by your browser."
            )
          );

          return;
        }

        navigator.geolocation.getCurrentPosition(
          (position) => {
            resolve({
              lat:
                position.coords.latitude,

              lng:
                position.coords.longitude,
            });
          },

          (error) => {
            reject(error);
          },

          {
            enableHighAccuracy: true,
            timeout: 15000,
            maximumAge: 0,
          }
        );
      }
    );
  };


  // =====================================
  // CHECK WHETHER USER IS NEARBY
  // =====================================
  const checkNearbyUser = async () => {
    try {
      const userLocation =
        await getUserLocation();

      const incidentLat =
        Number(incident.lat);

      const incidentLng =
        Number(incident.lng);

      if (
        !Number.isFinite(
          incidentLat
        ) ||
        !Number.isFinite(
          incidentLng
        )
      ) {
        throw new Error(
          "Incident location is invalid."
        );
      }

      const distance =
        calculateDistance(
          userLocation.lat,
          userLocation.lng,
          incidentLat,
          incidentLng
        );

      setUserDistance(distance);

      if (
        distance >
        VERIFICATION_RADIUS_KM
      ) {
        setMessage(
          `📍 You are ${distance.toFixed(
            2
          )} km away. Only users within ${VERIFICATION_RADIUS_KM} km can verify this incident.`
        );

        return false;
      }

      return true;
    } catch (error) {
      console.error(
        "Location verification error:",
        error
      );

      if (
        error.code ===
        error.PERMISSION_DENIED
      ) {
        setMessage(
          "📍 Location permission is required to verify this incident."
        );
      } else if (
        error.code ===
        error.POSITION_UNAVAILABLE
      ) {
        setMessage(
          "❌ Your current location is unavailable."
        );
      } else if (
        error.code === error.TIMEOUT
      ) {
        setMessage(
          "❌ GPS request timed out. Please try again."
        );
      } else {
        setMessage(
          error.message ||
            "❌ Could not verify your location."
        );
      }

      return false;
    }
  };


  // =====================================
  // CHECK WHETHER USER ALREADY VOTED
  // =====================================
  const checkExistingVote = () => {
    if (!currentUser) {
      return "none";
    }

    const userId =
      currentUser.uid;

    const confirmedBy =
      incident.confirmedBy || [];

    const rejectedBy =
      incident.rejectedBy || [];

    if (
      confirmedBy.includes(userId)
    ) {
      return "confirmed";
    }

    if (
      rejectedBy.includes(userId)
    ) {
      return "rejected";
    }

    return "none";
  };


  // =====================================
  // CONFIRM INCIDENT
  // =====================================
  const handleConfirm = async () => {
    setMessage("");

    // -------------------------------------
    // Login check
    // -------------------------------------
    if (!checkLogin()) {
      return;
    }

    // -------------------------------------
    // Prevent reporter from verifying
    // own incident
    // -------------------------------------
    if (
      incident.reporterId &&
      incident.reporterId ===
        currentUser.uid
    ) {
      setMessage(
        "⚠️ You cannot verify your own incident."
      );

      return;
    }

    // -------------------------------------
    // Already voted?
    // -------------------------------------
    const existingVote =
      checkExistingVote();

    if (existingVote === "confirmed") {
      setMessage(
        "✅ You have already confirmed this incident."
      );

      return;
    }

    if (existingVote === "rejected") {
      setMessage(
        "⚠️ You have already rejected this incident."
      );

      return;
    }

    // -------------------------------------
    // Resolved incidents cannot be voted
    // -------------------------------------
    if (
      incident.status ===
      "Resolved"
    ) {
      setMessage(
        "ℹ️ This incident has already been resolved."
      );

      return;
    }

    // -------------------------------------
    // Check GPS
    // -------------------------------------
    setLoading(true);

    const nearby =
      await checkNearbyUser();

    if (!nearby) {
      setLoading(false);
      return;
    }

    // -------------------------------------
    // Firestore update
    // -------------------------------------
    try {
      const incidentRef =
        doc(
          db,
          "incidents",
          incident.id
        );

      const currentConfirmations =
        Number(
          incident.confirmationCount ||
            0
        );

      const newConfirmationCount =
        currentConfirmations + 1;

      // -------------------------------------
      // Determine new status
      // -------------------------------------
      let newStatus =
        incident.status ||
        "Unverified";

      if (
        newConfirmationCount >=
        COMMUNITY_CONFIRMATION_THRESHOLD
      ) {
        newStatus =
          "Community Confirmed";
      }

      await updateDoc(
        incidentRef,
        {
          confirmationCount:
            increment(1),

          confirmedBy:
            arrayUnion(
              currentUser.uid
            ),

          status: newStatus,

          updatedAt:
            serverTimestamp(),
        }
      );

      setMessage(
        newStatus ===
          "Community Confirmed"
          ? "🎉 Incident is now Community Confirmed!"
          : "✅ Thank you! Your confirmation has been recorded."
      );

      // -------------------------------------
      // Refresh incidents
      // -------------------------------------
      if (onUpdate) {
        await onUpdate();
      }
    } catch (error) {
      console.error(
        "Confirm incident error:",
        error
      );

      if (
        error.code ===
        "permission-denied"
      ) {
        setMessage(
          "❌ You do not have permission to verify this incident."
        );
      } else {
        setMessage(
          "❌ Failed to confirm incident."
        );
      }
    } finally {
      setLoading(false);
    }
  };


  // =====================================
  // REJECT INCIDENT
  // =====================================
  const handleReject = async () => {
    setMessage("");

    // -------------------------------------
    // Login check
    // -------------------------------------
    if (!checkLogin()) {
      return;
    }

    // -------------------------------------
    // Prevent reporter from rejecting
    // own incident
    // -------------------------------------
    if (
      incident.reporterId &&
      incident.reporterId ===
        currentUser.uid
    ) {
      setMessage(
        "⚠️ You cannot reject your own incident."
      );

      return;
    }

    // -------------------------------------
    // Already voted?
    // -------------------------------------
    const existingVote =
      checkExistingVote();

    if (existingVote === "confirmed") {
      setMessage(
        "⚠️ You have already confirmed this incident."
      );

      return;
    }

    if (existingVote === "rejected") {
      setMessage(
        "❌ You have already rejected this incident."
      );

      return;
    }

    // -------------------------------------
    // Resolved incidents
    // -------------------------------------
    if (
      incident.status ===
      "Resolved"
    ) {
      setMessage(
        "ℹ️ This incident has already been resolved."
      );

      return;
    }

    // -------------------------------------
    // Check GPS
    // -------------------------------------
    setLoading(true);

    const nearby =
      await checkNearbyUser();

    if (!nearby) {
      setLoading(false);
      return;
    }

    // -------------------------------------
    // Firestore update
    // -------------------------------------
    try {
      const incidentRef =
        doc(
          db,
          "incidents",
          incident.id
        );

      await updateDoc(
        incidentRef,
        {
          rejectionCount:
            increment(1),

          rejectedBy:
            arrayUnion(
              currentUser.uid
            ),

          updatedAt:
            serverTimestamp(),
        }
      );

      setMessage(
        "❌ Your rejection has been recorded."
      );

      // -------------------------------------
      // Refresh incidents
      // -------------------------------------
      if (onUpdate) {
        await onUpdate();
      }
    } catch (error) {
      console.error(
        "Reject incident error:",
        error
      );

      if (
        error.code ===
        "permission-denied"
      ) {
        setMessage(
          "❌ You do not have permission to verify this incident."
        );
      } else {
        setMessage(
          "❌ Failed to record rejection."
        );
      }
    } finally {
      setLoading(false);
    }
  };


  // =====================================
  // CURRENT USER VOTE
  // =====================================
  const currentVote =
    checkExistingVote();


  // =====================================
  // RENDER
  // =====================================
  return (
    <div
      className="incident-verification"
      style={{
        marginTop: "12px",
        padding: "12px",
        borderRadius: "10px",
        border:
          "1px solid #ddd",
        background: "#fafafa",
      }}
    >
      {/* =====================================
          TITLE
          ===================================== */}
      <h4
        style={{
          marginTop: 0,
          marginBottom: "8px",
        }}
      >
        🛡️ Community Verification
      </h4>

      {/* =====================================
          STATUS
          ===================================== */}
      <div
        style={{
          marginBottom: "8px",
          fontWeight: "600",
        }}
      >
        Status:{" "}
        <span>
          {incident.status ||
            "Unverified"}
        </span>
      </div>

      {/* =====================================
          COUNTS
          ===================================== */}
      <div
        style={{
          display: "flex",
          gap: "12px",
          marginBottom: "10px",
          fontSize: "14px",
        }}
      >
        <span>
          ✅ Confirmed:{" "}
          {incident.confirmationCount ||
            0}
        </span>

        <span>
          ❌ Rejected:{" "}
          {incident.rejectionCount ||
            0}
        </span>
      </div>

      {/* =====================================
          GPS INFORMATION
          ===================================== */}
      {userDistance !== null && (
        <p
          style={{
            fontSize: "13px",
            marginBottom: "8px",
          }}
        >
          📍 Your distance:{" "}
          {userDistance.toFixed(2)} km
        </p>
      )}

      {/* =====================================
          ALREADY VOTED
          ===================================== */}
      {currentVote ===
        "confirmed" && (
        <p
          style={{
            color: "green",
            fontWeight: "600",
          }}
        >
          ✅ You confirmed this
          incident.
        </p>
      )}

      {currentVote ===
        "rejected" && (
        <p
          style={{
            color: "#b00020",
            fontWeight: "600",
          }}
        >
          ❌ You rejected this
          incident.
        </p>
      )}

      {/* =====================================
          ACTION BUTTONS
          ===================================== */}
      {currentVote === "none" &&
        incident.status !==
          "Resolved" && (
          <div
            style={{
              display: "flex",
              gap: "8px",
            }}
          >
            <button
              type="button"
              onClick={
                handleConfirm
              }
              disabled={loading}
              style={{
                flex: 1,
                padding:
                  "9px 8px",
                border: "none",
                borderRadius:
                  "7px",
                cursor: loading
                  ? "not-allowed"
                  : "pointer",
                fontWeight:
                  "600",
              }}
            >
              {loading
                ? "Checking..."
                : "✅ Confirm"}
            </button>

            <button
              type="button"
              onClick={
                handleReject
              }
              disabled={loading}
              style={{
                flex: 1,
                padding:
                  "9px 8px",
                border: "none",
                borderRadius:
                  "7px",
                cursor: loading
                  ? "not-allowed"
                  : "pointer",
                fontWeight:
                  "600",
              }}
            >
              {loading
                ? "Checking..."
                : "❌ Reject"}
            </button>
          </div>
        )}

      {/* =====================================
          RESOLVED MESSAGE
          ===================================== */}
      {incident.status ===
        "Resolved" && (
        <p
          style={{
            fontWeight: "600",
          }}
        >
          🟢 This incident has been
          resolved.
        </p>
      )}

      {/* =====================================
          MESSAGE
          ===================================== */}
      {message && (
        <p
          style={{
            marginTop: "10px",
            marginBottom: 0,
            fontSize: "13px",
          }}
        >
          {message}
        </p>
      )}

      {/* =====================================
          VERIFICATION INFO
          ===================================== */}
      <small
        style={{
          display: "block",
          marginTop: "10px",
          color: "#666",
        }}
      >
        📍 Only users within{" "}
        {VERIFICATION_RADIUS_KM} km
        can verify this incident.
      </small>
    </div>
  );
}

export default IncidentVerification;