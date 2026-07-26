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

document.addEventListener('DOMContentLoaded', async () => {
  // Day 6: init Firebase in background (no-op if no config)
  if (typeof window.EduStore !== 'undefined' && window.EduStore.initFirebase) {
    await window.EduStore.initFirebase();
  }
  initStudentEntry();
  initReviewControls();
  checkUrlParams();
});

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

  if (!codeInput) return;

  codeInput.addEventListener('input', () => {
    const val = codeInput.value.trim().toLowerCase();
    
    // Reveal session selector if code is valid
    if (val === 'ef-2024' || val.length >= 4) {
      loadSessionsList(val);
      picker.classList.add('visible');
      const studySelector = document.getElementById('study-mode-selector');
      if (studySelector) studySelector.style.display = 'block';
    } else {
      picker.classList.remove('visible');
      const studySelector = document.getElementById('study-mode-selector');
      if (studySelector) studySelector.style.display = 'none';
      selectedSessionId = null;
      startBtn.disabled = true;
    }
  });

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
    const sessions = window.EduStore.getSessions().filter(s => s.status === 'live');
    optionsDiv.innerHTML = '';

    if (sessions.length === 0) {
      optionsDiv.innerHTML = `
        <div style="font-size:0.8rem; color:var(--text-dim); text-align:center; padding:12px; border:1px dashed var(--border); border-radius:var(--radius);">
          No active review sessions found for this class code.
        </div>
      `;
      startBtn.disabled = true;
      return;
    }

    sessions.forEach(sess => {
      const option = document.createElement('div');
      option.className = 'session-option';
      option.dataset.id = sess.id;
      option.innerHTML = `
        <div class="session-option-left">
          <div class="session-topic">${escapeHTML(sess.topic)}</div>
          <div class="session-date">${sess.subject} · ${sess.date}</div>
        </div>
        <span class="session-cards-count">${sess.cards.length} cards</span>
      `;

      option.addEventListener('click', () => {
        document.querySelectorAll('.session-option').forEach(o => o.classList.remove('selected'));
        option.classList.add('selected');
        selectedSessionId = sess.id;
        startBtn.disabled = false;
      });

      optionsDiv.appendChild(option);
    });
  }

  startBtn.addEventListener('click', () => {
    if (!selectedSessionId) return;
    const session = window.EduStore.getSessionById(selectedSessionId);
    if (session) {
      startReview(session);
    }
  });
}

// ── Start Review Flow ───────────────────────────────────────
function startReview(session) {
  currentSession = JSON.parse(JSON.stringify(session));

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
  }

  currentCardIndex = 0;
  sessionAnswers = Array(currentSession.cards.length).fill(null);

  // Transition layouts
  document.getElementById('entry-card').style.display = 'none';
  document.getElementById('review-container').classList.add('visible');

  renderCard();
}

// ── Render Flashcard in Reviewer ───────────────────────────
function renderCard() {
  if (!currentSession || !currentSession.cards[currentCardIndex]) return;

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
  const currentAnswer = sessionAnswers[currentCardIndex];
  if (!currentAnswer) return;

  currentAnswer.rating = ratingType;

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

  exitBtn.addEventListener('click', () => {
    // Reload exit
    window.location.reload();
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
  const studentId = 'stud-' + Math.floor(Math.random() * 9000 + 1000);
  const responsePayload = {
    studentId: studentId,
    cardResponses: sessionAnswers
  };

  // Switch panels immediately — don't wait for Firestore write
  document.getElementById('review-container').classList.remove('visible');
  document.getElementById('completion-container').classList.add('visible');

  // Day 9: Sound & Confetti celebration
  SoundFX.playFanfare();
  launchConfetti();

  // Render results
  const accEl = document.getElementById('completion-accuracy');
  accEl.textContent = `${accuracy}%`;
  if (accuracy < 40)      accEl.style.color = '#f28b82';
  else if (accuracy < 75) accEl.style.color = 'var(--yellow)';
  else                    accEl.style.color = 'var(--green-light)';

  // Day 6: show sync status, then submit (async)
  const syncEl = document.getElementById('sync-status');
  if (syncEl) {
    const isCloud = typeof window.EduStore !== 'undefined' && window.EduStore.isFirebaseEnabled();
    syncEl.style.display = 'block';
    syncEl.textContent = isCloud ? '☁️ Syncing to cloud…' : '💾 Saved locally';
  }

  await window.EduStore.addStudentResponse(currentSession.id, responsePayload);

  if (syncEl) {
    syncEl.textContent = window.EduStore.isFirebaseEnabled()
      ? '✅ Synced to cloud — teacher dashboard updated!'
      : '✅ Saved locally';
  }

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
