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

document.addEventListener('DOMContentLoaded', async () => {
  // Day 6: init Firebase in background (no-op if no config)
  if (typeof window.EduStore !== 'undefined' && window.EduStore.initFirebase) {
    await window.EduStore.initFirebase();
  }
  initStudentEntry();
  initReviewControls();
  checkUrlParams();
  initEduBotTutor(); // Day 11
  initKeyboardShortcuts(); // Day 11
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
        
        // Day 11: update due badge
        const dueBadge = document.getElementById('due-cards-badge');
        if (dueBadge) {
          const dueCount = SpacedRepetitionEngine.getDueCount(sess.id, sess.cards);
          dueBadge.textContent = `${dueCount} card${dueCount !== 1 ? 's' : ''} due`;
          dueBadge.style.display = 'inline-block';
        }
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
  } else if (selectedStudyMode === 'spaced') {
    // Day 11: Spaced Repetition Mode
    currentSession.cards = SpacedRepetitionEngine.getDueCards(currentSession.id, currentSession.cards);
  }

  currentCardIndex = 0;
  sessionAnswers = Array(currentSession.cards.length).fill(null);

  // Transition layouts
  document.getElementById('entry-card').style.display = 'none';
  document.getElementById('review-container').classList.add('visible');
  const fab = document.getElementById('edubot-fab');
  if (fab) fab.style.display = 'flex';

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
  
  // Day 11: Save to Spaced Repetition Engine
  if (currentSession) {
    SpacedRepetitionEngine.updateCard(currentSession.id, currentSession.cards[currentCardIndex].id, ratingType);
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

  // Day 11: Analytics Dashboard
  saveAndRenderAnalytics(currentSession.id, accuracy, sessionAnswers, currentSession.cards);

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
  let history = JSON.parse(localStorage.getItem('ef_review_history') || '[]');
  
  let topicScores = {};
  answers.forEach(ans => {
    if (!ans) return;
    const card = cards.find(c => c.id === ans.cardId);
    if (!card) return;
    const topic = card.topic || 'General';
    if (!topicScores[topic]) topicScores[topic] = { correct: 0, total: 0 };
    topicScores[topic].total++;
    if (ans.isCorrect) topicScores[topic].correct++;
  });
  
  const record = {
    sessionId,
    accuracy,
    date: new Date().toISOString(),
    topicScores
  };
  history.push(record);
  localStorage.setItem('ef_review_history', JSON.stringify(history));
  
  renderStudentAnalytics(history);
}

function renderStudentAnalytics(history) {
  const container = document.getElementById('student-analytics');
  if (container) container.style.display = 'block';
  
  // Trend Sparkline
  const accHistory = history.map(h => h.accuracy);
  drawSparkline('sparkline-canvas', accHistory);
  
  // Streak
  const today = new Date().setHours(0,0,0,0);
  let streakCount = [...new Set(history.map(h => new Date(h.date).setHours(0,0,0,0)))].length;
  let heatDotsHtml = '';
  for(let i=6; i>=0; i--) {
    let d = new Date(today - i * 86400000);
    let active = history.some(h => new Date(h.date).setHours(0,0,0,0) === d.getTime());
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
  const bestAcc = Math.max(...history.map(h => h.accuracy));
  const latestAcc = history[history.length - 1].accuracy;
  const bestEl = document.getElementById('personal-best-display');
  if (bestEl) {
    bestEl.innerHTML = `
      <div class="personal-best-value">${bestAcc}%</div>
      <div class="personal-best-sub">${latestAcc >= bestAcc && history.length > 1 ? '🎉 New Record!' : 'All-time high score'}</div>
    `;
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
  });
}

