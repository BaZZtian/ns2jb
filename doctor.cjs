#!/usr/bin/env node
'use strict';

// Preflight check for this repository. Runs on the computer only: it never
// contacts the console, and it changes nothing outside a throwaway folder under
// runs/. Run it before you start, and again when a run fails.

const fs = require('node:fs');
const fsp = require('node:fs/promises');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');

const ROOT = __dirname;
const PORT = 39380;          // must match run.cjs
const MIN_NODE = 22;         // README: "Node.js 22 or newer"
const REQUIRED = ['run.cjs', 'rpc.cjs', 'dump-firmware.cjs', 'bootstrap.bas', 'SHA256SUMS', 'engine'];

const USAGE = [
  'Usage: node doctor.cjs [--bundle] [--out <file>]',
  '',
  '  (no flag)     check this computer and print a verdict',
  '  --bundle      also write a report file to attach to a bug report',
  '  --out <file>  write the report to <file> instead of the default name',
  '',
  'Checks Node.js, file integrity, your network address, port ' + PORT + ', and',
  'whether runs/ is writable. It does not touch the console and does not start',
  'the exploit. See README.md for the run itself.'
].join('\n');

function getArgs(argv) {
  const options = {bundle: false, out: null};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--help' || a === '-h') return {help: true};
    if (a === '--bundle') { options.bundle = true; continue; }
    if (a === '--out') {
      const value = argv[++i];
      if (!value) throw Error('--out needs a file name\n' + USAGE);
      options.out = value;
      options.bundle = true;
      continue;
    }
    throw Error('Unknown option: ' + a + '\n' + USAGE);
  }
  return options;
}

const results = [];
function record(level, title, detail) {
  results.push({level, title, detail});
  return level;
}
const ok = (title, detail) => record('ok', title, detail);
const warn = (title, detail) => record('warn', title, detail);
const fail = (title, detail) => record('fail', title, detail);

function checkNode() {
  const major = Number(process.versions.node.split('.')[0]);
  const detail = 'Node.js ' + process.versions.node + ' on ' + process.platform + '/' + process.arch;
  if (major >= MIN_NODE) return ok('Node.js version', detail);
  return fail('Node.js version', detail + ' - this needs ' + MIN_NODE + ' or newer');
}

function checkRequired() {
  const missing = REQUIRED.filter(name => !fs.existsSync(path.join(ROOT, name)));
  if (!missing.length) return ok('Repository files', 'all ' + REQUIRED.length + ' required paths are present');
  return fail('Repository files', 'missing: ' + missing.join(', '));
}

function sha256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

// SHA256SUMS was generated from LF bytes. A checkout that ignored .gitattributes
// would hash differently, so a mismatch is retried once with CRLF normalised and
// reported as such rather than as corruption.
function checkIntegrity() {
  const sumsPath = path.join(ROOT, 'SHA256SUMS');
  if (!fs.existsSync(sumsPath)) return fail('File integrity', 'SHA256SUMS is missing');
  const lines = fs.readFileSync(sumsPath, 'utf8').split(/\r?\n/).filter(Boolean);
  let rawOk = 0, lineEndingOk = 0, missing = 0;
  const mismatched = [];
  for (const line of lines) {
    const match = /^([0-9a-f]{64})\s+(.+)$/.exec(line.trim());
    if (!match) { mismatched.push('unparseable line: ' + line.slice(0, 40)); continue; }
    const [, expected, name] = match;
    const file = path.join(ROOT, name);
    if (!fs.existsSync(file)) { missing++; continue; }
    const bytes = fs.readFileSync(file);
    if (sha256(bytes) === expected) { rawOk++; continue; }
    const normalised = bytes.toString('utf8').replace(/\r\n/g, '\n');
    if (sha256(Buffer.from(normalised, 'utf8')) === expected) { lineEndingOk++; continue; }
    mismatched.push(name);
  }
  const total = lines.length;
  if (!mismatched.length && !missing) {
    const detail = rawOk + '/' + total + ' files match SHA256SUMS' +
      (lineEndingOk ? ' (' + lineEndingOk + ' only after normalising CRLF to LF - your checkout changed line endings)' : '');
    return lineEndingOk ? warn('File integrity', detail) : ok('File integrity', detail);
  }
  const parts = [];
  if (mismatched.length) parts.push(mismatched.length + ' changed (' + mismatched.slice(0, 3).join(', ') + (mismatched.length > 3 ? ', ...' : '') + ')');
  if (missing) parts.push(missing + ' missing');
  return fail('File integrity', parts.join(', ') + ' out of ' + total + ' - re-download, do not run a modified tree');
}

function privateRank(address) {
  if (address.startsWith('192.168.')) return 0;
  if (address.startsWith('10.')) return 1;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(address)) return 2;
  return 3;
}

