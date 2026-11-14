'use strict';
/* Engine contract and gameplay tests. Randomness is controlled by replacing Math.random
   inside the isolated VM context; the engine itself has no test hooks. */
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadGame } = require('./load');

const plain = (value) => JSON.parse(JSON.stringify(value));
const same = (a, b, message) => assert.deepEqual(plain(a), plain(b), message);
const notSame = (a, b, message) => assert.notDeepEqual(plain(a), plain(b), message);

const PRESET = (ctx, id) => Object.values(ctx.PZ_PRESETS).flat().find((p) => p.id === id);

function applyPreset(ctx, missionId, presetId) {
  const E = ctx.Engine;
  const p = PRESET(ctx, presetId);
  E.initMission(missionId, 'solo');
  E.selectRocket(p.rocketId);
  E.CATEGORIES.forEach((c) => E.selectBusPart(c, p.bus[c]));
  p.instrumentIds.forEach((id) => E.toggleInstrument(id));
  return E.getState();
}

function game(options = {}) {
  const queue = options.rolls ? options.rolls.slice() : null;
  return loadGame({ lang: options.lang || 'en', random: queue ? () => (queue.length ? queue.shift() : 0.5) : undefined });
}

test('public API keeps the original methods and adds the new ones', () => {
  const E = game().Engine;
  ['getMissions', 'getCatalog', 'initMission', 'selectRocket', 'selectOrbit', 'selectBusPart', 'toggleInstrument',
    'calculateTelemetry', 'checkCompatibility', 'getAdvisorsFeedback', 'getState', 'startSimulation', 'resolveCrisis',
    'getBlackBoxReport', 'exportBlueprintCode', 'importBlueprintCode', 'resetSimulation', 'setMode', 'previewChange',
    'evaluateBuild', 'validateBlueprintCode'].forEach((name) => assert.equal(typeof E[name], 'function', name));
  const s = E.getState();
  same(Object.keys(s).sort(), ['advisors', 'build', 'compatibility', 'mission', 'mode', 'selectedObjects', 'telemetry'].sort());
  same(Object.keys(s.build.bus), ['chassis', 'power', 'battery', 'comms', 'computer', 'propulsion', 'thermal']);
  assert.equal(E.getMissions().length, 3);
});

test('initMission sets the required orbit and seven empty bus slots; all seven are launch blockers', () => {
  const E = game().Engine;
  const s = E.initMission('m3');
  assert.equal(s.build.orbitId, 'orb_earth_sso');
  assert.equal(s.compatibility.canLaunch, false);
  const missing = s.compatibility.issues.filter((i) => i.code === 'MISSING_PART').map((i) => i.category);
  same(missing, ['chassis', 'power', 'battery', 'comms', 'computer', 'propulsion', 'thermal']);
  assert.ok(s.compatibility.issues.some((i) => i.code === 'NO_ROCKET'));
  assert.ok(s.compatibility.issues.some((i) => i.code === 'NO_INSTRUMENTS'));
  assert.equal(s.compatibility.errors.length, s.compatibility.issues.filter((i) => i.level === 'error').length);
});

test('wrong orbit, over budget and over mass block launch', () => {
  const ctx = game();
  const E = ctx.Engine;
  applyPreset(ctx, 'm3', 'earth_f9_ka');
  assert.equal(E.getState().compatibility.canLaunch, true);
  let s = E.selectOrbit('orb_earth_leo');
  assert.ok(s.compatibility.issues.some((i) => i.code === 'WRONG_ORBIT'));
  assert.equal(s.compatibility.canLaunch, false);
  assert.throws(() => E.startSimulation(), (e) => e.code === 'LAUNCH_BLOCKED' && !!e.compatibility);
  assert.equal(E.simulation.crisis, null);
  E.selectOrbit('orb_earth_sso');
  s = E.selectRocket('lv_sls'); // 320 + parts > 400
  assert.ok(s.compatibility.issues.some((i) => i.code === 'OVER_BUDGET'));
  assert.equal(s.compatibility.canLaunch, false);
  applyPreset(ctx, 'm2', 'mars_sls_heavy');
  s = E.selectRocket('lv_falcon_heavy');
  assert.ok(s.compatibility.issues.some((i) => i.code === 'OVER_MASS'));
  assert.equal(s.compatibility.canLaunch, false);
});

