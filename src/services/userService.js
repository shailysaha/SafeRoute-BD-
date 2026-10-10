import {
  doc,
  setDoc,
  serverTimestamp,
} from "firebase/firestore";

import { db } from "../firebase/firebase";

export async function createUserProfile(
  user,
  fullName,
  accountType = "user"
) {
  const isCompany =
    accountType === "company";

  await setDoc(
    doc(db, "users", user.uid),
    {
      uid: user.uid,

      fullName: fullName,

      name: fullName,

      email: user.email,

      accountType: isCompany
        ? "company"
        : "user",

      role: isCompany
        ? "company_admin"
        : "user",

      emailVerified:
        user.emailVerified || false,

      createdAt:
        serverTimestamp(),

      updatedAt:
        serverTimestamp(),
    }
  );
}