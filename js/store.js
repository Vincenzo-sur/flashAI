// ============================================================
//  EduFlash AI — Shared Data Store Manager
//  Day 1-5: localStorage CRUD for sessions and API keys
//  Day 6: Firebase Firestore routing layer added.
//         When FirebaseStore.isReady() === true, all session
//         reads/writes are transparently delegated to Firestore.
//         Falls back to localStorage when Firebase is not configured.
// ============================================================

const STORE_KEYS = {
  SESSIONS: 'ef_sessions',
  API_KEY: 'ef_gemini_api_key'
};

// Initial mock sessions to populate if the store is empty
const defaultSessions = [
  {
    id: 'session-1',
    subject: 'Physics',
    topic: "Newton's Laws of Motion",
    date: new Date().toISOString().split('T')[0],
    status: 'live',
    cards: [
      {
        id: 'card-1-1',
        question: "Which of Newton's laws states that an object at rest stays at rest unless acted on by an external force?",
        options: ["Newton's Second Law", "Newton's First Law", "Newton's Third Law", "Law of Gravitation"],
        correctIndex: 1,
        answer: "Newton's First Law of Motion, also called the Law of Inertia — objects resist changes to their state of motion.",
        topic: "Inertia"
      },
      {
        id: 'card-1-2',
        question: "What does F = ma represent in classical mechanics?",
        options: ["Force equals mass times acceleration", "Frequency equals mass times area", "Force equals momentum times angle", "None of the above"],
        correctIndex: 0,
        answer: "Newton's Second Law: Force (F) equals mass (m) multiplied by acceleration (a). It describes how a net force changes an object's motion.",
        topic: "Force & Acceleration"
      },
      {
        id: 'card-1-3',
        question: "Newton's Third Law states that every action has an equal and opposite...",
        options: ["Velocity", "Momentum", "Reaction", "Energy"],
        correctIndex: 2,
        answer: "Every action has an equal and opposite reaction. Forces always come in pairs — if object A exerts a force on object B, B exerts an equal and opposite force on A.",
        topic: "Action-Reaction"
      }
    ],
    responses: [
      { studentId: "stud-01", cardResponses: [{ cardId: "card-1-1", selectedIndex: 1, isCorrect: true, rating: "know" }, { cardId: "card-1-2", selectedIndex: 0, isCorrect: true, rating: "know" }, { cardId: "card-1-3", selectedIndex: 2, isCorrect: true, rating: "know" }] },
      { studentId: "stud-02", cardResponses: [{ cardId: "card-1-1", selectedIndex: 1, isCorrect: true, rating: "know" }, { cardId: "card-1-2", selectedIndex: 1, isCorrect: false, rating: "fuzzy" }, { cardId: "card-1-3", selectedIndex: 2, isCorrect: true, rating: "know" }] },
      { studentId: "stud-03", cardResponses: [{ cardId: "card-1-1", selectedIndex: 0, isCorrect: false, rating: "nope" }, { cardId: "card-1-2", selectedIndex: 0, isCorrect: true, rating: "fuzzy" }, { cardId: "card-1-3", selectedIndex: 1, isCorrect: false, rating: "nope" }] },
      { studentId: "stud-04", cardResponses: [{ cardId: "card-1-1", selectedIndex: 1, isCorrect: true, rating: "fuzzy" }, { cardId: "card-1-2", selectedIndex: 0, isCorrect: true, rating: "know" }, { cardId: "card-1-3", selectedIndex: 2, isCorrect: true, rating: "fuzzy" }] }
    ]
  },
  {
    id: 'session-2',
    subject: 'Physics',
    topic: 'Work, Energy and Power',
    date: new Date(Date.now() - 86400000).toISOString().split('T')[0],
    status: 'closed',
    cards: [
      {
        id: 'card-2-1',
        question: "What is the SI unit of work?",
        options: ["Newton", "Watt", "Joule", "Pascal"],
        correctIndex: 2,
        answer: "The Joule (J) is the SI unit of work and energy. It represents the work done by a force of one newton moving an object one meter.",
        topic: "Work Units"
      },
      {
        id: 'card-2-2',
        question: "Kinetic energy of an object of mass m moving with velocity v is given by which formula?",
        options: ["mgh", "1/2 m v^2", "m v", "1/2 m^2 v"],
        correctIndex: 1,
        answer: "Kinetic Energy (KE) = 1/2 m v^2. It depends quadratically on velocity and linearly on mass.",
        topic: "Kinetic Energy"
      }
    ],
    responses: [
      { studentId: "stud-01", cardResponses: [{ cardId: "card-2-1", selectedIndex: 2, isCorrect: true, rating: "know" }, { cardId: "card-2-2", selectedIndex: 1, isCorrect: true, rating: "know" }] },
      { studentId: "stud-02", cardResponses: [{ cardId: "card-2-1", selectedIndex: 2, isCorrect: true, rating: "know" }, { cardId: "card-2-2", selectedIndex: 1, isCorrect: true, rating: "know" }] }
    ]
  },
  {
    id: 'session-3',
    subject: 'Physics',
    topic: 'Thermodynamics — Part 1',
    date: '2026-07-15',
    status: 'closed',
    cards: [
      {
        id: 'card-3-1',
        question: "Which law states that energy cannot be created or destroyed, only transformed?",
        options: ["Zeroth Law", "First Law", "Second Law", "Third Law"],
        correctIndex: 1,
        answer: "The First Law of Thermodynamics is the law of conservation of energy applied to thermodynamic systems.",
        topic: "First Law"
      }
    ],
    responses: []
  },
  {
    id: 'session-4',
    subject: 'Physics',
    topic: 'Waves and Oscillations',
    date: '2026-07-12',
    status: 'closed',
    cards: [
      {
        id: 'card-4-1',
        question: "What type of wave is sound in air?",
        options: ["Transverse", "Electromagnetic", "Longitudinal", "Torsional"],
        correctIndex: 2,
        answer: "Sound waves in air are longitudinal waves because the particles of the medium vibrate parallel to the direction of wave propagation.",
        topic: "Wave Types"
      }
    ],
    responses: []
  },
  {
    id: 'session-5',
    subject: 'Physics',
    topic: "Gravitation — Kepler's Laws",
    date: '2026-07-16',
    status: 'draft',
    cards: [
      {
        id: 'card-5-1',
        question: "Kepler's First Law states that orbits of planets are what shape?",
        options: ["Perfect Circles", "Ellipses", "Parabolas", "Hyperbolas"],
        correctIndex: 1,
        answer: "Planets orbit the Sun in ellipses, with the Sun at one of the two foci.",
        topic: "Planetary Orbits"
      }
    ],
    responses: []
  },
  {
    id: 'session-6',
    subject: 'Physics',
    topic: 'Electromagnetic Induction',
    date: '2026-07-14',
    status: 'draft',
    cards: [
      {
        id: 'card-6-1',
        question: "Which law explains the direction of induced current?",
        options: ["Faraday's Law", "Lenz's Law", "Ampere's Law", "Ohm's Law"],
        correctIndex: 1,
        answer: "Lenz's Law states that the direction of the induced current is always such that it opposes the change in magnetic flux that produced it.",
        topic: "Lenz's Law"
      }
    ],
    responses: []
  }
];

