// ============================================================
//  EduFlash AI — Student View JS
//  Day 3: Full interactive flashcard review flow
// ============================================================

let currentSession = null;
let currentCardIndex = 0;
let sessionAnswers = []; // Tracks responses for this review session: [{ cardId, selectedIndex, isCorrect, rating }]
let selectedStudyMode = 'standard';
let speedTimerInterval = null;
let speedSecondsLeft = 15;
let currentStudentId = null; // Day 21: Track student ID to link feedback submissions
window.pendingResponsePayload = null; // Day 21: Hold review payload to submit atomically

// Day 21: Local timezone date string helper
function getLocalDateString(dateObj) {
  const d = dateObj || new Date();
  const offset = d.getTimezoneOffset();
  const localTime = new Date(d.getTime() - (offset * 60 * 1000));
  return localTime.toISOString().split('T')[0];
}

// ── Day 11: Spaced Repetition Engine ─────────────────────────
const SpacedRepetitionEngine = {
  getStore() {
    return JSON.parse(localStorage.getItem('ef_spaced_data') || '{}');
  },
  saveStore(store) {
    localStorage.setItem('ef_spaced_data', JSON.stringify(store));
  },
  getDueCards(sessionId, cards) {
    const store = this.getStore();
    const now = new Date().getTime();
    
    const scoredCards = cards.map(c => {
      const key = `${sessionId}_${c.id}`;
      const data = store[key] || { box: 1, nextReview: new Date(now - 1000).toISOString(), lastReview: null, reviewCount: 0 };
      const dueTime = new Date(data.nextReview).getTime();
      return { card: c, data, dueTime, isDue: dueTime <= now };
    });
    
    const dueCards = scoredCards.filter(sc => sc.isDue).sort((a, b) => a.data.box - b.data.box);
    if (dueCards.length === 0) return cards;
    return dueCards.map(sc => sc.card);
  },
  updateCard(sessionId, cardId, rating) {
    const store = this.getStore();
    const key = `${sessionId}_${cardId}`;
    const data = store[key] || { box: 1, nextReview: new Date().toISOString(), lastReview: null, reviewCount: 0 };
    
    if (rating === 'know') data.box = Math.min(5, data.box + 1);
    else if (rating === 'nope') data.box = 1;
    
    const intervals = { 1: 1, 2: 3, 3: 7, 4: 14, 5: 30 };
    const daysToAdd = intervals[data.box] || 1;
    
    const nextDate = new Date();
    nextDate.setDate(nextDate.getDate() + daysToAdd);
    
    data.nextReview = nextDate.toISOString();
    data.lastReview = new Date().toISOString();
    data.reviewCount++;
    
    store[key] = data;
    this.saveStore(store);
  },
  getDueCount(sessionId, cards) {
    const store = this.getStore();
    const now = new Date().getTime();
    let count = 0;
    cards.forEach(c => {
      const key = `${sessionId}_${c.id}`;
      if (store[key]) {
        const dueTime = new Date(store[key].nextReview).getTime();
        if (dueTime <= now) count++;
      } else {
        count++; // never reviewed = due
      }
    });
    return count;
  }
};

// ── Web Speech API Text-to-Speech Helper ─────────────────────
const TTSManager = {
  speak(text) {
    if (!('speechSynthesis' in window)) {
      console.warn('Text-to-speech is not supported in this browser.');
      return;
    }
    window.speechSynthesis.cancel(); // Stop any active utterance
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 0.95;
    utterance.pitch = 1.0;
    window.speechSynthesis.speak(utterance);
  }
};

// ── Web Audio Procedural Synthesizer Sound FX Helper ─────────
const SoundFX = {
  ctx: null,
  getCtx() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) this.ctx = new AudioCtx();
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
    return this.ctx;
  },
  playTone(freq, type, duration, delay = 0) {
    try {
      const ctx = this.getCtx();
      if (!ctx) return;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
      osc.frequency.value = freq;
      osc.connect(gain);
      gain.connect(ctx.destination);
      const startTime = ctx.currentTime + delay;
      gain.gain.setValueAtTime(0.12, startTime);
      gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);
      osc.start(startTime);
      osc.stop(startTime + duration);
    } catch (e) {
      console.warn('Audio FX error:', e);
    }
  },
  playCorrect() {
    this.playTone(523.25, 'sine', 0.15, 0);   // C5
    this.playTone(659.25, 'sine', 0.25, 0.1);  // E5
  },
  playWrong() {
    this.playTone(220, 'sawtooth', 0.2, 0);    // A3
    this.playTone(196, 'sawtooth', 0.3, 0.12); // G3
  },
  playFlip() {
    this.playTone(400, 'triangle', 0.08, 0);
  },
  playFanfare() {
    this.playTone(523.25, 'sine', 0.15, 0);
    this.playTone(659.25, 'sine', 0.15, 0.12);
    this.playTone(783.99, 'sine', 0.3, 0.24);
  }
};

// ============================================================
//  Day 14: XP Engine & Achievement System
// ============================================================

const XPEngine = {
  LEVELS: [
    { name: 'Novice', minXP: 0, emoji: '🌱' },
    { name: 'Scholar', minXP: 100, emoji: '📖' },
    { name: 'Expert', minXP: 300, emoji: '🎓' },
    { name: 'Master', minXP: 600, emoji: '👑' },
    { name: 'Grandmaster', minXP: 1000, emoji: '💎' }
  ],
  STORE_KEY: 'ef_xp_data',

  getStore() {
    return JSON.parse(localStorage.getItem(this.STORE_KEY) || '{"xp":0,"history":[]}');
  },
  saveStore(store) {
    localStorage.setItem(this.STORE_KEY, JSON.stringify(store));
  },
  awardXP(points, reason) {
    const store = this.getStore();
    const prevLevel = this.getLevel(store.xp);
    store.xp += points;
    store.history.push({ points, reason, date: new Date().toISOString() });
    // keep only last 200 entries
    if (store.history.length > 200) store.history = store.history.slice(-200);
    this.saveStore(store);
    const newLevel = this.getLevel(store.xp);
    return { totalXP: store.xp, gained: points, leveledUp: newLevel.name !== prevLevel.name, newLevel, prevLevel };
  },
  getLevel(xp) {
    let level = this.LEVELS[0];
    for (const l of this.LEVELS) {
      if (xp >= l.minXP) level = l;
    }
    return level;
  },
  getLevelProgress(xp) {
    const current = this.getLevel(xp);
    const idx = this.LEVELS.indexOf(current);
    const next = this.LEVELS[idx + 1];
    if (!next) return { current, next: null, progress: 100, currentXP: xp };
    const range = next.minXP - current.minXP;
    const into = xp - current.minXP;
    return { current, next, progress: Math.min(100, Math.round((into / range) * 100)), currentXP: xp };
  },
  getTotalXP() {
    return this.getStore().xp;
  }
};

const AchievementTracker = {
  STORE_KEY: 'ef_achievements',
  BADGES: [
    { id: 'first_steps', name: 'First Steps', emoji: '🏅', desc: 'Complete your first review', check: (ctx) => ctx.totalSessions >= 1 },
    { id: 'sharpshooter', name: 'Sharpshooter', emoji: '🎯', desc: '3 sessions with ≥90% accuracy', check: (ctx) => ctx.highAccSessions >= 3 },
    { id: 'on_fire', name: 'On Fire', emoji: '🔥', desc: '5-day study streak', check: (ctx) => ctx.streakDays >= 5 },
    { id: 'speed_demon', name: 'Speed Demon', emoji: '⚡', desc: 'Speed Sprint with ≥70%', check: (ctx) => ctx.speedSuccess },
    { id: 'bookworm', name: 'Bookworm', emoji: '📚', desc: 'Review 50+ cards total', check: (ctx) => ctx.totalCards >= 50 },
    { id: 'centurion', name: 'Centurion', emoji: '💯', desc: 'Score a perfect 100%', check: (ctx) => ctx.hasPerfect }
  ],

  getUnlocked() {
    return JSON.parse(localStorage.getItem(this.STORE_KEY) || '[]');
  },
  saveUnlocked(list) {
    localStorage.setItem(this.STORE_KEY, JSON.stringify(list));
  },
  checkAndUnlock() {
    const history = JSON.parse(localStorage.getItem('ef_review_history') || '[]');
    const unlocked = this.getUnlocked();
    const ctx = {
      totalSessions: history.length,
      highAccSessions: history.filter(h => h.accuracy >= 90).length,
      streakDays: this._calcStreak(history),
      speedSuccess: history.some(h => h.mode === 'speed' && h.accuracy >= 70),
      totalCards: history.reduce((sum, h) => sum + (h.cardCount || 0), 0),
      hasPerfect: history.some(h => h.accuracy === 100)
    };

    const newUnlocks = [];
    for (const badge of this.BADGES) {
      if (!unlocked.includes(badge.id) && badge.check(ctx)) {
        unlocked.push(badge.id);
        newUnlocks.push(badge);
      }
    }
    this.saveUnlocked(unlocked);
    return newUnlocks;
  },
  _calcStreak(history) {
    const days = [...new Set(history.map(h => new Date(h.date).toDateString()))].sort((a,b) => new Date(b) - new Date(a));
    if (days.length === 0) return 0;
    let streak = 1;
    for (let i = 0; i < days.length - 1; i++) {
      const diff = (new Date(days[i]) - new Date(days[i+1])) / 86400000;
      if (diff <= 1.5) streak++;
      else break;
    }
    return streak;
  }
};

// ============================================================
//  Day 15: Starred Cards — personal bookmarks per session
// ============================================================
const StarredCards = {
  STORE_KEY: 'ef_starred_cards',
  getStore() {
    return JSON.parse(localStorage.getItem(this.STORE_KEY) || '{}');
  },
  saveStore(store) {
    localStorage.setItem(this.STORE_KEY, JSON.stringify(store));
  },
  /** @returns {string[]} card ids starred in the given session */
  getIds(sessionId) {
    const store = this.getStore();
    return Array.isArray(store[sessionId]) ? store[sessionId] : [];
  },
  isStarred(sessionId, cardId) {
    return this.getIds(sessionId).includes(cardId);
  },
  toggle(sessionId, cardId) {
    const store = this.getStore();
    const ids = Array.isArray(store[sessionId]) ? store[sessionId] : [];
    const idx = ids.indexOf(cardId);
    if (idx === -1) ids.push(cardId);
    else ids.splice(idx, 1);
    store[sessionId] = ids;
    this.saveStore(store);
    return this.isStarred(sessionId, cardId);
  },
  getCount(sessionId) {
    return this.getIds(sessionId).length;
  }
};

// ============================================================
//  Day 15: Personal Notes — private study notes per card
// ============================================================
const CardNotes = {
  STORE_KEY: 'ef_card_notes',
  getStore() {
    return JSON.parse(localStorage.getItem(this.STORE_KEY) || '{}');
  },
  saveStore(store) {
    localStorage.setItem(this.STORE_KEY, JSON.stringify(store));
  },
  getNote(sessionId, cardId) {
    const store = this.getStore();
    return store[`${sessionId}_${cardId}`] || '';
  },
  setNote(sessionId, cardId, text) {
    const store = this.getStore();
    const key = `${sessionId}_${cardId}`;
    if (text && text.trim()) store[key] = text.trim();
    else delete store[key];
    this.saveStore(store);
  }
};

// ============================================================
//  Day 15: Study Proficiency — academic progression from
//  focus minutes + mastered cards (no reward spam)
// ============================================================
const StudyProficiency = {
  STORE_KEY: 'ef_proficiency',
  LEVELS: [
    { name: 'Foundations', minPoints: 0,     icon: '🌱', color: '#9aa0a6' },
    { name: 'Developing',  minPoints: 120,   icon: '📘', color: '#4285f4' },
    { name: 'Proficient',  minPoints: 360,   icon: '📗', color: '#34a853' },
    { name: 'Advanced',    minPoints: 720,   icon: '📕', color: '#f29900' },
    { name: 'Master',      minPoints: 1200,  icon: '🎓', color: '#d93025' }
  ],
  // Points: 1 per study minute, +3 per mastered card (correct + Know it)
  MINUTE_POINTS: 1,
  MASTERED_CARD_POINTS: 3,

  getStore() {
    return JSON.parse(localStorage.getItem(this.STORE_KEY) || '{"points":0,"totalMinutes":0,"masteredCards":0,"history":[]}');
  },
  saveStore(store) {
    localStorage.setItem(this.STORE_KEY, JSON.stringify(store));
  },
  getLevel(points) {
    let level = this.LEVELS[0];
    for (const l of this.LEVELS) {
      if (points >= l.minPoints) level = l;
    }
    return level;
  },
  getLevelProgress(points) {
    const current = this.getLevel(points);
    const idx = this.LEVELS.indexOf(current);
    const next = this.LEVELS[idx + 1];
    if (!next) return { current, next: null, progress: 100, points };
    const range = next.minPoints - current.minPoints;
    const into = points - current.minPoints;
    return { current, next, progress: Math.min(100, Math.round((into / range) * 100)), points };
  },
  addMinutes(mins) {
    if (!mins || mins < 1) return null;
    const store = this.getStore();
    const prevLevel = this.getLevel(store.points);
    store.totalMinutes += mins;
    store.points += mins * this.MINUTE_POINTS;
    store.history.push({ type: 'focus', value: mins, date: new Date().toISOString() });
    if (store.history.length > 300) store.history = store.history.slice(-300);
    this.saveStore(store);
    const newLevel = this.getLevel(store.points);
    return { leveledUp: newLevel.name !== prevLevel.name, newLevel, prevLevel, points: store.points };
  },
  addMasteredCard() {
    const store = this.getStore();
    const prevLevel = this.getLevel(store.points);
    store.masteredCards++;
    store.points += this.MASTERED_CARD_POINTS;
    store.history.push({ type: 'mastered', value: 1, date: new Date().toISOString() });
    if (store.history.length > 300) store.history = store.history.slice(-300);
    this.saveStore(store);
    const newLevel = this.getLevel(store.points);
    return { leveledUp: newLevel.name !== prevLevel.name, newLevel, prevLevel, points: store.points };
  }
};

// ============================================================
//  Day 15: Note editor + Proficiency panel renderers
// ============================================================
function toggleNoteEditor(card) {
  const editor = document.getElementById('card-note-editor');
  if (!editor) return;
  const isOpen = editor.classList.contains('open');
  editor.classList.toggle('open', !isOpen);
  if (!isOpen) {
    const textarea = document.getElementById('card-note-textarea');
    if (textarea && currentSession) {
      textarea.value = CardNotes.getNote(currentSession.id, card.id);
    }
  }
}

function saveCardNote() {
  if (!currentSession) return;
  const textarea = document.getElementById('card-note-textarea');
  const editor = document.getElementById('card-note-editor');
  if (!textarea || !editor) return;
  const card = currentSession.cards[currentCardIndex];
  CardNotes.setNote(currentSession.id, card.id, textarea.value);
  const noteBtn = document.getElementById('card-note-btn');
  if (noteBtn) noteBtn.classList.toggle('has-note', textarea.value.trim().length > 0);
  const savedTag = document.getElementById('card-note-saved-tag');
  if (savedTag) savedTag.style.display = 'inline';
  setTimeout(() => { editor.classList.remove('open'); }, 600);
}

function cancelNoteEditor() {
  const editor = document.getElementById('card-note-editor');
  if (editor) editor.classList.remove('open');
}

function renderProficiencyPanel() {
  const container = document.getElementById('proficiency-panel');
  if (!container) return;
  const store = StudyProficiency.getStore();
  const progress = StudyProficiency.getLevelProgress(store.points);
  const level = progress.current;
  const nextLabel = progress.next ? `${progress.next.name} at ${progress.next.minPoints} pts` : 'Max level reached';
  container.innerHTML = `
    <div class="proficiency-panel-header">
      <span class="proficiency-icon">${level.icon}</span>
      <div>
        <div class="proficiency-title">Study Proficiency</div>
        <div class="proficiency-level-name">${level.name}</div>
      </div>
      <span class="proficiency-points">${store.points} pts</span>
    </div>
    <div class="proficiency-bar-track">
      <div class="proficiency-bar-fill" style="width:${progress.progress}%; background:${level.color};"></div>
    </div>
    <div class="proficiency-stats">
      <span>⏱ ${store.totalMinutes} min focused</span>
      <span>✅ ${store.masteredCards} cards mastered</span>
      <span>🎯 ${nextLabel}</span>
    </div>
  `;
}

