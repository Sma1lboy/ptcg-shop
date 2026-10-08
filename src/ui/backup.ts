// 存档 panel (footer button → popover): export the save (a file, or its text), import one (a file, or pasted text) after showing
// what is in it, and the copy of a save that could not be read (game.ts keeps it; the panel opens by itself on that load).
import { html, render, nothing } from 'lit-html';
import { G, $, money } from './common.ts';
import { hold, resetMat } from './mat.ts';
import { forgetTill } from './stats.ts';
import type { State } from '../game.ts';

let picked: { st: State; from: string } | null = null, msg: { ok: boolean; text: string } | null = null, copied = '';

const stamp = (t: number) => { const d = new Date(t), p = (n: number) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`; };
function download(text: string, name: string) {
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type: 'application/json' })); a.download = name;
  document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
const fileName = () => `PTCG卡店存档-${stamp(G.now()).replace(/[ :]/g, '-')}.json`;
// Also the error bar's 导出存档: if the shop itself is what broke, the last save as stored is the copy to keep.
export function downloadSave() {
  let text: string | null; try { text = G.exportSave(); } catch { text = localStorage.getItem('ptcg-shop-v1'); }
  if (text) download(text, fileName());
}
const say = (ok: boolean, text: string) => { msg = { ok, text }; draw(); };

async function copy() {
  const text = G.exportSave();
  try { await navigator.clipboard.writeText(text); copied = ''; say(true, '已复制存档文本。存到别处，导入时粘贴回来。'); }
  catch { copied = text; say(true, '浏览器不让程序复制：文本在下面的框里，全选后复制。'); } // file:// and some browsers
}
function read(text: string, from: string) {
  const st = text.trim() ? G.readSave(text.trim()) : null;
  picked = st && { st, from }; copied = '';
  if (!st) say(false, '读不出来：这不是本游戏的存档，或者文本不完整。');
  else { msg = null; draw(); }
}
function use() {
  if (!picked || hold) return;
  const st = picked.st; picked = null;
  resetMat(); forgetTill(); G.useSave(st); $('backup-btn').textContent = '存档'; // the table starts empty: a half-opened pack belongs to the shop being replaced
  say(true, '已换成这份存档。');
}
function summary(st: State) {
  const packs = Object.values(st.opened).reduce((a, n) => a + n, 0), lv = Object.values(st.up).reduce((a, n) => a + (n || 0), 0);
  return `存于 ${stamp(st.savedAt)} · 第 ${st.branch.n + 1} 家店 · 现金 ${money(st.cash)} · 升级 ${lv} 级 · 开过 ${packs} 包 · 成就 ${Object.keys(st.ach).length} 个`;
}

function draw() {
  const bad = G.badCopy();
  render(html`<h3>存档</h3>
    ${G.loadFailed() ? html`<p class="bk-warn">上次的存档读不出来，所以这是新开的一局。原来那份没有删，原样另存着，可以下载下来。</p>` : nothing}
    <p class="sd-note">存档只在这台设备的浏览器里。换设备、清浏览器数据之前，先导出一份。</p>
    <p class="bk-btns"><button type="button" class="primary" @click=${() => { downloadSave(); say(true, '已下载存档文件。'); }}>下载存档</button>
      <button type="button" @click=${copy}>复制文本</button></p>
    ${copied ? html`<textarea class="bk-text" readonly rows="3" aria-label="存档文本" .value=${copied} @focus=${(e: Event) => (e.target as HTMLTextAreaElement).select()}></textarea>` : nothing}
    <h4>读入存档</h4>
    ${picked ? html`<div class="bk-pick"><p><b>${picked.from}</b>${summary(picked.st)}</p>
        <p class="bk-warn">换成它以后，现在这一局就没了。要留着，先按上面的「下载存档」。</p>
        <p class="bk-btns"><button type="button" class="primary" ?disabled=${hold} title=${hold ? '这包还没翻完' : nothing} @click=${use}>${hold ? '先翻完这包' : '换成这份'}</button>
          <button type="button" @click=${() => { picked = null; draw(); }}>算了</button></p></div>`
      : html`<p class="bk-btns"><label class="bk-file dl"><input type="file" accept=".json,application/json,text/plain" @change=${async (e: Event) => {
          const el = e.target as HTMLInputElement, f = el.files?.[0]; el.value = ''; if (f) read(await f.text(), `文件 ${f.name}：`);
        }}><span>选存档文件</span></label></p>
        <form class="bk-form" @submit=${(e: SubmitEvent) => { e.preventDefault(); const t = (e.currentTarget as HTMLFormElement).elements.namedItem('text') as HTMLTextAreaElement; read(t.value, '粘贴的存档：'); if (picked) t.value = ''; }}>
          <textarea name="text" rows="2" spellcheck="false" aria-label="存档文本" placeholder="或者把存档文本粘贴在这里"></textarea>
          <button type="submit">读这份</button></form>`}
    <p class="bk-msg" role="status" aria-live="polite">${msg ? (msg.ok ? msg.text : html`<b>× </b>${msg.text}`) : nothing}</p>
    ${bad ? html`<p class="sd-note">有一份读不出来的旧存档：<button type="button" class="bk-link" @click=${() => download(bad, `PTCG卡店读不出的存档-${stamp(G.now()).replace(/[ :]/g, '-')}.json`)}>下载原文</button></p>` : nothing}`, $('backup'));
}

export function initBackup() {
  const pop = $('backup');
  pop.addEventListener('toggle', e => { if ((e as ToggleEvent).newState === 'open') { msg = null; draw(); } else { picked = null; copied = ''; } });
  G.on(() => { if (pop.matches(':popover-open') && picked) draw(); }); // the 换成这份 key follows the pack on the table
  draw();
  if (G.loadFailed()) { $('backup-btn').textContent = '存档 读不出'; pop.showPopover(); } // the 开场剧情 may cover it: the footer keeps saying so
}
