<script lang="ts">
  import type { Draw, Member, TaskDetail } from '../../../src/shared/contracts';
  import type { Editor } from '../lib/editor';
  import { formatDate, formatDay } from '../lib/format';
  import MemberTable from '../components/MemberTable.svelte';
  import History from '../components/History.svelte';

  let {
    task,
    timeZone,
    busy,
    pending,
    quick = $bindable(false),
    sound = $bindable(false),
    ondraw,
    onretry,
    onedit,
    ontoggle,
    onpreferences,
  }: {
    task: TaskDetail;
    timeZone: string;
    busy: boolean;
    pending: boolean;
    quick: boolean;
    sound: boolean;
    ondraw: () => void;
    onretry: () => void;
    onedit: (editor: Editor) => void;
    ontoggle: (member: Member) => void;
    onpreferences: (quick: boolean, sound: boolean) => void;
  } = $props();

  const currentInactive = $derived(
    task.currentDraw &&
      task.members.some(
        (member) =>
          member.id === task.currentDraw!.membershipId && (!member.active || member.absent),
      ),
  );
  const probability = $derived(
    new Intl.NumberFormat('de-DE', { maximumFractionDigits: 1 }).format(
      100 / task.candidates.length,
    ),
  );
</script>

<nav class="breadcrumbs" aria-label="Brotkrumennavigation">
  <a href="/" data-route>Aufgaben</a><span aria-hidden="true">/</span><span>{task.name}</span>
