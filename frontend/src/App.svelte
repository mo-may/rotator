<script lang="ts">
  import { onMount, tick } from 'svelte';
  import type {
    AppConfig,
    AppState,
    Draw,
    DrawResponse,
    Member,
    TaskDetail,
    Stats,
    StatsPeriod,
    StatsDateRange,
  } from '../../src/shared/contracts';
  import type { Editor } from './lib/editor';
  import { api, errorMessage, RequestError } from './lib/api';
  import { readPreference, savePreference } from './lib/format';
  import TaskList from './pages/TaskList.svelte';
  import TaskPage from './pages/TaskDetail.svelte';
  import TeamPage from './pages/TeamPage.svelte';
  import StatsPage from './pages/StatsPage.svelte';
  import EmptyState from './components/EmptyState.svelte';
  import EditorModal from './components/EditorModal.svelte';
  import Chooser from './components/Chooser.svelte';
  import ThemeSwitch from './components/ThemeSwitch.svelte';

  interface PendingDraw {
    taskId: number;
    requestId: string;
    expectedVersion: number;
    membershipId?: number;
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
  let stats = $state<Stats | null>(null);
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
    const pageQuery = new URLSearchParams(location.search);
    const statsQuery = new URLSearchParams();
    for (const key of ['period', 'start', 'end']) {
      if (pageQuery.has(key)) statsQuery.set(key, pageQuery.get(key)!);
    }
    const statsUrl = '/api/stats' + (statsQuery.toString() ? '?' + statsQuery.toString() : '');
    refreshing = true;
    if (blocking) {
      loading = true;
      loadError = '';
    }
    try {
      const [nextState, nextTask, nextStats] = await Promise.all([
        api<AppState>('/api/state'),
        currentTaskId ? api<TaskDetail>(`/api/tasks/${currentTaskId}`) : Promise.resolve(null),
        path === '/stats' ? api<Stats>(statsUrl) : Promise.resolve(null),
      ]);
      if (sequence !== requestSequence) return;
      appState = nextState;
      task = nextTask;
      stats = nextStats;
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

  async function changeStatsPeriod(period: StatsPeriod, range?: StatsDateRange): Promise<void> {
    const url = new URL(location.href);
    if (period === 'all') url.searchParams.delete('period');
    else url.searchParams.set('period', period);
    if (period === 'custom' && range) {
      url.searchParams.set('start', range.start);
      url.searchParams.set('end', range.end);
    } else {
      url.searchParams.delete('start');
      url.searchParams.delete('end');
    }
    history.replaceState(null, '', url);
    await refresh(true);
    await tick();
    (document.querySelector<HTMLSelectElement>('[data-stats-period]') ?? main).focus({
      preventScroll: true,
    });
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

  async function draw(retry = false, membershipId?: number): Promise<void> {
    if (!task || drawing || task.archived) return;
    const sourceTask = task;
    if (!retry || pendingDraw?.taskId !== task.id) {
      pendingDraw = {
        taskId: task.id,
        requestId: crypto.randomUUID(),
        expectedVersion: task.version,
        ...(membershipId === undefined ? {} : { membershipId }),
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
        ...(request.membershipId === undefined ? {} : { membershipId: request.membershipId }),
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
  ><title
    >{path === '/stats' ? 'Stats' : path === '/team' ? 'Team' : task ? task.name : 'Aufgaben'} · Rotator</title
  ></svelte:head
>

<a class="skip-link" href="#main">Zum Inhalt springen</a>
<header>
  <div class="header-inner">
    <a class="brand" href="/" data-route aria-label="Rotator – Aufgabenübersicht"
      ><span>Rotator</span></a
    >
    <nav aria-label="Hauptnavigation">
      <a
        href="/"
        data-route
        class:active={path !== '/team' && path !== '/stats'}
        aria-current={path !== '/team' && path !== '/stats' ? 'page' : undefined}>Aufgaben</a
      ><a
        href="/team"
        data-route
        class:active={path === '/team'}
        aria-current={path === '/team' ? 'page' : undefined}>Team</a
      >
      <a
        href="/stats"
        data-route
        class:active={path === '/stats'}
        aria-current={path === '/stats' ? 'page' : undefined}>Stats</a
      >
    </nav>
    <div class="appearance"><ThemeSwitch /></div>
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
      {timeZone}
      oncreate={() => (editor = { kind: 'person' })}
      onrename={(person) => (editor = { kind: 'person', person })}
      onremove={(person) => (editor = { kind: 'remove-person', person })}
      onabsences={(person) => (editor = { kind: 'absences', person })}
    />
  {:else if path === '/stats' && stats}
    <StatsPage
      {stats}
      {timeZone}
      onperiod={(period, range) => void changeStatsPeriod(period, range)}
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

<div class="toasts" role="status" aria-live="polite" aria-atomic="true">
  {#each toasts as toast (toast.id)}<div class="toast" class:error={toast.error}>
      {toast.message}
    </div>{/each}
</div>

{#if editor}<EditorModal
    {editor}
    participants={appState.participants}
    {timeZone}
    onmanual={(membershipId) => {
      editor = null;
      void draw(false, membershipId);
    }}
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
    background: var(--surface);
    color: var(--ink);
  }
  .skip-link:focus {
    top: 10px;
  }
  .skip-link:not(:focus) {
    clip-path: inset(50%);
  }
  header {
    height: 68px;
    border-bottom: 1px solid var(--line);
  }
  .header-inner {
    display: flex;
    max-width: var(--page-max);
    height: 100%;
    align-items: center;
    gap: 48px;
    margin: auto;
    padding: 0 32px;
  }
  .brand {
    color: var(--ink);
    font: 700 18px var(--font-display);
    letter-spacing: -0.04em;
  }
  .brand:hover {
    color: var(--accent-text);
  }
  .appearance {
    margin-left: auto;
    flex: none;
  }
  nav {
    display: flex;
    height: 100%;
    align-items: stretch;
    gap: 28px;
    font-size: 13px;
  }
  nav a {
    display: flex;
    align-items: center;
    border-bottom: 2px solid transparent;
    color: var(--muted);
  }
  nav a:hover {
    color: var(--ink);
  }
  nav a.active {
    border-bottom-color: var(--primary);
    color: var(--ink);
  }
  main {
    max-width: var(--page-max);
    margin: auto;
    padding: 42px 32px 64px;
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
    border: 1px solid var(--line);
    border-radius: var(--radius);
    background: var(--surface);
    color: var(--ink);
    box-shadow: var(--overlay-shadow);
    font-size: 14px;
  }
  .toast.error {
    border-color: var(--danger);
    background: var(--danger-tint);
    color: var(--danger);
  }
  @media (max-width: 600px) {
    .header-inner {
      padding-inline: 12px;
      gap: 10px;
    }
    nav {
      gap: 12px;
      font-size: 12px;
    }
    .brand {
      font-size: 16px;
    }
    main {
      padding: 28px 20px 40px;
    }
    .toasts {
      right: 16px;
      bottom: 16px;
      max-width: calc(100% - 32px);
    }
  }
</style>