function checkNetwork() {
  const found = [];
  for (const [name, entries] of Object.entries(os.networkInterfaces())) {
    for (const entry of entries || []) {
      if (entry.family !== 'IPv4' && entry.family !== 4) continue;
      if (entry.internal) continue;
      found.push({name, address: entry.address});
    }
  }
  found.sort((a, b) => privateRank(a.address) - privateRank(b.address));
  const usable = found.filter(item => privateRank(item.address) < 3);
  if (!usable.length) {
    return {
      level: fail('Network address', found.length
        ? 'no private IPv4 address; found ' + found.map(i => i.address).join(', ') + ' - connect this computer to the same network as the console'
        : 'no IPv4 address at all - this computer appears to be offline'),
      host: null
    };
  }
  const best = usable[0];
  const others = found.length > 1 ? ' (also: ' + found.slice(1).map(i => i.address).join(', ') + ')' : '';
  const level = usable.length > 1 ? warn('Network address', 'several candidates; assuming ' + best.address + ' on ' + best.name + others) : ok('Network address', best.address + ' on ' + best.name);
  return {level, host: best.address};
}

function checkPort() {
  return new Promise(resolve => {
    const server = net.createServer();
    const finish = (level, detail) => {
      server.removeAllListeners();
      try { server.close(); } catch { /* already closed */ }
      resolve(record(level, 'Port ' + PORT, detail));
    };
    server.once('error', error => {
      if (error.code === 'EADDRINUSE') {
        finish('fail', 'already in use - another run is still open, or a previous one left the socket behind. Close it, or restart the computer if nothing is holding it.');
      } else if (error.code === 'EACCES') {
        finish('fail', 'permission denied - a firewall or policy is blocking this port');
      } else {
        finish('warn', 'could not be tested (' + error.code + ') - the run itself will still try');
      }
    });
    server.once('listening', () => finish('ok', 'free, so the console will be able to reach this computer'));
    server.listen(PORT, '0.0.0.0');
  });
}

async function checkRuns() {
  const workspace = path.join(ROOT, 'runs');
  let created = false;
  try {
    if (!fs.existsSync(workspace)) { await fsp.mkdir(workspace, {recursive: true}); created = true; }
    const probe = await fsp.mkdtemp(path.join(workspace, 'doctor-'));
    await fsp.rm(probe, {recursive: true, force: true});
    const previous = (await fsp.readdir(workspace, {withFileTypes: true}))
      .filter(entry => entry.isDirectory() && entry.name.startsWith('switch2-')).length;
    const detail = 'writable' + (created ? ' (created it)' : '') +
      (previous ? '; ' + previous + ' earlier run folder' + (previous === 1 ? '' : 's') + ' kept' : '');
    return ok('Run folder', detail);
  } catch (error) {
    return fail('Run folder', 'runs/ is not writable: ' + error.message);
  }
}

function startCommand(host) {
  return 'V=START(' + [PORT, ...host.split('.')].join(',') + ')';
}

function render() {
  const width = Math.max(...results.map(r => r.title.length));
  const label = {ok: '[ ok ]', warn: '[warn]', fail: '[FAIL]'};
  const lines = [];
  lines.push('ns2jb preflight - ' + new Date().toISOString());
  lines.push('');
  for (const r of results) lines.push(label[r.level] + ' ' + r.title.padEnd(width) + '  ' + r.detail);
  return lines;
}

// This report is meant to be pasted into a public issue, so absolute paths are
// replaced before the file is written. run.cjs records the memory socket and the
// proof/launch/identity/handoff files by absolute path, and a failed check can
// put one in an error message. Longest prefix first: the temp directory sits
// inside the home directory on Windows, so matching home first would leave
// "AppData\Local\Temp\..." behind.
const REDACT_LABELS = () => [
  [os.tmpdir(), '<temp>'],
  [os.homedir(), '<home>'],
  [ROOT, '<repo>'],
  [process.cwd(), '<cwd>']
];

function pathLabel(match) {
  const trimmed = match.replace(/[\s.]+$/, '');
  const leaf = trimmed.split(/[\\/]/).filter(Boolean).pop() || '';
  const name = leaf.trim().split(/\s+/)[0] || '';
  return name ? '<path>/' + name : '<path>';
}

