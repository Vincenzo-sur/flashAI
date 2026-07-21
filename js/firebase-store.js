// ============================================================
//  EduFlash AI — Firebase Firestore Adapter (firebase-store.js)
//  Day 6: Cloud persistence layer wrapping the EduStore API.
//
//  Usage:
//    1. Teacher opens Settings → Firebase Setup
//    2. Pastes their Firebase project config JSON
//    3. EduStore.isFirebaseEnabled() returns true
//    4. All reads/writes transparently go to Firestore
//
//  When no config is present the app falls back to localStorage
//  (existing Day 1-5 behaviour — zero breakage).
// ============================================================

(function () {
  'use strict';

  const FIREBASE_CONFIG_KEY = 'ef_firebase_config';
  const SESSIONS_COLLECTION  = 'ef_sessions';

  // ── Internal state ─────────────────────────────────────────
  let _db          = null;   // Firestore db reference
  let _app         = null;   // Firebase app reference
  let _unsubscribe = null;   // onSnapshot cleanup fn
  let _ready       = false;  // True once SDK + init is complete

  // ── Public API ──────────────────────────────────────────────
  const FirebaseStore = {

    /**
     * Attempt to initialise Firebase from a stored config.
     * Returns a Promise<boolean> — true if Firebase is now active.
     */
    async init() {
      const config = this.getStoredConfig();
      if (!config) return false;

      try {
        await loadFirebaseSDK();
        _app = firebase.apps.length
          ? firebase.app()
          : firebase.initializeApp(config);
        _db    = firebase.firestore();
        _ready = true;
        console.log('[EduFlash] Firebase Firestore connected ✓');
        return true;
      } catch (err) {
        console.error('[EduFlash] Firebase init failed:', err);
        _ready = false;
        return false;
      }
    },

    isReady() { return _ready; },

    // ── Config storage ───────────────────────────────────────
    getStoredConfig() {
      try {
        const raw = localStorage.getItem(FIREBASE_CONFIG_KEY);
        return raw ? JSON.parse(raw) : null;
      } catch { return null; }
    },

    saveConfig(configObj) {
      localStorage.setItem(FIREBASE_CONFIG_KEY, JSON.stringify(configObj));
    },

    clearConfig() {
      localStorage.removeItem(FIREBASE_CONFIG_KEY);
      _ready = false;
      _db    = null;
      if (_unsubscribe) { _unsubscribe(); _unsubscribe = null; }
    },

    // ── Sessions CRUD — mirrors EduStore API ─────────────────

    /** Returns Promise<Array> */
    async getSessions() {
      if (!_ready) throw new Error('Firebase not ready');
      const snap = await _db.collection(SESSIONS_COLLECTION)
        .orderBy('createdAt', 'desc')
        .get();
      return snap.docs.map(d => ({ ...d.data(), _docId: d.id }));
    },

    /** Returns Promise<Object|null> */
    async getSessionById(id) {
      if (!_ready) throw new Error('Firebase not ready');
      const snap = await _db.collection(SESSIONS_COLLECTION)
        .where('id', '==', id)
        .limit(1)
        .get();
      if (snap.empty) return null;
      const d = snap.docs[0];
      return { ...d.data(), _docId: d.id };
    },

    /** Returns Promise<void> */
    async addSession(session) {
      if (!_ready) throw new Error('Firebase not ready');
      const docData = { ...session, createdAt: firebase.firestore.FieldValue.serverTimestamp() };
      await _db.collection(SESSIONS_COLLECTION).add(docData);
    },

    /** Returns Promise<boolean> */
    async updateSession(updatedSession) {
      if (!_ready) throw new Error('Firebase not ready');
      const snap = await _db.collection(SESSIONS_COLLECTION)
        .where('id', '==', updatedSession.id)
        .limit(1)
        .get();
      if (snap.empty) return false;
      await snap.docs[0].ref.update(updatedSession);
      return true;
    },

    /** Returns Promise<void> */
    async deleteSession(id) {
      if (!_ready) throw new Error('Firebase not ready');
      const snap = await _db.collection(SESSIONS_COLLECTION)
        .where('id', '==', id)
        .limit(1)
        .get();
      if (!snap.empty) await snap.docs[0].ref.delete();
    },

    /** Returns Promise<boolean> */
    async addStudentResponse(sessionId, response) {
      if (!_ready) throw new Error('Firebase not ready');
      const snap = await _db.collection(SESSIONS_COLLECTION)
        .where('id', '==', sessionId)
        .limit(1)
        .get();
      if (snap.empty) return false;
      const docRef = snap.docs[0].ref;
      await docRef.update({
        responses: firebase.firestore.FieldValue.arrayUnion(response)
      });
      return true;
    },

    /**
     * Subscribe to real-time session updates.
     * @param {Function} callback  Called with the full sessions array on every change.
     * @returns {Function} unsubscribe function
     */
    onSessionsChange(callback) {
      if (!_ready || !_db) return () => {};
      if (_unsubscribe) _unsubscribe();
      _unsubscribe = _db.collection(SESSIONS_COLLECTION)
        .orderBy('createdAt', 'desc')
        .onSnapshot(snap => {
          const sessions = snap.docs.map(d => ({ ...d.data(), _docId: d.id }));
          callback(sessions);
        }, err => {
          console.error('[EduFlash] Firestore listener error:', err);
        });
      return _unsubscribe;
    }
  };

  // ── Seed Firestore with default sessions if empty ───────────
  FirebaseStore.seedIfEmpty = async function (defaultSessions) {
    if (!_ready) return;
    const snap = await _db.collection(SESSIONS_COLLECTION).limit(1).get();
    if (snap.empty) {
      const batch = _db.batch();
      defaultSessions.forEach(sess => {
        const ref = _db.collection(SESSIONS_COLLECTION).doc();
        batch.set(ref, { ...sess, createdAt: firebase.firestore.FieldValue.serverTimestamp() });
      });
      await batch.commit();
      console.log('[EduFlash] Firestore seeded with default sessions ✓');
    }
  };

  // ── SDK Loader ───────────────────────────────────────────────
  function loadFirebaseSDK() {
    if (typeof firebase !== 'undefined' && firebase.firestore) return Promise.resolve();

    return new Promise((resolve, reject) => {
      const scripts = [
        'https://www.gstatic.com/firebasejs/9.23.0/firebase-app-compat.js',
        'https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore-compat.js'
      ];

      function loadNext(index) {
        if (index >= scripts.length) { resolve(); return; }
        const s = document.createElement('script');
        s.src = scripts[index];
        s.onload = () => loadNext(index + 1);
        s.onerror = () => reject(new Error(`Failed to load ${scripts[index]}`));
        document.head.appendChild(s);
      }

      loadNext(0);
    });
  }

  // ── Export ───────────────────────────────────────────────────
  window.FirebaseStore = FirebaseStore;
})();
