import {
  collection,
  addDoc,
  query,
  where,
  getDocs,
  doc,
  updateDoc,
  increment,
  serverTimestamp,
} from "firebase/firestore";

import { db } from "../firebase/firebase";

export const submitVerification = async (
  incidentId,
  userId,
  vote
) => {
  const verificationRef = collection(
    db,
    "incidentVerifications"
  );

  // Check if user already verified this incident
  const existingQuery = query(
    verificationRef,
    where("incidentId", "==", incidentId),
    where("userId", "==", userId)
  );

  const existingSnapshot =
    await getDocs(existingQuery);

  if (!existingSnapshot.empty) {
    throw new Error(
      "You already verified this incident."
    );
  }

  // Save verification
  await addDoc(verificationRef, {
    incidentId,
    userId,
    vote,
    createdAt: serverTimestamp(),
  });

  // Update incident counters
  const incidentRef = doc(
    db,
    "incidents",
    incidentId
  );

  if (vote === "confirm") {
    await updateDoc(incidentRef, {
      confirmationCount: increment(1),
      updatedAt: serverTimestamp(),
    });
  }

  if (vote === "reject") {
    await updateDoc(incidentRef, {
      rejectionCount: increment(1),
      updatedAt: serverTimestamp(),
    });
  }
};