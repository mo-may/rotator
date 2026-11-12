<script lang="ts">
  import type { Participant, ParticipantRemoval, TaskDetail } from '../../../src/shared/contracts';
  import type { Editor } from '../lib/editor';
  import { api, RequestError } from '../lib/api';
  import FormModal from './FormModal.svelte';

  let {
    editor,
    participants,
    onsaved,
    onclose,
    onconflict,
  }: {
    editor: Editor;
    participants: Participant[];
    onsaved: (message: string, path?: string) => Promise<void>;
    onclose: () => void;
    onconflict: (message: string) => Promise<void>;
  } = $props();

  let name = $state('');
  let description = $state('');
  let count = $state(0);
  let reason = $state('');
  let participantId = $state('');
  let newPersonName = $state('');
  let selectedParticipantIds = $state<number[]>([]);
  let createdParticipant = $state<Participant | null>(null);
  const fieldId = $props.id();

  $effect(() => {
    if (editor.kind === 'task') {
      name = editor.task?.name || '';
      description = editor.task?.description || '';
      selectedParticipantIds = [];
    } else if (editor.kind === 'person') name = editor.person?.name || '';
    else if (editor.kind === 'correction') count = editor.member.count;
  });

  const available = $derived.by(() => {
    if (editor.kind !== 'member') return [];

    const task = editor.task;
    const peopleById = new Map(participants.map((person) => [person.id, person]));
    // A refresh can already include the person created while this dialog is still open.
    if (createdParticipant && !peopleById.has(createdParticipant.id)) {
      peopleById.set(createdParticipant.id, createdParticipant);
    }

    return [...peopleById.values()].filter(
      (person) => !task.members.some((member) => member.participantId === person.id),
    );
  });

  const copy = $derived.by(() => {
    switch (editor.kind) {
      case 'task':
        return {
          title: editor.task ? 'Aufgabe bearbeiten' : 'Neue Aufgabe',
          description: editor.task
            ? 'Benenne die Aufgabe und ergänze bei Bedarf eine Beschreibung.'
            : 'Benenne die Aufgabe und wähle aus, wer sie übernehmen kann.',
          submit: editor.task ? 'Änderungen speichern' : 'Aufgabe anlegen',
        };
      case 'person':
        return {
          title: editor.person ? 'Person umbenennen' : 'Person hinzufügen',
          description: editor.person
            ? 'Der Name wird in aktuellen Aufgaben aktualisiert. Historische Auswahlen behalten ihren damaligen Namen.'
            : 'Personen können an mehreren Aufgaben teilnehmen. Auswahlstände werden pro Aufgabe geführt.',
          submit: editor.person ? 'Namen speichern' : 'Person hinzufügen',
        };
      case 'member':
        return {
          title: 'Teilnehmer hinzufügen',
          description:
            'Neue Teilnehmer starten beim niedrigsten aktiven Auswahlstand dieser Aufgabe. Ohne aktive Teilnehmer starten sie bei 0.',
          submit: 'Zur Aufgabe hinzufügen',
        };
      case 'remove-person':
        return {
          title: 'Person entfernen?',
          description: `„${editor.person.name}“ wird aus dem Team und allen Aufgaben entfernt und nicht mehr ausgewählt. Bisherige Auswahlen bleiben im Verlauf erhalten. Ist diese Person aktuell ausgewählt, wird die aktuelle Auswahl geleert.`,
          submit: 'Person entfernen',
        };
      case 'correction':
        return {
          title: 'Auswahlstand korrigieren',
          description: `Du änderst den Auswahlstand von ${editor.member.name} für „${editor.task.name}“. Die Änderung bleibt mit Begründung nachvollziehbar.`,
          submit: 'Korrektur speichern',
        };
      case 'archive':
        return {
          title: editor.task.archived ? 'Zurück in die Runde?' : 'Aufgabe archivieren?',
          description: editor.task.archived
            ? `„${editor.task.name}“ wird wieder geöffnet. Alle bisherigen Auswahlstände bleiben erhalten.`
            : `„${editor.task.name}“ verschwindet aus der aktiven Übersicht. Teilnehmer, Auswahlstände und Historie bleiben erhalten.`,
          submit: editor.task.archived ? 'Aufgabe wieder öffnen' : 'Aufgabe archivieren',
        };
      case 'undo':
        return {
          title: 'Letzte Auswahl zurücknehmen?',
          description: `Die Auswahl von ${editor.draw.name} wird zurückgenommen. Der Auswahlstand sinkt von ${editor.draw.countAfter} auf ${editor.draw.countBefore}; die vorherige aktuelle Auswahl wird wiederhergestellt.`,
          submit: 'Auswahl zurücknehmen',
        };
    }
  });

  async function save(): Promise<void> {
    try {
      switch (editor.kind) {
        case 'task': {
          const task = editor.task;
          const result = await api<TaskDetail>(
            task ? `/api/tasks/${task.id}` : '/api/tasks',
            task ? 'PATCH' : 'POST',
            {
              name: name.trim(),
              description: description.trim(),
              ...(task
                ? { expectedVersion: task.version }
                : { participantIds: selectedParticipantIds }),
            },
          );
          await onsaved(
            task ? 'Aufgabe aktualisiert.' : 'Aufgabe angelegt.',
            `/tasks/${result.id}`,
          );
          break;
        }
        case 'person': {
          const person = editor.person;
          await api<Participant>(
            person ? `/api/participants/${person.id}` : '/api/participants',
            person ? 'PATCH' : 'POST',
            { name: name.trim() },
          );
          await onsaved(person ? 'Name aktualisiert.' : 'Person zum Team hinzugefügt.');
          break;
        }
        case 'member': {
          if (newPersonName.trim()) {
            createdParticipant = await api<Participant>('/api/participants', 'POST', {
              name: newPersonName.trim(),
            });
            participantId = String(createdParticipant.id);
            newPersonName = '';
          }
          if (!participantId)
            throw new Error('Bitte wähle eine Person aus oder gib einen neuen Namen ein.');
          await api<TaskDetail>(`/api/tasks/${editor.task.id}/members`, 'POST', {
            participantId: Number(participantId),
            expectedVersion: editor.task.version,
          });
          await onsaved('Teilnehmer hinzugefügt.');
          break;
        }
        case 'remove-person': {
          await api<ParticipantRemoval>(`/api/participants/${editor.person.id}`, 'DELETE', {});
          await onsaved(`${editor.person.name} wurde aus dem Team entfernt.`);
          break;
        }
        case 'correction': {
          if (!reason.trim()) throw new Error('Eine Begründung ist erforderlich.');
          await api<TaskDetail>(
            `/api/tasks/${editor.task.id}/members/${editor.member.id}/corrections`,
            'POST',
            { count, reason: reason.trim(), expectedVersion: editor.task.version },
          );
          await onsaved('Auswahlstand korrigiert und begründet protokolliert.');
          break;
        }
        case 'archive': {
          await api<TaskDetail>(`/api/tasks/${editor.task.id}`, 'PATCH', {
            archived: !editor.task.archived,
            expectedVersion: editor.task.version,
          });
          await onsaved(editor.task.archived ? 'Aufgabe ist wieder aktiv.' : 'Aufgabe archiviert.');
          break;
        }
        case 'undo': {
          await api<TaskDetail>(
            `/api/tasks/${editor.task.id}/draws/${editor.draw.id}/undo`,
            'POST',
            { expectedVersion: editor.task.version },
          );
          await onsaved('Letzte Auswahl zurückgenommen.');
        }
      }
      onclose();
    } catch (error) {
      if (
        editor.kind === 'remove-person' &&
        error instanceof RequestError &&
        error.status === 404
      ) {
        await onsaved('Die Person ist bereits entfernt. Der aktuelle Stand wurde geladen.');
        onclose();
        return;
      }
      if (error instanceof RequestError && error.status === 409) {
        onclose();
        await onconflict(error.message);
        return;
      }
      throw error;
    }
  }
