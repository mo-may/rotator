<script lang="ts">
  import { onMount, tick } from 'svelte';
  import type {
    AppConfig,
    AppState,
    Draw,
    DrawResponse,
    Member,
    TaskDetail,
  } from '../../src/shared/contracts';
  import type { Editor } from './lib/editor';
  import { api, errorMessage, RequestError } from './lib/api';
  import { readPreference, savePreference } from './lib/format';
  import TaskList from './pages/TaskList.svelte';
  import TaskPage from './pages/TaskDetail.svelte';
  import TeamPage from './pages/TeamPage.svelte';
  import EmptyState from './components/EmptyState.svelte';
  import EditorModal from './components/EditorModal.svelte';
  import Chooser from './components/Chooser.svelte';

  interface PendingDraw {
    taskId: number;
    requestId: string;
    expectedVersion: number;
  }
  interface Toast {
    id: number;
    message: string;
    error: boolean;
  }
  interface Show {
    draw: Draw;
    taskName: string;
    audio?: AudioContext;
  }

  let path = $state(location.pathname);
  let appState = $state<AppState>({ tasks: [], participants: [] });
  let task = $state<TaskDetail | null>(null);
  let timeZone = $state('Europe/Berlin');
  let loading = $state(true);
  let loadError = $state('');
  let missing = $state(false);
  let editor = $state<Editor | null>(null);
  let busy = $state(false);
  let pendingDraw = $state<PendingDraw | null>(null);
  let show = $state.raw<Show | null>(null);
  let quick = $state(readPreference('quick'));
  let sound = $state(readPreference('sound'));
  let toasts = $state<Toast[]>([]);
  let main: HTMLElement;
  let requestSequence = 0;
  let refreshing = false;
  let toastId = 0;

  const taskId = $derived(Number(path.match(/^\/tasks\/(\d+)\/?$/)?.[1]) || null);
  const drawing = $derived(busy || show !== null);

  function notify(message: string, error = false): void {
    const id = ++toastId;
    toasts = [...toasts.slice(-2), { id, message, error }];
    setTimeout(() => (toasts = toasts.filter((toast) => toast.id !== id)), error ? 7000 : 4200);
  }

  async function refresh(blocking = false): Promise<void> {
    const sequence = ++requestSequence;
    const currentTaskId = taskId;
    refreshing = true;
    if (blocking) {
      loading = true;
      loadError = '';
    }
    try {
      const [nextState, nextTask] = await Promise.all([
        api<AppState>('/api/state'),
        currentTaskId ? api<TaskDetail>(`/api/tasks/${currentTaskId}`) : Promise.resolve(null),
      ]);
      if (sequence !== requestSequence) return;
      appState = nextState;
      task = nextTask;
      missing = false;
      loadError = '';
    } catch (error) {
      if (sequence !== requestSequence) return;
      if (error instanceof RequestError && error.status === 404) {
        missing = true;
        task = null;
      } else if (blocking) loadError = errorMessage(error);
      else notify(errorMessage(error), true);
    } finally {
      if (sequence === requestSequence) {
        loading = false;
        refreshing = false;
      }
    }
  }

  async function navigate(nextPath: string): Promise<void> {
    if (drawing) return;
    if (location.pathname !== nextPath) history.pushState(null, '', nextPath);
    path = nextPath;
    await refresh(true);
    await tick();
    window.scrollTo({ top: 0, behavior: 'instant' });
    main.focus({ preventScroll: true });
  }

  async function recover(error: unknown): Promise<void> {
    notify(errorMessage(error), true);
    if (error instanceof RequestError && error.status === 409) await refresh();
  }

  async function toggleMember(member: Member): Promise<void> {
    if (!task || drawing) return;
    busy = true;
    try {
      task = await api<TaskDetail>(`/api/tasks/${task.id}/members/${member.id}`, 'PATCH', {
        active: !member.active,
        expectedVersion: task.version,
      });
      await refresh();
      notify(`${member.name} ist jetzt ${member.active ? 'inaktiv' : 'aktiv'}.`);
    } catch (error) {
      await recover(error);
    } finally {
      busy = false;
    }
  }

  async function draw(retry = false): Promise<void> {
    if (!task || drawing || task.archived) return;
    const sourceTask = task;
    if (!retry || pendingDraw?.taskId !== task.id) {
      pendingDraw = {
        taskId: task.id,
        requestId: crypto.randomUUID(),
        expectedVersion: task.version,
      };
    }
    const request = pendingDraw!;
    let audio: AudioContext | undefined;
    if (sound && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      try {
        audio = new AudioContext();
        void audio.resume();
      } catch {
        /* Audio is optional. */
      }
    }
    busy = true;
    try {
      const result = await api<DrawResponse>(`/api/tasks/${sourceTask.id}/draws`, 'POST', {
        requestId: request.requestId,
        expectedVersion: request.expectedVersion,
      });
      pendingDraw = null;
      task = result.task;
      if (result.draw.undoneAt) {
        notify('Diese Auswahl wurde inzwischen zurückgenommen.');
        if (audio) void audio.close();
      } else if (!result.task.members.some((member) => member.id === result.draw.membershipId)) {
        notify('Die ausgewählte Person wurde inzwischen aus dem Team entfernt.');
        if (audio) void audio.close();
      } else {
        show = { draw: result.draw, taskName: sourceTask.name, ...(audio ? { audio } : {}) };
      }
    } catch (error) {
      // Ambiguous network/server answers keep the same ID for a safe retry.
      if (
        error instanceof RequestError &&
        error.status >= 400 &&
        error.status < 500 &&
        error.code !== 'INVALID_RESPONSE'
      )
        pendingDraw = null;
      if (audio) void audio.close();
      await recover(error);
    } finally {
      busy = false;
      if (!show) await refresh();
    }
  }

  async function closeShow(): Promise<void> {
    show = null;
    await refresh();
  }

  async function saved(message: string, nextPath?: string): Promise<void> {
    if (nextPath) await navigate(nextPath);
    else await refresh();
    notify(message);
  }

  function savePreferences(quickValue: boolean, soundValue: boolean): void {
    savePreference('quick', quickValue);
    savePreference('sound', soundValue);
  }

  onMount(() => {
    void (async () => {
      try {
        timeZone = (await api<AppConfig>('/api/config')).timeZone;
      } catch (error) {
        notify(errorMessage(error), true);
      }
      await refresh(true);
    })();

    const routeClick = (event: MouseEvent) => {
      const anchor = (event.target as Element | null)?.closest<HTMLAnchorElement>('a[data-route]');
      if (
        !anchor ||
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      )
        return;
      event.preventDefault();
      void navigate(anchor.pathname);
    };
    const popstate = () => {
      path = location.pathname;
      void refresh(true);
    };
    const visibility = () => {
      if (!document.hidden && !drawing && !editor && !pendingDraw) void refresh();
    };
    const poll = setInterval(() => {
      if (document.hidden || drawing || editor || pendingDraw || refreshing) return;
      void (async () => {
        try {
          const next = await api<AppState>('/api/state');
          if (JSON.stringify(next) !== JSON.stringify(appState)) await refresh();
        } catch {
          /* Background polling stays quiet; explicit actions show errors. */
        }
      })();
    }, 5000);

    document.addEventListener('click', routeClick);
    document.addEventListener('visibilitychange', visibility);
    window.addEventListener('popstate', popstate);
    return () => {
      clearInterval(poll);
      document.removeEventListener('click', routeClick);
      document.removeEventListener('visibilitychange', visibility);
      window.removeEventListener('popstate', popstate);
    };
  });