// ============================================================
//  Day 15: Focus Timer — Pomodoro-style floating widget
// ============================================================
const FocusTimer = {
  PRESETS: [ { label: '5m',  minutes: 5,  breakMin: 1 },
             { label: '15m', minutes: 15, breakMin: 2 },
             { label: '25m', minutes: 25, breakMin: 5 },
             { label: '45m', minutes: 45, breakMin: 10 } ],
  interval: null,
  totalSeconds: 0,
  secondsLeft: 0,
  isRunning: false,
  isBreak: false,
  completedFocusSeconds: 0,
  selectedPreset: null,
  CIRCUMFERENCE: 2 * Math.PI * 24, // ring radius = 24 (56/2 - 4)

  init() {
    if (!document.getElementById('focus-timer-widget')) return;

    // Restore last completed focus time from storage
    try {
      const prof = StudyProficiency.getStore();
      this.completedFocusSeconds = prof.totalMinutes * 60;
    } catch (e) {}

    const preset = this.PRESETS[1]; // default 15m
    this.selectedPreset = preset;
    this.totalSeconds = preset.minutes * 60;
    this.secondsLeft = this.totalSeconds;

    const ring = document.getElementById('focus-timer-ring');
    const timeEl = document.getElementById('focus-timer-time');
    if (ring) {
      ring.style.strokeDasharray = this.CIRCUMFERENCE;
      ring.style.strokeDashoffset = 0;
    }
    if (timeEl) timeEl.textContent = this._format(this.secondsLeft);

    this._renderPresets();

    // Widget interactions
    const widget = document.getElementById('focus-timer-widget');
    widget.addEventListener('click', (e) => {
      // Don't collapse when clicking inside controls
      if (e.target.closest('.focus-timer-body')) return;
      widget.classList.toggle('expanded');
    });

    const mainBtn = document.getElementById('focus-main-btn');
    mainBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.toggle();
    });

    const resetBtn = document.getElementById('focus-reset-btn');
    resetBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.reset();
    });
  },

  _renderPresets() {
    const container = document.getElementById('focus-presets');
    if (!container) return;
    container.innerHTML = '';
    this.PRESETS.forEach((preset, i) => {
      const btn = document.createElement('button');
      btn.className = 'focus-preset-btn';
      if (this.selectedPreset && this.selectedPreset.minutes === preset.minutes) btn.classList.add('active');
      btn.textContent = preset.label;
      btn.dataset.index = i;
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.selectPreset(i);
      });
      container.appendChild(btn);
    });
  },

  selectPreset(index) {
    const preset = this.PRESETS[index];
    if (!preset) return;
    this.stop();
    this.selectedPreset = preset;
    this.isBreak = false;
    this.totalSeconds = preset.minutes * 60;
    this.secondsLeft = this.totalSeconds;
    this._updateRing(0);
    this._updateTime();
    this._setButtonText();
    this._setStatus('');
    this._renderPresets();
  },

  toggle() {
    if (this.isRunning) this.pause();
    else this.start();
  },

  start() {
    if (this.isRunning) return;
    this.isRunning = true;
    const ring = document.getElementById('focus-timer-ring');
    if (ring) {
      ring.classList.remove('break');
      if (this.isBreak) ring.classList.add('break');
      else ring.classList.add('running');
    }
    this._setButtonText();
    this._setStatus(this.isBreak ? '☕ Break — rest a moment' : '🎯 Focus session in progress');
    this.interval = setInterval(() => this._tick(), 1000);
  },

  pause() {
    this.isRunning = false;
    this._clearInterval();
    const ring = document.getElementById('focus-timer-ring');
    if (ring) ring.classList.remove('running', 'break');
    this._setButtonText();
    this._setStatus('⏸ Paused');
  },

  reset() {
    this.stop();
    this.isBreak = false;
    this.secondsLeft = this.totalSeconds;
    this._updateRing(0);
    this._updateTime();
    this._setStatus('');
  },

  stop() {
    this.isRunning = false;
    this._clearInterval();
    const ring = document.getElementById('focus-timer-ring');
    if (ring) ring.classList.remove('running', 'break');
  },

  _tick() {
    this.secondsLeft--;
    if (this.secondsLeft <= 0) {
      this._handleComplete();
      return;
    }
    const elapsed = this.totalSeconds - this.secondsLeft;
    this._updateRing(elapsed / this.totalSeconds);
    this._updateTime();
  },

  _handleComplete() {
    this._clearInterval();
    this.isRunning = false;

    if (!this.isBreak) {
      // Focus session finished — bank the minutes
      const focusMinutes = this.totalSeconds / 60;
      this.completedFocusSeconds += this.totalSeconds;
      try {
        const result = StudyProficiency.addMinutes(focusMinutes);
        if (result && result.leveledUp) {
          this._showLevelUp(result.newLevel, result.points);
        }
      } catch (e) {}

      const statusEl = document.getElementById('focus-timer-status');
      if (statusEl) {
        statusEl.className = 'focus-timer-status done';
        statusEl.textContent = `✅ ${focusMinutes} min focused — proficiency updated`;
      }
      TTSManager.speak('Focus session complete. Well done!');

      // Auto-switch to break
      const breakMin = this.selectedPreset ? this.selectedPreset.breakMin : 5;
      this.isBreak = true;
      this.totalSeconds = breakMin * 60;
      this.secondsLeft = this.totalSeconds;
      this._updateRing(0);
      this._updateTime();
      this._setButtonText();
      const ring = document.getElementById('focus-timer-ring');
      if (ring) {
        ring.classList.remove('running');
        ring.classList.add('break');
      }
      this.isRunning = true;
      this.interval = setInterval(() => this._tick(), 1000);
      this._setStatus('☕ Break — rest a moment');
    } else {
      // Break over — back to focus
      this.isBreak = false;
      this.totalSeconds = this.selectedPreset ? this.selectedPreset.minutes * 60 : 900;
      this.secondsLeft = this.totalSeconds;
      this._updateRing(0);
      this._updateTime();
      this._setButtonText();
      this._setStatus('Focus break finished — ready when you are');
    }
  },

  _updateRing(progress) {
    const ring = document.getElementById('focus-timer-ring');
    if (!ring) return;
    const offset = this.CIRCUMFERENCE * Math.min(1, Math.max(0, progress));
    ring.style.strokeDashoffset = String(offset);
  },

  _updateTime() {
    const timeEl = document.getElementById('focus-timer-time');
    if (timeEl) timeEl.textContent = this._format(this.secondsLeft);
  },

  _setButtonText() {
    const btn = document.getElementById('focus-main-btn');
    if (!btn) return;
    btn.className = 'focus-main-btn';
    if (this.isBreak) btn.classList.add('break');
    else if (this.isRunning) btn.classList.add('running');
    btn.textContent = this.isBreak
      ? (this.isRunning ? '⏸ Pause Break' : '▶ Resume Break')
      : (this.isRunning ? '⏸ Pause' : '▶ Start Focus');
  },

  _setStatus(text) {
    const statusEl = document.getElementById('focus-timer-status');
    if (!statusEl) return;
    if (text) {
      statusEl.className = 'focus-timer-status';
      statusEl.textContent = text;
    } else {
      statusEl.textContent = '';
    }
  },

  _clearInterval() {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
  },

  _format(seconds) {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  },

  _showLevelUp(newLevel, points) {
    const existing = document.getElementById('proficiency-levelup-modal');
    if (existing) existing.remove();
    const modal = document.createElement('div');
    modal.id = 'proficiency-levelup-modal';
    modal.className = 'proficiency-levelup-overlay';
    modal.innerHTML = `
      <div class="proficiency-levelup-content">
        <div class="proficiency-levelup-icon">${newLevel.icon}</div>
        <div class="proficiency-levelup-kicker">New proficiency reached</div>
        <div class="proficiency-levelup-rank">${newLevel.name}</div>
        <div class="proficiency-levelup-sub">Keep studying consistently to reach the next stage.</div>
        <button class="btn btn-green btn-sm" id="proficiency-levelup-close">Continue</button>
      </div>
    `;
    document.body.appendChild(modal);
    modal.addEventListener('click', () => modal.remove());
    modal.querySelector('#proficiency-levelup-close').addEventListener('click', () => modal.remove());
    TTSManager.speak(`You reached the ${newLevel.name} level.`);
  }
};

function setupStudentApp() {
  initStudentEntry();
  initReviewControls();
  checkUrlParams();
  initEduBotTutor(); // Day 11
  initKeyboardShortcuts(); // Day 11
  FocusTimer.init(); // Day 15
  renderProficiencyPanel(); // Day 15
  
  try {
    renderStudentStreakDashboard();
  } catch(e) {
    console.warn("Streak Dashboard error:", e);
  }

  // Day 6: init Firebase in background without blocking UI
  if (typeof window.EduStore !== 'undefined' && window.EduStore.initFirebase) {
    window.EduStore.initFirebase().catch(e => console.warn('Firebase init error:', e));
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', setupStudentApp);
} else {
  setupStudentApp();
}

// ── Check URL Parameters for Direct Links (Day 8) ────────────
function checkUrlParams() {
  const params = new URLSearchParams(window.location.search);
  const sessionId = params.get('session');
  const code = params.get('code') || params.get('courseId');

  const codeInput = document.getElementById('class-code-input');
  if (code && codeInput) {
    codeInput.value = code;
    codeInput.dispatchEvent(new Event('input'));
  }

  if (sessionId) {
    setTimeout(() => {
      const sessionOption = document.querySelector(`.session-option[data-id="${sessionId}"]`);
      if (sessionOption) {
        sessionOption.click();
        const startBtn = document.getElementById('start-btn');
        if (startBtn && !startBtn.disabled) startBtn.click();
      }
    }, 150);
  }
}

// ── Entry Code Validation & Session Selection ───────────────
function initStudentEntry() {
  const codeInput   = document.getElementById('class-code-input');
  const picker      = document.getElementById('session-picker');
  const optionsDiv  = document.getElementById('session-picker-options');
  const startBtn    = document.getElementById('start-btn');
  let selectedSessionId = null;

  if (codeInput && !codeInput.value) {
    codeInput.value = 'ef-2024';
  }

  // Make sure picker and study selector are visible by default
  if (picker) {
    picker.style.display = 'flex';
    picker.classList.add('visible');
  }
  const studySelector = document.getElementById('study-mode-selector');
  if (studySelector) studySelector.style.display = 'block';

  if (codeInput) {
    codeInput.addEventListener('input', () => {
      const val = codeInput.value.trim().toLowerCase();
      try {
        loadSessionsList(val);
      } catch (err) {
        console.warn('loadSessionsList error:', err);
      }
    });
  }

  // Wire Day 9 Study Mode selector buttons
  const modeBtns = document.querySelectorAll('.study-mode-btn');
  modeBtns.forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      modeBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      selectedStudyMode = btn.dataset.mode || 'standard';
    });
  });

  function loadSessionsList(code) {
    let allSessions = [];
    try {
      if (window.EduStore && typeof window.EduStore.getSessions === 'function') {
        allSessions = window.EduStore.getSessions() || [];
      }
    } catch (e) {
      console.warn("EduStore error:", e);
    }

    if (allSessions.length === 0) {
      allSessions = [getDefaultSession()];
    }

    const searchTerm = (code || '').trim().toLowerCase();
    let filtered = allSessions;

    if (searchTerm && searchTerm !== 'ef-2024' && searchTerm.length > 0) {
      filtered = allSessions.filter(s => 
        (s.topic && s.topic.toLowerCase().includes(searchTerm)) ||
        (s.subject && s.subject.toLowerCase().includes(searchTerm)) ||
        (s.courseName && s.courseName.toLowerCase().includes(searchTerm))
      );
      if (filtered.length === 0) filtered = allSessions;
    }

    const activeSessions = filtered.filter(s => s.status !== 'draft');
    const finalSessions = activeSessions.length > 0 ? activeSessions : filtered;

    if (optionsDiv) {
      optionsDiv.innerHTML = '';

      finalSessions.forEach((sess, idx) => {
        const option = document.createElement('div');
        const isSelected = selectedSessionId ? (sess.id === selectedSessionId) : (idx === 0);
        if (isSelected) selectedSessionId = sess.id;

        option.className = `session-option ${isSelected ? 'selected' : ''}`;
        option.dataset.id = sess.id;
        option.style.cursor = 'pointer';
        option.innerHTML = `
          <div class="session-option-left" style="pointer-events:none;">
            <div class="session-topic" style="font-weight:600; color:var(--text);">${escapeHTML(sess.topic || 'Untitled Session')}</div>
            <div class="session-date" style="font-size:0.75rem; color:var(--text-dim);">${sess.subject || 'General'} · ${sess.date || 'Today'}</div>
          </div>
          <span class="session-cards-count" style="pointer-events:none; font-size:0.75rem; color:var(--green-light); font-weight:600;">${(sess.cards || []).length} cards</span>
        `;
        optionsDiv.appendChild(option);
      });

      // Rock-solid event delegation for session selection
      optionsDiv.onclick = (e) => {
        const cardOption = e.target.closest('.session-option');
        if (!cardOption) return;
        const targetId = cardOption.dataset.id;
        if (!targetId) return;

        document.querySelectorAll('.session-option').forEach(o => o.classList.remove('selected'));
        cardOption.classList.add('selected');
        selectedSessionId = targetId;

        if (startBtn) {
          startBtn.disabled = false;
          startBtn.removeAttribute('disabled');
        }

        try {
          const dueBadge = document.getElementById('due-cards-badge');
          if (dueBadge && typeof SpacedRepetitionEngine !== 'undefined') {
            const targetSess = finalSessions.find(s => s.id === targetId);
            if (targetSess) {
              const dueCount = SpacedRepetitionEngine.getDueCount(targetSess.id, targetSess.cards);
              dueBadge.textContent = `${dueCount} card${dueCount !== 1 ? 's' : ''} due`;
              dueBadge.style.display = 'inline-block';
            }
          }
        } catch(err) {}
      };
    }

    if (!selectedSessionId && finalSessions.length > 0) {
      selectedSessionId = finalSessions[0].id;
    }
    if (startBtn) {
      startBtn.disabled = false;
      startBtn.removeAttribute('disabled');
    }
  }

  // Load sessions immediately on page init
  try {
    loadSessionsList('ef-2024');
  } catch(e) {}

  if (startBtn) {
    startBtn.disabled = false;
    startBtn.removeAttribute('disabled');
    startBtn.onclick = function(e) {
      if (e) e.preventDefault();
      let session = null;
      if (selectedSessionId && window.EduStore && typeof window.EduStore.getSessionById === 'function') {
        session = window.EduStore.getSessionById(selectedSessionId);
      }
      if (!session) {
        const sessions = (window.EduStore && typeof window.EduStore.getSessions === 'function') ? window.EduStore.getSessions() : [];
        if (sessions.length > 0) session = sessions[0];
      }
      if (!session) {
        session = getDefaultSession();
      }
      startReview(session);
    };
  }
}

function getDefaultSession() {
  return {
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
        answer: "Every action has an equal and opposite reaction.",
        topic: "Action-Reaction"
      }
    ]
  };
}

// ── Start Review Flow ───────────────────────────────────────
function startReview(session, resuming = false) {
  if (!session || !session.cards || session.cards.length === 0) {
    session = getDefaultSession();
  }

  currentSession = JSON.parse(JSON.stringify(session));

  if (!resuming) {
    // Day 9: Smart Missed Cards filtering
    if (selectedStudyMode === 'smart') {
      const responses = currentSession.responses || [];
      const missedCardIds = new Set();
      responses.forEach(r => {
        (r.cardResponses || []).forEach(cr => {
          if (cr.rating === 'fuzzy' || cr.rating === 'nope' || !cr.isCorrect) {
            missedCardIds.add(cr.cardId);
          }
        });
      });
      if (missedCardIds.size > 0) {
        currentSession.cards = currentSession.cards.filter(c => missedCardIds.has(c.id));
      }
    } else if (selectedStudyMode === 'spaced') {
      // Day 11: Spaced Repetition Mode
      if (typeof SpacedRepetitionEngine !== 'undefined') {
        const due = SpacedRepetitionEngine.getDueCards(currentSession.id, currentSession.cards);
        if (due && due.length > 0) {
          currentSession.cards = due;
        }
      }
    } else if (selectedStudyMode === 'starred') {
      // Day 15: Starred Cards Mode — review only your bookmarked cards
      if (typeof StarredCards !== 'undefined') {
        const starredIds = StarredCards.getIds(currentSession.id);
        if (starredIds.length > 0) {
          currentSession.cards = currentSession.cards.filter(c => starredIds.includes(c.id));
        }
      }
    }

    // Safety fallback: if mode filtering resulted in 0 cards or session cards are missing, use session's original cards
    if (!currentSession.cards || currentSession.cards.length === 0) {
      currentSession.cards = JSON.parse(JSON.stringify(session.cards || getDefaultSession().cards));
    }

    currentCardIndex = 0;
    sessionAnswers = Array(currentSession.cards.length).fill(null);
  }

  // Transition layouts with explicit inline display properties
  const entryCard = document.getElementById('entry-card');
  const reviewContainer = document.getElementById('review-container');
  const completionContainer = document.getElementById('completion-container');
  const resumeBanner = document.getElementById('resume-banner');

  if (entryCard) entryCard.style.display = 'none';
  if (resumeBanner) resumeBanner.style.display = 'none';
  if (completionContainer) {
    completionContainer.style.display = 'none';
    completionContainer.classList.remove('visible');
  }
  if (reviewContainer) {
    reviewContainer.style.display = 'flex';
    reviewContainer.classList.add('visible');
  }

  const fab = document.getElementById('edubot-fab');
  if (fab) fab.style.display = 'flex';

  // Day 19: Show Collaborative Notes FAB
  const collabFab = document.getElementById('collab-notes-fab');
  if (collabFab) collabFab.style.display = 'flex';

  renderCard();
}

// ── Render Flashcard in Reviewer ───────────────────────────
function renderCard() {
  if (!currentSession || !currentSession.cards || !currentSession.cards[currentCardIndex]) {
    currentSession = getDefaultSession();
    currentCardIndex = 0;
  }

  const total = currentSession.cards.length;
  const progressText = `Card ${currentCardIndex + 1} of ${total}`;
  const progressPercent = Math.round(((currentCardIndex + 1) / total) * 100);

  // Update Progress Tracker immediately
  const progTextEl = document.getElementById('review-progress-text');
  const progPctEl  = document.getElementById('review-progress-percent');
  const progBarEl  = document.getElementById('review-progress-bar');
  const counterEl  = document.getElementById('review-counter');

  if (progTextEl) progTextEl.textContent = progressText;
  if (progPctEl)  progPctEl.textContent  = `${progressPercent}%`;
  if (progBarEl)  progBarEl.style.width  = `${progressPercent}%`;
  if (counterEl)  counterEl.textContent  = `${currentCardIndex + 1} / ${total}`;

  const card = currentSession.cards[currentCardIndex];
  const flashcard = document.getElementById('review-flashcard');
  
  // Reset flipped visual state
  flashcard.classList.remove('flipped');

  // Fill in card text details
  document.getElementById('review-question').textContent = card.question;
  document.getElementById('review-answer').textContent = card.answer;
  document.getElementById('card-tag').textContent = card.topic || currentSession.topic;

  // Wire TTS button
  const ttsBtn = document.getElementById('tts-read-btn');
  if (ttsBtn) {
    ttsBtn.onclick = (e) => {
      e.stopPropagation();
      const speechText = `${card.question}. Options: ${card.options.join(', ')}`;
      TTSManager.speak(speechText);
    };
  }

  // Day 15: Sync star + note button states with the current card
  const starBtn = document.getElementById('card-star-btn');
  if (starBtn) {
    starBtn.classList.toggle('starred', StarredCards.isStarred(currentSession.id, card.id));
    starBtn.onclick = () => {
      const nowStarred = StarredCards.toggle(currentSession.id, card.id);
      starBtn.classList.toggle('starred', nowStarred);
      starBtn.querySelector('.card-icon-btn-label').textContent = nowStarred ? 'Starred' : 'Star';
      const hintEl = document.getElementById('starred-mode-hint');
      if (hintEl) hintEl.classList.remove('visible');
    };
  }

  const noteBtn = document.getElementById('card-note-btn');
  if (noteBtn) {
    const hasNote = CardNotes.getNote(currentSession.id, card.id).length > 0;
    noteBtn.classList.toggle('has-note', hasNote);
    noteBtn.onclick = () => toggleNoteEditor(card);
  }

  const noteEditor = document.getElementById('card-note-editor');
  if (noteEditor) {
    noteEditor.classList.remove('open');
    const noteTextarea = document.getElementById('card-note-textarea');
    if (noteTextarea) {
      noteTextarea.value = CardNotes.getNote(currentSession.id, card.id);
    }
    const savedTag = document.getElementById('card-note-saved-tag');
    if (savedTag) savedTag.style.display = 'none';
  }

  // Handle Speed Challenge Timer
  const timerWrap = document.getElementById('speed-timer-wrap');
  if (selectedStudyMode === 'speed') {
    if (timerWrap) timerWrap.style.display = 'block';
    startSpeedTimer();
  } else if (timerWrap) {
    timerWrap.style.display = 'none';
    stopSpeedTimer();
  }
  
  // Fill MCQ Options
  const optionsContainer = document.getElementById('review-options');
  optionsContainer.innerHTML = '';

  // Day 19: Check for micro-lesson (if student previously got this card wrong)
  checkAndShowMicroLesson(currentSession.id, card.id);

  // Day 19: Check for active live poll from teacher
  if (typeof StudentLivePoll !== 'undefined') StudentLivePoll.checkForPoll();

  const savedAnswer = sessionAnswers[currentCardIndex];

  card.options.forEach((opt, index) => {
    const optEl = document.createElement('div');
    optEl.className = 'mcq-option';
    optEl.innerHTML = `
      <span class="option-letter">${String.fromCharCode(65 + index)}</span>
      <span class="option-text">${escapeHTML(opt)}</span>
    `;

    // If already answered this card in the session
    if (savedAnswer !== null) {
      if (index === card.correctIndex) {
        optEl.classList.add('correct');
      } else if (index === savedAnswer.selectedIndex) {
        optEl.classList.add('wrong');
      }
    } else {
      // Set click listener
      optEl.addEventListener('click', () => handleOptionSelection(index, card.correctIndex));
    }

    optionsContainer.appendChild(optEl);
  });

  // Handle self-rating visual selections
  const ratingButtons = document.querySelectorAll('.rating-btn');
  ratingButtons.forEach(btn => {
    // Reset selected classes
    btn.className = `rating-btn ${btn.dataset.rating}`;
    
    if (savedAnswer && savedAnswer.rating === btn.dataset.rating) {
      btn.classList.add('selected-' + btn.dataset.rating);
    }

    if (savedAnswer !== null) {
      btn.onclick = () => handleSelfRating(btn.dataset.rating);
    } else {
      btn.onclick = null; // Disable ratings until MCQ is answered
    }
  });

  // Header Manual Flip Trigger
  const headerClick = document.getElementById('card-header-click');
  headerClick.onclick = () => {
    SoundFX.playFlip();
    flashcard.classList.toggle('flipped');
  };

  // Update Footer Controls
  document.getElementById('review-prev-btn').disabled = currentCardIndex === 0;

  const nextBtn = document.getElementById('review-next-btn');
  if (currentCardIndex === total - 1) {
    nextBtn.textContent = 'Finish Review ✓';
  } else {
    nextBtn.textContent = 'Next →';
  }

  // Next button remains disabled until self-rated
  nextBtn.disabled = savedAnswer === null || !savedAnswer.rating;
}

