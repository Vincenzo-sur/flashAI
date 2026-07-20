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
- [ ] Google Classroom API (planned)

---

## Tech Stack

| | |
|---|---|
| Frontend | HTML, CSS, Vanilla JavaScript |
| AI | Google Gemini API (`gemini-1.5-flash`) |
| Auth | Google OAuth 2.0 *(planned)* |
| Classroom | Google Classroom Add-ons API *(planned)* |
| Storage | `localStorage` → Firebase *(planned)* |
| Charts | Chart.js *(planned)* |

---

## Project Structure

```
flashAI/
├── index.html        # Landing page
├── teacher.html      # Teacher dashboard (WIP)
├── student.html      # Student view (WIP)
├── css/
│   ├── global.css    # Design tokens, buttons, base styles
│   └── landing.css   # Landing page layout and components
└── js/
    └── landing.js    # Flashcard demo logic
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

---

## Status

This project is actively being developed. Not production-ready.

---

*Built by [@Vincenzo-sur](https://github.com/Vincenzo-sur)*
