/* PAYLOAD ZERO — localization core (uk/en).
 * Classic browser script: load after nasa_data.js and before engine.js / ui.js.
 * Dictionaries live in i18n-dict.js (uk and en, symmetric keys).
 *
 * Template syntax inside dictionary strings:
 *   {name}        parameter (numbers use Intl.NumberFormat, max 2 decimals)
 *   {name:int}    rounded integer        {name:1}  max 1 decimal
 *   {name:pct}    fraction shown as percent number (0.97 -> 97), max 1 decimal
 *   {name#unit}   number + plural form of unit.<unit> (1 бал / 2 бали / 5 балів)
 *   {name@unit}   plural word only
 * A parameter may itself be a message reference: { key: 'cat.power', params: {} }.
 */
(function (global) {
  'use strict';

  const LANGS = Object.freeze(['uk', 'en']);
  const LOCALES = Object.freeze({ uk: 'uk-UA', en: 'en-US' });
  const STORAGE_KEY = 'pz.lang';
  const DICT = { uk: {}, en: {} };
  const listeners = [];
  const missing = new Set();
  const warned = new Set();
  const formatters = new Map();
  const pluralRules = new Map();

  function isStrict() {
    if (global.PZ_I18N_STRICT === true) return true;
    if (global.PZ_I18N_STRICT === false) return false;
    try {
      const search = (global.location && global.location.search) || '';
      return /[?&](dev|i18n=strict)(\b|=|&|$)/.test(search);
    } catch (_) {
      return false;
    }
  }

  function readStoredLang() {
    try {
      const store = global.localStorage;
      const value = store && store.getItem(STORAGE_KEY);
      return LANGS.includes(value) ? value : null;
    } catch (_) {
      return null;
    }
  }

  function detectLang() {
    const stored = readStoredLang();
    if (stored) return stored;
    try {
      const nav = global.navigator;
      const primary = nav && ((nav.languages && nav.languages[0]) || nav.language);
      if (typeof primary === 'string' && /^uk(\b|-|_|$)/i.test(primary)) return 'uk';
    } catch (_) { /* navigator may be missing or locked down */ }
    return 'en';
  }

  let lang = 'en';

  function locale(l = lang) { return LOCALES[l] || LOCALES.en; }

  function numberFormat(l, maxFrac, minFrac) {
    const id = `${l}|${maxFrac}|${minFrac}`;
    if (!formatters.has(id)) {
      formatters.set(id, new Intl.NumberFormat(locale(l), {
        maximumFractionDigits: maxFrac, minimumFractionDigits: minFrac
      }));
    }
    return formatters.get(id);
  }

  function num(value, maxFrac = 2, minFrac = 0, l = lang) {
    if (typeof value !== 'number' || !Number.isFinite(value)) return '—';
    const rounded = Number(value.toFixed(Math.min(20, maxFrac)));
    return numberFormat(l, maxFrac, Math.min(minFrac, maxFrac)).format(Object.is(rounded, -0) ? 0 : rounded);
  }

  function pct(fraction, maxFrac = 1, l = lang) {
    return num(typeof fraction === 'number' ? fraction * 100 : fraction, maxFrac, 0, l);
  }

  function pluralCategory(n, l = lang) {
    if (!pluralRules.has(l)) pluralRules.set(l, new Intl.PluralRules(locale(l)));
    return pluralRules.get(l).select(Math.abs(n));
  }

  function lookup(key, l) {
    const dict = DICT[l];
    return dict && Object.prototype.hasOwnProperty.call(dict, key) ? dict[key] : undefined;
  }

  function reportMissing(key, l) {
    const id = `${l}:${key}`;
    missing.add(id);
    if (isStrict()) throw new Error(`[i18n] Missing key "${key}" for language "${l}".`);
    if (!warned.has(id) && global.console) {
      warned.add(id);
      global.console.warn(`[i18n] Missing key "${key}" for language "${l}".`);
    }
  }

  function plural(unit, n, l = lang) {
    const forms = lookup(`unit.${unit}`, l);
    if (!forms || typeof forms !== 'object') {
      reportMissing(`unit.${unit}`, l);
      return `⟦unit.${unit}⟧`;
    }
    const category = pluralCategory(n, l);
    return forms[category] || forms.other;
  }

  function renderParam(value, l) {
    if (value === null || value === undefined) return '';
    if (typeof value === 'number') return num(value, 2, 0, l);
    if (Array.isArray(value)) return value.map((item) => renderParam(item, l)).join(', ');
    if (typeof value === 'object' && typeof value.key === 'string') return t(value.key, value.params, l);
    return String(value);
  }

  function applyFormat(value, format, l) {
    if (typeof value !== 'number') return renderParam(value, l);
    switch (format) {
      case 'int': return num(Math.round(value), 0, 0, l);
      case '1': return num(value, 1, 0, l);
      case '0': return num(value, 0, 0, l);
      case 'pct': return pct(value, 1, l);
      case 'pct0': return pct(value, 0, l);
      default: return num(value, 2, 0, l);
    }
  }

  function interpolate(template, params, l) {
    return template.replace(/\{(\w+)(?::(\w+))?(?:([#@])(\w+))?\}/g, (match, name, format, mark, unit) => {
      if (!params || !Object.prototype.hasOwnProperty.call(params, name)) {
        if (isStrict()) throw new Error(`[i18n] Missing parameter "${name}" in template "${template}".`);
        return match;
      }
      const value = params[name];
      if (mark) {
        const n = typeof value === 'number' ? value : Number(value);
        const word = plural(unit, n, l);
        return mark === '@' ? word : `${applyFormat(n, format, l)} ${word}`;
      }
      return applyFormat(value, format, l);
    });
  }

  function t(key, params, l = lang) {
    const value = lookup(key, l);
    if (typeof value !== 'string') {
      reportMissing(key, l);
      return `⟦${key}⟧`;
    }
    return interpolate(value, params || {}, l);
  }

  function has(key, l = lang) { return typeof lookup(key, l) === 'string'; }

  function setLang(next, options = {}) {
    if (!LANGS.includes(next)) return lang;
    const changed = next !== lang;
    lang = next;
    if (options.persist !== false) {
      try {
        if (global.localStorage) global.localStorage.setItem(STORAGE_KEY, next);
      } catch (_) { /* storage unavailable: the choice lasts for this session only */ }
    }
    if (changed || options.force) listeners.slice().forEach((fn) => {
      try { fn(lang); } catch (error) { if (global.console) global.console.error(error); }
    });
    return lang;
  }

  function onChange(fn) {
    listeners.push(fn);
    return () => { const i = listeners.indexOf(fn); if (i >= 0) listeners.splice(i, 1); };
  }

  function date(iso, l = lang) {
    if (typeof iso !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return String(iso);
    const d = new Date(`${iso}T00:00:00Z`);
    if (Number.isNaN(d.getTime())) return iso;
    return new Intl.DateTimeFormat(locale(l), { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' }).format(d);
  }

  /** Register a dictionary: called from i18n-dict.js. */
  function register(l, entries) {
    if (!LANGS.includes(l)) throw new Error(`[i18n] Unsupported language ${l}`);
    Object.assign(DICT[l], entries);
  }

  lang = detectLang();

  global.I18N = {
    LANGS, LOCALES, STORAGE_KEY, DICT,
    t, has, plural, num, pct, date, locale, register, setLang, onChange,
    getLang: () => lang,
    detectLang,
    isStrict,
    missing
  };
})(typeof window !== 'undefined' ? window : globalThis);
