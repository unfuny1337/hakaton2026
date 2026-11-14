'use strict';
/* End-to-end UI checks in a real headless Chromium-based browser (Edge/Chrome) via CDP.
   Run: node tests/ui.e2e.js        (writes screenshots to docs/screenshots/)
   Randomness is controlled by a page init script that replaces Math.random for the test only. */
const path = require('path');
const { launch, delay } = require('./cdp');
const { start } = require('./serve');

const SHOTS = path.join(__dirname, '..', 'docs', 'screenshots');
const CYRILLIC = /[Ѐ-ӿ]/;
const UK_LATIN_ALLOW = new Set(('PAYLOAD ZERO NASA LRO MRO Landsat Falcon Heavy Block Atlas V SLS Space Launch System '
  + 'LOLA LEND LROC HiRISE CRISM SHARAD OLI-2 TIRS-2 Ka S X PZ SST-SOA ULA SpaceX Artemis Kepler Voyager '
  + 'Mars Reconnaissance Orbiter LEO TLI SWIR A B C F T-00').split(' '));

const results = [];
let browser;
let baseUrl;

function initScript({ lang, rolls = null, storage = {}, tutorialSeen = true, brokenStorage = false }) {
  const params = JSON.stringify({ lang, rolls, storage, tutorialSeen, brokenStorage });
  return `(() => {
    const p = ${params};
    if (p.brokenStorage) {
      Object.defineProperty(window, 'localStorage', { configurable: true, get() { throw new Error('SecurityError: storage denied'); } });
    } else {
      try {
        if (!sessionStorage.getItem('pz.__init')) {
          sessionStorage.setItem('pz.__init', '1');
          localStorage.clear();
          if (p.lang) localStorage.setItem('pz.lang', p.lang);
          if (p.tutorialSeen) localStorage.setItem('pz.tutorialSeen', '1');
          Object.entries(p.storage).forEach(([k, v]) => localStorage.setItem(k, v));
        }
      } catch (e) {}
    }
    window.__randomCalls = 0;
    window.__confirmCalls = 0;
    window.confirm = () => { window.__confirmCalls += 1; return false; };
    const original = Math.random;
    let i = 0;
    Math.random = function () { window.__randomCalls += 1; return p.rolls ? p.rolls[i++ % p.rolls.length] : original(); };
  })();`;
}

async function openGame(opts = {}) {
  const page = await browser.newPage();
  await page.init({ width: opts.width || 1280, height: opts.height || 900, mobile: !!opts.mobile,
    reducedMotion: opts.reducedMotion !== false, blockFonts: !!opts.blockFonts, initScript: initScript(opts) });
  await page.goto(opts.url || baseUrl + (opts.query || ''));
  await page.waitFor('window.PZ_UI && window.Engine');
  return page;
}

const ONLY = process.env.E2E_ONLY ? new RegExp(process.env.E2E_ONLY, 'i') : null;

async function check(name, fn) {
  if (ONLY && !ONLY.test(name)) return;
  const started = Date.now();
  let page = null;
  const track = (p) => { page = p; return p; };
  try {
    await fn(track);
    if (page && page.errors.length) throw new Error(`console/JS errors: ${page.errors.join(' | ')}`);
    results.push({ name, ok: true, ms: Date.now() - started });
    console.log(`ok   ${name} (${Date.now() - started} ms)`);
  } catch (error) {
    results.push({ name, ok: false, error: error.message });
    if (page) {
      const file = path.join(require('os').tmpdir(), `pz-fail-${name.replace(/[^a-z0-9]+/gi, '-').slice(0, 60)}.png`);
      try {
        const state = await page.eval('({ screen: PZ_UI.screen(), stage: PZ_UI.flightStage(), dlg: document.getElementById("dlg").hidden ? null : document.getElementById("dlgTitle").textContent, toast: document.getElementById("toast").hidden ? null : document.getElementById("toast").textContent })');
        await page.screenshot(file);
        console.log(`     state: ${JSON.stringify(state)}
     screenshot: ${file}`);
      } catch (_) { /* page may be gone */ }
    }
    console.log(`FAIL ${name}\n     ${error.message.split('\n').join('\n     ')}`);
  } finally {
    if (page) await page.close();
  }
}

function assert(cond, message) { if (!cond) throw new Error(message); }

/** Visible text + accessible attributes, excluding the УКР/ENG switch, code fields and URLs. */
async function visibleText(page) {
  return page.eval(`(() => {
    const out = [];
    const hidden = (el) => !!el.closest('[hidden]') || (el.closest('.screen') && !el.closest('.screen').classList.contains('active'));
    const skip = (el) => el.closest('.lang-seg') || el.closest('textarea') || el.closest('script') || el.closest('style');
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let n;
    while ((n = walker.nextNode())) {
      const el = n.parentElement;
      if (!el || skip(el) || hidden(el) || !n.nodeValue.trim()) continue;
      out.push(n.nodeValue.trim());
    }
    document.querySelectorAll('[title],[aria-label],[placeholder]').forEach((el) => {
      if (skip(el) || hidden(el)) return;
      ['title', 'aria-label', 'placeholder'].forEach((a) => { const v = el.getAttribute(a); if (v) out.push(v); });
    });
    out.push(document.title);
    return out;
  })()`);
}

