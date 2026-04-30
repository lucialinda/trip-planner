import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth, connectAuthEmulator } from "firebase/auth";
import { getFirestore, connectFirestoreEmulator } from "firebase/firestore";
import { getStorage, connectStorageEmulator } from "firebase/storage";

const firebaseConfig = {
  apiKey: "AIzaSyBKqpyrKECFR3GhYtnbz0xe-FlrQ-0bkeA",
  authDomain: "trip-planner-2026-ec5ec.firebaseapp.com",
  projectId: "trip-planner-2026-ec5ec",
  storageBucket: "trip-planner-2026-ec5ec.firebasestorage.app",
  messagingSenderId: "916488885189",
  appId: "1:916488885189:web:d0ae67cf9a56c52f2e71ac"
};

const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);

if (typeof window !== "undefined") {
  if (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1") {
    // Prevent re-connecting if fast refresh happens
    if (!(auth as any)._emulatorConfig) {
      try {
        connectAuthEmulator(auth, "http://localhost:9099");
        connectFirestoreEmulator(db, "localhost", 8080);
        connectStorageEmulator(storage, "localhost", 9199);
        console.log("🔗 Connected to Firebase Emulators");
      } catch (e) {
        console.warn("Firebase emulator connection error:", e);
      }
    }
  }
}

export { app, auth, db, storage };
