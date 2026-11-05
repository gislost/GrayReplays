'use strict';
// GrayReplays: NQ / ES bar-replay backtester. Data comes from data/data.js (written by fetch-data.ps1)
// as 1-minute candles, optionally extended by monthly history chunks in data/hist.
// Every other timeframe is built from the 1-minute candles.

const LW = window.LightweightCharts;
const SYMS = ['NQ', 'ES'];
const POINT_VALUE = { NQ: 20, ES: 50 };
const MICRO_VALUE = { NQ: 2, ES: 5 };
const MICRO_NAME = { NQ: 'MNQ', ES: 'MES' };
const DEFAULT_SL = { NQ: 20, ES: 5 };
const DEFAULT_TP = { NQ: 0, ES: 0 }; // 0 = use stop x R:R
const TICK = 0.25;
const TFS = [['1m', 1], ['3m', 3], ['5m', 5], ['15m', 15], ['30m', 30], ['1h', 60], ['4h', 240], ['D', 1440], ['W', 10080]];

// Killzones in New York time, as minutes after midnight. Alpha is scaled per theme.
const KILLZONES = [
  { name: 'Asia', from: 20 * 60, to: 24 * 60, rgb: '156, 39, 176', a: 0.10 },
  { name: 'London', from: 2 * 60, to: 5 * 60, rgb: '41, 98, 255', a: 0.12 },
  { name: 'NY AM', from: 8 * 60 + 30, to: 11 * 60, rgb: '8, 153, 129', a: 0.12 },
  { name: 'NY Lunch', from: 12 * 60, to: 13 * 60, rgb: '120, 123, 134', a: 0.10 },
  { name: 'NY PM', from: 13 * 60 + 30, to: 16 * 60, rgb: '255, 152, 0', a: 0.10 },
];

// Session opens for "Jump to", NY minutes after midnight
const SESSIONS = [
  ['globex', 'Globex / Asia open 18:00', 18 * 60],
  ['asiakz', 'Asia killzone 20:00', 20 * 60],
  ['midnight', 'Midnight open 00:00', 0],
  ['london', 'London open 02:00', 2 * 60],
  ['nyam', 'NY AM killzone 08:30', 8 * 60 + 30],
  ['nyopen', 'NY open 09:30', 9 * 60 + 30],
  ['nypm', 'NY PM 13:30', 13 * 60 + 30],
];
const JUMP_TOLERANCE = 30 * 60; // first candle must be this close to the session time, else try the next day

const THEMES = [
  { id: 'graphite', name: 'Graphite',
    css: { bg: '#131722', panel: '#1e222d', line: '#2a2e39', text: '#d1d4dc', muted: '#787b86', accent: '#2962ff', up: '#089981', down: '#f23645' },
    chart: { bg: '#131722', grid: '#1f2330', text: '#d1d4dc', border: '#2a2e39' },
    candle: { up: '#089981', down: '#f23645', wickUp: '#089981', wickDown: '#f23645' },
    levels: { mo: '#e0e3eb', pd: '#f7a600', pw: '#ab47bc' }, kz: 1 },
  { id: 'paper', name: 'Paper (light)',
    css: { bg: '#ffffff', panel: '#f3f4f6', line: '#d9dce3', text: '#1c1f26', muted: '#6b6f7b', accent: '#2962ff', up: '#078a74', down: '#e02f3f' },
    chart: { bg: '#ffffff', grid: '#eff1f4', text: '#30333c', border: '#d9dce3' },
    candle: { up: '#089981', down: '#f23645', wickUp: '#089981', wickDown: '#f23645' },
    levels: { mo: '#4a4e5a', pd: '#d48806', pw: '#8e24aa' }, kz: 0.85 },
  { id: 'abyss', name: 'Abyss Blue',
    css: { bg: '#0a1222', panel: '#101b30', line: '#1d2b47', text: '#cdd8ee', muted: '#7183a6', accent: '#3d8bfd', up: '#26c6da', down: '#ff6b6b' },
    chart: { bg: '#0a1222', grid: '#122039', text: '#cdd8ee', border: '#1d2b47' },
    candle: { up: '#26c6da', down: '#ff6b6b', wickUp: '#4dd0e1', wickDown: '#ff8a80' },
    levels: { mo: '#e3ecff', pd: '#ffca28', pw: '#b388ff' }, kz: 1.25 },
  { id: 'ink', name: 'Ink (mono)',
    css: { bg: '#111111', panel: '#1a1a1a', line: '#2e2e2e', text: '#e2e2e2', muted: '#8c8c8c', accent: '#bdbdbd', up: '#9ccc9c', down: '#d98c8c' },
    chart: { bg: '#111111', grid: '#1b1b1b', text: '#cfcfcf', border: '#2e2e2e' },
    candle: { up: '#f0f0f0', down: '#505050', wickUp: '#c8c8c8', wickDown: '#8a8a8a' },
    levels: { mo: '#ffffff', pd: '#b0b0b0', pw: '#808080' }, kz: 0.6, kzRgb: '200, 200, 200' },
  { id: 'nightshade', name: 'Nightshade',
    css: { bg: '#1d1a2b', panel: '#262238', line: '#3a3552', text: '#f0eefc', muted: '#9a93b8', accent: '#bd93f9', up: '#50fa7b', down: '#ff5577' },
    chart: { bg: '#1d1a2b', grid: '#27233a', text: '#e6e2f8', border: '#3a3552' },
    candle: { up: '#50fa7b', down: '#ff5577', wickUp: '#50fa7b', wickDown: '#ff5577' },
    levels: { mo: '#f8f8f2', pd: '#ffb86c', pw: '#8be9fd' }, kz: 1.3 },
  { id: 'neon', name: 'Neon Contrast',
    css: { bg: '#000000', panel: '#0b0b0b', line: '#333333', text: '#ffffff', muted: '#a6a6a6', accent: '#00e5ff', up: '#00ff9c', down: '#ff2e63' },
    chart: { bg: '#000000', grid: '#121212', text: '#ffffff', border: '#3a3a3a' },
    candle: { up: '#00ff9c', down: '#ff2e63', wickUp: '#00ff9c', wickDown: '#ff2e63' },
    levels: { mo: '#ffffff', pd: '#ffe600', pw: '#d36bff' }, kz: 1.5 },
];

const COLORS = { bg: '#131722', grid: '#1f2330', text: '#d1d4dc', border: '#2a2e39', up: '#089981', down: '#f23645', entry: '#2962ff',
  candleUp: '#089981', candleDown: '#f23645', wickUp: '#089981', wickDown: '#f23645' };
const STORE_KEY = 'grayreplays-v1';
const OLD_STORE_KEY = 'nqes-replay-v1';
const $ = (id) => document.getElementById(id);

// ---------- Time ----------
// Charts show times as UTC, so every candle also gets "tl": its New York wall-clock time
// stored as if it were UTC. All session math (killzones, days, 4h candles) uses tl.

const nyFmt = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/New_York', hourCycle: 'h23',
  year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
});
const offsetCache = new Map();
function nyOffset(t) {
  const hour = Math.floor(t / 3600);
  let off = offsetCache.get(hour);
  if (off === undefined) {
    const p = {};
    for (const part of nyFmt.formatToParts(new Date(hour * 3600000))) p[part.type] = part.value;
    off = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute) / 1000 - hour * 3600;
    offsetCache.set(hour, off);
  }
  return off;
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
function fmtTl(tl, withDay) {
  const d = new Date(tl * 1000);
  const s = d.toISOString().slice(0, 16).replace('T', ' ');
  return withDay ? `${DAYS[d.getUTCDay()]} ${s}` : s;
}

