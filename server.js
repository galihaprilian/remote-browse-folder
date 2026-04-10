#!/usr/bin/env node

const express = require('express');
const fs = require('fs');
const path = require('path');
const mime = require('mime-types');

const app = express();
const ROOT_DIR = process.cwd();
const PORT = process.env.PORT || 3000;

// Resolve and validate path stays within ROOT_DIR
function resolveSafePath(reqPath) {
  const normalized = path.normalize(reqPath || '/').replace(/^(\.\.[/\\])+/, '');
  const resolved = path.resolve(ROOT_DIR, normalized.replace(/^\//, ''));
  if (!resolved.startsWith(ROOT_DIR)) {
    return null;
  }
  return resolved;
}

app.use(express.static(path.join(__dirname, 'public')));

// List directory contents
app.get('/api/list', (req, res) => {
  const targetPath = resolveSafePath(req.query.path);
  if (!targetPath) return res.status(403).json({ error: 'Access denied' });

  fs.stat(targetPath, (err, stat) => {
    if (err) return res.status(404).json({ error: 'Not found' });
    if (!stat.isDirectory()) return res.status(400).json({ error: 'Not a directory' });

    fs.readdir(targetPath, { withFileTypes: true }, (err, entries) => {
      if (err) return res.status(500).json({ error: err.message });

      const items = entries
        .filter(e => !e.name.startsWith('.'))
        .map(e => ({
          name: e.name,
          type: e.isDirectory() ? 'dir' : 'file',
          path: path.join(req.query.path || '/', e.name).replace(/\\/g, '/'),
        }))
        .sort((a, b) => {
          if (a.type !== b.type) return a.type === 'dir' ? -1 : 1;
          return a.name.localeCompare(b.name);
        });

      res.json({ path: req.query.path || '/', items });
    });
  });
});

// Get file content
app.get('/api/file', (req, res) => {
  const targetPath = resolveSafePath(req.query.path);
  if (!targetPath) return res.status(403).json({ error: 'Access denied' });

  fs.stat(targetPath, (err, stat) => {
    if (err) return res.status(404).json({ error: 'Not found' });
    if (!stat.isDirectory()) {
      const mimeType = mime.lookup(targetPath) || 'application/octet-stream';
      const isText = mimeType.startsWith('text/') || /json|xml|javascript|typescript|yaml|svg/.test(mimeType);

      if (!isText && stat.size > 10 * 1024 * 1024) {
        return res.status(400).json({ error: 'Binary or large file not supported for preview' });
      }

      fs.readFile(targetPath, 'utf8', (err, content) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({
          path: req.query.path,
          name: path.basename(targetPath),
          ext: path.extname(targetPath).slice(1).toLowerCase(),
          mimeType,
          content,
          size: stat.size,
        });
      });
    } else {
      res.status(400).json({ error: 'Path is a directory' });
    }
  });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n📂 Remote Browse Folder`);
  console.log(`   Serving: ${ROOT_DIR}`);
  console.log(`   URL:     http://localhost:${PORT}\n`);
});