function cleanForScan(text) {
  return text
    .replace(/https?:\/\/\S+/g, '')
    .replace(/[A-Za-z0-9_-]+(\.[A-Za-z0-9_-]+)+\/?\S*/g, '')
    .replace(/\b[a-z]+_[a-z0-9_]+\b/g, '')
    .replace(/PZ\|1\|[^\s]*/g, '');
}

async function assertLanguage(page, lang, where) {
  const texts = await visibleText(page);
  const docLang = await page.eval('document.documentElement.lang');
  assert(docLang === lang, `${where}: <html lang> is ${docLang}, expected ${lang}`);
  texts.forEach((raw) => {
    assert(!raw.includes('⟦'), `${where}: missing translation marker in "${raw}"`);
    const text = cleanForScan(raw);
    if (lang === 'en') {
      assert(!CYRILLIC.test(text), `${where}: Cyrillic in English UI: "${raw}"`);
    } else {
      const bad = (text.match(/[A-Za-z][A-Za-z0-9-]*/g) || []).map((x) => x.replace(/-+$/, '')).filter((x) => !UK_LATIN_ALLOW.has(x));
      assert(bad.length === 0, `${where}: English in Ukrainian UI: "${raw}" → ${bad.join(', ')}`);
    }
  });
  return texts.length;
}

// offsetParent is always null for position:fixed elements (dialogs, toast), so check layout instead.
const isVisible = (sel) => `(() => { const el = document.querySelector(${JSON.stringify(sel)});
  if (!el || el.closest('[hidden]')) return false;
  const cs = getComputedStyle(el); const r = el.getBoundingClientRect();
  return cs.display !== 'none' && cs.visibility !== 'hidden' && r.width > 0 && r.height > 0; })()`;

async function confirmIfDialog(page) {
  await delay(80);
  if (await page.eval(isVisible('#dlg'))) {
    await page.click('[data-dlg="ok"]');
    await page.waitFor(`document.getElementById('dlg').hidden`);
  }
}

async function startMission(page, missionId) {
  if (await page.eval('PZ_UI.screen() !== 1')) {
    await page.eval(`document.getElementById('homeBtn').click()`);
    await page.waitFor('PZ_UI.screen() === 1');
  }
  await page.click(`[data-act="start"][data-id="${missionId}"]`);
  await confirmIfDialog(page);
  await page.waitFor('PZ_UI.screen() === 2');
}

async function loadPreset(page, presetId) {
  await page.click(`[data-act="preset"][data-id="${presetId}"]`);
  await confirmIfDialog(page);
  await page.waitFor('Engine.getState().compatibility.canLaunch', { message: `${presetId} not launchable` });
}

async function launchToCrisis(page) {
  await page.click('#launchBtn');
  await delay(80);
  if (await page.eval(isVisible('#dlg'))) await page.click('[data-dlg="ok"]');
  await page.waitFor('PZ_UI.screen() === 3');
  await page.waitFor(isVisible('#crisis'), { timeout: 20000, message: 'crisis dialog did not open' });
}

async function resolveCrisis(page, optionIndex) {
  await page.click(`#crOpts .opt[data-i="${optionIndex}"]`);
  await page.waitFor(`document.querySelector('#crOpts .opt[data-i="${optionIndex}"]').getAttribute('aria-pressed') === 'true'`);
  await page.click('#crConfirm');
  await page.waitFor('PZ_UI.screen() === 4', { timeout: 20000, message: 'report screen not reached' });
}

/* ------------------------------------------------------------------ */

async function fullRun(lang) {
  await check(`full scenario in ${lang}: all three missions to the final report`, async (track) => {
    const page = track(await openGame({ lang, rolls: [0.01] }));
    assert(await page.eval('document.documentElement.lang') === lang, 'html lang');
    await assertLanguage(page, lang, 'briefing');
    await page.screenshot(path.join(SHOTS, `${lang}-01-briefing.png`));
    const plan = [['m3', 'earth_f9_ka', 0], ['m1', 'moon_fh_shielded', 1], ['m2', 'mars_sls_heavy', 0]];
    for (const [missionId, presetId, option] of plan) {
      await startMission(page, missionId);
      await loadPreset(page, presetId);
      await assertLanguage(page, lang, `builder ${missionId}`);
      if (missionId === 'm2') await page.screenshot(path.join(SHOTS, `${lang}-02-builder.png`));
      await page.click('#launchBtn');
      await delay(100);
      const preflight = await page.eval(isVisible('#dlg'));
      if (missionId === 'm2') {
        assert(preflight, 'warnings must show a pre-launch confirmation');
        await assertLanguage(page, lang, 'pre-launch dialog');
      }
      if (preflight) await page.click('[data-dlg="ok"]');
      await page.waitFor(isVisible('#crisis'), { timeout: 20000 });
      assert(await page.eval(`document.getElementById('crisis').contains(document.activeElement)`), 'focus must move into the crisis dialog');
      await assertLanguage(page, lang, `crisis ${missionId}`);
      if (missionId === 'm1') await page.screenshot(path.join(SHOTS, `${lang}-03-crisis.png`));
      const phasesBefore = await page.eval('Engine.simulation.phases.length');
      assert(phasesBefore === 3, `3 phases before the crisis, got ${phasesBefore}`);
      await resolveCrisis(page, option);
      const report = await page.eval('Engine.getBlackBoxReport()');
      assert(report.status === 'SUCCESS', `${missionId}: expected SUCCESS, got ${report.status}`);
      assert(await page.eval('Engine.simulation.phases.length') === 4, '4 phases after the crisis');
      const badge = await page.eval(`document.querySelector('#report .badge').textContent`);
      assert(badge === (lang === 'uk' ? 'УСПІХ' : 'SUCCESS'), `badge text ${badge}`);
      const terminal = await page.eval(`document.getElementById('termLog').textContent`);
      assert(terminal.includes(lang === 'uk' ? 'ФАЗА 4/4' : 'PHASE 4/4'), 'terminal shows phase 4');
      await assertLanguage(page, lang, `report ${missionId}`);
      if (missionId === 'm2') {
        await page.screenshot(path.join(SHOTS, `${lang}-04-report.png`));
        await page.screenshot(path.join(SHOTS, `${lang}-04-report-full.png`), { fullPage: true });
      }
      await page.eval(`document.getElementById('newMissionBtn').click()`);
      await page.waitFor('PZ_UI.screen() === 1');
    }
    assert(await page.eval('window.__randomCalls') === 3, 'exactly one survival roll per flight');
    assert(await page.eval('window.__confirmCalls') === 0, 'no native confirm() prompts');
  });
}

