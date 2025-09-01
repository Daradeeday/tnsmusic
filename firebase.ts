// src/firebase.ts
import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import { initializeFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

// ✅ ใช้เฉพาะ option ที่รองรับจริง
export const db = initializeFirestore(app, {
  ignoreUndefinedProperties: true,
  // ช่วยในเครือข่ายที่เข้มงวด/บนบางโฮสต์:
  experimentalAutoDetectLongPolling: true,
  // ถ้าเวอร์ชันของคุณไม่รู้จัก autoDetect ให้ลองสลับเป็น:
  // experimentalForceLongPolling: true,
});

export const auth = getAuth(app);
export const provider = new GoogleAuthProvider();
