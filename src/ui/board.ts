// 排行 page (#board): the shop's own card live from the save (nickname, share actions), a field to paste a friend's code, and a ranked
// table of you and every code you have pasted, switchable by metric. No network and no server: the codes (src/board.ts) are the only
// way numbers travel, and they are self-reported (the page says so). Imported friends, this device's id and the nickname live in
// localStorage `ptcg.board`; the game itself is only read. `?board=CODE` in the address imports one entry on startup (initBoard).
import { html, render, nothing } from 'lit-html';
import { SETS } from '../sets.ts';
import { ACH } from '../achievements.ts';
import * as B from '../board.ts';
import { home } from '../assets.ts';
import { G, $, money } from './common.ts';
import { currentPage, go } from './layout.ts';

const KEY = 'ptcg.board';
const store = B.parseStore((() => { try { return localStorage.getItem(KEY); } catch { return null; } })());
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(store)); } catch { /* storage blocked: the board lasts this visit */ } };

// A random id, made once per device: it tells two players with the same nickname apart, and makes a re-import replace instead of duplicate.
function newId() {
  const b = new Uint8Array(8);
  if (typeof crypto !== 'undefined') crypto.getRandomValues(b); else for (let i = 0; i < b.length; i++) b[i] = Math.random() * 256;
  return Array.from(b, x => (x % 36).toString(36)).join('');
}
if (!store.id) { store.id = newId(); save(); }
const nick = () => store.name || `店长${String(parseInt(store.id.slice(0, 6), 36) % 10000).padStart(4, '0')}`;

let msg: { ok: boolean; text: string } | null = null, msgT = 0;
let shown: { label: string; text: string } | null = null; // the last thing copied or shared: kept in a field the player can select when the browser refuses to copy
let selectShown = false;
// 邀请: a friend's link opened on a shop that hasn't sold or opened anything is the newcomer's first look at the game. The board would
// show them their own row of zeros; a box on top says what the game is, who invited them, and which key starts it. Gone once they trade.
let invite = '';
const fresh = () => !G.revenue() && !Object.values(G.state.opened).some(n => n > 0) && !Object.keys(G.state.ach).length && !G.state.branch.life && !G.state.billsPaid; // a shop gone bankrupt or branched starts at zero too: not a newcomer

function note(ok: boolean, text: string) {
  msg = { ok, text }; clearTimeout(msgT);
  if (ok) msgT = window.setTimeout(() => { msg = null; renderBoard(); }, 8000);
  renderBoard();
}

