import { html } from 'lit-html';
import type { Pull } from '../sim.ts';
import { G, rarLabel } from './common.ts';
import { back, face, FOIL, mark, toHTML } from './card.ts';

// One physical-card viewer; the binder may also show an unrevealed, art-free pocket.
export function inspectCard(c: Pull, note = '', revealed = true) {
  document.querySelector<HTMLDialogElement>('#card-inspect')?.close();
  const focus = document.activeElement as HTMLElement | null, dialog = document.createElement('dialog');
  dialog.id = 'card-inspect'; dialog.className = 'inspect';
  dialog.setAttribute('aria-labelledby', 'inspect-name');
  dialog.innerHTML = toHTML(html`<header class="inspect-head"><h2 id="inspect-name">${c.name}</h2><button type="button" data-close aria-label="关闭卡片欣赏">关闭</button></header>
    <div class="inspect-stage"><div class="inspect-size"><div class="inspect-tilt"><div class="inspect-turn">
      <div class="inspect-front">${revealed ? face(c, 'big') : html`<span class="cf cf-big pk-ghost"><b>${c.n}</b>${mark(c, false)}<small>尚未收录</small></span>`}</div>
      ${revealed ? html`<img class="inspect-back" src=${back()} alt="欧气卡铺原创卡背">` : ''}
    </div></div></div></div>
    <p class="inspect-meta">${G.setById(c.set).name} · ${c.n} 号 · ${rarLabel(c.kind)}</p>
    ${note ? html`<p class="inspect-note">${note}</p>` : ''}
    <div class="inspect-controls"><button type="button" data-flip ?disabled=${!revealed}>看背面</button>
      <label>放大 <input type="range" min="1" max="2" step="0.25" value="1" aria-label="卡片放大倍数" ?disabled=${!revealed}><output>100%</output></label>
      <button type="button" data-foil aria-pressed=${revealed && !!FOIL[c.kind] ? 'true' : 'false'} ?disabled=${!revealed || !FOIL[c.kind]}>${FOIL[c.kind] && revealed ? '闪面 开' : '无闪面'}</button></div>
    <p class="inspect-help">${revealed ? '移动鼠标或手指转动卡片，闪卡会有反光；放大后可滚动查看细节。' : '收录这张卡后可查看卡面。'} Esc 或点击框外关闭。卡背为卡铺原创图案。</p>`);
  const turn = dialog.querySelector<HTMLElement>('.inspect-turn')!, tilt = dialog.querySelector<HTMLElement>('.inspect-tilt')!;
  const stage = dialog.querySelector<HTMLElement>('.inspect-stage')!, range = dialog.querySelector<HTMLInputElement>('input')!;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  let flipped = false, foil = true, outside = false;
  const resetTilt = () => { tilt.style.transform = ''; tilt.style.removeProperty('--mx'); tilt.style.removeProperty('--my'); };
  dialog.querySelector('[data-close]')!.addEventListener('click', () => dialog.close());
  dialog.querySelector('[data-flip]')!.addEventListener('click', e => {
    flipped = !flipped; turn.classList.toggle('flipped', flipped); resetTilt();
    (e.currentTarget as HTMLButtonElement).textContent = flipped ? '看正面' : '看背面';
    dialog.querySelector('.inspect-front')!.setAttribute('aria-hidden', String(flipped));
    dialog.querySelector('.inspect-back')?.setAttribute('aria-hidden', String(!flipped));
  });
  dialog.querySelector('.inspect-back')?.setAttribute('aria-hidden', 'true');
  dialog.querySelector('[data-foil]')!.addEventListener('click', e => {
    foil = !foil; const b = e.currentTarget as HTMLButtonElement;
    b.textContent = `闪面 ${foil ? '开' : '关'}`; b.setAttribute('aria-pressed', String(foil));
    dialog.classList.toggle('no-foil', !foil);
  });
  range.addEventListener('input', () => {
    dialog.style.setProperty('--magnify', range.value);
    tilt.style.touchAction = +range.value > 1 ? 'pan-x pan-y' : 'none';
    dialog.querySelector('output')!.textContent = `${Math.round(+range.value * 100)}%`;
    resetTilt(); stage.scrollTo(0, 0);
  });
  tilt.addEventListener('pointerdown', e => { if (e.pointerType !== 'mouse' && +range.value === 1) tilt.setPointerCapture(e.pointerId); });
  tilt.addEventListener('pointermove', e => {
    if (!revealed || reduced.matches || +range.value > 1) return;
    const box = tilt.getBoundingClientRect(), x = Math.max(0, Math.min(1, (e.clientX - box.left) / box.width)), y = Math.max(0, Math.min(1, (e.clientY - box.top) / box.height));
    tilt.style.transform = `rotateX(${(0.5 - y) * 16}deg) rotateY(${(x - 0.5) * 16}deg)`;
    tilt.style.setProperty('--mx', `${x * 100}%`); tilt.style.setProperty('--my', `${y * 100}%`);
  });
  tilt.addEventListener('pointerleave', resetTilt); tilt.addEventListener('pointercancel', resetTilt); tilt.addEventListener('pointerup', resetTilt);
  reduced.addEventListener('change', resetTilt);
  const isOutside = (e: PointerEvent) => { const b = dialog.getBoundingClientRect(); return e.target === dialog && (e.clientX < b.left || e.clientX > b.right || e.clientY < b.top || e.clientY > b.bottom); };
  dialog.addEventListener('pointerdown', e => { outside = isOutside(e); });
  dialog.addEventListener('pointerup', e => { if (outside && isOutside(e)) dialog.close(); outside = false; });
  dialog.addEventListener('close', () => { reduced.removeEventListener('change', resetTilt); dialog.remove(); if (focus?.isConnected) focus.focus({ preventScroll: true }); }, { once: true });
  document.body.append(dialog); dialog.showModal();
  dialog.querySelector<HTMLButtonElement>('[data-close]')!.focus();
}