async function partialAndFailed() {
  for (const lang of ['uk', 'en']) {
    await check(`PARTIAL and FAILED reports render and explain design vs. chance in ${lang}`, async (track) => {
      const page = track(await openGame({ lang, rolls: [0.01, 0.999] }));
      await startMission(page, 'm2');
      await loadPreset(page, 'mars_fh_lean');
      await launchToCrisis(page);
      await resolveCrisis(page, 0); // safe mode: survives, science 98 < 115
      let r = await page.eval('Engine.getBlackBoxReport()');
      assert(r.status === 'PARTIAL' && r.finalScore <= 79, `expected PARTIAL ≤ 79, got ${r.status} ${r.finalScore}`);
      assert(await page.eval(`document.querySelector('#report .luck').classList.contains('design')`), 'PARTIAL must be explained as a design/decision outcome');
      assert(await page.eval(`document.querySelectorAll('#report .tips li').length >= 1`), 'no advice for PARTIAL');
      await assertLanguage(page, lang, 'PARTIAL report');
      await page.click('#newFlightBtn');
      await page.waitFor(isVisible('#crisis'), { timeout: 20000 });
      await resolveCrisis(page, 1); // roll 0.999 → lost
      r = await page.eval('Engine.getBlackBoxReport()');
      assert(r.status === 'FAILED' && r.finalScore === 0 && r.rank === 'F', `expected FAILED, got ${r.status}`);
      assert(await page.eval(`!!document.querySelector('#report .wf li.zero')`), 'waterfall must show the loss');
      assert(await page.eval(`document.querySelector('#report .luck').classList.contains('bad')`), 'an 82% chance lost to a 99.9 roll is bad luck, not design');
      await assertLanguage(page, lang, 'FAILED report');
    });
  }
}

async function strictAndFileMode() {
  for (const lang of ['uk', 'en']) {
    await check(`strict i18n mode (?dev=1) in ${lang}: every rendered key and parameter exists`, async (track) => {
      const page = track(await openGame({ lang, rolls: [0.01], query: '?dev=1', tutorialSeen: false }));
      assert(await page.eval('I18N.isStrict()'), 'strict mode not active');
      for (let i = 0; i < 5; i += 1) await page.click('[data-dlg="next"]');
      await page.click('[data-dlg="skip"]');
      await page.eval(`document.getElementById('shareBtn').click()`);
      await page.eval(`document.getElementById('shareClose').click()`);
      await page.click('#modeSeg [data-mode="team"]');
      await startMission(page, 'm1');
      await page.click('[data-act="team-size"][data-n="4"]');
      for (const tab of ['launch', 'bus', 'inst']) {
        await page.eval(`document.getElementById('tab-${tab}').click()`);
        await page.eval(`[...document.querySelectorAll('#catalogBody details')].forEach((d) => { d.open = true; })`);
        await page.click('[data-act="preview"]');
      }
      await loadPreset(page, 'moon_f9_narrow');
      for (let i = 0; i < 4; i += 1) await page.click(`[data-act="approve"][data-i="${i}"]`);
      await launchToCrisis(page);
      await resolveCrisis(page, 0);
      assert(await page.eval('I18N.missing.size') === 0, 'missing keys recorded');
    });
  }
  await check('the game also runs from file:// without a server', async (track) => {
    const fileUrl = require('url').pathToFileURL(path.join(__dirname, '..', 'index.html')).href;
    const page = track(await openGame({ lang: 'en', rolls: [0.01], url: fileUrl }));
    await startMission(page, 'm3');
    await loadPreset(page, 'earth_f9_ka');
    await launchToCrisis(page);
    await resolveCrisis(page, 0);
  });
}

