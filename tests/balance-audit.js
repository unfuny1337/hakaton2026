'use strict';
/* Exhaustive balance audit: every full build on each mission's required orbit with 1–4
   target-compatible instruments, evaluated through Engine.evaluateBuild (no mutation).
   Run: node tests/balance-audit.js */
const { loadGame } = require('./load');

function subsets(items, max) {
  const out = [];
  const walk = (start, acc) => {
    if (acc.length) out.push(acc.slice());
    if (acc.length === max) return;
    for (let i = start; i < items.length; i += 1) { acc.push(items[i]); walk(i + 1, acc); acc.pop(); }
  };
  walk(0, []);
  return out;
}

function audit(ctx = loadGame({ lang: 'en' })) {
  const E = ctx.Engine;
  const catalog = E.getCatalog();
  const cats = E.CATEGORIES;
  const byCat = Object.fromEntries(cats.map((c) => [c, catalog.busComponents.filter((p) => p.category === c)]));
  const results = {};
  E.getMissions().forEach((mission) => {
    E.initMission(mission.id, 'solo');
    const event = ctx.NASA_DATA.crisisEvents.find((ev) => ev.targetBody === mission.targetBody);
    const inst = catalog.instruments.filter((i) => i.compatibleTargets.includes(mission.targetBody));
    const instSets = subsets(inst.map((i) => i.id), 4);
    const r = {
      total: 0, launchable: 0, zeroWarn: 0, reachScience: 0, reachScienceZeroWarn: 0, reachWithSafest: 0,
      timeOver: 0, radOk: 0, rockets: {}, rocketsReach: {}, chassisReach: {},
      optionAvailable: event.options.map(() => 0), optionReaches: event.options.map(() => 0),
      warnCounts: {}, examples: { zeroWarn: [], reach: [] }
    };
    const combos = [];
    const walk = (i, acc) => {
      if (i === cats.length) { combos.push({ ...acc }); return; }
      byCat[cats[i]].forEach((p) => { acc[cats[i]] = p.id; walk(i + 1, acc); });
    };
    walk(0, {});
    catalog.launchVehicles.forEach((rocket) => {
      combos.forEach((bus) => {
        instSets.forEach((ids) => {
          const build = { rocketId: rocket.id, orbitId: mission.requiredOrbitId, bus, instrumentIds: ids };
          const { telemetry: t, compatibility: c } = E.evaluateBuild(build);
          r.total += 1;
          if (!c.canLaunch) return;
          r.launchable += 1;
          r.rockets[rocket.id] = (r.rockets[rocket.id] || 0) + 1;
          const nw = c.warnings.length;
          r.warnCounts[nw] = (r.warnCounts[nw] || 0) + 1;
          if (nw === 0) {
            r.zeroWarn += 1;
            if (r.examples.zeroWarn.length < 3) r.examples.zeroWarn.push(build);
          }
          if (t.time.isOver) r.timeOver += 1;
          if (!t.radiation.isVulnerable) r.radOk += 1;
          let reaches = false;
          let safestReaches = false;
          let safest = -1;
          event.options.forEach((opt, oi) => {
            if (t.radiation.spacecraftMinRad < (opt.requiredRadResistance || 0)) return;
            r.optionAvailable[oi] += 1;
            const sci = Math.max(0, Math.round(t.science.effectivePoints * opt.scienceMultiplier));
            if (sci >= t.science.targetMin) { reaches = true; r.optionReaches[oi] += 1; }
            if (safest < 0 || opt.survivalChance > event.options[safest].survivalChance) safest = oi;
          });
          if (safest >= 0) {
            safestReaches = Math.round(t.science.effectivePoints * event.options[safest].scienceMultiplier) >= t.science.targetMin;
          }
          if (reaches) {
            r.reachScience += 1;
            r.rocketsReach[rocket.id] = (r.rocketsReach[rocket.id] || 0) + 1;
            r.chassisReach[bus.chassis] = (r.chassisReach[bus.chassis] || 0) + 1;
            if (nw === 0) r.reachScienceZeroWarn += 1;
            if (r.examples.reach.length < 3) r.examples.reach.push(build);
          }
          if (safestReaches) r.reachWithSafest += 1;
        });
      });
    });
    results[mission.id] = r;
  });
  return results;
}

module.exports = { audit, subsets };

if (require.main === module) {
  const started = Date.now();
  const res = audit();
  Object.entries(res).forEach(([id, r]) => {
    console.log(`\n== ${id} ==`);
    console.log(`builds ${r.total}, launchable ${r.launchable}, zero-warning ${r.zeroWarn}, reach science ${r.reachScience} `
      + `(zero-warning ${r.reachScienceZeroWarn}, with safest option ${r.reachWithSafest}), time over ${r.timeOver}, radiation ok ${r.radOk}`);
    console.log('launchable by rocket', JSON.stringify(r.rockets));
    console.log('reach by rocket', JSON.stringify(r.rocketsReach), 'by chassis', JSON.stringify(r.chassisReach));
    console.log('crisis option available', JSON.stringify(r.optionAvailable), 'reaches goal', JSON.stringify(r.optionReaches));
    console.log('warning counts', JSON.stringify(r.warnCounts));
  });
  console.log(`\n${((Date.now() - started) / 1000).toFixed(1)} s`);
}
