<script lang="ts">
  import type { AppState } from '../../../src/shared/contracts';
  import Avatar from '../components/Avatar.svelte';
  import EmptyState from '../components/EmptyState.svelte';

  let { appState, oncreate }: { appState: AppState; oncreate: () => void } = $props();
  let showArchived = $state(false);
  const activeTasks = $derived(appState.tasks.filter((task) => !task.archived));
  const visibleTasks = $derived(appState.tasks.filter((task) => showArchived || !task.archived));
</script>

<section class="overview-heading">
  <div>
    <p class="eyebrow">Teamaufgaben</p>
    <h1>Wer übernimmt?</h1>
    <p class="intro">Aufgaben verwalten. Die nächste Person fair bestimmen.</p>
  </div>
  <dl class="summary">
    <div>
      <dt>Aktive Aufgaben</dt>
      <dd>{activeTasks.length}</dd>
    </div>
    <div>
      <dt>Personen im Team</dt>
      <dd>{appState.participants.length}</dd>
    </div>
  </dl>
</section>

<div class="section-heading">
  <h2>Eure Aufgaben <span class="count-chip">{activeTasks.length}</span></h2>
  <div class="list-actions">
    <label><input type="checkbox" bind:checked={showArchived} /> Archivierte anzeigen</label>
    <button class="button primary" onclick={oncreate}>+ Neue Aufgabe</button>
  </div>
</div>

{#if visibleTasks.length}
  <div class="task-grid">
    {#each visibleTasks as task (task.id)}
      <article class:archived={task.archived}>
        <div class="card-top">
          <h3><a href="/tasks/{task.id}" data-route>{task.name}</a></h3>
          <span class="badge" class:neutral={task.archived}
            >{task.archived ? 'Archiviert' : 'Aktiv'}</span
          >
        </div>
        {#if task.description}<p class="task-description">{task.description}</p>{/if}
        <div class="current">
          <Avatar name={task.currentDraw?.name || '—'} />
          <div>
            <p class="caption">Aktuell dran</p>
            <p class="current-name">{task.currentDraw?.name || 'Noch niemand ausgewählt'}</p>
          </div>
        </div>
        <div class="card-bottom">
          <span>{task.activeCount} von {task.memberCount} aktiv</span>
          <a href="/tasks/{task.id}" data-route>Aufgabe öffnen →</a>
        </div>
      </article>
    {/each}
  </div>
{:else}
  <EmptyState
    title={showArchived ? 'Keine Aufgaben vorhanden.' : 'Noch keine aktiven Aufgaben.'}
    description="Lege eine Aufgabe an und ordne die Personen zu, die sie übernehmen können."
    actionLabel="+ Erste Aufgabe anlegen"
    onaction={oncreate}
  />
{/if}

<style>
  .overview-heading {
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    gap: 40px;
    padding: 0 0 36px;
    border-bottom: 1px solid var(--dark-line);
  }
  .eyebrow {
    color: var(--on-dark-muted);
  }
  h1 {
    margin: 15px 0 12px;
    font-size: clamp(40px, 4.5vw, 58px);
    font-weight: 600;
    letter-spacing: -0.04em;
  }
  .intro {
    color: var(--on-dark-muted);
    font-size: 16px;
  }
  .summary {
    display: flex;
    flex: none;
    gap: 35px;
    margin: 0 0 4px;
  }
  .summary div {
    padding-left: 24px;
    border-left: 1px solid var(--dark-line);
  }
  .summary dt {
    color: var(--on-dark-muted);
    font-size: 13px;
  }
  .summary dd {
    margin: 5px 0 0;
    color: var(--petal);
    font: 26px var(--font-mono);
  }
  .list-actions {
    display: flex;
    align-items: center;
    gap: 22px;
  }
  .list-actions label {
    display: flex;
    align-items: center;
    gap: 7px;
    color: var(--on-dark-muted);
    font-size: 13px;
  }
  input {
    accent-color: var(--petal);
  }
  .task-grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 20px;
  }
  article {
    display: flex;
    min-height: 258px;
    flex-direction: column;
    padding: 24px;
    border: 1px solid var(--line);
    border-top: 3px solid var(--lavender);
    border-radius: var(--radius);
    background: var(--surface);
    color: var(--ink);
  }
  article.archived {
    border-top-color: var(--control-line);
    background: var(--surface-muted);
  }
  .card-top {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 16px;
  }
  h3 {
    font-size: 24px;
    font-weight: 600;
    overflow-wrap: anywhere;
  }
  h3 a:hover,
  .card-bottom a:hover {
    color: var(--primary);
    text-decoration: underline;
    text-underline-offset: 4px;
  }
  .task-description {
    display: -webkit-box;
    margin-top: 12px;
    overflow: hidden;
    color: var(--muted);
    font-size: 14px;
    line-clamp: 2;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
  }
  .current {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-top: auto;
    padding: 24px 0;
  }
  .current-name {
    font-size: 16px;
    font-weight: 650;
    overflow-wrap: anywhere;
  }
  .card-bottom {
    display: flex;
    justify-content: space-between;
    gap: 12px;
    padding-top: 17px;
    border-top: 1px solid var(--line);
    color: var(--muted);
    font-size: 13px;
  }
  .card-bottom a {
    color: var(--primary-hover);
    font-weight: 650;
  }
  @media (max-width: 1050px) {
    .task-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
    .summary {
      gap: 22px;
    }
    .summary div {
      padding-left: 18px;
    }
  }
  @media (max-width: 750px) {
    .overview-heading {
      align-items: flex-start;
      flex-direction: column;
      gap: 25px;
    }
    .summary {
      gap: 32px;
    }
    .summary div {
      padding-left: 0;
      border: 0;
    }
    .summary dd {
      font-size: 22px;
    }
    .list-actions {
      align-items: flex-end;
      flex-direction: column-reverse;
      gap: 10px;
    }
  }
  @media (max-width: 600px) {
    .task-grid {
      grid-template-columns: 1fr;
    }
    .list-actions .button {
      font-size: 13px;
    }
    .card-top {
      gap: 12px;
    }
    h1 {
      font-size: 40px;
    }
  }
</style>