async function languageSwitching() {
  await check('language switch before mission, in builder, in pre-launch dialog, during phases, in crisis, after report', async (track) => {
    const page = track(await openGame({ lang: 'uk', rolls: [0.05], reducedMotion: false }));
    await page.click('#top [data-lang="en"]');
    await page.waitFor(`document.documentElement.lang === 'en'`);
    await assertLanguage(page, 'en', 'briefing after switch');
    await page.click('#top [data-lang="uk"]');
    await page.waitFor(`document.documentElement.lang === 'uk'`);
    await startMission(page, 'm1');
    await loadPreset(page, 'moon_f9_narrow');
    const snap = `JSON.stringify({ s: (() => { const s = Engine.getState(); return { b: s.build, m: s.mode, t: s.telemetry, c: s.compatibility.canLaunch, w: s.compatibility.warnings.length, e: s.compatibility.errors.length }; })(), d: document.getElementById('launchBtn').disabled })`;
    const before = await page.eval(snap);
    const ukLabel = await page.eval(`document.getElementById('launchBtn').textContent`);
    await page.click('#top [data-lang="en"]');
    await page.waitFor(`document.documentElement.lang === 'en'`);
    assert(await page.eval(snap) === before, 'builder state changed after a language switch');
    const enLabel = await page.eval(`document.getElementById('launchBtn').textContent`);
    assert(ukLabel !== enLabel && !CYRILLIC.test(enLabel), `launch label not translated: ${ukLabel} / ${enLabel}`);
    await assertLanguage(page, 'en', 'builder after switch');
    // pre-launch dialog (the build has one warning)
    await page.click('#launchBtn');
    await page.waitFor(isVisible('#dlg'));
    const enTitle = await page.eval(`document.getElementById('dlgTitle').textContent`);
    await page.click('#dlg [data-lang="uk"]');
    await page.waitFor(`document.documentElement.lang === 'uk'`);
    assert(await page.eval(isVisible('#dlg')), 'pre-launch dialog closed on language switch');
    assert(await page.eval(`document.getElementById('dlgTitle').textContent`) !== enTitle, 'dialog not re-rendered');
    assert(await page.eval(`document.activeElement && document.activeElement.dataset.lang === 'uk'`), 'focus lost after switch in dialog');
    await page.click('[data-dlg="ok"]');
    // during phases
    await page.waitFor('PZ_UI.screen() === 3');
    await page.waitFor(`document.getElementById('termLog').textContent.split('\\n').length >= 4`);
    assert(await page.eval(`PZ_UI.flightStage() === 'phases'`), 'should still be in phases');
    await page.click('#top [data-lang="en"]');
    await page.waitFor(`document.documentElement.lang === 'en'`);
    const term = await page.eval(`document.getElementById('termLog').textContent`);
    assert(!CYRILLIC.test(term), 'terminal log not re-rendered in English');
    assert(term.includes('PHASE 1/4'), 'English phase header missing');
    await assertLanguage(page, 'en', 'flight after switch');
    await page.waitFor(isVisible('#crisis'), { timeout: 30000 });
    // crisis open: select, then switch language inside the dialog
    await page.click('#crOpts .opt[data-i="0"]');
    const crisisSnap = `JSON.stringify(Engine.simulation.crisis.options.map((o) => [o.isAvailable, o.effectiveSurvivalChance]).concat([...document.querySelectorAll('#crOpts .opt')].map((b) => [b.disabled, b.getAttribute('aria-pressed')])))`;
    const c0 = await page.eval(crisisSnap);
    const title0 = await page.eval(`document.getElementById('crTitle').textContent`);
    await page.click('#crisis [data-lang="uk"]');
    await page.waitFor(`document.documentElement.lang === 'uk'`);
    assert(await page.eval(isVisible('#crisis')), 'crisis closed on language switch');
    assert(await page.eval(crisisSnap) === c0, 'crisis options/selection changed on language switch');
    assert(await page.eval(`document.getElementById('crTitle').textContent`) !== title0, 'crisis not translated');
    assert(await page.eval(`document.activeElement && document.activeElement.dataset.lang === 'uk' && document.getElementById('crisis').contains(document.activeElement)`), 'focus left the crisis dialog');
    await assertLanguage(page, 'uk', 'crisis after switch');
    const randomBefore = await page.eval('window.__randomCalls');
    assert(randomBefore === 0, 'no roll before the decision');
    await page.click('#crConfirm');
    await page.waitFor('PZ_UI.screen() === 4', { timeout: 20000 });
    const rep = `JSON.stringify((() => { const r = Engine.getBlackBoxReport(); const s = Engine.simulation; return [r.status, r.finalScore, r.finalScience, r.rank, s.survivalRoll, s.survivalChance, r.blueprintCode]; })())`;
    const r0 = await page.eval(rep);
    const heading0 = await page.eval(`document.getElementById('repTitle').textContent`);
    await page.click('#top [data-lang="en"]');
    await page.waitFor(`document.documentElement.lang === 'en'`);
    assert(await page.eval(rep) === r0, 'report numbers changed after a language switch');
    assert(await page.eval('window.__randomCalls') === 1, 'language switch caused an extra Math.random call');
    assert(await page.eval(`document.getElementById('repTitle').textContent`) !== heading0, 'report not translated');
    await assertLanguage(page, 'en', 'report after switch');
    await page.reload();
    await page.waitFor('window.PZ_UI');
    assert(await page.eval('document.documentElement.lang') === 'en', 'language not persisted after reload');
  });
}

