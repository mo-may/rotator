<script lang="ts">
  import type { Participant } from '../../../src/shared/contracts';
  import Avatar from '../components/Avatar.svelte';
  import EmptyState from '../components/EmptyState.svelte';

  let {
    participants,
    oncreate,
    onrename,
    onremove,
  }: {
    participants: Participant[];
    oncreate: () => void;
    onrename: (person: Participant) => void;
    onremove: (person: Participant) => void;
  } = $props();
</script>

<div class="page-heading">
  <div>
    <p class="eyebrow">Personen verwalten</p>
    <h1>Team</h1>
    <p class="page-description">
      Hier sind die Menschen hinter euren Aufgaben. Ordnet sie in der jeweiligen Aufgabe zu.
      Auswahlstand und Aktivstatus werden pro Aufgabe geführt.
    </p>
  </div>
  <button class="button primary" onclick={oncreate}>+ Person hinzufügen</button>
</div>

{#if participants.length}
  <div class="people-grid">
    {#each participants as person (person.id)}
      <article>
        <Avatar name={person.name} />
        <div class="person-copy">
          <h2>{person.name}</h2>
          <p>Teilnehmer im Team</p>
        </div>
        <div class="person-actions">
          <button
            class="button quiet small"
            onclick={() => onrename(person)}
            aria-label="{person.name} umbenennen">Umbenennen</button
          >
          <button
            class="button danger small"
            onclick={() => onremove(person)}
            aria-label="{person.name} entfernen">Entfernen</button
          >
        </div>
      </article>
    {/each}
  </div>
{:else}
  <EmptyState
    title="Noch keine Personen."
    description="Füge die erste Person hinzu. Danach kannst du sie einer oder mehreren Aufgaben zuordnen."
    actionLabel="+ Erste Person hinzufügen"
    onaction={oncreate}
  />
{/if}

<style>
  .page-heading {
    text-align: left;
  }
  .page-description {
    margin-inline: 0;
    text-align: left;
    white-space: normal;
  }
  .person-actions {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
  }
  .people-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 18px;
  }
  article {
    color: var(--ink);
    display: flex;
    align-items: center;
    gap: 13px;
    padding: 22px;
    border: 1px solid var(--line);
    border-radius: var(--radius);
    background: var(--surface);
  }
  .person-copy {
    flex: 1;
    min-width: 0;
  }
  h2 {
    font-size: 21px;
    overflow-wrap: anywhere;
  }
  article p {
    margin-top: 5px;
    color: var(--muted);
    font-size: 13px;
  }
  @media (max-width: 850px) {
    .people-grid {
      grid-template-columns: 1fr;
    }
  }
  @media (max-width: 500px) {
    article {
      flex-wrap: wrap;
      padding: 18px;
    }
    .person-actions {
      width: 100%;
      margin-left: 53px;
      justify-content: flex-start;
    }
  }
</style>
