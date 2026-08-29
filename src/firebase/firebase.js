import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

// =============================================
// FIREBASE CONFIG
// =============================================

const firebaseConfig = {
  apiKey: "AIzaSyCZDn82sJ8iHRYVj4DleH8mdOJ73mrtoCI",
  authDomain: "planning-with-ai-84bf4.firebaseapp.com",
  projectId: "planning-with-ai-84bf4",
  storageBucket: "planning-with-ai-84bf4.firebasestorage.app",
  messagingSenderId: "210956481191",
  appId: "1:210956481191:web:653dc9bfe9881105926182",
};

// =============================================
// INITIALIZE FIREBASE
// =============================================

const app = initializeApp(firebaseConfig);

// =============================================
// AUTH
// =============================================

export const auth = getAuth(app);

// =============================================
// FIRESTORE
// =============================================

export const db = getFirestore(app);

// =============================================
// STORAGE
// =============================================

export const storage = getStorage(app);

export default app;