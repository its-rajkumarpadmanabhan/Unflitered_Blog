// TEMPLATE — copy this file to make a new month, e.g. content/january.js,
// content/february.js, etc. Rename the file, then:
//   1. Fill in the posts array below.
//   2. Add a <script src="content/january.js"></script> line in index.html,
//      next to the other content/*.js script tags.
// That's it — the post shows up on the main page automatically, sorted by
// date alongside every other month's posts.

window.SITE_POSTS = window.SITE_POSTS || [];
window.SITE_POSTS.push(
  {
    "date": "2026-01-05",       // YYYY-MM-DD, used to sort newest-first
    "title": "Example post title",
    "body": "Whatever you want to say in this entry.",
    "image": "",                // optional path, e.g. "assets/photo.jpg"
    "tags": ["example"]         // optional short labels
  }
  // add more objects here, separated by commas
);