async function doubleClicksAndLocks() {
  await check('double clicks launch one flight and resolve once; import/mission/mode are locked in flight', async (track) => {
    const page = track(await openGame({ lang: 'en', rolls: [0.01], reducedMotion: false }));
    await startMission(page, 'm3');
    await loadPreset(page, 'earth_f9_ka');
    await page.eval(`(() => { const b = document.getElementById('launchBtn'); b.click(); b.click(); b.click(); })()`);
    await page.waitFor('PZ_UI.screen() === 3');
    assert(await page.eval('Engine.simulation.phases.length') === 3, 'one simulation only');
    assert(await page.eval(`document.getElementById('homeBtn').disabled`), 'Missions button must be disabled in flight');
    assert(await page.eval(`[...document.querySelectorAll('#modeSeg button')].every((b) => b.disabled)`), 'mode buttons must be disabled in flight');
    await page.eval(`document.getElementById('shareBtn').click()`);
    await page.waitFor(isVisible('#shareDlg'));
    assert(await page.eval(`document.getElementById('importBtn').disabled && document.getElementById('importCode').disabled`), 'import must be disabled in flight');
    await page.eval(`document.getElementById('shareClose').click()`);
    await page.waitFor(isVisible('#crisis'), { timeout: 30000 });
    await page.click('#crOpts .opt[data-i="0"]');
    await page.eval(`(() => { const c = document.getElementById('crConfirm'); c.click(); c.click(); c.click(); })()`);
    await page.waitFor('PZ_UI.screen() === 4', { timeout: 30000 });
    assert(await page.eval('window.__randomCalls') === 1, 'crisis resolved more than once');
    assert(await page.eval('Engine.simulation.phases.length') === 4, 'phase 4 duplicated');
    assert(await page.eval(`document.getElementById('toast').hidden || !/not completed/.test(document.getElementById('toast').textContent)`), 'error toast after double click');
  });
}

async function abortAndNewFlight() {
  await check('abort flight returns to the builder; explicit new flight re-runs the same build', async (track) => {
    const page = track(await openGame({ lang: 'uk', rolls: [0.01, 0.01] , reducedMotion: false }));
    await startMission(page, 'm3');
    await loadPreset(page, 'earth_atlas_reliable');
    const code = await page.eval('Engine.exportBlueprintCode()');
    await page.click('#launchBtn');
    await page.waitFor('PZ_UI.screen() === 3');
    await page.click('#abortBtn');
    await page.waitFor(isVisible('#dlg'));
    await page.click('[data-dlg="ok"]');
    await page.waitFor('PZ_UI.screen() === 2');
    assert(await page.eval('Engine.simulation.phases.length') === 0, 'simulation not reset');
    assert(await page.eval('Engine.exportBlueprintCode()') === code, 'build changed by abort');
    await delay(1500);
    assert(await page.eval('PZ_UI.screen() === 2 && !document.querySelector("#crisis:not([hidden])")'), 'cancelled timers still running');
    await launchToCrisis(page);
    await resolveCrisis(page, 0);
    await page.click('#newFlightBtn');
    await page.waitFor('PZ_UI.screen() === 3');
    assert(await page.eval('Engine.getBlackBoxReport() === null && Engine.simulation.phases.length === 3'), 'new flight did not reset the simulation');
    await page.waitFor(isVisible('#crisis'), { timeout: 30000 });
    await resolveCrisis(page, 0);
    assert(await page.eval('window.__randomCalls') === 2, 'one roll per flight');
    await page.click('#modBtn');
    await page.waitFor('PZ_UI.screen() === 2');
    assert(await page.eval('Engine.exportBlueprintCode()') === code, 'build changed');
  });
}

async function launchRules() {
  await check('launch button follows canLaunch: empty slots, wrong orbit and budget block; warnings ask once', async (track) => {
    const page = track(await openGame({ lang: 'en' }));
    await startMission(page, 'm1');
    assert(await page.eval(`document.getElementById('launchBtn').disabled`), 'empty build must not launch');
    const misses = await page.eval(`document.querySelectorAll('#slots .slot.miss').length`);
    assert(misses === 9, `expected 9 empty required slots (launcher, 7 bus, instruments), got ${misses}`);
    assert(await page.eval(`/blocked/i.test(document.getElementById('launchBtn').textContent)`), 'blocked label');
    await loadPreset(page, 'moon_fh_shielded');
    assert(await page.eval(`!document.getElementById('launchBtn').disabled`), 'valid build must launch');
    await page.eval(`document.querySelector('[data-act="pick"][data-kind="orbit"][data-id="orb_earth_leo"]').click()`);
    await page.waitFor(`document.getElementById('launchBtn').disabled`, { message: 'wrong orbit must block' });
    await page.eval(`document.querySelector('[data-act="pick"][data-kind="orbit"][data-id="orb_lunar_polar"]').click()`);
    await page.eval(`document.querySelector('[data-act="pick"][data-kind="lv"][data-id="lv_sls"]').click()`);
    await page.waitFor(`document.getElementById('launchBtn').disabled`, { message: 'over budget must block' });
    assert(await page.eval(`[...document.querySelectorAll('#diag .dg.e')].some((d) => /budget/i.test(d.textContent))`), 'budget error listed');
    await page.eval(`document.querySelector('[data-act="pick"][data-kind="lv"][data-id="lv_falcon_heavy"]').click()`);
    await page.eval(`document.getElementById('tab-bus').click()`);
    await page.eval(`document.querySelector('[data-act="pick"][data-kind="part"][data-id="bat_highcap"]').click()`);
    await page.eval(`document.getElementById('tab-inst').click()`);
    await page.eval(`document.querySelector('[data-act="pick"][data-kind="inst"][data-id="inst_hirise"]').click()`);
    await page.waitFor(`/\\(\\d+ warning/.test(document.getElementById('launchBtn').textContent)`, { message: 'risky label with warning count' });
    await page.click('#launchBtn');
    await page.waitFor(isVisible('#dlg'));
    await page.click('[data-dlg="cancel"]');
    await page.waitFor(`document.getElementById('dlg').hidden && PZ_UI.screen() === 2`);
    assert(await page.eval('Engine.simulation.crisis === null'), 'cancel must not launch');
    assert(await page.eval('window.__confirmCalls') === 0, 'native confirm() was used');
  });
}

