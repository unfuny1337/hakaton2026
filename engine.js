/* PAYLOAD ZERO — load nasa_data.js before this classic browser script. */
(function (global) {
  'use strict';

  const data = typeof NASA_DATA !== 'undefined' ? NASA_DATA : global.NASA_DATA;
  if (!data) throw new Error('PAYLOAD ZERO: спочатку підключіть nasa_data.js.');

  const CATEGORIES = Object.freeze([
    'chassis', 'power', 'battery', 'comms', 'computer', 'propulsion', 'thermal'
  ]);
  const LABELS = {
    chassis: 'корпус', power: 'генерація енергії', battery: 'батарея',
    comms: 'звʼязок', computer: 'бортовий компʼютер',
    propulsion: 'рушійна установка', thermal: 'терморегулювання'
  };
  const TRANSFER = { Earth: 3.0, Moon: 7.5, Mars: 16.0 };
  const TRAVEL_MONTHS = { Earth: 18, Moon: 24, Mars: 36 };
  const TARGET_NAMES = { Earth: 'Землі', Moon: 'Місяця', Mars: 'Марса' };
  const MAX_INSTRUMENTS = 4;
  const WARNING_SURVIVAL_FACTOR = 0.95;
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
  const format = (value) => String(Math.round(value * 100) / 100);
  const emptyBus = () => Object.fromEntries(CATEGORIES.map((category) => [category, null]));
  const emptyBuild = () => ({ rocketId: null, orbitId: null, bus: emptyBus(), instrumentIds: [] });
  const emptySimulation = () => ({
    phases: [], crisis: null, resolved: false, optionIndex: null,
    survivalChance: null, survivalRoll: null, report: null
  });

  let mission = null;
  let mode = 'solo';
  let build = emptyBuild();
  let simulation = emptySimulation();

  function requireMission() {
    if (!mission) throw new Error('Спочатку оберіть місію через Engine.initMission().');
  }

  function lookup(map, id, label, nullable = false) {
    if (nullable && id === null) return null;
    if (typeof id !== 'string' || !map.has(id)) {
      throw new RangeError(`Невідомий ID (${label}): ${String(id)}.`);
    }
    return map.get(id);
  }

  function validateMode(value) {
    // UI may introduce additional modes; preserve any nonempty string.
    if (typeof value !== 'string' || !value.trim() || value.length > 64) {
      throw new TypeError('Режим має бути непорожнім рядком довжиною до 64 символів.');
    }
    return value;
  }

  function selectedObjects() {
    return {
      rocket: rockets.get(build.rocketId) || null,
      orbit: orbits.get(build.orbitId) || null,
      bus: Object.fromEntries(CATEGORIES.map((category) => [
        category, parts.get(build.bus[category]) || null
      ])),
      instruments: build.instrumentIds.map((id) => instruments.get(id))
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
    const batteryRequired = Math.round(usedPower * (orbit ? orbit.eclipseRatio : 0.35) * 3.5);
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
    const effectivePoints = Math.round(rawPoints * bottleneckRatio * (isPowerDeficit ? 0.6 : 1));
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

  function checkCompatibility(telemetry = calculateTelemetry(), selected = selectedObjects()) {
    const errors = [];
    const warnings = [];
    if (!mission) errors.push('Не обрано місію.');
    if (!selected.rocket) errors.push('Не обрано ракету-носій.');
    if (!selected.orbit) errors.push('Не обрано орбіту.');
    CATEGORIES.forEach((category) => {
      if (!selected.bus[category]) errors.push(`Не встановлено підсистему: ${LABELS[category]}.`);
    });
    if (!selected.instruments.length) errors.push('Не обрано жодного наукового приладу.');
    if (mission && selected.orbit && selected.orbit.id !== mission.requiredOrbitId) {
      errors.push(`Місія потребує орбіти ${orbits.get(mission.requiredOrbitId).name}.`);
    }
    if (telemetry.budget.isOver) {
      errors.push(`Перевищено бюджет на ${format(telemetry.budget.used - telemetry.budget.max)} млн доларів.`);
    }
    if (telemetry.mass.isOver) {
      errors.push(`Стартова маса ${format(telemetry.mass.wetMassWithStage)} кг перевищує доступну вантажопідйомність ${format(telemetry.mass.maxAllowed)} кг.`);
    }
    if (telemetry.power.isPowerDeficit) {
      warnings.push(`Бракує ${format(-telemetry.power.netBalance)} Вт генерації енергії.`);
    }
    if (telemetry.power.isBatteryDeficit) {
      warnings.push(`Для тіньової ділянки бракує ${format(telemetry.power.batteryRequired - telemetry.power.batteryCapacity)} Вт·год батареї.`);
    }
    if (telemetry.dataAndComms.isBottlenecked) {
      warnings.push(`Канал звʼязку втрачає ${format(telemetry.dataAndComms.generatedPerDay - telemetry.dataAndComms.maxTransmittedPerDay)} Гб даних за добу.`);
    }
    if (telemetry.time.isOver) {
      warnings.push(`Термін підготовки й перельоту перевищено на ${format(telemetry.time.usedMonths - telemetry.time.maxMonths)} міс.`);
    }
    if (mission) {
      selected.instruments.forEach((item) => {
        if (!item.compatibleTargets.includes(mission.targetBody)) {
          warnings.push(`Прилад ${item.name} не призначений для ${TARGET_NAMES[mission.targetBody]} й не дає наукових балів.`);
        }
      });
    }
    if (telemetry.radiation.isVulnerable) {
      warnings.push(`Радіаційна стійкість ${format(telemetry.radiation.spacecraftMinRad)} нижча за потрібні ${format(telemetry.radiation.requiredRad)}.`);
    }
    if (mission && !telemetry.science.isEnough) {
      warnings.push(`Не вистачає ${format(telemetry.science.targetMin - telemetry.science.effectivePoints)} балів науки.`);
    }
    return { canLaunch: errors.length === 0, errors, warnings };
  }

  function getAdvisorsFeedback(telemetry = calculateTelemetry(), selected = selectedObjects(),
    compatibility = checkCompatibility(telemetry, selected)) {
    const titles = [
      ['science', 'Головний науковець'], ['power', 'Інженер бортових систем'],
      ['ballistics', 'Балістик та ракетник'], ['director', 'Директор місії та звʼязку']
    ];
    const advisor = (i, status, message) => ({ id: titles[i][0], title: titles[i][1], status, message });
    if (!mission) return titles.map((_, i) => advisor(i, 'warn', 'Оберіть місію — тоді звіримо розрахунки перед стартом.'));
    const { science, power, mass, budget, time, radiation, dataAndComms: comms } = telemetry;
    const foreign = selected.instruments.filter((item) => !item.compatibleTargets.includes(mission.targetBody));
    const scienceMessage = selected.instruments.length
      ? `Маємо ${science.effectivePoints} із ${science.targetMin} потрібних балів; до втрат — ${science.rawPoints}. `
        + (foreign.length ? `${foreign.length} прилад(и) для іншої цілі не дають балів. ` : '')
        + (science.isEnough ? 'Науковий план закриваємо. Бережіть ці дані!' : `Потрібно ще ${format(science.targetMin - science.effectivePoints)} балів — перегляньмо прилади та передачу даних.`)
      : `Без приладів наука не полетить: ціль — ${science.targetMin} балів для ${TARGET_NAMES[mission.targetBody]}.`;
    const powerMessage = (power.isPowerDeficit
      ? `Біля ${TARGET_NAMES[mission.targetBody]} бракує ${format(-power.netBalance)} Вт: споживаємо ${format(power.used)}, генеруємо ${format(power.generated)}. Наука працюватиме з коефіцієнтом 0,6. `
      : `Енергетичний запас — ${format(power.netBalance)} Вт (${format(power.generated)} генерації, ${format(power.used)} споживання). `)
      + (power.isBatteryDeficit
        ? `У тіні потрібно ${power.batteryRequired} Вт·год, а є ${power.batteryCapacity}. Додайте ${format(power.batteryRequired - power.batteryCapacity)} Вт·год.`
        : `Батарея: ${power.batteryCapacity} Вт·год при потребі ${power.batteryRequired}.`)
      + (radiation.isVulnerable ? ` Захист ${radiation.spacecraftMinRad}/${radiation.requiredRad}: корпус і компʼютер під загрозою.` : '');
    const orbitWrong = !selected.orbit || selected.orbit.id !== mission.requiredOrbitId;
    const ballisticsMessage = !selected.rocket
      ? `Оберіть носій: суха маса ${format(mass.dryMass)} кг, із паливом і розгінним блоком — ${mass.wetMassWithStage} кг.`
      : `${selected.rocket.name}: стартова маса ${mass.wetMassWithStage} кг, ліміт ${mass.maxAllowed} кг. `
        + (mass.isOver ? `Зніміть щонайменше ${format(mass.wetMassWithStage - mass.maxAllowed)} кг стартової маси. `
          : `Залишається ${format(mass.maxAllowed - mass.wetMassWithStage)} кг запасу. `)
        + (orbitWrong ? 'Орбіта не відповідає плану місії.' : 'Орбіта відповідає плану.');
    const directorMessage = `Бюджет ${format(budget.used)}/${budget.max} млн доларів; термін ${format(time.usedMonths)}/${time.maxMonths} міс. `
      + (comms.isBottlenecked
        ? `Антена пропускає ${format(comms.maxTransmittedPerDay)} із ${format(comms.generatedPerDay)} Гб/добу: губимо ${format(comms.generatedPerDay - comms.maxTransmittedPerDay)} Гб щодня. `
        : `Передаємо всі ${format(comms.generatedPerDay)} Гб/добу. `)
      + (compatibility.canLaunch ? 'Старт дозволено; перевірте ризики.' : `До старту лишилося усунути блокери: ${compatibility.errors.length}.`);
    return [
      advisor(0, !selected.instruments.length ? 'error' : (!science.isEnough || foreign.length ? 'warn' : 'ok'), scienceMessage),
      advisor(1, CATEGORIES.some((category) => !selected.bus[category]) ? 'error'
        : (power.isPowerDeficit || power.isBatteryDeficit || radiation.isVulnerable ? 'warn' : 'ok'), powerMessage),
      advisor(2, !selected.rocket || mass.isOver || orbitWrong ? 'error' : 'ok', ballisticsMessage),
      advisor(3, budget.isOver ? 'error' : (time.isOver || comms.isBottlenecked || !compatibility.canLaunch ? 'warn' : 'ok'), directorMessage)
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

  function initMission(missionId, nextMode = 'solo') {
    const nextMission = lookup(missions, missionId, 'місія');
    validateMode(nextMode);
    return commitChange(() => {
      mission = nextMission;
      mode = nextMode;
      build = emptyBuild();
      build.orbitId = mission.requiredOrbitId;
    });
  }

  function selectRocket(rocketId) {
    requireMission();
    lookup(rockets, rocketId, 'ракета', true);
    return commitChange(() => { build.rocketId = rocketId; });
  }

  function selectOrbit(orbitId) {
    requireMission();
    lookup(orbits, orbitId, 'орбіта', true);
    return commitChange(() => { build.orbitId = orbitId; });
  }

  function selectBusPart(category, partId) {
    requireMission();
    if (!CATEGORIES.includes(category)) throw new RangeError(`Невідома категорія: ${String(category)}.`);
    const part = lookup(parts, partId, 'деталь', true);
    if (part && part.category !== category) throw new RangeError(`Деталь ${partId} не належить до категорії ${category}.`);
    return commitChange(() => { build.bus[category] = partId; });
  }

  function toggleInstrument(instId) {
    requireMission();
    lookup(instruments, instId, 'прилад');
    const position = build.instrumentIds.indexOf(instId);
    if (position === -1 && build.instrumentIds.length >= MAX_INSTRUMENTS) {
      throw new RangeError('Можна встановити щонайбільше 4 наукові прилади.');
    }
    return commitChange(() => {
      if (position === -1) build.instrumentIds.push(instId);
      else build.instrumentIds.splice(position, 1);
    });
  }

  // Version 1: PZ|1|mission|mode|rocket|orbit|7 bus slots|comma-separated instruments.
  function exportBlueprintCode() {
    requireMission();
    const fields = ['PZ', '1', mission.id, mode, build.rocketId || '', build.orbitId || '',
      ...CATEGORIES.map((category) => build.bus[category] || '')];
    return fields.map(encodeURIComponent).concat(
      build.instrumentIds.map(encodeURIComponent).join(',')
    ).join('|');
  }

  function importBlueprintCode(code) {
    if (typeof code !== 'string' || code.length > 4096) throw new TypeError('Некоректний код конфігурації.');
    const tokens = code.trim().split('|');
    if (tokens.length !== 14 || tokens[0] !== 'PZ' || tokens[1] !== '1') {
      throw new Error('Непідтримуваний формат конфігурації. Очікується PZ|1|…');
    }
    let fields;
    let ids;
    try {
      fields = tokens.slice(0, 13).map(decodeURIComponent);
      ids = tokens[13] ? tokens[13].split(',').map(decodeURIComponent) : [];
    } catch (_) {
      throw new Error('Код конфігурації містить пошкоджене кодування.');
    }
    // Validate everything before committing; a bad import never changes the live build.
    const nextMission = lookup(missions, fields[2], 'місія');
    const nextMode = validateMode(fields[3]);
    const nextBuild = emptyBuild();
    nextBuild.rocketId = fields[4] || null;
    nextBuild.orbitId = fields[5] || null;
    lookup(rockets, nextBuild.rocketId, 'ракета', true);
    lookup(orbits, nextBuild.orbitId, 'орбіта', true);
    CATEGORIES.forEach((category, i) => {
      const id = fields[6 + i] || null;
      const part = lookup(parts, id, 'деталь', true);
      if (part && part.category !== category) throw new RangeError(`Неправильна категорія деталі ${id}.`);
      nextBuild.bus[category] = id;
    });
    if (ids.length > MAX_INSTRUMENTS || new Set(ids).size !== ids.length) {
      throw new RangeError('Код має містити до 4 різних приладів.');
    }
    ids.forEach((id) => lookup(instruments, id, 'прилад'));
    nextBuild.instrumentIds = ids;
    return commitChange(() => { mission = nextMission; mode = nextMode; build = nextBuild; });
  }

  function phase(id, title, hasWarning, logs) {
    return { id, title, status: hasWarning ? 'WARNING' : 'SUCCESS', logs };
  }

  function startSimulation() {
    requireMission();
    if (simulation.crisis) return clone(simulation.crisis);
    const state = getState();
    if (!state.compatibility.canLaunch) {
      const error = new Error(`Старт заблоковано: ${state.compatibility.errors.join(' ')}`);
      error.compatibility = state.compatibility;
      throw error;
    }
    const events = data.crisisEvents.filter((event) => event.targetBody === mission.targetBody);
    if (!events.length) throw new Error(`Для цілі ${mission.targetBody} немає кризових подій.`);
    const event = clone(events.length === 1 ? events[0] : events[Math.floor(Math.random() * events.length)]);
    const t = state.telemetry;
    event.options = event.options.map((option) => ({
      ...option, isAvailable: t.radiation.spacecraftMinRad >= number(option.requiredRadResistance)
    }));
    const phases = [
      phase(1, 'Launch & Orbit Insertion', false, [
        `Носій: ${state.selectedObjects.rocket.name}. Орбіта: ${state.selectedObjects.orbit.name}.`,
        `Суха маса: ${format(t.mass.dryMass)} кг; стартова: ${t.mass.wetMassWithStage}/${t.mass.maxAllowed} кг.`,
        `Надійність носія ${format(state.selectedObjects.rocket.reliability * 100)}% врахуємо у фінальній перевірці виживання.`
      ]),
      phase(2, 'Bus & Power Deployment', t.power.isPowerDeficit || t.power.isBatteryDeficit || t.radiation.isVulnerable, [
        `Панелі: ${t.power.generated} Вт; навантаження: ${format(t.power.used)} Вт; баланс: ${format(t.power.netBalance)} Вт.`,
        `Батарея: ${t.power.batteryCapacity}/${t.power.batteryRequired} Вт·год для тіньової ділянки.`,
        `Радіаційна стійкість: мінімум ${t.radiation.spacecraftMinRad}, середня ${format(t.radiation.spacecraftAvgRad)}, потрібно ${t.radiation.requiredRad}.`
      ]),
      phase(3, 'Science Calibration', !t.science.isEnough || t.dataAndComms.isBottlenecked
        || state.selectedObjects.instruments.some((item) => !item.compatibleTargets.includes(mission.targetBody)), [
        `Працює приладів: ${state.selectedObjects.instruments.length}. Наука: ${t.science.rawPoints} сирих, ${t.science.effectivePoints} ефективних балів.`,
        `Потік: ${format(t.dataAndComms.generatedPerDay)} Гб/добу; канал: ${format(t.dataAndComms.maxTransmittedPerDay)} Гб/добу.`,
        `Термін: ${t.time.usedMonths}/${t.time.maxMonths} міс.; бюджет: ${format(t.budget.used)}/${t.budget.max} млн доларів.`
      ])
    ];
    simulation = { ...emptySimulation(), phases, crisis: event };
    return clone(event);
  }

  function usedNasaSources(selected) {
    const entities = [mission, selected.rocket, selected.orbit,
      ...Object.values(selected.bus), ...selected.instruments, simulation.crisis];
    const seen = new Set();
    return entities.filter((item) => item && item.nasaSourceUrl).reduce((sources, item) => {
      const name = item.name || item.title || item.id;
      const key = `${name}|${item.nasaSourceUrl}`;
      if (!seen.has(key)) {
        seen.add(key);
        sources.push({ name, url: item.nasaSourceUrl, verifiedSpecs: clone(item.verifiedSpecs || {}),
          nasaInfo: item.nasaInfo || item.description || item.gameplayNotes
            || 'Документовані відомості наведено у verifiedSpecs; числові ігрові параметри є навчальними припущеннями.' });
      }
      return sources;
    }, []);
  }

  function resolveCrisis(optionIndex) {
    if (!simulation.crisis) throw new Error('Спочатку запустіть Engine.startSimulation().');
    if (simulation.resolved) {
      if (optionIndex === simulation.optionIndex) return getBlackBoxReport();
      throw new Error('Кризу вже розвʼязано. Змініть збірку або ініціалізуйте місію для нового польоту.');
    }
    if (!Number.isInteger(optionIndex) || optionIndex < 0 || optionIndex >= simulation.crisis.options.length) {
      throw new RangeError('Некоректний індекс варіанта кризи.');
    }
    const option = simulation.crisis.options[optionIndex];
    if (!option.isAvailable) throw new Error('Радіаційної стійкості недостатньо для цього варіанта.');
    const { telemetry: t, selectedObjects: selected, compatibility } = getState();
    // Gameplay policy: each warning multiplies survival probability by 0.95.
    const survivalChance = clamp(number(option.survivalChance) * number(selected.rocket.reliability)
      * Math.pow(WARNING_SURVIVAL_FACTOR, compatibility.warnings.length), 0, 1);
    const survivalRoll = Math.random();
    const survivalRollPassed = survivalRoll < survivalChance;
    const finalScience = survivalRollPassed
      ? Math.max(0, Math.round(t.science.effectivePoints * number(option.scienceMultiplier))) : 0;
    const status = !survivalRollPassed ? 'FAILED'
      : (finalScience >= t.science.targetMin ? 'SUCCESS' : 'PARTIAL');
    // Science earns up to 87.5 points with a 25% overachievement bonus;
    // unspent budget and schedule reserve each earn up to 15 points.
    const scienceRatio = t.science.targetMin > 0 ? clamp(finalScience / t.science.targetMin, 0, 1.25) : 1;
    const budgetReserve = t.budget.max > 0 ? clamp(1 - t.budget.used / t.budget.max, 0, 1) : 0;
    const timeReserve = t.time.maxMonths > 0 ? clamp(1 - t.time.usedMonths / t.time.maxMonths, 0, 1) : 0;
    const score = Math.round(70 * scienceRatio + 15 * budgetReserve + 15 * timeReserve);
    const finalScore = status === 'FAILED' ? 0 : clamp(score, 0, status === 'PARTIAL' ? 79 : 100);
    const rank = status === 'FAILED' ? 'F'
      : (finalScore >= 90 ? 'S' : finalScore >= 80 ? 'A' : finalScore >= 65 ? 'B' : 'C');
    const insights = [
      `Кризове рішення: ${option.text}. Коефіцієнт науки: ${format(option.scienceMultiplier)}.`,
      `Шанс виживання: ${format(survivalChance * 100)}% = шанс рішення × надійність носія × 0,95^${compatibility.warnings.length}.`,
      survivalRollPassed ? `Сигнал отримано: ${finalScience}/${t.science.targetMin} балів науки.`
        : 'Апарат втрачено: фінальне передавання даних не відбулося.',
      ...compatibility.warnings,
      'Маса перельоту, шанси, ціни та бали — ігрові припущення NASA_DATA; підтверджені характеристики відокремлено у verifiedSpecs.'
    ];
    const report = { status, finalScore, rank, finalScience, survivalRollPassed, insights,
      usedNasaSources: usedNasaSources(selected), blueprintCode: exportBlueprintCode() };
    const downlink = phase(4, 'Deep Space Telemetry Downlink', status === 'PARTIAL', [
      `Рішення: ${option.text}. Шанс виживання: ${format(survivalChance * 100)}%.`,
      survivalRollPassed ? `Науковий пакет прийнято: ${finalScience} балів. Звіт: ${status}, ${finalScore}/100, ранг ${rank}.`
        : 'Несучої немає. Апарат втрачено; результат FAILED, 0/100, ранг F.'
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

  function getBlackBoxReport() {
    return simulation.report ? clone(simulation.report) : null;
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
    get state() { return getState(); },
    get simulation() { return clone(simulation); }
  };
})(window);
