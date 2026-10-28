import { setupWorker } from 'msw/browser';
import * as db from './db';
import { handlers } from './handlers';

export { onMockEvent } from './db';

/** Start the MSW REST mocks and the fake WebSocket emitter (spec §11 rates). */
export async function startMocks() {
  await setupWorker(...handlers).start({ onUnhandledRequest: 'bypass', quiet: true });
  setInterval(() => db.tickFrames().forEach((data) => db.emit({ event: 'detection.frame', data })), 200);
  setInterval(() => {
    db.tickSecond();
    db.intersections.forEach((i) => db.emit({ event: 'signal.state', data: db.signalOf(i.id) }));
    db.lanes().forEach((data) => db.emit({ event: 'lane.status', data }));
  }, 1000);
  setInterval(() => db.emit({ event: 'dashboard.kpi', data: db.kpi() }), 5000);
  setInterval(db.randomEvent, 9000);
}