async function instrumentLimitAndImport() {
  await check('fifth instrument and invalid import give localized messages without changing the build', async (track) => {
    const page = track(await openGame({ lang: 'uk' }));
    await startMission(page, 'm1');
    await page.eval(`document.getElementById('tab-inst').click()`);
    for (const id of ['inst_lola', 'inst_lend', 'inst_lroc', 'inst_hirise']) {
      await page.eval(`document.querySelector('[data-act="pick"][data-kind="inst"][data-id="${id}"]').click()`);
    }
    await page.eval(`document.querySelector('[data-act="pick"][data-kind="inst"][data-id="inst_crism"]').click()`);
    await page.waitFor(isVisible('#toast'));
    const toast = await page.eval(`document.getElementById('toast').textContent`);
    assert(/щонайбільше 4/.test(toast), `instrument limit toast: ${toast}`);
    assert(await page.eval('Engine.getState().build.instrumentIds.length') === 4, 'build changed');
    const code = await page.eval('Engine.exportBlueprintCode()');
    await page.eval(`document.getElementById('shareBtn').click()`);
    await page.waitFor(isVisible('#shareDlg'));
    assert(await page.eval(`document.activeElement.id === 'importCode'`), 'focus should go to the import field');
    await page.eval(`document.getElementById('importCode').value = 'PZ|1|m1|solo|lv_nope'`);
    await page.click('#importBtn');
    await page.waitFor(`document.getElementById('importHint').dataset.error === '1'`);
    const hint = await page.eval(`document.getElementById('importHint').textContent`);
    assert(/Імпорт не вдався/.test(hint) && /PZ\|1/.test(hint), `import hint: ${hint}`);
    assert(await page.eval('Engine.exportBlueprintCode()') === code, 'invalid import changed the build');
    await page.click('#shareDlg [data-lang="en"]');
    await page.waitFor(`document.documentElement.lang === 'en'`);
    assert(/Import failed/.test(await page.eval(`document.getElementById('importHint').textContent`)), 'import error not re-rendered in English');
    await assertLanguage(page, 'en', 'share dialog with an import error');
    await page.click('#shareDlg [data-lang="uk"]');
    await page.waitFor(`document.documentElement.lang === 'uk'`);
    const valid = 'PZ|1|m3|solo|lv_falcon_med|orb_earth_sso|ch_light|pw_solar_m|bat_highcap|com_kaband|cpu_economy|propulsion_light|thermal_passive|inst_oli2,inst_tirs2';
    await page.eval(`document.getElementById('importCode').value = ${JSON.stringify(valid)}`);
    await page.click('#importBtn');
    await page.waitFor(isVisible('#dlg'));
    await page.click('[data-dlg="ok"]');
    await page.waitFor(`PZ_UI.screen() === 2 && Engine.getState().mission.id === 'm3'`);
    assert(await page.eval('Engine.exportBlueprintCode()') === valid, 'imported code differs');
    assert(await page.eval(`document.documentElement.lang === 'uk' && PZ_UI.tab() === 'launch'`), 'language or tab not kept after import');
    assert(await page.eval(`document.querySelector('#tab-launch').getAttribute('aria-selected') === 'true'`), 'tab state not synced');
  });
}

async function draftRestore() {
  await check('draft autosave and explicit restore; corrupted and unavailable storage are handled', async (track) => {
    const page = track(await openGame({ lang: 'en' }));
    await startMission(page, 'm2');
    await loadPreset(page, 'mars_fh_lean');
    const code = await page.eval('Engine.exportBlueprintCode()');
    await page.reload();
    await page.waitFor('window.PZ_UI');
    assert(await page.eval(`PZ_UI.screen() === 1 && Engine.getState().mission === null`), 'reload must not silently restore');
    await page.waitFor(isVisible('[data-act="restore-draft"]'));
    await page.click('[data-act="restore-draft"]');
    await page.waitFor('PZ_UI.screen() === 2');
    assert(await page.eval('Engine.exportBlueprintCode()') === code, 'restored draft differs');
    await page.eval(`localStorage.setItem('pz.draft', '{broken')`);
    await page.reload();
    await page.waitFor('window.PZ_UI');
    await page.waitFor(`document.getElementById('draftBanner').classList.contains('bad')`);
    await assertLanguage(page, 'en', 'corrupted draft banner');
    await page.click('#top [data-lang="uk"]');
    await page.waitFor(`document.documentElement.lang === 'uk'`);
    await assertLanguage(page, 'uk', 'corrupted draft banner after switch');
    await page.click('[data-act="discard-draft"]');
    await page.waitFor(`document.getElementById('draftBanner').hidden`);
    assert(await page.eval(`localStorage.getItem('pz.draft') === null`), 'draft not removed');
  });
  await check('game works when localStorage throws', async (track) => {
    const page = track(await openGame({ lang: 'en', brokenStorage: true, tutorialSeen: false }));
    await page.waitFor(isVisible('#dlg'));
    await page.click('[data-dlg="skip"]');
    assert(await page.eval(`/storage is unavailable/i.test(document.getElementById('draftBanner').textContent)`), 'storage warning missing');
    await startMission(page, 'm3');
    await loadPreset(page, 'earth_f9_ka');
    await page.click('#top [data-lang="uk"]');
    await page.waitFor(`document.documentElement.lang === 'uk'`);
    assert(await page.eval(`!document.getElementById('launchBtn').disabled`), 'cannot launch without storage');
  });
}

