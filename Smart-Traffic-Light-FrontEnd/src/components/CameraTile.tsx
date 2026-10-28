import { Camera as CameraIcon, Maximize2, VideoOff } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { pushToast, useLive } from '../store/live';
import type { Camera, DetectionFrame } from '../types';
import { APPROACH_LABEL, downloadUrl, fmtDateTime, fmtTime, VEHICLE_COLORS } from '../utils/format';
import { cx } from './ui';

/**
 * Draws one frame: the simulated road when there is no stream, the given video/image when snapshotting,
 * otherwise just clears (the <video> shows underneath). Then the detection boxes.
 */
function drawScene(ctx: CanvasRenderingContext2D, w: number, h: number, frame: DetectionFrame | undefined, overlay: boolean, sim: boolean, bg?: CanvasImageSource) {
  if (sim) {
    ctx.fillStyle = '#0b1220';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#1e293b';
    ctx.beginPath();
    ctx.moveTo(w * 0.32, 0); ctx.lineTo(w * 0.68, 0); ctx.lineTo(w * 0.95, h); ctx.lineTo(w * 0.05, h);
    ctx.fill();
    ctx.strokeStyle = '#94a3b8';
    ctx.setLineDash([h / 18, h / 18]);
    ctx.lineWidth = Math.max(1, w / 400);
    ctx.beginPath(); ctx.moveTo(w / 2, 0); ctx.lineTo(w / 2, h); ctx.stroke();
    ctx.setLineDash([]);
  } else if (bg) ctx.drawImage(bg, 0, 0, w, h);
  else ctx.clearRect(0, 0, w, h);

  const font = Math.max(10, Math.round(h / 26));
  for (const d of frame?.detections ?? []) {
    const [x, y, bw, bh] = [d.bbox[0] * w, d.bbox[1] * h, d.bbox[2] * w, d.bbox[3] * h];
    if (sim) {
      ctx.fillStyle = '#64748b';
      ctx.fillRect(x + bw * 0.08, y + bh * 0.08, bw * 0.84, bh * 0.84);
    }
    if (!overlay) continue;
    const color = VEHICLE_COLORS[d.type];
    ctx.strokeStyle = color;
    ctx.lineWidth = Math.max(2, w / 500);
    ctx.strokeRect(x, y, bw, bh);
    const label = `${d.type} ${Math.round(d.confidence * 100)}%`;
    ctx.font = `600 ${font}px Inter, sans-serif`;
    const tw = ctx.measureText(label).width + 8;
    const top = Math.max(0, y - font - 4); // keep the label on screen while the box enters from the top edge
    ctx.fillStyle = color;
    ctx.fillRect(x, top, tw, font + 4);
    ctx.fillStyle = '#fff';
    ctx.fillText(label, x + 4, top + font - 1);
  }
  if (sim) {
    ctx.font = `${font}px ui-monospace, monospace`;
    ctx.fillStyle = '#e2e8f0';
    ctx.fillText(`SIM ${frame ? fmtDateTime(frame.timestamp) : ''}`, 8, h - 8);
  }
}

function useHls(video: React.RefObject<HTMLVideoElement | null>, camera: Camera, active: boolean) {
  useEffect(() => {
    const v = video.current;
    if (!v || !active || camera.streamType !== 'HLS' || !camera.streamUrl) return;
    if (v.canPlayType('application/vnd.apple.mpegurl')) { v.src = camera.streamUrl; return; }
    let hls: { destroy: () => void } | undefined;
    let dead = false;
    import('hls.js').then(({ default: Hls }) => {
      if (dead || !Hls.isSupported()) return;
      const h = new Hls();
      h.loadSource(camera.streamUrl);
      h.attachMedia(v);
      hls = h;
    });
    return () => { dead = true; hls?.destroy(); };
  }, [video, camera.streamUrl, camera.streamType, active]);
}

