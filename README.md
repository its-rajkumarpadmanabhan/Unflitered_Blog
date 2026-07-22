# Raj — Personal Journal

A simple personal blog. Posts are split into one file per month inside the **`content/`** folder — e.g. `content/july.js` holds July's posts, `content/january.js` would hold January's. All of them get combined and shown together on the main page, newest first.

## Files

```
index.html            the page
style.css             styling
script.js             combines every content/*.js file and draws the posts
content/
  about.js            your bio, shown in the sidebar
  july.js             July's posts
  template-month.js   copy this to start a new month
assets/
  profile.jpg          your photo, shown in the header
```

## Adding a new post to an existing month

Open the matching file, e.g. `content/july.js`, and add an object to the array passed to `.push(...)`:

```js
{
  "date": "2026-07-22",
  "title": "My new post",
  "body": "Whatever you want to say.",
  "image": "assets/some-photo.jpg",
  "tags": ["life", "code"]
},
```

- `date` — used to sort posts, newest first. Format: `YYYY-MM-DD`.
- `title` — post heading.
- `body` — the post text.
- `image` — optional. Path to an image (drop it in `assets/` and reference it here). Leave as `""` to skip.
- `tags` — optional list of short labels shown under the post.

Make sure there's a comma between post objects (it's a JavaScript array, not raw JSON). Save the file and reload the page.

## Starting a new month

1. Copy `content/template-month.js` to a new file named after the month, e.g. `content/january.js`.
2. Fill in its posts array following the same format as above.
3. Open `index.html` and add a script tag for it, next to the others:
   ```html
   <script src="content/about.js"></script>
   <script src="content/july.js"></script>
   <script src="content/january.js"></script>
   <script src="script.js"></script>
   ```
4. Save both files and reload — the new month's posts appear mixed in with everything else, sorted by date automatically. Order of the script tags doesn't matter.

To change your bio, edit `content/about.js`.

To change your photo, replace `assets/profile.jpg` with a new image (keep the same filename, or update the `src` in `index.html`).

## Hosting on GitHub Pages

1. Create a new repository on GitHub (e.g. `raj-journal`).
2. Push these files to the repo root:
   ```
   git init
   git add .
   git commit -m "Initial blog"
   git branch -M main
   git remote add origin https://github.com/<your-username>/<repo-name>.git
   git push -u origin main
   ```
3. On GitHub: go to **Settings → Pages**.
4. Under **Build and deployment**, set **Source** to `Deploy from a branch`, branch `main`, folder `/ (root)`. Save.
5. GitHub gives you a URL like `https://<your-username>.github.io/<repo-name>/` — that's your live site.

From then on, every time you edit a file in `content/` (or add photos to `assets/`) and push to GitHub, the live site updates within a minute or two — no separate "upload" step required.

## Like / share counts

Every post gets a like button and a share button. Counts start somewhere above 128 the first time a post is shown, tick up a little on each page load, and then keep climbing on their own every 5 seconds while the page stays open — so the site feels alive rather than static. They're stored in the visitor's own browser (`localStorage`), so:

- Clicking **Like** adds exactly 1 and turns the heart solid; clicking again removes it.
- Clicking **Share** adds 1 each time, copies a link to that post (or opens the device's native share sheet on mobile), and can be clicked repeatedly.
- Counts are per-visitor — everyone sees their own growing numbers, since this is a static site with no shared backend. If you want one real, shared counter across all visitors later, that would need a small backend or a service like Firebase — just ask and I can wire that in.

## Search

There's a search box next to "Newest first" above the journal feed. Typing filters posts live, matching against the title, body text, and tags of every entry across all your `content/*.js` files — no page reload, no server. Clear the box to see everything again.

## Note on local previews

Double-clicking `index.html` on your computer works fine for previewing, since every file in `content/` is loaded as a plain script rather than fetched. (An earlier version of this site used a single `content.json` with `fetch()`, which browsers block when opening files locally with `file://` — that's why posts live in `content/*.js` script files instead.)
