// Unfiltered Journal — Core Application Logic
// Features: Firestore Real-time Sync, Offline Caching, Themes, Haptics, Native Share, Status Bar, Push

import { 
  auth, 
  db, 
  signInWithEmailAndPassword, 
  signOut, 
  onAuthStateChanged, 
  collection, 
  addDoc, 
  deleteDoc, 
  doc, 
  updateDoc, 
  setDoc,
  increment, 
  onSnapshot, 
  query, 
  orderBy, 
  serverTimestamp,
  getDocs 
} from './firebase-config.js';
import { INITIAL_POSTS } from './initial-posts.js';

const STORAGE_PREFIX = 'raj-blog:';
const MASTER_ADMIN_EMAIL = "rrajkumarpadmanabhan@gmail.com";
const MASTER_ADMIN_PASS = "deepu@0746";

const ALLOWED_ADMINS = [
  "rrajkumarpadmanabhan@gmail.com",
  "collabwithrajkumar@gmail.com"
];

function isAllowedAdmin(email) {
  if (!email) return false;
  return ALLOWED_ADMINS.some(admin => admin.toLowerCase() === email.toLowerCase());
}

// Capacitor Native Plugins (Dual Environment Safe)
const Plugins = window.Capacitor?.Plugins || {};
const StatusBar = Plugins.StatusBar;
const Haptics = Plugins.Haptics;
const CapShare = Plugins.Share;
const Preferences = Plugins.Preferences;
const LocalNotifications = Plugins.LocalNotifications;

let postStates = []; // [{ id, post, slug, liked }]

// ---------------- Deleted Slugs Tracking ----------------
function getDeletedSlugs() {
  try {
    return new Set(JSON.parse(localStorage.getItem(STORAGE_PREFIX + 'deleted_slugs') || '[]'));
  } catch (e) {
    return new Set();
  }
}

function markSlugDeleted(slug) {
  const set = getDeletedSlugs();
  set.add(slug);
  localStorage.setItem(STORAGE_PREFIX + 'deleted_slugs', JSON.stringify([...set]));
}

// ---------------- Saved / Bookmarked Posts (Private per User/Device) ----------------
const SAVED_SLUGS_KEY = STORAGE_PREFIX + 'saved_slugs';

function getSavedSlugs() {
  try {
    const raw = localStorage.getItem(SAVED_SLUGS_KEY);
    return new Set(raw ? JSON.parse(raw) : []);
  } catch (e) {
    return new Set();
  }
}

async function persistSavedSlugs(savedSet) {
  const arr = Array.from(savedSet);
  localStorage.setItem(SAVED_SLUGS_KEY, JSON.stringify(arr));
  if (Preferences) {
    try {
      await Preferences.set({ key: SAVED_SLUGS_KEY, value: JSON.stringify(arr) });
    } catch (e) { /* fallback */ }
  }
  updateSavedCountBadge();
}

function isSavedSlug(slug) {
  return getSavedSlugs().has(slug);
}

function toggleSavedSlug(slug) {
  const set = getSavedSlugs();
  const willSave = !set.has(slug);
  if (willSave) {
    set.add(slug);
  } else {
    set.delete(slug);
  }
  persistSavedSlugs(set);
  return willSave;
}

function updateSavedCountBadge() {
  const count = getSavedSlugs().size;
  const countEl = document.getElementById('saved-count');
  if (countEl) countEl.textContent = count;
}

// ---------------- Application Bootstrap ----------------
async function initApp() {
  initTheme();
  setupProfileModal();

  const aboutEl = document.getElementById('about-text');
  if (window.SITE_ABOUT && aboutEl) {
    aboutEl.textContent = window.SITE_ABOUT;
  }

  setupSearch();
  setupAdminControls();
  setupEditModal();
  initNotifyButton();
  updateSavedCountBadge();

  // 1. Immediately render all archived blogs out of the box
  displayMergedPosts([]);

  // 2. Real-time sync with Firestore (fetches new blogs published by admin without reinstall)
  subscribeToFirestorePosts();

  // 3. Re-verify & sync when app is resumed from background or comes online
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      subscribeToFirestorePosts();
    }
  });
  window.addEventListener('online', () => {
    subscribeToFirestorePosts();
  });
  window.addEventListener('focus', () => {
    subscribeToFirestorePosts();
  });
  // Quiet background heartbeat sync every 60s
  setInterval(() => {
    if (navigator.onLine) {
      subscribeToFirestorePosts();
    }
  }, 60000);
}

// ---------------- Themes & Settings System ----------------
const THEMES = [
  { id: 'ink', name: 'Ink Editorial', tag: 'Dark Obsidian & Amber', swatches: ['#e8a34d', '#b1512f', '#161210'], color: '#161210', style: 'DARK' },
  { id: 'paper', name: 'Warm Parchment', tag: 'High-Contrast Light', swatches: ['#ffffff', '#f8f5ee', '#b1512f'], color: '#f8f5ee', style: 'LIGHT' },
  { id: 'midnight', name: 'Midnight Ocean', tag: 'Sapphire & Sky Blue', swatches: ['#38bdf8', '#0284c7', '#080d1a'], color: '#080d1a', style: 'DARK' },
  { id: 'emerald', name: 'Emerald Forest', tag: 'Velvet Pine & Sage', swatches: ['#10b981', '#34d399', '#061712'], color: '#061712', style: 'DARK' },
  { id: 'synthwave', name: 'Cyber Synthwave', tag: 'Electric Magenta & Cyan', swatches: ['#f43f5e', '#ec4899', '#11081f'], color: '#11081f', style: 'DARK' },
  { id: 'sunset', name: 'Sunset Ember', tag: 'Terracotta & Amber', swatches: ['#f97316', '#fb923c', '#170c07'], color: '#170c07', style: 'DARK' },
  { id: 'nord', name: 'Nordic Slate', tag: 'Arctic Frost & Slate', swatches: ['#88c0d0', '#81a1c1', '#1e222b'], color: '#1e222b', style: 'DARK' },
  { id: 'amethyst', name: 'Royal Amethyst', tag: 'Imperial Plum & Lilac', swatches: ['#a855f7', '#c084fc', '#120c22'], color: '#120c22', style: 'DARK' }
];

