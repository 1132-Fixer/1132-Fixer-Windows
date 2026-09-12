'use strict';

// Behaviour of tools/roll-design-pin.js, the roller the design-system sync
// calls after it moves the gitlink. Pure string transforms only: no git, no
// filesystem, no network, so this runs anywhere `npm test` runs.

const assert = require('assert');
const { PIN_SITES, rollText, citationsIn } = require('./roll-design-pin');

let failures = 0;
function check(cond, name) {
  if (cond) { console.log(`  ok  ${name}`); }
  else { console.error(`FAIL  ${name}`); failures++; }
}
function throws(fn, needle, name) {
  try {
    fn();
    console.error(`FAIL  ${name} (expected a throw, got none)`);
    failures++;
  } catch (err) {
    if (String(err.message).includes(needle)) console.log(`  ok  ${name}`);
    else { console.error(`FAIL  ${name} (message was: ${err.message})`); failures++; }
  }
}

const AGENTS = PIN_SITES.find((s) => s.file === 'AGENTS.md');
const SYNC = PIN_SITES.find((s) => s.file === 'DESIGN-SYNC.md');

const OLD = '133fd766b1f53f34c63de1941e9aedeefde48516';
const NEW = '793d3cf57e3ba87a1e8c32eb88c487dccd81eb9a';
const OTHER = 'ac0f1b1cc789bbaeb64dd2bd731fe18540b76805';
// A 40-hex string that is NOT a design-system pin: this repository's own
// commits appear in prose and must survive untouched.
const UNRELATED = 'a586abeafe44c0a4dd1e517ca5e03b1ec981ab13';

console.log('roll-design-pin: declared citation sites');
check(PIN_SITES.length === 2, 'exactly two files declare pins');
check(AGENTS && SYNC, 'AGENTS.md and DESIGN-SYNC.md are the declared files');

console.log('roll-design-pin: a normal roll');
{
  const text = `- The submodule is a git submodule (gitlink mode 160000,\n  pinned to \`${OLD}\`). The brand-assets check depends on it.\n`;
  const r = rollText(text, AGENTS, NEW);
  check(r.replaced === 1, 'one citation replaced');
  check(r.before === OLD, 'reports the pin it replaced');
  check(r.text.includes(`pinned to \`${NEW}\``), 'the new pin is written');
  check(!r.text.includes(OLD), 'the old pin is gone');
  check(r.text.split('\n').length === text.split('\n').length, 'line count is unchanged');
}

console.log('roll-design-pin: multiple expected occurrences in one file');
{
  const text = `## Panel\n\nPinned design source: \`design-system\` @ \`${OLD}\`\n(notes)\n\n## Ready screen\n\nPinned design source: \`design-system\` @ \`${OLD}\`\n(more notes)\n`;
  const r = rollText(text, SYNC, NEW);
  check(r.replaced === 2, 'both citations replaced');
  check((r.text.match(new RegExp(NEW, 'g')) || []).length === 2, 'both now read the new pin');
  check(r.text.includes('## Ready screen'), 'surrounding prose is intact');
}

console.log('roll-design-pin: an invalid SHA is refused');
{
  const text = `pinned to \`${OLD}\`\n`;
  throws(() => rollText(text, AGENTS, '793d3cf'), 'not a full 40-character', 'a short SHA is refused');
  throws(() => rollText(text, AGENTS, NEW.toUpperCase()), 'not a full 40-character', 'an uppercase SHA is refused');
  throws(() => rollText(text, AGENTS, `${NEW}00`), 'not a full 40-character', 'an over-long SHA is refused');
  throws(() => rollText(text, AGENTS, 'zzzz3cf57e3ba87a1e8c32eb88c487dccd81eb9a'), 'not a full 40-character', 'a non-hex SHA is refused');
  throws(() => rollText(text, AGENTS, ''), 'not a full 40-character', 'an empty SHA is refused');
}

console.log('roll-design-pin: a missing expected pin is an error, never a silent no-op');
{
  throws(() => rollText('No pin anywhere in this document.\n', AGENTS, NEW),
    'no submodule gitlink note citation found', 'AGENTS.md without its citation fails');
  throws(() => rollText('## Panel\n\nSome prose, no pinned design source line.\n', SYNC, NEW),
    'no pinned design source citation found', 'DESIGN-SYNC.md without its citation fails');
}

