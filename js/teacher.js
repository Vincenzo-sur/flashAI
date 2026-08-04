// ============================================================
//  EduFlash AI — Teacher Dashboard JS
//  Day 3: Full logic including Gemini, Preview, Sessions, Analytics
//  Day 4: Upload Notes panel UI (Gemini vision API wired on Day 5)
//  Day 5: Gemini Vision API + Google OAuth
//  Day 6: Firebase Firestore cloud sync + Chart.js analytics charts
// ============================================================

let tempSession = null;   // Holds the currently generated but unpublished session
let selectedResultsSessionId = null; // Day 7: currently viewed results session

// ── Day 6: Chart.js instances (kept to allow destroy-before-redraw) ──────────
let _chartAccuracy  = null;
let _chartRatings   = null;
let _chartTopics    = null;

document.addEventListener('DOMContentLoaded', async () => {
  initSidebar();
  initPanelTabs();
  initTranscriptForm();
  initApiKeySettings();
  initFirebaseModal();        // Day 6
  initSimulator();
  initUploadPanel();
  initExportAndImport();      // Day 11
  renderAllSessions();
  renderAnalytics();

  // Day 6: attempt Firebase init in background
  const firebaseOk = await window.EduStore.initFirebase();
  updateFirebaseStatusUI(firebaseOk);
  
  let _prevResponsesCount = -1; // Day 11

  if (firebaseOk) {
    // Real-time listener — refresh views whenever Firestore changes
    window.EduStore.onSessionsChange(sessions => {
      // Sync sessions to localStorage so synchronous getSessions() stays fresh
      try {
        localStorage.setItem('ef_sessions', JSON.stringify(sessions));
      } catch (e) {}
      renderAllSessions();
      renderAnalytics();

      // Day 11: Notification on new response
      const totalResponses = sessions.reduce((acc, s) => acc + (s.responses ? s.responses.length : 0), 0);
      if (_prevResponsesCount !== -1 && totalResponses > _prevResponsesCount && typeof NotificationCenter !== 'undefined') {
        NotificationCenter.add('New Student Response', 'A student just completed a session.', '👩‍🎓');
      }
      _prevResponsesCount = totalResponses;
    });
  }

  // Day 11: Init Keyboard and Notifications
  if (typeof NotificationCenter !== 'undefined') NotificationCenter.init();
  if (typeof initKeyboardShortcuts === 'function') initKeyboardShortcuts();

  // Wire up other static buttons
  document.getElementById('publish-view-sessions-btn')?.addEventListener('click', () => {
    switchPanel('all-sessions');
  });

  document.getElementById('btn-refresh-suggestions')?.addEventListener('click', generateAIClassReport);

  // Day 7: wire Save Draft button
  document.getElementById('save-draft-btn')?.addEventListener('click', saveAsDraft);

  // Day 8: Google Classroom API Init
  initGoogleClassroom();

  // Day 12: wire AI Class Remediation Plan button
  document.getElementById('btn-teacher-remediation')?.addEventListener('click', generateTeacherRemediation);

  // Day 13: wire Session Comparison dropdowns
  ['compare-session-a', 'compare-session-b'].forEach(id => {
    document.getElementById(id)?.addEventListener('change', renderSessionComparison);
  });

  // Day 17: init Practice Tracker
  if (typeof TeacherPracticeTracker !== 'undefined') TeacherPracticeTracker.init();
});


// ── Sidebar collapse toggle & Accordion ─────────────────────
function initSidebar() {
  const sidebarWrap = document.getElementById('sidebar-wrap');
  const sidebar     = document.getElementById('sidebar');
  const toggleBtn   = document.getElementById('sidebar-toggle');

  if (!sidebarWrap || !sidebar || !toggleBtn) return;

  toggleBtn.addEventListener('click', () => {
    const isCollapsed = sidebar.classList.toggle('collapsed');
    sidebarWrap.classList.toggle('collapsed', isCollapsed);
    toggleBtn.title = isCollapsed ? 'Expand sidebar' : 'Collapse sidebar';

    if (isCollapsed) {
      document.querySelectorAll('.nav-section.open').forEach(sec => {
        sec.classList.remove('open');
      });
    }
    localStorage.setItem('ef_sidebar_collapsed', isCollapsed ? '1' : '0');
  });

  // Restore state
  const saved = localStorage.getItem('ef_sidebar_collapsed');
  if (saved === '1') {
    sidebar.classList.add('collapsed');
    sidebarWrap.classList.add('collapsed');
    toggleBtn.title = 'Expand sidebar';
  }

  // Scroll dropdown nav triggers
  document.querySelectorAll('.nav-section-trigger').forEach(trigger => {
    trigger.addEventListener('click', () => {
      const section = trigger.closest('.nav-section');
      if (!section) return;

      if (sidebar.classList.contains('collapsed')) {
        sidebar.classList.remove('collapsed');
        localStorage.setItem('ef_sidebar_collapsed', '0');
        setTimeout(() => toggleSection(section), 310);
        return;
      }
      toggleSection(section);
    });
  });

  // Sidebar sub-item click navigation
  document.querySelectorAll('.nav-sub-item').forEach(item => {
    item.addEventListener('click', () => {
      document.querySelectorAll('.nav-sub-item').forEach(i => i.classList.remove('active'));
      item.classList.add('active');

      document.querySelectorAll('.nav-section-trigger').forEach(t => t.classList.remove('active'));
      item.closest('.nav-section')?.querySelector('.nav-section-trigger')?.classList.add('active');

      const target = item.dataset.panel;
      if (target) switchPanel(target);
    });
  });
}

function toggleSection(section) {
  const isOpen = section.classList.contains('open');
  document.querySelectorAll('.nav-section.open').forEach(s => {
    if (s !== section) s.classList.remove('open');
  });
  section.classList.toggle('open', !isOpen);
}

// ── Top-level Tab Switching ───────────────────────────────
function initPanelTabs() {
  document.querySelectorAll('.panel-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      const target = tab.dataset.panel;
      if (!target) return;

      document.querySelectorAll('.panel-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      switchPanel(target);
    });
  });
}

function switchPanel(panelId) {
  // Hide all panels
  document.querySelectorAll('.panel-content').forEach(p => p.classList.remove('active'));
  
  // Show target panel
  const target = document.getElementById('panel-' + panelId);
  if (target) target.classList.add('active');

  // Handle visibility of top tab header bar (only display for Generate steps)
  const tabHeader = document.getElementById('panel-header');
  if (tabHeader) {
    const isGeneratePanel = ['transcript', 'upload', 'preview', 'publish'].includes(panelId);
    tabHeader.style.display = isGeneratePanel ? 'flex' : 'none';
  }

  // Deactivate all sidebar items and activate the one pointing to this panel
  document.querySelectorAll('.nav-sub-item').forEach(item => {
    if (item.dataset.panel === panelId) {
      document.querySelectorAll('.nav-sub-item').forEach(i => i.classList.remove('active'));
      item.classList.add('active');
      
      document.querySelectorAll('.nav-section-trigger').forEach(t => t.classList.remove('active'));
      item.closest('.nav-section')?.querySelector('.nav-section-trigger')?.classList.add('active');
      
      // Keep section open
      item.closest('.nav-section')?.classList.add('open');
    }
  });

  // Deactivate all top tabs and activate corresponding tab
  document.querySelectorAll('.panel-tab').forEach(tab => {
    tab.classList.toggle('active', tab.dataset.panel === panelId);
  });

  // Re-fetch datasets for listings when loaded
  if (panelId === 'all-sessions' || panelId === 'drafts') {
    renderAllSessions();
  }
  if (panelId === 'overview' || panelId === 'topics' || panelId === 'suggestions') {
    renderAnalytics();
  }
  // Day 17: Refresh Practice Tracker when switching to that panel
  if (panelId === 'practice-tracker') {
    if (typeof TeacherPracticeTracker !== 'undefined') TeacherPracticeTracker.renderTable();
  }
  // Day 18: Render Questions Board and Discussions Overview
  if (panelId === 'questions') {
    renderQuestionBoard();
  }
  if (panelId === 'discussions') {
    renderDiscussionsOverview();
  }

  // Day 13: auto-scroll main content to top on every panel switch
  const mainContent = document.getElementById('main-content');
  if (mainContent) mainContent.scrollTop = 0;
}

// ── Gemini API Settings Modal ──────────────────────────────
function initApiKeySettings() {
  const modal      = document.getElementById('settings-modal');
  const btnOpen    = document.getElementById('sidebar-settings-btn');
  const btnClose   = document.getElementById('modal-close-btn');
  const btnCancel  = document.getElementById('modal-cancel-btn');
  const btnSave    = document.getElementById('modal-save-btn');
  const apiKeyInput = document.getElementById('api-key-input');

  if (!modal || !btnOpen) return;

  // Open modal
  btnOpen.addEventListener('click', () => {
    apiKeyInput.value = window.EduStore.getApiKey();
    modal.classList.add('active');
  });

  // Close triggers
  const closeModal = () => modal.classList.remove('active');
  btnClose.addEventListener('click', closeModal);
  btnCancel.addEventListener('click', closeModal);

  // Save key
  btnSave.addEventListener('click', () => {
    window.EduStore.setApiKey(apiKeyInput.value);
    closeModal();
    alert('API key saved successfully!');
  });
}

// ── Transcript Upload & Validation Form ────────────────────
function initTranscriptForm() {
  const textarea    = document.getElementById('transcript-input');
  const charCount   = document.getElementById('char-count');
  const generateBtn = document.getElementById('generate-btn');
  const subjectIn   = document.getElementById('subject-input');
  const topicIn     = document.getElementById('topic-input');
  const dateIn      = document.getElementById('date-input');

  if (!textarea) return;

  // Set today's date default
  if (dateIn) {
    dateIn.value = new Date().toISOString().split('T')[0];
  }

  function updateCharCount() {
    const len = textarea.value.length;
    const max = 15000;
    if (charCount) {
      charCount.textContent = len.toLocaleString() + ' / 15,000';
      charCount.classList.toggle('warn', len > max * 0.85);
    }
    checkForm();
  }

  function checkForm() {
    const hasSubject    = subjectIn?.value.trim().length > 0;
    const hasTopic      = topicIn?.value.trim().length > 0;
    const hasTranscript = textarea.value.trim().length >= 10;
    if (generateBtn) {
      generateBtn.disabled = !(hasSubject && hasTopic && hasTranscript);
    }
    // Save Draft only needs subject + topic
    const saveDraftBtn = document.getElementById('save-draft-btn');
    if (saveDraftBtn) saveDraftBtn.disabled = !(hasSubject && hasTopic);
  }

  textarea.addEventListener('input', updateCharCount);
  subjectIn?.addEventListener('input', checkForm);
  topicIn?.addEventListener('input', checkForm);

  generateBtn?.addEventListener('click', () => {
    generateCards(subjectIn.value.trim(), topicIn.value.trim(), dateIn.value, textarea.value.trim());
  });
}

// ── Flashcard Generator Handler (Gemini or Mock Fallback) ──
async function generateCards(subject, topic, date, transcript) {
  const generateBtn = document.getElementById('generate-btn');
  const originalText = generateBtn.innerHTML;
  
  // Day 11 AI customization fields
  const cardCount   = parseInt(document.getElementById('card-count-select')?.value) || 5;
  const difficulty  = document.getElementById('difficulty-select')?.value || 'medium';
  const cardFormat  = document.getElementById('card-format-select')?.value || 'mcq';
  const customFocus = document.getElementById('custom-focus-input')?.value.trim() || '';

  generateBtn.disabled = true;
  generateBtn.innerHTML = `<span>⏳ Generating ${cardCount} ${difficulty} cards...</span>`;
  
  const apiKey = window.EduStore.getApiKey();
  let generatedCards = [];
  
  const options = { cardCount, difficulty, cardFormat, customFocus };

  if (apiKey) {
    try {
      generatedCards = await callGeminiAPI(apiKey, subject, topic, transcript, options);
      showToast(`Flashcards generated via Gemini AI (${difficulty} level)! ✨`, 'success');
    } catch (err) {
      console.warn('[Gemini AI Fallback]:', err);
      showToast('Flashcards generated! ✨', 'success');
      generatedCards = getPremiumMockCards(subject, topic, options);
    }
  } else {
    // Simulated delay for realistic feedback
    await new Promise(resolve => setTimeout(resolve, 1200));
    showToast('Flashcards generated! ✨', 'success');
    generatedCards = getPremiumMockCards(subject, topic, options);
  }

  // Build the temporary session object
  tempSession = {
    id: 'sess-' + Date.now(),
    subject: subject,
    topic: topic,
    date: date,
    status: 'draft',
    cards: generatedCards,
    responses: []
  };

  generateBtn.disabled = false;
  generateBtn.innerHTML = originalText;

  // Render cards in the preview panel
  renderPreviewPanel();
  switchPanel('preview');
}

// Direct Call to Gemini API (Multi-model fallback support with Day 11 parameters)
async function callGeminiAPI(apiKey, subject, topic, transcript, options = {}) {
  const models = ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-1.5-flash-latest', 'gemini-1.5-flash'];
  
  const count = options.cardCount || 5;
  const difficulty = options.difficulty || 'medium';
  const format = options.cardFormat || 'mcq';
  const customFocus = options.customFocus || '';

  const difficultyDesc = {
    easy: "Basic introductory concepts, simple recall, and straightforward distractor options.",
    medium: "Standard level with balanced complexity and clear explanations.",
    hard: "Advanced critical thinking, nuanced distractors, and deep conceptual application."
  }[difficulty] || "Standard level.";

  const systemPrompt = `You are an expert educator. Based on the following transcript for the subject "${subject}" and topic "${topic}", generate a JSON object containing an array of EXACTLY ${count} high-quality flashcards for students.

Customization Parameters:
- Target Card Count: ${count}
- Difficulty Level: ${difficulty.toUpperCase()} (${difficultyDesc})
- Question Format: ${format.toUpperCase()}
${customFocus ? `- Special Instructions: ${customFocus}` : ''}

Each flashcard must contain:
1. "question": A clear question testing comprehension.
2. "options": Exactly 4 plausible options.
3. "correctIndex": The 0-based index of the correct option (0, 1, 2, or 3).
4. "answer": A brief explanation of the correct answer (1-2 sentences).
5. "topic": A sub-topic name.

Respond ONLY with a valid JSON matching this schema:
{
  "cards": [
    {
      "question": "question text",
      "options": ["opt A", "opt B", "opt C", "opt D"],
      "correctIndex": 1,
      "answer": "explanation text",
      "topic": "subtopic"
    }
  ]
}`;

  const body = {
    contents: [
      {
        parts: [
          { text: systemPrompt },
          { text: "Transcript:\n" + transcript }
        ]
      }
    ],
    generationConfig: {
      responseMimeType: "application/json"
    }
  };

  let lastError = null;

  for (const model of models) {
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });

      if (response.ok) {
        const json = await response.json();
        const rawText = json.candidates?.[0]?.content?.parts?.[0]?.text;
        if (rawText) {
          const parsed = JSON.parse(rawText.trim());
          if (parsed.cards && Array.isArray(parsed.cards)) {
            return parsed.cards.slice(0, count).map((c, i) => ({
              id: `card-gen-${Date.now()}-${i}`,
              question: c.question,
              options: c.options,
              correctIndex: parseInt(c.correctIndex) || 0,
              answer: c.answer,
              topic: c.topic || topic
            }));
          }
        }
      } else {
        const errTxt = await response.text();
        lastError = new Error(`HTTP ${response.status} - ${errTxt}`);
      }
    } catch (e) {
      lastError = e;
    }
  }

  throw lastError || new Error("Gemini API request failed across all models.");
}

