(() => {
'use strict';
const E = window.Engine;
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const nm = o => (o && (o.name || o.title || o.id)) || '';
const idOf = x => (x && typeof x === 'object') ? x.id : x;
const CATS = ['chassis', 'power', 'battery', 'comms', 'computer', 'propulsion', 'thermal'];
const REQUIRED = ['chassis', 'power', 'comms', 'computer', 'propulsion'];
const hasSpecs = v => v && (typeof v !== 'object' || Object.keys(v).length > 0);
const SKIP = new Set(['requiredOrbitId', 'gameplayNotes', 'targetBody', 'id', 'name', 'title', 'description', 'verifiedSpecs', 'nasaSourceUrl', 'nasaInfo', 'compatibleTargets', 'category', 'type', 'icon']);
let mode = 'solo', tab = 'launch', catalog = null, state = null, onlyCompat = false, simRunning = false;

/* ---------- helpers ---------- */
function toast(msg, ok) {
  const t = $('#toast'); t.textContent = msg; t.className = 'toast' + (ok ? ' ok' : ''); t.hidden = false;
  clearTimeout(toast.t); toast.t = setTimeout(() => t.hidden = true, 3500);
}
function go(n) {
  $$('.screen').forEach(s => s.classList.toggle('active', s.id === 's' + n));
  $('#homeBtn').hidden = n === 1; window.scrollTo(0, 0);
}
const chips = o => '<div class="chips">' + Object.entries(o).filter(([k, v]) => !SKIP.has(k) && v !== null && typeof v !== 'object')
  .map(([k, v]) => `<span>${esc(k)} <b>${esc(v)}</b></span>`).join('') + '</div>';
function specsText(v) {
  if (!v) return '';
  if (typeof v === 'string') return esc(v);
  if (Array.isArray(v)) return v.map(specsText).join('; ');
  return Object.entries(v).map(([k, x]) => `${esc(k)}: <b>${esc(typeof x === 'object' ? JSON.stringify(x) : x)}</b>`).join(' · ');
}
const verified = o => hasSpecs(o.verifiedSpecs) ? `<span class="nv" title="${esc(typeof o.verifiedSpecs === 'string' ? o.verifiedSpecs : JSON.stringify(o.verifiedSpecs))}">NASA VERIFIED SPECS</span>` : '';
const srcLink = o => o.nasaSourceUrl ? `<a href="${esc(o.nasaSourceUrl)}" target="_blank" rel="noopener" title="NASA source" aria-label="NASA source">↗</a>` : '';
function busList(c) {
  const b = catalog.busComponents;
  if (Array.isArray(b)) return b.filter(x => (x.category || x.type) === c);
  return (b && b[c]) || [];
}
const findById = (list, id) => (list || []).find(x => x.id === id);

/* ---------- state accessors (tolerant to shape) ---------- */
function selection() {
  const s = state.selectedObjects || {}, b = state.build || {};
  const bus = s.bus || s.busParts || s.busComponents || b.bus || {};
  const g = c => idOf(bus[c] ?? s[c] ?? b[c]);
  const rocket = idOf(s.rocket ?? s.launchVehicle ?? b.rocket ?? b.rocketId ?? b.launchVehicle);
  const orbit = idOf(s.orbit ?? b.orbit ?? b.orbitId);
  const inst = (s.instruments || b.instruments || []).map(idOf);
  return { rocket, orbit, inst, part: g };
}

/* ---------- SCREEN 1 ---------- */
const missionStats = m => [['Target', m.targetBody], ['Budget', '$' + m.maxBudget + 'M'], ['Time limit', m.maxTimeMonths + ' months'],
  ['Radiation level', m.radiationLevel], ['Solar efficiency', Math.round(m.solarEfficiency * 100) + '%'], ['Min science', m.minScienceScore]]
  .map(([k, v]) => `<div class="stat">${k}<b>${esc(v)}</b></div>`).join('');
function renderMissions() {
  $('#missionCards').innerHTML = E.getMissions().map(m => `
    <button class="mcard" data-id="${esc(m.id)}">
      <h3>${esc(nm(m))}</h3>
      <p>${esc(m.description || m.objective || '')}</p>
      ${missionStats(m)}
      ${hasSpecs(m.verifiedSpecs) ? `<div class="vs">${verified(m)}<br>${specsText(m.verifiedSpecs)}</div>` : ''}
      ${m.nasaSourceUrl ? `<a href="${esc(m.nasaSourceUrl)}" target="_blank" rel="noopener" onclick="event.stopPropagation()">NASA source ↗</a>` : ''}
      <div class="go">▶ Start building</div>
    </button>`).join('');
  $$('.mcard').forEach(c => c.onclick = () => startMission(c.dataset.id));
}
function startMission(id) {
  try { state = E.initMission(id, mode); tab = 'launch'; go(2); refresh(); }
  catch (e) { toast('Cannot start mission: ' + e.message); }
}

/* ---------- SCREEN 2: catalog ---------- */
function item(o, selected, extra = '') {
  return `<button class="item ${selected ? 'sel' : ''}" data-id="${esc(o.id)}" aria-pressed="${!!selected}">
    <div class="nmr"><span>${verified(o)}${esc(nm(o))}</span>${srcLink(o)}</div>
    ${(o.description || o.nasaInfo) ? `<div class="chips">${esc(o.description || o.nasaInfo)}</div>` : ''}${chips(o)}${o.gameplayNotes ? `<div class="compat no">${esc(o.gameplayNotes)}</div>` : ''}${extra}</button>`;
}
function missionTargets() {
  const m = state.mission || {};
  return [m.targetBody, m.target].filter(Boolean).map(x => String(x).toLowerCase());
}
function compatOf(i) {
  const t = i.compatibleTargets; if (!t || !t.length) return null;
  const mt = missionTargets();
  return t.some(x => { x = String(x).toLowerCase(); return x === 'all' || mt.some(y => y.includes(x) || x.includes(y)); });
}
function renderCatalog() {
  const s = selection(), body = $('#catalogBody');
  if (tab === 'launch') {
    body.innerHTML = '<div class="grp">Launch vehicles</div>' + catalog.launchVehicles.map(r => item(r, r.id === s.rocket)).join('')
      + '<div class="grp">Orbits</div>' + catalog.orbits.map(o => item(o, o.id === s.orbit, o.id === (state.mission || {}).requiredOrbitId ? '<div class="compat ok">✔ required orbit for this mission</div>' : '')).join('');
    $$('.item', body).forEach((b, i) => b.onclick = () => {
      const nl = catalog.launchVehicles.length;
      state = i < nl ? E.selectRocket(b.dataset.id) : E.selectOrbit(b.dataset.id); refresh();
    });
  } else if (tab === 'bus') {
    body.innerHTML = CATS.map(c => `<div class="grp">${c}</div>` + busList(c).map(p => item(p, p.id === s.part(c)).replace('<button', `<button data-cat="${c}"`)).join('')).join('');
    $$('.item', body).forEach(b => b.onclick = () => { state = E.selectBusPart(b.dataset.cat, b.dataset.id); refresh(); });
  } else {
    body.innerHTML = `<label class="filt"><input type="checkbox" id="fc" ${onlyCompat ? 'checked' : ''}> Only compatible with this target</label>`
      + catalog.instruments.filter(i => !onlyCompat || compatOf(i) !== false).map(i => {
        const c = compatOf(i);
        const tag = c === null ? '' : c ? '<div class="compat ok">✔ compatible with target</div>' : '<div class="compat no">⚠ not designed for this target</div>';
        return item(i, s.inst.includes(i.id), tag).replace('class="item', 'class="item' + (c === false ? ' bad' : '')) + '';
      }).join('') + `<div class="chips">${s.inst.length}/4 selected</div>`;
    $('#fc').onchange = e => { onlyCompat = e.target.checked; renderCatalog(); };
    $$('.item', body).forEach(b => b.onclick = () => { state = E.toggleInstrument(b.dataset.id); refresh(); });
  }
}

/* ---------- SCREEN 2: blueprint ---------- */
function renderBlueprint() {
  const s = selection(), cut = t => t.length > 17 ? t.slice(0, 16) + '…' : t;
  const set = (k, text) => {
    const g = $(`#bp .node[data-k="${k}"]`), l = $(`#bp [data-l="${k}"]`);
    g.classList.toggle('on', !!text); l.textContent = text ? cut(text) : '';
  };
  CATS.forEach(c => { const id = s.part(c); set(c, id ? nm(findById(busList(c), id)) || id : ''); });
  for (let i = 0; i < 4; i++) { const id = s.inst[i]; set('inst' + i, id ? nm(findById(catalog.instruments, id)) || id : ''); }
  const r = findById(catalog.launchVehicles, s.rocket), o = findById(catalog.orbits, s.orbit);
  $('#lbMeta').textContent = `LV: ${r ? nm(r) : '—'}   ORBIT: ${o ? nm(o) : '—'}`;
  $('#missionTitle').textContent = 'Blueprint — ' + nm(state.mission || {});
}

/* ---------- SCREEN 2: advisors / telemetry ---------- */
function renderAdvisors() {
  $('#advisors').innerHTML = (state.advisors || []).map(a =>
    `<div class="adv ${esc(a.status)}"><b>${esc(a.title)}</b><p>${esc(a.message)}</p></div>`).join('');
}
function bar(label, pct, cls, main, sub) {
  pct = Math.max(0, Math.min(100, pct || 0));
  return `<div class="bar ${cls}"><div class="r"><span>${label}</span><span>${main}</span></div>
    <div class="tr"><div class="fl" style="width:${pct}%"></div></div><div class="sub">${sub}</div></div>`;
}
const f = (n, d = 0) => (typeof n === 'number' ? n.toLocaleString('en-US', { maximumFractionDigits: d }) : '—');
const lvl = (over, pct) => over ? 'err' : pct > 85 ? 'warn' : '';
function renderBars() {
  const t = state.telemetry; if (!t) return;
  const { budget: b, mass: m, power: p, dataAndComms: d, time: tm, science: sc } = t;
  const dp = d.maxTransmittedPerDay ? d.generatedPerDay / d.maxTransmittedPerDay * 100 : (d.generatedPerDay ? 100 : 0);
  const pp = p.used ? p.generated / p.used * 100 : (p.generated ? 100 : 0);
  $('#bars').innerHTML =
    bar('Budget', b.percent, lvl(b.isOver, b.percent), `${f(b.percent)}%`, `$${f(b.used, 1)}M / $${f(b.max, 1)}M`) +
    bar('Mass', m.percent, lvl(m.isOver, m.percent), `${f(m.percent)}%`, `Dry ${f(m.dryMass)} kg · Wet+stage ${f(m.wetMassWithStage)} kg · Max ${f(m.maxAllowed)} kg`) +
    bar('Power', 100 - Math.min(100, pp) < 0 ? 100 : pp, p.isPowerDeficit || p.isBatteryDeficit ? 'err' : pp > 85 ? 'warn' : '', `${f(p.netBalance, 1)} W net`,
      `Gen ${f(p.generated)} W / Use ${f(p.used)} W · Eclipse battery ${f(p.batteryCapacity)} Wh (need ${f(p.batteryRequired)} Wh)`) +
    bar('Data / Comms', dp, d.isBottlenecked ? 'err' : dp > 85 ? 'warn' : '', d.isBottlenecked ? 'BOTTLENECK' : 'OK',
      `Generated ${f(d.generatedPerDay, 1)} Gb/day vs link ${f(d.maxTransmittedPerDay, 1)} Gb/day`) +
    bar('Schedule', tm.percent, lvl(tm.isOver, tm.percent), `${f(tm.usedMonths, 1)} / ${f(tm.maxMonths)} mo`, `${f(tm.percent)}% of time limit`) +
    bar('Science', sc.percent, sc.isEnough ? 'good' : 'warn', `${f(sc.effectivePoints, 1)} / ${f(sc.targetMin, 1)}`, `Raw ${f(sc.rawPoints, 1)} → effective ${f(sc.effectivePoints, 1)}`);
}
function launchState() {
  const s = selection(), btn = $('#launchBtn'), c = state.compatibility || { errors: [], warnings: [] };
  const ready = s.rocket && s.orbit && REQUIRED.every(k => s.part(k)) && s.inst.length > 0;
  btn.disabled = !ready;
  const risky = ready && (!c.canLaunch || c.warnings.length || c.errors.length);
  btn.classList.toggle('risky', !!risky);
  btn.textContent = !ready ? 'FILL REQUIRED SLOTS' : risky ? 'LAUNCH — RISKY' : 'LAUNCH MISSION';
}
function renderDiag() {
  const c = state.compatibility || { errors: [], warnings: [] };
  $('#diag').innerHTML = c.errors.map(e => `<div class="dg e">✖ ${esc(e)}</div>`).join('')
    + c.warnings.map(w => `<div class="dg w">⚠ ${esc(w)}</div>`).join('')
    + (!c.errors.length && !c.warnings.length ? '<div class="dg g">All systems nominal</div>' : '');
}
function refresh() {
  state = E.getState(); renderCatalog(); renderBlueprint(); renderAdvisors(); renderBars(); renderDiag(); launchState();
}

/* ---------- SCREEN 3 ---------- */
const phaseName = p => typeof p === 'string' ? p : [nm(p), p.description].filter(Boolean).join(' — ');
async function launch() {
  const c = state.compatibility;
  if ((!c.canLaunch || c.errors.length) && !confirm('Pre-flight diagnostics report errors. Launch anyway?')) return;
  if (simRunning) return; simRunning = true;
  go(3);
  const log = $('#termLog'), track = $('#phaseTrack'); log.textContent = '';
  const say = t => { log.textContent += t + '\n'; log.scrollTop = log.scrollHeight; };
  let sim; try { sim = E.startSimulation(); } catch (e) { simRunning = false; toast(e.message); go(2); return; }
  const phases = sim.phases || [];
  track.innerHTML = phases.map(p => `<span>${esc(typeof p === 'string' ? p : nm(p))}</span>`).join('');
  say('> T-00:00:10  PAYLOAD ZERO flight computer online');
  for (let i = 0; i < phases.length; i++) {
    const spans = $$('span', track); spans[i].className = 'now';
    const p = phases[i]; say(`\n[PHASE ${i + 1}/${phases.length}] ${phaseName(p)}`);
    const extra = typeof p === 'object' ? (p.log || p.telemetry || p.result) : null;
    for (const l of [].concat(extra || [])) { await sleep(450); say('  ' + (typeof l === 'object' ? JSON.stringify(l) : l)); }
    await sleep(900); say('  status: NOMINAL'); spans[i].className = 'done';
  }
  await sleep(600); say('\n!! ANOMALY DETECTED — awaiting flight director decision');
  showCrisis(sim.crisisEvent);
}
function showCrisis(ev) {
  const rad = state.telemetry.radiation || {};
  $('#crTitle').textContent = ev.title || ev.name || 'Anomaly';
  $('#crDesc').textContent = ev.description || ev.text || '';
  const a = $('#crSrc'); a.hidden = !ev.nasaSourceUrl;
  if (ev.nasaSourceUrl) { a.href = ev.nasaSourceUrl; a.textContent = 'Real NASA incident source ↗'; }
  $('#crOpts').innerHTML = (ev.options || []).map((o, i) => {
    const bad = o.isAvailable === false;
    return `<button class="opt" data-i="${i}" ${bad ? 'disabled' : ''}>${esc(o.text)}
      <span class="chips"><span>survival <b>${f((o.survivalChance ?? 0) * (o.survivalChance <= 1 ? 100 : 1))}%</b></span><span>science ×<b>${esc(o.scienceMultiplier)}</b></span><span>rad req <b>${esc(o.requiredRadResistance)}</b></span></span>
      ${bad ? `<span class="why">Locked: requires radiation resistance ${esc(o.requiredRadResistance)}, spacecraft has ${esc(rad.spacecraftMinRad)}.</span>` : ''}</button>`;
  }).join('');
  $$('#crOpts .opt').forEach(b => b.onclick = () => {
    $('#crisis').hidden = true; simRunning = false;
    try { renderReport(E.resolveCrisis(+b.dataset.i)); go(4); } catch (e) { toast(e.message); }
  });
  $('#crisis').hidden = false; $('#crOpts .opt:not(:disabled)')?.focus();
}

/* ---------- SCREEN 4 ---------- */
function renderReport(r) {
  const col = { SUCCESS: 'var(--gn)', PARTIAL: 'var(--am)', FAILED: 'var(--rd)' }[r.status] || 'var(--cy)';
  $('#report').innerHTML = `
    <h2 class="h">Black Box Report</h2>
    <div class="badge ${esc(r.status)}">${esc(r.status)}</div>
    <div class="sc"><div><div class="big" style="color:${col}">${f(r.finalScore)}</div>/ 100 score</div>
      <div class="rank" style="border-color:${col};color:${col}">${esc(r.rank)}</div>
      <div>Final science: <b>${f(r.finalScience, 1)}</b><br>Survival roll: <b style="color:${r.survivalRollPassed ? 'var(--gn)' : 'var(--rd)'}">${r.survivalRollPassed ? 'PASSED' : 'FAILED'}</b></div></div>
    <div class="panel"><div class="ptitle">Інженерний розбір компромісів</div><ul class="ins">${(r.insights || []).map(i => `<li>${esc(i)}</li>`).join('')}</ul></div>
    <div class="panel" style="margin-top:14px"><div class="ptitle">Використані технології та відкриті дані NASA</div>
      <div class="cards3">${(r.usedNasaSources || []).map(s => `<div class="item" style="cursor:default"><div class="nmr"><span>${esc(s.name)}</span></div>
        ${hasSpecs(s.verifiedSpecs) ? `<div class="vs">${verified(s)}<br>${specsText(s.verifiedSpecs)}</div>` : ''}
        <p>${esc(s.nasaInfo)}</p>${s.url ? `<a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(String(s.url).replace(/^https?:\/\//, '').slice(0, 48))} ↗</a>` : ''}</div>`).join('')}</div></div>
    <div class="panel" style="margin-top:14px"><div class="ptitle">Blueprint code</div>
      <textarea id="bpCode" class="code" readonly>${esc(r.blueprintCode)}</textarea>
      <div class="row"><button id="copyBtn" class="btn">Copy Blueprint Code</button><button id="modBtn" class="btn ghost">Modify Spacecraft</button></div></div>`;
  $('#copyBtn').onclick = async () => {
    const t = $('#bpCode'); try { await navigator.clipboard.writeText(t.value); } catch { t.select(); document.execCommand('copy'); }
    toast('Blueprint code copied', true);
  };
  $('#modBtn').onclick = () => { go(2); refresh(); };
}

/* ---------- init ---------- */
function init() {
  catalog = E.getCatalog(); renderMissions();
  $$('#modeSeg button').forEach(b => b.onclick = () => {
    mode = b.dataset.mode; $$('#modeSeg button').forEach(x => x.classList.toggle('on', x === b));
  });
  $$('#tabs button').forEach(b => b.onclick = () => {
    tab = b.dataset.tab; $$('#tabs button').forEach(x => x.classList.toggle('on', x === b)); renderCatalog();
  });
  $('#importBtn').onclick = () => {
    const code = $('#importCode').value.trim(); if (!code) return toast('Paste a blueprint code first');
    try { E.importBlueprintCode(code); state = E.getState(); if (!state.mission) throw new Error('Code did not load a mission'); go(2); refresh(); toast('Blueprint imported', true); }
    catch (e) { toast('Import failed: ' + e.message); }
  };
  $('#homeBtn').onclick = () => { if (!simRunning) go(1); };
  $('#launchBtn').onclick = launch;
}
init();
})();
