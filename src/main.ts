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

const sourceDetails = document.getElementById('sources')!.parentElement as HTMLDetailsElement;
sourceDetails.addEventListener('toggle', () => { if (sourceDetails.open) renderSources(); });
const cardPanels = ['luck', 'dex', 'singles', 'casepanel', 'case-cust', 'board'].map(id => document.getElementById(id)!); // 排行 shows the live collection value and 图鉴 count, so it waits for a reveal too
// While a pack is being revealed the panels that would show the pull early (luck, binder, singles, the till roll, the case, the closing
// receipt) wait; the rest keep up with the shop, which goes on selling (a player who leaves a pack half-flipped for 货柜 or 成长 saw
// frozen counts): the top bar (its singles' worth stays at the pre-pack value), the bill, the ledger, 成长, the tab counts, the shelf
// and the rail (their open buttons off). The mat fires ptcg:release when done.
function renderAll() {
  for (const panel of cardPanels) if (panel.hasAttribute('inert') !== hold) panel.toggleAttribute('inert', hold);
  if (sourceDetails.open) renderSources(); renderEarnings(); renderCollection(); if (hold) { renderStats(true); renderDue(); renderLedger(); renderShelf(); renderUpgrades(); renderTabs(); renderRail(); return; } renderStats(); renderDue(); renderLedger(); renderWreck(); renderShelf(); renderLog(); renderLuck(); renderBinder(); renderSingles(); renderUpgrades(); renderTabs(); renderRail(); renderCase(); renderBoard(); renderNotice(); refreshMat();
}

bindEvents(); bindMatInput();
document.addEventListener('ptcg:release', renderAll);
G.on(renderAll);
setInterval(() => G.tick(hold), 1000); // mid-reveal the grace of an overdue bill waits (the ledger and the story wait too)
G.tick(); renderAll(); renderMat(); renderSources(); // first tick credits the time the shop was closed
// Another tab, a locked screen, a closed lid: the player is away (game.ts AWAY) until the page is seen again, however the browser
// throttles the timer meanwhile. A page opened in a background tab starts away.
const syncIdle = () => { const p = currentPage(); G.setIdle(!document.hidden && (p === 'shelf' || p === 'case')); renderEarnings(); };
const seen = () => { if (document.hidden) { G.setIdle(false); G.leave(); } else { G.back(); syncIdle(); } };
document.addEventListener('visibilitychange', seen); seen();
addEventListener('hashchange', syncIdle);
addEventListener('pagehide', () => { G.setIdle(false); G.leave(); });
addEventListener('pageshow', seen);

renderBasis(); bindLayout(); initLedger();
initSound(); // after the boot tick: the hours the shop was closed ring nothing; before the story, which sets the opening's first scene
initSlip(); initMemo();
initStory(); // before the guide: the story comes first, the guide waits until it is closed
bindGuide();

initGoals(); initBinder(); initCollection(); initMenu(); initWalk();
initBoard(); // after bindLayout: a ?board= link imports its entry and opens the page
initAch(); // last: its first check may pay out an old save's stamps, which re-renders everything above
