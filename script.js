const STORAGE_PREFIX = 'raj-blog:';
const TICK_INTERVAL_MS = 5000;

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

  const posts = rawPosts.slice().sort((a, b) => new Date(b.date) - new Date(a.date));
  countEl.textContent = posts.length;

  if (posts.length === 0) {
    postsEl.innerHTML = '<p class="empty-state">No entries yet. Add one to a file in content/.</p>';
    return;
  }

  // build persistent state for every post (counts loaded/initialized once here)
  postStates = posts.map((post, i) => {
    const slug = slugFor(post, i);
    return {
      post,
      slug,
      likeBase: getGrowingCount(STORAGE_PREFIX + 'likes:' + slug),
      shareBase: getGrowingCount(STORAGE_PREFIX + 'shares:' + slug),
      liked: getLikedState(STORAGE_PREFIX + 'liked:' + slug)
    };
  });

  renderList(postStates);

  searchInput.addEventListener('input', () => {
    const term = searchInput.value.trim().toLowerCase();
    if (!term) {
      renderList(postStates);
      return;
    }
    const filtered = postStates.filter(s => matchesSearch(s.post, term));
    renderList(filtered, term);
  });

  // simulate other visitors liking/sharing over time
  setInterval(tickCounts, TICK_INTERVAL_MS);
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

// Base count that quietly grows a little on every page load, simulating other
// visitors. Starts somewhere above 128 the first time a post is ever shown.
function getGrowingCount(key, min = 128, max = 260) {
  const stored = localStorage.getItem(key);
  let value;
  if (stored === null) {
    value = min + Math.floor(Math.random() * (max - min + 1));
  } else {
    value = parseInt(stored, 10) + Math.floor(Math.random() * 5) + 1; // +1 to +5 each visit
  }
  localStorage.setItem(key, String(value));
  return value;
}

function getLikedState(key) {
  return localStorage.getItem(key) === 'true';
}

// runs every TICK_INTERVAL_MS to make counts feel alive after the first bump
function tickCounts() {
  postStates.forEach(state => {
    const likeBump = Math.floor(Math.random() * 3) + 1; // +1 to +3
    const shareBump = Math.floor(Math.random() * 2) + 1; // +1 to +2
    state.likeBase += likeBump;
    state.shareBase += shareBump;
    localStorage.setItem(STORAGE_PREFIX + 'likes:' + state.slug, String(state.likeBase));
    localStorage.setItem(STORAGE_PREFIX + 'shares:' + state.slug, String(state.shareBase));
    updateCountsDisplay(state);
  });
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

loadContent();
