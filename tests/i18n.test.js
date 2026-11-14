'use strict';
/* Localization tests: dictionary completeness and symmetry, placeholder parity, plural forms,
   number formats, language detection, strict missing-key detection, and dynamic engine output
   in both languages (not just a Cyrillic grep). */
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { loadGame, memoryStorage, ROOT } = require('./load');

const plain = (value) => JSON.parse(JSON.stringify(value));
const CYRILLIC = /[Ѐ-ӿ]/;
// Latin tokens allowed inside Ukrainian text: brand, NASA, proper names of launchers and missions,
// established mission/instrument abbreviations, band letters, rank letters, code prefix.
const UK_LATIN_ALLOW = new Set(('PAYLOAD ZERO NASA LRO MRO Landsat Falcon Heavy Block Atlas V SLS Space Launch System '
  + 'LOLA LEND LROC HiRISE CRISM SHARAD OLI-2 TIRS-2 Ka S X PZ SST-SOA ULA SpaceX Artemis Kepler Voyager '
  + 'Mars Reconnaissance Orbiter LEO TLI SWIR A B C F T-00').split(' '));
const EXCLUDE_LATIN = new Set(['lang.en']);
const EXCLUDE_CYR = new Set(['lang.uk']);

function latinTokens(text) {
  return (text.match(/[A-Za-z][A-Za-z0-9-]*/g) || []).map((tok) => tok.replace(/-+$/, '')).filter((tok) => !UK_LATIN_ALLOW.has(tok));
}

