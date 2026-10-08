// Entry point. Boot order is the old <script> order: game state loads, fx binds its listeners, the panels and the mat
// render and bind input, then onboarding, then goals. Listener order (G.on, document click, ptcg:release) follows from it.
import { G } from './ui/common.ts';
import './fx.ts';
import { renderStats, renderEarnings } from './ui/stats.ts';
import { renderShelf } from './ui/shelf.ts';
import { renderLog } from './ui/log.ts';
import { renderLuck } from './ui/luck.ts';
import { renderBinder, initBinder } from './ui/binder.ts';
import { renderSingles } from './ui/singles.ts';
import { renderCommission } from './ui/commission.ts';
import { renderUpgrades } from './ui/upgrades.ts';
import { renderCase } from './ui/case.ts';
import { renderCollection, initCollection } from './ui/collection.ts';
import { renderNotice, initSlip, initMemo } from './ui/notice.ts';
import { renderSources, renderBasis } from './ui/sources.ts';
import { renderMat, refreshMat, bindMatInput, hold } from './ui/mat.ts';
import { bindEvents } from './ui/events.ts';
import { bindLayout, renderTabs, currentPage } from './ui/layout.ts';
import { renderRail } from './ui/rail.ts';
import { bindGuide } from './ui/guide.ts';
import { initStory } from './ui/story.ts';
import { initGoals } from './ui/goals.ts';
import { initAch } from './ui/ach.ts';
import { renderDue, renderLedger, renderWreck, initLedger } from './ui/ledger.ts';
import { initSound } from './ui/sound.ts';
import { initMenu } from './ui/menu.ts';
import { initWalk } from './ui/walk.ts';
import { renderBoard, initBoard } from './ui/board.ts';
import { initBackup } from './ui/backup.ts';
import { initOops, safe } from './ui/oops.ts';

const sourceDetails = document.getElementById('sources')!.parentElement as HTMLDetailsElement;
sourceDetails.addEventListener('toggle', () => { if (sourceDetails.open) renderSources(); });
const cardPanels = ['luck', 'dex', 'singles', 'comm', 'casepanel', 'case-cust', 'board'].map(id => document.getElementById(id)!); // 排行 shows the live collection value and 图鉴 count, so it waits for a reveal too; so does 找卡委托 (it says whether the binder holds the card)
// While a pack is being revealed the panels that would show the pull early (luck, binder, singles, the till roll, the case, the closing
// receipt) wait; the rest keep up with the shop, which goes on selling (a player who leaves a pack half-flipped for 货柜 or 成长 saw
// frozen counts): the top bar (its singles' worth stays at the pre-pack value), the bill, the ledger, 成长, the tab counts, the shelf
// and the rail (their open buttons off). The mat fires ptcg:release when done.
// Each panel draws on its own (oops.ts safe): one that throws is named in the error bar and the rest still draw.
const LIVE: [string, () => void][] = [['顶栏', () => renderStats(true)], ['账单', renderDue], ['账本', renderLedger], ['货架', renderShelf], ['成长', renderUpgrades], ['页签', renderTabs], ['开包页右栏', renderRail]];
const ALL: [string, () => void][] = [['顶栏', () => renderStats()], ['账单', renderDue], ['账本', renderLedger], ['破产结算', renderWreck], ['货架', renderShelf], ['店内动态', renderLog], ['欧气', renderLuck],
  ['卡册', renderBinder], ['卡本', renderSingles], ['找卡委托', renderCommission], ['成长', renderUpgrades], ['页签', renderTabs], ['开包页右栏', renderRail], ['展示柜', renderCase], ['排行', renderBoard], ['店里的话', renderNotice], ['开包台', refreshMat]];
function renderAll() {
  for (const panel of cardPanels) if (panel.hasAttribute('inert') !== hold) panel.toggleAttribute('inert', hold);
  if (sourceDetails.open) safe('数据来源', renderSources); safe('挂机', renderEarnings); safe('收藏室', renderCollection);
  for (const [what, f] of hold ? LIVE : ALL) safe(what, f);
}

initOops(); // first: anything below that throws is caught and shown

bindEvents(); bindMatInput();
document.addEventListener('ptcg:release', renderAll);
G.on(renderAll);
setInterval(() => safe('店里的时钟', () => G.tick(hold)), 1000); // mid-reveal the grace of an overdue bill waits (the ledger and the story wait too)
safe('店里的时钟', () => G.tick()); renderAll(); safe('开包台', renderMat); safe('数据来源', renderSources); // first tick credits the time the shop was closed
// Another tab, a locked screen, a closed lid: the player is away (game.ts AWAY) until the page is seen again, however the browser
// throttles the timer meanwhile. A page opened in a background tab starts away.
const syncIdle = () => { const p = currentPage(); G.setIdle(!document.hidden && (p === 'shelf' || p === 'case')); renderEarnings(); };
const seen = () => { if (document.hidden) { G.setIdle(false); G.leave(); } else { G.back(); syncIdle(); } };
document.addEventListener('visibilitychange', seen); seen();
addEventListener('hashchange', syncIdle);
addEventListener('pagehide', () => { G.setIdle(false); G.leave(); });
addEventListener('pageshow', seen);

safe('数据来源', renderBasis); safe('页面切换', bindLayout); safe('账本', initLedger);
safe('声音', initSound); // after the boot tick: the hours the shop was closed ring nothing; before the story, which sets the opening's first scene
safe('店里的话', initSlip); safe('店里的话', initMemo);
safe('剧情', initStory); // before the guide: the story comes first, the guide waits until it is closed
safe('新手引导', bindGuide);

safe('目标', initGoals); safe('卡册', initBinder); safe('收藏室', initCollection); safe('键盘菜单', initMenu); safe('店面', initWalk);
safe('排行', initBoard); // after bindLayout: a ?board= link imports its entry and opens the page
safe('存档', initBackup); // opens itself when the save could not be read
safe('成就', initAch); // last: its first check may pay out an old save's stamps, which re-renders everything above
Object.assign(window, { ptcgUp: true }); // index.html's boot watchdog stands down
