<script lang="ts">
  import type { Member, TaskDetail } from '../../../src/shared/contracts';
  import Avatar from './Avatar.svelte';

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
        Number(b.active) - Number(a.active) ||
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
      <p class="caption">Auswahlstand und Verfügbarkeit für diese Aufgabe.</p>
    </div>
    <button class="button secondary" disabled={busy || task.archived} onclick={onadd}
      >+ Teilnehmer hinzufügen</button
    >
  </div>

  {#if task.members.length}
    <div class="table-wrap">
      <table>
        <thead>
          <tr
            ><th scope="col">Person</th><th scope="col">Status</th><th scope="col">Auswahlstand</th
            ><th scope="col">Aktion</th></tr
          >
        </thead>
        <tbody>
          {#each sortedMembers as member (member.id)}
            <tr class:inactive={!member.active}>
              <td>
                <div class="person">
                  <Avatar name={member.name} />
                  <div>
                    <p class="name">{member.name}</p>
                    {#if candidateIds.has(member.id)}<p class="in-pool">Im nächsten Lostopf</p>{/if}
                  </div>
                </div>
              </td>
              <td>
                <button
                  class="status"
                  class:inactive={!member.active}
                  disabled={busy || task.archived}
                  aria-label="{member.name} {member.active ? 'deaktivieren' : 'aktivieren'}"
                  aria-pressed={member.active}
                  onclick={() => ontoggle(member)}>{member.active ? 'Aktiv' : 'Inaktiv'}</button
                >
              </td>
              <td><span class="count">{member.count}</span></td>
              <td
                ><button
                  class="button quiet small"
                  disabled={busy || task.archived}
                  onclick={() => oncorrect(member)}
                  aria-label="Auswahlstand von {member.name} korrigieren">Stand korrigieren</button
                ></td
              >
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
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
  .caption {
    color: var(--on-dark-muted);
    margin-top: 7px;
  }
  .table-wrap {
    color: var(--ink);
    overflow-x: auto;
    border: 1px solid var(--line);
    border-radius: var(--radius);
    background: var(--surface);
  }
  table {
    width: 100%;
    border-collapse: collapse;
    text-align: left;
  }
  th {
    padding: 14px 17px;
    border-bottom: 1px solid var(--line);
    background: var(--surface-muted);
    color: var(--muted);
    font-size: 13px;
    font-weight: 650;
    white-space: nowrap;
  }
  td {
    padding: 17px;
    border-bottom: 1px solid var(--line);
    font-size: 14px;
  }
  tr:last-child td {
    border-bottom: 0;
  }
  .person {
    display: flex;
    align-items: center;
    gap: 11px;
  }
  .name {
    font-weight: 650;
    overflow-wrap: anywhere;
  }
  .in-pool {
    margin-top: 3px;
    color: var(--primary-hover);
    font-size: 12px;
  }
  .count {
    font-size: 22px;
    font-weight: 750;
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
    color: var(--primary-hover);
    font-size: 13px;
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
  tr.inactive .name {
    color: var(--muted);
  }
  .table-note {
    margin: 12px 2px 0;
    color: var(--on-dark-muted);
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
  @media (max-width: 1050px) {
    th,
    td {
      padding-inline: 12px;
    }
  }
  @media (max-width: 650px) {
    .section-heading {
      align-items: flex-start;
      flex-direction: column;
    }
    .person :global(.avatar) {
      display: none;
    }
    th,
    td {
      padding: 13px 10px;
    }
    th {
      font-size: 12px;
    }
    td {
      font-size: 13px;
    }
    .button.small {
      min-width: 110px;
      font-size: 12px;
    }
    .count {
      font-size: 20px;
    }
  }
</style>
