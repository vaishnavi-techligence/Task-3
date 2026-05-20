# GitFlow Kanban — High-Performance GitHub Issues Tracker

A production-style, fully DOM-driven single-page application (SPA) designed to track, manage, and reorganize public GitHub repository issues as an interactive Kanban board. Built exclusively with **Vanilla JavaScript (ES Modules)**, **HTML5**, and **CSS3**, this application is completely framework-free and implements scalable, performant frontend architectural patterns.

---

## Folder Structure

```text
Task-3/
├── css/
│   └── style.css          # Sleek Glassmorphic dark mode styling & skeletons
├── js/
│   ├── api.js             # API communications: Promise.all, Promise.race timeouts
│   ├── app.js             # Main coordinator, debouncers, and startup bootstrap
│   ├── dragdrop.js        # Drag-and-drop controller via Board Event Delegation
│   ├── state.js           # Single source of truth, filters, and token persistence
│   └── ui.js              # DOM builder, sliding panels, overlays, and pagination
├── index.html             # Semantic SPA markup & SEO optimization metadata
└── README.md              # Technical documentation & architectural breakdown
```

---

## Setup & Execution Instructions

Since this application is built with modern **ES Modules (`type="module"`)**, browsers restrict loading these modules from direct file system paths (`file://...`) due to CORS security policies. It must be run through a local HTTP web server.

### Option 1: VS Code Live Server (Easiest)
1. Open the project folder `Task-3` in Visual Studio Code.
2. Click the **"Go Live"** button in the bottom status bar, or right-click `index.html` and select **"Open with Live Server"**.
3. The app will open in your default browser at `http://127.0.0.1:5500/`.

### Option 2: Node.js static server
If you have Node.js installed, launch a light web server directly from your terminal:
```bash
# Install global static server (if not already installed)
npm install -g local-server # or simply use npx

# Run server in the current Task-3 directory
npx http-server . -p 8080
```
Open your browser and navigate to: `http://localhost:8080`.

### Option 3: Python's Built-in Server
If Python is installed on your machine, you can run a local server in one line:
```bash
# Python 3
python -m http.server 8000
```
Open your browser and navigate to: `http://localhost:8000`.

---

## GitHub API Rate Limits & Token Support
The GitHub REST API permits only **60 unauthenticated requests per hour** per IP address. If you search multiple repositories or fetch many pages, you might encounter a `403 Rate Limit Exceeded` error.

**Premium Addition:** We built an optional **GitHub Personal Access Token (PAT)** field directly into the app header.
* Enter a PAT (no scopes required for public repositories) to boost your limits to **5,000 requests per hour**.
* The token is safely preserved locally in your browser's `localStorage` and is attached directly to outgoing request headers. It is **never** sent to any third-party server.

---

## Screenshots Of Implementation
<img width="1456" height="891" alt="image" src="https://github.com/user-attachments/assets/81a5333a-e756-49ac-93cc-b8617393099a" />
<img width="1375" height="912" alt="image" src="https://github.com/user-attachments/assets/c054392f-e21b-4e37-ac28-51f6f0b1e9f8" />
<img width="1371" height="725" alt="image" src="https://github.com/user-attachments/assets/ee1ec999-788f-4bad-aaac-2af1f1b5bde7" />
<img width="1289" height="790" alt="image" src="https://github.com/user-attachments/assets/9a3862ea-3249-4edd-8188-48ceb0271393" />


## Architectural Deep Dive

### 1. State Management Approach (`state.js`)
Rather than distributing state across individual DOM elements (which leads to "spaghetti code"), the application implements a **centralized, single source of truth** pattern.
* **Reactive-Ready State Object:** A single `state` object controls the repository name, repo statistics, list of loaded issues, active filter keys, selected issue drawer info, and the Personal Access Token.
* **Component Partitioning:** In addition to native GitHub properties, each loaded issue is enriched with a `columnId` ("open", "review", or "closed"). This decouples the visual column layout from the GitHub database state, allowing immediate drag-and-drop state persistence in the browser's memory.
* **Dynamic Derivative Getters:** Methods like `getFilteredIssues()` and `getFilterOptions()` compute list variations on-the-fly, serving as lightweight selectors that guarantee consistent, synchronized data flows.

### 2. Event Delegation Strategy (`dragdrop.js` & `app.js`)
Attaching event listeners to hundreds of issue cards creates substantial memory overhead, degrades browser scrolling performance, and requires manual listener cleanups when cards are dynamically added or removed. 
Our solution employs **Event Delegation**:
* **Board-Level Delegation:** A single suite of native drag-and-drop listeners (`dragstart`, `dragend`, `dragover`, `dragenter`, `dragleave`, `drop`) is attached to the parent `#kanban-board` container.
* **DOM Traversal API:** When drag actions occur, the bubble-up chain is intercepted. The application queries target targets dynamically using `.closest('.issue-card')` and `.closest('.kanban-column')` and extracts properties using HTML5 `dataset` APIs (`dataset.id`, `dataset.column`).
* **High-Performance Drop Reflows:** Upon dropped cards, rather than tearing down and rebuilding the entire column in the DOM (which is highly expensive), the application uses direct node manipulation:
  ```javascript
  targetList.appendChild(cardElement); // Moves the existing DOM node in 1 operations!
  ```
  This reduces DOM reflows and paints from an $O(N)$ board rebuild to a lightweight $O(1)$ node insertion.

### 3. Asynchronous Data Flow & Parallel Fetching (`api.js`)
Our async architecture features robust concurrency and safety fallback guards:
* **Parallel API Execution (`Promise.all`):** When querying a repository, fetching metadata and fetching issues are executed **simultaneously** rather than sequentially. This reduces network round-trip bottlenecks by up to 50%:
  ```javascript
  const [metadata, issues] = await Promise.all([
    fetchRepoMetadata(owner, repo),
    fetchRepoIssues(owner, repo, 1, perPage)
  ]);
  ```
* **Request Races & Timeouts (`Promise.race`):** To prevent uncompleted network requests from freezing the UI, we race our fetch promises against a custom `8000ms` timer. If the network hangs, the race rejects with a `Request timed out` error, allowing the application to display a clean warning.
* **Intelligent Pagination:** The "Load More" button fetches subsequent pages (`page=N&per_page=10`) dynamically. The UI appends new cards directly to the bottom of columns using a `DocumentFragment`, keeping the existing board intact and ensuring **zero duplicate rendering**.
* **Real-time Filter Debouncing:** Keystroke search events are fed into a highly optimized custom `debounce` scheduler. This ensures filtering reflows only trigger `200ms` after typing pauses, preventing browser lag on slower devices.
