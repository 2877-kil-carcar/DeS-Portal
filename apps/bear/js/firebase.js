import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { getAuth, signInAnonymously } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyDM9hR4HzAIg81QvQ9T2c3zEE6UFH7UUPA",
  authDomain: "alliance-layout.firebaseapp.com",
  projectId: "alliance-layout",
  storageBucket: "alliance-layout.firebasestorage.app",
  messagingSenderId: "627548508832",
  appId: "1:627548508832:web:e14363bea6583deb4c6fc5",
  measurementId: "G-4XN2KYB63Z"
};

// 初期化
export const PREVIEW = new URLSearchParams(location.search).get('preview') === '1';
const app = initializeApp(firebaseConfig);

// Firestore
export const db = getFirestore(app);

// 認証（必須）
const auth = getAuth(app);
export const authReady = PREVIEW ? Promise.resolve() : signInAnonymously(auth);
authReady.catch(() => {});