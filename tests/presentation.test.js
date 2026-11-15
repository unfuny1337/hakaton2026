'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const { loadGame } = require('./load');

// Execute the real presentation functions with a deterministic animation clock.
// No Engine or NASA data mocks: presentation must work without calling either.
const source = fs.readFileSync(path.join(__dirname, '../ui.js'), 'utf8');
function between(start, end) {
  const a = source.indexOf(start), b = source.indexOf(end, a + start.length);
  assert.ok(a >= 0 && b > a);
  return source.slice(a, b);
}
function harness() {
  let id = 0;
  let now = 0;
  const frames = new Map();
  const nodes = new Map();
  for (const name of ['#termLog', '#terminalAnnouncement', '#report .big']) {
    const classes = new Set();
    nodes.set(name, { textContent: '', scrollTop: 0, scrollHeight: 40,
      classList: { add: (c) => classes.add(c), remove: (c) => classes.delete(c), contains: (c) => classes.has(c) },
      setAttribute() {} });
  }
  const env = {
    $: (sel) => nodes.get(sel), app: { flight: { id: 1 } },
    terminalPaint: { frame: 0, target: '', flight: null, lang: null },
    instantRender: false, motion: false, lang: 'uk', scoreFrame: 0, scoreTarget: null,
    performance: { now: () => now }, Math,
    requestAnimationFrame: (fn) => { frames.set(++id, fn); return id; },
    cancelAnimationFrame: (key) => frames.delete(key)
  };
  env.reduceMotion = () => env.motion;
  env.I = { getLang: () => env.lang };
  env.num = (n) => new Intl.NumberFormat(env.lang === 'uk' ? 'uk-UA' : 'en-US').format(n);
  vm.createContext(env);
  vm.runInContext(between('  function stopTerminal(', '  function paintBars('), env);
  const tick = (time) => { now = time; const batch = [...frames.values()]; frames.clear(); batch.forEach((fn) => fn(time)); };
  return { env, nodes, frames, tick };
}

test('typewriter appends a partial line and explicit flush cancels every pending frame', () => {
  const { env, nodes, frames, tick } = harness();
  env.paintTerminal('Старт');
  env.paintTerminal('Старт\nПередавання телеметрії');
  const log = nodes.get('#termLog');
  assert.ok(log.classList.contains('typing'));
  tick(10);
  assert.ok(log.textContent.startsWith('Старт\n'));
  assert.notEqual(log.textContent, env.terminalPaint.target);
  env.paintTerminal(env.terminalPaint.target, true);
  assert.equal(log.textContent, 'Старт\nПередавання телеметрії');
  assert.equal(frames.size, 0);
  assert.equal(log.classList.contains('typing'), false);
});

test('changing language flushes the new translated log and cancels the old-language callback', () => {
  const { env, nodes, frames, tick } = harness();
  env.paintTerminal('Старт');
  env.paintTerminal('Старт\nАнтена');
  env.lang = 'en';
  env.instantRender = true;
  env.paintTerminal('Launch\nAntenna');
  tick(400);
  assert.equal(frames.size, 0);
  assert.equal(nodes.get('#termLog').textContent, 'Launch\nAntenna');
  assert.equal(nodes.get('#terminalAnnouncement').textContent, 'Antenna');
});

test('reduced motion writes whole lines synchronously without animation frames', () => {
  const { env, nodes, frames } = harness();
  env.motion = true;
  env.paintTerminal('Launch');
  env.paintTerminal('Launch\nTelemetry ready');
  assert.equal(nodes.get('#termLog').textContent, 'Launch\nTelemetry ready');
  assert.equal(frames.size, 0);
  assert.equal(nodes.get('#termLog').classList.contains('typing'), false);
});

test('Ukrainian typewriter never exposes a partial official Latin identifier', () => {
  const { env, nodes, tick } = harness();
  env.paintTerminal('Старт');
  env.paintTerminal('Старт\nNASA готова');
  for (let ms = 10; ms <= 180; ms += 10) {
    tick(ms);
    assert.equal(/\nN(?:A|AS)?$/.test(nodes.get('#termLog').textContent), false);
  }
  assert.ok(nodes.get('#termLog').textContent.includes('NASA'));
});

