const STORAGE_PREFIX = 'raj-blog:';
const LIKE_AUTO_INTERVAL_MS = 2 * 60 * 60 * 1000; // 2 hours — auto +10 likes
const LIKE_AUTO_AMOUNT = 10;
const POLL_INTERVAL_MS = 20 * 1000; // 20 seconds — check for new posts live, no reload

let postStates = []; // [{ post, slug, likeBase, shareBase, liked }]

function loadContent() {
  const postsEl = document.getElementById('posts');
  const aboutEl = document.getElementById('about-text');
  const countEl = document.getElementById('entry-count');
  const searchInput = document.getElementById('search-input');

  const rawPosts = window.SITE_POSTS;

  if (!rawPosts) {
    postsEl.innerHTML = '<p class="empty-state">Couldn\'t find any content/*.js files. Make sure they\'re loaded (as script tags in index.html) before script.js.</p>';
    return;
  }

  if (window.SITE_ABOUT) aboutEl.textContent = window.SITE_ABOUT;

  resetCountsIfNeeded();

  const posts = rawPosts.slice().sort((a, b) => new Date(b.date) - new Date(a.date));
  countEl.textContent = posts.length;
  checkForNewPosts(posts);

  if (posts.length === 0) {
    postsEl.innerHTML = '<p class="empty-state">No entries yet. Add one to a file in content/.</p>';
    return;
  }

  // build persistent state for every post (counts loaded/initialized once here)
  postStates = posts.map((post, i) => {
    const slug = slugFor(post, i);
    const state = {
      post,
      slug,
      likeBase: getGrowingCount(STORAGE_PREFIX + 'likes:' + slug, 105, 259),
      shareBase: getGrowingCount(STORAGE_PREFIX + 'shares:' + slug, 105, 209),
      liked: getLikedState(STORAGE_PREFIX + 'liked:' + slug)
    };
    applyLikeAutoIncrement(state);
    return state;
  });

  renderList(postStates);

  // while the page stays open, add 10 likes every 2 hours
  setInterval(() => {
    postStates.forEach(state => {
      state.likeBase += LIKE_AUTO_AMOUNT;
      localStorage.setItem(STORAGE_PREFIX + 'likes:' + state.slug, String(state.likeBase));
      localStorage.setItem(STORAGE_PREFIX + 'likes-ts:' + state.slug, String(Date.now()));
      updateCountsDisplay(state);
    });
  }, LIKE_AUTO_INTERVAL_MS);

  searchInput.addEventListener('input', () => {
    const term = searchInput.value.trim().toLowerCase();
    if (!term) {
      renderList(postStates);
      return;
    }
    const filtered = postStates.filter(s => matchesSearch(s.post, term));
    renderList(filtered, term);
  });

  // check live (without needing a refresh) for newly published posts
  setInterval(pollForNewPosts, POLL_INTERVAL_MS);
}

function matchesSearch(post, term) {
  const haystack = [
    post.title || '',
    post.body || '',
    ...(post.tags || [])
  ].join(' ').toLowerCase();
  return haystack.includes(term);
}

function renderList(states, term) {
  const postsEl = document.getElementById('posts');

  if (states.length === 0) {
    postsEl.innerHTML = `<p class="empty-state">No entries match "${escapeHtml(term || '')}".</p>`;
    return;
  }

  postsEl.innerHTML = states.map(renderPost).join('');
  states.forEach(s => attachPostHandlers(s.slug));
}

