// Dependency-free SVG charts for Scuderia Atlas.
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export function niceTicks(min, max, count = 5) {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return [];
  if (min === max) return [min];
  const raw = (max - min) / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const norm = raw / mag;
  const step = (norm >= 5 ? 10 : norm >= 2 ? 5 : norm >= 1 ? 2 : 1) * mag;
  const out = [];
  for (let v = Math.ceil(min / step) * step; v <= max + 1e-9; v += step) out.push(+v.toFixed(10));
  return out;
}

function nearestIndex(points, x) {
  let lo = 0, hi = points.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (points[mid].x < x) lo = mid; else hi = mid;
  }
  return Math.abs(points[lo].x - x) <= Math.abs(points[hi].x - x) ? lo : hi;
}

function tooltip(el) {
  const tip = document.createElement('div');
  tip.className = 'tooltip';
  el.appendChild(tip);
  return tip;
}

/** series: [{ name, colour, points: [{x, y, note?}], width?, area?, dash? }] ; markers: [{x, colour, label}] */
export function lineChart(el, opts) {
  const series = (opts.series || []).filter((s) => s.points && s.points.length);
  el.innerHTML = '';
  el.classList.add('chart');
  if (!series.length) {
    el.innerHTML = `<p class="muted">${esc(opts.empty || 'No data.')}</p>`;
    return;
  }
  const W = Math.max(el.clientWidth || 640, 300);
  const H = opts.height || 260;
  const m = { t: 14, r: 16, b: 26, l: opts.left || 48 };
  const xs = series.flatMap((s) => s.points.map((p) => p.x));
  const ys = series.flatMap((s) => s.points.map((p) => p.y));
  const xMin = Math.min(...xs), xMax = Math.max(...xs);
  let yMin = opts.yMin ?? Math.min(...ys), yMax = Math.max(...ys);
  if (yMin === yMax) { yMin -= 1; yMax += 1; }
  yMax += (yMax - yMin) * 0.06;
  const sx = (x) => m.l + ((x - xMin) / (xMax - xMin || 1)) * (W - m.l - m.r);
  const sy = (y) => H - m.b - ((y - yMin) / (yMax - yMin)) * (H - m.t - m.b);
  const xf = opts.xFmt || ((v) => v);
  const yf = opts.yFmt || ((v) => v);
  const xTicks = opts.xTickValues || niceTicks(xMin, xMax, opts.xTicks || 8);

  let svg = `<svg viewBox="0 0 ${W} ${H}" height="${H}" role="img" aria-label="${esc(opts.title || 'chart')}"><defs>`;
  series.forEach((s, i) => {
    svg += `<linearGradient id="g-${el.id}-${i}" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="${s.colour}" stop-opacity="0.32"/><stop offset="1" stop-color="${s.colour}" stop-opacity="0"/></linearGradient>`;
  });
  svg += '</defs><g class="axis">';
  for (const t of niceTicks(yMin, yMax, opts.yTicks || 4)) {
    svg += `<line class="grid-line" x1="${m.l}" x2="${W - m.r}" y1="${sy(t)}" y2="${sy(t)}"/><text x="${m.l - 8}" y="${sy(t) + 4}" text-anchor="end">${esc(yf(t))}</text>`;
  }
  for (const t of xTicks) {
    if (t < xMin || t > xMax) continue;
    svg += `<text x="${sx(t)}" y="${H - 6}" text-anchor="middle">${esc(xf(t))}</text>`;
  }
  svg += '</g>';
  series.forEach((s, i) => {
    const d = s.points.map((p, j) => `${j ? 'L' : 'M'}${sx(p.x).toFixed(1)},${sy(p.y).toFixed(1)}`).join('');
    if (s.area) svg += `<path d="${d}L${sx(s.points[s.points.length - 1].x)},${H - m.b}L${sx(s.points[0].x)},${H - m.b}Z" fill="url(#g-${el.id}-${i})"/>`;
    svg += `<path class="line-path" d="${d}" fill="none" stroke="${s.colour}" stroke-width="${s.width || 2}" ${s.dash ? `stroke-dasharray="${s.dash}"` : ''} stroke-linejoin="round" stroke-linecap="round"/>`;
    if (s.endLabel) {
      const p = s.points[s.points.length - 1];
      svg += `<text class="end-label" x="${sx(p.x) - 4}" y="${sy(p.y) - 6}" text-anchor="end" fill="${s.colour}">${esc(s.name)}</text>`;
    }
  });
  for (const mk of opts.markers || []) {
    if (mk.x < xMin || mk.x > xMax) continue;
    svg += `<circle cx="${sx(mk.x)}" cy="${sy(mk.y)}" r="${mk.r || 3}" fill="${mk.colour}" stroke="#0b0b0d" stroke-width="1"><title>${esc(mk.label || '')}</title></circle>`;
  }
  svg += `<line class="crosshair" x1="0" x2="0" y1="${m.t}" y2="${H - m.b}" visibility="hidden"/>`;
  svg += `<rect class="hit" x="${m.l}" y="${m.t}" width="${W - m.l - m.r}" height="${H - m.t - m.b}" fill="transparent"/></svg>`;
  el.innerHTML = svg;
  const tip = tooltip(el);
  const root = el.querySelector('svg');
  const cross = root.querySelector('.crosshair');
  root.querySelector('.hit').addEventListener('mousemove', (evt) => {
    const r = root.getBoundingClientRect();
    const px = ((evt.clientX - r.left) / r.width) * W;
    const x = xMin + ((px - m.l) / (W - m.l - m.r)) * (xMax - xMin);
    const rows = series.map((s) => {
      const p = s.points[nearestIndex(s.points, x)];
      return `<div><span style="color:${s.colour}">●</span> ${esc(s.name)} <b>${esc(yf(p.y, true))}</b>${p.note ? ` <span class="muted">${esc(p.note)}</span>` : ''}</div>`;
    });
    const near = series[0].points[nearestIndex(series[0].points, x)];
    const X = sx(near.x);
    cross.setAttribute('x1', X); cross.setAttribute('x2', X); cross.setAttribute('visibility', 'visible');
    tip.innerHTML = `<div class="muted">${esc(xf(near.x, true))}</div>${rows.join('')}`;
    tip.style.left = `${(X / W) * r.width}px`;
    tip.style.top = `${evt.clientY - r.top}px`;
    tip.classList.add('show');
  });
  root.querySelector('.hit').addEventListener('mouseleave', () => {
    cross.setAttribute('visibility', 'hidden');
    tip.classList.remove('show');
  });
}