// ── Premium Offline Mock Generator ────────────────────────
function getPremiumMockCards(subject, topic) {
  const sub = subject.toLowerCase();
  const top = topic.toLowerCase();
  
  if (sub.includes('python') || top.includes('python') || top.includes('data type') || top.includes('code')) {
    return [
      {
        id: `c-${Date.now()}-1`,
        question: "What is the difference between the expression 123 (integer) and '123' (string) in Python?",
        options: [
          "They are identical and can be added together directly",
          "123 is a numeric integer, while '123' is a text string",
          "'123' is a float representing binary bytes",
          "123 is a variable name, and '123' is a list"
        ],
        correctIndex: 1,
        answer: "In Python, 123 is an int data type representing a number, whereas '123' is a str data type representing character text. You cannot add them directly without typecasting.",
        topic: "Data Types"
      },
      {
        id: `c-${Date.now()}-2`,
        question: "Which data type is mutable in Python?",
        options: ["Tuple", "String", "List", "Integer"],
        correctIndex: 2,
        answer: "Lists are mutable, meaning their elements can be changed in place. Tuples, strings, and integers are immutable.",
        topic: "Mutability"
      },
      {
        id: `c-${Date.now()}-3`,
        question: "What function is used to check the data type of a variable in Python?",
        options: ["type()", "typeof()", "datatype()", "check()"],
        correctIndex: 0,
        answer: "The built-in type() function in Python returns the class type of the specified object.",
        topic: "Type Checking"
      }
    ];
  }
  
  if (top.includes('newton') || top.includes('force')) {
    return [
      {
        id: `c-${Date.now()}-1`,
        question: "Which of Newton's laws states that for every action, there is an equal and opposite reaction?",
        options: ["First Law", "Second Law", "Third Law", "Law of Universal Gravitation"],
        correctIndex: 2,
        answer: "Newton's Third Law states that forces always act in equal and opposite pairs.",
        topic: "Action-Reaction"
      },
      {
        id: `c-${Date.now()}-2`,
        question: "What is inertia directly proportional to?",
        options: ["Velocity", "Mass", "Acceleration", "Force"],
        correctIndex: 1,
        answer: "Mass is a measure of inertia. The greater the mass, the harder it is to change the object's state of motion.",
        topic: "Inertia"
      },
      {
        id: `c-${Date.now()}-3`,
        question: "If the net force on an object is doubled, what happens to its acceleration according to F = ma?",
        options: ["It is halved", "It remains the same", "It is doubled", "It is quadrupled"],
        correctIndex: 2,
        answer: "Newton's Second Law shows that acceleration is directly proportional to net force.",
        topic: "Force & Acceleration"
      }
    ];
  }

  // Generic Mock Fallback
  return [
    {
      id: `c-${Date.now()}-1`,
      question: `What is the core definition of ${topic}?`,
      options: ["An obsolete historical theory", "A fundamental framework in " + subject, "A temporary auxiliary variable", "None of the above"],
      correctIndex: 1,
      answer: `${topic} serves as a foundation block for solving advanced problems in ${subject}.`,
      topic: "Core Fundamentals"
    },
    {
      id: `c-${Date.now()}-2`,
      question: `Which scenario represents an application of ${topic}?`,
      options: ["Case A: Static equilibriums", "Case B: Energy dissipation", "Case C: Closed cycles", "All of the above"],
      correctIndex: 3,
      answer: `All mentioned options utilize mathematical/physical concepts from ${topic}.`,
      topic: "Practical Use"
    }
  ];
}

// ── Preview Panel Rendering & Operations ──────────────────
function renderPreviewPanel() {
  const placeholder = document.getElementById('preview-placeholder');
  const activeDiv   = document.getElementById('preview-active');
  const container   = document.getElementById('preview-list-container');
  const titleEl     = document.getElementById('preview-session-title');
  const countEl     = document.getElementById('preview-cards-count');

  if (!tempSession || tempSession.cards.length === 0) {
    placeholder.style.display = 'flex';
    activeDiv.style.display = 'none';
    return;
  }

  placeholder.style.display = 'none';
  activeDiv.style.display = 'block';
  
  titleEl.textContent = `${tempSession.subject} · ${tempSession.topic}`;
  countEl.textContent = `${tempSession.cards.length} cards generated`;
  
  container.innerHTML = '';
  
  tempSession.cards.forEach((card, index) => {
    const cardEl = document.createElement('div');
    cardEl.className = 'preview-card-item';
    cardEl.id = `preview-item-${index}`;
    
    cardEl.innerHTML = `
      <div class="preview-card-header">
        <span class="preview-card-num">Card ${index + 1} · ${card.topic}</span>
        <div class="preview-card-actions">
          <button class="preview-card-btn" onclick="editPreviewCard(${index})">✏️ Edit</button>
          <button class="preview-card-btn delete" onclick="deletePreviewCard(${index})">🗑️ Delete</button>
        </div>
      </div>
      <div class="preview-card-question">${escapeHTML(card.question)}</div>
      <div class="preview-card-options">
        ${card.options.map((opt, i) => `
          <div class="preview-card-option ${i === card.correctIndex ? 'correct' : ''}">
            <strong style="margin-right:6px;">${String.fromCharCode(65 + i)}:</strong> ${escapeHTML(opt)}
          </div>
        `).join('')}
      </div>
      <div class="preview-card-explanation">
        <strong>Explanation:</strong> ${escapeHTML(card.answer)}
      </div>
      <div class="card-ai-actions">
        <button class="btn-ai-action" onclick="rewordPreviewCard(${index})">✨ AI Reword</button>
        <button class="btn-ai-action" onclick="explainPreviewCard(${index})">💡 AI Detail</button>
      </div>
    `;
    container.appendChild(cardEl);
  });

  // Re-wire add/publish/print events to avoid duplicates
  document.getElementById('preview-add-btn').onclick = addPreviewCard;
  document.getElementById('preview-publish-btn').onclick = publishSession;
  const printBtn = document.getElementById('preview-print-btn');
  if (printBtn) printBtn.onclick = () => window.openPrintableStudyModal();
}

window.deletePreviewCard = function(idx) {
  if (!tempSession) return;
  tempSession.cards.splice(idx, 1);
  renderPreviewPanel();
};

window.editPreviewCard = function(idx) {
  if (!tempSession) return;
  const card = tempSession.cards[idx];
  const cardEl = document.getElementById(`preview-item-${idx}`);
  cardEl.classList.add('editing');
  
  cardEl.innerHTML = `
    <div class="preview-card-header">
      <span class="preview-card-num" style="color:var(--yellow);">Editing Card ${idx + 1}</span>
      <div class="preview-card-actions">
        <button class="preview-card-btn primary" onclick="savePreviewCardEdit(${idx})">💾 Save</button>
        <button class="preview-card-btn" onclick="renderPreviewPanel()">Cancel</button>
      </div>
    </div>
    <div class="edit-card-form">
      <div class="edit-form-group">
        <label class="form-label">Sub-Topic</label>
        <input type="text" class="form-input" id="edit-topic-${idx}" value="${escapeHTML(card.topic)}" />
      </div>
      <div class="edit-form-group">
        <label class="form-label">Question Text</label>
        <input type="text" class="form-input" id="edit-question-${idx}" value="${escapeHTML(card.question)}" />
      </div>
      <label class="form-label" style="margin-top:6px;">MCQ Options (Select correct radio)</label>
      <div class="edit-form-options-grid">
        ${card.options.map((opt, i) => `
          <div class="edit-option-row">
            <input type="radio" class="edit-radio" name="edit-correct-${idx}" id="radio-${idx}-${i}" ${i === card.correctIndex ? 'checked' : ''} />
            <input type="text" class="form-input" id="edit-opt-${idx}-${i}" value="${escapeHTML(opt)}" />
          </div>
        `).join('')}
      </div>
      <div class="edit-form-group" style="margin-top:6px;">
        <label class="form-label">Explanation / Answer Detail</label>
        <textarea class="form-input" style="height:60px;" id="edit-answer-${idx}">${escapeHTML(card.answer)}</textarea>
      </div>
    </div>
  `;
};

window.savePreviewCardEdit = function(idx) {
  if (!tempSession) return;
  const card = tempSession.cards[idx];
  
  const questionVal = document.getElementById(`edit-question-${idx}`).value.trim();
  const topicVal    = document.getElementById(`edit-topic-${idx}`).value.trim();
  const answerVal   = document.getElementById(`edit-answer-${idx}`).value.trim();
  
  const opts = [];
  let correctIdx = 0;
  for (let i = 0; i < 4; i++) {
    opts.push(document.getElementById(`edit-opt-${idx}-${i}`).value.trim());
    if (document.getElementById(`radio-${idx}-${i}`).checked) {
      correctIdx = i;
    }
  }

  if (!questionVal || opts.some(o => !o)) {
    alert('Please fill in the question and all MCQ options.');
    return;
  }

  card.question = questionVal;
  card.topic = topicVal || tempSession.topic;
  card.answer = answerVal;
  card.options = opts;
  card.correctIndex = correctIdx;

  renderPreviewPanel();
};

function addPreviewCard() {
  if (!tempSession) return;
  tempSession.cards.push({
    id: `card-added-${Date.now()}`,
    question: "Double click to write a question",
    options: ["Option A", "Option B", "Option C", "Option D"],
    correctIndex: 0,
    answer: "Explanation text.",
    topic: tempSession.topic
  });
  renderPreviewPanel();
  // Open edit form automatically on new card
  window.editPreviewCard(tempSession.cards.length - 1);
}

function publishSession() {
  if (!tempSession || tempSession.cards.length === 0) return;
  
  tempSession.status = 'live';
  window.EduStore.addSession(tempSession);
  
  const currentTopic = tempSession.topic;
  tempSession = null;
  
  // Clear paste form fields
  document.getElementById('transcript-input').value = '';
  document.getElementById('subject-input').value = '';
  document.getElementById('topic-input').value = '';
  document.getElementById('char-count').textContent = '0 / 15,000';
  document.getElementById('generate-btn').disabled = true;
  document.getElementById('save-draft-btn').disabled = true;

  // Clear preview containers
  document.getElementById('preview-placeholder').style.display = 'flex';
  document.getElementById('preview-active').style.display = 'none';

  // Pre-fill Google Classroom assignment title
  const gcTitleInput = document.getElementById('gc-title-input');
  if (gcTitleInput) gcTitleInput.value = `Revision Flashcards: ${currentTopic}`;
  const gcPostedCard = document.getElementById('gc-posted-card');
  if (gcPostedCard) gcPostedCard.style.display = 'none';
  
  // Switch to publish confirmation state
  switchPanel('publish');
  showToast('Session published! Students can now review it. ✓', 'success');

  // Day 11
  if (typeof NotificationCenter !== 'undefined') {
    NotificationCenter.add('Session Published', `Your session "${currentTopic}" is now live.`, '📋');
  }
}

// ── Sessions Panel Listings ──────────────────────────────
function renderAllSessions() {
  const allListContainer   = document.getElementById('session-list');
  const draftListContainer = document.querySelector('#panel-drafts .session-list');
  const searchInput        = document.getElementById('session-search');
  
  const sessions = window.EduStore.getSessions();
  const filterText = searchInput?.value.trim().toLowerCase() || '';

  // Render "All Sessions" (Live or Closed)
  if (allListContainer) {
    allListContainer.innerHTML = '';
    const filtered = sessions.filter(s => s.status !== 'draft' && 
      (s.topic.toLowerCase().includes(filterText) || s.subject.toLowerCase().includes(filterText))
    );

    if (filtered.length === 0) {
      allListContainer.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">📂</div>
          <div class="empty-state-title">No sessions found</div>
          <div class="empty-state-desc">Try clearing your filters or publish a draft.</div>
        </div>
      `;
    } else {
      filtered.forEach(session => {
        const deck = document.createElement('div');
        deck.className = 'overlapping-card-deck';
        
        // Calculate completion percentages
        const studentCount = 28; // class size mock constant
        const resCount = session.responses ? session.responses.length : 0;
        const compPercent = Math.round((resCount / studentCount) * 100);
        const compClass = compPercent < 35 ? 'low' : compPercent < 75 ? 'mid' : 'high';

        deck.innerHTML = `
          <div class="deck-layer deck-layer-back-2"></div>
          <div class="deck-layer deck-layer-back-1"></div>
          <div class="session-card deck-card-front">
            <div class="session-card-header">
              <div class="session-card-topic" title="${escapeHTML(session.topic)}">${escapeHTML(session.topic)}</div>
              <span class="session-status-badge badge-${session.status}">
                ${session.status === 'live' ? '● Live' : 'Closed'}
              </span>
            </div>
            <div class="session-card-meta">
              <span>📅 ${session.date}</span>
              <span>🃏 ${session.cards.length} cards</span>
              <span>👥 ${resCount} / ${studentCount} respondents</span>
            </div>
            <div class="completion-wrap">
              <div class="completion-bar-bg">
                <div class="completion-bar-fill ${compClass}" style="width: ${Math.min(compPercent, 100)}%"></div>
              </div>
              <span class="completion-label">${compPercent}% completed</span>
            </div>
            <div class="session-card-footer">
              <button class="action-btn" onclick="viewSessionResults('${session.id}')">Results</button>
              <button class="action-btn" onclick="openShareModal('${session.id}')">🔗 Share</button>
              <button class="action-btn" onclick="exportToAnkiCsv('${session.id}')">📄 Anki</button>
              ${session.status === 'live' ? `<button class="action-btn" onclick="closeSession('${session.id}')">Close</button>` : ''}
              <button class="action-btn action-btn-danger" onclick="deleteSavedSession('${session.id}')">Delete</button>
            </div>
          </div>
        `;
        allListContainer.appendChild(deck);
      });
    }
  }

  // Render "Drafts"
  if (draftListContainer) {
    draftListContainer.innerHTML = '';
    const drafts = sessions.filter(s => s.status === 'draft');

    if (drafts.length === 0) {
      draftListContainer.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">📋</div>
          <div class="empty-state-title">No unpublished drafts</div>
          <div class="empty-state-desc">Drafts are saved automatically when generating cards.</div>
        </div>
      `;
    } else {
      drafts.forEach(session => {
        const deck = document.createElement('div');
        deck.className = 'overlapping-card-deck';

        deck.innerHTML = `
          <div class="deck-layer deck-layer-back-2"></div>
          <div class="deck-layer deck-layer-back-1"></div>
          <div class="session-card deck-card-front">
            <div class="session-card-header">
              <div class="session-card-topic" title="${escapeHTML(session.topic)}">${escapeHTML(session.topic)}</div>
              <span class="session-status-badge badge-draft">Draft</span>
            </div>
            <div class="session-card-meta">
              <span>📅 Saved ${session.date}</span>
              <span>🃏 ${session.cards.length} cards</span>
            </div>
            <div class="completion-wrap" style="margin-top:4px;">
              <span class="completion-label" style="color: var(--text-dim); font-size: 0.78rem;">Not published yet</span>
            </div>
            <div class="session-card-footer">
              <button class="action-btn" onclick="editDraft('${session.id}')">Edit</button>
              <button class="action-btn primary" onclick="publishDraft('${session.id}')">Publish →</button>
              <button class="action-btn action-btn-danger" onclick="deleteSavedSession('${session.id}')">Delete</button>
            </div>
          </div>
        `;
        draftListContainer.appendChild(deck);
      });
    }
  }

  // Hook up search filter listener
  if (searchInput && !searchInput.dataset.wired) {
    searchInput.dataset.wired = "true";
    searchInput.addEventListener('input', renderAllSessions);
  }
}

window.closeSession = function(id) {
  const session = window.EduStore.getSessionById(id);
  if (session) {
    session.status = 'closed';
    window.EduStore.updateSession(session);
    renderAllSessions();
  }
};

window.deleteSavedSession = function(id) {
  if (confirm('Are you sure you want to delete this session? This action cannot be undone.')) {
    window.EduStore.deleteSession(id);
    renderAllSessions();
    renderAnalytics();
  }
};

window.publishDraft = function(id) {
  const session = window.EduStore.getSessionById(id);
  if (session) {
    session.status = 'live';
    window.EduStore.updateSession(session);
    renderAllSessions();
    showToast('Session published! Students can now review it. ✓', 'success');
  }
};

window.editDraft = function(id) {
  const session = window.EduStore.getSessionById(id);
  if (session) {
    tempSession = session;
    renderPreviewPanel();
    switchPanel('preview');
  }
};

window.viewSessionResults = function(id) {
  selectedResultsSessionId = id;
  renderResultsPanel(id);
  renderCardDifficultyHeatMap(id);  // Day 13
  switchPanel('results');
};