function startSpeedTimer() {
  stopSpeedTimer();
  speedSecondsLeft = 15;
  const textEl = document.getElementById('speed-timer-text');
  const barEl  = document.getElementById('speed-timer-bar');
  if (textEl) textEl.textContent = '15s';
  if (barEl) {
    barEl.style.transition = 'none';
    barEl.style.width = '100%';
    // Force reflow for CSS transition reset
    void barEl.offsetWidth;
    barEl.style.transition = 'width 1s linear';
  }

  speedTimerInterval = setInterval(() => {
    speedSecondsLeft--;
    if (speedSecondsLeft < 0) speedSecondsLeft = 0;
    
    if (textEl) textEl.textContent = `${speedSecondsLeft}s`;
    if (barEl)  barEl.style.width  = `${Math.max(0, Math.round((speedSecondsLeft / 15) * 100))}%`;

    if (speedSecondsLeft <= 0) {
      stopSpeedTimer();
      // Auto choose option 0 if un-answered
      if (sessionAnswers[currentCardIndex] === null && currentSession && currentSession.cards[currentCardIndex]) {
        handleOptionSelection(0, currentSession.cards[currentCardIndex].correctIndex);
      }
    }
  }, 1000);
}

function stopSpeedTimer() {
  if (speedTimerInterval) {
    clearInterval(speedTimerInterval);
    speedTimerInterval = null;
  }
}

// ── MCQ Selection Handler ──────────────────────────────────
function handleOptionSelection(optIndex, correctIndex) {
  stopSpeedTimer();
  const card = currentSession.cards[currentCardIndex];
  const isCorrect = optIndex === correctIndex;

  if (isCorrect) SoundFX.playCorrect();
  else           SoundFX.playWrong();

  sessionAnswers[currentCardIndex] = {
    cardId: card.id,
    selectedIndex: optIndex,
    isCorrect: isCorrect,
    rating: null // Filled on flip self-rating
  };

  // Day 14: Award XP for correct answer
  if (isCorrect) XPEngine.awardXP(10, 'Correct answer');

  // Day 19: Record wrong cards so micro-lessons can be shown on re-review
  if (!isCorrect) recordWrongCard(currentSession.id, card.id);

  // Render correct/wrong colors
  const optionElements = document.querySelectorAll('#review-options .mcq-option');
  optionElements.forEach((el, index) => {
    if (index === correctIndex) {
      el.classList.add('correct');
    } else if (index === optIndex) {
      el.classList.add('wrong');
    }
    // Remove pointer events
    el.style.pointerEvents = 'none';
  });

  // Enable self-ratings click listeners
  const ratingButtons = document.querySelectorAll('.rating-btn');
  ratingButtons.forEach(btn => {
    btn.onclick = () => handleSelfRating(btn.dataset.rating);
  });

  // Delayed flip (1.2s)
  setTimeout(() => {
    const flashcard = document.getElementById('review-flashcard');
    if (flashcard && !flashcard.classList.contains('flipped')) {
      SoundFX.playFlip();
      flashcard.classList.add('flipped');
    }
  }, 1200);
}

// ── Self Rating Click Handler ──────────────────────────────
function handleSelfRating(ratingType) {
  let currentAnswer = sessionAnswers[currentCardIndex];
  if (!currentAnswer) {
    const card = currentSession.cards[currentCardIndex];
    currentAnswer = {
      cardId: card.id,
      selectedIndex: -1,
      isCorrect: ratingType === 'know' || ratingType === 'fuzzy',
      rating: ratingType
    };
    sessionAnswers[currentCardIndex] = currentAnswer;
  } else {
    currentAnswer.rating = ratingType;
    if (ratingType === 'nope') {
      currentAnswer.isCorrect = false;
    }
  }

  // Day 14: Award XP for confident rating
  if (ratingType === 'know') XPEngine.awardXP(5, 'Know it rating');

  // Highlight selected button
  const ratingButtons = document.querySelectorAll('.rating-btn');
  ratingButtons.forEach(btn => {
    btn.className = `rating-btn ${btn.dataset.rating}`;
    if (btn.dataset.rating === ratingType) {
      btn.classList.add('selected-' + ratingType);
    }
  });

  // Enable Next button
  document.getElementById('review-next-btn').disabled = false;

  // Day 15: Persist resume state after each self-rating
  SessionResume.save();
  
  // Day 11: Save to Spaced Repetition Engine
  if (currentSession) {
    SpacedRepetitionEngine.updateCard(currentSession.id, currentSession.cards[currentCardIndex].id, ratingType);
  }

  // Day 15: A card counts as "mastered" when answered correctly AND rated Know it
  if (currentSession && currentAnswer.isCorrect && ratingType === 'know') {
    try {
      const result = StudyProficiency.addMasteredCard();
      if (result && result.leveledUp) FocusTimer._showLevelUp(result.newLevel, result.points);
    } catch (e) {}
  }
}

// ── Nav Controls Setup ──────────────────────────────────────
function initReviewControls() {
  const prevBtn = document.getElementById('review-prev-btn');
  const nextBtn = document.getElementById('review-next-btn');
  const exitBtn = document.getElementById('exit-btn');

  prevBtn.addEventListener('click', () => {
    if (currentCardIndex > 0) {
      currentCardIndex--;
      renderCard();
    }
  });

  nextBtn.addEventListener('click', () => {
    const total = currentSession.cards.length;

    if (currentCardIndex < total - 1) {
      currentCardIndex++;
      renderCard();
    } else {
      finishReview();
    }
  });

  exitBtn.addEventListener('click', async (e) => {
    if (e) e.preventDefault();
    exitBtn.disabled = true;
    exitBtn.textContent = 'Saving...';

    if (window.pendingResponsePayload) {
      const syncEl = document.getElementById('sync-status');
      if (syncEl) syncEl.textContent = '💾 Saving response...';
      try {
        await window.EduStore.addStudentResponse(currentSession.id, window.pendingResponsePayload);
      } catch(err) {
        console.error("Exit save error:", err);
      }
      window.pendingResponsePayload = null;
    }
    
    SessionResume.clear(); // Day 15: clear resume on deliberate exit
    window.location.href = 'student.html'; // Day 21: Redirect to clean landing page to show streak card
  });
}

// ── Complete Review & Submit Responses ──────────────────────
async function finishReview() {
  if (!currentSession) return;

  // Calculate final score
  let correctCount = 0;
  sessionAnswers.forEach(ans => {
    if (ans && ans.isCorrect) correctCount++;
  });

  const accuracy = Math.round((correctCount / currentSession.cards.length) * 100);

  // Compile final payload
  currentStudentId = 'stud-' + Math.floor(Math.random() * 9000 + 1000);
  const responsePayload = {
    studentId: currentStudentId,
    cardResponses: sessionAnswers,
    feedbackRating: 0,
    feedbackComment: ''
  };

  // Day 21: Reset feedback UI card
  const fbCard = document.getElementById('feedback-card');
  if (fbCard) {
    fbCard.innerHTML = `
      <span style="font-size: 0.85rem; color: var(--text); font-weight: 600; display: block; margin-bottom: 8px;">⭐ Rate this Flashcard Session</span>
      <div class="rating-stars" id="feedback-stars-container" style="display: flex; justify-content: center; gap: 8px; font-size: 2rem; cursor: pointer; color: var(--text-dim); margin-bottom: 12px;">
        <span class="star-rating-btn" data-val="1">★</span>
        <span class="star-rating-btn" data-val="2">★</span>
        <span class="star-rating-btn" data-val="3">★</span>
        <span class="star-rating-btn" data-val="4">★</span>
        <span class="star-rating-btn" data-val="5">★</span>
      </div>
      <textarea id="feedback-text-input" class="input-field" placeholder="Optional: Any feedback on these cards? (e.g. too easy, hard, mistakes)" style="width: 100%; min-height: 50px; font-size: 0.82rem; border-radius: var(--radius); padding: 8px; margin-bottom: 12px; resize: vertical; background: rgba(0,0,0,0.25); border: 1px solid var(--border); color: var(--text);"></textarea>
      <button class="btn btn-green btn-sm" id="btn-submit-feedback" style="width: 100%;">Submit Feedback</button>
    `;
    
    // Wire star hover/clicks dynamically
    let selectedFeedbackRating = 0;
    const stars = fbCard.querySelectorAll('.star-rating-btn');
    stars.forEach(star => {
      star.onclick = function() {
        const val = parseInt(this.dataset.val);
        selectedFeedbackRating = val;
        stars.forEach(s => {
          const sVal = parseInt(s.dataset.val);
          s.classList.toggle('active', sVal <= val);
        });
      };
    });
    
    // Wire submit click
    const submitBtn = fbCard.querySelector('#btn-submit-feedback');
    if (submitBtn) {
      submitBtn.onclick = function() {
        if (selectedFeedbackRating === 0) {
          if (typeof showToast === 'function') showToast('Please select a star rating first! ⭐', 'warning');
          return;
        }
        const comment = fbCard.querySelector('#feedback-text-input').value.trim();
        window.submitSessionFeedback(selectedFeedbackRating, comment);
      };
    }
  }

  // Day 15: Clear resume state on finish
  SessionResume.clear();

  // Clean up timers and voice recognition on finish
  stopSpeedTimer();
  if (typeof VoiceQuizEngine !== 'undefined') VoiceQuizEngine.stop();

  // Switch panels immediately — don't wait for Firestore write
  const reviewContainer = document.getElementById('review-container');
  const completionContainer = document.getElementById('completion-container');
  if (reviewContainer) {
    reviewContainer.style.display = 'none';
    reviewContainer.classList.remove('visible');
  }
  if (completionContainer) {
    completionContainer.style.display = 'flex';
    completionContainer.classList.add('visible');
  }

  // Day 9: Sound & Confetti celebration
  SoundFX.playFanfare();
  launchConfetti();

  // Render results
  const accEl = document.getElementById('completion-accuracy');
  accEl.textContent = `${accuracy}%`;
  if (accuracy < 40)      accEl.style.color = '#f28b82';
  else if (accuracy < 75) accEl.style.color = 'var(--yellow)';
  else                    accEl.style.color = 'var(--green-light)';

  // Day 11: Analytics Dashboard
  try {
    saveAndRenderAnalytics(currentSession.id, accuracy, sessionAnswers, currentSession.cards);
  } catch(err) {
    console.error('[EduFlash] saveAndRenderAnalytics failed:', err);
  }

  // Day 16: Render Personalized Practice Schedule & Memory Retention Planner
  try {
    if (typeof PracticePlannerEngine !== 'undefined') {
      PracticePlannerEngine.renderWidget(currentSession, accuracy, sessionAnswers);
    }
  } catch(err) {
    console.error('[EduFlash] PracticePlannerEngine.renderWidget failed:', err);
  }

  // Day 14: XP bonuses and achievements
  try {
    let xpResult = null;
    let streak = 0;
    sessionAnswers.forEach(ans => {
      if (ans && ans.isCorrect) { streak++; if (streak >= 3 && streak % 3 === 0) xpResult = XPEngine.awardXP(15, 'Streak bonus'); }
      else streak = 0;
    });
    if (accuracy >= 80) xpResult = XPEngine.awardXP(25, 'High accuracy bonus');
    if (accuracy === 100) xpResult = XPEngine.awardXP(50, 'Perfect score!');

    // Render XP bar and achievements
    renderXPBar();
    renderAchievementBadges();

    // Check for level-up
    const progress = XPEngine.getLevelProgress(XPEngine.getTotalXP());
    if (xpResult && xpResult.leveledUp) showLevelUpModal(xpResult.newLevel);
  } catch(err) {
    console.error('[EduFlash] XP Engine failed:', err);
  }

  // Day 21: Setup atomic in-flight response payload
  window.pendingResponsePayload = responsePayload;

  // Day 6: show sync status (advise student feedback is ready to submit)
  const syncEl = document.getElementById('sync-status');
  if (syncEl) {
    syncEl.style.display = 'block';
    syncEl.textContent = '✍️ Rate this session below to complete submission';
  }

  // Update streaks in memory immediately
  try {
    renderStudentStreakDashboard();
  } catch(e) {}

  // Day 8: Google Classroom Turn-In
  const params = new URLSearchParams(window.location.search);
  const courseId = params.get('courseId') || currentSession.classroomId || 'course-phy-101';
  const courseWorkId = currentSession.courseWorkId || 'cw-mock-1';
  const gcStatusEl = document.getElementById('gc-student-status');

  if (window.ClassroomAPI && gcStatusEl) {
    try {
      await window.ClassroomAPI.submitStudentTurnIn(courseId, courseWorkId, accuracy);
      gcStatusEl.style.display = 'block';
    } catch (e) {
      console.warn('Classroom turn in error:', e);
    }
  }
}

// Helper Utilities
function escapeHTML(str) {
  if (!str) return '';
  return str.replace(/[&<>'"]/g, 
    tag => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      "'": '&#39;',
      '"': '&quot;'
    }[tag] || tag)
  );
}

// ════════════════════════════════════════════════════════════
//  Day 11: EduBot AI Tutor Drawer Logic
// ════════════════════════════════════════════════════════════
function initEduBotTutor() {
  const fab        = document.getElementById('edubot-fab');
  const overlay    = document.getElementById('edubot-drawer-overlay');
  const closeBtn   = document.getElementById('edubot-close-btn');
  const form       = document.getElementById('edubot-form');
  const input      = document.getElementById('edubot-input');
  const topicBadge = document.getElementById('edubot-topic-badge');

  if (!fab || !overlay) return;

  const openDrawer = () => {
    overlay.style.display = 'flex';
    if (currentSession && currentSession.cards && currentSession.cards[currentCardIndex]) {
      const card = currentSession.cards[currentCardIndex];
      if (topicBadge) topicBadge.textContent = `Topic: ${card.topic || currentSession.topic}`;
    }
  };

  const closeDrawer = () => {
    overlay.style.display = 'none';
  };

  fab.addEventListener('click', openDrawer);
  closeBtn?.addEventListener('click', closeDrawer);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) closeDrawer();
  });

  // Quick action chip buttons
  document.querySelectorAll('.edubot-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      const promptText = chip.dataset.prompt;
      if (promptText) {
        sendEduBotQuery(promptText);
      }
    });
  });

  form?.addEventListener('submit', (e) => {
    e.preventDefault();
    const query = input.value.trim();
    if (!query) return;
    input.value = '';
    sendEduBotQuery(query);
  });
}

async function sendEduBotQuery(userQuery) {
  const messagesContainer = document.getElementById('edubot-messages');
  if (!messagesContainer) return;

  // Render user bubble
  const userMsgEl = document.createElement('div');
  userMsgEl.className = 'edubot-msg user';
  userMsgEl.textContent = userQuery;
  messagesContainer.appendChild(userMsgEl);

  // Render bot thinking bubble
  const botMsgEl = document.createElement('div');
  botMsgEl.className = 'edubot-msg assistant';
  botMsgEl.innerHTML = `<span>⏳ EduBot is thinking...</span>`;
  messagesContainer.appendChild(botMsgEl);
  messagesContainer.scrollTop = messagesContainer.scrollHeight;

  const activeCard = (currentSession && currentSession.cards) ? currentSession.cards[currentCardIndex] : null;
  const cardContext = activeCard ? `
Card Question: "${activeCard.question}"
Options: ${JSON.stringify(activeCard.options)}
Correct Answer: "${activeCard.options[activeCard.correctIndex]}"
Explanation: "${activeCard.answer}"
Subtopic: "${activeCard.topic}"
` : 'General revision session.';

  const apiKey = window.EduStore.getApiKey();

  if (apiKey && activeCard) {
    try {
      const systemPrompt = `You are EduBot, an encouraging and expert AI physics tutor for students.
Current flashcard context:
${cardContext}

Answer the student's question clearly, concisely (2-3 sentences), and with high clarity.`;

      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: systemPrompt + "\nStudent question: " + userQuery }] }] })
      });

      if (res.ok) {
        const json = await res.json();
        const text = json.candidates?.[0]?.content?.parts?.[0]?.text;
        if (text) {
          botMsgEl.innerHTML = text.replace(/\n/g, '<br/>');
          messagesContainer.scrollTop = messagesContainer.scrollHeight;
          return;
        }
      }
    } catch(e) {
      console.warn("EduBot API error:", e);
    }
  }

  // Smart offline tutor responses
  await new Promise(r => setTimeout(r, 500));
  let answerText = "";
  const lower = userQuery.toLowerCase();

  if (lower.includes('step-by-step') || lower.includes('step')) {
    answerText = `💡 <strong>Step-by-step breakdown:</strong><br/>
1. Read the core physics law in the question.<br/>
2. Option <strong>${String.fromCharCode(65 + (activeCard ? activeCard.correctIndex : 0))}</strong> directly satisfies this principle.<br/>
3. The other options introduce common distractors.`;
  } else if (lower.includes('analogy') || lower.includes('real-world')) {
    answerText = `🌍 <strong>Real-world analogy:</strong><br/>
Imagine riding a bicycle on a smooth ice rink: once you get moving, you keep coasting effortlessly because there is almost no friction force opposing your inertia!`;
  } else if (lower.includes('5') || lower.includes('eli5')) {
    answerText = `🧒 <strong>Simplified:</strong><br/>
Things like to stay the way they are! A quiet kitten stays sleeping until someone stirs it, and a sliding toy keeps sliding until something pushes back!`;
  } else if (lower.includes('quiz') || lower.includes('follow-up') || lower.includes('practice')) {
    answerText = `❓ <strong>Quick follow-up quiz:</strong><br/>
If you push a heavy box on a frictionless surface in space, will it speed up, slow down, or keep moving at constant speed after you let go?`;
  } else {
    answerText = `🤖 Great question! Regarding <strong>${activeCard ? activeCard.topic : 'this topic'}</strong>, option <strong>${activeCard ? String.fromCharCode(65 + activeCard.correctIndex) : 'A'}</strong> is correct because ${activeCard ? activeCard.answer : 'it directly answers the prompt.'}`;
  }

  botMsgEl.innerHTML = answerText;
  messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

// ════════════════════════════════════════════════════════════
//  Day 11: Analytics & Keyboard Shortcuts
// ════════════════════════════════════════════════════════════
function saveAndRenderAnalytics(sessionId, accuracy, answers, cards) {
  try {
    let history = JSON.parse(localStorage.getItem('ef_review_history') || '[]');
    
    let topicScores = {};
    if (answers && Array.isArray(answers) && cards && Array.isArray(cards)) {
      answers.forEach(ans => {
        if (!ans) return;
        const card = cards.find(c => c.id === ans.cardId);
        if (!card) return;
        const topic = card.topic || 'General';
        if (!topicScores[topic]) topicScores[topic] = { correct: 0, total: 0 };
        topicScores[topic].total++;
        if (ans.isCorrect) topicScores[topic].correct++;
      });
    }
    
    const record = {
      sessionId,
      accuracy,
      date: new Date().toISOString(),
      topicScores
    };
    record.cardCount = cards ? cards.length : 0;
    record.mode = selectedStudyMode || 'standard';
    history.push(record);
    localStorage.setItem('ef_review_history', JSON.stringify(history));
    
    renderStudentAnalytics(history);
  } catch(err) {
    console.error("Error in saveAndRenderAnalytics:", err);
  }
}