const themeMeta = THEMES.reduce((acc, t) => {
  acc[t.id] = { color: t.color, style: t.style };
  return acc;
}, {});

function initTheme() {
  const savedTheme = localStorage.getItem('user-theme') || 'ink';
  renderThemePickerGrid(savedTheme);
  applyTheme(savedTheme);
  setupSettingsModal();
}

function renderThemePickerGrid(currentTheme) {
  const grid = document.getElementById('theme-picker-grid');
  if (!grid) return;

  grid.innerHTML = THEMES.map(theme => `
    <div class="theme-choice-card ${theme.id === currentTheme ? 'is-active' : ''}" data-theme-id="${theme.id}" role="button" tabindex="0" aria-label="Select ${theme.name}">
      <div class="theme-card-left">
        <div class="theme-swatches">
          ${theme.swatches.map(c => `<span class="theme-swatch-dot" style="background-color: ${c}"></span>`).join('')}
        </div>
        <div class="theme-choice-info">
          <span class="theme-choice-name">${theme.name}</span>
          <span class="theme-choice-tag">${theme.tag}</span>
        </div>
      </div>
      <span class="theme-choice-check">✓</span>
    </div>
  `).join('');

  grid.querySelectorAll('.theme-choice-card').forEach(card => {
    card.addEventListener('click', () => {
      triggerHaptic('SELECTION');
      const themeId = card.getAttribute('data-theme-id');
      applyTheme(themeId);
      renderThemePickerGrid(themeId);
    });
  });
}

async function applyTheme(themeName) {
  const theme = themeMeta[themeName] ? themeName : 'ink';
  document.documentElement.setAttribute('data-theme', theme);
  if (document.body) {
    document.body.setAttribute('data-theme', theme);
  }
  localStorage.setItem('user-theme', theme);

  if (StatusBar) {
    try {
      const config = themeMeta[theme];
      await StatusBar.setBackgroundColor({ color: config.color });
      await StatusBar.setStyle({ style: config.style });
    } catch (e) { /* web fallback */ }
  }
}

function setupSettingsModal() {
  const settingsBtn = document.getElementById('settings-btn');
  const settingsModal = document.getElementById('settings-modal');
  const closeBtn = document.getElementById('btn-close-settings');
  const notifyToggle = document.getElementById('settings-notify-toggle');
  const notifyBadge = document.getElementById('settings-notify-badge');
  const adminToggle = document.getElementById('settings-admin-toggle');

  if (!settingsModal) return;

  function updateNotifyBadge() {
    const isSubscribed = localStorage.getItem(STORAGE_PREFIX + 'notify') === 'true';
    if (notifyBadge) {
      notifyBadge.textContent = isSubscribed ? 'Subscribed ✓' : 'Enable';
      notifyBadge.classList.toggle('is-subscribed', isSubscribed);
    }
  }

  function openSettings() {
    triggerHaptic('LIGHT');
    updateNotifyBadge();
    const currentTheme = localStorage.getItem('user-theme') || 'ink';
    renderThemePickerGrid(currentTheme);
    settingsModal.style.display = 'flex';
  }

  function closeSettings() {
    settingsModal.style.display = 'none';
  }

  if (settingsBtn) {
    settingsBtn.addEventListener('click', openSettings);
  }

  if (closeBtn) {
    closeBtn.addEventListener('click', closeSettings);
  }

  settingsModal.addEventListener('click', (e) => {
    if (e.target === settingsModal) {
      closeSettings();
    }
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && settingsModal.style.display === 'flex') {
      closeSettings();
    }
  });

  if (notifyToggle) {
    notifyToggle.addEventListener('click', () => {
      const notifyBtn = document.getElementById('notify-btn');
      if (notifyBtn) notifyBtn.click();
      updateNotifyBadge();
    });
  }

  const updateAppBtn = document.getElementById('settings-update-app');
  const updateBadge = document.getElementById('settings-update-badge');

  if (updateAppBtn) {
    updateAppBtn.addEventListener('click', async () => {
      triggerHaptic('MEDIUM');
      if (updateBadge) updateBadge.textContent = 'Checking...';
      showToast("🔍 Checking for latest update from cloud...");

      setTimeout(() => {
        if (updateBadge) updateBadge.textContent = 'Downloading ⬇️';
        showToast("🚀 Starting latest Unfiltered Journal APK download...");
        triggerHaptic('SUCCESS');

        const apkDownloadUrl = "https://github.com/its-rajkumarpadmanabhan/Unflitered_Blog/raw/main/Unfiltered-Journal.apk";
        
        // Open download in system browser/installer
        const a = document.createElement('a');
        a.href = apkDownloadUrl;
        a.download = "Unfiltered-Journal.apk";
        a.target = "_blank";
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);

        setTimeout(() => {
          if (updateBadge) updateBadge.textContent = 'Latest ✓';
        }, 3500);
      }, 700);
    });
  }

  if (adminToggle) {
    adminToggle.addEventListener('click', () => {
      closeSettings();
      const adminDrawer = document.getElementById('admin-drawer');
      if (adminDrawer) {
        adminDrawer.style.display = 'block';
        triggerHaptic('LIGHT');
      }
    });
  }
}

// ---------------- Haptic Feedback ----------------
function triggerHaptic(type = 'LIGHT') {
  if (Haptics) {
    try {
      Haptics.impact({ style: type });
      return;
    } catch (e) { /* ignore */ }
  }
  if ('vibrate' in navigator) {
    try {
      navigator.vibrate(type === 'MEDIUM' ? 30 : 15);
    } catch (e) { /* ignore */ }
  }
}

// ---------------- Offline Local Caching ----------------
async function cachePosts(posts) {
  try {
    const serialized = JSON.stringify(posts);
    localStorage.setItem(STORAGE_PREFIX + 'cached_posts', serialized);
    if (Preferences) {
      await Preferences.set({ key: 'cached_posts', value: serialized });
    }
  } catch (e) { /* ignore */ }
}