test('score completes at 450ms and flushing during a locale change stops stale frames', () => {
  const { env, nodes, frames, tick } = harness();
  env.revealScore(91);
  assert.equal(nodes.get('#report .big').textContent, '0');
  tick(225);
  const partial = Number(nodes.get('#report .big').textContent);
  assert.ok(partial > 0 && partial < 91);
  env.lang = 'en';
  env.finishScore();
  assert.equal(frames.size, 0);
  assert.equal(nodes.get('#report .big').textContent, '91');
  env.revealScore(76);
  tick(675);
  assert.equal(nodes.get('#report .big').textContent, '76');
  assert.equal(frames.size, 0);
});

test('long rows remain readable after the former 260ms limit and finish within 900ms', () => {
  const { env, nodes, frames, tick } = harness();
  env.lang = 'en';
  const base = 'Launch';
  const row = '\nTelemetry: ' + '0123456789 '.repeat(50);
  env.paintTerminal(base);
  env.paintTerminal(base + row);
  tick(260);
  const partial = nodes.get('#termLog').textContent;
  assert.ok(partial.length > base.length);
  assert.ok(partial.length < base.length + row.length);
  assert.equal(nodes.get('#terminalAnnouncement').textContent, base);
  tick(900);
  assert.equal(nodes.get('#termLog').textContent, base + row);
  assert.equal(nodes.get('#termLog').classList.contains('typing'), false);
  assert.equal(nodes.get('#terminalAnnouncement').textContent, row.trimStart());
  assert.equal(frames.size, 0);
});

test('re-rendering unchanged events does not restart or duplicate the current row', () => {
  const { env, nodes, frames, tick } = harness();
  env.paintTerminal('Старт');
  const value = 'Старт\nПідготовка наукового обладнання та перевірка телеметрії';
  env.paintTerminal(value);
  tick(200);
  const frame = env.terminalPaint.frame;
  const partial = nodes.get('#termLog').textContent;
  env.paintTerminal(value);
  assert.equal(env.terminalPaint.frame, frame);
  assert.equal(nodes.get('#termLog').textContent, partial);
  assert.equal(frames.size, 1);
  tick(900);
  assert.equal(nodes.get('#termLog').textContent, value);
});

test('changing flight or leaving active flight cancels stale typing immediately', () => {
  const { env, nodes, frames, tick } = harness();
  env.paintTerminal('Старт');
  env.paintTerminal('Старт\nДовгий рядок попереднього польоту');
  tick(90);
  env.app.flight = { id: 2 };
  env.paintTerminal('Новий політ');
  tick(900);
  assert.equal(nodes.get('#termLog').textContent, 'Новий політ');
  assert.equal(frames.size, 0);
  env.app.lastFlight = env.app.flight;
  env.app.flight = null;
  env.paintTerminal('Новий політ\nЗавершено');
  assert.equal(nodes.get('#termLog').textContent, 'Новий політ\nЗавершено');
  assert.equal(frames.size, 0);
});

test('enabling reduced motion during typing flushes and keeps following rows immediate', () => {
  const { env, nodes, frames, tick } = harness();
  env.paintTerminal('Старт');
  env.paintTerminal('Старт\nПеревірка всіх систем апарата');
  tick(90);
  env.motion = true;
  env.stopTerminal(true);
  tick(900);
  assert.equal(nodes.get('#termLog').textContent, env.terminalPaint.target);
  env.paintTerminal(env.terminalPaint.target + '\nГотово');
  assert.ok(nodes.get('#termLog').textContent.endsWith('\nГотово'));
  assert.equal(frames.size, 0);
});

