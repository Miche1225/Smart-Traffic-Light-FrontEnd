// Run with `npm run check` (Node 22.18+/24 strips the types).
import assert from 'node:assert/strict';
import { phasesOf, stepSignal, type Ctl } from '../src/mocks/signal.ts';
import { peakStats } from '../src/utils/report.ts';

const g = () => 20;

// Normal cycle: green -> 3s yellow -> 2s all-red -> other axis green.
const c: Ctl = { axis: 'NS', stage: 'GREEN', remaining: 2 };
const seen: string[] = [];
for (let i = 0; i < 8; i++) { stepSignal(c, 'ADAPTIVE', g); seen.push(`${c.axis}:${c.stage}`); }
assert.deepEqual(seen, ['NS:GREEN', 'NS:YELLOW', 'NS:YELLOW', 'NS:YELLOW', 'NS:ALLRED', 'NS:ALLRED', 'EW:GREEN', 'EW:GREEN']);
const n = phasesOf(c, g).find((p) => p.approach === 'N')!;
assert.deepEqual([n.color, n.remainingSec], ['RED', 19 + 3 + 2]);

// Peak stats ignore hours that haven't happened yet.
const totals = Array.from({ length: 24 }, (_, h) => (h === 8 ? 900 : h === 18 ? 1000 : h === 12 ? 500 : 10 + h));
assert.equal(peakStats(totals).peakHour.hour, 18);
assert.deepEqual(peakStats(totals).top3Hours.map((x) => x.hour), [18, 8, 12]);
assert.equal(peakStats(totals, 10).peakHour.hour, 8);
assert.equal(peakStats(totals).quietestHour.hour, 0);

console.log('selfcheck ok');