// ── localStorage adapter (original Day 1-5 implementation) ───
const LocalStore = {
  init() {
    if (!localStorage.getItem(STORE_KEYS.SESSIONS)) {
      localStorage.setItem(STORE_KEYS.SESSIONS, JSON.stringify(defaultSessions));
    }
  },
  getSessions() {
    this.init();
    try {
      return JSON.parse(localStorage.getItem(STORE_KEYS.SESSIONS)) || [];
    } catch (e) {
      console.error("Error parsing sessions:", e);
      return [];
    }
  },
  saveSessions(sessions) {
    localStorage.setItem(STORE_KEYS.SESSIONS, JSON.stringify(sessions));
  },
  getSessionById(id) {
    return this.getSessions().find(s => s.id === id) || null;
  },
  addSession(session) {
    const sessions = this.getSessions();
    sessions.unshift(session);
    this.saveSessions(sessions);
  },
  updateSession(updated) {
    const sessions = this.getSessions();
    const idx = sessions.findIndex(s => s.id === updated.id);
    if (idx !== -1) { sessions[idx] = updated; this.saveSessions(sessions); return true; }
    return false;
  },
  deleteSession(id) {
    this.saveSessions(this.getSessions().filter(s => s.id !== id));
  },
  addStudentResponse(sessionId, response) {
    const sessions = this.getSessions();
    const session = sessions.find(s => s.id === sessionId);
    if (session) {
      if (!session.responses) session.responses = [];
      session.responses.push(response);
      this.saveSessions(sessions);
      return true;
    }
    return false;
  }
};

