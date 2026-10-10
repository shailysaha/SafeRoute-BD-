import { useState } from "react";

import {
  doc,
  updateDoc,
  arrayUnion,
  increment,
  serverTimestamp,
} from "firebase/firestore";

import { auth, db } from "../../firebase/firebase";


// =========================================================
// CONFIGURATION
// =========================================================

const VERIFICATION_RADIUS_KM = 5;

const COMMUNITY_CONFIRMATION_THRESHOLD = 3;


// =========================================================
// HAVERSINE DISTANCE
// =========================================================

function calculateDistance(
  lat1,
  lng1,
  lat2,
  lng2
) {
  const R = 6371;

  const dLat =
    ((lat2 - lat1) * Math.PI) / 180;

  const dLng =
    ((lng2 - lng1) * Math.PI) / 180;

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(
      (lat1 * Math.PI) / 180
    ) *
      Math.cos(
        (lat2 * Math.PI) / 180
      ) *
      Math.sin(dLng / 2) ** 2;

  const c =
    2 *
    Math.atan2(
      Math.sqrt(a),
      Math.sqrt(1 - a)
    );

  return R * c;
}


// =========================================================
// GET USER GPS
// =========================================================

function getUserLocation() {
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
}


// =========================================================
// COMPONENT
// =========================================================

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

  const currentUser =
    auth.currentUser;


  // =======================================================
  // ARRAYS
  // =======================================================

  const confirmedBy =
    Array.isArray(
      incident?.confirmedBy
    )
      ? incident.confirmedBy
      : [];

  const rejectedBy =
    Array.isArray(
      incident?.rejectedBy
    )
      ? incident.rejectedBy
      : [];


  // =======================================================
  // REPORTER
  // =======================================================

  const ownerId =
    incident?.reporterId ||
    incident?.userId ||
    "";


  // =======================================================
  // COUNTS
  // =======================================================

  const confirmations =
    Number(
      incident?.confirmationCount
    ) || 0;

  const rejections =
    Number(
      incident?.rejectionCount
    ) || 0;


  // =======================================================
  // CURRENT USER VOTE
  // =======================================================

  const getCurrentVote = () => {
    if (!currentUser) {
      return "none";
    }

    if (
      confirmedBy.includes(
        currentUser.uid
      )
    ) {
      return "confirmed";
    }

    if (
      rejectedBy.includes(
        currentUser.uid
      )
    ) {
      return "rejected";
    }

    return "none";
  };


  // =======================================================
  // VALIDATE
  // =======================================================

  const validate = () => {
    if (!currentUser) {
      setMessage(
        "🔐 Please login before verifying."
      );

      return false;
    }

    if (!incident?.id) {
      setMessage(
        "❌ Incident ID is missing."
      );

      return false;
    }

    if (
      ownerId ===
      currentUser.uid
    ) {
      setMessage(
        "⚠️ You cannot verify your own incident."
      );

      return false;
    }

    const vote =
      getCurrentVote();

    if (
      vote === "confirmed"
    ) {
      setMessage(
        "✅ You have already confirmed this incident."
      );

      return false;
    }

    if (
      vote === "rejected"
    ) {
      setMessage(
        "❌ You have already rejected this incident."
      );

      return false;
    }

    if (
      incident?.status ===
      "Verified"
    ) {
      setMessage(
        "🎉 This incident has already been verified."
      );

      return false;
    }

    if (
      incident?.status ===
      "False Report"
    ) {
      setMessage(
        "❌ This incident has already been marked as a false report."
      );

      return false;
    }

    if (
      incident?.status ===
      "Resolved"
    ) {
      setMessage(
        "ℹ️ This incident is already resolved."
      );

      return false;
    }

    return true;
  };


  // =======================================================
  // CHECK 5 KM
  // =======================================================

  const checkNearby =
    async () => {
      try {
        const location =
          await getUserLocation();

        const incidentLat =
          Number(
            incident?.lat
          );

        const incidentLng =
          Number(
            incident?.lng
          );

        if (
          !Number.isFinite(
            incidentLat
          ) ||
          !Number.isFinite(
            incidentLng
          )
        ) {
          throw new Error(
            "Incident coordinates are invalid."
          );
        }

        const distance =
          calculateDistance(
            location.lat,
            location.lng,
            incidentLat,
            incidentLng
          );

        setUserDistance(
          distance
        );

        if (
          distance >
          VERIFICATION_RADIUS_KM
        ) {
          setMessage(
            `📍 You are ${distance.toFixed(
              2
            )} km away. You must be within ${VERIFICATION_RADIUS_KM} km to verify.`
          );

          return false;
        }

        return true;

      } catch (error) {
        console.error(
          "GPS verification error:",
          error
        );

        switch (
          error?.code
        ) {
          case 1:
            setMessage(
              "📍 Please enable location permissions to verify."
            );
            break;

          case 2:
            setMessage(
              "❌ Your current position is unavailable."
            );
            break;

          case 3:
            setMessage(
              "❌ GPS request timed out."
            );
            break;

          default:
            setMessage(
              error?.message ||
                "❌ Could not retrieve your location."
            );
        }

        return false;
      }
    };


  // =======================================================
  // PROCESS REPUTATION
  // =======================================================

  const processReputation =
    async (result) => {
      const reporterId =
        incident?.reporterId ||
        incident?.userId ||
        "";

      if (!reporterId) {
        throw new Error(
          "Original reporter ID is missing."
        );
      }

      await processReportReputation(
        incident.id,
        reporterId,
        result
      );
    };


  // =======================================================
  // CONFIRM
  // =======================================================

  const handleConfirm =
    async () => {
      setMessage("");

      if (!validate()) {
        return;
      }

      setLoading(true);

      try {
        const nearby =
          await checkNearby();

        if (!nearby) {
          return;
        }

        const incidentRef =
          doc(
            db,
            "incidents",
            incident.id
          );

        const newCount =
          confirmations + 1;

        const reachedThreshold =
          newCount >=
          COMMUNITY_CONFIRMATION_THRESHOLD;

        const newStatus =
          reachedThreshold
            ? "Verified"
            : "Unverified";


        // =================================================
        // UPDATE INCIDENT
        // =================================================

        await updateDoc(
          incidentRef,
          {
            confirmationCount:
              increment(1),

            confirmedBy:
              arrayUnion(
                currentUser.uid
              ),

            status:
              newStatus,

            updatedAt:
              serverTimestamp(),

            ...(reachedThreshold
              ? {
                  verificationStatus:
                    "verified",

                  communityConfirmedAt:
                    serverTimestamp(),

                  verifiedAt:
                    serverTimestamp(),
                }
              : {}),
          }
        );


        // =================================================
        // PROCESS REPUTATION
        // =================================================

        if (
          reachedThreshold
        ) {
          try {
            await processReputation(
              "verified"
            );

            setMessage(
              "🎉 3 community confirmations reached. Incident verified and reporter reputation updated (+5)."
            );

          } catch (
            reputationError
          ) {
            console.error(
              "Reputation error:",
              reputationError
            );

            setMessage(
              "⚠️ Incident was verified, but reporter reputation could not be updated. Please check Firestore rules."
            );
          }

        } else {
          setMessage(
            `✅ Your confirmation has been recorded. ${newCount}/${COMMUNITY_CONFIRMATION_THRESHOLD} confirmations.`
          );
        }


        // =================================================
        // REFRESH
        // =================================================

        if (
          typeof onUpdate ===
          "function"
        ) {
          await onUpdate();
        }

      } catch (error) {
        console.error(
          "Confirm error:",
          error
        );

        setMessage(
          error?.code ===
            "permission-denied"
            ? "❌ Verification permission denied by Firestore security rules."
            : `❌ Failed to confirm: ${
                error?.message ||
                "Unknown error"
              }`
        );

      } finally {
        setLoading(false);
      }
    };


  // =======================================================
  // REJECT
  // =======================================================

  const handleReject =
    async () => {
      setMessage("");

      if (!validate()) {
        return;
      }

      setLoading(true);

      try {
        const nearby =
          await checkNearby();

        if (!nearby) {
          return;
        }

        const incidentRef =
          doc(
            db,
            "incidents",
            incident.id
          );

        const newCount =
          rejections + 1;

        const reachedThreshold =
          newCount >=
          COMMUNITY_CONFIRMATION_THRESHOLD;


        // =================================================
        // UPDATE INCIDENT
        // =================================================

        await updateDoc(
          incidentRef,
          {
            rejectionCount:
              increment(1),

            rejectedBy:
              arrayUnion(
                currentUser.uid
              ),

            status:
              reachedThreshold
                ? "False Report"
                : "Unverified",

            updatedAt:
              serverTimestamp(),

            ...(reachedThreshold
              ? {
                  verificationStatus:
                    "false",

                  rejectedAt:
                    serverTimestamp(),
                }
              : {}),
          }
        );


        // =================================================
        // PROCESS REPUTATION
        // =================================================

        if (
          reachedThreshold
        ) {
          try {
            await processReputation(
              "false"
            );

            setMessage(
              "❌ 3 community rejections reached. This report was marked as false and reporter reputation was updated (-10)."
            );

          } catch (
            reputationError
          ) {
            console.error(
              "Reputation error:",
              reputationError
            );

            setMessage(
              "⚠️ Report was marked as false, but reporter reputation could not be updated. Please check Firestore rules."
            );
          }

        } else {
          setMessage(
            `❌ Your rejection has been recorded. ${newCount}/${COMMUNITY_CONFIRMATION_THRESHOLD} rejections.`
          );
        }


        // =================================================
        // REFRESH
        // =================================================

        if (
          typeof onUpdate ===
          "function"
        ) {
          await onUpdate();
        }

      } catch (error) {
        console.error(
          "Reject error:",
          error
        );

        setMessage(
          error?.code ===
            "permission-denied"
            ? "❌ Verification permission denied by Firestore security rules."
            : `❌ Failed to reject: ${
                error?.message ||
                "Unknown error"
              }`
        );

      } finally {
        setLoading(false);
      }
    };


  const currentVote =
    getCurrentVote();


  // =======================================================
  // RENDER
  // =======================================================

  return (
    <div
      className="incident-verification"
      style={{
        marginTop: "12px",
        padding: "12px",
        borderRadius: "10px",
        border: "1px solid #ddd",
        background: "#fafafa",
      }}
    >

      <h4
        style={{
          margin: "0 0 10px",
        }}
      >
        🛡️ Community Verification
      </h4>


      {/* STATUS */}

      <div
        style={{
          marginBottom: "8px",
          fontWeight: "600",
        }}
      >
        Status:{" "}
        {incident?.status ||
          "Unverified"}
      </div>


      {/* COUNTS */}

      <div
        style={{
          display: "flex",
          gap: "12px",
          flexWrap: "wrap",
          marginBottom: "10px",
        }}
      >
        <span>
          ✅ Confirmed:{" "}
          {confirmations}
        </span>

        <span>
          ❌ Rejected:{" "}
          {rejections}
        </span>
      </div>


      {/* PROGRESS */}

      {incident?.status !==
        "Verified" &&
        incident?.status !==
          "False Report" && (

        <div
          style={{
            marginBottom: "10px",
            fontSize: "13px",
          }}
        >
          🎯{" "}
          {Math.min(
            Math.max(
              confirmations,
              rejections
            ),
            COMMUNITY_CONFIRMATION_THRESHOLD
          )}{" "}
          /{" "}
          {COMMUNITY_CONFIRMATION_THRESHOLD}{" "}
          community responses needed
        </div>
      )}


      {/* DISTANCE */}

      {userDistance !==
        null && (

        <div
          style={{
            marginBottom: "8px",
            fontSize: "13px",
          }}
        >
          📍 Your distance:{" "}
          {userDistance.toFixed(
            2
          )} km
        </div>
      )}


      {/* USER CONFIRMED */}

      {currentVote ===
        "confirmed" && (

        <p
          style={{
            color: "green",
            fontWeight: "600",
          }}
        >
          ✅ You confirmed this incident.
        </p>
      )}


      {/* USER REJECTED */}

      {currentVote ===
        "rejected" && (

        <p
          style={{
            color: "#b00020",
            fontWeight: "600",
          }}
        >
          ❌ You rejected this incident.
        </p>
      )}


      {/* BUTTONS */}

      {currentVote ===
        "none" &&
        incident?.status !==
          "Resolved" &&
        incident?.status !==
          "Verified" &&
        incident?.status !==
          "False Report" && (

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
              padding: "9px",
              border: "none",
              borderRadius: "7px",
              cursor: loading
                ? "not-allowed"
                : "pointer",
              fontWeight: "600",
              backgroundColor:
                "#2e7d32",
              color: "#ffffff",
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
              padding: "9px",
              border: "none",
              borderRadius: "7px",
              cursor: loading
                ? "not-allowed"
                : "pointer",
              fontWeight: "600",
              backgroundColor:
                "#c62828",
              color: "#ffffff",
            }}
          >
            {loading
              ? "Checking..."
              : "❌ Reject"}
          </button>

        </div>
      )}


      {/* VERIFIED */}

      {incident?.status ===
        "Verified" && (

        <p
          style={{
            color: "green",
            fontWeight: "600",
          }}
        >
          🎉 This incident has been verified by the community.
        </p>
      )}


      {/* FALSE */}

      {incident?.status ===
        "False Report" && (

        <p
          style={{
            color: "#b00020",
            fontWeight: "600",
          }}
        >
          ❌ This incident has been marked as a false report by the community.
        </p>
      )}


      {/* RESOLVED */}

      {incident?.status ===
        "Resolved" && (

        <p
          style={{
            fontWeight: "600",
          }}
        >
          🟢 This incident has been resolved.
        </p>
      )}


      {/* MESSAGE */}

      {message && (

        <p
          style={{
            marginTop: "10px",
            marginBottom: 0,
            fontSize: "13px",
            wordBreak: "break-word",
          }}
        >
          {message}
        </p>
      )}


      {/* RADIUS */}

      <small
        style={{
          display: "block",
          marginTop: "10px",
          color: "#666",
        }}
      >
        📍 Only users within{" "}
        {VERIFICATION_RADIUS_KM} km can verify this incident.
      </small>

    </div>
  );
}


export default IncidentVerification;