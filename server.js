#!/usr/bin/env node

const express = require('express');
const fs = require('fs');
const os = require('os');
const path = require('path');
const mime = require('mime-types');
const XLSX = require('xlsx');

const SPREADSHEET_EXTS = new Set(['xlsx', 'xls', 'xlsm', 'xlsb', 'ods']);
const SHEET_MAX_ROWS = 2000;
const SHEET_MAX_COLS = 100;
const SHEET_MAX_BYTES = 25 * 1024 * 1024;

function extractAutoFilter(worksheet) {
  const autoFilter = worksheet['!autofilter'];
  if (!autoFilter || !autoFilter.ref || !worksheet['!ref']) return null;
  try {
    const refRange = XLSX.utils.decode_range(worksheet['!ref']);
    const filterRange = XLSX.utils.decode_range(autoFilter.ref);
    const headerRow = Math.max(0, filterRange.s.r - refRange.s.r);
    const startCol = Math.max(0, filterRange.s.c - refRange.s.c);
    const endCol = Math.min(SHEET_MAX_COLS - 1, filterRange.e.c - refRange.s.c);
    if (endCol < startCol || headerRow >= SHEET_MAX_ROWS) return null;
    const columns = [];
    for (let col = startCol; col <= endCol; col += 1) columns.push(col);
    return { headerRow, columns };
  } catch {
    return null;
  }
}

function readSpreadsheet(targetPath) {
  const workbook = XLSX.readFile(targetPath, { cellDates: true });
  const sheets = workbook.SheetNames.map((sheetName) => {
    const worksheet = workbook.Sheets[sheetName];
    const allRows = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '', raw: false, blankrows: false });
    const totalRows = allRows.length;
    const totalCols = allRows.reduce((max, row) => Math.max(max, row.length), 0);
    const rows = allRows
      .slice(0, SHEET_MAX_ROWS)
      .map(row => row.slice(0, SHEET_MAX_COLS).map(cell => (cell == null ? '' : String(cell))));
    return {
      name: sheetName,
      rows,
      totalRows,
      totalCols,
      truncated: totalRows > SHEET_MAX_ROWS || totalCols > SHEET_MAX_COLS,
      filter: extractAutoFilter(worksheet),
    };
  });
  return sheets;
}

const app = express();
const HOME_DIR = os.homedir();
const CONFIG_PATH = path.join(HOME_DIR, '.config', 'remote-browse.json');
const DEFAULT_CONFIG = {
  port: 3021,
  rootFolder: '~/Works/projects/banks/core7-devroot',
  favorites: ['~/Works/projects/banks/core7-devroot'],
};

function isWithinDir(baseDir, targetPath) {
  const relative = path.relative(baseDir, targetPath);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function toDisplayPath(targetPath) {
  if (targetPath === HOME_DIR) return '~';
  return `~/${path.relative(HOME_DIR, targetPath).replace(/\\/g, '/')}`;
}

function resolveHomePath(inputPath, fallbackPath = HOME_DIR) {
  const rawPath = String(inputPath || '').trim();
  if (!rawPath) return fallbackPath;
  if (rawPath === '~') return HOME_DIR;
  if (rawPath.startsWith('~/')) return path.resolve(HOME_DIR, rawPath.slice(2));
  if (path.isAbsolute(rawPath)) return path.resolve(rawPath);
  return path.resolve(HOME_DIR, rawPath);
}

function directoryExists(targetPath) {
  try {
    return fs.statSync(targetPath).isDirectory();
  } catch {
    return false;
  }
}

function parsePortValue(rawPort, fallbackPort) {
  if (rawPort == null || rawPort === '') return fallbackPort;

  const port = Number.parseInt(rawPort, 10);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`Invalid port: ${rawPort}. Use a number between 1 and 65535.`);
  }

  return port;
}

function ensureConfigFile() {
  if (fs.existsSync(CONFIG_PATH)) return;
  fs.mkdirSync(path.dirname(CONFIG_PATH), { recursive: true });
  fs.writeFileSync(CONFIG_PATH, `${JSON.stringify(DEFAULT_CONFIG, null, 2)}\n`, 'utf8');
}

function sanitizeFavorites(value) {
  if (!Array.isArray(value)) return [];

  const uniquePaths = new Set();
  const favorites = [];
  for (const item of value) {
    const resolved = resolveHomePath(item, HOME_DIR);
    if (!isWithinDir(HOME_DIR, resolved)) continue;
    if (!directoryExists(resolved)) continue;
    if (uniquePaths.has(resolved)) continue;
    uniquePaths.add(resolved);
    favorites.push(resolved);
  }

  return favorites;
}

