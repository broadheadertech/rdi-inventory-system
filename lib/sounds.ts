let audioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  try {
    if (!audioCtx) {
      audioCtx = new AudioContext();
    }
    return audioCtx;
  } catch {
    return null;
  }
}

function playTone(frequency: number, duration: number, type: OscillatorType) {
  const ctx = getAudioContext();
  if (!ctx) return;

  try {
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, ctx.currentTime);
    gain.gain.setValueAtTime(0.3, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + duration / 1000);
    oscillator.connect(gain);
    gain.connect(ctx.destination);
    oscillator.start(ctx.currentTime);
    oscillator.stop(ctx.currentTime + duration / 1000);
  } catch {
    // Silently fail if audio not available
  }
}

/** Pleasant chime for successful barcode scan — 800Hz sine, 150ms */
export function playSuccessChime() {
  playTone(800, 150, "sine");
}

/** Error buzz for barcode not found — 200Hz square, 300ms */
export function playErrorBuzz() {
  playTone(200, 300, "square");
}

/** Soft notification tone for duplicate scan — 600Hz sine, 100ms */
export function playDuplicateTone() {
  playTone(600, 100, "sine");
}
