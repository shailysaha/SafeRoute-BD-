import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from "firebase/firestore";

import { auth, db } from "../firebase/firebase";

// ======================================================
// COLLECTION
// ======================================================

const assistanceRequestsCollection = collection(
  db,
  "assistanceRequests"
);

// ======================================================
// CONSTANTS
// ======================================================

export const ASSISTANCE_SERVICE_TYPES = [
  "ambulance",
  "hospital",
  "police",
  "towing",
  "vehicle_recovery",
  "repair_service",
];

export const ASSISTANCE_STATUS = [
  "requested",
  "searching",
  "accepted",
  "en_route",
  "arrived",
  "completed",
  "cancelled",
  "failed",
];

// ======================================================
// VALIDATION HELPERS
// ======================================================

const validateServiceType = (serviceType) => {
  if (!ASSISTANCE_SERVICE_TYPES.includes(serviceType)) {
    throw new Error(
      `Invalid assistance service type: ${serviceType}`
    );
  }
};

const validateStatus = (status) => {
  if (!ASSISTANCE_STATUS.includes(status)) {
    throw new Error(
      `Invalid assistance status: ${status}`
    );
  }
};

// ======================================================
// CREATE ASSISTANCE REQUEST
// ======================================================

export const createAssistanceRequest = async ({
  accidentId = null,
  incidentId = null,
  serviceType,
  organization,
  location,
}) => {
  const currentUser = auth.currentUser;

  if (!currentUser) {
    throw new Error(
      "You must be logged in to request assistance."
    );
  }

  validateServiceType(serviceType);

  if (!organization?.id) {
    throw new Error(
      "A valid assistance provider must be selected."
    );
  }

  if (!location) {
    throw new Error(
      "Your current location is required."
    );
  }

  const latitude = Number(
    location.latitude ?? location.lat
  );

  const longitude = Number(
    location.longitude ?? location.lng
  );

  if (
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude)
  ) {
    throw new Error(
      "Invalid assistance location."
    );
  }

  // ----------------------------------------------------
  // Verify that the selected organization still exists
  // ----------------------------------------------------

  const organizationRef = doc(
    db,
    "organizations",
    organization.id
  );

  const organizationSnapshot = await getDoc(
    organizationRef
  );

  if (!organizationSnapshot.exists()) {
    throw new Error(
      "The selected organization no longer exists."
    );
  }

  const organizationData =
    organizationSnapshot.data();

  // ----------------------------------------------------
  // Only verified organizations can receive requests
  // ----------------------------------------------------

  if (
    organizationData.verification?.status !==
    "verified"
  ) {
    throw new Error(
      "Assistance can only be requested from verified organizations."
    );
  }

  if (organizationData.status === "inactive") {
    throw new Error(
      "This organization is currently inactive."
    );
  }

  // ----------------------------------------------------
  // Create request
  // ----------------------------------------------------

  const requestData = {
    // User
    userId: currentUser.uid,
    userEmail: currentUser.email || "",

    // Related incident/accident
    accidentId: accidentId || null,
    incidentId: incidentId || null,

    // Requested service
    serviceType,

    // Selected provider
    selectedOrganizationId: organization.id,
    organizationName:
      organizationData.name ||
      organization.name ||
      "",
    organizationType:
      organizationData.type ||
      organization.type ||
      "",

    // Request status
    status: "requested",

    // Location snapshot
    location: {
      latitude,
      longitude,
      area: location.area || "",
      district: location.district || "",
      displayName:
        location.displayName ||
        location.name ||
        "",
    },

    // Status timestamps
    requestedAt: serverTimestamp(),
    acceptedAt: null,
    enRouteAt: null,
    arrivedAt: null,
    completedAt: null,
    cancelledAt: null,

    // Provider response analytics
    providerResponseTime: null,

    // General timestamps
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  const requestRef = await addDoc(
    assistanceRequestsCollection,
    requestData
  );

  return {
    id: requestRef.id,
    ...requestData,
  };
};

// ======================================================
// GET SINGLE ASSISTANCE REQUEST
// ======================================================

export const getAssistanceRequest = async (
  requestId
) => {
  if (!requestId) {
    throw new Error(
      "Assistance request ID is required."
    );
  }

  const requestRef = doc(
    db,
    "assistanceRequests",
    requestId
  );

  const snapshot = await getDoc(requestRef);

  if (!snapshot.exists()) {
    return null;
  }

  return {
    id: snapshot.id,
    ...snapshot.data(),
  };
};

// ======================================================
// GET USER'S ASSISTANCE REQUESTS
// ======================================================