</script>

<FormModal
  title={copy.title}
  description={copy.description}
  submitLabel={copy.submit}
  danger={editor.kind === 'undo' || editor.kind === 'remove-person'}
  onsubmit={save}
  {onclose}
>
  {#if editor.kind === 'task'}
    <div class="field">
      <label for="{fieldId}-name">Name der Aufgabe</label><input
        id="{fieldId}-name"
        bind:value={name}
        maxlength="100"
        required
        placeholder="z. B. Daily moderieren"
      />
    </div>
    <div class="field">
      <label for="{fieldId}-description">Beschreibung (optional)</label><textarea
        id="{fieldId}-description"
        bind:value={description}
        maxlength="2000"
        rows="3"
        placeholder="Was gehört zu dieser Aufgabe?"></textarea>
    </div>
    {#if !editor.task}
      <fieldset class="participant-picker" aria-describedby="{fieldId}-participants-hint">
        <legend>Teilnehmer auswählen (optional)</legend>
        <p id="{fieldId}-participants-hint" class="picker-hint">
          {participants.length
            ? 'Ausgewählte Personen starten aktiv mit Auswahlstand 0. Du kannst später weitere hinzufügen.'
            : 'Noch keine Personen im Team. Du kannst die Aufgabe jetzt anlegen und später Personen hinzufügen.'}
        </p>
        {#if participants.length}
          <div class="picker-actions">
            <span>{selectedParticipantIds.length} von {participants.length} ausgewählt</span>
            <div>
              <button
                type="button"
                class="button quiet small"
                disabled={selectedParticipantIds.length === participants.length}
                onclick={() => (selectedParticipantIds = participants.map((person) => person.id))}
                >Alle auswählen</button
              >
              <button
                type="button"
                class="button quiet small"
                disabled={!selectedParticipantIds.length}
                onclick={() => (selectedParticipantIds = [])}>Auswahl leeren</button
              >
            </div>
          </div>
          <div class="participant-options">
            {#each participants as person (person.id)}
              <label>
                <input type="checkbox" value={person.id} bind:group={selectedParticipantIds} />
                <span>{person.name}</span>
              </label>
            {/each}
          </div>
        {/if}
      </fieldset>
    {/if}
  {:else if editor.kind === 'person'}
    <div class="field">
      <label for="{fieldId}-name">Anzeigename</label><input
        id="{fieldId}-name"
        bind:value={name}
        maxlength="100"
        required
        autocomplete="off"
        placeholder="Vor- und Nachname"
      />
    </div>
  {:else if editor.kind === 'member'}
    <div class="field">
      <label for="{fieldId}-person">Person aus dem Team</label>
      <select
        id="{fieldId}-person"
        bind:value={participantId}
        disabled={newPersonName.trim().length > 0}
        required={!newPersonName.trim() && available.length > 0}
      >
        <option value="" disabled
          >{available.length ? 'Person auswählen …' : 'Noch keine weitere Person vorhanden'}</option
        >
        {#each available as person (person.id)}<option value={String(person.id)}
            >{person.name}</option
          >{/each}
      </select>
    </div>
    <div class="field">
      <label for="{fieldId}-new">Neue Person (optional)</label><input
        id="{fieldId}-new"
        bind:value={newPersonName}
        maxlength="100"
        required={!available.length && !participantId}
        autocomplete="off"
        placeholder="Oder eine neue Person anlegen"
      />
      <p class="hint">
        Ein neuer Name wird ins Team aufgenommen und direkt dieser Aufgabe zugeordnet.
      </p>
    </div>
  {:else if editor.kind === 'correction'}
    <div class="field">
      <label for="{fieldId}-count">Neuer Auswahlstand</label><input
        id="{fieldId}-count"
        type="number"
        bind:value={count}
        min="0"
        max="1000000000"
        step="1"
        required
      />
      <p class="hint">Bisheriger Auswahlstand: {editor.member.count}</p>
    </div>
    <div class="field">
      <label for="{fieldId}-reason">Begründung</label><textarea
        id="{fieldId}-reason"
        bind:value={reason}
        maxlength="500"
        rows="3"
        required
        placeholder="Warum wird der Stand angepasst?"></textarea>
      <p class="hint">Bitte beschreibe kurz den Anlass der Korrektur.</p>
    </div>
  {/if}
</FormModal>

<style>
  .participant-picker {
    min-width: 0;
    margin: 0;
    padding: 0;
    border: 0;
  }
  legend {
    padding: 0;
    font-size: 14px;
    font-weight: 650;
  }
  .picker-hint {
    margin-top: 7px;
    color: var(--muted);
    font-size: 13px;
  }
  .picker-actions {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 6px 12px;
    margin: 12px 0 8px;
    color: var(--muted);
    font-size: 12px;
  }
  .picker-actions > div {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
  }
  .participant-options {
    max-height: 220px;
    overflow-y: auto;
    border: 1px solid var(--control-line);
    border-radius: var(--radius);
  }
  .participant-options label {
    display: flex;
    align-items: center;
    gap: 12px;
    min-height: 44px;
    padding: 10px 12px;
    cursor: pointer;
  }
  .participant-options label + label {
    border-top: 1px solid var(--line);
  }
  .participant-options label:hover,
  .participant-options label:has(input:checked) {
    background: var(--tint);
  }
  .participant-options input {
    flex: none;
    width: 18px;
    height: 18px;
    margin: 0;
    accent-color: var(--primary);
    cursor: pointer;
  }
  .participant-options span {
    min-width: 0;
    overflow-wrap: anywhere;
    font-size: 14px;
  }
</style>
