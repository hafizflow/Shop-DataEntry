let ctx: AudioContext | null = null;

/** Call from a user gesture once (iOS blocks audio until then). */
export function primeAudio() {
  try {
    ctx ??= new AudioContext();
    if (ctx.state === 'suspended') void ctx.resume();
  } catch { /* no audio available */ }
}

export function beep() {
  try {
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'square'; osc.frequency.value = 1100; gain.gain.value = 0.08;
    osc.connect(gain).connect(ctx.destination);
    osc.start(); osc.stop(ctx.currentTime + 0.09);
  } catch { /* ignore */ }
}

export const vibrate = () => { try { navigator.vibrate?.(60); } catch { /* unsupported */ } };

/** Ask for camera access right after login so the first scan is instant; the stream is released at once. */
export async function warmCameraPermission(): Promise<void> {
  try {
    if (!navigator.mediaDevices?.getUserMedia) return;
    const status = await navigator.permissions?.query({ name: 'camera' as PermissionName });
    if (status && status.state !== 'prompt') return;
    const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } } });
    stream.getTracks().forEach((track) => track.stop());
  } catch { /* denied or unsupported: the scanner screen handles it */ }
}
