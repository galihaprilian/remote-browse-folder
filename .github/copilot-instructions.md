# Copilot Instructions

## Run commands

- `npm install` - install dependencies
- `npm start` - start the Express server from the current working directory
- `npm install -g .` - install the `browse-folder` CLI locally for manual end-to-end use

`package.json` currently defines no build, test, or lint scripts, so there is no built-in full-suite or single-test command in this repository.

For browser-driven validation in Copilot cloud agent sessions, this repository also provisions Playwright MCP tooling through `.github/workflows/copilot-setup-steps.yml`.

## High-level architecture

- The backend is `server.js`, a small CommonJS Express app that serves `public/` statically and exposes only two JSON endpoints:
  - `GET /api/list?path=...` returns directory entries, filters out dotfiles, and sorts directories before files
  - `GET /api/file?path=...` returns file metadata plus UTF-8 content for previews
- The served root is **not** the repository root by default. `server.js` uses `ROOT_DIR = process.cwd()`, so behavior depends on the directory where the process is launched. Running `npm start` from the repo serves the repo itself; running the installed `browse-folder` CLI from another directory serves that directory instead.
- Path access is centralized in `resolveSafePath()`. Any server-side file access should go through that same root-bounded resolution pattern so requests cannot escape `ROOT_DIR`.
- The frontend is entirely in `public/index.html`. HTML structure, CSS theme, and all client-side JavaScript live in that single file; there is no bundler, framework, or separate asset pipeline.
- The client builds the file tree lazily with `/api/list`, opens files with `/api/file`, and switches rendering mode in-browser:
  - Markdown uses `marked`
  - Mermaid code fences are post-processed with `mermaid.render()`
  - Non-Markdown files go through `highlight.js` and are rendered as a line-number table
- External UI dependencies are loaded from CDNs inside `public/index.html`, so frontend changes usually mean editing that file directly rather than updating a compiled asset setup.
- `.github/workflows/copilot-setup-steps.yml` prepares Copilot cloud agent sessions with Node dependencies plus Playwright MCP/Chromium so browser automation can be used against the app without ad hoc setup.

## Key repository-specific conventions

- Keep the app self-contained: UI changes usually belong in `public/index.html`, while server behavior stays in `server.js`. New features should fit that split unless the project is intentionally restructured.
- Preserve the current root-scoped browsing model. New filesystem endpoints should operate relative to `process.cwd()` and keep the same traversal protection expectations as `/api/list` and `/api/file`.
- The sidebar/file tree is fetched on demand, not precomputed. Directory expansion happens lazily in `loadDir()`, and expanded directory state is tracked client-side with `expandedDirs`.
- Frontend view state is managed with a few module-level variables (`currentFile`, `currentView`, `activeItem`, `fontSize`) rather than a framework or store. Follow that style when extending the existing UI.
- File-type behavior is defined in two parallel maps inside `renderCode()` and `getFileIcon()`. When adding support for a new extension, update both the syntax-highlighting mapping and the icon/badge mapping so rendering stays consistent.
- The current server returns preview content as JSON, not streamed file responses. Large non-text files over 10 MB are rejected, and there is no separate raw-download endpoint yet.
- When using Playwright against this app, start the server from the directory you want to browse and point automation at `http://localhost:3000`; the rendered content depends on the server process's current working directory.
