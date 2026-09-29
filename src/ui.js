// Rendering + input. Reads PTCG_GAME state, never mutates it directly.
(function () {
  const G = PTCG_GAME, S = PTCG_SIM, SETS = PTCG_SETS;
  const $ = id => document.getElementById(id);
  const money = v => '$' + (v >= 1000 ? v.toLocaleString('en-US', { maximumFractionDigits: 0 }) : v.toFixed(2));
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const imgUrl = (c, size = 'low') => `https://assets.tcgdex.net/en/sv/${c.set}/${c.n}/${size}.webp`;
  const logoUrl = id => `https://assets.tcgdex.net/en/sv/${id}/logo.png`;

  // Rarity symbols as printed on SV cards; `jp` is the name Chinese/Japanese players use.
  const RAR = {
    E: { g: '', zh: '基础能量', t: 0 }, FE: { g: '', zh: '闪能量', t: 2 },
    C: { g: '●', zh: '普通', t: 0 }, U: { g: '◆', zh: '非普通', t: 0 }, R: { g: '★', zh: '稀有', t: 1 },
    REV: { g: '', zh: '反闪', t: 1 }, RR: { g: '★★', zh: '双稀有 RR', t: 2 }, ACE: { g: 'ACE', zh: 'ACE SPEC', t: 2 },
    PB: { g: '◓', zh: '精灵球闪', t: 2 }, UR: { g: '★★', zh: '超稀有 UR', jp: 'SR', t: 3 },
    IR: { g: '★', zh: '插画稀有 IR', jp: 'AR', t: 4 }, MB: { g: '◓', zh: '大师球闪', t: 4 },
    SIR: { g: '★★', zh: '特殊插画 SIR', jp: 'SAR', t: 5 }, HR: { g: '★★★', zh: '金卡 HR', jp: 'UR', t: 5 },
  };
  const rar = c => RAR[c.kind] || RAR[c.r] || RAR.C;
  const rarLabel = k => { const r = RAR[k]; return r.jp ? `${r.zh}（${r.jp}）` : r.zh; };

  let mat = { mode: 'idle' };

  // ---------- header ----------
  function renderStats() {
    const s = G.state, stock = Object.values(s.stock).reduce((a, b) => a + b, 0);
    const held = Object.values(s.singles).reduce((a, c) => a + c.price * c.count, 0);
    $('stats').innerHTML = [
      ['现金', money(s.cash)], ['货架', `${stock} 包`], ['客流', `${(G.rate() * 60).toFixed(1)}/分`], ['来客', s.customers], ['手上单卡市值', money(held)],
    ].map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('');
  }

  // ---------- shelf ----------
  function renderShelf() {
    const s = G.state;
    $('shelf').innerHTML = SETS.map(set => {
      const w = G.wholesale(set.id), ev = S.packEV(set.id), stock = s.stock[set.id] || 0;
      const room = G.capacity() - stock, can = n => room > 0 && s.cash >= w * Math.min(n, room);
      if (!G.unlocked(set.id)) return `<article class="set locked"><img class="logo" src="${logoUrl(set.id)}" alt="${esc(set.en)}" loading="lazy">
        <div class="set-name"><h3>${set.name}</h3><span>${set.en} · ${set.released.slice(0, 4)}</span></div>
        <div class="set-stock">累计营业额 <b>${money(G.unlockAt(set.id))}</b> 解锁进货（现在 ${money(G.revenue())}）</div></article>`;
      const heat = s.heat[set.id], sp = G.sealedPrice(set.id);
      return `<article class="set">
        <img class="logo" src="${logoUrl(set.id)}" alt="${esc(set.en)}" loading="lazy">
        <div class="set-name"><h3>${set.name}</h3><span>${set.en} · ${set.released.slice(0, 4)}</span></div>
        <div class="set-price"><span class="sticker">${money(sp)}</span>${heat ? `<span class="heat ${heat > 1 ? 'hot' : 'cold'}" title="行情：柜台售价 ${heat > 1 ? '+15%' : '−10%'}（游戏设定）">${heat > 1 ? '热销' : '滞销'}</span>` : ''}
          <span>进货 ${money(w)}</span><span title="按 TCGplayer 市价 × 实测概率算出的单包期望">开出期望 ${money(ev)}</span></div>
        <div class="set-stock">库存 <b>${stock}</b>/${G.capacity()} 包${s.opened[set.id] ? ` · 已开 ${s.opened[set.id]}` : ''}</div>
        <div class="btns">
          <button type="button" data-act="buy" data-id="${set.id}" data-n="1" ${can(1) ? '' : 'disabled'}>进 1 包</button>
          <button type="button" data-act="buy" data-id="${set.id}" data-n="10" ${can(10) ? '' : 'disabled'}>进 10 包</button>
          <button type="button" class="primary" data-act="open1" data-id="${set.id}" ${stock ? '' : 'disabled'}>开 1 包</button>
          <button type="button" data-act="open10" data-id="${set.id}" ${stock ? '' : 'disabled'}>开 ${Math.min(10, stock) || 10} 包</button>
        </div>
      </article>`;
    }).join('');
  }

  function renderLog() {
    $('log').innerHTML = G.state.log.slice(0, 12).map(l =>
      `<li class="${l.tone}"><time>${new Date(l.t).toTimeString().slice(0, 5)}</time>${esc(l.text)}</li>`).join('') || '<li>还没有动静。先进点货。</li>';
  }

  // ---------- opening mat ----------
  const capHTML = c => { const r = rar(c); return `<span class="glyph">${r.g}</span>${rarLabel(c.kind === 'REV' ? 'REV' : c.kind)}<b>${money(c.price)}</b>`; };
  // big = the enlarged card on the stage (hi-res, tap to advance); otherwise a tray/grid thumbnail (tap to inspect once face-up).
  function cardHTML(c, i, up, big) {
    const r = rar(c);
    const face = c.r === 'E'
      ? `<span class="energy"><b>${c.name.slice(2, 3)}</b>${esc(c.name)}</span>`
      : `<img src="${imgUrl(c, big ? 'high' : 'low')}" alt="${esc(c.name)}" loading="eager" decoding="async">`;
    const act = big ? 'advance' : up ? 'peek' : '';
    return `<figure class="slot">
      <button type="button" class="card t${r.t} k-${c.kind}${up ? ' up' : ''}" ${act ? `data-act="${act}"` : 'tabindex="-1"'} data-i="${i}" aria-label="${up ? esc(c.name) : big ? '翻开这张' : `第 ${i + 1} 张（未翻）`}">
        <span class="card-in"><span class="back"></span><span class="face">${face}</span></span>
      </button>
      <figcaption>${capHTML(c)}</figcaption>
    </figure>`;
  }

  // Where one pack ranks among simulated packs of the same set, in words a player can quote.
  function rankText(setId, v) {
    const p = S.packPercentile(setId, v), pc = p >= .995 ? '99.5+' : (p * 100).toFixed(0);
    return { p, text: `比 ${pc}% 的${G.setById(setId).name}包值钱${p >= .9 ? `，约 ${Math.min(1000, Math.round(1 / (1 - p)))} 包才出一包这样的` : ''}` };
  }
  const shareBtn = () => '<button type="button" data-act="sharemat">分享这次开包</button>';
  function shareSpec() {
    const set = G.setById(mat.set), packs = mat.mode === 'batch' ? mat.packs : [mat.cards];
    const vals = packs.map(S.packValue), bi = vals.indexOf(Math.max(...vals)), cards = packs.flat();
    const best = cards.reduce((a, b) => (b.price > a.price ? b : a)), rk = rankText(set.id, vals[bi]);
    return { set: set.name, en: set.en, n: packs.length, value: vals.reduce((a, b) => a + b, 0), cost: G.wholesale(set.id) * packs.length,
      bestPack: vals[bi], rank: rk.text, pct: rk.p, best, hits: cards.filter(c => S.HITS.includes(c.kind)).length, img: imgUrl(best, 'high') };
  }

  function packSummary(cards, set) {
    const v = S.packValue(cards), cost = G.wholesale(set.id), d = v - cost;
    const best = cards.reduce((a, b) => (b.price > a.price ? b : a));
    const stock = G.state.stock[set.id] || 0;
    return `<div class="summary">
      <p>这包开出 <b>${money(v)}</b>，进货价 ${money(cost)}，<span class="${d >= 0 ? 'gain' : 'loss'}">${d >= 0 ? '赚' : '亏'} ${money(Math.abs(d))}</span>。最值钱：${esc(best.name)}。</p>
      <p class="rank">${rankText(set.id, v).text}。</p>
      <div class="btns">
        ${stock ? `<button type="button" class="primary" data-act="open1" data-id="${set.id}">再开一包（剩 ${stock}）</button>` : ''}
        ${shareBtn()}
        ${G.state.cash >= cost ? `<button type="button" data-act="buyopen" data-id="${set.id}">进 1 包马上开</button>` : ''}
      </div></div>`;
  }

  function renderMat() {
    const el = $('mat');
    if (mat.mode === 'idle') {
      el.innerHTML = `<div class="mat-empty"><p class="mat-big">开包台</p><p>左边货架先进货，再点「开 1 包」。<br>单包可以一张张翻，按空格翻下一张。</p></div>`;
      return;
    }
    const set = G.setById(mat.set);
    if (mat.mode === 'pack') {
      el.innerHTML = `<div class="mat-pack"><button type="button" class="pack" data-act="tear" aria-label="撕开这包${set.name}">
        <span class="pack-crimp"></span><img src="${logoUrl(set.id)}" alt=""><span class="pack-name">${set.name}</span><span class="pack-hint">点击撕开</span><span class="pack-crimp bottom"></span></button>${sndBtn()}</div>`;
      return;
    }
    if (mat.mode === 'cards') {
      const done = mat.up.size === mat.cards.length;
      el.innerHTML = `<div class="mat-head"><h2>${set.name}</h2><span id="mat-prog">${prog()}</span>${sndBtn()}
        ${done ? '' : '<button type="button" class="ghost" data-act="flipall">全部翻开</button>'}</div>
        <div class="deck"><div class="stage" id="stage">${cardHTML(mat.cards[mat.cur], mat.cur, mat.up.has(mat.cur), true)}</div>
        <div class="spread tray">${mat.cards.map((c, i) => cardHTML(c, i, mat.up.has(i))).join('')}</div></div>
        ${done ? packSummary(mat.cards, set) : ''}`;
      const st = $('stage').firstElementChild; if (!mat.up.size) st.classList.add('deal');
      return;
    }
    // batch
    const cards = mat.packs.flat(), hits = batchHits();
    const v = S.packValue(cards), cost = G.wholesale(set.id) * mat.packs.length, d = v - cost;
    el.innerHTML = `<div class="mat-head"><h2>${set.name} × ${mat.packs.length}</h2><span>开出 ${money(v)} · 进货 ${money(cost)} ·
      <b class="${d >= 0 ? 'gain' : 'loss'}">${d >= 0 ? '+' : '−'}${money(Math.abs(d))}</b></span>${sndBtn()}</div>
      ${hits.length ? `<div class="spread">${hits.map((c, i) => cardHTML(c, i, false)).join('')}</div>`
        : `<div class="mat-empty"><p class="mat-big">全空</p><p>${mat.packs.length} 包一张好卡都没有。欧气检测那边会记住的。</p></div>`}
      <div class="summary"><p class="rank">最好的一包 ${money(shareSpec().bestPack)}，${shareSpec().rank}。</p><div class="btns">${shareBtn()}${G.state.stock[set.id] ? `<button type="button" class="primary" data-act="open10" data-id="${set.id}">再开 ${Math.min(10, G.state.stock[set.id])} 包</button>` : ''}</div></div>`;
  }

  // ---------- reveal ----------
  // While a pack is being revealed the side panels (luck, binder, log, singles) stay frozen, otherwise they show the pull early.
  let hold = false;
  const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
  const batchHits = () => mat.packs.flat().filter(c => S.HITS.includes(c.kind)).sort((a, b) => b.price - a.price);
  const sndBtn = () => `<button type="button" class="ghost snd" data-act="mute">音效 ${PTCG_FX.muted() ? '关' : '开'}</button>`;
  const prog = () => `已翻 ${mat.up.size}/${mat.cards.length} · ${money(mat.cards.reduce((s, c, k) => s + (mat.up.has(k) ? c.price : 0), 0))}`;
  const ready = img => (!img || img.complete ? Promise.resolve() : new Promise(r => { img.onload = img.onerror = r; setTimeout(r, 1500); }));
  const armThumb = (btn, c, peek) => { btn.classList.add('up'); btn.setAttribute('aria-label', c.name); if (peek) { btn.dataset.act = 'peek'; btn.removeAttribute('tabindex'); } };

  function release() { if (hold) { hold = false; renderAll(); } }

  // Flip time by rarity tier: bulk cards fly past, chase cards slow down. The last (rare) slot is always at least 1.2 s so a miss and a hit look the same until the flip lands.
  const FLIP_MS = [140, 380, 600, 900, 1300, 1300];
  // The card just seen slides off to the left as the next one comes up, like moving the top card to the back of the stack.
  function slideAway(stage) {
    const old = stage.firstElementChild; if (!old || reduced()) return;
    const g = old.cloneNode(true); g.classList.add('away'); g.querySelectorAll('[data-act]').forEach(n => n.removeAttribute('data-act'));
    g.addEventListener('animationend', () => g.remove()); stage.append(g);
  }

  // One tap = next card slides out of the pack and flips. The last card (the rare slot) flips slowly for every pack, hit or not.
  function advance() {
    if (mat.mode !== 'cards' || mat.busy || mat.up.size >= mat.cards.length) return false;
    const tok = mat, i = mat.up.size, stage = $('stage'), fresh = mat.cur !== i, bulk = rar(mat.cards[i]).t === 0;
    mat.busy = true;
    if (fresh) {
      slideAway(stage);
      mat.cur = i; stage.innerHTML = cardHTML(mat.cards[i], i, false, true); stage.firstElementChild.classList.add('deal');
      if (bulk) stage.firstElementChild.classList.add('quick');
    }
    const btn = stage.querySelector('.card');
    ready(btn.querySelector('img')).then(() => setTimeout(() => { if (mat === tok) reveal(tok, i, btn); }, fresh && !reduced() ? (bulk ? 60 : 240) : 0));
    return true;
  }

  function reveal(tok, i, btn) {
    const c = tok.cards[i], t = rar(c).t, last = i === tok.cards.length - 1, ms = reduced() ? 0 : Math.max(FLIP_MS[t], last ? 1200 : 0);
    btn.style.setProperty('--flip', ms + 'ms');
    btn.style.setProperty('--ease', last ? 'cubic-bezier(.55, 0, .25, 1)' : 'cubic-bezier(.2, .7, .2, 1)');
    tok.up.add(i); btn.classList.add('up'); btn.setAttribute('aria-label', c.name);
    const th = document.querySelector(`.tray .card[data-i="${i}"]`); if (th) armThumb(th, c, true);
    const pg = $('mat-prog'); if (pg) pg.textContent = prog();
    if (last) PTCG_FX.swell(ms);
    if (t >= 4 && !reduced()) spotlight(ms + 1800);
    setTimeout(() => { PTCG_FX.flip(t); PTCG_FX.burst($('stage'), t); }, ms / 2); // the face turns toward the player halfway through
    setTimeout(() => { tok.busy = false; if (mat === tok && tok.up.size === tok.cards.length) finish(); }, ms + 80);
  }

  // UR-and-up pulls: dim the rest of the mat so the card stands alone.
  let spotTimer = 0;
  function spotlight(ms) { const m = $('mat'); m.classList.add('spot'); clearTimeout(spotTimer); spotTimer = setTimeout(() => m.classList.remove('spot'), ms); }

  function finish() {
    if (mat.finished) return; mat.finished = true; release();
    const el = $('mat'); el.querySelector('[data-act="flipall"]')?.remove();
    if (!el.querySelector('.summary')) el.insertAdjacentHTML('beforeend', packSummary(mat.cards, G.setById(mat.set)));
  }

  // Ten packs at once: the hits flip one after another, cheapest first, best last.
  function revealBatch(tok) {
    const hits = batchHits(), n = hits.length;
    if (!n) { PTCG_FX.miss(); release(); return; }
    const btns = [...document.querySelectorAll('.mat .spread .card')], step = reduced() ? 0 : Math.min(240, 2400 / n);
    for (let k = 0; k < n; k++) {
      const i = n - 1 - k, delay = reduced() ? 0 : 350 + k * step + (k === n - 1 ? 400 : 0);
      setTimeout(() => {
        if (mat !== tok) return;
        const t = rar(hits[i]).t; if (t >= 4 && k === n - 1 && !reduced()) spotlight(2200); armThumb(btns[i], hits[i]); PTCG_FX.flip(t); PTCG_FX.burst(btns[i].closest('.slot'), t);
      }, delay);
    }
    setTimeout(() => { if (mat === tok) release(); }, (reduced() ? 0 : 350 + n * step + 1200));
  }

  // ---------- luck detector ----------
  const BANDS = [[0, 10, '非酋'], [10, 30, '小非'], [30, 70, '平民'], [70, 90, '小欧'], [90, 99, '欧洲人'], [99, 100, '欧皇']];
  // Exact binomial tail for one rarity: how likely a player is to be at least this lucky (or unlucky).
  function tailLabel(k, got, exp) {
    const p = S.hitTail(G.state.opened, k, got), pct = p * 100;
    return `${got >= exp ? '≥' : '≤'}${got} 的概率 ${pct < 0.1 ? '<0.1' : pct < 10 ? pct.toFixed(1) : pct.toFixed(0)}%`;
  }
  function renderLuck() {
    const L = G.luck(), e = G.expectedTally(), t = G.state.tally;
    const pct = L.pct == null ? null : L.pct * 100;
    const rows = ['RR', 'ACE', 'PB', 'UR', 'IR', 'MB', 'SIR', 'HR'].filter(k => e[k] > 0 || t[k]);
    $('luck').innerHTML = `<h2 class="eyebrow" id="luck-h">欧气检测</h2>
      <p class="verdict ${pct == null ? '' : pct >= 70 ? 'lucky' : pct < 30 ? 'unlucky' : ''}">${L.title}</p>
      <p class="verdict-sub">${pct == null ? '开几包就能测。拿你开出的总市值，和同样开了这些包的几千个模拟玩家比（每个系列先抽 6 万包建分布）。'
        : `开了 ${L.packs} 包，开出总值超过 <b>${pct.toFixed(0)}%</b> 的模拟玩家。总市值被少数几张大卡左右，误差约 ±1–3 个百分点。`}</p>
      <div class="meter" role="img" aria-label="欧气百分位 ${pct == null ? '未测' : pct.toFixed(1)}">
        ${BANDS.map(([a, b, n]) => `<span style="flex:${b - a}" title="${n} ${a}–${b}%"></span>`).join('')}
        ${pct == null ? '' : `<i style="left:${pct}%"></i>`}
      </div>
      <div class="meter-labels">${BANDS.map(([a, b, n]) => `<span style="flex:${Math.max(b - a, 8)}">${n}</span>`).join('')}</div>
      ${L.packs ? `<dl class="kv">
        <div><dt>开出市值</dt><dd>${money(L.value)}</dd></div>
        <div><dt>期望市值</dt><dd>${money(L.expected)}</dd></div>
        <div><dt>进货成本</dt><dd>${money(L.cost)}</dd></div></dl>
      <table class="tally"><thead><tr><th>稀有度</th><th>开出</th><th>期望</th><th title="按官方概率，开到这么多或更多（更少）的概率">概率</th></tr></thead><tbody>
        ${rows.map(k => `<tr class="${(t[k] || 0) >= (e[k] || 0) ? 'up' : ''}"><td><span class="glyph">${RAR[k].g}</span>${rarLabel(k)}</td><td>${t[k] || 0}</td><td>${(e[k] || 0).toFixed(1)}</td><td>${tailLabel(k, t[k] || 0, e[k] || 0)}</td></tr>`).join('')}
      </tbody></table>` : ''}`;
  }

  function renderBinder() {
    const hits = G.state.hits.slice(0, 8);
    $('binder').innerHTML = `<h2 class="eyebrow">战利品 · 开出过最贵的</h2>` + (hits.length
      ? `<ul class="binder">${hits.map(c => `<li><img src="${imgUrl(c)}" alt="${esc(c.name)}" loading="lazy"><span>${money(c.price)}</span></li>`).join('')}</ul>`
      : '<p class="muted">还没出过 RR 以上的卡。</p>');
  }

  function renderSingles() {
    const list = Object.entries(G.state.singles).filter(([, c]) => S.HITS.includes(c.kind)).sort((a, b) => b[1].price - a[1].price);
    const bulk = G.bulkValue();
    $('singles').innerHTML = `<h2 class="eyebrow">单卡库存 · 同行收卡价 ${Math.round(G.BUYLIST * 100)}%</h2>
      <div class="bulk"><span>散卡 ${bulk.n} 张 · 可卖 ${money(bulk.v)}</span>
        <button type="button" data-act="bulk" ${bulk.n ? '' : 'disabled'}>一键卖散卡</button></div>
      <ul class="singles">${list.map(([k, c]) => `<li>
        <span class="glyph t${rar(c).t}">${rar(c).g}</span>
        <span class="s-name">${esc(c.name)}<small>${G.setById(c.set).name} #${c.n} · ${rarLabel(c.kind)}</small></span>
        <span class="s-count">×${c.count}</span>
        <span class="s-btns"><button type="button" data-act="list" data-key="${esc(k)}" ${G.state.shown.length >= G.slots() ? 'disabled' : ''} title="挂进展示柜慢慢卖">上柜</button>
        <button type="button" data-act="trophy" data-key="${esc(k)}" title="当镇店之宝，吸引客流，但不再出售">镇店</button>
        <button type="button" data-act="sell" data-key="${esc(k)}" title="立刻卖给同行">卖 ${money(c.price * G.BUYLIST)}</button></span></li>`).join('')}</ul>`;
  }

  // ---------- shop management: upgrades, display case, offline report ----------
  function renderUpgrades() {
    $('upgrades').innerHTML = `<h2 class="eyebrow">店铺升级</h2><ul class="ups">${Object.entries(G.UPGRADES).map(([k, u]) => {
      const lv = G.lvl(k), cost = G.upgradeCost(k);
      return `<li><span class="u-name">${u.name}<small>${u.desc}</small></span><span class="u-lv">Lv${lv}/${u.costs.length}</span>
        ${cost == null ? '<span class="muted">已满级</span>' : `<button type="button" data-act="up" data-k="${k}" ${G.state.cash >= cost ? '' : 'disabled'}>${money(cost)}</button>`}</li>`;
    }).join('')}</ul>`;
  }

  function renderCase() {
    const s = G.state, t = s.trophy, tiers = G.CASE_PRICING;
    $('casepanel').innerHTML = `<h2 class="eyebrow">展示柜 ${s.shown.length}/${G.slots()} · 镇店之宝</h2>
      <div class="tiers" role="group" aria-label="展示柜定价">${tiers.map((p, i) =>
        `<button type="button" data-act="tier" data-i="${i}" aria-pressed="${s.casePrice === i}">${p.name} ${Math.round(p.mult * 100)}%</button>`).join('')}</div>
      <p class="muted">逛柜台的顾客约 ${Math.round(G.BROWSE * 100)}%；${tiers[s.casePrice].name}档每位逛柜的顾客有 ${Math.round(tiers[s.casePrice].buy * 100)}% 会买下一张。价越高卖得越慢，占着柜位。</p>
      <ul class="singles">${s.shown.map((c, i) => `<li><span class="glyph t${rar(c).t}">${rar(c).g}</span>
        <span class="s-name">${esc(c.name)}<small>${G.setById(c.set).name} #${c.n}</small></span>
        <span class="s-count">${money(c.price * tiers[s.casePrice].mult)}</span>
        <button type="button" data-act="unlist" data-i="${i}">撤下</button></li>`).join('') || '<li class="muted">空着。在单卡库存里点「上柜」。</li>'}</ul>
      <div class="trophy">${t ? `<img src="${imgUrl(t)}" alt="${esc(t.name)}"><span>${esc(t.name)} ${money(t.price)}<small>客流 +${Math.round(G.trophyBonus() * 100)}%，不会被卖掉</small></span>
        <button type="button" data-act="untrophy">收回</button>` : '<span class="muted">没有镇店之宝。单卡越值钱，加成越高（上限 +50%）。</span>'}</div>`;
  }

  function renderNotice() {
    const o = G.state.offline, el = $('notice');
    if (!o) { el.hidden = true; return; }
    const h = o.secs >= 3600 ? `${(o.secs / 3600).toFixed(1)} 小时` : `${Math.round(o.secs / 60)} 分钟`;
    el.hidden = false;
    el.innerHTML = `<p>打烊 ${h}：卖出 <b>${o.sales}</b> 件，入账 <b class="gain">${money(o.revenue)}</b>${o.lost ? `，货架空了，错过 <b class="loss">${o.lost}</b> 位顾客` : ''}。</p>
      <button type="button" class="ghost" data-act="ack">知道了</button>`;
  }

  function renderSources() {
    const upd = SETS.map(s => PTCG_DATA[s.id].pricesUpdated).sort().pop()?.slice(0, 10);
    $('sources').innerHTML = `<p>单卡价：TCGplayer 市价（经 <a href="https://tcgdex.dev" target="_blank" rel="noopener">TCGdex</a>，${upd}）。
      开包概率：TCGplayer 实开统计 ${SETS.map(s => `<a href="${s.rateSource}" target="_blank" rel="noopener">${s.name}</a>（${s.sample.toLocaleString()} 包）`).join('、')}。
      整包市价：${SETS.map(s => `<a href="${s.priceSource}" target="_blank" rel="noopener">PriceCharting ${s.name}</a>`).join('、')}。</p>
      <p>游戏设定（不是市场数据）：进货价 = 市价 × ${Math.round(G.WHOLESALE * 100)}%（进货渠道每级 −${G.WHOLESALE_STEP * 100} 个百分点，最低 ${Math.round((G.WHOLESALE - G.WHOLESALE_STEP * G.UPGRADES.supplier.costs.length) * 100)}%），同行收卡价 = 市价 × ${Math.round(G.BUYLIST * 100)}%，平均每 ${Math.round(1 / G.CUSTOMERS_PER_SEC)} 秒来一位顾客（招牌每级 +${G.SIGN_STEP * 100}%）。卡图 © Pokémon / Nintendo / Creatures / GAME FREAK，本页仅供娱乐。</p>`;
  }

  function renderAll() { if (hold) { renderShelf(); return; } renderStats(); renderShelf(); renderLog(); renderLuck(); renderBinder(); renderSingles(); renderUpgrades(); renderCase(); renderNotice(); }

  // ---------- input ----------
  let resetArmed = 0;
  document.addEventListener('click', e => {
    const b = e.target.closest('[data-act]'); if (!b || b.disabled) return;
    PTCG_FX.unlock();
    const id = b.dataset.id;
    switch (b.dataset.act) {
      case 'buy': G.buy(id, +b.dataset.n); break;
      case 'buyopen': if (G.buy(id, 1)) startPack(id); break;
      case 'open1': startPack(id); break;
      case 'open10': { hold = true; const packs = G.open(id, 10); if (packs.length) { mat = { mode: 'batch', set: id, packs }; renderMat(); revealBatch(mat); } else release(); break; }
      case 'tear': { const tok = mat; PTCG_FX.tear(); b.classList.add('torn'); setTimeout(() => { if (mat !== tok) return; mat.mode = 'cards'; mat.cur = 0; renderMat(); }, reduced() ? 0 : 380); break; }
      case 'advance': advance(); break;
      case 'peek': if (!mat.busy) { mat.cur = +b.dataset.i; $('stage').innerHTML = cardHTML(mat.cards[mat.cur], mat.cur, true, true); } break;
      case 'flipall': mat.cards.forEach((_, i) => mat.up.add(i)); mat.cur = mat.cards.length - 1; renderMat(); finish(); break;
      case 'mute': PTCG_FX.setMuted(!PTCG_FX.muted()); document.querySelectorAll('.snd').forEach(x => { x.textContent = `音效 ${PTCG_FX.muted() ? '关' : '开'}`; }); break;
      case 'sharemat': PTCG_SHARE.pack(shareSpec()); break;
      case 'sell': G.sell(b.dataset.key); break;
      case 'bulk': G.sellBulk(); break;
      case 'list': G.list(b.dataset.key); break;
      case 'unlist': G.unlist(+b.dataset.i); break;
      case 'trophy': G.setTrophy(b.dataset.key); break;
      case 'untrophy': G.clearTrophy(); break;
      case 'tier': G.setCasePrice(+b.dataset.i); break;
      case 'up': G.upgrade(b.dataset.k); break;
      case 'ack': G.ackOffline(); break;
      case 'reset':
        if (Date.now() - resetArmed < 3000) { hold = false; G.reset(); mat = { mode: 'idle' }; renderMat(); b.textContent = '清空存档'; resetArmed = 0; }
        else { resetArmed = Date.now(); b.textContent = '再点一次确认'; setTimeout(() => { if (resetArmed) b.textContent = '清空存档'; }, 3000); }
        break;
    }
  });
  // Swipe the card on the stage sideways to send it to the back (same as a tap). Taps right after a swipe are ignored.
  let swipe = null, swiped = 0;
  document.addEventListener('pointerdown', e => { swipe = e.target.closest('.stage .card') ? { x: e.clientX, y: e.clientY } : null; });
  document.addEventListener('pointerup', e => {
    if (!swipe) return; const dx = e.clientX - swipe.x, dy = e.clientY - swipe.y; swipe = null;
    if (Math.abs(dx) > 48 && Math.abs(dx) > 2 * Math.abs(dy)) { swiped = Date.now(); PTCG_FX.unlock(); advance(); }
  });
  document.addEventListener('click', e => { if (Date.now() - swiped < 120) e.stopPropagation(); }, true);

  // Drag the top of the sealed pack to the right to rip it; a plain tap or Space still works.
  const TEAR_PX = 150; let rip = null, ripMoved = false;
  document.addEventListener('pointerdown', e => {
    const p = e.target.closest('.pack'); if (!p || p.classList.contains('torn')) return;
    rip = { p, x: e.clientX }; ripMoved = false; p.setPointerCapture?.(e.pointerId); p.classList.add('dragging');
  });
  document.addEventListener('pointermove', e => {
    if (!rip) return; const d = Math.max(0, e.clientX - rip.x);
    if (d > 6) ripMoved = true;
    rip.p.style.setProperty('--tear', Math.min(1, d / TEAR_PX).toFixed(2));
  });
  document.addEventListener('pointerup', e => {
    if (!rip) return; const { p } = rip, done = e.clientX - rip.x >= TEAR_PX * .7; rip = null;
    p.classList.remove('dragging'); if (!done) { p.style.removeProperty('--tear'); return; }
    p.style.removeProperty('--tear'); ripMoved = true; ripGo = true; p.click();
  });
  // A drag ends in a native click on the pack; swallow it (ripGo lets our own click through once).
  let ripGo = false;
  document.addEventListener('click', e => { if (!ripMoved || !e.target.closest('.pack')) return; if (ripGo) { ripGo = false; return; } e.stopPropagation(); }, true);

  document.addEventListener('keydown', e => {
    if (e.code !== 'Space' || e.target.closest('input, textarea')) return;
    PTCG_FX.unlock();
    if (mat.mode === 'pack') { e.preventDefault(); document.querySelector('.pack')?.click(); }
    else if (mat.mode === 'cards' && mat.up.size < mat.cards.length) { e.preventDefault(); advance(); }
  });

  function startPack(id) {
    hold = true;
    const [cards] = G.open(id, 1); if (!cards) { hold = false; return; }
    cards.forEach(c => { if (c.r !== 'E') { new Image().src = imgUrl(c); new Image().src = imgUrl(c, 'high'); } }); // warm the cache before the flips
    mat = { mode: 'pack', set: id, cards, up: new Set(), cur: 0 };
    renderMat();
  }

  G.on(renderAll);
  setInterval(() => G.tick(1), 1000);
  G.tick(); renderAll(); renderMat(); renderSources(); // first tick credits the time the shop was closed
})();
