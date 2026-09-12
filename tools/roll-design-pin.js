'use strict';

/**
 * Rolls the design-system commit pins this repository cites so they match the
 * submodule gitlink. `tools/design-sync-pin-smoke.js` requires them to agree,
 * and the shared consumer sync in 1132-Fixer/design-system moves the gitlink
 * without touching prose, so a bump alone leaves CI red. That happened on
 * #219 (ac0f1b1) and again on `main` after #221 (793d3cf).
 *
 *   npm run design:pin                  roll to the current gitlink
 *   npm run design:pin -- <40-hex sha>  roll to an explicit commit
 *   npm run design:pin -- --check       report, write nothing, exit 1 if stale
 *
 * The sync workflow passes the SHA explicitly, so the documents are rolled in
 * the same commit that moves the gitlink.
 *
 * Deliberately narrow. Each citation is declared below with the prose that
 * introduces it; a bare 40-hex string somewhere else in these files is not a
 * design-system pin and is never rewritten. `design-sync-pin-smoke.js` reads
 * PIN_SITES from here, so the gate and the roller cannot drift apart.
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const SHA_RE = /^[0-9a-f]{40}$/;

/**
 * The only places a design-system commit may be cited. `find` must capture the
 * pin in group 2, with group 1 and group 3 the surrounding literal text, so a
 * replacement can never widen beyond the declared shape.
 */
const PIN_SITES = [
  {
    file: 'AGENTS.md',
    label: 'submodule gitlink note',
    find: /(pinned to `)([0-9a-f]{40})(`)/g,
    malformed: /pinned to `([0-9a-f]{4,39}|[0-9a-f]{41,})`/g,
  },
  {
    file: 'DESIGN-SYNC.md',
    label: 'pinned design source',
    find: /(Pinned design source: `design-system` @ `)([0-9a-f]{40})(`)/g,
    malformed: /Pinned design source: `design-system` @ `([0-9a-f]{4,39}|[0-9a-f]{41,})`/g,
  },
];

/**
 * The shape `design-sync-pin-smoke.js` historically scanned for. Anything this
 * finds that PIN_SITES does not is a citation in an undeclared location: the
 * gate would fail on it and the roller would silently leave it behind, so it
 * is an error rather than something to guess at.
 */
const ANY_CITATION = /`design-system`[^`\n]*@ `([0-9a-f]{40})`|pinned to `([0-9a-f]{40})`/g;

function citationsIn(text) {
  return [...text.matchAll(ANY_CITATION)].map((m) => m[1] || m[2]);
}

function declaredIn(text, site) {
  return [...text.matchAll(site.find)].map((m) => m[2]);
}

/** Reads the design-system gitlink, or throws when it is not a gitlink. */
function readGitlink(root = ROOT) {
  const ls = spawnSync('git', ['ls-files', '-s', 'design-system'], { cwd: root, encoding: 'utf8' });
  const m = /^160000 ([0-9a-f]{40}) 0\tdesign-system$/m.exec(ls.stdout || '');
  if (!m) throw new Error(`design-system is not a gitlink: ${(ls.stdout || ls.stderr || '').trim() || '(no output)'}`);
  return m[1];
}

/**
 * Rewrites one file's declared pins. Returns { text, before, replaced }.
 * Throws on every condition that would make a silent rewrite unsafe.
 */
function rollText(text, site, pin) {
  if (!SHA_RE.test(pin)) {
    throw new Error(`"${pin}" is not a full 40-character lowercase commit SHA`);
  }

  const malformed = [...text.matchAll(site.malformed)].map((m) => m[1]);
  if (malformed.length) {
    throw new Error(`${site.file}: ${site.label} cites a malformed pin (${malformed.join(', ')}); expected 40 hex characters`);
  }

  const found = declaredIn(text, site);
  if (found.length === 0) {
    throw new Error(`${site.file}: no ${site.label} citation found; the document changed shape and this tool would silently do nothing`);
  }

  const distinct = [...new Set(found)];
  if (distinct.length > 1) {
    throw new Error(`${site.file}: ${site.label} citations disagree (${distinct.join(', ')}); resolve by hand before rolling`);
  }

  const stray = citationsIn(text).filter((c) => !found.includes(c));
  if (stray.length) {
    throw new Error(`${site.file}: a design-system pin (${[...new Set(stray)].join(', ')}) sits outside the declared ${site.label} location; add it to PIN_SITES rather than leaving the gate to fail on it`);
  }

  let replaced = 0;
  const out = text.replace(site.find, (whole, open, current, close) => {
    if (current === pin) return whole;
    replaced++;
    return `${open}${pin}${close}`;
  });
  return { text: out, before: distinct[0], replaced };
}

function main(argv) {
  const args = argv.slice(2);
  const check = args.includes('--check');
  const positional = args.filter((a) => !a.startsWith('--'));
  if (positional.length > 1) throw new Error(`expected at most one SHA argument, got ${positional.length}`);

  const gitlink = readGitlink();
  let pin = positional[0] || gitlink;
  if (positional[0]) {
    if (!SHA_RE.test(pin)) {
      throw new Error(`"${pin}" is not a full 40-character lowercase commit SHA`);
    }
    if (pin !== gitlink) {
      throw new Error(`refusing to roll: asked for ${pin.slice(0, 12)} but the design-system gitlink is ${gitlink.slice(0, 12)}. Move the submodule first, then roll.`);
    }
  }

  console.log(`design-system pin: ${pin}`);
  let stale = 0;
  const writes = [];
  for (const site of PIN_SITES) {
    const full = path.join(ROOT, site.file);
    const before = fs.readFileSync(full, 'utf8');
    const { text, replaced } = rollText(before, site, pin);
    if (replaced === 0) {
      console.log(`  ok     ${site.file}: ${site.label} already cites ${pin.slice(0, 12)}`);
      continue;
    }
    stale += replaced;
    if (check) console.error(`  STALE  ${site.file}: ${replaced} ${site.label} citation(s) differ`);
    else writes.push([full, text, `  wrote  ${site.file}: rolled ${replaced} ${site.label} citation(s) to ${pin.slice(0, 12)}`]);
  }

  if (check && stale) {
    console.error('Run "npm run design:pin" to roll them, then commit the documents.');
    return 1;
  }
  for (const [full, text, message] of writes) {
    fs.writeFileSync(full, text);
    console.log(message);
  }
  console.log(stale ? 'design-pin: documents updated' : 'design-pin: nothing to do');
  return 0;
}

module.exports = { PIN_SITES, ANY_CITATION, SHA_RE, rollText, citationsIn, declaredIn, readGitlink };

if (require.main === module) {
  try {
    process.exit(main(process.argv));
  } catch (err) {
    console.error(`FAIL  ${err.message}`);
    process.exit(1);
  }
}
