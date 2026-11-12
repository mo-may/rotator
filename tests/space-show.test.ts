import { describe, expect, test } from 'bun:test';
import { missionFrame } from '../frontend/src/lib/space-show';

const normal = { quick: false, direct: false, reducedMotion: false };

describe('meeting mission timeline', () => {
  test('normal show has a 12-second mission with intentional phase boundaries', () => {
    expect(missionFrame(0, normal)).toMatchObject({
      phase: 'countdown',
      countdown: 3,
      durationMs: 12000,
    });
    expect(missionFrame(800, normal).countdown).toBe(2);
    expect(missionFrame(1600, normal).countdown).toBe(1);
    expect(missionFrame(2400, normal)).toMatchObject({ phase: 'launch', phaseProgress: 0 });
    expect(missionFrame(4000, normal).phase).toBe('asteroids');
    expect(missionFrame(7200, normal).phase).toBe('warp');
    expect(missionFrame(9700, normal).phase).toBe('arrival');
    expect(missionFrame(12000, normal)).toMatchObject({
      phase: 'complete',
      complete: true,
      progress: 1,
    });
  });

  test('quick mode lasts one second and does not rush through fake hazards', () => {
    const quick = { ...normal, quick: true };
    expect(missionFrame(0, quick)).toMatchObject({
      phase: 'launch',
      durationMs: 1000,
      countdown: null,
    });
    expect(missionFrame(350, quick).phase).toBe('arrival');
    expect(missionFrame(1000, quick).complete).toBe(true);
  });

  test('a direct selection gets a short arrival without a random competition', () => {
    const direct = { ...normal, direct: true };
    expect(missionFrame(0, direct)).toMatchObject({ phase: 'launch', durationMs: 2400 });
    expect(missionFrame(900, direct).phase).toBe('arrival');
    expect(missionFrame(2400, direct).complete).toBe(true);
  });

  test('reduced motion reveals immediately regardless of mode', () => {
    expect(missionFrame(0, { quick: false, direct: false, reducedMotion: true })).toMatchObject({
      phase: 'complete',
      durationMs: 0,
      complete: true,
    });
  });

  test('background-tab jumps finish cleanly and negative elapsed time stays at the start', () => {
    expect(missionFrame(-50, normal).progress).toBe(0);
    expect(missionFrame(70000, normal)).toMatchObject({ phase: 'complete', elapsedMs: 12000 });
  });
});