test('each resource deficit becomes a warning that still allows launch', () => {
  const ctx = game();
  const E = ctx.Engine;
  const codes = () => E.getState().compatibility.issues.filter((i) => i.level === 'warning').map((i) => i.code);
  applyPreset(ctx, 'm3', 'earth_f9_ka');
  same(codes(), []);
  E.selectBusPart('battery', 'bat_liion');
  assert.ok(codes().includes('BATTERY_DEFICIT'));
  E.selectBusPart('battery', 'bat_highcap');
  E.selectBusPart('comms', 'com_sband_low');
  assert.ok(codes().includes('COMMS_BOTTLENECK'));
  assert.ok(codes().includes('SCIENCE_SHORT'));
  E.selectBusPart('comms', 'com_kaband');
  E.selectBusPart('chassis', 'ch_shielded'); // 13-month lead time > 12 available
  assert.ok(codes().includes('TIME_OVER'));
  E.selectBusPart('chassis', 'ch_light');
  E.toggleInstrument('inst_lola');
  assert.ok(codes().includes('INSTRUMENT_TARGET'));
  assert.equal(E.getState().compatibility.canLaunch, true);
  applyPreset(ctx, 'm2', 'mars_fh_lean');
  E.selectBusPart('power', 'pw_solar_m');
  assert.ok(codes().includes('POWER_DEFICIT'));
  E.selectBusPart('power', 'pw_solar_l');
  E.selectBusPart('chassis', 'ch_std');
  assert.ok(codes().includes('RADIATION'));
  assert.equal(E.getState().compatibility.canLaunch, true);
});

test('power telemetry: a large surplus is not a deficit; battery is reported separately', () => {
  const ctx = game();
  const E = ctx.Engine;
  applyPreset(ctx, 'm1', 'moon_fh_shielded');
  const s = E.selectBusPart('power', 'pw_solar_l');
  assert.ok(s.telemetry.power.generated > s.telemetry.power.used * 3);
  assert.equal(s.telemetry.power.isPowerDeficit, false);
  assert.equal(typeof s.telemetry.power.isBatteryDeficit, 'boolean');
  assert.ok(!s.compatibility.issues.some((i) => i.code === 'POWER_DEFICIT'));
});

test('startSimulation returns the crisis itself; phases come from Engine.simulation', () => {
  const ctx = game({ rolls: [0.01] });
  const E = ctx.Engine;
  applyPreset(ctx, 'm1', 'moon_f9_narrow');
  const crisis = E.startSimulation();
  assert.equal(crisis.id, 'cr_solar_flare');
  assert.equal(typeof crisis.title, 'string');
  assert.equal(crisis.phases, undefined);
  assert.equal(crisis.options.length, 3);
  crisis.options.forEach((o) => {
    assert.equal(typeof o.isAvailable, 'boolean');
    assert.ok(o.effectiveSurvivalChance > 0 && o.effectiveSurvivalChance <= o.survivalChance);
  });
  assert.equal(crisis.options[1].isAvailable, false, 'shielded option needs hardness 4');
  assert.match(crisis.options[1].lockReason, /4/);
  const phases = E.simulation.phases;
  assert.equal(phases.length, 3);
  phases.forEach((p, i) => {
    assert.equal(p.id, i + 1);
    assert.equal(typeof p.title, 'string');
    assert.ok(Array.isArray(p.logs) && p.logs.length >= 2 && p.logs.every((l) => typeof l === 'string'));
    assert.ok(['SUCCESS', 'WARNING'].includes(p.status));
  });
  assert.equal(phases[2].status, 'WARNING', 'comms bottleneck makes science calibration a WARNING');
  assert.equal(phases[0].status, 'SUCCESS');
  // A second call returns the same crisis and does not roll again.
  const before = ctx.__randomCalls.count;
  assert.equal(E.startSimulation().id, crisis.id);
  assert.equal(ctx.__randomCalls.count, before);
});

