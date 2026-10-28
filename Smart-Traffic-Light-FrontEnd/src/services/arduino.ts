import { pushToast } from '../store/live';
import type { WsEvent } from '../types';
import { arduinoOwned, handleEvent } from './ws';

// Arduino over USB via Web Serial (Chrome/Edge only). The sketch prints one WsEvent JSON per line,
// the same shape the WebSocket sends, so a later Wi-Fi/backend setup needs no front-end change.
// shortcut: the board has no clock, so the browser stamps times on arrival.

type Port = { open(o: { baudRate: number }): Promise<void>; close(): Promise<void>; readable: ReadableStream<Uint8Array> | null };
const serial = () => (typeof navigator !== 'undefined' ? (navigator as Navigator & { serial?: { requestPort(): Promise<Port> } }).serial : undefined);
export const serialSupported = () => !!serial();

function stamp(e: WsEvent) {
  const now = new Date().toISOString();
  const d = e.data as unknown as Record<string, unknown> & { sensor?: { timestamp: string } };
  if ('timestamp' in d) d.timestamp = now;
  if ('updatedAt' in d) d.updatedAt = now;
  if (d.sensor) d.sensor.timestamp = now;
  if (typeof d.intersectionId === 'string') arduinoOwned.add(d.intersectionId);
}

/** Ask the user to pick the Arduino's port, then feed its lines into the dashboard. Returns a disconnect function. */
export async function connectArduino(baudRate = 9600, onClose?: () => void) {
  const port = await serial()!.requestPort();
  await port.open({ baudRate });
  const decoder = new TextDecoderStream();
  const piped = port.readable!.pipeTo(decoder.writable);
  const reader = decoder.readable.getReader();
  let buf = '';
  (async () => {
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        const lines = (buf += value).split('\n');
        buf = lines.pop()!;
        for (const line of lines) {
          if (!line.trim().startsWith('{')) continue; // let the sketch Serial.print debug text freely
          try {
            const e = JSON.parse(line) as WsEvent;
            stamp(e);
            handleEvent(e);
          } catch { /* ignore a malformed or half-received line */ }
        }
      }
    } catch {
      pushToast('error', 'Arduino disconnected');
    } finally {
      arduinoOwned.clear();
      reader.releaseLock();
      await piped.catch(() => {}); // the port can only close once the pipe has let go of it
      await port.close().catch(() => {});
      onClose?.();
    }
  })();
  return () => { reader.cancel().catch(() => {}); };
}
