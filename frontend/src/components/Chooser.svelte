<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import type { Draw } from '../../../src/shared/contracts';
  import { createMissionAudio } from '../lib/space-audio';
  import { missionCopy, missionFrame, type MissionFrame } from '../lib/space-show';
  import SpaceScene from './SpaceScene.svelte';

  let {
    draw,
    taskName,
    quick,
    audio,
    onclose,
  }: { draw: Draw; taskName: string; quick: boolean; audio?: AudioContext; onclose: () => void } =
    $props();

  // A show owns one immutable draw and its audio resource, including during parent teardown.
  const snapshot = untrack(() => ({ draw, quick, audio }));
  const soundtrack = createMissionAudio(snapshot.audio);
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const mode = {
    quick: snapshot.quick,
    direct: snapshot.draw.method === 'direct' || snapshot.draw.candidates.length === 1,
    reducedMotion,
  };
  const pilots = snapshot.draw.candidates.map((candidate) => ({
    id: candidate.membershipId,
    name: candidate.name,
  }));

  let dialog: HTMLDialogElement;
  let layout: HTMLDivElement;
  let frame = $state<MissionFrame>(missionFrame(0, mode));
  let skip = $state(false);
  let fullscreenAvailable = $state(false);
  let manifestOpen = $state(false);
  const titleId = $props.id();
  const revealed = $derived(frame.complete);
  const phaseCopy = $derived(missionCopy[frame.phase]);
  const remaining = $derived(Math.ceil((frame.durationMs - frame.elapsedMs) / 1000));

  function updateFrame(next: MissionFrame): void {
    frame = next;
    soundtrack.update(next);
  }

  function reveal(): void {
    skip = true;
    updateFrame(missionFrame(Number.POSITIVE_INFINITY, mode));
  }

  function cancel(event: Event): void {
    event.preventDefault();
    if (revealed) onclose();
    else reveal();
  }

  async function toggleFullscreen(): Promise<void> {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await layout.requestFullscreen();
    } catch {
      /* Fullscreen may be disabled by browser policy; the show still works in its dialog. */
    }
  }

  onMount(() => {
    const previousFocus =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    fullscreenAvailable = document.fullscreenEnabled;
    // Svelte mounts children first. Wait until the modal has a measurable stage.
    dialog.showModal();
    return () => {
      soundtrack.dispose();
      if (document.fullscreenElement === layout) void document.exitFullscreen().catch(() => {});
      dialog.close();
      (previousFocus?.isConnected
        ? previousFocus
        : document.querySelector<HTMLElement>('#main')
      )?.focus({ preventScroll: true });
    };
  });
</script>