async function previewCheck() {
  await check('preview shows the diff without changing build, flight or storage; works from the keyboard', async (track) => {
    const page = track(await openGame({ lang: 'en' }));
    await startMission(page, 'm1');
    await loadPreset(page, 'moon_f9_narrow');
    await page.eval(`document.getElementById('tab-bus').click()`);
    const snap = `JSON.stringify([Engine.exportBlueprintCode(), Engine.simulation, localStorage.getItem('pz.draft'), window.__randomCalls])`;
    const before = await page.eval(snap);
    await page.click('[data-act="preview"][data-id="com_xband"]');
    await page.waitFor(isVisible('#pv-com_xband'));
    const pvText = await page.eval(`document.getElementById('pv-com_xband').textContent`);
    assert(/Resolved:/.test(pvText) && /comms link loses/.test(pvText), `preview should list the fixed bottleneck: ${pvText.slice(0, 300)}`);
    assert(/Budget/.test(pvText) && /Launch mass/.test(pvText) && /Effective science/.test(pvText), 'preview metrics missing');
    assert(await page.eval(snap) === before, 'preview mutated state');
    await page.eval(`document.querySelector('[data-act="preview"][data-id="ch_light"]').focus()`);
    await page.key('Enter');
    await page.waitFor(isVisible('#pv-ch_light'));
    assert(await page.eval(`document.activeElement.dataset.fk === 'pv:part:ch_light'`), 'focus lost after keyboard preview');
    await page.key('Enter');
    await page.waitFor(`!document.getElementById('pv-ch_light')`);
    assert(await page.eval(snap) === before, 'keyboard preview mutated state');
  });
}

async function teamMode() {
  await check('local team mode: approvals gate launch, reset on build change, survive a language switch', async (track) => {
    const page = track(await openGame({ lang: 'en' }));
    await page.click('#modeSeg [data-mode="team"]');
    await startMission(page, 'm3');
    await loadPreset(page, 'earth_f9_ka');
    assert(await page.eval(isVisible('#teamPanel')), 'team panel hidden');
    assert(await page.eval(`Engine.getState().mode === 'team'`), 'engine mode not synced');
    await page.click('[data-act="team-size"][data-n="2"]');
    assert(await page.eval(`document.getElementById('launchBtn').disabled`), 'launch must wait for team approval');
    await page.click('[data-act="approve"][data-i="0"]');
    assert(await page.eval(`document.getElementById('launchBtn').disabled`), 'one approval of two is not enough');
    await page.click('[data-act="approve"][data-i="1"]');
    await page.waitFor(`!document.getElementById('launchBtn').disabled`);
    await page.click('#top [data-lang="uk"]');
    await page.waitFor(`document.documentElement.lang === 'uk'`);
    assert(await page.eval(`!document.getElementById('launchBtn').disabled`), 'language switch reset approvals');
    await assertLanguage(page, 'uk', 'team panel');
    await page.eval(`document.getElementById('tab-bus').click()`);
    await page.eval(`document.querySelector('[data-act="pick"][data-kind="part"][data-id="thermal"]').click()`);
    await page.waitFor(`document.getElementById('launchBtn').disabled`, { message: 'build change must reset approvals' });
    assert(/\|team\|/.test(await page.eval('Engine.exportBlueprintCode()')), 'team mode missing from code');
    await page.screenshot(path.join(SHOTS, 'uk-06-team.png'));
  });
}

