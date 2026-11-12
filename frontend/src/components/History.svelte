<script lang="ts">
  import type { AuditEvent, Draw, TaskDetail } from '../../../src/shared/contracts';
  import { formatDate } from '../lib/format';
  import DataList from './DataList.svelte';

  let {
    task,
    timeZone,
    busy,
    onundo,
  }: { task: TaskDetail; timeZone: string; busy: boolean; onundo: (draw: Draw) => void } = $props();
  let tab = $state<'draws' | 'events'>('draws');
  let showAll = $state(false);
  const draws = $derived(showAll ? task.history : task.history.slice(0, 6));
  const events = $derived(showAll ? task.events : task.events.slice(0, 8));
</script>

<details class="history">
  <summary>Auswahlverlauf &amp; Änderungsprotokoll</summary>
  <div class="history-content">
    <div class="tabs" aria-label="Historienansicht">
      <button
        class:active={tab === 'draws'}
        aria-pressed={tab === 'draws'}
        onclick={() => {
          tab = 'draws';
          showAll = false;
        }}>Auswahlverlauf</button
      >
      <button
        class:active={tab === 'events'}
        aria-pressed={tab === 'events'}
        onclick={() => {
          tab = 'events';
          showAll = false;
        }}>Änderungsprotokoll</button
      >
    </div>

    {#if tab === 'draws'}
      {#if task.canUndo && task.currentDraw && !task.archived}
        <div class="undo">
          <button
            class="button quiet small"
            disabled={busy}
            onclick={() => onundo(task.currentDraw!)}>↶ Letzte Auswahl zurücknehmen</button
          >
        </div>
      {/if}
      {#if draws.length}
        {#snippet person(draw: Draw)}
          <p class="list-title">{draw.name}</p>
          <p class="list-description">
            {draw.method === 'manual'
              ? `Manuelle Übernahme${draw.undoneAt ? ' · Zurückgenommen' : ''}`
              : draw.undoneAt
                ? 'Zurückgenommen'
                : draw.method === 'random'
                  ? `Zufallsauswahl aus ${draw.candidates.length} Personen`
                  : 'Einzige Person mit niedrigstem Auswahlstand'}
          </p>
        {/snippet}
        {#snippet count(draw: Draw)}
          <span class="counter">{draw.countBefore} → {draw.countAfter}</span>
        {/snippet}
        {#snippet selectedAt(draw: Draw)}
          <time datetime={draw.createdAt}>{formatDate(draw.createdAt, timeZone, true)}</time>
        {/snippet}
        <DataList
          label="Auswahlverlauf"
          items={draws}
          columns={[
            { label: 'Person', content: person },
            { label: 'Auswahlstand', content: count },
            { label: 'Zeitpunkt', content: selectedAt },
          ]}
          muted={(draw) => draw.undoneAt !== null}
        />
      {:else}
        <p class="empty-history">Noch keine Auswahl gespeichert.</p>
      {/if}
      {#if task.history.length > 6 && !showAll}<button
          class="button quiet small"
          onclick={() => (showAll = true)}
          >Alle {task.history.length} geladenen Auswahlen anzeigen ↓</button
        >{/if}
      {#if showAll && task.history.length >= 50}<p class="caption">
          Angezeigt werden die letzten 50 Auswahlen.
        </p>{/if}
    {:else}
      {#if events.length}
        {#snippet description(event: AuditEvent)}
          <p class="list-title">{event.description}</p>
        {/snippet}
        {#snippet changedAt(event: AuditEvent)}
          <time datetime={event.createdAt}>{formatDate(event.createdAt, timeZone, true)}</time>
        {/snippet}
        <DataList
          label="Änderungsprotokoll"
          items={events}
          columns={[
            { label: 'Änderung', content: description },
            { label: 'Zeitpunkt', content: changedAt },
          ]}
        />
      {:else}
        <p class="empty-history">Noch keine Änderungen protokolliert.</p>
      {/if}
      {#if task.events.length > 8 && !showAll}<button
          class="button quiet small"
          onclick={() => (showAll = true)}
          >Alle {task.events.length} geladenen Änderungen anzeigen ↓</button
        >{/if}
      {#if showAll && task.events.length >= 50}<p class="caption">
          Angezeigt werden die letzten 50 Änderungen.
        </p>{/if}
    {/if}
  </div>
</details>

<style>
  .history {
    padding: 0;
    color: var(--ink);
    margin-top: 32px;
  }
  .history > summary {
    padding: 14px 0;
    border-bottom: 1px solid var(--line);
    font-size: 14px;
  }
  .history-content {
    padding-top: 8px;
  }
  .tabs {
    display: flex;
    gap: 25px;
    border-bottom: 1px solid var(--line);
  }
  .tabs button {
    padding: 13px 0;
    border: 0;
    border-bottom: 2px solid transparent;
    background: transparent;
    color: var(--muted);
    font-size: 13px;
  }
  .tabs button:hover {
    color: var(--ink);
  }
  .tabs button:active {
    background: var(--surface-muted);
  }
  .tabs button.active {
    border-bottom-color: var(--primary);
    color: var(--ink);
    font-weight: 650;
  }
  .undo {
    display: flex;
    justify-content: flex-end;
    padding: 12px 0 3px;
  }
  .counter {
    font-variant-numeric: tabular-nums;
  }
  time {
    color: var(--muted);
    font-size: 13px;
  }
  .caption {
    margin-top: 12px;
  }
  .empty-history {
    padding: 26px 0;
    color: var(--muted);
    font-size: 14px;
  }
  @media (max-width: 600px) {
    .tabs {
      flex-wrap: wrap;
      gap: 8px 20px;
    }
    .tabs button {
      font-size: 13px;
    }
  }
</style>