console.log('roll-design-pin: mixed old pins are ambiguous and are refused');
{
  const text = `Pinned design source: \`design-system\` @ \`${OLD}\`\nPinned design source: \`design-system\` @ \`${OTHER}\`\n`;
  throws(() => rollText(text, SYNC, NEW), 'citations disagree', 'two different pins in one file fail');
  let message = '';
  try { rollText(text, SYNC, NEW); } catch (e) { message = e.message; }
  check(message.includes(OLD) && message.includes(OTHER), 'the error names both disagreeing pins');
}

console.log('roll-design-pin: a malformed pin is refused');
{
  throws(() => rollText('pinned to `133fd766b1f5`\n', AGENTS, NEW), 'malformed pin', 'a truncated pin in the declared shape fails');
  throws(() => rollText(`Pinned design source: \`design-system\` @ \`${OLD}ab\`\n`, SYNC, NEW), 'malformed pin', 'an over-long pin in the declared shape fails');
}

console.log('roll-design-pin: unrelated hashes are protected');
{
  const text = [
    `- pinned to \`${OLD}\`.`,
    `- The windows fix landed in \`${UNRELATED}\`; do not touch it.`,
    `- A bare hash on its own line:`,
    `  ${OTHER}`,
    '',
  ].join('\n');
  const r = rollText(text, AGENTS, NEW);
  check(r.replaced === 1, 'only the declared citation is replaced');
  check(r.text.includes(UNRELATED), 'an unrelated repository commit survives');
  check(r.text.includes(`  ${OTHER}`), 'a bare 40-hex string is not a pin and survives');
  check(r.text.includes(`pinned to \`${NEW}\``), 'the declared citation did roll');
}

console.log('roll-design-pin: a citation outside a declared location is an error');
{
  // The gate scans a broader shape than the roller rewrites. If prose grows a
  // citation the roller does not know about, the gate would fail and the
  // roller would report success, which is the drift this check forbids.
  const text = `pinned to \`${OLD}\`\nSee \`design-system\` at @ \`${OTHER}\` for the old overlay.\n`;
  check(citationsIn(text).length === 2, 'the broad scanner sees both citations');
  throws(() => rollText(text, AGENTS, NEW), 'outside the declared', 'an undeclared citation location fails');
}

console.log('roll-design-pin: idempotence');
{
  const text = `pinned to \`${NEW}\`\n`;
  const first = rollText(text, AGENTS, NEW);
  check(first.replaced === 0, 'rolling to the current pin replaces nothing');
  check(first.text === text, 'the document is byte-identical');
  const second = rollText(first.text, AGENTS, NEW);
  check(second.replaced === 0 && second.text === text, 'a second roll is also a no-op');
}

console.log('roll-design-pin: the submodule HEAD wins over the superproject index');
{
  // The shared sync moves the submodule working tree, runs this hook, and
  // stages the gitlink afterwards. Reading the index during the hook reports
  // the PREVIOUS commit, which is how 1132-Fixer/windows#223 was opened with
  // its gitlink at 08024a1 and its citations rolled to 793d3cf.
  const { submoduleHead, indexGitlink, readGitlink } = require('./roll-design-pin');
  const head = submoduleHead();
  const staged = indexGitlink();
  check(head === null || /^[0-9a-f]{40}$/.test(head), 'submoduleHead returns a full SHA or null');
  check(staged === null || /^[0-9a-f]{40}$/.test(staged), 'indexGitlink returns a full SHA or null');
  if (head) check(readGitlink() === head, 'readGitlink prefers the submodule HEAD');
  else if (staged) check(readGitlink() === staged, 'readGitlink falls back to the staged gitlink');
  else check(true, 'no submodule in this checkout; nothing to compare');
}

console.log('');
if (failures) {
  console.error(`roll-design-pin: ${failures} failure(s)`);
  process.exit(1);
}
console.log('roll-design-pin: all checks passed');