</script>

<svelte:head
  ><title>{path === '/team' ? 'Team' : task ? task.name : 'Aufgaben'} · Rotator</title></svelte:head
>

<a class="skip-link" href="#main">Zum Inhalt springen</a>
<header>
  <div class="header-inner">
    <a class="brand" href="/" data-route aria-label="Rotator – Aufgabenübersicht"
      ><span class="brand-mark" aria-hidden="true"></span><span>Rotator</span></a
    >
    <nav aria-label="Hauptnavigation">
      <a
        href="/"
        data-route
        class:active={path !== '/team'}
        aria-current={path !== '/team' ? 'page' : undefined}>Aufgaben</a
      ><a
        href="/team"
        data-route
        class:active={path === '/team'}
        aria-current={path === '/team' ? 'page' : undefined}>Team</a
      >
    </nav>
    <span class="header-note">Teamaufgaben im Wechsel.</span>
  </div>
</header>

<main bind:this={main} id="main" tabindex="-1">
  {#if loading}
    <div class="loading" role="status"><span class="spinner"></span>Dein Team wird geladen …</div>
  {:else if loadError}
    <EmptyState
      title="Verbindung nicht verfügbar."
      description={loadError}
      actionLabel="Erneut versuchen"
      onaction={() => void refresh(true)}
    />
  {:else if missing}
    <EmptyState
      title="Aufgabe nicht gefunden."
      description="Diese Aufgabe wurde nicht gefunden. Alle verfügbaren Aufgaben findest du in der Übersicht."
      actionLabel="Zur Aufgabenübersicht"
      onaction={() => void navigate('/')}
    />
  {:else if path === '/team'}
    <TeamPage
      participants={appState.participants}
      oncreate={() => (editor = { kind: 'person' })}
      onrename={(person) => (editor = { kind: 'person', person })}
      onremove={(person) => (editor = { kind: 'remove-person', person })}
    />
  {:else if task}
    {#key task.id}
      <TaskPage
        {task}
        {timeZone}
        busy={drawing}
        pending={pendingDraw?.taskId === task.id}
        bind:quick
        bind:sound
        ondraw={() => void draw()}
        onretry={() => void draw(true)}
        onedit={(next) => (editor = next)}
        ontoggle={(member) => void toggleMember(member)}
        onpreferences={savePreferences}
      />
    {/key}
  {:else}
    <TaskList {appState} oncreate={() => (editor = { kind: 'task' })} />
  {/if}
</main>

<footer>
  <span>Aufgaben im Team. Nachvollziehbar verteilt.</span><span>Rotator</span>
</footer>
<div class="toasts" role="status" aria-live="polite" aria-atomic="true">
  {#each toasts as toast (toast.id)}<div class="toast" class:error={toast.error}>
      {toast.message}
    </div>{/each}
</div>

{#if editor}<EditorModal
    {editor}
    participants={appState.participants}
    onsaved={saved}
    onclose={() => (editor = null)}
    onconflict={async (message) => {
      notify(message, true);
      await refresh();
    }}
  />{/if}
{#if show}<Chooser
    draw={show.draw}
    taskName={show.taskName}
    {quick}
    audio={show.audio}
    onclose={() => void closeShow()}
  />{/if}

<style>
  .skip-link {
    position: fixed;
    z-index: 20;
    top: -70px;
    left: 20px;
    padding: 12px 18px;
    border-radius: var(--radius);
    background: var(--petal);
    color: var(--ink);
  }
  .skip-link:focus {
    top: 10px;
  }
  .skip-link:not(:focus) {
    clip-path: inset(50%);
  }
  header {
    height: 88px;
    border-bottom: 1px solid var(--dark-line);
  }
  .header-inner {
    display: flex;
    max-width: 1340px;
    height: 100%;
    align-items: center;
    gap: 66px;
    margin: auto;
    padding: 0 45px;
  }
  .brand {
    display: inline-flex;
    align-items: center;
    gap: 19px;
    color: var(--on-dark);
    font: 700 25px var(--font-display);
    letter-spacing: 0.17em;
  }
  .brand-mark {
    position: relative;
    display: block;
    width: 30px;
    height: 30px;
    flex: none;
    border: 1px solid var(--petal);
    border-radius: 50%;
  }
  .brand-mark::before {
    content: '';
    position: absolute;
    inset: 8px -10px;
    border: 1px solid var(--petal);
    border-radius: 50%;
    transform: rotate(-28deg);
  }
  .brand-mark::after {
    content: '';
    position: absolute;
    top: 2px;
    right: 1px;
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--lilac);
  }
  nav {
    display: flex;
    height: 100%;
    align-items: stretch;
    gap: 32px;
    font-size: 14px;
  }
  nav a {
    display: flex;
    align-items: center;
    border-bottom: 2px solid transparent;
    color: var(--on-dark-muted);
  }
  nav a:hover {
    color: var(--on-dark);
  }
  nav a.active {
    border-bottom-color: var(--petal);
    color: var(--on-dark);
  }
  .header-note {
    margin-left: auto;
    color: var(--on-dark-muted);
    font-size: 12px;
  }
  main {
    max-width: 1340px;
    min-height: calc(100vh - 167px);
    margin: auto;
    padding: 49px 45px 64px;
  }
  footer {
    display: flex;
    max-width: 1250px;
    justify-content: space-between;
    gap: 20px;
    margin: auto;
    padding: 24px 0;
    border-top: 1px solid var(--dark-line);
    color: var(--on-dark-muted);
    font-size: 12px;
  }
  .toasts {
    position: fixed;
    z-index: 15;
    right: 24px;
    bottom: 24px;
    display: grid;
    max-width: min(480px, calc(100% - 48px));
    gap: 10px;
    pointer-events: none;
  }
  .toast {
    padding: 15px 20px;
    border: 1px solid var(--primary);
    border-radius: var(--radius);
    background: var(--surface);
    color: var(--ink);
    box-shadow: var(--overlay-shadow);
    font-size: 14px;
  }
  .toast.error {
    border-color: var(--lilac);
    background: var(--danger-tint);
    color: var(--danger);
  }
  @media (max-width: 850px) {
    .header-inner {
      padding-inline: 25px;
      gap: 42px;
    }
    main {
      padding-inline: 25px;
    }
    footer {
      margin-inline: 25px;
    }
    .header-note {
      display: none;
    }
  }
  @media (max-width: 600px) {
    header {
      height: 74px;
    }
    .header-inner {
      padding-inline: 19px;
      gap: 32px;
    }
    .brand {
      gap: 13px;
      font-size: 22px;
    }
    .brand-mark {
      width: 24px;
      height: 24px;
    }
    .brand-mark::before {
      inset: 6px -8px;
    }
    nav {
      gap: 22px;
      font-size: 13px;
    }
    main {
      padding: 32px 19px 45px;
    }
    footer {
      margin-inline: 19px;
      flex-direction: column;
      gap: 8px;
    }
    .toasts {
      right: 16px;
      bottom: 16px;
      max-width: calc(100% - 32px);
    }
  }
  @media (max-width: 380px) {
    .header-inner {
      padding-inline: 16px;
      gap: 20px;
    }
    .brand {
      gap: 11px;
      font-size: 20px;
      letter-spacing: 0.12em;
    }
    .brand-mark {
      width: 22px;
      height: 22px;
    }
    nav {
      gap: 16px;
      font-size: 12px;
    }
  }
</style>