function renderStudentAnalytics(history) {
  try {
    const container = document.getElementById('student-analytics');
    if (container) container.style.display = 'block';
    
    if (!history || history.length === 0) return;
    
    // Trend Sparkline
    const accHistory = history.map(h => h.accuracy || 0);
    drawSparkline('sparkline-canvas', accHistory);
    
    // Streak
    const today = new Date().setHours(0,0,0,0);
    let streakCount = [...new Set(history.map(h => {
      try {
        return new Date(h.date).setHours(0,0,0,0);
      } catch(e) {
        return 0;
      }
    }).filter(Boolean))].length;
    
    let heatDotsHtml = '';
    for(let i=6; i>=0; i--) {
      let d = new Date(today - i * 86400000);
      let active = history.some(h => {
        try {
          return h.date && new Date(h.date).setHours(0,0,0,0) === d.getTime();
        } catch(e) {
          return false;
        }
      });
      heatDotsHtml += `<div class="streak-dot ${active ? 'active' : ''}"></div>`;
    }
    
    const streakEl = document.getElementById('streak-display');
    if (streakEl) {
      streakEl.innerHTML = `
        <div style="font-size:1.4rem; font-weight:700; color:var(--text);">${streakCount} Days</div>
        <div class="streak-dots-wrap">${heatDotsHtml}</div>
      `;
    }
    
    // Topic Mastery
    let aggTopics = {};
    history.forEach(h => {
      Object.keys(h.topicScores || {}).forEach(t => {
        if(!aggTopics[t]) aggTopics[t] = { correct:0, total:0 };
        aggTopics[t].correct += h.topicScores[t].correct;
        aggTopics[t].total += h.topicScores[t].total;
      });
    });
    
    let masteryHtml = '';
    Object.keys(aggTopics).slice(0, 3).forEach(t => {
      let pct = Math.round((aggTopics[t].correct / aggTopics[t].total) * 100);
      masteryHtml += `
        <div class="mastery-bar">
          <div class="mastery-bar-label">${escapeHTML(t)}</div>
          <div class="mastery-bar-track"><div class="mastery-bar-fill" style="width:${pct}%"></div></div>
          <div class="mastery-bar-pct">${pct}%</div>
        </div>
      `;
    });
    if(!masteryHtml) masteryHtml = '<div style="font-size:0.75rem; color:var(--text-dim);">Not enough data</div>';
    
    const masteryEl = document.getElementById('mastery-bars');
    if (masteryEl) masteryEl.innerHTML = masteryHtml;
    
    // Personal Best
    const validAccuracies = history.map(h => Number(h.accuracy) || 0);
    const bestAcc = validAccuracies.length > 0 ? Math.max(...validAccuracies) : 0;
    const latestAcc = validAccuracies.length > 0 ? validAccuracies[validAccuracies.length - 1] : 0;
    const bestEl = document.getElementById('personal-best-display');
    if (bestEl) {
      bestEl.innerHTML = `
        <div class="personal-best-value">${bestAcc}%</div>
        <div class="personal-best-sub">${latestAcc >= bestAcc && history.length > 1 ? '🎉 New Record!' : 'All-time high score'}</div>
      `;
    }
  } catch(err) {
    console.error("Error in renderStudentAnalytics:", err);
  }
}

function drawSparkline(canvasId, dataPoints) {
  const canvas = document.getElementById(canvasId);
  if(!canvas) return;
  const ctx = canvas.getContext('2d');
  const w = canvas.width;
  const h = canvas.height;
  
  ctx.clearRect(0,0,w,h);
  if(dataPoints.length < 2) {
    ctx.fillStyle = '#9aa0a6';
    ctx.font = '10px Google Sans, sans-serif';
    ctx.fillText('More data needed', 10, h/2 + 3);
    return;
  }
  
  const min = Math.max(0, Math.min(...dataPoints) - 10);
  const max = 100;
  const range = max - min || 1;
  const stepX = w / (dataPoints.length - 1);
  
  ctx.beginPath();
  ctx.moveTo(0, h - ((dataPoints[0]-min)/range)*h);
  for(let i=1; i<dataPoints.length; i++) {
    ctx.lineTo(i*stepX, h - ((dataPoints[i]-min)/range)*h);
  }
  ctx.strokeStyle = '#1e8e3e';
  ctx.lineWidth = 2;
  ctx.stroke();
  
  ctx.lineTo(w, h);
  ctx.lineTo(0, h);
  ctx.closePath();
  let grad = ctx.createLinearGradient(0,0,0,h);
  grad.addColorStop(0, 'rgba(30,142,62,0.3)');
  grad.addColorStop(1, 'rgba(30,142,62,0)');
  ctx.fillStyle = grad;
  ctx.fill();
}

function initKeyboardShortcuts() {
  const overlay = document.getElementById('keyboard-overlay');
  const closeBtn = document.getElementById('keyboard-close-btn');
  
  const toggleOverlay = () => {
    if (overlay) {
      overlay.style.display = overlay.style.display === 'flex' ? 'none' : 'flex';
    }
  };
  
  closeBtn?.addEventListener('click', () => { if (overlay) overlay.style.display = 'none'; });
  overlay?.addEventListener('click', (e) => { if (e.target === overlay) overlay.style.display = 'none'; });
  
  document.addEventListener('keydown', (e) => {
    if (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'TEXTAREA') {
      if (e.key === 'Escape') {
        const edubotDrawer = document.getElementById('edubot-drawer-overlay');
        if (edubotDrawer && edubotDrawer.style.display !== 'none') edubotDrawer.style.display = 'none';
      }
      return;
    }
    
    if (e.key === '?') toggleOverlay();
    if (e.key === 'Escape') {
      if (overlay) overlay.style.display = 'none';
      const edubotDrawer = document.getElementById('edubot-drawer-overlay');
      if (edubotDrawer) edubotDrawer.style.display = 'none';
    }
    
    const reviewContainer = document.getElementById('review-container');
    const reviewVisible = reviewContainer && reviewContainer.classList.contains('visible');
    if (!reviewVisible) return;
    
    if (e.key === 'ArrowRight') {
      const nextBtn = document.getElementById('review-next-btn');
      if (nextBtn && !nextBtn.disabled) nextBtn.click();
    }
    if (e.key === 'ArrowLeft') {
      const prevBtn = document.getElementById('review-prev-btn');
      if (prevBtn && !prevBtn.disabled) prevBtn.click();
    }
    if (e.key === ' ') {
      e.preventDefault();
      const headerClick = document.getElementById('card-header-click');
      if (headerClick) headerClick.click();
    }
    if (['1','2','3','4'].includes(e.key)) {
      const opts = document.querySelectorAll('#review-options .mcq-option');
      const idx = parseInt(e.key) - 1;
      if (opts[idx] && opts[idx].style.pointerEvents !== 'none') {
        opts[idx].click();
      }
    }
    if (e.key.toLowerCase() === 'k') document.querySelector('.rating-btn.know')?.click();
    if (e.key.toLowerCase() === 'f') document.querySelector('.rating-btn.fuzzy')?.click();
    if (e.key.toLowerCase() === 'd') document.querySelector('.rating-btn.nope')?.click();
    if (e.key.toLowerCase() === 's') document.getElementById('card-star-btn')?.click();
    if (e.key.toLowerCase() === 'n') document.getElementById('card-note-btn')?.click();
  });
}


// ============================================================
//  EduFlash AI — Day 12: Voice Study Mode Engine
// ============================================================

const VoiceQuizEngine = {
  recognition: null,
  isListening: false,

  isSupported() {
    return !!(window.SpeechRecognition || window.webkitSpeechRecognition);
  },

  init() {
    if (!this.isSupported()) return;
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    this.recognition = new SR();
    this.recognition.continuous = false;
    this.recognition.interimResults = true;
    this.recognition.lang = 'en-US';

    this.recognition.onresult = (event) => {
      const transcript = Array.from(event.results)
        .map(r => r[0].transcript).join('');
      this._updateTranscript(transcript);
      if (event.results[event.results.length - 1].isFinal) {
        this._parseAndRespond(transcript.trim().toLowerCase());
      }
    };

    this.recognition.onend = () => {
      if (this.isListening) {
        try { this.recognition.start(); } catch(e) {}
      } else {
        this._setMicState(false);
      }
    };

    this.recognition.onerror = (e) => {
      if (e.error !== 'no-speech') {
        this._setStatus('⚠️ Voice error: ' + e.error + '. Click mic to retry.');
        this.isListening = false;
        this._setMicState(false);
      }
    };

    const micBtn = document.getElementById('mic-btn');
    if (micBtn && !micBtn._wired) {
      micBtn._wired = true;
      micBtn.addEventListener('click', () => {
        if (this.isListening) this.stop();
        else this.start();
      });
    }
  },

  start() {
    if (!this.recognition) this.init();
    if (!this.recognition) {
      this._setStatus('❌ Speech recognition not supported in this browser.');
      return;
    }
    this.isListening = true;
    this._setMicState(true);
    this._setStatus('🎙️ Listening… Speak your answer!');
    try { this.recognition.start(); } catch(e) {}
  },

  stop() {
    this.isListening = false;
    if (this.recognition) this.recognition.stop();
    this._setMicState(false);
    this._setStatus('Click mic to start listening');
    const pill = document.getElementById('voice-transcript-pill');
    if (pill) pill.style.display = 'none';
  },

  _setMicState(active) {
    const micBtn = document.getElementById('mic-btn');
    if (micBtn) {
      if (active) micBtn.classList.add('mic-active');
      else micBtn.classList.remove('mic-active');
    }
  },

  _setStatus(text) {
    const label = document.getElementById('voice-status-label');
    if (label) label.textContent = text;
  },

  _updateTranscript(text) {
    const pill = document.getElementById('voice-transcript-pill');
    const span = document.getElementById('voice-transcript-text');
    if (pill && span) {
      pill.style.display = 'flex';
      span.textContent = '"' + text + '"';
    }
  },

  _parseAndRespond(text) {
    // MCQ option mappings
    const optionMap = {
      'option a': 0, 'choice a': 0, 'first': 0, 'one': 0, ' a ': 0,
      'option b': 1, 'choice b': 1, 'second': 1, 'two': 1, ' b ': 1,
      'option c': 2, 'choice c': 2, 'third': 2, 'three': 2, ' c ': 2,
      'option d': 3, 'choice d': 3, 'fourth': 3, 'four': 3, ' d ': 3,
    };
    const ratingMap = {
      'know it': 'know', 'i know it': 'know', 'know': 'know', 'got it': 'know',
      'fuzzy': 'fuzzy', 'not sure': 'fuzzy', 'maybe': 'fuzzy', 'kind of': 'fuzzy',
      "don't know": 'nope', 'do not know': 'nope', 'no idea': 'nope',
    };

    for (const [phrase, idx] of Object.entries(optionMap)) {
      if (text.includes(phrase)) {
        const opts = document.querySelectorAll('#review-options .mcq-option');
        if (opts[idx] && opts[idx].style.pointerEvents !== 'none') {
          opts[idx].click();
          TTSManager.speak('Selecting option ' + ['A','B','C','D'][idx]);
          this._setStatus('✅ Answered: Option ' + ['A','B','C','D'][idx]);
          return;
        }
      }
    }

    for (const [phrase, rating] of Object.entries(ratingMap)) {
      if (text.includes(phrase)) {
        const sel = rating === 'nope' ? '.rating-btn.nope' : `.rating-btn.${rating}`;
        const btn = document.querySelector(sel);
        if (btn) {
          btn.click();
          const msg = rating === 'know' ? 'Marked as Know it.' : rating === 'fuzzy' ? 'Marked as Fuzzy.' : "Marked as Don't know.";
          TTSManager.speak(msg);
          this._setStatus('✅ Rated: ' + phrase);
          return;
        }
      }
    }

    if (text.includes('next') || text.includes('skip')) {
      document.getElementById('review-next-btn')?.click();
      this._setStatus('⏭️ Next card…');
      return;
    }
    if (text.includes('previous') || text.includes('back')) {
      document.getElementById('review-prev-btn')?.click();
      this._setStatus('⏮️ Previous card…');
      return;
    }
    if (text.includes('flip') || text.includes('show answer')) {
      document.getElementById('card-header-click')?.click();
      this._setStatus('🔄 Flipping card…');
      return;
    }

    this._setStatus('🤔 Didn\'t catch that — say "Option A", "B", "Know it", "Fuzzy"...');
  }
};

// Wire voice mode into MutationObserver on review container
(function wireVoiceMode() {
  const reviewContainer = document.getElementById('review-container');
  if (!reviewContainer) return;
  const mo = new MutationObserver(() => {
    const wrap = document.getElementById('voice-controls-wrap');
    if (!wrap) return;
    if (selectedStudyMode === 'voice' && reviewContainer.classList.contains('visible')) {
      wrap.style.display = 'block';
      VoiceQuizEngine.init();
      VoiceQuizEngine.start();
    } else if (selectedStudyMode === 'voice' && !reviewContainer.classList.contains('visible')) {
      VoiceQuizEngine.stop();
      wrap.style.display = 'none';
    }
  });
  mo.observe(reviewContainer, { attributes: true, attributeFilter: ['class'] });
})();

// ============================================================
//  EduFlash AI — Day 12: AI Weak-Spot Remediation Generator
// ============================================================

async function generateStudentRemediation() {
  const btn = document.getElementById('btn-student-remediation');
  const section = document.getElementById('remediation-section');
  const body = document.getElementById('remediation-body');
  if (!btn || !body) return;

  const weakCards = sessionAnswers.filter(a => !a.isCorrect || a.rating === 'nope' || a.rating === 'fuzzy');
  if (weakCards.length === 0) {
    body.innerHTML = '<p style="color:var(--green-light);font-size:0.85rem;padding:8px 0;">🎉 No weak spots found! You aced this session.</p>';
    if (section) section.style.display = 'block';
    return;
  }

  btn.disabled = true;
  btn.innerHTML = '<span class="remediation-spinner"></span> Building your plan...';
  if (section) section.style.display = 'block';
  body.innerHTML = '<div style="display:flex;align-items:center;gap:8px;color:var(--yellow);font-size:0.83rem;"><span class="remediation-spinner"></span> Gemini is creating your personalized remediation plan...</div>';

  const cardContext = weakCards.map(a => {
    const card = currentSession && currentSession.cards
      ? currentSession.cards.find(c => c.id === a.cardId) : null;
    return card
      ? `Topic: ${card.topic || 'General'} | Q: ${card.question} | Correct: ${card.options ? card.options[card.correctIndex] : card.answer}`
      : '';
  }).filter(Boolean).join('\n');

  const apiKey = localStorage.getItem('ef_gemini_key') || '';

  if (!apiKey) {
    // Mock fallback
    const topics = [...new Set(weakCards.map(a => {
      const card = currentSession && currentSession.cards
        ? currentSession.cards.find(c => c.id === a.cardId) : null;
      return card ? (card.topic || 'General Concepts') : 'General Concepts';
    }))];

    body.innerHTML = topics.map(topic => `
      <div class="remediation-topic-block">
        <div class="remediation-topic-name">📌 ${topic}</div>
        <div class="remediation-mnemonic">💡 Think of this as the core pillar — trace it back to its definition, then find a real-world example to anchor it in memory.</div>
        <ul class="remediation-bullets">
          <li>Re-read your class notes with a focus on the core definition only.</li>
          <li>Use the Feynman Technique — explain it out loud in your own words.</li>
          <li>Write a 1-sentence summary and keep it somewhere visible.</li>
          <li>Find one real-world or everyday example that maps to this concept.</li>
        </ul>
      </div>`).join('');
    btn.disabled = false;
    btn.innerHTML = '🔄 Regenerate Plan';
    return;
  }

  const prompt = `You are an expert AI tutor. A student struggled with these flashcards:

${cardContext}

Create a concise AI Remediation Plan as a JSON array. For each unique topic, include:
- "topic": string
- "mnemonic": a short, memorable hook (1–2 sentences)
- "steps": array of 3-4 short actionable recovery steps

Return ONLY valid JSON. No markdown, no explanations.`;

  try {
    const resp = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
      }
    );
    const data = await resp.json();
    const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text || '[]';
    const jsonStr = rawText.replace(/```json\n?/g,'').replace(/```\n?/g,'').trim();
    const plan = JSON.parse(jsonStr);
    body.innerHTML = plan.map(item => `
      <div class="remediation-topic-block">
        <div class="remediation-topic-name">📌 ${item.topic}</div>
        <div class="remediation-mnemonic">💡 ${item.mnemonic}</div>
        <ul class="remediation-bullets">
          ${(item.steps || []).map(s => `<li>${s}</li>`).join('')}
        </ul>
      </div>`).join('');
  } catch (err) {
    body.innerHTML = `<p style="color:var(--red-light);font-size:0.82rem;">❌ Could not generate plan. Check your API key or try again.</p>`;
  }

  btn.disabled = false;
  btn.innerHTML = '🔄 Regenerate Plan';
}

// Show remediation button when completion screen appears
(function watchCompletion() {
  const completionContainer = document.getElementById('completion-container');
  if (!completionContainer) return;
  const mo = new MutationObserver(() => {
    const isVisible = completionContainer.classList.contains('visible') ||
                      completionContainer.style.display === 'flex' ||
                      completionContainer.style.display === 'block';
    if (isVisible) {
      const btn = document.getElementById('btn-student-remediation');
      const hasWeak = sessionAnswers.some(a => !a.isCorrect || a.rating === 'nope' || a.rating === 'fuzzy');
      if (btn) btn.style.display = hasWeak ? 'flex' : 'none';
      if (btn && !btn._remWired) {
        btn._remWired = true;
        btn.addEventListener('click', generateStudentRemediation);
      }
      // Day 13: render the progress timeline
      renderProgressTimeline();
      // Day 15: render Real-World Perks Hub
      if (typeof renderRealWorldPerksHub === 'function') renderRealWorldPerksHub();
      // Day 15: render Session Summary Grid
      if (typeof renderSessionSummaryGrid === 'function') renderSessionSummaryGrid();
      // Day 16 + Day 17: render Practice Planner card fallback
      if (typeof PracticePlannerEngine !== 'undefined' && currentSession) {
        const acc = sessionAnswers.length > 0
          ? Math.round((sessionAnswers.filter(a => a.isCorrect).length / sessionAnswers.length) * 100)
          : 100;
        PracticePlannerEngine.renderWidget(currentSession, acc, sessionAnswers);
      }
    }
  });
  mo.observe(completionContainer, { attributes: true, attributeFilter: ['class','style'], childList: true });
})();

// ============================================================
//  EduFlash AI — Day 13: Student Progress Timeline
// ============================================================

function renderProgressTimeline() {
  const wrap  = document.getElementById('progress-timeline-wrap');
  const track = document.getElementById('progress-timeline-track');
  const fill  = document.getElementById('progress-timeline-fill');
  if (!wrap || !track || !fill) return;

  // Collect ordered answers (same order as cards were shown)
  if (!sessionAnswers || sessionAnswers.length === 0) {
    wrap.style.display = 'none';
    return;
  }

  wrap.style.display = 'block';

  // Remove any previously injected dots (keep the two line elements)
  track.querySelectorAll('.progress-dot-wrap').forEach(el => el.remove());
  fill.style.width = '0%';

  const answers = sessionAnswers;

  // Build dot wrappers
  answers.forEach((answer, idx) => {
    const dotClass = answer.isCorrect ? 'correct' : 'wrong';
    const rating   = answer.rating || '';
    const ratingLabel = rating === 'know' ? '✓ Know it' : rating === 'fuzzy' ? '~ Fuzzy' : rating === 'nope' ? '✗ Don\'t know' : '';

    // Find card question if available
    const card = currentSession && currentSession.cards
      ? currentSession.cards.find(c => c.id === answer.cardId)
      : null;
    const qShort = card
      ? (card.question.length > 50 ? card.question.slice(0, 48) + '…' : card.question)
      : `Card ${idx + 1}`;

    const dotWrap = document.createElement('div');
    dotWrap.className = 'progress-dot-wrap';

    dotWrap.innerHTML = `
      <div class="progress-dot ${dotClass}" style="transition-delay:${idx * 80}ms;">
        <div class="progress-dot-tooltip">
          <strong>Q${idx + 1}:</strong> ${qShort}<br/>
          <span style="color:${answer.isCorrect ? 'var(--green-light)' : '#f28b82'};">
            ${answer.isCorrect ? '✓ Correct' : '✗ Wrong'}
          </span>
          ${ratingLabel ? `<br/><span style="color:var(--text-dim);font-size:0.68rem;">${ratingLabel}</span>` : ''}
        </div>
      </div>
    `;
    track.appendChild(dotWrap);
  });

  // Animate dots in sequence, then draw the connecting line
  requestAnimationFrame(() => {
    const dots = track.querySelectorAll('.progress-dot');
    dots.forEach((dot, idx) => {
      setTimeout(() => dot.classList.add('revealed'), idx * 80 + 50);
    });

    // Expand the gradient line after dots start appearing
    setTimeout(() => {
      fill.style.width = '100%';
    }, 100);
  });
}