// ---------------- Random Baseline Count (85 - 200) ----------------
function getBaseCount(key, min = 85, max = 200) {
  const stored = localStorage.getItem(key);
  if (stored !== null) {
    const val = parseInt(stored, 10);
    if (!isNaN(val) && val >= min) return val;
  }
  const val = Math.floor(Math.random() * (max - min + 1)) + min;
  localStorage.setItem(key, String(val));
  return val;
}

// ---------------- Merge Archive Blogs with Admin Firestore Blogs (Zero-Duplicate) ----------------
function displayMergedPosts(firestorePosts = []) {
  const countEl = document.getElementById('entry-count');
  const deletedSlugs = getDeletedSlugs();

  const combined = [];
  const seenSlugs = new Set();
  const seenKeys = new Set();

  // 1. New or updated posts from Firestore (take highest priority)
  for (const fp of firestorePosts) {
    const slug = slugFor(fp);
    const contentKey = ((fp.title || '') + '::' + (fp.date || '')).trim().toLowerCase();
    if (!deletedSlugs.has(slug) && !seenSlugs.has(slug) && !seenKeys.has(contentKey)) {
      seenSlugs.add(slug);
      seenKeys.add(contentKey);
      if (fp.id) seenSlugs.add(fp.id);
      combined.push({
        ...fp,
        id: fp.id,
        slug: slug,
        isFirestore: true
      });
    }
  }

  // 2. Add the baseline archived blogs from archive files (never duplicate)
  if (Array.isArray(INITIAL_POSTS)) {
    for (let i = 0; i < INITIAL_POSTS.length; i++) {
      const basePost = INITIAL_POSTS[i];
      const slug = slugFor(basePost, i);
      const contentKey = ((basePost.title || '') + '::' + (basePost.date || '')).trim().toLowerCase();
      if (!seenSlugs.has(slug) && !seenKeys.has(contentKey) && !deletedSlugs.has(slug)) {
        seenSlugs.add(slug);
        seenKeys.add(contentKey);
        combined.push({
          id: slug,
          slug: slug,
          date: basePost.date || '',
          title: basePost.title || '',
          body: basePost.body || '',
          image: basePost.image || '',
          tags: Array.isArray(basePost.tags) ? basePost.tags : [],
          isArchive: true
        });
      }
    }
  }

  // 3. Sort newest first (lexicographical date comparison avoids any timezone parsing offset)
  combined.sort((a, b) => (b.date || '').localeCompare(a.date || ''));

  window.SITE_POSTS = combined;
  if (countEl) countEl.textContent = combined.length;

  const count2026 = combined.filter(p => (p.date || '').startsWith('2026')).length;
  const count2025 = combined.filter(p => (p.date || '').startsWith('2025')).length;
  const pillAll = document.querySelector('.filter-pill[data-year="all"]');
  const pill2026 = document.querySelector('.filter-pill[data-year="2026"]');
  const pill2025 = document.querySelector('.filter-pill[data-year="2025"]');
  if (pillAll) pillAll.textContent = `All Years (${combined.length})`;
  if (pill2026) pill2026.textContent = `2026 (${count2026})`;
  if (pill2025) pill2025.textContent = `2025 (${count2025})`;

  // Cache locally so it opens instantly offline
  cachePosts(combined);

  postStates = combined.map((post, i) => {
    const slug = post.slug || post.id || slugFor(post, i);

    // Random baseline between 85 and 200 for every post (archive and upcoming)
    const baseLikes = typeof post.likesCount === 'number' && post.likesCount >= 85
      ? post.likesCount
      : getBaseCount(STORAGE_PREFIX + 'likes:' + slug, 85, 200);

    const baseShares = typeof post.sharesCount === 'number' && post.sharesCount >= 85
      ? post.sharesCount
      : getBaseCount(STORAGE_PREFIX + 'shares:' + slug, 85, 200);

    const isLiked = getLikedState(STORAGE_PREFIX + 'liked:' + slug);
    const isSaved = isSavedSlug(slug);
    post.likesCount = baseLikes + (isLiked ? 1 : 0);
    post.sharesCount = baseShares;

    return {
      id: post.id,
      post,
      slug,
      liked: isLiked,
      saved: isSaved
    };
  });

  updateSavedCountBadge();
  applySearchOrRender();
}

// ---------------- Real-time Firestore Sync (Public Feed) ----------------
let knownPostIds = null;

function subscribeToFirestorePosts() {
  try {
    const q = query(collection(db, "posts"), orderBy("date", "desc"));

    onSnapshot(q, (snapshot) => {
      const firestorePosts = [];
      const currentIds = new Set();
      const newlyAddedPosts = [];

      snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        const postObj = {
          id: docSnap.id,
          date: data.date || '',
          title: data.title || '',
          body: data.body || '',
          image: data.image || '',
          tags: Array.isArray(data.tags) ? data.tags : [],
          likesCount: typeof data.likesCount === 'number' ? data.likesCount : undefined,
          sharesCount: typeof data.sharesCount === 'number' ? data.sharesCount : undefined
        };
        firestorePosts.push(postObj);
        currentIds.add(docSnap.id);

        if (knownPostIds !== null && !knownPostIds.has(docSnap.id)) {
          newlyAddedPosts.push(postObj);
        }
      });

      // If new posts arrived after initial connection, notify subscribers
      if (knownPostIds !== null && newlyAddedPosts.length > 0) {
        newlyAddedPosts.forEach(p => {
          dispatchPostNotification(p);
        });
      }

      knownPostIds = currentIds;

      // Merge newly added admin posts with the 115 archive entries
      displayMergedPosts(firestorePosts);
    }, (err) => {
      console.warn("Firestore sync status (offline/connecting):", err.message);
      // Even if offline, the 115 archive posts are already visible to the reader!
    });
  } catch (err) {
    console.error("Failed to initialize Firestore listener:", err);
  }
}

// ---------------- Search & Rendering ----------------
function applySearchOrRender() {
  const searchInput = document.getElementById('search-input');
  const term = searchInput ? searchInput.value.trim().toLowerCase() : '';
  if (term) {
    const filtered = postStates.filter(s => matchesSearch(s.post, term));
    renderList(filtered, term);
  } else {
    renderList(postStates);
  }
}

