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
      <div class="summary"><div class="btns">${G.state.stock[set.id] ? `<button type="button" class="primary" data-act="open10" data-id="${set.id}">再开 ${Math.min(10, G.state.stock[set.id])} 包</button>` : ''}</div></div>`;
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

  // One tap = next card slides out of the pack and flips. The last card (the rare slot) flips slowly for every pack, hit or not.
  function advance() {
    if (mat.mode !== 'cards' || mat.busy || mat.up.size >= mat.cards.length) return false;
    const tok = mat, i = mat.up.size, stage = $('stage'), fresh = mat.cur !== i;
    mat.busy = true;
    if (fresh) { mat.cur = i; stage.innerHTML = cardHTML(mat.cards[i], i, false, true); stage.firstElementChild.classList.add('deal'); }
    const btn = stage.querySelector('.card');
    ready(btn.querySelector('img')).then(() => setTimeout(() => { if (mat === tok) reveal(tok, i, btn); }, fresh && !reduced() ? 240 : 0));
    return true;
  }

  function reveal(tok, i, btn) {
    const c = tok.cards[i], t = rar(c).t, last = i === tok.cards.length - 1, ms = reduced() ? 0 : last ? 1200 : 460;
    btn.style.setProperty('--flip', ms + 'ms');
    btn.style.setProperty('--ease', last ? 'cubic-bezier(.55, 0, .25, 1)' : 'cubic-bezier(.2, .7, .2, 1)');
    tok.up.add(i); btn.classList.add('up'); btn.setAttribute('aria-label', c.name);
    const th = document.querySelector(`.tray .card[data-i="${i}"]`); if (th) armThumb(th, c, true);
    const pg = $('mat-prog'); if (pg) pg.textContent = prog();
    if (last) PTCG_FX.swell(ms);
    setTimeout(() => { PTCG_FX.flip(t); PTCG_FX.burst($('stage'), t); }, ms / 2); // the face turns toward the player halfway through
    setTimeout(() => { tok.busy = false; if (mat === tok && tok.up.size === tok.cards.length) finish(); }, ms + 80);
  }

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
        const t = rar(hits[i]).t; armThumb(btns[i], hits[i]); PTCG_FX.flip(t); PTCG_FX.burst(btns[i].closest('.slot'), t);
      }, delay);
    }
    setTimeout(() => { if (mat === tok) release(); }, (reduced() ? 0 : 350 + n * step + 1200));
  }

  // ---------- luck detector ----------
  const BANDS = [[0, 10, '非酋'], [10, 30, '小非'], [30, 70, '平民'], [70, 90, '小欧'], [90, 99, '欧洲人'], [99, 100, '欧皇']];
  function renderLuck() {
    const L = G.luck(), e = G.expectedTally(), t = G.state.tally;
    const pct = L.pct == null ? null : L.pct * 100;
    const rows = ['RR', 'ACE', 'PB', 'UR', 'IR', 'MB', 'SIR', 'HR'].filter(k => e[k] > 0 || t[k]);
    $('luck').innerHTML = `<h2 class="eyebrow" id="luck-h">欧气检测</h2>
      <p class="verdict ${pct == null ? '' : pct >= 70 ? 'lucky' : pct < 30 ? 'unlucky' : ''}">${L.title}</p>
      <p class="verdict-sub">${pct == null ? '开几包就能测。拿你开出的总市值，和同样开了这些包的 400 个模拟玩家比。'
        : `开了 ${L.packs} 包，开出总值超过 <b>${pct.toFixed(1)}%</b> 的模拟玩家。`}</p>
      <div class="meter" role="img" aria-label="欧气百分位 ${pct == null ? '未测' : pct.toFixed(1)}">
        ${BANDS.map(([a, b, n]) => `<span style="flex:${b - a}" title="${n} ${a}–${b}%"></span>`).join('')}
        ${pct == null ? '' : `<i style="left:${pct}%"></i>`}
      </div>
      <div class="meter-labels">${BANDS.map(([a, b, n]) => `<span style="flex:${Math.max(b - a, 8)}">${n}</span>`).join('')}</div>
      ${L.packs ? `<dl class="kv">
        <div><dt>开出市值</dt><dd>${money(L.value)}</dd></div>
        <div><dt>期望市值</dt><dd>${money(L.expected)}</dd></div>
        <div><dt>进货成本</dt><dd>${money(L.cost)}</dd></div></dl>
      <table class="tally"><thead><tr><th>稀有度</th><th>开出</th><th>期望</th></tr></thead><tbody>
        ${rows.map(k => `<tr class="${(t[k] || 0) >= (e[k] || 0) ? 'up' : ''}"><td><span class="glyph">${RAR[k].g}</span>${rarLabel(k)}</td><td>${t[k] || 0}</td><td>${(e[k] || 0).toFixed(1)}</td></tr>`).join('')}
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

  function renderAll() { if (hold) { renderShelf(); return; } renderStats(); renderShelf(); renderLog(); renderLuck(); renderBinder(); renderSingles(); }

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
      case 'sell': G.sell(b.dataset.key); break;
      case 'bulk': G.sellBulk(); break;
      case 'reset':
        if (Date.now() - resetArmed < 3000) { hold = false; G.reset(); mat = { mode: 'idle' }; renderMat(); b.textContent = '清空存档'; resetArmed = 0; }
        else { resetArmed = Date.now(); b.textContent = '再点一次确认'; setTimeout(() => { if (resetArmed) b.textContent = '清空存档'; }, 3000); }
        break;
    }
  });
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
  renderAll(); renderMat(); renderSources();
})();
