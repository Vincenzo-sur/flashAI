# EduFlash AI 📚

**An AI-powered flashcard add-on for Google Classroom** — generates revision flashcards from class transcripts using Google Gemini.

---

## What is this?

EduFlash AI is a web app that sits on top of Google Classroom. After a class, the **class admin** pastes the day's lecture transcript into the app. Gemini AI reads it and generates a set of flashcards for students to revise with.

Each flashcard has:
- A **question** derived from the transcript
- **4 MCQ options** (AI-generated, one correct)
- A **self-rating prompt** — students pick *Know it*, *Fuzzy*, or *Don't know*

The teacher then sees a dashboard combining both signals — MCQ accuracy and self-rating — to identify which topics landed and which ones need re-teaching.

---

## How it works

```
Teacher's class ends
       ↓
Class admin pastes transcript into EduFlash AI
       ↓
Gemini generates flashcards (question + MCQ + answer)
       ↓
Flashcards are published to Google Classroom
       ↓
Students review cards → answer MCQ → rate confidence
       ↓
Teacher dashboard → weak topics vs strong topics
```

---

## Features (current)

- [x] Landing page with working demo flashcard
- [x] Google Classroom color theme (green, yellow, dark)
- [x] Interactive MCQ demo — click an option, see correct/wrong, card flips to answer
- [x] Self-rating buttons — Know it / Fuzzy / Don't know
- [x] Teacher dashboard (with sidebar, active routing, draft/session views)
- [x] Gemini API integration (with local settings modal and mock fallback)
- [x] Student flashcard viewer (fully interactive review flow and scoring)
- [x] Analytics dashboard (heatmap, aggregates, simulator, and advice)
- [x] Upload Notes panel — drag-and-drop dropzone, thumbnail strip with remove, file validation (JPG/PNG/WEBP, 4 images, 5 MB)
- [x] Gemini Vision multimodal API — image(s) → flashcards with base64 inlineData (Day 5)
- [x] Google OAuth sign-in — Google Identity Services modal with mock user picker and persistent session (Day 5)
- [x] Firebase Firestore integration — opt-in cloud persistence replacing localStorage, real-time `onSnapshot` listener (Day 6)
- [x] Chart.js analytics charts — line (accuracy trend), doughnut (self-ratings), horizontal bar (per-topic accuracy) (Day 6)
- [x] **Session Results panel** — per-student breakdown (real names, grade badges A–D, Know/Fuzzy/Don't Know), per-card accordion with correct-vs-wrong bars (Day 7)
- [x] **CSV export** — one-click download of full session results as a `.csv` file (Day 7)
- [x] **Toast notification system** — slide-in toasts replace all `alert()` calls, with success/error/info variants (Day 7)
- [x] **Landing page: How It Works** — 4-step visual flow with numbered badges, step connectors, and stats chips (Day 7)
- [x] **Google Classroom API integration** — post coursework assignments & stream announcements directly to Google Classroom courses, sync rosters, and submit student practice grades (Day 8)
- [x] **Gamified Student Practice Hub & Audio Accessibility** — 3 study modes (Standard, ⚡ Speed Sprint 15s timer, 🧠 Smart Missed Cards), Web Speech TTS read-aloud, Web Audio synth FX, and canvas particle confetti celebration (Day 9)
- [x] **Printable PDF Study Sheet Generator** — 1-click 2-column study guide grid export with togglable answer key (Day 9)
- [x] **Day 10 UI Enhancements & Issues Fixes** — Centered Paste Transcript & Upload Notes layouts, 3D overlapping stacked card decks for Sessions and Drafts, Web Speech TTS read button fix, and Speed Sprint card percentage & 15s countdown timer fix (Day 10)
- [x] **Day 11: AI Deck Customization, Interactive AI Tutor (EduBot) & Export/Import Suite** — AI parameters grid (Difficulty, Card Count, Format, Custom Focus), Single Card AI actions (✨ Reword & 💡 Detail), EduBot AI Tutor drawer on Student page with context-aware helper chips, Deck Export & Import (JSON, Anki CSV), Procedural QR Code & Share modal, and AI Class Synthesis Report (Day 11)
- [x] **Day 11: Spaced Repetition, Student Analytics, Theme Switcher, Keyboard Shortcuts & Notifications** — Leitner box spaced repetition engine, student personal analytics dashboard with sparkline charts and study streaks, Dark/Light/Auto theme switcher, full keyboard navigation with `?` help overlay, and teacher notification center with bell badge (Day 11)
- [x] **Day 14: Achievement & XP Leaderboard System, AI Adaptive Study Paths** — XP engine with 5 levels and 6 unlockable badges, animated level-up modal, class leaderboard in teacher Analytics, Gemini-powered personalized study path generator (Day 14)
- [x] **Day 15: Purposeful Student Growth, Real-World Perks, AI Scenario Challenges & Smart Session Resume** — Real-world competency tier mapping (Industry-Ready Master, Subject Lead, Practical Specialist), Real-World Perks Hub on student completion screen, Gemini AI-powered Real-World Scenario Challenge modal, Teacher Real-World Perks & Competency Qualifications matrix tab, automatic session progress resume memory, and interactive visual card breakdown grid (Day 15)

---

## Tech Stack

| | |
|---|---|
| Frontend | HTML, CSS, Vanilla JavaScript |
| AI | Google Gemini API (`gemini-1.5-flash`) |
| Auth | Google OAuth 2.0 (mock flow + GSI hook) |
| Database | Firebase Firestore *(opt-in, Day 6)* |
| Classroom | Google Classroom Add-ons API *(Day 8)* |
| Charts | Chart.js 4 *(Day 6)* |
| Storage | `localStorage` → Firebase Firestore |

---

## Project Structure

```
flashAI/
├── index.html        # Landing page
├── teacher.html      # Teacher dashboard
├── student.html      # Student view
├── css/
│   ├── global.css    # Design tokens, buttons, base styles
│   ├── landing.css   # Landing page layout and components
│   ├── student.css   # Student reviewer styles + EduBot drawer
│   └── teacher.css   # Teacher dashboard styles + Day 6 charts + Day 11 AI customizer
└── js/
    ├── firebase-store.js  # Firebase Firestore adapter (Day 6)
    ├── store.js           # Unified data store (local + Firebase routing)
    ├── auth.js            # Google OAuth / mock sign-in
    ├── teacher.js         # Teacher dashboard + Chart.js + Day 11 AI Actions & Exporter
    ├── student.js         # Student flashcard reviewer + EduBot AI Tutor
    └── landing.js         # Landing page flashcard demo
```

---

## Running locally

No build step needed. Just open `index.html` in a browser.

```bash
git clone https://github.com/Vincenzo-sur/flashAI.git
cd flashAI
# open index.html in your browser
```

---

## The flashcard data model (planned)

```js
// Each AI-generated card
{
  id: "card-uuid",
  question: "Which law states...",
  options: ["Option A", "Option B", "Option C", "Option D"],
  correctIndex: 1,
  answer: "Newton's First Law — the Law of Inertia...",
  topic: "Newton's Laws"
}

// Student response per card
{
  cardId: "card-uuid",
  mcqAnswer: 1,          // index chosen by student
  mcqCorrect: true,      // was it right?
  selfRating: "fuzzy"    // "know" | "fuzzy" | "dont-know"
}
```

## Development Roadmap

- [x] **Day 1: Base Application & Interactive Landing Page**
  - Design tokens, responsive components, and MCQ flip-card landing page widget.
- [x] **Day 2: Dashboard shells & Navigation**
  - Teacher dashboard structure, collapsible sidebar state, and student select views.
- [x] **Day 3: Interactive Dashboards & Gemini Core (Current)**
  - Local database store, Gemini API integrations, preview card editors, class performance analytics, and student reviews.
- [x] **Day 4: Multimodal Note OCR & Image uploads (Current)**
  - Drag-and-drop Upload Notes panel with file picker, thumbnail strip, type/size/count validation. Gemini Vision API call coming Day 5.
- [x] **Day 5: Gemini Vision API & Google OAuth (Current)**
  - Wired multimodal image→flashcard generation using `inlineData` base64 parts sent to `gemini-1.5-flash`.
  - Google Identity Services (GSI) sign-in modal with 3-user mock picker, persistent `localStorage` session, avatar/name sidebar injection, and sign-out flow.
- [x] **Day 6: Firebase Firestore + Chart.js Analytics**
  - `firebase-store.js` adapter wrapping the Firestore SDK; mirrors EduStore API.
  - Opt-in Firebase config modal (paste JSON from Firebase Console); graceful localStorage fallback.
  - Real-time `onSnapshot` listener — teacher dashboard auto-refreshes when any student submits.
  - Firebase connection status dot in sidebar (pulsing green = cloud, grey = local).
  - 3 Chart.js 4 charts in the Analytics Overview panel: line (MCQ accuracy by session), doughnut (self-rating distribution), horizontal bar (per-topic accuracy).
- [x] **Day 8: Google Classroom API Integration**
  - `classroom-api.js` adapter wrapping Google Classroom REST API v1 (`courses`, `courseWork`, `students`, `announcements`).
  - Interactive Google Classroom mock service fallback for testing without cloud credentials.
  - Course selector & coursework assignment form in Teacher Dashboard Publish panel (support for graded assignments & stream announcements with due date and max points).
  - One-click "Sync Classroom Roster" in Session Results to map student submissions to real Google Classroom student profiles.
  - Deep-link URL parameter support (`student.html?session=...&courseId=...`) with automatic Google Classroom grade turn-in on completion.
- [x] **Day 9: Gamified Practice Modes, Audio Accessibility & PDF Study Sheets**
  - 3 student study modes: Standard Review, ⚡ Speed Sprint (15s card timer bar with streak multipliers), and 🧠 Smart Missed Cards Focus.
  - Web Speech API (`window.speechSynthesis`) for `🔊 Read Aloud` question/answer accessibility.
  - Web Audio API procedural synthesizer sound chimes for correct choices, wrong choices, card flipping, and review completion.
  - Canvas particle confetti celebration and achievement badges (*Speed Demon ⚡*, *Mastery 🎯*, *Streak Master 🔥*).
  - 1-Click Printable PDF Study Sheet Generator with 2-column paper layout and answer key hide/show toggle.
- [x] **Day 10: Centered Creation Panels, 3D Overlapping Card Decks & Bug Resolution**
  - Web Speech API `TTSManager` & `SoundFX` helper definitions resolving the Read button speech issue.
  - Dynamic card progress calculator (`Card X of Y`, `${Math.round(X/Y * 100)}%`) resolving the 2-card 20% / 5-card count display bug.
  - 15-second Speed Sprint countdown timer interval logic with animated draining progress bar.
  - Center-aligned layout for Paste Transcript & Upload Notes creation panels (`#panel-transcript`, `#panel-upload`).
  - 3D Overlapping Stacked Card Format (`.overlapping-card-deck`) with background layers and hover fan-out keyframe animations for Sessions and Drafts lists.
- [x] **Day 11: AI Deck Customization, Interactive AI Tutor (EduBot) & Export/Import Suite**
  - AI Flashcard Customization Controls: Card Count (3, 5, 8, 10), Difficulty Level (Easy, Medium, Hard), Question Format (MCQ, Fill-in-the-blank, True/False, Key Concepts), and Custom Focus Instructions.
  - Single Card AI Reword (`✨ AI Reword`) & AI Explanation Detail (`💡 AI Detail`) in Preview panel.
  - EduBot AI Tutor: Sliding drawer AI tutor on student page with current card context and quick helper prompt chips (*Step-by-step*, *Analogy*, *ELI5*, *Practice Quiz*).
  - Deck Portability Suite: One-click Anki CSV export, JSON export/import modal, and direct Share deck modal with procedural Canvas QR Code.
  - AI Class Report: Gemini-driven classroom performance synthesis in Analytics.
- [x] **Day 11: Spaced Repetition, Student Analytics, Theme Switcher, Keyboard Shortcuts & Notifications (Current)**
  - 🧠 Leitner box spaced repetition engine with 5-box interval progression (1d → 3d → 7d → 14d → 30d) and due-card badges.
  - 📊 Student personal analytics dashboard: Canvas sparkline accuracy trend, 7-day study streak heat dots, topic mastery progress bars, personal best tracking.
  - 🌗 Dark / Light / Auto theme switcher across all pages with smooth CSS transitions and system `prefers-color-scheme` support.
  - ⌨️ Full keyboard shortcuts (`← → Space 1-4 K/F/D ? Esc`) with glassmorphism `?` help overlay on both student and teacher dashboards.
  - 🔔 Teacher notification center with bell badge, slide-in drawer, timestamped events, and mark-all-read.
- [x] **Day 12: Voice Study Mode & AI Weak-Spot Remediation Plans**
  - 🎤 Hands-free Voice Study Mode — Web Speech Recognition API with real-time transcript pill, pulsing animated mic button, spoken phrase matching for MCQ options and self-ratings.
  - 🔊 TTS voice feedback on each spoken answer (built on TTSManager).
  - 🚀 AI Weak-Spot Remediation Plan for students — Gemini-generated mnemonics + step-by-step recovery strategies for every missed or fuzzy card, shown on the session completion screen.
  - 🚀 AI Class Remediation Plan for teachers — per-session warm-up activities and re-teaching strategies generated by Gemini from aggregate class performance data, available in Analytics → AI Suggestions.
- [x] **Day 13: Session Comparison Panel, Card Difficulty Heat-Map & Student Progress Timeline**
  - ⚖️ **Session Comparison Panel** — pick any two sessions in Analytics Overview and compare Accuracy, Participation, Know/Fuzzy/Don't-Know rates side-by-side with color-coded ↑↓ delta badges.
  - 🌡️ **Card Difficulty Heat-Map** — in Session Results, each card renders as a green/amber/red tile showing its class-wide wrong-answer rate; hover reveals question + wrong count tooltip.
  - 📈 **Student Progress Timeline** — animated dot-trace on completion screen showing each card as a green (correct) or red (wrong) dot linked by a gradient line, with per-dot hover tooltips.
  - 🧹 **QoL Fixes** — auto-scroll to panel top on sidebar tab switch, `data-tooltip` on all 5 study mode buttons, AI Remediation button purple gradient fixed on Teacher page.
- [x] **Day 14: Achievement & XP Leaderboard System, AI Adaptive Study Paths**
  - 🏆 **XP Engine & Level Progression** — awards XP per action (+10 correct answer, +5 "Know it" rating, +15 streak bonus, +25 high accuracy, +50 perfect score) with 5 rank levels (Novice → Scholar → Expert → Master → Grandmaster) and animated XP progress bar.
  - 🎖️ **6 Unlockable Achievement Badges** — First Steps, Sharpshooter, On Fire, Speed Demon, Bookworm, Centurion with persistent tracking and glowing "NEW!" unlock tags.
  - 🎉 **Animated Level-Up Celebration Modal** — glassmorphism popup with rank title, particle burst, and sound FX on level progression.
  - 🧭 **AI Adaptive Study Path** — Gemini-powered personalized topic priority queue analyzing accuracy, review count, and Leitner overdue cards, with offline heuristic fallback.
  - 🏆 **Teacher Class Leaderboard** — ranked table in Analytics Overview showing student XP, levels, session counts, and avg accuracy with medal indicators for top 3.



---

## Status

This project is actively being developed. Not production-ready.

---

*Built by [@Vincenzo-sur](https://github.com/Vincenzo-sur)*