function matchesSearch(post, term) {
  const p = parseDateParts(post.date);
  const dateStrings = [];
  if (p) {
    const fullMonth = MONTH_NAMES[p.month - 1].toLowerCase();
    const shortMonth = MONTH_SHORT[p.month - 1].toLowerCase();
    const yearStr = String(p.year);
    dateStrings.push(
      post.date,
      yearStr,
      fullMonth,
      shortMonth,
      `${shortMonth} ${yearStr}`,
      `${fullMonth} ${yearStr}`,
      `${yearStr} ${shortMonth}`,
      `${yearStr} ${fullMonth}`
    );
  }

  const haystack = [
    post.title || '',
    post.body || '',
    ...(post.tags || []),
    ...dateStrings
  ].join(' ').toLowerCase();

  return haystack.includes(term);
}

function renderList(states, term) {
  const postsEl = document.getElementById('posts');
  if (!postsEl) return;

  // Filter by active year pill if selected (All, 2026, 2025, Saved)
  const activePill = document.querySelector('.filter-pill.is-active');
  const selectedYear = activePill ? activePill.getAttribute('data-year') : 'all';

  let visibleStates = states;
  if (selectedYear === 'saved') {
    const savedSlugs = getSavedSlugs();
    visibleStates = states.filter(s => savedSlugs.has(s.slug));
  } else if (selectedYear && selectedYear !== 'all') {
    visibleStates = states.filter(s => getYear(s.post.date) === selectedYear);
  }

  if (visibleStates.length === 0) {
    if (selectedYear === 'saved') {
      postsEl.innerHTML = `
        <div class="empty-saved-state">
          <div class="empty-saved-icon">🔖</div>
          <h3>No saved stories yet</h3>
          <p>Tap the bookmark icon on any journal entry to save it to your private reading list. Only you can view your saved entries on this device.</p>
        </div>
      `;
      return;
    }
    if (term) {
      postsEl.innerHTML = `<p class="empty-state">No entries match "${escapeHtml(term)}" in ${selectedYear === 'all' ? 'journal' : selectedYear}.</p>`;
    } else {
      postsEl.innerHTML = `<p class="empty-state">No journal entries found for ${escapeHtml(selectedYear)}.</p>`;
    }
    return;
  }

  // Count entries per period (YYYY-MM) so August 2026 and August 2025 never collapse
  const periodCounts = {};
  visibleStates.forEach(s => {
    const period = (s.post.date || '').slice(0, 7);
    if (period) {
      periodCounts[period] = (periodCounts[period] || 0) + 1;
    }
  });

  let lastPeriod = '';
  const htmlParts = [];

  for (const s of visibleStates) {
    const period = (s.post.date || '').slice(0, 7);
    if (period && period !== lastPeriod) {
      lastPeriod = period;
      const label = getMonthYearLabel(s.post.date);
      const count = periodCounts[period] || 1;
      htmlParts.push(`
        <div class="month-section-header" data-period="${escapeAttr(period)}">
          <span class="month-section-title">${escapeHtml(label)}</span>
          <span class="month-section-line"></span>
          <span class="month-section-badge">${count} ${count === 1 ? 'entry' : 'entries'}</span>
        </div>
      `);
    }
    htmlParts.push(renderPost(s));
  }

  postsEl.innerHTML = htmlParts.join('');
  visibleStates.forEach(s => attachPostHandlers(s));
}

function renderPost(state) {
  const { post, slug, liked, saved } = state;
  const dateLabel = formatDate(post.date);
  const tags = (post.tags || [])
    .map(t => `<span>${escapeHtml(t)}</span>`)
    .join('');
  const image = post.image
    ? `<img src="${escapeAttr(post.image)}" alt="${escapeAttr(post.title || '')}">`
    : '';

  const likeCount = post.likesCount || 85;
  const shareCount = post.sharesCount || 85;

  return `
    <article class="post" data-slug="${escapeAttr(slug)}" data-id="${escapeAttr(post.id || '')}">
      <div class="post-date">${dateLabel}</div>
      <h3>${escapeHtml(post.title || 'Untitled')}</h3>
      <p>${escapeHtml(post.body || '')}</p>
      ${image}
      ${tags ? `<div class="post-tags">${tags}</div>` : ''}
      <div class="post-actions">
        <!-- Public: Like Button (+1 on click) -->
        <button class="action-btn like-btn ${liked ? 'is-active' : ''}" data-id="${escapeAttr(post.id || '')}" data-slug="${escapeAttr(slug)}" aria-pressed="${liked}">
          <span class="icon">${liked ? '♥' : '♡'}</span>
          <span class="label">Like</span>
          <span class="count" data-role="like-count">${formatCount(likeCount)}</span>
        </button>

        <!-- Public: Share Button (+1 on click) -->
        <button class="action-btn share-btn" data-id="${escapeAttr(post.id || '')}" data-slug="${escapeAttr(slug)}">
          <span class="icon">⤴</span>
          <span class="label">Share</span>
          <span class="count" data-role="share-count">${formatCount(shareCount)}</span>
        </button>

        <!-- Public: Save / Bookmark Button (Private to this user/device) -->
        <button class="action-btn save-btn ${saved ? 'is-active is-saved' : ''}" data-id="${escapeAttr(post.id || '')}" data-slug="${escapeAttr(slug)}" aria-pressed="${saved ? 'true' : 'false'}" title="${saved ? 'Remove from saved' : 'Save this story'}">
          <span class="icon">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="${saved ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path>
            </svg>
          </span>
          <span class="label">${saved ? 'Saved' : 'Save'}</span>
        </button>

        ${post.isFirestore && post.id ? `
        <!-- Admin Only: Edit Uploaded Post -->
        <button class="action-btn edit-btn" data-id="${escapeAttr(post.id)}" title="Edit uploaded entry">
          <span class="icon">✏</span>
          <span class="label">Edit</span>
        </button>

        <!-- Admin Only: Delete Uploaded Post -->
        <button class="action-btn delete-btn" data-id="${escapeAttr(post.id)}" title="Delete uploaded entry">
          <span class="icon">🗑</span>
          <span class="label">Delete</span>
        </button>
        ` : ''}
      </div>
    </article>
  `;
}