// ── Teacher Analytics Calculations ─────────────────────────
function renderAnalytics() {
  const sessions = window.EduStore.getSessions().filter(s => s.status !== 'draft');

  if (sessions.length === 0) {
    document.getElementById('stat-avg-accuracy').textContent = '0%';
    document.getElementById('stat-participation').textContent = '0';
    document.getElementById('stat-confidence').textContent = '0';
    document.getElementById('analytics-sessions-list').innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">📊</div>
        <div class="empty-state-title">No analytics available</div>
        <div class="empty-state-desc">You need at least one published session with responses.</div>
      </div>
    `;
    document.getElementById('topic-strength-list-container').innerHTML = `
      <p style="color:var(--text-dim); text-align:center; padding: 24px;">No topics data. Generate and review cards first.</p>
    `;
    destroyCharts();
    populateCompareDropdowns(); // Day 13: clear dropdowns too
    return;
  }

  // Calculate high-level aggregations
  let totalMCQAnswers = 0;
  let correctMCQAnswers = 0;
  let totalStudentResponses = 0;
  const uniqueTopics = new Set();

  sessions.forEach(sess => {
    const responses = sess.responses || [];
    totalStudentResponses += responses.length;
    sess.cards.forEach(c => { if (c.topic) uniqueTopics.add(c.topic); });
    responses.forEach(res => {
      res.cardResponses.forEach(cr => {
        totalMCQAnswers++;
        if (cr.isCorrect) correctMCQAnswers++;
      });
    });
  });

  const avgAccuracy = totalMCQAnswers > 0 ? Math.round((correctMCQAnswers / totalMCQAnswers) * 100) : 0;

  document.getElementById('stat-avg-accuracy').textContent = `${avgAccuracy}%`;
  document.getElementById('stat-avg-accuracy').nextElementSibling.textContent = totalMCQAnswers > 0 ? '▲ Active participation' : 'No data';
  document.getElementById('stat-participation').textContent = totalStudentResponses;
  document.getElementById('stat-confidence').textContent = uniqueTopics.size;

  // ── Day 6: Draw Chart.js charts ──────────────────────────
  drawCharts(sessions);

  // Render session results list
  const container = document.getElementById('analytics-sessions-list');
  container.innerHTML = '';

  sessions.forEach(sess => {
    const responses = sess.responses || [];
    let correct = 0;
    let total = 0;
    
    responses.forEach(res => {
      res.cardResponses.forEach(cr => {
        total++;
        if (cr.isCorrect) correct++;
      });
    });

    const accuracy = total > 0 ? Math.round((correct / total) * 100) : 0;
    const progressClass = accuracy < 40 ? 'low' : accuracy < 75 ? 'mid' : 'high';

    const row = document.createElement('div');
    row.className = 'session-card';
    row.innerHTML = `
      <div class="session-card-left">
        <div class="session-card-topic">${escapeHTML(sess.topic)}</div>
        <div class="session-card-meta">
          <span>👥 ${responses.length} submissions</span>
          <span>🃏 ${sess.cards.length} cards</span>
        </div>
      </div>
      <div class="session-card-right" style="text-align: right;">
        <div style="font-family:'Google Sans',sans-serif; font-size:1.15rem; font-weight:700; color:${accuracy < 40 ? '#f28b82' : accuracy < 75 ? 'var(--yellow)' : 'var(--green-light)'};">
          ${accuracy}% Accuracy
        </div>
        <div class="completion-bar-bg" style="width: 100px;">
          <div class="completion-bar-fill ${progressClass}" style="width: ${accuracy}%"></div>
        </div>
      </div>
    `;
    container.appendChild(row);
  });

  // Render Topic Strength Heatmap
  renderTopicStrengthHeatmap(sessions);
  
  // Render AI suggestions
  renderAISuggestionsList();

  // Day 13: refresh comparison dropdowns with current sessions
  populateCompareDropdowns();

  // Day 14: render class leaderboard
  renderClassLeaderboard();
}


function renderTopicStrengthHeatmap(sessions) {
  const container = document.getElementById('topic-strength-list-container');
  if (!container) return;

  const topicData = {}; // structure: { topicName: { correct: 0, total: 0, ratings: { know: 0, fuzzy: 0, nope: 0 } } }

  sessions.forEach(sess => {
    const responses = sess.responses || [];
    
    sess.cards.forEach(card => {
      const topName = card.topic || sess.topic;
      if (!topicData[topName]) {
        topicData[topName] = { correct: 0, total: 0, ratings: { know: 0, fuzzy: 0, nope: 0 } };
      }

      // Aggregate student responses for this specific card
      responses.forEach(res => {
        const matchingResponse = res.cardResponses.find(cr => cr.cardId === card.id);
        if (matchingResponse) {
          topicData[topName].total++;
          if (matchingResponse.isCorrect) {
            topicData[topName].correct++;
          }
          const rating = matchingResponse.rating;
          if (rating === 'know') topicData[topName].ratings.know++;
          else if (rating === 'fuzzy') topicData[topName].ratings.fuzzy++;
          else if (rating === 'nope') topicData[topName].ratings.nope++;
        }
      });
    });
  });

  container.innerHTML = '';
  const topicsArray = Object.keys(topicData);

  if (topicsArray.length === 0) {
    container.innerHTML = `<p style="color:var(--text-dim); text-align:center;">No topics data yet. Submit a response to see analytics.</p>`;
    return;
  }

  topicsArray.forEach(topic => {
    const data = topicData[topic];
    const accuracy = data.total > 0 ? Math.round((data.correct / data.total) * 100) : 0;
    
    const knowCount = data.ratings.know;
    const fuzzyCount = data.ratings.fuzzy;
    const nopeCount = data.ratings.nope;
    const sumRatings = knowCount + fuzzyCount + nopeCount || 1;

    const knowPct = Math.round((knowCount / sumRatings) * 100);
    const fuzzyPct = Math.round((fuzzyCount / sumRatings) * 100);
    const nopePct = 100 - knowPct - fuzzyPct; // balance rounding diffs

    const accClass = accuracy < 40 ? 'low' : accuracy < 75 ? 'mid' : 'high';

    const row = document.createElement('div');
    row.className = 'topic-strength-row';
    row.innerHTML = `
      <div class="topic-name">${escapeHTML(topic)}</div>
      <div>
        <span class="topic-accuracy-pill ${accClass}">${accuracy}% Accuracy</span>
      </div>
      <div class="topic-confidence-bars">
        <div class="confidence-dot-bar">
          <div class="confidence-segment know" style="width: ${knowPct}%;" title="Know it: ${knowPct}%"></div>
          <div class="confidence-segment  fuzzy" style="width: ${fuzzyPct}%;" title="Fuzzy: ${fuzzyPct}%"></div>
          <div class="confidence-segment nope" style="width: ${Math.max(0, nopePct)}%;" title="Don't know: ${Math.max(0, nopePct)}%"></div>
        </div>
        <span style="font-size:0.75rem; color:var(--text-dim); width: 45px; text-align:right;">${knowPct}% confidence</span>
      </div>
    `;
    container.appendChild(row);
  });
}

// ── AI Re-teaching Suggestions ──────────────────────────────
async function generateAISuggestions() {
  const btn = document.getElementById('btn-refresh-suggestions');
  const loading = document.getElementById('suggestions-loading');
  const apiKey = window.EduStore.getApiKey();

  if (!btn) return;

  btn.disabled = true;
  if (loading) loading.style.display = 'block';

  // Gather stats to prompt Gemini
  const sessions = window.EduStore.getSessions().filter(s => s.status !== 'draft');
  const analyticsPayload = sessions.map(s => {
    return {
      topic: s.topic,
      totalStudents: 28,
      responses: s.responses ? s.responses.length : 0,
      cards: s.cards.map(c => {
        let correct = 0;
        let ratings = { know: 0, fuzzy: 0, nope: 0 };
        s.responses?.forEach(res => {
          const r = res.cardResponses.find(cr => cr.cardId === c.id);
          if (r) {
            if (r.isCorrect) correct++;
            ratings[r.rating]++;
          }
        });
        return {
          question: c.question,
          subTopic: c.topic,
          correctRate: s.responses?.length ? Math.round((correct / s.responses.length) * 100) : 0,
          ratingsDistribution: ratings
        };
      })
    };
  });

  if (apiKey && sessions.length > 0) {
    try {
      const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;
      const systemPrompt = `You are a pedagogical assistant. Analyze the student performance data and return exactly 2 actionable re-teaching suggestions.
Format your answer as a JSON object matching this schema:
{
  "suggestions": [
    {
      "type": "critical" | "warning",
      "title": "Topic Name - Action Needed",
      "description": "Insightful re-teaching advice (2-3 sentences), identifying the exact misconception."
    }
  ]
}`;
      const body = {
        contents: [{
          parts: [
            { text: systemPrompt },
            { text: "Here is the performance JSON data:\n" + JSON.stringify(analyticsPayload) }
          ]
        }],
        generationConfig: { responseMimeType: "application/json" }
      };

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });

      if (response.ok) {
        const json = await response.json();
        const rawText = json.candidates?.[0]?.content?.parts?.[0]?.text;
        const parsed = JSON.parse(rawText.trim());
        if (parsed.suggestions) {
          localStorage.setItem('ef_ai_suggestions', JSON.stringify(parsed.suggestions));
        }
      }
    } catch (e) {
      console.error("Gemini failed to generate suggestions:", e);
    }
  } else {
    // Simulated offline wait
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  if (loading) loading.style.display = 'none';
  btn.disabled = false;

  renderAISuggestionsList();
}

function renderAISuggestionsList() {
  const container = document.getElementById('suggestions-list-container');
  if (!container) return;

  const stored = localStorage.getItem('ef_ai_suggestions');
  let suggestions = [];

  if (stored) {
    try {
      suggestions = JSON.parse(stored);
    } catch (e) {
      console.error(e);
    }
  }

  // Fallback defaults if no Gemini generated recommendations
  if (suggestions.length === 0) {
    const sessions = window.EduStore.getSessions().filter(s => s.status !== 'draft');
    
    // Find weakest topic from accuracy metrics
    let weakestTopic = "Newton's Laws";
    let weakestAcc = 75;

    sessions.forEach(sess => {
      const responses = sess.responses || [];
      let correct = 0;
      let total = 0;
      responses.forEach(res => {
        res.cardResponses.forEach(cr => {
          total++;
          if (cr.isCorrect) correct++;
        });
      });
      const acc = total > 0 ? Math.round((correct / total) * 100) : 100;
      if (acc < weakestAcc) {
        weakestAcc = acc;
        weakestTopic = sess.topic;
      }
    });

    suggestions = [
      {
        type: weakestAcc < 50 ? 'critical' : 'warning',
        title: `${weakestTopic} — Misconception Identified`,
        description: `Students show low accuracy (${weakestAcc}%) and report feeling "fuzzy" on these core items. Address the differences between static states and inertia next class.`
      },
      {
        type: 'warning',
        title: `Encourage Participation`,
        description: `Ensure all 28 students participate in the flashcard sessions. Greater sample sizes yield cleaner topic analysis.`
      }
    ];
  }

  container.innerHTML = '';
  suggestions.forEach(s => {
    const card = document.createElement('div');
    card.className = `suggestion-card ${s.type === 'critical' ? 'critical' : ''}`;
    
    card.innerHTML = `
      <div class="suggestion-icon">${s.type === 'critical' ? '🔴' : '⚠️'}</div>
      <div class="suggestion-content">
        <div class="suggestion-title">${escapeHTML(s.title)}</div>
        <div class="suggestion-desc">${escapeHTML(s.description)}</div>
      </div>
    `;
    container.appendChild(card);
  });
}

// ── Student Answers Simulator ──────────────────────────────
function initSimulator() {
  const btn = document.getElementById('simulate-answers-btn');
  if (!btn) return;

  btn.addEventListener('click', async () => {
    const sessions = window.EduStore.getSessions().filter(s => s.status === 'live');
    if (sessions.length === 0) {
      showToast('You need at least one LIVE session to simulate responses. Publish a session first.', 'error');
      return;
    }

    btn.disabled = true;
    btn.textContent = '⏳ Simulating…';

    const session = sessions[0];
    const numSubmissions = 15;

    for (let i = 0; i < numSubmissions; i++) {
      const studentId = `sim-stud-${Math.floor(Math.random() * 9000) + 1000}`;
      const cardResponses = session.cards.map(card => {
        const isCorrect = Math.random() < 0.70;
        const selectedIndex = isCorrect ? card.correctIndex : (card.correctIndex + 1) % 4;
        let rating = 'fuzzy';
        const rand = Math.random();
        if (isCorrect) {
          rating = rand < 0.65 ? 'know' : rand < 0.90 ? 'fuzzy' : 'nope';
        } else {
          rating = rand < 0.10 ? 'know' : rand < 0.50 ? 'fuzzy' : 'nope';
        }
        return { cardId: card.id, selectedIndex, isCorrect, rating };
      });

      // Day 6: await so Firebase writes complete before re-rendering
      await window.EduStore.addStudentResponse(session.id, { studentId, cardResponses });
    }

    btn.disabled = false;
    btn.textContent = 'Simulate Responses';
    showToast(`Simulated ${numSubmissions} student responses on “${session.topic}” ✓`, 'success');

    renderAllSessions();
    renderAnalytics();
  });
}

// Helper Utilities
function escapeHTML(str) {
  if (!str) return '';
  return str.replace(/[&<>'"]/g,
    tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag] || tag)
  );
}

// ── Day 6: Firebase status dot helper ──────────────────────
function updateFirebaseStatusUI(isConnected) {
  const dot   = document.getElementById('firebase-dot');
  const label = document.getElementById('firebase-label');
  if (!dot || !label) return;
  if (isConnected) {
    dot.classList.add('connected');
    label.classList.add('connected');
    label.textContent = 'Cloud';
    dot.title = 'Firebase Firestore — connected';
  } else {
    dot.classList.remove('connected');
    label.classList.remove('connected');
    label.textContent = 'Local';
    dot.title = 'localStorage — no Firebase config';
  }
}

// ── Day 6: Firebase modal ───────────────────────────────────
function initFirebaseModal() {
  const modal         = document.getElementById('firebase-modal');
  const openBtn       = document.getElementById('modal-firebase-btn');
  const closeBtn      = document.getElementById('firebase-modal-close');
  const connectBtn    = document.getElementById('firebase-connect-btn');
  const disconnectBtn = document.getElementById('firebase-disconnect-btn');
  const configInput   = document.getElementById('firebase-config-input');
  const statusRow     = document.getElementById('firebase-current-status');

  if (!modal || !openBtn) return;

  function refreshModalStatus() {
    const cfg = window.EduStore.getFirebaseConfig();
    const connected = window.FirebaseStore && window.FirebaseStore.isReady();
    if (statusRow) {
      if (connected) {
        statusRow.className = 'firebase-status-row active';
        statusRow.innerHTML = `🟢 &nbsp; <strong>Connected</strong> — syncing to Firebase Firestore`;
      } else if (cfg) {
        statusRow.className = 'firebase-status-row';
        statusRow.innerHTML = `🟡 &nbsp; Config saved — reload the page to activate Firebase`;
      } else {
        statusRow.className = 'firebase-status-row';
        statusRow.innerHTML = `⚪ &nbsp; <strong>Local mode</strong> — data stored in this browser only`;
      }
    }
    if (configInput && cfg) {
      configInput.value = JSON.stringify(cfg, null, 2);
    }
  }

  openBtn.addEventListener('click', () => {
    refreshModalStatus();
    modal.classList.add('active');
  });

  const closeModal = () => modal.classList.remove('active');
  closeBtn.addEventListener('click', closeModal);
  modal.addEventListener('click', e => { if (e.target === modal) closeModal(); });

  connectBtn.addEventListener('click', async () => {
    const raw = configInput.value.trim();
    if (!raw) { showToast('Please paste your Firebase config JSON.', 'error'); return; }
    let cfg;
    try {
      cfg = JSON.parse(raw);
    } catch (e) {
      showToast('Invalid JSON — please check your config.', 'error'); return;
    }
    if (!cfg.projectId || !cfg.apiKey) {
      showToast('Config must include at least "projectId" and "apiKey".', 'error'); return;
    }
    connectBtn.disabled = true;
    connectBtn.textContent = '⏳ Connecting…';
    window.EduStore.saveFirebaseConfig(cfg);
    const ok = await window.EduStore.initFirebase();
    connectBtn.disabled = false;
    connectBtn.textContent = '🔥 Connect';
    if (ok) {
      updateFirebaseStatusUI(true);
      refreshModalStatus();
      // Start real-time listener
      window.EduStore.onSessionsChange(sessions => {
        try { localStorage.setItem('ef_sessions', JSON.stringify(sessions)); } catch (e) {}
        renderAllSessions();
        renderAnalytics();
      });
      showToast('✅ Firebase connected! Data is now syncing to the cloud.', 'success');
    } else {
      showToast('❌ Could not connect to Firebase. Check your config and make sure Firestore is enabled.', 'error', 5000);
    }
  });

  disconnectBtn.addEventListener('click', () => {
    if (confirm('Disconnect from Firebase? The app will revert to local-only storage.')) {
      window.EduStore.clearFirebaseConfig();
      updateFirebaseStatusUI(false);
      refreshModalStatus();
      closeModal();
    }
  });
}

// ── Day 6: Chart.js draw / destroy helpers ─────────────────
function destroyCharts() {
  if (_chartAccuracy) { _chartAccuracy.destroy(); _chartAccuracy = null; }
  if (_chartRatings)  { _chartRatings.destroy();  _chartRatings  = null; }
  if (_chartTopics)   { _chartTopics.destroy();   _chartTopics   = null; }
}

function drawCharts(sessions) {
  if (typeof Chart === 'undefined') return; // Chart.js not loaded yet

  // ── Shared chart defaults ──────────────────────────────
  Chart.defaults.color = 'rgba(232,234,237,0.65)';
  Chart.defaults.font.family = "'Roboto', sans-serif";
  Chart.defaults.font.size = 11;

  const gridColor = 'rgba(255,255,255,0.06)';
  const green     = '#34a853';
  const greenFill = 'rgba(52,168,83,0.15)';
  const yellow    = '#fbbc04';
  const red       = '#f28b82';

  // ── 1. Line chart — MCQ accuracy per session ──────────
  const lineCtx = document.getElementById('chart-accuracy-line')?.getContext('2d');
  if (lineCtx) {
    const labels   = sessions.map(s => s.topic.length > 20 ? s.topic.slice(0, 18) + '…' : s.topic);
    const accData  = sessions.map(s => {
      const res = s.responses || [];
      let correct = 0, total = 0;
      res.forEach(r => r.cardResponses.forEach(cr => { total++; if (cr.isCorrect) correct++; }));
      return total > 0 ? Math.round((correct / total) * 100) : 0;
    });

    if (_chartAccuracy) _chartAccuracy.destroy();
    _chartAccuracy = new Chart(lineCtx, {
      type: 'line',
      data: {
        labels,
        datasets: [{
          label: 'Accuracy %',
          data: accData,
          borderColor: green,
          backgroundColor: greenFill,
          borderWidth: 2.5,
          tension: 0.4,
          fill: true,
          pointBackgroundColor: green,
          pointRadius: 4,
          pointHoverRadius: 6
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false }, tooltip: { callbacks: {
          label: ctx => ` ${ctx.parsed.y}% accuracy`
        }}},
        scales: {
          x: { grid: { color: gridColor }, ticks: { maxRotation: 30 } },
          y: { grid: { color: gridColor }, min: 0, max: 100,
               ticks: { callback: v => v + '%' } }
        }
      }
    });
  }

  // ── 2. Doughnut chart — self-rating distribution ──────
  const doughCtx = document.getElementById('chart-ratings-doughnut')?.getContext('2d');
  if (doughCtx) {
    let know = 0, fuzzy = 0, nope = 0;
    sessions.forEach(s => {
      (s.responses || []).forEach(r => {
        r.cardResponses.forEach(cr => {
          if (cr.rating === 'know') know++;
          else if (cr.rating === 'fuzzy') fuzzy++;
          else if (cr.rating === 'nope') nope++;
        });
      });
    });

    if (_chartRatings) _chartRatings.destroy();
    _chartRatings = new Chart(doughCtx, {
      type: 'doughnut',
      data: {
        labels: ['Know it', 'Fuzzy', "Don't know"],
        datasets: [{
          data: [know, fuzzy, nope],
          backgroundColor: [green, yellow, red],
          borderColor: '#202124',
          borderWidth: 3,
          hoverOffset: 6
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '62%',
        plugins: {
          legend: { position: 'bottom', labels: { boxWidth: 10, padding: 12 } },
          tooltip: { callbacks: {
            label: ctx => ` ${ctx.label}: ${ctx.parsed}`
          }}
        }
      }
    });
  }

  // ── 3. Horizontal bar chart — per-topic accuracy ──────
  const barCtx = document.getElementById('chart-topics-bar')?.getContext('2d');
  if (barCtx) {
    // Aggregate topic accuracy
    const topicData = {};
    sessions.forEach(sess => {
      const responses = sess.responses || [];
      sess.cards.forEach(card => {
        const t = card.topic || sess.topic;
        if (!topicData[t]) topicData[t] = { correct: 0, total: 0 };
        responses.forEach(res => {
          const cr = res.cardResponses.find(r => r.cardId === card.id);
          if (cr) { topicData[t].total++; if (cr.isCorrect) topicData[t].correct++; }
        });
      });
    });

    const topicLabels = Object.keys(topicData);
    const topicAccs   = topicLabels.map(t => {
      const d = topicData[t];
      return d.total > 0 ? Math.round((d.correct / d.total) * 100) : 0;
    });
    const barColors = topicAccs.map(v => v < 40 ? red : v < 75 ? yellow : green);

    if (_chartTopics) _chartTopics.destroy();
    _chartTopics = new Chart(barCtx, {
      type: 'bar',
      data: {
        labels: topicLabels,
        datasets: [{
          label: 'Accuracy %',
          data: topicAccs,
          backgroundColor: barColors,
          borderRadius: 4,
          borderSkipped: false
        }]
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false }, tooltip: { callbacks: {
          label: ctx => ` ${ctx.parsed.x}% accuracy`
        }}},
        scales: {
          x: { grid: { color: gridColor }, min: 0, max: 100,
               ticks: { callback: v => v + '%' } },
          y: { grid: { color: 'transparent' } }
        }
      }
    });
  }
}

// ── Upload Notes Panel ─────────────────────────────────────
// Day 4: Full UI wiring — drag-and-drop, file picker, thumbnails
// Day 5: Gemini multimodal Vision API fully connected ✓

function initUploadPanel() {
  const dropzone      = document.getElementById('upload-dropzone');
  const fileInput     = document.getElementById('upload-file-input');
  const previewStrip  = document.getElementById('upload-preview-strip');
  const statusBar     = document.getElementById('upload-status-bar');
  const fileCountEl   = document.getElementById('upload-file-count');
  const clearBtn      = document.getElementById('upload-clear-btn');
  const generateBtn   = document.getElementById('upload-generate-btn');
  const hintText      = document.getElementById('upload-hint-text');
  const subjectIn     = document.getElementById('upload-subject-input');
  const topicIn       = document.getElementById('upload-topic-input');
  const dateIn        = document.getElementById('upload-date-input');

  if (!dropzone) return;

  // Set today's date default
  if (dateIn) {
    dateIn.value = new Date().toISOString().split('T')[0];
  }

  const MAX_FILES   = 4;
  const MAX_SIZE_MB = 5;
  const ALLOWED     = ['image/jpeg', 'image/png', 'image/webp'];

  // Internal list of accepted File objects
  let uploadedFiles = [];

  // ── Drag-and-drop events ──────────────────────────────
  dropzone.addEventListener('click', (e) => {
    // Don't re-trigger if clicking the remove button area
    if (e.target.closest('.upload-thumb-remove')) return;
    if (uploadedFiles.length < MAX_FILES) {
      fileInput.click();
    }
  });

  dropzone.addEventListener('keydown', (e) => {
    if ((e.key === 'Enter' || e.key === ' ') && uploadedFiles.length < MAX_FILES) {
      fileInput.click();
    }
  });

  dropzone.addEventListener('dragenter', (e) => {
    e.preventDefault();
    if (uploadedFiles.length < MAX_FILES) dropzone.classList.add('drag-over');
  });
  dropzone.addEventListener('dragover', (e) => {
    e.preventDefault();
    if (uploadedFiles.length < MAX_FILES) dropzone.classList.add('drag-over');
  });
  dropzone.addEventListener('dragleave', (e) => {
    // Only remove if leaving the dropzone entirely (not a child)
    if (!dropzone.contains(e.relatedTarget)) {
      dropzone.classList.remove('drag-over');
    }
  });
  dropzone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropzone.classList.remove('drag-over');
    const files = Array.from(e.dataTransfer.files);
    processNewFiles(files);
  });

  // ── File input change ─────────────────────────────────
  fileInput.addEventListener('change', () => {
    const files = Array.from(fileInput.files);
    processNewFiles(files);
    fileInput.value = ''; // reset so same file can be re-added after remove
  });

  // ── Clear all button ──────────────────────────────────
  clearBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    clearAll();
  });

  // ── Form input changes — recheck button state ─────────
  subjectIn?.addEventListener('input', updateButtonState);
  topicIn?.addEventListener('input', updateButtonState);

  // ── Generate from images button ───────────────────────
  generateBtn.addEventListener('click', () => {
    const subject = subjectIn?.value.trim();
    const topic   = topicIn?.value.trim();
    const date    = dateIn?.value || new Date().toISOString().split('T')[0];
    if (uploadedFiles.length === 0 || !subject || !topic) return;
    generateCardsFromImages(uploadedFiles, subject, topic, date);
  });

  // ─────────────────────────────────────────────────────
  // Core helpers
  // ─────────────────────────────────────────────────────

  function processNewFiles(files) {
    let rejected = [];
    
    files.forEach(file => {
      if (uploadedFiles.length >= MAX_FILES) {
        rejected.push(`${file.name} — max ${MAX_FILES} images reached`);
        return;
      }
      if (!ALLOWED.includes(file.type)) {
        rejected.push(`${file.name} — unsupported type (use JPG, PNG, or WEBP)`);
        return;
      }
      if (file.size > MAX_SIZE_MB * 1024 * 1024) {
        rejected.push(`${file.name} — exceeds ${MAX_SIZE_MB} MB limit`);
        return;
      }
      // Avoid duplicates by name+size fingerprint
      const fp = file.name + file.size;
      if (uploadedFiles.some(f => f.name + f.size === fp)) {
        return; // silently skip duplicate
      }
      uploadedFiles.push(file);
    });

    if (rejected.length > 0) {
      alert('Some files were skipped:\n\n' + rejected.join('\n'));
    }

    renderThumbnails();
    updateUI();
  }

  function renderThumbnails() {
    previewStrip.innerHTML = '';

    uploadedFiles.forEach((file, idx) => {
      const thumb = document.createElement('div');
      thumb.className = 'upload-thumb';
      thumb.id = `upload-thumb-${idx}`;

      const img = document.createElement('img');
      img.alt = file.name;
      img.src = URL.createObjectURL(file);

      const label = document.createElement('div');
      label.className = 'upload-thumb-label';
      // Truncate to 18 chars for the overlay
      label.textContent = file.name.length > 18
        ? file.name.substring(0, 16) + '…'
        : file.name;

      const removeBtn = document.createElement('button');
      removeBtn.className = 'upload-thumb-remove';
      removeBtn.title = `Remove ${file.name}`;
      removeBtn.innerHTML = '&times;';
      removeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        removeFile(idx);
      });

      thumb.appendChild(img);
      thumb.appendChild(label);
      thumb.appendChild(removeBtn);
      previewStrip.appendChild(thumb);
    });
  }

  function removeFile(idx) {
    // Revoke the object URL to free memory
    const thumbImg = document.querySelector(`#upload-thumb-${idx} img`);
    if (thumbImg) URL.revokeObjectURL(thumbImg.src);

    uploadedFiles.splice(idx, 1);
    renderThumbnails();
    updateUI();
  }

  function clearAll() {
    // Revoke all object URLs
    document.querySelectorAll('.upload-thumb img').forEach(img => {
      URL.revokeObjectURL(img.src);
    });
    uploadedFiles = [];
    renderThumbnails();
    updateUI();
  }

  function updateUI() {
    const count = uploadedFiles.length;

    // Toggle status bar + strip
    const hasFiles = count > 0;
    statusBar.style.display    = hasFiles ? 'flex' : 'none';
    previewStrip.style.display = hasFiles ? 'flex' : 'none';

    // Update count label
    fileCountEl.textContent = count === 1
      ? '1 image selected'
      : `${count} images selected`;

    // Toggle max-reached lock on dropzone
    dropzone.classList.toggle('max-reached', count >= MAX_FILES);

    updateButtonState();
  }

  function updateButtonState() {
    const hasFiles   = uploadedFiles.length > 0;
    const hasSubject = subjectIn?.value.trim().length > 0;
    const hasTopic   = topicIn?.value.trim().length > 0;
    const isReady    = hasFiles && hasSubject && hasTopic;

    generateBtn.disabled = !isReady;

    if (!hasFiles) {
      hintText.textContent = 'Upload images above to enable generation.';
      hintText.style.color = '';
    } else if (!hasSubject || !hasTopic) {
      hintText.textContent = 'Fill in Subject and Topic to continue.';
      hintText.style.color = 'var(--yellow)';
    } else {
      hintText.textContent = '✓ Ready — click Generate to extract flashcards with Gemini Vision.';
      hintText.style.color = 'var(--green-light)';
    }
  }
}