export function CameraTile({ camera, label, overlay, onOpen }: { camera: Camera; label: string; overlay: boolean; onOpen?: () => void }) {
  const status = useLive((s) => s.devices[camera.id]?.status) ?? camera.status;
  const lastSeen = useLive((s) => s.devices[camera.id]?.lastSeen) ?? camera.lastSeen;
  const count = useLive((s) => s.frames[camera.id]?.detections.length ?? 0);
  const canvas = useRef<HTMLCanvasElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const img = useRef<HTMLImageElement>(null);
  const sim = !camera.streamUrl;
  const online = status !== 'OFFLINE';
  useHls(video, camera, online);

  // Redraw on animation frames, but only when a new detection frame arrived or the tile resized.
  useEffect(() => {
    if (!online) return;
    let raf = 0;
    let last: DetectionFrame | undefined;
    let size = '';
    const loop = () => {
      const c = canvas.current;
      if (c) {
        const r = c.getBoundingClientRect();
        const w = Math.round(r.width * devicePixelRatio);
        const h = Math.round(r.height * devicePixelRatio);
        const frame = useLive.getState().frames[camera.id];
        if (frame !== last || size !== `${w}x${h}`) {
          if (c.width !== w || c.height !== h) Object.assign(c, { width: w, height: h });
          drawScene(c.getContext('2d')!, w, h, frame, overlay, sim);
          last = frame;
          size = `${w}x${h}`;
        }
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [camera.id, overlay, sim, online]);

  function snapshot() {
    const out = document.createElement('canvas');
    out.width = 1280;
    out.height = 720;
    const src = video.current?.videoWidth ? video.current : img.current?.naturalWidth ? img.current : undefined;
    drawScene(out.getContext('2d')!, 1280, 720, useLive.getState().frames[camera.id], overlay, sim, src);
    try {
      downloadUrl(out.toDataURL('image/png'), `${camera.id}-${Date.now()}.png`);
    } catch {
      pushToast('error', 'Snapshot blocked: this stream does not allow frame capture (CORS).');
    }
  }

  return (
    <article className="min-w-0 overflow-hidden rounded-lg border border-slate-800 bg-slate-950 shadow-lg shadow-black/20 transition-colors hover:border-sky-700/60">
      <header className="flex items-center gap-2 border-b border-slate-800 px-2.5 py-1.5 text-xs">
        <span className="min-w-0 flex-1 truncate" title={label}>
          <b className="font-semibold text-slate-200">{label}</b> — Channel {camera.channel} (Approach: {APPROACH_LABEL[camera.approach]})
        </span>
        {online && (
          <button onClick={snapshot} aria-label="Download snapshot" title="Snapshot" className="rounded p-1 text-slate-400 hover:bg-slate-800 hover:text-white">
            <CameraIcon className="size-3.5" />
          </button>
        )}
        {onOpen && (
          <button onClick={onOpen} aria-label="Open fullscreen" title="Fullscreen" className="rounded p-1 text-slate-400 hover:bg-slate-800 hover:text-white">
            <Maximize2 className="size-3.5" />
          </button>
        )}
      </header>
      <div className={cx('relative aspect-video bg-slate-900', onOpen && 'cursor-zoom-in')} onClick={onOpen}>
        {!online ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-slate-900 bg-[repeating-linear-gradient(135deg,transparent_0_12px,rgb(148_163_184/0.06)_12px_24px)] text-sm text-slate-400">
            <VideoOff className="size-6" />
            Camera Offline — last seen {fmtTime(lastSeen)}
          </div>
        ) : (
          <>
            {!sim && camera.streamType === 'HLS' && <video ref={video} muted autoPlay playsInline crossOrigin="anonymous" className="absolute inset-0 size-full object-cover" />}
            {!sim && camera.streamType === 'MJPEG' && <img ref={img} src={camera.streamUrl} crossOrigin="anonymous" alt="" className="absolute inset-0 size-full object-cover" />}
            {/* shortcut: WebRTC playback not implemented; add when the backend exposes a signalling endpoint */}
            {!sim && camera.streamType === 'WEBRTC' && <div className="absolute inset-0 grid place-items-center text-xs text-slate-500">WebRTC stream not supported yet</div>}
            <canvas ref={canvas} className="absolute inset-0 size-full" aria-label={`${count} vehicles detected`} role="img" />
            <div className="pointer-events-none absolute left-2 top-2 flex gap-1.5 text-[11px] font-medium">
              <span className="inline-flex items-center gap-1 rounded bg-black/60 px-1.5 py-0.5 backdrop-blur-sm">
                <span className={cx('size-1.5 rounded-full', status === 'ONLINE' ? 'bg-red-500 motion-safe:animate-pulse' : 'bg-yellow-500')} aria-hidden />
                {status === 'ONLINE' ? 'Live' : 'Degraded'}
              </span>
              <span className="rounded bg-black/60 px-1.5 py-0.5 tabular-nums backdrop-blur-sm">{count} vehicles</span>
              <span className="rounded bg-black/60 px-1.5 py-0.5 tabular-nums backdrop-blur-sm">{camera.fps} FPS</span>
            </div>
          </>
        )}
      </div>
    </article>
  );
}