// Start time of the candle a minute belongs to. Daily candles run 18:00-17:00 like CME,
// 4h candles start at 18:00, and weekly candles start Sunday 18:00 (labelled by their Monday).
function bucketOf(tl, m) {
  if (m === 10080) {
    const day = Math.floor((tl + 21600) / 86400);
    return (Math.floor((day + 3) / 7) * 7 - 3) * 86400;
  }
  if (m === 1440) return Math.floor((tl + 21600) / 86400) * 86400;
  const size = m * 60;
  if (m <= 60) return Math.floor(tl / size) * size;
  const anchor = 18 * 3600;
  return Math.floor((tl - anchor) / size) * size + anchor;
}

function tfLabel(m) {
  const p = TFS.find((x) => x[1] === m);
  if (p) return p[0];
  return m % 60 === 0 ? `${m / 60}h` : `${m}m`;
}

// ---------- Data ----------

// Accepts rows ([[t,o,h,l,c,v], ...]) or a flat array/typed array with 6 numbers per candle
function loadSymbol(d) {
  const rows = d.length > 0 && Array.isArray(d[0]);
  const n = rows ? d.length : Math.floor(d.length / 6);
  const s = {
    n, t: new Float64Array(n), tl: new Float64Array(n),
    o: new Float64Array(n), h: new Float64Array(n), l: new Float64Array(n), c: new Float64Array(n),
    agg: {},
  };
  for (let i = 0; i < n; i++) {
    let t;
    if (rows) {
      const r = d[i];
      t = r[0]; s.o[i] = r[1]; s.h[i] = r[2]; s.l[i] = r[3]; s.c[i] = r[4];
    } else {
      const j = i * 6;
      t = d[j]; s.o[i] = d[j + 1]; s.h[i] = d[j + 2]; s.l[i] = d[j + 3]; s.c[i] = d[j + 4];
    }
    s.t[i] = t; s.tl[i] = t + nyOffset(t);
  }
  return s;
}

// Full candles for a timeframe, plus which candle each minute falls in
function getAgg(s, m) {
  if (s.agg[m]) return s.agg[m];
  const A = { time: [], first: [], last: [], o: [], h: [], l: [], c: [], idxOf: new Int32Array(s.n) };
  let bucket = null, k = -1;
  for (let i = 0; i < s.n; i++) {
    const b = bucketOf(s.tl[i], m);
    if (b !== bucket) {
      bucket = b; k++;
      A.time.push(b); A.first.push(i); A.last.push(i);
      A.o.push(s.o[i]); A.h.push(s.h[i]); A.l.push(s.l[i]); A.c.push(s.c[i]);
    } else {
      A.last[k] = i; A.c[k] = s.c[i];
      if (s.h[i] > A.h[k]) A.h[k] = s.h[i];
      if (s.l[i] < A.l[k]) A.l[k] = s.l[i];
    }
    A.idxOf[i] = k;
  }
  return (s.agg[m] = A);
}

// Candle k as it looked at minute "cur" (still forming if cur is before its last minute)
function candleAt(s, A, k, cur) {
  const end = Math.min(cur, A.last[k]);
  if (end === A.last[k]) return { time: A.time[k], open: A.o[k], high: A.h[k], low: A.l[k], close: A.c[k] };
  let hi = -Infinity, lo = Infinity;
  for (let i = A.first[k]; i <= end; i++) {
    if (s.h[i] > hi) hi = s.h[i];
    if (s.l[i] < lo) lo = s.l[i];
  }
  return { time: A.time[k], open: A.o[k], high: hi, low: lo, close: s.c[end] };
}

// Last minute index at or before UTC time t, or -1
function indexAt(s, t) {
  let lo = 0, hi = s.n - 1, ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (s.t[mid] <= t) { ans = mid; lo = mid + 1; } else hi = mid - 1;
  }
  return ans;
}

// First index whose value in arr is >= v
function lowerBound(arr, v) {
  let lo = 0, hi = arr.length;
  while (lo < hi) { const mid = (lo + hi) >> 1; if (arr[mid] < v) lo = mid + 1; else hi = mid; }
  return lo;
}

const roundTick = (p) => Math.round(p / TICK) * TICK;
const fmtPrice = (p) => p.toFixed(2);
const fmtPts = (p) => (Math.round(p * 100) / 100).toString();
const fmtUsd = (v) => (v < 0 ? '-$' : '$') + Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// ---------- Long history (data/hist) ----------
// manifest.js lists the months available; each month is a script calling MD_CHUNK.
// Only a few months around the replay time are kept in memory.

const HIST = {
  on: false, base: 'data/hist/', man: null, all: [], months: [],
  chunks: { NQ: new Map(), ES: new Map() }, jobs: new Map(), gen: 0, ext: null, loading: 0,
};
const LOOKAHEAD = 3 * 86400; // load the next month when this close to the end of loaded data
const KEEP_BEHIND = 122 * 86400; // drop months that ended longer ago than this

window.MD_CHUNK = (sym, month, flat) => { if (HIST.chunks[sym]) HIST.chunks[sym].set(month, flat); };

const monthKey = (t) => new Date(t * 1000).toISOString().slice(0, 7);
const monthStart = (key) => Date.UTC(+key.slice(0, 4), +key.slice(5, 7) - 1, 1) / 1000;
const addMonths = (key, n) => new Date(Date.UTC(+key.slice(0, 4), +key.slice(5, 7) - 1 + n, 1)).toISOString().slice(0, 7);
const windowAround = (t) => [-2, -1, 0, 1].map((n) => addMonths(monthKey(t), n));

function loadScript(src) {
  return new Promise((resolve) => {
    const el = document.createElement('script');
    el.src = src;
    el.onload = () => { el.remove(); resolve(true); };
    el.onerror = () => { el.remove(); resolve(false); };
    document.head.appendChild(el);
  });
}

function setLoading(d) {
  HIST.loading += d;
  $('loading').style.display = HIST.loading > 0 ? '' : 'none';
}

