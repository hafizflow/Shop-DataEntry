import type { MouseEvent } from 'react';
import { CameraOff, Flashlight, FlashlightOff, SwitchCamera } from 'lucide-react';
import { useBarcodeScanner } from '../../scanner/useBarcodeScanner';
import { Bi } from '../../components/Bi';
import { useT } from '../../lib/i18n';

const ROUND_BTN = 'grid size-12 place-items-center rounded-full bg-black/55 text-white backdrop-blur focus-visible:outline-2 focus-visible:outline-white aria-pressed:bg-white aria-pressed:text-black';

export function ScannerView({ enabled, onDetect }: { enabled: boolean; onDetect(code: string): void }) {
  const s = useBarcodeScanner({ enabled, onDetect });
  const tt = useT();

  function tapFocus(e: MouseEvent<HTMLDivElement>) {
    const r = e.currentTarget.getBoundingClientRect();
    s.focusAt((e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height);
  }

  const failed = s.status === 'denied' || s.status === 'insecure' || s.status === 'error';
  const message = { denied: 'scan.camera.denied', insecure: 'scan.camera.insecure', error: 'scan.camera.error' } as const;
  const corner = 'absolute size-8 border-white';
  return (
    <div className="relative aspect-[4/3] w-full overflow-hidden rounded-3xl bg-black shadow-lg" onClick={tapFocus}>
      <video ref={s.videoRef} className="size-full object-cover" playsInline muted aria-label="Camera preview" />
      {!failed && (
        <div className="pointer-events-none absolute inset-0 grid place-items-center">
          <div className="relative h-[52%] w-[78%] shadow-[0_0_0_9999px_rgba(0,0,0,0.38)]">
            <span className={`${corner} left-0 top-0 rounded-tl-2xl border-l-4 border-t-4`} />
            <span className={`${corner} right-0 top-0 rounded-tr-2xl border-r-4 border-t-4`} />
            <span className={`${corner} bottom-0 left-0 rounded-bl-2xl border-b-4 border-l-4`} />
            <span className={`${corner} bottom-0 right-0 rounded-br-2xl border-b-4 border-r-4`} />
            {enabled && s.status === 'running' && <span className="scan-line absolute inset-x-3 h-0.5 rounded-full bg-accent shadow-[0_0_12px_var(--accent)]" />}
          </div>
          <p className="absolute bottom-3 rounded-full bg-black/55 px-4 py-1.5 text-center text-sm font-semibold text-white backdrop-blur">
            <Bi k="scan.hint" />
          </p>
        </div>
      )}
      {failed && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-surface p-6 text-center">
          <CameraOff className="size-10 text-muted" aria-hidden />
          <p className="text-sm font-medium"><Bi k={message[s.status as keyof typeof message]} /></p>
          <button className="btn btn-primary" onClick={(e) => { e.stopPropagation(); s.restart(); }}><Bi k="scan.retryCamera" /></button>
        </div>
      )}
      <div className="absolute right-3 top-3 flex flex-col gap-2" onClick={(e) => e.stopPropagation()}>
        {s.torchSupported && (
          <button className={ROUND_BTN} aria-pressed={s.torchOn} aria-label={tt('scan.torch')} onClick={() => void s.toggleTorch()}>
            {s.torchOn ? <FlashlightOff className="size-6" aria-hidden /> : <Flashlight className="size-6" aria-hidden />}
          </button>
        )}
        {s.canSwitch && (
          <button className={ROUND_BTN} aria-label={tt('scan.switch')} onClick={s.switchCamera}>
            <SwitchCamera className="size-6" aria-hidden />
          </button>
        )}
      </div>
    </div>
  );
}