test('SUCCESS with controlled randomness; phase 4 appended; chance shown equals chance used', () => {
  const ctx = game({ rolls: [0.01] });
  const E = ctx.Engine;
  applyPreset(ctx, 'm1', 'moon_fh_shielded');
  const crisis = E.startSimulation();
  const report = E.resolveCrisis(1);
  assert.equal(report.status, 'SUCCESS');
  assert.ok(report.finalScore > 0 && report.finalScore <= 100);
  assert.ok(['S', 'A', 'B', 'C'].includes(report.rank));
  assert.equal(report.finalScience, Math.round(190 * 0.9));
  const sim = E.simulation;
  assert.equal(sim.phases.length, 4);
  assert.equal(sim.phases[3].id, 4);
  assert.equal(sim.phases[3].status, 'SUCCESS');
  assert.equal(sim.survivalChance, crisis.options[1].effectiveSurvivalChance);
  assert.equal(report.analysis.survival.survivalChance, sim.survivalChance);
  assert.equal(report.analysis.science.finalScience, report.finalScience);
  assert.equal(report.usedNasaSources.length > 5, true);
  assert.ok(report.blueprintCode.startsWith('PZ|1|m1|'));
});

test('PARTIAL: survives but science falls short; score capped at 79', () => {
  const ctx = game({ rolls: [0.01] });
  const E = ctx.Engine;
  applyPreset(ctx, 'm2', 'mars_fh_lean');
  E.startSimulation();
  const report = E.resolveCrisis(0); // safe mode ×0.65 → 98 < 115
  assert.equal(report.status, 'PARTIAL');
  assert.equal(report.finalScience, 98);
  assert.ok(report.finalScore <= 79);
  assert.equal(E.simulation.phases[3].status, 'WARNING');
});

test('FAILED: roll above chance loses the spacecraft; 0 points, rank F', () => {
  const ctx = game({ rolls: [0.999] });
  const E = ctx.Engine;
  applyPreset(ctx, 'm3', 'earth_f9_ka');
  E.startSimulation();
  const report = E.resolveCrisis(0);
  assert.equal(report.status, 'FAILED');
  assert.equal(report.finalScore, 0);
  assert.equal(report.rank, 'F');
  assert.equal(report.finalScience, 0);
  assert.equal(report.survivalRollPassed, false);
  assert.equal(E.simulation.phases[3].status, 'FAILED');
});

test('double resolve: same option returns the same report without a new roll; another option throws', () => {
  const ctx = game({ rolls: [0.2, 0.9] });
  const E = ctx.Engine;
  applyPreset(ctx, 'm3', 'earth_f9_ka');
  E.startSimulation();
  const first = E.resolveCrisis(0);
  const calls = ctx.__randomCalls.count;
  const again = E.resolveCrisis(0);
  same(again, first);
  assert.equal(ctx.__randomCalls.count, calls);
  assert.throws(() => E.resolveCrisis(1), (e) => e.code === 'CRISIS_RESOLVED');
  assert.equal(E.simulation.phases.length, 4);
});

test('locked or invalid crisis options are rejected; resolve before start is rejected', () => {
  const ctx = game({ rolls: [0.1] });
  const E = ctx.Engine;
  applyPreset(ctx, 'm1', 'moon_f9_narrow');
  assert.throws(() => E.resolveCrisis(0), (e) => e.code === 'SIM_NOT_STARTED');
  E.startSimulation();
  assert.throws(() => E.resolveCrisis(1), (e) => e.code === 'OPTION_LOCKED');
  assert.throws(() => E.resolveCrisis(7), (e) => e.code === 'OPTION_INDEX');
  assert.throws(() => E.resolveCrisis('0'), (e) => e.code === 'OPTION_INDEX');
  assert.equal(E.simulation.resolved, false);
});

test('fifth instrument gives a localized RangeError and leaves the build unchanged', () => {
  for (const lang of ['uk', 'en']) {
    const ctx = game({ lang });
    const E = ctx.Engine;
    E.initMission('m1');
    ['inst_lola', 'inst_lend', 'inst_lroc', 'inst_hirise'].forEach((id) => E.toggleInstrument(id));
    const before = JSON.stringify(E.getState().build);
    assert.throws(() => E.toggleInstrument('inst_crism'), (e) => {
      assert.equal(e.name, 'RangeError');
      assert.equal(e.code, 'INSTRUMENT_LIMIT');
      assert.match(e.message, lang === 'uk' ? /щонайбільше 4/ : /at most 4/);
      return true;
    });
    assert.equal(JSON.stringify(E.getState().build), before);
  }
});

