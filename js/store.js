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
  API_KEY: 'ef_gemini_api_key',
  PLANNER: 'ef_student_planner',
  QUESTIONS: 'ef_student_questions',
  DISCUSSIONS: 'ef_peer_discussions',
  // Day 19
  LIVE_POLL: 'ef_live_poll',
  COLLAB_NOTES: 'ef_collab_notes',
  MARKETPLACE: 'ef_marketplace',
  MISCONCEPTIONS: 'ef_misconceptions'
};

// Initial mock sessions to populate if the store is empty
const defaultSessions = [
  {
    id: 'session-1',
    subject: 'Physics',
    topic: "Newton's Laws of Motion",
    date: new Date().toISOString().split('T')[0],
    status: 'live',
    classroomId: 'course-phy-101',
    courseName: 'AP Physics 1 — Period 3',
    classroomUrl: 'https://classroom.google.com/c/course-phy-101',
    courseWorkId: 'cw-mock-1',
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
  // ── Student Practice Planner Schedule ─────────────────────
  getPlannerSchedule() {
    try {
      return JSON.parse(localStorage.getItem(STORE_KEYS.PLANNER)) || [];
    } catch {
      return [];
    }
  },
  savePlannerSchedule(scheduleItems) {
    localStorage.setItem(STORE_KEYS.PLANNER, JSON.stringify(scheduleItems));
  },
  addPlannerItem(item) {
    const list = this.getPlannerSchedule();
    const existingIdx = list.findIndex(i => i.sessionId === item.sessionId);
    if (existingIdx !== -1) {
      list[existingIdx] = item;
    } else {
      list.unshift(item);
    }
    this.savePlannerSchedule(list);
    return list;
  },
  removePlannerItem(sessionId) {
    const list = this.getPlannerSchedule().filter(i => i.sessionId !== sessionId);
    this.savePlannerSchedule(list);
    return list;
  },

  // ── Student → Teacher Questions ─────────────────────────────
  getQuestions() {
    try {
      return JSON.parse(localStorage.getItem(STORE_KEYS.QUESTIONS)) || [];
    } catch {
      return [];
    }
  },
  saveQuestions(questions) {
    localStorage.setItem(STORE_KEYS.QUESTIONS, JSON.stringify(questions));
  },
  addQuestion(questionObj) {
    const questions = this.getQuestions();
    questions.unshift(questionObj);
    this.saveQuestions(questions);
    return questions;
  },
  replyToQuestion(questionId, replyText) {
    const questions = this.getQuestions();
    const q = questions.find(item => item.id === questionId);
    if (q) {
      q.reply = replyText;
      q.repliedAt = new Date().toISOString();
      q.status = 'answered';
      this.saveQuestions(questions);
    }
    return questions;
  },
  toggleQuestionResolved(questionId) {
    const questions = this.getQuestions();
    const q = questions.find(item => item.id === questionId);
    if (q) {
      q.status = q.status === 'resolved' ? (q.reply ? 'answered' : 'pending') : 'resolved';
      this.saveQuestions(questions);
    }
    return questions;
  },

  // ── Student ↔ Student Peer Discussions ──────────────────────
  getDiscussions() {
    try {
      return JSON.parse(localStorage.getItem(STORE_KEYS.DISCUSSIONS)) || [];
    } catch {
      return [];
    }
  },
  saveDiscussions(discussions) {
    localStorage.setItem(STORE_KEYS.DISCUSSIONS, JSON.stringify(discussions));
  },
  addDiscussion(discussionObj) {
    const discussions = this.getDiscussions();
    discussions.unshift(discussionObj);
    this.saveDiscussions(discussions);
    return discussionObj;
  },
  addDiscussionReply(discussionId, replyObj) {
    const discussions = this.getDiscussions();
    const d = discussions.find(item => item.id === discussionId);
    if (d) {
      if (!d.replies) d.replies = [];
      d.replies.push(replyObj);
      d.updatedAt = new Date().toISOString();
      this.saveDiscussions(discussions);
    }
    return d;
  },
  upvoteReply(discussionId, replyId) {
    const discussions = this.getDiscussions();
    const d = discussions.find(item => item.id === discussionId);
    if (d && d.replies) {
      const r = d.replies.find(item => item.id === replyId);
      if (r) {
        r.upvotes = (r.upvotes || 0) + 1;
        this.saveDiscussions(discussions);
      }
    }
    return d;
  },
  markBestAnswer(discussionId, replyId) {
    const discussions = this.getDiscussions();
    const d = discussions.find(item => item.id === discussionId);
    if (d && d.replies) {
      d.replies.forEach(r => {
        r.isBest = (r.id === replyId) ? !r.isBest : false;
      });
      d.isResolved = d.replies.some(r => r.isBest);
      this.saveDiscussions(discussions);
    }
    return d;
  },

  // ── Day 19: Live Poll Engine ─────────────────────────────────
  getActivePoll() {
    try { return JSON.parse(localStorage.getItem(STORE_KEYS.LIVE_POLL)) || null; } catch { return null; }
  },
  createPoll(question, options) {
    const poll = {
      id: 'poll-' + Date.now(),
      question,
      options,
      votes: options.map(() => []),  // array of voter name arrays per option
      isActive: true,
      createdAt: new Date().toISOString()
    };
    localStorage.setItem(STORE_KEYS.LIVE_POLL, JSON.stringify(poll));
    return poll;
  },
  submitPollAnswer(optionIndex, voterName) {
    const poll = this.getActivePoll();
    if (!poll || !poll.isActive) return null;
    // Remove previous vote by this voter
    poll.votes = poll.votes.map(voters => voters.filter(v => v !== voterName));
    poll.votes[optionIndex].push(voterName);
    localStorage.setItem(STORE_KEYS.LIVE_POLL, JSON.stringify(poll));
    return poll;
  },
  endPoll() {
    const poll = this.getActivePoll();
    if (poll) { poll.isActive = false; localStorage.setItem(STORE_KEYS.LIVE_POLL, JSON.stringify(poll)); }
    return poll;
  },
  clearPoll() {
    localStorage.removeItem(STORE_KEYS.LIVE_POLL);
  },

  // ── Day 19: Collaborative Class Notes ───────────────────────
  getCollabNotes(sessionId) {
    try {
      const all = JSON.parse(localStorage.getItem(STORE_KEYS.COLLAB_NOTES)) || {};
      return all[sessionId] || [];
    } catch { return []; }
  },
  addCollabNote(sessionId, text, author) {
    const all = (() => { try { return JSON.parse(localStorage.getItem(STORE_KEYS.COLLAB_NOTES)) || {}; } catch { return {}; } })();
    if (!all[sessionId]) all[sessionId] = [];
    const note = { id: 'note-' + Date.now(), text, author, isPinned: false, createdAt: new Date().toISOString() };
    all[sessionId].unshift(note);
    localStorage.setItem(STORE_KEYS.COLLAB_NOTES, JSON.stringify(all));
    return note;
  },
  togglePinNote(sessionId, noteId) {
    const all = (() => { try { return JSON.parse(localStorage.getItem(STORE_KEYS.COLLAB_NOTES)) || {}; } catch { return {}; } })();
    if (!all[sessionId]) return;
    const note = all[sessionId].find(n => n.id === noteId);
    if (note) { note.isPinned = !note.isPinned; localStorage.setItem(STORE_KEYS.COLLAB_NOTES, JSON.stringify(all)); }
  },

  // ── Day 19: Flashcard Marketplace ───────────────────────────
  getMarketplaceDecks() {
    try { return JSON.parse(localStorage.getItem(STORE_KEYS.MARKETPLACE)) || []; } catch { return []; }
  },
  publishDeckToMarketplace(session, publisherName) {
    const decks = this.getMarketplaceDecks();
    const existing = decks.findIndex(d => d.sourceSessionId === session.id);
    if (existing !== -1) { if (typeof showToast === 'function') showToast('Deck already published!', 'info'); return decks[existing]; }
    const deck = {
      id: 'mkt-' + Date.now(),
      sourceSessionId: session.id,
      title: `${session.topic}`,
      subject: session.subject || 'General',
      topic: session.topic,
      cards: session.cards || [],
      publisher: publisherName || 'Teacher',
      rating: 0,
      ratingCount: 0,
      imports: 0,
      tags: [session.subject || 'General', session.topic],
      publishedAt: new Date().toISOString()
    };
    decks.unshift(deck);
    localStorage.setItem(STORE_KEYS.MARKETPLACE, JSON.stringify(decks));
    return deck;
  },
  rateDeck(deckId, stars) {
    const decks = this.getMarketplaceDecks();
    const deck = decks.find(d => d.id === deckId);
    if (deck) {
      const total = deck.rating * deck.ratingCount + stars;
      deck.ratingCount++;
      deck.rating = total / deck.ratingCount;
      localStorage.setItem(STORE_KEYS.MARKETPLACE, JSON.stringify(decks));
    }
  },
  importMarketplaceDeck(deckId) {
    const decks = this.getMarketplaceDecks();
    const deck = decks.find(d => d.id === deckId);
    if (!deck) return null;
    deck.imports = (deck.imports || 0) + 1;
    localStorage.setItem(STORE_KEYS.MARKETPLACE, JSON.stringify(decks));
    // Create a new draft session from the deck
    const newSession = {
      id: 'session-imported-' + Date.now(),
      subject: deck.subject,
      topic: `[Imported] ${deck.topic}`,
      date: new Date().toISOString().split('T')[0],
      status: 'draft',
      cards: deck.cards.map(c => ({ ...c, id: 'card-imp-' + Math.random().toString(36).substr(2, 8) })),
      responses: []
    };
    this.addSession(newSession);
    return newSession;
  },

  // ── Day 19: Misconception Detector ──────────────────────────
  getMisconceptionData(sessionId) {
    const session = this.getSessionById(sessionId);
    if (!session || !session.responses || !session.cards) return null;
    // Per card: count how many students chose each wrong option
    return session.cards.map(card => {
      const wrongOptionCounts = card.options.map((_, i) => 0);
      let totalWrong = 0;
      session.responses.forEach(r => {
        const cr = (r.cardResponses || []).find(x => x.cardId === card.id);
        if (cr && !cr.isCorrect && typeof cr.selectedIndex === 'number') {
          wrongOptionCounts[cr.selectedIndex]++;
          totalWrong++;
        }
      });
      // Most chosen wrong option
      let maxWrong = 0; let dominantWrongIdx = -1;
      wrongOptionCounts.forEach((c, i) => { if (i !== card.correctIndex && c > maxWrong) { maxWrong = c; dominantWrongIdx = i; } });
      return {
        cardId: card.id,
        question: card.question,
        options: card.options,
        correctIndex: card.correctIndex,
        wrongOptionCounts,
        dominantWrongIdx,
        dominantWrongText: dominantWrongIdx >= 0 ? card.options[dominantWrongIdx] : null,
        dominantWrongCount: maxWrong,
        totalWrong,
        totalResponses: session.responses.length
      };
    }).filter(d => d.totalWrong > 0);
  },
  saveMisconceptionReport(sessionId, report) {
    const all = (() => { try { return JSON.parse(localStorage.getItem(STORE_KEYS.MISCONCEPTIONS)) || {}; } catch { return {}; } })();
    all[sessionId] = { report, generatedAt: new Date().toISOString() };
    localStorage.setItem(STORE_KEYS.MISCONCEPTIONS, JSON.stringify(all));
  },
  getMisconceptionReport(sessionId) {
    try {
      const all = JSON.parse(localStorage.getItem(STORE_KEYS.MISCONCEPTIONS)) || {};
      return all[sessionId] || null;
    } catch { return null; }
  }
};

// Export to window
window.EduStore = EduStore;
// Init local store immediately (original behaviour)
LocalStore.init();
