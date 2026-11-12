import type { MissionFrame, MissionPhase } from './space-show';

/** Optional synthesized score. The parent creates the context inside the user's click. */
export function createMissionAudio(context?: AudioContext) {
  const nodes = new Set<OscillatorNode>();
  let lastPhase: MissionPhase | null = null;
  let lastCountdown: number | null = null;
  let disposed = false;

  function tone(
    from: number,
    to: number,
    length: number,
    type: OscillatorType = 'sine',
    volume = 0.035,
    delay = 0,
  ): void {
    if (!context || context.state !== 'running' || disposed) return;
    const start = context.currentTime + delay;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(from, start);
    oscillator.frequency.exponentialRampToValueAtTime(to, start + length);
    gain.gain.setValueAtTime(0.001, start);
    gain.gain.exponentialRampToValueAtTime(volume, start + Math.min(length * 0.2, 0.06));
    gain.gain.exponentialRampToValueAtTime(0.001, start + length);
    oscillator.connect(gain);
    gain.connect(context.destination);
    nodes.add(oscillator);
    oscillator.addEventListener(
      'ended',
      () => {
        oscillator.disconnect();
        gain.disconnect();
        nodes.delete(oscillator);
      },
      { once: true },
    );
    oscillator.start(start);
    oscillator.stop(start + length + 0.01);
  }

  function update(frame: MissionFrame): void {
    if (frame.countdown !== null && frame.countdown !== lastCountdown) {
      lastCountdown = frame.countdown;
      tone(260, 200, 0.14, 'sine', 0.045);
    }
    if (frame.phase === lastPhase) return;
    lastPhase = frame.phase;
    switch (frame.phase) {
      case 'launch':
        tone(75, 320, 0.75, 'triangle', 0.035);
        break;
      case 'asteroids':
        tone(280, 75, 0.6, 'triangle', 0.025);
        tone(210, 95, 0.5, 'sine', 0.025, 0.65);
        break;
      case 'warp':
        tone(90, 850, 1.15, 'triangle', 0.03);
        tone(180, 1400, 0.9, 'sine', 0.018, 0.1);
        break;
      case 'arrival':
        tone(500, 130, 0.7, 'sine', 0.025);
        break;
      case 'complete':
        tone(330, 330, 0.22, 'sine', 0.045);
        tone(440, 440, 0.25, 'sine', 0.04, 0.15);
        tone(660, 880, 0.45, 'triangle', 0.03, 0.3);
        break;
    }
  }

  function dispose(): void {
    disposed = true;
    for (const oscillator of nodes) {
      try {
        oscillator.stop();
      } catch {
        /* A scheduled note may already have ended. */
      }
      oscillator.disconnect();
    }
    nodes.clear();
    if (context && context.state !== 'closed') void context.close().catch(() => {});
  }

  return { update, dispose };
}