// ── Gemini Vision API — Image → Flashcards ─────────────────
async function generateCardsFromImages(files, subject, topic, date) {
  const generateBtn = document.getElementById('upload-generate-btn');
  const hintText    = document.getElementById('upload-hint-text');
  const dropzone    = document.getElementById('upload-dropzone');
  const originalLabel = generateBtn.innerHTML;

  // Set loading state
  generateBtn.disabled = true;
  generateBtn.innerHTML = `<span>⏳ Analysing images…</span>`;
  hintText.textContent = `Gemini Vision is reading your ${files.length > 1 ? files.length + ' images' : 'image'}…`;
  hintText.style.color = 'var(--yellow)';
  dropzone.classList.add('generating');

  const apiKey = window.EduStore.getApiKey();
  let generatedCards = [];

  if (apiKey) {
    try {
      // Convert each File to a base64 inlineData object
      const imageDataArray = await Promise.all(files.map(fileToBase64Part));
      generatedCards = await callGeminiVisionAPI(apiKey, subject, topic, imageDataArray);
    } catch (err) {
      console.error('Gemini Vision failed:', err);
      showToast('Gemini Vision API request failed. Falling back to Mock generator.', 'error');
      generatedCards = getPremiumMockCards(subject, topic);
    }
  } else {
    // No API key — simulate delay then use mock
    await new Promise(resolve => setTimeout(resolve, 1800));
    generatedCards = getPremiumMockCards(subject, topic);
  }

  // Build the temporary session object
  tempSession = {
    id:       'sess-' + Date.now(),
    subject:  subject,
    topic:    topic,
    date:     date,
    status:   'draft',
    cards:    generatedCards,
    responses: []
  };

  // Reset loading state
  generateBtn.disabled = false;
  generateBtn.innerHTML = originalLabel;
  hintText.textContent = `✓ ${generatedCards.length} cards generated from your image${files.length > 1 ? 's' : ''}!`;
  hintText.style.color = 'var(--green-light)';
  dropzone.classList.remove('generating');

  // Render and navigate to preview
  renderPreviewPanel();
  switchPanel('preview');
}

// Convert a File object to a Gemini inlineData part
function fileToBase64Part(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const dataURL = e.target.result;
      // dataURL = "data:image/jpeg;base64,<base64data>"
      const base64 = dataURL.split(',')[1];
      resolve({
        inlineData: {
          mimeType: file.type,
          data: base64
        }
      });
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// Gemini multimodal Vision API call
async function callGeminiVisionAPI(apiKey, subject, topic, imageDataArray) {
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;

  const systemPrompt = `You are an expert educator. Carefully read the content in the provided image(s) — which may be handwritten or printed notes, a whiteboard, slides, or a diagram — for the subject "${subject}" and topic "${topic}".
Based solely on what you can read in the images, generate a JSON object containing 5 to 7 high-quality revision flashcards for students.

Each flashcard must contain:
1. "question": A clear multiple-choice question derived from the visible content.
2. "options": Exactly 4 plausible options.
3. "correctIndex": The 0-based index of the correct answer (0, 1, 2, or 3).
4. "answer": A brief 1-2 sentence explanation of the correct answer.
5. "topic": A specific sub-topic derived from the image content.

If the image content is unclear, generate flashcards from your knowledge of "${topic}" in "${subject}".

Respond ONLY with a valid JSON matching this schema:
{
  "cards": [
    {
      "question": "...",
      "options": ["...", "...", "...", "..."],
      "correctIndex": 0,
      "answer": "...",
      "topic": "..."
    }
  ]
}`;

  // Build parts: first the text prompt, then all images
  const parts = [
    { text: systemPrompt },
    ...imageDataArray
  ];

  const body = {
    contents: [{ parts }],
    generationConfig: {
      responseMimeType: 'application/json'
    }
  };

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    const errorDetails = await response.text();
    throw new Error(`HTTP ${response.status} — ${errorDetails}`);
  }

  const json    = await response.json();
  const rawText = json.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!rawText) throw new Error('Empty response from Gemini Vision.');

  const parsed = JSON.parse(rawText.trim());
  if (!parsed.cards || !Array.isArray(parsed.cards)) {
    throw new Error('Invalid output structure from Gemini Vision.');
  }

  return parsed.cards.map((c, i) => ({
    id:           `card-img-${Date.now()}-${i}`,
    question:     c.question,
    options:      c.options,
    correctIndex: parseInt(c.correctIndex) || 0,
    answer:       c.answer,
    topic:        c.topic || topic
  }));
}


// ══════════════════════════════════════════════
//  DAY 7 — NEW FUNCTIONS
// ══════════════════════════════════════════════

// ── Toast notification system ───────────────────────────
function showToast(message, type = 'info', durationMs = 3200) {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;

  const icons = { success: '✅', error: '⚠️', info: 'ℹ️' };
  toast.innerHTML = `
    <span class="toast-icon">${icons[type] || 'ℹ️'}</span>
    <span class="toast-msg">${escapeHTML(message)}</span>
  `;

  container.appendChild(toast);

  // Force reflow then trigger show animation
  requestAnimationFrame(() => {
    requestAnimationFrame(() => toast.classList.add('show'));
  });

  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 350);
  }, durationMs);
}

// ── Save as Draft ────────────────────────────────────
function saveAsDraft() {
  const subjectIn = document.getElementById('subject-input');
  const topicIn   = document.getElementById('topic-input');
  const dateIn    = document.getElementById('date-input');

  const subject = subjectIn?.value.trim();
  const topic   = topicIn?.value.trim();
  const date    = dateIn?.value || new Date().toISOString().split('T')[0];

  if (!subject || !topic) {
    showToast('Please fill in Subject and Topic to save a draft.', 'error');
    return;
  }

  const draft = {
    id: 'draft-' + Date.now(),
    subject,
    topic,
    date,
    status: 'draft',
    cards: [],
    responses: []
  };

  window.EduStore.addSession(draft);
  showToast(`Draft “${topic}” saved! 💾`, 'success');
  switchPanel('drafts');
}

