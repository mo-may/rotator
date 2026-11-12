<script lang="ts">
  import type { Member, TaskDetail } from '../../../src/shared/contracts';
  import DataList from './DataList.svelte';

  let {
    task,
    busy,
    onadd,
    ontoggle,
    oncorrect,
  }: {
    task: TaskDetail;
    busy: boolean;
    onadd: () => void;
    ontoggle: (member: Member) => void;
    oncorrect: (member: Member) => void;
  } = $props();

  const sortedMembers = $derived(
    [...task.members].sort(
      (a, b) =>
        Number(b.active && !b.absent) - Number(a.active && !a.absent) ||
        a.count - b.count ||
        a.name.localeCompare(b.name, 'de'),
    ),
  );
  const candidateIds = $derived(new Set(task.candidates.map((member) => member.id)));
</script>

<section>
  <div class="section-heading">
    <div>
      <h2>Teilnehmer <span class="count-chip">{task.memberCount}</span></h2>
    </div>
    <button class="button secondary" disabled={busy || task.archived} onclick={onadd}
      >+ Teilnehmer hinzufügen</button
    >
  </div>

  {#if task.members.length}
    {#snippet person(member: Member)}
      <p class="list-title">{member.name}</p>
      {#if member.absent}<p class="list-description">Abwesend · pausiert automatisch</p>{/if}
      {#if candidateIds.has(member.id)}<p class="list-note">Im nächsten Lostopf</p>{/if}
    {/snippet}
    {#snippet status(member: Member)}
      <button
        class="status"
        class:inactive={!member.active}
        disabled={busy || task.archived}
        aria-label="{member.name} {member.active ? 'deaktivieren' : 'aktivieren'}"
        aria-pressed={member.active}
        onclick={() => ontoggle(member)}>{member.active ? 'Aktiv' : 'Inaktiv'}</button
      >
    {/snippet}
    {#snippet count(member: Member)}<span class="count">{member.count}</span>{/snippet}
    {#snippet action(member: Member)}
      <button
        class="button quiet small"
        disabled={busy || task.archived}
        onclick={() => oncorrect(member)}
        aria-label="Auswahlstand von {member.name} korrigieren">Stand korrigieren</button
      >
    {/snippet}
    <DataList
      label="Teilnehmer"
      items={sortedMembers}
      columns={[
        { label: 'Person', content: person },
        { label: 'Status', content: status },
        { label: 'Auswahlstand', content: count },
        { label: 'Aktion', content: action },
      ]}
      muted={(member) => !member.active || !!member.absent}
    />
    <p class="table-note">
      „Im nächsten Lostopf“ markiert aktive Personen mit dem niedrigsten Auswahlstand.
    </p>
  {:else}
    <div class="table-empty">
      Noch keine Teilnehmer. Fügt euer Team hinzu, dann kann’s losgehen.
    </div>
  {/if}
</section>

<style>
  .section-heading {
    align-items: center;
  }
  .count {
    font-variant-numeric: tabular-nums;
  }
  .status {
    display: inline-flex;
    align-items: center;
    gap: 7px;
    min-height: 35px;
    padding: 6px 10px;
    border: 1px solid var(--line);
    border-radius: var(--radius);
    background: var(--tint);
    color: var(--accent-text);
    font-size: 13px;
  }
  .status:hover:not(:disabled) {
    border-color: var(--primary);
    background: var(--tint);
  }
  .status:active:not(:disabled) {
    filter: brightness(0.95);
  }
  .status::before {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: currentColor;
    content: '';
  }
  .status.inactive {
    border-color: var(--line);
    background: var(--surface-muted);
    color: var(--muted);
  }
  .table-note {
    margin: 12px 2px 0;
    color: var(--muted);
    font-size: 13px;
  }
  .table-empty {
    padding: 30px 22px;
    border: 1px solid var(--line);
    border-radius: var(--radius);
    background: var(--surface);
    color: var(--muted);
    text-align: center;
    font-size: 14px;
  }
  @media (max-width: 650px) {
    .section-heading {
      align-items: flex-start;
      flex-direction: column;
    }
    .button.small {
      padding-inline: 0;
      text-align: left;
    }
  }
</style>