// stable id for a post so its stats persist even if other posts are added later
function slugFor(post, index) {
  const base = (post.title || 'post') + '-' + (post.date || index);
  return base.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

/* ---------- like / share stats ---------- */

// One-time cleanup: wipes any like/share counts saved under old ranges so
// every post regenerates fresh within 105-259 (likes) / 105-209 (shares).
// Runs once per browser, guarded by COUNTS_RESET_KEY, then never again.
const COUNTS_RESET_KEY = STORAGE_PREFIX + 'counts-reset-v2';
function resetCountsIfNeeded() {
  if (localStorage.getItem(COUNTS_RESET_KEY) === 'true') return;

  Object.keys(localStorage).forEach(key => {
    if (
      key.startsWith(STORAGE_PREFIX + 'likes:') ||
      key.startsWith(STORAGE_PREFIX + 'shares:') ||
      key.startsWith(STORAGE_PREFIX + 'likes-ts:')
    ) {
      localStorage.removeItem(key);
    }
  });

  localStorage.setItem(COUNTS_RESET_KEY, 'true');
}

// Base count, set once per post the first time it's ever shown (105-259 for
// likes, 105-209 for shares) and otherwise left untouched on reload — only
// clicks, or the 2-hour auto-bump below, change it after that.
function getGrowingCount(key, min = 105, max = 209) {
  const stored = localStorage.getItem(key);
  let value;
  if (stored === null) {
    value = min + Math.floor(Math.random() * (max - min + 1));
    localStorage.setItem(key, String(value));
  } else {
    value = parseInt(stored, 10);
  }
  return value;
}

function getLikedState(key) {
  return localStorage.getItem(key) === 'true';
}

// adds 10 likes for every full 2-hour period that has elapsed in real time
// since the last check — works even if the page was closed/reloaded
function applyLikeAutoIncrement(state) {
  const tsKey = STORAGE_PREFIX + 'likes-ts:' + state.slug;
  const now = Date.now();
  const storedTs = localStorage.getItem(tsKey);

  if (storedTs === null) {
    localStorage.setItem(tsKey, String(now));
    return;
  }

  const elapsed = now - parseInt(storedTs, 10);
  const periods = Math.floor(elapsed / LIKE_AUTO_INTERVAL_MS);

  if (periods > 0) {
    state.likeBase += periods * LIKE_AUTO_AMOUNT;
    const newTs = parseInt(storedTs, 10) + periods * LIKE_AUTO_INTERVAL_MS;
    localStorage.setItem(STORAGE_PREFIX + 'likes:' + state.slug, String(state.likeBase));
    localStorage.setItem(tsKey, String(newTs));
  }
}

function updateCountsDisplay(state) {
  const article = document.querySelector(`.post[data-slug="${cssEscape(state.slug)}"]`);
  if (!article) return; // not currently visible (e.g. filtered out by search)
  const likeCountEl = article.querySelector('[data-role="like-count"]');
  const shareCountEl = article.querySelector('[data-role="share-count"]');
  if (likeCountEl) likeCountEl.textContent = formatCount(state.likeBase + (state.liked ? 1 : 0));
  if (shareCountEl) shareCountEl.textContent = formatCount(state.shareBase);
}

function renderPost(state) {
  const { post, slug, likeBase, shareBase, liked } = state;
  const dateLabel = formatDate(post.date);
  const tags = (post.tags || [])
    .map(t => `<span>${escapeHtml(t)}</span>`)
    .join('');
  const image = post.image
    ? `<img src="${escapeAttr(post.image)}" alt="${escapeAttr(post.title || '')}">`
    : '';

  const likeCount = likeBase + (liked ? 1 : 0);

  return `
    <article class="post" data-slug="${escapeAttr(slug)}">
      <div class="post-date">${dateLabel}</div>
      <h3>${escapeHtml(post.title || 'Untitled')}</h3>
      <p>${escapeHtml(post.body || '')}</p>
      ${image}
      ${tags ? `<div class="post-tags">${tags}</div>` : ''}
      <div class="post-actions">
        <button class="action-btn like-btn ${liked ? 'is-active' : ''}" data-slug="${escapeAttr(slug)}" aria-pressed="${liked}">
          <span class="icon">${liked ? '♥' : '♡'}</span>
          <span class="label">Like</span>
          <span class="count" data-role="like-count">${formatCount(likeCount)}</span>
        </button>
        <button class="action-btn share-btn" data-slug="${escapeAttr(slug)}">
          <span class="icon">⤴</span>
          <span class="label">Share</span>
          <span class="count" data-role="share-count">${formatCount(shareBase)}</span>
        </button>
      </div>
    </article>
  `;
}

function attachPostHandlers(slug) {
  const article = document.querySelector(`.post[data-slug="${cssEscape(slug)}"]`);
  if (!article) return;
  const state = postStates.find(s => s.slug === slug);
  if (!state) return;

  const likeBtn = article.querySelector('.like-btn');
  const shareBtn = article.querySelector('.share-btn');

  likeBtn.addEventListener('click', () => {
    state.liked = !state.liked;
    localStorage.setItem(STORAGE_PREFIX + 'liked:' + slug, String(state.liked));

    likeBtn.querySelector('[data-role="like-count"]').textContent = formatCount(state.likeBase + (state.liked ? 1 : 0));
    likeBtn.querySelector('.icon').textContent = state.liked ? '♥' : '♡';
    likeBtn.classList.toggle('is-active', state.liked);
    likeBtn.setAttribute('aria-pressed', String(state.liked));
  });

  shareBtn.addEventListener('click', async () => {
    state.shareBase += 1;
    localStorage.setItem(STORAGE_PREFIX + 'shares:' + slug, String(state.shareBase));
    shareBtn.querySelector('[data-role="share-count"]').textContent = formatCount(state.shareBase);

    const url = window.location.href.split('#')[0] + '#' + slug;
    if (navigator.share) {
      try {
        await navigator.share({ title: document.title, url });
      } catch (e) { /* user cancelled, ignore */ }
    } else if (navigator.clipboard) {
      try {
        await navigator.clipboard.writeText(url);
        flashLabel(shareBtn, 'Copied!');
      } catch (e) { /* clipboard unavailable, ignore */ }
    }
  });
}

function flashLabel(btn, text) {
  const label = btn.querySelector('.label');
  const original = label.textContent;
  label.textContent = text;
  setTimeout(() => { label.textContent = original; }, 1500);
}

function formatCount(n) {
  if (n >= 1000) return (n / 1000).toFixed(1).replace(/\.0$/, '') + 'k';
  return String(n);
}

function cssEscape(str) {
  return String(str).replace(/"/g, '\\"');
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d)) return dateStr;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
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

/* ---------- notify on new post ---------- */
// This is a static GitHub Pages site with no server, so there's no way to
// wake a fully closed browser (that needs real Web Push + a backend). What
// this DOES do, and does automatically: while this tab is open (even in the
// background, even if you're on another app), it quietly re-checks your
// content/*.js files every 20 seconds. The instant it finds a post that
// wasn't there before, it fires a notification and drops the new post into
// the feed — no refresh needed.

function initNotifyButton() {
  const notifyBtn = document.getElementById('notify-btn');
  if (!notifyBtn) return;

  const notifyKey = STORAGE_PREFIX + 'notify';
  let isActive = localStorage.getItem(notifyKey) === 'true'
    && 'Notification' in window
    && Notification.permission === 'granted';

  renderNotifyBtn();

  notifyBtn.addEventListener('click', async () => {
    if (isActive) {
      isActive = false;
      localStorage.setItem(notifyKey, 'false');
      renderNotifyBtn();
      return;
    }

    if (!('Notification' in window)) {
      alert("This browser doesn't support notifications.");
      return;
    }

    let permission = Notification.permission;
    if (permission === 'default') {
      permission = await Notification.requestPermission();
    }

    if (permission === 'granted') {
      isActive = true;
      localStorage.setItem(notifyKey, 'true');
      new Notification('Notifications on', {
        body: 'Keep this tab open and you\'ll get notified the moment a new entry goes up.'
      });
    } else {
      alert('Notifications are blocked for this site. Enable them in your browser/site settings to turn this on.');
    }
    renderNotifyBtn();
  });

  function renderNotifyBtn() {
    notifyBtn.textContent = isActive ? 'Notified ✓' : 'Notify';
    notifyBtn.classList.toggle('is-active', isActive);
    notifyBtn.setAttribute('aria-pressed', String(isActive));
  }
}

// on initial load: compares today's posts to what this visitor last saw
// (covers the case where they closed the browser and a post went up meanwhile)
function checkForNewPosts(posts) {
  const seenKey = STORAGE_PREFIX + 'seen-posts';
  const currentSlugs = posts.map((post, i) => slugFor(post, i));
  const storedSeen = localStorage.getItem(seenKey);

  if (storedSeen === null) {
    localStorage.setItem(seenKey, JSON.stringify(currentSlugs));
    return;
  }

  let seenSlugs = [];
  try { seenSlugs = JSON.parse(storedSeen); } catch (e) { /* ignore corrupt value */ }

  const newPosts = posts.filter((post, i) => !seenSlugs.includes(currentSlugs[i]));
  if (newPosts.length > 0) notifyNewPosts(newPosts);

  localStorage.setItem(seenKey, JSON.stringify(currentSlugs));
}

function notifyNewPosts(posts) {
  const notifyKey = STORAGE_PREFIX + 'notify';
  const isActive = localStorage.getItem(notifyKey) === 'true';
  const canNotify = 'Notification' in window && Notification.permission === 'granted';
  if (!isActive || !canNotify) return;

  if (posts.length === 1) {
    new Notification('New post from R Rajkumar Padmanabhan', {
      body: posts[0].title || 'A new entry was just posted.'
    });
  } else {
    new Notification('New posts from R Rajkumar Padmanabhan', {
      body: `${posts.length} new entries were just posted.`
    });
  }
}

// finds every content/*.js script tag on the page (except script.js/about.js)
function getContentScriptSrcs() {
  return Array.from(document.querySelectorAll('script[src]'))
    .map(el => el.getAttribute('src'))
    .filter(src => src && !src.endsWith('script.js') && !/about\.js$/i.test(src));
}

// re-fetches every content file fresh (bypassing cache) and re-runs it
// against a sandboxed fake `window` to pull out the current SITE_POSTS array,
// without disturbing the real page state
async function fetchLatestPosts() {
  const srcs = getContentScriptSrcs();
  const fakeWindow = { SITE_POSTS: [] };

  await Promise.all(srcs.map(async (src) => {
    try {
      const bustCache = src + (src.includes('?') ? '&' : '?') + '_=' + Date.now();
      const res = await fetch(bustCache, { cache: 'no-store' });
      if (!res.ok) return;
      const code = await res.text();
      const runInFakeWindow = new Function('window', code);
      runInFakeWindow(fakeWindow);
    } catch (e) {
      // one file failing (e.g. offline) shouldn't break the rest
    }
  }));

  return fakeWindow.SITE_POSTS;
}

// runs every POLL_INTERVAL_MS: checks for brand-new posts, adds them to the
// live feed, and notifies — all without a page refresh
async function pollForNewPosts() {
  let latestRaw;
  try {
    latestRaw = await fetchLatestPosts();
  } catch (e) {
    return;
  }
  if (!latestRaw || !latestRaw.length) return;

  const sorted = latestRaw.slice().sort((a, b) => new Date(b.date) - new Date(a.date));
  const knownSlugs = new Set(postStates.map(s => s.slug));
  const brandNew = [];

  sorted.forEach((post, i) => {
    const slug = slugFor(post, i);
    if (!knownSlugs.has(slug)) brandNew.push({ post, slug });
  });

  if (brandNew.length === 0) return;

  brandNew.forEach(({ post, slug }) => {
    postStates.push({
      post,
      slug,
      likeBase: getGrowingCount(STORAGE_PREFIX + 'likes:' + slug, 105, 259),
      shareBase: getGrowingCount(STORAGE_PREFIX + 'shares:' + slug, 105, 209),
      liked: getLikedState(STORAGE_PREFIX + 'liked:' + slug)
    });
  });

  postStates.sort((a, b) => new Date(b.post.date) - new Date(a.post.date));

  const countEl = document.getElementById('entry-count');
  if (countEl) countEl.textContent = postStates.length;

  const searchInput = document.getElementById('search-input');
  const term = searchInput ? searchInput.value.trim().toLowerCase() : '';
  if (term) {
    renderList(postStates.filter(s => matchesSearch(s.post, term)), term);
  } else {
    renderList(postStates);
  }

  notifyNewPosts(brandNew.map(b => b.post));

  const seenKey = STORAGE_PREFIX + 'seen-posts';
  localStorage.setItem(seenKey, JSON.stringify(postStates.map(s => s.slug)));
}

loadContent();
initNotifyButton();