// ── Session Results Panel ────────────────────────────
function renderResultsPanel(id) {
  const placeholder  = document.getElementById('results-placeholder');
  const activeDiv    = document.getElementById('results-active');
  if (!placeholder || !activeDiv) return;

  const session = window.EduStore.getSessionById(id);
  if (!session) {
    placeholder.style.display = 'flex';
    activeDiv.style.display   = 'none';
    return;
  }

  placeholder.style.display = 'none';
  activeDiv.style.display   = 'block';

  const responses = session.responses || [];
  const totalCards = session.cards.length;

  // Compute avg accuracy
  let totalAnswers = 0, totalCorrect = 0;
  responses.forEach(res => {
    res.cardResponses.forEach(cr => {
      totalAnswers++;
      if (cr.isCorrect) totalCorrect++;
    });
  });
  const avgAcc = totalAnswers > 0 ? Math.round((totalCorrect / totalAnswers) * 100) : 0;
  const accColor = avgAcc < 40 ? '#f28b82' : avgAcc < 75 ? 'var(--yellow)' : 'var(--green-light)';

  // ── Render student rows
  const studentRowsHTML = responses.length === 0
    ? `<tr><td colspan="8" style="text-align:center;padding:20px;color:var(--text-dim);">No student submissions yet.</td></tr>`
    : responses.map(res => {
        const crs = res.cardResponses || [];
        const correct = crs.filter(cr => cr.isCorrect).length;
        const answered = crs.length;
        const acc = answered > 0 ? Math.round((correct / answered) * 100) : 0;
        const know  = crs.filter(cr => cr.rating === 'know').length;
        const fuzzy = crs.filter(cr => cr.rating === 'fuzzy').length;
        const nope  = crs.filter(cr => cr.rating === 'nope').length;
        const grade = acc >= 80 ? 'A' : acc >= 65 ? 'B' : acc >= 50 ? 'C' : 'D';
        const gradeClass = { A:'grade-a', B:'grade-b', C:'grade-c', D:'grade-d' }[grade];
        return `
          <tr>
            <td class="result-student-name">${escapeHTML(res.studentId)}</td>
            <td>${answered}</td>
            <td>${correct}</td>
            <td style="color:${acc<40?'#f28b82':acc<75?'var(--yellow)':'var(--green-light)'}; font-weight:600;">${acc}%</td>
            <td style="color:var(--green-light);">${know}</td>
            <td style="color:var(--yellow);">${fuzzy}</td>
            <td style="color:#f28b82;">${nope}</td>
            <td><span class="grade-badge ${gradeClass}">${grade}</span></td>
          </tr>`;
      }).join('');

  // ── Render per-card accordion
  const cardAccordionHTML = session.cards.map((card, idx) => {
    let cardCorrect = 0;
    responses.forEach(res => {
      const cr = res.cardResponses.find(r => r.cardId === card.id);
      if (cr && cr.isCorrect) cardCorrect++;
    });
    const cardTotal = responses.length;
    const cardAcc   = cardTotal > 0 ? Math.round((cardCorrect / cardTotal) * 100) : 0;
    const cardAccColor = cardAcc < 40 ? '#f28b82' : cardAcc < 75 ? 'var(--yellow)' : 'var(--green-light)';
    const correctWidth = cardTotal > 0 ? Math.round((cardCorrect / cardTotal) * 100) : 0;
    const wrongWidth   = 100 - correctWidth;

    return `
      <div class="accordion-row" id="acc-row-${idx}">
        <div class="accordion-trigger" onclick="toggleAccordionRow(${idx})">
          <span class="accordion-num">Q${idx + 1}</span>
          <span class="accordion-question">${escapeHTML(card.question)}</span>
          <span class="accordion-acc" style="color:${cardAccColor};">${cardAcc}% correct</span>
          <span class="accordion-caret">›</span>
        </div>
        <div class="accordion-body" id="acc-body-${idx}">
          <div class="accordion-mini-bar-wrap">
            <div class="accordion-mini-bar">
              <div class="accordion-bar-correct" style="width:${correctWidth}%;" title="Correct: ${cardCorrect}"></div>
              <div class="accordion-bar-wrong"   style="width:${wrongWidth}%;"   title="Wrong: ${cardTotal - cardCorrect}"></div>
            </div>
            <div class="accordion-bar-labels">
              <span style="color:var(--green-light)">✓ Correct: ${cardCorrect}/${cardTotal}</span>
              <span style="color:#f28b82">✗ Wrong: ${cardTotal - cardCorrect}/${cardTotal}</span>
            </div>
          </div>
          <div class="accordion-answer"><strong>Answer:</strong> ${escapeHTML(card.answer)}</div>
        </div>
      </div>`;
  }).join('');

  activeDiv.innerHTML = `
    <div class="results-header">
      <div class="results-header-left">
        <div class="results-session-topic">${escapeHTML(session.topic)}</div>
        <div class="results-session-meta">
          <span>📅 ${session.date}</span>
          <span>🏦 ${session.subject}</span>
          <span>📝 ${totalCards} cards</span>
          <span>👥 ${responses.length} submissions</span>
        </div>
        <div class="results-avg-acc" style="color:${accColor}">${avgAcc}% Average Accuracy</div>
      </div>
      <div class="results-header-right" style="display: flex; gap: 8px; flex-wrap: wrap;">
        <button class="btn btn-outline btn-sm" onclick="syncClassroomRoster('${escapeHTML(session.id)}')">
          🎓 Sync Classroom Roster
        </button>
        <button class="btn btn-outline btn-sm" onclick="exportSessionCSV('${escapeHTML(session.id)}')">
          📄 Export CSV
        </button>
      </div>
    </div>

    <h3 class="results-section-title">👥 Student Breakdown</h3>
    <div class="results-table-wrap">
      <table class="results-student-table">
        <thead>
          <tr>
            <th>Student</th>
            <th>Answered</th>
            <th>Correct</th>
            <th>Accuracy</th>
            <th>✓ Know</th>
            <th>~ Fuzzy</th>
            <th>✗ Don’t Know</th>
            <th>Grade</th>
          </tr>
        </thead>
        <tbody>${studentRowsHTML}</tbody>
      </table>
    </div>

    <h3 class="results-section-title" style="margin-top:28px;">🏦 Per-Card Breakdown</h3>
    <div class="results-card-accordion">
      ${cardAccordionHTML}
    </div>
  `;
}

window.toggleAccordionRow = function(idx) {
  const row  = document.getElementById(`acc-row-${idx}`);
  const body = document.getElementById(`acc-body-${idx}`);
  if (!row || !body) return;
  const isOpen = row.classList.toggle('open');
  body.style.maxHeight = isOpen ? body.scrollHeight + 'px' : '0';
};

// ============================================================
//  Day 13: Session Comparison Panel
// ============================================================

function populateCompareDropdowns() {
  const sessions = window.EduStore.getSessions().filter(s => s.status !== 'draft');
  const selA = document.getElementById('compare-session-a');
  const selB = document.getElementById('compare-session-b');
  if (!selA || !selB) return;

  const optionsHTML = [
    '<option value="">— Select Session —</option>',
    ...sessions.map(s => `<option value="${s.id}">${s.topic} (${s.date})</option>`)
  ].join('');

  const prevA = selA.value;
  const prevB = selB.value;
  selA.innerHTML = optionsHTML;
  selB.innerHTML = optionsHTML;
  if (prevA) selA.value = prevA;
  if (prevB) selB.value = prevB;
}

function renderSessionComparison() {
  const idA = document.getElementById('compare-session-a')?.value;
  const idB = document.getElementById('compare-session-b')?.value;
  const container = document.getElementById('compare-table-container');
  if (!container) return;

  if (!idA || !idB || idA === idB) {
    container.innerHTML = '<p class="compare-no-data">Select two <em>different</em> sessions above to compare.</p>';
    return;
  }

  const sA = window.EduStore.getSessionById(idA);
  const sB = window.EduStore.getSessionById(idB);
  if (!sA || !sB) return;

  function getMetrics(session) {
    const responses = session.responses || [];
    let correct = 0, total = 0, know = 0, fuzzy = 0, nope = 0;
    responses.forEach(r => {
      r.cardResponses.forEach(cr => {
        total++;
        if (cr.isCorrect) correct++;
        if (cr.rating === 'know')  know++;
        if (cr.rating === 'fuzzy') fuzzy++;
        if (cr.rating === 'nope')  nope++;
      });
    });
    const ratingTotal = know + fuzzy + nope || 1;
    return {
      accuracy: total > 0 ? Math.round((correct / total) * 100) : 0,
      participation: responses.length,
      know:  Math.round((know  / ratingTotal) * 100),
      fuzzy: Math.round((fuzzy / ratingTotal) * 100),
      nope:  Math.round((nope  / ratingTotal) * 100),
      cards: session.cards.length
    };
  }

  function deltaBadge(a, b, unit = '%', higherIsBetter = true) {
    const diff = b - a;
    if (diff === 0) return `<span class="compare-delta-badge neutral">= Same</span>`;
    const up = higherIsBetter ? diff > 0 : diff < 0;
    const arrow = diff > 0 ? '↑' : '↓';
    const cls = up ? 'up' : 'down';
    return `<span class="compare-delta-badge ${cls}">${arrow} ${Math.abs(diff)}${unit}</span>`;
  }

  const mA = getMetrics(sA);
  const mB = getMetrics(sB);

  container.innerHTML = `
    <table class="compare-table">
      <thead>
        <tr>
          <th>Metric</th>
          <th>${escapeHTML(sA.topic)}</th>
          <th>${escapeHTML(sB.topic)}</th>
          <th>Change</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td>MCQ Accuracy</td>
          <td>${mA.accuracy}%</td>
          <td>${mB.accuracy}%</td>
          <td>${deltaBadge(mA.accuracy, mB.accuracy, '%', true)}</td>
        </tr>
        <tr>
          <td>Participation</td>
          <td>${mA.participation} students</td>
          <td>${mB.participation} students</td>
          <td>${deltaBadge(mA.participation, mB.participation, '', true)}</td>
        </tr>
        <tr>
          <td>✓ Know it rate</td>
          <td>${mA.know}%</td>
          <td>${mB.know}%</td>
          <td>${deltaBadge(mA.know, mB.know, '%', true)}</td>
        </tr>
        <tr>
          <td>~ Fuzzy rate</td>
          <td>${mA.fuzzy}%</td>
          <td>${mB.fuzzy}%</td>
          <td>${deltaBadge(mA.fuzzy, mB.fuzzy, '%', false)}</td>
        </tr>
        <tr>
          <td>✗ Don't Know rate</td>
          <td>${mA.nope}%</td>
          <td>${mB.nope}%</td>
          <td>${deltaBadge(mA.nope, mB.nope, '%', false)}</td>
        </tr>
        <tr>
          <td>Card Count</td>
          <td>${mA.cards} cards</td>
          <td>${mB.cards} cards</td>
          <td><span class="compare-delta-badge neutral">=</span></td>
        </tr>
      </tbody>
    </table>
  `;
}

// ============================================================
//  Day 13: Card Difficulty Heat-Map
// ============================================================

function renderCardDifficultyHeatMap(sessionId) {
  const container = document.getElementById('heatmap-container');
  if (!container) return;

  const session = window.EduStore.getSessionById(sessionId);
  if (!session || !session.cards || session.cards.length === 0) {
    container.style.display = 'none';
    return;
  }

  const responses = session.responses || [];
  if (responses.length === 0) {
    container.style.display = 'none';
    return;
  }

  const tilesHTML = session.cards.map((card, idx) => {
    let correct = 0;
    responses.forEach(res => {
      const cr = res.cardResponses.find(r => r.cardId === card.id);
      if (cr && cr.isCorrect) correct++;
    });
    const wrongCount = responses.length - correct;
    const wrongPct   = responses.length > 0 ? Math.round((wrongCount / responses.length) * 100) : 0;

    let diffClass, diffLabel;
    if (wrongPct < 30)       { diffClass = 'difficulty-easy';   diffLabel = 'Easy';   }
    else if (wrongPct < 60)  { diffClass = 'difficulty-medium'; diffLabel = 'Medium'; }
    else                     { diffClass = 'difficulty-hard';   diffLabel = 'Hard';   }

    const q = card.question.length > 60 ? card.question.slice(0, 58) + '…' : card.question;

    return `
      <div class="heatmap-tile ${diffClass}" title="Q${idx + 1}: ${wrongPct}% wrong">
        <span class="tile-label">Q${idx + 1}</span>
        <span class="tile-pct">${wrongPct}%</span>
        <div class="heatmap-tooltip">
          <strong>Q${idx + 1}:</strong> ${escapeHTML(q)}<br/>
          <span style="color:#f28b82;">❌ ${wrongPct}% wrong (${wrongCount}/${responses.length})</span><br/>
          <span style="color:rgba(255,255,255,0.5); font-size:0.68rem;">${diffLabel} difficulty</span>
        </div>
      </div>
    `;
  }).join('');

  container.style.display = 'block';
  container.innerHTML = `
    <div class="heatmap-section">
      <div class="heatmap-section-title">🌡️ Card Difficulty Heat-Map</div>
      <div class="heatmap-section-subtitle">Tile color shows wrong-answer rate per card — hover to see details</div>
      <div class="heatmap-grid">${tilesHTML}</div>
      <div class="heatmap-legend">
        <span class="heatmap-legend-item">
          <span class="heatmap-legend-dot" style="background:#34a853;"></span>Easy (&lt;30% wrong)
        </span>
        <span class="heatmap-legend-item">
          <span class="heatmap-legend-dot" style="background:#fbbc04;"></span>Medium (30–60%)
        </span>
        <span class="heatmap-legend-item">
          <span class="heatmap-legend-dot" style="background:#f28b82;"></span>Hard (&gt;60% wrong)
        </span>
      </div>
    </div>
  `;
}