// ---------------- Post Action Event Listeners ----------------
function attachPostHandlers(state) {
  const { slug, post } = state;
  const article = document.querySelector(`.post[data-slug="${cssEscape(slug)}"]`);
  if (!article) return;

  const likeBtn = article.querySelector('.like-btn');
  const shareBtn = article.querySelector('.share-btn');
  const editBtn = article.querySelector('.edit-btn');
  const deleteBtn = article.querySelector('.delete-btn');

  // 1. Like Button Handler (Public: +1 on click, toggleable)
  if (likeBtn) {
    likeBtn.addEventListener('click', async () => {
      triggerHaptic('LIGHT');
      const isCurrentlyLiked = state.liked;
      const likeDelta = isCurrentlyLiked ? -1 : 1;

      state.liked = !isCurrentlyLiked;
      localStorage.setItem(STORAGE_PREFIX + 'liked:' + slug, String(state.liked));

      // Optimistic UI update
      post.likesCount = Math.max(85, (post.likesCount || 85) + likeDelta);
      likeBtn.classList.toggle('is-active', state.liked);
      likeBtn.setAttribute('aria-pressed', String(state.liked));
      likeBtn.querySelector('.icon').textContent = state.liked ? '♥' : '♡';
      likeBtn.querySelector('[data-role="like-count"]').textContent = formatCount(post.likesCount);

      localStorage.setItem(STORAGE_PREFIX + 'likes:' + slug, String(post.likesCount - (state.liked ? 1 : 0)));

      if (post.id && post.isFirestore) {
        try {
          await updateDoc(doc(db, "posts", post.id), {
            likesCount: increment(likeDelta)
          });
        } catch (err) {
          console.error("Failed to update likes in Firestore:", err);
        }
      }
    });
  }

  // 2. Share Button Handler (Public: +1 each time user shares)
  if (shareBtn) {
    shareBtn.addEventListener('click', async () => {
      triggerHaptic('LIGHT');

      // Increment share count by +1
      post.sharesCount = (post.sharesCount || 85) + 1;
      localStorage.setItem(STORAGE_PREFIX + 'shares:' + slug, String(post.sharesCount));
      const shareCountEl = shareBtn.querySelector('[data-role="share-count"]');
      if (shareCountEl) shareCountEl.textContent = formatCount(post.sharesCount);

      if (post.id && post.isFirestore) {
        try {
          await updateDoc(doc(db, "posts", post.id), {
            sharesCount: increment(1)
          });
        } catch (e) { /* ignore */ }
      }

      const url = window.location.href.split('#')[0] + '#' + slug;
      const title = post.title || document.title;
      const text = (post.body || '').slice(0, 120) + '...';

      if (CapShare) {
        try {
          await CapShare.share({
            title: title,
            text: text,
            url: url,
            dialogTitle: 'Share Journal Entry'
          });
          return;
        } catch (e) { /* cancelled */ }
      }

      if (navigator.share) {
        try {
          await navigator.share({ title, text, url });
          return;
        } catch (e) { /* cancelled */ }
      }

      if (navigator.clipboard) {
        try {
          await navigator.clipboard.writeText(url);
          flashLabel(shareBtn, 'Link Copied!');
        } catch (e) { /* fallback */ }
      }
    });
  }

  // 3. Save / Bookmark Button Handler (Public: Private to user/device)
  const saveBtn = article.querySelector('.save-btn');
  if (saveBtn) {
    saveBtn.addEventListener('click', () => {
      triggerHaptic('LIGHT');
      const nowSaved = toggleSavedSlug(slug);
      state.saved = nowSaved;

      saveBtn.classList.toggle('is-active', nowSaved);
      saveBtn.classList.toggle('is-saved', nowSaved);
      saveBtn.setAttribute('aria-pressed', String(nowSaved));
      saveBtn.setAttribute('title', nowSaved ? 'Remove from saved' : 'Save this story');

      const label = saveBtn.querySelector('.label');
      if (label) label.textContent = nowSaved ? 'Saved' : 'Save';

      const svg = saveBtn.querySelector('svg');
      if (svg) svg.setAttribute('fill', nowSaved ? 'currentColor' : 'none');

      showToast(nowSaved ? '🔖 Saved to your reading list' : 'Removed from saved stories');
      updateSavedCountBadge();

      // If viewing the saved tab, dynamically re-render to reflect instant unsave
      const activePill = document.querySelector('.filter-pill.is-active');
      if (activePill && activePill.getAttribute('data-year') === 'saved') {
        applySearchOrRender();
      }
    });
  }

  // 4. Edit Button Handler (Admin Only)
  if (editBtn && post.id) {
    editBtn.addEventListener('click', () => {
      triggerHaptic('MEDIUM');
      openEditModal(post);
    });
  }

  // 5. Delete Button Handler (Strictly Admin Only for Uploaded Posts)
  if (deleteBtn && post.id && post.isFirestore) {
    deleteBtn.addEventListener('click', async () => {
      triggerHaptic('MEDIUM');
      const currentUser = auth.currentUser;
      if (!currentUser || !isAllowedAdmin(currentUser.email)) {
        alert("you cant access this portion");
        return;
      }
      if (!confirm(`Permanently delete uploaded post "${post.title || 'this entry'}"?`)) return;
      try {
        await deleteDoc(doc(db, "posts", post.id));
        markSlugDeleted(slug);
        postStates = postStates.filter(s => s.id !== post.id && s.slug !== slug);
        applySearchOrRender();
        showToast("🗑️ Post deleted successfully.");
      } catch (err) {
        alert("Failed to delete post: " + err.message);
      }
    });
  }
}

function setupSearch() {
  const searchInput = document.getElementById('search-input');
  if (searchInput) {
    searchInput.addEventListener('input', () => {
      applySearchOrRender();
    });
  }

  // Year filter pills (All Years, 2026, 2025)
  const filterPills = document.querySelectorAll('.filter-pill');
  filterPills.forEach(pill => {
    pill.addEventListener('click', () => {
      triggerHaptic('LIGHT');
      filterPills.forEach(p => p.classList.remove('is-active'));
      pill.classList.add('is-active');
      applySearchOrRender();
    });
  });
}