function redactText(text) {
  if (typeof text !== 'string' || !text) return text;
  let out = text;
  const seen = new Set();
  for (const [prefix, label] of REDACT_LABELS().sort((a, b) => b[0].length - a[0].length)) {
    if (!prefix || seen.has(prefix)) continue;
    seen.add(prefix);
    for (const form of new Set([prefix, prefix.replace(/\\/g, '/'), prefix.replace(/\\/g, '\\\\')])) {
      out = out.split(form).join(label);
    }
  }
  // Anything absolute that was not under a known prefix. The drive form cannot
  // collide with a URL, and the POSIX form refuses a match preceded by a letter,
  // a slash or a colon, which keeps "https://host/path" intact.
  return out
    .replace(/(?<!\w)[A-Za-z]:[\\/][^"'<>|?*,;)\r\n]*/g, pathLabel)
    .replace(/(?<![\w:/])\/(?:[\w.-]+\/)+[\w.-]+/g, pathLabel);
}

function redactValue(value) {
  if (typeof value === 'string') return redactText(value);
  if (Array.isArray(value)) return value.map(redactValue);
  if (value && typeof value === 'object') {
    const out = {};
    for (const [key, item] of Object.entries(value)) out[redactText(key)] = redactValue(item);
    return out;
  }
  return value;
}

function newestRun() {
  const workspace = path.join(ROOT, 'runs');
  if (!fs.existsSync(workspace)) return null;
  const dirs = fs.readdirSync(workspace, {withFileTypes: true})
    .filter(entry => entry.isDirectory() && entry.name.startsWith('switch2-'))
    .map(entry => ({name: entry.name, time: fs.statSync(path.join(workspace, entry.name)).mtimeMs}))
    .sort((a, b) => b.time - a.time);
  return dirs.length ? path.join(workspace, dirs[0].name) : null;
}

function bundleText(host) {
  const lines = render();
  lines.push('');
  const failures = results.filter(r => r.level === 'fail').length;
  const warnings = results.filter(r => r.level === 'warn').length;
  lines.push('Verdict: ' + (failures ? failures + ' problem(s), ' + warnings + ' warning(s)'
    : warnings ? 'usable, with ' + warnings + ' warning(s)' : 'all checks passed'));
  if (host) {
    lines.push('');
    lines.push('The line to type into SmileBASIC for this computer:');
    lines.push('  ' + startCommand(host));
    lines.push('If BASIC rejects it with "Wrong number of arguments", use:');
    lines.push('  V=START(' + [PORT, ...host.split('.'), 0, 0, 0, 0].join(',') + ')');
  }
  lines.push('');
  lines.push('--- last run ---');
  const run = newestRun();
  if (!run) {
    lines.push('No run folder found in runs/.');
  } else {
    lines.push('Folder: ' + path.basename(run));
    const resultPath = path.join(run, 'result.json');
    if (fs.existsSync(resultPath)) {
      try {
        const raw = fs.readFileSync(resultPath, 'utf8');
        let parsed = null;
        try { parsed = JSON.parse(raw); } catch { parsed = null; }
        // Redact the parsed tree and re-serialise it, rather than editing the
        // raw text: inside JSON a Windows separator is written "\\\\", so a
        // textual replacement would miss it, and a partial one would produce a
        // file that no longer parses.
        lines.push(parsed === null ? redactText(raw.trim()) : JSON.stringify(redactValue(parsed), null, 2));
      } catch (error) {
        lines.push('result.json could not be read: ' + redactText(error.message));
      }
    } else {
      lines.push('No result.json - the run did not reach the point where it writes one.');
      for (const name of ['switch2/pipeline.json', 'switch2/fs-execution-current.json']) {
        const candidate = path.join(run, name);
        if (fs.existsSync(candidate)) lines.push(name + ' exists (' + fs.statSync(candidate).size + ' bytes) but is not inlined.');
      }
    }
  }
  lines.push('');
  lines.push('--- what this report contains ---');
  lines.push('Your Node.js version, platform, local IPv4 address, port ' + PORT + ' status,');
  lines.push('checksum results, and the result.json of the most recent run. It contains no');
  lines.push('console keys, no memory contents, and no game or system files. Absolute file');
  lines.push('paths are replaced with <home>, <repo>, <temp> and <path> labels before this');
  lines.push('file is written, so your user name and the folder you unpacked this into are');
  lines.push('not in it. The local address and the run folder name are: skim before posting.');
  return redactText(lines.join('\n')) + '\n';
}

async function main(args = process.argv.slice(2)) {
  const options = getArgs(args);
  if (options.help) { console.log(USAGE); return 0; }

  checkNode();
  checkRequired();
  checkIntegrity();
  const network = checkNetwork();
  await checkPort();
  await checkRuns();

  const lines = render();
  const failures = results.filter(r => r.level === 'fail');
  const warnings = results.filter(r => r.level === 'warn');

  console.log(lines.join('\n'));
  console.log('');

  if (failures.length) {
    console.log(failures.length + ' problem(s) to fix before starting:');
    for (const r of failures) console.log('  - ' + r.title + ': ' + r.detail);
  } else if (warnings.length) {
    console.log('Usable, but read the ' + warnings.length + ' warning(s) above first.');
  } else {
    console.log('All checks passed. Start with: node run.cjs');
  }

  if (network.host) {
    console.log('');
    console.log('When the host says "Waiting for Switch 2", the line to type is:');
    console.log('  ' + startCommand(network.host));
    console.log('(The host prints the same line. If your computer has more than one network');
    console.log(' adapter, make sure this is the address on the console\'s network.)');
  }

  console.log('');
  console.log('Checked on this computer only. Nothing here contacted the console: this');
  console.log('cannot tell you whether the exploit will work, only whether your side is set up.');

  if (options.bundle) {
    const name = options.out || 'ns2jb-report-' + new Date().toISOString().replace(/[:.]/g, '-') + '.txt';
    const target = path.isAbsolute(name) ? name : path.join(process.cwd(), name);
    await fsp.writeFile(target, bundleText(network.host), {encoding: 'utf8'});
    console.log('');
    console.log('Report written to: ' + target);
  }

  return failures.length ? 1 : 0;
}

main().then(code => { process.exitCode = code; }, error => {
  console.error(error.message);
  process.exitCode = 2;
});
