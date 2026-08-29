import {
  collection,
  addDoc,
  getDocs,
  serverTimestamp,
} from "firebase/firestore";

import { db } from "../firebase/firebase";

export const createIncident = async ({
  incident,
  selectedLocation,
  currentUser,
}) => {
  if (!currentUser) {
    throw new Error("LOGIN_REQUIRED");
  }

  if (!selectedLocation) {
    throw new Error("LOCATION_REQUIRED");
  }

  const newIncident = {
    ...incident,

    lat: Number(selectedLocation.lat),
    lng: Number(selectedLocation.lng),

    area:
      selectedLocation.area ||
      incident.area ||
      "",

    district:
      selectedLocation.district ||
      incident.district ||
      "",

    reporterId: currentUser.uid,
    reporterEmail: currentUser.email || "",

    status: "Unverified",

    confirmationCount: 0,
    rejectionCount: 0,

    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),

    resolvedAt: null,
  };

  const docRef = await addDoc(
    collection(db, "incidents"),
    newIncident
  );

  return {
    id: docRef.id,
    ...newIncident,
  };
};

export const getAllIncidents = async () => {
  const snapshot = await getDocs(
    collection(db, "incidents")
  );

  return snapshot.docs.map((docItem) => ({
    id: docItem.id,
    ...docItem.data(),
  }));
};