// ============================================================
//  EduFlash AI — Teacher Dashboard JS
//  Day 3: Full logic including Gemini, Preview, Sessions, Analytics
//  Day 4: Upload Notes panel UI (Gemini vision API wired on Day 5)
// ============================================================

let tempSession = null; // Holds the currently generated but unpublished session

document.addEventListener('DOMContentLoaded', () => {
  initSidebar();
  initPanelTabs();
  initTranscriptForm();
  initApiKeySettings();
  initSimulator();
  initUploadPanel();
  renderAllSessions();
  renderAnalytics();
  
  // Wire up other static buttons
  document.getElementById('publish-view-sessions-btn')?.addEventListener('click', () => {
    switchPanel('all-sessions');
  });
  
  document.getElementById('btn-refresh-suggestions')?.addEventListener('click', generateAISuggestions);
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
  
  generateBtn.disabled = true;
  generateBtn.innerHTML = `<span>⏳ Generating cards...</span>`;
  
  const apiKey = window.EduStore.getApiKey();
  let generatedCards = [];
  
  if (apiKey) {
    try {
      generatedCards = await callGeminiAPI(apiKey, subject, topic, transcript);
    } catch (err) {
      console.error(err);
      alert('Gemini API request failed. Falling back to Mock generator to avoid blocking.\nError: ' + err.message);
      generatedCards = getPremiumMockCards(subject, topic);
    }
  } else {
    // Simulated delay for realistic feedback
    await new Promise(resolve => setTimeout(resolve, 1500));
    generatedCards = getPremiumMockCards(subject, topic);
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

// Direct Call to Gemini API
async function callGeminiAPI(apiKey, subject, topic, transcript) {
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;
  
  const systemPrompt = `You are an expert educator. Based on the following transcript for the subject "${subject}" and topic "${topic}", generate a JSON object containing an array of 5 to 7 high-quality revision flashcards for students.
Each flashcard must contain:
1. "question": A clear multiple-choice question testing comprehension of a concept from the transcript.
2. "options": Exactly 4 plausible multiple-choice options.
3. "correctIndex": The 0-based index of the correct option (0, 1, 2, or 3).
4. "answer": A brief explanation of the correct answer (1-2 sentences).
5. "topic": A sub-topic name (e.g. if the main topic is "Newton's Laws", a sub-topic could be "Inertia" or "Action-Reaction").

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

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    const errorDetails = await response.text();
    throw new Error(`HTTP ${response.status} - ${errorDetails}`);
  }

  const json = await response.json();
  const rawText = json.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!rawText) throw new Error("Empty response received from Gemini.");

  const parsed = JSON.parse(rawText.trim());
  if (!parsed.cards || !Array.isArray(parsed.cards)) {
    throw new Error("Invalid output structure from Gemini model.");
  }

  // Map generated cards to add unique IDs
  return parsed.cards.map((c, i) => ({
    id: `card-gen-${Date.now()}-${i}`,
    question: c.question,
    options: c.options,
    correctIndex: parseInt(c.correctIndex) || 0,
    answer: c.answer,
    topic: c.topic || topic
  }));
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
    `;
    container.appendChild(cardEl);
  });

  // Re-wire add/publish events to avoid duplicates
  document.getElementById('preview-add-btn').onclick = addPreviewCard;
  document.getElementById('preview-publish-btn').onclick = publishSession;
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
  
  tempSession = null;
  
  // Clear paste form fields
  document.getElementById('transcript-input').value = '';
  document.getElementById('subject-input').value = '';
  document.getElementById('topic-input').value = '';
  document.getElementById('char-count').textContent = '0 / 15,000';
  document.getElementById('generate-btn').disabled = true;

  // Clear preview containers
  document.getElementById('preview-placeholder').style.display = 'flex';
  document.getElementById('preview-active').style.display = 'none';
  
  // Switch to publish confirmation state
  switchPanel('publish');
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
        const card = document.createElement('div');
        card.className = 'session-card';
        
        // Calculate completion percentages
        const studentCount = 28; // class size mock constant
        const resCount = session.responses ? session.responses.length : 0;
        const compPercent = Math.round((resCount / studentCount) * 100);
        const compClass = compPercent < 35 ? 'low' : compPercent < 75 ? 'mid' : 'high';

        card.innerHTML = `
          <div class="session-card-left">
            <div class="session-card-topic">${escapeHTML(session.topic)}</div>
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
          </div>
          <div class="session-card-right">
            <span class="session-status-badge badge-${session.status}">
              ${session.status === 'live' ? '● Live' : 'Closed'}
            </span>
            <div class="session-card-actions">
              <button class="action-btn" onclick="viewSessionResults('${session.id}')">View Results</button>
              ${session.status === 'live' ? `<button class="action-btn" onclick="closeSession('${session.id}')">Close</button>` : ''}
              <button class="action-btn" style="color:#f28b82; border-color:rgba(242,139,130,0.2);" onclick="deleteSavedSession('${session.id}')">Delete</button>
            </div>
          </div>
        `;
        allListContainer.appendChild(card);
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
        const card = document.createElement('div');
        card.className = 'session-card';
        card.innerHTML = `
          <div class="session-card-left">
            <div class="session-card-topic">${escapeHTML(session.topic)}</div>
            <div class="session-card-meta">
              <span>📅 Saved ${session.date}</span>
              <span>🃏 ${session.cards.length} cards</span>
            </div>
          </div>
          <div class="session-card-right">
            <span class="session-status-badge badge-draft">Draft</span>
            <div class="session-card-actions">
              <button class="action-btn" onclick="editDraft('${session.id}')">Edit</button>
              <button class="action-btn primary" onclick="publishDraft('${session.id}')">Publish →</button>
              <button class="action-btn" style="color:#f28b82; border-color:rgba(242,139,130,0.2);" onclick="deleteSavedSession('${session.id}')">Delete</button>
            </div>
          </div>
        `;
        draftListContainer.appendChild(card);
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
    alert('Session published! Students can now review it.');
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
  // Jump to Overview analytics and pre-load stats for this session
  localStorage.setItem('ef_selected_analytics_session', id);
  switchPanel('overview');
};

// ── Teacher Analytics Calculations ─────────────────────────
function renderAnalytics() {
  const selectedSessionId = localStorage.getItem('ef_selected_analytics_session') || '';
  const sessions = window.EduStore.getSessions().filter(s => s.status !== 'draft');
  
  if (sessions.length === 0) {
    // Show zero state
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
    
    sess.cards.forEach(c => {
      if (c.topic) uniqueTopics.add(c.topic);
    });

    responses.forEach(res => {
      res.cardResponses.forEach(cr => {
        totalMCQAnswers++;
        if (cr.isCorrect) correctMCQAnswers++;
      });
    });
  });

  const avgAccuracy = totalMCQAnswers > 0 ? Math.round((correctMCQAnswers / totalMCQAnswers) * 100) : 0;

  // Display stats values
  document.getElementById('stat-avg-accuracy').textContent = `${avgAccuracy}%`;
  document.getElementById('stat-avg-accuracy').nextElementSibling.textContent = totalMCQAnswers > 0 ? '▲ Active participation' : 'No data';
  document.getElementById('stat-participation').textContent = totalStudentResponses;
  document.getElementById('stat-confidence').textContent = uniqueTopics.size;

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

  btn.addEventListener('click', () => {
    const sessions = window.EduStore.getSessions().filter(s => s.status === 'live');
    if (sessions.length === 0) {
      alert('You need at least one LIVE session to simulate student answers on. Please publish a session first.');
      return;
    }

    // Pick the first live session
    const session = sessions[0];
    const numSubmissions = 15;
    
    const ratings = ['know', 'fuzzy', 'nope'];

    for (let i = 0; i < numSubmissions; i++) {
      const studentId = `sim-stud-${Math.floor(Math.random() * 9000) + 1000}`;
      const cardResponses = session.cards.map(card => {
        // 70% chance of choosing correct option
        const isCorrect = Math.random() < 0.70;
        const selectedIndex = isCorrect ? card.correctIndex : (card.correctIndex + 1) % 4;
        
        // Calibrate confidence rating based on correct answer
        let rating = 'fuzzy';
        const rand = Math.random();
        if (isCorrect) {
          rating = rand < 0.65 ? 'know' : rand < 0.90 ? 'fuzzy' : 'nope';
        } else {
          rating = rand < 0.10 ? 'know' : rand < 0.50 ? 'fuzzy' : 'nope';
        }

        return {
          cardId: card.id,
          selectedIndex: selectedIndex,
          isCorrect: isCorrect,
          rating: rating
        };
      });

      const response = {
        studentId: studentId,
        cardResponses: cardResponses
      };

      window.EduStore.addStudentResponse(session.id, response);
    }

    alert(`Successfully simulated ${numSubmissions} student responses on session: "${session.topic}"`);
    
    // Refresh all views
    renderAllSessions();
    renderAnalytics();
  });
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
      alert('Gemini Vision API request failed. Falling back to Mock generator.\nError: ' + err.message);
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

