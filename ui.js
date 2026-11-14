/* PAYLOAD ZERO — user interface. Classic script; uses window.Engine, window.I18N and PZ_PRESETS.
 * All visible text comes from I18N keys. Switching language only re-renders: it never calls
 * Engine mutators, never starts or resolves a flight and never touches Math.random().
 */
(() => {
  'use strict';
  const E = window.Engine;
  const I = window.I18N;
  const PRESETS = typeof PZ_PRESETS !== 'undefined' ? PZ_PRESETS : {};
  const t = (key, params) => I.t(key, params);
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
  const esc = (value) => String(value == null ? '' : value).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const num = (value, max = 2) => I.num(value, max);
  const pct = (fraction, max = 1) => I.pct(fraction, max);
  const clampPct = (value) => Math.max(0, Math.min(100, Number.isFinite(value) ? value : 0));
  const CATS = E.CATEGORIES;
  const MAX_INST = E.MAX_INSTRUMENTS;
  const DIFFICULTY = { m3: 'easy', m1: 'medium', m2: 'hard' };
  const ROLES = [
    { id: 'science', advisor: 'science' },
    { id: 'engineer', advisor: 'power' },
    { id: 'ballistics', advisor: 'ballistics' },
    { id: 'director', advisor: 'director' }
  ];
  const KEYS = { draft: 'pz.draft', team: 'pz.team', tutorial: 'pz.tutorialSeen' };
  const TUTORIAL_STEPS = 6;
  const catalog = E.getCatalog();
  const byId = (list) => new Map(list.map((item) => [item.id, item]));
  const LV = byId(catalog.launchVehicles);
  const ORBITS = byId(catalog.orbits);
  const PARTS = byId(catalog.busComponents);
  const INST = byId(catalog.instruments);
  const MISSIONS = byId(E.getMissions());
  const reduceMotion = () => !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

  /* ---------- safe storage ---------- */
  const store = {
    get(key) { try { return window.localStorage ? window.localStorage.getItem(key) : null; } catch (_) { return null; } },
    set(key, value) {
      try { if (!window.localStorage) return false; window.localStorage.setItem(key, value); return true; } catch (_) { return false; }
    },
    remove(key) { try { if (window.localStorage) window.localStorage.removeItem(key); } catch (_) { /* ignore */ } },
    ok() {
      try { const k = 'pz.__probe'; window.localStorage.setItem(k, '1'); window.localStorage.removeItem(k); return true; } catch (_) { return false; }
    }
  };

  /* ---------- app state (presentation only) ---------- */
  const app = {
    screen: 1,
    tab: 'launch',
    onlyCompat: false,
    mode: 'solo',
    state: E.getState(),
    flight: null,
    preview: null,
    crisis: { selected: null, busy: false },
    draft: { pending: null, error: null, storageOk: true, warned: false },
    team: { size: 2, names: ['', '', '', ''], approvals: [], signature: null },
    dialog: null
  };
  let flightSeq = 0;

  /* ---------- small helpers ---------- */
  const nameOf = (kind, id) => (id ? t(`data.${kind}.${id}.name`) : t('common.none'));
  const descOf = (kind, id) => t(`data.${kind}.${id}.desc`);
  const hasMission = () => !!(app.state && app.state.mission);
  const mission = () => (app.state && app.state.mission) || null;
  const currentMode = () => {
    const m = hasMission() ? app.state.mode : app.mode;
    return m === 'team' ? 'team' : 'solo';
  };
  const money = (n) => t('fmt.money', { n });
  const kg = (n) => t('fmt.kg', { n });
  const watts = (n) => t('fmt.w', { n });
  const wh = (n) => t('fmt.wh', { n });
  const gbday = (n) => t('fmt.gbday', { n });
  const months = (n) => t('fmt.mo', { n });
  const buildSignature = (state) => JSON.stringify({ m: state.mission && state.mission.id, b: state.build });
  const hasWork = () => {
    if (!hasMission()) return false;
    const b = app.state.build;
    return !!(b.rocketId || CATS.some((c) => b.bus[c]) || b.instrumentIds.length);
  };
  const abbr = (inst) => {
    const match = /\(([^)]+)\)\s*$/.exec(inst.name || '');
    return match ? match[1] : inst.id;
  };
  /** Shortens a label at a word boundary so abbreviations like "LRO" are never cut in half. */
  const cut = (text, max) => {
    if (text.length <= max) return text;
    const slice = text.slice(0, max - 1);
    const space = slice.lastIndexOf(' ');
    return `${(space > max * 0.4 ? slice.slice(0, space) : slice).replace(/[\s,(·—-]+$/, '')}…`;
  };

  function toast(message, ok = false) {
    const el = $('#toast');
    el.textContent = message;
    el.className = `toast${ok ? ' ok' : ''}`;
    el.hidden = false;
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => { el.hidden = true; }, 4200);
  }

  /** Runs a user action; every failure becomes a readable, localized message instead of a console error. */
  function act(fn) {
    try {
      const result = fn();
      if (result && typeof result.then === 'function') {
        result.catch((error) => toast(t('msg.actionFail', { reason: errorText(error) })));
      }
    } catch (error) {
      toast(t('msg.actionFail', { reason: errorText(error) }));
    }
  }
  function errorText(error) {
    if (error && error.i18nKey) return t(error.i18nKey, error.i18nParams);
    return (error && error.message) || String(error);
  }

  function focusKey() {
    const el = document.activeElement;
    return el && el.dataset ? el.dataset.fk || null : null;
  }
  function restoreFocus(key) {
    if (!key) return;
    const el = $(`[data-fk="${(window.CSS && CSS.escape) ? CSS.escape(key) : key}"]`);
    if (el && !el.disabled && !el.closest('[hidden]')) el.focus({ preventScroll: true });
  }

  /* ---------- static text ---------- */
  function applyStatic() {
    document.documentElement.lang = I.getLang();
    document.title = t('app.docTitle');
    const meta = $('meta[name="description"]');
    if (meta) meta.setAttribute('content', t('app.metaDesc'));
    $$('[data-i18n]').forEach((el) => { el.textContent = t(el.dataset.i18n); });
    $$('[data-i18n-attr]').forEach((el) => {
      el.dataset.i18nAttr.split(';').forEach((pair) => {
        const [attr, key] = pair.split(':');
        if (attr && key) el.setAttribute(attr.trim(), t(key.trim()));
      });
    });
    $$('[data-lang]').forEach((btn) => {
      const on = btn.dataset.lang === I.getLang();
      btn.classList.toggle('on', on);
      btn.setAttribute('aria-pressed', String(on));
    });
  }

  function renderHeader() {
    const locked = !!app.flight;
    $$('#modeSeg button').forEach((btn) => {
      const on = btn.dataset.mode === currentMode();
      btn.classList.toggle('on', on);
      btn.setAttribute('aria-pressed', String(on));
      btn.disabled = locked;
      if (locked) btn.title = t('hdr.lockedFlight'); else btn.removeAttribute('title');
    });
    const home = $('#homeBtn');
    home.hidden = app.screen === 1;
    home.disabled = locked;
    if (locked) home.title = t('hdr.lockedFlight'); else home.removeAttribute('title');
  }

  function syncHeaderHeight() {
    const top = $('#top');
    const sticky = getComputedStyle(top).position === 'sticky';
    document.documentElement.style.setProperty('--hdr', `${sticky ? Math.ceil(top.getBoundingClientRect().height) : 0}px`);
  }

  function go(screen, { focus = true } = {}) {
    if (screen !== app.screen && screen >= 3) $('#toast').hidden = true; // builder messages are stale in flight
    app.screen = screen;
    $$('.screen').forEach((s) => s.classList.toggle('active', s.id === `s${screen}`));
    document.body.classList.toggle('builder-on', screen === 2);
    renderHeader();
    window.scrollTo(0, 0);
    if (focus) {
      const heading = { 1: '#s1Title', 2: '#missionTitle', 3: '#s3Title', 4: '#repTitle' }[screen];
      const el = heading && $(heading);
      if (el) { el.setAttribute('tabindex', '-1'); el.focus({ preventScroll: true }); }
    }
  }

  /* ---------- modal stack with focus trap ---------- */
  const modals = [];
  const quietWaiters = [];
  /** Resolves once no dialog is open; the flight runner pauses on it so no dialog is ever covered. */
  function whenNoModals() {
    return modals.length ? new Promise((resolve) => quietWaiters.push(resolve)) : Promise.resolve();
  }
  const FOCUSABLE = 'a[href],button:not([disabled]),textarea:not([disabled]),input:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])';
  function focusables(root) { return $$(FOCUSABLE, root).filter((el) => !el.closest('[hidden]') && el.offsetParent !== null); }
  function setInert(on) {
    ['#top', '#main', '.skip'].forEach((sel) => {
      const el = $(sel);
      if (!el) return;
      if (on) el.setAttribute('inert', ''); else el.removeAttribute('inert');
      if (on) el.setAttribute('aria-hidden', 'true'); else el.removeAttribute('aria-hidden');
    });
  }
  function openModal(el, { initialFocus = null, onEscape = null } = {}) {
    const existing = modals.find((m) => m.el === el);
    if (existing) { existing.onEscape = onEscape; return; }
    modals.push({ el, onEscape, lastFocus: document.activeElement });
    el.hidden = false;
    el.style.zIndex = String(30 + modals.length);
    setInert(true);
    const target = initialFocus || focusables(el)[0];
    if (target) target.focus();
  }
  function closeModal(el) {
    const i = modals.findIndex((m) => m.el === el);
    el.hidden = true;
    if (i < 0) return;
    const [entry] = modals.splice(i, 1);
    if (!modals.length) setInert(false);
    if (!modals.length) quietWaiters.splice(0).forEach((resolve) => resolve());
    const back = entry.lastFocus;
    if (back && document.contains(back) && !back.closest('[hidden]') && !back.disabled) back.focus({ preventScroll: true });
    else if (modals.length) { const f = focusables(modals[modals.length - 1].el)[0]; if (f) f.focus(); }
  }
  document.addEventListener('keydown', (event) => {
    const top = modals[modals.length - 1];
    if (!top) return;
    if (event.key === 'Escape') {
      if (top.onEscape) { event.preventDefault(); act(top.onEscape); }
      return;
    }
    if (event.key !== 'Tab') return;
    const items = focusables(top.el);
    if (!items.length) { event.preventDefault(); return; }
    const first = items[0];
    const last = items[items.length - 1];
    if (event.shiftKey && (document.activeElement === first || !top.el.contains(document.activeElement))) {
      event.preventDefault(); last.focus();
    } else if (!event.shiftKey && (document.activeElement === last || !top.el.contains(document.activeElement))) {
      event.preventDefault(); first.focus();
    }
  });
  document.addEventListener('focusin', (event) => {
    const top = modals[modals.length - 1];
    if (top && !top.el.contains(event.target)) {
      const f = focusables(top.el)[0];
      if (f) f.focus();
    }
  });

  /** Dialog with one or more actions plus Cancel; resolves with the action id or null.
      The renderer runs again when the language changes. */
  function choiceDialog(render) {
    if (app.dialog && app.dialog.done) app.dialog.done(null);
    return new Promise((resolve) => {
      const dialog = {
        kind: 'choice',
        render() {
          const c = render();
          $('#dlgTitle').textContent = c.title;
          $('#dlgBody').innerHTML = c.body;
          $('#dlgActions').innerHTML = c.actions.map((a) => `<button type="button" class="btn ${a.cls || ''}" data-dlg="${esc(a.id)}" data-fk="dlg:${esc(a.id)}">${esc(a.label)}</button>`).join('')
            + `<button type="button" class="btn ghost" data-dlg="cancel" data-fk="dlg:cancel">${esc(c.cancel || t('common.cancel'))}</button>`;
        },
        done(value) {
          if (app.dialog !== dialog) return;
          app.dialog = null;
          closeModal($('#dlg'));
          resolve(value == null || value === false || value === 'cancel' ? null : value);
        }
      };
      app.dialog = dialog;
      dialog.render();
      openModal($('#dlg'), { initialFocus: $('[data-dlg="cancel"]'), onEscape: () => dialog.done(null) });
    });
  }
  function confirmDialog(render) {
    return choiceDialog(() => {
      const c = render();
      return { title: c.title, body: c.body, cancel: c.cancel, actions: [{ id: 'ok', label: c.ok, cls: c.okClass }] };
    }).then((id) => id === 'ok');
  }

  /* ---------- screen 1: briefing ---------- */
  function specValue(id, key, value) {
    const special = `specval.${id}.${key}`;
    if (I.has(special)) return t(special);
    if (typeof value === 'number') return num(value);
    if (Array.isArray(value)) {
      if (value.every(Array.isArray)) return value.map((v) => specValue(id, key, v)).join('; ');
      if (value.length === 2 && value.every((v) => typeof v === 'number')) return `${num(value[0])}–${num(value[1])}`;
      return value.map((v) => specValue(id, key, v)).join(', ');
    }
    if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) return I.date(value);
    return String(value);
  }
  function specList(id, specs) {
    return `<ul>${Object.entries(specs).map(([key, value]) =>
      `<li>${esc(t(`spec.${key}`))}: <b>${esc(specValue(id, key, value))}</b></li>`).join('')}</ul>`;
  }
  const hasSpecs = (specs) => specs && typeof specs === 'object' && Object.keys(specs).length > 0;
  function verifiedBlock(item, { collapsible = false } = {}) {
    if (!hasSpecs(item.verifiedSpecs)) return '';
    const n = Object.keys(item.verifiedSpecs).length;
    if (collapsible) {
      return `<details class="vs"><summary><span class="nv">${esc(t('vs.badge'))}</span>${esc(t('vs.summary', { n }))}</summary>
        <p class="hint">${esc(t('vs.note'))}</p>${specList(item.id, item.verifiedSpecs)}</details>`;
    }
    return `<div class="vs"><span class="nv">${esc(t('vs.badge'))}</span>${esc(t('vs.note'))}${specList(item.id, item.verifiedSpecs)}</div>`;
  }
  function sourceLink(url, label = t('card.source')) {
    return url ? `<a class="srcl" href="${esc(url)}" target="_blank" rel="noopener">${esc(label)} ↗<span class="sr"> ${esc(t('common.newWindow'))}</span></a>` : '';
  }

  function renderMissions() {
    $('#missionCards').innerHTML = E.getMissions().map((m) => {
      const diff = DIFFICULTY[m.id] || 'medium';
      const stats = [
        [t('stat.target'), t(`target.${m.targetBody}.name`)],
        [t('stat.budget'), money(m.maxBudget)],
        [t('stat.time'), t('stat.months', { n: m.maxTimeMonths })],
        [t('stat.radiation'), t('stat.radiationVal', { n: m.radiationLevel })],
        [t('stat.solar'), t('fmt.pct', { n: pct(m.solarEfficiency, 0) })],
        [t('stat.science'), t('stat.points', { n: m.minScienceScore })],
        [t('stat.orbit'), nameOf('orbit', m.requiredOrbitId)]
      ];
      return `<article class="mcard" aria-labelledby="mt-${esc(m.id)}">
        <span class="diff ${diff}">${esc(t(`diff.${diff}`))}</span>
        <h2 id="mt-${esc(m.id)}">${esc(nameOf('mission', m.id))}</h2>
        <p>${esc(descOf('mission', m.id))}</p>
        ${stats.map(([k, v]) => `<div class="stat"><span>${esc(k)}</span><b>${esc(v)}</b></div>`).join('')}
        <p class="hint">${esc(t('card.gameNote'))}</p>
        ${verifiedBlock(m)}
        ${sourceLink(m.nasaSourceUrl)}
        <button type="button" class="btn" data-act="start" data-id="${esc(m.id)}" data-fk="start:${esc(m.id)}">${esc(t('card.start'))}</button>
      </article>`;
    }).join('');
  }

  function renderDraftBanner() {
    const el = $('#draftBanner');
    const parts = [];
    const d = app.draft;
    if (hasWork()) {
      parts.push(`<p>${esc(t('draft.current', { mission: t(`data.mission.${mission().id}.short`) }))}</p>
        <div class="row"><button type="button" class="btn sm" data-act="continue-build" data-fk="continue-build">${esc(t('draft.continue'))}</button></div>`);
    }
    if (d.pending) {
      const when = formatSavedAt(d.pending.savedAt);
      parts.push(`<p>${esc(t('draft.found', { mission: t(`data.mission.${d.pending.missionId}.short`), time: when }))}</p>
        <div class="row"><button type="button" class="btn sm" data-act="restore-draft" data-fk="restore-draft">${esc(t('draft.restore'))}</button>
        <button type="button" class="btn sm ghost" data-act="discard-draft" data-fk="discard-draft">${esc(t('draft.discard'))}</button></div>`);
    } else if (d.error) {
      parts.push(`<p>${esc(t('draft.corrupt', { reason: d.error && d.error.i18nKey ? errorText(d.error) : t('draft.badShape') }))}</p>
        <div class="row"><button type="button" class="btn sm ghost" data-act="discard-draft" data-fk="discard-draft">${esc(t('draft.discard'))}</button></div>`);
    }
    if (!d.storageOk) parts.push(`<p class="hint">${esc(t('draft.unavailable'))}</p>`);
    el.innerHTML = parts.join('');
    el.hidden = parts.length === 0;
    el.classList.toggle('bad', !!d.error && !d.pending);
  }

  function renderS1() {
    renderMissions();
    renderDraftBanner();
  }

  async function startMission(id) {
    if (app.flight) { toast(t('msg.flightLocked')); return; }
    if (hasWork() && !(await confirmDialog(() => ({
      title: t('confirm.newMission.title'), body: `<p>${esc(t('confirm.newMission.body'))}</p>`, ok: t('confirm.newMission.ok')
    })))) return;
    if ((app.draft.pending || app.draft.error) && !(await confirmDialog(() => ({
      title: t('confirm.draft.title'), body: `<p>${esc(t('confirm.draft.body'))}</p>`, ok: t('confirm.draft.ok'), okClass: 'warn'
    })))) return;
    discardDraft({ silent: true });
    E.initMission(id, currentMode());
    app.tab = 'launch';
    app.preview = null;
    app.onlyCompat = false;
    app.state = E.getState();
    go(2);
    refresh();
    saveDraft();
  }

  /* ---------- drafts ---------- */
  const MAX_DATE_MS = 8.64e15; // ECMAScript Date range; e.g. 1e20 would be an Invalid Date
  function validTimestamp(value) {
    const n = typeof value === 'number' ? value : Number(value);
    return Number.isFinite(n) && n > 0 && n <= MAX_DATE_MS && !Number.isNaN(new Date(n).getTime()) ? n : null;
  }
  function formatSavedAt(ts) {
    if (!ts) return t('draft.timeUnknown');
    try {
      return new Intl.DateTimeFormat(I.locale(), { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(ts));
    } catch (_) {
      return t('draft.timeUnknown');
    }
  }
  function loadDraft() {
    app.draft.storageOk = store.ok();
    const raw = store.get(KEYS.draft);
    if (!raw) return;
    try {
      const saved = JSON.parse(raw);
      if (!saved || typeof saved.code !== 'string') throw new Error('bad draft shape');
      const parsed = E.validateBlueprintCode(saved.code);
      app.draft.pending = { code: saved.code, savedAt: validTimestamp(saved.savedAt), missionId: parsed.missionId };
    } catch (error) {
      app.draft.error = error; // rendered later, so the reason follows the current language
    }
  }
  function saveDraft() {
    if (!hasMission() || app.draft.pending || app.draft.error) return;
    const ok = store.set(KEYS.draft, JSON.stringify({ v: 1, code: E.exportBlueprintCode(), savedAt: Date.now() }));
    if (!ok && !app.draft.warned) {
      app.draft.warned = true;
      toast(t('draft.saveFail'));
    }
  }
  function discardDraft({ silent = false } = {}) {
    const had = app.draft.pending || app.draft.error;
    store.remove(KEYS.draft);
    app.draft.pending = null;
    app.draft.error = null;
    if (had && !silent) toast(t('draft.discarded'), true);
    if (app.screen === 1) renderDraftBanner();
  }
  async function restoreDraft() {
    if (app.flight) { toast(t('msg.flightLocked')); return; }
    const pending = app.draft.pending;
    if (!pending) return;
    if (hasWork() && !(await confirmDialog(() => ({
      title: t('confirm.replace.title'), body: `<p>${esc(t('confirm.replace.body'))}</p>`, ok: t('confirm.replace.ok')
    })))) return;
    E.importBlueprintCode(pending.code); // same validation as a manual import
    app.draft.pending = null;
    app.tab = 'launch';
    app.preview = null;
    app.state = E.getState();
    go(2);
    refresh();
    saveDraft();
    toast(t('draft.restored'), true);
  }

  /* ---------- screen 2: catalog ---------- */
  const FIELDS = {
    lv: ['maxPayloadKg', 'cost', 'reliability', 'prepTimeMonths'],
    orbit: ['altitude', 'commWindowHoursPerDay', 'eclipseRatio', 'massPenaltyMultiplier'],
    part: ['mass', 'cost', 'powerGeneration', 'powerConsumption', 'batteryCapacity', 'dataTransferRate', 'radiationResistance', 'prepTimeMonths'],
    inst: ['sciencePoints', 'mass', 'cost', 'powerConsumption', 'dataGenerationRate', 'prepTimeMonths']
  };
  const OPTIONAL_ZERO = new Set(['powerGeneration', 'batteryCapacity', 'dataTransferRate']);
  function chip(item, field, kind) {
    let label;
    let value;
    let game;
    if (field === 'altitude') {
      if (item.altitudeKmMin != null) {
        label = t('field.altitudeRange');
        value = t('fmtf.altitudeRange', { min: item.altitudeKmMin, max: item.altitudeKmMax });
        game = (item.gameOnlyFields || []).includes('altitudeKmMin');
      } else if (item.altitudeKm != null) {
        label = t('field.altitudeKm');
        value = t('fmtf.altitudeKm', { v: item.altitudeKm });
        game = (item.gameOnlyFields || []).includes('altitudeKm');
      } else return '';
    } else {
      const v = item[field];
      if (v == null || (kind === 'part' && OPTIONAL_ZERO.has(field) && !v)) return '';
      label = t(`field.${field}`);
      value = t(`fmtf.${field}`, { v });
      game = (item.gameOnlyFields || []).includes(field);
    }
    const mark = game ? '<span class="g" aria-hidden="true">◇</span>' : '<span class="n" aria-hidden="true">✓</span>';
    return `<span>${mark} ${esc(label)}: <b>${esc(value)}</b><span class="sr"> (${esc(t(game ? 'legend.gameShort' : 'legend.nasaShort'))})</span></span>`;
  }
  function originLabel(kind, item) {
    if (kind === 'lv') return { text: t('origin.lv'), cls: '' };
    if (kind === 'orbit') return { text: t('origin.orbit'), cls: '' };
    if (kind === 'inst') return { text: t('origin.inst', { type: t(`data.inst.${item.id}.type`) }), cls: '' };
    return item.origin === 'game' ? { text: t('origin.game'), cls: 'game' } : { text: t('origin.generic'), cls: '' };
  }
  function changeFor(kind, id, category) {
    if (kind === 'lv') return { type: 'rocket', id };
    if (kind === 'orbit') return { type: 'orbit', id };
    if (kind === 'part') return { type: 'part', category, id };
    return { type: 'instrument', id };
  }
  function itemCard(kind, item, { selected, category = '', extra = '', bad = false }) {
    const key = `${kind}:${item.id}`;
    const open = app.preview && app.preview.key === key;
    const origin = originLabel(kind, item);
    const pvLabel = selected ? (kind === 'inst' ? t('pv.btnRemove') : t('pv.btnSelected')) : t('pv.btn');
    const cat = category ? ` data-cat="${esc(category)}"` : '';
    return `<div class="item${selected ? ' sel' : ''}${bad ? ' bad' : ''}">
      <button type="button" class="pick" data-act="pick" data-kind="${kind}" data-id="${esc(item.id)}"${cat} aria-pressed="${!!selected}" data-fk="pick:${key}">
        <span class="nm">${esc(nameOf(kind, item.id))}${selected ? ` <span class="sel-mark">✔ ${esc(t('item.selected'))}</span>` : ''}</span>
        <span class="origin ${origin.cls}">${esc(origin.text)}</span>
        <span class="desc">${esc(descOf(kind, item.id))}</span>
        <span class="chips">${FIELDS[kind].map((field) => chip(item, field, kind)).join('')}</span>
        ${extra}
      </button>
      <div class="item-acts">
        <button type="button" class="linkbtn" data-act="preview" data-kind="${kind}" data-id="${esc(item.id)}"${cat} aria-expanded="${!!open}" aria-controls="pv-${esc(item.id)}" data-fk="pv:${key}">Δ ${esc(pvLabel)}</button>
        ${sourceLink(item.nasaSourceUrl)}
      </div>
      ${verifiedBlock(item, { collapsible: true })}
      ${open ? previewPanel(kind, item, category, selected) : ''}
    </div>`;
  }

  function renderTabs() {
    $$('#tabs [data-tab]').forEach((btn) => {
      const on = btn.dataset.tab === app.tab;
      btn.classList.toggle('on', on);
      btn.setAttribute('aria-selected', String(on));
      btn.tabIndex = on ? 0 : -1;
    });
    $('#catalogBody').setAttribute('aria-labelledby', `tab-${app.tab}`);
  }

  function renderCatalog() {
    renderTabs();
    const s = app.state;
    const b = s.build;
    const m = s.mission;
    const body = $('#catalogBody');
    if (app.tab === 'launch') {
      body.innerHTML = `<h3 class="grp" id="grp-lv">${esc(t('grp.lv'))}</h3><p class="grp-hint">${esc(t('grp.lvHint'))}</p>`
        + catalog.launchVehicles.map((r) => itemCard('lv', r, { selected: r.id === b.rocketId })).join('')
        + `<h3 class="grp" id="grp-orbit">${esc(t('grp.orbit'))}</h3><p class="grp-hint">${esc(t('grp.orbitHint'))}</p>`
        + catalog.orbits.map((o) => {
          const required = o.id === m.requiredOrbitId;
          const extra = required ? `<span class="compat ok">✔ ${esc(t('orbit.required'))}</span>`
            : `<span class="compat no">${esc(t(o.targetBody === m.targetBody ? 'orbit.notRequired' : 'orbit.otherTarget'))}</span>`;
          return itemCard('orbit', o, { selected: o.id === b.orbitId, extra, bad: !required });
        }).join('');
    } else if (app.tab === 'bus') {
      body.innerHTML = CATS.map((c) => `<h3 class="grp" id="grp-${c}">${esc(t(`catTitle.${c}`))}${b.bus[c] ? '' : ` <span class="no">— ${esc(t('slots.empty'))}</span>`}</h3>
        <p class="grp-hint">${esc(t(`catHint.${c}`))}</p>`
        + catalog.busComponents.filter((p) => p.category === c)
          .map((p) => itemCard('part', p, { selected: p.id === b.bus[c], category: c })).join('')).join('');
    } else {
      const n = b.instrumentIds.length;
      body.innerHTML = `<label class="filt"><input type="checkbox" id="fc" ${app.onlyCompat ? 'checked' : ''}> ${esc(t('filter.compat'))}</label>
        <p class="hint" id="instCount" aria-live="polite">${esc(t('inst.count', { n, max: MAX_INST }))}</p>`
        + catalog.instruments.filter((i) => !app.onlyCompat || i.compatibleTargets.includes(m.targetBody)).map((i) => {
          const ok = i.compatibleTargets.includes(m.targetBody);
          const extra = ok ? `<span class="compat ok">✔ ${esc(t('inst.compatOk'))}</span>`
            : `<span class="compat no">⚠ ${esc(t('inst.compatNo', { target: t(`target.${m.targetBody}.gen`) }))}</span>`;
          return itemCard('inst', i, { selected: b.instrumentIds.includes(i.id), extra, bad: !ok });
        }).join('');
    }
  }

  /* ---------- preview (side-effect free) ---------- */
  function previewPanel(kind, item, category, selected) {
    const pv = E.previewChange(changeFor(kind, item.id, category));
    const title = t(selected && kind === 'inst' ? 'pv.titleRemove' : 'pv.title', { name: nameOf(kind, item.id) });
    const close = `<button type="button" class="linkbtn" data-act="pv-close" data-fk="pv-close">${esc(t('pv.close'))}</button>`;
    if (pv.error) {
      return `<div class="pv" id="pv-${esc(item.id)}" role="region" aria-label="${esc(title)}"><h3>${esc(title)}</h3>
        <p class="no">${esc(pv.error)}</p><div class="row">${close}</div></div>`;
    }
    if (!pv.changed) {
      return `<div class="pv" id="pv-${esc(item.id)}" role="region" aria-label="${esc(title)}"><h3>${esc(title)}</h3>
        <p>${esc(t('pv.noChange'))}</p><div class="row">${close}</div></div>`;
    }
    const b = pv.before.telemetry;
    const a = pv.after.telemetry;
    const row = (label, before, after, fmt, better) => {
      const delta = after - before;
      const cls = Math.abs(delta) < 1e-9 ? '' : ((delta > 0) === (better === 'up') ? 'up' : 'down');
      const sign = delta > 0 ? '+' : '';
      return `<tr><th scope="row">${esc(label)}</th><td>${esc(fmt(before))}</td><td>${esc(fmt(after))}</td>
        <td class="${cls}">${Math.abs(delta) < 1e-9 ? '0' : esc(sign + fmt(delta))}</td></tr>`;
    };
    const rows = [
      row(t('pv.budget'), b.budget.used, a.budget.used, money, 'down'),
      row(t('pv.mass'), b.mass.wetMassWithStage, a.mass.wetMassWithStage, kg, 'down'),
      row(t('pv.limit'), b.mass.maxAllowed, a.mass.maxAllowed, kg, 'up'),
      row(t('pv.power'), b.power.netBalance, a.power.netBalance, watts, 'up'),
      row(t('pv.battery'), b.power.batteryCapacity - b.power.batteryRequired, a.power.batteryCapacity - a.power.batteryRequired, wh, 'up'),
      row(t('pv.data'), b.dataAndComms.bottleneckRatio * 100, a.dataAndComms.bottleneckRatio * 100, (v) => t('fmt.pct', { n: num(v, 0) }), 'up'),
      row(t('pv.time'), b.time.usedMonths, a.time.usedMonths, months, 'down'),
      row(t('pv.science'), b.science.effectivePoints, a.science.effectivePoints, (v) => num(v, 0), 'up'),
      row(t('pv.rad'), b.radiation.spacecraftMinRad, a.radiation.spacecraftMinRad, (v) => num(v, 0), 'up')
    ].join('');
    const idOf = (issue) => `${issue.code}:${issue.category || issue.instrumentId || ''}`;
    const beforeIds = new Set(pv.before.compatibility.issues.map(idOf));
    const afterIds = new Set(pv.after.compatibility.issues.map(idOf));
    const textOf = (compat, issue) => {
      const list = issue.level === 'error' ? compat.errors : compat.warnings;
      const same = compat.issues.filter((x) => x.level === issue.level);
      return list[same.indexOf(issue)];
    };
    const added = pv.after.compatibility.issues.filter((x) => !beforeIds.has(idOf(x)));
    const fixed = pv.before.compatibility.issues.filter((x) => !afterIds.has(idOf(x)));
    const list = (items, compat) => `<ul>${items.map((x) => `<li>${x.level === 'error' ? '✖' : '⚠'} ${esc(textOf(compat, x))}</li>`).join('')}</ul>`;
    const changes = (added.length ? `<p class="no">${esc(t('pv.added'))}</p>${list(added, pv.after.compatibility)}` : '')
      + (fixed.length ? `<p class="ok">${esc(t('pv.fixed'))}</p>${list(fixed, pv.before.compatibility)}` : '')
      + (!added.length && !fixed.length ? `<p>${esc(t('pv.sameChecks'))}</p>` : '');
    const launch = pv.after.compatibility.canLaunch ? t('pv.canLaunch') : t('pv.cannotLaunch', { n: pv.after.compatibility.errors.length });
    return `<div class="pv" id="pv-${esc(item.id)}" role="region" aria-label="${esc(title)}">
      <h3>${esc(title)}</h3>
      <table><thead><tr><th scope="col">${esc(t('pv.metric'))}</th><th scope="col">${esc(t('pv.now'))}</th><th scope="col">${esc(t('pv.after'))}</th><th scope="col">Δ</th></tr></thead><tbody>${rows}</tbody></table>
      ${changes}<p><b>${esc(launch)}</b></p>
      <p class="hint">${esc(t('pv.note'))}</p>
      <div class="row"><button type="button" class="btn sm" data-act="pick" data-kind="${kind}" data-id="${esc(item.id)}"${category ? ` data-cat="${esc(category)}"` : ''} data-fk="pv-apply">${esc(t(selected && kind === 'inst' ? 'pv.applyRemove' : 'pv.apply'))}</button>${close}</div>
    </div>`;
  }

  /* ---------- screen 2: blueprint, goal, advisors ---------- */
  function renderBlueprint() {
    const s = app.state;
    const b = s.build;
    let filled = 0;
    // Inner nodes are small, so their labels are shorter; the full names are in the slot list.
    const LIMIT = { battery: 9, computer: 9, thermal: 17, inst0: 12, inst1: 12, inst2: 12, inst3: 12 };
    const set = (k, label) => {
      const node = $(`#bp .node[data-k="${k}"]`);
      const text = $(`#bp [data-l="${k}"]`);
      node.classList.toggle('on', !!label);
      text.textContent = label ? cut(label, LIMIT[k] || 22) : '';
      if (label) filled += 1;
    };
    CATS.forEach((c) => set(c, b.bus[c] ? nameOf('part', b.bus[c]) : ''));
    for (let i = 0; i < MAX_INST; i += 1) {
      const id = b.instrumentIds[i];
      set(`inst${i}`, id ? abbr(INST.get(id)) : '');
    }
    $('#lbMeta').textContent = cut(t('bp.meta', {
      lv: b.rocketId ? nameOf('lv', b.rocketId) : t('common.none'),
      orbit: b.orbitId ? nameOf('orbit', b.orbitId) : t('common.none')
    }), 78);
    $('#bpDesc').textContent = t('bp.desc', { n: filled, total: CATS.length + MAX_INST });
    $('#missionTitle').textContent = t('bp.title', { mission: t(`data.mission.${s.mission.id}.short`) });
    const m = s.mission;
    $('#goalLine').textContent = t('goal.line', {
      target: t(`target.${m.targetBody}.name`), min: m.minScienceScore, orbit: nameOf('orbit', m.requiredOrbitId),
      rad: m.radiationLevel, budget: money(m.maxBudget), months: m.maxTimeMonths
    });
  }

  function renderAdvisors() {
    $('#advisors').innerHTML = app.state.advisors.map((a) => `<div class="adv ${esc(a.status)}">
      <h3>${esc(a.title)}</h3><span class="st">${esc(t(`lvl.${a.status}`))}</span><p>${esc(a.message)}</p></div>`).join('');
  }

  function renderPresets() {
    const list = PRESETS[app.state.mission.id] || [];
    $('#presetPanel').innerHTML = `<h2 class="ptitle">${esc(t('presets.title'))}</h2><p class="hint">${esc(t('presets.note'))}</p>`
      + list.map((p) => `<div class="preset"><h3>${esc(t(`preset.${p.id}.name`))}</h3><p>${esc(t(`preset.${p.id}.desc`))}</p>
        <button type="button" class="btn sm ghost" data-act="preset" data-id="${esc(p.id)}" data-fk="preset:${esc(p.id)}">${esc(t('presets.apply'))}</button></div>`).join('');
  }

  function renderSharePanel() {
    $('#sharePanel').innerHTML = `<h2 class="ptitle">${esc(t('share.panelTitle'))}</h2>
      <label class="sr" for="exportInline">${esc(t('share.exportLabel'))}</label>
      <textarea id="exportInline" class="code" readonly rows="2">${esc(E.exportBlueprintCode())}</textarea>
      <p class="hint">${esc(t('share.note'))}</p>
      <div class="row"><button type="button" class="btn sm" data-act="copy" data-src="exportInline" data-fk="copy-inline">${esc(t('share.copy'))}</button>
      <button type="button" class="btn sm ghost" data-act="open-share" data-fk="open-share">${esc(t('share.openImport'))}</button></div>`;
  }

  /* ---------- team mode (local, one device) ---------- */
  function loadTeam() {
    try {
      const saved = JSON.parse(store.get(KEYS.team) || 'null');
      if (saved && Number.isInteger(saved.size) && saved.size >= 1 && saved.size <= 4) app.team.size = saved.size;
      if (saved && Array.isArray(saved.names)) app.team.names = [0, 1, 2, 3].map((i) => String(saved.names[i] || '').slice(0, 24));
    } catch (_) { /* ignore a corrupted team record */ }
  }
  function saveTeam() { store.set(KEYS.team, JSON.stringify({ size: app.team.size, names: app.team.names })); }
  const playerName = (i) => app.team.names[i] || t('team.player', { n: i + 1 });
  const rolesOf = (i) => ROLES.filter((_, r) => r % app.team.size === i);
  function teamStatus() {
    const required = currentMode() === 'team';
    const approved = app.team.approvals.filter((i) => i < app.team.size).length;
    return { required, approved, size: app.team.size, ready: !required || approved >= app.team.size };
  }
  function syncTeamApprovals() {
    if (!hasMission()) return;
    const sig = buildSignature(app.state);
    if (app.team.signature !== sig) {
      const had = app.team.approvals.length > 0;
      app.team.approvals = [];
      app.team.signature = sig;
      if (had && currentMode() === 'team') toast(t('team.reset'));
    }
  }
  function renderTeam() {
    const panel = $('#teamPanel');
    const on = currentMode() === 'team';
    panel.hidden = !on;
    if (!on) return;
    const status = teamStatus();
    const advisors = Object.fromEntries(app.state.advisors.map((a) => [a.id, a]));
    panel.innerHTML = `<h2 class="ptitle">${esc(t('team.title'))}</h2>
      <p class="hint">${esc(t('team.note'))}</p>
      <div class="row" role="group" aria-label="${esc(t('team.sizeLabel'))}"><span>${esc(t('team.sizeLabel'))}</span>
        <div class="seg">${[1, 2, 3, 4].map((n) => `<button type="button" data-act="team-size" data-n="${n}" aria-pressed="${n === app.team.size}" class="${n === app.team.size ? 'on' : ''}" data-fk="team-size:${n}">${n}</button>`).join('')}</div></div>
      <div class="team-grid">${Array.from({ length: app.team.size }, (_, i) => {
        const ok = app.team.approvals.includes(i);
        return `<div class="player${ok ? ' ok' : ''}">
          <label class="sr" for="pname${i}">${esc(t('team.nameLabel', { n: i + 1 }))}</label>
          <input id="pname${i}" data-player="${i}" maxlength="24" value="${esc(app.team.names[i])}" placeholder="${esc(t('team.player', { n: i + 1 }))}">
          <ul>${rolesOf(i).map((r) => {
            const a = advisors[r.advisor];
            return `<li><b>${esc(t(`role.${r.id}.name`))}</b> — ${esc(t(`role.${r.id}.duty`))} <span class="${a.status === 'ok' ? 'ok' : 'no'}">(${esc(t('team.advisorStatus', { status: t(`lvl.${a.status}`) }))})</span></li>`;
          }).join('')}</ul>
          <button type="button" class="btn sm ${ok ? '' : 'ghost'}" data-act="approve" data-i="${i}" aria-pressed="${ok}" data-fk="approve:${i}">${esc(ok ? t('team.approved', { name: playerName(i) }) : t('team.approve', { name: playerName(i) }))}</button>
        </div>`;
      }).join('')}</div>
      <p><b>${esc(status.ready ? t('team.ready') : t('team.status', { a: status.approved, b: status.size }))}</b></p>
      <p class="hint">${esc(t('team.rules'))}</p>`;
  }
  function setTeamSize(n) {
    app.team.size = Math.min(4, Math.max(1, n));
    app.team.approvals = app.team.approvals.filter((i) => i < app.team.size);
    saveTeam();
    refresh();
  }
  function toggleApproval(i) {
    if (app.flight) { toast(t('msg.flightLocked')); return; }
    const list = app.team.approvals;
    const at = list.indexOf(i);
    if (at >= 0) list.splice(at, 1); else list.push(i);
    app.team.signature = buildSignature(app.state);
    refresh();
  }

  /* ---------- screen 2: telemetry ---------- */
  function renderSlots() {
    const s = app.state;
    const b = s.build;
    const m = s.mission;
    const slot = ({ key, label, ok, warn, value, tab, target, wide }) => `<button type="button" class="slot ${ok ? (warn ? 'warn' : 'ok') : 'miss'}${wide ? ' wide' : ''}"
      data-act="slot" data-tab="${tab}" data-target="${target || ''}" data-fk="slot:${key}">
      <span class="ic" aria-hidden="true">${ok ? (warn ? '⚠' : '✔') : '✖'}</span>
      <span><b>${esc(label)}</b><br>${esc(value)}</span>
      <span class="sr">${esc(ok ? (warn ? t('lvl.warn') : t('slots.done')) : t('slots.empty'))}</span></button>`;
    const n = b.instrumentIds.length;
    const orbitOk = !!b.orbitId && b.orbitId === m.requiredOrbitId;
    $('#slots').innerHTML = [
      slot({ key: 'rocket', label: t('slots.rocket'), ok: !!b.rocketId, value: b.rocketId ? nameOf('lv', b.rocketId) : t('slots.empty'), tab: 'launch', target: 'grp-lv' }),
      slot({ key: 'orbit', label: t('slots.orbit'), ok: orbitOk, value: b.orbitId ? cut(nameOf('orbit', b.orbitId), 40) : t('slots.empty'), tab: 'launch', target: 'grp-orbit' }),
      ...CATS.map((c) => slot({ key: c, label: t(`catTitle.${c}`), ok: !!b.bus[c], value: b.bus[c] ? cut(nameOf('part', b.bus[c]), 40) : t('slots.empty'), tab: 'bus', target: `grp-${c}` })),
      slot({ key: 'inst', label: t('slots.inst', { n, max: MAX_INST }), ok: n > 0,
        warn: s.compatibility.issues.some((x) => x.code === 'INSTRUMENT_TARGET'),
        value: n ? b.instrumentIds.map((id) => abbr(INST.get(id))).join(', ') : t('slots.empty'), tab: 'inst', wide: true })
    ].join('');
  }

  function slowestItem() {
    const s = app.state.selectedObjects;
    const items = [s.rocket ? ['lv', s.rocket] : null, ...CATS.map((c) => (s.bus[c] ? ['part', s.bus[c]] : null)),
      ...s.instruments.map((i) => ['inst', i])].filter(Boolean);
    let best = null;
    items.forEach(([kind, item]) => {
      if (!best || (item.prepTimeMonths || 0) > (best[1].prepTimeMonths || 0)) best = [kind, item];
    });
    return best;
  }

  function bar({ label, level, value, fill, sub, marker = null }) {
    const lvlKey = level === 'err' ? 'error' : level;
    return `<div class="bar ${level}">
      <div class="r"><span>${esc(label)}</span><span>${esc(value)} <span class="lvl">· ${esc(t(`lvl.${lvlKey}`))}</span></span></div>
      <div class="tr" aria-hidden="true"><div class="fl" style="width:${clampPct(fill)}%"></div>${marker != null ? `<div class="mk" style="left:${clampPct(marker)}%"></div>` : ''}</div>
      <div class="sub">${esc(sub)}</div></div>`;
  }

  function renderBars() {
    const s = app.state;
    const tl = s.telemetry;
    const m = s.mission;
    const { budget, mass, power, dataAndComms: data, time, science, radiation } = tl;
    const orbit = s.selectedObjects.orbit;
    const slow = slowestItem();
    const travel = E.TRAVEL_MONTHS[m.targetBody];
    const chassis = s.selectedObjects.bus.chassis;
    const computer = s.selectedObjects.bus.computer;
    const html = [
      bar({ label: t('bar.budget'), level: budget.isOver ? 'err' : 'ok', value: t('fmt.of', { a: money(budget.used), b: money(budget.max) }), fill: budget.percent,
        sub: budget.isOver ? t('bar.budget.over', { n: money(budget.used - budget.max) })
          : t('bar.budget.left', { n: money(budget.max - budget.used), p: num(100 - budget.percent, 0) }) }),
      bar({ label: t('bar.mass'), level: mass.isOver ? 'err' : 'ok',
        value: s.build.rocketId ? t('fmt.of', { a: kg(mass.wetMassWithStage), b: kg(mass.maxAllowed) }) : kg(mass.wetMassWithStage),
        fill: s.build.rocketId ? mass.percent : 0,
        sub: t('bar.mass.sub', { dry: num(mass.dryMass), factor: num(E.TRANSFER[m.targetBody], 1), target: t(`target.${m.targetBody}.gen`), wet: num(mass.wetMassWithStage) })
          + (s.build.rocketId ? '' : ` ${t('bar.mass.noRocket')}`) }),
      bar({ label: t('bar.power'), level: power.isPowerDeficit ? 'warn' : 'ok',
        value: power.isPowerDeficit ? t('bar.power.deficit', { n: num(-power.netBalance) }) : t('bar.power.margin', { n: num(power.netBalance) }),
        fill: power.generated > 0 ? power.used / power.generated * 100 : (power.used > 0 ? 100 : 0),
        sub: t('bar.power.sub', { used: num(power.used), gen: num(power.generated) }) + (power.isPowerDeficit ? ` ${t('bar.power.penalty', { f: num(E.POWER_DEFICIT_FACTOR) })}` : '') }),
      bar({ label: t('bar.battery'), level: power.isBatteryDeficit ? 'warn' : 'ok',
        value: t('bar.battery.val', { cap: num(power.batteryCapacity), req: num(power.batteryRequired) }),
        fill: power.batteryCapacity > 0 ? power.batteryRequired / power.batteryCapacity * 100 : (power.batteryRequired > 0 ? 100 : 0),
        sub: t('bar.battery.sub', { p: num((orbit ? orbit.eclipseRatio : 0.35) * 100, 0) }) }),
      bar({ label: t('bar.data'), level: data.isBottlenecked ? 'warn' : 'ok',
        value: t('bar.data.val', { p: num(data.bottleneckRatio * 100, 0) }),
        fill: data.maxTransmittedPerDay > 0 ? data.generatedPerDay / data.maxTransmittedPerDay * 100 : (data.generatedPerDay > 0 ? 100 : 0),
        sub: t('bar.data.sub', { gen: num(data.generatedPerDay), link: num(data.maxTransmittedPerDay) }) }),
      bar({ label: t('bar.time'), level: time.isOver ? 'warn' : 'ok', value: t('fmt.of', { a: months(time.usedMonths), b: months(time.maxMonths) }), fill: time.percent,
        sub: t('bar.time.sub', { prep: num(time.usedMonths - travel), travel: num(travel),
          item: slow ? nameOf(slow[0], slow[1].id) : t('common.none') }) }),
      bar({ label: t('bar.rad'), level: radiation.isVulnerable ? 'warn' : 'ok', value: t('fmt.of', { a: num(radiation.spacecraftMinRad), b: num(radiation.requiredRad) }),
        fill: radiation.requiredRad > 0 ? radiation.spacecraftMinRad / radiation.requiredRad * 100 : 100,
        sub: t('bar.rad.sub', { c: chassis ? num(chassis.radiationResistance) : t('common.none'),
          p: computer ? num(computer.radiationResistance) : t('common.none'), need: num(radiation.requiredRad) }) }),
      bar({ label: t('bar.science'), level: science.isEnough ? 'ok' : 'warn', value: t('fmt.of', { a: num(science.effectivePoints), b: num(science.targetMin) }),
        fill: science.percent, marker: null,
        sub: t('bar.science.sub', { raw: num(science.rawPoints), eff: num(science.effectivePoints) }) })
    ];
    $('#bars').innerHTML = html.join('');
  }

  function designFactor() {
    const rocket = app.state.selectedObjects.rocket;
    if (!rocket) return null;
    const n = app.state.compatibility.warnings.length;
    return { rel: rocket.reliability, n, total: rocket.reliability * Math.pow(E.WARNING_SURVIVAL_FACTOR, n) };
  }

  function renderDiag() {
    const c = app.state.compatibility;
    let html = '';
    if (c.errors.length) {
      html += `<p class="dgh">${esc(t('diag.errors', { n: c.errors.length }))}</p>${c.errors.map((e) => `<div class="dg e">✖ ${esc(e)}</div>`).join('')}`;
    }
    if (c.warnings.length) {
      html += `<p class="dgh">${esc(t('diag.warnings', { n: c.warnings.length }))}</p>${c.warnings.map((w) => `<div class="dg w">⚠ ${esc(w)}</div>`).join('')}`;
    }
    if (!c.errors.length && !c.warnings.length) html += `<div class="dg g">✔ ${esc(t('diag.ok'))}</div>`;
    const f = designFactor();
    if (f) html += `<p class="hint">${esc(t('diag.risk', { rel: num(f.rel * 100, 1), factor: num(E.WARNING_SURVIVAL_FACTOR), n: f.n, total: num(f.total * 100, 1) }))}</p>`;
    $('#diag').innerHTML = html;
  }

  function launchView() {
    const c = app.state.compatibility;
    const team = teamStatus();
    if (app.flight) return { disabled: true, risky: false, label: t('launch.inFlight'), short: t('launch.inFlight'), hint: t('s3.lockNote') };
    if (!c.canLaunch) {
      return { disabled: true, risky: false, label: t('launch.blocked', { n: c.errors.length }), short: t('qb.blocked', { n: c.errors.length }), hint: t('launch.hintBlocked') };
    }
    if (!team.ready) {
      return { disabled: true, risky: false, label: t('launch.team', { a: team.approved, b: team.size }), short: t('qb.team'), hint: t('launch.hintTeam') };
    }
    if (E.getBlackBoxReport()) {
      return { disabled: false, risky: c.warnings.length > 0, label: t('launch.again'), short: t('qb.launch'), hint: t('launch.hintAgain') };
    }
    if (c.warnings.length) {
      return { disabled: false, risky: true, label: t('launch.risky', { n: c.warnings.length }), short: t('qb.launch'), hint: t('launch.hintRisky') };
    }
    return { disabled: false, risky: false, label: t('launch.go'), short: t('qb.launch'), hint: t('launch.hintGo') };
  }

  function renderLaunch() {
    const v = launchView();
    const btn = $('#launchBtn');
    btn.disabled = v.disabled;
    btn.classList.toggle('risky', v.risky);
    btn.textContent = v.label;
    const report = E.getBlackBoxReport();
    $('#launchHint').innerHTML = esc(v.hint) + (report && !app.flight
      ? ` <button type="button" class="linkbtn" data-act="view-report" data-fk="view-report">${esc(t('launch.viewReport'))}</button>` : '');
    const q = $('#qbLaunch');
    q.disabled = v.disabled;
    q.classList.toggle('risky', v.risky);
    q.textContent = v.short;
    q.setAttribute('aria-label', v.label);
    const tl = app.state.telemetry;
    const stat = (cls, text) => `<span class="${cls}">${esc(text)}</span>`;
    $('#qbStats').innerHTML = [
      stat(tl.budget.isOver ? 'err' : 'ok', t('qb.budget', { p: num(tl.budget.percent, 0) })),
      stat(tl.mass.isOver ? 'err' : 'ok', t('qb.mass', { p: num(app.state.build.rocketId ? tl.mass.percent : 0, 0) })),
      stat(tl.power.isPowerDeficit || tl.power.isBatteryDeficit ? 'warn' : 'ok', t('qb.power', { n: num(tl.power.netBalance) })),
      stat(tl.science.isEnough ? 'ok' : 'warn', t('qb.science', { a: num(tl.science.effectivePoints), b: num(tl.science.targetMin) })),
      stat(app.state.compatibility.errors.length ? 'err' : (app.state.compatibility.warnings.length ? 'warn' : 'ok'),
        t('qb.checks', { e: app.state.compatibility.errors.length, w: app.state.compatibility.warnings.length }))
    ].join('');
  }

  function renderBuilder() {
    if (!hasMission()) { go(1); renderS1(); return; }
    renderCatalog();
    renderBlueprint();
    renderTeam();
    renderPresets();
    renderAdvisors();
    renderSharePanel();
    renderSlots();
    renderBars();
    renderDiag();
    renderLaunch();
  }

  /** Re-reads Engine state (pure) and re-renders the visible screen. */
  function refresh() {
    const fk = focusKey();
    app.state = E.getState();
    syncTeamApprovals();
    renderHeader();
    if (app.screen === 1) renderS1();
    if (app.screen === 2) renderBuilder();
    if (app.screen === 3) renderFlight();
    if (app.screen === 4) renderReport();
    restoreFocus(fk);
  }

  /* ---------- builder actions ---------- */
  function pick(kind, id, category) {
    if (app.flight) { toast(t('msg.flightLocked')); return; }
    const b = app.state.build;
    if ((kind === 'lv' && b.rocketId === id) || (kind === 'orbit' && b.orbitId === id)
      || (kind === 'part' && b.bus[category] === id)) {
      toast(t('msg.alreadySelected'), true);
      return;
    }
    if (kind === 'lv') E.selectRocket(id);
    else if (kind === 'orbit') E.selectOrbit(id);
    else if (kind === 'part') E.selectBusPart(category, id);
    else E.toggleInstrument(id);
    const wasPreview = app.preview && app.preview.key === `${kind}:${id}`;
    app.preview = null;
    refresh();
    saveDraft();
    if (wasPreview) restoreFocus(`pick:${kind}:${id}`);
  }
  function togglePreview(kind, id, category) {
    const key = `${kind}:${id}`;
    app.preview = app.preview && app.preview.key === key ? null : { key, category };
    renderCatalog();
    restoreFocus(`pv:${key}`);
  }
  function setTab(tab, { focus = false } = {}) {
    if (!['launch', 'bus', 'inst'].includes(tab)) return;
    app.tab = tab;
    app.preview = null;
    renderCatalog();
    $('#catalogBody').scrollTop = 0;
    $('#catalog').scrollTop = 0;
    if (focus) $(`#tab-${tab}`).focus();
  }
  function jumpTo(tab, target) {
    setTab(tab);
    const el = target && document.getElementById(target);
    const cat = $('#catalog');
    if (el) {
      const top = el.getBoundingClientRect().top - cat.getBoundingClientRect().top + cat.scrollTop - 50;
      cat.scrollTop = Math.max(0, top);
      cat.scrollIntoView({ block: 'nearest' });
    } else {
      cat.scrollIntoView({ block: 'nearest' });
    }
    $(`#tab-${tab}`).focus({ preventScroll: true });
  }
  function presetCode(missionId, preset) {
    const m = MISSIONS.get(missionId);
    const fields = ['PZ', '1', missionId, currentMode(), preset.rocketId, m.requiredOrbitId, ...CATS.map((c) => preset.bus[c] || '')];
    return fields.map(encodeURIComponent).concat(preset.instrumentIds.map(encodeURIComponent).join(',')).join('|');
  }
  async function applyPreset(id) {
    if (app.flight) { toast(t('msg.flightLocked')); return; }
    const m = mission();
    const preset = (PRESETS[m.id] || []).find((p) => p.id === id);
    if (!preset) return;
    if (hasWork() && !(await confirmDialog(() => ({
      title: t('confirm.replace.title'), body: `<p>${esc(t('confirm.replace.body'))}</p>`, ok: t('confirm.replace.ok')
    })))) return;
    E.importBlueprintCode(presetCode(m.id, preset)); // passes the normal import validation
    app.preview = null;
    refresh();
    saveDraft();
    toast(t('presets.applied', { name: t(`preset.${id}.name`) }), true);
  }
  async function copyFrom(id) {
    const el = document.getElementById(id);
    if (!el) return;
    try {
      await navigator.clipboard.writeText(el.value);
      toast(t('share.copied'), true);
    } catch (_) {
      el.focus();
      el.select();
      toast(t('share.copyFail'));
    }
  }
  function setMode(next) {
    if (app.flight) { toast(t('msg.flightLocked')); return; }
    if (next !== 'solo' && next !== 'team') return;
    app.mode = next;
    if (hasMission()) E.setMode(next);
    refresh();
    saveDraft();
    toast(t(`mode.changed.${next}`), true);
  }

  /* ---------- share / import dialog ---------- */
  function renderShareDialog() {
    $('#shareExport').innerHTML = hasMission()
      ? `<label class="lbl" for="exportDlg">${esc(t('share.exportLabel'))}</label>
        <textarea id="exportDlg" class="code" readonly rows="2">${esc(E.exportBlueprintCode())}</textarea>
        <div class="row"><button type="button" class="btn sm" data-act="copy" data-src="exportDlg" data-fk="copy-dlg">${esc(t('share.copy'))}</button></div>
        <p class="hint">${esc(t('share.note'))}</p>`
      : `<p class="hint">${esc(t('share.noMission'))}</p>`;
    const locked = !!app.flight;
    $('#importBtn').disabled = locked;
    $('#importCode').disabled = locked;
    if (locked) $('#importHint').textContent = t('share.lockedFlight');
    else if ($('#importHint').dataset.error && importErrorText) $('#importHint').textContent = importErrorText();
    else $('#importHint').textContent = t('share.importHint');
  }
  function openShare() {
    $('#importHint').dataset.error = '';
    importErrorText = null;
    renderShareDialog();
    openModal($('#shareDlg'), { initialFocus: app.flight ? $('#shareClose') : $('#importCode'), onEscape: closeShare });
  }
  function closeShare() { closeModal($('#shareDlg')); }
  let importErrorText = null;
  function importError(render) {
    importErrorText = render;
    const hint = $('#importHint');
    hint.textContent = render();
    hint.dataset.error = '1';
    toast(render());
  }
  async function doImport() {
    if (app.flight) { toast(t('msg.flightLocked')); return; }
    const code = $('#importCode').value.trim();
    if (!code) { importError(() => t('msg.importEmpty')); return; }
    try {
      E.validateBlueprintCode(code);
    } catch (error) {
      importError(() => t('msg.importFail', { reason: errorText(error) }));
      return;
    }
    if (hasWork() && !(await confirmDialog(() => ({
      title: t('confirm.replace.title'), body: `<p>${esc(t('confirm.replace.body'))}</p>`, ok: t('confirm.replace.ok')
    })))) return;
    if (app.flight) { toast(t('msg.flightLocked')); return; }
    E.importBlueprintCode(code);
    if (app.draft.pending || app.draft.error) discardDraft({ silent: true });
    app.tab = 'launch';
    app.preview = null;
    app.state = E.getState();
    $('#importCode').value = '';
    $('#importHint').dataset.error = '';
    closeShare();
    go(2);
    refresh();
    saveDraft();
    toast(t('msg.importOk'), true);
  }

  /* ---------- tutorial ---------- */
  function openTutorial(step = 0) {
    if (app.dialog && app.dialog.done) app.dialog.done(false);
    const dialog = {
      kind: 'tutorial',
      step,
      render() {
        const i = dialog.step;
        $('#dlgTitle').textContent = t(`tut.${i + 1}.title`);
        $('#dlgBody').innerHTML = `<p class="hint">${esc(t('tut.step', { i: i + 1, n: TUTORIAL_STEPS }))}</p>
          <div class="tut-steps" aria-hidden="true">${Array.from({ length: TUTORIAL_STEPS }, (_, k) => `<span class="${k <= i ? 'on' : ''}"></span>`).join('')}</div>
          <p>${esc(t(`tut.${i + 1}.body`))}</p>`;
        const buttons = [];
        if (i > 0) buttons.push(`<button type="button" class="btn ghost" data-dlg="back" data-fk="tut:back">${esc(t('tut.back'))}</button>`);
        if (i < TUTORIAL_STEPS - 1) buttons.push(`<button type="button" class="btn" data-dlg="next" data-fk="tut:next">${esc(t('tut.next'))}</button>`);
        if (i === TUTORIAL_STEPS - 1 || i === 0) buttons.push(`<button type="button" class="btn ${i === 0 ? 'ghost' : ''}" data-dlg="earth" data-fk="tut:earth">${esc(t('tut.startEarth'))}</button>`);
        buttons.push(`<button type="button" class="btn ghost" data-dlg="skip" data-fk="tut:skip">${esc(t(i === TUTORIAL_STEPS - 1 ? 'tut.done' : 'tut.skip'))}</button>`);
        $('#dlgActions').innerHTML = buttons.join('');
      },
      done() {
        if (app.dialog !== dialog) return;
        app.dialog = null;
        closeModal($('#dlg'));
      }
    };
    app.dialog = dialog;
    store.set(KEYS.tutorial, '1');
    dialog.render();
    openModal($('#dlg'), { onEscape: () => dialog.done() });
  }
  function tutorialAction(action) {
    const d = app.dialog;
    if (!d || d.kind !== 'tutorial') return;
    if (action === 'next') d.step = Math.min(TUTORIAL_STEPS - 1, d.step + 1);
    else if (action === 'back') d.step = Math.max(0, d.step - 1);
    else if (action === 'skip') { d.done(); return; } else if (action === 'earth') {
      d.done();
      if (app.flight) { toast(t('msg.flightLocked')); return; }
      act(() => startMission('m3'));
      return;
    }
    d.render();
    const next = $(`[data-dlg="${action}"]`) || $('[data-dlg="next"]') || $('[data-dlg="skip"]');
    if (next) next.focus();
  }

  /* ---------- screen 3: flight ---------- */
  /** Pauses while any dialog is open (e.g. "Abort the flight?"), then waits ms. Resolves false if cancelled. */
  async function wait(flight, ms) {
    while (modals.length && !flight.cancelled) await whenNoModals();
    if (flight.cancelled) return false;
    return new Promise((resolve) => {
      const id = setTimeout(() => { flight.timers.delete(id); resolve(!flight.cancelled); }, ms);
      flight.timers.set(id, resolve);
    });
  }
  function cancelFlight(flight) {
    flight.cancelled = true;
    flight.timers.forEach((resolve, id) => { clearTimeout(id); resolve(false); });
    flight.timers.clear();
    quietWaiters.splice(0).forEach((resolve) => resolve());
  }
  const delays = () => (reduceMotion() ? { line: 30, status: 40, gap: 60, end: 120 } : { line: 380, status: 650, gap: 450, end: 1100 });

  async function launch() {
    if (app.flight) return; // double-click guard
    if (app.screen !== 2 && app.screen !== 4) return;
    app.state = E.getState();
    const view = launchView();
    if (view.disabled) { toast(view.hint); return; }
    // An unchanged build keeps its finished flight (the engine is idempotent). Re-flying it is an
    // explicit choice: view the existing report, or reset and fly again with a new roll.
    const sim = E.simulation;
    let resetFirst = !!sim.crisis && !sim.resolved; // stale unresolved flight: always start clean
    if (sim.resolved && E.getBlackBoxReport()) {
      const choice = await choiceDialog(() => ({
        title: t('again.title'), body: `<p>${esc(t('again.body'))}</p>`,
        actions: [{ id: 'new', label: t('again.new') }, { id: 'view', label: t('again.view'), cls: 'ghost' }]
      }));
      if (choice === 'view') { go(4); renderReport(); return; }
      if (choice !== 'new' || app.flight) return;
      resetFirst = true;
    }
    const warnings = app.state.compatibility.warnings;
    if (warnings.length) {
      const f = designFactor();
      const ok = await confirmDialog(() => ({
        title: t('pre.title'),
        body: `<p>${esc(t('pre.body', { n: app.state.compatibility.warnings.length }))}</p>
          <ul class="dlg-list">${E.getState().compatibility.warnings.map((w) => `<li>${esc(w)}</li>`).join('')}</ul>
          <p>${esc(t('pre.factor', { total: num(f.total * 100, 1) }))}</p>
          ${currentMode() === 'team' ? `<p>${esc(t('pre.team'))}</p>` : ''}`,
        ok: t('pre.confirm'),
        okClass: 'warn',
        cancel: t('pre.cancel')
      }));
      if (!ok || app.flight) return;
    }
    if (resetFirst) { E.resetSimulation(); app.lastFlight = null; }
    const flight = { id: ++flightSeq, stage: 'phases', events: [], timers: new Map(), cancelled: false, current: 0 };
    app.flight = flight;
    try {
      E.startSimulation();
    } catch (error) {
      app.flight = null;
      toast(t('msg.launchFail', { reason: errorText(error) }));
      refresh();
      return;
    }
    app.crisis = { selected: null, busy: false };
    flight.events.push({ type: 'boot' });
    go(3);
    renderFlight();
    runPhases(flight).catch((error) => flightCrash(flight, error));
  }

  async function playPhase(flight, i) {
    const d = delays();
    flight.current = i;
    flight.events.push({ type: 'head', i });
    renderFlight();
    const count = (E.simulation.phases[i] || { logs: [] }).logs.length;
    for (let j = 0; j < count; j += 1) {
      if (!(await wait(flight, d.line))) return false;
      flight.events.push({ type: 'log', i, j });
      renderTerminal();
    }
    if (!(await wait(flight, d.status))) return false;
    flight.events.push({ type: 'status', i });
    renderFlight();
    return wait(flight, d.gap);
  }

  async function runPhases(flight) {
    for (let i = 0; i < 3; i += 1) {
      if (!(await playPhase(flight, i))) return;
    }
    while (modals.length && !flight.cancelled) await whenNoModals(); // never open the crisis over another dialog
    if (flight.cancelled) return;
    flight.events.push({ type: 'anomaly' });
    flight.stage = 'crisis';
    renderFlight();
    openCrisis();
  }

  function flightCrash(flight, error) {
    cancelFlight(flight);
    if (app.dialog && app.dialog.done) app.dialog.done(null);
    if (app.flight === flight) app.flight = null;
    try { E.resetSimulation(); } catch (_) { /* keep going: the build is untouched */ }
    if (!$('#crisis').hidden) closeModal($('#crisis'));
    go(2);
    refresh();
    toast(t('msg.unexpected', { reason: errorText(error) }));
  }

  async function abortFlight() {
    const flight = app.flight;
    if (!flight || flight.stage === 'downlink' || flight.stage === 'done') return;
    const ok = await confirmDialog(() => ({
      title: t('confirm.abort.title'), body: `<p>${esc(t('confirm.abort.body'))}</p>`, ok: t('confirm.abort.ok'), okClass: 'warn'
    }));
    if (!ok || app.flight !== flight || flight.stage === 'downlink' || flight.stage === 'done') return;
    cancelFlight(flight);
    if (!$('#crisis').hidden) closeModal($('#crisis'));
    app.flight = null;
    E.resetSimulation();
    go(2);
    refresh();
    toast(t('msg.aborted'), true);
  }

  function renderTerminal() {
    const flight = app.flight || app.lastFlight;
    const log = $('#termLog');
    if (!flight) { log.textContent = ''; return; }
    const phases = E.simulation.phases;
    const lines = flight.events.map((ev) => {
      const p = ev.i != null ? phases[ev.i] : null;
      switch (ev.type) {
        case 'boot': return t('term.boot');
        case 'head': return p ? `\n${t('term.phase', { i: ev.i + 1, n: 4, title: p.title })}` : '';
        case 'log': return p && p.logs[ev.j] != null ? `  ${p.logs[ev.j]}` : '';
        case 'status': return p ? `  ${t('term.status', { status: t(`status.${p.status}`) })}` : '';
        case 'anomaly': return `\n${t('term.anomaly')}`;
        case 'decision': return `\n${t('term.decision')}`;
        case 'done': return `\n${t('term.done')}`;
        default: return '';
      }
    });
    log.textContent = lines.join('\n');
    log.scrollTop = log.scrollHeight;
  }

  function renderTrack() {
    const flight = app.flight || app.lastFlight;
    const phases = E.simulation.phases;
    const shown = new Set(flight ? flight.events.filter((ev) => ev.type === 'status').map((ev) => ev.i) : []);
    const running = flight && !flight.cancelled && flight.stage !== 'done' && flight.stage !== 'crisis'
      && flight.events.some((ev) => ev.type === 'head' && ev.i === flight.current) && !shown.has(flight.current) ? flight.current : -1;
    $('#phaseTrack').innerHTML = [0, 1, 2, 3].map((i) => {
      const p = phases[i];
      const title = p ? p.title : t(`phase.${i + 1}`);
      let cls = '';
      let status = t('status.PENDING');
      if (shown.has(i) && p) { cls = p.status; status = t(`status.${p.status}`); } else if (i === running) { cls = 'now'; status = t('status.RUNNING'); }
      return `<li class="${cls}"${i === running ? ' aria-current="step"' : ''}>${esc(`${i + 1}. ${title}`)}<span class="st">${esc(status)}</span></li>`;
    }).join('');
  }

  function renderFlight() {
    renderTrack();
    renderTerminal();
    const flight = app.flight;
    const stage = flight ? flight.stage : 'done';
    $('#abortBtn').hidden = !flight || stage === 'downlink' || stage === 'done';
    $('#toReportBtn').hidden = !E.getBlackBoxReport() || (flight && stage !== 'done');
    renderHeader();
  }

  /* ---------- crisis dialog ---------- */
  function renderCrisis() {
    const sim = E.simulation;
    const c = sim.crisis;
    if (!c) return;
    const fk = focusKey();
    const team = currentMode() === 'team';
    $('#crTitle').textContent = c.title;
    $('#crDesc').textContent = c.description;
    const src = $('#crSrc');
    src.hidden = !c.nasaSourceUrl;
    if (c.nasaSourceUrl) {
      src.href = c.nasaSourceUrl;
      src.innerHTML = `${esc(t('cr.source'))} ↗<span class="sr"> ${esc(t('common.newWindow'))}</span>`;
    }
    const crTeam = $('#crTeam');
    crTeam.hidden = !team;
    if (team) {
      crTeam.innerHTML = `<b>${esc(t('cr.teamTitle'))}</b> ${esc(t('cr.teamNote'))}<ul>${ROLES.map((r) =>
        `<li><b>${esc(t(`role.${r.id}.name`))}:</b> ${esc(t(`cr.role.${r.id}`))}</li>`).join('')}</ul>`;
    }
    $('#crHint').textContent = t('cr.hint');
    const eff = app.state.telemetry.science.effectivePoints;
    const target = app.state.telemetry.science.targetMin;
    const sel = app.crisis.selected;
    const busy = app.crisis.busy;
    const rocket = app.state.selectedObjects.rocket;
    const nWarn = app.state.compatibility.warnings.length;
    $('#crOpts').innerHTML = c.options.map((o, i) => {
      const after = Math.max(0, Math.round(eff * o.scienceMultiplier));
      return `<button type="button" class="opt" data-i="${i}" aria-pressed="${sel === i}" ${!o.isAvailable || busy ? 'disabled' : ''}
        ${o.lockReason ? `aria-describedby="why${i}"` : ''} data-fk="opt:${i}">
        <span class="t">${esc(o.text)}</span>
        <span class="chips">
          <span>${esc(t('cr.chance'))}: <b>${esc(t('fmt.pct', { n: num(o.effectiveSurvivalChance * 100, 1) }))}</b></span>
          <span>${esc(t('cr.base', { b: num(o.survivalChance * 100, 0), r: num((rocket ? rocket.reliability : 1) * 100, 1), f: num(E.WARNING_SURVIVAL_FACTOR), n: nWarn }))}</span>
          <span>${esc(t('cr.science'))}: <b>×${esc(num(o.scienceMultiplier))}</b></span>
          <span>${esc(t('cr.after', { a: num(after), b: num(target) }))}${after >= target ? ' ✔' : ' ✖'}</span>
          ${o.requiredRadResistance ? `<span>${esc(t('cr.rad'))}: <b>${esc(num(o.requiredRadResistance))}</b></span>` : ''}
        </span>
        ${o.lockReason ? `<span class="why" id="why${i}">${esc(o.lockReason)}</span>` : ''}
      </button>`;
    }).join('');
    const confirm = $('#crConfirm');
    confirm.textContent = busy ? t('cr.busy') : (team ? t('cr.confirmTeam') : t('cr.confirm'));
    confirm.disabled = sel === null || busy;
    confirm.dataset.fk = 'cr-confirm';
    restoreFocus(fk);
  }
  function openCrisis() {
    app.crisis = { selected: null, busy: false };
    renderCrisis();
    const first = $('#crOpts .opt:not(:disabled)');
    openModal($('#crisis'), { initialFocus: first, onEscape: () => toast(t('cr.needDecision')) });
  }
  function selectCrisisOption(i) {
    const c = E.simulation.crisis;
    if (!c || app.crisis.busy || !c.options[i] || !c.options[i].isAvailable) return;
    app.crisis.selected = i;
    renderCrisis();
    restoreFocus(`opt:${i}`);
  }
  async function confirmCrisis() {
    const flight = app.flight;
    if (!flight || flight.stage !== 'crisis' || app.crisis.busy || app.crisis.selected === null) return;
    app.crisis.busy = true;
    renderCrisis();
    try {
      E.resolveCrisis(app.crisis.selected);
    } catch (error) {
      app.crisis.busy = false;
      renderCrisis();
      toast(t('msg.actionFail', { reason: errorText(error) }));
      return;
    }
    closeModal($('#crisis'));
    flight.stage = 'downlink';
    flight.events.push({ type: 'decision' });
    renderFlight();
    try {
      if (!(await playPhase(flight, 3))) return;
      flight.events.push({ type: 'done' });
      flight.stage = 'done';
      renderFlight();
      await wait(flight, delays().end);
      if (flight.cancelled) return;
      app.lastFlight = flight;
      app.flight = null;
      renderReport();
      go(4);
    } catch (error) {
      flightCrash(flight, error);
    }
  }

  /* ---------- screen 4: report ---------- */
  function luckVerdict(r) {
    const sv = r.analysis.survival;
    const chance = num(sv.survivalChance * 100, 1);
    const roll = num(sv.roll * 100, 1);
    if (r.status === 'FAILED') {
      return sv.survivalChance >= 0.75
        ? { cls: 'bad', text: t('luck.unlucky', { chance, roll }) }
        : { cls: 'design', text: t('luck.risky', { chance, roll, n: sv.warningsCount, opt: num(sv.optionChance * 100, 0) }) };
    }
    if (r.status === 'PARTIAL') return { cls: 'design', text: t('luck.partial', { chance, roll }) };
    return { cls: '', text: t('luck.success', { chance, roll }) };
  }

  function reportTips(r) {
    const a = r.analysis;
    const tl = a.telemetry;
    const tips = [];
    const codes = new Set(a.warnings.map((w) => w.code));
    const foreign = a.warnings.filter((w) => w.code === 'INSTRUMENT_TARGET').map((w) => abbr(INST.get(w.instrumentId)));
    if (foreign.length) tips.push(t('tip.incompat', { names: foreign.join(', ') }));
    if (codes.has('COMMS_BOTTLENECK')) {
      tips.push(t('tip.comms', { gen: num(tl.dataAndComms.generatedPerDay), link: num(tl.dataAndComms.maxTransmittedPerDay), p: num(tl.dataAndComms.bottleneckRatio * 100, 0) }));
    }
    if (codes.has('POWER_DEFICIT')) tips.push(t('tip.power', { n: num(-tl.power.netBalance), f: num(E.POWER_DEFICIT_FACTOR) }));
    if (codes.has('BATTERY_DEFICIT')) tips.push(t('tip.battery', { n: num(tl.power.batteryRequired - tl.power.batteryCapacity) }));
    if (codes.has('RADIATION')) tips.push(t('tip.rad', { have: num(tl.radiation.spacecraftMinRad), need: num(tl.radiation.requiredRad) }));
    if (codes.has('TIME_OVER')) tips.push(t('tip.time', { over: tl.time.usedMonths - tl.time.maxMonths }));
    if (codes.has('SCIENCE_SHORT')) tips.push(t('tip.science', { missing: tl.science.targetMin - tl.science.effectivePoints }));
    const crisis = E.simulation.crisis;
    if (crisis) {
      const chosen = crisis.options[a.optionIndex];
      const better = crisis.options.some((o, i) => i !== a.optionIndex && o.isAvailable
        && Math.round(tl.science.effectivePoints * o.scienceMultiplier) >= tl.science.targetMin);
      if (r.status === 'PARTIAL' && better) tips.push(t('tip.crisisScience'));
      if (r.status === 'FAILED' && chosen && chosen.survivalChance < 0.7) tips.push(t('tip.crisisRisk', { p: num(chosen.survivalChance * 100, 0) }));
      const locked = crisis.options.filter((o) => !o.isAvailable);
      if (locked.length) tips.push(t('tip.locked', { need: num(locked[0].requiredRadResistance) }));
    }
    if (r.status === 'SUCCESS' && r.rank !== 'S') tips.push(t('tip.reserve', { b: num(a.score.budgetReserve * 100, 0), tm: num(a.score.timeReserve * 100, 0) }));
    if (!tips.length) {
      if (r.status === 'FAILED') tips.push(t('tip.retry'));
      else if (r.rank === 'S') tips.push(r.finalScore >= 100 ? t('tip.perfect') : t('tip.topRank', { n: 100 - r.finalScore }));
      else tips.push(t('tip.none'));
    }
    return tips;
  }

  function renderReport() {
    const root = $('#report');
    const r = E.getBlackBoxReport();
    if (!r) {
      root.innerHTML = `<h1 class="h" id="repTitle">${esc(t('rep.title'))}</h1><p>${esc(t('rep.none'))}</p>`;
      return;
    }
    const fk = focusKey();
    const a = r.analysis;
    const sci = a.science;
    const sc = a.score;
    const colors = { SUCCESS: 'var(--gn)', PARTIAL: 'var(--am)', FAILED: 'var(--rd)' };
    const col = colors[r.status] || 'var(--cy)';
    const verdict = luckVerdict(r);
    const wf = [];
    if (sci.incompatiblePoints > 0) wf.push(['loss', t('wf.incompat'), `−${num(sci.incompatiblePoints)}`]);
    wf.push(['', t('wf.raw'), num(sci.rawPoints)]);
    if (sci.bottleneckRatio < 1) wf.push(['loss', t('wf.comms', { p: num(sci.bottleneckRatio * 100, 0) }), num(sci.afterComms, 1)]);
    if (sci.powerDeficit) wf.push(['loss', t('wf.power', { f: num(sci.powerFactor) }), num(sci.afterComms * sci.powerFactor, 1)]);
    wf.push(['', t('wf.eff'), num(sci.effectivePoints)]);
    wf.push([sci.scienceMultiplier < 1 ? 'loss' : '', t('wf.crisis', { m: num(sci.scienceMultiplier) }), num(sci.afterCrisis)]);
    if (!sci.survived) wf.push(['zero', t('wf.lost'), '0']);
    wf.push(['final', t('wf.final', { target: num(sci.targetMin) }), num(sci.finalScience)]);
    const scoreHow = r.status === 'FAILED' ? t('rep.scoreFailed') : t('rep.scoreHow', {
      ratio: num(sc.scienceRatio), sp: num(sc.sciencePart, 1), br: num(sc.budgetReserve), bp: num(sc.budgetPart, 1),
      tr: num(sc.timeReserve), tp: num(sc.timePart, 1), raw: num(sc.rawScore), cap: num(sc.cap), final: num(sc.finalScore)
    });
    root.innerHTML = `
      <h1 class="h" id="repTitle">${esc(t('rep.title'))}: ${esc(t(`data.mission.${a.missionId}.short`))}</h1>
      <div class="badge ${esc(r.status)}">${esc(t(`status.${r.status}`))}</div>
      <div class="sc">
        <div><div class="big" style="color:${col}">${esc(num(r.finalScore))}</div>${esc(t('rep.scoreOf'))}</div>
        <div class="rank" style="border-color:${col};color:${col}" aria-label="${esc(t('rep.rankLabel', { rank: r.rank }))}">${esc(r.rank)}</div>
        <div>${esc(t('rep.finalScience'))}: <b>${esc(num(r.finalScience))}</b> / ${esc(num(sci.targetMin))}<br>
          ${esc(t('rep.roll'))}: <b style="color:${r.survivalRollPassed ? 'var(--gn)' : 'var(--rd)'}">${esc(r.survivalRollPassed ? t('rep.passed') : t('rep.failed'))}</b>
          (${esc(t('rep.rollDetail', { roll: num(a.survival.roll * 100, 1), chance: num(a.survival.survivalChance * 100, 1) }))})</div>
      </div>
      <p class="luck ${verdict.cls}">${esc(verdict.text)}</p>
      <div class="rep-grid">
        <div class="panel"><h2 class="ptitle">${esc(t('rep.waterfall'))}</h2>
          <ol class="wf">${wf.map(([cls, label, value]) => `<li class="${cls}"><span>${esc(label)}</span><b>${esc(value)}</b></li>`).join('')}</ol>
          <p class="hint">${esc(t('rep.waterfallNote'))}</p></div>
        <div class="panel"><h2 class="ptitle">${esc(t('rep.scoreTitle'))}</h2><p>${esc(scoreHow)}</p><p class="hint">${esc(t('rep.rankHow'))}</p>
          <p>${esc(t('rep.survivalHow', { opt: num(a.survival.optionChance * 100, 0), rel: num(a.survival.reliability * 100, 1), f: num(E.WARNING_SURVIVAL_FACTOR), n: a.survival.warningsCount, chance: num(a.survival.survivalChance * 100, 1) }))}</p></div>
        <div class="panel"><h2 class="ptitle">${esc(t('rep.tips'))}</h2><ul class="tips">${reportTips(r).map((x) => `<li>${esc(x)}</li>`).join('')}</ul></div>
        <div class="panel"><h2 class="ptitle">${esc(t('rep.insights'))}</h2><ul class="ins">${r.insights.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></div>
      </div>
      <div class="panel" style="margin-top:14px"><h2 class="ptitle">${esc(t('rep.sources'))}</h2>
        <p class="hint">${esc(t('rep.sourcesNote'))}</p>
        <div class="cards3">${r.usedNasaSources.map((s) => `<div class="item" style="padding:10px">
          <b class="nm">${esc(s.name)}</b>${s.origin === 'game' ? ` <span class="origin game">${esc(t('origin.game'))}</span>` : ''}
          ${hasSpecs(s.verifiedSpecs) ? `<div class="vs"><span class="nv">${esc(t('vs.badge'))}</span>${specList(s.id, s.verifiedSpecs)}</div>` : ''}
          <p>${esc(s.nasaInfo)}</p>${sourceLink(s.url, String(s.url).replace(/^https?:\/\//, '').slice(0, 52))}</div>`).join('')}</div></div>
      <div class="panel" style="margin-top:14px"><h2 class="ptitle">${esc(t('rep.code'))}</h2>
        <label class="sr" for="bpCode">${esc(t('share.exportLabel'))}</label>
        <textarea id="bpCode" class="code" readonly>${esc(r.blueprintCode)}</textarea>
        <div class="row">
          <button type="button" id="copyBtn" class="btn" data-fk="rep:copy">${esc(t('rep.copy'))}</button>
          <button type="button" id="newFlightBtn" class="btn ghost" data-fk="rep:new">${esc(t('rep.newFlight'))}</button>
          <button type="button" id="modBtn" class="btn ghost" data-fk="rep:mod">${esc(t('rep.modify'))}</button>
          <button type="button" id="newMissionBtn" class="btn ghost" data-fk="rep:missions">${esc(t('rep.newMission'))}</button>
        </div>
        <p class="hint">${esc(t('rep.newFlightNote'))}</p></div>`;
    restoreFocus(fk);
  }

  async function newFlight() {
    if (app.flight) return;
    E.resetSimulation();
    app.lastFlight = null;
    app.state = E.getState();
    toast(t('msg.newFlight'), true);
    go(2);
    refresh();
    await launch();
  }

  /* ---------- language ---------- */
  function setLanguage(lang) {
    const fk = focusKey();
    const active = document.activeElement;
    const langButtonInModal = active && active.dataset && active.dataset.lang && active.closest('.modal');
    I.setLang(lang);
    if (langButtonInModal) {
      const same = $(`[data-lang="${lang}"]`, langButtonInModal);
      if (same) same.focus();
    } else restoreFocus(fk);
  }
  function renderAll() {
    const fk = focusKey();
    applyStatic();
    $('#toast').hidden = true;
    refresh();
    if (!$('#crisis').hidden) renderCrisis();
    if (app.dialog && app.dialog.render) app.dialog.render();
    if (!$('#shareDlg').hidden) renderShareDialog();
    syncHeaderHeight();
    restoreFocus(fk);
  }

  /* ---------- events ---------- */
  document.addEventListener('click', (event) => {
    const langBtn = event.target.closest('[data-lang]');
    if (langBtn) { act(() => setLanguage(langBtn.dataset.lang)); return; }
    const dlgBtn = event.target.closest('[data-dlg]');
    if (dlgBtn && app.dialog) {
      const action = dlgBtn.dataset.dlg;
      if (app.dialog.kind === 'choice') app.dialog.done(action);
      else act(() => tutorialAction(action));
      return;
    }
    const opt = event.target.closest('#crOpts .opt');
    if (opt) { act(() => selectCrisisOption(Number(opt.dataset.i))); return; }
    const el = event.target.closest('[data-act]');
    if (!el) return;
    const d = el.dataset;
    act(() => {
      switch (d.act) {
        case 'start': return startMission(d.id);
        case 'pick': return pick(d.kind, d.id, d.cat);
        case 'preview': return togglePreview(d.kind, d.id, d.cat);
        case 'pv-close': { const key = app.preview && app.preview.key; app.preview = null; renderCatalog(); return restoreFocus(key ? `pv:${key}` : null); }
        case 'slot': return jumpTo(d.tab, d.target);
        case 'preset': return applyPreset(d.id);
        case 'copy': return copyFrom(d.src);
        case 'open-share': return openShare();
        case 'team-size': return setTeamSize(Number(d.n));
        case 'approve': return toggleApproval(Number(d.i));
        case 'restore-draft': return restoreDraft();
        case 'discard-draft': return discardDraft();
        case 'continue-build': go(2); return refresh();
        case 'view-report': go(4); return renderReport();
        default: return undefined;
      }
    });
  });

  $('#tabs').addEventListener('click', (event) => {
    const btn = event.target.closest('[data-tab]');
    if (btn) act(() => setTab(btn.dataset.tab));
  });
  $('#tabs').addEventListener('keydown', (event) => {
    const order = ['launch', 'bus', 'inst'];
    const i = order.indexOf(app.tab);
    let next = null;
    if (event.key === 'ArrowRight') next = order[(i + 1) % order.length];
    if (event.key === 'ArrowLeft') next = order[(i + order.length - 1) % order.length];
    if (event.key === 'Home') next = order[0];
    if (event.key === 'End') next = order[order.length - 1];
    if (next) { event.preventDefault(); act(() => setTab(next, { focus: true })); }
  });
  $('#catalogBody').addEventListener('change', (event) => {
    if (event.target.id === 'fc') {
      app.onlyCompat = event.target.checked;
      act(() => { renderCatalog(); $('#fc').focus(); });
    }
  });
  $('#teamPanel').addEventListener('input', (event) => {
    const i = event.target.dataset.player;
    if (i == null) return;
    app.team.names[Number(i)] = event.target.value.slice(0, 24);
    saveTeam();
    $$(`[data-act="approve"][data-i="${i}"]`).forEach((btn) => {
      const ok = app.team.approvals.includes(Number(i));
      btn.textContent = ok ? t('team.approved', { name: playerName(Number(i)) }) : t('team.approve', { name: playerName(Number(i)) });
    });
  });
  $$('#modeSeg button').forEach((btn) => btn.addEventListener('click', () => act(() => setMode(btn.dataset.mode))));
  $('#homeBtn').addEventListener('click', () => act(() => {
    if (app.flight) { toast(t('msg.flightLocked')); return; }
    go(1);
    renderS1();
  }));
  $('#helpBtn').addEventListener('click', () => act(() => openTutorial(0)));
  $('#tutorialBtn').addEventListener('click', () => act(() => openTutorial(0)));
  $('#startEarthBtn').addEventListener('click', () => act(() => startMission('m3')));
  $('#shareBtn').addEventListener('click', () => act(openShare));
  $('#shareClose').addEventListener('click', () => act(closeShare));
  $('#importBtn').addEventListener('click', () => act(doImport));
  $('#launchBtn').addEventListener('click', () => act(launch));
  $('#qbLaunch').addEventListener('click', () => act(launch));
  $('#qbCheck').addEventListener('click', () => act(() => {
    $('#telem').scrollIntoView({ block: 'start' });
    $('#launchBtn').focus({ preventScroll: true });
  }));
  $('#abortBtn').addEventListener('click', () => act(abortFlight));
  $('#toReportBtn').addEventListener('click', () => act(() => { go(4); renderReport(); }));
  $('#crConfirm').addEventListener('click', () => act(confirmCrisis));
  $('#report').addEventListener('click', (event) => {
    const btn = event.target.closest('button');
    if (!btn) return;
    act(() => {
      if (btn.id === 'copyBtn') return copyFrom('bpCode');
      if (btn.id === 'modBtn') { go(2); return refresh(); }
      if (btn.id === 'newFlightBtn') return newFlight();
      if (btn.id === 'newMissionBtn') { go(1); return renderS1(); }
      return undefined;
    });
  });
  window.addEventListener('resize', syncHeaderHeight);
  window.addEventListener('unhandledrejection', (event) => {
    event.preventDefault();
    toast(t('msg.actionFail', { reason: errorText(event.reason) }));
  });

  /* ---------- init ---------- */
  function init() {
    loadTeam();
    loadDraft();
    I.onChange(renderAll);
    applyStatic();
    go(1, { focus: false });
    renderS1();
    syncHeaderHeight();
    if (window.ResizeObserver) new ResizeObserver(syncHeaderHeight).observe($('#top'));
    if (!store.get(KEYS.tutorial) && !app.draft.pending && !app.draft.error) openTutorial(0);
  }
  init();

  // Read-only hooks for automated UI tests and debugging (no state changes).
  window.PZ_UI = Object.freeze({
    screen: () => app.screen,
    flightStage: () => (app.flight ? app.flight.stage : null),
    teamStatus: () => teamStatus(),
    tab: () => app.tab
  });
})();
