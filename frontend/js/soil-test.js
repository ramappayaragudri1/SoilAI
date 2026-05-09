/**
 * SoilAI Cloud Lab — Soil Test Input & Calculation Module
 * Handles dynamic trial input, Flask API call, Firestore storage, and PDF generation
 */

import { auth, db, COLLECTIONS } from './firebase-config.js';
import {
  collection, addDoc, doc, serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.13.0/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.13.0/firebase-auth.js";
import { renderCompactionChart } from './charts.js';

// ─── State ────────────────────────────────────────────────────────────────────
let currentUser  = null;
let trialCount   = 3;
let lastResults  = null;
const API_BASE   = window.location.origin;

// ─── Auth Gate ────────────────────────────────────────────────────────────────
onAuthStateChanged(auth, (user) => {
  if (!user) { window.location.href = '/'; return; }
  currentUser = user;
  updateUserName(user);
});

function updateUserName(user) {
  const el = document.getElementById('user-display-name');
  if (el) el.textContent = user.displayName || user.email;
  const av = document.getElementById('user-avatar');
  if (av) av.textContent = (user.displayName || user.email || 'U')[0].toUpperCase();
}

// ─── Trial Management ─────────────────────────────────────────────────────────
function addTrial() {
  trialCount++;
  const container = document.getElementById('trials-container');
  const trial = createTrialCard(trialCount);
  container.appendChild(trial);
  trial.scrollIntoView({ behavior: 'smooth', block: 'center' });
  updateRemoveButtons();
}

function removeTrial(btn) {
  const card = btn.closest('.trial-card');
  if (document.querySelectorAll('.trial-card').length <= 2) {
    showToast('Minimum 2 trials required for OMC/MDD calculation', 'warning');
    return;
  }
  card.style.animation = 'fadeOut 0.3s ease forwards';
  setTimeout(() => {
    card.remove();
    renumberTrials();
    updateRemoveButtons();
  }, 300);
}

function renumberTrials() {
  document.querySelectorAll('.trial-card').forEach((card, i) => {
    card.querySelector('.trial-number').textContent = i + 1;
    trialCount = i + 1;
  });
}

function updateRemoveButtons() {
  const cards = document.querySelectorAll('.trial-card');
  cards.forEach(card => {
    const btn = card.querySelector('.remove-trial-btn');
    if (btn) btn.disabled = cards.length <= 2;
  });
}

function createTrialCard(num) {
  const div = document.createElement('div');
  div.className = 'trial-card fade-in';
  div.innerHTML = `
    <div class="trial-header">
      <div class="trial-badge">
        <span class="trial-label">Trial</span>
        <span class="trial-number">${num}</span>
      </div>
      <div class="trial-live-result" id="live-result-${num}">
        <span class="live-mc">MC: —</span>
        <span class="live-dd">DD: —</span>
      </div>
      <button class="remove-trial-btn" onclick="window.removeTrial(this)" title="Remove trial">✕</button>
    </div>
    <div class="trial-fields">
      <div class="field-group">
        <label>W1 — Empty Container (g)</label>
        <input type="number" name="W1" placeholder="e.g. 25.0" step="0.01" min="0"
               oninput="window.previewTrial(this)" class="trial-input" required>
      </div>
      <div class="field-group">
        <label>W2 — Container + Wet Soil (g)</label>
        <input type="number" name="W2" placeholder="e.g. 185.0" step="0.01" min="0"
               oninput="window.previewTrial(this)" class="trial-input" required>
      </div>
      <div class="field-group">
        <label>W3 — Container + Dry Soil (g)</label>
        <input type="number" name="W3" placeholder="e.g. 160.0" step="0.01" min="0"
               oninput="window.previewTrial(this)" class="trial-input" required>
      </div>
      <div class="field-group">
        <label>Wet Density (g/cm³)</label>
        <input type="number" name="wet_density" placeholder="e.g. 1.85" step="0.001" min="0"
               oninput="window.previewTrial(this)" class="trial-input" required>
      </div>
    </div>`;
  return div;
}

// ─── Live Preview (single trial calculation) ──────────────────────────────────
const previewDebounce = {};
async function previewTrial(input) {
  const card = input.closest('.trial-card');
  const num  = card.querySelector('.trial-number').textContent;
  const liveEl = document.getElementById(`live-result-${num}`);

  const W1 = parseFloat(card.querySelector('[name="W1"]')?.value);
  const W2 = parseFloat(card.querySelector('[name="W2"]')?.value);
  const W3 = parseFloat(card.querySelector('[name="W3"]')?.value);
  const wd = parseFloat(card.querySelector('[name="wet_density"]')?.value);

  if ([W1, W2, W3, wd].some(isNaN)) return;

  clearTimeout(previewDebounce[num]);
  previewDebounce[num] = setTimeout(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/calculate/single-trial`, {
        method : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body   : JSON.stringify({ W1, W2, W3, wet_density: wd })
      });
      const json = await res.json();
      if (json.success && liveEl) {
        liveEl.innerHTML = `
          <span class="live-mc">MC: <b>${json.moisture_content.toFixed(2)}%</b></span>
          <span class="live-dd">DD: <b>${json.dry_density.toFixed(4)}</b></span>`;
      }
    } catch (_) {}
  }, 400);
}

// ─── Load Sample Data ─────────────────────────────────────────────────────────
async function loadSampleData() {
  try {
    const res  = await fetch(`${API_BASE}/api/sample-data`);
    const json = await res.json();
    if (!json.success) return;

    const trials = json.sample_trials;
    const cards  = document.querySelectorAll('.trial-card');

    // Remove extra cards, keep at least as many as sample trials
    while (document.querySelectorAll('.trial-card').length < trials.length) addTrial();

    document.querySelectorAll('.trial-card').forEach((card, i) => {
      if (i >= trials.length) { card.remove(); return; }
      const t = trials[i];
      card.querySelector('[name="W1"]').value         = t.W1;
      card.querySelector('[name="W2"]').value         = t.W2;
      card.querySelector('[name="W3"]').value         = t.W3;
      card.querySelector('[name="wet_density"]').value = t.wet_density;
    });

    document.getElementById('test-name').value     = 'Sample Compaction Test';
    document.getElementById('soil-type').value     = 'Silty Clay';
    document.getElementById('test-location').value = 'Demo Site, Block-A';

    showToast('Sample data loaded! Click "Run Calculation" to see results.', 'success');
  } catch (e) {
    showToast('Failed to load sample data', 'error');
  }
}

// ─── Main Calculation ─────────────────────────────────────────────────────────
async function runCalculation() {
  const btn = document.getElementById('calculate-btn');
  setLoading(btn, true, 'Calculating…');

  // Gather form data
  const testName   = document.getElementById('test-name')?.value.trim() || 'Untitled Test';
  const location   = document.getElementById('test-location')?.value.trim() || '';
  const soilType   = document.getElementById('soil-type')?.value.trim() || '';

  const trials = [];
  let   valid  = true;

  document.querySelectorAll('.trial-card').forEach((card, i) => {
    const W1 = parseFloat(card.querySelector('[name="W1"]')?.value);
    const W2 = parseFloat(card.querySelector('[name="W2"]')?.value);
    const W3 = parseFloat(card.querySelector('[name="W3"]')?.value);
    const wd = parseFloat(card.querySelector('[name="wet_density"]')?.value);

    if ([W1, W2, W3, wd].some(v => isNaN(v) || v < 0)) {
      highlightError(card, `Trial ${i + 1} has invalid or missing values`);
      valid = false;
      return;
    }
    trials.push({ W1, W2, W3, wet_density: wd });
  });

  if (!valid || trials.length < 2) {
    setLoading(btn, false, 'Run Calculation');
    if (trials.length < 2) showToast('Add at least 2 trials', 'error');
    return;
  }

  try {
    // Call Flask calculation API
    const res = await fetch(`${API_BASE}/api/calculate`, {
      method : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body   : JSON.stringify({ trials, test_name: testName, location, soil_type: soilType })
    });

    const json = await res.json();

    if (!json.success) {
      showToast(json.error || 'Calculation failed', 'error');
      if (json.details) json.details.forEach(d => showToast(d, 'error'));
      setLoading(btn, false, 'Run Calculation');
      return;
    }

    lastResults = json.data;
    lastResults.testName  = testName;
    lastResults.location  = location;
    lastResults.soilType  = soilType;

    displayResults(json.data);
    renderChart(json.data);

    // Save to Firestore (Distributed Cloud Storage)
    await saveToFirestore(json.data);

    setLoading(btn, false, 'Run Calculation');
    showToast('Calculation complete & saved to cloud!', 'success');

    // Scroll to results
    document.getElementById('results-section')?.scrollIntoView({ behavior: 'smooth' });

  } catch (err) {
    setLoading(btn, false, 'Run Calculation');
    showToast('Server error: ' + err.message, 'error');
  }
}

// ─── Display Results ──────────────────────────────────────────────────────────
function displayResults(data) {
  const section = document.getElementById('results-section');
  if (!section) return;
  section.style.display = 'block';

  // Key metrics
  setValue('result-omc', data.omc?.toFixed(4) + ' %');
  setValue('result-mdd', data.mdd?.toFixed(4) + ' g/cm³');
  setValue('result-avg-mc', data.average_moisture_content?.toFixed(4) + ' %');
  setValue('result-avg-dd', data.average_dry_density?.toFixed(4) + ' g/cm³');
  setValue('result-trials', data.trial_count);

  // Trial results table
  const tbody = document.getElementById('trial-results-tbody');
  if (tbody) {
    tbody.innerHTML = data.trials.map(t => `
      <tr>
        <td>${t.trial_number}</td>
        <td>${t.W1}</td>
        <td>${t.W2}</td>
        <td>${t.W3}</td>
        <td>${t.water_content_g}</td>
        <td>${t.dry_soil_g}</td>
        <td>${t.wet_density}</td>
        <td><b>${t.moisture_content.toFixed(4)}</b></td>
        <td><b>${t.dry_density.toFixed(4)}</b></td>
      </tr>`).join('');
  }

  // Recommendations
  const recContainer = document.getElementById('recommendations-container');
  if (recContainer && data.recommendations?.length > 0) {
    recContainer.innerHTML = data.recommendations.map(r => `
      <div class="rec-card rec-${r.type}">
        <div class="rec-header">
          <span class="rec-icon">${r.icon}</span>
          <span class="rec-title">${r.title}</span>
          <span class="rec-badge badge-${r.type}">${r.type.toUpperCase()}</span>
        </div>
        <p class="rec-message">${r.message}</p>
        <div class="rec-action">
          <span>📌 Action:</span> ${r.action}
        </div>
      </div>`).join('');
  }
}

function setValue(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
}

// ─── Render Chart ─────────────────────────────────────────────────────────────
function renderChart(data) {
  renderCompactionChart('compaction-chart', data.trials, data.omc, data.mdd, data.regression_fit, false);
}

// ─── Save to Firestore ────────────────────────────────────────────────────────
async function saveToFirestore(data) {
  if (!currentUser) return;
  try {
    await addDoc(collection(db, COLLECTIONS.SOIL_TESTS), {
      uid       : currentUser.uid,
      testName  : data.testName  || 'Untitled Test',
      location  : data.location  || '',
      soilType  : data.soilType  || '',
      trials    : data.trials,
      results   : {
        omc                     : data.omc,
        mdd                     : data.mdd,
        average_moisture_content: data.average_moisture_content,
        average_dry_density     : data.average_dry_density,
        status                  : data.status,
        trial_count             : data.trial_count
      },
      recommendations: data.recommendations,
      createdAt : serverTimestamp()
    });

    // Log activity
    await addDoc(collection(db, COLLECTIONS.ACTIVITY), {
      uid      : currentUser.uid,
      action   : 'test_created',
      message  : `New soil test "${data.testName}" — OMC: ${data.omc}%, MDD: ${data.mdd} g/cm³`,
      type     : 'success',
      timestamp: serverTimestamp()
    });

  } catch (err) {
    console.error('Firestore save error:', err);
    showToast('Warning: Could not save to cloud', 'warning');
  }
}

// ─── PDF Report Generation ────────────────────────────────────────────────────
function generatePDF() {
  if (!lastResults) { showToast('Run a calculation first', 'warning'); return; }

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });

  const margin = 20;
  const pageW  = 210;
  let   y      = 20;

  // ── Header ──
  doc.setFillColor(15, 23, 42);
  doc.rect(0, 0, pageW, 40, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.setTextColor(255, 255, 255);
  doc.text('SoilAI Cloud Lab', margin, 16);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(148, 163, 184);
  doc.text('Geotechnical Engineering Analysis Report', margin, 24);
  doc.text(`Generated: ${new Date().toLocaleString('en-IN')}`, margin, 32);
  doc.text(`Engineer: ${currentUser?.displayName || currentUser?.email || 'N/A'}`, pageW - margin - 60, 32);

  y = 52;

  // ── Test Info ──
  doc.setTextColor(15, 23, 42);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text('Test Information', margin, y);
  y += 2;
  doc.setDrawColor(59, 130, 246);
  doc.setLineWidth(0.5);
  doc.line(margin, y, pageW - margin, y);
  y += 7;

  const info = [
    ['Test Name', lastResults.testName || '—'],
    ['Location',  lastResults.location || '—'],
    ['Soil Type', lastResults.soilType || '—'],
    ['No. of Trials', String(lastResults.trial_count)]
  ];
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  info.forEach(([k, v]) => {
    doc.setTextColor(100, 116, 139);
    doc.text(k + ':', margin, y);
    doc.setTextColor(15, 23, 42);
    doc.text(v, margin + 45, y);
    y += 7;
  });

  y += 4;

  // ── Key Results ──
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(15, 23, 42);
  doc.text('Calculation Results', margin, y);
  y += 2;
  doc.line(margin, y, pageW - margin, y);
  y += 7;

  // Result boxes
  const boxes = [
    { label: 'Optimum Moisture Content (OMC)', value: lastResults.omc?.toFixed(4) + ' %',       color: [59, 130, 246] },
    { label: 'Maximum Dry Density (MDD)',      value: lastResults.mdd?.toFixed(4) + ' g/cm³',   color: [16, 185, 129] },
    { label: 'Average Moisture Content',        value: lastResults.average_moisture_content?.toFixed(4) + ' %', color: [168, 85, 247] },
    { label: 'Average Dry Density',             value: lastResults.average_dry_density?.toFixed(4) + ' g/cm³', color: [245, 158, 11] }
  ];

  const boxW = 80, boxH = 20, gap = 10;
  boxes.forEach((b, i) => {
    const bx = margin + (i % 2) * (boxW + gap);
    const by = y + Math.floor(i / 2) * (boxH + 6);
    doc.setFillColor(...b.color.map(c => Math.round(c * 0.15 + 240)));
    doc.roundedRect(bx, by, boxW, boxH, 2, 2, 'F');
    doc.setFillColor(...b.color);
    doc.rect(bx, by, 3, boxH, 'F');
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139);
    doc.text(b.label, bx + 6, by + 7);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(...b.color);
    doc.text(b.value, bx + 6, by + 15);
  });

  y += 52;

  // ── Trial Data Table ──
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(15, 23, 42);
  doc.text('Trial Data', margin, y);
  y += 2;
  doc.line(margin, y, pageW - margin, y);
  y += 6;

  const headers = ['Trial', 'W1(g)', 'W2(g)', 'W3(g)', 'Wet Den.', 'MC(%)', 'DD(g/cm³)'];
  const colW    = [12, 22, 22, 22, 22, 22, 26];
  let   cx      = margin;

  doc.setFillColor(241, 245, 249);
  doc.rect(margin, y - 4, pageW - 2 * margin, 8, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(71, 85, 105);

  headers.forEach((h, i) => {
    doc.text(h, cx + 1, y);
    cx += colW[i];
  });
  y += 5;

  doc.setFont('helvetica', 'normal');
  lastResults.trials.forEach((t, ri) => {
    if (y > 265) { doc.addPage(); y = 20; }
    cx = margin;
    if (ri % 2 === 0) {
      doc.setFillColor(248, 250, 252);
      doc.rect(margin, y - 4, pageW - 2 * margin, 8, 'F');
    }
    doc.setTextColor(15, 23, 42);
    const row = [t.trial_number, t.W1, t.W2, t.W3, t.wet_density, t.moisture_content.toFixed(4), t.dry_density.toFixed(4)];
    row.forEach((v, i) => {
      doc.text(String(v), cx + 1, y);
      cx += colW[i];
    });
    y += 7;
  });

  y += 8;

  // ── Recommendations ──
  if (lastResults.recommendations?.length > 0) {
    if (y > 240) { doc.addPage(); y = 20; }
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.setTextColor(15, 23, 42);
    doc.text('Engineering Recommendations', margin, y);
    y += 2;
    doc.line(margin, y, pageW - margin, y);
    y += 7;

    lastResults.recommendations.forEach(r => {
      if (y > 270) { doc.addPage(); y = 20; }
      const colors = { success: [16, 185, 129], warning: [245, 158, 11], error: [239, 68, 68], info: [59, 130, 246] };
      const c = colors[r.type] || [59, 130, 246];
      doc.setFillColor(...c.map(v => Math.round(v * 0.1 + 232)));
      doc.roundedRect(margin, y - 4, pageW - 2 * margin, 20, 2, 2, 'F');
      doc.setDrawColor(...c);
      doc.setLineWidth(0.3);
      doc.rect(margin, y - 4, 3, 20, 'F');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.setTextColor(...c);
      doc.text(`${r.icon} ${r.title}`, margin + 6, y + 2);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(71, 85, 105);
      doc.setFontSize(8);
      const wrapped = doc.splitTextToSize(r.message, pageW - 2 * margin - 10);
      doc.text(wrapped[0], margin + 6, y + 8);
      doc.text(`📌 ${r.action}`, margin + 6, y + 14);
      y += 26;
    });
  }

  // ── Footer ──
  const totalPages = doc.internal.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFillColor(15, 23, 42);
    doc.rect(0, 290, pageW, 10, 'F');
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(148, 163, 184);
    doc.text('SoilAI Cloud Lab — Geotechnical Analytics Platform  |  Cloud & Distributed Computing Demo', margin, 296);
    doc.text(`Page ${i} of ${totalPages}`, pageW - margin - 16, 296);
  }

  doc.save(`SoilAI_Report_${lastResults.testName || 'Test'}_${Date.now()}.pdf`);

  // Log activity
  if (currentUser) {
    addDoc(collection(db, COLLECTIONS.ACTIVITY), {
      uid      : currentUser.uid,
      action   : 'report_generated',
      message  : `PDF report generated for "${lastResults.testName}"`,
      type     : 'info',
      timestamp: serverTimestamp()
    }).catch(() => {});
  }

  showToast('PDF report downloaded!', 'success');
}

// ─── UI Helpers ───────────────────────────────────────────────────────────────
function showToast(msg, type = 'info') {
  const toast = document.getElementById('toast');
  if (!toast) return;
  toast.textContent = msg;
  toast.className   = `toast toast-${type} show`;
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => toast.classList.remove('show'), 4000);
}

function setLoading(btn, loading, text) {
  if (!btn) return;
  btn.disabled    = loading;
  btn.textContent = loading ? text : (btn.dataset.default || text);
  if (loading) btn.dataset.default = text;
}

function highlightError(card, msg) {
  card.style.borderColor = '#ef4444';
  showToast(msg, 'error');
  setTimeout(() => card.style.borderColor = '', 2000);
}

// ─── Expose to HTML ───────────────────────────────────────────────────────────
window.addTrial      = addTrial;
window.removeTrial   = removeTrial;
window.previewTrial  = previewTrial;
window.loadSampleData = loadSampleData;
window.runCalculation = runCalculation;
window.generatePDF   = generatePDF;

// ─── Init on DOM ready ────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  // Sidebar & nav
  const menuBtn = document.getElementById('menu-toggle');
  const sidebar  = document.getElementById('sidebar');
  if (menuBtn && sidebar) menuBtn.addEventListener('click', () => sidebar.classList.toggle('open'));

  const logoutBtn = document.getElementById('logout-btn');
  if (logoutBtn) logoutBtn.addEventListener('click', async () => {
    const { handleLogout } = await import('./auth.js');
    handleLogout();
  });
});
