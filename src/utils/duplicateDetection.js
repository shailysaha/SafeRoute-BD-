import { calculateDistance } from "./distance";

// =============================================
// DUPLICATE DETECTION CONFIGURATION
// =============================================

// Two reports within this distance may be
// considered the same incident.
export const DUPLICATE_RADIUS_KM = 0.5;

// Two reports submitted within this time
// window may be considered the same incident.
export const DUPLICATE_TIME_WINDOW_MINUTES = 30;


// =============================================
// NORMALIZE INCIDENT TYPE
// =============================================

export function normalizeIncidentType(
  incidentType
) {
  if (!incidentType) {
    return "";
  }

  return String(incidentType)
    .trim()
    .toLowerCase();
}


// =============================================
// GET INCIDENT TIMESTAMP
// =============================================
// Handles:
// 1. Firestore Timestamp
// 2. JavaScript Date
// 3. ISO string
// 4. milliseconds
// =============================================

export function getTimestampMillis(
  timestamp
) {
  if (!timestamp) {
    return null;
  }

  // Firestore Timestamp
  if (
    typeof timestamp.toMillis ===
    "function"
  ) {
    return timestamp.toMillis();
  }

  // JavaScript Date
  if (
    timestamp instanceof Date
  ) {
    return timestamp.getTime();
  }

  // Firestore serialized timestamp
  if (
    typeof timestamp === "object" &&
    typeof timestamp.seconds ===
      "number"
  ) {
    return (
      timestamp.seconds * 1000 +
      Math.floor(
        (timestamp.nanoseconds || 0) /
          1000000
      )
    );
  }

  // Number
  if (
    typeof timestamp === "number"
  ) {
    return timestamp;
  }

  // String
  if (
    typeof timestamp === "string"
  ) {
    const parsed =
      new Date(timestamp).getTime();

    if (
      Number.isFinite(parsed)
    ) {
      return parsed;
    }
  }

  return null;
}


// =============================================
// CHECK TIME WINDOW
// =============================================

export function isWithinTimeWindow(
  newIncident,
  existingIncident
) {
  const newTime =
    getTimestampMillis(
      newIncident.createdAt
    );

  const existingTime =
    getTimestampMillis(
      existingIncident.createdAt
    );

  // If either timestamp is unavailable,
  // don't automatically reject the duplicate.
  if (
    newTime === null ||
    existingTime === null
  ) {
    return true;
  }

  const difference =
    Math.abs(
      newTime - existingTime
    );

  const maximumDifference =
    DUPLICATE_TIME_WINDOW_MINUTES *
    60 *
    1000;

  return (
    difference <=
    maximumDifference
  );
}


// =============================================
// CHECK LOCATION
// =============================================

export function isWithinDuplicateRadius(
  newIncident,
  existingIncident
) {
  const distance =
    calculateDistance(
      newIncident.lat,
      newIncident.lng,
      existingIncident.lat,
      existingIncident.lng
    );

  return (
    distance <=
    DUPLICATE_RADIUS_KM
  );
}


// =============================================
// CHECK INCIDENT TYPE
// =============================================

export function isSameIncidentType(
  newIncident,
  existingIncident
) {
  return (
    normalizeIncidentType(
      newIncident.incidentType
    ) ===
    normalizeIncidentType(
      existingIncident.incidentType
    )
  );
}


// =============================================
// MAIN DUPLICATE CHECK
// =============================================

export function isDuplicateIncident(
  newIncident,
  existingIncident
) {
  if (
    !newIncident ||
    !existingIncident
  ) {
    return false;
  }

  // Resolved incidents should not absorb
  // a new report.
  if (
    existingIncident.status ===
    "Resolved"
  ) {
    return false;
  }

  // 1. Same incident type
  if (
    !isSameIncidentType(
      newIncident,
      existingIncident
    )
  ) {
    return false;
  }

  // 2. Same/similar location
  if (
    !isWithinDuplicateRadius(
      newIncident,
      existingIncident
    )
  ) {
    return false;
  }

  // 3. Similar time
  if (
    !isWithinTimeWindow(
      newIncident,
      existingIncident
    )
  ) {
    return false;
  }

  return true;
}


// =============================================
// FIND DUPLICATE
// =============================================

export function findDuplicateIncident(
  newIncident,
  existingIncidents
) {
  if (
    !Array.isArray(existingIncidents)
  ) {
    return null;
  }

  for (
    const incident of existingIncidents
  ) {
    if (
      isDuplicateIncident(
        newIncident,
        incident
      )
    ) {
      return incident;
    }
  }

  return null;
}