export const getUserAssistanceRequests = async (
  userId = null
) => {
  const currentUser = auth.currentUser;

  const targetUserId =
    userId || currentUser?.uid;

  if (!targetUserId) {
    throw new Error(
      "User authentication is required."
    );
  }

  const requestQuery = query(
    assistanceRequestsCollection,
    where("userId", "==", targetUserId)
  );

  const snapshot = await getDocs(requestQuery);

  return snapshot.docs.map((requestDoc) => ({
    id: requestDoc.id,
    ...requestDoc.data(),
  }));
};

// ======================================================
// GET ORGANIZATION ASSISTANCE REQUESTS
// ======================================================

export const getOrganizationAssistanceRequests =
  async (organizationId) => {
    const currentUser = auth.currentUser;

    if (!currentUser) {
      throw new Error(
        "Authentication is required."
      );
    }

    if (!organizationId) {
      throw new Error(
        "Organization ID is required."
      );
    }

    const requestQuery = query(
      assistanceRequestsCollection,
      where(
        "selectedOrganizationId",
        "==",
        organizationId
      )
    );

    const snapshot = await getDocs(requestQuery);

    return snapshot.docs.map((requestDoc) => ({
      id: requestDoc.id,
      ...requestDoc.data(),
    }));
  };

// ======================================================
// GET REQUESTS BY STATUS
// ======================================================

export const getAssistanceRequestsByStatus =
  async (status) => {
    validateStatus(status);

    const requestQuery = query(
      assistanceRequestsCollection,
      where("status", "==", status)
    );

    const snapshot = await getDocs(requestQuery);

    return snapshot.docs.map((requestDoc) => ({
      id: requestDoc.id,
      ...requestDoc.data(),
    }));
  };

// ======================================================
// UPDATE ASSISTANCE STATUS
// ======================================================

export const updateAssistanceStatus = async (
  requestId,
  status
) => {
  const currentUser = auth.currentUser;

  if (!currentUser) {
    throw new Error(
      "Authentication is required."
    );
  }

  if (!requestId) {
    throw new Error(
      "Assistance request ID is required."
    );
  }

  validateStatus(status);

  const requestRef = doc(
    db,
    "assistanceRequests",
    requestId
  );

  const requestSnapshot = await getDoc(
    requestRef
  );

  if (!requestSnapshot.exists()) {
    throw new Error(
      "Assistance request not found."
    );
  }

  const requestData =
    requestSnapshot.data();

  const updateData = {
    status,
    updatedAt: serverTimestamp(),
  };

  // ----------------------------------------------------
  // Status-specific timestamps
  // ----------------------------------------------------

  switch (status) {
    case "accepted":
      updateData.acceptedAt =
        serverTimestamp();
      break;

    case "en_route":
      updateData.enRouteAt =
        serverTimestamp();
      break;

    case "arrived":
      updateData.arrivedAt =
        serverTimestamp();
      break;

    case "completed":
      updateData.completedAt =
        serverTimestamp();
      break;

    case "cancelled":
      updateData.cancelledAt =
        serverTimestamp();
      break;

    default:
      break;
  }

  await updateDoc(
    requestRef,
    updateData
  );

  return {
    id: requestId,
    ...requestData,
    ...updateData,
  };
};

// ======================================================
// CANCEL ASSISTANCE REQUEST
// ======================================================

export const cancelAssistanceRequest = async (
  requestId
) => {
  const currentUser = auth.currentUser;

  if (!currentUser) {
    throw new Error(
      "Authentication is required."
    );
  }

  if (!requestId) {
    throw new Error(
      "Assistance request ID is required."
    );
  }

  const requestRef = doc(
    db,
    "assistanceRequests",
    requestId
  );

  const snapshot = await getDoc(requestRef);

  if (!snapshot.exists()) {
    throw new Error(
      "Assistance request not found."
    );
  }

  const requestData = snapshot.data();

  // User can only cancel their own request.
  if (
    requestData.userId !==
    currentUser.uid
  ) {
    throw new Error(
      "You are not allowed to cancel this request."
    );
  }

  if (
    ["completed", "cancelled"].includes(
      requestData.status
    )
  ) {
    throw new Error(
      "This request can no longer be cancelled."
    );
  }

  await updateDoc(requestRef, {
    status: "cancelled",
    cancelledAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  return {
    id: requestId,
    ...requestData,
    status: "cancelled",
  };
};

// ======================================================
// COMPLETE ASSISTANCE REQUEST
// ======================================================

export const completeAssistanceRequest = async (
  requestId
) => {
  return updateAssistanceStatus(
    requestId,
    "completed"
  );
};