<dialog bind:this={dialog} class:is-revealed={revealed} aria-labelledby={titleId} oncancel={cancel}>
  <div bind:this={layout} class="mission-layout">
    <div class="mission-top">
      <span class="brand"><span class="orbit-mark" aria-hidden="true"></span>Rotator</span>
      <span class="mission-type">{mode.direct ? 'DIREKTE ZUWEISUNG' : 'TEAMMISSION'}</span>
      {#if fullscreenAvailable}
        <button class="fullscreen" onclick={toggleFullscreen}>⛶ Vollbild</button>
      {/if}
    </div>

    <div class="mission-heading">
      <div>
        <p class="task-name">{taskName}</p>
        <h2 id={titleId}>{phaseCopy.title}</h2>
      </div>
      <div class="telemetry" aria-hidden="true">
        <span>{revealed ? 'AM ZIEL' : 'IM FLUG'}</span>
        <strong
          >{revealed ? '100' : String(Math.floor(frame.progress * 100)).padStart(2, '0')}<small
            >%</small
          ></strong
        >
      </div>
    </div>

    <div class="phase-bar" aria-hidden="true">
      <span class:active={frame.phase === 'countdown' || frame.phase === 'launch'}>01 / START</span>
      {#if !mode.direct && !mode.quick && !reducedMotion}
        <span class:active={frame.phase === 'asteroids'}>02 / ASTEROIDEN</span>
        <span class:active={frame.phase === 'warp'}>03 / HYPERRAUM</span>
      {/if}
      <span class:active={frame.phase === 'arrival' || revealed}>04 / TEAMORBIT</span>
    </div>

    <SpaceScene
      {pilots}
      winnerId={snapshot.draw.membershipId}
      winnerName={snapshot.draw.name}
      {mode}
      {skip}
      onframe={updateFrame}
    />

    <div class="progress-track" aria-hidden="true">
      <span style:width="{frame.progress * 100}%"></span>
    </div>

    <div class="mission-status" role="status" aria-live="polite" aria-atomic="true">
      {#if revealed}
        <div class="result">
          <p class="result-label">Ausgewählt für diese Aufgabe</p>
          <p class="result-name" data-testid="chooser-winner">{snapshot.draw.name}</p>
          <p class="result-caption">Neuer Auswahlstand: {snapshot.draw.countAfter}</p>
        </div>
      {:else}
        <div class="in-flight">
          <span class="status-dot" aria-hidden="true"></span>
          <p>{phaseCopy.description}</p>
          <span class="remaining" aria-hidden="true">T−{remaining}s</span>
        </div>
        <span class="screenreader-only" data-testid="chooser-winner"
          >Die gespeicherte Auswahl wird gleich angezeigt.</span
        >
      {/if}
    </div>

    <div class="manifest">
      <button
        class="manifest-toggle"
        aria-expanded={manifestOpen}
        onclick={() => (manifestOpen = !manifestOpen)}
      >
        <span>{pilots.length} {pilots.length === 1 ? 'Person an Bord' : 'Personen an Bord'}</span>
        <span aria-hidden="true">{manifestOpen ? '−' : '+'}</span>
      </button>
      {#if manifestOpen}
        <ul>
          {#each pilots as pilot (pilot.id)}<li>{pilot.name}</li>{/each}
        </ul>
      {/if}
    </div>

    <div class="mission-bottom">
      <p class="integrity">
        Die Szene zeigt die bereits gespeicherte Auswahl. Flugmanöver ändern das Ergebnis nicht.
      </p>
      <button class="button" onclick={() => (revealed ? onclose() : reveal())}>
        {revealed ? 'Weiter zur Aufgabe →' : 'Animation überspringen →'}
      </button>
    </div>
  </div>
</dialog>

<style>
  dialog {
    width: min(1200px, calc(100% - 24px));
    max-width: 1200px;
    max-height: calc(100dvh - 24px);
    padding: 0;
    overflow: auto;
    border: 1px solid var(--dark-line);
    border-radius: var(--radius);
    background: var(--indigo);
    color: var(--on-dark);
    box-shadow: 0 32px 110px #100d2085;
  }

  dialog::backdrop {
    background: color-mix(in srgb, var(--night) 95%, transparent);
    backdrop-filter: blur(7px);
  }

  .mission-layout {
    background: var(--indigo);
  }

  .mission-layout:fullscreen {
    width: 100%;
    height: 100%;
    overflow: auto;
    background: var(--indigo);
    color: var(--on-dark);
  }

  .mission-layout:fullscreen :global(.space-stage) {
    height: clamp(360px, 51vh, 640px);
  }

  .mission-top {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 22px;
    padding: 22px 30px;
    border-bottom: 1px solid var(--dark-line);
  }

  .brand {
    display: inline-flex;
    align-items: center;
    gap: 11px;
    font-size: 19px;
    font-weight: 500;
  }
  .orbit-mark {
    position: relative;
    width: 23px;
    height: 23px;
    border: 1px solid var(--petal);
    border-radius: 50%;
  }
  .orbit-mark::after {
    position: absolute;
    inset: 5px -5px;
    border: 1px solid var(--lavender);
    border-radius: 50%;
    content: '';
    transform: rotate(-35deg);
  }
  .mission-type {
    margin-right: auto;
    color: var(--on-dark-muted);
    font-size: 11px;
    letter-spacing: 0.14em;
  }

  .fullscreen {
    min-height: 37px;
    padding: 7px 12px;
    border: 1px solid var(--dark-line);
    border-radius: 5px;
    background: transparent;
    color: var(--on-dark);
    font-size: 13px;
  }

  .fullscreen:hover {
    border-color: var(--on-dark-muted);
    background: color-mix(in srgb, var(--lilac) 5%, transparent);
  }
  .mission-heading {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 25px;
    padding: 25px 30px 23px;
  }
  .task-name {
    margin-bottom: 10px;
    color: var(--on-dark-muted);
    font-size: 13px;
    overflow-wrap: anywhere;
  }
  h2 {
    color: var(--on-dark);
    font-size: clamp(24px, 3.4vw, 35px);
    font-weight: 500;
    letter-spacing: -0.045em;
  }
  .telemetry {
    flex: none;
    color: var(--petal);
    text-align: right;
  }
  .telemetry > span {
    display: block;
    color: var(--on-dark-muted);
    font-size: 10px;
    letter-spacing: 0.14em;
  }
  .telemetry strong {
    display: block;
    font-size: 31px;
    font-weight: 400;
    line-height: 1.3;
    font-variant-numeric: tabular-nums;
  }
  .telemetry small {
    margin-left: 3px;
    font-size: 13px;
  }
  .phase-bar {
    display: flex;
    justify-content: space-between;
    gap: 18px;
    padding: 0 30px 16px;
    color: var(--on-dark-muted);
    font-size: 10px;
    letter-spacing: 0.08em;
  }
  .phase-bar .active {
    color: var(--petal);
  }
  .progress-track {
    height: 2px;
    background: var(--night);
  }
  .progress-track span {
    display: block;
    height: 100%;
    background: var(--petal);
  }
  .mission-status {
    padding: 20px 30px;
  }
  .in-flight {
    display: flex;
    min-height: 58px;
    align-items: center;
    gap: 12px;
    color: var(--on-dark-muted);
    font-size: 13px;
  }
  .status-dot {
    width: 6px;
    height: 6px;
    flex: none;
    border-radius: 50%;
    background: var(--petal);
  }
  .remaining {
    margin-left: auto;
    flex: none;
    color: var(--petal);
    font-size: 13px;
    font-variant-numeric: tabular-nums;
  }
  .result {
    min-height: 105px;
    text-align: center;
  }
  .result-label {
    color: var(--on-dark-muted);
    font-size: 12px;
  }
  .result-name {
    margin: 8px 0;
    color: var(--petal);
    font-size: clamp(24px, 3.5vw, 38px);
    font-weight: 500;
    line-height: 1.25;
    overflow-wrap: anywhere;
  }
  .result-caption {
    color: var(--on-dark-muted);
    font-size: 13px;
  }
  .manifest {
    margin: 0 30px;
    border-top: 1px solid var(--dark-line);
  }
  .manifest-toggle {
    display: flex;
    width: 100%;
    align-items: center;
    justify-content: space-between;
    gap: 18px;
    padding: 14px 0;
    border: 0;
    background: transparent;
    color: var(--on-dark-muted);
    font-size: 12px;
    text-align: left;
  }
  .manifest-toggle:hover {
    color: var(--petal);
  }
  .manifest ul {
    display: flex;
    flex-wrap: wrap;
    gap: 7px;
    margin: 0 0 18px;
    padding: 0;
    list-style: none;
  }
  .manifest li {
    max-width: 100%;
    padding: 5px 8px;
    border: 1px solid var(--dark-line);
    border-radius: 4px;
    color: var(--on-dark);
    font-size: 12px;
    overflow-wrap: anywhere;
  }

  .mission-bottom {
    position: sticky;
    z-index: 5;
    bottom: 0;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 25px;
    padding: 20px 30px 25px;
    border-top: 1px solid var(--dark-line);
    background: var(--indigo);
  }

  .integrity {
    max-width: 580px;
    color: var(--on-dark-muted);
    font-size: 11px;
    line-height: 1.7;
  }
  .mission-bottom .button {
    flex: none;
    border: 1px solid var(--petal);
    border-radius: 5px;
    background: var(--petal);
    color: var(--indigo);
    font-size: 13px;
    font-weight: 500;
  }
  .mission-bottom .button:hover {
    border-color: var(--surface-muted);
    background: var(--surface-muted);
    transform: none;
  }
  button:focus-visible {
    outline: 2px solid var(--petal);
    outline-offset: 4px;
  }
  .screenreader-only {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }

  @media (max-width: 650px) {
    .mission-top {
      padding: 18px;
      gap: 18px;
    }
    .mission-type {
      display: none;
    }
    .brand {
      font-size: 18px;
    }
    .mission-heading {
      gap: 15px;
      padding: 23px 18px 20px;
    }
    h2 {
      font-size: 25px;
    }
    .task-name {
      font-size: 12px;
    }
    .telemetry strong {
      font-size: 26px;
    }
    .telemetry > span {
      font-size: 9px;
    }
    .phase-bar {
      flex-wrap: wrap;
      gap: 8px 14px;
      padding-inline: 18px;
      font-size: 9px;
    }
    .mission-status {
      padding: 17px 18px;
    }
    .in-flight {
      align-items: flex-start;
      flex-wrap: wrap;
      gap: 9px;
      font-size: 12px;
    }
    .in-flight p {
      flex: 1;
      min-width: 190px;
    }
    .status-dot {
      margin-top: 8px;
    }
    .remaining {
      display: none;
    }
    .manifest {
      margin-inline: 18px;
    }
    .mission-bottom {
      flex-direction: column-reverse;
      align-items: stretch;
      gap: 15px;
      padding: 18px;
    }
    .mission-bottom .button {
      width: 100%;
    }
    .integrity {
      font-size: 10px;
    }
    .result {
      min-height: 110px;
    }
    .result-caption {
      font-size: 12px;
    }
  }
</style>
