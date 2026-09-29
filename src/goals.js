// 顾客 + 图鉴 + 店员 panel. Reads PTCG_GAME only; owns #goals. Frozen while a pack is being revealed (dex progress would spoil the pull).
(function () {
  const G = PTCG_GAME, SETS = PTCG_SETS, $ = id => document.getElementById(id);
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const RES = { sold: '成交', pricey: '嫌贵', none: '没找到' };

  function customers() {
    const rec = G.state.recent, n = rec.length, by = r => rec.filter(x => x.r === r).length;
    if (!n) return '<p class="muted">还没有顾客来过。先把货上架。</p>';
    const [sold, pricey, none] = ['sold', 'pricey', 'none'].map(by);
    const tip = pricey > sold && pricey >= none ? '嫌贵的人比买的人多：试试降价。' : none > sold && none > pricey ? '多数人找不到想要的：货架和展示柜里缺货。' : sold >= n * 0.7 ? '几乎都买了：可以试着涨一点价。' : '';
    return `<div class="cust-bar" role="img" aria-label="最近 ${n} 位顾客：买走 ${sold}，嫌贵 ${pricey}，没找到 ${none}">
        <span class="c-sold" style="flex:${sold}"></span><span class="c-pricey" style="flex:${pricey}"></span><span class="c-none" style="flex:${none}"></span></div>
      <p class="cust-sum">最近 ${n} 位：<b class="gain">买走 ${sold}</b> · <b class="c-p">嫌贵 ${pricey}</b> · <span class="muted">没找到 ${none}</span></p>
      ${tip ? `<p class="muted">${tip}</p>` : ''}
      <ul class="cust-feed">${rec.slice(0, 6).map(x => `<li class="${x.r}"><span>${RES[x.r]}</span>${esc(x.text)}</li>`).join('')}</ul>`;
  }

  function dex() {
    return SETS.filter(s => G.unlocked(s.id)).map(s => {
      const c = G.dexCount(s.id), tot = G.dexTotal(s.id), share = c / tot, next = G.DEX_TIERS.find(([at]) => share < at - 1e-9);
      const need = next ? Math.ceil(next[0] * tot - 1e-9) - c : 0;
      return `<li><div class="dx-h"><span>${s.name}</span><b>${c}/${tot}</b></div>
        <div class="dx-bar" role="img" aria-label="${s.name} 图鉴 ${Math.round(share * 100)}%"><i style="width:${share * 100}%"></i>${G.DEX_TIERS.map(([at]) => `<u style="left:${at * 100}%"></u>`).join('')}</div>
        <small class="muted">${next ? `再收 ${need} 张到 ${next[0] * 100}%：回头客 +${next[1] * 100}%` : '已收齐'} · 现有加成 +${Math.round(G.dexBonusOf(s.id) * 100)}%</small></li>`;
    }).join('');
  }

  function clerk() {
    if (!G.lvl('clerk')) return `<p class="muted">店员（店铺升级里）会在货架见底时自动进货上架，你不在线也照样补。</p>`;
    return `<ul class="auto">${SETS.filter(s => G.unlocked(s.id)).map(s =>
      `<li><label><input type="checkbox" data-act="auto" data-id="${s.id}" ${G.state.auto[s.id] ? 'checked' : ''}> ${s.name}</label></li>`).join('')}</ul>
      <p class="muted">勾选的系列，店员按标价上架；钱不够就少买。</p>`;
  }

  function render() {
    if (PTCG_UI.hold) return;
    $('goals').innerHTML = `<h2 class="eyebrow">顾客 · 最近成交</h2>${customers()}
      <h2 class="eyebrow">图鉴 · 口碑 <span class="dx-total">回头客 +${Math.round(G.dexBonus() * 100)}%</span></h2><ul class="dex">${dex()}</ul>
      <h2 class="eyebrow">店员 · 自动进货</h2>${clerk()}`;
  }

  document.addEventListener('change', e => { const b = e.target.closest('[data-act="auto"]'); if (b) G.setAuto(b.dataset.id, b.checked); });
  document.addEventListener('ptcg:release', render);
  G.on(render); render();
})();
