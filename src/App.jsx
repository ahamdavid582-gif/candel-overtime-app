import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import * as XLSX from 'xlsx';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import { initializeApp } from 'firebase/app';
import { 
  getAuth, 
  signInAnonymously,
  signInWithCustomToken,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
  signOut
} from 'firebase/auth';
import { sendEmailVerification, applyActionCode } from 'firebase/auth';
import { 
  getFirestore, 
  collection, 
  doc, 
  setDoc, 
  addDoc,
  deleteDoc,
  onSnapshot,
  updateDoc,
  query,
  where,
  getDocs,
  getDoc
} from 'firebase/firestore';
import { 
  Users, Calendar, Settings, DollarSign, Download, 
  Trash2, Plus, ChevronLeft, ChevronRight, Menu, X, 
  ChevronDown,
  Lock, Unlock, LogOut, Shield, Printer, Briefcase,
  Eye, EyeOff, Home, User, Moon, Sun, MessageSquare,
  History, ScanLine, FileText, Key, CheckCircle, Clock,
  Gauge, AlertTriangle, Send, CornerDownLeft, Upload,
  Minimize2, Maximize2, LogIn
} from 'lucide-react';
// AgSpreadsheet removed — use a lighter responsive table instead
import ResponsiveMasterTable from './components/ResponsiveMasterTableFixed';
import AdminStaffList from './components/AdminStaffList';
import AdminMobileMasterSheet from './components/AdminMobileMasterSheet';
import ErrorBoundary from './components/ErrorBoundary';

// --- Firebase Config ---
const firebaseConfig = (() => {
  // Prefer Vite env variables (secure, recommended for local dev)
  try {
    const apiKey = import.meta.env.VITE_FIREBASE_API_KEY;
    if (apiKey) {
      return {
        apiKey: apiKey,
        authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
        projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
        storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
        messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
        appId: import.meta.env.VITE_FIREBASE_APP_ID,
      };
    }
  } catch (e) {
    // import.meta may not be defined in some environments; ignore
  }

  // Fallback to inlined __firebase_config (older deployments)
  if (typeof __firebase_config !== 'undefined') {
    try { return JSON.parse(__firebase_config); } catch (e) { console.warn('Invalid __firebase_config', e); }
  }
  return {};
})();

// Use a configurable continue/redirect URL for Firebase action links.
// In production set `VITE_VERIFY_CONTINUE_URL` (e.g. https://app.example.com/verify).
// If the app is packaged (Electron/Capacitor/file://), prefer the hosted firebaseapp URL
// because packaged apps may have `file://` origins which cannot be used as continue URLs.
const DEFAULT_HOSTED_VERIFY = 'https://candel-overtime-app.firebaseapp.com/verify';
// Detect packaged/native runtime so we can choose safer defaults for action links
const IS_PACKAGED = (() => {
  try {
    let isPackaged = false;
    if (typeof window !== 'undefined') {
      const ua = (navigator && navigator.userAgent) ? navigator.userAgent : '';
      if (ua.includes('Electron')) isPackaged = true;
      if (window && window.process && window.process.type) isPackaged = true;
      if (window.location && window.location.protocol === 'file:') isPackaged = true;
      if (window.Capacitor && typeof window.Capacitor.isNativePlatform === 'function') {
        try { if (window.Capacitor.isNativePlatform()) isPackaged = true; } catch(e){}
      }
    }
    return isPackaged;
  } catch (e) { return false; }
})();

const VERIFY_CONTINUE_URL = (() => {
  try {
    const envUrl = import.meta.env.VITE_VERIFY_CONTINUE_URL || import.meta.env.VITE_APP_VERIFY_URL;
    if (envUrl && typeof envUrl === 'string' && envUrl.trim().length > 0) return envUrl;
    if (IS_PACKAGED) return DEFAULT_HOSTED_VERIFY;
    return `${window.location.origin}/verify`;
  } catch (e) {
    return DEFAULT_HOSTED_VERIFY;
  }
})();

// Debug: log selected continue URL in dev for easier troubleshooting
try { if (import.meta && import.meta.env && import.meta.env.DEV) console.debug('[dev] VERIFY_CONTINUE_URL =>', VERIFY_CONTINUE_URL); } catch(e){}

let app = null;
let auth = null;
let db = null;
let firebaseInitError = null;
try {
  app = initializeApp(firebaseConfig);
  auth = getAuth(app);
  db = getFirestore(app);
} catch (e) {
  console.error('Firebase initialization failed', e);
  firebaseInitError = e;
}
const appId = typeof __app_id !== 'undefined' ? __app_id : 'candel-overtime-v7';

