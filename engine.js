/* PAYLOAD ZERO — game engine.
 * Load order (classic scripts): nasa_data.js → i18n.js → i18n-dict.js → engine.js.
 * Public strings (errors, warnings, advisor messages, phase titles/logs, insights) are
 * rendered in the current I18N language at read time. Internally the engine stores
 * message keys + parameters, so finished phases and reports can be re-read in another
 * language without re-running the simulation or calling Math.random() again.
 */
(function (global) {
  'use strict';

  const data = typeof NASA_DATA !== 'undefined' ? NASA_DATA : global.NASA_DATA;
  if (!data) throw new Error('PAYLOAD ZERO: load nasa_data.js first / спочатку підключіть nasa_data.js.');
  const I18N = global.I18N;
  if (!I18N) throw new Error('PAYLOAD ZERO: load i18n.js before engine.js / підключіть i18n.js перед engine.js.');

  const CATEGORIES = Object.freeze([
    'chassis', 'power', 'battery', 'comms', 'computer', 'propulsion', 'thermal'
  ]);
  // Game-model constants (kept from the original telemetry contract).
  const TRANSFER = Object.freeze({ Earth: 3.0, Moon: 7.5, Mars: 16.0 });
  const TRAVEL_MONTHS = Object.freeze({ Earth: 18, Moon: 24, Mars: 36 });
  const MAX_INSTRUMENTS = 4;
  const WARNING_SURVIVAL_FACTOR = 0.95;
  const POWER_DEFICIT_FACTOR = 0.6;
  const BATTERY_HOURS_FACTOR = 3.5;

  const index = (items) => new Map(items.map((item) => [item.id, item]));
  const missions = index(data.missions);
  const rockets = index(data.launchVehicles);
  const orbits = index(data.orbits);
  const parts = index(data.busComponents);
  const instruments = index(data.instruments);
  const clone = (value) => JSON.parse(JSON.stringify(value));
  const number = (value) => Number.isFinite(value) ? value : 0;
  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
  const sum = (items, key) => items.reduce((total, item) => total + number(item[key]), 0);
  const percent = (used, max) => max > 0 ? used / max * 100 : 0;
  const round2 = (value) => Math.round(value * 100) / 100;
  const emptyBus = () => Object.fromEntries(CATEGORIES.map((category) => [category, null]));
  const emptyBuild = () => ({ rocketId: null, orbitId: null, bus: emptyBus(), instrumentIds: [] });
  const emptySimulation = () => ({
    phases: [], crisis: null, resolved: false, optionIndex: null,
    survivalChance: null, survivalRoll: null, report: null
  });

  /* ---------- localized messages ---------- */
  const msg = (key, params = {}) => ({ key, params });
  const ref = (key, params) => (params ? { key, params } : { key });
  const nameRef = (kind, id) => ref(`data.${kind}.${id}.name`);
  const catRef = (category) => ref(`cat.${category}`);
  const targetRef = (body, form = 'gen') => ref(`target.${body}.${form}`);
  const statusRef = (status) => ref(`status.${status}`);
  const text = (message) => I18N.t(message.key, message.params);
  const joinText = (segments) => segments.map(text).join(' ');

  function fail(Type, key, params = {}, code = key) {
    const error = new Type(I18N.t(key, params));
    error.code = code;
    error.i18nKey = key;
    error.i18nParams = clone(params);
    return error;
  }

  let mission = null;
  let mode = 'solo';
  let build = emptyBuild();
  let simulation = emptySimulation();

  function requireMission() {
    if (!mission) throw fail(Error, 'eng.ex.mission', {}, 'MISSION_REQUIRED');
  }

  function lookup(map, id, kind, nullable = false) {
    if (nullable && id === null) return null;
    if (typeof id !== 'string' || !map.has(id)) {
      throw fail(RangeError, 'eng.ex.unknownId', { kind: ref(`kind.${kind}`), id: String(id) }, 'UNKNOWN_ID');
    }
    return map.get(id);
  }

  function validateMode(value) {
    // UI may introduce additional modes; preserve any nonempty string.
    if (typeof value !== 'string' || !value.trim() || value.length > 64) {
      throw fail(TypeError, 'eng.ex.mode', {}, 'INVALID_MODE');
    }
    return value;
  }

  function selectedObjects(source = build) {
    return {
      rocket: rockets.get(source.rocketId) || null,
      orbit: orbits.get(source.orbitId) || null,
      bus: Object.fromEntries(CATEGORIES.map((category) => [
        category, parts.get(source.bus[category]) || null
      ])),
      instruments: source.instrumentIds.map((id) => instruments.get(id)).filter(Boolean)
    };
  }

  function calculateTelemetry(selected = selectedObjects()) {
    const bus = Object.values(selected.bus).filter(Boolean);
    const payload = bus.concat(selected.instruments);
    const { rocket, orbit } = selected;
    const { power: powerPart, battery: batteryPart, comms: commsPart } = selected.bus;
    const budgetUsed = number(rocket && rocket.cost) + sum(payload, 'cost');
    const maxBudget = mission ? mission.maxBudget : 0;
    const dryMass = sum(payload, 'mass');
    const wetMassWithStage = Math.round(dryMass * (mission ? TRANSFER[mission.targetBody] : 1));
    const maxAllowed = rocket
      ? Math.round(rocket.maxPayloadKg * (orbit ? orbit.massPenaltyMultiplier : 1)) : 0;
    const usedPower = sum(payload, 'powerConsumption');
    const generated = Math.round(number(powerPart && powerPart.powerGeneration)
      * (mission ? mission.solarEfficiency : 0));
    const batteryCapacity = number(batteryPart && batteryPart.batteryCapacity);
    const batteryRequired = Math.round(usedPower * (orbit ? orbit.eclipseRatio : 0.35) * BATTERY_HOURS_FACTOR);
    const generatedPerDay = sum(selected.instruments, 'dataGenerationRate');
    const maxTransmittedPerDay = number(commsPart && commsPart.dataTransferRate)
      * number(orbit && orbit.commWindowHoursPerDay);
    const bottleneckRatio = generatedPerDay > 0
      ? Math.min(1, maxTransmittedPerDay / generatedPerDay) : 1;
    const prepItems = rocket ? payload.concat(rocket) : payload;
    const prepMonths = Math.max(0, ...prepItems.map((item) => number(item.prepTimeMonths)));
    const usedMonths = prepMonths + (mission ? TRAVEL_MONTHS[mission.targetBody] : 0);
    const maxMonths = mission ? mission.maxTimeMonths : 0;
    const rawPoints = mission ? sum(selected.instruments.filter((item) =>
      item.compatibleTargets.includes(mission.targetBody)), 'sciencePoints') : 0;
    const isPowerDeficit = usedPower > generated;
    const effectivePoints = Math.round(rawPoints * bottleneckRatio * (isPowerDeficit ? POWER_DEFICIT_FACTOR : 1));
    const targetMin = mission ? mission.minScienceScore : 0;
    const radValues = [selected.bus.chassis, selected.bus.computer]
      .filter(Boolean).map((item) => number(item.radiationResistance));
    const spacecraftMinRad = radValues.length ? Math.min(...radValues) : 0;
    const spacecraftAvgRad = radValues.length
      ? radValues.reduce((total, value) => total + value, 0) / radValues.length : 0;
    const requiredRad = mission ? mission.radiationLevel : 0;

    return {
      budget: { used: budgetUsed, max: maxBudget, percent: percent(budgetUsed, maxBudget),
        isOver: budgetUsed > maxBudget },
      mass: { dryMass, wetMassWithStage, maxAllowed,
        percent: percent(wetMassWithStage, maxAllowed),
        isOver: maxAllowed > 0 ? wetMassWithStage > maxAllowed : true },
      power: { used: usedPower, generated, netBalance: generated - usedPower,
        batteryCapacity, batteryRequired, isPowerDeficit,
        isBatteryDeficit: batteryCapacity < batteryRequired },
      dataAndComms: { generatedPerDay, maxTransmittedPerDay, bottleneckRatio,
        isBottlenecked: generatedPerDay > maxTransmittedPerDay },
      time: { usedMonths, maxMonths, percent: percent(usedMonths, maxMonths),
        isOver: usedMonths > maxMonths },
      science: { rawPoints, effectivePoints, targetMin,
        percent: percent(effectivePoints, targetMin), isEnough: !!mission && effectivePoints >= targetMin },
      radiation: { spacecraftMinRad, spacecraftAvgRad, requiredRad,
        isVulnerable: spacecraftMinRad < requiredRad }
    };
  }

  /** Structured list of launch checks. Errors block launch; warnings allow it with a penalty. */
  function collectIssues(telemetry, selected) {
    const issues = [];
    const add = (level, code, key, params = {}, extra = {}) => issues.push({ level, code, key, params, ...extra });
    if (!mission) add('error', 'NO_MISSION', 'eng.err.noMission');
    if (!selected.rocket) add('error', 'NO_ROCKET', 'eng.err.noRocket');
    if (!selected.orbit) add('error', 'NO_ORBIT', 'eng.err.noOrbit');
    CATEGORIES.forEach((category) => {
      if (!selected.bus[category]) add('error', 'MISSING_PART', 'eng.err.noPart', { cat: catRef(category) }, { category });
    });
    if (!selected.instruments.length) add('error', 'NO_INSTRUMENTS', 'eng.err.noInstruments');
    if (mission && selected.orbit && selected.orbit.id !== mission.requiredOrbitId) {
      add('error', 'WRONG_ORBIT', 'eng.err.wrongOrbit', { orbit: nameRef('orbit', mission.requiredOrbitId) });
    }
    if (telemetry.budget.isOver) {
      add('error', 'OVER_BUDGET', 'eng.err.budget', { over: round2(telemetry.budget.used - telemetry.budget.max) });
    }
    if (telemetry.mass.isOver) {
      add('error', 'OVER_MASS', 'eng.err.mass', { wet: telemetry.mass.wetMassWithStage, max: telemetry.mass.maxAllowed });
    }
    if (telemetry.power.isPowerDeficit) {
      add('warning', 'POWER_DEFICIT', 'eng.warn.power', { deficit: round2(-telemetry.power.netBalance) });
    }
    if (telemetry.power.isBatteryDeficit) {
      add('warning', 'BATTERY_DEFICIT', 'eng.warn.battery',
        { deficit: round2(telemetry.power.batteryRequired - telemetry.power.batteryCapacity) });
    }
    if (telemetry.dataAndComms.isBottlenecked) {
      add('warning', 'COMMS_BOTTLENECK', 'eng.warn.comms',
        { lost: round2(telemetry.dataAndComms.generatedPerDay - telemetry.dataAndComms.maxTransmittedPerDay) });
    }
    if (telemetry.time.isOver) {
      add('warning', 'TIME_OVER', 'eng.warn.time', { over: round2(telemetry.time.usedMonths - telemetry.time.maxMonths) });
    }
    if (mission) {
      selected.instruments.forEach((item) => {
        if (!item.compatibleTargets.includes(mission.targetBody)) {
          add('warning', 'INSTRUMENT_TARGET', 'eng.warn.instrument',
            { inst: nameRef('inst', item.id), target: targetRef(mission.targetBody) }, { instrumentId: item.id });
        }
      });
    }
    if (telemetry.radiation.isVulnerable) {
      add('warning', 'RADIATION', 'eng.warn.radiation',
        { have: telemetry.radiation.spacecraftMinRad, need: telemetry.radiation.requiredRad });
    }
    if (mission && !telemetry.science.isEnough) {
      add('warning', 'SCIENCE_SHORT', 'eng.warn.science',
        { missing: round2(telemetry.science.targetMin - telemetry.science.effectivePoints) });
    }
    return issues;
  }

  function compatibilityFromIssues(issues) {
    const errors = issues.filter((issue) => issue.level === 'error').map(text);
    const warnings = issues.filter((issue) => issue.level === 'warning').map(text);
    return { canLaunch: errors.length === 0, errors, warnings, issues: clone(issues) };
  }

  function checkCompatibility(telemetry = calculateTelemetry(), selected = selectedObjects()) {
    return compatibilityFromIssues(collectIssues(telemetry, selected));
  }

  function getAdvisorsFeedback(telemetry = calculateTelemetry(), selected = selectedObjects(),
    compatibility = checkCompatibility(telemetry, selected)) {
    const ids = ['science', 'power', 'ballistics', 'director'];
    const advisor = (i, status, segments) => ({
      id: ids[i], title: I18N.t(`adv.${ids[i]}.title`), status, message: joinText(segments)
    });
    if (!mission) return ids.map((_, i) => advisor(i, 'warn', [msg('adv.noMission')]));
    const { science, power, mass, budget, time, radiation, dataAndComms: comms } = telemetry;
    const body = targetRef(mission.targetBody);
    const foreign = selected.instruments.filter((item) => !item.compatibleTargets.includes(mission.targetBody));
    const scienceSegments = selected.instruments.length
      ? [msg('adv.sci.points', { eff: science.effectivePoints, target: science.targetMin, raw: science.rawPoints })]
        .concat(foreign.length ? [msg('adv.sci.foreign', { n: foreign.length })] : [])
        .concat(science.isEnough ? [msg('adv.sci.ok')]
          : [msg('adv.sci.short', { missing: round2(science.targetMin - science.effectivePoints) })])
      : [msg('adv.sci.none', { target: science.targetMin, body })];
    const missingParts = CATEGORIES.filter((category) => !selected.bus[category]).length;
    const powerSegments = (missingParts ? [msg('adv.pwr.missing', { n: missingParts })] : [])
      .concat(power.isPowerDeficit
        ? [msg('adv.pwr.deficit', { body, deficit: round2(-power.netBalance), used: round2(power.used),
          gen: round2(power.generated), factor: POWER_DEFICIT_FACTOR })]
        : [msg('adv.pwr.margin', { net: round2(power.netBalance), gen: round2(power.generated), used: round2(power.used) })])
      .concat(power.isBatteryDeficit
        ? [msg('adv.pwr.batShort', { req: power.batteryRequired, cap: power.batteryCapacity,
          add: round2(power.batteryRequired - power.batteryCapacity) })]
        : [msg('adv.pwr.batOk', { cap: power.batteryCapacity, req: power.batteryRequired })])
      .concat(radiation.isVulnerable
        ? [msg('adv.pwr.rad', { have: radiation.spacecraftMinRad, need: radiation.requiredRad })] : []);
    const orbitWrong = !selected.orbit || selected.orbit.id !== mission.requiredOrbitId;
    const ballisticsSegments = !selected.rocket
      ? [msg('adv.bal.noRocket', { dry: round2(mass.dryMass), wet: mass.wetMassWithStage })]
      : [msg('adv.bal.rocket', { rocket: nameRef('lv', selected.rocket.id), wet: mass.wetMassWithStage, max: mass.maxAllowed })]
        .concat(mass.isOver ? [msg('adv.bal.over', { over: round2(mass.wetMassWithStage - mass.maxAllowed) })]
          : [msg('adv.bal.margin', { left: round2(mass.maxAllowed - mass.wetMassWithStage) })])
        .concat([msg(orbitWrong ? 'adv.bal.orbitWrong' : 'adv.bal.orbitOk')]);
    const directorSegments = [msg('adv.dir.budget', { used: round2(budget.used), max: budget.max,
      months: round2(time.usedMonths), maxMonths: time.maxMonths })]
      .concat(comms.isBottlenecked
        ? [msg('adv.dir.bottleneck', { link: round2(comms.maxTransmittedPerDay), gen: round2(comms.generatedPerDay),
          lost: round2(comms.generatedPerDay - comms.maxTransmittedPerDay) })]
        : [msg('adv.dir.allData', { gen: round2(comms.generatedPerDay) })])
      .concat([compatibility.canLaunch ? msg('adv.dir.go') : msg('adv.dir.blockers', { n: compatibility.errors.length })]);
    return [
      advisor(0, !selected.instruments.length ? 'error' : (!science.isEnough || foreign.length ? 'warn' : 'ok'), scienceSegments),
      advisor(1, missingParts ? 'error'
        : (power.isPowerDeficit || power.isBatteryDeficit || radiation.isVulnerable ? 'warn' : 'ok'), powerSegments),
      advisor(2, !selected.rocket || mass.isOver || orbitWrong ? 'error' : 'ok', ballisticsSegments),
      advisor(3, budget.isOver ? 'error' : (time.isOver || comms.isBottlenecked || !compatibility.canLaunch ? 'warn' : 'ok'), directorSegments)
    ];
  }

  function getState() {
    const selected = selectedObjects();
    const telemetry = calculateTelemetry(selected);
    const compatibility = checkCompatibility(telemetry, selected);
    return clone({
      mission, mode, build, selectedObjects: selected, telemetry, compatibility,
      advisors: getAdvisorsFeedback(telemetry, selected, compatibility)
    });
  }

  function commitChange(change) {
    change();
    simulation = emptySimulation();
    return getState();
  }

  /* ---------- build changes (shared by live edits and side-effect-free previews) ---------- */
  function applyChange(target, change) {
    if (!change || typeof change !== 'object') throw fail(TypeError, 'eng.ex.change', {}, 'INVALID_CHANGE');
    switch (change.type) {
      case 'rocket':
        lookup(rockets, change.id, 'rocket', true);
        target.rocketId = change.id;
        return target;
      case 'orbit':
        lookup(orbits, change.id, 'orbit', true);
        target.orbitId = change.id;
        return target;
      case 'part': {
        const { category, id } = change;
        if (!CATEGORIES.includes(category)) {
          throw fail(RangeError, 'eng.ex.category', { cat: String(category) }, 'UNKNOWN_CATEGORY');
        }
        const part = lookup(parts, id, 'part', true);
        if (part && part.category !== category) {
          throw fail(RangeError, 'eng.ex.partCategory', { id, cat: catRef(category) }, 'WRONG_CATEGORY');
        }
        target.bus[category] = id;
        return target;
      }
      case 'instrument': {
        lookup(instruments, change.id, 'instrument');
        const position = target.instrumentIds.indexOf(change.id);
        if (position === -1 && target.instrumentIds.length >= MAX_INSTRUMENTS) {
          throw fail(RangeError, 'eng.ex.instLimit', { max: MAX_INSTRUMENTS }, 'INSTRUMENT_LIMIT');
        }
        if (position === -1) target.instrumentIds.push(change.id);
        else target.instrumentIds.splice(position, 1);
        return target;
      }
      default:
        throw fail(TypeError, 'eng.ex.change', {}, 'INVALID_CHANGE');
    }
  }

  function edit(change) {
    requireMission();
    const next = applyChange(clone(build), change);
    return commitChange(() => { build = next; });
  }

  function initMission(missionId, nextMode = 'solo') {
    const nextMission = lookup(missions, missionId, 'mission');
    validateMode(nextMode);
    return commitChange(() => {
      mission = nextMission;
      mode = nextMode;
      build = emptyBuild();
      build.orbitId = mission.requiredOrbitId;
    });
  }

  const selectRocket = (rocketId) => edit({ type: 'rocket', id: rocketId });
  const selectOrbit = (orbitId) => edit({ type: 'orbit', id: orbitId });
  const selectBusPart = (category, partId) => edit({ type: 'part', category, id: partId });
  const toggleInstrument = (instId) => edit({ type: 'instrument', id: instId });

  /** Changes only the team/solo label; it never touches the build or a finished flight. */
  function setMode(nextMode) {
    mode = validateMode(nextMode);
    return getState();
  }

  function validateBuildShape(candidate) {
    if (!candidate || typeof candidate !== 'object' || !candidate.bus || !Array.isArray(candidate.instrumentIds)) {
      throw fail(TypeError, 'eng.ex.change', {}, 'INVALID_BUILD');
    }
    const next = emptyBuild();
    next.rocketId = candidate.rocketId == null ? null : candidate.rocketId;
    next.orbitId = candidate.orbitId == null ? null : candidate.orbitId;
    lookup(rockets, next.rocketId, 'rocket', true);
    lookup(orbits, next.orbitId, 'orbit', true);
    CATEGORIES.forEach((category) => {
      const id = candidate.bus[category] == null ? null : candidate.bus[category];
      applyChange(next, { type: 'part', category, id });
    });
    if (candidate.instrumentIds.length > MAX_INSTRUMENTS || new Set(candidate.instrumentIds).size !== candidate.instrumentIds.length) {
      throw fail(RangeError, 'eng.ex.codeInstruments', { max: MAX_INSTRUMENTS }, 'CODE_INSTRUMENTS');
    }
    candidate.instrumentIds.forEach((id) => lookup(instruments, id, 'instrument'));
    next.instrumentIds = candidate.instrumentIds.slice();
    return next;
  }

  function evaluate(source) {
    const selected = selectedObjects(source);
    const telemetry = calculateTelemetry(selected);
    return { telemetry, compatibility: checkCompatibility(telemetry, selected) };
  }

  /** Evaluates any build for the current mission without changing the live build or simulation. */
  function evaluateBuild(candidate) {
    requireMission();
    return clone(evaluate(validateBuildShape(candidate)));
  }

  /** Side-effect-free "what if" for a single change. Never mutates build, simulation or storage. */
  function previewChange(change) {
    requireMission();
    const before = evaluate(build);
    let next;
    try {
      next = applyChange(clone(build), change);
    } catch (error) {
      return clone({ change, before, after: null, changed: false,
        error: error.message, errorCode: error.code || 'ERROR' });
    }
    return clone({ change, before, after: evaluate(next), changed: JSON.stringify(next) !== JSON.stringify(build),
      error: null, errorCode: null });
  }

  /* ---------- blueprint code ---------- */
  // Version 1: PZ|1|mission|mode|rocket|orbit|7 bus slots|comma-separated instruments.
  function exportBlueprintCode() {
    requireMission();
    const fields = ['PZ', '1', mission.id, mode, build.rocketId || '', build.orbitId || '',
      ...CATEGORIES.map((category) => build.bus[category] || '')];
    return fields.map(encodeURIComponent).concat(
      build.instrumentIds.map(encodeURIComponent).join(',')
    ).join('|');
  }

  function parseBlueprintCode(code) {
    if (typeof code !== 'string' || code.length > 4096) throw fail(TypeError, 'eng.ex.code', {}, 'CODE_INVALID');
    const tokens = code.trim().split('|');
    if (tokens.length !== 14 || tokens[0] !== 'PZ' || tokens[1] !== '1') {
      throw fail(Error, 'eng.ex.codeFormat', {}, 'CODE_FORMAT');
    }
    let fields;
    let ids;
    try {
      fields = tokens.slice(0, 13).map(decodeURIComponent);
      ids = tokens[13] ? tokens[13].split(',').map(decodeURIComponent) : [];
    } catch (_) {
      throw fail(Error, 'eng.ex.codeEncoding', {}, 'CODE_ENCODING');
    }
    // Validate everything before committing; a bad import never changes the live build.
    const nextMission = lookup(missions, fields[2], 'mission');
    const nextMode = validateMode(fields[3]);
    const nextBuild = emptyBuild();
    nextBuild.rocketId = fields[4] || null;
    nextBuild.orbitId = fields[5] || null;
    lookup(rockets, nextBuild.rocketId, 'rocket', true);
    lookup(orbits, nextBuild.orbitId, 'orbit', true);
    CATEGORIES.forEach((category, i) => {
      const id = fields[6 + i] || null;
      const part = lookup(parts, id, 'part', true);
      if (part && part.category !== category) throw fail(RangeError, 'eng.ex.codeCategory', { id }, 'WRONG_CATEGORY');
      nextBuild.bus[category] = id;
    });
    if (ids.length > MAX_INSTRUMENTS || new Set(ids).size !== ids.length) {
      throw fail(RangeError, 'eng.ex.codeInstruments', { max: MAX_INSTRUMENTS }, 'CODE_INSTRUMENTS');
    }
    ids.forEach((id) => lookup(instruments, id, 'instrument'));
    nextBuild.instrumentIds = ids;
    return { mission: nextMission, mode: nextMode, build: nextBuild };
  }

  function importBlueprintCode(code) {
    const parsed = parseBlueprintCode(code);
    return commitChange(() => { mission = parsed.mission; mode = parsed.mode; build = parsed.build; });
  }

  /** Validates a code exactly like import, without applying it. Returns mission/mode/build. */
  function validateBlueprintCode(code) {
    const parsed = parseBlueprintCode(code);
    return clone({ missionId: parsed.mission.id, mode: parsed.mode, build: parsed.build });
  }

  /* ---------- simulation ---------- */
  function phase(id, hasWarning, logs) {
    return { id, titleKey: `phase.${id}`, status: hasWarning ? 'WARNING' : 'SUCCESS', logs };
  }

  function renderPhase(item) {
    return { id: item.id, title: I18N.t(item.titleKey), status: item.status, logs: item.logs.map(text) };
  }

  function renderCrisis(crisis) {
    const out = clone(crisis);
    out.title = I18N.t(`data.crisis.${crisis.id}.title`);
    out.description = I18N.t(`data.crisis.${crisis.id}.desc`);
    out.options = crisis.options.map((option, i) => ({
      ...option,
      text: I18N.t(`data.crisis.${crisis.id}.opt${i}`),
      lockReason: option.isAvailable ? null : I18N.t('crisis.lockReason', {
        need: number(option.requiredRadResistance), have: crisis.spacecraftMinRad
      })
    }));
    return out;
  }

  function startSimulation() {
    requireMission();
    if (simulation.crisis) return renderCrisis(simulation.crisis);
    const selected = selectedObjects();
    const t = calculateTelemetry(selected);
    const issues = collectIssues(t, selected);
    const compatibility = compatibilityFromIssues(issues);
    if (!compatibility.canLaunch) {
      const error = fail(Error, 'eng.ex.launchBlocked', { errors: compatibility.errors.join(' ') }, 'LAUNCH_BLOCKED');
      error.compatibility = compatibility;
      throw error;
    }
    const events = data.crisisEvents.filter((event) => event.targetBody === mission.targetBody);
    if (!events.length) throw fail(Error, 'eng.ex.noCrisis', { target: targetRef(mission.targetBody, 'name') }, 'NO_CRISIS');
    const event = clone(events.length === 1 ? events[0] : events[Math.floor(Math.random() * events.length)]);
    const reliability = number(selected.rocket.reliability);
    const warningFactor = Math.pow(WARNING_SURVIVAL_FACTOR, compatibility.warnings.length);
    event.spacecraftMinRad = t.radiation.spacecraftMinRad;
    event.options = event.options.map((option) => ({
      ...option,
      isAvailable: t.radiation.spacecraftMinRad >= number(option.requiredRadResistance),
      // The real chance used by resolveCrisis(): option × launcher reliability × 0.95^warnings.
      effectiveSurvivalChance: clamp(number(option.survivalChance) * reliability * warningFactor, 0, 1)
    }));
    const foreign = selected.instruments.some((item) => !item.compatibleTargets.includes(mission.targetBody));
    const phases = [
      phase(1, false, [
        msg('log.p1.vehicle', { rocket: nameRef('lv', selected.rocket.id), orbit: nameRef('orbit', selected.orbit.id) }),
        msg('log.p1.mass', { dry: round2(t.mass.dryMass), wet: t.mass.wetMassWithStage, max: t.mass.maxAllowed }),
        msg('log.p1.reliability', { pct: round2(reliability * 100) })
      ]),
      phase(2, t.power.isPowerDeficit || t.power.isBatteryDeficit || t.radiation.isVulnerable, [
        msg('log.p2.power', { gen: t.power.generated, used: round2(t.power.used), net: round2(t.power.netBalance) }),
        msg('log.p2.battery', { cap: t.power.batteryCapacity, req: t.power.batteryRequired }),
        msg('log.p2.rad', { min: t.radiation.spacecraftMinRad, avg: round2(t.radiation.spacecraftAvgRad), need: t.radiation.requiredRad })
      ]),
      phase(3, !t.science.isEnough || t.dataAndComms.isBottlenecked || foreign, [
        msg('log.p3.science', { n: selected.instruments.length, raw: t.science.rawPoints, eff: t.science.effectivePoints }),
        msg('log.p3.data', { gen: round2(t.dataAndComms.generatedPerDay), link: round2(t.dataAndComms.maxTransmittedPerDay) }),
        msg('log.p3.time', { used: t.time.usedMonths, max: t.time.maxMonths, budget: round2(t.budget.used), bmax: t.budget.max })
      ])
    ];
    simulation = { ...emptySimulation(), phases, crisis: event };
    return renderCrisis(event);
  }

  function usedNasaSources(selected) {
    const entities = [['mission', mission], ['lv', selected.rocket], ['orbit', selected.orbit],
      ...CATEGORIES.map((category) => ['part', selected.bus[category]]),
      ...selected.instruments.map((item) => ['inst', item]),
      ['crisis', simulation.crisis && data.crisisEvents.find((event) => event.id === simulation.crisis.id)]];
    const seen = new Set();
    return entities.filter(([, item]) => item && item.nasaSourceUrl).reduce((sources, [kind, item]) => {
      const key = `${kind}:${item.id}|${item.nasaSourceUrl}`;
      if (!seen.has(key)) {
        seen.add(key);
        sources.push({ kind, id: item.id, url: item.nasaSourceUrl, verifiedSpecs: clone(item.verifiedSpecs || {}),
          origin: item.origin || 'nasa' });
      }
      return sources;
    }, []);
  }

  function resolveCrisis(optionIndex) {
    if (!simulation.crisis) throw fail(Error, 'eng.ex.notStarted', {}, 'SIM_NOT_STARTED');
    if (simulation.resolved) {
      if (optionIndex === simulation.optionIndex) return getBlackBoxReport();
      throw fail(Error, 'eng.ex.resolved', {}, 'CRISIS_RESOLVED');
    }
    if (!Number.isInteger(optionIndex) || optionIndex < 0 || optionIndex >= simulation.crisis.options.length) {
      throw fail(RangeError, 'eng.ex.optionIndex', {}, 'OPTION_INDEX');
    }
    const option = simulation.crisis.options[optionIndex];
    if (!option.isAvailable) {
      throw fail(Error, 'eng.ex.optionLocked', { need: number(option.requiredRadResistance),
        have: simulation.crisis.spacecraftMinRad }, 'OPTION_LOCKED');
    }
    const selected = selectedObjects();
    const t = calculateTelemetry(selected);
    const issues = collectIssues(t, selected);
    const warningIssues = issues.filter((issue) => issue.level === 'warning');
    // Gameplay policy: each warning multiplies survival probability by 0.95.
    const reliability = number(selected.rocket.reliability);
    const warningFactor = Math.pow(WARNING_SURVIVAL_FACTOR, warningIssues.length);
    const survivalChance = clamp(number(option.survivalChance) * reliability * warningFactor, 0, 1);
    const survivalRoll = Math.random();
    const survivalRollPassed = survivalRoll < survivalChance;
    const afterCrisis = Math.max(0, Math.round(t.science.effectivePoints * number(option.scienceMultiplier)));
    const finalScience = survivalRollPassed ? afterCrisis : 0;
    const status = !survivalRollPassed ? 'FAILED'
      : (finalScience >= t.science.targetMin ? 'SUCCESS' : 'PARTIAL');
    // Science earns up to 87.5 points with a 25% overachievement bonus;
    // unspent budget and schedule reserve each earn up to 15 points.
    const scienceRatio = t.science.targetMin > 0 ? clamp(finalScience / t.science.targetMin, 0, 1.25) : 1;
    const budgetReserve = t.budget.max > 0 ? clamp(1 - t.budget.used / t.budget.max, 0, 1) : 0;
    const timeReserve = t.time.maxMonths > 0 ? clamp(1 - t.time.usedMonths / t.time.maxMonths, 0, 1) : 0;
    const score = Math.round(70 * scienceRatio + 15 * budgetReserve + 15 * timeReserve);
    const cap = status === 'PARTIAL' ? 79 : 100;
    const finalScore = status === 'FAILED' ? 0 : clamp(score, 0, cap);
    const rank = status === 'FAILED' ? 'F'
      : (finalScore >= 90 ? 'S' : finalScore >= 80 ? 'A' : finalScore >= 65 ? 'B' : 'C');
    const optionName = ref(`data.crisis.${simulation.crisis.id}.opt${optionIndex}`);
    const insights = [
      msg('ins.decision', { option: optionName, mult: number(option.scienceMultiplier) }),
      msg('ins.survival', { pct: round2(survivalChance * 100), n: warningIssues.length, factor: WARNING_SURVIVAL_FACTOR }),
      survivalRollPassed ? msg('ins.received', { sci: finalScience, target: t.science.targetMin }) : msg('ins.lost'),
      ...warningIssues.map((issue) => msg(issue.key, issue.params)),
      msg('ins.assumptions')
    ];
    const incompatible = selected.instruments.filter((item) => !item.compatibleTargets.includes(mission.targetBody));
    const analysis = {
      science: {
        incompatiblePoints: sum(incompatible, 'sciencePoints'),
        rawPoints: t.science.rawPoints,
        bottleneckRatio: t.dataAndComms.bottleneckRatio,
        afterComms: t.science.rawPoints * t.dataAndComms.bottleneckRatio,
        powerDeficit: t.power.isPowerDeficit,
        powerFactor: t.power.isPowerDeficit ? POWER_DEFICIT_FACTOR : 1,
        effectivePoints: t.science.effectivePoints,
        scienceMultiplier: number(option.scienceMultiplier),
        afterCrisis,
        survived: survivalRollPassed,
        finalScience,
        targetMin: t.science.targetMin
      },
      survival: { optionChance: number(option.survivalChance), reliability, warningsCount: warningIssues.length,
        warningFactor, survivalChance, roll: survivalRoll, passed: survivalRollPassed },
      score: { scienceRatio, sciencePart: 70 * scienceRatio, budgetReserve, budgetPart: 15 * budgetReserve,
        timeReserve, timePart: 15 * timeReserve, rawScore: score, cap, finalScore, rank },
      warnings: warningIssues.map((issue) => ({ code: issue.code, params: issue.params, category: issue.category || null,
        instrumentId: issue.instrumentId || null })),
      telemetry: clone(t),
      optionIndex,
      crisisId: simulation.crisis.id,
      missionId: mission.id
    };
    const report = { status, finalScore, rank, finalScience, survivalRollPassed, insights,
      sources: usedNasaSources(selected), blueprintCode: exportBlueprintCode(), analysis };
    const downlink = phase(4, status === 'PARTIAL', [
      msg('log.p4.decision', { option: optionName, pct: round2(survivalChance * 100) }),
      survivalRollPassed
        ? msg('log.p4.ok', { sci: finalScience, status: statusRef(status), score: finalScore, rank })
        : msg('log.p4.lost', { status: statusRef('FAILED') })
    ]);
    if (!survivalRollPassed) downlink.status = 'FAILED';
    simulation.phases.push(downlink);
    simulation.resolved = true;
    simulation.optionIndex = optionIndex;
    simulation.survivalChance = survivalChance;
    simulation.survivalRoll = survivalRoll;
    simulation.report = report;
    return getBlackBoxReport();
  }

  function renderReport(report) {
    return {
      status: report.status,
      finalScore: report.finalScore,
      rank: report.rank,
      finalScience: report.finalScience,
      survivalRollPassed: report.survivalRollPassed,
      insights: report.insights.map(text),
      usedNasaSources: report.sources.map((source) => ({
        name: I18N.t(`data.${source.kind}.${source.id}.name`),
        url: source.url,
        verifiedSpecs: clone(source.verifiedSpecs),
        nasaInfo: I18N.t(`data.${source.kind}.${source.id}.desc`),
        kind: source.kind,
        id: source.id,
        origin: source.origin
      })),
      blueprintCode: report.blueprintCode,
      analysis: clone(report.analysis)
    };
  }

  function getBlackBoxReport() {
    return simulation.report ? renderReport(simulation.report) : null;
  }

  function renderSimulation() {
    return {
      phases: simulation.phases.map(renderPhase),
      crisis: simulation.crisis ? renderCrisis(simulation.crisis) : null,
      resolved: simulation.resolved,
      optionIndex: simulation.optionIndex,
      survivalChance: simulation.survivalChance,
      survivalRoll: simulation.survivalRoll,
      report: getBlackBoxReport()
    };
  }

  /** Clears only the flight (phases, crisis, report). Build, mission and mode stay. */
  function resetSimulation() {
    simulation = emptySimulation();
    return getState();
  }

  global.Engine = {
    getMissions: () => data.missions,
    getCatalog: () => ({ orbits: data.orbits, launchVehicles: data.launchVehicles,
      busComponents: data.busComponents, instruments: data.instruments, metadata: data.metadata }),
    initMission, selectRocket, selectOrbit, selectBusPart, toggleInstrument,
    calculateTelemetry: () => calculateTelemetry(),
    checkCompatibility: () => checkCompatibility(),
    getAdvisorsFeedback: () => getAdvisorsFeedback(),
    getState, startSimulation, resolveCrisis, getBlackBoxReport,
    exportBlueprintCode, importBlueprintCode,
    // Additions (do not change the contract above):
    setMode, resetSimulation, previewChange, evaluateBuild, validateBlueprintCode,
    CATEGORIES, MAX_INSTRUMENTS, WARNING_SURVIVAL_FACTOR, POWER_DEFICIT_FACTOR,
    TRAVEL_MONTHS, TRANSFER,
    get state() { return getState(); },
    get simulation() { return renderSimulation(); }
  };
})(typeof window !== 'undefined' ? window : globalThis);