async function responsive() {
  for (const width of [360, 390, 768, 1280, 1440]) {
    await check(`layout at ${width}px: no horizontal scroll, header never covers tabs, quick launch reachable`, async (track) => {
      const page = track(await openGame({ lang: 'uk', width, height: width < 800 ? 800 : 900, mobile: width < 800 }));
      const overflow = `document.documentElement.scrollWidth - window.innerWidth`;
      assert(await page.eval(overflow) <= 0, `briefing overflows by ${await page.eval(overflow)}px`);
      await startMission(page, 'm2');
      await loadPreset(page, 'mars_sls_heavy');
      for (const tab of ['launch', 'bus', 'inst']) {
        await page.eval(`document.getElementById('tab-${tab}').click()`);
        assert(await page.eval(overflow) <= 0, `builder (${tab}) overflows by ${await page.eval(overflow)}px`);
      }
      await page.eval(`document.getElementById('tab-launch').click()`);
      for (const lang of ['en', 'uk']) {
        await page.eval(`document.querySelector('#top [data-lang="${lang}"]').click()`);
        assert(await page.eval(overflow) <= 0, `builder in ${lang} overflows`);
      }
      // Scroll the page so the tabs sit at the very top, where a sticky header would cover them.
      await page.eval(`(() => { const t = document.getElementById('tabs'); window.scrollTo(0, t.getBoundingClientRect().top + window.scrollY - 2); })()`);
      await delay(50);
      const hits = await page.eval(`[...document.querySelectorAll('#tabs [data-tab]')].map((b) => {
        const r = b.getBoundingClientRect(); const el = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
        return el && el.closest('[data-tab]') === b; })`);
      assert(hits.every(Boolean), `a tab is covered by another element: ${JSON.stringify(hits)}`);
      const box = await page.eval(`(() => { const r = document.getElementById('tab-bus').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
      await page.mouse(box.x, box.y);
      await page.waitFor(`PZ_UI.tab() === 'bus'`, { message: 'real click on the Bus tab did not select it' });
      if (width < 1180) {
        assert(await page.eval(`getComputedStyle(document.getElementById('quickBar')).display === 'flex'`), 'quick bar hidden on a narrow screen');
        const qb = await page.eval(`(() => { const b = document.getElementById('qbLaunch'); const r = b.getBoundingClientRect();
          return document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2) === b && r.bottom <= window.innerHeight; })()`);
        assert(qb, 'quick launch button is covered or off-screen');
      }
      if (width === 390) {
        await page.eval('window.scrollTo(0, 0)');
        await page.screenshot(path.join(SHOTS, 'uk-05-mobile-builder.png'));
        await page.eval(`document.querySelector('#top [data-lang="en"]').click()`);
        await page.screenshot(path.join(SHOTS, 'en-05-mobile-builder.png'));
      }
    });
  }
}

async function keyboard() {
  await check('keyboard: tabs with arrows, selection keeps focus, crisis traps focus and cannot be dismissed', async (track) => {
    const page = track(await openGame({ lang: 'en', rolls: [0.01] }));
    await page.eval(`document.querySelector('[data-act="start"][data-id="m3"]').focus()`);
    await page.key('Enter');
    await page.waitFor('PZ_UI.screen() === 2');
    await page.eval(`document.getElementById('tab-launch').focus()`);
    await page.key('ArrowRight');
    await page.waitFor(`PZ_UI.tab() === 'bus' && document.activeElement.id === 'tab-bus'`, { message: 'arrow key tab navigation' });
    await page.eval(`document.querySelector('[data-fk="pick:part:ch_light"]').focus()`);
    await page.key('Enter');
    await page.waitFor(`Engine.getState().build.bus.chassis === 'ch_light'`);
    assert(await page.eval(`document.activeElement.dataset.fk === 'pick:part:ch_light'`), 'focus lost after keyboard selection');
    const outline = await page.eval(`getComputedStyle(document.activeElement).outlineStyle`);
    assert(outline !== 'none', `no visible focus outline (${outline})`);
    await loadPreset(page, 'earth_f9_ka');
    await launchToCrisis(page);
    for (let i = 0; i < 14; i += 1) {
      await page.key('Tab', { shift: i % 5 === 4 });
      assert(await page.eval(`document.getElementById('crisis').contains(document.activeElement)`), `focus escaped the crisis dialog after ${i + 1} Tab presses`);
    }
    await page.key('Escape');
    await delay(100);
    assert(await page.eval(isVisible('#crisis')), 'Escape closed the crisis');
    assert(await page.eval(`document.getElementById('main').hasAttribute('inert')`), 'background not inert while the dialog is open');
    await page.eval(`document.querySelector('#crOpts .opt[data-i="1"]').focus()`);
    await page.key('Enter');
    await page.waitFor(`document.querySelector('#crOpts .opt[data-i="1"]').getAttribute('aria-pressed') === 'true'`);
    await page.eval(`document.getElementById('crConfirm').focus()`);
    await page.key('Enter');
    await page.waitFor('PZ_UI.screen() === 4', { timeout: 20000 });
    assert(await page.eval(`!document.getElementById('main').hasAttribute('inert')`), 'background still inert after the dialog closed');
  });
}

async function motionAndFonts() {
  await check('prefers-reduced-motion disables animations', async (track) => {
    const reduced = track(await openGame({ lang: 'en', reducedMotion: true }));
    const probe = `(() => { const el = document.createElement('div'); el.className = 'alarm'; document.body.appendChild(el);
      const v = getComputedStyle(el).animationName; el.remove(); return v; })()`;
    assert(await reduced.eval(probe) === 'none', 'animation still active with reduced motion');
    const normal = await openGame({ lang: 'en', reducedMotion: false });
    const value = await normal.eval(probe);
    await normal.close();
    assert(value === 'pl', `animation expected without reduced motion, got ${value}`);
  });
  await check('without Google Fonts the game loads, stays readable and playable', async (track) => {
    const page = track(await openGame({ lang: 'uk', blockFonts: true, rolls: [0.01] }));
    assert(await page.eval(`document.querySelectorAll('#missionCards .mcard').length === 3`), 'mission cards missing');
    const font = await page.eval(`getComputedStyle(document.body).fontFamily`);
    assert(/monospace/.test(font), `no fallback font stack: ${font}`);
    await startMission(page, 'm3');
    await loadPreset(page, 'earth_f9_ka');
    await launchToCrisis(page);
    await resolveCrisis(page, 0);
    await page.screenshot(path.join(SHOTS, 'uk-07-no-google-fonts-report.png'));
  });
}

(async () => {
  const { server, url } = await start();
  baseUrl = url;
  browser = await launch();
  console.log(`Browser: ${browser.version} (${browser.exe})\nServer: ${url}\n`);
  try {
    await fullRun('uk');
    await fullRun('en');
    await partialAndFailed();
    await strictAndFileMode();
    await languageSwitching();
    await doubleClicksAndLocks();
    await abortAndNewFlight();
    await launchRules();
    await instrumentLimitAndImport();
    await draftRestore();
    await previewCheck();
    await teamMode();
    await responsive();
    await keyboard();
    await motionAndFonts();
  } finally {
    await browser.close();
    server.close();
  }
  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} UI checks passed.`);
  if (failed.length) process.exit(1);
})().catch((error) => { console.error(error); process.exit(1); });