/**
 * Season timeline: one column per season, height = wins, gold crown for constructors' title,
 * gold dot for drivers' title. onSelect(season) on click.
 */
export function seasonTimeline(el, seasons, { onSelect, selected } = {}) {
  el.innerHTML = '';
  el.classList.add('chart');
  const W = Math.max(el.clientWidth || 900, 600);
  const H = 250;
  const m = { t: 34, r: 8, b: 26, l: 30 };
  const maxWins = Math.max(1, ...seasons.map((s) => s.wins));
  const n = seasons.length;
  const bw = (W - m.l - m.r) / n;
  const sy = (v) => H - m.b - (v / maxWins) * (H - m.t - m.b);
  let svg = `<svg viewBox="0 0 ${W} ${H}" height="${H}" role="img" aria-label="Ferrari wins per season"><g class="axis">`;
  for (const t of niceTicks(0, maxWins, 4)) svg += `<line class="grid-line" x1="${m.l}" x2="${W - m.r}" y1="${sy(t)}" y2="${sy(t)}"/><text x="${m.l - 6}" y="${sy(t) + 4}" text-anchor="end">${t}</text>`;
  seasons.forEach((s, i) => {
    if (s.season % 10 === 0) svg += `<text x="${m.l + i * bw + bw / 2}" y="${H - 6}" text-anchor="middle">${s.season}</text>`;
  });
  svg += '</g>';
  seasons.forEach((s, i) => {
    const x = m.l + i * bw;
    const h = Math.max(H - m.b - sy(s.wins), s.races ? 1.5 : 0);
    const cls = ['season-bar', s.constructorChampion ? 'title' : '', s.driverChampion ? 'dtitle' : '', s.final ? '' : 'provisional', selected === s.season ? 'selected' : ''].join(' ');
    svg += `<g class="season-col" data-season="${s.season}" tabindex="0" role="button" aria-label="Season ${s.season}">`;
    svg += `<rect class="col-hit" x="${x}" y="${m.t - 30}" width="${bw}" height="${H - m.t + 30 - m.b}" fill="transparent"/>`;
    svg += `<rect class="${cls}" x="${x + bw * 0.14}" y="${H - m.b - h}" width="${bw * 0.72}" height="${h}" rx="${Math.min(2, bw * 0.2)}" style="animation-delay:${i * 8}ms"/>`;
    if (s.constructorChampion) svg += `<path class="crown" transform="translate(${x + bw / 2 - 5},${H - m.b - h - 14}) scale(0.5)" d="M0 14 L2 4 L7 9 L10 0 L13 9 L18 4 L20 14 Z"/>`;
    if (s.driverChampion) svg += `<circle class="dstar" cx="${x + bw / 2}" cy="${H - m.b - h - (s.constructorChampion ? 20 : 7)}" r="${Math.min(3, bw * 0.3)}"/>`;
    svg += '</g>';
  });
  svg += '</svg>';
  el.innerHTML = svg;
  const tip = tooltip(el);
  const root = el.querySelector('svg');
  root.querySelectorAll('.season-col').forEach((g) => {
    const s = seasons.find((x) => String(x.season) === g.dataset.season);
    g.addEventListener('mouseenter', (evt) => {
      const r = root.getBoundingClientRect();
      tip.innerHTML = `<div class="tip-title">${s.season}${s.final ? '' : ' · in progress'}</div>
        <div>${s.wins} wins · ${s.podiums} podiums · ${s.poles} poles</div>
        <div>${s.races} races · ${s.points} pts${s.constructorPosition ? ` · P${s.constructorPosition} constructors` : ''}</div>
        ${s.constructorChampion ? '<div class="gold">♛ Constructors\' champions</div>' : ''}
        ${s.driverChampion ? `<div class="gold">★ Drivers' champion: ${esc(s.driverChampion)}</div>` : ''}`;
      tip.style.left = `${((Number(g.querySelector('.col-hit').getAttribute('x')) + bw / 2) / W) * r.width}px`;
      tip.style.top = `${evt.clientY - r.top}px`;
      tip.classList.add('show');
    });
    g.addEventListener('mouseleave', () => tip.classList.remove('show'));
    const pick = () => onSelect && onSelect(s.season);
    g.addEventListener('click', pick);
    g.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(); } });
  });
}

