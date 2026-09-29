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
      ['现金', money(s.cash)], ['货架', `${stock} 包`], ['来客', s.customers], ['手上单卡市值', money(held)],
    ].map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('');
  }

  // ---------- shelf ----------
  function renderShelf() {
    const s = G.state;
    $('shelf').innerHTML = SETS.map(set => {
      const w = G.wholesale(set.id), ev = S.packEV(set.id), stock = s.stock[set.id] || 0;
      const can = n => s.cash >= w * n;
      return `<article class="set">
        <img class="logo" src="${logoUrl(set.id)}" alt="${esc(set.en)}" loading="lazy">
        <div class="set-name"><h3>${set.name}</h3><span>${set.en} · ${set.released.slice(0, 4)}</span></div>
        <div class="set-price"><span class="sticker">${money(set.packPrice)}</span>
          <span>进货 ${money(w)}</span><span title="按 TCGplayer 市价 × 实测概率算出的单包期望">开出期望 ${money(ev)}</span></div>
        <div class="set-stock">库存 <b>${stock}</b> 包${s.opened[set.id] ? ` · 已开 ${s.opened[set.id]}` : ''}</div>
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
  function cardHTML(c, i, up) {
    const r = rar(c);
    const face = c.r === 'E'
      ? `<span class="energy"><b>${c.name.slice(2, 3)}</b>${esc(c.name)}</span>`
      : `<img src="${imgUrl(c)}" alt="${esc(c.name)}" loading="eager" decoding="async">`;
    return `<figure class="slot">
      <button type="button" class="card t${r.t} k-${c.kind}${up ? ' up' : ''}" data-act="flip" data-i="${i}" aria-label="${up ? esc(c.name) : `翻开第 ${i + 1} 张`}">
        <span class="card-in"><span class="back"></span><span class="face">${face}</span></span>
      </button>
      <figcaption>${up ? `<span class="glyph">${r.g}</span>${rarLabel(c.kind === 'REV' ? 'REV' : c.kind)}<b>${money(c.price)}</b>` : '&nbsp;'}</figcaption>
    </figure>`;
  }

  function packSummary(cards, set) {
    const v = S.packValue(cards), cost = G.wholesale(set.id), d = v - cost;
    const best = cards.reduce((a, b) => (b.price > a.price ? b : a));
    const stock = G.state.stock[set.id] || 0;
    return `<div class="summary">
      <p>这包开出 <b>${money(v)}</b>，进货价 ${money(cost)}，<span class="${d >= 0 ? 'gain' : 'loss'}">${d >= 0 ? '赚' : '亏'} ${money(Math.abs(d))}</span>。最值钱：${esc(best.name)}。</p>
      <div class="btns">
        ${stock ? `<button type="button" class="primary" data-act="open1" data-id="${set.id}">再开一包（剩 ${stock}）</button>` : ''}
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
        <span class="pack-crimp"></span><img src="${logoUrl(set.id)}" alt=""><span class="pack-name">${set.name}</span><span class="pack-hint">点击撕开</span><span class="pack-crimp bottom"></span></button></div>`;
      return;
    }
    if (mat.mode === 'cards') {
      const done = mat.up.size === mat.cards.length;
      const v = mat.cards.reduce((s, c, i) => s + (mat.up.has(i) ? c.price : 0), 0);
      el.innerHTML = `<div class="mat-head"><h2>${set.name}</h2><span>已翻 ${mat.up.size}/${mat.cards.length} · ${money(v)}</span>
        ${done ? '' : '<button type="button" class="ghost" data-act="flipall">全部翻开</button>'}</div>
        <div class="spread">${mat.cards.map((c, i) => cardHTML(c, i, mat.up.has(i))).join('')}</div>
        ${done ? packSummary(mat.cards, set) : ''}`;
      return;
    }
    // batch
    const cards = mat.packs.flat(), hits = cards.filter(c => S.HITS.includes(c.kind)).sort((a, b) => b.price - a.price);
    const v = S.packValue(cards), cost = G.wholesale(set.id) * mat.packs.length, d = v - cost;
    el.innerHTML = `<div class="mat-head"><h2>${set.name} × ${mat.packs.length}</h2><span>开出 ${money(v)} · 进货 ${money(cost)} ·
      <b class="${d >= 0 ? 'gain' : 'loss'}">${d >= 0 ? '+' : '−'}${money(Math.abs(d))}</b></span></div>
      ${hits.length ? `<div class="spread">${hits.map((c, i) => cardHTML(c, i, true)).join('')}</div>`
        : `<div class="mat-empty"><p class="mat-big">全空</p><p>${mat.packs.length} 包一张好卡都没有。欧气检测那边会记住的。</p></div>`}
      <div class="summary"><div class="btns">${G.state.stock[set.id] ? `<button type="button" class="primary" data-act="open10" data-id="${set.id}">再开 ${Math.min(10, G.state.stock[set.id])} 包</button>` : ''}</div></div>`;
  }

  function flip(i) {
    if (mat.mode !== 'cards' || mat.up.has(i)) return;
    mat.up.add(i);
    const btn = document.querySelector(`[data-act="flip"][data-i="${i}"]`);
    if (btn && mat.up.size < mat.cards.length) { // flip in place so the animation plays
      btn.classList.add('up');
      const c = mat.cards[i], r = rar(c);
      btn.closest('.slot').querySelector('figcaption').innerHTML = `<span class="glyph">${r.g}</span>${rarLabel(c.kind === 'REV' ? 'REV' : c.kind)}<b>${money(c.price)}</b>`;
      const head = document.querySelector('.mat-head span');
      if (head) head.textContent = `已翻 ${mat.up.size}/${mat.cards.length} · ${money(mat.cards.reduce((s, c, k) => s + (mat.up.has(k) ? c.price : 0), 0))}`;
    } else renderMat();
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
        <button type="button" data-act="sell" data-key="${esc(k)}">卖 ${money(c.price * G.BUYLIST)}</button></li>`).join('')}</ul>`;
  }

  function renderSources() {
    const upd = SETS.map(s => PTCG_DATA[s.id].pricesUpdated).sort().pop()?.slice(0, 10);
    $('sources').innerHTML = `<p>单卡价：TCGplayer 市价（经 <a href="https://tcgdex.dev" target="_blank" rel="noopener">TCGdex</a>，${upd}）。
      开包概率：TCGplayer 实开统计 ${SETS.map(s => `<a href="${s.rateSource}" target="_blank" rel="noopener">${s.name}</a>（${s.sample.toLocaleString()} 包）`).join('、')}。
      整包市价：${SETS.map(s => `<a href="${s.priceSource}" target="_blank" rel="noopener">PriceCharting ${s.name}</a>`).join('、')}。</p>
      <p>游戏设定（不是市场数据）：进货价 = 市价 × ${Math.round(G.WHOLESALE * 100)}%，同行收卡价 = 市价 × ${Math.round(G.BUYLIST * 100)}%，平均每 ${Math.round(1 / G.CUSTOMERS_PER_SEC)} 秒来一位顾客。卡图 © Pokémon / Nintendo / Creatures / GAME FREAK，本页仅供娱乐。</p>`;
  }

  function renderAll() { renderStats(); renderShelf(); renderLog(); renderLuck(); renderBinder(); renderSingles(); }

  // ---------- input ----------
  let resetArmed = 0;
  document.addEventListener('click', e => {
    const b = e.target.closest('[data-act]'); if (!b || b.disabled) return;
    const id = b.dataset.id;
    switch (b.dataset.act) {
      case 'buy': G.buy(id, +b.dataset.n); break;
      case 'buyopen': if (G.buy(id, 1)) startPack(id); break;
      case 'open1': startPack(id); break;
      case 'open10': { const packs = G.open(id, 10); if (packs.length) { mat = { mode: 'batch', set: id, packs }; renderMat(); } break; }
      case 'tear': b.classList.add('torn'); setTimeout(() => { mat.mode = 'cards'; renderMat(); }, matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 380); break;
      case 'flip': flip(+b.dataset.i); break;
      case 'flipall': mat.cards.forEach((_, i) => mat.up.add(i)); renderMat(); break;
      case 'sell': G.sell(b.dataset.key); break;
      case 'bulk': G.sellBulk(); break;
      case 'reset':
        if (Date.now() - resetArmed < 3000) { G.reset(); mat = { mode: 'idle' }; renderMat(); b.textContent = '清空存档'; resetArmed = 0; }
        else { resetArmed = Date.now(); b.textContent = '再点一次确认'; setTimeout(() => { if (resetArmed) b.textContent = '清空存档'; }, 3000); }
        break;
    }
  });
  document.addEventListener('keydown', e => {
    if (e.code !== 'Space' || e.target.closest('input, textarea') || mat.mode !== 'cards') return;
    const next = mat.cards.findIndex((_, i) => !mat.up.has(i));
    if (next >= 0) { e.preventDefault(); flip(next); }
  });

  function startPack(id) {
    const [cards] = G.open(id, 1); if (!cards) return;
    cards.forEach(c => { if (c.r !== 'E') new Image().src = imgUrl(c); }); // warm the cache before the flips
    mat = { mode: 'pack', set: id, cards, up: new Set() };
    renderMat();
  }

  G.on(renderAll);
  setInterval(() => G.tick(1), 1000);
  renderAll(); renderMat(); renderSources();
})();
