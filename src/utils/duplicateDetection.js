import { calculateDistance } from "./distance";

// ============================================================
// SAFEROUTE BD - DUPLICATE INCIDENT DETECTION
// ============================================================
//
// Duplicate detection uses:
// 1. Location distance
// 2. Incident type
// 3. Description similarity
// 4. Time difference
//
// ============================================================


// ============================================================
// CONFIGURATION
// ============================================================

// Maximum distance between two reports.
export const DUPLICATE_RADIUS_KM = 0.5;

// Maximum time difference.
export const DUPLICATE_TIME_WINDOW_MINUTES = 30;

// Minimum description similarity.
// 0.60 = 60% similarity.
export const DUPLICATE_DESCRIPTION_SIMILARITY = 0.60;


// ============================================================
// NORMALIZE TEXT
// ============================================================

export function normalizeText(text) {
  if (!text) {
    return "";
  }

  return String(text)
    .toLowerCase()
    .trim()
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ");
}


// ============================================================
// NORMALIZE INCIDENT TYPE
// ============================================================

export function normalizeIncidentType(incidentType) {
  if (!incidentType) {
    return "";
  }

  return normalizeText(incidentType);
}


// ============================================================
// GET INCIDENT TIMESTAMP
// ============================================================

export function getTimestampMillis(timestamp) {
  if (!timestamp) {
    return null;
  }

  // Firestore Timestamp
  if (
    typeof timestamp.toMillis === "function"
  ) {
    return timestamp.toMillis();
  }

  // JavaScript Date
  if (timestamp instanceof Date) {
    return timestamp.getTime();
  }

  // Firestore serialized Timestamp
  if (
    typeof timestamp === "object" &&
    typeof timestamp.seconds === "number"
  ) {
    return (
      timestamp.seconds * 1000 +
      Math.floor(
        (timestamp.nanoseconds || 0) / 1000000
      )
    );
  }

  // Number
  if (typeof timestamp === "number") {
    return timestamp;
  }

  // String
  if (typeof timestamp === "string") {
    const parsed = new Date(timestamp).getTime();

    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return null;
}


// ============================================================
// TIME WINDOW CHECK
// ============================================================

export function isWithinTimeWindow(
  newIncident,
  existingIncident
) {
  const newTime = getTimestampMillis(
    newIncident?.createdAt
  );

  const existingTime = getTimestampMillis(
    existingIncident?.createdAt
  );

  // If timestamps are unavailable,
  // do NOT use time as a reason to reject.
  if (
    newTime === null ||
    existingTime === null
  ) {
    return true;
  }

  const difference = Math.abs(
    newTime - existingTime
  );

  const maximumDifference =
    DUPLICATE_TIME_WINDOW_MINUTES *
    60 *
    1000;

  return difference <= maximumDifference;
}


// ============================================================
// GET TIME DIFFERENCE IN MINUTES
// ============================================================

export function getTimeDifferenceMinutes(
  newIncident,
  existingIncident
) {
  const newTime = getTimestampMillis(
    newIncident?.createdAt
  );

  const existingTime = getTimestampMillis(
    existingIncident?.createdAt
  );

  if (
    newTime === null ||
    existingTime === null
  ) {
    return null;
  }

  return (
    Math.abs(newTime - existingTime) /
    (60 * 1000)
  );
}


// ============================================================
// LOCATION CHECK
// ============================================================

export function isWithinDuplicateRadius(
  newIncident,
  existingIncident
) {
  const newLat = Number(newIncident?.lat);
  const newLng = Number(newIncident?.lng);

  const existingLat = Number(
    existingIncident?.lat
  );

  const existingLng = Number(
    existingIncident?.lng
  );

  // Invalid coordinates
  if (
    !Number.isFinite(newLat) ||
    !Number.isFinite(newLng) ||
    !Number.isFinite(existingLat) ||
    !Number.isFinite(existingLng)
  ) {
    return false;
  }

  const distance = calculateDistance(
    newLat,
    newLng,
    existingLat,
    existingLng
  );

  return (
    Number.isFinite(distance) &&
    distance <= DUPLICATE_RADIUS_KM
  );
}


// ============================================================
// GET DISTANCE
// ============================================================

export function getDistanceBetweenIncidents(
  newIncident,
  existingIncident
) {
  const newLat = Number(newIncident?.lat);
  const newLng = Number(newIncident?.lng);

  const existingLat = Number(
    existingIncident?.lat
  );

  const existingLng = Number(
    existingIncident?.lng
  );

  if (
    !Number.isFinite(newLat) ||
    !Number.isFinite(newLng) ||
    !Number.isFinite(existingLat) ||
    !Number.isFinite(existingLng)
  ) {
    return null;
  }

  return calculateDistance(
    newLat,
    newLng,
    existingLat,
    existingLng
  );
}


// ============================================================
// INCIDENT TYPE CHECK
// ============================================================

export function isSameIncidentType(
  newIncident,
  existingIncident
) {
  const newType = normalizeIncidentType(
    newIncident?.incidentType ||
      newIncident?.dangerType ||
      newIncident?.type
  );

  const existingType =
    normalizeIncidentType(
      existingIncident?.incidentType ||
        existingIncident?.dangerType ||
        existingIncident?.type
    );

  // If either type is missing,
  // don't automatically mark as different.
  if (!newType || !existingType) {
    return true;
  }

  return newType === existingType;
}


// ============================================================
// WORD SET
// ============================================================

function getWords(text) {
  return new Set(
    normalizeText(text)
      .split(" ")
      .filter((word) => word.length > 2)
  );
}


// ============================================================
// DESCRIPTION SIMILARITY
// ============================================================
//
// Uses Jaccard similarity:
//
// common words
// -----------------------
// all unique words
//
// Example:
//
// "road accident near market"
// "accident happened near market"
//
// Common words:
// accident, near, market
//
// This produces a similarity score.
// ============================================================

export function calculateDescriptionSimilarity(
  descriptionA,
  descriptionB
) {
  const wordsA = getWords(descriptionA);
  const wordsB = getWords(descriptionB);

  // No description available.
  if (
    wordsA.size === 0 ||
    wordsB.size === 0
  ) {
    return 0;
  }

  let intersection = 0;

  wordsA.forEach((word) => {
    if (wordsB.has(word)) {
      intersection++;
    }
  });

  const union = new Set([
    ...wordsA,
    ...wordsB,
  ]).size;

  if (union === 0) {
    return 0;
  }

  return intersection / union;
}


// ============================================================
// DESCRIPTION SIMILARITY CHECK
// ============================================================

export function isSimilarDescription(
  newIncident,
  existingIncident
) {
  const newDescription = normalizeText(
    newIncident?.description
  );

  const existingDescription = normalizeText(
    existingIncident?.description
  );

  // If both descriptions are empty,
  // don't use description as a blocking condition.
  if (
    !newDescription &&
    !existingDescription
  ) {
    return true;
  }

  // If only one description exists,
  // allow other duplicate signals to decide.
  if (
    !newDescription ||
    !existingDescription
  ) {
    return true;
  }

  const similarity =
    calculateDescriptionSimilarity(
      newDescription,
      existingDescription
    );

  return (
    similarity >=
    DUPLICATE_DESCRIPTION_SIMILARITY
  );
}


// ============================================================
// GET DESCRIPTION SIMILARITY
// ============================================================

export function getDescriptionSimilarity(
  newIncident,
  existingIncident
) {
  return calculateDescriptionSimilarity(
    newIncident?.description || "",
    existingIncident?.description || ""
  );
}


// ============================================================
// GET DUPLICATE SCORE
// ============================================================
//
// Score:
// Location       = 25%
// Type           = 25%
// Description    = 25%
// Time           = 25%
//
// 100% = very strong duplicate
// 75%+ = duplicate candidate
// ============================================================

export function calculateDuplicateScore(
  newIncident,
  existingIncident
) {
  if (
    !newIncident ||
    !existingIncident
  ) {
    return {
      score: 0,
      isDuplicate: false,
      reasons: [],
    };
  }

  const reasons = [];

  let locationScore = 0;
  let typeScore = 0;
  let descriptionScore = 0;
  let timeScore = 0;

  // ----------------------------------------------------------
  // LOCATION
  // ----------------------------------------------------------

  const distance =
    getDistanceBetweenIncidents(
      newIncident,
      existingIncident
    );

  if (
    distance !== null &&
    distance <= DUPLICATE_RADIUS_KM
  ) {
    locationScore = 25;

    reasons.push(
      `Location within ${DUPLICATE_RADIUS_KM} km`
    );
  }

  // ----------------------------------------------------------
  // INCIDENT TYPE
  // ----------------------------------------------------------

  if (
    isSameIncidentType(
      newIncident,
      existingIncident
    )
  ) {
    typeScore = 25;

    reasons.push(
      "Same incident type"
    );
  }

  // ----------------------------------------------------------
  // DESCRIPTION
  // ----------------------------------------------------------

  const descriptionSimilarity =
    getDescriptionSimilarity(
      newIncident,
      existingIncident
    );

  if (
    descriptionSimilarity >=
    DUPLICATE_DESCRIPTION_SIMILARITY
  ) {
    descriptionScore = 25;

    reasons.push(
      `Description similarity ${Math.round(
        descriptionSimilarity * 100
      )}%`
    );
  }

  // ----------------------------------------------------------
  // TIME
  // ----------------------------------------------------------

  const timeDifference =
    getTimeDifferenceMinutes(
      newIncident,
      existingIncident
    );

  if (
    timeDifference === null ||
    timeDifference <=
      DUPLICATE_TIME_WINDOW_MINUTES
  ) {
    timeScore = 25;

    if (timeDifference !== null) {
      reasons.push(
        `Reported ${Math.round(
          timeDifference
        )} minutes apart`
      );
    } else {
      reasons.push(
        "Time information unavailable"
      );
    }
  }

  // ----------------------------------------------------------
  // TOTAL
  // ----------------------------------------------------------

  const score =
    locationScore +
    typeScore +
    descriptionScore +
    timeScore;

  // Strong duplicate:
  // all four signals OR at least 75%.
  const isDuplicate = score >= 75;

  return {
    score,
    isDuplicate,

    distance,
    timeDifference,
    descriptionSimilarity,

    locationScore,
    typeScore,
    descriptionScore,
    timeScore,

    reasons,
  };
}


// ============================================================
// MAIN DUPLICATE CHECK
// ============================================================

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
  // new reports.
  if (
    existingIncident.status ===
    "Resolved"
  ) {
    return false;
  }

  const result =
    calculateDuplicateScore(
      newIncident,
      existingIncident
    );

  return result.isDuplicate;
}