function loadConfig() {
  ensureConfigFile();

  let parsed = {};
  try {
    parsed = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
  } catch (err) {
    console.error(`Failed to read config at ${CONFIG_PATH}: ${err.message}`);
  }

  let port = DEFAULT_CONFIG.port;
  try {
    port = parsePortValue(parsed.port, DEFAULT_CONFIG.port);
  } catch (err) {
    console.error(err.message);
  }

  const configuredRoot = resolveHomePath(parsed.rootFolder || DEFAULT_CONFIG.rootFolder, HOME_DIR);
  const rootDir = isWithinDir(HOME_DIR, configuredRoot) && directoryExists(configuredRoot)
    ? configuredRoot
    : HOME_DIR;

  const favorites = sanitizeFavorites(parsed.favorites || DEFAULT_CONFIG.favorites);

  return {
    port,
    rootDir,
    favorites,
  };
}

function parsePort(argv, envPort, configPort) {
  const args = argv.slice(2);
  let portValue = envPort;

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === '--port' || arg === '-p') {
      portValue = args[i + 1];
      i += 1;
      continue;
    }
    if (arg.startsWith('--port=')) {
      portValue = arg.slice('--port='.length);
    }
  }

  try {
    return parsePortValue(portValue, configPort);
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
}

const appConfig = loadConfig();
const PORT = parsePort(process.argv, process.env.PORT, appConfig.port);
let currentRootDir = appConfig.rootDir;
const favoriteDirs = appConfig.favorites;

