import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getAnalytics, isSupported } from "firebase/analytics";

// Veylaro Firebase project (public web config — safe to ship).
const firebaseConfig = {
  apiKey: "AIzaSyAFwbPygszhH3IkRJ-_-pYly6sDbgI2m5s",
  authDomain: "veylaro.firebaseapp.com",
  projectId: "veylaro",
  storageBucket: "veylaro.firebasestorage.app",
  messagingSenderId: "451819388140",
  appId: "1:451819388140:web:2c5ef14c8720ea729d39c9",
  measurementId: "G-7HVFSXJREB",
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

// Analytics only where supported (not in SSR/Electron/preview edge cases)
isSupported()
  .then((ok) => ok && getAnalytics(app))
  .catch(() => {});

/** Accounts allowed into Mission Control. */
export const SUPER_ADMINS = ["leoanthonybons@gmail.com"];
