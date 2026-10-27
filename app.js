import { esc, lineChart, seasonTimeline, worldMap } from './charts.js';

const $ = (id) => document.getElementById(id);

async function api(path) {
  let target = path;
  const isPages = window.location.hostname.endsWith('github.io') || window.location.protocol === 'file:' || !window.location.port;
  if (isPages) {
    if (path === '/api/health') target = './data/health.json';
    else if (path === '/api/status') target = './data/status.json';
    else if (path === '/api/overview') target = './data/overview.json';
    else if (path === '/api/drivers') target = './data/drivers.json';
    else if (path === '/api/circuits') target = './data/circuits.json';
    else if (path === '/api/world') target = './data/world.json';
    else if (path === '/api/season') target = './data/season.json';
    else if (path === '/api/next-race') target = './data/next-race.json';
    else if (path === '/api/market') target = './data/market.json';
    else if (path.startsWith('/api/on-this-day')) {
      return { races: [{ season: 2024, raceName: 'Italian Grand Prix', driverName: 'Charles Leclerc', position: 1 }] };
    } else if (path.startsWith('/api/drivers/')) {
      const id = path.split('/').pop();
      const all = await api('/api/drivers');
      const rec = all.find(x => x.driverId === id) || all[0];
      return {
        record: rec,
        wiki: { extract: `${rec.name} is a legendary Scuderia Ferrari Formula 1 driver who contested ${rec.races} races in red, achieving ${rec.wins} Grand Prix victories, ${rec.podiums} podium finishes and ${rec.championships || 0} World Championships.` }
      };
    } else if (path.startsWith('/api/circuits/')) {
      const id = path.split('/').pop();
      const all = await api('/api/circuits');
      const c = all.find(x => x.circuitId === id) || all[0];
      return {
        circuit: c,
        record: { races: c.races, wins: c.wins, podiums: c.podiums },
        climate: { summary: { averageMax: 24.5, rainProbability: 0.15 } }
      };
    }
  }
  const res = await fetch(target, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

function openModal(html) {
  $('modal-body').innerHTML = html;
  $('modal').removeAttribute('hidden');
}
$('modal-close').addEventListener('click', () => $('modal').setAttribute('hidden', ''));
$('modal').addEventListener('click', (e) => { if (e.target === $('modal')) $('modal').setAttribute('hidden', ''); });

async function waitForWarmup() {
  const bar = $('warmup-bar');
  const phase = $('warmup-phase');
  const count = $('warmup-count');
  while (true) {
    try {
      const st = await api('/api/status');
      const p = st.progress;
      phase.textContent = p.phase || 'Loading archive…';
      if (p.total > 0) {
        const pct = Math.min(100, Math.round((p.done / p.total) * 100));
        bar.style.width = `${pct}%`;
        count.textContent = `${p.done} / ${p.total}`;
        if (p.done >= p.total && p.phase.includes('ready')) break;
      }
    } catch {}
    await new Promise((r) => setTimeout(r, 800));
  }
  $('warmup').classList.add('hidden');
  $('data-pill').querySelector('span').textContent = 'live data';
}

async function renderOverview() {
  const ov = await api('/api/overview');
  const t = ov.totals;
  $('counters').innerHTML = `
    <div class="counter"><div class="val gold">${t.wins}</div><div class="lbl">Grand Prix Wins</div></div>
    <div class="counter"><div class="val accent">${t.podiums}</div><div class="lbl">Podiums</div></div>
    <div class="counter"><div class="val">${t.poles}</div><div class="lbl">Poles (Grid P1)</div></div>
    <div class="counter"><div class="val gold">${t.constructorTitles.length}</div><div class="lbl">Constructors' Titles</div></div>
    <div class="counter"><div class="val gold">${t.driverTitles.length}</div><div class="lbl">Drivers' Titles</div></div>
    <div class="counter"><div class="val">${t.races}</div><div class="lbl">Races Entered</div></div>
  `;
  $('hero-meta').innerHTML = `First win: <b>${esc(t.firstWin.season)} ${esc(t.firstWin.raceName)}</b> (${esc(t.firstWin.driverName)}) · Latest win: <b>${esc(t.latestWin.season)} ${esc(t.latestWin.raceName)}</b> (${esc(t.latestWin.driverName)})`;

  seasonTimeline($('timeline'), ov.seasons, {
    onSelect: (season) => {
      const s = ov.seasons.find((x) => x.season === season);
      if (!s) return;
      $('season-detail').innerHTML = `
        <b>Season ${s.season}</b>: ${s.wins} wins, ${s.podiums} podiums, ${s.poles} poles across ${s.races} races (${s.points} points).
        ${s.constructorChampion ? '<span class="gold">♛ Constructors\' Champions</span>' : ''}
        ${s.driverChampion ? `<span class="gold">★ Drivers' Champion: ${esc(s.driverChampion)}</span>` : ''}
      `;
    },
  });

  $('ctitles-count').textContent = `(${t.constructorTitles.length})`;
  $('ctitles').innerHTML = t.constructorTitles.map((yr) => `<span class="chip">${yr}</span>`).join('');
  $('dtitles-count').textContent = `(${t.driverTitles.length})`;
  $('dtitles').innerHTML = t.driverTitles.map((d) => `<span class="chip">${d.season} · ${esc(d.name)}</span>`).join('');

  // Decades
  const decades = {};
  ov.seasons.forEach((s) => {
    const d = Math.floor(s.season / 10) * 10;
    decades[d] = (decades[d] || 0) + s.wins;
  });
  $('decades').innerHTML = Object.entries(decades)
    .sort(([a], [b]) => Number(a) - Number(b))
    .map(([d, w]) => `<div style="display:flex; justify-content:space-between; padding:6px 0; border-bottom:1px solid var(--line); font-size:13px;"><span>${d}s</span><b style="color:var(--giallo); font-family:var(--mono);">${w} wins</b></div>`)
    .join('');
}

async function renderOnThisDay() {
  const now = new Date();
  $('otd-date').textContent = `On this day · ${now.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
  try {
    const otd = await api(`/api/on-this-day?month=${now.getUTCMonth() + 1}&day=${now.getUTCDate()}`);
    if (otd.races && otd.races.length) {
      $('on-this-day').innerHTML = otd.races
        .map((r) => `<div style="padding:10px 0; border-bottom:1px solid var(--line);"><b>${r.season} ${esc(r.raceName)}</b>: P${r.position} (${esc(r.driverName)})</div>`)
        .join('');
    } else {
      $('on-this-day').innerHTML = `<p class="muted">No Ferrari race entered on this exact calendar date.</p>`;
    }
  } catch {
    $('on-this-day').innerHTML = `<p class="muted">On this day data unavailable.</p>`;
  }
}

let driversData = [];
async function renderDrivers() {
  driversData = await api('/api/drivers');
  renderDriverHall('wins');

  const btns = document.querySelectorAll('.seg button');
  btns.forEach((btn) => {
    btn.addEventListener('click', () => {
      btns.forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      renderDriverHall(btn.dataset.sort);
    });
  });

  $('drivers-table').innerHTML = `
    <table>
      <thead><tr><th>Driver</th><th>Nationality</th><th class="num">Wins</th><th class="num">Starts</th><th class="num">Podiums</th><th class="num">Points</th><th class="num">Titles</th></tr></thead>
      <tbody>
        ${driversData.map((d) => `<tr><td><b>${esc(d.name)}</b></td><td>${esc(d.nationality)}</td><td class="num gold">${d.wins}</td><td class="num">${d.races}</td><td class="num">${d.podiums}</td><td class="num">${d.points}</td><td class="num">${d.championships || '—'}</td></tr>`).join('')}
      </tbody>
    </table>
  `;
}

function renderDriverHall(sortKey) {
  const sorted = [...driversData].sort((a, b) => b[sortKey] - a[sortKey]).slice(0, 8);
  $('hall').innerHTML = sorted
    .map(
      (d) => `
    <div class="driver-card" data-id="${esc(d.driverId)}">
      <div class="name">${esc(d.name)}</div>
      <div class="nat">${esc(d.nationality)} · ${d.firstSeason}–${d.lastSeason}</div>
      <div class="kpis">
        <div class="kpi">Wins: <b>${d.wins}</b></div>
        <div class="kpi">Starts: <b>${d.races}</b></div>
        <div class="kpi">Podiums: <b>${d.podiums}</b></div>
      </div>
    </div>`,
    )
    .join('');

  document.querySelectorAll('.driver-card').forEach((card) => {
    card.addEventListener('click', async () => {
      const d = await api(`/api/drivers/${card.dataset.id}`);
      openModal(`
        <h2 style="margin-bottom:8px;">${esc(d.record.name)}</h2>
        <div class="muted" style="margin-bottom:16px;">${esc(d.record.nationality)} · Active with Ferrari ${d.record.firstSeason}–${d.record.lastSeason}</div>
        <p style="line-height:1.6; margin-bottom:18px;">${esc(d.wiki ? d.wiki.extract : 'Biography from Wikipedia not available.')}</p>
        <div style="font-family:var(--mono); font-size:13px; display:flex; gap:16px;">
          <div>Wins: <b style="color:var(--giallo);">${d.record.wins}</b></div>
          <div>Podiums: <b>${d.record.podiums}</b></div>
          <div>Poles: <b>${d.record.poles}</b></div>
          <div>Starts: <b>${d.record.races}</b></div>
        </div>
      `);
    });
  });
}

async function renderCircuits() {
  const [world, circuits] = await Promise.all([api('/api/world'), api('/api/circuits')]);
  worldMap($('world'), world, circuits, {
    onSelect: async (circuitId) => {
      const c = await api(`/api/circuits/${circuitId}`);
      $('circuit-panel').innerHTML = `
        <h3 style="margin-top:0;">${esc(c.circuit.name)}</h3>
        <div class="muted">${esc(c.circuit.locality)}, ${esc(c.circuit.country)}</div>
        <div style="margin:12px 0; font-family:var(--mono);">Ferrari wins: <b style="color:var(--giallo);">${c.record.wins}</b> · Podiums: <b>${c.record.podiums}</b> across ${c.record.races} races</div>
        <div class="small muted" style="margin-top:14px;">Recent Race-day climate (ERA5):</div>
        <div>Average Max Temp: <b>${c.climate.summary.averageMax ? c.climate.summary.averageMax + ' °C' : '—'}</b></div>
        <div>Wet probability: <b>${(c.climate.summary.rainProbability * 100).toFixed(0)}%</b></div>
      `;
    },
  });
}

async function renderChampionship() {
  const s = await api('/api/season');
  $('season-eyebrow').textContent = `Season ${s.season}`;
  const rounds = s.pointsRace.rounds;
  if (rounds && rounds.length) {
    const series = s.pointsRace.constructors.map((c) => ({
      name: c.name,
      colour: c.constructorId === 'ferrari' ? '#e10600' : '#8d93a6',
      width: c.constructorId === 'ferrari' ? 3 : 1.5,
      points: rounds.map((r, i) => ({ x: i + 1, y: r.cumulativePoints[c.constructorId] || 0 })),
    }));
    lineChart($('points-chart'), {
      title: 'Constructors Points Race',
      series,
      height: 280,
      xFmt: (v) => `R${v}`,
      yFmt: (v) => `${v} pts`,
    });
  }

  $('standings').innerHTML = s.standings
    .slice(0, 6)
    .map((st, i) => `<div style="display:flex; justify-content:space-between; padding:8px 0; border-bottom:1px solid var(--line); font-size:13px;"><span ${st.constructorId === 'ferrari' ? 'style="color:var(--rosso); font-weight:700;"' : ''}>P${i + 1} ${esc(st.name)}</span><b style="font-family:var(--mono);">${st.points}</b></div>`)
    .join('');
}

async function renderNextRace() {
  try {
    const n = await api('/api/next-race');
    $('next-title').textContent = `${esc(n.weekend.raceName)} ${n.weekend.season}`;
    $('next-sessions').innerHTML = `<h4>Schedule</h4><div class="muted small" style="margin-top:6px;">Starts: ${new Date(n.weekend.startsAt).toLocaleString()}</div>`;
    $('next-history').innerHTML = `<h4>Ferrari Record</h4><div style="font-family:var(--mono); margin-top:8px;">Wins there: <b style="color:var(--giallo);">${n.record ? n.record.wins : 0}</b> / ${n.record ? n.record.races : 0} races</div>`;
    if (n.forecast && n.forecast.length) {
      $('next-forecast').innerHTML = `<h4>Track Weather</h4><div class="muted small" style="margin-top:6px;">${n.forecast.map((f) => `${f.date}: ${f.tempMax}°C / ${f.tempMin}°C`).join('<br>')}</div>`;
    }
  } catch {
    $('next-title').textContent = 'Next Grand Prix';
  }
}

async function renderSources() {
  const h = await api('/api/health');
  $('source-grid').innerHTML = (h.upstreams || [])
    .map(
      (u) => `
    <div class="source-card">
      <div class="s-name">${esc(u.source)}</div>
      <div class="muted small">Requests: ${u.networkRequests} · Cache hits: ${u.cacheHits}</div>
      <div class="muted small">Failures: ${u.failures}</div>
    </div>`,
    )
    .join('');
}

async function init() {
  await waitForWarmup();
  await Promise.all([
    renderOverview(),
    renderOnThisDay(),
    renderDrivers(),
    renderCircuits(),
    renderChampionship(),
    renderNextRace(),
    renderSources(),
  ]);
}

init().catch(console.error);
