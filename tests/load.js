'use strict';
/* Loads the classic browser scripts into an isolated VM context for Node tests. */
const vm = require('vm');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

function loadGame(options = {}) {
  const files = options.files || ['nasa_data.js', 'i18n.js', 'i18n-dict.js', 'engine.js', 'presets.js']
    .filter((file) => fs.existsSync(path.join(ROOT, file)));
  const sandbox = { console, __store: options.storage || null, __nav: 'navigator' in options ? options.navigator : { language: 'en-US', languages: ['en-US'] } };
  const ctx = vm.createContext(sandbox);
  vm.runInContext(`
    var window = globalThis;
    var navigator = __nav;
    var localStorage = __store;
    var location = { search: '' };
    var PZ_I18N_STRICT = ${options.strict === false ? 'false' : 'true'};
  `, ctx);
  const randomCalls = { count: 0 };
  ctx.__randomCalls = randomCalls;
  if (options.random) {
    ctx.__rand = options.random;
    vm.runInContext('Math.random = function () { __randomCalls.count += 1; return __rand(); };', ctx);
  } else {
    vm.runInContext('(function(){ const r = Math.random; Math.random = function () { __randomCalls.count += 1; return r(); }; })();', ctx);
  }
  files.forEach((file) => {
    vm.runInContext(fs.readFileSync(path.join(ROOT, file), 'utf8'), ctx, { filename: file });
    if (file === 'nasa_data.js' && options.mutateData) {
      options.mutateData(vm.runInContext('NASA_DATA', ctx));
    }
  });
  ctx.NASA_DATA = vm.runInContext("typeof NASA_DATA !== 'undefined' ? NASA_DATA : undefined", ctx);
  ctx.PZ_PRESETS = vm.runInContext("typeof PZ_PRESETS !== 'undefined' ? PZ_PRESETS : undefined", ctx);
  if (options.lang && ctx.I18N) ctx.I18N.setLang(options.lang, { persist: false });
  return ctx;
}

function memoryStorage(initial = {}) {
  const data = new Map(Object.entries(initial));
  return {
    getItem: (k) => (data.has(k) ? data.get(k) : null),
    setItem: (k, v) => { data.set(k, String(v)); },
    removeItem: (k) => { data.delete(k); },
    dump: () => Object.fromEntries(data)
  };
}

module.exports = { loadGame, memoryStorage, ROOT };
