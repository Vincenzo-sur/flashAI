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
- [x] **Save as Draft** — quick-save subject+topic as a draft without generating cards (Day 7)
- [ ] Google Classroom API (planned — future milestone)

---

## Tech Stack

| | |
|---|---|
| Frontend | HTML, CSS, Vanilla JavaScript |
| AI | Google Gemini API (`gemini-1.5-flash`) |
| Auth | Google OAuth 2.0 (mock flow + GSI hook) |
| Database | Firebase Firestore *(opt-in, Day 6)* |
| Classroom | Google Classroom Add-ons API *(planned)* |
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
│   ├── student.css   # Student reviewer styles
│   └── teacher.css   # Teacher dashboard styles + Day 6 charts
└── js/
    ├── firebase-store.js  # Firebase Firestore adapter (Day 6)
    ├── store.js           # Unified data store (local + Firebase routing)
    ├── auth.js            # Google OAuth / mock sign-in
    ├── teacher.js         # Teacher dashboard + Chart.js (Day 6)
    ├── student.js         # Student flashcard reviewer
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
- [x] **Day 7: Report Cards, Export & Polish**
  - Session Results panel: per-student table with real student IDs, cards answered, accuracy %, Know/Fuzzy/Don't Know counts, and grade badges (A ≥80% / B ≥65% / C ≥50% / D <50%).
  - Per-card accordion showing correct vs wrong distribution bars and the answer.
  - CSV export of full session results as a downloadable `.csv` file.
  - Toast notification system replacing all `alert()` calls — slide-in from right, auto-dismiss, success/error/info variants.
  - Landing page "How It Works" section: 4-step visual flow with numbered badges, connector arrows, and stats chips.
  - "Save as Draft" button in transcript panel (requires subject + topic only, no transcript needed).

---

## Status

This project is actively being developed. Not production-ready.

---

*Built by [@Vincenzo-sur](https://github.com/Vincenzo-sur)*
