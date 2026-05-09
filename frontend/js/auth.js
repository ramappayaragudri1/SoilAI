/**
 * SoilAI Cloud Lab — Authentication Module
 * Handles Login, Signup, Forgot Password via Firebase Auth
 */

import { auth, db, COLLECTIONS } from './firebase-config.js';
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
  signOut,
  onAuthStateChanged,
  updateProfile
} from "https://www.gstatic.com/firebasejs/12.13.0/firebase-auth.js";
import {
  doc, setDoc, getDoc, serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.13.0/firebase-firestore.js";

// ─── Auth State Guard ─────────────────────────────────────────────────────────
// Redirects unauthenticated users away from protected pages
const PUBLIC_PAGES  = ['/', '/index.html', '/signup', '/signup.html', '/forgot-password', '/forgot-password.html'];
const PRIVATE_PAGES = ['/dashboard', '/dashboard.html', '/soil-test', '/soil-test.html', '/reports', '/reports.html'];

function isPublicPage() {
  return PUBLIC_PAGES.some(p => window.location.pathname === p || window.location.pathname.endsWith(p));
}

onAuthStateChanged(auth, async (user) => {
  if (user) {
    // Logged in — redirect away from auth pages
    if (isPublicPage()) {
      window.location.href = '/dashboard';
    }
    // Store basic user info in window for other scripts
    window.currentUser = user;
  } else {
    // Not logged in — redirect away from protected pages
    const isPrivate = PRIVATE_PAGES.some(p =>
      window.location.pathname === p || window.location.pathname.endsWith(p)
    );
    if (isPrivate) {
      window.location.href = '/';
    }
  }
});

// ─── Signup ───────────────────────────────────────────────────────────────────
async function handleSignup(event) {
  event.preventDefault();
  const form = event.target;
  const name     = form.querySelector('#name').value.trim();
  const email    = form.querySelector('#email').value.trim();
  const password = form.querySelector('#password').value;
  const confirm  = form.querySelector('#confirm-password').value;
  const org      = form.querySelector('#organization')?.value.trim() || '';

  clearErrors();

  if (!name)               return showError('name-error', 'Full name is required');
  if (!email)              return showError('email-error', 'Email is required');
  if (password.length < 6) return showError('password-error', 'Password must be at least 6 characters');
  if (password !== confirm) return showError('confirm-error', 'Passwords do not match');

  const btn = form.querySelector('button[type="submit"]');
  setLoading(btn, true);

  try {
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    await updateProfile(cred.user, { displayName: name });

    // Store user profile in Firestore (distributed DB)
    await setDoc(doc(db, COLLECTIONS.USERS, cred.user.uid), {
      uid           : cred.user.uid,
      name,
      email,
      organization  : org,
      role          : 'engineer',
      createdAt     : serverTimestamp(),
      totalTests    : 0,
      lastLogin     : serverTimestamp()
    });

    showSuccess('Account created! Redirecting to dashboard…');
    setTimeout(() => window.location.href = '/dashboard', 1500);
  } catch (err) {
    setLoading(btn, false);
    handleAuthError(err);
  }
}

// ─── Login ────────────────────────────────────────────────────────────────────
async function handleLogin(event) {
  event.preventDefault();
  const form     = event.target;
  const email    = form.querySelector('#email').value.trim();
  const password = form.querySelector('#password').value;

  clearErrors();

  if (!email)    return showError('email-error', 'Email is required');
  if (!password) return showError('password-error', 'Password is required');

  const btn = form.querySelector('button[type="submit"]');
  setLoading(btn, true);

  try {
    await signInWithEmailAndPassword(auth, email, password);
    showSuccess('Login successful! Loading dashboard…');
    setTimeout(() => window.location.href = '/dashboard', 1000);
  } catch (err) {
    setLoading(btn, false);
    handleAuthError(err);
  }
}

// ─── Forgot Password ──────────────────────────────────────────────────────────
async function handleForgotPassword(event) {
  event.preventDefault();
  const form  = event.target;
  const email = form.querySelector('#email').value.trim();

  clearErrors();
  if (!email) return showError('email-error', 'Please enter your email address');

  const btn = form.querySelector('button[type="submit"]');
  setLoading(btn, true);

  try {
    await sendPasswordResetEmail(auth, email);
    showSuccess('Password reset link sent! Check your inbox.');
    setLoading(btn, false);
  } catch (err) {
    setLoading(btn, false);
    handleAuthError(err);
  }
}

// ─── Logout ───────────────────────────────────────────────────────────────────
async function handleLogout() {
  try {
    await signOut(auth);
    window.location.href = '/';
  } catch (err) {
    console.error('Logout error:', err);
  }
}

// ─── Error Handling ───────────────────────────────────────────────────────────
function handleAuthError(err) {
  const map = {
    'auth/email-already-in-use'   : ['email-error', 'This email is already registered'],
    'auth/invalid-email'          : ['email-error', 'Invalid email address'],
    'auth/user-not-found'         : ['email-error', 'No account found with this email'],
    'auth/wrong-password'         : ['password-error', 'Incorrect password'],
    'auth/invalid-credential'     : ['password-error', 'Invalid email or password'],
    'auth/too-many-requests'      : ['form-error', 'Too many failed attempts. Try again later.'],
    'auth/network-request-failed' : ['form-error', 'Network error. Check your connection.'],
    'auth/weak-password'          : ['password-error', 'Password is too weak (min 6 characters)']
  };

  const [field, message] = map[err.code] || ['form-error', err.message];
  showError(field, message);
}

function showError(elementId, message) {
  const el = document.getElementById(elementId);
  if (el) {
    el.textContent = message;
    el.style.display = 'block';
  }
}

function clearErrors() {
  document.querySelectorAll('.error-msg').forEach(el => {
    el.textContent  = '';
    el.style.display = 'none';
  });
  const toast = document.getElementById('success-toast');
  if (toast) toast.style.display = 'none';
}

function showSuccess(message) {
  const toast = document.getElementById('success-toast');
  if (toast) {
    toast.textContent  = message;
    toast.style.display = 'block';
  }
}

function setLoading(btn, loading) {
  if (!btn) return;
  if (loading) {
    btn.disabled = true;
    btn.dataset.original = btn.textContent;
    btn.innerHTML = '<span class="spinner"></span> Processing…';
  } else {
    btn.disabled  = false;
    btn.textContent = btn.dataset.original || 'Submit';
  }
}

// ─── Expose globally so HTML can call them ────────────────────────────────────
window.handleSignup         = handleSignup;
window.handleLogin          = handleLogin;
window.handleForgotPassword = handleForgotPassword;
window.handleLogout         = handleLogout;

export { auth, handleLogout };