// ============================================================
//  Day 14: XP Bar, Achievement Badges & Level-Up Modal
// ============================================================

function renderXPBar() {
  const container = document.getElementById('xp-bar-container');
  if (!container) return;
  container.style.display = 'block';

  const { current, next, progress, currentXP } = XPEngine.getLevelProgress(XPEngine.getTotalXP());

  container.innerHTML = `
    <div class="xp-level-header">
      <span class="xp-level-badge">${current.emoji} ${current.name}</span>
      <span class="xp-points-label">${currentXP} XP</span>
    </div>
    <div class="xp-bar-track">
      <div class="xp-bar-fill" style="width:0%"></div>
    </div>
    <div class="xp-level-footer">
      ${next ? `<span class="xp-next-level">${next.emoji} ${next.name} at ${next.minXP} XP</span>` : '<span class="xp-next-level">🏆 Max Level Reached!</span>'}
    </div>
  `;

  // Animate fill
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      const fill = container.querySelector('.xp-bar-fill');
      if (fill) fill.style.width = progress + '%';
    });
  });
}

function renderAchievementBadges() {
  const container = document.getElementById('achievements-grid');
  if (!container) return;
  container.style.display = 'grid';

  const newUnlocks = AchievementTracker.checkAndUnlock();
  const unlocked = AchievementTracker.getUnlocked();

  container.innerHTML = AchievementTracker.BADGES.map(badge => {
    const isUnlocked = unlocked.includes(badge.id);
    const isNew = newUnlocks.some(b => b.id === badge.id);
    return `
      <div class="achievement-badge ${isUnlocked ? 'unlocked' : 'locked'} ${isNew ? 'newly-unlocked' : ''}" title="${badge.desc}">
        <span class="achievement-emoji">${badge.emoji}</span>
        <span class="achievement-name">${badge.name}</span>
        ${isNew ? '<span class="achievement-new-tag">NEW!</span>' : ''}
      </div>
    `;
  }).join('');
}

function showLevelUpModal(newLevel) {
  const modal = document.getElementById('levelup-modal');
  if (!modal) return;

  document.getElementById('levelup-emoji').textContent = newLevel.emoji;
  document.getElementById('levelup-rank').textContent = newLevel.name;

  modal.style.display = 'flex';
  SoundFX.playFanfare();

  // Auto-close after 3.5 seconds
  setTimeout(() => { modal.style.display = 'none'; }, 3500);

  // Click to dismiss
  modal.onclick = () => { modal.style.display = 'none'; };
}

// ============================================================
//  Day 14: AI Adaptive Study Path
// ============================================================

async function generateAIStudyPath() {
  const btn = document.getElementById('btn-study-path');
  const container = document.getElementById('study-path-container');
  if (!btn || !container) return;

  btn.disabled = true;
  btn.textContent = '🧭 Analyzing your performance...';
  container.style.display = 'block';
  container.innerHTML = '<div style="text-align:center; padding:20px; color:var(--text-muted); font-size:0.85rem;">⏳ Building your personalized study path…</div>';

  const history = JSON.parse(localStorage.getItem('ef_review_history') || '[]');
  const leitnerData = JSON.parse(localStorage.getItem('ef_spaced_data') || '{}');

  // Build topic summary from history
  const topicAgg = {};
  history.forEach(h => {
    Object.entries(h.topicScores || {}).forEach(([topic, data]) => {
      if (!topicAgg[topic]) topicAgg[topic] = { correct: 0, total: 0, sessions: 0 };
      topicAgg[topic].correct += data.correct;
      topicAgg[topic].total += data.total;
      topicAgg[topic].sessions++;
    });
  });

  // Count overdue cards per topic from Leitner
  const sessions = window.EduStore ? window.EduStore.getSessions() : [];
  const topicOverdue = {};
  Object.entries(leitnerData).forEach(([key, val]) => {
    if (val.nextReview && new Date(val.nextReview) <= new Date()) {
      // Find the card's topic
      for (const sess of sessions) {
        const card = (sess.cards || []).find(c => key.endsWith('_' + c.id));
        if (card) {
          const t = card.topic || 'General';
          topicOverdue[t] = (topicOverdue[t] || 0) + 1;
          break;
        }
      }
    }
  });

  const topicSummary = Object.entries(topicAgg).map(([topic, data]) => ({
    topic,
    accuracy: Math.round((data.correct / data.total) * 100),
    totalQuestions: data.total,
    sessions: data.sessions,
    overdueCards: topicOverdue[topic] || 0
  }));

  if (topicSummary.length === 0) {
    container.innerHTML = '<div style="text-align:center; padding:20px; color:var(--text-dim); font-size:0.85rem;">Complete a few more sessions to generate a study path.</div>';
    btn.disabled = false;
    btn.textContent = '🧭 Generate AI Study Path';
    return;
  }

  const apiKey = window.EduStore ? window.EduStore.getApiKey() : null;

  if (apiKey) {
    try {
      const prompt = `You are a learning analytics AI for a flashcard study app. A student has the following topic performance data:\n\n${JSON.stringify(topicSummary, null, 2)}\n\nBased on this data, generate a prioritized study path — a ranked list of the top ${Math.min(5, topicSummary.length)} topics this student should review next, ordered from most urgent to least.\n\nFor each topic, provide:\n- "rank": integer 1-5\n- "topic": topic name (exact match from data)\n- "reason": 1-sentence rationale combining accuracy, practice frequency, and overdue cards\n- "urgency": "high" | "medium" | "low"\n\nRespond with ONLY a JSON array. No markdown fences. Example:\n[{"rank":1,"topic":"Newton Laws","reason":"Low 40% accuracy with 3 overdue cards","urgency":"high"}]`;

      const resp = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
      });

      const data = await resp.json();
      let text = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
      // Strip markdown fences if present
      text = text.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
      const path = JSON.parse(text);
      renderStudyPath(path);
      btn.disabled = false;
      btn.textContent = '🧭 Refresh AI Study Path';
      return;
    } catch (e) {
      console.warn('AI Study Path error, falling back to heuristic:', e);
    }
  }

  // Offline heuristic fallback
  const heuristicPath = topicSummary
    .map(t => ({
      rank: 0,
      topic: t.topic,
      reason: `${t.accuracy}% accuracy across ${t.totalQuestions} questions${t.overdueCards > 0 ? `, ${t.overdueCards} overdue card${t.overdueCards > 1 ? 's' : ''}` : ''}`,
      urgency: t.accuracy < 50 ? 'high' : t.accuracy < 75 ? 'medium' : 'low'
    }))
    .sort((a, b) => {
      const urgencyOrder = { high: 0, medium: 1, low: 2 };
      return (urgencyOrder[a.urgency] - urgencyOrder[b.urgency]);
    })
    .slice(0, 5)
    .map((item, idx) => ({ ...item, rank: idx + 1 }));

  renderStudyPath(heuristicPath);
  btn.disabled = false;
  btn.textContent = '🧭 Refresh AI Study Path';
}

function renderStudyPath(pathItems) {
  const container = document.getElementById('study-path-container');
  if (!container) return;

  const urgencyColors = {
    high: { bg: 'rgba(234,67,53,0.12)', border: 'rgba(234,67,53,0.3)', text: '#f28b82', label: '🔴 High' },
    medium: { bg: 'rgba(251,188,4,0.12)', border: 'rgba(251,188,4,0.3)', text: 'var(--yellow-light)', label: '🟡 Medium' },
    low: { bg: 'rgba(52,168,83,0.12)', border: 'rgba(52,168,83,0.3)', text: 'var(--green-light)', label: '🟢 Low' }
  };

  container.innerHTML = `
    <div class="study-path-title">🧭 Your Personalized Study Path</div>
    <div class="study-path-list">
      ${pathItems.map(item => {
        const colors = urgencyColors[item.urgency] || urgencyColors.medium;
        return `
          <div class="study-path-item" style="background:${colors.bg}; border-color:${colors.border};">
            <div class="study-path-rank">#${item.rank}</div>
            <div class="study-path-body">
              <div class="study-path-topic">${escapeHTML(item.topic)}</div>
              <div class="study-path-reason">${escapeHTML(item.reason)}</div>
            </div>
            <span class="study-path-urgency" style="color:${colors.text};">${colors.label}</span>
          </div>
        `;
      }).join('')}
    </div>
  `;
}

// Wire the study path button
(function() {
  document.addEventListener('DOMContentLoaded', () => {
    const btn = document.getElementById('btn-study-path');
    if (btn) btn.addEventListener('click', generateAIStudyPath);
  });
})();

// ============================================================
//  EduFlash AI — Day 15: Real-World Competencies, Perks & Scenario Challenges
// ============================================================

const RealWorldPerksEngine = {
  getCompetencyTier(xp) {
    if (xp >= 1000) return { name: 'Industry-Ready Master', badge: '💎 Master Analyst', perk: 'Qualified for Industry Internship & Class TA Nomination' };
    if (xp >= 600)  return { name: 'Subject Lead', badge: '👑 Subject Specialist', perk: 'Peer Tutor & Senior Study Lead Eligible' };
    if (xp >= 300)  return { name: 'Practical Specialist', badge: '🎓 Applied Practitioner', perk: 'Real-World Case Study Unlocked' };
    if (xp >= 100)  return { name: 'Applied Analyst', badge: '📖 Concept Practitioner', perk: 'Bonus Resource Access Unlocked' };
    return { name: 'Novice Explorer', badge: '🌱 Foundations Explorer', perk: 'Build your streak to unlock perks' };
  }
};

function renderRealWorldPerksHub() {
  const container = document.getElementById('perks-hub-card');
  const body = document.getElementById('perks-hub-body');
  if (!container || !body) return;

  const totalXP = (typeof XPEngine !== 'undefined') ? XPEngine.getTotalXP() : 150;
  const tier = RealWorldPerksEngine.getCompetencyTier(totalXP);
  
  const total = sessionAnswers.length;
  const correct = sessionAnswers.filter(a => a.isCorrect).length;
  const accuracyPct = total > 0 ? Math.round((correct / total) * 100) : 0;
  const topic = (currentSession && currentSession.topic) ? currentSession.topic : 'General Concept';

  container.style.display = 'block';

  body.innerHTML = `
    <div class="perks-badge-row">
      <div class="perks-competency-pill">
        <span class="perks-pill-icon">🏅</span>
        <div>
          <div class="perks-pill-title">${tier.name}</div>
          <div class="perks-pill-desc">${tier.badge}</div>
        </div>
      </div>
      <div class="perks-accuracy-pill">
        <span class="perks-pill-icon">🎯</span>
        <div>
          <div class="perks-pill-title">${accuracyPct}% Mastery</div>
          <div class="perks-pill-desc">${accuracyPct >= 75 ? 'Perks Qualified' : 'Practice to Upgrade'}</div>
        </div>
      </div>
    </div>

    <div class="perks-unlocked-box">
      <div class="perk-unlocked-title">🎁 Current Perks & Credentials:</div>
      <div class="perk-item">
        <span class="perk-icon">✨</span>
        <div class="perk-detail">
          <strong>Classroom Perk:</strong> ${tier.perk}
        </div>
      </div>
      <div class="perk-item">
        <span class="perk-icon">📜</span>
        <div class="perk-detail">
          <strong>Skill Credential:</strong> Verified Competency in <em>${escapeHTML(topic)}</em>
        </div>
      </div>
    </div>

    <div style="margin-top:12px;">
      <button class="btn btn-green btn-sm" id="btn-launch-scenario" style="width:100%; font-size:0.85rem; padding:10px;">
        🎯 Launch Real-World Scenario Challenge →
      </button>
    </div>
  `;

  document.getElementById('btn-launch-scenario')?.addEventListener('click', () => {
    openScenarioChallenge(topic);
  });
}

async function openScenarioChallenge(topic) {
  const overlay = document.getElementById('scenario-modal-overlay');
  const qBox = document.getElementById('scenario-question-box');
  const grid = document.getElementById('scenario-options-grid');
  const feedback = document.getElementById('scenario-feedback');
  const closeBtn = document.getElementById('scenario-close-btn');
  const dismissBtn = document.getElementById('scenario-dismiss-btn');
  const topicTag = document.getElementById('scenario-topic-tag');

  if (!overlay || !qBox || !grid) return;

  if (topicTag) topicTag.textContent = `Topic: ${topic || 'General Practice'}`;
  qBox.innerHTML = '<div style="text-align:center; padding:16px; color:var(--text-muted);">⏳ Generating real-world scenario from your flashcard topic...</div>';
  grid.innerHTML = '';
  if (feedback) feedback.style.display = 'none';

  overlay.style.display = 'flex';

  const closeHandler = () => { overlay.style.display = 'none'; };
  if (closeBtn) closeBtn.onclick = closeHandler;
  if (dismissBtn) dismissBtn.onclick = closeHandler;

  const apiKey = window.EduStore ? window.EduStore.getApiKey() : null;

  let scenarioData = null;

  if (apiKey) {
    try {
      const cardContext = (currentSession && currentSession.cards) ? currentSession.cards.map(c => c.question).join('; ') : topic;
      const prompt = `You are a practical learning AI. Generate a real-world scenario application question based on the topic "${topic}" and these concepts: "${cardContext}".
Provide:
- "scenario": a 2-sentence real-world problem scenario (e.g. engineering, industry, medical, or daily life application).
- "question": 1 practical question asking how to apply the concept.
- "options": array of 3 options (A, B, C).
- "correctIndex": integer (0, 1, or 2).
- "explanation": 1-2 sentence real-world explanation of why it works in practice.

Return ONLY valid JSON. No markdown fences. Example:
{"scenario":"An engineer is designing a high-speed vehicle braking system.","question":"Which physical parameter must be minimized to reduce stopping distance?","options":["Vehicle inertia","Tire surface friction","Braking delay"],"correctIndex":2,"explanation":"Minimizing system response latency directly shortens total stopping distance under high-speed operation."}`;

      const resp = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
      });

      const resData = await resp.json();
      let raw = resData?.candidates?.[0]?.content?.parts?.[0]?.text || '';
      raw = raw.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
      scenarioData = JSON.parse(raw);
    } catch (err) {
      console.warn('Gemini scenario generation fallback:', err);
    }
  }

  if (!scenarioData) {
    scenarioData = {
      scenario: `You are an engineering consultant evaluating a real-world system operational test for "${topic || 'Physics & Systems'}".`,
      question: `In practical field execution, how do you ensure optimum stability and energy transfer?`,
      options: [
        "Calibrate system response using measured empirical data",
        "Ignore environmental friction and assume 100% efficiency",
        "Operate at maximum frequency without feedback controls"
      ],
      correctIndex: 0,
      explanation: "Empirical calibration and feedback loops are essential for real-world system optimization."
    };
  }

  qBox.innerHTML = `
    <div style="font-size:0.85rem; color:var(--text-muted); margin-bottom:8px; line-height:1.5;">💼 <strong>Scenario:</strong> ${escapeHTML(scenarioData.scenario)}</div>
    <div style="font-weight:600; color:var(--text); font-size:0.92rem; font-family:'Google Sans',sans-serif;">❓ <strong>Question:</strong> ${escapeHTML(scenarioData.question)}</div>
  `;

  grid.innerHTML = scenarioData.options.map((opt, i) => `
    <button class="scenario-opt-btn" data-idx="${i}">${String.fromCharCode(65 + i)}. ${escapeHTML(opt)}</button>
  `).join('');

  grid.querySelectorAll('.scenario-opt-btn').forEach(btn => {
    btn.onclick = () => {
      const selected = parseInt(btn.dataset.idx, 10);
      const isCorrect = selected === scenarioData.correctIndex;

      grid.querySelectorAll('.scenario-opt-btn').forEach((b, idx) => {
        b.disabled = true;
        if (idx === scenarioData.correctIndex) {
          b.style.borderColor = 'var(--green)';
          b.style.background = 'rgba(52,168,83,0.15)';
        } else if (idx === selected && !isCorrect) {
          b.style.borderColor = 'var(--red-light)';
          b.style.background = 'rgba(234,67,53,0.15)';
        }
      });

      if (feedback) {
        feedback.style.display = 'block';
        feedback.className = `scenario-feedback ${isCorrect ? 'success' : 'fail'}`;
        feedback.innerHTML = `
          <strong>${isCorrect ? '🎉 Correct Real-World Application!' : '💡 Learning Opportunity'}</strong><br/>
          ${escapeHTML(scenarioData.explanation)}
          ${isCorrect ? '<br/><span style="color:var(--yellow-light); font-size:0.8rem; display:inline-block; margin-top:6px;">🌟 Real-World Competency Point Earned!</span>' : ''}
        `;
      }

      if (isCorrect && typeof SoundFX !== 'undefined') SoundFX.playFanfare();
    };
  });
}

// ============================================================
//  EduFlash AI — Day 15: Session Resume Persistence
//  Saves progress to localStorage so students can pick up
//  where they left off if they close the tab mid-session.
// ============================================================

