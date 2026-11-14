'use strict';
/* Balance acceptance criteria (section 5 of the handoff), checked over every build. */
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadGame } = require('./load');
const { audit } = require('./balance-audit');

const ctx = loadGame({ lang: 'en' });
const results = audit(ctx);
const E = ctx.Engine;

test('every mission has at least two distinct launch-ready builds that can reach the science goal', () => {
  Object.entries(results).forEach(([id, r]) => {
    const rockets = Object.keys(r.rocketsReach);
    const chassis = Object.keys(r.chassisReach);
    assert.ok(r.reachScience >= 2, `${id}: ${r.reachScience}`);
    assert.ok(rockets.length >= 2, `${id}: only ${rockets.join(',')} can reach the goal`);
    assert.ok(chassis.length >= 2, `${id}: only ${chassis.join(',')} can reach the goal`);
  });
});

test('every mission has a launch path without design-forced warnings', () => {
  Object.entries(results).forEach(([id, r]) => {
    assert.ok(r.zeroWarn > 0, `${id} has no zero-warning build`);
    assert.ok(r.reachScienceZeroWarn > 0, `${id} has no zero-warning build that reaches science`);
  });
});

test('every crisis option is available in some launch-ready build (none permanently locked)', () => {
  Object.entries(results).forEach(([id, r]) => {
    r.optionAvailable.forEach((n, i) => assert.ok(n > 0, `${id} option ${i} is never available`));
  });
});

test('radiation requirement 4 (Mars) and the shielded lunar option are reachable', () => {
  assert.ok(results.m2.radOk > 0, 'Mars radiation warning can be removed');
  assert.ok(results.m1.optionAvailable[1] > 0, 'lunar shielded option can be unlocked');
  assert.ok(results.m1.optionReaches[1] > 0, 'lunar shielded option can reach the science goal');
});

test('schedule risk is reachable: some launch-ready builds exceed the time limit', () => {
  Object.entries(results).forEach(([id, r]) => assert.ok(r.timeOver > 0, `${id}: no build exceeds the schedule`));
  // ...and it is a real trade-off, not universal
  Object.entries(results).forEach(([id, r]) => assert.ok(r.timeOver < r.launchable, `${id}: every build is late`));
});

test('Mars can be launched by more than one rocket; Atlas V is the most reliable launcher', () => {
  assert.ok(Object.keys(results.m2.rockets).length >= 2, JSON.stringify(results.m2.rockets));
  const lvs = E.getCatalog().launchVehicles;
  const atlas = lvs.find((l) => l.id === 'lv_atlas_v');
  lvs.filter((l) => l !== atlas).forEach((l) => assert.ok(atlas.reliability > l.reliability, l.id));
  assert.ok(Object.keys(results.m3.rocketsReach).includes('lv_atlas_v'));
});

test('presets are launch-ready and each can reach the science goal with an available crisis option', () => {
  Object.entries(ctx.PZ_PRESETS).forEach(([missionId, presets]) => {
    assert.ok(presets.length >= 2, missionId);
    E.initMission(missionId);
    const mission = E.getState().mission;
    const event = ctx.NASA_DATA.crisisEvents.find((c) => c.targetBody === mission.targetBody);
    const signatures = new Set();
    presets.forEach((p) => {
      const { telemetry: t, compatibility: c } = E.evaluateBuild({
        rocketId: p.rocketId, orbitId: mission.requiredOrbitId, bus: p.bus, instrumentIds: p.instrumentIds
      });
      assert.equal(c.canLaunch, true, `${p.id}: ${c.errors.join(' ')}`);
      const reaches = event.options.some((o) => t.radiation.spacecraftMinRad >= o.requiredRadResistance
        && Math.round(t.science.effectivePoints * o.scienceMultiplier) >= t.science.targetMin);
      assert.ok(reaches, `${p.id} cannot reach the goal`);
      signatures.add(`${p.rocketId}:${p.bus.chassis}:${p.bus.comms}`);
    });
    assert.equal(signatures.size, presets.length, `${missionId} presets are not distinct`);
  });
});