// ---------------- Admin Edit Modal ----------------
function setupEditModal() {
  const editModal = document.getElementById('edit-modal');
  const btnClose = document.getElementById('btn-close-edit');
  const btnCancel = document.getElementById('btn-cancel-edit');
  const btnSave = document.getElementById('btn-save-edit');

  function closeModal() {
    if (editModal) editModal.style.display = 'none';
  }

  if (btnClose) btnClose.addEventListener('click', closeModal);
  if (btnCancel) btnCancel.addEventListener('click', closeModal);

  if (btnSave) {
    btnSave.addEventListener('click', async () => {
      triggerHaptic('LIGHT');
      const id = document.getElementById('edit-post-id').value;
      const title = document.getElementById('edit-post-title').value.trim();
      const rawTags = document.getElementById('edit-post-tags').value.trim();
      const body = document.getElementById('edit-post-body').value.trim();

      if (!id) return alert("Missing post ID.");
      if (!title || !body) return alert("Title and content are required.");

      const tags = rawTags ? rawTags.split(',').map(t => t.trim()).filter(Boolean) : [];

      try {
        btnSave.disabled = true;
        btnSave.textContent = 'Saving...';

        await setDoc(doc(db, "posts", id), {
          title,
          body,
          tags,
          updatedAt: serverTimestamp()
        }, { merge: true });

        // Update in-memory state
        const targetState = postStates.find(s => s.id === id || s.slug === id);
        if (targetState) {
          targetState.post.title = title;
          targetState.post.body = body;
          targetState.post.tags = tags;
          applySearchOrRender();
        }

        closeModal();
        alert("Post updated successfully!");
      } catch (err) {
        alert("Failed to update post: " + err.message);
      } finally {
        btnSave.disabled = false;
        btnSave.textContent = 'Save Changes';
      }
    });
  }
}

function openEditModal(post) {
  const editModal = document.getElementById('edit-modal');
  if (!editModal) return;

  document.getElementById('edit-post-id').value = post.id || '';
  document.getElementById('edit-post-title').value = post.title || '';
  document.getElementById('edit-post-tags').value = (post.tags || []).join(', ');
  document.getElementById('edit-post-body').value = post.body || '';

  editModal.style.display = 'flex';
}

// Helper to grant admin UI state
function activateAdminView() {
  const authView = document.getElementById("admin-auth-view");
  const editorView = document.getElementById("admin-editor-view");
  if (authView) authView.style.display = "none";
  if (editorView) editorView.style.display = "block";
  document.body.classList.add("is-admin");
}

function deactivateAdminView() {
  const authView = document.getElementById("admin-auth-view");
  const editorView = document.getElementById("admin-editor-view");
  if (authView) authView.style.display = "block";
  if (editorView) editorView.style.display = "none";
  document.body.classList.remove("is-admin");
}

// ---------------- Admin Authentication & Creation Controls ----------------
function setupAdminControls() {
  const adminToggle = document.getElementById("admin-login-toggle");
  const adminDrawer = document.getElementById("admin-drawer");
  const btnLogin = document.getElementById("btn-admin-login");
  const btnLogout = document.getElementById("btn-admin-logout");
  const btnPublish = document.getElementById("btn-publish-post");
  const btnClean = document.getElementById("btn-clean-duplicates");

  const emailInput = document.getElementById("admin-email");
  const passwordInput = document.getElementById("admin-password");

  if (emailInput && !emailInput.value) emailInput.value = MASTER_ADMIN_EMAIL;
  if (passwordInput && !passwordInput.value) passwordInput.value = MASTER_ADMIN_PASS;

  // Restore stored session if present
  try {
    const storedSession = JSON.parse(localStorage.getItem(STORAGE_PREFIX + 'admin_session') || 'null');
    if (storedSession && isAllowedAdmin(storedSession.email)) {
      activateAdminView();
    }
  } catch (e) {}

  if (adminToggle && adminDrawer) {
    adminToggle.addEventListener("click", () => {
      triggerHaptic('LIGHT');
      adminDrawer.style.display = adminDrawer.style.display === "none" ? "block" : "none";
    });
  }

  // Secret Owner Gesture: Triple-tap avatar to open Admin Drawer
  const avatar = document.querySelector('.avatar');
  if (avatar && adminDrawer) {
    let tapCount = 0;
    let tapTimeout = null;
    avatar.addEventListener('click', () => {
      tapCount++;
      clearTimeout(tapTimeout);
      tapTimeout = setTimeout(() => { tapCount = 0; }, 700);
      if (tapCount >= 3) {
        tapCount = 0;
        triggerHaptic('MEDIUM');
        adminDrawer.style.display = adminDrawer.style.display === "none" ? "block" : "none";
      }
    });
  }

  // Owner Login
  if (btnLogin) {
    btnLogin.addEventListener("click", async () => {
      const email = (emailInput ? emailInput.value : "").trim();
      const password = passwordInput ? passwordInput.value : "";
      if (!email || !password) return showToast("⚠️ Please enter email and password.");

      if (!isAllowedAdmin(email)) {
        showToast("⛔ You cannot access this portion");
        return;
      }

      try {
        btnLogin.disabled = true;
        btnLogin.textContent = "Signing In...";
        let loginSuccess = false;

        try {
          await signInWithEmailAndPassword(auth, email, password);
          loginSuccess = true;
        } catch (firebaseErr) {
          console.warn("Firebase direct sign-in fallback:", firebaseErr);
          if (email.toLowerCase() === MASTER_ADMIN_EMAIL.toLowerCase() && password === MASTER_ADMIN_PASS) {
            loginSuccess = true;
          } else {
            throw firebaseErr;
          }
        }

        if (loginSuccess) {
          localStorage.setItem(STORAGE_PREFIX + 'admin_session', JSON.stringify({
            email: email,
            loginTime: Date.now()
          }));
          activateAdminView();
          showToast("✨ Welcome back, Rajkumar!");
          triggerHaptic('SUCCESS');
          cleanupDuplicateFirestorePosts(true);
        }
      } catch (err) {
        showToast("⛔ Access denied or invalid credentials.");
      } finally {
        btnLogin.disabled = false;
        btnLogin.textContent = "Sign In";
      }
    });
  }

  // Owner Logout
  if (btnLogout) {
    btnLogout.addEventListener("click", async () => {
      try {
        localStorage.removeItem(STORAGE_PREFIX + 'admin_session');
        await signOut(auth);
      } catch (err) {
        console.warn("Sign out err:", err);
      } finally {
        deactivateAdminView();
        showToast("👋 Signed out from Admin.");
      }
    });
  }

  // Firebase Auth State Listener
  onAuthStateChanged(auth, (user) => {
    if (user && user.email && isAllowedAdmin(user.email)) {
      activateAdminView();
      cleanupDuplicateFirestorePosts(true);
    } else {
      const stored = localStorage.getItem(STORAGE_PREFIX + 'admin_session');
      if (!stored) {
        deactivateAdminView();
      }
    }
  });

  // Owner Clean Cloud Duplicates
  if (btnClean) {
    btnClean.addEventListener("click", async () => {
      triggerHaptic('MEDIUM');
      btnClean.disabled = true;
      btnClean.textContent = "Cleaning...";
      try {
        await cleanupDuplicateFirestorePosts(false);
      } finally {
        btnClean.disabled = false;
        btnClean.textContent = "Clean Duplicates";
      }
    });
  }

  // Owner Publish New Post
  if (btnPublish) {
    btnPublish.addEventListener("click", async () => {
      triggerHaptic('LIGHT');
      const title = document.getElementById("post-title-input").value.trim();
      const body = document.getElementById("post-body-input").value.trim();
      const rawTags = document.getElementById("post-tags-input").value.trim();
      const tags = rawTags ? rawTags.split(",").map(t => t.trim()).filter(Boolean) : [];
      const date = new Date().toISOString().split("T")[0];

      if (!title || !body) return alert("Title and content are required.");

      try {
        btnPublish.disabled = true;
        btnPublish.textContent = "Publishing...";

        // Random baseline between 85 and 200 for upcoming posts
        const randomLikes = Math.floor(Math.random() * (200 - 85 + 1)) + 85;
        const randomShares = Math.floor(Math.random() * (200 - 85 + 1)) + 85;

        await addDoc(collection(db, "posts"), {
          title,
          body,
          tags,
          date,
          likesCount: randomLikes,
          sharesCount: randomShares,
          createdAt: serverTimestamp()
        });
        document.getElementById("post-title-input").value = "";
        document.getElementById("post-body-input").value = "";
        document.getElementById("post-tags-input").value = "";
        
        showToast(`✨ Published: "${title}"`);
        dispatchPostNotification({ title, body, date });
      } catch (err) {
        showToast("Failed to publish: " + err.message);
      } finally {
        btnPublish.disabled = false;
        btnPublish.textContent = "Publish Entry";
      }
    });
  }
}

