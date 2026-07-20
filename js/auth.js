// ============================================================
//  EduFlash AI — Auth Module (auth.js)
//  Day 5: Google OAuth via Google Identity Services (GSI)
//  Falls back to a polished mock sign-in when no Client ID set.
// ============================================================

(function () {
  // ── Config ─────────────────────────────────────────────────
  // Replace with your actual Google OAuth Client ID registered at
  // https://console.cloud.google.com → APIs & Services → Credentials
  // Set to '' to use mock auth (works offline / file:// / demo mode)
  const GOOGLE_CLIENT_ID = '';

  const USE_MOCK_AUTH = !GOOGLE_CLIENT_ID;

  const STORAGE_KEY = 'ef_user';

  // Mock users pool for demo
  const MOCK_USERS = [
    {
      name: 'Suryanshu Verma',
      email: 'suryanshu.verma@school.edu',
      picture: '',
      initials: 'SV',
      role: 'Class Administrator'
    },
    {
      name: 'Priyam Agarwal',
      email: 'priyam.agarwal@school.edu',
      picture: '',
      initials: 'PA',
      role: 'Science Teacher'
    },
    {
      name: 'Ananya Krishnan',
      email: 'ananya.krishnan@school.edu',
      picture: '',
      initials: 'AK',
      role: 'Physics Department'
    }
  ];

  // ── Public API ──────────────────────────────────────────────
  window.EduAuth = {
    getUser,
    signOut,
    initAuth,
    openSignInModal
  };

  // ── Initialise ──────────────────────────────────────────────
  function initAuth() {
    // Always wire up click handlers first — regardless of auth state
    const settingsBtn = document.getElementById('sidebar-settings-btn');
    if (settingsBtn) {
      settingsBtn.addEventListener('click', openSignInModal);
    }

    const avatarEl = document.getElementById('sidebar-avatar');
    if (avatarEl) {
      avatarEl.style.cursor = 'pointer';
      avatarEl.addEventListener('click', openSignInModal);
    }

    const navSignIn = document.getElementById('nav-signin-btn');
    if (navSignIn) {
      navSignIn.addEventListener('click', openSignInModal);
    }

    // If already signed in, apply UI and stop
    const stored = getUser();
    if (stored) {
      applyUserToUI(stored);
      return;
    }

    // Not signed in — init real GSI if available
    if (!USE_MOCK_AUTH && typeof google !== 'undefined') {
      initGSI();
    }
  }

  // ── Google Identity Services ────────────────────────────────
  function initGSI() {
    google.accounts.id.initialize({
      client_id: GOOGLE_CLIENT_ID,
      callback: handleGSICredential,
      auto_select: false
    });

    const gsiTarget = document.getElementById('gsi-button-container');
    if (gsiTarget) {
      google.accounts.id.renderButton(gsiTarget, {
        theme: 'outline',
        size: 'large',
        width: 280,
        text: 'sign_in_with'
      });
    }
  }

  function handleGSICredential(response) {
    // Decode the JWT payload (no verification needed client-side)
    const payload = parseJWT(response.credential);
    if (!payload) return;

    const user = {
      name:     payload.name     || 'Google User',
      email:    payload.email    || '',
      picture:  payload.picture  || '',
      initials: getInitials(payload.name || 'G'),
      role:     'Teacher'
    };

    saveUser(user);
    applyUserToUI(user);
    closeSignInModal();
  }

  function parseJWT(token) {
    try {
      const base64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
      return JSON.parse(atob(base64));
    } catch (e) {
      console.error('JWT parse failed', e);
      return null;
    }
  }

  // ── Mock Sign-In Flow ───────────────────────────────────────
  function openMockSignIn() {
    const overlay = document.getElementById('mock-signin-overlay');
    if (overlay) {
      overlay.classList.add('active');
      return;
    }

    // Build the mock user picker modal
    const el = document.createElement('div');
    el.id = 'mock-signin-overlay';
    el.className = 'mock-signin-overlay';
    el.innerHTML = `
      <div class="mock-signin-card">
        <div class="mock-signin-header">
          <div class="mock-signin-logo">📚</div>
          <div class="mock-signin-title">Sign in to EduFlash <em>AI</em></div>
          <div class="mock-signin-sub">Choose a demo account</div>
        </div>
        <div class="mock-user-list">
          ${MOCK_USERS.map((u, i) => `
            <button class="mock-user-row" data-index="${i}" id="mock-user-${i}">
              <div class="mock-user-avatar">${u.initials}</div>
              <div class="mock-user-info">
                <div class="mock-user-name">${u.name}</div>
                <div class="mock-user-email">${u.email}</div>
              </div>
              <div class="mock-user-check">›</div>
            </button>
          `).join('')}
        </div>
        <div class="mock-signin-footer">
          <button class="mock-guest-btn" id="mock-guest-btn">Continue as Guest</button>
        </div>
        <div class="mock-demo-notice">
          🔧 Demo mode — connect a Google Cloud Client ID for real OAuth
        </div>
      </div>
    `;

    document.body.appendChild(el);

    // Wire mock user selection
    el.querySelectorAll('.mock-user-row').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.dataset.index);
        const user = MOCK_USERS[idx];
        saveUser(user);
        applyUserToUI(user);
        closeMockSignIn();
        closeSignInModal();
      });
    });

    document.getElementById('mock-guest-btn').addEventListener('click', () => {
      closeMockSignIn();
      closeSignInModal();
    });

    // Activate with a micro-delay for transition
    requestAnimationFrame(() => el.classList.add('active'));
  }

  function closeMockSignIn() {
    const overlay = document.getElementById('mock-signin-overlay');
    if (overlay) {
      overlay.classList.remove('active');
    }
  }

  // ── Sign-In Modal (wrapper) ─────────────────────────────────
  function openSignInModal() {
    const user = getUser();
    if (user) {
      // Already signed in — show the signed-in modal instead
      openAccountModal(user);
      return;
    }

    if (USE_MOCK_AUTH) {
      openMockSignIn();
      return;
    }

    // Real GSI: open the modal with the GSI button
    const modal = document.getElementById('auth-modal');
    if (modal) modal.classList.add('active');
  }

  function closeSignInModal() {
    const modal = document.getElementById('auth-modal');
    if (modal) modal.classList.remove('active');
    closeMockSignIn();
  }

  // ── Signed-In Account Modal ─────────────────────────────────
  function openAccountModal(user) {
    const existing = document.getElementById('account-modal-overlay');
    if (existing) {
      existing.classList.add('active');
      return;
    }

    const el = document.createElement('div');
    el.id = 'account-modal-overlay';
    el.className = 'mock-signin-overlay';
    el.innerHTML = `
      <div class="mock-signin-card account-modal-card">
        <div class="mock-signin-header">
          <div class="account-avatar-large">${user.picture
            ? `<img src="${user.picture}" alt="${user.name}" referrerpolicy="no-referrer" />`
            : `<span>${user.initials || getInitials(user.name)}</span>`
          }</div>
          <div class="mock-signin-title">${escapeHTMLAuth(user.name)}</div>
          <div class="mock-signin-sub">${escapeHTMLAuth(user.email)}</div>
          <div class="account-role-tag">${escapeHTMLAuth(user.role || 'Teacher')}</div>
        </div>
        <div style="display: flex; flex-direction: column; gap: 10px; width: 100%;">
          <button class="btn btn-outline" id="account-signout-btn" style="width: 100%; justify-content: center; color: #f28b82; border-color: rgba(242,139,130,0.3);">
            Sign out
          </button>
          <button class="mock-guest-btn" id="account-close-btn">Close</button>
        </div>
      </div>
    `;

    document.body.appendChild(el);
    requestAnimationFrame(() => el.classList.add('active'));

    document.getElementById('account-signout-btn').addEventListener('click', () => {
      signOut();
      el.classList.remove('active');
      setTimeout(() => el.remove(), 300);
    });

    document.getElementById('account-close-btn').addEventListener('click', () => {
      el.classList.remove('active');
      setTimeout(() => el.remove(), 300);
    });
  }

  // ── Apply User to UI ────────────────────────────────────────
  function applyUserToUI(user) {
    if (!user) return;

    // Sidebar: name, role, avatar
    const nameEl   = document.getElementById('sidebar-user-name');
    const roleEl   = document.getElementById('sidebar-user-role');
    const avatarEl = document.getElementById('sidebar-avatar');

    if (nameEl) nameEl.textContent = user.name;
    if (roleEl) roleEl.textContent = user.role || 'Teacher';

    if (avatarEl) {
      if (user.picture) {
        avatarEl.innerHTML = `<img src="${user.picture}" alt="${escapeHTMLAuth(user.name)}" referrerpolicy="no-referrer" style="width:100%;height:100%;object-fit:cover;border-radius:50%;" />`;
      } else {
        avatarEl.textContent = user.initials || getInitials(user.name);
      }
      avatarEl.title = `${user.name} — click to manage account`;
    }

    // Navbar: swap sign-in button for user chip
    const navSignIn = document.getElementById('nav-signin-btn');
    if (navSignIn) {
      navSignIn.innerHTML = user.picture
        ? `<img src="${user.picture}" alt="${escapeHTMLAuth(user.name)}" referrerpolicy="no-referrer" style="width:24px;height:24px;border-radius:50%;object-fit:cover;" /> ${user.name.split(' ')[0]}`
        : `👤 ${user.name.split(' ')[0]}`;
      navSignIn.classList.add('signed-in');
    }
  }

  // ── Persistence ─────────────────────────────────────────────
  function saveUser(user) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(user));
    } catch (e) {}
  }

  function getUser() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }

  function signOut() {
    localStorage.removeItem(STORAGE_KEY);

    // Reset sidebar to placeholder
    const nameEl   = document.getElementById('sidebar-user-name');
    const roleEl   = document.getElementById('sidebar-user-role');
    const avatarEl = document.getElementById('sidebar-avatar');

    if (nameEl)   nameEl.textContent = 'Teacher Admin';
    if (roleEl)   roleEl.textContent = 'Class Administrator';
    if (avatarEl) { avatarEl.textContent = 'T'; avatarEl.title = 'Click to sign in'; }

    // Reset navbar
    const navSignIn = document.getElementById('nav-signin-btn');
    if (navSignIn) {
      navSignIn.innerHTML = '👤 Sign In';
      navSignIn.classList.remove('signed-in');
    }

    // Revoke GSI session if available
    if (!USE_MOCK_AUTH && typeof google !== 'undefined') {
      google.accounts.id.disableAutoSelect();
    }
  }

  // ── Utilities ───────────────────────────────────────────────
  function getInitials(name) {
    if (!name) return 'T';
    const parts = name.trim().split(/\s+/);
    if (parts.length === 1) return parts[0][0].toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }

  function escapeHTMLAuth(str) {
    if (!str) return '';
    return str.replace(/[&<>'"/]/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;',
      "'": '&#39;', '"': '&quot;', '/': '&#47;'
    }[c] || c));
  }

  // ── Auto-init on DOM ready ──────────────────────────────────
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initAuth);
  } else {
    initAuth();
  }
})();
