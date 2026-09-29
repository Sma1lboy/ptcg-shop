// Entry point. Boot order is the old <script> order: game state loads, fx binds its listeners, the panels and the mat
// render and bind input, then onboarding, then goals. Listener order (G.on, document click, ptcg:release) follows from it.
import { G } from './ui/common.ts';
import './fx.ts';
import { renderStats } from './ui/stats.ts';
import { renderShelf } from './ui/shelf.ts';
import { renderLog } from './ui/log.ts';
import { renderLuck } from './ui/luck.ts';
import { renderBinder, initBinder } from './ui/binder.ts';
import { renderSingles } from './ui/singles.ts';
import { renderUpgrades } from './ui/upgrades.ts';
import { renderSkills } from './ui/skills.ts';
import { renderCase } from './ui/case.ts';
import { renderNotice, initSlip } from './ui/notice.ts';
import { renderSources, renderBasis } from './ui/sources.ts';
import { renderMat, refreshIdle, bindMatInput, hold } from './ui/mat.ts';
import { bindEvents } from './ui/events.ts';
import { bindLayout, renderTabs } from './ui/layout.ts';
import { renderRail } from './ui/rail.ts';
import { bindGuide } from './ui/guide.ts';
import { initStory } from './ui/story.ts';
import { initGoals } from './ui/goals.ts';
import { initAch } from './ui/ach.ts';
import { renderDue, renderLedger, renderWreck, initLedger } from './ui/ledger.ts';
import { initSound } from './ui/sound.ts';

// While a pack is being revealed only the shelf and the rail update (both with their open buttons off); the rest would show the pull early. The mat fires ptcg:release when done.
function renderAll() { if (hold) { renderShelf(); renderRail(); return; } renderStats(); renderDue(); renderLedger(); renderWreck(); renderShelf(); renderLog(); renderLuck(); renderBinder(); renderSingles(); renderUpgrades(); renderSkills(); renderTabs(); renderRail(); renderCase(); renderNotice(); refreshIdle(); }

bindEvents(); bindMatInput();
document.addEventListener('ptcg:release', renderAll);
G.on(renderAll);
setInterval(() => G.tick(hold), 1000); // mid-reveal the grace of an overdue bill waits (the ledger and the story wait too)
G.tick(); renderAll(); renderMat(); renderSources(); // first tick credits the time the shop was closed
// Another tab, a locked screen, a closed lid: the player is away (game.ts AWAY) until the page is seen again, however the browser
// throttles the timer meanwhile. A page opened in a background tab starts away.
const seen = () => { if (document.hidden) G.leave(); else G.back(); };
document.addEventListener('visibilitychange', seen); seen();

renderBasis(); bindLayout(); initLedger();
initSound(); // after the boot tick: the hours the shop was closed ring nothing; before the story, which sets the opening's first scene
initSlip();
initStory(); // before the guide: the story comes first, the guide waits until it is closed
bindGuide();

initGoals(); initBinder();
initAch(); // last: its first check may pay out an old save's stamps, which re-renders everything above