const SessionResume = {
  KEY: 'ef_resume_state',

  save() {
    if (!currentSession) return;
    const state = {
      sessionId: currentSession.id,
      cardIndex: currentCardIndex,
      answers: sessionAnswers,
      mode: selectedStudyMode,
      savedAt: new Date().toISOString(),
      sessionMeta: { topic: currentSession.topic, subject: currentSession.subject }
    };
    try {
      localStorage.setItem(this.KEY, JSON.stringify(state));
    } catch (e) {}
  },

  load() {
    try {
      const raw = localStorage.getItem(this.KEY);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch (e) { return null; }
  },

  clear() {
    localStorage.removeItem(this.KEY);
  },

  hasResumable() {
    const s = this.load();
    if (!s) return false;
    // Only consider valid if it's less than 24h old
    const age = Date.now() - new Date(s.savedAt).getTime();
    return age < 86400000;
  }
};

// Check for a resumable session on page load and show the banner
(function initResumeBanner() {
  document.addEventListener('DOMContentLoaded', () => {
    if (!SessionResume.hasResumable()) return;

    const state = SessionResume.load();
    const banner = document.getElementById('resume-banner');
    const label = document.getElementById('resume-session-label');
    const sub = document.getElementById('resume-session-sub');
    const continueBtn = document.getElementById('resume-continue-btn');
    const discardBtn = document.getElementById('resume-discard-btn');

    if (!banner) return;

    const topic = state?.sessionMeta?.topic || 'Unknown session';
    const answered = (state?.answers || []).filter(Boolean).length;
    const total = (state?.answers || []).length;

    if (label) label.textContent = `Continue: ${topic}`;
    if (sub) sub.textContent = `${answered} of ${total} cards answered · ${state?.mode || 'Standard'} mode`;

    banner.style.display = 'block';

    if (continueBtn) {
      continueBtn.addEventListener('click', () => {
        // Find session in store
        let session = null;
        if (window.EduStore && state.sessionId) {
          session = window.EduStore.getSessionById(state.sessionId);
        }
        if (!session) session = getDefaultSession();

        // Restore state
        selectedStudyMode = state.mode || 'standard';
        currentCardIndex = state.cardIndex || 0;
        sessionAnswers = state.answers || [];

        banner.style.display = 'none';
        startReview(session, true); // pass resuming=true
      });
    }

    if (discardBtn) {
      discardBtn.addEventListener('click', () => {
        SessionResume.clear();
        banner.style.display = 'none';
      });
    }
  });
})();



// ============================================================
//  EduFlash AI — Day 15: Session Summary Card Grid
//  Shows every card as a colour-coded pill on the completion
//  screen, with topic + result on hover, replacing the less
//  intuitive dot-timeline.
// ============================================================

function renderSessionSummaryGrid() {
  const wrap = document.getElementById('session-summary-grid-wrap');
  const grid = document.getElementById('ssq-grid');
  if (!wrap || !grid) return;

  const answers = sessionAnswers.filter(Boolean);
  if (!currentSession || answers.length === 0) {
    wrap.style.display = 'none';
    return;
  }

  wrap.style.display = 'block';

  grid.innerHTML = answers.map((ans, idx) => {
    const card = currentSession.cards ? currentSession.cards.find(c => c.id === ans.cardId) : null;
    const question = card ? (card.question.length > 55 ? card.question.slice(0, 53) + '…' : card.question) : `Card ${idx + 1}`;
    const topic = card ? (card.topic || currentSession.topic || '') : '';

    // Determine colour class
    let cls = 'ssq-pill-missed'; // red — wrong + nope
    let icon = '✗';
    if (ans.isCorrect && ans.rating === 'know') {
      cls = 'ssq-pill-know'; icon = '✓';
    } else if (ans.isCorrect && ans.rating === 'fuzzy') {
      cls = 'ssq-pill-fuzzy'; icon = '~';
    } else if (!ans.isCorrect && ans.rating === 'fuzzy') {
      cls = 'ssq-pill-fuzzy-wrong'; icon = '~';
    } else if (ans.isCorrect) {
      cls = 'ssq-pill-know'; icon = '✓';
    }

    return `
      <div class="ssq-pill ${cls}" title="${escapeHTML(question)}">
        <span class="ssq-pill-num">${idx + 1}</span>
        <span class="ssq-pill-icon">${icon}</span>
        <div class="ssq-pill-tooltip">
          <div class="ssq-tooltip-q">${escapeHTML(question)}</div>
          ${topic ? `<div class="ssq-tooltip-topic">${escapeHTML(topic)}</div>` : ''}
          <div class="ssq-tooltip-result" style="color:${ans.isCorrect ? 'var(--green-light)' : '#f28b82'};">
            ${ans.isCorrect ? '✓ Correct' : '✗ Wrong'} · ${ans.rating === 'know' ? 'Know it' : ans.rating === 'fuzzy' ? 'Fuzzy' : "Don't know"}
          </div>
        </div>
      </div>
    `;
  }).join('');
}

// ============================================================
//  EduFlash AI — Day 16 + Day 17: Personalized Practice Schedule Engine
// ============================================================
const PracticePlannerEngine = {
  selectedTime: localStorage.getItem('ef_planner_time') || '16:00',
  currentPlan: null,
  currentSession: null,

  // ── Heuristic plan calculation (instant fallback) ──────────
  calculatePlan(session, accuracy, responses) {
    let knowCount = 0, fuzzyCount = 0, nopeCount = 0;
    if (Array.isArray(responses)) {
      responses.forEach(r => {
        if (!r) return;
        if (r.rating === 'know') knowCount++;
        else if (r.rating === 'fuzzy') fuzzyCount++;
        else if (r.rating === 'nope') nopeCount++;
      });
    }

    const totalResp = Math.max(1, responses ? responses.length : 1);
    let status = 'moderate';
    let cadenceText = '2x / week';
    let retentionPct = 78;
    let daysOffset = [1, 3, 7];

    if (accuracy >= 85 && knowCount >= (totalResp * 0.6)) {
      status = 'solidified';
      cadenceText = '1x / week (Maintenance)';
      retentionPct = 94;
      daysOffset = [3, 7, 21];
    } else if (accuracy < 65 || nopeCount > (totalResp * 0.3)) {
      status = 'decay_risk';
      cadenceText = '3x / week (Urgent Review)';
      retentionPct = 58;
      daysOffset = [1, 2, 5];
    }

    const whyReason = status === 'solidified'
      ? `Your score of ${accuracy}% and ${knowCount} confident "Know it" ratings show strong recall. A weekly maintenance review is enough to keep this topic in long-term memory.`
      : status === 'decay_risk'
      ? `Your score of ${accuracy}% with ${nopeCount} missed or fuzzy cards signals active memory decay. Without review in 24 hours, retention can drop below 40%. Reviewing urgently 3 times this week prevents that loss.`
      : `Your score of ${accuracy}% shows solid understanding, but the Ebbinghaus Forgetting Curve predicts ~22% memory loss after one week without review. Two sessions per week keeps retention above 78%.`;

    let weeklyRecommendation = `Based on your score of <strong>${accuracy}%</strong>, we recommend practicing this topic <strong>2 times a week</strong> to solidify your recall and convert short-term learning into permanent memory.`;
    if (status === 'solidified') {
      weeklyRecommendation = `Outstanding! Your high score of <strong>${accuracy}%</strong> and confident ratings mean <strong>1 weekly maintenance review</strong> is all you need.`;
    } else if (status === 'decay_risk') {
      weeklyRecommendation = `Urgent review recommended! With a score of <strong>${accuracy}%</strong> (${nopeCount} missed/fuzzy), practice <strong>3 times this week</strong> to stop memory decay.`;
    }

    const today = new Date();
    const stepNames = ['First Memory Reinforcement', 'Deep Recall Practice', 'Mastery Solidification'];
    const stepGoals = ['Lock short-term memory', 'Consolidate to long-term memory', 'Permanent recall & mastery check'];
    const stepIcons = ['⚡', '🧠', '🏆'];
    const stepTips = [
      'Re-read key definitions, then close your notes and write them from memory.',
      'Explain each concept out loud using the Feynman Technique — simplest words only.',
      'Practice a mock quiz or teach a classmate to confirm mastery.'
    ];

    const steps = daysOffset.map((offsetDays, idx) => {
      const targetDate = new Date(today);
      targetDate.setDate(today.getDate() + offsetDays);
      return {
        stepNum: idx + 1,
        offsetDays,
        dateStr: targetDate.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }),
        isoDate: targetDate.toISOString().split('T')[0],
        name: stepNames[idx],
        icon: stepIcons[idx],
        stepGoal: stepGoals[idx],
        tip: stepTips[idx]
      };
    });

    return {
      status, cadenceText, retentionPct, weeklyRecommendation, whyReason, steps,
      topic: (session && session.topic) ? session.topic : 'Flashcard Deck',
      subject: (session && session.subject) ? session.subject : 'General Study',
      isAI: false
    };
  },

  // ── Day 17: Gemini AI-powered plan generation ─────────────
  async generateAIPlan(session, accuracy, responses) {
    const apiKey = localStorage.getItem('ef_gemini_key') || window.EduStore?.getApiKey?.() || '';
    if (!apiKey) return null; // fallback to heuristic

    let knowCount = 0, fuzzyCount = 0, nopeCount = 0;
    (responses || []).forEach(r => {
      if (!r) return;
      if (r.rating === 'know') knowCount++;
      else if (r.rating === 'fuzzy') fuzzyCount++;
      else if (r.rating === 'nope') nopeCount++;
    });

    const topic = (session && session.topic) ? session.topic : 'General Study';
    const subject = (session && session.subject) ? session.subject : 'General';

    const prompt = `You are an expert memory coach. A student just completed a flashcard review session with the following stats:

- Subject: ${subject}
- Topic: ${topic}
- MCQ Accuracy: ${accuracy}%
- Know it: ${knowCount} cards | Fuzzy: ${fuzzyCount} cards | Don't Know: ${nopeCount} cards

Based on the Ebbinghaus Forgetting Curve and spaced repetition science, create a personalized 3-step practice schedule.

Return ONLY a valid JSON object (no markdown, no extra text) with this exact shape:
{
  "cadenceText": "e.g. 3x / week (Urgent Review)",
  "retentionPct": 72,
  "weeklyRecommendation": "Short paragraph explaining the recommended review frequency in plain English using the student's actual score.",
  "whyReason": "1-2 sentence scientific rationale for the schedule based on their specific performance.",
  "steps": [
    { "name": "Step name", "icon": "emoji", "stepGoal": "Short goal", "offsetDays": 1, "tip": "One concrete actionable study tip" },
    { "name": "Step name", "icon": "emoji", "stepGoal": "Short goal", "offsetDays": 3, "tip": "One concrete actionable study tip" },
    { "name": "Step name", "icon": "emoji", "stepGoal": "Short goal", "offsetDays": 7, "tip": "One concrete actionable study tip" }
  ]
}`;

    try {
      const models = ['gemini-2.5-flash', 'gemini-1.5-flash-latest', 'gemini-1.5-flash'];
      let rawText = null;
      for (const model of models) {
        try {
          const resp = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
            }
          );
          const data = await resp.json();
          rawText = data.candidates?.[0]?.content?.parts?.[0]?.text || null;
          if (rawText) break;
        } catch (_) {}
      }
      if (!rawText) return null;

      const jsonStr = rawText.replace(/```json\n?/g,'').replace(/```\n?/g,'').trim();
      const aiPlan = JSON.parse(jsonStr);

      // Build full steps with dates
      const today = new Date();
      aiPlan.steps = (aiPlan.steps || []).map((s, idx) => {
        const targetDate = new Date(today);
        targetDate.setDate(today.getDate() + (s.offsetDays || (idx === 0 ? 1 : idx === 1 ? 3 : 7)));
        return {
          ...s,
          stepNum: idx + 1,
          dateStr: targetDate.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }),
          isoDate: targetDate.toISOString().split('T')[0]
        };
      });

      aiPlan.topic = topic;
      aiPlan.subject = subject;
      aiPlan.status = aiPlan.retentionPct >= 85 ? 'solidified' : aiPlan.retentionPct < 65 ? 'decay_risk' : 'moderate';
      aiPlan.isAI = true;
      return aiPlan;
    } catch (err) {
      console.warn('[PracticePlannerEngine] AI plan generation failed:', err);
      return null;
    }
  },

  // ── Day 17: Draw Ebbinghaus Retention Curve on Canvas ──────
  drawRetentionCurve(canvas, plan) {
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const W = canvas.offsetWidth || 480;
    const H = 100;
    canvas.width = W;
    canvas.height = H;

    // Day labels across 30 days
    const dayPoints = [0, 1, 2, 3, 7, 14, 21, 30];
    // Ebbinghaus forgetting curve: R = e^(-t/S) where S varies by initial strength
    const S = plan.retentionPct >= 85 ? 18 : plan.retentionPct >= 65 ? 10 : 5;
    const retentionAtDay = (d) => Math.round(100 * Math.exp(-d / S));

    const PAD_LEFT = 10, PAD_RIGHT = 10, PAD_TOP = 12, PAD_BOTTOM = 18;
    const chartW = W - PAD_LEFT - PAD_RIGHT;
    const chartH = H - PAD_TOP - PAD_BOTTOM;

    const xOfDay = d => PAD_LEFT + (d / 30) * chartW;
    const yOfPct = p => PAD_TOP + chartH - (p / 100) * chartH;

    // Background
    ctx.clearRect(0, 0, W, H);

    // Gradient fill under curve
    const grad = ctx.createLinearGradient(0, PAD_TOP, 0, PAD_TOP + chartH);
    grad.addColorStop(0, 'rgba(52,168,83,0.18)');
    grad.addColorStop(1, 'rgba(52,168,83,0.01)');

    // Draw curve path
    ctx.beginPath();
    ctx.moveTo(xOfDay(0), yOfPct(100));
    for (let d = 0; d <= 30; d++) {
      ctx.lineTo(xOfDay(d), yOfPct(retentionAtDay(d)));
    }
    // Fill
    ctx.lineTo(xOfDay(30), PAD_TOP + chartH);
    ctx.lineTo(xOfDay(0), PAD_TOP + chartH);
    ctx.closePath();
    ctx.fillStyle = grad;
    ctx.fill();

    // Stroke the curve
    ctx.beginPath();
    ctx.moveTo(xOfDay(0), yOfPct(100));
    for (let d = 0; d <= 30; d++) {
      ctx.lineTo(xOfDay(d), yOfPct(retentionAtDay(d)));
    }
    ctx.strokeStyle = 'rgba(52,168,83,0.7)';
    ctx.lineWidth = 2;
    ctx.lineJoin = 'round';
    ctx.stroke();

    // Mark review day dots
    const reviewDays = (plan.steps || []).map(s => s.offsetDays || 0);
    reviewDays.forEach(d => {
      const x = xOfDay(d);
      const pct = retentionAtDay(d);
      const y = yOfPct(pct);

      // Recovery line up from curve point
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x, yOfPct(Math.min(100, pct + 22)));
      ctx.strokeStyle = 'rgba(52,168,83,0.4)';
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 3]);
      ctx.stroke();
      ctx.setLineDash([]);

      // Dot on curve
      ctx.beginPath();
      ctx.arc(x, y, 5, 0, Math.PI * 2);
      ctx.fillStyle = '#34a853';
      ctx.fill();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // Day label below
      ctx.fillStyle = 'rgba(255,255,255,0.45)';
      ctx.font = '9px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(`D${d}`, x, PAD_TOP + chartH + 13);
    });

    // Horizontal 50% guide line
    ctx.beginPath();
    ctx.moveTo(PAD_LEFT, yOfPct(50));
    ctx.lineTo(W - PAD_RIGHT, yOfPct(50));
    ctx.strokeStyle = 'rgba(251,188,4,0.2)';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = 'rgba(251,188,4,0.5)';
    ctx.font = '8px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('50%', PAD_LEFT + 2, yOfPct(50) - 3);
  },

  // ── Render Widget on completion screen ─────────────────────
  renderWidget(session, accuracy, responses) {
    const cardEl = document.getElementById('practice-planner-card');
    if (!cardEl) return;

    cardEl.style.display = 'block';

    // Apply heuristic plan instantly for fast render
    const plan = this.calculatePlan(session, accuracy, responses);
    this.currentPlan = plan;
    this.currentSession = session;
    this._applyPlanToUI(plan);

    // Restore persisted time preference
    const savedTime = localStorage.getItem('ef_planner_time') || '16:00';
    this.selectedTime = savedTime;
    const chips = document.querySelectorAll('.planner-time-chip');
    chips.forEach(chip => {
      chip.classList.toggle('active', chip.dataset.time === savedTime);
      chip.onclick = () => {
        chips.forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        this.selectedTime = chip.dataset.time || '16:00';
        localStorage.setItem('ef_planner_time', this.selectedTime);
      };
    });

    const saveBtn = document.getElementById('btn-save-plan');
    if (saveBtn) saveBtn.onclick = () => this.saveToStudyPlan();

    const exportBtn = document.getElementById('btn-export-ics');
    if (exportBtn) exportBtn.onclick = () => this.exportICS();

    // Day 17: Wire AI Plan button
    const aiBtn = document.getElementById('btn-generate-ai-plan');
    if (aiBtn) {
      aiBtn.onclick = async () => {
        aiBtn.disabled = true;
        aiBtn.textContent = '⏳ Generating…';
        const loadingEl = document.getElementById('planner-ai-loading');
        const bodyEl = document.getElementById('planner-card-body');
        if (loadingEl) loadingEl.style.display = 'flex';
        if (bodyEl) bodyEl.style.opacity = '0.4';

        const aiPlan = await this.generateAIPlan(session, accuracy, responses);

        if (loadingEl) loadingEl.style.display = 'none';
        if (bodyEl) bodyEl.style.opacity = '1';

        if (aiPlan) {
          this.currentPlan = aiPlan;
          this._applyPlanToUI(aiPlan);
          aiBtn.textContent = '✅ AI Plan Active';
          if (typeof showToast !== 'undefined') showToast('✨ Gemini generated your personalized plan!', 'success');
        } else {
          aiBtn.disabled = false;
          aiBtn.textContent = '✨ AI Plan';
          if (typeof showToast !== 'undefined') showToast('⚠️ AI plan unavailable — using smart defaults. Add your Gemini API key in Settings to enable.', 'info');
        }
      };
    }

    // Day 17: Wire Why accordion
    this.initWhySection();

    // Draw retention curve
    setTimeout(() => {
      const canvas = document.getElementById('retention-curve-canvas');
      if (canvas) this.drawRetentionCurve(canvas, plan);
    }, 80);
  },

  // ── Apply a plan object to all UI elements ─────────────────
  _applyPlanToUI(plan) {
    const cadenceBadge = document.getElementById('planner-cadence-badge');
    if (cadenceBadge) {
      cadenceBadge.textContent = plan.cadenceText;
      const colors = {
        decay_risk: { bg: 'rgba(234,67,53,0.15)', border: 'rgba(234,67,53,0.4)', color: '#f28b82' },
        solidified:  { bg: 'rgba(52,168,83,0.15)', border: 'rgba(52,168,83,0.4)', color: 'var(--green-light)' },
        moderate:    { bg: 'rgba(251,188,4,0.15)', border: 'rgba(251,188,4,0.4)', color: 'var(--yellow)' }
      };
      const c = colors[plan.status] || colors.moderate;
      Object.assign(cadenceBadge.style, { background: c.bg, borderColor: c.border, color: c.color });
    }

    const recTextEl = document.getElementById('planner-recommendation-text');
    if (recTextEl) recTextEl.innerHTML = plan.weeklyRecommendation;

    const rateEl = document.getElementById('planner-retention-rate');
    if (rateEl) rateEl.textContent = `${plan.retentionPct}% Projected Recall`;

    const hintEl = document.getElementById('planner-forecast-hint');
    if (hintEl) {
      if (plan.status === 'decay_risk') {
        hintEl.textContent = '⚠️ Memory decay risk is high! Review tomorrow to prevent forgetting key concepts.';
      } else if (plan.status === 'solidified') {
        hintEl.textContent = '🌟 Excellent recall! Spaced maintenance reviews will keep this topic in long-term memory.';
      } else {
        hintEl.textContent = '💡 Review on the marked dates to stay above the 50% retention threshold.';
      }
    }

    // Update Why reason text
    const whyText = document.getElementById('planner-why-text');
    if (whyText && plan.whyReason) whyText.textContent = plan.whyReason;

    // Badge if AI-generated
    const titleEl = document.getElementById('planner-recommendation-title');
    if (titleEl) {
      titleEl.innerHTML = plan.isAI
        ? 'Weekly Practice Recommendation <span style="background:rgba(52,168,83,0.2);border:1px solid rgba(52,168,83,0.4);color:var(--green-light);font-size:0.65rem;padding:1px 6px;border-radius:8px;margin-left:6px;vertical-align:middle;">✨ AI</span>'
        : 'Weekly Practice Recommendation';
    }

    // Render timeline steps
    const timelineEl = document.getElementById('planner-timeline');
    if (timelineEl) {
      timelineEl.innerHTML = plan.steps.map(s => `
        <div class="planner-step-row">
          <div class="planner-step-left">
            <span class="planner-step-icon">${s.icon}</span>
            <div>
              <div class="planner-step-name">${s.name}</div>
              <div class="planner-step-goal">${s.stepGoal}</div>
              ${s.tip ? `<div style="font-size:0.68rem; color:var(--text-dim); margin-top:2px; font-style:italic;">💡 ${s.tip}</div>` : ''}
            </div>
          </div>
          <div style="text-align:right; flex-shrink:0;">
            <div class="planner-step-date">${s.dateStr}</div>
            <div style="font-size:0.68rem; color:var(--text-dim);">Due in ${s.offsetDays} day${s.offsetDays > 1 ? 's' : ''}</div>
          </div>
        </div>
      `).join('');
    }

    // Redraw curve with new plan
    setTimeout(() => {
      const canvas = document.getElementById('retention-curve-canvas');
      if (canvas) this.drawRetentionCurve(canvas, plan);
    }, 60);
  },

  // ── Day 17: Why Accordion ───────────────────────────────────
  initWhySection() {
    const toggle = document.getElementById('planner-why-toggle');
    const body = document.getElementById('planner-why-body');
    if (!toggle || !body || toggle._wired17) return;
    toggle._wired17 = true;
    toggle.addEventListener('click', () => {
      const isOpen = body.classList.toggle('open');
      toggle.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
    });
  },

  // ── Save & Export ───────────────────────────────────────────
  saveToStudyPlan() {
    if (!this.currentPlan || !this.currentSession) return;

    const item = {
      sessionId: this.currentSession.id,
      topic: this.currentPlan.topic,
      subject: this.currentPlan.subject,
      cadenceText: this.currentPlan.cadenceText,
      selectedTime: this.selectedTime,
      steps: this.currentPlan.steps,
      retentionPct: this.currentPlan.retentionPct,
      isAI: this.currentPlan.isAI || false,
      savedAt: new Date().toISOString()
    };

    window.EduStore.addPlannerItem(item);

    if (typeof showToast !== 'undefined') {
      showToast('📌 Practice schedule saved to My Planner!', 'success');
    }

    // Update badge immediately
    this.updateNavBadge();
  },

  exportICS() {
    if (!this.currentPlan || !this.currentSession) return;

    const topic = this.currentPlan.topic;
    const [hours, minutes] = (this.selectedTime || '16:00').split(':').map(Number);

    let icsContent = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//EduFlash AI//Practice Planner//EN',
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH'
    ];

    this.currentPlan.steps.forEach(step => {
      const d = new Date(step.isoDate);
      d.setHours(hours || 16, minutes || 0, 0, 0);
      const endD = new Date(d.getTime() + 15 * 60 * 1000);
      const formatICSDate = (dateObj) => dateObj.toISOString().replace(/[-:]/g,'').split('.')[0] + 'Z';

      icsContent.push(
        'BEGIN:VEVENT',
        `SUMMARY:📚 EduFlash AI Review: ${topic}`,
        `DESCRIPTION:${step.name} — ${step.stepGoal}${step.tip ? '. Tip: ' + step.tip : ''}`,
        `DTSTART:${formatICSDate(d)}`,
        `DTEND:${formatICSDate(endD)}`,
        `STATUS:CONFIRMED`,
        `BEGIN:VALARM`,
        `TRIGGER:-PT15M`,
        `ACTION:DISPLAY`,
        `DESCRIPTION:Reminder: Flashcard review for ${topic}`,
        `END:VALARM`,
        'END:VEVENT'
      );
    });

    icsContent.push('END:VCALENDAR');

    const blob = new Blob([icsContent.join('\r\n')], { type: 'text/calendar;charset=utf-8' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `EduFlash_Practice_Plan_${topic.replace(/\s+/g,'_')}.ics`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    if (typeof showToast !== 'undefined') showToast('📅 iCalendar (.ics) file downloaded!', 'success');
  },

  updateNavBadge() {
    if (typeof window.EduStore === 'undefined' || !window.EduStore.getPlannerSchedule) return;
    const list = window.EduStore.getPlannerSchedule();
    const badgeEl = document.getElementById('nav-planner-badge');
    if (badgeEl) {
      badgeEl.style.display = list.length > 0 ? 'inline-block' : 'none';
      badgeEl.textContent = list.length;
    }
  },

  initModal() {
    const navBtn = document.getElementById('nav-planner-btn');
    const overlay = document.getElementById('planner-modal-overlay');
    const closeBtn = document.getElementById('planner-close-btn');
    const doneBtn = document.getElementById('planner-done-btn');
    const clearBtn = document.getElementById('planner-clear-all-btn');

    if (!navBtn || !overlay) return;

    this.updateNavBadge();

    navBtn.onclick = () => {
      this.renderModalBody();
      overlay.style.display = 'flex';
    };

    if (closeBtn) closeBtn.onclick = () => overlay.style.display = 'none';
    if (doneBtn)  doneBtn.onclick  = () => overlay.style.display = 'none';
    if (clearBtn) {
      clearBtn.onclick = () => {
        window.EduStore.savePlannerSchedule([]);
        this.renderModalBody();
        this.updateNavBadge();
        if (typeof showToast !== 'undefined') showToast('Cleared practice schedule', 'info');
      };
    }
  },

  renderModalBody() {
    const modalBody = document.getElementById('planner-modal-body');
    if (!modalBody) return;

    const list = window.EduStore.getPlannerSchedule();
    if (list.length === 0) {
      modalBody.innerHTML = `
        <div style="text-align:center; padding:30px; color:var(--text-dim);">
          <div style="font-size:2rem; margin-bottom:8px;">🗓️</div>
          <div style="font-weight:600; color:var(--text);">No practice sessions scheduled yet</div>
          <div style="font-size:0.78rem; margin-top:4px;">Complete any flashcard review to generate an AI personalized practice plan!</div>
        </div>
      `;
      return;
    }

    const today = new Date();
    modalBody.innerHTML = list.map(item => {
      // Compute next upcoming step
      const nextStep = (item.steps || []).find(s => new Date(s.isoDate) >= today);
      const nextDateStr = nextStep ? nextStep.dateStr : 'All done!';
      const isOverdue = !nextStep && (item.steps || []).length > 0;

      return `
        <div class="planner-modal-item">
          <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:8px;">
            <div>
              <div style="font-weight:700; font-size:0.92rem; color:var(--green-light); display:flex; align-items:center; gap:6px;">
                ${escapeHTML(item.topic)}
                ${item.isAI ? '<span style="background:rgba(52,168,83,0.15);border:1px solid rgba(52,168,83,0.3);color:var(--green-light);font-size:0.62rem;padding:1px 5px;border-radius:6px;">✨ AI</span>' : ''}
              </div>
              <div style="font-size:0.74rem; color:var(--text-dim);">${escapeHTML(item.subject)} · ${item.cadenceText}</div>
              <div style="font-size:0.72rem; color:${isOverdue ? '#f28b82' : 'var(--green-light)'}; margin-top:2px; font-weight:600;">
                ${isOverdue ? '⚠️ All reviews completed' : `⏰ Next: ${nextDateStr} @ ${item.selectedTime || '16:00'}`}
              </div>
            </div>
            <button class="btn btn-ghost btn-sm" onclick="PracticePlannerEngine.removeItem('${item.sessionId}')" style="color:#f28b82; padding:2px 6px;">&times; Remove</button>
          </div>
          <div style="display:flex; flex-direction:column; gap:5px;">
            ${(item.steps || []).map(s => {
              const isPast = new Date(s.isoDate) < today;
              return `
                <div style="display:flex; justify-content:space-between; font-size:0.74rem; background:rgba(255,255,255,0.03); padding:5px 8px; border-radius:6px; opacity:${isPast ? '0.5' : '1'};">
                  <span>${s.icon} ${s.name}${isPast ? ' <span style="color:var(--text-dim);">(done)</span>' : ''}</span>
                  <span style="color:${isPast ? 'var(--text-dim)' : 'var(--green-light)'}; font-weight:600;">${s.dateStr}</span>
                </div>
              `;
            }).join('')}
          </div>
        </div>
      `;
    }).join('');
  },

  removeItem(sessionId) {
    window.EduStore.removePlannerItem(sessionId);
    this.renderModalBody();
    this.updateNavBadge();
  }
};