test('export/import round trip; invalid codes never change the build', () => {
  const ctx = game();
  const E = ctx.Engine;
  applyPreset(ctx, 'm2', 'mars_sls_heavy');
  E.setMode('team');
  const code = E.exportBlueprintCode();
  assert.match(code, /^PZ\|1\|m2\|team\|lv_sls\|orb_mars_polar\|/);
  E.initMission('m3');
  const s = E.importBlueprintCode(code);
  assert.equal(s.mission.id, 'm2');
  assert.equal(s.mode, 'team');
  assert.equal(E.exportBlueprintCode(), code);
  const snapshot = JSON.stringify(E.getState());
  const bad = [
    ['hello', 'CODE_FORMAT'],
    ['PZ|2|m1|solo||||||||||', 'CODE_FORMAT'],
    [code.replace('lv_sls', 'lv_nope'), 'UNKNOWN_ID'],
    [code.replace('|ch_shielded|', '|pw_solar_l|'), 'WRONG_CATEGORY'],
    [code.replace(/\|[^|]*$/, '|inst_hirise,inst_hirise'), 'CODE_INSTRUMENTS'],
    [code.replace(/\|[^|]*$/, '|inst_lola,inst_lend,inst_lroc,inst_hirise,inst_crism'), 'CODE_INSTRUMENTS'],
    [code.replace('|team|', '|%E0%A4%A|'), 'CODE_ENCODING'],
    [42, 'CODE_INVALID']
  ];
  bad.forEach(([input, codeName]) => {
    assert.throws(() => E.importBlueprintCode(input), (e) => e.code === codeName, String(input));
    assert.throws(() => E.validateBlueprintCode(input), (e) => e.code === codeName);
    assert.equal(JSON.stringify(E.getState()), snapshot);
  });
});

test('import does not change the interface language; one code works in both languages', () => {
  const ctx = game({ lang: 'uk' });
  const E = ctx.Engine;
  applyPreset(ctx, 'm1', 'moon_fh_shielded');
  const code = E.exportBlueprintCode();
  ctx.I18N.setLang('en', { persist: false });
  E.initMission('m3');
  E.importBlueprintCode(code);
  assert.equal(ctx.I18N.getLang(), 'en');
  assert.equal(E.exportBlueprintCode(), code);
});

test('resetSimulation clears only the flight; setMode never touches build or flight', () => {
  const ctx = game({ rolls: [0.1] });
  const E = ctx.Engine;
  applyPreset(ctx, 'm3', 'earth_atlas_reliable');
  const build = JSON.stringify(E.getState().build);
  E.startSimulation();
  E.resolveCrisis(0);
  E.setMode('team');
  assert.ok(E.getBlackBoxReport(), 'report survives a mode change');
  assert.equal(JSON.stringify(E.getState().build), build);
  const s = E.resetSimulation();
  assert.equal(JSON.stringify(s.build), build);
  assert.equal(s.mode, 'team');
  assert.equal(E.getBlackBoxReport(), null);
  assert.equal(E.simulation.phases.length, 0);
  // any build change also resets a finished flight (original contract)
  E.startSimulation();
  E.selectBusPart('thermal', 'thermal');
  assert.equal(E.simulation.crisis, null);
});

test('previewChange and evaluateBuild never mutate the build, the flight or randomness', () => {
  const ctx = game({ rolls: [0.3] });
  const E = ctx.Engine;
  applyPreset(ctx, 'm1', 'moon_f9_narrow');
  E.startSimulation();
  const state = JSON.stringify(E.getState());
  const sim = JSON.stringify(E.simulation);
  const calls = ctx.__randomCalls.count;
  const pv = E.previewChange({ type: 'part', category: 'comms', id: 'com_xband' });
  assert.equal(pv.error, null);
  assert.equal(pv.changed, true);
  assert.ok(pv.before.compatibility.issues.some((i) => i.code === 'COMMS_BOTTLENECK'));
  assert.ok(!pv.after.compatibility.issues.some((i) => i.code === 'COMMS_BOTTLENECK'));
  assert.ok(pv.after.telemetry.mass.wetMassWithStage > pv.before.telemetry.mass.wetMassWithStage);
  const same = E.previewChange({ type: 'rocket', id: 'lv_falcon_med' });
  assert.equal(same.changed, false);
  const limit = E.previewChange({ type: 'instrument', id: 'inst_hirise' });
  assert.equal(limit.error, null); // 3 → 4 instruments is allowed
  const evaluated = E.evaluateBuild({ ...E.getState().build, rocketId: 'lv_falcon_heavy' });
  assert.equal(evaluated.compatibility.canLaunch, true);
  assert.throws(() => E.evaluateBuild({ bus: {} }), (e) => e.code === 'INVALID_BUILD');
  assert.equal(JSON.stringify(E.getState()), state);
  assert.equal(JSON.stringify(E.simulation), sim);
  assert.equal(ctx.__randomCalls.count, calls);
});

