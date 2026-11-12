<script lang="ts">
  import type { Draw, Member, TaskDetail } from '../../../src/shared/contracts';
  import type { Editor } from '../lib/editor';
  import { formatDate } from '../lib/format';
  import Avatar from '../components/Avatar.svelte';
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
      task.members.some((member) => member.id === task.currentDraw!.membershipId && !member.active),
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
    <p class="page-description">
      {task.description || 'Teilnehmer verwalten und die nächste Person bestimmen.'}
    </p>
  </div>
  <div class="heading-actions">
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
      <div class="winner-top">
        <p class="eyebrow">Aktuell dran</p>
        {#if task.currentDraw}
          <div class="winner-content">
            <Avatar name={task.currentDraw.name} large />
            <div>
              <p class="winner-name" data-testid="current-winner">{task.currentDraw.name}</p>
              <p class="winner-meta">
                Ausgewählt am {formatDate(task.currentDraw.createdAt, timeZone)}{currentInactive
                  ? ' · derzeit inaktiv'
                  : ''}
              </p>
            </div>
          </div>
        {:else}
          <p class="winner-empty">Noch niemand ausgewählt.</p>
          <p class="winner-meta">Starte die erste Auswahl, sobald Teilnehmer zugeordnet sind.</p>
        {/if}
      </div>
      <div class="winner-body">
        {#if !task.members.length}
          <p>
            Füge zuerst Teilnehmer hinzu. Neue Personen starten beim niedrigsten aktiven
            Auswahlstand.
          </p>
        {:else if !task.candidates.length}
          <p>
            Alle Teilnehmer sind inaktiv. Aktiviere mindestens eine Person für die nächste Auswahl.
          </p>
        {:else}
          <p>
            <strong
              >{task.candidates.length === 1
                ? '1 Person hat'
                : `${task.candidates.length} Personen haben`} den niedrigsten Auswahlstand: {task
                .candidates[0]!.count}.</strong
            >
            {task.candidates.length === 1
              ? 'Die nächste Auswahl steht fest.'
              : 'Zwischen ihnen entscheidet das Los.'}
          </p>
          <div class="candidate-chips">
            {#each task.candidates as member (member.id)}<span
                >{member.name}<small>{probability} %</small></span
              >{/each}
          </div>
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
        <div class="chooser-settings">
          <label
            >Tempo <select
              value={quick ? 'quick' : 'show'}
              onchange={(event) => {
                quick = event.currentTarget.value === 'quick';
                onpreferences(quick, sound);
              }}
              ><option value="show">Show · 6 Sekunden</option><option value="quick"
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
  <aside>
    <div class="fairness-card">
      <p class="eyebrow">Auswahlregel</p>
      <h2>Der niedrigste Stand zählt.</h2>
      <p>Aktive Personen mit gleichem Mindeststand haben dieselbe Chance.</p>
      <ol>
        <li>Aktive Personen mit dem niedrigsten Auswahlstand sind dran.</li>
        <li>Bei Gleichstand entscheidet der Zufall. Alle haben dieselbe Chance.</li>
        <li>Wer gewählt wird, bekommt einen Punkt dazu.</li>
      </ol>
    </div>
    <dl>
      <div>
        <dt>Teilnehmer</dt>
        <dd>{task.memberCount}</dd>
      </div>
      <div>
        <dt>Davon aktiv</dt>
        <dd>{task.activeCount}</dd>
      </div>
    </dl>
  </aside>
</div>

<style>
  .breadcrumbs {
    --muted: var(--on-dark-muted);
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
    margin-bottom: 24px;
    color: var(--muted);
    font-size: 13px;
  }
  .breadcrumbs a:hover {
    color: var(--primary);
  }
  .workspace {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 300px;
    gap: 25px;
    align-items: start;
  }
  .winner-panel {
    color: var(--ink);
    overflow: hidden;
    border: 1px solid var(--line);
    border-radius: var(--radius);
    background: var(--surface);
  }
  .winner-top {
    color: var(--on-dark);
    position: relative;
    min-height: 190px;
    padding: 27px 29px;
    background: var(--charcoal);
  }
  .winner-top::after {
    content: '';
    position: absolute;
    top: -55px;
    right: -55px;
    width: 240px;
    height: 240px;
    border: 1px solid color-mix(in srgb, var(--petal) 35%, transparent);
    border-radius: 50%;
    pointer-events: none;
  }
  .winner-content {
    position: relative;
    z-index: 1;
    display: flex;
    align-items: center;
    gap: 16px;
    margin-top: 23px;
  }
  .winner-name {
    font-size: 33px;
    font-weight: 800;
    letter-spacing: -0.04em;
    line-height: 1.15;
    overflow-wrap: anywhere;
  }
  .winner-meta {
    position: relative;
    z-index: 1;
    margin-top: 9px;
    color: var(--on-dark);
    font-size: 13px;
  }
  .winner-empty {
    position: relative;
    z-index: 1;
    margin-top: 24px;
    font-size: 30px;
    font-weight: 750;
    letter-spacing: -0.04em;
  }
  .winner-body {
    padding: 25px 29px;
  }
  .winner-body > p {
    color: var(--muted);
    font-size: 15px;
  }
  .winner-body strong {
    color: var(--ink);
  }
  .candidate-chips {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin: 17px 0 22px;
  }
  .candidate-chips span {
    color: var(--ink);
    display: flex;
    gap: 10px;
    padding: 6px 10px;
    border: 1px solid var(--line);
    border-radius: var(--radius);
    background: var(--warning-tint);
    font-size: 14px;
    overflow-wrap: anywhere;
  }
  .candidate-chips small {
    color: var(--muted);
    font-size: 12px;
    white-space: nowrap;
  }
  .draw-button {
    width: 100%;
    min-height: 59px;
    justify-content: flex-start;
    margin-top: 17px;
    font-size: 16px;
  }
  .draw-button > span:first-child {
    margin-right: 5px;
    font-size: 26px;
    line-height: 1;
  }
  .arrow {
    margin-left: auto;
  }
  .chooser-settings {
    display: flex;
    flex-wrap: wrap;
    justify-content: space-between;
    gap: 14px;
    margin-top: 17px;
    color: var(--muted);
    font-size: 13px;
  }
  .chooser-settings label {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .chooser-settings select {
    max-width: 190px;
    padding: 5px;
    border: 1px solid var(--line);
    border-radius: var(--radius);
    background: transparent;
    color: var(--ink);
    font-size: 13px;
  }
  .chooser-settings input {
    accent-color: var(--primary);
  }
  .pending {
    margin-top: 20px;
    margin-bottom: 0;
  }
  .fairness-card {
    color: var(--ink);
    padding: 25px;
    border: 1px solid var(--line);
    border-radius: var(--radius);
    background: var(--surface);
  }

  .fairness-card h2 {
    margin-bottom: 13px;
    font-size: 25px;
  }
  .fairness-card p {
    color: var(--muted);
    font-size: 14px;
  }
  ol {
    margin: 22px 0 0;
    padding-left: 20px;
    color: var(--muted);
    font-size: 13px;
  }
  li {
    padding: 13px 0 0 5px;
  }
  li::marker {
    color: var(--primary-hover);
    font-weight: 750;
  }
  dl {
    --muted: var(--on-dark-muted);
    margin: 24px 6px 0;
    font-size: 13px;
  }
  dl div {
    display: flex;
    justify-content: space-between;
    gap: 10px;
    margin: 12px 0;
  }
  dt {
    color: var(--muted);
  }
  dd {
    margin: 0;
    font-weight: 650;
  }
  @media (max-width: 1100px) {
    .workspace {
      grid-template-columns: minmax(0, 1fr) 250px;
      gap: 20px;
    }
    .fairness-card {
      padding: 20px;
    }
  }
  @media (max-width: 920px) {
    .workspace {
      grid-template-columns: minmax(0, 1fr);
    }
    aside {
      display: none;
    }
  }
  @media (max-width: 600px) {
    .winner-top,
    .winner-body {
      padding: 22px;
    }
    .winner-name {
      font-size: 28px;
    }
    .winner-empty {
      font-size: 27px;
    }
    .draw-button {
      font-size: 15px;
    }
    .winner-top::after {
      font-size: 115px;
      top: 25px;
    }
  }
</style>
