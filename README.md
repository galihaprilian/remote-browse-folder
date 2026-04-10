# 📂 Remote Browse Folder

Browse any folder remotely via browser with syntax highlighting and Markdown preview.

## Usage

```bash
cd /path/to/your/folder
node /path/to/remote-browse-folder/server.js
```

Or install globally:

```bash
npm install -g .
cd /path/to/any/folder
browse-folder
```

Open `http://localhost:3000` in your browser.

## Options

| Env variable | Default | Description         |
|--------------|---------|---------------------|
| `PORT`       | `3000`  | HTTP port to listen |

```bash
PORT=8080 node server.js
```

## Features

- 📁 Folder tree with expand/collapse
- 📝 Markdown: **Preview** (default) / **Source** toggle
- 🎨 Syntax highlighting for 30+ languages (via highlight.js)
- 🔢 Line numbers on code files
- 🔒 Path traversal protection (stays within served folder)
- 🌙 Dark theme