test('preview of a fifth instrument reports the limit instead of throwing', () => {
  const ctx = game();
  const E = ctx.Engine;
  E.initMission('m1');
  ['inst_lola', 'inst_lend', 'inst_lroc', 'inst_hirise'].forEach((id) => E.toggleInstrument(id));
  const pv = E.previewChange({ type: 'instrument', id: 'inst_crism' });
  assert.equal(pv.after, null);
  assert.equal(pv.errorCode, 'INSTRUMENT_LIMIT');
  assert.equal(E.getState().build.instrumentIds.length, 4);
});

test('switching language re-renders a finished flight without re-simulating', () => {
  const ctx = game({ lang: 'uk', rolls: [0.05] });
  const E = ctx.Engine;
  const I = ctx.I18N;
  applyPreset(ctx, 'm2', 'mars_sls_heavy');
  E.startSimulation();
  const ukReport = E.resolveCrisis(0);
  const ukSim = E.simulation;
  const calls = ctx.__randomCalls.count;
  I.setLang('en', { persist: false });
  const enReport = E.getBlackBoxReport();
  const enSim = E.simulation;
  for (const k of ['status', 'finalScore', 'rank', 'finalScience', 'survivalRollPassed', 'blueprintCode']) {
    same(enReport[k], ukReport[k], k);
  }
  same(enReport.analysis, ukReport.analysis);
  assert.equal(enSim.survivalRoll, ukSim.survivalRoll);
  assert.equal(enSim.survivalChance, ukSim.survivalChance);
  same(enSim.phases.map((p) => p.status), ukSim.phases.map((p) => p.status));
  assert.notEqual(enSim.phases[0].title, ukSim.phases[0].title);
  notSame(enReport.insights, ukReport.insights);
  assert.equal(enReport.insights.length, ukReport.insights.length);
  assert.notEqual(enReport.usedNasaSources[0].nasaInfo, ukReport.usedNasaSources[0].nasaInfo);
  same(enReport.usedNasaSources.map((s) => s.url), ukReport.usedNasaSources.map((s) => s.url));
  same(enReport.usedNasaSources.map((s) => s.verifiedSpecs), ukReport.usedNasaSources.map((s) => s.verifiedSpecs));
  assert.equal(ctx.__randomCalls.count, calls, 'no extra Math.random calls');
});

test('switching language keeps telemetry, compatibility and crisis availability identical', () => {
  const ctx = game({ lang: 'en' });
  const E = ctx.Engine;
  applyPreset(ctx, 'm1', 'moon_f9_narrow');
  const en = E.getState();
  const crisisEn = E.startSimulation();
  ctx.I18N.setLang('uk', { persist: false });
  const uk = E.getState();
  const crisisUk = E.simulation.crisis;
  same(uk.telemetry, en.telemetry);
  same(uk.build, en.build);
  assert.equal(uk.mode, en.mode);
  assert.equal(uk.compatibility.canLaunch, en.compatibility.canLaunch);
  assert.equal(uk.compatibility.warnings.length, en.compatibility.warnings.length);
  assert.notEqual(uk.compatibility.warnings[0], en.compatibility.warnings[0]);
  same(crisisUk.options.map((o) => [o.isAvailable, o.effectiveSurvivalChance]),
    crisisEn.options.map((o) => [o.isAvailable, o.effectiveSurvivalChance]));
  assert.notEqual(crisisUk.title, crisisEn.title);
});

test('engine errors are localized and carry a stable code', () => {
  const uk = game({ lang: 'uk' }).Engine;
  const en = game({ lang: 'en' }).Engine;
  assert.throws(() => uk.selectRocket('lv_falcon_med'), (e) => e.code === 'MISSION_REQUIRED' && /місію/.test(e.message));
  assert.throws(() => en.selectRocket('lv_falcon_med'), (e) => e.code === 'MISSION_REQUIRED' && /mission/.test(e.message));
  en.initMission('m1');
  assert.throws(() => en.selectBusPart('power', 'ch_std'), (e) => e.code === 'WRONG_CATEGORY');
  assert.throws(() => en.selectBusPart('engine', 'ch_std'), (e) => e.code === 'UNKNOWN_CATEGORY');
  assert.throws(() => en.initMission('m1', ''), (e) => e.code === 'INVALID_MODE');
});
