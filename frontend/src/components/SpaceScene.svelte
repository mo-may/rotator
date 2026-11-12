<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import {
    createSpaceRenderer,
    missionFrame,
    type MissionFrame,
    type MissionMode,
    type Pilot,
    type SpacePalette,
  } from '../lib/space-show';

  let {
    pilots,
    winnerId,
    winnerName,
    mode,
    skip,
    onframe,
  }: {
    pilots: Pilot[];
    winnerId: number;
    winnerName: string;
    mode: MissionMode;
    skip: boolean;
    onframe: (frame: MissionFrame) => void;
  } = $props();

  let canvas: HTMLCanvasElement;
  let stage: HTMLDivElement;
  let current = $state<MissionFrame>(untrack(() => missionFrame(0, mode)));
  let renderFrame: ((elapsed: number) => void) | undefined;

  $effect(() => {
    if (skip) untrack(() => renderFrame?.(Number.POSITIVE_INFINITY));
  });

  onMount(() => {
    const styles = getComputedStyle(stage);
    const palette: SpacePalette = {
      indigo: styles.getPropertyValue('--indigo').trim() || '#2e294e',
      petal: styles.getPropertyValue('--petal').trim() || '#efbcd5',
      lilac: styles.getPropertyValue('--lilac').trim() || '#be97c6',
      lavender: styles.getPropertyValue('--lavender').trim() || '#8661c1',
      charcoal: styles.getPropertyValue('--charcoal').trim() || '#4b5267',
    };
    const renderer = createSpaceRenderer(canvas, pilots, winnerId, palette, styles.fontFamily);
    const started = performance.now();
    let frameId = 0;
    let destroyed = false;

    renderFrame = (elapsed) => {
      if (destroyed) return;
      current = missionFrame(elapsed, mode);
      renderer?.paint(current);
      onframe(current);
      if (current.complete) cancelAnimationFrame(frameId);
    };

    const resize = () => {
      renderer?.resize();
      renderer?.paint(current);
    };
    const loop = (now: number) => {
      renderFrame?.(skip ? Number.POSITIVE_INFINITY : now - started);
      if (!current.complete && !destroyed) frameId = requestAnimationFrame(loop);
    };
    const observer = new ResizeObserver(resize);
    observer.observe(stage);
    resize();
    renderFrame(skip ? Number.POSITIVE_INFINITY : 0);
    if (!current.complete) frameId = requestAnimationFrame(loop);

    return () => {
      destroyed = true;
      cancelAnimationFrame(frameId);
      observer.disconnect();
      renderFrame = undefined;
    };
  });
</script>

<div bind:this={stage} class="space-stage" data-testid="roulette-stage">
  <canvas bind:this={canvas} aria-hidden="true"></canvas>
  <div class="coordinates" aria-hidden="true">
    <span>ROTATOR FLIGHT SYSTEMS</span><span>TEAM ORBIT / 001</span>
  </div>
  {#if current.phase === 'countdown'}
    <div class="countdown" aria-hidden="true">
      <span>START IN</span><strong>{current.countdown}</strong>
    </div>
  {/if}
  {#if current.complete}
    <div class="landing-label" data-testid="winning-card">
      <span>ZIEL ERREICHT</span><strong>{winnerName}</strong>
    </div>
  {/if}
  <div class="flight-caption" aria-hidden="true">
    {current.phase === 'asteroids'
      ? 'NAVIGATION · AUSWEICHKURS AKTIV'
      : current.phase === 'warp'
        ? 'HYPERRAUM · ALLE SCHIFFE AUF KURS'
        : current.complete
          ? 'LANDUNG BESTÄTIGT'
          : 'FORMATION · ALLE TRIEBWERKE BEREIT'}
  </div>
</div>

<style>
  .space-stage {
    position: relative;
    height: clamp(340px, 42vw, 460px);
    overflow: hidden;
    border-block: 1px solid var(--dark-line);
    background: var(--night);
    color: var(--on-dark);
  }

  canvas {
    display: block;
    width: 100%;
    height: 100%;
  }

  .coordinates {
    position: absolute;
    top: 18px;
    right: 24px;
    left: 24px;
    display: flex;
    justify-content: space-between;
    gap: 20px;
    color: var(--on-dark-muted);
    font-size: 10px;
    letter-spacing: 0.1em;
    pointer-events: none;
  }

  .countdown {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    background: radial-gradient(ellipse at center, #2e294e9c, transparent 65%);
    pointer-events: none;
  }

  .countdown span {
    color: var(--petal);
    font-size: 12px;
    letter-spacing: 0.2em;
  }
  .countdown strong {
    color: var(--petal);
    font-size: 105px;
    font-weight: 500;
    line-height: 1.3;
    text-shadow: 0 0 45px #efbcd548;
  }

  .landing-label {
    position: absolute;
    top: calc(47% + 83px);
    left: 50%;
    display: flex;
    width: min(360px, 82%);
    flex-direction: column;
    align-items: center;
    gap: 5px;
    padding: 9px 14px;
    color: var(--petal);
    text-align: center;
    transform: translateX(-50%);
  }

  .landing-label span {
    font-size: 10px;
    letter-spacing: 0.13em;
  }
  .landing-label strong {
    font-size: 17px;
    font-weight: 500;
    line-height: 1.3;
    overflow-wrap: anywhere;
  }
  .flight-caption {
    position: absolute;
    right: 24px;
    bottom: 15px;
    left: 24px;
    color: var(--on-dark-muted);
    font-size: 10px;
    letter-spacing: 0.12em;
    pointer-events: none;
  }

  @media (max-width: 600px) {
    .space-stage {
      height: 360px;
    }
    .coordinates {
      right: 15px;
      left: 15px;
      font-size: 9px;
    }
    .coordinates span:last-child {
      display: none;
    }
    .flight-caption {
      right: 15px;
      left: 15px;
      font-size: 9px;
    }
    .landing-label {
      top: calc(47% + 70px);
    }
    .landing-label strong {
      font-size: 15px;
    }
  }
</style>
