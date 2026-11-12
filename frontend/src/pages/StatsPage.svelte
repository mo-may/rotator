<script lang="ts">
  import { tick, untrack } from 'svelte';
  import type {
    Stats,
    StatsEntry,
    StatsPeriod,
    StatsDateRange,
  } from '../../../src/shared/contracts';
  import { isCalendarDate } from '../../../src/shared/stats-range';
  import DataList from '../components/DataList.svelte';
  import EmptyState from '../components/EmptyState.svelte';
  import { formatDate } from '../lib/format';

  let {
    stats,
    timeZone,
    onperiod,
  }: {
    stats: Stats;
    timeZone: string;
    onperiod: (period: StatsPeriod, range?: StatsDateRange) => void;
  } = $props();
  const period = $derived(stats.period ?? 'all');
  let selectedPeriod = $state<StatsPeriod>(untrack(() => stats.period ?? 'all'));
  let startDate = $state(untrack(() => stats.startDate ?? ''));
  let endDate = $state(untrack(() => stats.endDate ?? ''));
  let startInput = $state<HTMLInputElement>();
  let endInput = $state<HTMLInputElement>();
  let rangeError = $state<{ field: 'start' | 'end'; message: string } | null>(null);
  const initialQuery = new URLSearchParams(location.search);
  const initialView = initialQuery.get('view');
  let view = $state<'people' | 'tasks' | 'details'>(
    initialView === 'tasks' || initialView === 'details' ? initialView : 'people',
  );
  let personId = $state(
    untrack(() =>
      stats.participants.some((person) => String(person.id) === initialQuery.get('person'))
        ? initialQuery.get('person')!
        : '',
    ),
  );
  let taskId = $state(
    untrack(() =>
      stats.tasks.some((task) => String(task.id) === initialQuery.get('task'))
        ? initialQuery.get('task')!
        : '',
    ),
  );
  let detailHeading = $state<HTMLHeadingElement>();
  let personFilter = $state<HTMLSelectElement>();
  const ids = $props.id();
  const numbers = new Intl.NumberFormat('de-DE');
  const quantity = (value: number, singular: string, plural: string) =>
    `${numbers.format(value)} ${value === 1 ? singular : plural}`;
  type Summary = {
    id: number;
    name: string;
    status: string;
    selections: number;
    undoneSelections: number;
    assignments: number;
    lastSelectedAt: string | null;
  };

  function summarize(entries: StatsEntry[]) {
    return entries.reduce(
      (total, entry) => ({
        selections: total.selections + entry.selections,
        undoneSelections: total.undoneSelections + entry.undoneSelections,
        assignments: total.assignments + 1,
        lastSelectedAt:
          entry.lastSelectedAt &&
          (!total.lastSelectedAt || entry.lastSelectedAt > total.lastSelectedAt)
            ? entry.lastSelectedAt
            : total.lastSelectedAt,
      }),
      { selections: 0, undoneSelections: 0, assignments: 0, lastSelectedAt: null as string | null },
    );
  }
  const people = $derived(
    stats.participants.map((person) => ({
      id: person.id,
      name: person.name,
      status: person.removed ? 'Entfernt' : '',
      ...summarize(stats.entries.filter((entry) => entry.participantId === person.id)),
    })),
  );
  const tasks = $derived(
    stats.tasks.map((task) => ({
      id: task.id,
      name: task.name,
      status: task.archived ? 'Archiviert' : '',
      ...summarize(stats.entries.filter((entry) => entry.taskId === task.id)),
    })),
  );
  const summaries = $derived(view === 'people' ? people : tasks);
  const peopleById = $derived(new Map(stats.participants.map((person) => [person.id, person])));
  const tasksById = $derived(new Map(stats.tasks.map((task) => [task.id, task])));
  const entries = $derived(
    stats.entries
      .filter(
        (entry) =>
          (!personId || entry.participantId === Number(personId)) &&
          (!taskId || entry.taskId === Number(taskId)),
      )
      .sort(
        (a, b) =>
          peopleById
            .get(a.participantId)!
            .name.localeCompare(peopleById.get(b.participantId)!.name, 'de') ||
          tasksById.get(a.taskId)!.name.localeCompare(tasksById.get(b.taskId)!.name, 'de') ||
          a.id - b.id,
      ),
  );
  const total = $derived(summarize(stats.entries));

  $effect(() => {
    const url = new URL(location.href);
    if (view === 'people') url.searchParams.delete('view');
    else url.searchParams.set('view', view);
    for (const [key, value] of [
      ['person', personId],
      ['task', taskId],
    ]) {
      if (view === 'details' && value) url.searchParams.set(key!, value!);
      else url.searchParams.delete(key!);
    }
    history.replaceState(null, '', url);
  });

  async function drillDown(row: Summary) {
    personId = view === 'people' ? String(row.id) : '';
    taskId = view === 'tasks' ? String(row.id) : '';
    view = 'details';
    await tick();
    detailHeading?.focus();
  }
  function clearFilters() {
    personId = '';
    taskId = '';
    personFilter?.focus();
  }

  async function choosePeriod() {
    rangeError = null;
    if (selectedPeriod === 'custom') {
      await tick();
      startInput?.focus();
    } else onperiod(selectedPeriod);
  }

  function applyRange(event: SubmitEvent) {
    event.preventDefault();
    if (!isCalendarDate(startDate)) {
      rangeError = { field: 'start', message: 'Bitte gib ein gültiges Startdatum an.' };
      startInput?.focus();
    } else if (!isCalendarDate(endDate)) {
      rangeError = { field: 'end', message: 'Bitte gib ein gültiges Enddatum an.' };
      endInput?.focus();
    } else if (startDate > endDate) {
      rangeError = { field: 'end', message: 'Das Enddatum darf nicht vor dem Startdatum liegen.' };
      endInput?.focus();
    } else {
      rangeError = null;
      onperiod('custom', { start: startDate, end: endDate });
    }
  }