// ============================================================
// FIND DUPLICATE
// ============================================================

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
      incident.id &&
      newIncident.id &&
      incident.id === newIncident.id
    ) {
      continue;
    }

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


// ============================================================
// FIND ALL DUPLICATES
// ============================================================

export function findDuplicateIncidents(
  newIncident,
  existingIncidents
) {
  if (
    !Array.isArray(existingIncidents)
  ) {
    return [];
  }

  return existingIncidents.filter(
    (incident) => {
      if (
        incident.id &&
        newIncident.id &&
        incident.id === newIncident.id
      ) {
        return false;
      }

      return isDuplicateIncident(
        newIncident,
        incident
      );
    }
  );
}


// ============================================================
// GET BEST DUPLICATE MATCH
// ============================================================

export function findBestDuplicateIncident(
  newIncident,
  existingIncidents
) {
  if (
    !Array.isArray(existingIncidents) ||
    existingIncidents.length === 0
  ) {
    return null;
  }

  let bestMatch = null;
  let highestScore = 0;

  existingIncidents.forEach(
    (incident) => {
      if (
        incident.id &&
        newIncident.id &&
        incident.id === newIncident.id
      ) {
        return;
      }

      if (
        incident.status ===
        "Resolved"
      ) {
        return;
      }

      const result =
        calculateDuplicateScore(
          newIncident,
          incident
        );

      if (
        result.score > highestScore
      ) {
        highestScore = result.score;

        bestMatch = {
          incident,
          ...result,
        };
      }
    }
  );

  return bestMatch;
}