async function initHistory() {
  // ?hist=<folder> points at another history folder (relative, or a local server) for testing
  const param = new URLSearchParams(location.search).get('hist');
  if (param && (!param.includes('://') || /^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?\//.test(param))) {
    HIST.base = param.endsWith('/') ? param : param + '/';
    window.MD_MANIFEST = undefined;
    setLoading(1);
    await loadScript(HIST.base + 'manifest.js');
    setLoading(-1);
  }
  const m = window.MD_MANIFEST;
  if (!m || !Array.isArray(m.NQ) || !Array.isArray(m.ES)) return;
  HIST.man = m;
  HIST.all = [...new Set(m.NQ.concat(m.ES))].sort();
  HIST.on = HIST.all.length > 0;
}

function loadChunk(sym, key) {
  const id = `${sym}/${key}`;
  if (!HIST.jobs.has(id)) {
    HIST.jobs.set(id, loadScript(`${HIST.base}${id}.js`).then((ok) => {
      HIST.jobs.delete(id);
      if (!ok) say(`Could not load history ${id}.js`);
    }));
  }
  return HIST.jobs.get(id);
}

// Loads the chunks for a window; false if another window was requested meanwhile
async function loadWindow(keys) {
  const gen = ++HIST.gen, jobs = [];
  for (const sym of SYMS) {
    for (const k of keys) if (HIST.man[sym].includes(k) && !HIST.chunks[sym].has(k)) jobs.push(loadChunk(sym, k));
  }
  if (jobs.length) {
    setLoading(1);
    try { await Promise.all(jobs); } finally { setLoading(-1); }
  }
  return gen === HIST.gen;
}

function applyWindow(keys) {
  HIST.months = keys;
  for (const sym of SYMS) for (const k of [...HIST.chunks[sym].keys()]) if (!keys.includes(k)) HIST.chunks[sym].delete(k);
  rebuildData();
}

// History months in the window, then Yahoo candles after the history ends
function mergedData(sym) {
  const yahoo = (window.MARKET_DATA && window.MARKET_DATA[sym]) || [];
  if (!HIST.on) return yahoo;
  const keys = HIST.months, parts = [];
  let total = 0, histEnd = -Infinity;
  for (const k of keys) {
    const f = HIST.chunks[sym].get(k);
    if (f && f.length >= 6) { parts.push(f); total += f.length; histEnd = f[f.length - 6]; }
  }
  const man = HIST.man[sym], lastKey = keys[keys.length - 1];
  const from = Math.max(monthStart(keys[0]), histEnd + 1);
  const to = !man.length || lastKey >= man[man.length - 1] ? Infinity : monthStart(addMonths(lastKey, 1));
  let a = 0;
  while (a < yahoo.length && yahoo[a][0] < from) a++;
  let b = a;
  while (b < yahoo.length && yahoo[b][0] < to) b++;
  const out = new Float64Array(total + (b - a) * 6);
  let off = 0;
  for (const f of parts) { out.set(f, off); off += f.length; }
  for (let i = a; i < b; i++, off += 6) {
    const r = yahoo[i];
    out[off] = r[0]; out[off + 1] = r[1]; out[off + 2] = r[2]; out[off + 3] = r[3]; out[off + 4] = r[4]; out[off + 5] = r[5] || 0;
  }
  return out;
}

function rebuildData() {
  for (const sym of SYMS) S[sym] = loadSymbol(mergedData(sym));
}

function nextHistMonth() {
  if (!HIST.on || !HIST.months.length) return null;
  const last = HIST.months[HIST.months.length - 1];
  return HIST.all.find((k) => k > last) || null;
}

// Load the next month in the background, keeping replay state and the chart view
function extendNext() {
  if (HIST.ext) return HIST.ext;
  const next = nextHistMonth();
  if (!next) return Promise.resolve(false);
  const keys = HIST.months.concat(next).filter((k) => monthStart(addMonths(k, 1)) >= st.time - KEEP_BEHIND);
  HIST.ext = (async () => {
    if (!(await loadWindow(keys))) return false;
    const views = SYMS.map((sym) => {
      const p = panes[sym];
      return { sym, range: p.chart.timeScale().getVisibleLogicalRange(), anchor: p.A && p.k >= 0 ? p.A.time[p.k] : null, k: p.k };
    });
    applyWindow(keys);
    renderAll();
    for (const v of views) {
      if (!v.range || v.anchor === null) continue;
      const shift = lowerBound(panes[v.sym].A.time, v.anchor) - v.k;
      panes[v.sym].chart.timeScale().setVisibleLogicalRange({ from: v.range.from + shift, to: v.range.to + shift });
    }
    return true;
  })().finally(() => { HIST.ext = null; });
  return HIST.ext;
}

function ensureAhead() {
  if (!HIST.on || !st.replay || HIST.ext || !nextHistMonth()) return;
  let end = -Infinity;
  for (const sym of SYMS) if (S[sym].n) end = Math.max(end, S[sym].t[S[sym].n - 1]);
  if (st.time >= end - LOOKAHEAD) extendNext();
}

function endOfData() {
  if (nextHistMonth()) { say('Loading more data…'); extendNext(); return; }
  pause();
  say('End of data.');
}

// ---------- State ----------

const S = {};
const st = {
  tf: 5, replay: false, time: null, playing: false, timer: null,
  active: 'NQ', positions: { NQ: null, ES: null }, trades: [],
  showKZ: true, showLevels: true, theme: 'graphite', tool: null,
  qty: 1, micro: false, slpts: { ...DEFAULT_SL }, tppts: { ...DEFAULT_TP },
};
const panes = {};

function curIndex(sym) {
  const s = S[sym];
  return st.replay ? indexAt(s, st.time) : s.n - 1;
}

// ---------- Themes ----------

function hexRgb(hex) {
  const v = parseInt(hex.slice(1), 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}
const hexA = (hex, a) => `rgba(${hexRgb(hex).join(', ')}, ${a})`;
// Black or white text, whichever reads better on a background color
function inkOn(hex) {
  const [r, g, b] = hexRgb(hex);
  return 0.299 * r + 0.587 * g + 0.114 * b > 160 ? '#000' : '#fff';
}

function applyTheme(id) {
  const th = THEMES.find((t) => t.id === id) || THEMES[0];
  st.theme = th.id;
  const root = document.documentElement.style;
  for (const [k, v] of Object.entries(th.css)) root.setProperty('--' + k, v);
  for (const k of ['accent', 'up', 'down']) root.setProperty(`--${k}-ink`, inkOn(th.css[k]));
  Object.assign(COLORS, {
    bg: th.chart.bg, grid: th.chart.grid, text: th.chart.text, border: th.chart.border,
    up: th.css.up, down: th.css.down, entry: th.css.accent,
    candleUp: th.candle.up, candleDown: th.candle.down, wickUp: th.candle.wickUp, wickDown: th.candle.wickDown,
  });
  for (const z of KILLZONES) z.color = `rgba(${th.kzRgb || z.rgb}, ${(z.a * th.kz).toFixed(3)})`;
  for (const d of LEVEL_DEFS) d[2] = th.levels[d[3]];
  if (!panes.NQ) return;
  for (const sym of SYMS) {
    const p = panes[sym];
    p.chart.applyOptions(chartOptions());
    p.candles.applyOptions(candleOptions());
    if (p.A) p.kz.setData(kzData(p));
    for (const [key, line] of Object.entries(p.levels)) line.applyOptions({ color: LEVEL_DEFS.find((d) => d[0] === key)[2] });
    updatePosLines(p); updateMarkers(p);
  }
}

// ---------- Charts ----------

function chartOptions() {
  return {
    layout: { background: { type: 'solid', color: COLORS.bg }, textColor: COLORS.text },
    grid: { vertLines: { color: COLORS.grid }, horzLines: { color: COLORS.grid } },
    timeScale: { borderColor: COLORS.border },
    rightPriceScale: { borderColor: COLORS.border },
  };
}
function candleOptions() {
  return { upColor: COLORS.candleUp, downColor: COLORS.candleDown, wickUpColor: COLORS.wickUp, wickDownColor: COLORS.wickDown, borderVisible: false };
}

// TradingView-style position box: red between entry and stop, green between entry and target,
// from the entry candle to just past the current candle.
class PositionBox {
  constructor(pane) {
    this.pane = pane; this.chart = null; this.series = null; this.req = null;
    const renderer = { draw: (target) => this.draw(target) };
    this.view = { zOrder: () => 'bottom', renderer: () => renderer };
  }
  attached(p) { this.chart = p.chart; this.series = p.series; this.req = p.requestUpdate; }
  detached() { this.req = null; }
  updateAllViews() {}
  paneViews() { return [this.view]; }
  update() { if (this.req) this.req(); }
  draw(target) {
    const pane = this.pane, pos = st.positions[pane.sym], A = pane.A;
    if (!pos || !A || pane.k < 0 || !this.chart || (pos.sl === null && pos.tp === null)) return;
    const ts = this.chart.timeScale(), se = this.series;
    const spacing = ts.options().barSpacing;
    const entryBar = bucketOf(pos.entryTl, st.tf);
    let x1 = entryBar < A.time[0] ? -spacing : ts.timeToCoordinate(entryBar);
    const xc = ts.timeToCoordinate(A.time[pane.k]);
    if (x1 === null || xc === null) return;
    x1 -= spacing / 2;
    const x2 = Math.max(xc + spacing * 3, x1 + 40);
    const yE = se.priceToCoordinate(pos.entry);
    if (yE === null) return;
    const pv = pointValue(pos), risk = pos.sl !== null ? Math.abs(pos.entry - pos.sl) : 0;
    target.useBitmapCoordinateSpace(({ context: c, horizontalPixelRatio: hr, verticalPixelRatio: vr }) => {
      const zone = (price, color, label, below) => {
        const y = se.priceToCoordinate(price);
        if (y === null) return;
        const top = Math.min(y, yE), h = Math.abs(y - yE);
        c.fillStyle = color;
        c.fillRect(Math.round(x1 * hr), Math.round(top * vr), Math.round((x2 - x1) * hr), Math.max(1, Math.round(h * vr)));
        c.font = `${Math.round(11 * vr)}px -apple-system, "Segoe UI", sans-serif`;
        c.fillStyle = COLORS.text;
        c.textBaseline = below ? 'top' : 'bottom';
        c.fillText(label, Math.round((x1 + 4) * hr), Math.round((below ? Math.max(y, yE) + 3 : top - 3) * vr));
      };
      if (pos.tp !== null) {
        const pts = Math.abs(pos.tp - pos.entry), rr = risk ? ` (${(pts / risk).toFixed(2)}R)` : '';
        zone(pos.tp, hexA(COLORS.up, 0.18), `Target ${fmtPrice(pos.tp)}  +${fmtPts(pts)} pts${rr}  ${fmtUsd(pts * pos.qty * pv)}`, pos.tp < pos.entry);
      }
      if (pos.sl !== null) {
        zone(pos.sl, hexA(COLORS.down, 0.18), `Stop ${fmtPrice(pos.sl)}  -${fmtPts(risk)} pts  ${fmtUsd(-risk * pos.qty * pv)}`, pos.sl < pos.entry);
      }
    });
  }
}

function makePane(sym) {
  const section = document.querySelector(`.pane[data-sym="${sym}"]`);
  const el = section.querySelector('.chart');
  const chart = LW.createChart(el, {
    autoSize: true,
    crosshair: { mode: LW.CrosshairMode.Normal },
    timeScale: { timeVisible: true, secondsVisible: false, rightOffset: 12 },
  });
  chart.applyOptions(chartOptions());
  // Killzone shading: full-height bars on a hidden scale, added first so they sit behind the candles
  const kz = chart.addHistogramSeries({
    priceScaleId: 'kz', priceLineVisible: false, lastValueVisible: false, base: 0,
    autoscaleInfoProvider: () => ({ priceRange: { minValue: 0, maxValue: 1 } }),
  });
  chart.priceScale('kz').applyOptions({ scaleMargins: { top: 0, bottom: 0 }, visible: false });
  const candles = chart.addCandlestickSeries({ ...candleOptions(), priceFormat: { type: 'price', precision: 2, minMove: TICK } });
  const pane = { sym, section, el, chart, kz, candles, A: null, k: -1, cur: -1, levels: {}, posLines: null };
  pane.box = new PositionBox(pane);
  candles.attachPrimitive(pane.box);
  section.addEventListener('mousedown', () => setActive(sym));
  chart.subscribeClick((p) => {
    if (!st.tool || !p.point) return;
    setActive(sym);
    const price = candles.coordinateToPrice(p.point.y);
    if (price !== null) useTool(price);
  });
  setupDrag(pane);
  return pane;
}

function kzPoint(time, m) {
  if (!st.showKZ || m > 60) return { time };
  const min = (((time % 86400) + 86400) % 86400) / 60;
  for (const z of KILLZONES) if (min >= z.from && min < z.to) return { time, value: 1, color: z.color };
  return { time };
}

function kzData(pane) {
  const out = [], A = pane.A;
  for (let j = 0; j <= pane.k; j++) out.push(kzPoint(A.time[j], st.tf));
  return out;
}

// Redraw a pane from scratch at the current replay time
function render(pane) {
  const s = S[pane.sym];
  const A = getAgg(s, st.tf);
  const cur = curIndex(pane.sym);
  pane.A = A; pane.cur = cur;
  const bars = [];
  if (cur >= 0) {
    const k = A.idxOf[cur];
    pane.k = k;
    for (let j = 0; j < k; j++) bars.push({ time: A.time[j], open: A.o[j], high: A.h[j], low: A.l[j], close: A.c[j] });
    bars.push(candleAt(s, A, k, cur));
  } else pane.k = -1;
  pane.kz.setData(kzData(pane));
  pane.candles.setData(bars);
  updateLevels(pane);
  updatePosLines(pane);
  updateMarkers(pane);
}

// Move a pane forward to minute index newCur without redrawing everything
function advancePane(pane, newCur) {
  if (newCur === pane.cur) return;
  if (newCur < pane.cur || pane.cur < 0) { render(pane); return; }
  const s = S[pane.sym], A = pane.A;
  const newK = A.idxOf[newCur];
  for (let k = pane.k; k < newK; k++) {
    pane.candles.update(candleAt(s, A, k, newCur));
    pane.kz.update(kzPoint(A.time[k], st.tf));
  }
  pane.candles.update(candleAt(s, A, newK, newCur));
  pane.kz.update(kzPoint(A.time[newK], st.tf));
  const dayChanged = getAgg(s, 1440).idxOf[newCur] !== getAgg(s, 1440).idxOf[pane.cur];
  pane.k = newK; pane.cur = newCur;
  updateLevels(pane, dayChanged);
}

function renderAll() {
  for (const sym of SYMS) render(panes[sym]);
  updateClock();
  updatePositions();
}

// ---------- ICT levels ----------

// [key, title, color (set by theme), theme color slot]
const LEVEL_DEFS = [
  ['mo', 'Midnight open', '#e0e3eb', 'mo'],
  ['pdh', 'PDH', '#f7a600', 'pd'], ['pdl', 'PDL', '#f7a600', 'pd'],
  ['pwh', 'PWH', '#ab47bc', 'pw'], ['pwl', 'PWL', '#ab47bc', 'pw'],
];

function levelPrices(sym, cur) {
  const s = S[sym], out = {};
  if (cur < 0) return out;
  const D = getAgg(s, 1440), W = getAgg(s, 10080);
  const dk = D.idxOf[cur], wk = W.idxOf[cur];
  if (dk > 0) { out.pdh = D.h[dk - 1]; out.pdl = D.l[dk - 1]; }
  if (wk > 0) { out.pwh = W.h[wk - 1]; out.pwl = W.l[wk - 1]; }
  // Open of the most recent 00:00 New York candle
  const midnight = Math.floor(s.tl[cur] / 86400) * 86400;
  const i = lowerBound(s.tl, midnight);
  if (i <= cur && s.tl[i] < midnight + 3600) out.mo = s.o[i];
  return out;
}

function updateLevels(pane, force = true) {
  if (!force && Object.keys(pane.levels).length) {
    // Midnight open can appear mid-day-session, so still check it every step
    const p = levelPrices(pane.sym, pane.cur);
    setLevel(pane, 'mo', p.mo);
    return;
  }
  const p = levelPrices(pane.sym, pane.cur);
  for (const [key] of LEVEL_DEFS) setLevel(pane, key, p[key]);
}

function setLevel(pane, key, price) {
  const def = LEVEL_DEFS.find((d) => d[0] === key);
  const show = st.showLevels && price !== undefined;
  let line = pane.levels[key];
  if (!line) {
    line = pane.levels[key] = pane.candles.createPriceLine({
      price: price ?? 0, color: def[2], lineWidth: 1, lineStyle: LW.LineStyle.Dashed, title: def[1],
      lineVisible: show, axisLabelVisible: show,
    });
  } else line.applyOptions({ price: price ?? 0, lineVisible: show, axisLabelVisible: show });
}

// ---------- Trading ----------

function pointValue(pos) { return pos.micro ? MICRO_VALUE[pos.sym] : POINT_VALUE[pos.sym]; }
function contractName(sym, micro) { return micro ? MICRO_NAME[sym] : sym; }

// Contracts for a stop distance: from Risk $ when it is set, otherwise the Contracts field
function sizeFor(sym, slp, micro) {
  const risk = +$('risk').value || 0;
  const pv = micro ? MICRO_VALUE[sym] : POINT_VALUE[sym], name = contractName(sym, micro);
  if (risk <= 0) {
    const qty = Math.max(1, Math.floor(+$('qty').value || 1));
    return { qty, usd: slp > 0 ? qty * slp * pv : null };
  }
  if (!(slp > 0)) return { err: 'Risk $ sizing needs a stop.' };
  const per = slp * pv, qty = Math.floor(risk / per + 1e-9);
  if (qty < 1) {
    return { err: `${fmtUsd(risk)} is less than 1 ${name} at ${fmtPts(slp)} pts (${fmtUsd(per)}).`
      + (micro ? ' Raise Risk $ or tighten the stop.' : ` Try Micro (${MICRO_NAME[sym]}).`) };
  }
  return { qty, usd: qty * per };
}

function updateSizeInfo() {
  const sym = st.active, micro = $('micro').checked, slp = +$('slpts').value || 0, rr = +$('rr').value || 0;
  const riskMode = (+$('risk').value || 0) > 0;
  $('qty').disabled = riskMode;
  $('tppts').placeholder = slp > 0 && rr > 0 ? `${fmtPts(slp * rr)} (${rr}R)` : '';
  const z = sizeFor(sym, slp, micro);
  const el = $('sizeInfo');
  el.classList.toggle('neg', !!z.err);
  el.textContent = z.err ? z.err
    : `${z.qty} ${contractName(sym, micro)}${z.usd !== null ? ` · risk ${fmtUsd(z.usd)} at ${fmtPts(slp)} pts` : ' · no stop'}${riskMode ? '' : ' (fixed)'}`;
}

// Market order at the current replay close. stopPrice comes from the position tool;
// otherwise the stop distance is the Stop pts field. Target defaults to stop x R:R.
function openPosition(side, stopPrice) {
  if (!st.replay) return say('Start a replay first, then trade.');
  const sym = st.active, s = S[sym], cur = panes[sym].cur;
  if (cur < 0) return say('No candles yet at this time.');
  if (st.positions[sym]) return say(`You already have a ${sym} position. Close it first.`);
  const entry = s.c[cur], micro = $('micro').checked, rr = +$('rr').value || 0;
  let slp, tpp;
  if (stopPrice !== undefined) {
    const sl = roundTick(stopPrice);
    if ((entry - sl) * side <= 0) {
      say(`Stop must be ${side === 1 ? 'below' : 'above'} entry ${fmtPrice(entry)} for a ${side === 1 ? 'long' : 'short'}.`);
      return false;
    }
    slp = Math.abs(entry - sl);
    tpp = slp * rr;
  } else {
    slp = +$('slpts').value || 0;
    tpp = +$('tppts').value || slp * rr;
  }
  const size = sizeFor(sym, slp, micro);
  if (size.err) { say(size.err); return false; }
  const pos = {
    sym, side, qty: size.qty, micro, entry,
    sl: slp > 0 ? roundTick(entry - side * slp) : null,
    tp: tpp > 0 ? roundTick(entry + side * tpp) : null,
    entryT: s.t[cur], entryTl: s.tl[cur],
  };
  pos.risk = pos.sl !== null ? Math.abs(entry - pos.sl) : null;
  st.positions[sym] = pos;
  say('');
  updatePosLines(panes[sym]); updateMarkers(panes[sym]); updatePositions(); save();
  return true;
}

function armTool(side) {
  if (side && !st.replay) return say('Start a replay first, then trade.');
  st.tool = st.tool === side ? null : side;
  $('toolLong').classList.toggle('on', st.tool === 1);
  $('toolShort').classList.toggle('on', st.tool === -1);
  document.body.classList.toggle('tool-armed', !!st.tool);
  if (st.tool) say(`${st.tool === 1 ? 'Long' : 'Short'} tool: click the ${st.active} chart at your stop price (Esc cancels).`);
}

function useTool(price) {
  if (openPosition(st.tool, price)) armTool(null);
}

function closePosition(sym, price, i, reason) {
  const pos = st.positions[sym], s = S[sym];
  if (!pos) return;
  const pts = (price - pos.entry) * pos.side;
  st.trades.push({
    sym, side: pos.side, qty: pos.qty, micro: pos.micro,
    entryT: pos.entryT, entryTl: pos.entryTl, entry: pos.entry,
    exitT: s.t[i], exitTl: s.tl[i], exit: price, reason,
    sl: pos.sl, tp: pos.tp, pts,
    r: pos.risk ? pts / pos.risk : null,
    usd: pts * pos.qty * pointValue(pos),
  });
  st.positions[sym] = null;
  updatePosLines(panes[sym]); updateMarkers(panes[sym]); updatePositions(); renderTrades(); save();
}

// Check a position against one new 1-minute candle. Stop is checked before target,
// so a candle that touches both counts as a loss. A gap past a level fills at the open.
function checkFills(sym, i) {
  const pos = st.positions[sym], s = S[sym];
  if (!pos) return;
  const o = s.o[i], h = s.h[i], l = s.l[i];
  if (pos.side === 1) {
    if (pos.sl !== null && l <= pos.sl) return closePosition(sym, Math.min(o, pos.sl), i, 'Stop');
    if (pos.tp !== null && h >= pos.tp) return closePosition(sym, Math.max(o, pos.tp), i, 'Target');
  } else {
    if (pos.sl !== null && h >= pos.sl) return closePosition(sym, Math.max(o, pos.sl), i, 'Stop');
    if (pos.tp !== null && l <= pos.tp) return closePosition(sym, Math.min(o, pos.tp), i, 'Target');
  }
}

function updatePosLines(pane) {
  if (pane.posLines) for (const line of Object.values(pane.posLines)) pane.candles.removePriceLine(line);
  pane.posLines = null;
  pane.box.update();
  const pos = st.positions[pane.sym];
  if (!pos) return;
  const mk = (price, color, title, style) => pane.candles.createPriceLine({ price, color, lineWidth: 2, lineStyle: style, title, axisLabelVisible: true });
  pane.posLines = { entry: mk(pos.entry, COLORS.entry, `${pos.side === 1 ? 'Long' : 'Short'} ${pos.qty}`, LW.LineStyle.Solid) };
  if (pos.sl !== null) pane.posLines.sl = mk(pos.sl, COLORS.down, 'SL', LW.LineStyle.Solid);
  if (pos.tp !== null) pane.posLines.tp = mk(pos.tp, COLORS.up, 'TP', LW.LineStyle.Solid);
}

// Stop and target lines can be dragged to new prices
function setupDrag(pane) {
  let drag = null;
  const yOf = (e) => e.clientY - pane.el.getBoundingClientRect().top;
  const hit = (e) => {
    const pos = st.positions[pane.sym];
    if (!pos || !st.replay) return null;
    const y = yOf(e);
    for (const key of ['sl', 'tp']) {
      if (pos[key] === null) continue;
      const ly = pane.candles.priceToCoordinate(pos[key]);
      if (ly !== null && Math.abs(ly - y) <= 6) return key;
    }
    return null;
  };
  pane.el.addEventListener('pointerdown', (e) => {
    const key = hit(e);
    if (!key) return;
    drag = key;
    pane.chart.applyOptions({ handleScroll: false, handleScale: false });
    e.stopPropagation(); e.preventDefault();
  }, true);
  pane.el.addEventListener('mousedown', (e) => { if (drag) e.stopPropagation(); }, true);
  window.addEventListener('pointermove', (e) => {
    if (!drag) { pane.el.style.cursor = hit(e) ? 'ns-resize' : ''; return; }
    const pos = st.positions[pane.sym];
    const price = pane.candles.coordinateToPrice(yOf(e));
    if (!pos || price === null) return;
    pos[drag] = roundTick(price);
    pane.posLines[drag].applyOptions({ price: pos[drag] });
    pane.box.update();
    updatePositions();
  });
  window.addEventListener('pointerup', () => {
    if (!drag) return;
    drag = null;
    pane.chart.applyOptions({ handleScroll: true, handleScale: true });
    save();
  });
}

function updateMarkers(pane) {
  const sym = pane.sym, last = pane.A && pane.k >= 0 ? pane.A.time[pane.k] : -Infinity;
  const first = pane.A && pane.A.time.length ? pane.A.time[0] : Infinity;
  const m = [];
  const add = (tl, marker) => { const time = bucketOf(tl, st.tf); if (time <= last && time >= first) m.push({ time, ...marker }); };
  for (const t of st.trades) {
    if (t.sym !== sym) continue;
    add(t.entryTl, t.side === 1
      ? { position: 'belowBar', color: COLORS.entry, shape: 'arrowUp', text: 'Buy' }
      : { position: 'aboveBar', color: COLORS.entry, shape: 'arrowDown', text: 'Sell' });
    add(t.exitTl, { position: t.side === 1 ? 'aboveBar' : 'belowBar', color: t.usd >= 0 ? COLORS.up : COLORS.down, shape: 'circle', text: fmtUsd(t.usd) });
  }
  const pos = st.positions[sym];
  if (pos) add(pos.entryTl, pos.side === 1
    ? { position: 'belowBar', color: COLORS.entry, shape: 'arrowUp', text: 'Buy' }
    : { position: 'aboveBar', color: COLORS.entry, shape: 'arrowDown', text: 'Sell' });
  m.sort((a, b) => a.time - b.time);
  pane.candles.setMarkers(m);
}

function updatePositions() {
  const out = [];
  for (const sym of SYMS) {
    const pos = st.positions[sym];
    if (!pos) continue;
    const cur = panes[sym].cur, px = cur >= 0 ? S[sym].c[cur] : pos.entry;
    const pts = (px - pos.entry) * pos.side, usd = pts * pos.qty * pointValue(pos);
    const cls = usd >= 0 ? 'pos' : 'neg';
    out.push(`<div><b>${pos.side === 1 ? 'Long' : 'Short'} ${pos.qty} ${contractName(sym, pos.micro)}</b> @ ${fmtPrice(pos.entry)}
      &nbsp;SL ${pos.sl !== null ? fmtPrice(pos.sl) : '-'} &nbsp;TP ${pos.tp !== null ? fmtPrice(pos.tp) : '-'}
      &nbsp;<span class="${cls}">${pts >= 0 ? '+' : ''}${pts.toFixed(2)} pts &nbsp;${fmtUsd(usd)}</span></div>`);
  }
  $('positions').innerHTML = out.join('') || '<div style="color:var(--muted)">No open positions</div>';
}

function renderTrades() {
  const rows = st.trades.slice().reverse().map((t) => {
    const cls = t.usd >= 0 ? 'pos' : 'neg';
    return `<tr><td>${contractName(t.sym, t.micro)}${t.qty > 1 ? ' x' + t.qty : ''}</td><td>${t.side === 1 ? 'Long' : 'Short'}</td>
      <td>${fmtTl(t.entryTl)}</td><td>${fmtPrice(t.entry)}</td><td>${fmtPrice(t.exit)}</td><td>${t.reason}</td>
      <td class="${cls}">${t.pts.toFixed(2)}</td><td class="${cls}">${t.r !== null ? t.r.toFixed(2) : '-'}</td><td class="${cls}">${fmtUsd(t.usd)}</td></tr>`;
  });
  $('log').innerHTML = rows.join('');
  renderStats();
}

function renderStats() {
  const T = st.trades;
  const wins = T.filter((t) => t.usd > 0), losses = T.filter((t) => t.usd < 0);
  const net = T.reduce((a, t) => a + t.usd, 0);
  const grossWin = wins.reduce((a, t) => a + t.usd, 0), grossLoss = -losses.reduce((a, t) => a + t.usd, 0);
  const rs = T.filter((t) => t.r !== null);
  let eq = 0, peak = 0, dd = 0;
  for (const t of T) { eq += t.usd; peak = Math.max(peak, eq); dd = Math.max(dd, peak - eq); }
  const items = [
    ['Trades', T.length],
    ['Win rate', T.length ? (wins.length / T.length * 100).toFixed(1) + '%' : '-'],
    ['Net P/L', `<span class="${net >= 0 ? 'pos' : 'neg'}">${fmtUsd(net)}</span>`],
    ['Profit factor', grossLoss > 0 ? (grossWin / grossLoss).toFixed(2) : (grossWin > 0 ? '∞' : '-')],
    ['Avg R', rs.length ? (rs.reduce((a, t) => a + t.r, 0) / rs.length).toFixed(2) : '-'],
    ['Total R', rs.length ? rs.reduce((a, t) => a + t.r, 0).toFixed(2) : '-'],
    ['Avg win', wins.length ? fmtUsd(grossWin / wins.length) : '-'],
    ['Avg loss', losses.length ? fmtUsd(-grossLoss / losses.length) : '-'],
    ['Max drawdown', fmtUsd(-dd)],
  ];
  $('stats').innerHTML = items.map(([k, v]) => `<span>${k}</span><span>${v}</span>`).join('');
}

function exportTrades() {
  const head = ['symbol', 'side', 'contracts', 'entry_time_ny', 'entry', 'stop', 'target', 'exit_time_ny', 'exit', 'exit_by', 'points', 'r', 'usd'];
  const lines = [head.join(',')].concat(st.trades.map((t) => [
    contractName(t.sym, t.micro), t.side === 1 ? 'long' : 'short', t.qty, fmtTl(t.entryTl), t.entry,
    t.sl ?? '', t.tp ?? '', fmtTl(t.exitTl), t.exit, t.reason, t.pts.toFixed(2), t.r !== null ? t.r.toFixed(3) : '', t.usd.toFixed(2),
  ].join(',')));
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([lines.join('\n')], { type: 'text/csv' }));
  a.download = 'backtest-trades.csv';
  a.click();
  URL.revokeObjectURL(a.href);
}

// ---------- Replay ----------

async function startReplay() {
  const v = $('start').value;
  if (!v) return say('Pick a start date and time first.');
  const tl = Date.parse(v + ':00Z') / 1000;
  pause();
  if (HIST.on) {
    const keys = windowAround(tl - nyOffset(tl));
    if (!(await loadWindow(keys))) return;
    applyWindow(keys);
  }
  const s = S.NQ, i = lowerBound(s.tl, tl);
  if (i >= s.n) { if (HIST.on) renderAll(); return say('That time is after the end of the data.'); }
  st.replay = true;
  st.time = s.t[Math.max(0, i)];
  say('');
  renderAll();
  for (const sym of SYMS) panes[sym].chart.timeScale().scrollToRealTime();
  updateButtons(); save();
  ensureAhead();
}

function exitReplay() {
  pause();
  armTool(null);
  st.replay = false;
  renderAll(); updateButtons(); save();
}

// Move the replay to UTC time t, filling stops and targets on every minute passed
function moveTo(t) {
  if (t === st.time) return;
  if (t < st.time) {
    if (st.positions.NQ || st.positions.ES) return say('Close your open position before going back.');
    st.time = t;
    renderAll();
  } else {
    st.time = t;
    for (const sym of SYMS) {
      const pane = panes[sym], newCur = curIndex(sym), tradesBefore = st.trades.length;
      for (let i = pane.cur + 1; i <= newCur; i++) checkFills(sym, i);
      advancePane(pane, newCur);
      // Exit markers sit on candles that only exist once the pane has moved forward
      if (st.trades.length !== tradesBefore) updateMarkers(pane);
    }
    updateClock(); updatePositions();
    ensureAhead();
  }
  saveSoon();
}

// Next minute that exists in either market
function nextMinute() {
  let best = Infinity;
  for (const sym of SYMS) {
    const s = S[sym], i = panes[sym].cur + 1;
    if (i < s.n) best = Math.min(best, s.t[i]);
  }
  return best === Infinity ? null : best;
}

function stepCandle(dir) {
  if (!st.replay) return say('Start a replay first.');
  const pane = panes[st.active], s = S[st.active], A = pane.A, cur = pane.cur;
  if (cur < 0) { const t = nextMinute(); if (t !== null) moveTo(t); return; }
  const k = A.idxOf[cur];
  let target;
  if (dir > 0) target = cur < A.last[k] ? A.last[k] : (k + 1 < A.time.length ? A.last[k + 1] : null);
  else target = k > 0 ? A.last[k - 1] : null;
  if (target === null) return dir > 0 ? endOfData() : say('Start of loaded data.');
  moveTo(s.t[target]);
}

function stepMinute() {
  if (!st.replay) return say('Start a replay first.');
  const t = nextMinute();
  if (t === null) return endOfData();
  moveTo(t);
}

// Index of the next (dir 1) or previous (dir -1) candle at a session's NY time of day.
// A day whose first candle is more than JUMP_TOLERANCE late (weekend, holiday) is skipped.
// Returns -2 when the search ran off the end of the loaded data.
function findSession(s, tlCur, min, dir) {
  if (!s.n) return -1;
  let occ = Math.floor(tlCur / 86400) * 86400 + min * 60;
  if (dir > 0 && occ <= tlCur) occ += 86400;
  if (dir < 0 && occ >= tlCur) occ -= 86400;
  for (let n = 0; n < 60; n++, occ += dir * 86400) {
    if (dir < 0 && occ < s.tl[0] - 86400) return -1;
    const i = lowerBound(s.tl, occ);
    if (i >= s.n) { if (dir > 0) return -2; continue; }
    if (s.tl[i] - occ <= JUMP_TOLERANCE && (dir > 0 || s.tl[i] < tlCur)) return i;
  }
  return -1;
}

async function jumpSession(dir) {
  if (!st.replay) return say('Start a replay first.');
  if (dir < 0 && (st.positions.NQ || st.positions.ES)) return say('Close your open position before going back.');
  const def = SESSIONS.find((x) => x[0] === $('jump').value) || SESSIONS[0];
  const sym = st.active;
  for (let tries = 0; tries < 4; tries++) {
    const s = S[sym], cur = panes[sym].cur;
    const tlCur = cur >= 0 ? s.tl[cur] : st.time + nyOffset(st.time);
    const i = findSession(s, tlCur, def[2], dir);
    if (i >= 0) { moveTo(s.t[i]); return; }
    if (i !== -2 || !nextHistMonth()) break;
    say('Loading more data…');
    if (!(await extendNext())) break;
  }
  say(dir > 0 ? `No later ${def[1]} in the data.` : `No earlier ${def[1]} in the loaded data.`);
}

function play() {
  if (!st.replay) return say('Start a replay first.');
  if (st.playing) return pause();
  st.playing = true;
  st.timer = setInterval(stepMinute, +$('speed').value);
  updateButtons();
}

function pause() {
  st.playing = false;
  clearInterval(st.timer);
  updateButtons();
}

// ---------- Timeframe typing ----------
// Typing digits (optionally followed by m/h/d/w) opens a small box; Enter applies, Esc cancels.

const tfType = { buf: '', timer: null };

function parseTf(str) {
  const m = /^(\d*)([mhdw]?)$/.exec(str);
  if (!m || (!m[1] && !m[2])) return null;
  const n = m[1] ? +m[1] : 1;
  if (n < 1) return null;
  if (m[2] === 'd') return n === 1 ? 1440 : null;
  if (m[2] === 'w') return n === 1 ? 10080 : null;
  const mins = m[2] === 'h' ? n * 60 : n;
  return mins < 1440 || mins === 1440 || mins === 10080 ? mins : null;
}

function tfShow() {
  const m = parseTf(tfType.buf);
  $('tfoText').textContent = tfType.buf.toUpperCase();
  $('tfoHint').textContent = m ? tfLabel(m) : 'Not a valid timeframe';
  $('tfOverlay').style.display = 'flex';
  clearTimeout(tfType.timer);
  tfType.timer = setTimeout(tfApply, 1200);
}

function tfClose() {
  tfType.buf = '';
  clearTimeout(tfType.timer);
  $('tfOverlay').style.display = 'none';
}

function tfApply() {
  const m = parseTf(tfType.buf), typed = tfType.buf;
  tfClose();
  if (m) setTf(m);
  else say(`"${typed}" is not a timeframe.`);
}

// Returns true when the key belonged to the timeframe box
function tfKey(e) {
  const open = tfType.buf !== '';
  const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
  let ch = null;
  if (/^Numpad\d$/.test(e.code)) ch = e.code.slice(6);
  else if (/^\d$/.test(key)) ch = key;
  else if ((open && /^[mhdw]$/.test(key)) || (!open && /^[dw]$/.test(key))) ch = key;
  if (ch !== null) {
    if (tfType.buf.length < 6) tfType.buf += ch;
    tfShow();
    return true;
  }
  if (!open) return false;
  if (key === 'Enter') tfApply();
  else if (key === 'Escape') tfClose();
  else if (key === 'Backspace') { tfType.buf = tfType.buf.slice(0, -1); tfType.buf ? tfShow() : tfClose(); }
  else { tfClose(); return false; }
  return true;
}

// ---------- UI ----------

function setActive(sym) {
  if (st.active === sym && $('activeName').textContent) return;
  st.active = sym;
  for (const s of SYMS) panes[s].section.classList.toggle('active', s === sym);
  $('activeName').textContent = `· ${sym}`;
  $('slpts').value = st.slpts[sym];
  $('tppts').value = st.tppts[sym] || '';
  updateSizeInfo();
}

function setTf(m) {
  st.tf = m;
  let preset = false;
  for (const b of document.querySelectorAll('.tf')) {
    const on = +b.dataset.m === m;
    b.classList.toggle('on', on);
    preset = preset || on;
  }
  $('tfCustom').textContent = tfLabel(m);
  $('tfCustom').style.display = preset ? 'none' : '';
  renderAll();
  for (const sym of SYMS) panes[sym].chart.timeScale().scrollToRealTime();
  save();
}

function updateClock() {
  const cur = panes.NQ.cur >= 0 ? panes.NQ.cur : panes.ES.cur;
  const sym = panes.NQ.cur >= 0 ? 'NQ' : 'ES';
  $('clock').innerHTML = st.replay && cur >= 0
    ? `${fmtTl(S[sym].tl[cur], true)} NY`
    : '<span class="live">Not replaying: showing all loaded data</span>';
}

function updateButtons() {
  for (const id of ['back', 'play', 'step', 'buy', 'sell', 'close', 'jumpPrev', 'jumpNext', 'toolLong', 'toolShort']) $(id).disabled = !st.replay;
  $('exit').disabled = !st.replay;
  $('play').innerHTML = st.playing ? '&#10074;&#10074; Pause' : '&#9654; Play';
  $('play').classList.toggle('on', st.playing);
}

let msgTimer = null;
function say(text) {
  $('msg').textContent = text;
  clearTimeout(msgTimer);
  if (text) msgTimer = setTimeout(() => ($('msg').textContent = ''), 4000);
}

// Keep the two charts scrolled and zoomed together, and mirror the crosshair
function syncCharts() {
  let busy = false;
  for (const a of SYMS) {
    const b = a === 'NQ' ? 'ES' : 'NQ';
    panes[a].chart.timeScale().subscribeVisibleTimeRangeChange((range) => {
      if (busy || !range) return;
      busy = true;
      try { panes[b].chart.timeScale().setVisibleRange(range); } catch (e) { /* other chart has no data yet */ }
      busy = false;
    });
    panes[a].chart.subscribeCrosshairMove((p) => {
      if (busy) return;
      busy = true;
      const pb = panes[b];
      if (p.time === undefined || !pb.A || pb.k < 0) pb.chart.clearCrosshairPosition();
      else {
        const j = Math.min(lowerBound(pb.A.time, p.time + 1) - 1, pb.k);
        if (j >= 0) pb.chart.setCrosshairPosition(pb.A.c[j], pb.A.time[j], pb.candles);
      }
      busy = false;
    });
  }
}

// ---------- Saving ----------

function save() {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify({
      tf: st.tf, replay: st.replay, time: st.time, active: st.active, positions: st.positions, trades: st.trades,
      showKZ: st.showKZ, showLevels: st.showLevels, slpts: st.slpts, tppts: st.tppts, theme: st.theme,
      qty: $('qty').value, micro: $('micro').checked, start: $('start').value, speed: $('speed').value,
      risk: $('risk').value, rr: $('rr').value, jump: $('jump').value,
    }));
  } catch (e) { /* storage unavailable */ }
}
let saveTimer = null;
function saveSoon() { clearTimeout(saveTimer); saveTimer = setTimeout(save, 1000); }

