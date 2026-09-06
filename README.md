<img width="1899" height="939" alt="image" src="https://github.com/user-attachments/assets/360ad3e6-4822-4fb3-84b6-7e432c9530f5" />

# Migration Plan: Firebase Firestore, Admin Panel & Capacitor APK

Migrate the static, month-file-based blog into a dynamic, real-time Firestore-backed application with Firebase Authentication, an Admin Drawer for post creation & deletion, real Firestore likes, and a Capacitor Android app container.

## User Review Required

> [!IMPORTANT]
> **Firebase API Key & Credentials**
> In the configuration provided:
> ```javascript
> const firebaseConfig = {
>   apiKey: "YOUR_API_KEY",
>   authDomain: "unfiltered-journal-b146e.firebaseapp.com",
>   projectId: "unfiltered-journal-b146e",
>   storageBucket: "unfiltered-journal-b146e.appspot.com",
>   messagingSenderId: "...",
>   appId: "..."
> };
> ```
> We will configure a dedicated, clean config file `firebase-config.js` (or in `script.js`) where you can easily verify or paste your complete Firebase Web App configuration from your Firebase Console.
>
> **Existing Posts Preservation**:
> We will provide a built-in one-click "Seed Existing Posts" button in the Admin view (and a CLI migration script `seed.js`) that imports all 12 existing monthly posts (`jan.js` - `dec.js`) into Firestore automatically so your journal is immediately populated.

---

## Proposed Changes

### Phase 1: Modularize & Connect Firestore in `script.js`
Replace static script file loading and local polling loops with Firebase Firestore real-time snapshot listeners.

#### [NEW] [firebase-config.js](file:///c:/Users/user/Desktop/Unflitered_Blog/firebase-config.js)
- Holds the Firebase configuration object and initializes Firebase App, Auth, and Firestore instances using CDN ES modules (`firebasejs/10.8.0`).
- Exports `app`, `auth`, `db`, and helper methods.

#### [MODIFY] [script.js](file:///c:/Users/user/Desktop/Unflitered_Blog/script.js)
- Convert to ES Module (`<script type="module" src="script.js">`).
- Replace `loadContent` / static month array iteration with real-time `onSnapshot(query(collection(db, "posts"), orderBy("date", "desc")))`.
- Keep the instant search filtering, date formatting, and bio display.
- Retain backwards-compatibility so if Firestore is offline or still being configured, it can fall back gracefully.

---

### Phase 2: Admin Post Creation & Authentication Controls

#### [MODIFY] [index.html](file:///c:/Users/user/Desktop/Unflitered_Blog/index.html)
- Remove the obsolete `<script src="[month].js">` tags (posts now come directly from Firestore).
- Change `<script src="script.js">` to `<script type="module" src="script.js"></script>`.
- Add the **Floating Action Trigger Button** (`#admin-login-toggle`) for opening the admin panel.
- Add the **Admin Drawer** (`#admin-drawer`):
  - **Auth View** (`#admin-auth-view`): Email and password inputs, Login button.
  - **Editor View** (`#admin-editor-view`): Title, tags, body textarea, "Publish" button, "Seed Existing Posts" button, and "Logout" button.

#### [MODIFY] [style.css](file:///c:/Users/user/Desktop/Unflitered_Blog/style.css)
- Add styles for:
  - `.admin-fab`: Floating action button with subtle glow and `--panel-2` styling.
  - `.admin-drawer`: Elegant sliding or anchored modal panel using `--panel`, `--hair` border, and `--amber` focus states.
  - `.delete-btn`: Hidden by default (`display: none`), visible only when `body.is-admin` is active.
  - Form controls inside the admin drawer adhering to the warm paper & amber palette.

---

### Phase 3: Dynamic Post Cards with Real Actions & Security

#### [MODIFY] [script.js](file:///c:/Users/user/Desktop/Unflitered_Blog/script.js)
- **Like button**:
  - Interacts directly with Firestore: `updateDoc(doc(db, "posts", post.id), { likesCount: increment(1) })`
  - Protects against duplicate clicks per visitor via `localStorage`.
- **Share button**:
  - Keeps native Web Share API with clipboard copy fallback.
- **Delete button**:
  - Embedded into each post card: `<button class="action-btn delete-btn" data-id="${post.id}">Delete</button>`.
  - Prompts user confirmation and runs `deleteDoc(doc(db, "posts", id))`.
- **Admin Auth State**:
  - `onAuthStateChanged(auth, user)` toggles `body.is-admin`, switching the admin drawer between login view and editor view.

---

### Phase 4: Native APK Packaging (Capacitor)

#### [NEW] [my-blog-apk/](file:///c:/Users/user/Desktop/Unflitered_Blog/my-blog-apk/)
- Create the target Capacitor folder structure:
  ```
  my-blog-apk/
  ├── package.json
  └── www/
      ├── index.html
      ├── style.css
      ├── script.js
      ├── firebase-config.js
      ├── about.js
      └── profile.jpg
  ```
- Run `npm init -y` and install `@capacitor/core`, `@capacitor/cli`, and `@capacitor/android`.
- Initialize Capacitor app with app ID `com.unfilteredjournal.blog` and web dir `www`.
- Add the Android platform (`npx cap add android`) and sync web assets (`npx cap copy android`).

---

## Verification Plan

### Automated & Build Verification
1. **Lint & Module Syntax**: Check for any JavaScript syntax or module import errors.
2. **Capacitor Android Project Generation**:
   - Run `npx cap copy android` inside `my-blog-apk` to ensure all assets and configs are compiled.
   - Verify that `my-blog-apk/android/` contains the valid Gradle build structure.

### Manual Verification
1. **Web App**:
   - Verify page renders correctly with the new ES module structure.
   - Test admin drawer toggle button opens and closes properly.
   - Check that `.delete-btn` is hidden when logged out and appears when logged in.
2. **Firestore Real-time Sync**:
   - Verify that publishing or deleting a post updates the UI in real-time via `onSnapshot`.

Double-clicking `index.html` on your computer works fine for previewing, since every file in `content/` is loaded as a plain script rather than fetched. (An earlier version of this site used a single `content.json` with `fetch()`, which browsers block when opening files locally with `file://` — that's why posts live in `content/*.js` script files instead.)
