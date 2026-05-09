/**
 * SoilAI Cloud Lab — Dashboard Module
 * Real-time Firestore listeners, stats cards, activity feed
 * Demonstrates: Distributed Computing via Firestore onSnapshot
 */

import { auth, db, COLLECTIONS } from './firebase-config.js';
import {
  collection, query, where, orderBy, limit,
  onSnapshot, doc, getDoc, updateDoc, serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.13.0/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.13.0/firebase-auth.js";
import { renderCompactionChart } from './charts.js';

// ─── State ────────────────────────────────────────────────────────────────────
let currentUser = null;
let unsubscribeTests = null;
let unsubscribeActivity = null;
let allTests = [];

// ─── Auth Gate ────────────────────────────────────────────────────────────────
onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = '/';
    return;
  }
  currentUser = user;
  await initDashboard(user);
});

// ─── Dashboard Init ───────────────────────────────────────────────────────────
async function initDashboard(user) {
  // Set user name in navbar
  const nameEl = document.getElementById('user-display-name');
  const avatarEl = document.getElementById('user-avatar');

  // Fetch user profile from Firestore
  try {
    const profileSnap = await getDoc(doc(db, COLLECTIONS.USERS, user.uid));
    if (profileSnap.exists()) {
      const profile = profileSnap.data();
      if (nameEl) nameEl.textContent = profile.name || user.displayName || 'Engineer';
      if (avatarEl) avatarEl.textContent = (profile.name || user.displayName || 'E')[0].toUpperCase();
      // Update last login
      await updateDoc(doc(db, COLLECTIONS.USERS, user.uid), { lastLogin: serverTimestamp() });
    } else {
      if (nameEl) nameEl.textContent = user.displayName || user.email;
      if (avatarEl) avatarEl.textContent = (user.displayName || user.email || 'U')[0].toUpperCase();
    }
  } catch (e) {
    if (nameEl) nameEl.textContent = user.displayName || user.email;
  }

  // Start real-time listeners (Distributed Computing feature)
  subscribeToTests(user.uid);
  subscribeToActivity(user.uid);
  updateSystemStatus();
}

// ─── Real-Time Firestore Listener: Soil Tests ─────────────────────────────────
// This is the core Distributed Computing Systems demonstration:
// onSnapshot fires whenever any connected client writes new data.
function subscribeToTests(uid) {
  const q = query(
    collection(db, COLLECTIONS.SOIL_TESTS),
    where('uid', '==', uid)
  );

  unsubscribeTests = onSnapshot(q, (snapshot) => {
    let docs = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
    docs.sort((a, b) => {
      const timeA = a.createdAt?.toMillis ? a.createdAt.toMillis() : 0;
      const timeB = b.createdAt?.toMillis ? b.createdAt.toMillis() : 0;
      return timeB - timeA;
    });
    allTests = docs.slice(0, 50);
    updateStatCards(allTests);
    updateRecentTestsTable(allTests.slice(0, 8));
    updateDashboardChart(allTests);
    animateCounters();
  }, (err) => {
    console.error('Firestore listener error:', err);
  });
}

// ─── Real-Time Firestore Listener: Activity Log ───────────────────────────────
function subscribeToActivity(uid) {
  const q = query(
    collection(db, COLLECTIONS.ACTIVITY),
    where('uid', '==', uid)
  );

  unsubscribeActivity = onSnapshot(q, (snapshot) => {
    let activities = snapshot.docs.map(d => d.data());
    activities.sort((a, b) => {
      const timeA = a.timestamp?.toMillis ? a.timestamp.toMillis() : 0;
      const timeB = b.timestamp?.toMillis ? b.timestamp.toMillis() : 0;
      return timeB - timeA;
    });
    activities = activities.slice(0, 6);
    updateActivityFeed(activities);
  }, (err) => {
    console.error('Activity listener error:', err);
  });
}

// ─── Stat Cards Update ────────────────────────────────────────────────────────
function updateStatCards(tests) {
  const totalEl   = document.getElementById('stat-total-tests');
  const avgMcEl   = document.getElementById('stat-avg-mc');
  const avgDdEl   = document.getElementById('stat-avg-dd');
  const omcEl     = document.getElementById('stat-best-omc');

  if (totalEl) totalEl.textContent = tests.length;

  if (tests.length === 0) {
    if (avgMcEl) avgMcEl.textContent = '—';
    if (avgDdEl) avgDdEl.textContent = '—';
    if (omcEl)   omcEl.textContent   = '—';
    return;
  }

  const avgMc = tests.reduce((s, t) => s + (t.results?.average_moisture_content || 0), 0) / tests.length;
  const avgDd = tests.reduce((s, t) => s + (t.results?.average_dry_density || 0), 0) / tests.length;
  const latestOmc = tests[0]?.results?.omc;

  if (avgMcEl) avgMcEl.textContent = avgMc.toFixed(2) + '%';
  if (avgDdEl) avgDdEl.textContent = avgDd.toFixed(3) + ' g/cm³';
  if (omcEl)   omcEl.textContent   = latestOmc ? latestOmc.toFixed(2) + '%' : '—';
}