// ── Unified EduStore — routes to Firebase or localStorage ────
const EduStore = {

  // ── Day 6: Firebase routing helpers ─────────────────────────
  isFirebaseEnabled() {
    return typeof window.FirebaseStore !== 'undefined' && window.FirebaseStore.isReady();
  },

  /**
   * Initialise Firebase if a config exists.
   * Called once on page load in teacher.js / student.js.
   * Returns Promise<boolean>
   */
  async initFirebase() {
    if (typeof window.FirebaseStore === 'undefined') return false;
    const ok = await window.FirebaseStore.init();
    if (ok) {
      // Seed Firestore with default data if it's empty
      await window.FirebaseStore.seedIfEmpty(defaultSessions);
    }
    return ok;
  },

  /**
   * Subscribe to real-time updates from Firestore.
   * Falls back to a no-op when in local mode.
   * @param {Function} callback  Receives (sessions[])
   * @returns {Function} unsubscribe
   */
  onSessionsChange(callback) {
    if (this.isFirebaseEnabled()) {
      return window.FirebaseStore.onSessionsChange(callback);
    }
    return () => {}; // no-op in local mode
  },

  // ── Sessions CRUD — synchronous local / async firebase ──────

  /** Sync in local mode; returns Array. Async in Firebase mode (avoid direct call — use getSessionsAsync). */
  getSessions() {
    // Synchronous path for backwards-compat with existing code
    return LocalStore.getSessions();
  },

  /** Always returns Promise<Array> — use this in new async contexts */
  async getSessionsAsync() {
    if (this.isFirebaseEnabled()) {
      return window.FirebaseStore.getSessions();
    }
    return LocalStore.getSessions();
  },

  getSessionById(id) {
    return LocalStore.getSessionById(id);
  },

  async getSessionByIdAsync(id) {
    if (this.isFirebaseEnabled()) {
      return window.FirebaseStore.getSessionById(id);
    }
    return LocalStore.getSessionById(id);
  },

  /** Saves to both localStorage (sync) and Firestore (async) */
  addSession(session) {
    LocalStore.addSession(session); // keep local copy immediately
    if (this.isFirebaseEnabled()) {
      window.FirebaseStore.addSession(session).catch(e =>
        console.error('[EduStore] Firebase addSession failed:', e)
      );
    }
  },

  updateSession(updated) {
    LocalStore.updateSession(updated);
    if (this.isFirebaseEnabled()) {
      window.FirebaseStore.updateSession(updated).catch(e =>
        console.error('[EduStore] Firebase updateSession failed:', e)
      );
    }
    return true;
  },

  deleteSession(id) {
    LocalStore.deleteSession(id);
    if (this.isFirebaseEnabled()) {
      window.FirebaseStore.deleteSession(id).catch(e =>
        console.error('[EduStore] Firebase deleteSession failed:', e)
      );
    }
  },

  /** Returns a Promise<boolean> so callers can await Firestore write */
  async addStudentResponse(sessionId, response) {
    LocalStore.addStudentResponse(sessionId, response); // write locally instantly
    if (this.isFirebaseEnabled()) {
      try {
        await window.FirebaseStore.addStudentResponse(sessionId, response);
      } catch (e) {
        console.error('[EduStore] Firebase addStudentResponse failed:', e);
      }
    }
    return true;
  },

  // ── Gemini API Key Management (unchanged) ───────────────────
  getApiKey() {
    return localStorage.getItem(STORE_KEYS.API_KEY) || '';
  },
  setApiKey(key) {
    if (key) localStorage.setItem(STORE_KEYS.API_KEY, key.trim());
    else localStorage.removeItem(STORE_KEYS.API_KEY);
  },

  // ── Firebase Config helpers (delegates to FirebaseStore) ────
  getFirebaseConfig() {
    return typeof window.FirebaseStore !== 'undefined'
      ? window.FirebaseStore.getStoredConfig()
      : null;
  },
  saveFirebaseConfig(cfg) {
    if (typeof window.FirebaseStore !== 'undefined') window.FirebaseStore.saveConfig(cfg);
  },
  clearFirebaseConfig() {
    if (typeof window.FirebaseStore !== 'undefined') window.FirebaseStore.clearConfig();
  }
};

// Export to window
window.EduStore = EduStore;
// Init local store immediately (original behaviour)
LocalStore.init();
