'use strict';
/* Syntax check for every game script (classic scripts, no modules) and every test file. */
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const files = ['nasa_data.js', 'i18n.js', 'i18n-dict.js', 'engine.js', 'presets.js', 'ui.js']
  .concat(fs.readdirSync(__dirname).filter((f) => f.endsWith('.js')).map((f) => path.join('tests', f)));
let failed = 0;
files.forEach((file) => {
  try {
    execFileSync(process.execPath, ['--check', path.join(root, file)], { stdio: 'pipe' });
    console.log(`ok   ${file}`);
  } catch (error) {
    failed += 1;
    console.error(`FAIL ${file}\n${error.stderr || error.message}`);
  }
});
// Game scripts must stay classic scripts: no import/export statements.
['nasa_data.js', 'i18n.js', 'i18n-dict.js', 'engine.js', 'presets.js', 'ui.js'].forEach((file) => {
  const src = fs.readFileSync(path.join(root, file), 'utf8');
  if (/^\s*(import|export)\s/m.test(src)) {
    failed += 1;
    console.error(`FAIL ${file}: contains import/export (must be a classic script)`);
  }
});
if (failed) {
  console.error(`${failed} file(s) failed`);
  process.exit(1);
}
console.log(`All ${files.length} files passed node --check.`);