// ─── Recent Tests Table ───────────────────────────────────────────────────────
function updateRecentTestsTable(tests) {
  const tbody = document.getElementById('recent-tests-tbody');
  if (!tbody) return;

  if (tests.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="7" class="empty-table">
          <div class="empty-state">
            <div class="empty-icon">🧪</div>
            <p>No soil tests yet. <a href="/soil-test" class="link-accent">Run your first test →</a></p>
          </div>
        </td>
      </tr>`;
    return;
  }

  tbody.innerHTML = tests.map((test, i) => {
    const date = test.createdAt?.toDate ? test.createdAt.toDate() : new Date();
    const dateStr = date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
    const mc  = test.results?.average_moisture_content?.toFixed(2) || '—';
    const dd  = test.results?.average_dry_density?.toFixed(3) || '—';
    const omc = test.results?.omc?.toFixed(2) || '—';
    const mdd = test.results?.mdd?.toFixed(3) || '—';
    const statusClass = getStatusClass(test.results?.status);

    return `
      <tr class="fade-in" style="animation-delay:${i * 0.05}s">
        <td><span class="test-id">#${test.id.slice(-6).toUpperCase()}</span></td>
        <td><span class="test-name">${test.testName || 'Soil Test'}</span></td>
        <td>${dateStr}</td>
        <td><span class="value-badge mc">${mc}%</span></td>
        <td><span class="value-badge dd">${dd}</span></td>
        <td>
          <div class="omc-mdd">
            <span class="omc-val">${omc}%</span>
            <span class="mdd-val">${mdd}</span>
          </div>
        </td>
        <td><span class="status-badge ${statusClass}">${formatStatus(test.results?.status)}</span></td>
      </tr>`;
  }).join('');
}

// ─── Dashboard Chart ──────────────────────────────────────────────────────────
function updateDashboardChart(tests) {
  if (tests.length === 0) return;

  // Use most recent test with trials for the chart
  const testWithTrials = tests.find(t => t.trials && t.trials.length >= 2);
  if (!testWithTrials) return;

  const labels = testWithTrials.trials.map(t => t.moisture_content?.toFixed(2) + '%');
  const data   = testWithTrials.trials.map(t => t.dry_density);
  const omc    = testWithTrials.results?.omc;
  const mdd    = testWithTrials.results?.mdd;

  renderCompactionChart('dashboard-chart', labels, data, omc, mdd, true);
}

// ─── Activity Feed ────────────────────────────────────────────────────────────
function updateActivityFeed(activities) {
  const feed = document.getElementById('activity-feed');
  if (!feed) return;

  if (activities.length === 0) {
    feed.innerHTML = `<div class="activity-empty">No recent activity</div>`;
    return;
  }

  feed.innerHTML = activities.map(a => {
    const time = a.timestamp?.toDate ? timeAgo(a.timestamp.toDate()) : 'just now';
    return `
      <div class="activity-item fade-in">
        <div class="activity-icon ${a.type || 'info'}">${getActivityIcon(a.action)}</div>
        <div class="activity-content">
          <p class="activity-text">${a.message}</p>
          <span class="activity-time">${time}</span>
        </div>
      </div>`;
  }).join('');
}

// ─── System Status Panel ──────────────────────────────────────────────────────
function updateSystemStatus() {
  const indicators = [
    { id: 'node-flask',      label: 'Flask API Server',   status: 'online' },
    { id: 'node-firestore',  label: 'Firestore DB',       status: 'online' },
    { id: 'node-auth',       label: 'Firebase Auth',      status: 'online' },
    { id: 'node-realtime',   label: 'Real-Time Sync',     status: 'active' },
  ];

  indicators.forEach(n => {
    const el = document.getElementById(n.id);
    if (el) {
      el.innerHTML = `
        <span class="node-dot ${n.status}"></span>
        <span>${n.label}</span>
        <span class="node-status">${n.status}</span>`;
    }
  });
}

// ─── Animated Counters ────────────────────────────────────────────────────────
function animateCounters() {
  document.querySelectorAll('[data-counter]').forEach(el => {
    const target = parseFloat(el.textContent);
    if (isNaN(target)) return;
    let start = 0;
    const step = target / 30;
    const timer = setInterval(() => {
      start += step;
      if (start >= target) { clearInterval(timer); el.textContent = el.dataset.format?.includes('%') ? target.toFixed(2) + '%' : target; return; }
      el.textContent = Math.floor(start);
    }, 20);
  });
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function getStatusClass(status) {
  const map = { optimal: 'badge-success', slightly_dry: 'badge-info', slightly_wet: 'badge-info', dry: 'badge-warning', wet: 'badge-warning' };
  return map[status] || 'badge-neutral';
}

function formatStatus(status) {
  const map = { optimal: '✅ Optimal', slightly_dry: '💧 Slightly Dry', slightly_wet: '🔥 Slightly Wet', dry: '⚠️ Too Dry', wet: '⚠️ Too Wet' };
  return map[status] || '—';
}

function getActivityIcon(action) {
  const map = { 'test_created': '🧪', 'report_generated': '📄', 'login': '🔐', 'signup': '👤', 'calculation': '📊' };
  return map[action] || '📋';
}

function timeAgo(date) {
  const diff = Math.floor((Date.now() - date.getTime()) / 1000);
  if (diff < 60)      return 'just now';
  if (diff < 3600)    return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400)   return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

// ─── Sidebar Navigation ───────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  // Highlight active nav item
  const path = window.location.pathname;
  document.querySelectorAll('.nav-link').forEach(link => {
    if (link.getAttribute('href') === path) link.classList.add('active');
  });

  // Mobile sidebar toggle
  const menuBtn = document.getElementById('menu-toggle');
  const sidebar  = document.getElementById('sidebar');
  if (menuBtn && sidebar) {
    menuBtn.addEventListener('click', () => sidebar.classList.toggle('open'));
  }

  // Logout button
  const logoutBtn = document.getElementById('logout-btn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', async () => {
      const { handleLogout } = await import('./auth.js');
      handleLogout();
    });
  }
});

// ─── Cleanup on page unload ───────────────────────────────────────────────────
window.addEventListener('beforeunload', () => {
  if (unsubscribeTests)   unsubscribeTests();
  if (unsubscribeActivity) unsubscribeActivity();
});

export { allTests, currentUser };
