// ============================================================
//  EduFlash AI — Teacher Dashboard JS
//  Day 2: Sidebar collapse + scroll roll-down nav
// ============================================================

document.addEventListener('DOMContentLoaded', () => {
  initSidebar();
  initPanelTabs();
  initTranscriptForm();
});

// ── Sidebar collapse toggle ──────────────────────────────────
function initSidebar() {
  const sidebarWrap = document.getElementById('sidebar-wrap');
  const sidebar     = document.getElementById('sidebar');
  const toggleBtn   = document.getElementById('sidebar-toggle');

  if (!sidebarWrap || !sidebar || !toggleBtn) return;

  toggleBtn.addEventListener('click', () => {
    const isCollapsed = sidebar.classList.toggle('collapsed');
    sidebarWrap.classList.toggle('collapsed', isCollapsed);
    toggleBtn.title = isCollapsed ? 'Expand sidebar' : 'Collapse sidebar';

    // Close all open scroll panels when collapsing
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

  // ── Scroll roll-down nav sections ──
  document.querySelectorAll('.nav-section-trigger').forEach(trigger => {
    trigger.addEventListener('click', () => {
      const section = trigger.closest('.nav-section');
      if (!section) return;

      // If sidebar is collapsed, expand it first then open
      if (sidebar.classList.contains('collapsed')) {
        sidebar.classList.remove('collapsed');
        localStorage.setItem('ef_sidebar_collapsed', '0');
        setTimeout(() => toggleSection(section), 310);
        return;
      }

      toggleSection(section);
    });
  });

  // ── Sub-item clicks ──
  document.querySelectorAll('.nav-sub-item').forEach(item => {
    item.addEventListener('click', () => {
      // Deactivate all sub-items
      document.querySelectorAll('.nav-sub-item').forEach(i => i.classList.remove('active'));
      // Activate clicked
      item.classList.add('active');

      // Activate the parent trigger
      document.querySelectorAll('.nav-section-trigger').forEach(t => t.classList.remove('active'));
      item.closest('.nav-section')?.querySelector('.nav-section-trigger')?.classList.add('active');

      // Switch panel
      const target = item.dataset.panel;
      if (target) switchPanel(target);
    });
  });

  // ── Top-level trigger clicks (no sub-items) ──
  document.querySelectorAll('.nav-section-trigger[data-panel]').forEach(trigger => {
    trigger.addEventListener('click', () => {
      document.querySelectorAll('.nav-section-trigger').forEach(t => t.classList.remove('active'));
      trigger.classList.add('active');
      const target = trigger.dataset.panel;
      if (target) switchPanel(target);
    });
  });
}

function toggleSection(section) {
  const isOpen = section.classList.contains('open');

  // Close all open sections (accordion behavior)
  document.querySelectorAll('.nav-section.open').forEach(s => {
    if (s !== section) s.classList.remove('open');
  });

  // Toggle the clicked one
  section.classList.toggle('open', !isOpen);
}

// ── Panel tab switching ──────────────────────────────────────
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
  document.querySelectorAll('.panel-content').forEach(p => p.classList.remove('active'));
  const target = document.getElementById('panel-' + panelId);
  if (target) target.classList.add('active');
}

// ── Transcript form ──────────────────────────────────────────
function initTranscriptForm() {
  const textarea    = document.getElementById('transcript-input');
  const charCount   = document.getElementById('char-count');
  const generateBtn = document.getElementById('generate-btn');
  const subjectIn   = document.getElementById('subject-input');
  const topicIn     = document.getElementById('topic-input');
  const dateIn      = document.getElementById('date-input');

  if (!textarea) return;

  // Prefill today's date
  if (dateIn) {
    const today = new Date().toISOString().split('T')[0];
    dateIn.value = today;
  }

  // Character counter
  function updateCharCount() {
    const len = textarea.value.length;
    const max = 15000;
    const formatted = len.toLocaleString() + ' / 15,000';
    if (charCount) {
      charCount.textContent = formatted;
      charCount.classList.toggle('warn', len > max * 0.85);
    }
    checkForm();
  }

  // Enable generate button only when required fields filled
  function checkForm() {
    const hasSubject    = subjectIn?.value.trim().length > 0;
    const hasTopic      = topicIn?.value.trim().length > 0;
    const hasTranscript = textarea.value.trim().length >= 50;
    if (generateBtn) {
      generateBtn.disabled = !(hasSubject && hasTopic && hasTranscript);
    }
  }

  textarea.addEventListener('input', updateCharCount);
  subjectIn?.addEventListener('input', checkForm);
  topicIn?.addEventListener('input', checkForm);

  // Generate button — placeholder until Gemini is wired up
  generateBtn?.addEventListener('click', () => {
    alert('Gemini AI integration coming soon!\nThe form data is ready — it just needs the API wired up.');
  });
}