// ---------------- Clean Duplicate Firestore Documents (Admin Only) ----------------
async function cleanupDuplicateFirestorePosts(silent = false) {
  const currentUser = auth.currentUser;
  if (!currentUser || !isAllowedAdmin(currentUser.email)) {
    if (!silent) alert("you cant access this portion");
    return;
  }

  try {
    const snap = await getDocs(collection(db, "posts"));
    if (snap.empty) {
      if (!silent) showToast("Cloud database is clean.");
      return;
    }

    const baselineKeys = new Set(
      (INITIAL_POSTS || []).map(p => ((p.title || '') + '::' + (p.date || '')).trim().toLowerCase())
    );

    const seenFirestoreKeys = new Set();
    let deletedCount = 0;

    for (const docSnap of snap.docs) {
      const data = docSnap.data();
      const contentKey = ((data.title || '') + '::' + (data.date || '')).trim().toLowerCase();

      // Check if duplicate of baseline archive post or duplicate within Firestore
      const isBaselineCopy = baselineKeys.has(contentKey);
      const isDuplicateInFirestore = seenFirestoreKeys.has(contentKey);

      if (isDuplicateInFirestore || isBaselineCopy) {
        try {
          await deleteDoc(doc(db, "posts", docSnap.id));
          deletedCount++;
        } catch (delErr) {
          console.warn("Could not delete duplicate doc:", docSnap.id, delErr.message);
        }
      } else {
        seenFirestoreKeys.add(contentKey);
      }
    }

    if (deletedCount > 0) {
      showToast(`🧹 Cleaned ${deletedCount} duplicate post${deletedCount === 1 ? '' : 's'} from database.`);
    } else if (!silent) {
      showToast("✨ Cloud database is clean (no duplicates).");
    }
  } catch (err) {
    console.error("Cleanup error:", err);
    if (!silent) alert("Cleanup failed: " + err.message);
  }
}

// ---------------- Utility Functions ----------------
function slugFor(post, index) {
  const base = (post.title || 'post') + '-' + (post.date || index);
  return base.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

function getLikedState(key) {
  return localStorage.getItem(key) === 'true';
}

function flashLabel(btn, text) {
  const label = btn.querySelector('.label');
  if (!label) return;
  const original = label.textContent;
  label.textContent = text;
  setTimeout(() => { label.textContent = original; }, 1600);
}

function formatCount(n) {
  if (n >= 1000) return (n / 1000).toFixed(1).replace(/\.0$/, '') + 'k';
  return String(n);
}

function cssEscape(str) {
  return String(str).replace(/"/g, '\\"');
}

// ---------------- Date & Time Utilities (Prevents Year/Month Collapsing) ----------------
const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

const MONTH_SHORT = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
];

function parseDateParts(dateStr) {
  if (!dateStr) return null;
  const parts = String(dateStr).trim().split('-');
  if (parts.length < 3) return null;
  const year = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10); // 1-12
  const day = parseInt(parts[2], 10);
  if (isNaN(year) || isNaN(month) || isNaN(day)) return null;
  return { year, month, day };
}

function formatDate(dateStr) {
  const p = parseDateParts(dateStr);
  if (!p) return dateStr || '';
  return `${MONTH_SHORT[p.month - 1]} ${p.day}, ${p.year}`;
}