</nav>
<div class="page-heading">
  <div>
    <h1>{task.name}</h1>
    {#if task.description}<p class="page-description">{task.description}</p>{/if}
    {#if task.schedule}<p class="page-description">
        {task.schedule.frequency === 'weekly' ? 'Wöchentlich' : 'Monatlich'}{task.dueDate
          ? ` · ${task.due ? 'Fällig' : 'Nächster Termin'} am ${formatDay(task.dueDate)}`
          : ' · Keine weiteren Termine'}
      </p>{/if}
  </div>
  <div class="heading-actions">
    <button
      class="button quiet"
      disabled={busy || pending}
      onclick={() => onedit({ kind: 'duplicate', task })}>Duplizieren</button
    >
    <button class="button secondary" disabled={busy} onclick={() => onedit({ kind: 'task', task })}
      >Aufgabe bearbeiten</button
    >
    <button class="button quiet" disabled={busy} onclick={() => onedit({ kind: 'archive', task })}
      >{task.archived ? 'Wieder öffnen' : 'Archivieren'}</button
    >
  </div>
</div>

{#if task.archived}<div class="notice">
    <p>Diese Aufgabe ist archiviert. Auswahlstände und Historie bleiben erhalten.</p>
    <button class="button secondary small" onclick={() => onedit({ kind: 'archive', task })}
      >Wieder öffnen</button
    >
  </div>{/if}

<div class="workspace">
  <div>
    <section class="winner-panel" aria-label="Auswahl für diese Aufgabe">
      <section
        class="winner-top"
        class:has-winner={task.currentDraw !== null}
        aria-label="Aktuell ausgewählte Person"
      >
        <p class="eyebrow">Aktuell ausgewählt</p>
        {#if task.currentDraw}
          <div class="winner-content">
            <div>
              <p class="winner-name" data-testid="current-winner">{task.currentDraw.name}</p>
              <p class="winner-meta">
                Ausgewählt am {formatDate(task.currentDraw.createdAt, timeZone)}{currentInactive
                  ? ' · derzeit inaktiv oder abwesend'
                  : ''}
              </p>
            </div>
          </div>
        {:else}
          <p class="winner-empty">Noch niemand ausgewählt.</p>
        {/if}
      </section>
      <div class="winner-body">
        {#if !task.members.length}
          <p>
            Füge zuerst Teilnehmer hinzu. Neue Personen starten beim niedrigsten aktiven
            Auswahlstand.
          </p>
        {:else if !task.candidates.length}
          <p>
            Niemand ist derzeit verfügbar. Prüfe Aktivstatus und geplante Abwesenheiten im Team.
          </p>
        {:else}
          <p class="candidate-summary">
            Im Lostopf: <span>{task.candidates.map((member) => member.name).join(', ')}</span>
          </p>
          <details class="selection-rule">
            <summary>Wie wird ausgewählt?</summary>
            <p>
              Aktive Personen mit dem niedrigsten Auswahlstand ({task.candidates[0]!.count}) sind im
              Lostopf. {task.candidates.length === 1
                ? 'Die nächste Auswahl steht fest.'
                : 'Bei Gleichstand entscheidet das Los.'} Wer ausgewählt wird, erhält einen Punkt.
            </p>
            <p>
              {task.candidates.length}
              {task.candidates.length === 1 ? 'Person' : 'Personen'} · jeweils {probability} % Chance
            </p>
          </details>
        {/if}
        <button
          class="button primary draw-button"
          disabled={busy || task.archived || !task.candidates.length || pending}
          onclick={ondraw}
          >{busy ? 'Auswahl wird gespeichert …' : 'Nächste Person auswählen'}<span
            class="arrow"
            aria-hidden="true">→</span
          ></button
        >
        <button
          class="button quiet manual-button"
          disabled={busy || task.archived || !task.activeCount || pending}
          onclick={() => onedit({ kind: 'manual', task })}>Manuell übernehmen</button
        >
        <details class="animation-options">
          <summary>Animationsoptionen</summary>
          <div class="chooser-settings">
            <label
              >Tempo <select
                aria-label="Tempo"
                value={quick ? 'quick' : 'show'}
                onchange={(event) => {
                  quick = event.currentTarget.value === 'quick';
                  onpreferences(quick, sound);
                }}
                ><option value="show">Show · 12 Sekunden</option><option value="quick"
                  >Schnell · 1 Sekunde</option
                ></select
              ></label
            >
            <label
              ><input
                type="checkbox"
                checked={sound}
                onchange={(event) => {
                  sound = event.currentTarget.checked;
                  onpreferences(quick, sound);
                }}
              /> Sound</label
            >
          </div>
        </details>
        {#if pending}<div class="notice error pending">
            <p>
              Die Antwort ist nicht angekommen. Prüfe dieselbe Auswahl erneut – es wird nicht
              doppelt gezählt.
            </p>
            <button class="button secondary" disabled={busy} onclick={onretry}
              >Auswahl prüfen</button
            >
          </div>{/if}
      </div>
    </section>

    <MemberTable
      {task}
      {busy}
      onadd={() => onedit({ kind: 'member', task })}
      {ontoggle}
      oncorrect={(member) => onedit({ kind: 'correction', task, member })}
    />
    <History
      {task}
      {timeZone}
      {busy}
      onundo={(draw: Draw) => onedit({ kind: 'undo', task, draw })}
    />
  </div>
</div>

<style>
  .breadcrumbs {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
    margin-bottom: 22px;
    color: var(--muted);
    font-size: 12px;
    overflow-wrap: anywhere;
  }
  .breadcrumbs a:hover {
    color: var(--accent-text);
    text-decoration: underline;
  }
  .winner-panel {
    display: grid;
    grid-template-columns: minmax(0, 1.3fr) minmax(0, 1fr);
    align-items: start;
    gap: 32px;
    padding: 28px 0;
    border-top: 1px solid var(--line);
    border-bottom: 1px solid var(--line);
  }
  .winner-top {
    min-width: 0;
    padding: 24px;
    border-left: 3px solid var(--line);
    border-radius: var(--radius);
  }
  .winner-top.has-winner {
    border-left-color: var(--primary);
    background: var(--tint);
  }
  .winner-top .eyebrow {
    color: var(--accent-text);
    text-transform: none;
    letter-spacing: 0;
  }
  .winner-content {
    margin-top: 12px;
  }
  .winner-name {
    font-size: clamp(32px, 4vw, 52px);
    font-weight: 700;
    line-height: 1.15;
    overflow-wrap: anywhere;
  }
  .winner-meta {
    margin-top: 8px;
    color: var(--muted);
    font-size: 12px;
  }
  .winner-empty {
    margin-top: 12px;
    font-size: 18px;
  }
  .winner-body {
    min-width: 0;
  }
  .winner-body > p {
    color: var(--muted);
    font-size: 13px;
  }
  .candidate-summary span {
    color: var(--ink);
    overflow-wrap: anywhere;
  }
  .selection-rule,
  .animation-options {
    margin-top: 12px;
    color: var(--muted);
    font-size: 12px;
  }
  .selection-rule p {
    margin-top: 10px;
  }
  .draw-button {
    margin-top: 20px;
    min-height: 48px;
    max-width: 100%;
  }
  .arrow {
    margin-left: 8px;
  }
  .manual-button {
    margin-top: 8px;
  }
  .chooser-settings {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 16px;
    margin-top: 14px;
  }
  .chooser-settings label {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .chooser-settings select {
    max-width: 190px;
    padding: 7px;
    border: 1px solid var(--control-line);
    border-radius: var(--radius);
    background: var(--surface);
    color: var(--ink);
    font-size: 12px;
  }
  .pending {
    margin: 20px 0 0;
  }
  @media (max-width: 650px) {
    .winner-panel {
      grid-template-columns: minmax(0, 1fr);
      gap: 24px;
      padding: 24px 0;
    }
    .draw-button {
      width: 100%;
    }
  }
</style>
