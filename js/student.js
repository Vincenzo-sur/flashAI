// ============================================================
//  EduFlash AI — Student View JS
//  Day 3: Full interactive flashcard review flow
// ============================================================

let currentSession = null;
let currentCardIndex = 0;
let sessionAnswers = []; // Tracks responses for this review session: [{ cardId, selectedIndex, isCorrect, rating }]

document.addEventListener('DOMContentLoaded', async () => {
  // Day 6: init Firebase in background (no-op if no config)
  if (typeof window.EduStore !== 'undefined' && window.EduStore.initFirebase) {
    await window.EduStore.initFirebase();
  }
  initStudentEntry();
  initReviewControls();
});

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
    } else {
      picker.classList.remove('visible');
      selectedSessionId = null;
      startBtn.disabled = true;
    }
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
  currentSession = session;
  currentCardIndex = 0;
  sessionAnswers = Array(session.cards.length).fill(null); // Init empty responses list

  // Transition layouts
  document.getElementById('entry-card').style.display = 'none';
  document.getElementById('review-container').classList.add('visible');

  renderCard();
}

// ── Render Flashcard in Reviewer ───────────────────────────
function renderCard() {
  if (!currentSession) return;
  const card = currentSession.cards[currentCardIndex];
  const flashcard = document.getElementById('review-flashcard');
  
  // Reset flipped visual state
  flashcard.classList.remove('flipped');

  // Fill in card text details
  document.getElementById('review-question').textContent = card.question;
  document.getElementById('review-answer').textContent = card.answer;
  document.getElementById('card-tag').textContent = card.topic || currentSession.topic;
  
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
    flashcard.classList.toggle('flipped');
  };

  // Update Progress Tracker
  const total = currentSession.cards.length;
  const progressText = `Card ${currentCardIndex + 1} of ${total}`;
  const progressPercent = Math.round(((currentCardIndex + 1) / total) * 100);

  document.getElementById('review-progress-text').textContent = progressText;
  document.getElementById('review-progress-percent').textContent = `${progressPercent}%`;
  document.getElementById('review-progress-bar').style.width = `${progressPercent}%`;

  // Update Footer Controls
  document.getElementById('review-counter').textContent = `${currentCardIndex + 1} / ${total}`;
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

// ── MCQ Selection Handler ──────────────────────────────────
function handleOptionSelection(optIndex, correctIndex) {
  const card = currentSession.cards[currentCardIndex];
  const isCorrect = optIndex === correctIndex;

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
