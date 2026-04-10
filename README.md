# 📂 Remote Browse Folder

Web-based file browser — browse any local folder remotely via browser with syntax highlighting, Markdown preview, and Mermaid diagram support.

---

## Install & Run from Any Folder

### Global install (recommended)

```bash
# Clone and install globally
git clone https://github.com/galihaprilian/remote-browse-folder.git
cd remote-browse-folder
npm install
npm install -g .
```

After global install, run from **any folder**:

```bash
cd /path/to/any/folder
browse-folder
```

Shell alias (optional, add to `~/.zshrc` or `~/.bashrc`):

```bash
alias rbf='browse-folder'
```

Then just run `rbf` from any folder.

### Without global install

```bash
cd /path/to/any/folder
node /path/to/remote-browse-folder/server.js
```

Open **http://localhost:3000** in your browser.

---

## Configuration

| Env variable | Default | Description          |
|--------------|---------|----------------------|
| `PORT`       | `3000`  | HTTP port to listen  |

```bash
PORT=8080 browse-folder
```

---

## Features

- **File explorer** — collapsible sidebar with SVG file icons colored by type
- **Syntax highlighting** — Tokyo Night theme via highlight.js, 30+ languages
- **Line numbers** — sticky left column, horizontal scroll for long lines
- **Markdown preview** — rendered via marked.js with GitHub Markdown CSS
- **Mermaid diagrams** — auto-rendered inside Markdown fenced code blocks (` ```mermaid `)
- **Preview / Source toggle** — for Markdown files
- **Font size control** — A− / A+ buttons in toolbar (range 10–22px)
- **Sidebar toggle** — ☰ button, click viewer area, or swipe left/right (mobile)
- **Auto-collapse sidebar** — sidebar hides automatically when opening a file
- **Path traversal protection** — server restricts all access within the served root directory
- **Dark theme** — Tokyo Night palette

---

## Project Structure

```
remote-browse-folder/
├── server.js          # Express server — /api/list and /api/file endpoints
├── public/
│   └── index.html     # Single-page app (all UI, CSS, and JS in one file)
└── package.json       # bin: { "browse-folder": "./server.js" }
```

### Key implementation details

#### Server (`server.js`)
- `GET /api/list?path=<dir>` — returns directory listing (dirs first, hidden files excluded)
- `GET /api/file?path=<file>` — returns file content as JSON `{ name, ext, mimeType, content, size }`
- Path safety: all paths resolved with `path.resolve()` and validated to stay within `ROOT_DIR = process.cwd()`
- Binary/large files (>10MB non-text) are rejected with a 400 error

#### Frontend (`public/index.html`)
- Self-contained SPA — no build step, no bundler
- External CDN dependencies: highlight.js, marked.js, mermaid.js, github-markdown-css, Inter + JetBrains Mono fonts
- State: `currentFile`, `currentView` (`preview` | `source`), `activeItem`, `fontSize`
- SVG file icons generated inline by `svgFile(color, label)` — color-coded by language group
- Sidebar collapse uses CSS `width` + `opacity` + `translateX` transition
- Code viewer uses `<table>` with sticky `<td class="ln">` for line numbers; `white-space: pre` on content cell for horizontal scroll

---

## Extending / Improvement Ideas (for AI agents)

### Adding new file type support
1. Add extension → highlight.js language mapping in `langMap` inside `renderCode()`
2. Add color + label entry in the `t` object inside `getFileIcon()`

### Adding image preview
- In `openFile()`, detect image MIME type and render `<img>` tag instead of calling `renderCode()`
- Server already returns `mimeType` in the file response

### Adding PDF preview
- Use `<iframe>` or PDF.js for PDF files when `data.ext === 'pdf'`

### Adding search
- Add a search input in the sidebar header
- Call `/api/list` recursively or add a new `/api/search?q=<query>` endpoint on the server

### Adding file download button
- Add a download anchor in the toolbar: `<a href="/api/file-raw?path=...">` 
- Add a new `/api/file-raw` endpoint in `server.js` using `res.download()`

### Changing syntax theme
- Replace the highlight.js CSS CDN link with any theme from https://cdnjs.com/libraries/highlight.js
- Update `--bg`, `--surface` CSS variables to match

### Persisting font size / sidebar state
- Use `localStorage.getItem/setItem` in `changeFontSize()` and `setSidebarCollapsed()`

### Adding keyboard shortcuts
- `Ctrl+B` → `toggleSidebar()`
- `Ctrl+[` / `Ctrl+]` → `changeFontSize(-1/+1)`
- Arrow keys for tree navigation
