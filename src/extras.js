// Onboarding strip, luck share card, phone scroll-to-mat. Reads PTCG_GAME only; owns #guide and #share.
(function () {
  const G = PTCG_GAME, $ = id => document.getElementById(id);
  const money = v => '$' + (v >= 1000 ? Math.round(v).toLocaleString('en-US') : v.toFixed(2));
  const opened = () => Object.values(G.state.opened).reduce((a, b) => a + b, 0);
  const css = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();

  // ---------- guide: three steps, current one highlighted, gone after 3 packs ----------
  function renderGuide() {
    const s = G.state, n = opened(), stock = Object.values(s.stock).reduce((a, b) => a + b, 0);
    const el = $('guide');
    if (n >= 3) { el.hidden = true; return; }
    const cur = n ? 2 : stock ? 1 : 0;
    const steps = [
      ['进货', `你有 ${money(s.cash)}。在货架点「进 10 包」。`],
      ['开包', '点「开 1 包」撕开，一张张翻，或按空格。'],
      ['测欧气', '开完看「欧气检测」：你的运气排在 400 个模拟玩家的第几位。可以生成分享图。'],
    ];
    el.hidden = false;
    el.innerHTML = `<h2 class="eyebrow">怎么玩</h2><ol>${steps.map(([h, p], i) =>
      `<li class="${i < cur ? 'done' : i === cur ? 'now' : ''}"><b>${i + 1} ${h}</b><span>${p}</span></li>`).join('')}</ol>
      <p class="muted">卡价和开包概率都是真实统计；顾客会自己上门买货架上的整包，闲着也在赚钱。</p>`;
  }

  // ---------- share card ----------
  let img = '', shownAt = -1;
  async function drawCard() {
    await (document.fonts && document.fonts.ready);
    const L = G.luck(), t = G.state.tally, best = G.state.hits[0];
    const W = 1080, H = 1080, c = document.createElement('canvas'); c.width = W; c.height = H;
    const x = c.getContext('2d'), pct = L.pct * 100;
    const ink = css('--ink'), muted = css('--muted'), line = css('--line');
    const tone = pct >= 70 ? css('--gold') : pct < 30 ? css('--loss') : ink;
    const disp = css('--font-display'), num = css('--font-num'), body = css('--font-body');
    x.fillStyle = css('--panel'); x.fillRect(0, 0, W, H);
    x.textBaseline = 'alphabetic';
    const T = (s, px, y, o = {}) => { x.font = `${o.w || 400} ${px}px ${o.f || body}`; x.fillStyle = o.c || ink; x.textAlign = o.a || 'left'; x.fillText(s, o.a === 'right' ? W - 80 : 80, y); };
    T('欧气卡铺 · 欧气检测', 34, 110, { c: muted });
    T(L.title, 200, 340, { f: disp, c: tone });
    T(`开了 ${L.packs} 包，总值超过 ${pct.toFixed(1)}% 的模拟玩家`, 38, 420);
    // meter: same six bands as the on-page detector
    const bands = [[0, 10, css('--loss')], [10, 30, `color-mix(in oklab, ${css('--loss')} 45%, ${line})`], [30, 70, line], [70, 90, `color-mix(in oklab, ${css('--gold')} 45%, ${line})`], [90, 100, css('--gold')]];
    const mx = 80, mw = W - 160, my = 480;
    bands.forEach(([a, b, col]) => { x.fillStyle = col; x.fillRect(mx + mw * a / 100 + 1, my, mw * (b - a) / 100 - 2, 24); });
    x.fillStyle = ink; x.fillRect(mx + mw * pct / 100 - 4, my - 12, 8, 48);
    [['非酋', 0], ['平民', 50], ['欧皇', 100]].forEach(([s, p]) => { x.font = `26px ${body}`; x.fillStyle = muted; x.textAlign = p === 0 ? 'left' : p === 100 ? 'right' : 'center'; x.fillText(s, mx + mw * p / 100, my + 72); });
    [['开出市值', money(L.value)], ['期望市值', money(L.expected)], ['进货成本', money(L.cost)]].forEach(([k, v], i) => {
      x.textAlign = 'left'; x.font = `28px ${body}`; x.fillStyle = muted; x.fillText(k, 80 + i * 320, 660);
      x.font = `600 46px ${num}`; x.fillStyle = ink; x.fillText(v, 80 + i * 320, 720);
    });
    const hitsLine = [['SIR', 'SIR'], ['HR', '金卡'], ['IR', 'IR'], ['UR', 'UR']].filter(([k]) => t[k]).map(([k, n]) => `${n} ×${t[k]}`).join('  ') || '这次没出大货';
    x.fillStyle = line; x.fillRect(80, 780, W - 160, 2);
    T(best ? `最贵：${best.name}  ${money(best.price)}` : '', 36, 850);
    T(hitsLine, 32, 905, { c: muted });
    T('卡价 TCGplayer 市价 · 概率 TCGplayer 实开统计', 26, 1010, { c: muted });
    return c.toDataURL('image/png');
  }

  async function renderShare() {
    const el = $('share'), n = opened();
    if (!n) { el.hidden = true; return; }
    el.hidden = false;
    if (!el.firstChild) {
      el.innerHTML = `<h2 class="eyebrow">分享欧气</h2><button type="button" id="make-card">生成分享图</button><div id="card-out"></div>`;
      $('make-card').onclick = async () => {
        shownAt = opened(); img = await drawCard();
        const text = `我在欧气卡铺开了 ${G.luck().packs} 包，欧气排在 ${(G.luck().pct * 100).toFixed(1)}%：${G.luck().title}`;
        $('card-out').innerHTML = `<img src="${img}" alt="${text}"><div class="btns"><a class="dl" href="${img}" download="ouqi.png">下载 PNG</a><button type="button" id="copy-text">复制文字</button></div>`;
        $('copy-text').onclick = e => navigator.clipboard?.writeText(text + ' ' + location.href).then(() => { e.target.textContent = '已复制'; });
      };
    }
    // a card from fewer packs than now is stale
    if (shownAt !== -1 && shownAt !== n) { $('card-out').innerHTML = ''; shownAt = -1; }
  }

  // phones stack shelf above mat: bring the mat into view when a pack opens
  document.addEventListener('click', e => {
    const b = e.target.closest('[data-act]');
    if (b && /^(open1|open10|buyopen)$/.test(b.dataset.act) && matchMedia('(max-width: 779px)').matches)
      $('mat').scrollIntoView({ behavior: 'smooth', block: 'start' });
  });

  G.on(() => { renderGuide(); renderShare(); });
  renderGuide(); renderShare();
})();
