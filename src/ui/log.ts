// 店内动态: the last dozen shop events.
import { html, render } from 'lit-html';
import { G, $ } from './common.ts';

export function renderLog() {
  const lines = G.state.log.slice(0, 12);
  render(lines.length ? lines.map(l =>
    html`<li class="${l.tone}"><time>${new Date(l.t).toTimeString().slice(0, 5)}</time>${l.text}</li>`) : html`<li>还没有动静。先进点货。</li>`, $('log'));
}
