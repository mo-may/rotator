<script lang="ts">
  import type { Draw, TaskDetail } from '../../../src/shared/contracts';
  import { formatDate } from '../lib/format';

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

<section class="history">
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
        <button class="button quiet small" disabled={busy} onclick={() => onundo(task.currentDraw!)}
          >↶ Letzte Auswahl zurücknehmen</button
        >
      </div>
    {/if}
    {#each draws as draw (draw.id)}
      <div class="history-row" class:undone={draw.undoneAt !== null}>
        <span class="history-icon" aria-hidden="true">{draw.undoneAt ? '↶' : '✳'}</span>
        <div class="copy">
          <p class="name">{draw.name}</p>
          <p class="caption">
            {draw.undoneAt
              ? 'Zurückgenommen'
              : draw.method === 'random'
                ? `Zufallsauswahl aus ${draw.candidates.length} Personen`
                : 'Einzige Person mit niedrigstem Auswahlstand'}
          </p>
        </div>
        <span class="counter">{draw.countBefore} → {draw.countAfter}</span>
        <time datetime={draw.createdAt}>{formatDate(draw.createdAt, timeZone, true)}</time>
      </div>
    {:else}
      <p class="empty-history">Noch keine Auswahl. Eure erste Runde schreibt Geschichte.</p>
    {/each}
    {#if task.history.length > 6 && !showAll}<button
        class="button quiet small"
        onclick={() => (showAll = true)}
        >Alle {task.history.length} geladenen Auswahlen anzeigen ↓</button
      >{/if}
    {#if showAll && task.history.length >= 50}<p class="caption">
        Angezeigt werden die letzten 50 Auswahlen.
      </p>{/if}
  {:else}
    {#each events as event (event.id)}
      <div class="history-row">
        <span class="history-icon" aria-hidden="true">↻</span>
        <p class="event-copy">{event.description}</p>
        <time datetime={event.createdAt}>{formatDate(event.createdAt, timeZone, true)}</time>
      </div>
    {:else}
      <p class="empty-history">Noch keine Änderungen protokolliert.</p>
    {/each}
    {#if task.events.length > 8 && !showAll}<button
        class="button quiet small"
        onclick={() => (showAll = true)}
        >Alle {task.events.length} geladenen Änderungen anzeigen ↓</button
      >{/if}
  {/if}
</section>

<style>
  .history {
    padding: 18px 24px;
    border: 1px solid var(--line);
    border-radius: var(--radius);
    background: var(--surface);
    color: var(--ink);
    margin-top: 32px;
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
    font-size: 15px;
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
  .history-row {
    display: flex;
    align-items: center;
    gap: 13px;
    padding: 18px 0;
    border-bottom: 1px solid var(--line);
  }
  .history-row.undone {
    color: var(--muted);
  }
  .history-icon {
    display: grid;
    width: 35px;
    height: 35px;
    flex: none;
    place-items: center;
    border-radius: var(--radius);
    background: var(--tint);
    font-size: 18px;
  }
  .copy,
  .event-copy {
    flex: 1;
    min-width: 0;
    overflow-wrap: anywhere;
  }
  .name {
    font-size: 15px;
    font-weight: 650;
  }
  .caption {
    margin-top: 4px;
  }
  .event-copy {
    font-size: 14px;
  }
  .counter {
    color: var(--muted);
    font-size: 14px;
    white-space: nowrap;
  }
  time {
    color: var(--muted);
    font-size: 13px;
    text-align: right;
    white-space: nowrap;
  }
  .empty-history {
    padding: 26px 0;
    color: var(--muted);
    font-size: 14px;
  }
  @media (max-width: 600px) {
    .tabs {
      gap: 20px;
    }
    .tabs button {
      font-size: 14px;
    }
    .history-row {
      flex-wrap: wrap;
      gap: 10px;
    }
    .history-icon {
      display: none;
    }
    .copy {
      flex-basis: calc(100% - 65px);
    }
    time {
      font-size: 12px;
    }
    .event-copy {
      flex-basis: 100%;
    }
  }
</style>
