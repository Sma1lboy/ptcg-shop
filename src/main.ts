// Entry point. Boot order is the old <script> order: game state loads, fx binds its listeners, the panels and the mat
// render and bind input, then onboarding, then goals. Listener order (G.on, document click, ptcg:release) follows from it.
import { G } from './ui/common.ts';
import './fx.ts';
import { renderStats } from './ui/stats.ts';
import { renderShelf } from './ui/shelf.ts';
import { renderLog } from './ui/log.ts';
import { renderLuck } from './ui/luck.ts';
import { renderBinder } from './ui/binder.ts';
import { renderSingles } from './ui/singles.ts';
import { renderUpgrades } from './ui/upgrades.ts';
import { renderSkills } from './ui/skills.ts';
import { renderCase } from './ui/case.ts';
import { renderNotice } from './ui/notice.ts';
import { renderSources, renderBasis } from './ui/sources.ts';
import { renderMat, refreshIdle, bindMatInput, hold } from './ui/mat.ts';
import { bindEvents } from './ui/events.ts';
import { bindLayout, renderTabs } from './ui/layout.ts';
import { renderRail } from './ui/rail.ts';
import { bindGuide } from './ui/guide.ts';
import { initGoals } from './ui/goals.ts';
import { initAch } from './ui/ach.ts';

// While a pack is being revealed only the shelf updates; the rest would show the pull early. The mat fires ptcg:release when done.
function renderAll() { if (hold) { renderShelf(); return; } renderStats(); renderShelf(); renderLog(); renderLuck(); renderBinder(); renderSingles(); renderUpgrades(); renderSkills(); renderTabs(); renderRail(); renderCase(); renderNotice(); refreshIdle(); }

bindEvents(); bindMatInput();
document.addEventListener('ptcg:release', renderAll);
G.on(renderAll);
setInterval(() => G.tick(), 1000);
G.tick(); renderAll(); renderMat(); renderSources(); // first tick credits the time the shop was closed

renderBasis(); bindLayout();
bindGuide();

initGoals();
initAch(); // last: its first check may pay out an old save's stamps, which re-renders everything above