document.addEventListener('DOMContentLoaded', () => {
  setTimeout(() => {
    if (typeof PracticePlannerEngine !== 'undefined') {
      PracticePlannerEngine.initModal();
    }
  }, 300);
});

// ============================================================
//  Day 18: Student → Teacher Question Board Manager
// ============================================================
const StudentQuestionBoard = {
  activeCard: null,
  activeSession: null,

  init() {
    const askBtn = document.getElementById('card-ask-teacher-btn');
    const closeBtn = document.getElementById('question-modal-close-btn');
    const cancelBtn = document.getElementById('question-modal-cancel-btn');
    const submitBtn = document.getElementById('question-modal-submit-btn');

    if (askBtn) askBtn.addEventListener('click', () => this.openModal());
    if (closeBtn) closeBtn.addEventListener('click', () => this.closeModal());
    if (cancelBtn) cancelBtn.addEventListener('click', () => this.closeModal());
    if (submitBtn) submitBtn.addEventListener('click', () => this.submitQuestion());
  },

  openModal() {
    if (!currentSession || !currentSession.cards || !currentSession.cards[currentCardIndex]) {
      if (typeof showToast === 'function') showToast('Please select a flashcard first', 'error');
      return;
    }
    const card = currentSession.cards[currentCardIndex];
    this.activeCard = card;
    this.activeSession = currentSession;

    const tag = document.getElementById('question-modal-card-tag');
    const preview = document.getElementById('question-modal-preview');
    const textarea = document.getElementById('question-modal-textarea');
    const modal = document.getElementById('question-modal-overlay');

    if (tag) tag.textContent = `Topic: ${card.topic || 'General'} · Card #${currentCardIndex + 1}`;
    if (preview) preview.innerHTML = `<strong>Q:</strong> ${card.question}`;
    if (textarea) textarea.value = '';
    if (modal) modal.style.display = 'flex';
  },

  closeModal() {
    const modal = document.getElementById('question-modal-overlay');
    if (modal) modal.style.display = 'none';
  },

  submitQuestion() {
    const textarea = document.getElementById('question-modal-textarea');
    const text = textarea ? textarea.value.trim() : '';
    if (!text) {
      if (typeof showToast === 'function') showToast('Please enter your question', 'error');
      return;
    }
    const studentUser = (window.Auth && window.Auth.currentUser) ? window.Auth.currentUser.name : 'Student';
    const qObj = {
      id: 'q-' + Date.now(),
      sessionId: this.activeSession.id,
      sessionTopic: this.activeSession.topic,
      cardId: this.activeCard.id,
      cardQuestion: this.activeCard.question,
      cardTopic: this.activeCard.topic || 'General',
      studentName: studentUser,
      question: text,
      status: 'pending',
      createdAt: new Date().toISOString()
    };

    window.EduStore.addQuestion(qObj);
    this.closeModal();
    if (typeof showToast === 'function') showToast('Question sent to teacher!', 'success');
  }
};

// ============================================================
//  Day 18: Student ↔ Student Peer Discussion Hub
// ============================================================
const PeerDiscussionHub = {
  init() {
    const discussBtn = document.getElementById('card-discuss-btn');
    const navHubBtn = document.getElementById('nav-peer-hub-btn');
    const closeBtn = document.getElementById('discussion-modal-close-btn');
    const doneBtn = document.getElementById('discussion-modal-done-btn');
    const postBtn = document.getElementById('discussion-new-btn');
    const searchInput = document.getElementById('discussion-search-input');

    if (discussBtn) discussBtn.addEventListener('click', () => this.openForCard());
    if (navHubBtn) navHubBtn.addEventListener('click', () => this.openHub());
    if (closeBtn) closeBtn.addEventListener('click', () => this.closeModal());
    if (doneBtn) doneBtn.addEventListener('click', () => this.closeModal());
    if (postBtn) postBtn.addEventListener('click', () => this.postNewDoubt());
    if (searchInput) {
      searchInput.addEventListener('input', (e) => this.renderList(e.target.value.toLowerCase()));
    }
  },

  openForCard() {
    if (!currentSession || !currentSession.cards || !currentSession.cards[currentCardIndex]) {
      this.openHub();
      return;
    }
    const card = currentSession.cards[currentCardIndex];
    this.openHub(card.topic || currentSession.topic);
  },

  openHub(filterTerm = '') {
    const modal = document.getElementById('discussion-modal-overlay');
    const searchInput = document.getElementById('discussion-search-input');
    if (searchInput) searchInput.value = filterTerm;
    if (modal) modal.style.display = 'flex';
    this.renderList(filterTerm.toLowerCase());
  },

  closeModal() {
    const modal = document.getElementById('discussion-modal-overlay');
    if (modal) modal.style.display = 'none';
  },

  postNewDoubt() {
    const topic = (currentSession && currentSession.topic) ? currentSession.topic : 'General Study';
    const text = prompt(`Post a doubt or topic for discussion in "${topic}":`);
    if (!text || !text.trim()) return;

    const studentUser = (window.Auth && window.Auth.currentUser) ? window.Auth.currentUser.name : 'Student';
    const discussion = {
      id: 'disc-' + Date.now(),
      topic: topic,
      title: text.trim(),
      author: studentUser,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      isResolved: false,
      replies: []
    };
    window.EduStore.addDiscussion(discussion);
    this.renderList();
    if (typeof showToast === 'function') showToast('Doubt posted to Peer Hub!', 'success');
  },

  renderList(filter = '') {
    const container = document.getElementById('discussion-hub-body');
    if (!container) return;

    let discussions = window.EduStore.getDiscussions();
    if (discussions.length === 0) {
      const defaultDisc = {
        id: 'disc-demo-1',
        topic: "Newton's Laws",
        title: "Why does an object in motion keep moving if friction isn't present?",
        author: 'Alex P.',
        createdAt: new Date(Date.now() - 3600000).toISOString(),
        updatedAt: new Date(Date.now() - 1800000).toISOString(),
        isResolved: true,
        replies: [
          {
            id: 'r-1',
            author: 'Maya S.',
            text: "Because forces are only needed to CHANGE velocity (acceleration), not to maintain velocity! Inertia keeps it moving.",
            upvotes: 4,
            isBest: true,
            createdAt: new Date(Date.now() - 1800000).toISOString()
          }
        ]
      };
      window.EduStore.addDiscussion(defaultDisc);
      discussions = [defaultDisc];
    }

    if (filter) {
      discussions = discussions.filter(d => 
        d.title.toLowerCase().includes(filter) || 
        d.topic.toLowerCase().includes(filter) ||
        d.author.toLowerCase().includes(filter)
      );
    }

    if (discussions.length === 0) {
      container.innerHTML = `<div style="text-align:center; padding:30px; color:var(--text-dim);">No discussions found. Click "+ Post Doubt" to start one!</div>`;
      return;
    }

    container.innerHTML = discussions.map(d => {
      const replyCount = (d.replies || []).length;
      return `
        <div style="background:var(--bg-card); border:1px solid ${d.isResolved ? 'rgba(52,168,83,0.4)' : 'var(--border)'}; border-radius:var(--radius); padding:14px;">
          <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:6px;">
            <span style="font-size:0.72rem; padding:2px 8px; border-radius:10px; background:rgba(255,255,255,0.06); color:var(--green-light); font-weight:600;">${d.topic}</span>
            <span style="font-size:0.75rem; color:var(--text-dim);">${d.isResolved ? '✅ Solved' : '💬 Open'} · ${replyCount} answers</span>
          </div>
          <h4 style="margin:0 0 6px 0; font-size:0.95rem; font-weight:500;">${d.title}</h4>
          <div style="font-size:0.75rem; color:var(--text-muted); margin-bottom:10px;">Posted by ${d.author}</div>
          
          <div style="display:flex; flex-direction:column; gap:8px; margin-bottom:10px; padding-left:10px; border-left:2px solid var(--border-light);">
            ${(d.replies || []).map(r => `
              <div style="background:var(--bg-surface); padding:8px 10px; border-radius:6px; font-size:0.82rem; border:${r.isBest ? '1px solid var(--green-light)' : 'none'};">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
                  <span style="font-weight:600; color:var(--text);">${r.author} ${r.isBest ? '⭐ <span style="color:var(--green-light); font-size:0.7rem;">(Best Answer)</span>' : ''}</span>
                  <div style="display:flex; gap:6px; align-items:center;">
                    <button onclick="PeerDiscussionHub.upvote('${d.id}', '${r.id}')" style="background:rgba(255,255,255,0.08); border:none; color:var(--text-muted); font-size:0.72rem; padding:2px 6px; border-radius:4px; cursor:pointer;" title="Upvote explanation">👍 ${r.upvotes || 0}</button>
                    <button onclick="PeerDiscussionHub.toggleBest('${d.id}', '${r.id}')" style="background:rgba(255,255,255,0.08); border:none; color:var(--yellow-light); font-size:0.72rem; padding:2px 6px; border-radius:4px; cursor:pointer;" title="Toggle best answer">⭐ Best</button>
                  </div>
                </div>
                <p style="margin:0; color:var(--text-muted);">${r.text}</p>
              </div>
            `).join('')}
          </div>

          <div style="display:flex; gap:8px;">
            <input type="text" id="reply-input-${d.id}" class="input-field" style="flex:1; padding:6px 10px; font-size:0.8rem;" placeholder="Explain or answer this doubt..." />
            <button onclick="PeerDiscussionHub.addReply('${d.id}')" class="btn btn-green btn-sm" style="padding:4px 12px; font-size:0.78rem;">Reply</button>
          </div>
        </div>
      `;
    }).join('');
  },

  addReply(discussionId) {
    const input = document.getElementById(`reply-input-${discussionId}`);
    const text = input ? input.value.trim() : '';
    if (!text) return;

    const studentUser = (window.Auth && window.Auth.currentUser) ? window.Auth.currentUser.name : 'Student';
    const replyObj = {
      id: 'r-' + Date.now(),
      author: studentUser,
      text: text,
      upvotes: 0,
      isBest: false,
      createdAt: new Date().toISOString()
    };

    window.EduStore.addDiscussionReply(discussionId, replyObj);
    this.renderList();
    if (typeof showToast === 'function') showToast('Reply posted! Peer teaching boosts retention by 90% 🧠', 'success');
  },

  upvote(discussionId, replyId) {
    window.EduStore.upvoteReply(discussionId, replyId);
    this.renderList();
  },

  toggleBest(discussionId, replyId) {
    window.EduStore.markBestAnswer(discussionId, replyId);
    this.renderList();
    if (typeof showToast === 'function') showToast('Marked Best Answer! ⭐', 'success');
  }
};

