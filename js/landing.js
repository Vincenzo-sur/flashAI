// ============================================================
//  EduFlash AI — Landing Page
//  Day 1: Simple interactions only
// ============================================================

// Sample card data for the demo
const demoCards = [
  {
    question: "Which of Newton's laws states that an object at rest stays at rest unless acted on by an external force?",
    options: ["Newton's Second Law", "Newton's First Law", "Newton's Third Law", "Law of Gravitation"],
    correct: 1,
    answer: "Newton's First Law of Motion, also called the Law of Inertia — objects resist changes to their state of motion."
  },
  {
    question: "What does F = ma represent in classical mechanics?",
    options: ["Force equals mass times acceleration", "Frequency equals mass times area", "Force equals momentum times angle", "None of the above"],
    correct: 0,
    answer: "Newton's Second Law: Force (F) equals mass (m) multiplied by acceleration (a). It describes how a net force changes an object's motion."
  },
  {
    question: "Newton's Third Law states that every action has an equal and opposite...",
    options: ["Velocity", "Momentum", "Reaction", "Energy"],
    correct: 2,
    answer: "Every action has an equal and opposite reaction. Forces always come in pairs — if object A exerts a force on object B, B exerts an equal and opposite force on A."
  }
];

let currentCard = 0;
let selectedOption = null;
let isFlipped = false;

document.addEventListener('DOMContentLoaded', () => {
  renderCard(currentCard);
  initCardNav();
  initNavbarScroll();
});

// ── Render a card ───────────────────────────────────────────
function renderCard(idx) {
  const card = demoCards[idx];
  selectedOption = null;
  isFlipped = false;

  const flashcard = document.getElementById('demo-flashcard');
  flashcard.classList.remove('flipped');

  // Front
  document.getElementById('demo-question').textContent = card.question;
  const optionEls = document.querySelectorAll('.mcq-option');
  optionEls.forEach((el, i) => {
    el.className = 'mcq-option';
    el.querySelector('.option-text').textContent = card.options[i];
    el.onclick = () => handleOptionClick(el, i, card.correct);
  });

  // Back
  document.getElementById('demo-answer').textContent = card.answer;

  // Rating buttons
  document.querySelectorAll('.rating-btn').forEach(btn => {
    btn.className = 'rating-btn ' + btn.dataset.rating;
    btn.onclick = () => handleRating(btn);
  });

  // Counter
  document.getElementById('card-counter').textContent = `${idx + 1} / ${demoCards.length}`;

  // Nav buttons
  document.getElementById('btn-prev').disabled = idx === 0;
  document.getElementById('btn-next').disabled = idx === demoCards.length - 1;
}

// ── MCQ click ───────────────────────────────────────────────
function handleOptionClick(el, idx, correctIdx) {
  if (selectedOption !== null) return; // already answered
  selectedOption = idx;
  document.querySelectorAll('.mcq-option').forEach((opt, i) => {
    if (i === correctIdx) opt.classList.add('correct');
    else if (i === idx && i !== correctIdx) opt.classList.add('wrong');
    opt.onclick = null;
  });
  // Auto-flip after 1.2s to show answer
  setTimeout(() => {
    const flashcard = document.getElementById('demo-flashcard');
    flashcard.classList.add('flipped');
    isFlipped = true;
  }, 1200);
}

// ── Self-rating ─────────────────────────────────────────────
function handleRating(btn) {
  document.querySelectorAll('.rating-btn').forEach(b => {
    b.classList.remove('selected-know', 'selected-fuzzy', 'selected-nope');
  });
  btn.classList.add('selected-' + btn.dataset.rating);
}

// ── Card flip on header click ────────────────────────────────
function flipCard() {
  const flashcard = document.getElementById('demo-flashcard');
  flashcard.classList.toggle('flipped');
  isFlipped = !isFlipped;
}

// ── Card navigation ──────────────────────────────────────────
function initCardNav() {
  document.getElementById('btn-prev').addEventListener('click', () => {
    if (currentCard > 0) { currentCard--; renderCard(currentCard); }
  });
  document.getElementById('btn-next').addEventListener('click', () => {
    if (currentCard < demoCards.length - 1) { currentCard++; renderCard(currentCard); }
  });
}

// ── Sticky navbar border ─────────────────────────────────────
function initNavbarScroll() {
  // Already sticky via CSS — nothing extra needed for Day 1
}
