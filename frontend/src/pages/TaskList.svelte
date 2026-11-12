<script lang="ts">
  import type { AppState, TaskSummary } from '../../../src/shared/contracts';
  import DataList from '../components/DataList.svelte';
  import EmptyState from '../components/EmptyState.svelte';
  import { formatDay } from '../lib/format';

  let { appState, oncreate }: { appState: AppState; oncreate: () => void } = $props();
  let showArchived = $state(false);
  const activeTasks = $derived(appState.tasks.filter((task) => !task.archived));
  const visibleTasks = $derived(appState.tasks.filter((task) => showArchived || !task.archived));
</script>

<div class="page-heading">
  <div>
    <h1>Aufgaben <span class="heading-count">{activeTasks.length}</span></h1>
    <p class="page-description">Wer übernimmt als Nächstes?</p>
  </div>
  <button class="button primary" onclick={oncreate}>+ Neue Aufgabe</button>
</div>

<div class="list-toolbar">
  <label><input type="checkbox" bind:checked={showArchived} /> Archivierte anzeigen</label>
  <a href="/team" data-route>{appState.participants.length} Personen im Team →</a>
</div>

{#if visibleTasks.length}
  {#snippet taskName(task: TaskSummary)}
    <h2 class="list-title">{task.name} <span class="row-arrow" aria-hidden="true">→</span></h2>
    {#if task.archived}<p class="list-description">Archiviert</p>{/if}
    {#if task.description}<p class="list-description">{task.description}</p>{/if}
    {#if task.dueDate}<p class:list-note={task.due} class:list-description={!task.due}>
        {task.due ? 'Fällig' : 'Nächster Termin'} · {formatDay(task.dueDate)}
      </p>{/if}
  {/snippet}
  {#snippet currentPerson(task: TaskSummary)}
    <span class:unassigned={!task.currentDraw}>{task.currentDraw?.name || 'Noch niemand'}</span>
  {/snippet}
  {#snippet members(task: TaskSummary)}
    <span class="members">{task.activeCount} von {task.memberCount} verfügbar</span>
  {/snippet}
  <DataList
    label="Aufgaben"
    items={visibleTasks}
    columns={[
      { label: 'Aufgabe', content: taskName },
      { label: 'Aktuell dran', content: currentPerson },
      { label: 'Teilnehmer', content: members },
    ]}
    href={(task) => '/tasks/' + task.id}
  />
{:else}
  <EmptyState
    title={showArchived ? 'Keine Aufgaben vorhanden.' : 'Noch keine aktiven Aufgaben.'}
    description="Lege eine Aufgabe an und ordne die Personen zu, die sie übernehmen können."
    actionLabel="+ Erste Aufgabe anlegen"
    onaction={oncreate}
  />
{/if}

<style>
  .list-toolbar {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    margin-bottom: 20px;
    color: var(--muted);
    font-size: 12px;
  }
  label {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .list-toolbar a:hover {
    color: var(--accent-text);
    text-decoration: underline;
  }
  .unassigned,
  .members {
    color: var(--muted);
    font-size: 12px;
  }
  .row-arrow {
    margin-left: 8px;
    color: var(--accent-text);
  }
</style>