function saveConfig() {
  const payload = {
    port: PORT,
    rootFolder: toDisplayPath(currentRootDir),
    favorites: favoriteDirs.map(toDisplayPath),
  };
  fs.mkdirSync(path.dirname(CONFIG_PATH), { recursive: true });
  fs.writeFileSync(CONFIG_PATH, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

function buildFavoritePayload(targetPath) {
  return {
    path: targetPath,
    displayPath: toDisplayPath(targetPath),
    label: targetPath === HOME_DIR ? '~' : path.basename(targetPath),
  };
}

function buildRootPayload() {
  return {
    configPath: CONFIG_PATH,
    homePath: HOME_DIR,
    homeDisplayPath: '~',
    rootPath: currentRootDir,
    rootDisplayPath: toDisplayPath(currentRootDir),
    favorites: favoriteDirs.map(buildFavoritePayload),
    port: PORT,
  };
}

function resolveSafePath(reqPath) {
  const normalized = path.normalize(reqPath || '/').replace(/^(\.\.[/\\])+/, '');
  const resolved = path.resolve(currentRootDir, normalized.replace(/^\//, ''));
  if (!isWithinDir(currentRootDir, resolved)) {
    return null;
  }
  return resolved;
}

function listDirectoryEntries(targetPath, predicate = () => true) {
  return fs.readdirSync(targetPath, { withFileTypes: true })
    .filter(entry => !entry.name.startsWith('.'))
    .filter(predicate)
    .sort((a, b) => a.name.localeCompare(b.name));
}

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public'), {
  setHeaders(res, filePath) {
    if (filePath.endsWith('.html')) {
      res.setHeader('Cache-Control', 'no-cache');
    }
  },
}));

app.get('/api/root', (req, res) => {
  res.json(buildRootPayload());
});

app.post('/api/root', (req, res) => {
  const nextRootDir = resolveHomePath(req.body && req.body.path, HOME_DIR);

  if (!isWithinDir(HOME_DIR, nextRootDir)) {
    return res.status(403).json({ error: 'Root folder must stay inside your home directory' });
  }

  fs.stat(nextRootDir, (err, stat) => {
    if (err) return res.status(404).json({ error: 'Folder not found' });
    if (!stat.isDirectory()) return res.status(400).json({ error: 'Path is not a directory' });

    currentRootDir = nextRootDir;
    saveConfig();
    res.json(buildRootPayload());
  });
});

app.post('/api/root/favorites', (req, res) => {
  const nextFavoriteDir = resolveHomePath(req.body && req.body.path, HOME_DIR);

  if (!isWithinDir(HOME_DIR, nextFavoriteDir)) {
    return res.status(403).json({ error: 'Favorite folder must stay inside your home directory' });
  }

  fs.stat(nextFavoriteDir, (err, stat) => {
    if (err) return res.status(404).json({ error: 'Folder not found' });
    if (!stat.isDirectory()) return res.status(400).json({ error: 'Path is not a directory' });

    if (!favoriteDirs.includes(nextFavoriteDir)) {
      favoriteDirs.push(nextFavoriteDir);
      favoriteDirs.sort((a, b) => a.localeCompare(b));
      saveConfig();
    }

    res.json(buildRootPayload());
  });
});

app.delete('/api/root/favorites', (req, res) => {
  const targetFavoriteDir = resolveHomePath(req.body && req.body.path, HOME_DIR);
  const index = favoriteDirs.indexOf(targetFavoriteDir);
  if (index === -1) {
    return res.status(404).json({ error: 'Favorite folder not found' });
  }

  favoriteDirs.splice(index, 1);
  saveConfig();
  res.json(buildRootPayload());
});

app.get('/api/root/browse', (req, res) => {
  const browsePath = resolveHomePath(req.query.path, HOME_DIR);
  if (!isWithinDir(HOME_DIR, browsePath)) {
    return res.status(403).json({ error: 'Browse path must stay inside your home directory' });
  }

  fs.stat(browsePath, (err, stat) => {
    if (err) return res.status(404).json({ error: 'Folder not found' });
    if (!stat.isDirectory()) return res.status(400).json({ error: 'Path is not a directory' });

    let items;
    try {
      items = listDirectoryEntries(browsePath, entry => entry.isDirectory()).map(entry => {
        const entryPath = path.join(browsePath, entry.name);
        return {
          name: entry.name,
          path: entryPath,
          displayPath: toDisplayPath(entryPath),
        };
      });
    } catch (readErr) {
      return res.status(500).json({ error: readErr.message });
    }

    const parentPath = browsePath === HOME_DIR ? null : path.dirname(browsePath);
    res.json({
      path: browsePath,
      displayPath: toDisplayPath(browsePath),
      parentPath,
      parentDisplayPath: parentPath ? toDisplayPath(parentPath) : null,
      items,
    });
  });
});

app.get('/api/list', (req, res) => {
  const targetPath = resolveSafePath(req.query.path);
  if (!targetPath) return res.status(403).json({ error: 'Access denied' });

  fs.stat(targetPath, (err, stat) => {
    if (err) return res.status(404).json({ error: 'Not found' });
    if (!stat.isDirectory()) return res.status(400).json({ error: 'Not a directory' });

    fs.readdir(targetPath, { withFileTypes: true }, (readErr, entries) => {
      if (readErr) return res.status(500).json({ error: readErr.message });

      const items = entries
        .filter(entry => !entry.name.startsWith('.'))
        .map(entry => ({
          name: entry.name,
          type: entry.isDirectory() ? 'dir' : 'file',
          path: path.join(req.query.path || '/', entry.name).replace(/\\/g, '/'),
        }))
        .sort((a, b) => {
          if (a.type !== b.type) return a.type === 'dir' ? -1 : 1;
          return a.name.localeCompare(b.name);
        });

      res.json({ path: req.query.path || '/', items });
    });
  });
});

app.get('/api/file', (req, res) => {
  const targetPath = resolveSafePath(req.query.path);
  if (!targetPath) return res.status(403).json({ error: 'Access denied' });

  fs.stat(targetPath, (err, stat) => {
    if (err) return res.status(404).json({ error: 'Not found' });
    if (stat.isDirectory()) return res.status(400).json({ error: 'Path is a directory' });

    const ext = path.extname(targetPath).slice(1).toLowerCase();
    const mimeType = mime.lookup(targetPath) || 'application/octet-stream';

    if (SPREADSHEET_EXTS.has(ext)) {
      if (stat.size > SHEET_MAX_BYTES) {
        return res.status(400).json({ error: 'Spreadsheet too large to preview' });
      }
      let sheets;
      try {
        sheets = readSpreadsheet(targetPath);
      } catch (parseErr) {
        return res.status(500).json({ error: `Failed to parse spreadsheet: ${parseErr.message}` });
      }
      return res.json({
        path: req.query.path,
        name: path.basename(targetPath),
        ext,
        mimeType,
        kind: 'sheet',
        sheets,
        size: stat.size,
      });
    }

    const isText = mimeType.startsWith('text/') || /json|xml|javascript|typescript|yaml|svg/.test(mimeType);

    if (!isText && stat.size > 10 * 1024 * 1024) {
      return res.status(400).json({ error: 'Binary or large file not supported for preview' });
    }

    fs.readFile(targetPath, 'utf8', (readErr, content) => {
      if (readErr) return res.status(500).json({ error: readErr.message });
      res.json({
        path: req.query.path,
        name: path.basename(targetPath),
        ext,
        mimeType,
        kind: 'text',
        content,
        size: stat.size,
      });
    });
  });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n📂 Remote Browse Folder`);
  console.log(`   Config:   ${CONFIG_PATH}`);
  console.log(`   Home:     ${HOME_DIR}`);
  console.log(`   Serving:  ${currentRootDir}`);
  console.log(`   URL:      http://localhost:${PORT}\n`);
});