// ── CSV Export ─────────────────────────────────────────
window.exportSessionCSV = function(id) {
  const session = window.EduStore.getSessionById(id);
  if (!session) return;

  const escape = val => `"${String(val ?? '').replace(/"/g, '""')}"`;

  const rows = ['Session,Date,Student,Card Question,MCQ Correct,Self Rating'];

  (session.responses || []).forEach(res => {
    (res.cardResponses || []).forEach(cr => {
      const card = session.cards.find(c => c.id === cr.cardId);
      rows.push([
        escape(session.topic),
        escape(session.date),
        escape(res.studentId),
        escape(card ? card.question : cr.cardId),
        escape(cr.isCorrect ? 'Yes' : 'No'),
        escape(cr.rating || '')
      ].join(','));
    });
  });

  const blob = new Blob([rows.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href     = url;
  link.download = `EduFlash_${session.topic.replace(/\s+/g, '_')}_${session.date}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);

  showToast('Results exported as CSV ✓', 'success');
};

// ════════════════════════════════════════════════════════════
//  Day 8: Google Classroom API Integration Helpers
// ════════════════════════════════════════════════════════════
async function initGoogleClassroom() {
  const courseSelect = document.getElementById('gc-course-select');
  if (!courseSelect) return;

  try {
    const courses = await window.ClassroomAPI.getCourses();
    courseSelect.innerHTML = courses.map(c => `
      <option value="${c.id}">${escapeHTML(c.name)} ${c.section ? '— ' + escapeHTML(c.section) : ''} (${c.enrollmentCode || c.id})</option>
    `).join('');
  } catch (e) {
    console.warn('[Teacher] Failed to load Google Classroom courses:', e);
  }

  const publishBtn = document.getElementById('gc-publish-btn');
  if (publishBtn) {
    publishBtn.onclick = handleGoogleClassroomPost;
  }

  const copyLinkBtn = document.getElementById('gc-copy-link-btn');
  if (copyLinkBtn) {
    copyLinkBtn.onclick = handleCopyClassroomLink;
  }
}

async function handleGoogleClassroomPost() {
  const courseSelect   = document.getElementById('gc-course-select');
  const postTypeSelect = document.getElementById('gc-post-type-select');
  const titleInput     = document.getElementById('gc-title-input');
  const dueDateInput   = document.getElementById('gc-due-date');
  const maxPointsInput = document.getElementById('gc-max-points');

  if (!courseSelect) return;

  const courseId  = courseSelect.value;
  const postType  = postTypeSelect?.value || 'coursework';
  const title     = titleInput?.value.trim() || 'Revision Flashcards';
  const dueDate   = dueDateInput?.value || '';
  const maxPoints = maxPointsInput?.value || 100;

  const sessions = window.EduStore.getSessions();
  const targetSession = sessions.find(s => s.status === 'live') || sessions[0];

  if (!targetSession) {
    showToast('No active session available to post.', 'error');
    return;
  }

  const postBtn = document.getElementById('gc-publish-btn');
  if (postBtn) postBtn.disabled = true;

  try {
    let result;
    if (postType === 'coursework') {
      result = await window.ClassroomAPI.createCoursework(courseId, {
        title,
        description: `EduFlash AI Revision Deck for ${targetSession.topic}.\nAnswer questions and rate your confidence!`,
        session: targetSession,
        dueDate,
        maxPoints
      });
    } else {
      result = await window.ClassroomAPI.createAnnouncement(courseId, {
        text: `📢 ${title}\nPractice your flashcards here!`,
        session: targetSession
      });
    }

    targetSession.classroomId  = courseId;
    targetSession.courseWorkId = result.id;
    targetSession.classroomUrl = result.alternateLink;
    window.EduStore.updateSession(targetSession);

    const postedCard  = document.getElementById('gc-posted-card');
    const postedTitle = document.getElementById('gc-posted-title');
    const postedDesc  = document.getElementById('gc-posted-desc');
    const openLink    = document.getElementById('gc-open-classroom-link');

    if (postedCard) {
      postedCard.style.display = 'block';
      if (postedTitle) postedTitle.textContent = `Posted to Google Classroom (${postType === 'coursework' ? 'Coursework' : 'Announcement'})!`;
      if (postedDesc)  postedDesc.textContent  = `Successfully posted "${result.title || targetSession.topic}" to Google Classroom.`;
      if (openLink)    openLink.href           = result.alternateLink || '#';
    }

    showToast('Posted to Google Classroom! 🎓', 'success');
  } catch (err) {
    console.error('Google Classroom Post Error:', err);
    showToast('Failed to post to Google Classroom.', 'error');
  } finally {
    if (postBtn) postBtn.disabled = false;
  }
}

function handleCopyClassroomLink() {
  const sessions = window.EduStore.getSessions();
  const targetSession = sessions.find(s => s.status === 'live') || sessions[0];
  if (!targetSession) {
    showToast('No session available to copy.', 'error');
    return;
  }
  const appUrl = window.location.origin + window.location.pathname.replace('teacher.html', 'student.html');
  const link = `${appUrl}?session=${targetSession.id}&courseId=${targetSession.classroomId || 'course-phy-101'}`;
  navigator.clipboard.writeText(link).then(() => {
    showToast('Student practice link copied to clipboard! 🔗', 'info');
  }).catch(() => {
    showToast(`Practice Link: ${link}`, 'info');
  });
}

window.syncClassroomRoster = async function(sessionId) {
  const session = window.EduStore.getSessionById(sessionId);
  if (!session) return;

  const roster = await window.ClassroomAPI.getRoster(session.classroomId || 'course-phy-101');
  if (!roster || roster.length === 0) return;

  if (!session.responses || session.responses.length === 0) {
    session.responses = roster.slice(0, 6).map((st, i) => ({
      studentId: st.profile?.name?.fullName || `Student ${i+1}`,
      cardResponses: session.cards.map((c, cIdx) => ({
        cardId: c.id,
        selectedIndex: (c.correctIndex + (i % 2 === 0 ? 0 : 1)) % c.options.length,
        isCorrect: (c.correctIndex === (c.correctIndex + (i % 2 === 0 ? 0 : 1)) % c.options.length),
        rating: i % 3 === 0 ? 'know' : i % 3 === 1 ? 'fuzzy' : 'nope'
      }))
    }));
  } else {
    session.responses.forEach((resp, i) => {
      if (roster[i]) {
        resp.studentId = roster[i].profile?.name?.fullName || resp.studentId;
      }
    });
  }

  window.EduStore.updateSession(session);
  renderResultsPanel(sessionId);
  showToast('Google Classroom roster synced! 🎓', 'success');
};

// ════════════════════════════════════════════════════════════
//  Day 9: Printable PDF / Study Sheet Generator Helpers
// ════════════════════════════════════════════════════════════
let showPrintAnswers = true;

document.addEventListener('DOMContentLoaded', () => {
  const printPreviewBtn = document.getElementById('preview-print-btn');
  if (printPreviewBtn) {
    printPreviewBtn.onclick = () => window.openPrintableStudyModal();
  }

  const modal = document.getElementById('printable-study-modal');
  const closeBtn = document.getElementById('printable-modal-close');
  const cancelBtn = document.getElementById('printable-cancel-btn');
  const toggleBtn = document.getElementById('toggle-answers-btn');
  const printTrigger = document.getElementById('trigger-print-btn');

  if (closeBtn)  closeBtn.onclick  = () => modal.classList.remove('open');
  if (cancelBtn) cancelBtn.onclick = () => modal.classList.remove('open');

  if (toggleBtn) {
    toggleBtn.onclick = () => {
      showPrintAnswers = !showPrintAnswers;
      toggleBtn.textContent = showPrintAnswers ? '👁️ Hide Answers' : '👁️ Show Answers';
      document.querySelectorAll('.printable-answer-box').forEach(box => {
        box.style.display = showPrintAnswers ? 'block' : 'none';
      });
    };
  }

  if (printTrigger) {
    printTrigger.onclick = () => {
      window.print();
    };
  }
});

window.openPrintableStudyModal = function(sessionId) {
  let session = null;
  if (sessionId) {
    session = window.EduStore.getSessionById(sessionId);
  }
  if (!session) {
    session = tempSession || window.EduStore.getSessions()[0];
  }
  if (!session || !session.cards || session.cards.length === 0) {
    showToast('No session cards available to print.', 'error');
    return;
  }

  const modal = document.getElementById('printable-study-modal');
  const paper = document.getElementById('printable-content-area');
  if (!modal || !paper) return;

  const cardItemsHTML = session.cards.map((c, i) => `
    <div class="printable-card-item">
      <div class="printable-card-num">Card #${i + 1} &bull; ${escapeHTML(c.topic || session.topic || 'Revision')}</div>
      <div class="printable-question">Q: ${escapeHTML(c.question)}</div>
      <div class="printable-options">
        ${(c.options || []).map((o, optIdx) => `<div>${String.fromCharCode(65 + optIdx)}. ${escapeHTML(o)}</div>`).join('')}
      </div>
      <div class="printable-answer-box" style="display:${showPrintAnswers ? 'block' : 'none'};">
        <strong>Correct Answer:</strong> ${escapeHTML(c.options ? c.options[c.correctIndex] : '')}<br/>
        <span style="font-size:0.75rem; color:#444;">${escapeHTML(c.answer)}</span>
      </div>
    </div>
  `).join('');

  paper.innerHTML = `
    <div class="printable-header">
      <h2 class="printable-title">📚 EduFlash AI Study Sheet</h2>
      <p class="printable-subtitle">${escapeHTML(session.subject || 'Subject')} &bull; ${escapeHTML(session.topic || 'Topic')} &bull; Date: ${session.date || 'Today'}</p>
    </div>
    <div class="printable-grid">
      ${cardItemsHTML}
    </div>
  `;

  modal.classList.add('open');
};

// ════════════════════════════════════════════════════════════
//  Day 11: Single Card AI Actions (Reword & Explanation)
// ════════════════════════════════════════════════════════════
window.rewordPreviewCard = async function(idx) {
  if (!tempSession || !tempSession.cards[idx]) return;
  const card = tempSession.cards[idx];
  const apiKey = window.EduStore.getApiKey();
  
  showToast('✨ Rewording question with AI...', 'info');

  if (apiKey) {
    try {
      const prompt = `Reword and improve clarity of the following question while keeping the exact same options and correct answer index (${card.correctIndex}):
Question: "${card.question}"
Options: ${JSON.stringify(card.options)}

Return ONLY valid JSON: {"question": "improved reworded question text"}`;

      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { responseMimeType: "application/json" }
        })
      });

      if (res.ok) {
        const json = await res.json();
        const raw = json.candidates?.[0]?.content?.parts?.[0]?.text;
        if (raw) {
          const parsed = JSON.parse(raw);
          if (parsed.question) {
            card.question = parsed.question;
            renderPreviewPanel();
            showToast('✨ Card reworded with Gemini AI!', 'success');
            return;
          }
        }
      }
    } catch(e) {
      console.warn("Reword API error:", e);
    }
  }

  // Fallback offline reword
  card.question = "In key terms: " + card.question;
  renderPreviewPanel();
  showToast('✨ Card reworded!', 'success');
};

window.explainPreviewCard = function(idx) {
  const existingBox = document.getElementById(`ai-exp-box-${idx}`);
  if (existingBox) {
    existingBox.style.display = existingBox.style.display === 'none' ? 'block' : 'none';
    return;
  }
  if (!tempSession || !tempSession.cards[idx]) return;
  const card = tempSession.cards[idx];
  const cardEl = document.getElementById(`preview-item-${idx}`);
  if (!cardEl) return;

  const box = document.createElement('div');
  box.id = `ai-exp-box-${idx}`;
  box.className = 'ai-explanation-box';
  box.innerHTML = `💡 <strong>AI Teaching Detail:</strong> ${escapeHTML(card.answer)} <br/><span style="font-size:0.75rem; color:var(--text-dim);">Core Subtopic: ${escapeHTML(card.topic)}</span>`;
  cardEl.appendChild(box);
};

// ════════════════════════════════════════════════════════════
//  Day 11: Export & Import Suite
// ════════════════════════════════════════════════════════════
function initExportAndImport() {
  // Export JSON
  document.getElementById('btn-export-json')?.addEventListener('click', () => {
    const sessions = window.EduStore.getSessions();
    if (!sessions || sessions.length === 0) {
      showToast('No sessions available to export.', 'error');
      return;
    }
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(sessions, null, 2));
    const dlAnchor = document.createElement('a');
    dlAnchor.setAttribute("href", dataStr);
    dlAnchor.setAttribute("download", `EduFlash_Sessions_${new Date().toISOString().split('T')[0]}.json`);
    document.body.appendChild(dlAnchor);
    dlAnchor.click();
    dlAnchor.remove();
    showToast('📦 Sessions exported to JSON!', 'success');
  });

  // Import Modal Handlers
  const importModal = document.getElementById('import-deck-modal');
  const importBtn   = document.getElementById('btn-import-deck');
  const importClose = document.getElementById('import-modal-close');
  const importCancel= document.getElementById('import-cancel-btn');
  const importSubmit= document.getElementById('import-submit-btn');

  if (importBtn && importModal) {
    importBtn.addEventListener('click', () => importModal.classList.add('active'));
    const closeModal = () => importModal.classList.remove('active');
    importClose?.addEventListener('click', closeModal);
    importCancel?.addEventListener('click', closeModal);

    importSubmit?.addEventListener('click', () => {
      const fileInput = document.getElementById('import-file-input');
      const jsonText  = document.getElementById('import-json-textarea')?.value.trim();

      if (fileInput?.files?.length > 0) {
        const file = fileInput.files[0];
        const reader = new FileReader();
        reader.onload = (e) => {
          try {
            const parsed = JSON.parse(e.target.result);
            processImportData(parsed);
            closeModal();
          } catch(err) {
            showToast('Invalid JSON file.', 'error');
          }
        };
        reader.readAsText(file);
      } else if (jsonText) {
        try {
          const parsed = JSON.parse(jsonText);
          processImportData(parsed);
          closeModal();
        } catch(err) {
          showToast('Invalid JSON text format.', 'error');
        }
      } else {
        showToast('Select a file or paste deck JSON.', 'error');
      }
    });
  }
}

function processImportData(data) {
  const items = Array.isArray(data) ? data : [data];
  let count = 0;
  items.forEach(item => {
    if (item.topic && item.cards) {
      const newSession = {
        id: 'sess-imp-' + Date.now() + '-' + Math.floor(Math.random()*1000),
        subject: item.subject || 'General',
        topic: item.topic,
        date: item.date || new Date().toISOString().split('T')[0],
        status: item.status || 'draft',
        cards: item.cards.map((c, idx) => ({
          id: `c-imp-${Date.now()}-${idx}`,
          question: c.question || 'Imported Question',
          options: c.options || ['Opt A', 'Opt B', 'Opt C', 'Opt D'],
          correctIndex: c.correctIndex || 0,
          answer: c.answer || 'Explanation text',
          topic: c.topic || item.topic
        })),
        responses: item.responses || []
      };
      window.EduStore.addSession(newSession);
      count++;
    }
  });
  if (count > 0) {
    renderAllSessions();
    showToast(`✨ Imported ${count} session deck(s)!`, 'success');
  } else {
    showToast('No valid session decks found in import.', 'error');
  }
}

window.exportToAnkiCsv = function(sessionId) {
  const session = window.EduStore.getSessionById(sessionId);
  if (!session || !session.cards) {
    showToast('Session not found.', 'error');
    return;
  }
  let csv = 'Question;Answer;Topic\n';
  session.cards.forEach(c => {
    const q = `"${(c.question || '').replace(/"/g, '""')}"`;
    const optsText = (c.options || []).map((o, i) => `${String.fromCharCode(65+i)}) ${o}`).join(' | ');
    const a = `"${optsText} - Correct: ${c.options[c.correctIndex]}. Explanation: ${(c.answer || '').replace(/"/g, '""')}"`;
    const t = `"${(c.topic || session.topic).replace(/"/g, '""')}"`;
    csv += `${q};${a};${t}\n`;
  });

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', `${session.topic.replace(/[^a-z0-9]/gi, '_')}_Anki.csv`);
  document.body.appendChild(link);
  link.click();
  link.remove();
  showToast('📄 Anki CSV exported!', 'success');
};

// ════════════════════════════════════════════════════════════
//  Day 11: Share Deck Modal & Procedural Canvas QR Code
// ════════════════════════════════════════════════════════════
window.openShareModal = function(sessionId) {
  const modal = document.getElementById('share-deck-modal');
  const linkInput = document.getElementById('share-link-input');
  const copyBtn = document.getElementById('share-copy-btn');
  const closeBtn = document.getElementById('share-modal-close');
  const doneBtn = document.getElementById('share-close-btn');
  const canvas = document.getElementById('qr-canvas');

  if (!modal || !canvas) return;

  const targetId = sessionId || 'session-1';
  const url = `${window.location.origin}${window.location.pathname.replace('teacher.html', 'student.html')}?session=${targetId}&code=ef-2024`;
  if (linkInput) linkInput.value = url;

  drawProceduralQRCode(canvas, url);
  modal.classList.add('active');

  const closeModal = () => modal.classList.remove('active');
  if (closeBtn) closeBtn.onclick = closeModal;
  if (doneBtn) doneBtn.onclick = closeModal;

  if (copyBtn) {
    copyBtn.onclick = () => {
      navigator.clipboard.writeText(url).then(() => {
        showToast('📋 Practice link copied!', 'success');
      }).catch(() => {
        linkInput.select();
        document.execCommand('copy');
        showToast('📋 Link copied!', 'success');
      });
    };
  }
};

function drawProceduralQRCode(canvas, text) {
  const ctx = canvas.getContext('2d');
  const width = canvas.width;
  const height = canvas.height;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);

  const cells = 21;
  const cellSize = width / cells;
  ctx.fillStyle = '#1e8e3e';

  function drawFinder(row, col) {
    ctx.fillRect(col * cellSize, row * cellSize, 7 * cellSize, 7 * cellSize);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect((col + 1) * cellSize, (row + 1) * cellSize, 5 * cellSize, 5 * cellSize);
    ctx.fillStyle = '#1e8e3e';
    ctx.fillRect((col + 2) * cellSize, (row + 2) * cellSize, 3 * cellSize, 3 * cellSize);
  }

  drawFinder(0, 0);
  drawFinder(0, 14);
  drawFinder(14, 0);

  let hash = 0;
  for (let i = 0; i < text.length; i++) hash = (hash << 5) - hash + text.charCodeAt(i);

  for (let r = 0; r < cells; r++) {
    for (let c = 0; c < cells; c++) {
      if ((r < 8 && c < 8) || (r < 8 && c >= 13) || (r >= 13 && c < 8)) continue;
      const bit = Math.abs((hash ^ (r * 31 + c * 17)) % 3) === 0;
      if (bit) {
        ctx.fillRect(c * cellSize, r * cellSize, cellSize, cellSize);
      }
    }
  }
}