function restore() {
  let d = null;
  try {
    // Settings saved before the rename live under the old key
    const old = localStorage.getItem(OLD_STORE_KEY);
    if (old !== null && localStorage.getItem(STORE_KEY) === null) localStorage.setItem(STORE_KEY, old);
    d = JSON.parse(localStorage.getItem(STORE_KEY));
  } catch (e) { /* ignore */ }
  if (!d) return;
  Object.assign(st, {
    tf: d.tf ?? st.tf, replay: !!d.replay && d.time != null, time: d.time, active: d.active ?? st.active,
    positions: d.positions ?? st.positions, trades: d.trades ?? [], showKZ: d.showKZ ?? true, showLevels: d.showLevels ?? true,
    slpts: d.slpts ?? st.slpts, tppts: d.tppts ?? st.tppts, theme: d.theme ?? st.theme,
  });
  if (d.qty) $('qty').value = d.qty;
  $('micro').checked = !!d.micro;
  if (d.start) $('start').value = d.start;
  if (d.speed) $('speed').value = d.speed;
  if (d.risk != null) $('risk').value = d.risk;
  if (d.rr != null && d.rr !== '') $('rr').value = d.rr;
  if (d.jump) $('jump').value = d.jump;
}

// ---------- Start ----------

async function init() {
  const data = window.MARKET_DATA;
  await initHistory();
  const hasYahoo = data && data.NQ && data.ES && data.NQ.length;
  if (!LW || (!hasYahoo && !HIST.on)) { $('nodata').style.display = 'flex'; return; }

  for (const [id, name] of SESSIONS) $('jump').add(new Option(name, id));
  for (const th of THEMES) $('theme').add(new Option(th.name, th.id));
  restore();
  applyTheme(st.theme);
  $('theme').value = st.theme;

  if (HIST.on) {
    // Latest two months for "Show all", or the months around a saved replay
    const keys = st.replay ? windowAround(st.time) : HIST.all.slice(-2);
    await loadWindow(keys);
    applyWindow(keys);
  } else rebuildData();

  // Default replay start: 8:00 NY, two days into the loaded data
  if (!$('start').value && S.NQ.n) {
    const first = new Date((Math.floor(S.NQ.tl[0] / 86400) + 2) * 86400000 + 8 * 3600000);
    $('start').value = first.toISOString().slice(0, 16);
  }
  let lo = S.NQ.n ? S.NQ.t[0] : 0, hi = S.NQ.n ? S.NQ.t[S.NQ.n - 1] : 0;
  if (HIST.on && HIST.man.first) {
    lo = HIST.man.first;
    hi = Math.max(HIST.man.last || 0, hasYahoo ? data.NQ[data.NQ.length - 1][0] : 0);
  }
  $('start').min = fmtTl(lo + nyOffset(lo)).replace(' ', 'T');
  $('start').max = fmtTl(hi + nyOffset(hi)).replace(' ', 'T');

  $('kz').checked = st.showKZ;
  $('lv').checked = st.showLevels;

  const tfBox = $('tfs');
  for (const [name, m] of TFS) {
    const b = document.createElement('button');
    b.className = 'tf'; b.textContent = name; b.dataset.m = m;
    b.onclick = () => setTf(m);
    tfBox.insertBefore(b, $('tfCustom'));
  }
  for (const sym of SYMS) panes[sym] = makePane(sym);
  syncCharts();
  const active = st.active; st.active = null; setActive(active);
  setTf(st.tf);
  renderTrades();
  updateButtons();
  if (st.replay) ensureAhead();

  $('go').onclick = startReplay;
  $('exit').onclick = exitReplay;
  $('step').onclick = () => stepCandle(1);
  $('back').onclick = () => stepCandle(-1);
  $('play').onclick = play;
  $('speed').onchange = () => { if (st.playing) { pause(); play(); } save(); };
  $('jumpNext').onclick = () => jumpSession(1);
  $('jumpPrev').onclick = () => jumpSession(-1);
  $('jump').onchange = () => { $('jump').blur(); save(); };
  $('theme').onchange = () => { applyTheme($('theme').value); $('theme').blur(); save(); };
  $('buy').onclick = () => openPosition(1);
  $('sell').onclick = () => openPosition(-1);
  $('toolLong').onclick = () => armTool(1);
  $('toolShort').onclick = () => armTool(-1);
  $('close').onclick = () => {
    const sym = st.active, pos = st.positions[sym];
    if (!pos) return say(`No open ${sym} position.`);
    closePosition(sym, S[sym].c[panes[sym].cur], panes[sym].cur, 'Manual');
  };
  $('slpts').oninput = () => { st.slpts[st.active] = +$('slpts').value || 0; updateSizeInfo(); saveSoon(); };
  $('tppts').oninput = () => { st.tppts[st.active] = +$('tppts').value || 0; saveSoon(); };
  for (const id of ['qty', 'risk', 'rr', 'micro']) $(id).addEventListener('input', () => { updateSizeInfo(); saveSoon(); });
  $('kz').onchange = () => { st.showKZ = $('kz').checked; renderAll(); save(); };
  $('lv').onchange = () => { st.showLevels = $('lv').checked; for (const sym of SYMS) updateLevels(panes[sym]); save(); };
  $('export').onclick = exportTrades;
  $('clear').onclick = () => {
    if (!st.trades.length || !confirm('Delete all trades from the log?')) return;
    st.trades = []; renderTrades(); for (const sym of SYMS) updateMarkers(panes[sym]); save();
  };

  document.addEventListener('keydown', (e) => {
    if ((e.target.matches && e.target.matches('input, select, textarea')) || e.ctrlKey || e.metaKey || e.altKey) return;
    if (tfKey(e)) { e.preventDefault(); return; }
    const k = e.key.toLowerCase();
    if (e.key === 'ArrowRight') { e.shiftKey ? stepMinute() : stepCandle(1); }
    else if (e.key === 'ArrowLeft') stepCandle(-1);
    else if (e.key === ' ') play();
    else if (e.key === 'Escape') { if (!st.tool) return; armTool(null); say(''); }
    else if (k === 'b') openPosition(1);
    else if (k === 's') openPosition(-1);
    else if (k === 'x') $('close').click();
    else if (k === 'l') armTool(e.shiftKey ? -1 : 1);
    else if (k === 'j') jumpSession(e.shiftKey ? -1 : 1);
    else return;
    e.preventDefault();
  });
}

init();