/** World map with circuit bubbles. circuits: [{x, y, races, wins, name, ...}] */
export function worldMap(el, world, circuits, { onSelect, selected } = {}) {
  el.innerHTML = '';
  el.classList.add('chart');
  const maxRaces = Math.max(1, ...circuits.map((c) => c.races));
  const maxWins = Math.max(1, ...circuits.map((c) => c.wins));
  let svg = `<svg viewBox="0 0 ${world.width} ${world.height}" class="world" role="img" aria-label="Circuits where Ferrari raced">`;
  svg += `<path class="land" d="${world.path}"/>`;
  const sorted = [...circuits].sort((a, b) => b.races - a.races);
  for (const c of sorted) {
    const r = 2.5 + Math.sqrt(c.races / maxRaces) * 13;
    const k = c.wins / maxWins;
    svg += `<g class="bubble ${selected === c.circuitId ? 'selected' : ''}" data-id="${esc(c.circuitId)}" tabindex="0" role="button" aria-label="${esc(c.name)}">
      <circle cx="${c.x}" cy="${c.y}" r="${r.toFixed(1)}" style="--k:${k.toFixed(3)}"/>
    </g>`;
  }
  svg += '</svg>';
  el.innerHTML = svg;
  const tip = tooltip(el);
  const root = el.querySelector('svg');
  root.querySelectorAll('.bubble').forEach((g) => {
    const c = circuits.find((x) => x.circuitId === g.dataset.id);
    g.addEventListener('mouseenter', (evt) => {
      const r = el.getBoundingClientRect();
      tip.innerHTML = `<div class="tip-title">${esc(c.name)}</div><div class="muted">${esc(c.locality)}, ${esc(c.country)}</div>
        <div>${c.races} races · <b>${c.wins}</b> wins · ${c.podiums} podiums</div><div class="muted">${c.firstSeason}–${c.lastSeason}</div>`;
      tip.style.left = `${evt.clientX - r.left}px`;
      tip.style.top = `${evt.clientY - r.top}px`;
      tip.classList.add('show');
    });
    g.addEventListener('mouseleave', () => tip.classList.remove('show'));
    const pick = () => onSelect && onSelect(c.circuitId);
    g.addEventListener('click', pick);
    g.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(); } });
  });
}