function placeholders(value) {
  const names = new Set();
  const strings = typeof value === 'string' ? [value] : Object.values(value);
  strings.forEach((s) => {
    for (const m of s.matchAll(/\{(\w+)(?::\w+)?(?:[#@]\w+)?\}/g)) names.add(m[1]);
  });
  return [...names].sort();
}

test('dictionaries are symmetric, typed alike and use the same placeholders', () => {
  const ctx = loadGame();
  const { uk, en } = ctx.I18N.DICT;
  const ukKeys = Object.keys(uk).sort();
  const enKeys = Object.keys(en).sort();
  assert.deepEqual(ukKeys, enKeys);
  assert.ok(ukKeys.length > 600);
  ukKeys.forEach((key) => {
    assert.equal(typeof uk[key], typeof en[key], key);
    assert.ok(typeof uk[key] === 'string' ? uk[key].trim().length > 0 : true, `${key} is empty`);
    assert.deepEqual(placeholders(uk[key]), placeholders(en[key]), `placeholders differ for ${key}`);
    if (typeof uk[key] === 'object') {
      assert.deepEqual(Object.keys(uk[key]).sort(), ['few', 'many', 'one', 'other'], `uk plural ${key}`);
      assert.deepEqual(Object.keys(en[key]).sort(), ['one', 'other'], `en plural ${key}`);
    }
  });
});

test('English values contain no Cyrillic; Ukrainian values contain no stray English', () => {
  const { uk, en } = loadGame().I18N.DICT;
  const forbidden = /\b(mass|powerConsumption|months|BOTTLENECK|FILL REQUIRED SLOTS|Engine|canLaunch|verifiedSpecs)\b/;
  Object.entries(en).forEach(([key, value]) => {
    if (EXCLUDE_CYR.has(key)) return;
    assert.ok(!CYRILLIC.test(JSON.stringify(value)), `Cyrillic in en ${key}: ${JSON.stringify(value)}`);
  });
  Object.entries(uk).forEach(([key, value]) => {
    if (EXCLUDE_LATIN.has(key)) return;
    const text = typeof value === 'string' ? value : Object.values(value).join(' ');
    const stripped = text.replace(/\{[^}]*\}/g, '');
    assert.ok(!forbidden.test(stripped), `forbidden word in uk ${key}: ${text}`);
    // Strings without Cyrillic are allowed only when every Latin token is an allowed proper name/abbreviation.
    assert.deepEqual(latinTokens(stripped), [], `English in uk ${key}: ${text}`);
  });
});

test('every UI key used in ui.js and index.html exists', () => {
  const ctx = loadGame();
  const { uk, en } = ctx.I18N.DICT;
  const src = fs.readFileSync(path.join(ROOT, 'ui.js'), 'utf8') + fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const keys = new Set();
  for (const m of src.matchAll(/\bt\('([a-zA-Z0-9_.]+)'/g)) keys.add(m[1]);
  for (const m of src.matchAll(/data-i18n="([^"]+)"/g)) keys.add(m[1]);
  for (const m of src.matchAll(/data-i18n-attr="([^"]+)"/g)) m[1].split(';').forEach((p) => keys.add(p.split(':')[1]));
  ['easy', 'medium', 'hard'].forEach((d) => keys.add(`diff.${d}`));
  ['science', 'engineer', 'ballistics', 'director'].forEach((r) => ['name', 'duty'].forEach((f) => keys.add(`role.${r}.${f}`)));
  ['science', 'engineer', 'ballistics', 'director'].forEach((r) => keys.add(`cr.role.${r}`));
  for (let i = 1; i <= 6; i += 1) { keys.add(`tut.${i}.title`); keys.add(`tut.${i}.body`); }
  ['ok', 'warn', 'error'].forEach((l) => keys.add(`lvl.${l}`));
  ['solo', 'team'].forEach((m) => keys.add(`mode.changed.${m}`));
  ['SUCCESS', 'WARNING', 'PARTIAL', 'FAILED', 'PENDING', 'RUNNING'].forEach((s) => keys.add(`status.${s}`));
  Object.values(ctx.PZ_PRESETS).flat().forEach((p) => { keys.add(`preset.${p.id}.name`); keys.add(`preset.${p.id}.desc`); });
  const missing = [...keys].filter((k) => !(k in uk) || !(k in en));
  assert.deepEqual(missing, []);
});

test('every NASA catalog entity is translated by stable ID; verifiedSpecs labels and string values are covered', () => {
  const ctx = loadGame();
  const { uk, en } = ctx.I18N.DICT;
  const D = ctx.NASA_DATA;
  const need = [];
  D.missions.forEach((m) => ['name', 'short', 'desc'].forEach((f) => need.push(`data.mission.${m.id}.${f}`)));
  D.orbits.forEach((o) => ['name', 'desc'].forEach((f) => need.push(`data.orbit.${o.id}.${f}`)));
  D.launchVehicles.forEach((l) => ['name', 'desc'].forEach((f) => need.push(`data.lv.${l.id}.${f}`)));
  D.busComponents.forEach((p) => ['name', 'desc'].forEach((f) => need.push(`data.part.${p.id}.${f}`)));
  D.instruments.forEach((i) => ['name', 'type', 'desc'].forEach((f) => need.push(`data.inst.${i.id}.${f}`)));
  D.crisisEvents.forEach((c) => {
    ['name', 'title', 'desc'].forEach((f) => need.push(`data.crisis.${c.id}.${f}`));
    c.options.forEach((_, i) => need.push(`data.crisis.${c.id}.opt${i}`));
  });
  ['Earth', 'Moon', 'Mars'].forEach((b) => ['name', 'gen'].forEach((f) => need.push(`target.${b}.${f}`)));
  ctx.Engine.CATEGORIES.forEach((c) => ['cat', 'catTitle', 'catHint'].forEach((p) => need.push(`${p}.${c}`)));
  [...D.missions, ...D.orbits, ...D.launchVehicles, ...D.busComponents, ...D.instruments].forEach((item) => {
    Object.entries(item.verifiedSpecs || {}).forEach(([key, value]) => {
      need.push(`spec.${key}`);
      if (typeof value === 'string' && !/^\d{4}-\d{2}-\d{2}$/.test(value)) need.push(`specval.${item.id}.${key}`);
    });
  });
  const missing = need.filter((k) => !(k in uk) || !(k in en));
  assert.deepEqual(missing, []);
});

test('NASA verifiedSpecs, LEO capacities and source URLs are unchanged from the original dataset', () => {
  const D = loadGame().NASA_DATA;
  const all = [...D.missions, ...D.orbits, ...D.launchVehicles, ...D.busComponents.filter((p) => p.origin !== 'game'), ...D.instruments]
    .map((x) => [x.id, x.verifiedSpecs, x.maxPayloadKg ?? null, x.nasaSourceUrl]);
  const digest = crypto.createHash('sha256').update(JSON.stringify(all)).digest('hex');
  // Digest computed from the original commit (55e1ef0) before any balance change.
  assert.equal(digest, '9b4fd40501e44aeb927478eb632ddaf5d33573217a66d960fd854fc059a0094c');
  D.busComponents.filter((p) => p.origin === 'game').forEach((p) => {
    assert.deepEqual(plain(p.verifiedSpecs), {}, `${p.id} must not claim NASA-verified numbers`);
    assert.ok(p.gameOnlyFields.includes('radiationResistance'));
  });
});

test('number formats, units and plural forms follow the locale', () => {
  const I = loadGame().I18N;
  I.setLang('uk', { persist: false });
  assert.match(I.num(1400.5), /^1\s400,5$/);
  assert.match(I.num(-12.25), /^[-−]12,25$/);
  assert.equal(I.t('stat.points', { n: 1 }), '1 бал');
  assert.equal(I.t('stat.points', { n: 2 }), '2 бали');
  assert.equal(I.t('stat.points', { n: 5 }), '5 балів');
  assert.equal(I.t('stat.points', { n: 11 }), '11 балів');
  assert.equal(I.t('stat.points', { n: 21 }), '21 бал');
  assert.equal(I.t('stat.points', { n: 1.5 }), '1,5 бала');
  assert.equal(I.t('stat.months', { n: 1 }), '1 місяць');
  assert.equal(I.t('stat.months', { n: 3 }), '3 місяці');
  assert.equal(I.t('stat.months', { n: 38 }), '38 місяців');
  assert.equal(I.t('launch.risky', { n: 2 }), 'ЗАПУСК (2 попередження)');
  assert.equal(I.t('launch.risky', { n: 5 }), 'ЗАПУСК (5 попереджень)');
  assert.equal(I.t('fmt.money', { n: 1250 }).replace(/\s/g, ' '), '1 250 млн $');
  assert.equal(I.t('fmt.kg', { n: 22800 }).replace(/\s/g, ' '), '22 800 кг');
  assert.equal(I.t('fmt.wh', { n: 400 }), '400 Вт·год');
  assert.equal(I.t('fmt.gbday', { n: 12.5 }), '12,5 Гб/добу');
  I.setLang('en', { persist: false });
  assert.equal(I.num(1400.5), '1,400.5');
  assert.equal(I.t('stat.points', { n: 1 }), '1 point');
  assert.equal(I.t('stat.points', { n: 2 }), '2 points');
  assert.equal(I.t('stat.months', { n: 1 }), '1 month');
  assert.equal(I.t('fmt.money', { n: 1250 }), '$1,250M');
  assert.equal(I.t('fmt.wh', { n: 400 }), '400 Wh');
  assert.equal(I.t('fmt.gbday', { n: 12.5 }), '12.5 Gb/day');
  assert.equal(I.t('launch.risky', { n: 1 }), 'LAUNCH (1 warning)');
  assert.equal(I.date('2009-06-18'), 'June 18, 2009');
  I.setLang('uk', { persist: false });
  assert.match(I.date('2009-06-18'), /18 червня 2009/);
});

test('language detection: stored choice, then browser language, else English; never crashes', () => {
  const uk = loadGame({ navigator: { language: 'uk-UA', languages: ['uk-UA', 'en'] } });
  assert.equal(uk.I18N.getLang(), 'uk');
  const en = loadGame({ navigator: { language: 'de-DE', languages: ['de-DE'] } });
  assert.equal(en.I18N.getLang(), 'en');
  const none = loadGame({ navigator: null });
  assert.equal(none.I18N.getLang(), 'en');
  const stored = loadGame({ navigator: { language: 'en-US' }, storage: memoryStorage({ 'pz.lang': 'uk' }) });
  assert.equal(stored.I18N.getLang(), 'uk');
  const broken = {
    getItem() { throw new Error('SecurityError'); },
    setItem() { throw new Error('QuotaExceeded'); },
    removeItem() { throw new Error('SecurityError'); }
  };
  const locked = loadGame({ navigator: { language: 'uk' }, storage: broken });
  assert.equal(locked.I18N.getLang(), 'uk');
  assert.doesNotThrow(() => locked.I18N.setLang('en'));
  assert.equal(locked.I18N.getLang(), 'en');
});

test('language choice is persisted to localStorage and survives a reload', () => {
  const storage = memoryStorage();
  const first = loadGame({ storage, navigator: { language: 'en-US' } });
  first.I18N.setLang('uk');
  assert.equal(storage.getItem('pz.lang'), 'uk');
  const second = loadGame({ storage, navigator: { language: 'en-US' } });
  assert.equal(second.I18N.getLang(), 'uk');
});

test('missing keys are detected loudly in strict (dev/test) mode and never crash production', () => {
  const strict = loadGame({ strict: true });
  assert.throws(() => strict.I18N.t('no.such.key'), /Missing key "no\.such\.key"/);
  assert.throws(() => strict.I18N.t('eng.err.budget', {}), /Missing parameter "over"/);
  const silent = { warn() {} };
  const prod = loadGame({ strict: false });
  prod.console = silent;
  const out = prod.I18N.t('no.such.key');
  assert.equal(out, '⟦no.such.key⟧');
  assert.ok(prod.I18N.missing.has('en:no.such.key'));
  assert.notEqual(out, prod.I18N.t('app.tagline'), 'no silent fallback to the other language');
});

function collectEngineStrings(lang) {
  const out = [];
  const ctx = loadGame({ lang, random: (() => { const rolls = [0.01, 0.999, 0.01, 0.5, 0.2, 0.9]; let i = 0; return () => rolls[i++ % rolls.length]; })() });
  const E = ctx.Engine;
  const push = (...items) => items.flat(Infinity).forEach((s) => { if (typeof s === 'string') out.push(s); });
  const state = () => {
    const s = E.getState();
    push(s.compatibility.errors, s.compatibility.warnings, s.advisors.map((a) => [a.title, a.message]));
  };
  push(E.getState().advisors.map((a) => a.message));
  E.getMissions().forEach((m) => {
    E.initMission(m.id);
    state();
    E.selectOrbit(m.id === 'm3' ? 'orb_earth_leo' : 'orb_earth_sso');
    E.selectRocket('lv_atlas_v');
    ['inst_lola', 'inst_hirise', 'inst_oli2', 'inst_crism'].forEach((id) => E.toggleInstrument(id));
    state();
    try { E.toggleInstrument('inst_lend'); } catch (e) { push(e.message); }
    try { E.startSimulation(); } catch (e) { push(e.message); }
  });
  const errs = [() => E.importBlueprintCode('nope'), () => E.importBlueprintCode('PZ|1|m9|solo||||||||||'),
    () => E.selectBusPart('power', 'ch_std'), () => E.initMission('m1', ''), () => E.resolveCrisis(0)];
  errs.forEach((fn) => { try { fn(); } catch (e) { push(e.message); } });
  Object.entries(ctx.PZ_PRESETS).forEach(([mid, list]) => {
    list.forEach((p) => {
      const ev = ctx.NASA_DATA.crisisEvents.find((c) => c.targetBody === E.getMissions().find((m) => m.id === mid).targetBody);
      ev.options.forEach((_, oi) => {
        E.initMission(mid);
        E.selectRocket(p.rocketId);
        E.CATEGORIES.forEach((c) => E.selectBusPart(c, p.bus[c]));
        p.instrumentIds.forEach((id) => E.toggleInstrument(id));
        state();
        const crisis = E.startSimulation();
        push(crisis.title, crisis.description, crisis.options.map((o) => [o.text, o.lockReason]));
        if (!crisis.options[oi].isAvailable) {
          try { E.resolveCrisis(oi); } catch (e) { push(e.message); }
          return;
        }
        const r = E.resolveCrisis(oi);
        push(r.insights, r.usedNasaSources.map((s) => [s.name, s.nasaInfo]));
        push(E.simulation.phases.map((ph) => [ph.title, ph.logs]));
      });
    });
  });
  return out;
}

test('dynamic engine output (errors, warnings, advisors, phases, crisis, report) is fully in the chosen language', () => {
  const en = collectEngineStrings('en');
  const uk = collectEngineStrings('uk');
  assert.ok(en.length > 300 && uk.length === en.length, `${en.length} vs ${uk.length}`);
  en.forEach((s) => assert.ok(!CYRILLIC.test(s), `Cyrillic in English output: ${s}`));
  en.forEach((s) => assert.ok(!s.includes('⟦'), `missing key marker: ${s}`));
  uk.forEach((s) => {
    assert.ok(!s.includes('⟦'), `missing key marker: ${s}`);
    const ids = s.replace(/\b(inst|lv|ch|pw|bat|com|cpu|orb|m)\d*_[a-z0-9_]+\b|\bm\d\b/g, '');
    assert.deepEqual(latinTokens(ids.replace(/https?:\S+/g, '')), [], `English in Ukrainian output: ${s}`);
  });
});