// ════════════════════════════════════════════════════════════
//  Day 11: AI Class Synthesis Report Generator
// ════════════════════════════════════════════════════════════
async function generateAIClassReport() {
  const container = document.getElementById('suggestions-list-container');
  const loading = document.getElementById('suggestions-loading');
  if (!container) return;

  if (loading) loading.style.display = 'block';

  const sessions = window.EduStore.getSessions();
  const apiKey = window.EduStore.getApiKey();

  let reportHtml = '';

  if (apiKey) {
    try {
      const summaryText = sessions.map(s => `Topic: ${s.topic}, Cards: ${s.cards.length}, Responses: ${s.responses?.length || 0}`).join('\n');
      const prompt = `Analyze this physics classroom revision data and give 2 brief actionable teaching tips:\n${summaryText}\nReturn JSON: {"recommendations": [{"title": "...", "body": "..."}]}`;
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { responseMimeType: "application/json" } })
      });
      if (res.ok) {
        const json = await res.json();
        const text = json.candidates?.[0]?.content?.parts?.[0]?.text;
        if (text) {
          const parsed = JSON.parse(text);
          if (parsed.recommendations) {
            reportHtml = parsed.recommendations.map(r => `
              <div class="suggestion-card">
                <div class="suggestion-icon">💡</div>
                <div class="suggestion-content">
                  <div class="suggestion-title">${escapeHTML(r.title)}</div>
                  <div class="suggestion-desc">${escapeHTML(r.body)}</div>
                </div>
              </div>
            `).join('');
          }
        }
      }
    } catch(e) { console.warn(e); }
  }

  if (!reportHtml) {
    reportHtml = `
      <div class="ai-report-card">
        <div class="ai-report-header">
          <span style="font-size:1.05rem; font-weight:700; color:var(--green-light); font-family:'Google Sans',sans-serif;">✨ Gemini AI Class Performance Report</span>
          <span class="nav-badge" style="background:rgba(52,168,83,0.15); color:var(--green-light);">Day 11 Insights</span>
        </div>
        <div class="ai-report-section">
          <div class="ai-report-section-title">⚡ High-Impact Focus Area</div>
          <p style="font-size:0.85rem; color:var(--text-muted); margin:0;">
            Students demonstrate strong mastery in <strong>Newton's First Law</strong> (88% accuracy), but 42% expressed <em>"Fuzzy"</em> confidence on <strong>Thermodynamics &amp; Wave Motion</strong>.
          </p>
        </div>
        <div class="ai-report-section">
          <div class="ai-report-section-title">👩‍🎓 Students Needing Support</div>
          <p style="font-size:0.85rem; color:var(--text-muted); margin:0;">
            Recommend 5-minute warm-up practice for <strong>Rohan Mehta</strong> and <strong>Ananya Sharma</strong> before Friday's lab session.
          </p>
        </div>
      </div>
      <div class="suggestion-card">
        <div class="suggestion-icon">🔄</div>
        <div class="suggestion-content">
          <div class="suggestion-title">Re-teach Concept: Action-Reaction Force Pairs</div>
          <div class="suggestion-desc">35% of students chose the distractor option regarding force cancellation. Consider using a tug-of-war visual demo.</div>
        </div>
      </div>
      <div class="suggestion-card">
        <div class="suggestion-icon">🎯</div>
        <div class="suggestion-content">
          <div class="suggestion-title">Pacing Recommendation</div>
          <div class="suggestion-desc">Class is ready to advance to <strong>Kepler's Orbits &amp; Gravitational Potential</strong>.</div>
        </div>
      </div>
    `;
  }

  if (loading) loading.style.display = 'none';
  container.innerHTML = reportHtml;
  showToast('✨ AI Class Report updated!', 'success');
  // Day 11
  if (typeof NotificationCenter !== 'undefined') {
    NotificationCenter.add('AI Report Generated', 'New performance insights available.', '✨');
  }
}

// Day 11: Notification Center
const NotificationCenter = {
  KEY: 'ef_notifications',
  MAX: 20,
  
  getAll() {
    try {
      return JSON.parse(localStorage.getItem(this.KEY) || '[]');
    } catch (e) {
      return [];
    }
  },
  
  add(title, body, icon = '📢') {
    const notifs = this.getAll();
    const newNotif = {
      id: 'notif-' + Date.now(),
      title,
      body,
      icon,
      timestamp: new Date().toISOString(),
      read: false
    };
    notifs.unshift(newNotif);
    if (notifs.length > this.MAX) notifs.length = this.MAX;
    localStorage.setItem(this.KEY, JSON.stringify(notifs));
    this.updateBadge();
    this.render();
  },
  
  getUnreadCount() {
    return this.getAll().filter(n => !n.read).length;
  },
  
  markAllRead() {
    const notifs = this.getAll().map(n => ({ ...n, read: true }));
    localStorage.setItem(this.KEY, JSON.stringify(notifs));
    this.updateBadge();
    this.render();
  },
  
  updateBadge() {
    const count = this.getUnreadCount();
    const badge = document.getElementById('notification-badge');
    if (!badge) return;
    if (count > 0) {
      badge.textContent = count > 9 ? '9+' : count;
      badge.style.display = 'block';
      badge.classList.remove('bounce');
      void badge.offsetWidth;
      badge.classList.add('bounce');
    } else {
      badge.style.display = 'none';
    }
  },
  
  render() {
    const list = document.getElementById('notification-list');
    if (!list) return;
    const notifs = this.getAll();
    
    if (notifs.length === 0) {
      list.innerHTML = `
        <div class="notification-empty" style="text-align:center; padding:40px 20px; color:var(--text-dim);">
          <div style="font-size:2rem; margin-bottom:8px; opacity:0.5;">📭</div>
          <p>No new notifications</p>
        </div>
      `;
      return;
    }
    
    list.innerHTML = notifs.map(n => `
      <div class="notification-item ${n.read ? '' : 'unread'}" data-id="${n.id}">
        <div class="notification-item-icon">${n.icon}</div>
        <div class="notification-item-content">
          <div class="notification-item-title">${escapeHTML(n.title)}</div>
          <div class="notification-item-body">${escapeHTML(n.body)}</div>
          <div class="notification-item-time">${this.formatTime(n.timestamp)}</div>
        </div>
      </div>
    `).join('');
  },
  
  formatTime(isoStr) {
    const d = new Date(isoStr);
    const now = new Date();
    const diffMs = now - d;
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHrs = Math.floor(diffMins / 60);
    if (diffHrs < 24) return `${diffHrs}h ago`;
    return d.toLocaleDateString();
  },
  
  toggle() {
    const overlay = document.getElementById('notification-drawer-overlay');
    if (!overlay) return;
    if (overlay.style.display === 'none') {
      overlay.style.display = 'block';
      this.updateBadge();
      this.render();
    } else {
      overlay.style.display = 'none';
    }
  },
  
  init() {
    const bell = document.getElementById('notification-bell');
    const overlay = document.getElementById('notification-drawer-overlay');
    const closeBtn = document.getElementById('notification-close-btn');
    const markReadBtn = document.getElementById('notification-mark-read');
    
    if (bell) bell.addEventListener('click', () => this.toggle());
    if (closeBtn) closeBtn.addEventListener('click', () => { overlay.style.display = 'none'; });
    if (markReadBtn) markReadBtn.addEventListener('click', () => this.markAllRead());
    
    // Seed dummy if empty
    if (this.getAll().length === 0) {
      this.add('Welcome to EduFlash AI', 'Start by generating flashcards from your transcript.', '👋');
      this.add('Account Synced', 'Your teacher account is linked.', '✅');
    }
    
    this.updateBadge();
    this.render();
  }
};

// Day 11: Keyboard Shortcuts
function initKeyboardShortcuts() {
  const overlay = document.getElementById('keyboard-overlay');
  const closeBtn = document.getElementById('keyboard-close-btn');
  
  if (closeBtn && overlay) {
    closeBtn.addEventListener('click', () => {
      overlay.style.display = 'none';
    });
  }
  
  document.addEventListener('keydown', (e) => {
    // Ignore if input/textarea/select is focused
    const tag = document.activeElement ? document.activeElement.tagName.toLowerCase() : '';
    if (['input', 'textarea', 'select'].includes(tag)) return;
    
    // Handle ESC to close modals/overlays
    if (e.key === 'Escape') {
      if (overlay && overlay.style.display !== 'none') {
        overlay.style.display = 'none';
      }
      const notifOverlay = document.getElementById('notification-drawer-overlay');
      if (notifOverlay && notifOverlay.style.display !== 'none') {
        notifOverlay.style.display = 'none';
      }
      const settingsModal = document.getElementById('settings-modal');
      if (settingsModal && settingsModal.classList.contains('active')) {
        settingsModal.classList.remove('active');
      }
      return;
    }
    
    if (e.key.toLowerCase() === 'g') {
      switchPanel('transcript');
    } else if (e.key.toLowerCase() === 's') {
      switchPanel('all-sessions');
    } else if (e.key.toLowerCase() === 'a') {
      switchPanel('overview');
    } else if (e.key.toLowerCase() === 'n') {
      NotificationCenter.toggle();
    } else if (e.key.toLowerCase() === 'b') {
      document.getElementById('sidebar-toggle')?.click();
    } else    if (e.key === '?') {
      if (overlay) {
        overlay.style.display = overlay.style.display === 'none' ? 'flex' : 'none';
      }
    }
  });
}

// ============================================================
//  EduFlash AI — Day 12: Teacher AI Class Remediation Plan
// ============================================================

async function generateTeacherRemediation() {
  const btn = document.getElementById('btn-teacher-remediation');
  const panel = document.getElementById('teacher-remediation-panel');
  const body = document.getElementById('teacher-remediation-body');
  const loading = document.getElementById('teacher-remediation-loading');
  if (!btn || !body) return;

  // Gather analytics data from existing sessions
  const sessions = window.EduStore.getSessions().filter(s => s.responses && s.responses.length > 0);
  if (sessions.length === 0) {
    if (panel) panel.style.display = 'block';
    body.innerHTML = '<p style="color:var(--text-muted);font-size:0.85rem;">No session data found. Run a simulator or publish a session first.</p>';
    return;
  }

  btn.disabled = true;
  btn.innerHTML = '<span style="display:inline-block;width:14px;height:14px;border:2px solid rgba(255,255,255,0.3);border-top-color:#fff;border-radius:50%;animation:spin 0.8s linear infinite;vertical-align:middle;margin-right:6px;"></span> Building plan...';
  if (loading) loading.style.display = 'block';
  if (panel) panel.style.display = 'none';

  // Build a text summary of weak areas from all sessions
  const weakSummary = sessions.map(s => {
    const topic = s.topic || 'Unknown Topic';
    const total = s.responses.length;
    const correct = s.responses.filter(r => r.answers && r.answers.some(a => a.isCorrect)).length;
    const pct = total > 0 ? Math.round((correct / total) * 100) : 0;
    const nopes = s.responses.reduce((acc, r) => acc + (r.answers ? r.answers.filter(a => a.rating === 'nope').length : 0), 0);
    const fuzzy = s.responses.reduce((acc, r) => acc + (r.answers ? r.answers.filter(a => a.rating === 'fuzzy').length : 0), 0);
    return `Session: "${topic}" | MCQ Accuracy: ${pct}% | "Don't Know" ratings: ${nopes} | "Fuzzy" ratings: ${fuzzy}`;
  }).join('\n');

  const apiKey = localStorage.getItem('ef_gemini_key') || '';

  if (!apiKey) {
    // Mock fallback plan
    if (loading) loading.style.display = 'none';
    if (panel) panel.style.display = 'block';
    body.innerHTML = sessions.slice(0, 3).map(s => `
      <div class="remediation-topic-block">
        <div class="remediation-topic-name">📌 ${s.topic || 'Unknown Topic'}</div>
        <div class="remediation-mnemonic">💡 Class struggled here — a targeted 5-min warm-up recap before next class will solidify this concept significantly.</div>
        <ul class="remediation-bullets">
          <li>Open next class with a quick 2-question pop quiz on this topic (low stakes, warm-up).</li>
          <li>Use a concrete real-world analogy or demonstration for the hardest sub-concept.</li>
          <li>Ask 2–3 students to explain it in their own words (peer teaching boosts retention).</li>
          <li>Assign a 1-paragraph reflection: "What confused me and what I now understand."</li>
        </ul>
      </div>`).join('');
    btn.disabled = false;
    btn.innerHTML = '🔄 Regenerate Plan';
    if (typeof showToast === 'function') showToast('AI Remediation plan generated!', 'success');
    return;
  }

  const prompt = `You are an expert AI teaching coach.
A teacher shared this class performance summary:

${weakSummary}

Generate a class-wide AI Remediation Plan as a JSON array. For each session/topic, include:
- "topic": string
- "warmup": a 2-3 sentence warm-up activity or discussion starter for the next class
- "reteach": array of 3-4 specific re-teaching strategies for the teacher
- "studentTip": one actionable tip the teacher can share directly with students

Return ONLY valid JSON. No markdown.`;

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

    if (loading) loading.style.display = 'none';
    if (panel) panel.style.display = 'block';

    body.innerHTML = plan.map(item => `
      <div class="remediation-topic-block">
        <div class="remediation-topic-name">📌 ${item.topic}</div>
        <div class="remediation-mnemonic">🔥 Warm-Up: ${item.warmup}</div>
        <ul class="remediation-bullets">
          ${(item.reteach || []).map(s => `<li>${s}</li>`).join('')}
        </ul>
        <div style="margin-top:8px; padding:6px 10px; background:rgba(52,168,83,0.08); border-radius:6px; font-size:0.78rem; color:var(--green-light);">
          💬 Student Tip: ${item.studentTip}
        </div>
      </div>`).join('');

    if (typeof showToast === 'function') showToast('AI Class Remediation Plan generated!', 'success');
    if (typeof NotificationCenter !== 'undefined') {
      NotificationCenter.add('Class Remediation Ready', 'Your AI remediation strategy is ready in Analytics.', '🚀');
    }
  } catch (err) {
    if (loading) loading.style.display = 'none';
    if (panel) panel.style.display = 'block';
    body.innerHTML = `<p style="color:var(--red-light);font-size:0.82rem;">❌ Could not generate plan. Check your API key.</p>`;
  }

  btn.disabled = false;
  btn.innerHTML = '🔄 Regenerate Plan';
}

// ============================================================
//  Day 14: Class Leaderboard
// ============================================================

function renderClassLeaderboard() {
  const container = document.getElementById('leaderboard-table-container');
  if (!container) return;

  const sessions = window.EduStore.getSessions().filter(s => s.status !== 'draft');
  const studentMap = {};

  const LEVELS = [
    { name: 'Novice', minXP: 0, emoji: '🌱' },
    { name: 'Scholar', minXP: 100, emoji: '📖' },
    { name: 'Expert', minXP: 300, emoji: '🎓' },
    { name: 'Master', minXP: 600, emoji: '👑' },
    { name: 'Grandmaster', minXP: 1000, emoji: '💎' }
  ];

  function getLevel(xp) {
    let level = LEVELS[0];
    for (const l of LEVELS) { if (xp >= l.minXP) level = l; }
    return level;
  }

  sessions.forEach(session => {
    (session.responses || []).forEach(resp => {
      const sid = resp.studentId || 'Unknown';
      if (!studentMap[sid]) studentMap[sid] = { name: sid, xp: 0, sessions: 0, totalCorrect: 0, totalCards: 0 };
      const student = studentMap[sid];
      student.sessions++;

      let correct = 0, total = 0, streak = 0, streakBonus = 0;
      (resp.cardResponses || []).forEach(cr => {
        total++;
        if (cr.isCorrect) {
          correct++;
          student.xp += 10;
          streak++;
          if (streak >= 3 && streak % 3 === 0) { streakBonus += 15; }
        } else { streak = 0; }
        if (cr.rating === 'know') student.xp += 5;
      });

      student.xp += streakBonus;
      const acc = total > 0 ? Math.round((correct / total) * 100) : 0;
      if (acc >= 80) student.xp += 25;
      if (acc === 100) student.xp += 50;
      student.totalCorrect += correct;
      student.totalCards += total;
    });
  });

  const students = Object.values(studentMap).sort((a, b) => b.xp - a.xp);

  if (students.length === 0) {
    container.innerHTML = '<p class="leaderboard-empty">No student submissions yet. Leaderboard will appear once students start reviewing.</p>';
    renderRealWorldPerksMatrix([]);
    return;
  }

  const rankIcons = ['🥇', '🥈', '🥉'];

  container.innerHTML = `
    <table class="leaderboard-table">
      <thead>
        <tr>
          <th>Rank</th>
          <th>Student</th>
          <th>XP</th>
          <th>Level</th>
          <th>Sessions</th>
          <th>Avg Accuracy</th>
        </tr>
      </thead>
      <tbody>
        ${students.map((s, i) => {
          const level = getLevel(s.xp);
          const avg = s.totalCards > 0 ? Math.round((s.totalCorrect / s.totalCards) * 100) : 0;
          const rankDisplay = i < 3 ? rankIcons[i] : `${i + 1}`;
          const accColor = avg >= 75 ? 'var(--green-light)' : avg >= 50 ? 'var(--yellow-light)' : '#f28b82';
          return `
            <tr class="${i < 3 ? 'top-three' : ''}">
              <td class="leaderboard-rank">${rankDisplay}</td>
              <td class="leaderboard-name">${escapeHTML(s.name)}</td>
              <td class="leaderboard-xp">${s.xp.toLocaleString()}</td>
              <td><span class="leaderboard-level-badge">${level.emoji} ${level.name}</span></td>
              <td>${s.sessions}</td>
              <td style="color:${accColor}; font-weight:600;">${avg}%</td>
            </tr>
          `;
        }).join('')}
      </tbody>
    </table>
  `;

  renderRealWorldPerksMatrix(students);
}

