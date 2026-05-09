/**
 * SoilAI Cloud Lab — Firebase Configuration & Service Initialization
 * Distributed Computing: Firebase provides real-time multi-node sync
 * across all connected clients simultaneously.
 */

import { initializeApp } from "https://www.gstatic.com/firebasejs/12.13.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/12.13.0/firebase-auth.js";
import {
  getFirestore,
  enableNetwork,
  disableNetwork
} from "https://www.gstatic.com/firebasejs/12.13.0/firebase-firestore.js";

// ─── Firebase Project Configuration ──────────────────────────────────────────
const firebaseConfig = {
  apiKey: "AIzaSyBa0sGWXwqGEU4sKvbPR0CEXh2lSCBOqDg",
  authDomain: "soilai-691b5.firebaseapp.com",
  projectId: "soilai-691b5",
  storageBucket: "soilai-691b5.firebasestorage.app",
  messagingSenderId: "963726929180",
  appId: "1:963726929180:web:0f1dc8a768ff9cbe1c9ed9"
};

// ─── Initialize Firebase App ──────────────────────────────────────────────────
const app = initializeApp(firebaseConfig);

// ─── Firebase Services ────────────────────────────────────────────────────────
const auth = getAuth(app);
const db   = getFirestore(app);

// ─── Connection State Monitor (Distributed Systems Demo) ─────────────────────
let isOnline = true;

window.addEventListener('online', async () => {
  isOnline = true;
  await enableNetwork(db);
  console.log('[SoilAI] Firestore network ENABLED — real-time sync active');
  updateConnectionBadge(true);
});

window.addEventListener('offline', async () => {
  isOnline = false;
  await disableNetwork(db);
  console.log('[SoilAI] Firestore network DISABLED — working offline');
  updateConnectionBadge(false);
});

function updateConnectionBadge(online) {
  const badge = document.getElementById('connection-status');
  if (!badge) return;
  badge.textContent  = online ? '● Live Sync' : '● Offline';
  badge.style.color  = online ? '#10b981' : '#ef4444';
}

// ─── Firestore Collection Paths ───────────────────────────────────────────────
const COLLECTIONS = {
  USERS      : 'users',
  SOIL_TESTS : 'soilTests',
  ACTIVITY   : 'activityLog'
};

export { app, auth, db, COLLECTIONS, isOnline };