// --- Helpers ---
const getDaysInMonth = (year, month) => new Date(year, month + 1, 0).getDate();
const formatDate = (year, month, day) => `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
const getDayShort = (dateStr) => new Date(dateStr).toLocaleDateString('en-US', { weekday: 'short' }); 
const getDayType = (dateStr, holidays = []) => {
  if (holidays.includes(dateStr)) return 'Holiday';
  const day = new Date(dateStr).getDay();
  if (day === 0) return 'Sunday';
  if (day === 6) return 'Saturday';
  return 'Weekday';
};
const formatCurrency = (n) => {
  const num = Number(n) || 0;
  return new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', maximumFractionDigits: 2 }).format(num);
};

// Ordinal suffix for day numbers (1 -> 1st, 2 -> 2nd, 3 -> 3rd, 4 -> 4th, etc.)
const ordinalSuffix = (n) => {
  const s = ["th","st","nd","rd"], v = n % 100;
  return n + (s[(v-20)%10] || s[v] || s[0]);
};

// Centralized helper to determine if an entry is pending.
// This keeps dashboard, sidebar and pending views consistent.
const isPendingEntry = (e) => {
  if (!e) return false;
  return (e.status === 'pending') || (typeof e.status === 'undefined' && e.approved !== true);
};

// --- Toast Component (Light Green Feedback) ---
const Toast = ({ message, type = 'success', onClose }) => {
  useEffect(() => { if (!message) return; const t = setTimeout(onClose, 3000); return () => clearTimeout(t); }, [message, onClose]);
  if (!message) return null;
  const bgColor = type === 'success' ? '#e6fcf5' : '#fefcbf';
  const borderColor = type === 'success' ? '#00cba9' : '#facc15';
  const textColor = type === 'success' ? '#006e5b' : '#a16207';
  const Icon = type === 'success' ? CheckCircle : AlertTriangle;
  return (
    <div className="fixed top-6 left-1/2 transform -translate-x-1/2 z-[100] px-6 py-4 rounded-xl shadow-2xl flex items-center gap-3 animate-fade-in-down"
         style={{ backgroundColor: bgColor, border: `1px solid ${borderColor}`, color: textColor }}>
      <Icon size={20} style={{ color: borderColor }} />
      <span className="font-bold text-sm">{message}</span>
    </div>
  );
};

// --- Logout Modal ---
const Modal = ({ children, title, onCancel, show = false }) => {
  if (!show) return null;
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm animate-fade-in">
      <div className="bg-[#1e1e1e] p-6 rounded-2xl w-full max-w-xs text-white border border-gray-800 animate-fade-in-down">
        <div className="flex justify-between items-center mb-4">
          <h3 className="font-bold text-xl">{title}</h3>
          <button onClick={onCancel} className="text-gray-400 hover:text-white"><X size={20} /></button>
        </div>
        {children}
      </div>
    </div>
  );
};


export default function OvertimeApp(){
  // Logo caching/url state — try to fetch and cache public icon for offline use
  // Default app icon/logo: use the provided Supabase-hosted image and avoid using a stale local cache.
  const defaultRemoteLogo = 'https://ikgxslfmmcgneoivupee.supabase.co/storage/v1/object/public/app-assets/ChatGPT%20Image%20Nov%2028,%202025,%2010_23_53%20AM.png';
  const [logoUrl, setLogoUrl] = useState(defaultRemoteLogo);
  // Initialize circular logo/avatar to the provided Supabase-hosted image so
  // circular holders default to the requested image. Can be overridden by
  // cached/local variants later in the loading flow.
  const [circularLogoUrl, setCircularLogoUrl] = useState('https://ikgxslfmmcgneoivupee.supabase.co/storage/v1/object/public/app-assets/ChatGPT%20Image%20Nov%2028,%202025,%2010_23_53%20AM.png');
  const [brandColor, setBrandColor] = useState('#00cba9');
  // State
  const [currentView, setCurrentView] = useState('loading');
  const [staffSubView, setStaffSubView] = useState('dashboard');
  const [user, setUser] = useState(null);
  const [firebaseError, setFirebaseError] = useState(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [adminPassword, setAdminPassword] = useState('candel2025'); // Default Admin Password
  const [currentStaff, setCurrentStaff] = useState(null);

  // Guarded navigation helper: if a submit/save is actively syncing, block
  // navigation to the 'landing' view and log a stack trace so we can find callers.
  const guardedNavigateToLanding = () => {
    try {
      const recentMs = Date.now() - (lastSubmitAtRef.current || 0);
      const RECENT_WINDOW = 1200; // ms
      if (isSubmittingEntriesRef.current || recentMs <= RECENT_WINDOW) {
        try {
          console.groupCollapsed('[guardedNavigateToLanding] blocked navigation to landing while submitting entries');
          console.debug('currentStaff (id/name):', currentStaff?.id, currentStaff?.name);
          console.debug('isSubmittingEntriesRef.current:', isSubmittingEntriesRef.current);
          console.debug('lastSubmitAt (ms ago):', recentMs);
          console.trace('Trace: navigation to "landing" blocked here');
          console.groupEnd();
        } catch (e) {}

        // Restore staff portal after a tiny delay so the trace above captures the original call stack.
        setTimeout(() => {
          try { guardedSetCurrentView('staff-portal'); } catch (e) {}
          showToast('Continuing on New Overtime Entry — syncing in background', 'success');
        }, 40);
        return;
      }
    } catch (e) {}
    try { guardedSetCurrentView('landing'); } catch (e) {}
  };

  
  
  // Data
  const [staff, setStaff] = useState([]);
  const [entries, setEntries] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [masterSheet, setMasterSheet] = useState(null);
  const [logs, setLogs] = useState([]); // For History
  const [messages, setMessages] = useState([]); // For Complaints/Replies
  const [rates, setRates] = useState({ mode: 'hourly', weekday: 0, saturday: 0, sunday: 0 });
  const [config, setConfig] = useState({ 
    submissionsOpen: true, 
    holidays: [], 
    adminPassword: 'candel2025', 
    formRangeStart: null, 
    formRangeEnd: null 
  });
  // Auto Officer configuration (admin-controlled rules for allowing staff submissions)
  const [autoOfficerConfig, setAutoOfficerConfig] = useState(null);
  
  // UI & Dates
  const [currentDate, setCurrentDate] = useState(new Date()); // For Master Sheet month
  const [toastMsg, setToastMsg] = useState('');
  const [toastType, setToastType] = useState('success');
  const [isBusy, setIsBusy] = useState(false); // global busy/loading indicator
  const [busyMessage, setBusyMessage] = useState('');
  // Count of active saving/submitting operations (used to show a persistent overlay)
  const [submittingEntriesCount, setSubmittingEntriesCount] = useState(0);
  // Busy overlay helpers: supports a dismiss button when operations take too long
  const busyTimerRef = useRef(null);
  const [showBusyDismiss, setShowBusyDismiss] = useState(false);

  // Ref to track when the staff entry save/submit flow is actively syncing
  const isSubmittingEntriesRef = useRef(false);
  // Timestamp of last submit activity — used to extend the guard briefly after save completes
  const lastSubmitAtRef = useRef(0);
  // Remember the view that was active when submitting started so we can restore it
  const priorViewRef = useRef(null);

  // Helpers to manage submitting flag and a visible overlay counter
  const startSubmittingEntries = () => {
    try {
      isSubmittingEntriesRef.current = true;
    } catch (e) {}
    try { setSubmittingEntriesCount(c => c + 1); } catch (e) {}
  };

  // Start submitting and force the UI to the staff portal form so overlay is visible
  const startSubmittingAndForcePortal = () => {
    try { priorViewRef.current = currentView; } catch (e) {}
    try {
      if (import.meta && import.meta.env && import.meta.env.DEV) console.debug('[submit] forcing staff-portal while submitting (priorView)', priorViewRef.current);
    } catch (e) {}
    try { guardedSetCurrentView('staff-portal'); } catch (e) {}
    try { setStaffSubView && setStaffSubView('form-entry'); } catch (e) {}
    startSubmittingEntries();
  };

  // Guarded setter for currentView — prevents leaving the staff form while submitting
  const guardedSetCurrentView = (next) => {
    try {
      // resolve intended value when next is a function
      const intended = (typeof next === 'function') ? next(currentView) : next;
      if ((isSubmittingEntriesRef.current || submittingEntriesCount > 0) && intended !== 'staff-portal') {
        try {
          console.groupCollapsed('[guardedSetCurrentView] blocked view change during submit', { intended, currentView, submittingEntriesCount });
          console.trace('Trace: attempted guardedSetCurrentView while submitting');
          console.groupEnd();
        } catch (e) {}
        // remember intended view and restore after submit
        try { priorViewRef.current = intended; } catch (e) {}
        return;
      }
    } catch (e) {}
    try { setCurrentView(next); } catch (e) { try { setCurrentView(next); } catch (err) {} }
  };

  const endSubmittingEntries = (delay = 700) => {
    try { lastSubmitAtRef.current = Date.now(); } catch (e) {}
    try {
      setTimeout(() => {
        try { isSubmittingEntriesRef.current = false; } catch (e) {}
        try { setSubmittingEntriesCount(c => Math.max(0, c - 1)); } catch (e) {}
        try {
          // restore previous view after submit completes if it was different
          if (priorViewRef.current && priorViewRef.current !== 'staff-portal') {
            try { if (import.meta && import.meta.env && import.meta.env.DEV) console.debug('[submit] restoring prior view', priorViewRef.current); } catch (e) {}
            try { guardedSetCurrentView(priorViewRef.current); } catch (e) {}
          }
          priorViewRef.current = null;
        } catch (e) {}
      }, delay);
    } catch (e) {
      try { isSubmittingEntriesRef.current = false; } catch (e) {}
      try { setSubmittingEntriesCount(c => Math.max(0, c - 1)); } catch (e) {}
    }
  };

  // Ensure the UI stays on the Staff Portal form while any submitting overlay is active.
  useEffect(() => {
    try {
      if (submittingEntriesCount > 0) {
        try { if (import.meta && import.meta.env && import.meta.env.DEV) console.debug('[overlay] enforcing staff-portal while submitting (count)', submittingEntriesCount); } catch (e) {}
        try { guardedSetCurrentView('staff-portal'); } catch (e) {}
        try { setStaffSubView && setStaffSubView('form-entry'); } catch (e) {}
      } else {
        // restore prior view if we saved one and it's different
        try {
          if (priorViewRef.current && priorViewRef.current !== 'staff-portal') {
            try { if (import.meta && import.meta.env && import.meta.env.DEV) console.debug('[overlay] restoring prior view after submit', priorViewRef.current); } catch (e) {}
            try { guardedSetCurrentView(priorViewRef.current); } catch (e) {}
          }
          priorViewRef.current = null;
        } catch (e) {}
      }
    } catch (e) {}
  }, [submittingEntriesCount]);

  // Helper to set busy state with a message. Starts a 30s timer which reveals
  // a dismiss affordance and updates the message if the operation is still running.
  const setBusy = (flag, message = '') => {
    // clear any existing timer first
    try { if (busyTimerRef.current) { clearTimeout(busyTimerRef.current); busyTimerRef.current = null; } } catch (e) {}

    // If flag is false, simply clear state and hide dismiss
    if (!flag) {
      try { setIsBusy(false); } catch (e) {}
      try { setBusyMessage(''); } catch (e) {}
      try { setShowBusyDismiss(false); } catch (e) {}
      return;
    }

    // When enabling busy, set message immediately
    // If the browser is offline, show an offline-specific message
    const isOnline = typeof navigator !== 'undefined' ? navigator.onLine : true;
    if (!isOnline) {
      try { setBusyMessage('Offline — will save locally and sync when online'); } catch (e) {}
    } else {
      try { setBusyMessage(message || 'Working… please wait'); } catch (e) {}
    }
    try { setIsBusy(true); } catch (e) {}
    try { setShowBusyDismiss(false); } catch (e) {}

    // start a timer to reveal the dismiss button and update message if it's taking long
    try {
      busyTimerRef.current = setTimeout(() => {
        try {
          setBusyMessage(prev => (prev ? `${prev} — taking longer than expected` : 'Taking longer than expected'));
          setShowBusyDismiss(true);
          busyTimerRef.current = null;
        } catch (e) { console.error('busy timer update failed', e); }
      }, 30000); // 30 seconds
    } catch (e) { console.error('failed to start busy timer', e); }
  };

  // cleanup timer on unmount
  useEffect(() => {
    return () => { try { if (busyTimerRef.current) clearTimeout(busyTimerRef.current); } catch (e) {} };
  }, []);

  // Prevent accidental navigation to landing while a staff is actively submitting entries.
  // Some auth/library behaviors may trigger a top-level navigation; when we're mid-submit
  // and a staff session is active, revert to staff-portal/form-entry so the user can continue.
  useEffect(() => {
    try {
      if (currentView === 'landing' && isSubmittingEntriesRef.current) {
        // Stronger debugging: include a stack trace and grouped debug info so we can
        // paste the console output to the issue and see the originating call path.
        try {
          console.groupCollapsed('[Navigation Guard] blocked landing navigation while submitting entries');
          console.debug('currentStaff (id/name):', currentStaff?.id, currentStaff?.name);
          console.debug('isSubmittingEntriesRef.current:', isSubmittingEntriesRef.current);
          // Include a trace to help identify the caller
          console.trace('Trace: navigation to "landing" blocked here');
          console.groupEnd();
        } catch (e) {}

        // Restore staff portal and keep the entry form active. Use a tiny timeout to
        // ensure this runs after whatever code attempted the navigation (so the
        // console.trace above shows the original stack in many browsers).
        try {
          setTimeout(() => {
            try { guardedSetCurrentView('staff-portal'); } catch (e) {}
            try { setStaffSubView('form-entry'); } catch (e) {}
            // If currentStaff got nulled unexpectedly, try to restore a minimal session
            // note: we cannot re-create a full auth session here, but logging will show the state.
            showToast('Continuing on New Overtime Entry — syncing in background', 'success');
          }, 40);
        } catch (e) { /* ignore restore errors */ }
      }
    } catch (e) { /* ignore errors here */ }
  }, [currentView, currentStaff]);
  const [adminTab, setAdminTab] = useState('dashboard'); // Changed default from 'dashboard' (MasterSheet) to 'dashboard' (Summary)
  const [editingCell, setEditingCell] = useState(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(window.innerWidth > 1024); // New breakpoint logic
  const [isSidebarHidden, setIsSidebarHidden] = useState(false);
  const [darkMode, setDarkMode] = useState(true); 
  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const [showAdminPwModal, setShowAdminPwModal] = useState(false);

  // Capture global errors so we can show an in-app banner for debugging
  const [lastError, setLastError] = useState(null);
  useEffect(() => {
    const onError = (ev) => {
      try {
        const msg = ev?.message || (ev?.reason && ev.reason.message) || JSON.stringify(ev);
        setLastError(msg);
        console.error('Global error captured', ev);
      } catch (e) { /* ignore */ }
    };
    window.addEventListener('error', onError);
    window.addEventListener('unhandledrejection', onError);
    return () => {
      window.removeEventListener('error', onError);
      window.removeEventListener('unhandledrejection', onError);
    };
  }, [currentStaff, currentView]);
  
  // Initial loading screen effect (UPGRADED: Faster load)
  // Keep a ref to the latest currentStaff so the initial loading timeout can
  // accurately check whether a staff session is active when it fires.
  const currentStaffRef = useRef(currentStaff);
  useEffect(() => { currentStaffRef.current = currentStaff; }, [currentStaff]);

  useEffect(() => {
    const timer = setTimeout(() => {
      // only transition to landing automatically if still showing the initial loading
      // and there is no staff currently active (prevent clobbering portal view)
      guardedSetCurrentView(prev => {
        if (prev === 'loading' && !currentStaffRef.current) return 'landing';
        return prev;
      });
    }, 1800); // UPGRADED: 1.8 seconds delay for faster experience
    return () => clearTimeout(timer);
  }, []);

  // Auth init
  useEffect(() => {
    if (firebaseInitError) { setFirebaseError(firebaseInitError); console.warn('Skipping auth due to firebase init error', firebaseInitError); return; }
    // If the app was opened with an action code (email verification), process it
    const params = new URLSearchParams(window.location.search);
    const mode = params.get('mode');
    const oobCode = params.get('oobCode');
    // If the app was opened on the `/verify` path or with ?mode=verifyEmail, process it
    const pathname = window.location && window.location.pathname ? window.location.pathname.replace(/\/$/, '') : '';
    if ((pathname === '/verify' || mode === 'verifyEmail') && oobCode) {
      // show a verification view and attempt to apply the action code
      guardedSetCurrentView('verify-email');
      (async () => {
        try {
          setBusy(true, 'Verifying email...');
          await applyActionCode(auth, oobCode);
          setBusy(false);
          showToast('Email successfully verified', 'success');
          // remove verification params from URL to prevent re-trigger
          try { window.history.replaceState({}, document.title, window.location.pathname); } catch(e){}
        } catch (err) {
          setBusy(false);
          console.error('Email verification failed', err);
          showToast(err.message || 'Email verification failed', 'warning');
        }
      })();
    }

    const initAuth = async () => {
      try{
        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) await signInWithCustomToken(auth, __initial_auth_token);
        else await signInAnonymously(auth);
      }catch(e){ 
        console.warn('Auth init error', e);
        setFirebaseError(e);
      }
    };
    initAuth();
    const unsub = auth ? auth.onAuthStateChanged(setUser) : () => {};
    return () => { try { if (unsub) unsub(); } catch(e){} };
  }, []);

  // Data sync
  useEffect(() => {
    if (!user) return;
    const path = (c) => collection(db, 'artifacts', appId, 'public', 'data', c);
    const unsubStaff = onSnapshot(path('staff'), s => setStaff(s.docs.map(d => ({id:d.id, ...d.data()}))));
    const unsubEntries = onSnapshot(path('entries'), s => setEntries(s.docs.map(d => ({id:d.id, ...d.data()}))));
    const unsubTasks = onSnapshot(path('tasks'), s => setTasks(s.docs.map(d => ({id:d.id, ...d.data()}))));
    const unsubLogs = onSnapshot(path('logs'), s => setLogs(s.docs.map(d => ({id:d.id, ...d.data()}))));
    const unsubMessages = onSnapshot(path('messages'), s => setMessages(s.docs.map(d => ({id:d.id, ...d.data()}))));
    const unsubRates = onSnapshot(doc(db, 'artifacts', appId, 'public', 'data', 'rates', 'current'), d => { if(d.exists()) setRates(prev => ({...prev, ...d.data()})); });
    const unsubConfig = onSnapshot(doc(db, 'artifacts', appId, 'public', 'data', 'settings', 'config'), async d => { 
      try {
        if(d.exists()) {
          const data = d.data() || {};
          setConfig(data);
          setAdminPassword(data.adminPassword || 'candel2025');
          // If raptorMiniEnabled is missing or not enabled, enable it for all clients
          if (typeof data.raptorMiniEnabled === 'undefined' || data.raptorMiniEnabled !== true) {
            try {
              await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'settings', 'config'), { raptorMiniEnabled: true }, { merge: true });
              // update local config to reflect change immediately
              setConfig(prev => ({ ...(prev||{}), raptorMiniEnabled: true }));
              try { showToast && showToast('Raptor Mini (Preview) enabled for clients', 'success'); } catch(e){}
            } catch (e) { console.warn('Failed to enable raptorMiniEnabled', e); }
          }
        } else { 
          // create default config with raptorMiniEnabled enabled
          await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'settings', 'config'), { 
            submissionsOpen:true, holidays:[], adminPassword: 'candel2025', formRangeStart: null, formRangeEnd: null, raptorMiniEnabled: true
          }); 
        }
      } catch(e) { console.warn('config snapshot handler error', e); }
    });
    const unsubMaster = onSnapshot(doc(db, 'artifacts', appId, 'public', 'data', 'master_sheet', 'current'), d => {
      if (d.exists()) setMasterSheet(d.data().sheet || null);
      else setMasterSheet(null);
    });
    const unsubAuto = onSnapshot(doc(db, 'artifacts', appId, 'public', 'data', 'settings', 'auto_officer'), d => {
      try {
        if (d.exists()) setAutoOfficerConfig(d.data() || null);
        else setAutoOfficerConfig(null);
      } catch (e) { console.warn('auto_officer snapshot failed', e); }
    });
    
    return () => { unsubStaff(); unsubEntries(); unsubTasks(); unsubRates(); unsubConfig(); unsubLogs(); unsubMessages(); unsubMaster(); try { unsubAuto(); } catch(e){} };
  }, [user]);

  // --- TEMPORARY CLEANUP SCRIPT: DELETE THIS AFTER RUNNING ONCE ---
  useEffect(() => {
    const deleteDecemberData = async () => {
      try {
        if (!entries || entries.length === 0) return;
        const decEntries = entries.filter(e => e && e.date && e.date.includes('-12-'));
        if (decEntries.length > 0) {
          console.log(`Found ${decEntries.length} December entries. Deleting...`);
          const batchPromises = decEntries.map(async (entry) => {
            try {
              const docId = entry.id || `${entry.staffId}_${entry.date}`;
              await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'entries', docId));
              console.log(`Deleted: ${docId}`);
            } catch (e) {
              console.error('Failed to delete', entry, e);
            }
          });
          await Promise.all(batchPromises);
          console.log('December cleanup complete.');
          try { showToast('All December data deleted from Firebase', 'success'); } catch (e) {}
        } else {
          console.log('No December entries found.');
        }
      } catch (e) {
        console.error('December cleanup failed', e);
      }
    };

    const t = setTimeout(deleteDecemberData, 2000);
    return () => clearTimeout(t);
  }, [entries]); // Run when entries load
  // ----------------------------------------------------------------

  // Attempt to prefetch and cache the app logo (fallback to localStorage if available)
  useEffect(() => {
    let mounted = true;
    const tryLoad = async () => {
      try {
        // If the app already uses a remote logo (the requested image), skip local overrides
        if (logoUrl && !logoUrl.startsWith('/icons/')) {
          // Ensure local cache is cleared and store the remote URL as the known logo
          try { localStorage.removeItem('candel_logo_b64'); localStorage.setItem('candel_logo_b64', defaultRemoteLogo); } catch(e){}
          return;
        }

        // Prefer fetch from public folder only when we're still using the default local path
        const resp = await fetch('/icons/icon.webp');
        if (!mounted) return;
        if (resp.ok) {
          const blob = await resp.blob();
          if (blob.size > 0) {
            const url = URL.createObjectURL(blob);
            // Only set local blob if we don't already have a remote logo
            if (!logoUrl || logoUrl.startsWith('/icons/')) setLogoUrl(url);
            try {
              const reader = new FileReader();
              reader.onload = () => { try { localStorage.setItem('candel_logo_b64', reader.result); } catch(e){} };
              reader.readAsDataURL(blob);
            } catch(e){}
            // try to fetch precomputed brand color
            try {
              const colorResp = await fetch('/icons/brand-color.json');
              if (colorResp.ok) {
                const j = await colorResp.json();
                if (j?.color) setBrandColor(j.color);
              }
            } catch(e){}

            // circular variant
            try {
              const resp3 = await fetch('/icons/icon3.jpg');
              if (resp3.ok) {
                const blob3 = await resp3.blob();
                if (blob3.size > 0) {
                  const url3 = URL.createObjectURL(blob3);
                  // only set circular if not already overridden
                  if (!circularLogoUrl || circularLogoUrl.startsWith('/icons/')) setCircularLogoUrl(url3);
                  try {
                    const img = new Image();
                    img.crossOrigin = 'anonymous';
                    img.src = url3;
                    img.onload = () => {
                      try {
                        const canvas = document.createElement('canvas');
                        const size = 24;
                        canvas.width = size; canvas.height = size;
                        const ctx = canvas.getContext('2d');
                        ctx.drawImage(img, 0, 0, size, size);
                        const data = ctx.getImageData(0,0,size,size).data;
                        let r=0,g=0,b=0,count=0;
                        for (let i=0;i<data.length;i+=4) {
                          const alpha = data[i+3];
                          if (alpha < 16) continue;
                          const rr = data[i], gg = data[i+1], bb = data[i+2];
                          if (rr>240 && gg>240 && bb>240) continue;
                          r += rr; g += gg; b += bb; count++;
                        }
                        if (count > 0) {
                          r = Math.round(r/count); g = Math.round(g/count); b = Math.round(b/count);
                          const hex = '#'+[r,g,b].map(v => v.toString(16).padStart(2,'0')).join('');
                          setBrandColor(hex);
                          try { localStorage.setItem('candel_brand_color', hex); } catch(e){}
                        }
                      } catch(e) { console.warn('color sample failed', e); }
                    };
                  } catch(e){}
                }
              }
            } catch(e){}
            return;
          }
        }
      } catch (e) {
        // ignore and fallback to stored
      }
      // if we reach here, ensure remote logo is remembered and local cache cleared
      try { localStorage.removeItem('candel_logo_b64'); localStorage.setItem('candel_logo_b64', defaultRemoteLogo); } catch(e){}
      try { const bc = localStorage.getItem('candel_brand_color'); if (bc) setBrandColor(bc); } catch(e){}
    };
    tryLoad();
    return () => { mounted = false; };
  }, []);

  // Helper to normalize/validate external URLs. If the URL is malformed,
  // try to encode it; otherwise return as-is. This avoids broken image src
  // values for slightly malformed public URLs.
  const normalizeUrl = (u) => {
    if (!u) return u;
    try { new URL(u); return u; } catch (e) {
      try { return encodeURI(u); } catch (e2) { return u; }
    }
  };

  const showToast = (m, type = 'success') => {
    setToastMsg(m);
    setToastType(type);
  };

  // Debug logging to help trace blank page issues during development (DEV-only)
  useEffect(() => {
    try {
      if (import.meta && import.meta.env && import.meta.env.DEV) {
        console.debug('OVERTIME APP STATE', { currentView, isAdmin, currentStaff, user, config });
      }
    } catch (e) { /* ignore in prod-like envs */ }
  }, [currentView, isAdmin, currentStaff, user, config]);

  // Helper to log actions
  const logAction = async (staffId, action, details = '') => {
    try {
      await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'logs'), {
        staffId,
        action,
        details,
        timestamp: new Date().toISOString()
      });
    } catch(e) { console.error("Logging failed", e); }
  };

    // Save master sheet JSON to Firestore
    const saveMasterSheet = async (payload) => {
      try {
        // write to a document id under master_sheet (document path must have even number of segments)
        await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'master_sheet', 'current'), { sheet: payload, updatedAt: new Date().toISOString() }, { merge: true });
        showToast('Master sheet saved', 'success');
        await logAction('system', 'Master Sheet Saved');
      } catch (e) {
        console.error('Save master sheet failed', e);
        showToast(`Save failed: ${e.message}`, 'warning');
      }
    };

  // Actions
  const handleAdminLogin = (e) => {
    e.preventDefault();
    const email = (e.target.email && e.target.email.value) ? e.target.email.value.trim() : '';
    const password = e.target.password && e.target.password.value ? e.target.password.value : '';

    // If an email is provided and Firebase Auth is initialized, try Email/Password sign-in
    if (email && auth && !firebaseInitError) {
      setBusy(true, 'Signing in...');
      signInWithEmailAndPassword(auth, email, password)
        .then(async (res) => {
            // Require email verification before granting admin access
          if (!res.user.emailVerified) {
            try {
              const actionCodeSettings = { url: VERIFY_CONTINUE_URL, handleCodeInApp: !IS_PACKAGED };
              if (import.meta && import.meta.env && import.meta.env.DEV) console.debug('[dev] sendEmailVerification actionCodeSettings.url', actionCodeSettings.url);
              await sendEmailVerification(res.user, actionCodeSettings);
            } catch (sendErr) { console.warn('Resend verification failed', sendErr); }
            try { await signOut(auth); } catch(e){ console.warn('Sign-out failed', e); }
            setBusy(false);
            showToast('Email not verified. Verification email sent — check your inbox.', 'warning');
            guardedSetCurrentView('verify-email');
            return;
          }
          // Verified: allow admin access
          setBusy(false);
          setIsAdmin(true);
          guardedSetCurrentView('admin-dashboard');
          if (window.innerWidth < 1024) setIsSidebarOpen(false);
          showToast('Admin Signed in', 'success');
        })
        .catch(err => {
          setBusy(false);
          console.warn('Email sign-in failed', err);
          showToast(err.message || 'Sign-in failed', 'warning');
        });
      return;
    }

    // Fallback: legacy password-only admin flow
    if (password === adminPassword) {
      setIsAdmin(true);
      guardedSetCurrentView('admin-dashboard');
      if (window.innerWidth < 1024) setIsSidebarOpen(false); // Use 1024 for md/lg break point
      showToast('Admin Logged in Successfully', 'success');
    } else showToast('Invalid Admin Password', 'warning');
  };

  // Create a new admin user via Firebase Email/Password
  const handleAdminSignup = async (e) => {
    e.preventDefault();
    const email = (e.target.email && e.target.email.value) ? e.target.email.value.trim() : '';
    const password = e.target.password && e.target.password.value ? e.target.password.value : '';
    const confirm = e.target.confirm && e.target.confirm.value ? e.target.confirm.value : '';
    const adminKey = e.target.adminKey && e.target.adminKey.value ? e.target.adminKey.value.trim() : '';
    if (!auth || firebaseInitError) {
      showToast('Authentication not configured', 'warning');
      return;
    }
    if (!email || !password) { showToast('Email and password required', 'warning'); return; }
    if (password !== confirm) { showToast('Passwords do not match', 'warning'); return; }
    // Require a valid admin key to allow signup (simple protection until auth backend is configured)
    if (adminKey !== 'candel2025') { showToast('Invalid Admin Key', 'warning'); return; }
    try {
      setBusy(true, 'Creating account...');
      const res = await createUserWithEmailAndPassword(auth, email, password);
      // send verification email
        try {
        const actionCodeSettings = {
          // After email verification the user will be redirected back to the app
          // Use a friendly branded path so emails land on a branded page
          url: VERIFY_CONTINUE_URL,
          handleCodeInApp: !IS_PACKAGED
        };
        if (import.meta && import.meta.env && import.meta.env.DEV) console.debug('[dev] sendEmailVerification actionCodeSettings.url (signup)', actionCodeSettings.url);
        await sendEmailVerification(res.user, actionCodeSettings);
        showToast('Account created — verification email sent', 'success');
      } catch (sendErr) {
        console.warn('sendEmailVerification failed', sendErr);
        showToast('Account created but verification email failed to send', 'warning');
      }
      // SIGN OUT the newly created user so they cannot be treated as signed-in until they verify
      try { await signOut(auth); } catch(e) { console.warn('Sign-out after signup failed', e); }
      setBusy(false);
      // Do NOT set isAdmin or navigate to admin dashboard until user verifies their email
      guardedSetCurrentView('verify-email');
    } catch (err) {
      setBusy(false);
      console.error('Signup failed', err);
      showToast(err.message || 'Sign-up failed', 'warning');
    }
  };

  // Password reset handler
  const handlePasswordReset = async (e) => {
    e.preventDefault();
    const email = (e.target.email && e.target.email.value) ? e.target.email.value.trim() : '';
    if (!auth || firebaseInitError) { showToast('Authentication not configured', 'warning'); return; }
    if (!email) { showToast('Please enter an email', 'warning'); return; }
    try {
      setBusy(true, 'Requesting password reset...');
      await sendPasswordResetEmail(auth, email);
      setBusy(false);
      showToast('Password reset email sent', 'success');
      guardedSetCurrentView('admin-login');
    } catch (err) {
      setBusy(false);
      console.error('Password reset failed', err);
      showToast(err.message || 'Password reset failed', 'warning');
    }
  };

  const handleAdminSignOut = async () => {
    try {
      if (auth) await signOut(auth);
    } catch (e) { console.warn('Sign out failed', e); }
    setIsAdmin(false);
    setUser(null);
    guardedNavigateToLanding();
  };

  // update a single entry (staffId + date)
  const updateEntry = async (staffId, dateKey, hours) => {
    try {
      const id = `${staffId}_${dateKey}`;
      const payload = { staffId, date: dateKey, hours, editedAt: new Date().toISOString() };
      if (Number(hours) === 0) {
        // mark as disapproved and notify staff
        payload.status = 'disapproved';
        payload.disapprovedAt = new Date().toISOString();
        payload.disapprovedBy = user?.uid || 'admin';
        await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'entries', id), payload, { merge: true });
        showToast('Overtime disapproved', 'warning');
        await logAction(staffId, 'Entry Disapproved', `Date: ${dateKey}`);
        // create a message for the staff so they see the notification in their portal
        try {
          await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'messages'), {
            staffId,
            staffName: (staff.find(s => s.id === staffId) || {}).name || staffId,
            message: `Your overtime for ${dateKey} was disapproved by admin. You may resubmit using the entry form.`,
            submittedAt: new Date().toISOString(),
            autoGenerated: true
          });
        } catch (e) { console.warn('Failed to create notification message', e); }
      } else {
        await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'entries', id), payload, { merge: true });
        showToast('Entry saved', 'success');
        await logAction('system', 'Entry Updated', `ID: ${id}`);
      }
    } catch (e) {
      console.error('updateEntry failed', e);
      showToast(`Update failed: ${e.message}`, 'warning');
    }
  };

  const deleteEntry = async (staffId, dateKey) => {
    try {
      const id = `${staffId}_${dateKey}`;
      await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'entries', id));
      showToast('Entry deleted', 'success');
      await logAction('system', 'Entry Deleted', `ID: ${id}`);
    } catch (e) {
      console.error('deleteEntry failed', e);
      showToast(`Delete failed: ${e.message}`, 'warning');
    }
  };

  // Approve a pending entry (admin action)
  const approveEntry = async (staffId, dateKey) => {
    try {
      const id = `${staffId}_${dateKey}`;
      await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'entries', id), { status: 'approved', approvedAt: new Date().toISOString(), approvedBy: user?.uid || 'admin' });
      showToast('Entry approved', 'success');
      // Optimistically update local entries so Pending list refreshes immediately
      setEntries(prev => prev.map(en => (en.staffId === staffId && en.date === dateKey) ? ({ ...en, status: 'approved', approvedAt: new Date().toISOString(), approvedBy: user?.uid || 'admin' }) : en));
      await logAction('system', 'Entry Approved', `ID: ${id}`);
    } catch (e) {
      console.error('approveEntry failed', e);
      showToast(`Approval failed: ${e.message}`, 'warning');
    }
  };

  const rejectEntry = async (staffId, dateKey) => {
    try {
      const id = `${staffId}_${dateKey}`;
      await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'entries', id), { status: 'rejected', rejectedAt: new Date().toISOString(), rejectedBy: user?.uid || 'admin' });
      showToast('Entry rejected', 'success');
      // Optimistically update local entries so Pending list refreshes immediately
      setEntries(prev => prev.map(en => (en.staffId === staffId && en.date === dateKey) ? ({ ...en, status: 'rejected', rejectedAt: new Date().toISOString(), rejectedBy: user?.uid || 'admin' }) : en));
      await logAction('system', 'Entry Rejected', `ID: ${id}`);
    } catch (e) {
      console.error('rejectEntry failed', e);
      showToast(`Reject failed: ${e.message}`, 'warning');
    }
  };

  const handleStaffLogin = async (e) => {
    e.preventDefault();
    const identifier = (e.target.staffIdOrName?.value || '').trim();
    const idLower = identifier.toLowerCase();
    const s = staff.find(x => ((x.id !== undefined) && String(x.id).toLowerCase() === idLower) || (x.name && x.name.toLowerCase() === idLower));
    if (s && s.password === e.target.password.value){ 
      setCurrentStaff(s); 
      guardedSetCurrentView('staff-portal'); 
      logAction(s.id, 'Login', 'User logged into portal');
      showToast(`Welcome back, ${s.name.split(' ')[0]}`, 'success');
    } else showToast('Invalid Credentials', 'warning');
  };

  // Calculate Earnings Memo
  const calculateTotalEarnings = useCallback((sId) => {
    let total = 0;
    const rateWd = Number(rates.weekday) || 0;
    const rateSat = Number(rates.saturday) || 0;
    const rateSun = Number(rates.sunday) || 0;
    // Only approved entries should count towards earnings
    const relevantEntries = entries.filter(e => e.staffId === sId && e.status === 'approved');

    relevantEntries.forEach(e => {
      const type = getDayType(e.date, config.holidays || []);
      const hours = Number(e.hours) || 0;
      const val = rates.mode === 'daily' ? (hours > 0 ? 1 : 0) : hours;

      if (type === 'Weekday') total += (val * rateWd);
      else if (type === 'Saturday') total += (val * rateSat);
      else total += (val * rateSun);
    });
    return total;
  }, [entries, config.holidays, rates]);

  // --- Views ---

  const LoadingView = () => (
    // UPGRADED: Redesigned Loading View with pulsing logo and faster spinner
    <div className="h-screen w-full flex flex-col items-center justify-center p-4 font-sans bg-slate-900 text-white">
      <div className="relative z-10 w-full max-w-md mx-auto text-center animate-fade-in">
        
        {/* Pulsing Logo */}
        <div 
          className="w-24 h-24 sm:w-32 sm:h-32 rounded-full overflow-hidden flex items-center justify-center mx-auto mb-8 animate-pulse-beat cursor-pointer" 
          style={{ backgroundColor: brandColor }}
          onClick={() => guardedNavigateToLanding()}
        >
          <img
            src={normalizeUrl(circularLogoUrl) || logoUrl}
            alt="Candel"
            crossOrigin="anonymous"
            onError={(e) => { try { e.currentTarget.onerror = null; e.currentTarget.src = logoUrl; } catch (ex) {} }}
            className="w-full h-full object-cover p-2 app-avatar-xl"
            style={{ background: 'transparent' }}
          />
        </div>
        
        <h1 className="text-4xl md:text-6xl font-extrabold text-white mb-2">THE CANDEL FZE</h1>
        <p className="text-slate-400 text-lg tracking-wide mb-8">Overtime Management System</p>
        
        <div className="flex items-center justify-center gap-4">
          <div className="animate-spin rounded-full h-6 w-6 border-2 border-gray-500" style={{ borderTopColor: brandColor }} />
          <div className="text-white/80 text-sm md:text-base">Initializing application...</div>
        </div>

      </div>
    </div>
  );

  // Show global errors in-app for easier debugging (Admin view will surface this)
  const ErrorBanner = () => {
    if (!lastError) return null;
    return (
      <div className="fixed top-16 left-1/2 -translate-x-1/2 z-[200] bg-red-50 border border-red-200 rounded px-4 py-2 shadow text-red-800">
        <strong>Error:</strong>
        <div className="text-sm mt-1">{String(lastError)}</div>
      </div>
    );
  };

  const LandingView = () => (
    // Reduced sizes and responsive spacing so landing fits on mobile
    <div className="min-h-screen relative bg-slate-900 flex flex-col items-center justify-center p-4 font-sans">
      <div className="login-bg" aria-hidden>
        <div className="slide" style={{ backgroundImage: `url('https://ikgxslfmmcgneoivupee.supabase.co/storage/v1/object/public/app-assets/staffimage.jpg')` }} />
        <div className="slide" style={{ backgroundImage: `url('https://ikgxslfmmcgneoivupee.supabase.co/storage/v1/object/public/app-assets/ChatGPT%20Image%20Nov%2028,%202025,%2010_23_53%20AM.png')` }} />
        <div className="overlay" />
      </div>

      <div className="login-foreground w-full flex flex-col items-center justify-center">
        <div className="text-center mb-8 animate-fade-in-down">
          <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-full overflow-hidden mx-auto mb-4 border-2 border-white/10 shadow-lg" style={{backgroundColor: brandColor}}>
            <img
              src={normalizeUrl(circularLogoUrl) || logoUrl}
              alt="App"
              crossOrigin="anonymous"
              onError={(e) => { try { e.currentTarget.onerror = null; e.currentTarget.src = logoUrl; } catch (ex) {} }}
              className="w-full h-full object-cover"
              style={{background: 'transparent'}}
            />
          </div>
          <h1 className="text-3xl sm:text-4xl md:text-5xl font-extrabold text-white mb-2">THE CANDEL FZE</h1>
          <p className="text-slate-400 text-base sm:text-lg tracking-wide">Staff Overtime Management System</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 w-full max-w-3xl px-2">
          {/* UPGRADED: Smaller cards for mobile */}
          <button onClick={() => guardedSetCurrentView('staff-login')} className="group relative overflow-hidden bg-white p-6 sm:p-8 rounded-2xl shadow-lg transition hover:scale-[1.02] active:scale-[0.98] animate-fade-zoom-in delay-0 text-left">
            <Users size={40} className="text-blue-600 mb-4 relative z-10" />
            <h2 className="text-2xl font-bold text-slate-800 mb-1">Staff Portal</h2>
            <p className="text-slate-500 text-sm">Log in to submit your weekly entries.</p>
          </button>
          {/* UPGRADED: Smaller cards for mobile */}
          <button onClick={() => guardedSetCurrentView('admin-login')} className="group relative overflow-hidden bg-emerald-600 p-6 sm:p-8 rounded-2xl shadow-lg transition hover:scale-[1.02] active:scale-[0.98] border border-emerald-500 animate-fade-zoom-in delay-150 text-left">
            <Shield size={40} className="text-emerald-100 mb-4 relative z-10" />
            <h2 className="text-2xl font-bold text-white mb-1">Admin Dashboard</h2>
            <p className="text-emerald-100 text-sm">Manage sheets, rates, and approval.</p>
          </button>
        </div>
      </div>
      <div className="powered-by absolute bottom-3 left-3 z-30 text-xs text-white/80">Powered by RoiIndustries © 2025</div>
    </div>
  );

  // --- STAFF PORTAL ---
  // Lifted subView/state is passed from the parent App to avoid resetting on re-render
  const StaffPortal = ({ setBusy, subView, setSubView, autoOfficerConfig }) => {
    // Guarded setter: prevent leaving the 'form-entry' while entries are actively submitting
    const guardedSetSubView = (next) => {
      try {
        if (isSubmittingEntriesRef.current && subView === 'form-entry' && next !== 'form-entry') {
          try { showToast('Sync in progress — staying on New Overtime Entry', 'warning'); } catch (e) {}
          try { console.debug('[guardedSetSubView] blocked navigation to', next); } catch (e) {}
          return;
        }
      } catch (e) {}
      setSubView(next);
    };
    const [hideBalance, setHideBalance] = useState(false);
    // Store last-captured staff location for Auto Officer checks
    const [staffLocation, setStaffLocation] = useState(null);
    
    const totalEarnings = calculateTotalEarnings(currentStaff.id);
    const myEntries = entries.filter(e => e.staffId === currentStaff.id);
    const myMessages = messages.filter(m => m.staffId === currentStaff.id).sort((a,b) => new Date(b.submittedAt) - new Date(a.submittedAt));


    // --- Fixed Header ---
    const StaffHeader = () => {
      const today = new Date();
      const dateStr = today.toLocaleDateString('en-GB', { weekday: 'long', month: 'long', day: 'numeric' });
      // Only include approved overtime details in the master sheet and charts
      const approvedEntries = (entries || []).filter(e => e && (e.status === 'approved' || e.approved === true));

      return (
        <div className="fixed top-0 left-0 right-0 z-20 bg-[#121212] shadow-xl text-white p-4 pt-8 border-b border-gray-800 animate-fade-in-down">
          <div className="flex justify-between items-center max-w-lg mx-auto">
             <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full flex items-center justify-center border border-gray-700 overflow-hidden cursor-pointer" style={{backgroundColor: brandColor}} onClick={() => guardedNavigateToLanding()}>
                  <img
                    src={normalizeUrl(circularLogoUrl) || logoUrl}
                    alt="Candel"
                    crossOrigin="anonymous"
                    onError={(e) => { try { e.currentTarget.onerror = null; e.currentTarget.src = logoUrl; } catch (ex) {} }}
                    className="w-full h-full object-cover p-1 app-avatar"
                    style={{background: 'transparent'}}
                  />
                </div>
                <div>
                  <h2 className="font-bold text-xl leading-tight">Hi, {currentStaff.name.split(' ')[0]}</h2>
                  <p className="text-gray-400 text-xs">{dateStr}</p>
                </div>
             </div>
             <div className="flex gap-4 text-gray-400">
               {/* Could add a notification/settings icon here if needed */}
             </div>
          </div>
          {/* Fixed Earnings Bar (Green Bar) - UPGRADED: Applied animate-fade-zoom-in with staggered delay */}
          <div className="max-w-lg mx-auto mt-2 bg-[#00cba9] rounded-xl p-4 text-black relative overflow-hidden shadow-lg shadow-emerald-900/20 active:scale-[0.99] transition animate-fade-zoom-in delay-150">
             <div className="mb-1">
                 <span className="text-xs font-bold uppercase tracking-wide opacity-80">Overtime Earnings</span>
             </div>
             <div className="flex items-center justify-between mt-1">
                <div className="text-4xl font-extrabold tracking-tight">
                    {hideBalance ? '₦ •••••••' : formatCurrency(totalEarnings)}
                </div>
                <button onClick={() => setHideBalance(!hideBalance)} className="opacity-70 hover:opacity-100 transition p-2 rounded-full bg-black/10">
                   {hideBalance ? <EyeOff size={20}/> : <Eye size={20}/>}
                </button>
             </div>
             <div className="mt-2 text-[10px] font-medium opacity-70">
                Current total earnings based on submitted logs.
             </div>
          </div>
        </div>
      );
    };


    // --- Fixed Bottom Navigation ---
    const StaffFooter = () => (
      <div className={`fixed bottom-0 left-0 right-0 max-w-lg mx-auto ${darkMode ? 'bg-[#121212] border-gray-800' : 'bg-white border-gray-200'} border-t flex justify-around py-3 z-40 pb-5 shadow-2xl`}>
         <button onClick={() => guardedSetSubView('dashboard')} className={`flex flex-col items-center gap-1 transition ${subView === 'dashboard' ? 'text-[#00cba9]' : 'text-gray-500 hover:text-white'}`}>
            <Home size={24} strokeWidth={subView === 'dashboard' ? 3 : 2}/>
            <span className="text-[10px] font-bold">Home</span>
         </button>
         <button onClick={() => { setDarkMode(!darkMode); showToast(`Switched to ${!darkMode ? 'Dark' : 'Light'} Mode`, 'success'); }} className="flex flex-col items-center gap-1 text-gray-500 hover:text-white transition">
            {darkMode ? <Sun size={24}/> : <Moon size={24}/>}
            <span className="text-[10px] font-bold">Theme</span>
         </button>
         <button onClick={() => setShowLogoutModal(true)} className="flex flex-col items-center gap-1 text-gray-500 hover:text-red-500 transition">
            <LogOut size={24}/>
            <span className="text-[10px] font-bold">Logout</span>
         </button>
      </div>
    );

    // --- Grid Menu for Mobile/Dashboard View ---
    const GridMenu = () => {
      const items = [
        { id: 'form-entry', label: 'Form Entry', icon: Plus, color: 'text-blue-500', bg: 'bg-blue-500/10' },
        { id: 'personal', label: 'Personal Info', icon: User, color: 'text-yellow-500', bg: 'bg-yellow-500/10' },
        { id: 'complaint', label: 'Enquiries', icon: MessageSquare, color: 'text-red-500', bg: 'bg-red-500/10' },
        { id: 'history', label: 'Activity History', icon: History, color: 'text-green-500', bg: 'bg-green-500/10' },
      ];
      
      // UPGRADED: Staggered delays for slide-up animation
      const delays = ['delay-slide-0', 'delay-slide-100', 'delay-slide-200', 'delay-slide-300'];

      // Request location before navigating to the Forms (Form Entry) view so the browser prompts for permission.
      const handleFormsClick = () => {
        if (!('geolocation' in navigator)) {
          try { showToast('Geolocation not supported on this device', 'warning'); } catch (e) {}
          return;
        }
        // Ask for current position and navigate only on success
        try {
          navigator.geolocation.getCurrentPosition((position) => {
            try {
              setStaffLocation({ lat: position.coords.latitude, lng: position.coords.longitude });
            } catch (e) {}
            try { guardedSetSubView('form-entry'); } catch (e) { setSubView('form-entry'); }
          }, (error) => {
            try { console.error('Location error', error); } catch (e) {}
            if (error && error.code === 1) {
              try { alert('🚫 Access Denied: You must ALLOW location access to use Forms. This is required to verify your assigned post.'); } catch (e) { showToast('Location permission denied', 'warning'); }
            } else if (error && error.code === 2) {
              try { alert('⚠️ Location Unavailable: Please turn on your device\'s GPS/Location services.'); } catch (e) { showToast('Location unavailable', 'warning'); }
            } else {
              try { alert('⚠️ Error fetching location. Please try again.'); } catch (e) { showToast('Error fetching location', 'warning'); }
            }
          }, { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 });
        } catch (e) {
          try { console.error('geolocation request failed', e); } catch (ex) {}
          try { showToast('Failed to request location permission', 'warning'); } catch (ee) {}
        }
      };

      return (
        <div className="mx-4 mt-8 pb-32">
          <h3 className="text-white text-sm font-bold mb-4">Services</h3>
          <div className="grid grid-cols-2 gap-4">
             {items.map((item, index) => (
               <button 
                 key={item.id} 
                 onClick={() => {
                   if (item.id === 'form-entry') return handleFormsClick();
                   return guardedSetSubView(item.id);
                 }} 
                 // UPGRADED: Apply staggered slide-up animation
                 className={`bg-[#1e1e1e] rounded-2xl p-4 flex flex-col items-center gap-3 border border-gray-800 active:scale-95 transition hover:border-[#00cba9]/50 animate-slide-in-up ${delays[index]}`}
               >
                  <div className={`w-12 h-12 rounded-full ${item.bg} flex items-center justify-center ${item.color}`}>
                     <item.icon size={24} />
                  </div>
                  <span className="text-gray-300 text-sm font-medium">{item.label}</span>
               </button>
             ))}
          </div>
        </div>
      );
    };

    // 1. Form (Entry)
    const EntryForm = () => {
      // Create options for hours worked (1 to 12)
      const hoursOptions = useMemo(() => Array.from({ length: 12 }, (_, i) => i + 1), []);

      // Prefer the date value from the form (if present) when deciding default hours.
      // Fall back to the local current date (not UTC) to avoid timezone shifts making
      // a weekday look like a previous/next day in UTC.
      const formRef = useRef(null);
      const todayLocal = (() => {
        try {
          const d = new Date();
          const y = d.getFullYear();
          const m = String(d.getMonth() + 1).padStart(2, '0');
          const dd = String(d.getDate()).padStart(2, '0');
          return `${y}-${m}-${dd}`;
        } catch (e) { return new Date().toISOString().substring(0, 10); }
      })();

      // Controlled date so we can compute the correct default hours when the user
      // selects a date (or when the browser pre-fills the date input).
      const [selectedDate, setSelectedDate] = useState(todayLocal);

      // Compute default hours from the selected date.
      const computedDayType = getDayType(selectedDate, config.holidays);
      const computedDefaultHours = (computedDayType === 'Saturday' || computedDayType === 'Sunday') ? 8 : 11;

      // Keep the hours select controlled so it updates when selectedDate changes.
      const [hoursValue, setHoursValue] = useState(computedDefaultHours);
      useEffect(() => {
        try { setHoursValue(computedDefaultHours); } catch (e) {}
      }, [computedDefaultHours]);

      const [savedList, setSavedList] = useState([]); // { date, hours, taskId }
      const [checked, setChecked] = useState({}); // map date -> bool
      const [saveError, setSaveError] = useState('');

      // Location permission state for mobile devices (used to prompt user)
      const [locationPermission, setLocationPermission] = useState('unknown'); // 'unknown' | 'granted' | 'denied'
      const isMobile = typeof navigator !== 'undefined' && /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

      useEffect(() => {
        try {
          if (navigator && navigator.permissions && navigator.permissions.query) {
            navigator.permissions.query({ name: 'geolocation' }).then(s => {
              if (s.state === 'granted') setLocationPermission('granted');
              else if (s.state === 'denied') setLocationPermission('denied');
              else setLocationPermission('unknown');
              s.onchange = () => {
                if (s.state === 'granted') setLocationPermission('granted');
                else if (s.state === 'denied') setLocationPermission('denied');
                else setLocationPermission('unknown');
              };
            }).catch(() => {});
          }
        } catch (e) {}
      }, []);

      const requestLocationPermission = async () => {
        try {
          await getCurrentPositionPromise({ enableHighAccuracy: true, timeout: 10000 });
          setLocationPermission('granted');
          showToast('Location access granted', 'success');
        } catch (e) {
          setLocationPermission('denied');
          showToast('Location access denied or timed out', 'warning');
        }
      };

      const isDateValid = (dateStr) => {
        // Disallow future dates and also respect configured form range if present
        try {
          if (!dateStr) return false;
          // Prevent future dates (todayLocal is YYYY-MM-DD)
          if (dateStr > todayLocal) return false;
          if (!config.formRangeStart || !config.formRangeEnd) return true;
          return dateStr >= config.formRangeStart && dateStr <= config.formRangeEnd;
        } catch (e) { return false; }
      };

      const hasApprovedEntry = (dateStr) => {
        return entries.some(e => e.staffId === currentStaff.id && e.date === dateStr && e.status === 'approved');
      };

      // Persist saved list per staff in Firestore so items are available across devices.
      // We keep a localStorage fallback but Firestore is primary source.
      const storageKey = `candel_saved_${currentStaff?.id || 'anon'}`;

      // Subscribe to per-item saved_entries/{staffId}/items collection
      useEffect(() => {
        if (!currentStaff || !db) return;
        const itemsCol = collection(db, 'artifacts', appId, 'public', 'data', 'saved_entries', currentStaff.id, 'items');

        // If anonymous local saved items exist, migrate them as individual docs
        try {
          const anonKey = `candel_saved_anon`;
          const anonRaw = localStorage.getItem(anonKey);
          if (anonRaw) {
            try {
              const anonList = JSON.parse(anonRaw || '[]');
              if (Array.isArray(anonList) && anonList.length > 0) {
                (async () => {
                  try {
                    // show a busy indicator while migrating
                    try { if (setBusy) setBusy(true, 'Migrating saved items...'); } catch(e){}
                    for (const a of anonList) {
                      const dRef = doc(db, 'artifacts', appId, 'public', 'data', 'saved_entries', currentStaff.id, 'items', a.date);
                      await setDoc(dRef, { staffId: currentStaff.id, date: a.date, hours: Number(a.hours)||0, taskId: a.taskId||'', validForSubmit: !!a.validForSubmit, savedAt: new Date().toISOString(), status: 'saved' }, { merge: true });
                    }
                    try { if (import.meta && import.meta.env && import.meta.env.DEV) console.debug('Migrated anon saved items into items subcollection for', currentStaff.id, 'count', anonList.length); } catch(e){}
                    try { localStorage.removeItem(anonKey); } catch(e){}
                  } catch(e) { console.error('Migration into items subcollection failed', e); }
                  finally { try { if (setBusy) setBusy(false, ''); } catch(e){} }
                })();
              }
            } catch(e) { /* ignore parse errors */ }
          }
        } catch(e) { /* ignore */ }

        const unsub = onSnapshot(itemsCol, snap => {
          try {
            const list = snap.docs.map(d => ({ ...(d.data() || {}), _id: d.id }));
            setSavedList(list);
            try { localStorage.setItem(storageKey, JSON.stringify(list)); } catch(e){}
            try { if (import.meta && import.meta.env && import.meta.env.DEV) console.debug('saved_entries items snapshot for', currentStaff.id, 'count', list.length); } catch(e){}
          } catch(e) { console.error('saved_entries items snapshot handler failed', e); }
        }, err => { console.error('saved_entries items onSnapshot error', err); });
        return () => unsub();
      }, [currentStaff?.id, db]);

      // Keep localStorage in sync as a quick fallback
      useEffect(() => {
        try { localStorage.setItem(storageKey, JSON.stringify(savedList)); } catch(e){}
      }, [storageKey, savedList]);

      const addToSavedList = async (date, hours, taskId) => {
        setSaveError('');
        // Ensure Auto Officer checks are current and block save when denied
        try {
          const allowed = await evaluateAutoOfficer();
          if (!allowed) { const msg = autoOfficerDeniedReason || 'Not allowed by Auto Officer'; setSaveError(msg); showToast(msg, 'warning'); return; }
        } catch (e) { /* evaluation failed; proceed with existing behavior */ }
        if (!date) { setSaveError('Please choose a date'); showToast('Please choose a date', 'warning'); return; }
        // Block future dates
        if (date > todayLocal) { const msg = 'Future dates are not allowed'; setSaveError(msg); showToast(msg, 'warning'); return; }
        if (hasApprovedEntry(date)) { const msg = 'This date has an approved entry and cannot be re-entered.'; setSaveError(msg); showToast(msg, 'warning'); return; }

        // Allow saving even if outside allowed submission window, but mark item as invalidForSubmit
        const valid = isDateValid(date);
        const item = { date, hours: Number(hours), taskId: taskId || '', validForSubmit: valid };

        // Use functional update to avoid stale closures
        let next;
        setSavedList(prev => {
          if (prev.some(s => s.date === date)) {
            const msg = 'This date is already in your saved list';
            setSaveError(msg); showToast(msg, 'warning');
            return prev;
          }
          next = [item, ...prev];
          try { localStorage.setItem(storageKey, JSON.stringify(next)); } catch (e) {}
          try { if (import.meta && import.meta.env && import.meta.env.DEV) console.debug('Saved overtime item (local)', item, 'storageKey', storageKey, 'newCount', next.length); } catch(e){}
          return next;
        });

        // auto-check newly saved item for convenience
        setChecked(prev => ({ ...prev, [date]: true }));

        // attempt to persist to Firestore as a per-item document and notify user
        // mark submitting so navigation guards can prevent leaving the form
        try {
          startSubmittingAndForcePortal();
          if (currentStaff && db) {
            const itemDocRef = doc(db, 'artifacts', appId, 'public', 'data', 'saved_entries', currentStaff.id, 'items', date);
            const payload = { staffId: currentStaff.id, date, hours: Number(hours)||0, taskId: taskId||'', validForSubmit: valid, savedAt: new Date().toISOString(), status: 'saved' };
            await setDoc(itemDocRef, payload, { merge: true });
            try { if (import.meta && import.meta.env && import.meta.env.DEV) console.debug('Persisted saved item to Firestore items subcollection for', currentStaff.id, date); } catch(e){}
            if (!valid) {
              const msg = 'Saved and synced. Note: this date is outside the allowed submission window.';
              setSaveError(msg);
              showToast(msg, 'warning');
            } else {
              showToast('Saved and synced to server', 'success');
            }
            // Ensure the user remains on the New Overtime Entry page so they can add another entry
            try { guardedSetSubView('form-entry'); } catch (e) {}
          } else {
            // no currentStaff or db yet, just inform user saved locally
            const msg = 'Saved locally (offline). Will sync when online or after login.';
            showToast(msg, 'warning');
            // Ensure we stay on the form for convenience
            try { guardedSetSubView('form-entry'); } catch (e) {}
          }
        } catch (e) {
          console.error('failed to persist saved entry to Firestore items subcollection', e);
          showToast('Saved locally but failed to sync to server', 'warning');
          // Stay on form even if sync failed
          try { guardedSetSubView('form-entry'); } catch (e) {}
        } finally {
          try { endSubmittingEntries(); } catch (e) {}
        }
      };

      const removeSaved = (date) => {
        // Prevent removal if there is an approved entry for this date
        const existingEntry = entries.find(e => e.staffId === currentStaff?.id && e.date === date);
        if (existingEntry && existingEntry.status === 'approved') {
          showToast('Cannot remove an approved entry', 'warning');
          return;
        }

        // Also check savedList item's own status (if approved, block removal)
        const savedItem = savedList.find(s => s.date === date || s._id === date);
        if (savedItem && savedItem.status === 'approved') {
          showToast('Cannot remove an approved saved overtime', 'warning');
          return;
        }

        setSavedList(prev => {
          const next = prev.filter(s => s.date !== date && s._id !== date);
          try { localStorage.setItem(storageKey, JSON.stringify(next)); } catch(e){}
          return next;
        });
        setChecked(prev => { const { [date]: _, ...rest } = prev; return rest; });

        // delete Firestore per-item doc if present
        (async () => {
          try {
            if (currentStaff && db) {
              await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'saved_entries', currentStaff.id, 'items', date));
              try { if (import.meta && import.meta.env && import.meta.env.DEV) console.debug('Deleted saved item doc for', currentStaff.id, date); } catch(e){}
            }
          } catch(e){ console.error('failed to remove saved entry in Firestore items subcollection', e); }
        })();
      };

      const toggleCheck = (date) => setChecked(prev => ({ ...prev, [date]: !prev[date] }));

      

      const submitSelected = async () => {
        if (setBusy) setBusy(true, 'Submitting — do not refresh');
        startSubmittingAndForcePortal();
        // Re-check Auto Officer before submitting
        try {
          const allowed = await evaluateAutoOfficer();
          if (!allowed) { showToast(autoOfficerDeniedReason || 'Auto Officer prevented submission', 'warning'); return; }
        } catch (e) { /* ignore */ }
        const toSubmitAll = savedList.filter(s => checked[s.date]);
        // Exclude future dates and inform the user
        const futureSelected = toSubmitAll.filter(s => s.date > todayLocal);
        if (futureSelected.length > 0) {
          try { showToast('Some selected dates are in the future and were excluded', 'warning'); } catch (e) {}
        }
        const filteredToSubmitAll = toSubmitAll.filter(s => s.date <= todayLocal);
        const toSubmit = filteredToSubmitAll.filter(s => s.validForSubmit && !entries.some(e => e.staffId === currentStaff.id && e.date === s.date && e.status === 'approved'));
        if (filteredToSubmitAll.length === 0) return showToast('Select at least one saved entry to submit', 'warning');
        if (toSubmit.length === 0) return showToast('Selected entries cannot be submitted (out of range/future or already approved).', 'warning');

        try {
          const ops = toSubmit.map(async s => {
            const id = `${currentStaff.id}_${s.date}`;
            const payload = {
              staffId: currentStaff.id,
              date: s.date,
              hours: Number(s.hours) || 0,
              taskId: s.taskId || '',
              submittedAt: new Date().toISOString(),
              status: 'pending'
            };
            await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'entries', id), payload, { merge: true });
            // optimistic local update
            setEntries(prev => {
              const exists = prev.some(en => en.staffId === currentStaff.id && en.date === s.date);
              if (exists) return prev.map(en => (en.staffId === currentStaff.id && en.date === s.date) ? ({ ...en, ...payload }) : en);
              return [{ id, ...payload }, ...prev];
            });
            await logAction(currentStaff.id, 'Entry Submitted (bulk)', `${s.hours} hrs for ${s.date}`);
          });
          await Promise.all(ops);
            // mark submitted items as pending in saved_items (keep them in the list)
            try {
              if (currentStaff && db) {
                for (const s of toSubmit) {
                  const savedDocRef = doc(db, 'artifacts', appId, 'public', 'data', 'saved_entries', currentStaff.id, 'items', s.date);
                  await setDoc(savedDocRef, { status: 'pending', submittedAt: new Date().toISOString() }, { merge: true });
                }
              }
            } catch (e) { console.error('failed to update saved item docs after submit', e); }
            // keep savedList entries; onSnapshot will update their status. Locally remove only those that were both submitted and not validForSubmit (shouldn't happen)
            setSavedList(prev => prev.map(si => ({ ...si })));
          setChecked({});
          showToast('Selected entries submitted (pending approval)', 'success');
          // Keep the user on the New Overtime Entry view after submit so they can continue adding entries
          try { guardedSetSubView('form-entry'); } catch (e) {}
        } catch (e) {
          console.error('Bulk submit failed', e);
          showToast(`Submit failed: ${e.message}`, 'warning');
        } finally {
          if (setBusy) setBusy(false, '');
          try { endSubmittingEntries(); } catch (e) { try { isSubmittingEntriesRef.current = false; } catch (e) {} }
        }
      };

      // Auto Officer enforcement: ensure staff is within allowed date/time/location
      const [isAllowedToSubmit, setIsAllowedToSubmit] = useState(true);
      const [autoOfficerDeniedReason, setAutoOfficerDeniedReason] = useState('');

      const getCurrentPositionPromise = (opts = { enableHighAccuracy: false, timeout: 7000 }) => new Promise((resolve, reject) => {
        if (!navigator || !navigator.geolocation) return reject(new Error('Geolocation not available'));
        let called = false;
        const onSuccess = (pos) => { if (called) return; called = true; resolve(pos); };
        const onError = (err) => { if (called) return; called = true; reject(err); };
        navigator.geolocation.getCurrentPosition(onSuccess, onError, opts);
        // fallback timeout
        setTimeout(() => { if (!called) { called = true; reject(new Error('Geolocation timeout')); } }, opts.timeout + 200);
      });

      const evaluateAutoOfficer = React.useCallback(async () => {
        try {
          const cfg = autoOfficerConfig;
          if (!cfg || !cfg.enabled) { setIsAllowedToSubmit(true); setAutoOfficerDeniedReason(''); return; }

          // Date range check
          const now = new Date();
          const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
          let startDate = null; let endDate = null;
          if (cfg.preset === 'today') {
            startDate = today; endDate = today;
          } else if (cfg.preset === 'lastN') {
            const n = Number(cfg.nDays) || 1;
            startDate = new Date(today);
            startDate.setDate(startDate.getDate() - (n - 1));
            endDate = today;
          }
          if (startDate && endDate) {
            const sel = new Date(selectedDate + 'T00:00:00');
            if (sel < startDate || sel > endDate) { setIsAllowedToSubmit(false); setAutoOfficerDeniedReason('Date not allowed by Auto Officer'); return false; }
          }

          // Time window check (if configured)
          if (cfg.timeStart && cfg.timeEnd) {
            const nowMinutes = now.getHours() * 60 + now.getMinutes();
            const [sh, sm] = (cfg.timeStart || '00:00').split(':').map(Number);
            const [eh, em] = (cfg.timeEnd || '23:59').split(':').map(Number);
            const startM = sh * 60 + (sm || 0); const endM = eh * 60 + (em || 0);
            // handle overnight ranges
            const inWindow = startM <= endM ? (nowMinutes >= startM && nowMinutes <= endM) : (nowMinutes >= startM || nowMinutes <= endM);
            if (!inWindow) { setIsAllowedToSubmit(false); setAutoOfficerDeniedReason('Outside allowed time range'); return false; }
          }

          // Location check (if configured)
          if (cfg.locationMode === 'radius' && cfg.center && typeof cfg.radiusMeters === 'number') {
            try {
              const pos = await getCurrentPositionPromise({ enableHighAccuracy: true, timeout: 7000 });
              const lat1 = pos.coords.latitude; const lon1 = pos.coords.longitude;
              const lat2 = Number(cfg.center.lat); const lon2 = Number(cfg.center.lng);
              // haversine
              const toRad = (v) => v * Math.PI / 180;
              const R = 6371000;
              const dLat = toRad(lat2 - lat1); const dLon = toRad(lon2 - lon1);
              const a = Math.sin(dLat/2) * Math.sin(dLat/2) + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon/2) * Math.sin(dLon/2);
              const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
              const dist = R * c;
              if (dist > Number(cfg.radiusMeters || 0)) { setIsAllowedToSubmit(false); setAutoOfficerDeniedReason('Not within allowed location'); return false; }
            } catch (e) { setIsAllowedToSubmit(false); setAutoOfficerDeniedReason('Location unavailable (permission denied or timeout)'); return; }
          }

          // If we got here, all checks passed
          setIsAllowedToSubmit(true); setAutoOfficerDeniedReason('');
          return true;
        } catch (e) { setIsAllowedToSubmit(true); setAutoOfficerDeniedReason(''); }
        return true;
      }, [autoOfficerConfig, selectedDate]);

      useEffect(() => { evaluateAutoOfficer(); const t = setInterval(() => evaluateAutoOfficer(), 15000); return () => clearInterval(t); }, [evaluateAutoOfficer]);

      return (
        // Adjusted top padding so form sits directly under the fixed earnings/header
        <div className="p-4 pt-20 text-white pb-24 animate-fade-in max-w-lg mx-auto">
            {/* saving overlay moved to top-level so it's not hidden by portal stacking contexts */}
            <div className="flex items-center gap-2 mb-6">
              <button type="button" onClick={() => guardedSetSubView('dashboard')}><ChevronLeft className="text-[#00cba9]"/></button>
              <h2 className="text-xl font-bold">New Overtime Entry</h2>
            </div>
           {!config.submissionsOpen ? (
             <div className="bg-red-500/10 text-red-500 p-4 rounded-xl text-center border border-red-500/20"><Lock className="mx-auto mb-2"/>Submissions are currently closed.</div>
           ) : (
             <div className="space-y-4">
                <div className="relative">
                {isMobile && locationPermission !== 'granted' && (
                  <div className="mb-4 p-3 bg-[#0f1720] rounded-xl border border-gray-700 text-sm">
                    <div className="font-semibold text-white mb-1">Enable Location Access</div>
                    <div className="text-gray-300 mb-3">Allow the app to use your device location so Auto Officer can verify your presence in the allowed area. Tap Enable when ready.</div>
                    <div className="flex gap-2">
                      <button onClick={requestLocationPermission} className="px-4 py-2 bg-[#00cba9] text-black rounded-xl">Enable Location</button>
                      <button onClick={() => setLocationPermission('denied')} className="px-4 py-2 bg-gray-700 text-white rounded-xl">Not now</button>
                    </div>
                  </div>
                )}
                <form ref={formRef} onSubmit={(e) => { e.preventDefault();
                  const fd = new FormData(e.target);
                  const hrs = fd.get('hours');
                  const date = fd.get('date');
                  const task = fd.get('task');
                  try { if (import.meta && import.meta.env && import.meta.env.DEV) console.debug('Form submit values', { date, hrs, task }); } catch(e){}
                  addToSavedList(date, hrs, task);
                  e.target.reset();
                }} className="space-y-4">
                  <div>
                    <label className="text-xs text-gray-400 block mb-2 uppercase font-bold">Date</label>
                    <input name="date" value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)} type="date" max={todayLocal} className="w-full bg-[#1e1e1e] border-none rounded-xl p-4 text-white focus:ring-1 focus:ring-[#00cba9]" required/>
                    {config.formRangeStart && config.formRangeEnd && (
                       <p className="text-xs text-gray-500 mt-1">Allowed range: {config.formRangeStart} to {config.formRangeEnd}</p>
                    )}
                  </div>
                  <div>
                    <label className="text-xs text-gray-400 block mb-2 uppercase font-bold">Hours Worked (1 - 12)</label>
                      <select name="hours" value={hoursValue} onChange={(e)=>setHoursValue(e.target.value)} className="w-full bg-[#1e1e1e] border-none rounded-xl p-4 text-white font-mono text-lg focus:ring-1 focus:ring-[#00cba9]" required>
                        {hoursOptions.map(h => <option key={h} value={h}>{h}</option>)}
                      </select>
                  </div>
                  <div>
                    <label className="text-xs text-gray-400 block mb-2 uppercase font-bold">Task (Optional)</label>
                    <select name="task" className="w-full bg-[#1e1e1e] border-none rounded-xl p-4 text-white focus:ring-1 focus:ring-[#00cba9]">
                       <option value="">Select Task...</option>
                       {tasks.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                    </select>
                  </div>
                    <div className="flex gap-2">
                    <button type="submit" disabled={!currentStaff || !isAllowedToSubmit} title={!isAllowedToSubmit ? autoOfficerDeniedReason || 'Not allowed by Auto Officer' : ''} className={`flex-1 w-full bg-[#00cba9] text-black font-bold py-3 rounded-xl shadow-lg shadow-[#00cba9]/20 hover:bg-[#00e0b7] active:scale-[0.98] transition ${(!currentStaff || !isAllowedToSubmit) ? 'opacity-50 cursor-not-allowed' : ''}`}>Save To List</button>
                    <button type="button" onClick={() => { setSavedList([]); setChecked({}); }} className="px-4 py-3 rounded-xl bg-gray-700 text-white">Clear</button>
                  </div>
                  {saveError && <div className="text-sm text-yellow-300 mt-2">{saveError}</div>}
                </form>
                {!isAllowedToSubmit && (
                  <div className="absolute inset-0 bg-black/70 rounded-xl flex flex-col items-center justify-center p-6 z-10">
                    <div className="text-white font-bold text-lg mb-2">Access Restricted</div>
                    <div className="text-sm text-gray-200 mb-4 text-center">You cannot add overtime entries right now. {autoOfficerDeniedReason ? `Reason: ${autoOfficerDeniedReason}` : ''}</div>
                    <div className="flex gap-2">
                      <button onClick={() => evaluateAutoOfficer()} className="px-3 py-2 rounded bg-[#06b6d4] text-black font-semibold">Re-check Now</button>
                      <button onClick={() => showToast('Contact admin to update Auto Officer rules', 'warning')} className="px-3 py-2 rounded bg-gray-700 text-white">Contact Admin</button>
                    </div>
                  </div>
                )}
                </div>

                {/* Saved list with checkboxes */}
                <div className="space-y-3">
                    <div className="flex items-center justify-between">
                    <h3 className="font-semibold">Saved Overtime ({savedList.length})</h3>
                    <div className="flex items-center gap-2">
                      <button type="button" onClick={submitSelected} disabled={!isAllowedToSubmit} title={!isAllowedToSubmit ? autoOfficerDeniedReason || 'Not allowed by Auto Officer' : ''} className={`bg-amber-400 text-black font-bold px-3 py-1 rounded ${!isAllowedToSubmit ? 'opacity-50 cursor-not-allowed' : ''}`}>Submit Selected</button>
                    </div>
                  </div>
                  <div className="space-y-2">
                    {savedList.length === 0 && <div className="text-sm text-gray-400">No saved overtime entries yet. Use the form above to add.</div>}
                    {/* Debug info removed: production UI should not show raw storage keys or JSON */}
                    {savedList.map(item => {
                        // determine status: check entries first (authoritative), then saved item status
                        const existing = entries.find(e => e.staffId === currentStaff.id && e.date === item.date);
                        const itemStatus = (typeof item.status !== 'undefined') ? item.status : undefined;
                        const status = existing?.status || itemStatus || 'saved';
                        // use semantic classes so we can style them in CSS with duller tones
                        const bgClass = status === 'approved' ? 'saved-approved' : (status === 'pending' ? 'saved-pending' : 'saved-default');
                        // determine if checkbox should be enabled (only when still 'saved' and valid)
                        const canSubmit = item.validForSubmit && status === 'saved';
                        const removable = status !== 'approved';
                        const titleTextClass = (status === 'approved' || status === 'pending') ? 'text-black' : 'text-white';
                        const detailTextClass = status === 'saved' ? 'text-gray-300' : 'text-black';
                        return (
                          <div key={item.date} className={`flex items-center justify-between p-3 rounded-lg border ${bgClass}`}>
                            <label className="flex items-center gap-3 w-full">
                              <input type="checkbox" checked={!!checked[item.date]} onChange={() => toggleCheck(item.date)} className="w-4 h-4" disabled={!canSubmit} />
                              <div className="flex-1">
                                <div className={`font-semibold text-sm ${titleTextClass}`}>{item.date} — {item.hours} hr(s) {item.taskId ? `• ${tasks.find(t=>t.id===item.taskId)?.shortName || tasks.find(t=>t.id===item.taskId)?.name}` : ''}</div>
                                <div className={`text-xs mt-1 ${detailTextClass}`}>
                                  {status === 'saved' ? (item.validForSubmit ? 'Not submitted' : 'Saved (out of allowed range)') : (status === 'pending' ? 'Submitted — pending approval' : 'Approved')}
                                </div>
                              </div>
                            </label>
                            <div className="ml-3 flex flex-col items-end gap-2">
                              <button type="button" onClick={() => removable ? removeSaved(item.date) : showToast('Cannot remove an approved saved overtime', 'warning')} className="text-sm text-red-400" disabled={!removable}>{removable ? 'Remove' : 'Approved'}</button>
                            </div>
                          </div>
                        );
                    })}
                  </div>
                </div>
             </div>
           )}
        </div>
      );
    };
    
    // 2. Personal Info & Password
    const PersonalInfoView = () => {
        const [showPw, setShowPw] = useState(false);
        const [errorMsg, setErrorMsg] = useState('');

        const handlePasswordChange = async (e) => {
            e.preventDefault();
            setErrorMsg('');
            const oldPw = e.target.oldPw.value;
            const newPw = e.target.newPw.value;

            if (oldPw !== currentStaff.password) {
                setErrorMsg('Error: Old password does not match.');
                showToast('Old password incorrect', 'warning');
                return;
            }

            await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'staff', currentStaff.id), { password: newPw });
            await logAction(currentStaff.id, 'Password Changed');
            setCurrentStaff({...currentStaff, password: newPw});
            showToast('Password Changed Successfully', 'success');
            guardedSetSubView('dashboard');
        };

        return (
            <div className="p-4 pt-6 text-white pb-24 animate-fade-in max-w-lg mx-auto">
                 <div className="flex items-center gap-2 mb-6">
                    <button onClick={() => guardedSetSubView('dashboard')}><ChevronLeft className="text-[#00cba9]"/></button>
                    <h2 className="text-xl font-bold">Personal Info & Security</h2>
                 </div>
                 
                 {/* Personal Info */}
                 <div className="bg-[#1e1e1e] p-5 rounded-2xl border border-gray-800 mb-6 shadow-lg">
                    <h3 className="text-lg font-bold mb-3 flex items-center gap-2 text-[#00cba9]"><User size={18}/> Details</h3>
                    {[
                      { label: 'Full Name', value: currentStaff.name },
                      { label: 'Staff ID', value: currentStaff.id },
                      { label: 'Job Role', value: currentStaff.role },
                      { label: 'Last Login (Approx)', value: new Date().toLocaleTimeString() }
                    ].map((item, i) => (
                      <div key={i} className="flex justify-between items-center py-2 border-b border-gray-700 last:border-b-0">
                          <span className="text-sm text-gray-400">{item.label}</span>
                          <span className="font-semibold text-white">{item.value}</span>
                      </div>
                    ))}
                 </div>

                 {/* Password Change */}
                 <div className="bg-[#1e1e1e] p-5 rounded-2xl border border-gray-800 shadow-lg">
                    <h3 className="text-lg font-bold mb-4 flex items-center gap-2 text-red-400"><Key size={18}/> Change Password</h3>
                    <form onSubmit={handlePasswordChange} className="space-y-4">
                        <div className="relative">
                            <label className="text-xs text-gray-400 block mb-2 uppercase font-bold">Old Password</label>
                            <input name="oldPw" type={showPw ? "text" : "password"} className="w-full bg-[#2a2a2a] border-none rounded-xl p-4 text-white focus:ring-1 focus:ring-red-500" required/>
                        </div>
                        <div className="relative">
                            <label className="text-xs text-gray-400 block mb-2 uppercase font-bold">New Password</label>
                            <input name="newPw" type={showPw ? "text" : "password"} className="w-full bg-[#2a2a2a] border-none rounded-xl p-4 text-white focus:ring-1 focus:ring-[#00cba9]" required/>
                            <button type="button" onClick={() => setShowPw(!showPw)} className="absolute right-4 top-1/2 mt-0.5 transform -translate-y-1/2 text-gray-400 hover:text-white p-1">
                                {showPw ? <EyeOff size={20}/> : <Eye size={20}/>}
                            </button>
                        </div>
                        {errorMsg && <p className="text-red-400 text-sm">{errorMsg}</p>}
                        <button className="w-full bg-red-600 text-white font-bold py-4 rounded-xl hover:bg-red-700 active:scale-[0.98] transition">Update Password</button>
                    </form>
                 </div>
            </div>
        );
    };

    // 3. Complaints/Messages
    const ComplaintsView = () => {
        const [messageText, setMessageText] = useState('');
      const [sending, setSending] = useState(false);
        
        const handleSubmit = async (e) => {
            e.preventDefault();
            if (!messageText.trim()) return;
          setSending(true);
          try {
          const messageData = {
                staffId: currentStaff.id,
                staffName: currentStaff.name,
                message: messageText.trim(),
                submittedAt: new Date().toISOString(),
                status: 'pending',
                reply: null
            };
          await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'messages'), messageData);
          await logAction(currentStaff.id, 'Enquiry Submitted');
          showToast('Enquiry Sent to Admin', 'success');
          setMessageText('');
          } catch (e) {
            console.error('Failed to send enquiry', e);
            showToast('Failed to send enquiry', 'warning');
          } finally { setSending(false); }
        };
        
        return (
            <div className="p-4 pt-6 text-white pb-24 animate-fade-in max-w-lg mx-auto">
                 <div className="flex items-center gap-2 mb-6">
                    <button onClick={() => guardedSetSubView('dashboard')}><ChevronLeft className="text-[#00cba9]"/></button>
                    <h2 className="text-xl font-bold">Admin Enquiries</h2>
                 </div>

                 {/* New Enquiry Form */}
                 <div className="bg-[#1e1e1e] p-5 rounded-2xl border border-gray-800 mb-6 shadow-lg">
                    <h3 className="text-lg font-bold mb-4 flex items-center gap-2 text-blue-400"><Send size={18}/> New Enquiry</h3>
                    <form onSubmit={handleSubmit} className="space-y-4">
                        <textarea 
                            value={messageText} 
                            onChange={(e) => setMessageText(e.target.value)} 
                            rows="4" 
                            className="w-full bg-[#2a2a2a] border-none rounded-xl p-4 text-white focus:ring-1 focus:ring-blue-500" 
                            placeholder="Type your question, complaint, or feedback here..."
                            required
                        />
                        <button 
                            type="submit" 
                            disabled={!messageText.trim()}
                            className="w-full bg-blue-600 text-white font-bold py-3 rounded-xl hover:bg-blue-700 disabled:opacity-50 transition"
                        >
                            Send Message
                        </button>
                    </form>
                 </div>
                 
                 {/* History */}
                 <div className="bg-[#1e1e1e] p-5 rounded-2xl border border-gray-800 shadow-lg">
                     <h3 className="text-lg font-bold mb-4 flex items-center gap-2 text-[#00cba9]"><MessageSquare size={18}/> My Messages ({myMessages.length})</h3>
                     <div className="space-y-4">
                         {myMessages.length === 0 && <p className="text-gray-500 text-center py-4">No messages yet.</p>}
                         {myMessages.map(m => (
                            <div key={m.id} className="p-3 rounded-lg border border-gray-700 bg-[#2a2a2a]">
                                <p className="text-sm text-gray-400 flex justify-between">
                                    <span>{new Date(m.submittedAt).toLocaleDateString()}</span>
                                    <span className={`font-bold uppercase text-xs px-2 py-0.5 rounded-full ${m.reply ? 'bg-green-500/20 text-green-400' : 'bg-yellow-500/20 text-yellow-400'}`}>
                                        {m.reply ? 'Replied' : 'Pending'}
                                    </span>
                                </p>
                                <p className="mt-2 text-gray-200 font-medium">{m.message}</p>
                                {m.reply && (
                                    <div className="mt-3 p-3 bg-gray-700 rounded-lg text-sm border-l-4 border-green-500">
                                        <p className="font-bold text-green-400 mb-1">Admin Reply:</p>
                                        <p className="text-gray-200">{m.reply}</p>
                                    </div>
                                )}
                                <div className="mt-3 flex items-center gap-2">
                                  <button onClick={async () => {
                                      if (!window.confirm('Delete this message?')) return;
                                      try {
                                        await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'messages', m.id));
                                        showToast('Message deleted', 'success');
                                        await logAction(currentStaff.id, 'Message Deleted', `Message ID: ${m.id}`);
                                      } catch (e) {
                                        console.error('Failed to delete message', e);
                                        showToast('Failed to delete message', 'warning');
                                      }
                                  }} className="text-sm text-red-400">Delete</button>
                                </div>
                            </div>
                         ))}
                     </div>
                 </div>
            </div>
        );
    };


    // 4. Activity History
    const ActivityHistory = () => {
        const myLogs = logs.filter(l => l.staffId === currentStaff.id);
        const timeline = [...myEntries, ...myLogs].sort((a,b) => new Date(b.timestamp || b.submittedAt) - new Date(a.timestamp || a.submittedAt)).slice(0,20);

        const getIconAndColor = (item) => {
            if (item.action) { // It's a log
                switch(item.action.split(' ')[0]) {
                    case 'Entry': return { icon: Clock, color: 'text-blue-400', bg: 'bg-blue-400/10' };
                    case 'Password': return { icon: Key, color: 'text-red-400', bg: 'bg-red-400/10' };
                    case 'Login': return { icon: LogIn, color: 'text-green-400', bg: 'bg-green-400/10' };
                    case 'Enquiry': return { icon: MessageSquare, color: 'text-purple-400', bg: 'bg-purple-400/10' };
                    default: return { icon: History, color: 'text-gray-400', bg: 'bg-gray-400/10' };
                }
            } else { // It's an entry
                return { icon: Calendar, color: 'text-[#00cba9]', bg: 'bg-[#00cba9]/10' };
            }
        };

        return (
            <div className="p-4 pt-6 text-white pb-24 animate-fade-in max-w-lg mx-auto">
                 <div className="flex items-center gap-2 mb-6">
                    <button onClick={() => guardedSetSubView('dashboard')}><ChevronLeft className="text-[#00cba9]"/></button>
                    <h2 className="text-xl font-bold">My Activity Timeline</h2>
                 </div>
                 
                 <div className="space-y-6">
                    {timeline.map((item, index) => {
                        const { icon: Icon, color, bg } = getIconAndColor(item);
                        const date = new Date(item.timestamp || item.submittedAt);
                        const dateStr = date.toLocaleDateString('en-GB', { year: 'numeric', month: 'short', day: 'numeric' });
                        const timeStr = date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
                        
                        let title, details = null;
                        
                        if (item.action) { // Log
                            title = item.action;
                            details = item.details;
                        } else { // Entry
                            title = `Overtime Entry: ${item.hours} hours`;
                            details = `Date: ${item.date} | Task: ${tasks.find(t => t.id === item.taskId)?.name || 'N/A'}`;
                        }
                        
                        return (
                             <div key={index} className="flex gap-4">
                                 <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${bg} ${color} shadow-lg`}>
                                     <Icon size={16}/>
                                 </div>
                                 <div className="flex-1 border-l border-gray-700 pl-4 pb-4">
                                     <p className="font-bold text-gray-200">{title}</p>
                                     <p className="text-sm text-gray-400 mt-1">{details}</p>
                                     <p className="text-xs text-gray-500 mt-1">{dateStr} at {timeStr}</p>
                                 </div>
                             </div>
                        );
                    })}
                    {timeline.length === 0 && <p className="text-gray-500 text-center py-8">No activity recorded yet.</p>}
                 </div>
            </div>
        );
    };

    const renderStaffView = () => {
      switch (subView) {
        case 'form-entry': return <EntryForm />;
        case 'personal': return <PersonalInfoView />;
        case 'complaint': return <ComplaintsView />;
        case 'history': return <ActivityHistory />;
        case 'dashboard':
        default: return <GridMenu />;
      }
    };

    return (
      <div className={`min-h-screen ${darkMode ? 'bg-slate-900 text-white' : 'bg-gray-100 text-gray-900'}`}>
        <StaffHeader />
        {/* FIX: min-h-[calc(100vh-16rem)] clears the fixed header/earnings bar and footer */}
        {/* Increased top padding to avoid content being cut under the green earnings bar on mobile */}
        {/* Raised from pt-44 to pt-56 so all top sections (forms, enquiries, personal info, history) are visible */}
        <div className="min-h-[calc(100vh-16rem)] pt-56 pb-24"> 
          {renderStaffView()}
        </div>
        <StaffFooter />
        <Toast message={toastMsg} type={toastType} onClose={() => setToastMsg('')} />
        <Modal title="Confirm Logout" show={showLogoutModal} onCancel={() => setShowLogoutModal(false)}>
            <p className="text-gray-300 mb-6">Are you sure you want to log out of the Staff Portal?</p>
            <div className="flex justify-end gap-3">
                <button onClick={() => setShowLogoutModal(false)} className="px-4 py-2 rounded-lg text-white font-medium hover:bg-gray-700 transition">Cancel</button>
                <button onClick={() => { setCurrentStaff(null); guardedNavigateToLanding(); setShowLogoutModal(false); }} className="px-4 py-2 rounded-lg bg-red-600 text-white font-bold hover:bg-red-700 transition">Logout</button>
            </div>
        </Modal>
      </div>
    );
  };

  // --- ADMIN DASHBOARD ---
  const AdminDashboard = () => {

    // Responsive flag for mobile master-sheet view (reactive to resize)
    const [isMobileMasterView, setIsMobileMasterView] = useState(typeof window !== 'undefined' ? window.innerWidth < 768 : false);
    useEffect(() => {
      const onResize = () => {
        try { setIsMobileMasterView(window.innerWidth < 768); } catch (e) {}
      };
      window.addEventListener('resize', onResize);
      return () => window.removeEventListener('resize', onResize);
    }, []);

    // Desktop-only: keep CSS --sidebar-width in sync so header/layout account for sidebar
    useEffect(() => {
      try {
        const updateSidebarVar = () => {
          const width = (isSidebarOpen && window.innerWidth >= 768) ? '18rem' : '0px';
          document.documentElement.style.setProperty('--sidebar-width', width);
        };
        updateSidebarVar();
        window.addEventListener('resize', updateSidebarVar);
        return () => window.removeEventListener('resize', updateSidebarVar);
      } catch (e) { /* ignore */ }
    }, [isSidebarOpen]);

    // --- NEW: Prominent Fixed Header ---
    const AdminHeader = () => (
      <div className={`sticky top-0 z-40 bg-[#1a1a1a] p-5 shadow-xl border-b border-gray-800 text-white transition-all duration-300 ${isSidebarOpen ? 'md:pl-72' : ''}`}>
        <div className="flex justify-between items-center">
          <div className="flex items-center">
            {/* Hamburger button is visible only on small screens or when the sidebar is closed */}
            <button 
              className={`text-[#00cba9] p-2 rounded-lg hover:bg-[#2a2a2a] transition-colors ${isSidebarOpen ? 'md:hidden' : ''}`}
              onClick={() => { setIsSidebarHidden(false); setIsSidebarOpen(true); }}
            >
              <Menu size={24}/>
            </button>
            <h1 className="text-2xl font-extrabold ml-3 md:ml-0">CANDEL FZE Portal</h1>
          </div>
          <div className="flex items-center gap-4">
            <button onClick={() => setDarkMode(!darkMode)} className="text-gray-400 hover:text-white p-2 rounded-full hover:bg-gray-700 transition">
              {darkMode ? <Sun size={20}/> : <Moon size={20}/>}
            </button>
            <button onClick={() => setShowAdminPwModal(true)} className="flex items-center text-sm font-medium text-gray-300 hover:text-white transition bg-gray-700 px-3 py-1.5 rounded-xl border border-gray-600">
                <Settings size={16} className="mr-2 text-yellow-400"/> Admin
            </button>
            <button onClick={() => { setIsAdmin(false); guardedNavigateToLanding(); }} className="text-red-400 hover:text-red-500 p-2 rounded-full hover:bg-gray-700 transition">
              <LogOut size={20}/>
            </button>
          </div>
        </div>
      </div>
    );

    // --- NEW: Dedicated Dashboard Summary Component ---
    const DashboardSummary = () => {
      const totalStaffCount = staff.length;
      const [hidePayout, setHidePayout] = useState(false);
      // Helper to determine pending entries (centralized to avoid mismatches)
      const isPendingEntry = (e) => (e && (e.status === 'pending' || (typeof e.status === 'undefined' && e.approved !== true)));
      const totalPending = entries.filter(isPendingEntry).length;
        const totalPayoutYTD = useMemo(() => staff.reduce((acc, s) => acc + calculateTotalEarnings(s.id), 0), [staff, calculateTotalEarnings]);
        const recentActivity = useMemo(() => logs.sort((a,b) => new Date(b.timestamp) - new Date(a.timestamp)).slice(0, 5), [logs]);
        // Helper to compute daily payout totals for a given month/year
        const computeTotalsForMonth = (year, month) => {
          try {
            const days = new Date(year, month + 1, 0).getDate();
            const out = Array.from({ length: days }, () => 0);
            // prefer masterSheet-derived entries when available
            const sourceEntries = (masterSheet && typeof masterSheet === 'object') ? (
              // attempt simple extraction if masterSheet is an array-like
              (Array.isArray(masterSheet) ? masterSheet : entries)
            ) : entries;
            const validStaffIds = new Set((staff || []).map(s => String(s.id)));
            for (const e of (sourceEntries || [])) {
              if (!e || !e.date) continue;
              // parse date YYYY-MM-DD
              const dateOnly = String(e.date).split('T')[0];
              const parts = dateOnly.split('-');
              if (parts.length < 3) continue;
              const y = Number(parts[0] || 0); const m = Number(parts[1] || 0) - 1; const d = Number(parts[2] || 0);
              if (y !== year || m !== month) continue;
              if (!validStaffIds.has(String(e.staffId))) continue;
              // Only count approved
              if (!(e.status === 'approved' || e.approved === true)) continue;
              const dayIdx = d - 1;
              const dateKey = `${y}-${String(m+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
              const dayType = typeof getDayType === 'function' ? getDayType(dateKey, config.holidays || []) : 'Weekday';
              const hours = Number(e.hours) || 0;
              const val = (rates && rates.mode === 'daily') ? (hours > 0 ? 1 : 0) : hours;
              const rate = (dayType === 'Weekday') ? Number(rates?.weekday || 0) : (dayType === 'Saturday') ? Number(rates?.saturday || 0) : Number(rates?.sunday || 0);
              out[dayIdx] = (out[dayIdx] || 0) + (val * rate);
            }
            return out;
          } catch (e) { return []; }
        };
        // Usage counters (reads/writes) for today pulled from Firestore usage doc
        const [readsToday, setReadsToday] = useState(0);
        const [writesToday, setWritesToday] = useState(0);
        useEffect(() => {
          if (!db || !appId) return;
          try {
            const today = new Date();
            const y = today.getFullYear(); const m = String(today.getMonth()+1).padStart(2,'0'); const d = String(today.getDate()).padStart(2,'0');
            const dateId = `${y}-${m}-${d}`;
            const dailyDocRef = doc(db, 'artifacts', appId, 'public', 'data', 'usage', dateId);
            const fallbackDocRef = doc(db, 'artifacts', appId, 'public', 'data', 'usage', 'daily');
            let unsubDaily = null;
            let unsubFallback = null;

            // prefer per-date doc, fall back to generic
            unsubDaily = onSnapshot(dailyDocRef, snap => {
              try {
                const data = (snap && typeof snap.exists === 'function' && snap.exists()) ? snap.data() : null;
                if (data) {
                  setReadsToday(Number(data.reads || data.readsToday || 0));
                  setWritesToday(Number(data.writes || data.writesToday || 0));
                } else {
                  // subscribe to fallback only once
                  if (unsubFallback) return;
                  unsubFallback = onSnapshot(fallbackDocRef, fbSnap => {
                    try {
                      const fdata = (fbSnap && typeof fbSnap.exists === 'function' && fbSnap.exists()) ? fbSnap.data() : null;
                      if (fdata) {
                        setReadsToday(Number(fdata.reads || fdata.readsToday || 0));
                        setWritesToday(Number(fdata.writes || fdata.writesToday || 0));
                      } else {
                        setReadsToday(0);
                        setWritesToday(0);
                      }
                    } catch (e) {
                      console.error('usage fallback handler error', e);
                      setReadsToday(0); setWritesToday(0);
                    }
                  }, err => { console.error('usage fallback onSnapshot err', err); });
                }
              } catch (e) {
                console.error('usage daily handler error', e);
              }
            }, err => { console.error('usage daily onSnapshot err', err); });

            return () => {
              try { if (unsubDaily) unsubDaily(); } catch (e) {}
              try { if (unsubFallback) unsubFallback(); } catch (e) {}
            };
          } catch (e) { console.error('Failed to subscribe to usage doc', e); }
        }, [db, appId]);

        // Manual fetch helper: attempt to read per-date doc, fallback doc, or aggregate usage collection
        const fetchUsageNow = async () => {
          try {
            if (!db || !appId) return;
            const today = new Date();
            const y = today.getFullYear(); const m = String(today.getMonth()+1).padStart(2,'0'); const d = String(today.getDate()).padStart(2,'0');
            const dateId = `${y}-${m}-${d}`;
            const dailyDocRef = doc(db, 'artifacts', appId, 'public', 'data', 'usage', dateId);
            const fallbackDocRef = doc(db, 'artifacts', appId, 'public', 'data', 'usage', 'daily');
            try {
              const snap = await getDoc(dailyDocRef);
              if (snap && snap.exists && snap.exists()) {
                const data = snap.data();
                setReadsToday(Number(data.reads || data.readsToday || 0));
                setWritesToday(Number(data.writes || data.writesToday || 0));
                return;
              }
            } catch (e) { /* ignore */ }
            try {
              const snap2 = await getDoc(fallbackDocRef);
              if (snap2 && snap2.exists && snap2.exists()) {
                const data = snap2.data();
                setReadsToday(Number(data.reads || data.readsToday || 0));
                setWritesToday(Number(data.writes || data.writesToday || 0));
                return;
              }
            } catch (e) { /* ignore */ }

            // As a last resort, aggregate all docs under usage collection (careful: could be large)
            try {
              const collRef = collection(db, 'artifacts', appId, 'public', 'data', 'usage');
              const q = await getDocs(collRef);
              let r = 0; let w = 0;
              q.forEach(docSnap => {
                const d = docSnap.data(); if (!d) return;
                r += Number(d.reads || d.readsToday || 0) || 0;
                w += Number(d.writes || d.writesToday || 0) || 0;
              });
              setReadsToday(r);
              setWritesToday(w);
            } catch (e) {
              console.error('Failed to aggregate usage collection', e);
            }
          } catch (e) { console.error('fetchUsageNow failed', e); }
        };

        const UsageBars = ({ reads, writes }) => {
          const readsLimit = 50000; const writesLimit = 20000;
          const readsPct = Math.min(100, Math.round((Number(reads)||0) / readsLimit * 100));
          const writesPct = Math.min(100, Math.round((Number(writes)||0) / writesLimit * 100));
          const nf = (n) => (Number(n)||0).toLocaleString();
          return (
            <div className="mt-4 space-y-3">
              <div>
                <div className="flex items-center justify-between text-xs text-gray-300 mb-1">
                  <div className="font-semibold">Reads today</div>
                  <div className="text-gray-400">{nf(reads)} / {readsLimit.toLocaleString()} ({readsPct}%)</div>
                </div>
                <div className="w-full h-2 bg-gray-700 rounded overflow-hidden">
                  <div className="h-full bg-emerald-400" style={{ width: `${readsPct}%` }} />
                </div>
              </div>
              <div>
                <div className="flex items-center justify-between text-xs text-gray-300 mb-1">
                  <div className="font-semibold">Writes today</div>
                  <div className="text-gray-400">{nf(writes)} / {writesLimit.toLocaleString()} ({writesPct}%)</div>
                </div>
                <div className="w-full h-2 bg-gray-700 rounded overflow-hidden">
                  <div className="h-full bg-amber-400" style={{ width: `${writesPct}%` }} />
                </div>
              </div>
            </div>
          );
        };
        
        return (
            <div className="space-y-8 p-6">
                {/* 1. Spacious Stat Cards (Replaces complex number widgets) */}
                <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
                    {/* Staff Count */}
                    <div className="bg-[#1a1a1a] p-8 rounded-2xl shadow-2xl flex justify-between items-center border-l-8 border-[#00cba9] transition hover:shadow-emerald-900/20">
                        <div>
                            <div className="text-gray-400 font-bold uppercase tracking-widest text-sm mb-2">Total Staff Count</div>
                            <div className="text-5xl font-extrabold text-[#00cba9]">{totalStaffCount}</div>
                        </div>
                        <div className="w-16 h-16 rounded-full flex items-center justify-center bg-[#00cba9] text-black shadow-lg shadow-[#00cba9]/30">
                            <Users size={28}/>
                        </div>
                    </div>
                    
                    {/* Pending Approvals */}
                    <div className="bg-[#1a1a1a] p-8 rounded-2xl shadow-2xl flex justify-between items-center border-l-8 border-yellow-500 transition hover:shadow-yellow-900/20">
                        <div>
                            <div className="text-gray-400 font-bold uppercase tracking-widest text-sm mb-2">Pending Approvals</div>
                            <div className="text-5xl font-extrabold text-yellow-500">{totalPending}</div>
                        </div>
                        <div className="w-16 h-16 rounded-full flex items-center justify-center bg-yellow-500 text-black shadow-lg shadow-yellow-500/30">
                            <Clock size={28}/>
                        </div>
                    </div>

                    {/* Total Payout */}
                    <div className="bg-[#1a1a1a] p-8 rounded-2xl shadow-2xl flex justify-between items-center border-l-8 border-blue-500 transition hover:shadow-blue-900/20">
                      <div>
                        <div className="text-gray-400 font-bold uppercase tracking-widest text-sm mb-2">Estimated Payout</div>
                        <div className="text-2xl font-extrabold text-blue-400">{hidePayout ? '₦ •••••••' : formatCurrency(totalPayoutYTD)}</div>
                      </div>
                      <div className="w-16 h-16 rounded-full flex items-center justify-center bg-blue-500 text-white shadow-lg shadow-blue-500/30">
                        <button onClick={() => setHidePayout(!hidePayout)} aria-label={hidePayout ? 'Show payout' : 'Hide payout'} className="p-2">
                          {hidePayout ? <EyeOff size={24} /> : <Eye size={24} />}
                        </button>
                      </div>
                    </div>
                </div>

                {/* 2. Charts and Activity */}
                <div className="grid
                 grid-cols-1 lg:grid-cols-3 gap-6">
                    {/* Main Chart Area Placeholder (2/3 width) */}
                    <div className="lg:col-span-2 bg-[#1a1a1a] p-6 rounded-2xl shadow-lg border border-gray-800">
                        <h3 className="text-xl font-bold mb-4 text-[#00cba9] border-b border-gray-800 pb-3">Overtime Submission Trend (Placeholder)</h3>
                        <div className="h-40 md:h-72 bg-[#0c0c0c] rounded-lg p-4 border border-dashed border-gray-700 overflow-hidden">
                          {/* Overtime trend carousel: previous, current, next month */}
                          {/** Inline component to avoid adding dependencies **/}
                          {(() => {
                            const OvertimeTrendCarousel = ({ entries, rates, config, baseDate }) => {
                              const [index, setIndex] = React.useState(1); // 0: prev, 1: curr (only two slides)

                              // helper: format YYYY-MM-DD
                              const pad = (n) => String(n).padStart(2,'0');
                              const monthKey = (y,m) => `${y}-${pad(m+1)}`;

                              const months = React.useMemo(() => {
                                const cur = new Date(baseDate.getFullYear(), baseDate.getMonth(), 1);
                                const prev = new Date(cur.getFullYear(), cur.getMonth() - 1, 1);
                                return [prev, cur];
                              }, [baseDate]);

                              const getDayTypeLocal = (dateStr) => {
                                if ((config.holidays || []).includes(dateStr)) return 'Holiday';
                                // parse YYYY-MM-DD safely to avoid timezone shifts
                                try {
                                  const dateOnly = String(dateStr).split('T')[0];
                                  const parts = dateOnly.split('-');
                                  if (parts.length >= 3) {
                                    const y = Number(parts[0] || 0); const m = Number(parts[1] || 0) - 1; const d = Number(parts[2] || 0);
                                    const dt = new Date(y, m, d);
                                    const wk = dt.getDay(); if (wk === 0) return 'Sunday'; if (wk === 6) return 'Saturday'; return 'Weekday';
                                  }
                                } catch (e) { /* fallback */ }
                                const d = new Date(dateStr).getDay(); if (d === 0) return 'Sunday'; if (d === 6) return 'Saturday'; return 'Weekday';
                              };

                              const extractEntriesFromMaster = (ms) => {
                                // Try to find entry-like objects inside the masterSheet payload.
                                const results = [];
                                const seen = new Set();
                                const walker = (val) => {
                                  if (!val || typeof val !== 'object') return;
                                  if (Array.isArray(val)) return val.forEach(walker);
                                  // If object has date and hours, collect it
                                  if (typeof val.date === 'string' && (typeof val.hours === 'number' || typeof val.hours === 'string')) {
                                    const dateStr = String(val.date);
                                    if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
                                      const key = `${val.staffId||''}_${dateStr}_${val.hours}`;
                                      if (!seen.has(key)) { seen.add(key); results.push({ staffId: val.staffId || (val.staff || ''), date: dateStr, hours: Number(val.hours) || 0, status: val.status }); }
                                    }
                                  }
                                  // Otherwise traverse properties
                                  Object.values(val).forEach(v => { if (typeof v === 'object') walker(v); });
                                };
                                try { walker(ms); } catch (e) { /* ignore */ }
                                return results;
                              };

                              const computeDailyTotals = React.useCallback((dObj) => {
                                // Prefer masterSheet-derived entries when available
                                const allSource = (masterSheet ? extractEntriesFromMaster(masterSheet) : []).length > 0 ? extractEntriesFromMaster(masterSheet) : entries;
                                // Filter out entries that belong to staff records that no longer exist
                                const validStaffIds = new Set((staff || []).map(s => String(s.id)));
                                const sourceEntries = allSource.filter(e => e && e.staffId && validStaffIds.has(String(e.staffId)));
                                const year = dObj.getFullYear(); const month = dObj.getMonth();
                                const days = new Date(year, month + 1, 0).getDate();
                                const out = Array.from({ length: days }, (_, i) => 0);
                                for (const e of sourceEntries) {
                                  if (!e || !e.date) continue;
                                  // Prefer parsing only the date part (YYYY-MM-DD) to avoid timezone offsets
                                  const dateOnly = String(e.date).split('T')[0];
                                  const parts = dateOnly.split('-');
                                  let day = NaN;
                                  if (parts.length >= 3 && parts[0].length === 4) {
                                    const y = Number(parts[0] || 0), m = Number(parts[1] || 0) - 1, d = Number(parts[2] || 0);
                                    if (y !== year || m !== month) continue;
                                    day = d;
                                  } else {
                                    // fallback to Date parsing for unexpected input
                                    const ed = new Date(e.date);
                                    if (isNaN(ed.getTime())) continue;
                                    if (ed.getFullYear() !== year || ed.getMonth() !== month) continue;
                                    day = ed.getDate();
                                  }
                                  if (!day || day < 1 || day > days) continue;
                                  // Only count approved entries (or those explicitly marked approved)
                                  if (!(e.status === 'approved' || e.approved === true)) continue;
                                  const hours = Number(e.hours) || 0;
                                  // build a dateKey for holiday checks (YYYY-MM-DD)
                                  const dateKey = `${year}-${pad(month+1)}-${pad(day)}`;
                                  const type = getDayTypeLocal(dateKey);
                                  const val = (rates.mode === 'daily') ? (hours > 0 ? 1 : 0) : hours;
                                  const rate = (type === 'Weekday') ? Number(rates.weekday) || 0 : (type === 'Saturday') ? Number(rates.saturday) || 0 : Number(rates.sunday) || 0;
                                  out[day-1] += val * rate;
                                }
                                return out;
                              }, [entries, rates, config]);

                              const datasets = React.useMemo(() => months.map(m => ({ date: m, totals: computeDailyTotals(m) })), [months, computeDailyTotals]);
                              try { console.debug && console.debug('OvertimeTrendCarousel datasets', datasets.map(d => ({ month: d.date.toISOString().slice(0,7), totalsSum: d.totals.reduce((a,b)=>a+b,0), sample: d.totals.slice(0,6) }))); } catch(e) {}

                              // auto-advance (cycle only between two months: prev & current)
                              React.useEffect(() => {
                                const t = setInterval(() => setIndex(i => (i+1) % 2), 4500);
                                return () => clearInterval(t);
                              }, []);

                              // render single svg chart for given totals
                              const Chart = ({ totals, gradientId }) => {
                                const w = 680; const h = 240; const padLeft = 32; const padBottom = 28; const padTop = 12;
                                const innerW = w - padLeft - 12;
                                const innerH = h - padTop - padBottom;
                                const max = Math.max(1, ...totals);
                                const points = totals.map((v,i) => {
                                  const x = padLeft + (i/(totals.length-1 || 1)) * innerW;
                                  const y = padTop + innerH - (v/max) * innerH;
                                  return [x,y];
                                });
                                const path = points.map((p,i) => (i===0?`M ${p[0]} ${p[1]}`:`L ${p[0]} ${p[1]}`)).join(' ');
                                return (
                                  React.createElement('svg',{viewBox:`0 0 ${w} ${h}`, width:'100%', height:240},
                                    React.createElement('defs',null,
                                      React.createElement('linearGradient',{id:gradientId,x1:'0',x2:'0',y1:'0',y2:'1'},
                                        React.createElement('stop',{offset:'0%',stopColor:'#06b6d4',stopOpacity:0.25}),
                                        React.createElement('stop',{offset:'100%',stopColor:'#06b6d4',stopOpacity:0})
                                      )
                                    ),
                                    // fill area
                                    React.createElement('path',{d:`${path} L ${padLeft+innerW} ${padTop+innerH} L ${padLeft} ${padTop+innerH} Z`, fill:`url(#${gradientId})`, stroke:'none'}),
                                    // line
                                    React.createElement('path',{d:path, fill:'none', stroke:'#06b6d4', strokeWidth:2, strokeLinecap:'round', strokeLinejoin:'round'}),
                                    // circles
                                    points.map((p,i) => React.createElement('circle',{key:`pt_${i}`, cx:p[0], cy:p[1], r:2.2, fill:'#06b6d4'})),
                                    // min-nonzero and max markers (green) with side labels
                                    (() => {
                                      try {
                                        const nonZero = totals.filter(v => v > 0);
                                        const minNonZero = nonZero.length ? Math.min(...nonZero) : 0;
                                        const maxVal = totals.length ? Math.max(...totals) : 0;
                                        const minIdx = minNonZero ? totals.findIndex(v => v === minNonZero) : -1;
                                        const maxIdx = totals.findIndex(v => v === maxVal);
                                        const elems = [];
                                        // render min non-zero marker (to the right of the point)
                                        if (minIdx >= 0 && points[minIdx]) {
                                          const p = points[minIdx];
                                          elems.push(React.createElement('circle', { key: `min_mark_${minIdx}`, cx: p[0], cy: p[1], r: 5, fill: '#10b981', stroke: '#083019', strokeWidth: 0.5 }));
                                          elems.push(React.createElement('text', { key: `min_text_${minIdx}`, x: p[0] + 12, y: p[1] + 4, fontSize: 12, textAnchor: 'start', fill: '#10b981', style: { fontWeight: 700 } }, formatCurrency(minNonZero)));
                                        }
                                        // render max marker (to the right of the point)
                                        if (maxIdx >= 0 && points[maxIdx]) {
                                          const p = points[maxIdx];
                                          elems.push(React.createElement('circle', { key: `max_mark_${maxIdx}`, cx: p[0], cy: p[1], r: 5, fill: '#10b981', stroke: '#083019', strokeWidth: 0.5 }));
                                          elems.push(React.createElement('text', { key: `max_text_${maxIdx}`, x: p[0] + 12, y: p[1] + 4, fontSize: 12, textAnchor: 'start', fill: '#10b981', style: { fontWeight: 700 } }, formatCurrency(maxVal)));
                                        }
                                        return elems;
                                      } catch (e) { return null; }
                                    })(),
                                    // x labels (every 3rd or for small days), use small font
                                    totals.map((_,i) => {
                                      const x = padLeft + (i/(totals.length-1 || 1)) * innerW;
                                      const show = totals.length <= 14 ? true : (i % Math.ceil(totals.length/14) === 0);
                                      return show ? React.createElement('text',{key:`l_${i}`,x:x, y: padTop+innerH+14, fontSize:10, textAnchor:'middle', fill:'#9ca3af'}, String(i+1)) : null;
                                    })
                                  )
                                );
                              };

                              return (
                                React.createElement('div',{className:'w-full h-full relative flex flex-col'},
                                  // descriptive label at top-left (shows active slide's month/year)
                                  React.createElement('div',{className:'absolute top-3 left-3 z-10 text-sm font-semibold text-gray-200'}, `${datasets[index].date.toLocaleString(undefined,{month:'long', year:'numeric'})} — Daily estimated payout (₦)`),
                                  React.createElement('div',{className:'flex-1 w-full flex items-center justify-center overflow-hidden'},
                                    React.createElement('div',{className:'w-full transition-transform duration-700', style:{transform:`translateX(${-index*100}%)`, display:'flex', gap:12}},
                                      datasets.map((d,idx) => {
                                        const gid = `g_${d.date.getFullYear()}_${d.date.getMonth()}`;
                                        const sum = d.totals.reduce((a,b)=>a+b,0);
                                        return React.createElement('div',{key:gid, style:{minWidth:'100%', paddingRight:12}},
                                          React.createElement('div',{className:'text-sm text-gray-300 mb-2'}, `${d.date.toLocaleString(undefined,{month:'long'})} ${d.date.getFullYear()}`),
                                          React.createElement(Chart,{totals:d.totals, gradientId: gid}),
                                          // on-screen debug summary so it's easy to confirm which month has which totals
                                          React.createElement('div',{className:'text-xs text-gray-400 mt-2'}, `Days: ${d.totals.length} · Sum: ${formatCurrency(sum)}`)
                                        );
                                      })
                                    )
                                  ),
                                  React.createElement('div',{className:'flex items-center justify-center gap-2 mt-3'},
                                    datasets.map((_,i) => React.createElement('button',{key:i,onClick:()=>setIndex(i), className:`w-2 h-2 rounded-full ${i===index? 'bg-[#06b6d4]': 'bg-gray-500/30'}`}))
                                  )
                                )
                              );
                            };

                            return React.createElement(OvertimeTrendCarousel, { entries, rates, config, baseDate: currentDate });
                          })()}
                        </div>
                        {/* Usage bars moved to Recent System Activity section (per UX request) */}

                        {/* Dynamic professional summary for the two-line overtime trend graphs */}
                        <div className="mt-4 p-3 rounded-lg bg-[#07101a] text-sm text-gray-300 border border-gray-800">
                          {(() => {
                            try {
                              const year = currentDate.getFullYear();
                              const month = currentDate.getMonth();
                              const totals = computeTotalsForMonth(year, month);
                              if (!totals || totals.length === 0) return (<div className="text-gray-400">No payout data available for this month.</div>);
                              const monthName = currentDate.toLocaleString(undefined, { month: 'long' });
                              // find max and least non-zero
                              let maxVal = -Infinity; let maxIdx = -1; let minVal = Infinity; let minIdx = -1;
                              totals.forEach((v, i) => {
                                if (v > maxVal) { maxVal = v; maxIdx = i; }
                                if (v > 0 && v < minVal) { minVal = v; minIdx = i; }
                              });
                              const fmt = (v) => formatCurrency(Number(v) || 0);
                              const dateLabel = (dayIndex) => {
                                const d = new Date(year, month, dayIndex+1);
                                return d.toLocaleString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });
                              };

                              return (
                                <div>
                                  <div className="text-gray-300">In <span className="font-semibold text-white">{monthName}</span>, the maximum payout was <span className="font-semibold text-white">{fmt(maxVal)}</span> on <span className="font-semibold text-white">{dateLabel(maxIdx)}</span>.</div>
                                  <div className="mt-2 text-gray-300">The smallest non-zero payout was <span className="font-semibold text-white">{fmt(minVal === Infinity ? 0 : minVal)}</span> on <span className="font-semibold text-white">{minIdx >= 0 ? dateLabel(minIdx) : 'N/A'}</span>.</div>
                                </div>
                              );
                            } catch (e) {
                              return (<div className="text-gray-400">Summary unavailable.</div>);
                            }
                          })()}
                        </div>
                      </div>
                    
                    {/* Recent Activity (1/3 width) */}
                    <div className="lg:col-span-1 bg-[#1a1a1a] p-6 rounded-2xl shadow-lg border border-gray-800">
                        <div className="flex items-center justify-between">
                          <h3 className="text-xl font-bold mb-4 text-[#00cba9] border-b border-gray-800 pb-3">Recent System Activity</h3>
                          <div className="flex items-center gap-2">
                            <button onClick={() => fetchUsageNow()} className="text-xs px-3 py-1 rounded bg-gray-800 text-white hover:bg-gray-700">Refresh Usage</button>
                          </div>
                        </div>
                        <ul className="space-y-3">
                            {recentActivity.map((log, index) => (
                                <li key={index} className="flex items-start text-sm border-b border-gray-800 pb-3 last:border-b-0 last:pb-0">
                                    <Clock size={16} className="text-gray-500 mr-2 mt-1 shrink-0"/>
                                    <div>
                                        <p className="text-gray-300 font-medium">{log.action}</p>
                                        <p className="text-xs text-gray-500">{new Date(log.timestamp).toLocaleTimeString()} - Staff: {log.staffId || 'System'}</p>
                                    </div>
                                </li>
                            ))}
                            {recentActivity.length === 0 && <p className="text-gray-500 text-center py-4">No recent activity recorded.</p>}
                        </ul>
                        {/* Small usage bars here as well for quick glance */}
                        <UsageBars reads={readsToday} writes={writesToday} />
                      </div>
                </div>
            </div>
        );
    }
    
    // Pending Approvals full view
    const PendingApprovals = () => {
    const isPendingEntry = (e) => (e && (e.status === 'pending' || (typeof e.status === 'undefined' && e.approved !== true)));
    const pending = entries.filter(isPendingEntry);
      return (
        <div className="p-6">
          <h2 className="text-2xl font-bold mb-4">Pending Approvals for {currentDate.toLocaleString(undefined, { month: 'long' })} {currentDate.getFullYear()}</h2>
          {pending.length === 0 ? (
            <div className="text-gray-400">There are no pending approvals for this period.</div>
          ) : (
            <div className="space-y-4">
              {pending.map(e => {
                const staffItem = staff.find(s => s.id === e.staffId) || {};
                const taskItem = tasks.find(t => t.id === e.taskId) || {};
                const dayLabel = new Date(e.date).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
                return (
                  <div key={e.id || `${e.staffId}_${e.date}`} className="bg-[#0f1724] p-4 rounded-lg border border-gray-800 flex items-center justify-between">
                    <div>
                      <div className="font-semibold text-white">{staffItem.name || e.staffId} — {taskItem.name || 'Task'}</div>
                      <div className="text-gray-400 text-sm">{e.hours} hour(s) on {dayLabel}</div>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={async () => { await approveEntry(e.staffId, e.date); }} className="px-4 py-2 rounded bg-emerald-500 text-black font-bold">Approve</button>
                      <button onClick={async () => { await rejectEntry(e.staffId, e.date); }} className="px-4 py-2 rounded bg-red-500 text-white font-bold">Disapprove</button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      );
    };

    // Only include approved entries for admin views (matching Estimated Payout logic)
    const approvedEntries = React.useMemo(() => {
      try {
        const approved = (entries || []).filter(e => e && (e.status === 'approved' || e.approved === true));
        const validStaffIds = new Set((staff || []).map(s => String(s.id)));
        return approved.filter(e => e && e.staffId && validStaffIds.has(String(e.staffId)));
      } catch (e) { return []; }
    }, [entries, staff]);

    // Admin UI: Auto Officer panel for configuring date/time/location rules
    const AutoOfficerPanel = () => {
      const [localCfg, setLocalCfg] = useState(() => ({
        enabled: false,
        preset: 'today', // 'today' or 'lastN'
        nDays: 1,
        timeStart: '00:00',
        timeEnd: '23:59',
        locationMode: 'none',
        center: { lat: '', lng: '' },
        radiusMeters: 100,
        ...autoOfficerConfig
      }));
      const [editingNDays, setEditingNDays] = useState(false);

      useEffect(() => { setLocalCfg(prev => ({ ...prev, ...(autoOfficerConfig || {}) })); }, [autoOfficerConfig]);

      const saveCfg = async () => {
        try {
          const payload = { ...localCfg };
          await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'settings', 'auto_officer'), payload, { merge: true });
          setAutoOfficerConfig(payload);
          showToast('Auto Officer settings saved', 'success');
          await logAction('system', 'Auto Officer Updated');
        } catch (e) { console.error('Save auto officer failed', e); showToast('Save failed', 'warning'); }
      };

      const resetCfg = async () => {
        setLocalCfg({ enabled: false, preset: 'today', nDays: 1, timeStart: '00:00', timeEnd: '23:59', locationMode: 'none', center: { lat: '', lng: '' }, radiusMeters: 100 });
        try { await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'settings', 'auto_officer'), { enabled: false }, { merge: true }); setAutoOfficerConfig(null); showToast('Auto Officer reset', 'success'); } catch(e){ console.error(e); }
      };

      return (
        <div className="p-4">
          <div className="w-full max-w-[92%] sm:max-w-md md:max-w-xl mx-auto bg-[#1a1a1a] p-6 rounded-2xl shadow-lg border border-gray-800">
            <h3 className="text-lg sm:text-xl font-bold mb-4 text-[#06b6d4]">Auto Officer</h3>
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-2"><input type="checkbox" checked={!!localCfg.enabled} onChange={(e)=>setLocalCfg(prev=>({...prev, enabled: e.target.checked}))} /> <span className="font-semibold">Enabled</span></label>
              <div className="text-sm text-gray-400">When enabled, staff must be within configured date/time and location to submit overtime.</div>
            </div>

            <div>
              <div className="text-sm font-semibold mb-2">Date Range</div>
              <div className="flex items-center gap-3">
                <button onClick={() => { setLocalCfg(prev=>({...prev, preset: 'today'})); setEditingNDays(false); }} className={`px-3 py-1 rounded ${localCfg.preset==='today' ? 'bg-[#06b6d4] text-black' : 'bg-gray-800 text-white'}`}>TODAY</button>
                <div className="flex items-center gap-2">
                  <button onClick={() => { setLocalCfg(prev=>({...prev, preset: 'lastN'})); setEditingNDays(true); }} className={`px-3 py-1 rounded ${localCfg.preset==='lastN' ? 'bg-[#06b6d4] text-black' : 'bg-gray-800 text-white'}`}>{localCfg.preset==='lastN' && localCfg.nDays ? `LAST ${localCfg.nDays} DAYS` : 'LAST n DAYS'}</button>
                  {localCfg.preset === 'lastN' && editingNDays && (
                    <select value={localCfg.nDays} onChange={(e)=>{ setLocalCfg(prev=>({...prev, nDays: Number(e.target.value)})); setEditingNDays(false); }} className="p-1 rounded bg-[#121212] text-white ml-2">
                      {Array.from({length:7},(_,i)=>i+1).map(n => <option key={n} value={n}>{n}</option>)}
                    </select>
                  )}
                </div>
              </div>
            </div>

            <div>
              <div className="text-sm font-semibold mb-2">Time Window</div>
              <div className="flex gap-2">
                <input type="time" value={localCfg.timeStart} onChange={(e)=>setLocalCfg(prev=>({...prev, timeStart: e.target.value}))} className="p-2 rounded bg-[#121212] text-white" />
                <input type="time" value={localCfg.timeEnd} onChange={(e)=>setLocalCfg(prev=>({...prev, timeEnd: e.target.value}))} className="p-2 rounded bg-[#121212] text-white" />
              </div>
            </div>

            <div>
              <div className="text-sm font-semibold mb-2">Location</div>
              <div className="flex gap-2 items-center">
                <select value={localCfg.locationMode} onChange={(e)=>setLocalCfg(prev=>({...prev, locationMode: e.target.value}))} className="p-2 rounded bg-[#121212] text-white">
                  <option value="none">None</option>
                  <option value="radius">Radius</option>
                </select>
                {localCfg.locationMode === 'radius' && (
                  <div className="flex gap-2">
                    <input placeholder="Lat" value={localCfg.center.lat} onChange={(e)=>setLocalCfg(prev=>({...prev, center: {...prev.center, lat: e.target.value}}))} className="p-2 rounded bg-[#121212] text-white w-28" />
                    <input placeholder="Lng" value={localCfg.center.lng} onChange={(e)=>setLocalCfg(prev=>({...prev, center: {...prev.center, lng: e.target.value}}))} className="p-2 rounded bg-[#121212] text-white w-28" />
                    <input placeholder="Radius (m)" type="number" value={localCfg.radiusMeters} onChange={(e)=>setLocalCfg(prev=>({...prev, radiusMeters: Number(e.target.value)}))} className="p-2 rounded bg-[#121212] text-white w-36" />
                  </div>
                )}
              </div>
            </div>

            <div className="flex gap-2">
              <button onClick={saveCfg} className="px-4 py-2 rounded bg-[#06b6d4] text-black font-bold">Save</button>
              <button onClick={resetCfg} className="px-4 py-2 rounded bg-gray-700 text-white">Reset</button>
            </div>
          </div>
          </div>
        </div>
      );
    };

    // Component: MasterSheet
    const MasterSheet = () => {
        const [isExportOpen, setIsExportOpen] = useState(false);
      const daysInMonth = getDaysInMonth(currentDate.getFullYear(), currentDate.getMonth());
      const daysArray = Array.from({ length: daysInMonth }, (_, i) => i + 1);
      // table will auto-fit its content (no forced min width)
      const monthStr = currentDate.toLocaleString('default', { month: 'long', year: 'numeric' });
      
      const monthEntries = useMemo(() => 
        entries.filter(e => e.date?.startsWith(formatDate(currentDate.getFullYear(), currentDate.getMonth(), '').substring(0, 7))),
        [entries, currentDate]
      );
      
      const changeMonth = (delta) => {
        const newDate = new Date(currentDate.getFullYear(), currentDate.getMonth() + delta, 1);
        setCurrentDate(newDate);
      };
      
      const isHoliday = (d) => config.holidays?.includes(d);
      
      const toggleHoliday = async (dateKey) => {
        try {
          const isHoliday = config.holidays?.includes(dateKey);
          const pretty = new Date(dateKey).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
          const msg = isHoliday ? `Do you want to cancel public holiday for ${pretty}?` : `Do you want to declare ${pretty} a public holiday?`;
          const ok = window.confirm(msg);
          if (!ok) return;
          let newHolidays;
          if (isHoliday) {
            newHolidays = (config.holidays || []).filter(h => h !== dateKey);
          } else {
            newHolidays = [...(config.holidays || []), dateKey].sort();
          }
          await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'settings', 'config'), { holidays: newHolidays });
          showToast(isHoliday ? 'Holiday removed' : 'Holiday declared', 'success');
          await logAction('system', isHoliday ? 'Holiday Removed' : 'Holiday Declared', dateKey);
        } catch(e) {
          showToast(`Error updating holiday: ${e.message}`, 'warning');
        }
      };

      // Handle cell edit (hours)
      const handleCellEdit = async (staffId, date, newHours, taskId) => {
        setEditingCell(null);
        const oldHours = monthEntries.find(x => x.staffId === staffId && x.date === date)?.hours || 0;
        const hours = Number(newHours);
        if (hours === oldHours) return;
        
        const id = `${staffId}_${date}`;
        
        if (hours <= 0) {
          if (window.confirm(`Are you sure you want to delete the entry for ${staffId} on ${date}?`)) {
            await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'entries', id));
            showToast('Entry Deleted', 'success');
            await logAction('system', 'Entry Deleted', `ID: ${staffId}, Date: ${date}`);
          }
        } else {
          await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'entries', id), { 
            staffId, 
            date, 
            hours, 
            taskId: taskId || '', 
            editedAt: new Date().toISOString() 
          }, { merge: true });
          showToast('Entry Updated', 'success');
          await logAction('system', 'Entry Updated', `ID: ${staffId}, Date: ${date}, Hours: ${hours}`);
        }
      };
      
      // Export to XLSX (Excel) - replaces CSV export to provide richer format
      const saveBlobToDevice = async (blob, fileName, mimeType) => {
        try {
          // Convert Blob to base64 (used by some native Filesystem APIs)
          const toBase64 = async (b) => {
            const buf = await b.arrayBuffer();
            const bytes = new Uint8Array(buf);
            let binary = '';
            const chunk = 0x8000;
            for (let i = 0; i < bytes.length; i += chunk) {
              binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunk)));
            }
            return btoa(binary);
          };

          // 1) Try Capacitor Filesystem (native Android) when available
          if (typeof window !== 'undefined' && window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.Filesystem) {
            try {
              // Try requesting storage permissions on Android if a Permissions plugin is available
              try {
                if (window.Capacitor.Plugins.Permissions && window.Capacitor.Plugins.Permissions.requestPermissions) {
                  try {
                    await window.Capacitor.Plugins.Permissions.requestPermissions({ permissions: ['android.permission.READ_EXTERNAL_STORAGE', 'android.permission.WRITE_EXTERNAL_STORAGE'] });
                  } catch (e) {
                    // ignore permission request errors
                  }
                }
              } catch (e) {
                // ignore
              }
              const base64 = await toBase64(blob);
              // Try native MediaStore saver plugin first (if installed)
              try {
                if (window.Capacitor.Plugins.MediaStoreSaver && window.Capacitor.Plugins.MediaStoreSaver.saveFile) {
                  try {
                    const res = await window.Capacitor.Plugins.MediaStoreSaver.saveFile({ base64, fileName, mimeType });
                    try { showToast(`${fileName} saved to Downloads`, 'success'); } catch (e) {}
                    return true;
                  } catch (e) {
                    console.warn('MediaStoreSaver plugin failed', e);
                  }
                }
              } catch (e) {
                // ignore plugin availability errors
              }
              // Try several plausible directory names and path prefixes used by different Capacitor versions
              const pathPrefixes = ['Download', 'Downloads', 'DOWNLOADS', 'downloads'];
              const dirsToTry = ['EXTERNAL', 'EXTERNAL_STORAGE', 'DOCUMENTS', 'DATA', 'DOWNLOADS'];
              for (const prefix of pathPrefixes) {
                for (const dir of dirsToTry) {
                  try {
                    await window.Capacitor.Plugins.Filesystem.writeFile({ path: `${prefix}/${fileName}`, data: base64, directory: dir });
                    // Attempt to stat the file (some Capacitor builds expose stat)
                    try {
                      const statRes = await window.Capacitor.Plugins.Filesystem.stat({ path: `${prefix}/${fileName}`, directory: dir });
                      console.log('Saved file stat:', statRes);
                    } catch (e) {
                      // ignore stat failures
                    }
                    try { showToast(`${fileName} saved to device Downloads`, 'success'); } catch (e) {}
                    // Try to notify the media scanner (if plugin present) so file appears in file managers immediately
                    try {
                      if (window.Capacitor.Plugins.MediaScanner && window.Capacitor.Plugins.MediaScanner.scanFile) {
                        await window.Capacitor.Plugins.MediaScanner.scanFile({ path: `${prefix}/${fileName}` });
                      }
                    } catch (e) {
                      // non-fatal
                    }
                    return true;
                  } catch (e) {
                    // try next combination
                  }
                }
              }

              // As a best-effort, try writing to app data directory and then share via native share so user can move it
              try {
                await window.Capacitor.Plugins.Filesystem.writeFile({ path: fileName, data: base64, directory: 'DATA' });
                try { showToast(`${fileName} saved to app data; share to export`, 'success'); } catch (e) {}
                // attempt native share if available
                if (window.Capacitor.Plugins.Share && window.Capacitor.Plugins.Share.share) {
                  try {
                    await window.Capacitor.Plugins.Share.share({ title: fileName, url: `file://${fileName}` });
                  } catch (e) {}
                }
              } catch (e) {
                // ignore
              }
            } catch (e) {
              console.warn('Capacitor Filesystem write failed', e);
            }
          }

          // 2) Try Web Share (files) if supported by the WebView/browser
          try {
            const file = new File([blob], fileName, { type: mimeType });
            if (navigator && navigator.canShare && navigator.canShare({ files: [file] })) {
              await navigator.share({ files: [file], title: fileName });
              try { showToast('Shared file to available app (choose "Save" to store locally)', 'success'); } catch (e) {}
              return true;
            }
          } catch (e) {
            // ignore share errors
          }

          // 3) Final fallback: trigger browser download via object URL
          try {
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = fileName;
            document.body.appendChild(a);
            a.click();
            a.remove();
            URL.revokeObjectURL(url);
            try { showToast(`${fileName} download started`, 'success'); } catch (e) {}
            return true;
          } catch (e) {
            console.error('Fallback download failed', e);
          }

          return false;
        } catch (e) {
          console.error('saveBlobToDevice failed', e);
          return false;
        }
      };

      const exportToXLSX = async () => {
        try {
          // Build header: No, Name, Role, then day headers with two-line "D\nW" (day number and weekday initial)
          // Use single-line headers like '1S' to match dashboard screenshot (day + weekday initial)
          const headers = ['No', 'Name', 'Role', ...daysArray.map(d => {
            const dateKey = formatDate(currentDate.getFullYear(), currentDate.getMonth(), d);
            const wk = getDayShort(dateKey); // e.g. 'Sun', 'Mon'
            return `${wk}, ${ordinalSuffix(d)}`;
          }), 'Weekday Earnings', 'Saturday Earnings', 'Sun/Holiday Earnings', 'TOTAL EARNINGS'];

          const rows = staff.map((s, index) => {
            const row = [];
            row.push(index + 1);
            row.push(s.name);
            row.push(s.role);
            let weekdayEarnings = 0, saturdayEarnings = 0, sunHolidayEarnings = 0;
            daysArray.forEach(d => {
              const dateKey = formatDate(currentDate.getFullYear(), currentDate.getMonth(), d);
              const entry = monthEntries.find(e => e.staffId === s.id && e.date === dateKey);
              // If entry is explicitly disapproved, show empty cell
              const isDisapproved = entry && entry.status === 'disapproved';
              const hours = isDisapproved ? '' : (entry ? entry.hours : '');
              row.push(hours === 0 ? 0 : (hours === '' ? '' : Number(hours)));

              const type = getDayType(dateKey, config.holidays || []);
              const val = rates.mode === 'daily' ? ((Number(entry?.hours)||0) > 0 ? 1 : 0) : Number(entry?.hours)||0;
              if (type === 'Weekday') weekdayEarnings += (val * Number(rates.weekday) || 0);
              else if (type === 'Saturday') saturdayEarnings += (val * Number(rates.saturday) || 0);
              else sunHolidayEarnings += (val * Number(rates.sunday) || 0);
            });
            const total = weekdayEarnings + saturdayEarnings + sunHolidayEarnings;
            row.push(weekdayEarnings);
            row.push(saturdayEarnings);
            row.push(sunHolidayEarnings);
            row.push(total);
            return row;
          });

          // Use AoA then patch cell types/styles
          const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);

          // Column widths
          ws['!cols'] = headers.map((h, idx) => {
            if (idx < 3) return { wch: 18 };
            if (idx >= 3 && idx < 3 + daysArray.length) return { wch: 8 };
            return { wch: 14 };
          });

          // Helper to set style on a cell
          const setCellStyle = (r, c, style) => {
            const addr = XLSX.utils.encode_cell({ r, c });
            if (!ws[addr]) ws[addr] = { t: 's', v: '' };
            ws[addr].s = { ...(ws[addr].s || {}), ...style };
          };

          const colsCount = headers.length;

          // Header row: bold + center, enable wrapText for day headers
          for (let c = 0; c < colsCount; c++) {
            setCellStyle(0, c, { font: { bold: true }, alignment: { horizontal: 'center', vertical: 'center', wrapText: true } });
          }

          // Ash fill for meta and earnings headers
          const ashFill = { patternType: 'solid', fgColor: { rgb: 'FFF3F4F6' } };
          for (let c = 0; c < 3; c++) {
            setCellStyle(0, c, { fill: ashFill, font: { bold: true, color: { rgb: 'FF374151' } }, alignment: { horizontal: 'center' } });
            for (let r = 0; r < rows.length; r++) setCellStyle(r + 1, c, { fill: ashFill, font: { color: { rgb: 'FF374151' } } });
          }
          const earningsStart = headers.length - 4;
          for (let c = earningsStart; c < headers.length; c++) {
            setCellStyle(0, c, { fill: ashFill, font: { bold: true, color: { rgb: 'FF374151' } }, alignment: { horizontal: 'center' } });
            for (let r = 0; r < rows.length; r++) setCellStyle(r + 1, c, { fill: ashFill, font: { color: { rgb: 'FF374151' } } });
          }

          // Prepare shared fill objects so header and column cells use EXACT same color/style
          const dayFills = {
            holiday: { patternType: 'solid', fgColor: { rgb: 'FFFEF9C3' } },
            saturday: { patternType: 'solid', fgColor: { rgb: 'FFDBEAFE' } },
            sunday: { patternType: 'solid', fgColor: { rgb: 'FFFEE2E2' } }
          };

          // Day column coloring and ensure numeric cell types/formats
          for (let d = 0; d < daysArray.length; d++) {
            const colIndex = 3 + d;
            const dayNum = daysArray[d];
            const dateKey = formatDate(currentDate.getFullYear(), currentDate.getMonth(), dayNum);
            const dayType = getDayType(dateKey, config.holidays || []);
            let fillStyle = null;
            if (config.holidays?.includes(dateKey) || dayType === 'Holiday') fillStyle = dayFills.holiday;
            else if (dayType === 'Saturday') fillStyle = dayFills.saturday;
            else if (dayType === 'Sunday') fillStyle = dayFills.sunday;

            // Style header cell background for day — apply same fillStyle object and explicit font color
            if (fillStyle) setCellStyle(0, colIndex, { fill: fillStyle, font: { bold: true, color: { rgb: 'FF000000' } }, alignment: { horizontal: 'center', wrapText: true } });

            for (let r = 0; r < rows.length; r++) {
              const cellAddr = XLSX.utils.encode_cell({ r: r + 1, c: colIndex });
              // Ensure cell exists
              if (!ws[cellAddr]) ws[cellAddr] = { t: (rows[r][colIndex] === '' || rows[r][colIndex] === undefined) ? 's' : (typeof rows[r][colIndex] === 'number' ? 'n' : 's'), v: rows[r][colIndex] };
              // Apply the exact same fill and consistent font color to the column cell
              if (fillStyle) ws[cellAddr].s = { ...(ws[cellAddr].s || {}), fill: fillStyle, font: { ...(ws[cellAddr].s?.font || {}), color: { rgb: 'FF000000' } } };
              // If numeric, set number format (hours as integer, earnings with 2 decimals)
              if (typeof ws[cellAddr].v === 'number') {
                // day hours should be integer format
                ws[cellAddr].z = '0';
                ws[cellAddr].t = 'n';
              }
            }
          }

          // Set header row height slightly larger
          ws['!rows'] = [{ hpt: 20 }];

          const wb = XLSX.utils.book_new();
          XLSX.utils.book_append_sheet(wb, ws, `Overtime ${monthStr}`);
          const fileName = `Candel_Overtime_Sheet_${monthStr.replace(/\s+/g, '_')}.xlsx`;
          try {
            // Create binary and blob so we can write to device directly when possible
            const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array', cellStyles: true });
            const blob = new Blob([wbout], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
            const saved = await saveBlobToDevice(blob, fileName, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
            if (!saved) {
              // fallback to default behavior which triggers browser download
              XLSX.writeFile(wb, fileName, { bookType: 'xlsx', bookSST: false, cellStyles: true });
            }
            showToast('Excel exported successfully', 'success');
          } catch (e) {
            // final fallback: rely on XLSX.writeFile
            XLSX.writeFile(wb, fileName, { bookType: 'xlsx', bookSST: false, cellStyles: true });
            showToast('Excel exported (fallback)', 'success');
          }
        } catch (e) {
          console.error('Export to XLSX failed', e);
          showToast('Export failed', 'warning');
        }
      };

      // Export table to PDF in landscape using html2canvas + jsPDF
      const exportToPDFLandscape = async () => {
        try {
          // Try a few selectors: explicit id, common responsive class, or a visible table inside the master container
          const input = document.getElementById('master-sheet-table') || document.querySelector('.responsive-master-table') || document.querySelector('#master-sheet-table') || document.querySelector('.master-sheet-table') || document.querySelector('table');
          if (!input) {
            console.error('Master sheet table not found.');
            showToast('Master sheet table not found (table may still be loading)', 'warning');
            return;
          }
          // ensure the element has size (rendered)
          const rect = input.getBoundingClientRect ? input.getBoundingClientRect() : null;
          if (!rect || rect.width < 10 || rect.height < 10) {
            showToast('Master sheet is not yet rendered. Try again in a moment.', 'warning');
            return;
          }
          setIsExportOpen(false);

          // Build two dedicated export tables (page 1: daily hours, page 2: earnings breakdown)
          const wrapper = document.createElement('div');
          wrapper.style.position = 'fixed';
          wrapper.style.left = '-9999px';
          wrapper.style.top = '0';
          wrapper.style.backgroundColor = '#ffffff';
          wrapper.style.padding = '8px';

          // Common table style helper
          const makeTable = (fontSize = 12) => {
            const t = document.createElement('table');
            t.style.borderCollapse = 'collapse';
            t.style.fontFamily = 'Arial, Helvetica, sans-serif';
            t.style.fontSize = `${fontSize}px`;
            t.style.width = '100%';
            t.style.color = '#000';
            return t;
          };

          // Page 1: S/N, Staff Name, Role, Day columns with hours
          const tbl1 = makeTable(12);
          const thead1 = document.createElement('thead');
          const headRow1 = document.createElement('tr');
          ['S/N', 'Staff Name', 'Role', ...daysArray.map(d => String(d))].forEach(h => {
            const th = document.createElement('th');
            th.innerText = h;
            th.style.border = '1px solid #ddd';
            th.style.padding = '6px 8px';
            th.style.textAlign = 'center';
            th.style.background = '#f3f4f6';
            headRow1.appendChild(th);
          });
          thead1.appendChild(headRow1);
          tbl1.appendChild(thead1);

          const tbody1 = document.createElement('tbody');
          staff.forEach((s, idx) => {
            const tr = document.createElement('tr');
            const tdSn = document.createElement('td'); tdSn.innerText = String(idx + 1); tdSn.style.padding = '6px 8px'; tdSn.style.border = '1px solid #eee'; tdSn.style.fontWeight = '600'; tdSn.style.textAlign = 'center'; tr.appendChild(tdSn);
            const tdName = document.createElement('td'); tdName.innerText = s.name || ''; tdName.style.padding = '6px 8px'; tdName.style.border = '1px solid #eee'; tdName.style.textAlign = 'left'; tr.appendChild(tdName);
            const tdRole = document.createElement('td'); tdRole.innerText = s.role || ''; tdRole.style.padding = '6px 8px'; tdRole.style.border = '1px solid #eee'; tdRole.style.textAlign = 'left'; tr.appendChild(tdRole);
            daysArray.forEach(d => {
              const dateKey = formatDate(currentDate.getFullYear(), currentDate.getMonth(), d);
              const entry = monthEntries.find(e => e.staffId === s.id && e.date === dateKey);
              const td = document.createElement('td'); td.innerText = entry ? String(entry.hours || '') : ''; td.style.padding = '6px 8px'; td.style.border = '1px solid #eee'; td.style.textAlign = 'center'; tr.appendChild(td);
            });
            tbody1.appendChild(tr);
          });
          tbl1.appendChild(tbody1);
          wrapper.appendChild(tbl1);

          // Page 2: S/N, Staff Name, Weekday, Saturday, Sunday/Holiday, TOTAL
          const tbl2 = makeTable(13);
          const thead2 = document.createElement('thead');
          const headRow2 = document.createElement('tr');
          ['S/N', 'Staff Name', 'Weekday Earnings', 'Saturday Earnings', 'Sun/Holiday Earnings', 'TOTAL EARNINGS'].forEach(h => {
            const th = document.createElement('th'); th.innerText = h; th.style.border = '1px solid #ddd'; th.style.padding = '6px 8px'; th.style.textAlign = 'center'; th.style.background = '#f3f4f6'; headRow2.appendChild(th);
          });
          thead2.appendChild(headRow2);
          tbl2.appendChild(thead2);

          const tbody2 = document.createElement('tbody');
          staff.forEach((s, idx) => {
            let weekdayEarnings = 0, saturdayEarnings = 0, sunHolidayEarnings = 0;
            daysArray.forEach(d => {
              const dateKey = formatDate(currentDate.getFullYear(), currentDate.getMonth(), d);
              const entry = monthEntries.find(e => e.staffId === s.id && e.date === dateKey);
              const hours = Number(entry?.hours) || 0;
              const type = getDayType(dateKey, config.holidays || []);
              const val = (rates.mode === 'daily') ? (hours > 0 ? 1 : 0) : hours;
              if (type === 'Weekday') weekdayEarnings += val * Number(rates.weekday || 0);
              else if (type === 'Saturday') saturdayEarnings += val * Number(rates.saturday || 0);
              else sunHolidayEarnings += val * Number(rates.sunday || 0);
            });
            const total = weekdayEarnings + saturdayEarnings + sunHolidayEarnings;
            const tr = document.createElement('tr');
            const tdSn = document.createElement('td'); tdSn.innerText = String(idx + 1); tdSn.style.padding = '6px 8px'; tdSn.style.border = '1px solid #eee'; tdSn.style.fontWeight = '600'; tdSn.style.textAlign = 'center'; tr.appendChild(tdSn);
            const tdName = document.createElement('td'); tdName.innerText = s.name || ''; tdName.style.padding = '6px 8px'; tdName.style.border = '1px solid #eee'; tdName.style.textAlign = 'left'; tr.appendChild(tdName);
            const tdW = document.createElement('td'); tdW.innerText = formatCurrency(weekdayEarnings); tdW.style.padding = '6px 8px'; tdW.style.border = '1px solid #eee'; tdW.style.textAlign = 'right'; tr.appendChild(tdW);
            const tdSat = document.createElement('td'); tdSat.innerText = formatCurrency(saturdayEarnings); tdSat.style.padding = '6px 8px'; tdSat.style.border = '1px solid #eee'; tdSat.style.textAlign = 'right'; tr.appendChild(tdSat);
            const tdSun = document.createElement('td'); tdSun.innerText = formatCurrency(sunHolidayEarnings); tdSun.style.padding = '6px 8px'; tdSun.style.border = '1px solid #eee'; tdSun.style.textAlign = 'right'; tr.appendChild(tdSun);
            const tdTot = document.createElement('td'); tdTot.innerText = formatCurrency(total); tdTot.style.padding = '6px 8px'; tdTot.style.border = '1px solid #eee'; tdTot.style.textAlign = 'right'; tdTot.style.fontWeight = '700'; tr.appendChild(tdTot);
            tbody2.appendChild(tr);
          });
          tbl2.appendChild(tbody2);
          wrapper.appendChild(tbl2);

          document.body.appendChild(wrapper);

          // Render each table separately and add to PDF pages
          const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
          const margin = 10; const pageWidth = pdf.internal.pageSize.getWidth(); const pageHeight = pdf.internal.pageSize.getHeight();
          const availableWidth = pageWidth - margin * 2;

          // Header on first page
          pdf.setFontSize(12);
          pdf.setTextColor(20);
          pdf.text(`Overtime Master Sheet — ${monthStr}`, margin, margin + 6);
          pdf.setFontSize(9); pdf.setTextColor(80);
          pdf.text(`Generated: ${new Date().toLocaleString()}`, margin, margin + 11);

          // render first table
          const canvas1 = await html2canvas(tbl1, { scale: 2, useCORS: true, backgroundColor: '#ffffff' });
          const img1 = canvas1.toDataURL('image/png');
          const img1Ratio = canvas1.width / canvas1.height;
          const img1RenderedH = availableWidth / img1Ratio;
          let y = margin + 14; // leave room for header
          pdf.addImage(img1, 'PNG', margin, y, availableWidth, img1RenderedH);
          let remaining = img1RenderedH - (pageHeight - y - margin);
          while (remaining > -1) {
            pdf.addPage();
            const nextY = - (img1RenderedH - (pageHeight - margin - 14));
            pdf.addImage(img1, 'PNG', margin, nextY, availableWidth, img1RenderedH);
            remaining -= (pageHeight - margin - 14);
          }

          // second page for earnings breakdown
          pdf.addPage();
          const canvas2 = await html2canvas(tbl2, { scale: 2, useCORS: true, backgroundColor: '#ffffff' });
          const img2 = canvas2.toDataURL('image/png');
          const img2Ratio = canvas2.width / canvas2.height;
          const img2RenderedH = availableWidth / img2Ratio;
          pdf.addImage(img2, 'PNG', margin, margin, availableWidth, img2RenderedH);

          const fileName = `Candel_Master_Sheet_${monthStr.replace(/\s+/g, '_')}.pdf`;
          try {
            // prefer to output blob and save via helper so native APK can write into Downloads
            const pdfBlob = pdf.output && typeof pdf.output === 'function' ? pdf.output('blob') : null;
            if (pdfBlob instanceof Blob) {
              const saved = await saveBlobToDevice(pdfBlob, fileName, 'application/pdf');
              if (!saved) pdf.save(fileName);
            } else {
              // older jsPDF versions may not support output('blob'), fallback to save()
              pdf.save(fileName);
            }
          } catch (e) {
            console.warn('PDF save via blob failed, falling back to save()', e);
            pdf.save(fileName);
          }

          // cleanup
          try { document.body.removeChild(wrapper); } catch (e) {}

          showToast('PDF exported successfully', 'success');
        } catch (err) {
          console.error('PDF generation failed', err);
          showToast('PDF generation failed', 'warning');
        }
      };

      const MasterSheetTable = () => (
        <div className="flex-1 overflow-x-auto overflow-y-auto relative bg-white rounded-xl shadow-lg border border-gray-200">
          <table id="master-sheet-table" className="border-collapse responsive-master-table">
                <thead>
                    <tr className="bg-slate-700 text-xs text-white sticky top-0 z-40">
                        {/* Fixed Columns - Increased padding to address 'cells width too small' */}
                        <th className="border border-slate-600 w-12 p-3 sticky left-0 bg-slate-700 z-50">No</th>
                        <th className="border border-slate-600 w-60 p-3 sticky left-[3rem] bg-slate-700 z-50 text-left">Staff Name</th>
                        <th className="border border-slate-600 w-40 p-3 sticky left-[18rem] bg-slate-700 z-50 hidden md:table-cell text-left">Role</th>
                        
                        {/* Daily Columns (scrollable) */}
                        {daysArray.map(d => {
                            const dateKey = formatDate(currentDate.getFullYear(), currentDate.getMonth(), d);
                            const dayType = getDayType(dateKey, config.holidays || []);
                            const isHoliday = config.holidays?.includes(dateKey);
                            
                            let headerStyle = {};
                            if (isHoliday) headerStyle = { backgroundColor: '#fef9c3', color: '#000' };
                            else if (dayType === 'Saturday') headerStyle = { backgroundColor: '#dbeafe', color: '#000' };
                            else if (dayType === 'Sunday') headerStyle = { backgroundColor: '#fee2e2', color: '#000' };

                            return (
                            <th 
                              key={d} 
                              style={headerStyle}
                              className={`border border-slate-600 w-20 text-center text-sm p-2`} 
                              title={`Click to ${isHoliday ? 'remove' : 'set'} as Holiday`}
                            >
                                    <button 
                                      onClick={() => toggleHoliday(dateKey)}
                                      className="w-full h-full text-white font-bold p-1 hover:bg-black/10 transition"
                                    >
                                        <div className="text-base font-extrabold">{d}</div>
                                        <div className="text-xs">{getDayShort(dateKey).substring(0, 1)}</div>
                                    </button>
                                </th>
                            );
                        })}
                        
                        {/* Earnings Columns - Increased padding */}
                        <th className="border border-slate-600 w-32 p-3 bg-green-700 text-white sticky right-0 z-50">Total Earnings</th>
                    </tr>
                </thead>
                <tbody>
                    {staff.map((s, index) => {
                        const totalEarnings = calculateTotalEarnings(s.id);
                        return (
                            <tr key={s.id} className="text-gray-900 even:bg-gray-100 hover:bg-gray-200 transition-colors">
                                {/* Fixed Columns */}
                                <td className="border border-gray-300 w-12 p-3 sticky left-0 bg-white z-50 text-center font-bold text-sm">{index + 1}</td>
                                <td className="border border-gray-300 w-60 p-3 sticky left-[3rem] bg-white z-50 font-medium text-sm">{s.name}</td>
                                <td className="border border-gray-300 w-40 p-3 sticky left-[18rem] bg-white z-50 hidden md:table-cell text-sm text-gray-600">{s.role}</td>
                                
                                {/* Daily Columns (scrollable) - Increased internal padding and size */}
                                {daysArray.map(d => {
                                    const dateKey = formatDate(currentDate.getFullYear(), currentDate.getMonth(), d);
                                    const dayType = getDayType(dateKey, config.holidays || []);
                                    const entry = monthEntries.find(e => e.staffId === s.id && e.date === dateKey);
                                    const task = tasks.find(t => t.id === entry?.taskId);
                                    
                                    let cellStyle = {};
                                    if (dayType === 'Holiday') cellStyle = { backgroundColor: '#fef9c3' };
                                    else if (dayType === 'Sunday') cellStyle = { backgroundColor: '#fee2e2' };
                                    else if (dayType === 'Saturday') cellStyle = { backgroundColor: '#dbeafe' };
                                    
                                    const isEditing = editingCell?.staffId === s.id && editingCell?.date === dateKey;

                                        return (
                                        // widened daily cell
                                        <td key={d} className={`border border-gray-300 text-center text-sm p-4 transition-colors relative ${isEditing ? 'bg-amber-100' : 'text-slate-800'}`} style={cellStyle} >
                                            {isEditing ? (
                                                <form 
                                                  onSubmit={(e) => { 
                                                      e.preventDefault(); 
                                                      handleCellEdit(s.id, dateKey, e.target.hours.value, entry?.taskId); 
                                                  }} 
                                                  className="flex justify-center items-center h-full w-full"
                                                  onBlur={() => setEditingCell(null)}
                                                >
                                                    <input 
                                                      type="number" 
                                                      name="hours" 
                                                      min="0" 
                                                      max="12" 
                                                      step="1" 
                                                      defaultValue={entry?.hours || ''} 
                                                      className="w-full h-full text-center p-1 font-bold bg-transparent text-slate-800 text-lg focus:outline-none focus:ring-1 focus:ring-amber-500" 
                                                      autoFocus 
                                                      onFocus={e => e.target.select()} 
                                                    />
                                                    <button type="submit" hidden></button>
                                                </form>
                                            ) : (
                                                <div className="h-full w-full flex flex-col justify-center items-center cursor-pointer hover:bg-gray-100" 
                                                     onClick={() => setEditingCell({ staffId: s.id, date: dateKey })}
                                                >
                                                    <span className={`font-bold ${entry?.hours > 0 ? 'text-xl' : 'text-gray-400'}`}>
                                                        {entry?.hours || '-'}
                                                    </span>
                                                    {task && <span className="text-[10px] text-gray-600 truncate max-w-full leading-none">{task.shortName || task.name}</span>}
                                                </div>
                                            )}
                                        </td>
                                    );
                                })}

                                {/* Earnings Columns - Increased padding */}
                                <td className="border border-gray-300 w-32 p-3 bg-green-50 text-green-800 sticky right-0 z-50 font-extrabold text-sm">
                                    {formatCurrency(totalEarnings)}
                                </td>
                            </tr>
                        );
                    })}
                </tbody>
            </table>
        </div>
      );

      const [forceCompact, setForceCompact] = useState(false);
      // When true, show the full (desktop) master sheet even on small screens
      const [forceFullSheetOnMobile, setForceFullSheetOnMobile] = useState(false);

      return (
        <div className="p-6">
            <div className={`${darkMode ? 'bg-[#121212] text-white border-gray-800' : 'bg-white text-gray-900 border-gray-200'} p-6 rounded-2xl shadow-lg border`}>
              <h2 className="text-2xl font-bold mb-4 flex items-center gap-3" style={{ color: darkMode ? '#e5e7eb' : undefined }}><Calendar size={24}/> Overtime Master Sheet</h2>
              {/* Runtime debug info removed from production UI */}
              {/* Debug sample data removed for production UI */}
            <div className="flex flex-col sm:flex-row justify-between items-center mb-6">
              {/* Month Navigation */}
              {!forceCompact && (
                <div className="flex items-center bg-gray-100 rounded-xl p-2 mb-4 sm:mb-0 text-gray-800 font-bold text-lg">
                  <button onClick={() => changeMonth(-1)} className="p-1 hover:bg-gray-200 rounded-l-lg"><ChevronLeft size={18}/></button>
                  <span className="px-4 w-40 text-center">{monthStr}</span>
                  <button onClick={() => changeMonth(1)} className="p-1 hover:bg-gray-200 rounded-r-lg"><ChevronRight size={18}/></button>
                </div>
              )}
              
              {/* Actions (moved under Staff/Entries) */}
              <div className="flex gap-2 w-full sm:w-auto items-center">
                {/* Left intentionally empty — action buttons moved below the counts */}
              </div>
            </div>
            {/* Table Container (replaced by modern spreadsheet) */}
            <ErrorBanner />
            
            {/* Quick visibility counts to help diagnose empty-grid situations */}
            <div className="mb-3 text-sm text-gray-400">Staff: {staff?.length ?? 0} · Entries: {entries?.length ?? 0}</div>
            {/* Moved action buttons: Compact / Full controls on top, export/print directly beneath them */}
            <div className="mb-4">
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                {/* Single toggle button: clicking switches between Compact and Full Sheet on mobile.
                    Button label shows the action (the mode that will be activated). */}
                <button
                  onClick={() => {
                    // Toggle compact; and set forceFullSheetOnMobile to the inverse so they remain mutually exclusive
                    setForceCompact(prev => {
                      const next = !prev;
                      try { setForceFullSheetOnMobile(!next); } catch (e) {}
                      return next;
                    });
                  }}
                  title={forceCompact ? 'Switch to Full Sheet view' : 'Switch to Compact (mobile) view'}
                  className={`flex items-center gap-2 p-2 rounded-xl text-sm font-medium border ${forceCompact ? 'bg-[#00cba9] text-black border-[#00cba9]' : 'bg-gray-800 text-white border-gray-700'}`}>
                  <Minimize2 size={14} /> {forceCompact ? 'Full Sheet' : 'Compact'}
                </button>
                <div className="text-xs text-gray-400">Mode: <span className="font-semibold text-white">{forceCompact ? 'Compact' : (forceFullSheetOnMobile ? 'Full Sheet (Mobile)' : 'Full Sheet')}</span></div>
              </div>

              {!forceCompact && (
                <div className="mt-3 flex items-center gap-2">
                  <div className="relative">
                    <button
                      onClick={() => setIsExportOpen(!isExportOpen)}
                      className="flex items-center px-4 py-2 bg-blue-600 text-white font-semibold rounded-xl shadow-md hover:bg-blue-700 transition duration-150 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                    >
                      Export Master Sheet
                      <ChevronDown className={`w-4 h-4 ml-2 transition-transform ${isExportOpen ? 'rotate-180' : 'rotate-0'}`} />
                    </button>

                    {isExportOpen && (
                      <div className="absolute left-0 mt-12 w-56 bg-white rounded-xl shadow-xl z-50 border border-gray-100">
                        <button
                          onClick={() => { exportToXLSX(); setIsExportOpen(false); }}
                          className="w-full text-left px-4 py-3 text-sm text-gray-700 hover:bg-gray-100 rounded-t-xl transition-colors flex items-center"
                        >
                          <FileText className="w-4 h-4 mr-2" />
                          Export to XLSX
                        </button>
                        <button
                          onClick={() => { exportToPDFLandscape(); setIsExportOpen(false); }}
                          className="w-full text-left px-4 py-3 text-sm text-gray-700 hover:bg-gray-100 rounded-b-xl transition-colors flex items-center"
                        >
                          <FileText className="w-4 h-4 mr-2" />
                          Export to PDF (Landscape)
                        </button>
                      </div>
                    )}
                  </div>

                  <button onClick={window.print} className="flex items-center gap-1 bg-gray-600 text-white p-2 rounded-xl text-sm font-medium hover:bg-gray-700 transition">
                    <Printer size={16}/> Print
                  </button>
                </div>
              )}
            </div>
            <ErrorBoundary>
              {(isMobileMasterView && !forceFullSheetOnMobile) || forceCompact ? (
                <AdminMobileMasterSheet
                  staff={staff}
                  entries={approvedEntries}
                  tasks={tasks}
                  rates={rates}
                  config={config}
                  year={currentDate.getFullYear()}
                  onUpdateEntry={updateEntry}
                  onToggleHoliday={toggleHoliday}
                  onDeleteEntry={deleteEntry}
                  isAdmin={isAdmin}
                  calculateEarnings={calculateTotalEarnings}
                />
              ) : (
                staff && staff.length === 0 ? (
                  <div className="p-6 rounded-lg bg-[#0f1724] border border-gray-800 text-gray-300">No staff data available — check your data sync or Firebase configuration.</div>
                ) : (
                  <ResponsiveMasterTable
                    staff={staff}
                    entries={approvedEntries}
                    currentDate={currentDate}
                    startDay={1}
                    endDay={getDaysInMonth(currentDate.getFullYear(), currentDate.getMonth())}
                    calculateEarnings={calculateTotalEarnings}
                    holidays={config.holidays || []}
                    onRequestToggleHoliday={(dateKey) => { toggleHoliday(dateKey); }}
                  />
                )
              )}
            </ErrorBoundary>
          </div>
        </div>
      );
    };

    // Component: StaffManagement
    const StaffManagement = () => {
      const staffIdRef = useRef(null);
      const nameRef = useRef(null);
      const roleRef = useRef(null);
      const passwordRef = useRef(null);
      
      const handleAddStaff = async (e) => {
        e.preventDefault();
        const newStaff = {
          id: staffIdRef.current.value,
          name: nameRef.current.value,
          role: roleRef.current.value,
          password: passwordRef.current.value,
          joinedAt: new Date().toISOString()
        };
        
        if (staff.some(s => s.id === newStaff.id)) {
          showToast('Staff ID already exists', 'warning');
          return;
        }
        
        await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'staff', newStaff.id), newStaff);
        showToast('Staff added successfully', 'success');
        e.target.reset();
        await logAction('system', 'Staff Added', `ID: ${newStaff.id}`);
      };

      const StaffList = () => (
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-700">
            <thead className="bg-[#121212] text-gray-400 border-b border-gray-700">
              <tr>
                <th className="p-4 text-left">ID</th>
                <th className="p-4 text-left">Name</th>
                <th className="p-4 text-left">Role</th>
                <th className="p-4 text-left">Password</th>
                <th className="p-4 text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {staff.map(s => (
                <tr key={s.id} className="border-b border-gray-800 hover:bg-[#2a2a2a] transition">
                  <td className="p-4 font-mono text-gray-500">{s.id}</td>
                  <td className="p-4 font-medium text-white">{s.name}</td>
                  <td className="p-4 text-gray-400">{s.role}</td>
                  <td className="p-4 font-mono text-yellow-400">{s.password}</td>
                  <td className="p-4 text-right">
                    <button onClick={async () => {
                        if (window.confirm(`Are you sure you want to delete staff member ${s.name}?`)) {
                            await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'staff', s.id));
                            showToast('Staff deleted', 'success');
                            await logAction('system', 'Staff Deleted', `ID: ${s.id}`);
                        }
                    }} className="text-red-500 hover:text-red-700 p-2">
                      <Trash2 size={16}/>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );

      // Helper to add a staff object (used by inline form and new AdminStaffList component)
      const addStaffObject = async (newStaff) => {
        if (!newStaff || !newStaff.id) throw new Error('Invalid staff object');
        await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'staff', newStaff.id), newStaff);
        showToast('Staff added successfully', 'success');
        await logAction('system', 'Staff Added', `ID: ${newStaff.id}`);
      };

      // Keep legacy handleAddStaff wired to the new helper
      const legacyHandleAdd = async (e) => {
        e && e.preventDefault();
        const newStaff = {
          id: staffIdRef.current.value,
          name: nameRef.current.value,
          role: roleRef.current.value,
          password: passwordRef.current.value,
          joinedAt: new Date().toISOString()
        };
        if (staff.some(s => s.id === newStaff.id)) {
          showToast('Staff ID already exists', 'warning');
          return;
        }
        await addStaffObject(newStaff);
        e.target.reset();
      };

      const handleDelete = async (id) => {
        if (!id) return;
        if (!window.confirm(`Are you sure you want to delete staff member ${id}?`)) return;
        await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'staff', id));
        showToast('Staff deleted', 'success');
        await logAction('system', 'Staff Deleted', `ID: ${id}`);
      };

      return (
        <AdminStaffList staff={staff} onAdd={addStaffObject} onDelete={handleDelete} />
      );
    }; 
    
    // Component: RatesAndTasks (Settings)
    const RatesAndTasks = () => {
      const [localRates, setLocalRates] = useState(rates);
      const taskNameRef = useRef(null);
      const taskColorRef = useRef(null);

      useEffect(() => { setLocalRates(rates); }, [rates]);
      
      const handleSaveRates = async () => {
        await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'rates', 'current'), localRates);
        showToast('Rates saved successfully', 'success');
        await logAction('system', 'Rates Updated', JSON.stringify(localRates));
      };

      const handleAddTask = async (e) => {
        e.preventDefault();
        const name = taskNameRef.current.value;
        const color = taskColorRef.current.value;
        const shortName = name.split(' ').map(n => n.charAt(0)).join('').toUpperCase().substring(0, 4);
        
        await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'tasks'), { name, color, shortName });
        showToast('Task added successfully', 'success');
        e.target.reset();
        await logAction('system', 'Task Added', `Name: ${name}`);
      };

      // Submission toggle moved to Deploy Form Range page. Use Deploy page to open/close submissions.

      return (
        <div className="max-w-4xl mx-auto pb-20 p-6 space-y-8">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Overtime Rates */}
                <div className="bg-[#1a1a1a] p-6 rounded-2xl shadow-lg border border-gray-800">
                    <h3 className="font-bold text-xl mb-4 flex items-center gap-2 text-blue-400"><DollarSign size={20}/> Overtime Rates</h3>
                    <div className="space-y-4">
                        <div className="flex justify-around bg-[#2a2a2a] p-3 rounded-lg border border-gray-700">
                            <label className="flex items-center gap-2 text-white">
                                <input type="radio" name="mode" checked={localRates.mode === 'hourly'} onChange={() => setLocalRates({...localRates, mode: 'hourly'})} className="form-radio text-[#00cba9] bg-gray-700 border-gray-600 focus:ring-[#00cba9]" />
                                <span className="text-sm font-medium">Per Hour</span>
                            </label>
                            <label className="flex items-center gap-2 text-white">
                                <input type="radio" name="mode" checked={localRates.mode === 'daily'} onChange={() => setLocalRates({...localRates, mode: 'daily'})} className="form-radio text-[#00cba9] bg-gray-700 border-gray-600 focus:ring-[#00cba9]" />
                                <span className="text-sm font-medium">Per Day (Flat)</span>
                            </label>
                        </div>
                        {['weekday','saturday','sunday'].map(key => (
                            <div key={key} className="flex justify-between items-center py-2 border-b border-gray-700 last:border-b-0">
                                <label className="capitalize text-gray-400 font-medium">{key} Rate (₦)</label>
                                <input 
                                  type="number" 
                                  inputMode="numeric" 
                                  pattern="[0-9]*" 
                                  value={localRates?.[key] || 0} 
                                  onChange={e => setLocalRates({...localRates, [key]: Number(e.target.value)})} 
                                  className="p-2 border border-gray-600 rounded-lg w-32 text-right focus:ring-[#00cba9] focus:border-[#00cba9] bg-[#2a2a2a] text-white" 
                                />
                            </div>
                        ))}
                        <button onClick={handleSaveRates} className="w-full bg-[#00cba9] text-black py-3 rounded-xl font-bold hover:bg-[#00e0b7] active:scale-[0.99] transition shadow-md shadow-[#00cba9]/20"> Save Rates </button>
                    </div>
                </div>

                {/* System Settings */}
                <div className="bg-[#1a1a1a] p-6 rounded-2xl shadow-lg border border-gray-800 space-y-6">
                    <h3 className="font-bold text-xl flex items-center gap-2 text-red-400"><Settings size={20}/> System Controls</h3>
                    
                    <div className="flex items-center justify-between bg-[#2a2a2a] p-4 rounded-lg border border-gray-700">
                      <div>
                        <h4 className="font-bold text-white">Submission Window</h4>
                        <p className="text-sm text-gray-400">Controlled from Deploy Form Range page.</p>
                      </div>
                      <div className={`px-4 py-2 rounded-lg font-bold text-sm ${config.submissionsOpen ? 'bg-green-600 text-white' : 'bg-red-600 text-white'}`}>
                        {config.submissionsOpen ? 'Open' : 'Closed'}
                      </div>
                    </div>
                    
                    <div className="p-3 rounded-lg bg-[#111111] border border-gray-800 text-sm text-gray-300">
                      Admin key management has moved: use the <strong className="text-white">Change Admin Key</strong> control in the left sidebar/drawer to update the admin key.
                    </div>
                </div>
            </div>

            {/* Tasks Management (Below Rates/Settings) */}
            <div className="bg-[#1a1a1a] p-6 rounded-2xl shadow-lg border border-gray-800">
                <h3 className="font-bold text-xl mb-4 flex items-center gap-2 text-purple-400"><Briefcase size={20}/> Task Management</h3>
                <form onSubmit={handleAddTask} className="grid grid-cols-4 gap-4 mb-6">
                    <input ref={taskNameRef} type="text" placeholder="Task Name (e.g., Project Alpha)" className="p-3 border border-gray-700 rounded-xl bg-[#2a2a2a] text-white col-span-4 sm:col-span-2" required />
                    <input ref={taskColorRef} type="color" defaultValue="#00cba9" className="p-1 border border-gray-700 rounded-xl bg-[#2a2a2a] text-white h-full w-full col-span-2 sm:col-span-1" />
                    <button type="submit" className="bg-purple-600 text-white py-3 rounded-xl font-bold hover:bg-purple-700 transition col-span-4 sm:col-span-1"><Plus size={18} className="inline mr-2"/>Add Task</button>
                </form>

                <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-700">
                        <thead className="bg-[#121212] text-gray-400 border-b border-gray-700">
                            <tr>
                                <th className="p-3 text-left">Short Name</th>
                                <th className="p-3 text-left">Full Name</th>
                                <th className="p-3 text-right">Action</th>
                            </tr>
                        </thead>
                        <tbody>
                            {tasks.map(t => (
                                <tr key={t.id} className="border-b border-gray-800 hover:bg-[#2a2a2a] transition">
                                    <td className="p-3 font-mono text-xs text-center rounded-full" style={{ backgroundColor: t.color + '20', color: t.color }}>{t.shortName || 'N/A'}</td>
                                    <td className="p-3 text-white">{t.name}</td>
                                    <td className="p-3 text-right">
                                        <button onClick={async () => {
                                            if (window.confirm(`Are you sure you want to delete task "${t.name}"?`)) {
                                                await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'tasks', t.id));
                                                showToast('Task deleted', 'success');
                                                await logAction('system', 'Task Deleted', `ID: ${t.id}`);
                                            }
                                        }} className="text-red-500 hover:text-red-700 p-2">
                                            <Trash2 size={16}/>
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
      );
    };

    // Component: DeployFormRange
    const DeployFormRange = () => {
      const [start, setStart] = useState(config.formRangeStart || '');
      const [end, setEnd] = useState(config.formRangeEnd || '');

      const handleDeploy = async () => {
        await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'settings', 'config'), { formRangeStart: start, formRangeEnd: end });
        showToast('Form Deployment Range Updated', 'success');
        await logAction('system', 'Form Range Updated', `${start} to ${end}`);
      };

      const toggleSubmissionsFromDeploy = async () => {
        try {
          const newState = !config.submissionsOpen;
          await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'settings', 'config'), { submissionsOpen: newState });
          showToast(`Submissions are now ${newState ? 'OPEN' : 'CLOSED'}`, 'success');
          await logAction('system', `Submissions ${newState ? 'Opened' : 'Closed'}`);
        } catch (e) {
          console.error('Failed to toggle submissions', e);
          showToast('Failed to update submission state', 'warning');
        }
      };

      return (
        <div className="max-w-4xl mx-auto pb-20 p-6 overflow-auto h-full">
          <div className="bg-[#1a1a1a] p-6 rounded-2xl shadow-lg border border-gray-800">
            <h3 className="font-bold text-xl mb-4 flex items-center gap-2 text-amber-400"><Upload size={20}/> Deploy Form Date Range</h3>
            <p className="text-sm text-gray-400 mb-6">Define the date range within which staff are allowed to submit overtime entries. Leave blank to allow any date.</p>
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row gap-4">
                <div className="flex-1">
                  <label className="block text-sm font-medium text-gray-400 mb-2">Start Date</label>
                  <input type="date" value={start} onChange={e => setStart(e.target.value)} className="w-full p-3 border border-gray-700 rounded-xl bg-[#2a2a2a] text-white focus:ring-amber-500 focus:border-amber-500" />
                </div>
                <div className="flex-1">
                  <label className="block text-sm font-medium text-gray-400 mb-2">End Date</label>
                  <input type="date" value={end} onChange={e => setEnd(e.target.value)} className="w-full p-3 border border-gray-700 rounded-xl bg-[#2a2a2a] text-white focus:ring-amber-500 focus:border-amber-500" />
                </div>
              </div>
              <div className="flex gap-3 flex-col sm:flex-row">
                <button onClick={handleDeploy} className="flex-1 w-full bg-amber-600 text-white py-3 rounded-xl font-bold hover:bg-amber-700 active:scale-[0.99] transition shadow-md shadow-amber-900/20"> Save Deployment Settings </button>
                <button onClick={toggleSubmissionsFromDeploy} className={`flex-1 w-full px-4 py-3 rounded-xl font-bold transition text-sm ${config.submissionsOpen ? 'bg-red-600 text-white hover:bg-red-700' : 'bg-green-600 text-white hover:bg-green-700'}`}>
                  {config.submissionsOpen ? 'Close Submissions' : 'Open Submissions'}
                </button>
              </div>
            </div>
          </div>
        </div>
      );
    }; 
    
    // Component: Messages (Complaints)
    const Messages = () => {
      const [replyText, setReplyText] = useState({});
      const [recipient, setRecipient] = useState('all');
      const [sendingAdmin, setSendingAdmin] = useState(false);
      const [adminComposeText, setAdminComposeText] = useState('');
      const adminComposeRef = useRef(null);

      const pendingMessages = useMemo(() => messages.filter(m => !m.reply).sort((a,b) => new Date(a.submittedAt) - new Date(b.submittedAt)), [messages]);
      const repliedMessages = useMemo(() => messages.filter(m => m.reply).sort((a,b) => new Date(b.submittedAt) - new Date(a.submittedAt)), [messages]);

      const handleReply = async (messageId, staffId) => {
        const reply = replyText[messageId]?.trim();
        if (!reply) return;
        
        // include admin sender metadata on replies
        const senderId = user?.uid || 'admin';
        const senderName = user?.displayName || (config && config.adminName) || 'Admin';
        await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'messages', messageId), { reply, repliedAt: new Date().toISOString(), repliedBy: senderId, repliedByName: senderName });
        setReplyText(prev => { const { [messageId]: _, ...rest } = prev; return rest; });
        showToast('Reply sent successfully', 'success');
        await logAction('system', 'Message Replied', `To staff: ${staffId}`);
      };

      const MessageList = ({ title, msgs, isPending }) => (
          <div className="bg-[#1a1a1a] p-6 rounded-2xl shadow-lg border border-gray-800">
              <h3 className={`font-bold text-xl mb-4 flex items-center gap-2 ${isPending ? 'text-yellow-400' : 'text-green-400'}`}>
                  <MessageSquare size={20}/> {title} ({msgs.length})
              </h3>
              <div className="space-y-4">
                  {msgs.length === 0 && <p className="text-gray-500 text-center py-4">No {isPending ? 'pending' : 'replied'} messages.</p>}
                  {msgs.map(m => (
                      <div key={m.id} className="p-4 rounded-lg border border-gray-700 bg-[#2a2a2a]">
                          <p className="text-sm text-gray-400 flex justify-between">
                              <span>From: <span className="font-semibold text-white">{m.staffName} ({m.staffId})</span></span>
                              <span>{new Date(m.submittedAt).toLocaleDateString()}</span>
                          </p>
                          <p className="mt-2 text-gray-200 font-medium p-3 bg-[#1e1e1e] rounded-lg border border-gray-700">{m.message}</p>
                          
                          {m.reply ? (
                              <div className="mt-4 p-3 bg-green-500/10 rounded-lg text-sm border-l-4 border-green-500">
                                  <h4 className="font-bold text-green-400 text-sm mb-1">Reply Sent:</h4>
                                  <p className="text-green-200 text-sm">{m.reply}</p>
                              </div>
                          ) : (
                              <div className="mt-4">
                                  <textarea 
                                    value={replyText[m.id] || ''} 
                                    onChange={e => setReplyText(prev => ({...prev, [m.id]: e.target.value}))} 
                                    rows="2" 
                                    className="w-full p-2 border border-gray-700 rounded-lg focus:ring-blue-500 focus:border-blue-500 text-sm text-white bg-[#1e1e1e]" 
                                    placeholder="Type your reply here..." 
                                  />
                                  <div className="mt-2 flex items-center gap-2">
                                    <button 
                                      onClick={() => handleReply(m.id, m.staffId)} 
                                      disabled={!replyText[m.id]} 
                                      className="bg-blue-600 text-white py-2 px-4 rounded-xl text-sm font-bold disabled:bg-gray-700 disabled:text-gray-400 hover:bg-blue-700 transition"
                                    > 
                                      Send Reply 
                                    </button>
                                  </div>
                              </div>
                          )}

                          <div className="mt-3 flex justify-end">
                            <button onClick={async () => {
                                if (!window.confirm('Delete this message?')) return;
                                try {
                                  await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'messages', m.id));
                                  showToast('Message deleted', 'success');
                                  await logAction('system', 'Message Deleted', `Message ID: ${m.id}`);
                                } catch (e) {
                                  console.error('Failed to delete message', e);
                                  showToast('Failed to delete message', 'warning');
                                }
                            }} className="text-sm text-red-400 px-3 py-2 rounded-lg border border-red-600 hover:bg-red-600/10">Delete</button>
                          </div>
                      </div>
                  ))}
              </div>
          </div>
      );

      // Admin Compose Area (send message to specific staff or all)
      const AdminCompose = () => (
        <div className="bg-[#1a1a1a] p-6 rounded-2xl shadow-lg border border-gray-800 mb-6">
          <h3 className="font-bold text-lg mb-3 text-indigo-300">Send Message to Staff</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3">
            <select value={recipient} onChange={e => setRecipient(e.target.value)} className="p-3 rounded-xl bg-[#121212] border border-gray-700 text-white">
              <option value="all">All Staff</option>
              {staff.map(s => <option key={s.id} value={s.id}>{s.name} — {s.id}</option>)}
            </select>
              <div className="md:col-span-2">
              <textarea ref={adminComposeRef} defaultValue={adminComposeText} rows={3} className="w-full p-3 rounded-xl bg-[#121212] border border-gray-700 text-white" placeholder="Type message to send..." />
              </div>
          </div>
            <div className="flex gap-2">
            <button onClick={async () => {
              const text = (adminComposeRef.current && adminComposeRef.current.value) ? String(adminComposeRef.current.value).trim() : '';
              if (!text) return showToast('Message cannot be empty', 'warning');
              setSendingAdmin(true);
              try {
                // include admin sender metadata
                const senderId = user?.uid || 'admin';
                const senderName = user?.displayName || (config && config.adminName) || 'Admin';
                if (recipient === 'all') {
                  const ops = staff.map(s => addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'messages'), {
                    staffId: s.id,
                    staffName: s.name,
                    message: text,
                    submittedAt: new Date().toISOString(),
                    status: 'info',
                    autoGenerated: true,
                    sentBy: senderId,
                    sentByName: senderName,
                    recipientId: s.id
                  }));
                  await Promise.all(ops);
                  showToast('Message sent to all staff', 'success');
                  await logAction('system', 'Broadcast Message Sent', `Message: ${text.slice(0,80)}`);
                } else {
                  const s = staff.find(x => x.id === recipient);
                  if (!s) { showToast('Selected staff not found', 'warning'); return; }
                  await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'messages'), {
                    staffId: s.id,
                    staffName: s.name,
                    message: text,
                    submittedAt: new Date().toISOString(),
                    status: 'info',
                    autoGenerated: true,
                    sentBy: senderId,
                    sentByName: senderName,
                    recipientId: s.id
                  });
                  showToast('Message sent', 'success');
                  await logAction('system', 'Message Sent To Staff', `To: ${recipient} Message: ${text.slice(0,80)}`);
                }
                // clear the uncontrolled textarea
                if (adminComposeRef.current) adminComposeRef.current.value = '';
              } catch (e) {
                console.error('Failed to send admin message', e);
                showToast('Failed to send message', 'warning');
              } finally { setSendingAdmin(false); }
            }} className="bg-indigo-600 text-white px-4 py-2 rounded-xl font-bold hover:bg-indigo-700 transition">Send</button>
            <button onClick={() => { if (adminComposeRef.current) adminComposeRef.current.value = ''; setRecipient('all'); }} className="px-4 py-2 rounded-xl border border-gray-700 text-sm">Clear</button>
          </div>
        </div>
      );

      return (
          <div className="max-w-6xl mx-auto pb-20 p-6 space-y-8">
            <AdminCompose />
            <MessageList title="Pending Enquiries" msgs={pendingMessages} isPending={true} />
            <MessageList title="Replied Messages" msgs={repliedMessages} isPending={false} />
          </div>
      );
    }
    
    // Admin Key Change Modal (legacy admin key stored in settings/config)
    const AdminPasswordModal = () => {
      const oldPwRef = useRef(null);
      const newPwRef = useRef(null);
      const [showOldPw, setShowOldPw] = useState(false);
      const [showNewPw, setShowNewPw] = useState(false);
      const [error, setError] = useState('');

      const handleChangePassword = async (e) => {
        e.preventDefault();
        setError('');
        const oldKey = oldPwRef.current?.value || '';
        const newKey = newPwRef.current?.value || '';

        if (oldKey !== adminPassword) {
          setError('Incorrect current admin key.');
          return;
        }
        if (newKey.length < 4) {
          setError('New admin key must be at least 4 characters.');
          return;
        }

        await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'settings', 'config'), { adminPassword: newKey });
        setAdminPassword(newKey);
        setShowAdminPwModal(false);
        showToast('Admin Key Changed', 'success');
        await logAction('system', 'Admin Key Changed');
      };

      return (
        <Modal title="Change Admin Key" show={showAdminPwModal} onCancel={() => setShowAdminPwModal(false)}>
          <form onSubmit={handleChangePassword} className="space-y-4">
            <div className="relative">
              <input ref={oldPwRef} type={showOldPw ? "text" : "password"} placeholder="Current Admin Key" className="w-full p-3 border border-gray-700 rounded-xl bg-[#2a2a2a] text-white focus:ring-red-500 focus:border-red-500" required />
              <button type="button" onClick={() => setShowOldPw(!showOldPw)} className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-white p-1">
                {showOldPw ? <EyeOff size={20}/> : <Eye size={20}/>}
              </button>
            </div>
            <div className="relative">
              <input ref={newPwRef} type={showNewPw ? "text" : "password"} placeholder="New Admin Key" className="w-full p-3 border border-gray-700 rounded-xl bg-[#2a2a2a] text-white focus:ring-[#00cba9] focus:border-[#00cba9]" required />
              <button type="button" onClick={() => setShowNewPw(!showNewPw)} className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-white p-1">
                {showNewPw ? <EyeOff size={20}/> : <Eye size={20}/>}
              </button>
            </div>
            {error && <p className="text-red-400 text-sm mt-2">{error}</p>}
            <button type="submit" className="w-full bg-yellow-600 text-white py-3 rounded-xl font-bold hover:bg-yellow-700 transition">Update Admin Key</button>
          </form>
        </Modal>
      );
    };

    const AdminSidebar = () => (
        // Sidebar styling (fixed, responsive, drawer effect)
        <div 
          className={`fixed top-0 left-0 w-72 min-w-72 h-full z-50 flex flex-col bg-[#1a1a1a] shadow-2xl transition-transform duration-300 md:translate-x-0 ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}
          style={{boxShadow: '4px 0 20px rgba(0, 0, 0, 0.6)'}}
        >
            <div className="p-5 border-b border-gray-800 flex justify-between items-center shrink-0">
                <div className="flex items-center gap-2">
                    <Gauge size={24} className="text-[#00cba9]"/>
                    <span className="font-bold text-xl text-white">CANDEL FZE</span>
                </div>
                {/* Close button visible on small screens */}
                <button onClick={() => setIsSidebarOpen(false)} className="md:hidden text-gray-400 hover:text-white p-1">
                    <X size={20} />
                </button>
            </div>
            
            <nav className="flex-1 py-4 space-y-1 overflow-y-auto">
                {[
                  { id: 'dashboard', icon: Gauge, label: 'Dashboard Summary' }, // NEW Summary View
                  { id: 'pending-approvals', icon: Clock, label: 'Pending Approvals' },
                  { id: 'master-sheet', icon: Calendar, label: 'Master Sheet' }, // Old 'dashboard' tab
                  { id: 'staff', icon: Users, label: 'Staff Data' },
                  { id: 'messages', icon: MessageSquare, label: 'Messages & Replies' },
                  { id: 'deploy', icon: Upload, label: 'Deploy Form Range' },
                  { id: 'auto-officer', icon: Shield, label: 'Auto Officer' },
                  { id: 'settings', icon: Settings, label: 'Rates & Tasks' }
                ].map(item => (
                    <button 
                        key={item.id} 
                        onClick={() => { 
                            setAdminTab(item.id); 
                            if(window.innerWidth < 1024) setIsSidebarOpen(false); // Close sidebar on mobile after selection
                    }} 
                    className={`w-full flex items-center gap-3 px-6 py-3.5 transition-all text-left font-semibold ${adminTab === item.id 
                      ? 'bg-[#00cba9]/10 text-[#00cba9] border-l-4 border-[#00cba9]' 
                      : 'text-slate-200 hover:bg-[#2a2a2a] hover:text-white border-l-4 border-transparent'}`}
                    >
                          <item.icon size={20}/> <span className="flex items-center gap-2">
                            <span>{item.label}</span>
                            {item.id === 'auto-officer' && autoOfficerConfig && autoOfficerConfig.enabled && (
                              <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-green-600 text-black">Enabled</span>
                            )}
                          </span>
                    </button>
                ))}
            </nav>

            {/* Pending approvals header is now a nav item; no inline list is shown here */}

            <div className="p-4 border-t border-gray-800">
              <div className="mb-2">
                <button onClick={() => { setIsSidebarOpen(false); setIsSidebarHidden(true); }} className="w-full flex items-center gap-3 px-4 py-3 rounded-lg text-gray-300 hover:bg-gray-700/20 transition font-semibold">
                  <X size={16}/> Close
                </button>
              </div>
              <button onClick={() => setShowAdminPwModal(true)} className="w-full flex items-center gap-3 px-4 py-3 rounded-lg text-amber-400 hover:bg-amber-400/10 transition font-semibold mb-2">
                <Key size={18}/> Change Admin Key
              </button>
              <button onClick={() => { setIsAdmin(false); guardedNavigateToLanding(); }} className="w-full flex items-center gap-3 px-4 py-3 rounded-lg text-red-400 hover:bg-red-400/10 transition font-semibold">
                <LogOut size={20}/> Log Out
              </button>
            </div>
        </div>
    );
    

    const renderAdminView = () => {
        switch (adminTab) {
            case 'dashboard': return <DashboardSummary />;
        case 'pending-approvals': return <PendingApprovals />;
            case 'master-sheet': return <MasterSheet />;
            case 'staff': return <StaffManagement />;
          case 'auto-officer': return <AutoOfficerPanel />;
          case 'settings': return <RatesAndTasks />;
            case 'deploy': return <DeployFormRange />;
            case 'messages': return <Messages />;
            default: return <DashboardSummary />;
        }
    };

    return (
        // Main container with full height and dark theme
        <div className={`min-h-screen flex font-sans ${darkMode ? 'bg-[#0c0c0c] text-white' : 'bg-gray-100 text-gray-900'}`}>
            {/* Sidebar component (can be hidden by Close) */}
            {!isSidebarHidden && <AdminSidebar />}
            
            {/* Content Container (Handles margin for desktop sidebar and click-to-close for mobile) */}
            <div className={`flex-1 transition-all duration-300 ${isSidebarOpen ? 'md:ml-72' : ''}`} onClick={() => { if(window.innerWidth < 1024 && isSidebarOpen) setIsSidebarOpen(false); }}>
                {/* Fixed Header */}
                <AdminHeader />
                
                {/* Main Content Area - centered like Staff Portal on mobile/phone
                    Allow horizontal scrolling only for 'staff' and 'master-sheet' views */}
                <div className="min-h-[calc(100vh-80px)]">
                    <div
                      className={`px-4 py-6 transition-all duration-200 w-full ${adminTab === 'staff' || adminTab === 'master-sheet' ? 'max-w-full' : 'max-w-full md:max-w-4xl mx-auto'}`}
                      style={{ overflowX: (adminTab === 'staff' || adminTab === 'master-sheet') ? 'auto' : 'hidden' }}
                    >
                      {renderAdminView()}
                    </div>
                </div>
            </div>
            
            <AdminPasswordModal />
            <Toast message={toastMsg} type={toastType} onClose={() => setToastMsg('')} />
        </div>
    );
  };


  // --- MAIN APP RENDER ---
  if (firebaseError) {
    // ... (Error View remains the same)
    return (
        <div className="h-screen w-full flex flex-col items-center justify-center p-4 font-sans bg-slate-900 text-white">
            <div className="w-full max-w-lg p-6 rounded-xl border border-red-700 bg-red-900/10 text-center animate-fade-in-down">
                <AlertTriangle size={32} className="text-red-500 mx-auto mb-4"/>
                <h2 className="text-xl font-bold text-red-400 mb-2">Firebase Connection Error</h2>
                <p className="text-sm text-gray-300 mb-4">The application could not connect to or initialize Firebase. Please check your configuration (`firebaseConfig` in App.jsx) or network connection.</p>
                <pre className="bg-red-900/50 p-3 rounded text-sm overflow-x-auto text-red-300">
                    {firebaseError.message}
                </pre>
                <p className="text-xs text-gray-500 mt-4">If this persists, contact support with the error message above.</p>
            </div>
        </div>
    );
  }

  return (
    <>
      {/* FIX: Changed min-h-screen to h-screen for fixed landing pages */}
      <div className={`h-screen ${darkMode ? 'bg-slate-900' : 'bg-gray-100'}`}>
        {currentView === 'loading' && <LoadingView />}
        {currentView === 'landing' && <LandingView />}
        
        {currentView === 'admin-login' && (
          <div className="min-h-screen relative flex items-center justify-center p-4">
            <div className="login-bg" aria-hidden>
              <div className="slide" style={{ backgroundImage: `url('https://ikgxslfmmcgneoivupee.supabase.co/storage/v1/object/public/app-assets/Candel-FZE%20(1).jpg')` }} />
              <div className="slide" style={{ backgroundImage: `url('https://ikgxslfmmcgneoivupee.supabase.co/storage/v1/object/public/app-assets/Screenshot%202025-11-28%20104233.png')` }} />
              <div className="slide" style={{ backgroundImage: `url('https://ikgxslfmmcgneoivupee.supabase.co/storage/v1/object/public/app-assets/ChatGPT%20Image%20Nov%2024,%202025,%2003_11_38%20PM.png')` }} />
              <div className="overlay" />
            </div>
            <div className="bg-[#1e1e1e] p-8 rounded-xl shadow-xl w-full max-w-sm relative text-white animate-fade-in-down login-foreground">
                <button onClick={() => guardedNavigateToLanding()} className="absolute top-4 left-4 text-gray-400 hover:text-[#00cba9]"><ChevronLeft/></button>
                <h2 className="text-2xl font-bold text-center mb-4">Admin Sign In</h2>
                <p className="text-sm text-gray-400 text-center mb-4">Sign in with your Firebase email/password account. Email verification is required for new admin accounts.</p>
                <form onSubmit={handleAdminLogin} className="space-y-4">
                    <input name="email" type="email" className="w-full p-3 border border-gray-700 rounded-xl bg-[#2a2a2a] text-white" placeholder="Email (optional)" />
                    <input type="password" name="password" className="w-full p-3 border border-gray-700 rounded-xl bg-[#2a2a2a] outline-none focus:ring-2 focus:ring-[#00cba9] text-lg" placeholder="Admin Password" required />
                    <div className="flex justify-between items-center text-sm">
                        <button type="button" onClick={() => guardedSetCurrentView('admin-forgot')} className="text-gray-400 hover:text-white">Forgot password?</button>
                        <button type="button" onClick={() => guardedSetCurrentView('admin-signup')} className="text-gray-400 hover:text-white">Sign up</button>
                    </div>
                    <button className="w-full bg-[#00cba9] text-black py-3 rounded-xl font-bold hover:bg-[#00e0b7] transition shadow-md shadow-[#00cba9]/20">Sign In</button>
                </form>
                <p className="text-xs text-gray-500 mt-4">Note: Email/password sign-in is enabled via Firebase. The legacy admin key remains supported for backward compatibility.</p>
            </div>
            <div className="powered-by absolute bottom-3 left-3 z-30 text-xs text-white/80">Powered by RoiIndustries © 2025</div>
          </div>
        )}

        {currentView === 'admin-signup' && (
          <div className="min-h-screen relative flex items-center justify-center p-4">
            <div className="login-bg" aria-hidden>
              <div className="slide" style={{ backgroundImage: `url('https://ikgxslfmmcgneoivupee.supabase.co/storage/v1/object/public/app-assets/Candel-FZE%20(1).jpg')` }} />
              <div className="slide" style={{ backgroundImage: `url('https://ikgxslfmmcgneoivupee.supabase.co/storage/v1/object/public/app-assets/Screenshot%202025-11-28%20104233.png')` }} />
              <div className="slide" style={{ backgroundImage: `url('https://ikgxslfmmcgneoivupee.supabase.co/storage/v1/object/public/app-assets/ChatGPT%20Image%20Nov%2024,%202025,%2003_11_38%20PM.png')` }} />
              <div className="overlay" />
            </div>
            <div className="bg-[#1e1e1e] p-8 rounded-xl shadow-xl w-full max-w-md relative text-white animate-fade-in-down login-foreground">
                <button onClick={() => guardedSetCurrentView('admin-login')} className="absolute top-4 left-4 text-gray-400 hover:text-[#00cba9]"><ChevronLeft/></button>
                <h2 className="text-2xl font-bold text-center mb-4">Create an Admin Account</h2>
                <p className="text-sm text-gray-400 mb-4">Sign-up creates a Firebase account and sends a verification email. Accounts require email verification before admin access is granted.</p>
                <form onSubmit={handleAdminSignup} className="space-y-4">
                    <input name="email" type="email" className="w-full p-3 border border-gray-700 rounded-xl bg-[#2a2a2a] text-white" placeholder="Email" required />
                    <input name="password" type="password" className="w-full p-3 border border-gray-700 rounded-xl bg-[#2a2a2a] text-white" placeholder="Password" required />
                    <input name="confirm" type="password" className="w-full p-3 border border-gray-700 rounded-xl bg-[#2a2a2a] text-white" placeholder="Confirm password" required />
                    <input name="adminKey" type="password" className="w-full p-3 border border-gray-700 rounded-xl bg-[#2a2a2a] text-white" placeholder="Admin Key (required)" required />
                    <button className="w-full bg-indigo-600 text-white py-3 rounded-xl font-bold hover:bg-indigo-700 transition">Create Account</button>
                </form>
                <p className="text-xs text-gray-500 mt-4">This creates a Firebase auth account; verify the email to complete sign-up.</p>
            </div>
          </div>
        )}

        {currentView === 'admin-forgot' && (
          <div className="min-h-screen relative flex items-center justify-center p-4">
            <div className="login-bg" aria-hidden>
              <div className="slide" style={{ backgroundImage: `url('https://ikgxslfmmcgneoivupee.supabase.co/storage/v1/object/public/app-assets/Candel-FZE%20(1).jpg')` }} />
              <div className="slide" style={{ backgroundImage: `url('https://ikgxslfmmcgneoivupee.supabase.co/storage/v1/object/public/app-assets/Screenshot%202025-11-28%20104233.png')` }} />
              <div className="slide" style={{ backgroundImage: `url('https://ikgxslfmmcgneoivupee.supabase.co/storage/v1/object/public/app-assets/ChatGPT%20Image%20Nov%2024,%202025,%2003_11_38%20PM.png')` }} />
              <div className="overlay" />
            </div>
            <div className="bg-[#1e1e1e] p-8 rounded-xl shadow-xl w-full max-w-md relative text-white animate-fade-in-down login-foreground">
                <button onClick={() => guardedSetCurrentView('admin-login')} className="absolute top-4 left-4 text-gray-400 hover:text-[#00cba9]"><ChevronLeft/></button>
                <h2 className="text-2xl font-bold text-center mb-4">Forgot Password</h2>
                <p className="text-sm text-gray-400 mb-4">Password reset is handled by Firebase. Enter your email to receive a password reset link.</p>
                <form onSubmit={handlePasswordReset} className="space-y-4">
                    <input name="email" type="email" className="w-full p-3 border border-gray-700 rounded-xl bg-[#2a2a2a] text-white" placeholder="Enter your email" required />
                    <button className="w-full bg-amber-500 text-black py-3 rounded-xl font-bold hover:bg-amber-600 transition">Request Reset</button>
                </form>
                <p className="text-xs text-gray-500 mt-4">Password reset links are sent by Firebase to the provided email.</p>
            </div>
          </div>
        )}
        
        {currentView === 'staff-login' && (
         <div className="min-h-screen relative flex items-center justify-center p-4">
          <div className="login-bg" aria-hidden>
            <div className="slide" style={{ backgroundImage: `url('https://ikgxslfmmcgneoivupee.supabase.co/storage/v1/object/public/app-assets/Candel-FZE%20(1).jpg')` }} />
            <div className="slide" style={{ backgroundImage: `url('https://ikgxslfmmcgneoivupee.supabase.co/storage/v1/object/public/app-assets/Screenshot%202025-11-28%20104233.png')` }} />
            <div className="slide" style={{ backgroundImage: `url('https://ikgxslfmmcgneoivupee.supabase.co/storage/v1/object/public/app-assets/ChatGPT%20Image%20Nov%2024,%202025,%2003_11_38%20PM.png')` }} />
            <div className="overlay" />
          </div>
          <div className="bg-[#1e1e1e] p-8 rounded-xl shadow-xl w-full max-w-sm relative text-white animate-fade-in-down login-foreground">
            <button onClick={() => guardedNavigateToLanding()} className="absolute top-4 left-4 text-gray-400 hover:text-[#00cba9]"><ChevronLeft/></button>
            <h2 className="text-2xl font-bold text-center mb-6">Staff Portal</h2>
            <form onSubmit={handleStaffLogin} className="space-y-4">
              <input name="staffIdOrName" className="w-full p-3 border border-gray-700 rounded-xl bg-[#2a2a2a] text-white" placeholder="Enter your name or ID" required />
              <input type="password" name="password" className="w-full p-3 border border-gray-700 rounded-xl bg-[#2a2a2a] outline-none focus:ring-2 focus:ring-blue-500" placeholder="Your Password" required />
              <button className="w-full bg-blue-600 text-white py-3 rounded-xl font-bold hover:bg-blue-700 transition">Enter Portal</button>
            </form>
          </div>
          <div className="powered-by absolute bottom-3 left-3 z-30 text-xs text-white/80">Powered by RoiIndustries © 2025</div>
         </div>
         )}
       {/* FIX: Admin and Staff portals retain min-h-screen for content scrolling */}
      {currentView === 'staff-portal' && currentStaff && (
        <StaffPortal setBusy={setBusy} subView={staffSubView} setSubView={setStaffSubView} autoOfficerConfig={autoOfficerConfig} />
      )}
       {currentView === 'admin-dashboard' && isAdmin && <AdminDashboard />}
        {currentView === 'verify-email' && (
          <div className="min-h-screen relative flex items-center justify-center p-4 bg-gradient-to-b from-slate-50 to-white">
            <div className="bg-white rounded-2xl shadow-2xl p-8 max-w-xl w-full text-center border border-gray-100">
              <div className="flex items-center justify-center mb-4">
                <img src="/icons/icon.webp" alt="Candel FZE" className="h-16 w-16 rounded-full shadow-md" onError={(e)=>{ e.target.src = 'https://ikgxslfmmcgneoivupee.supabase.co/storage/v1/object/public/app-assets/ChatGPT%20Image%20Nov%2028,%202025,%2010_23_53%20AM.png'; }} />
              </div>
              <h2 className="text-2xl font-bold mb-2 text-slate-800">Verify Your Candel FZE Account</h2>
              <p className="text-sm text-slate-600 mb-4">Welcome to Candel FZE — to finish setting up your account please verify your email. Paste the verification link or the short code from the email below and click Verify.</p>
              <VerifyEmailForm />
              <div className="mt-4">
                <button onClick={() => { guardedNavigateToLanding(); }} className="w-full border border-slate-200 py-3 rounded-xl text-slate-700 hover:bg-slate-50">Return to Home</button>
              </div>
              <p className="text-xs text-slate-500 mt-6">Didn't receive the email? Check your spam folder. If necessary, use the Sign In flow to resend the verification link to unverified accounts.</p>
              <div className="text-xs text-slate-400 mt-2">Candel FZE • Secure verification for your account</div>
            </div>
          </div>
        )}
       
       {/* Global loading overlay shown while background operations are in progress */}
      {submittingEntriesCount > 0 && (
        <div className="fixed inset-0 z-[95] flex items-center justify-center bg-black/40">
          <div className="bg-white p-6 rounded-xl shadow-lg flex flex-col items-center gap-3 max-w-sm mx-4">
            <div className="animate-spin rounded-full h-10 w-10 border-4 border-gray-300" style={{ borderTopColor: '#06b6d4' }} />
            <div className="font-semibold text-sm text-gray-800">Saving…</div>
            <div className="text-xs text-gray-500 mt-1">Your entries are syncing — you will remain on this form.</div>
          </div>
        </div>
      )}
       {isBusy && (
         <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/40">
           <div className="bg-white p-6 rounded-xl shadow-lg flex flex-col items-center gap-3 max-w-sm mx-4">
             <div className="animate-spin rounded-full h-10 w-10 border-4 border-gray-300" style={{ borderTopColor: '#06b6d4' }} />
             <div className="font-semibold text-sm text-gray-800">{busyMessage || 'Working… please wait'}</div>
            {busyMessage && <div className="text-xs text-gray-500 mt-1">This may take a few seconds.</div>}
            {showBusyDismiss && (
              <div className="mt-3 flex items-center gap-3">
                <button onClick={() => setBusy(false, '')} className="px-3 py-1 rounded bg-gray-200 text-gray-800 font-medium">Dismiss</button>
                <button onClick={() => { window.location.reload(); }} className="px-3 py-1 rounded bg-[#06b6d4] text-white font-medium">Reload</button>
              </div>
            )}
           </div>
         </div>
       )}

       {currentView !== 'loading' && <Toast message={toastMsg} type={toastType} onClose={() => setToastMsg('')} />}
      </div>
    </>
  );
}

// Small helper component used in the verify-email view for parsing/pasting codes
function VerifyEmailForm(){
  const [input, setInput] = React.useState('');
  const [working, setWorking] = React.useState(false);

  const extractCode = (value) => {
    if (!value) return null;
    try {
      // If user pasted a full URL, parse query/hash
      const u = new URL(value, window.location.origin);
      const p = new URLSearchParams(u.search);
      if (p.get('oobCode')) return p.get('oobCode');
      // some links embed params in hash
      const hash = u.hash && u.hash.replace(/^#/, '');
      if (hash) {
        const hp = new URLSearchParams(hash.replace(/^\/?/, ''));
        if (hp.get('oobCode')) return hp.get('oobCode');
      }
    } catch (e) {
      // not a url, treat value as raw code
    }
    // fallback: treat the input value as raw oobCode
    return value.trim();
  };

  const handleVerify = async () => {
    const codeFromUrl = (() => {
      try { const p = new URLSearchParams(window.location.search); if (p.get('oobCode')) return p.get('oobCode'); } catch(e){}
      try { const h = window.location.hash.replace(/^#/, ''); const hp = new URLSearchParams(h); if (hp.get('oobCode')) return hp.get('oobCode'); } catch(e){}
      return null;
    })();

    const raw = input || codeFromUrl;
    const oobCode = extractCode(raw);
    if (!oobCode) { showToast('No verification code found. Paste the full link or code.', 'warning'); return; }

    setWorking(true);
    try {
      // ensure auth instance available
      const theAuth = (typeof auth !== 'undefined' && auth) ? auth : getAuth();
      await applyActionCode(theAuth, oobCode);
      showToast('Email verified successfully', 'success');
      // clear query/hash to avoid re-processing
      try { window.history.replaceState({}, document.title, window.location.pathname); } catch(e){}
      // give user a moment then navigate home so they can sign in
      setTimeout(() => { try { window.location.reload(); } catch(e){} }, 800);
    } catch (err) {
      console.error('applyActionCode failed', err);
      showToast(err?.message || 'Verification failed — code may be invalid or expired', 'warning');
    } finally { setWorking(false); }
  };

  return (
    <div className="space-y-3">
      <input value={input} onChange={(e) => setInput(e.target.value)} placeholder="Paste verification link or code" className="w-full p-3 border border-gray-300 rounded" />
      <div className="flex gap-3">
        <button onClick={handleVerify} disabled={working} className="flex-1 bg-[#00cba9] text-black py-3 rounded-xl font-bold hover:bg-[#00e0b7] transition">{working ? 'Verifying...' : 'Verify Now'}</button>
        <button onClick={() => { setInput(''); }} className="px-4 py-3 border rounded">Clear</button>
      </div>
    </div>
  );
}