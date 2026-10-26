#!/usr/bin/env node
'use strict';

// Regenerate SHA256SUMS over every shipped file.
//
// Format matches upstream: "<sha256>  <relative path>", one per line, plain
// sort. Hashes are taken from the bytes on disk, so run this on a checkout with
// LF line endings (the repository's .gitattributes enforces that).
//
// Excluded: .git, runs/ and dumps/ (local artifacts, never shipped), and
// SHA256SUMS itself.
//
// Usage: node scripts/make-sums.cjs [--check]
//   --check   do not write; exit 1 if SHA256SUMS is out of date

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const ROOT = path.resolve(__dirname, '..');
const SKIP_DIRS = new Set(['.git', 'runs', 'dumps', 'node_modules']);
const SKIP_FILES = new Set(['SHA256SUMS']);

function walk(relative) {
  const found = [];
  for (const entry of fs.readdirSync(path.join(ROOT, relative), {withFileTypes: true})) {
    const rel = relative ? relative + '/' + entry.name : entry.name;
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      found.push(...walk(rel));
    } else if (entry.isFile()) {
      if (!relative && SKIP_FILES.has(entry.name)) continue;
      found.push(rel);
    }
  }
  return found;
}

function build() {
  const files = walk('').sort();
  const lines = files.map(rel => {
    const bytes = fs.readFileSync(path.join(ROOT, rel));
    return crypto.createHash('sha256').update(bytes).digest('hex') + '  ' + rel;
  });
  return {files, text: lines.join('\n') + '\n'};
}

function main(args) {
  const check = args.includes('--check');
  const {files, text} = build();
  const target = path.join(ROOT, 'SHA256SUMS');
  const current = fs.existsSync(target) ? fs.readFileSync(target, 'utf8') : null;

  if (check) {
    if (current === text) {
      console.log('SHA256SUMS is current: ' + files.length + ' entries');
      return 0;
    }
    const before = new Set((current || '').split(/\r?\n/).filter(Boolean).map(l => l.split(/\s+/).slice(1).join(' ')));
    const after = new Set(files);
    const added = [...after].filter(name => !before.has(name));
    const removed = [...before].filter(name => !after.has(name));
    const changed = files.filter(name => {
      if (!before.has(name)) return false;
      const line = (current || '').split(/\r?\n/).find(l => l.endsWith('  ' + name));
      return line && !line.startsWith(crypto.createHash('sha256').update(fs.readFileSync(path.join(ROOT, name))).digest('hex'));
    });
    console.log('SHA256SUMS is out of date.');
    if (added.length) console.log('  unlisted files: ' + added.join(', '));
    if (removed.length) console.log('  entries with no file: ' + removed.join(', '));
    if (changed.length) console.log('  changed contents: ' + changed.join(', '));
    console.log('Run: node scripts/make-sums.cjs');
    return 1;
  }

  fs.writeFileSync(target, text);
  console.log('wrote ' + files.length + ' entries');
  return 0;
}

process.exitCode = main(process.argv.slice(2));