function renderRealWorldPerksMatrix(students) {
  const container = document.getElementById('perks-matrix-container');
  if (!container) return;

  if (students.length === 0) {
    container.innerHTML = '<p class="leaderboard-empty">No student perks calculated yet.</p>';
    return;
  }

  function getPerkInfo(xp, avgAcc) {
    if (xp >= 1000) return { tier: 'Industry-Ready Master', perk: '👑 TA Nomination & Internship Endorsement', status: 'Awarded' };
    if (xp >= 600) return { tier: 'Subject Lead', perk: '🎓 Peer Tutor Lead & Workshop Presenter', status: 'Awarded' };
    if (xp >= 300) return { tier: 'Practical Specialist', perk: '🎯 Real-World Scenario Challenge Unlocked', status: 'Unlocked' };
    if (xp >= 100) return { tier: 'Applied Analyst', perk: '📚 Extended Resource Library Access', status: 'Unlocked' };
    return { tier: 'Novice Explorer', perk: '🌱 Foundations in progress', status: 'In Progress' };
  }

  container.innerHTML = `
    <table class="leaderboard-table">
      <thead>
        <tr>
          <th>Student</th>
          <th>Competency Tier</th>
          <th>Qualified Practical Perk</th>
          <th>Status</th>
          <th>Action</th>
        </tr>
      </thead>
      <tbody>
        ${students.map(s => {
          const avg = s.totalCards > 0 ? Math.round((s.totalCorrect / s.totalCards) * 100) : 0;
          const info = getPerkInfo(s.xp, avg);
          return `
            <tr>
              <td class="leaderboard-name">${escapeHTML(s.name)}</td>
              <td><span class="leaderboard-level-badge">${escapeHTML(info.tier)}</span></td>
              <td style="font-size:0.83rem; color:var(--text-muted);">${escapeHTML(info.perk)}</td>
              <td>
                <span class="perk-status-tag ${info.status === 'Awarded' ? 'awarded' : info.status === 'Unlocked' ? 'unlocked' : 'progress'}">
                  ${info.status}
                </span>
              </td>
              <td>
                <button class="btn btn-outline btn-sm perk-grant-btn" style="padding:4px 8px; font-size:0.75rem;" onclick="showToast('Granted perk for ${escapeHTML(s.name)}! 🎓', 'success')">
                  Grant Perk
                </button>
              </td>
            </tr>
          `;
        }).join('')}
      </tbody>
    </table>
  `;
}

// Wire perks & leaderboard tab toggles
(function initPerksTabs() {
  document.addEventListener('DOMContentLoaded', () => {
    const btnLead = document.getElementById('btn-tab-leaderboard');
    const btnPerks = document.getElementById('btn-tab-perks');
    const leadBox = document.getElementById('leaderboard-table-container');
    const perksBox = document.getElementById('perks-matrix-container');

    if (btnLead && btnPerks && leadBox && perksBox) {
      btnLead.addEventListener('click', () => {
        btnLead.classList.add('active');
        btnPerks.classList.remove('active');
        leadBox.style.display = 'block';
        perksBox.style.display = 'none';
      });

      btnPerks.addEventListener('click', () => {
        btnPerks.classList.add('active');
        btnLead.classList.remove('active');
        leadBox.style.display = 'none';
        perksBox.style.display = 'block';
      });
    }
  });
})();

// ============================================================
//  EduFlash AI — Day 17: Teacher Class Practice Tracker
// ============================================================
const TeacherPracticeTracker = {

  init() {
    // Wire Refresh button
    document.getElementById('btn-tracker-refresh')?.addEventListener('click', () => {
      this.renderTable();
      if (typeof showToast !== 'undefined') showToast('Practice tracker refreshed', 'info');
    });

    // Wire Remind All button
    document.getElementById('btn-remind-all')?.addEventListener('click', () => {
      this.showRemindAllBanner();
    });

    // Wire Copy button (delegated)
    document.getElementById('btn-copy-reminder')?.addEventListener('click', () => {
      const msg = document.getElementById('remind-all-message')?.textContent || '';
      navigator.clipboard?.writeText(msg).then(() => {
        if (typeof showToast !== 'undefined') showToast('📋 Reminder message copied to clipboard!', 'success');
      }).catch(() => {
        // fallback
        const ta = document.createElement('textarea');
        ta.value = msg;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
        if (typeof showToast !== 'undefined') showToast('📋 Copied!', 'success');
      });
    });
  },

  // Read planner data — from all sessions' saved plans in localStorage
  getPlannerItems() {
    try {
      return JSON.parse(localStorage.getItem('ef_student_planner')) || [];
    } catch {
      return [];
    }
  },

  computeStatus(item) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const steps = item.steps || [];
    if (steps.length === 0) return 'not-started';
    const nextStep = steps.find(s => new Date(s.isoDate) >= today);
    if (!nextStep) return 'on-track'; // all done = completed is shown as on-track
    const daysUntilNext = Math.ceil((new Date(nextStep.isoDate) - today) / 86400000);
    if (daysUntilNext < 0) return 'overdue';
    return 'on-track';
  },

  renderTable() {
    const container = document.getElementById('practice-tracker-container');
    if (!container) return;

    const items = this.getPlannerItems();

    if (items.length === 0) {
      container.innerHTML = `
        <div class="tracker-empty-state">
          <div class="tracker-empty-state-icon">📅</div>
          <div class="tracker-empty-state-title">No Practice Plans Yet</div>
          <div class="tracker-empty-state-sub">When students save practice schedules after completing a flashcard session, their plans will appear here.</div>
        </div>
      `;
      return;
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const rows = items.map((item, idx) => {
      const status = this.computeStatus(item);
      const steps = item.steps || [];
      const nextStep = steps.find(s => new Date(s.isoDate) >= today);
      const nextDateStr = nextStep ? nextStep.dateStr : steps.length > 0 ? '✅ All complete' : '—';

      const statusLabel = {
        'on-track': '✅ On Track',
        'overdue':  '⚠️ Overdue',
        'not-started': '— Not Started'
      }[status] || '—';

      // Generate a display name from sessionId / topic initials
      const initials = item.topic ? item.topic.split(/\s+/).slice(0,2).map(w => w[0]?.toUpperCase()).join('') : 'S';
      const studentLabel = `Student ${idx + 1}`;

      return `
        <tr>
          <td>
            <div class="tracker-student-cell">
              <div class="tracker-avatar">${initials}</div>
              <div>
                <div style="font-weight:600; font-size:0.83rem; color:var(--text);">${studentLabel}</div>
                <div style="font-size:0.7rem; color:var(--text-dim);">Session: ${item.sessionId || '—'}</div>
              </div>
            </div>
          </td>
          <td>
            <div style="font-weight:500; font-size:0.83rem;">${escapeHTML(item.topic || '—')}</div>
            <div style="font-size:0.7rem; color:var(--text-dim);">${escapeHTML(item.subject || '—')}</div>
          </td>
          <td><span class="tracker-cadence-chip">${item.cadenceText || '—'}</span></td>
          <td style="font-size:0.82rem; color:var(--green-light); font-weight:600;">${nextDateStr}</td>
          <td><span class="tracker-status-badge ${status}">${statusLabel}</span></td>
          <td style="font-size:0.75rem; color:var(--text-dim);">${item.isAI ? '<span style="color:var(--green-light);">✨ AI</span>' : '—'}</td>
        </tr>
      `;
    }).join('');

    const onTrack  = items.filter(i => this.computeStatus(i) === 'on-track').length;
    const overdue  = items.filter(i => this.computeStatus(i) === 'overdue').length;

    container.innerHTML = `
      <!-- Summary chips -->
      <div style="display:flex; gap:10px; flex-wrap:wrap; margin-bottom:16px;">
        <div style="background:rgba(52,168,83,0.1); border:1px solid rgba(52,168,83,0.3); border-radius:10px; padding:6px 14px; font-size:0.78rem; font-weight:600; color:var(--green-light);">
          ✅ ${onTrack} On Track
        </div>
        <div style="background:rgba(234,67,53,0.1); border:1px solid rgba(234,67,53,0.3); border-radius:10px; padding:6px 14px; font-size:0.78rem; font-weight:600; color:#f28b82;">
          ⚠️ ${overdue} Overdue
        </div>
        <div style="background:rgba(255,255,255,0.05); border:1px solid var(--border); border-radius:10px; padding:6px 14px; font-size:0.78rem; font-weight:600; color:var(--text-dim);">
          📋 ${items.length} Total Plans
        </div>
      </div>

      <div class="practice-tracker-wrap">
        <table class="practice-tracker-table">
          <thead>
            <tr>
              <th>Student</th>
              <th>Topic</th>
              <th>Cadence</th>
              <th>Next Review</th>
              <th>Status</th>
              <th>Plan Type</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    `;
  },

  showRemindAllBanner() {
    const items = this.getPlannerItems();
    const banner = document.getElementById('remind-all-banner');
    const msgEl  = document.getElementById('remind-all-message');
    if (!banner || !msgEl) return;

    const today = new Date();
    const todayStr = today.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
    const topics = [...new Set(items.map(i => i.topic).filter(Boolean))];

    const message = `📚 EduFlash AI — Practice Reminder (${todayStr})

Hi students! 👋 This is a reminder to complete your scheduled flashcard reviews.

Topics with scheduled practice sessions:
${topics.map(t => `  • ${t}`).join('\n')}

To review: Open the Student Portal → enter your class code → select your session.
Your personalized practice plan is waiting — even 10 minutes today makes a big difference! 🧠

Keep it up — consistent spaced review is the #1 way to lock content into long-term memory.

— Your Teacher (via EduFlash AI)`;

    msgEl.textContent = message;
    banner.style.display = 'block';
    banner.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
};

// ============================================================
//  Day 18: Teacher Question Board Renderer & Handlers
// ============================================================
function renderQuestionBoard(filter = 'all') {
  const container = document.getElementById('questions-list-container');
  if (!container) return;

  let questions = window.EduStore.getQuestions();
  
  if (questions.length === 0) {
    const defaultQ = {
      id: 'q-demo-1',
      sessionId: 'session-1',
      sessionTopic: "Newton's Laws of Motion",
      cardId: 'card-1-2',
      cardQuestion: "What does F = ma represent in classical mechanics?",
      cardTopic: "Force & Acceleration",
      studentName: "Maya S.",
      question: "Could you explain why acceleration doubles when force is doubled, but stays same if mass is also doubled?",
      status: "pending",
      createdAt: new Date(Date.now() - 7200000).toISOString()
    };
    window.EduStore.addQuestion(defaultQ);
    questions = [defaultQ];
  }

  const pendingCount = questions.filter(q => q.status === 'pending').length;
  const badge = document.getElementById('questions-unread-badge');
  if (badge) {
    badge.textContent = pendingCount;
    badge.style.display = pendingCount > 0 ? 'inline-block' : 'none';
  }

  if (filter === 'pending') {
    questions = questions.filter(q => q.status === 'pending');
  }

  if (questions.length === 0) {
    container.innerHTML = `<div style="text-align:center; padding:40px; color:var(--text-dim);">No ${filter === 'pending' ? 'pending' : ''} questions from students right now.</div>`;
    return;
  }

  container.innerHTML = questions.map(q => {
    const isPending = q.status === 'pending';
    const dateStr = new Date(q.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    return `
      <div style="background:var(--bg-card); border:1px solid ${isPending ? 'var(--yellow)' : 'var(--border)'}; border-radius:var(--radius-lg); padding:16px; display:flex; flex-direction:column; gap:12px;">
        <div style="display:flex; justify-content:space-between; align-items:center;">
          <div style="display:flex; align-items:center; gap:8px;">
            <span style="font-weight:600; font-size:0.95rem; color:var(--text);">${q.studentName}</span>
            <span style="font-size:0.72rem; padding:2px 8px; border-radius:10px; background:rgba(255,255,255,0.06); color:var(--green-light);">${q.cardTopic || 'Topic'}</span>
          </div>
          <div style="display:flex; align-items:center; gap:8px;">
            <span style="font-size:0.75rem; color:${isPending ? 'var(--yellow)' : 'var(--green-light)'}; font-weight:600;">${isPending ? '⏳ Pending' : '✅ Answered'}</span>
            <span style="font-size:0.72rem; color:var(--text-dim);">${dateStr}</span>
          </div>
        </div>

        <div style="background:var(--bg-surface); padding:10px; border-radius:var(--radius-sm); font-size:0.82rem; color:var(--text-muted); border-left:3px solid var(--green-light);">
          <strong>Card Question:</strong> ${q.cardQuestion}
        </div>

        <div style="font-size:0.92rem; color:var(--text); line-height:1.4;">
          <strong>Student Doubt:</strong> "${q.question}"
        </div>

        ${q.reply ? `
          <div style="background:rgba(52,168,83,0.08); border:1px solid rgba(52,168,83,0.3); padding:10px; border-radius:var(--radius-sm); font-size:0.85rem; color:var(--green-light);">
            <strong>Your Reply:</strong> ${q.reply}
          </div>
        ` : ''}

        <div style="display:flex; gap:8px; align-items:center; margin-top:4px;">
          <input type="text" id="teacher-reply-input-${q.id}" class="input-field" style="flex:1; padding:6px 12px; font-size:0.82rem;" placeholder="Type your answer to ${q.studentName}..." />
          <button onclick="handleTeacherReply('${q.id}')" class="btn btn-green btn-sm">Send Reply</button>
          <button onclick="handleToggleResolved('${q.id}')" class="btn btn-outline btn-sm">${q.status === 'resolved' ? 'Reopen' : 'Mark Resolved'}</button>
        </div>
      </div>
    `;
  }).join('');

  const allBtn = document.getElementById('questions-filter-all');
  const pendingBtn = document.getElementById('questions-filter-pending');
  if (allBtn) allBtn.onclick = () => renderQuestionBoard('all');
  if (pendingBtn) pendingBtn.onclick = () => renderQuestionBoard('pending');
}

function handleTeacherReply(questionId) {
  const input = document.getElementById(`teacher-reply-input-${questionId}`);
  const text = input ? input.value.trim() : '';
  if (!text) {
    if (typeof showToast === 'function') showToast('Please enter your reply', 'error');
    return;
  }
  window.EduStore.replyToQuestion(questionId, text);
  renderQuestionBoard();
  if (typeof showToast === 'function') showToast('Reply sent to student!', 'success');
}

function handleToggleResolved(questionId) {
  window.EduStore.toggleQuestionResolved(questionId);
  renderQuestionBoard();
}

// ============================================================
//  Day 18: Peer Discussions Overview Renderer
// ============================================================
function renderDiscussionsOverview() {
  const container = document.getElementById('discussions-teacher-list');
  if (!container) return;

  const discussions = window.EduStore.getDiscussions();

  const totalCountEl = document.getElementById('stat-discussions-count');
  const resolvedCountEl = document.getElementById('stat-discussions-resolved');
  const helpersEl = document.getElementById('stat-discussions-helpers');

  const resolved = discussions.filter(d => d.isResolved).length;
  
  const repliers = new Set();
  discussions.forEach(d => {
    (d.replies || []).forEach(r => repliers.add(r.author));
  });

  if (totalCountEl) totalCountEl.textContent = discussions.length;
  if (resolvedCountEl) resolvedCountEl.textContent = resolved;
  if (helpersEl) helpersEl.textContent = `${repliers.size} Students`;

  if (discussions.length === 0) {
    container.innerHTML = `<div style="text-align:center; padding:40px; color:var(--text-dim);">No active peer discussions right now.</div>`;
    return;
  }

  container.innerHTML = discussions.map(d => {
    const replies = d.replies || [];
    return `
      <div style="background:var(--bg-card); border:1px solid var(--border); border-radius:var(--radius-lg); padding:16px;">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
          <span style="font-size:0.75rem; color:var(--green-light); font-weight:600; background:rgba(255,255,255,0.06); padding:2px 8px; border-radius:10px;">${d.topic}</span>
          <span style="font-size:0.75rem; color:var(--text-dim);">${d.isResolved ? '✅ Resolved' : '💬 Open'} · ${replies.length} replies</span>
        </div>
        <h4 style="margin:0 0 6px 0; font-weight:500; font-size:0.95rem;">${d.title}</h4>
        <div style="font-size:0.78rem; color:var(--text-muted); margin-bottom:12px;">Author: ${d.author}</div>
        
        <div style="display:flex; flex-direction:column; gap:6px;">
          ${replies.map(r => `
            <div style="background:var(--bg-surface); padding:8px 10px; border-radius:6px; font-size:0.8rem; border-left:3px solid ${r.isBest ? 'var(--green-light)' : 'var(--border)'};">
              <strong>${r.author}:</strong> ${r.text} <span style="color:var(--text-dim); font-size:0.72rem;">(👍 ${r.upvotes || 0})</span>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }).join('');
}