test('aborting a phase cancels timers, flushes typing, and releases modal waiters', async () => {
  const { env, nodes, frames, tick } = harness();
  const timers = new Map();
  let released = false;
  env.modals = [];
  env.quietWaiters = [() => { released = true; }];
  env.setTimeout = (fn) => { timers.set(1, fn); return 1; };
  env.clearTimeout = (id) => timers.delete(id);
  vm.runInContext(between('  async function wait(', '  const delays ='), env);
  const flight = env.app.flight;
  flight.cancelled = false;
  flight.timers = new Map();
  env.paintTerminal('Старт');
  env.paintTerminal('Старт\nПеревірка телеметрії');
  tick(90);
  const pending = env.wait(flight, 1000);
  env.cancelFlight(flight);
  assert.equal(await pending, false);
  assert.equal(flight.cancelled, true);
  assert.equal(flight.timers.size, 0);
  assert.equal(timers.size, 0);
  assert.equal(frames.size, 0);
  assert.equal(released, true);
  assert.equal(nodes.get('#termLog').textContent, env.terminalPaint.target);
});

// Use actual localized flight logs from every mission, including downlink.
// Each next event must arrive after its predecessor has finished typing.
for (const lang of ['uk', 'en']) {
  for (const [missionId, presetId] of [['m1', 'moon_fh_shielded'], ['m2', 'mars_sls_heavy'], ['m3', 'earth_f9_ka']]) {
    test(`${lang}/${missionId}: all four real phases finish every row before the next event without changing Engine`, async () => {
      const ctx = loadGame({ lang, random: () => 0 });
      const E = ctx.Engine;
      const preset = Object.values(ctx.PZ_PRESETS).flat().find((p) => p.id === presetId);
      E.initMission(missionId);
      E.selectRocket(preset.rocketId);
      E.CATEGORIES.forEach((c) => E.selectBusPart(c, preset.bus[c]));
      preset.instrumentIds.forEach((id) => E.toggleInstrument(id));
      E.startSimulation();
      E.resolveCrisis(0);
      const before = JSON.stringify(E.simulation);
      const rolls = ctx.__randomCalls.count;
      const { env, nodes, frames, tick } = harness();
      env.lang = lang;
      env.I = ctx.I18N;
      env.t = (...args) => ctx.I18N.t(...args);
      env.E = E;
      env.app.flight.events = [{ type: 'boot' }];
      vm.runInContext(between('  function renderTerminal(', '  function renderTrack('), env);
      vm.runInContext(between('  const delays =', '  async function launch('), env);
      vm.runInContext(between('  async function playPhase(', '  async function runPhases('), env);
      env.renderFlight = () => env.renderTerminal();
      let clock = 0;
      let waits = 0;
      env.wait = async (_flight, ms) => {
        clock += ms;
        tick(clock);
        assert.equal(nodes.get('#termLog').textContent, env.terminalPaint.target);
        assert.equal(nodes.get('#termLog').classList.contains('typing'), false);
        assert.equal(frames.size, 0);
        waits += 1;
        return true;
      };
      env.renderTerminal();
      for (let phase = 0; phase < 4; phase += 1) {
        assert.equal(await env.playPhase(env.app.flight, phase), true);
      }
      assert.equal(waits, E.simulation.phases.reduce((n, p) => n + p.logs.length + 2, 0));
      assert.equal(env.app.flight.events.filter((ev) => ev.type === 'status').length, 4);
      assert.equal(JSON.stringify(E.simulation), before);
      assert.equal(ctx.__randomCalls.count, rolls);
    });
  }
}

test('reduced-motion phase waits use zero delay while preserving the modal pause', async () => {
  const env = { modals: [1], reduceMotion: () => true, clearTimeout() {},
    timerDelays: [], setTimeout(fn, ms) { env.timerDelays.push(ms); queueMicrotask(fn); return 1; } };
  let resume;
  env.whenNoModals = () => new Promise((resolve) => { resume = resolve; });
  vm.createContext(env);
  vm.runInContext(between('  async function wait(', '  function cancelFlight('), env);
  const flight = { cancelled: false, timers: new Map() };
  const pending = env.wait(flight, 650);
  assert.deepEqual(env.timerDelays, []);
  env.modals.length = 0;
  resume();
  assert.equal(await pending, true);
  assert.deepEqual(env.timerDelays, [0]);
  assert.equal(flight.timers.size, 0);
});
