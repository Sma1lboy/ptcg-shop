// Every button carries data-act (+ data-id / data-n / data-key / data-i / data-d / data-k); one document listener routes them.
// Works the same for lit-rendered panels and the mat's innerHTML, since it never holds element references.
import * as FX from '../fx.ts';
import { G } from './common.ts';
import { startPack, openBatch, startRun, stopRun, tear, advance, peek, flipAll, toggleMute, shareMat, resetMat } from './mat.ts';
import { showLuck } from './share.ts';
import { resetGuide } from './guide.ts';
import { branchClick } from './upgrades.ts';
import { loanClick } from './ledger.ts';
import { resetStory } from './story.ts';

export function bindEvents() {
  let resetArmed = 0;
  document.addEventListener('click', e => {
    const b = (e.target as Element).closest<HTMLButtonElement>('[data-act]'); if (!b || b.disabled) return;
    FX.unlock();
    const id = b.dataset.id!;
    switch (b.dataset.act) {
      case 'buy': G.buy(id, +b.dataset.n!); break;
      case 'buyopen': if (G.buy(id, 1)) startPack(id); break;
      case 'open1': startPack(id); break;
      case 'open10': openBatch(id); break;
      case 'fill10': if (G.buy(id, 10 - (G.state.stock[id] || 0))) openBatch(id); break;
      case 'autorun': startRun(id); break;
      case 'runstop': stopRun(); break;
      case 'tear': tear(b); break;
      case 'advance': advance(); break;
      case 'peek': peek(+b.dataset.i!); break;
      case 'flipall': flipAll(); break;
      case 'mute': toggleMute(); break;
      case 'sharemat': shareMat(); break;
      case 'shareluck': showLuck(); break;
      case 'sell': G.sell(b.dataset.key!); break;
      case 'bulk': G.sellBulk(); break;
      case 'list': G.list(b.dataset.key!); break;
      case 'fillcase': G.fillCase(); break;
      case 'caseprice': G.setCasePct(G.casePct() + +b.dataset.d! * G.PCT_STEP); break;
      case 'unlist': G.unlist(+b.dataset.i!); break;
      case 'trophy': G.setTrophy(b.dataset.key!); break;
      case 'untrophy': G.clearTrophy(); break;
      case 'shelve': G.shelve(id, +b.dataset.n!); break;
      case 'unshelve': G.unshelve(id, +b.dataset.n!); break;
      case 'price': G.setPrice(id, G.pctOf(id) + +b.dataset.d! * G.PCT_STEP); break;
      case 'cprice': G.setCardPrice(+b.dataset.i!, G.cardPct(G.state.shown[+b.dataset.i!]) + +b.dataset.d! * G.PCT_STEP); break;
      case 'up': G.upgrade(b.dataset.k!); break;
      case 'learn': G.learn(b.dataset.k!); break;
      case 'collect': G.collect(id, b.dataset.n === 'all'); break;
      case 'ack': G.ackOffline(); break;
      case 'perk': G.learnPerk(b.dataset.k!); break;
      case 'branch': branchClick(); break;
      case 'loan': loanClick(+b.dataset.n!); break;
      case 'repay': G.repay(+b.dataset.n!); break;
      case 'paybill': G.payBill(); break;
      case 'ackwreck': G.ackWreck(); break;
      case 'reset':
        if (Date.now() - resetArmed < 3000) { resetGuide(); resetMat(); resetStory(); b.textContent = '清空存档'; resetArmed = 0; }
        else { resetArmed = Date.now(); b.textContent = '再点一次确认'; setTimeout(() => { if (resetArmed) b.textContent = '清空存档'; }, 3000); }
        break;
    }
  });
  // The shelf wall's <select>: put a set on a shelf, swap it, or clear it (value ""). A refused move (the back room cannot take
  // the packs back) changes nothing and emits nothing, so put the select back by hand.
  document.addEventListener('change', e => {
    const sel = (e.target as Element).closest<HTMLSelectElement>('select[data-act="place"]'); if (!sel || sel.value === '-') return;
    if (!G.place(+sel.dataset.i!, sel.value || null)) sel.value = sel.dataset.cur || '-';
  });
}