// ============================================================
//  Day 18: Smart Quiz Generator Engine
// ============================================================
const SmartQuizEngine = {
  durationSeconds: 300,
  timerInterval: null,
  quizCards: [],
  userAnswers: [],
  currentQuizIndex: 0,
  timeRemaining: 300,

  init() {
    const cancelBtn = document.getElementById('quiz-config-cancel-btn');
    const closeBtn = document.getElementById('quiz-config-close-btn');
    const startBtn = document.getElementById('quiz-start-now-btn');
    const durationBtns = document.querySelectorAll('.quiz-duration-btn');
    const resultsCloseBtn = document.getElementById('quiz-results-close-btn');
    const resultsDoneBtn = document.getElementById('quiz-results-done-btn');
    const downloadCardBtn = document.getElementById('quiz-download-card-btn');

    durationBtns.forEach(btn => {
      btn.addEventListener('click', (e) => {
        durationBtns.forEach(b => b.classList.remove('active'));
        e.target.classList.add('active');
        this.durationSeconds = parseInt(e.target.dataset.time) || 300;
      });
    });

    if (closeBtn) closeBtn.addEventListener('click', () => this.closeConfig());
    if (cancelBtn) cancelBtn.addEventListener('click', () => this.closeConfig());
    if (startBtn) startBtn.addEventListener('click', () => this.startQuiz());
    if (resultsCloseBtn) resultsCloseBtn.addEventListener('click', () => this.closeResults());
    if (resultsDoneBtn) resultsDoneBtn.addEventListener('click', () => this.closeResults());
    if (downloadCardBtn) downloadCardBtn.addEventListener('click', () => this.downloadCard());
  },

  openConfig() {
    const modal = document.getElementById('quiz-config-modal-overlay');
    if (modal) modal.style.display = 'flex';
  },

  closeConfig() {
    const modal = document.getElementById('quiz-config-modal-overlay');
    if (modal) modal.style.display = 'none';
  },

  closeResults() {
    const modal = document.getElementById('quiz-results-modal-overlay');
    if (modal) modal.style.display = 'none';
  },

  startQuiz() {
    this.closeConfig();

    let pool = [];
    if (currentSession && currentSession.cards) {
      pool = [...currentSession.cards];
    } else {
      const allSessions = window.EduStore.getSessions();
      allSessions.forEach(s => {
        if (s.cards) pool.push(...s.cards);
      });
    }

    if (pool.length === 0) {
      if (typeof showToast === 'function') showToast('No flashcard sessions available for quiz', 'error');
      return;
    }

    this.quizCards = pool.sort(() => 0.5 - Math.random()).slice(0, 5);
    this.userAnswers = [];
    this.currentQuizIndex = 0;
    this.timeRemaining = this.durationSeconds;

    studyMode = 'quiz';
    currentCards = this.quizCards;
    currentCardIndex = 0;

    const entryCard = document.getElementById('entry-card');
    const reviewContainer = document.getElementById('review-container');
    if (entryCard) entryCard.style.display = 'none';
    if (reviewContainer) reviewContainer.classList.add('visible');

    const timerWrap = document.getElementById('speed-timer-wrap');
    if (timerWrap) timerWrap.style.display = 'block';

    this.startTimer();
    renderCard(0);
    if (typeof showToast === 'function') showToast(`🎯 Smart Quiz started! ${Math.floor(this.durationSeconds/60)} mins limit`, 'info');
  },

  startTimer() {
    clearInterval(this.timerInterval);
    const timerText = document.getElementById('speed-timer-text');
    const timerBar = document.getElementById('speed-timer-bar');

    this.timerInterval = setInterval(() => {
      this.timeRemaining--;
      const mins = Math.floor(this.timeRemaining / 60);
      const secs = this.timeRemaining % 60;
      if (timerText) timerText.textContent = `${mins}:${secs < 10 ? '0' : ''}${secs}`;
      if (timerBar) {
        const pct = (this.timeRemaining / this.durationSeconds) * 100;
        timerBar.style.width = `${pct}%`;
      }

      if (this.timeRemaining <= 0) {
        clearInterval(this.timerInterval);
        if (typeof showToast === 'function') showToast('⏰ Time is up! Submitting quiz...', 'info');
        this.finishQuiz();
      }
    }, 1000);
  },

  finishQuiz(accuracyPct = 80) {
    clearInterval(this.timerInterval);
    const timerWrap = document.getElementById('speed-timer-wrap');
    if (timerWrap) timerWrap.style.display = 'none';

    this.renderShareCard(accuracyPct);
    const modal = document.getElementById('quiz-results-modal-overlay');
    if (modal) modal.style.display = 'flex';
  },

  renderShareCard(accuracyPct) {
    const canvas = document.getElementById('quiz-share-card-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = '#1a1b1e';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.strokeStyle = '#34a853';
    ctx.lineWidth = 4;
    ctx.strokeRect(2, 2, canvas.width - 4, canvas.height - 4);

    ctx.fillStyle = '#34a853';
    ctx.font = 'bold 20px "Google Sans", sans-serif';
    ctx.fillText('📚 EduFlash AI — Smart Quiz Badge', 24, 42);

    const name = (window.Auth && window.Auth.currentUser) ? window.Auth.currentUser.name : 'Student';
    const topic = (currentSession && currentSession.topic) ? currentSession.topic : 'General Flashcards';
    ctx.fillStyle = '#9aa0a6';
    ctx.font = '14px Roboto, sans-serif';
    ctx.fillText(`Student: ${name}  |  Topic: ${topic}`, 24, 72);

    ctx.fillStyle = '#fbbc04';
    ctx.font = 'bold 48px "Google Sans", sans-serif';
    ctx.fillText(`${accuracyPct}%`, 24, 140);

    ctx.fillStyle = '#e8eaed';
    ctx.font = '16px Roboto, sans-serif';
    ctx.fillText('Retention Score', 24, 168);

    ctx.fillStyle = 'rgba(52, 168, 83, 0.2)';
    ctx.fillRect(24, 190, 450, 40);
    ctx.fillStyle = '#34a853';
    ctx.font = 'bold 14px Roboto, sans-serif';
    ctx.fillText('🏅 Verified AI Adaptive Quiz Completion · Powered by Gemini', 36, 215);

    const summary = document.getElementById('quiz-results-summary-text');
    if (summary) {
      summary.innerHTML = `Great job <strong>${name}</strong>! You completed the Smart Quiz on <strong>${topic}</strong> with <strong>${accuracyPct}% accuracy</strong>.`;
    }
  },

  downloadCard() {
    const canvas = document.getElementById('quiz-share-card-canvas');
    if (!canvas) return;
    const link = document.createElement('a');
    link.download = `EduFlash-Quiz-Badge-${Date.now()}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
    if (typeof showToast === 'function') showToast('Score card downloaded! 💾', 'success');
  }
};

// Wire Day 18 Modules on Load
document.addEventListener('DOMContentLoaded', () => {
  setTimeout(() => {
    StudentQuestionBoard.init();
    PeerDiscussionHub.init();
    SmartQuizEngine.init();

    const quizBtn = document.getElementById('quiz-mode-btn');
    if (quizBtn) {
      quizBtn.addEventListener('click', () => SmartQuizEngine.openConfig());
    }

    // Day 19: Init new modules
    CollaborativeNotes.init();
    StudentLivePoll.init();
    StudentMarketplace.init();

    // Day 19: Marketplace mode button opens the modal
    document.getElementById('marketplace-mode-btn')?.addEventListener('click', () => {
      StudentMarketplace.open();
    });
  }, 350);
});

// ============================================================
//  Day 19: Collaborative Class Notes (Student Side)
// ============================================================
const CollaborativeNotes = {
  currentSessionId: null,

  init() {
    const fab       = document.getElementById('collab-notes-fab');
    const modal     = document.getElementById('collab-notes-modal-overlay');
    const closeBtn  = document.getElementById('collab-notes-close-btn');
    const submitBtn = document.getElementById('collab-note-submit-btn');
    const input     = document.getElementById('collab-note-input');

    if (fab) fab.addEventListener('click', () => this.open());
    if (closeBtn) closeBtn.addEventListener('click', () => { if (modal) modal.style.display = 'none'; });
    if (modal) modal.addEventListener('click', e => { if (e.target === modal) modal.style.display = 'none'; });
    if (submitBtn) submitBtn.addEventListener('click', () => this.postNote());
    if (input) input.addEventListener('keydown', e => { if (e.key === 'Enter') this.postNote(); });
  },

  open() {
    // Get current session id from global state
    this.currentSessionId = (currentSession && currentSession.id) ? currentSession.id : 'global';
    const label = document.getElementById('collab-notes-session-label');
    if (label && currentSession) label.textContent = `Shared notes — ${currentSession.topic || 'this session'}`;
    const modal = document.getElementById('collab-notes-modal-overlay');
    if (modal) modal.style.display = 'flex';
    this.renderNotes();
  },

  postNote() {
    const input = document.getElementById('collab-note-input');
    const text = input?.value.trim();
    if (!text) return;
    const author = (window.Auth?.currentUser?.name) || 'Student';
    window.EduStore.addCollabNote(this.currentSessionId, text, author);
    input.value = '';
    this.renderNotes();
    if (typeof showToast === 'function') showToast('Note posted to class! 📝', 'success');
  },

  renderNotes() {
    const feed = document.getElementById('collab-notes-feed');
    if (!feed) return;
    const notes = window.EduStore.getCollabNotes(this.currentSessionId);
    if (!notes.length) {
      feed.innerHTML = `<div style="text-align:center; color:var(--text-dim); padding:30px; font-size:0.85rem;">No notes yet. Be the first to share a key insight! ✨</div>`;
      return;
    }
    // Sort pinned first
    const sorted = [...notes].sort((a, b) => (b.isPinned ? 1 : 0) - (a.isPinned ? 1 : 0));
    feed.innerHTML = sorted.map(note => `
      <div style="background:${note.isPinned ? 'rgba(52,168,83,0.08)' : 'var(--bg-card)'}; border:1px solid ${note.isPinned ? 'rgba(52,168,83,0.3)' : 'var(--border)'}; border-radius:var(--radius-sm); padding:12px 14px; position:relative;">
        ${note.isPinned ? '<span style="position:absolute; top:6px; right:8px; font-size:0.7rem; color:var(--green-light); font-weight:700;">📌 PINNED</span>' : ''}
        <div style="font-size:0.85rem; color:var(--text); margin-bottom:6px; padding-right:${note.isPinned ? '60px' : '0'};">${note.text}</div>
        <div style="font-size:0.72rem; color:var(--text-dim);">— ${note.author} · ${new Date(note.createdAt).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}</div>
      </div>
    `).join('');
  }
};

// ============================================================
//  Day 19: Live Poll (Student Side)
// ============================================================
const StudentLivePoll = {
  hasVoted: false,

  init() {
    // Poll banner is checked when a card loads
  },

  checkForPoll() {
    const poll = window.EduStore.getActivePoll();
    const banner = document.getElementById('student-poll-banner');
    if (!banner) return;

    if (!poll || !poll.isActive) {
      banner.style.display = 'none';
      return;
    }

    // Show poll banner
    banner.style.display = 'block';
    this.hasVoted = false;
    const questionEl = document.getElementById('student-poll-question-text');
    if (questionEl) questionEl.textContent = poll.question;

    const thankyou = document.getElementById('student-poll-thankyou');
    if (thankyou) thankyou.style.display = 'none';

    const optionsEl = document.getElementById('student-poll-options');
    if (!optionsEl) return;
    const labels = ['A','B','C','D'];
    optionsEl.innerHTML = poll.options.map((opt, i) => `
      <button class="poll-vote-btn" onclick="StudentLivePoll.vote(${i})"
        style="background:var(--bg-surface); border:1px solid var(--border); border-radius:var(--radius-sm); padding:8px 12px; font-size:0.82rem; color:var(--text); cursor:pointer; text-align:left; transition:background 0.2s, border-color 0.2s;"
        onmouseover="this.style.borderColor='var(--green-light)'; this.style.background='rgba(52,168,83,0.08)'"
        onmouseout="this.style.borderColor='var(--border)'; this.style.background='var(--bg-surface)'"
      >${labels[i]}. ${opt}</button>
    `).join('');
  },

  vote(optionIndex) {
    if (this.hasVoted) return;
    const voterName = (window.Auth?.currentUser?.name) || `Student-${Math.floor(Math.random()*100)}`;
    window.EduStore.submitPollAnswer(optionIndex, voterName);
    this.hasVoted = true;
    const optionsEl = document.getElementById('student-poll-options');
    if (optionsEl) optionsEl.innerHTML = '';
    const thankyou = document.getElementById('student-poll-thankyou');
    if (thankyou) thankyou.style.display = 'block';
  }
};

// ============================================================
//  Day 19: Flashcard Marketplace (Student Side)
// ============================================================
const StudentMarketplace = {
  init() {
    const closeBtn = document.getElementById('marketplace-modal-close-btn');
    const modal    = document.getElementById('marketplace-modal-overlay');
    if (closeBtn) closeBtn.addEventListener('click', () => { if (modal) modal.style.display = 'none'; });
    if (modal) modal.addEventListener('click', e => { if (e.target === modal) modal.style.display = 'none'; });
  },

  open() {
    const modal = document.getElementById('marketplace-modal-overlay');
    if (modal) modal.style.display = 'flex';
    this.renderGrid();
  },

  renderGrid() {
    const grid = document.getElementById('student-marketplace-grid');
    if (!grid) return;
    const decks = window.EduStore.getMarketplaceDecks();
    if (!decks.length) {
      grid.innerHTML = `<div style="text-align:center; color:var(--text-dim); padding:40px; grid-column:1/-1; font-size:0.85rem;">🏪 No decks in the marketplace yet. Ask your teacher to publish a deck!</div>`;
      return;
    }
    grid.innerHTML = decks.map(d => `
      <div style="background:var(--bg-card); border:1px solid var(--border); border-radius:var(--radius-lg); padding:16px; display:flex; flex-direction:column; gap:10px; transition:border-color 0.2s;" onmouseover="this.style.borderColor='var(--green-light)'" onmouseout="this.style.borderColor='var(--border)'">
        <div style="font-weight:600; font-size:0.92rem;">${d.title}</div>
        <div style="font-size:0.75rem; color:var(--text-dim);">📚 ${d.cards.length} cards · 👤 ${d.publisher} · ⬇️ ${d.imports} imports</div>
        <div style="display:flex; align-items:center; gap:4px;">
          ${[1,2,3,4,5].map(s => `<span style="color:${s <= Math.round(d.rating) ? 'var(--yellow)' : 'var(--border)'};">★</span>`).join('')}
          <span style="font-size:0.72rem; color:var(--text-dim); margin-left:4px;">${d.ratingCount > 0 ? d.rating.toFixed(1) : 'No ratings'}</span>
        </div>
        <button class="btn btn-green btn-sm" style="margin-top:auto;" onclick="StudentMarketplace.importDeck('${d.id}')">⬇️ Import Deck</button>
      </div>
    `).join('');
  },

  importDeck(deckId) {
    const newSession = window.EduStore.importMarketplaceDeck(deckId);
    if (newSession) {
      const modal = document.getElementById('marketplace-modal-overlay');
      if (modal) modal.style.display = 'none';
      if (typeof showToast === 'function') showToast(`Deck imported! Find it in your session list as "${newSession.topic}" ✅`, 'success');
    }
  }
};

// ============================================================
//  Day 19: Micro-Lesson Injection (Student Side)
// ============================================================
function checkAndShowMicroLesson(sessionId, cardId) {
  const box      = document.getElementById('micro-lesson-box');
  const textEl   = document.getElementById('micro-lesson-text');
  const dismissBtn = document.getElementById('micro-lesson-dismiss');
  if (!box || !textEl) return;

  box.style.display = 'none';

  // Wire dismiss button once
  if (dismissBtn && !dismissBtn._wired) {
    dismissBtn.addEventListener('click', () => { box.style.display = 'none'; });
    dismissBtn._wired = true;
  }

  if (!sessionId || !cardId) return;

  try {
    const lessons = JSON.parse(localStorage.getItem(`ef_micro_lessons_${sessionId}`) || '{}');
    const lesson = lessons[cardId];
    if (!lesson) return;

    // Only show if student previously got this card wrong
    const wrongCards = JSON.parse(localStorage.getItem(`ef_wrong_cards_${sessionId}`) || '[]');
    if (!wrongCards.includes(cardId)) return;

    textEl.textContent = lesson;
    box.style.display = 'block';
  } catch(e) { /* silently fail */ }
}

// ── Day 21: Study Streaks & Session Feedback Ratings ────────────────────────

window.submitSessionFeedback = async function(rating, comment) {
  if (!currentSession || !window.pendingResponsePayload) return;
  
  window.pendingResponsePayload.feedbackRating = rating;
  window.pendingResponsePayload.feedbackComment = comment;
  
  const syncEl = document.getElementById('sync-status');
  if (syncEl) {
    const isCloud = typeof window.EduStore !== 'undefined' && window.EduStore.isFirebaseEnabled();
    syncEl.textContent = isCloud ? '☁️ Syncing to cloud…' : '💾 Saving locally…';
  }
  
  try {
    await window.EduStore.addStudentResponse(currentSession.id, window.pendingResponsePayload);
    window.pendingResponsePayload = null; // Reset to prevent exit double-submission
    
    if (syncEl) {
      syncEl.textContent = window.EduStore.isFirebaseEnabled()
        ? '✅ Synced to cloud — teacher dashboard updated!'
        : '✅ Saved locally';
    }
    if (typeof showToast === 'function') showToast('Feedback submitted! Thanks! ❤️', 'success');
  } catch (err) {
    console.error("Error submitting response feedback:", err);
    if (typeof showToast === 'function') showToast('Failed to save response. Try again.', 'error');
  }
  
  const fbCard = document.getElementById('feedback-card');
  if (fbCard) {
    fbCard.innerHTML = `
      <div style="padding: 10px; color: var(--green-light); font-weight: 600; font-size: 0.9rem;">
        ❤️ Thank you! Your feedback has been sent to the teacher dashboard.
      </div>
    `;
  }
};

window.renderStudentStreakDashboard = function() {
  const streakCard = document.getElementById('streak-card');
  if (!streakCard) return;

  const history = JSON.parse(localStorage.getItem('ef_review_history') || '[]');
  
  // Day 21: Always show the streak card so the feature is visible, even with 0 reviews
  streakCard.style.display = 'block';
  const totalCompleted = history.length;
  
  const dates = [...new Set(history.map(h => {
    try {
      return getLocalDateString(new Date(h.date));
    } catch(e) {
      return '';
    }
  }).filter(Boolean))];
  
  let currentStreak = 0;
  let longestStreak = 0;
  
  if (dates.length > 0) {
    const todayStr = getLocalDateString(new Date());
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = getLocalDateString(yesterday);
    
    const dateSet = new Set(dates);
    
    let tempDate = new Date();
    let tempStr = getLocalDateString(tempDate);
    
    if (dateSet.has(tempStr)) {
      currentStreak = 1;
    } else if (dateSet.has(yesterdayStr)) {
      currentStreak = 1;
      tempDate = yesterday;
    }
    
    if (currentStreak > 0) {
      while (true) {
        tempDate.setDate(tempDate.getDate() - 1);
        const prevStr = getLocalDateString(tempDate);
        if (dateSet.has(prevStr)) {
          currentStreak++;
        } else {
          break;
        }
      }
    }
    
    const sortedDates = [...dates].sort((a, b) => new Date(a) - new Date(b));
    let tempStreak = 1;
    longestStreak = 1;
    for (let i = 0; i < sortedDates.length - 1; i++) {
      const d1 = new Date(sortedDates[i]);
      const d2 = new Date(sortedDates[i+1]);
      const diff = (d2 - d1) / 86400000;
      if (diff <= 1.1) {
        tempStreak++;
        if (tempStreak > longestStreak) {
          longestStreak = tempStreak;
        }
      } else if (diff > 1.1) {
        tempStreak = 1;
      }
    }
    if (longestStreak < currentStreak) {
      longestStreak = currentStreak;
    }
  }

  document.getElementById('streak-badge-count').textContent = `${currentStreak} Day${currentStreak !== 1 ? 's' : ''}`;
  document.getElementById('streak-current').textContent = `${currentStreak} day${currentStreak !== 1 ? 's' : ''}`;
  document.getElementById('streak-longest').textContent = `${longestStreak} day${longestStreak !== 1 ? 's' : ''}`;
  document.getElementById('streak-total').textContent = `${totalCompleted} session${totalCompleted !== 1 ? 's' : ''}`;

  const heatmapRow = document.getElementById('streak-heatmap-row');
  if (heatmapRow) {
    heatmapRow.innerHTML = '';
    const dateSet = new Set(dates);
    
    for (let i = 13; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dStr = getLocalDateString(d);
      const isStudied = dateSet.has(dStr);
      
      const dot = document.createElement('div');
      dot.className = `streak-dot ${isStudied ? 'studied' : 'skipped'}`;
      dot.style.width = '14px';
      dot.style.height = '14px';
      dot.style.borderRadius = '50%';
      dot.style.background = isStudied ? 'var(--green-light)' : 'rgba(255,255,255,0.08)';
      dot.style.border = isStudied ? 'none' : '1px solid var(--border-light)';
      
      const label = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
      dot.title = `${label}: ${isStudied ? 'Studied! 🔥' : 'No review'}`;
      dot.style.cursor = 'help';
      
      heatmapRow.appendChild(dot);
    }
  }
};

function recordWrongCard(sessionId, cardId) {
  try {
    const key = `ef_wrong_cards_${sessionId}`;
    const arr = JSON.parse(localStorage.getItem(key) || '[]');
    if (!arr.includes(cardId)) { arr.push(cardId); localStorage.setItem(key, JSON.stringify(arr)); }
  } catch(e) {}
}