const WHY: Record<B.Why, string> = {
  empty: '先把好友的分享码粘贴到框里。',
  size: '这段内容太长，不是分享码。',
  format: `这不是分享码。分享码以 ${B.VERSION}. 开头，连同结尾的校验一起复制。`,
  version: '这个分享码来自别的版本，这里读不了。',
  sum: '校验没过：码可能抄错了一个字，或者被截断了。请重新复制完整的码。',
  data: '分享码里的数据读不出来。',
};
const when = (t: number) => { const d = new Date(t); return `${d.getMonth() + 1} 月 ${d.getDate()} 日 ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };

// Takes a pasted code or link. true = the board changed.
function take(raw: string): boolean {
  const d = B.decode(raw);
  if (!d.ok) { note(false, `导入失败：${WHY[d.why]}`); return false; }
  const e = d.snap;
  if (B.keyOf(e) === B.keyOf({ id: store.id, name: nick() })) { note(false, '导入失败：这是你自己的码，你已经在榜上了。'); return false; }
  const r = B.upsert(store.entries, e);
  if (r.how === 'full') { note(false, `导入失败：好友最多存 ${B.MAX_ENTRIES} 位，先移除几位再导入。`); return false; }
  store.entries = r.list; save();
  note(true, `${r.how === 'replaced' ? '已更新' : '已加入'}：${e.name}（数据取自 ${when(e.at)}）`);
  return true;
}

// Copy: the clipboard API where the page may use it, else the old copy command; when both refuse (some file:// browsers), the text is
// already selected in the field under the buttons.
async function copy(text: string, label: string) {
  shown = { label, text };
  try { await navigator.clipboard.writeText(text); note(true, `已复制${label}`); return; } catch { /* not allowed here: fall back */ }
  const t = document.createElement('textarea');
  t.value = text; t.style.cssText = 'position:fixed;opacity:0'; document.body.append(t); t.select();
  let ok = false; try { ok = document.execCommand('copy'); } catch { /* ignore */ }
  t.remove();
  if (ok) note(true, `已复制${label}`);
  else { selectShown = true; note(true, `浏览器不让程序复制，${label}已选中，请按 Ctrl/⌘ + C。`); }
}

const own = () => B.snapshot(G, store.id, nick());
const code = () => B.encode(own());
const linkOf = () => B.link(home(), code());

function share() {
  const c = code(), url = B.link(home(), c);
  navigator.share({ title: 'PTCG卡店 排行', text: `${nick()} 的 PTCG卡店 排行码：${c}`, url }).catch((e: unknown) => { if ((e as Error)?.name !== 'AbortError') copy(url, '链接'); });
}

const fmt: Record<B.Metric, (e: B.Snap) => string> = {
  rev: e => money(e.rev / 100), fame: e => String(e.fame), luck: e => (e.luck === null ? '—' : `${(e.luck / 10).toFixed(1)}%`),
  ach: e => `${e.ach}/${ACH.length}`, dex: e => `${e.dex}/${SETS.reduce((a, s) => a + G.dexTotal(s.id), 0)}`, cards: e => money(e.cards / 100),
};
const LUCK_TITLE = `欧气：开出的总市值超过多少比例的模拟玩家。开满 ${B.LUCK_MIN_PACKS} 包才计，包少时一两张大卡就能决定名次。`;

function card(me: B.Snap) {
  const rows: [string, string, string?][] = [
    ['累计营业额', fmt.rev(me), '各家店的商品销售额合计，破产的店不计'], ['名气', fmt.fame(me), '各家店带来的名气总数，花掉的也算'],
    ['分店', String(me.shops)], ['开包', `${me.packs} 包`], ['欧气', me.luck === null ? `开满 ${B.LUCK_MIN_PACKS} 包才计` : `超过 ${fmt.luck(me)}`, LUCK_TITLE],
    ['成就', fmt.ach(me)], ['图鉴', fmt.dex(me)], ['藏品总值', fmt.cards(me), '卡本、展示柜和收藏室里的卡，按市价'],
  ];
  return html`<section class="bd-me"><h2>我的排行卡<small>数字实时取自当前存档</small></h2>
    <label class="bd-nick"><span>昵称</span>
      <input type="text" maxlength=${B.NAME_MAX} autocomplete="off" spellcheck="false" .value=${nick()} placeholder="最多 ${B.NAME_MAX} 个字"
        @change=${(e: Event) => { const el = e.target as HTMLInputElement; store.name = B.cleanName(el.value); save(); el.value = nick(); renderBoard(); }}></label>
    <dl class="bd-stats">${rows.map(([k, v, tip]) => html`<div title=${tip ?? nothing}><dt>${k}</dt><dd>${v}</dd></div>`)}</dl>
    <p class="bd-btns"><button type="button" class="primary" @click=${() => copy(code(), '分享码')}>复制分享码</button>
      <button type="button" @click=${() => copy(linkOf(), '链接')}>复制链接</button>
      ${typeof navigator.share === 'function' ? html`<button type="button" @click=${share}>分享…</button>` : nothing}</p>
    ${shown ? html`<label class="bd-out"><span>${shown.label}</span><input type="text" readonly .value=${shown.text} @focus=${(e: Event) => (e.target as HTMLInputElement).select()}></label>` : nothing}
    <p class="bd-note">分享码里是你自己报的数字，谁都能改，所以这是朋友之间的排行榜，不防作弊。游戏不联网：只有你发出去的码，和你贴进来的码。</p></section>`;
}

function board(me: B.Snap) {
  const metric = store.metric, rows = B.rank([me, ...store.entries], metric), self = B.keyOf(me);
  const th = (m: (typeof B.METRICS)[number]) => html`<th scope="col" class=${m.k === metric ? 'on' : ''} title=${m.k === 'luck' ? LUCK_TITLE : nothing}>${m.name}</th>`;
  return html`<section class="bd-rank"><h2>排行榜<small>你和已导入的 ${store.entries.length} 位好友</small></h2>
    <div class="bd-tabs" role="group" aria-label="按什么排名">${B.METRICS.map(m => html`<button type="button" aria-pressed=${m.k === metric ? 'true' : 'false'}
      @click=${() => { store.metric = m.k; save(); renderBoard(); }}>${m.name}</button>`)}</div>
    <div class="bd-scroll"><table class="bd-table"><caption class="visually-hidden">按${B.METRICS.find(m => m.k === metric)!.name}排名</caption>
      <thead><tr><th scope="col" class="n">名次</th><th scope="col">店长</th>${B.METRICS.map(th)}<th scope="col">数据时间</th><th scope="col"><span class="visually-hidden">操作</span></th></tr></thead>
      <tbody>${rows.map((e, i) => {
        const k = B.keyOf(e), mine = k === self;
        return html`<tr class=${mine ? 'me' : ''}><td class="n">${i + 1}</td>
          <th scope="row"><span class="bd-name">${e.name}${mine ? html` <b class="bd-you">你</b>` : nothing}</span><small>分店 ${e.shops} · 开 ${e.packs} 包</small></th>
          ${B.METRICS.map(m => html`<td class=${m.k === metric ? 'on' : ''}>${fmt[m.k](e)}</td>`)}
          <td class="at">${mine ? '现在' : when(e.at)}</td>
          <td class="rm">${mine ? nothing : html`<button type="button" aria-label="移除 ${e.name}" @click=${() => { store.entries = store.entries.filter(x => B.keyOf(x) !== k); save(); note(true, `已移除 ${e.name}`); }}>移除</button>`}</td></tr>`;
      })}</tbody></table></div>
    ${store.entries.length ? nothing : html`<p class="bd-note">还没有好友。让朋友在他们的排行页复制分享码，贴到「导入好友」的框里，就会排进来。</p>`}
    <p class="bd-note">榜上的数字都是各人自己报的，只在这台设备上排，不会上传。</p></section>`;
}

function hello() {
  if (!invite || !fresh()) return nothing;
  return html`<section class="bd-hi"><h2>${invite} 邀你来比开卡店</h2>
    <p>这是一个宝可梦卡牌店的经营小游戏：你接手一家欠着债的卡店，进货、标价把整包卖给客人，也能自己拆包碰运气。概率按真实开包统计，卡价按市价。</p>
    <p>营业额、欧气、图鉴这几项会和 ${invite} 排在下面的榜上。第一步：去「货柜」进货上架。</p>
    <p class="bd-btns"><button type="button" class="primary" @click=${() => go('shelf')}>去货柜进货</button></p></section>`;
}

function draw() {
  const me = own();
  render(html`${hello()}${card(me)}
    <section class="bd-in"><h2>导入好友</h2>
      <form class="bd-form" @submit=${(e: SubmitEvent) => {
        e.preventDefault();
        const input = (e.currentTarget as HTMLFormElement).elements.namedItem('code') as HTMLInputElement;
        if (take(input.value)) input.value = '';
      }}>
        <input type="text" name="code" autocomplete="off" spellcheck="false" aria-label="好友的分享码或链接" placeholder="粘贴好友的分享码或链接">
        <button type="submit" class="primary">导入</button></form>
      <p class="bd-msg" role="status" aria-live="polite">${msg ? html`<b>${msg.ok ? '' : '× '}</b>${msg.text}` : nothing}</p>
      <p class="bd-note">同一位好友（同一台设备、同一个昵称）再导入一次，会换成新的数据；也可以在榜上移除。</p></section>
    ${board(me)}`, $('board'));
  if (selectShown) { selectShown = false; $('board').querySelector<HTMLInputElement>('.bd-out input')?.select(); }
}

// Called with every repaint of the shop; the page is only drawn while it is the one on screen (the hash handler draws it on arrival).
export function renderBoard() { if (currentPage() === 'board') draw(); }

export function initBoard() {
  addEventListener('hashchange', renderBoard);
  const url = new URL(location.href), q = url.searchParams.get('board');
  if (q !== null) {
    if (take(q) && fresh()) { const d = B.decode(q); invite = d.ok ? d.snap.name : ''; }
    url.searchParams.delete('board');
    try { history.replaceState(null, '', url.pathname + url.search + url.hash); } catch { /* a sandboxed frame: the link stays, importing it again just replaces the same entry */ }
    if (currentPage() !== 'board') go('board');
  }
  draw();
}
