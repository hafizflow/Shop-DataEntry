import { useCallback, useEffect, useRef, useState } from 'react';
import { getDetector } from './detector';
import { beep, vibrate } from './feedback';

interface Options {
  onDetect(code: string): void;
  /** false pauses scanning but keeps the camera open, so resuming is instant */
  enabled: boolean;
  /** how many identical reads in a row are required (guards against misreads) */
  confirmReads?: number;
}
type Status = 'starting' | 'running' | 'denied' | 'insecure' | 'error';
type TrackCaps = MediaTrackCapabilities & { torch?: boolean };

const BACK = /back|rear|environment/i;
const SECONDARY_LENS = /ultra|wide|tele|macro|depth|zoom|infrared|\bir\b/i;

/** The main back lens: phones list ultra-wide/telephoto/macro lenses too, and those scan poorly. */
function pickMainBack(cams: MediaDeviceInfo[]): string | undefined {
  const back = cams.filter((d) => BACK.test(d.label));
  const main = back.filter((d) => !SECONDARY_LENS.test(d.label));
  return (main.find((d) => /^back camera$/i.test(d.label.trim())) ?? main[0] ?? back[0])?.deviceId;
}

const SIZE = { width: { ideal: 1280 }, height: { ideal: 720 } };

export function useBarcodeScanner({ onDetect, enabled, confirmReads = 2 }: Options) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const generation = useRef(0); // invalidates a start() that was overtaken (StrictMode, fast switching)
  const mainBackId = useRef<string | undefined>(undefined);
  const facingRef = useRef<'environment' | 'user'>('environment');
  const onDetectRef = useRef(onDetect);
  onDetectRef.current = onDetect;
  const [status, setStatus] = useState<Status>('starting');
  const [torchSupported, setTorchSupported] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  const [canSwitch, setCanSwitch] = useState(false);

  const stop = useCallback(() => {
    generation.current++;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  const start = useCallback(async () => {
    stop();
    const mine = generation.current;
    setStatus('starting'); setTorchOn(false);
    // Browsers hide the camera API on plain http:// (except localhost): say so instead of a vague error.
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) { setStatus('insecure'); return; }
    try {
      const back = facingRef.current === 'environment';
      const video: MediaTrackConstraints = back && mainBackId.current
        ? { deviceId: { exact: mainBackId.current }, ...SIZE }
        : { facingMode: { ideal: facingRef.current }, ...SIZE };
      const stream = await navigator.mediaDevices.getUserMedia({ audio: false, video });
      if (mine !== generation.current || !videoRef.current) { stream.getTracks().forEach((t) => t.stop()); return; }
      streamRef.current = stream;
      videoRef.current.srcObject = stream;
      await videoRef.current.play();
      if (mine !== generation.current) return;
      const track = stream.getVideoTracks()[0];
      setTorchSupported(Boolean((track.getCapabilities?.() as TrackCaps | undefined)?.torch));
      const cams = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'videoinput');
      if (back && !mainBackId.current) {
        // Labels only exist once permission is granted, so pick the lens now and reopen on it if needed.
        const best = pickMainBack(cams);
        if (best && best !== track.getSettings().deviceId) { mainBackId.current = best; void start(); return; }
        mainBackId.current = best;
      }
      setCanSwitch(cams.length > 1);
      setStatus('running');
    } catch (e) {
      if (mine !== generation.current) return;
      const name = (e as DOMException).name;
      if (name === 'OverconstraintError' || name === 'OverconstrainedError') { mainBackId.current = undefined; void start(); return; }
      setStatus(name === 'NotAllowedError' || name === 'SecurityError' ? 'denied' : 'error');
    }
  }, [stop]);

  useEffect(() => {
    void start();
    void getDetector().catch(() => { /* surfaced when scanning starts */ }); // load WASM while the camera warms up
    return stop;
  }, [start, stop]);

  // Continuous scan loop: one detect() in flight at a time; frames are skipped while busy.
  useEffect(() => {
    if (!enabled || status !== 'running') return;
    let raf = 0; let busy = false; let done = false;
    let last: string | null = null; let reads = 0;
    const tick = async () => {
      if (done) return;
      const video = videoRef.current;
      if (!busy && video && video.readyState >= 2) {
        busy = true;
        try {
          const found = (await (await getDetector()).detect(video))[0]?.rawValue?.trim();
          if (found) {
            reads = found === last ? reads + 1 : 1;
            last = found;
            if (reads >= confirmReads) {
              done = true;
              vibrate(); beep();
              onDetectRef.current(found);
              return;
            }
          }
        } catch { /* a bad frame is not fatal */ } finally { busy = false; }
      }
      raf = requestAnimationFrame(() => void tick());
    };
    raf = requestAnimationFrame(() => void tick());
    return () => { done = true; cancelAnimationFrame(raf); };
  }, [enabled, status, confirmReads]);

  const applyAdvanced = async (c: Record<string, unknown>) => {
    await streamRef.current?.getVideoTracks()[0]?.applyConstraints({ advanced: [c as MediaTrackConstraintSet] });
  };
  const toggleTorch = useCallback(async () => {
    try { await applyAdvanced({ torch: !torchOn }); setTorchOn((v) => !v); } catch { /* unsupported */ }
  }, [torchOn]);
  const switchCamera = useCallback(() => {
    facingRef.current = facingRef.current === 'environment' ? 'user' : 'environment';
    void start();
  }, [start]);
  const focusAt = useCallback((x: number, y: number) => {
    void applyAdvanced({ focusMode: 'single-shot', pointsOfInterest: [{ x, y }] }).catch(() => { /* not supported */ });
  }, []);

  return { videoRef, status, torchSupported, torchOn, canSwitch, toggleTorch, switchCamera, focusAt, restart: () => void start() };
}
