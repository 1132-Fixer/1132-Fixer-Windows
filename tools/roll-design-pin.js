'use strict';

// Rewrites every cited design-system pin in AGENTS.md and DESIGN-SYNC.md so it
// equals the current gitlink, which is what tools/design-sync-pin-smoke.js
// requires. The design-system sync workflow moves the gitlink and never touches
// these documents, so without this step every sync pull request fails
// "Run tests" on the pin check. Run it after a submodule bump:
//
//     npm run design:pin
//
// Read-only by default: pass --check to report what would change and exit 1
// instead of writing, which is what CI wants.

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const FILES = ['AGENTS.md', 'DESIGN-SYNC.md'];
const CHECK_ONLY = process.argv.includes('--check');

// Same two shapes the smoke test matches, so the roller can never drift from
// the gate: "`design-system` ... @ `<sha>`" and "pinned to `<sha>`".
const CITATION = /(`design-system`[^`\n]*@ `)([0-9a-f]{40})(`)|(pinned to `)([0-9a-f]{40})(`)/g;

const ls = spawnSync('git', ['ls-files', '-s', 'design-system'], { cwd: ROOT, encoding: 'utf8' });
const matched = /^160000 ([0-9a-f]{40}) 0\tdesign-system$/m.exec(ls.stdout || '');
if (!matched) {
  console.error('FAIL  design-system is not a gitlink here: ' + (ls.stdout || ls.stderr || '').trim());
  process.exit(1);
}
const pin = matched[1];
console.log(`gitlink: ${pin}`);

let changedFiles = 0;
for (const file of FILES) {
  const full = path.join(ROOT, file);
  const before = fs.readFileSync(full, 'utf8');
  let replaced = 0;
  const after = before.replace(CITATION, (whole, p1, sha1, p3, p4, sha2, p6) => {
    const current = sha1 || sha2;
    if (current === pin) return whole;
    replaced++;
    return sha1 ? `${p1}${pin}${p3}` : `${p4}${pin}${p6}`;
  });

  if (replaced === 0) {
    console.log(`  ok    ${file}: every cited pin already equals the gitlink`);
    continue;
  }

  changedFiles++;
  if (CHECK_ONLY) {
    console.error(`  STALE ${file}: ${replaced} cited pin(s) differ from the gitlink`);
  } else {
    fs.writeFileSync(full, after);
    console.log(`  wrote ${file}: rolled ${replaced} cited pin(s) to ${pin.slice(0, 12)}`);
  }
}

if (CHECK_ONLY && changedFiles) {
  console.error('Run "npm run design:pin" to roll them, then commit the two documents.');
  process.exit(1);
}

console.log(changedFiles ? 'design-pin: documents updated' : 'design-pin: nothing to do');