</script>

<div class="page-heading">
  <div>
    <h1>Stats</h1>
    <p class="page-description">Wer hat welche Aufgabe wie oft übernommen?</p>
  </div>
  <div class="field period-filter">
    <label for="{ids}-period">Zeitraum</label>
    <select id="{ids}-period" data-stats-period bind:value={selectedPeriod} onchange={choosePeriod}>
      <option value="all">Insgesamt</option>
      <option value="week">Letzte Woche</option>
      <option value="month">Letzter Monat</option>
      <option value="custom">Benutzerdefiniert</option>
    </select>
  </div>
</div>
{#if selectedPeriod === 'custom'}
  <form class="custom-range" novalidate onsubmit={applyRange}>
    <div class="field">
      <label for="{ids}-start">Startdatum</label>
      <input
        bind:this={startInput}
        id="{ids}-start"
        type="date"
        bind:value={startDate}
        min="0001-01-01"
        max="9999-12-31"
        required
        aria-invalid={rangeError?.field === 'start'}
        aria-describedby={rangeError?.field === 'start' ? `${ids}-range-error` : undefined}
        oninput={() => (rangeError = null)}
      />
    </div>
    <div class="field">
      <label for="{ids}-end">Enddatum</label>
      <input
        bind:this={endInput}
        id="{ids}-end"
        type="date"
        bind:value={endDate}
        min={startDate || '0001-01-01'}
        max="9999-12-31"
        required
        aria-invalid={rangeError?.field === 'end'}
        aria-describedby={rangeError?.field === 'end' ? `${ids}-range-error` : undefined}
        oninput={() => (rangeError = null)}
      />
    </div>
    <button class="button secondary" type="submit">Anwenden</button>
    {#if rangeError}<p id="{ids}-range-error" class="range-error" role="alert">
        {rangeError.message}
      </p>{/if}
    <p class="range-hint">
      Das Enddatum wird vollständig eingeschlossen. Änderungen mit „Anwenden“ übernehmen.
    </p>
  </form>
{/if}
<p class="period-caption">
  Aktuell angezeigt:
  {#if stats.from}Von {formatDate(stats.from, timeZone)} bis {formatDate(
      stats.to,
      timeZone,
    )}{:else}Gesamte gespeicherte Historie{/if}
</p>
<p class="totals">
  {quantity(total.selections, 'Übernahme', 'Übernahmen')} · {quantity(
    stats.participants.length,
    'Person',
    'Personen',
  )}
  · {quantity(stats.tasks.length, 'Aufgabe', 'Aufgaben')}
</p>
<p class="explanation">
  Übernahmen und Rücknahmen beziehen sich auf den Auswahlzeitpunkt im gewählten Zeitraum.
  Zurückgenommene Auswahlen zählen nicht als Übernahme. Der aktuelle Auswahlstand enthält auch
  Startwerte und Korrekturen. Archivierte Aufgaben und entfernte Personen sind enthalten.
</p>

<div class="views" aria-label="Statistikansicht">
  <button
    class:active={view === 'people'}
    aria-pressed={view === 'people'}
    onclick={() => (view = 'people')}>Personen</button
  >
  <button
    class:active={view === 'tasks'}
    aria-pressed={view === 'tasks'}
    onclick={() => (view = 'tasks')}>Aufgaben</button
  >
  <button
    class:active={view === 'details'}
    aria-pressed={view === 'details'}
    onclick={() => (view = 'details')}>Details</button
  >
</div>

{#if view !== 'details'}
  {#snippet name(row: Summary)}
    <p class="list-title">{row.name}</p>
    {#if row.status}<p class="list-description">{row.status}</p>{/if}
  {/snippet}
  {#snippet selections(row: Summary)}
    <span class="number">{numbers.format(row.selections)}</span>
    {#if row.undoneSelections}<p class="list-description">
        {numbers.format(row.undoneSelections)} zurückgenommen
      </p>{/if}
  {/snippet}
  {#snippet assignments(row: Summary)}<span class="number">{numbers.format(row.assignments)}</span
    >{/snippet}
  {#snippet last(row: Summary)}
    {#if row.lastSelectedAt}<time datetime={row.lastSelectedAt}
        >{formatDate(row.lastSelectedAt, timeZone)}</time
      >{:else}<span class="muted">{period === 'all' ? 'Noch nie' : 'Keine im Zeitraum'}</span>{/if}
  {/snippet}
  {#snippet details(row: Summary)}
    <button
      class="button quiet small"
      aria-label="{view === 'people' ? 'Aufgaben von' : 'Personen für'} {row.name} anzeigen"
      onclick={() => drillDown(row)}>Details ansehen</button
    >
  {/snippet}
  {#if summaries.length}
    <DataList
      label={view === 'people' ? 'Stats nach Personen' : 'Stats nach Aufgaben'}
      items={summaries}
      columns={[
        { label: view === 'people' ? 'Person' : 'Aufgabe', content: name },
        { label: 'Übernahmen', content: selections },
        {
          label: view === 'people' ? 'Zugeordnete Aufgaben' : 'Zugeordnete Personen',
          content: assignments,
        },
        { label: 'Zuletzt übernommen', content: last },
        { label: 'Details', content: details },
      ]}
    />
  {:else}
    <EmptyState
      title="Noch keine Daten für diese Ansicht."
      description="Lege Personen und Aufgaben an und ordne sie einander zu."
    />
    <a class="button secondary" href={view === 'people' ? '/team' : '/'} data-route
      >{view === 'people' ? 'Team verwalten' : 'Aufgaben öffnen'}</a
    >
  {/if}
{:else}
  <h2 bind:this={detailHeading} tabindex="-1" class="detail-heading">Übernahmen im Detail</h2>
  <div class="filters">
    <div class="field">
      <label for="{ids}-person">Person</label>
      <select bind:this={personFilter} id="{ids}-person" bind:value={personId}>
        <option value="">Alle Personen</option>
        {#each stats.participants as person (person.id)}<option value={String(person.id)}
            >{person.name}{person.removed ? ' (entfernt)' : ''}</option
          >{/each}
      </select>
    </div>
    <div class="field">
      <label for="{ids}-task">Aufgabe</label>
      <select id="{ids}-task" bind:value={taskId}>
        <option value="">Alle Aufgaben</option>
        {#each stats.tasks as task (task.id)}<option value={String(task.id)}
            >{task.name}{task.archived ? ' (archiviert)' : ''}</option
          >{/each}
      </select>
    </div>
    {#if personId || taskId}<button class="button quiet small" onclick={clearFilters}
        >Filter zurücksetzen</button
      >{/if}
  </div>
  <p class="result-count" role="status">
    {quantity(entries.length, 'Zuordnung', 'Zuordnungen')} · {quantity(
      summarize(entries).selections,
      'Übernahme',
      'Übernahmen',
    )}
  </p>
  {#snippet person(entry: StatsEntry)}
    <p class="list-title">{peopleById.get(entry.participantId)!.name}</p>
    {#if peopleById.get(entry.participantId)!.removed}<p class="list-description">
        Entfernt
      </p>{:else if !entry.active}<p class="list-description">Für diese Aufgabe inaktiv</p>{/if}
  {/snippet}
  {#snippet task(entry: StatsEntry)}
    <a class="task-link" href="/tasks/{entry.taskId}" data-route
      >{tasksById.get(entry.taskId)!.name}</a
    >
    {#if tasksById.get(entry.taskId)!.archived}<p class="list-description">Archiviert</p>{/if}
  {/snippet}
  {#snippet selections(entry: StatsEntry)}
    <span class="number">{numbers.format(entry.selections)}</span>
    {#if entry.undoneSelections}<p class="list-description">
        {numbers.format(entry.undoneSelections)} zurückgenommen
      </p>{/if}
  {/snippet}
  {#snippet count(entry: StatsEntry)}<span class="number">{numbers.format(entry.count)}</span
    >{/snippet}
  {#snippet last(entry: StatsEntry)}
    {#if entry.lastSelectedAt}<time datetime={entry.lastSelectedAt}
        >{formatDate(entry.lastSelectedAt, timeZone)}</time
      >{:else}<span class="muted">{period === 'all' ? 'Noch nie' : 'Keine im Zeitraum'}</span>{/if}
  {/snippet}
  {#if entries.length}
    <DataList
      label="Übernahmen nach Person und Aufgabe"
      items={entries}
      columns={[
        { label: 'Person', content: person },
        { label: 'Aufgabe', content: task },
        { label: 'Übernahmen', content: selections },
        { label: 'Auswahlstand aktuell', content: count },
        { label: 'Zuletzt übernommen', content: last },
      ]}
    />
  {:else}
    <EmptyState
      title="Keine Zuordnungen gefunden."
      description="Für diese Auswahl ist keine Person der Aufgabe zugeordnet."
    />
  {/if}
{/if}

<style>
  .custom-range {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-end;
    gap: 12px;
    max-width: 720px;
    margin-bottom: 20px;
  }
  .custom-range .field {
    flex: 1;
    min-width: min(200px, 100%);
    max-width: 100%;
    margin-bottom: 0;
  }
  .range-hint,
  .range-error {
    width: 100%;
    font-size: 12px;
  }
  .range-hint {
    color: var(--muted);
  }
  .range-error {
    color: var(--danger);
  }
  .period-filter {
    width: 240px;
    max-width: 100%;
    margin-bottom: 0;
  }
  .period-caption {
    margin-bottom: 10px;
    color: var(--muted);
    font-size: 12px;
  }
  .totals {
    font-size: 14px;
  }
  .explanation {
    max-width: 850px;
    margin-top: 12px;
    color: var(--muted);
    font-size: 12px;
  }
  .views {
    display: flex;
    gap: 24px;
    margin: 28px 0 16px;
    border-bottom: 1px solid var(--line);
  }
  .views button {
    padding: 12px 0;
    border: 0;
    border-bottom: 2px solid transparent;
    background: transparent;
    color: var(--muted);
    font-size: 13px;
  }
  .views button.active {
    color: var(--ink);
    border-bottom-color: var(--primary);
  }
  .views button:hover {
    color: var(--ink);
  }
  .views button:active {
    background: var(--tint);
  }
  .detail-heading {
    margin: 24px 0 20px;
    font-size: 18px;
  }
  .filters {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 16px;
  }
  .filters .field {
    flex: 1;
    min-width: min(220px, 100%);
    max-width: 100%;
  }
  .result-count {
    margin-bottom: 12px;
    color: var(--muted);
    font-size: 12px;
  }
  .number {
    font-variant-numeric: tabular-nums;
  }
  time {
    font-size: 12px;
    color: var(--muted);
  }
  .task-link {
    text-decoration: underline;
    text-underline-offset: 3px;
  }
  .task-link:hover {
    color: var(--accent-text);
  }
  @media (max-width: 650px) {
    .period-filter {
      width: 100%;
    }
    .button.small {
      padding-inline: 0;
    }
  }
</style>
