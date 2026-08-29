import {
doc,
setDoc,
getDoc,
serverTimestamp
} from "firebase/firestore";

import { db } from "../firebase/firebase";

export const createUserProfile = async (user, name) => {
if (!user) return;

const userRef = doc(db, "users", user.uid);

await setDoc(userRef, {
uid: user.uid,
name: name,
email: user.email,
role: "user",

reputationScore: 0,
totalReports: 0,
verifiedReports: 0,
rejectedReports: 0,

createdAt: serverTimestamp()
});
};

export const getUserProfile = async (uid) => {
const userRef = doc(db, "users", uid);
const snapshot = await getDoc(userRef);

if (snapshot.exists()) {
return snapshot.data();
}

return null;
};
