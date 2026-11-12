<script lang="ts">
  import type { Participant } from '../../../src/shared/contracts';
  import DataList from '../components/DataList.svelte';
  import EmptyState from '../components/EmptyState.svelte';
  import { formatDay } from '../lib/format';
  import { calendarDate } from '../../../src/shared/scheduling';

  let {
    participants,
    oncreate,
    onrename,
    onremove,
    onabsences,
    timeZone,
  }: {
    participants: Participant[];
    oncreate: () => void;
    onrename: (person: Participant) => void;
    onremove: (person: Participant) => void;
    onabsences: (person: Participant) => void;
    timeZone: string;
  } = $props();
</script>

<div class="page-heading">
  <div>
    <h1>Team <span class="heading-count">{participants.length}</span></h1>
    <p class="page-description">Personen werden in der jeweiligen Aufgabe zugeordnet.</p>
  </div>
  <button class="button primary" onclick={oncreate}>+ Person hinzufügen</button>
</div>

{#if participants.length}
  {#snippet personName(person: Participant)}<h2 class="list-title">{person.name}</h2>
    {#if person.absent}<p class="list-note">Derzeit abwesend</p>{/if}
    {@const next = person.absences?.find(
      (range) => range.end >= calendarDate(new Date().toISOString(), timeZone),
    )}
    {#if next}<p class="list-description">{formatDay(next.start)} – {formatDay(next.end)}</p>{/if}
  {/snippet}
  {#snippet actions(person: Participant)}
    <div class="person-actions">
      <button
        class="button quiet small"
        onclick={() => onabsences(person)}
        aria-label="Abwesenheiten von {person.name}">Abwesenheiten</button
      >
      <button
        class="button quiet small"
        onclick={() => onrename(person)}
        aria-label="{person.name} umbenennen">Umbenennen</button
      >
      <button
        class="button quiet small remove"
        onclick={() => onremove(person)}
        aria-label="{person.name} entfernen">Entfernen</button
      >
    </div>
  {/snippet}
  <DataList
    label="Team"
    items={participants}
    columns={[
      { label: 'Person', content: personName },
      { label: 'Aktionen', content: actions },
    ]}
  />
{:else}
  <EmptyState
    title="Noch keine Personen."
    description="Füge die erste Person hinzu. Danach kannst du sie einer oder mehreren Aufgaben zuordnen."
    actionLabel="+ Erste Person hinzufügen"
    onaction={oncreate}
  />
{/if}

<style>
  .page-heading,
  .page-description {
    text-align: left;
  }
  .page-description {
    white-space: normal;
  }
  .person-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 4px 12px;
  }
  .remove {
    color: var(--muted);
  }
  .remove:hover {
    color: var(--danger);
    background: var(--danger-tint);
  }
  @media (max-width: 650px) {
    .person-actions .button {
      padding-inline: 0;
      justify-content: flex-start;
    }
  }
</style>
