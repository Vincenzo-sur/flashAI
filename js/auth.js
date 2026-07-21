// ============================================================
//  EduFlash AI — Auth Module (auth.js)
//  Day 5: Google OAuth via Google Identity Services (GSI)
//  Day 6 UX: Replaced modal overlays with a smooth navbar dropdown
// ============================================================

(function () {
  // ── Config ─────────────────────────────────────────────────
  const GOOGLE_CLIENT_ID = '';   // Set to your OAuth Client ID for real GSI
  const USE_MOCK_AUTH    = !GOOGLE_CLIENT_ID;
  const STORAGE_KEY      = 'ef_user';

  // Mock users pool for demo
  const MOCK_USERS = [
    { name: 'Suryanshu Verma',  email: 'suryanshu.verma@school.edu',  picture: '', initials: 'SV', role: 'Class Administrator' },
    { name: 'Priyam Agarwal',   email: 'priyam.agarwal@school.edu',   picture: '', initials: 'PA', role: 'Science Teacher' },
    { name: 'Ananya Krishnan',  email: 'ananya.krishnan@school.edu',  picture: '', initials: 'AK', role: 'Physics Department' }
  ];

  // Avatar colours for mock users
  const AVATAR_COLORS = [
    'linear-gradient(135deg,#1e8e3e,#34a853)',
    'linear-gradient(135deg,#1a73e8,#4285f4)',
    'linear-gradient(135deg,#e37400,#fbbc04)'
  ];

  // ── Public API ──────────────────────────────────────────────
  window.EduAuth = { getUser, signOut, initAuth, openSignInModal };

  // ── Init ────────────────────────────────────────────────────
  function initAuth() {
    injectDropdownStyles();
    buildNavDropdown();

    const stored = getUser();
    if (stored) {
      applyUserToUI(stored);
    } else if (!USE_MOCK_AUTH && typeof google !== 'undefined') {
      initGSI();
    }
  }

  // ── GSI (real OAuth) ────────────────────────────────────────
  function initGSI() {
    google.accounts.id.initialize({
      client_id: GOOGLE_CLIENT_ID,
      callback: handleGSICredential,
      auto_select: false
    });
    const target = document.getElementById('gsi-button-container');
    if (target) {
      google.accounts.id.renderButton(target, { theme: 'outline', size: 'large', width: 240 });
    }
  }

  function handleGSICredential(response) {
    const payload = parseJWT(response.credential);
    if (!payload) return;
    const user = {
      name: payload.name || 'Google User', email: payload.email || '',
      picture: payload.picture || '', initials: getInitials(payload.name || 'G'), role: 'Teacher'
    };
    saveUser(user);
    applyUserToUI(user);
    closeDropdown();
  }

  function parseJWT(token) {
    try {
      return JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
    } catch { return null; }
  }

  // ── Build the navbar trigger + dropdown ─────────────────────
  function buildNavDropdown() {
    // Replace the static sign-in button with our dropdown trigger
    const navBtn = document.getElementById('nav-signin-btn');
    if (!navBtn) return;

    // Create wrapper (position:relative anchor for dropdown)
    const wrap = document.createElement('div');
    wrap.id    = 'auth-dropdown-wrap';
    wrap.style.cssText = 'position:relative; display:inline-flex; align-items:center;';

    // Build trigger chip
    const trigger = document.createElement('button');
    trigger.id        = 'auth-trigger';
    trigger.className = 'auth-trigger';
    trigger.setAttribute('aria-haspopup', 'true');
    trigger.setAttribute('aria-expanded', 'false');
    trigger.innerHTML = buildTriggerHTML(null);

    wrap.appendChild(trigger);

    // Build dropdown panel
    const panel = document.createElement('div');
    panel.id        = 'auth-dropdown';
    panel.className = 'auth-dropdown';
    panel.setAttribute('role', 'menu');
    panel.innerHTML  = buildDropdownHTML(null);
    wrap.appendChild(panel);

    // Replace original button with our wrap
    navBtn.replaceWith(wrap);

    // Toggle on trigger click
    trigger.addEventListener('click', (e) => {
      e.stopPropagation();
      const isOpen = panel.classList.contains('open');
      isOpen ? closeDropdown() : openDropdown();
    });

    // Close on outside click
    document.addEventListener('click', (e) => {
      if (!wrap.contains(e.target)) closeDropdown();
    });

    // Close on Escape
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closeDropdown();
    });
  }

  function openDropdown() {
    const panel   = document.getElementById('auth-dropdown');
    const trigger = document.getElementById('auth-trigger');
    if (!panel || !trigger) return;
    panel.classList.add('open');
    trigger.setAttribute('aria-expanded', 'true');
    trigger.classList.add('active');
    // Refresh panel content on open
    panel.innerHTML = buildDropdownHTML(getUser());
    wireDropdownEvents();
  }

  function closeDropdown() {
    const panel   = document.getElementById('auth-dropdown');
    const trigger = document.getElementById('auth-trigger');
    if (!panel || !trigger) return;
    panel.classList.remove('open');
    trigger.setAttribute('aria-expanded', 'false');
    trigger.classList.remove('active');
  }

  // ── HTML builders ────────────────────────────────────────────
  function buildTriggerHTML(user) {
    if (!user) {
      return `<span class="auth-trigger-icon">👤</span><span class="auth-trigger-label">Sign In</span><span class="auth-trigger-caret">▾</span>`;
    }
    const avatar = user.picture
      ? `<img src="${user.picture}" referrerpolicy="no-referrer" class="auth-trigger-avatar-img" alt="${escapeHTMLAuth(user.name)}" />`
      : `<span class="auth-trigger-avatar-initials" style="background:${AVATAR_COLORS[0]}">${escapeHTMLAuth(user.initials || getInitials(user.name))}</span>`;
    return `${avatar}<span class="auth-trigger-label">${escapeHTMLAuth(user.name.split(' ')[0])}</span><span class="auth-trigger-caret">▾</span>`;
  }

  function buildDropdownHTML(user) {
    if (!user) {
      // Sign-in state: show user picker
      const usersHTML = MOCK_USERS.map((u, i) => `
        <button class="auth-dd-user-row" data-index="${i}" id="dd-user-${i}" role="menuitem">
          <span class="auth-dd-avatar" style="background:${AVATAR_COLORS[i]}">${u.initials}</span>
          <span class="auth-dd-user-info">
            <span class="auth-dd-user-name">${escapeHTMLAuth(u.name)}</span>
            <span class="auth-dd-user-email">${escapeHTMLAuth(u.email)}</span>
          </span>
          <span class="auth-dd-arrow">›</span>
        </button>
      `).join('');

      return `
        <div class="auth-dd-header">
          <div class="auth-dd-logo">📚 EduFlash <em>AI</em></div>
          <div class="auth-dd-sub">Choose a demo account</div>
        </div>
        <div class="auth-dd-divider"></div>
        <div class="auth-dd-users">${usersHTML}</div>
        <div class="auth-dd-divider"></div>
        <button class="auth-dd-guest" id="dd-guest-btn" role="menuitem">Continue as Guest</button>
        <div class="auth-dd-notice">🔧 Demo mode · Connect a Client ID for real OAuth</div>
      `;
    }

    // Signed-in state: show account card + sign-out
    const avatarHTML = user.picture
      ? `<img src="${user.picture}" referrerpolicy="no-referrer" class="auth-dd-avatar-lg-img" alt="${escapeHTMLAuth(user.name)}" />`
      : `<span class="auth-dd-avatar-lg" style="background:${AVATAR_COLORS[0]}">${escapeHTMLAuth(user.initials || getInitials(user.name))}</span>`;

    return `
      <div class="auth-dd-profile">
        ${avatarHTML}
        <div class="auth-dd-profile-name">${escapeHTMLAuth(user.name)}</div>
        <div class="auth-dd-profile-email">${escapeHTMLAuth(user.email)}</div>
        <div class="auth-dd-role-chip">${escapeHTMLAuth(user.role || 'Teacher')}</div>
      </div>
      <div class="auth-dd-divider"></div>
      <button class="auth-dd-signout" id="dd-signout-btn" role="menuitem">Sign out</button>
    `;
  }

  // Wire click events inside the (just-rendered) dropdown
  function wireDropdownEvents() {
    // Mock user rows
    document.querySelectorAll('.auth-dd-user-row').forEach(btn => {
      btn.addEventListener('click', () => {
        const user = MOCK_USERS[parseInt(btn.dataset.index)];
        saveUser(user);
        applyUserToUI(user);
        closeDropdown();
      });
    });
    // Guest
    document.getElementById('dd-guest-btn')?.addEventListener('click', closeDropdown);
    // Sign out
    document.getElementById('dd-signout-btn')?.addEventListener('click', () => {
      signOut();
      closeDropdown();
    });
  }

  // ── Apply user to UI ─────────────────────────────────────────
  function applyUserToUI(user) {
    if (!user) return;

    // Update navbar trigger
    const trigger = document.getElementById('auth-trigger');
    if (trigger) trigger.innerHTML = buildTriggerHTML(user);

    // Sidebar: name, role, avatar
    const nameEl   = document.getElementById('sidebar-user-name');
    const roleEl   = document.getElementById('sidebar-user-role');
    const avatarEl = document.getElementById('sidebar-avatar');

    if (nameEl)   nameEl.textContent = user.name;
    if (roleEl)   roleEl.textContent = user.role || 'Teacher';
    if (avatarEl) {
      if (user.picture) {
        avatarEl.innerHTML = `<img src="${user.picture}" alt="${escapeHTMLAuth(user.name)}" referrerpolicy="no-referrer" style="width:100%;height:100%;object-fit:cover;border-radius:50%;" />`;
      } else {
        avatarEl.textContent = user.initials || getInitials(user.name);
      }
      avatarEl.title = `${user.name} — click to manage account`;
      // Clicking the sidebar avatar also opens the dropdown
      avatarEl.style.cursor = 'pointer';
      avatarEl.onclick = () => {
        const trigger = document.getElementById('auth-trigger');
        trigger?.click();
      };
    }
  }

  // ── openSignInModal (public API — now opens the dropdown) ────
  function openSignInModal() {
    openDropdown();
  }

  // ── Persistence ──────────────────────────────────────────────
  function saveUser(user)  { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(user)); } catch {} }
  function getUser()       { try { const r = localStorage.getItem(STORAGE_KEY); return r ? JSON.parse(r) : null; } catch { return null; } }

  function signOut() {
    localStorage.removeItem(STORAGE_KEY);

    // Reset trigger
    const trigger = document.getElementById('auth-trigger');
    if (trigger) trigger.innerHTML = buildTriggerHTML(null);

    // Reset sidebar
    const nameEl   = document.getElementById('sidebar-user-name');
    const roleEl   = document.getElementById('sidebar-user-role');
    const avatarEl = document.getElementById('sidebar-avatar');
    if (nameEl)   nameEl.textContent   = 'Teacher Admin';
    if (roleEl)   roleEl.textContent   = 'Class Administrator';
    if (avatarEl) { avatarEl.textContent = 'T'; avatarEl.title = 'Click to sign in'; avatarEl.onclick = null; }

    if (!USE_MOCK_AUTH && typeof google !== 'undefined') {
      google.accounts.id.disableAutoSelect();
    }
  }

  // ── Utilities ────────────────────────────────────────────────
  function getInitials(name) {
    if (!name) return 'T';
    const parts = name.trim().split(/\s+/);
    return parts.length === 1 ? parts[0][0].toUpperCase() : (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }

  function escapeHTMLAuth(str) {
    if (!str) return '';
    return str.replace(/[&<>'"\/]/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;','/':'&#47;' }[c] || c));
  }

  // ── Inline CSS injected once into <head> ─────────────────────
  function injectDropdownStyles() {
    if (document.getElementById('auth-dropdown-styles')) return;
    const style = document.createElement('style');
    style.id = 'auth-dropdown-styles';
    style.textContent = `
      /* ── Trigger chip ─────────────────────────── */
      .auth-trigger {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        padding: 5px 12px 5px 6px;
        border-radius: 24px;
        border: 1px solid var(--border);
        background: transparent;
        color: var(--text-muted);
        font-family: 'Google Sans', sans-serif;
        font-size: 0.83rem;
        font-weight: 500;
        cursor: pointer;
        transition: background 0.18s ease, border-color 0.18s ease, color 0.18s ease;
        white-space: nowrap;
        position: relative;
      }
      .auth-trigger:hover,
      .auth-trigger.active {
        background: var(--bg-hover);
        border-color: var(--border-light);
        color: var(--text);
      }
      .auth-trigger-icon { font-size: 1rem; }
      .auth-trigger-label { max-width: 96px; overflow: hidden; text-overflow: ellipsis; }
      .auth-trigger-caret {
        font-size: 0.6rem;
        opacity: 0.55;
        transition: transform 0.22s ease;
        margin-left: 2px;
      }
      .auth-trigger.active .auth-trigger-caret { transform: rotate(180deg); }

      .auth-trigger-avatar-img,
      .auth-trigger-avatar-initials {
        width: 26px; height: 26px;
        border-radius: 50%;
        flex-shrink: 0;
        object-fit: cover;
      }
      .auth-trigger-avatar-initials {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        font-size: 0.72rem;
        font-weight: 700;
        color: #fff;
      }

      /* ── Dropdown panel ───────────────────────── */
      .auth-dropdown {
        position: absolute;
        top: calc(100% + 10px);
        right: 0;
        width: 288px;
        background: #2a2b2e;
        border: 1px solid var(--border-light);
        border-radius: 14px;
        box-shadow: 0 8px 32px rgba(0,0,0,0.55), 0 2px 8px rgba(0,0,0,0.3);
        z-index: 1000;
        overflow: hidden;

        /* Closed state */
        opacity: 0;
        transform: translateY(-8px) scale(0.97);
        pointer-events: none;
        transform-origin: top right;
        transition: opacity 0.2s ease, transform 0.22s cubic-bezier(0.34,1.12,0.64,1);
      }
      .auth-dropdown.open {
        opacity: 1;
        transform: translateY(0) scale(1);
        pointer-events: all;
      }

      /* Header */
      .auth-dd-header {
        padding: 18px 18px 14px;
        text-align: center;
      }
      .auth-dd-logo {
        font-family: 'Google Sans', sans-serif;
        font-size: 1rem;
        font-weight: 700;
        color: var(--text);
        margin-bottom: 4px;
      }
      .auth-dd-logo em { color: var(--yellow); font-style: normal; }
      .auth-dd-sub {
        font-size: 0.76rem;
        color: var(--text-dim);
      }

      /* Divider */
      .auth-dd-divider {
        height: 1px;
        background: var(--border);
        margin: 0;
      }

      /* User rows */
      .auth-dd-users { padding: 8px 0; }
      .auth-dd-user-row {
        display: flex;
        align-items: center;
        gap: 12px;
        width: 100%;
        padding: 10px 16px;
        background: transparent;
        border: none;
        cursor: pointer;
        text-align: left;
        transition: background 0.15s ease;
        border-radius: 0;
      }
      .auth-dd-user-row:hover { background: var(--bg-hover); }

      .auth-dd-avatar {
        width: 36px; height: 36px;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        font-family: 'Google Sans', sans-serif;
        font-size: 0.8rem;
        font-weight: 700;
        color: #fff;
        flex-shrink: 0;
      }
      .auth-dd-user-info { flex: 1; min-width: 0; }
      .auth-dd-user-name {
        display: block;
        font-family: 'Google Sans', sans-serif;
        font-size: 0.85rem;
        font-weight: 500;
        color: var(--text);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .auth-dd-user-email {
        display: block;
        font-size: 0.73rem;
        color: var(--text-dim);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .auth-dd-arrow {
        color: var(--text-dim);
        font-size: 0.9rem;
        flex-shrink: 0;
      }

      /* Guest / notice */
      .auth-dd-guest {
        display: block;
        width: 100%;
        padding: 11px 16px;
        text-align: center;
        font-family: 'Google Sans', sans-serif;
        font-size: 0.82rem;
        color: var(--text-muted);
        background: transparent;
        border: none;
        cursor: pointer;
        transition: background 0.15s ease, color 0.15s ease;
      }
      .auth-dd-guest:hover { background: var(--bg-hover); color: var(--text); }

      .auth-dd-notice {
        text-align: center;
        font-size: 0.68rem;
        color: var(--text-dim);
        padding: 8px 16px 12px;
        line-height: 1.5;
      }

      /* Signed-in profile card */
      .auth-dd-profile {
        display: flex;
        flex-direction: column;
        align-items: center;
        padding: 22px 18px 16px;
        gap: 6px;
        text-align: center;
      }
      .auth-dd-avatar-lg,
      .auth-dd-avatar-lg-img {
        width: 56px; height: 56px;
        border-radius: 50%;
        margin-bottom: 4px;
        object-fit: cover;
      }
      .auth-dd-avatar-lg {
        display: flex;
        align-items: center;
        justify-content: center;
        font-family: 'Google Sans', sans-serif;
        font-size: 1.2rem;
        font-weight: 700;
        color: #fff;
      }
      .auth-dd-profile-name {
        font-family: 'Google Sans', sans-serif;
        font-size: 0.95rem;
        font-weight: 600;
        color: var(--text);
      }
      .auth-dd-profile-email {
        font-size: 0.75rem;
        color: var(--text-dim);
      }
      .auth-dd-role-chip {
        margin-top: 4px;
        display: inline-block;
        background: rgba(52,168,83,0.12);
        color: var(--green-light);
        border: 1px solid rgba(52,168,83,0.25);
        border-radius: 4px;
        padding: 2px 10px;
        font-size: 0.72rem;
        font-weight: 500;
        font-family: 'Roboto', sans-serif;
      }

      /* Sign-out row */
      .auth-dd-signout {
        display: block;
        width: 100%;
        padding: 12px 16px;
        text-align: center;
        font-family: 'Google Sans', sans-serif;
        font-size: 0.84rem;
        font-weight: 500;
        color: #f28b82;
        background: transparent;
        border: none;
        cursor: pointer;
        transition: background 0.15s ease;
        border-radius: 0 0 14px 14px;
      }
      .auth-dd-signout:hover { background: rgba(242,139,130,0.08); }
    `;
    document.head.appendChild(style);
  }

  // ── Auto-init on DOM ready ────────────────────────────────────
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initAuth);
  } else {
    initAuth();
  }
})();