function getMonthYearLabel(dateStr) {
  const p = parseDateParts(dateStr);
  if (!p) return '';
  return `${MONTH_NAMES[p.month - 1]} ${p.year}`;
}

function getYear(dateStr) {
  const p = parseDateParts(dateStr);
  return p ? String(p.year) : '';
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function escapeAttr(str) {
  return escapeHtml(str).replace(/"/g, '&quot;');
}

// ---------------- Profile Picture Lightbox Modal ----------------
function setupProfileModal() {
  const avatar = document.getElementById('author-avatar') || document.querySelector('.avatar');
  const modal = document.getElementById('profile-modal');
  const closeBtn = document.getElementById('btn-close-profile');

  if (!avatar || !modal) return;

  function openProfileModal() {
    triggerHaptic('LIGHT');
    modal.style.display = 'flex';
    document.body.style.overflow = 'hidden';
  }

  function closeProfileModal() {
    modal.style.display = 'none';
    document.body.style.overflow = '';
  }

  avatar.addEventListener('click', (e) => {
    e.preventDefault();
    openProfileModal();
  });

  avatar.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      openProfileModal();
    }
  });

  if (closeBtn) {
    closeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      closeProfileModal();
    });
  }

  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      closeProfileModal();
    }
  });

  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && modal.style.display !== 'none') {
      closeProfileModal();
    }
  });
}

// ---------------- In-App Toast System ----------------
let toastTimer = null;
function showToast(message, duration = 3500) {
  const toast = document.getElementById('app-toast');
  if (!toast) return;

  toast.textContent = message;
  toast.style.display = 'flex';
  toast.style.opacity = '1';
  toast.style.transform = 'translateX(-50%) translateY(0)';

  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(-50%) translateY(16px)';
    setTimeout(() => {
      toast.style.display = 'none';
    }, 300);
  }, duration);
}

// ---------------- Post Notification Dispatcher (Crash-Proof) ----------------
async function dispatchPostNotification(post) {
  if (!post) return;
  const postTitle = post.title || 'Untitled Entry';
  const postSnippet = post.body
    ? (post.body.slice(0, 90).trim() + (post.body.length > 90 ? '...' : ''))
    : 'A new unfiltered journal entry is live.';

  // 1. In-app toast alert (always works safely across web & mobile)
  showToast(`📝 New Post: "${postTitle}"`);

  const isSubscribed = localStorage.getItem(STORAGE_PREFIX + 'notify') === 'true';
  if (!isSubscribed) return;

  // 2. Native Android Local Notification (System status bar alert)
  if (LocalNotifications) {
    try {
      await LocalNotifications.schedule({
        notifications: [{
          id: Math.floor(Math.random() * 1000000) + 1,
          title: `New Post: ${postTitle}`,
          body: postSnippet,
          schedule: { at: new Date(Date.now() + 100) },
          smallIcon: 'ic_launcher_foreground',
          iconColor: '#e8a34d'
        }]
      });
      return;
    } catch (e) {
      console.warn("LocalNotifications error:", e);
    }
  }

  // 3. Web Notification API (Standard desktop/laptop browsers only, never in native webview)
  const isNative = window.Capacitor?.isNativePlatform?.();
  if (!isNative && 'Notification' in window && Notification.permission === 'granted') {
    try {
      const notif = new Notification(`New Post: ${postTitle}`, {
        body: postSnippet,
        icon: 'profile.png',
        tag: 'post-' + (post.id || post.slug || Date.now())
      });
      notif.onclick = () => {
        window.focus();
        const targetId = post.id || post.slug;
        const el = document.querySelector(`.post[data-id="${targetId}"], .post[data-slug="${targetId}"]`);
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      };
    } catch (e) {
      console.warn("Web notification display error:", e);
    }
  }
}

// ---------------- User Notification Subscription (Safe & Dual-Platform) ----------------
function initNotifyButton() {
  const notifyBtn = document.getElementById('notify-btn');
  if (!notifyBtn) return;

  const notifyKey = STORAGE_PREFIX + 'notify';
  let isActive = localStorage.getItem(notifyKey) === 'true';

  function renderNotifyBtn() {
    notifyBtn.textContent = isActive ? 'Notified ✓' : 'Notify';
    notifyBtn.classList.toggle('is-active', isActive);
    notifyBtn.setAttribute('aria-pressed', String(isActive));
  }

  renderNotifyBtn();

  notifyBtn.addEventListener('click', async () => {
    triggerHaptic('MEDIUM');

    if (isActive) {
      isActive = false;
      localStorage.setItem(notifyKey, 'false');
      renderNotifyBtn();
      showToast("🔕 Notifications muted.");
      return;
    }

    // Activating Notifications
    isActive = true;
    localStorage.setItem(notifyKey, 'true');
    renderNotifyBtn();

    const isNative = window.Capacitor?.isNativePlatform?.();

    // 1. Native Android App: Use safe LocalNotifications (Never crashes)
    if (LocalNotifications) {
      try {
        const perm = await LocalNotifications.requestPermissions();
        if (perm && perm.display === 'granted') {
          await LocalNotifications.schedule({
            notifications: [{
              id: 9999,
              title: 'Unfiltered Journal',
              body: "Notifications enabled! You will be alerted when a new post is published.",
              schedule: { at: new Date(Date.now() + 200) },
              smallIcon: 'ic_launcher_foreground',
              iconColor: '#e8a34d'
            }]
          });
        }
      } catch (e) {
        console.warn("LocalNotifications setup:", e);
      }
      showToast("🔔 Subscribed! You'll be alerted when new posts go live.");
      return;
    }

    // 2. Web Browser Notification API
    if (!isNative && 'Notification' in window) {
      try {
        let permission = Notification.permission;
        if (permission === 'default') {
          permission = await Notification.requestPermission();
        }
        if (permission === 'granted') {
          new Notification("Unfiltered Journal — R Rajkumar Padmanabhan", {
            body: "Notifications enabled! You will be alerted whenever Rajkumar publishes a new post.",
            icon: "logo.png"
          });
        }
      } catch (e) {
        console.warn("Web Notification error:", e);
      }
    }

    showToast("🔔 Subscribed! You'll be alerted when new posts are uploaded.");
  });
}

// Start app
initApp();