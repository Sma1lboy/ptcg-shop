// 战利品: the priciest hits ever pulled.
import { html, render } from 'lit-html';
import { G, $ } from './common.ts';
import { face, cap } from './card.ts';

export function renderBinder() {
  const hits = G.state.hits.slice(0, 8);
  render(html`<h2>战利品 · 开出过最贵的</h2>${hits.length
    ? html`<ul class="binder">${hits.map(c => html`<li>${face(c, 'show', true)}${cap(c, 'show')}</li>`)}</ul>`
    : html`<p class="muted">还没出过 RR 以上的卡。</p>`}`, $('binder'));
}
