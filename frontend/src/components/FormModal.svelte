<script lang="ts">
  import { onMount } from 'svelte';
  import type { Snippet } from 'svelte';
  import { errorMessage } from '../lib/api';

  let {
    title,
    description,
    submitLabel,
    danger = false,
    applicationValidation = false,
    children,
    onsubmit,
    onclose,
  }: {
    title: string;
    description: string;
    submitLabel: string;
    danger?: boolean;
    applicationValidation?: boolean;
    children: Snippet;
    onsubmit: () => Promise<void>;
    onclose: () => void;
  } = $props();

  let dialog: HTMLDialogElement;
  let cancelButton: HTMLButtonElement;
  let busy = $state(false);
  let error = $state('');
  const titleId = $props.id();

  onMount(() => {
    const previousFocus =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialog.showModal();
    const visible = (field: HTMLElement) =>
      field.getClientRects().length > 0 && getComputedStyle(field).visibility === 'visible';
    const firstInput = Array.from(
      dialog.querySelectorAll<HTMLElement>(
        'form input:not([type="hidden"]):not(:disabled):not([readonly]), form textarea:not(:disabled):not([readonly])',
      ),
    ).find(visible);
    const firstSelect = Array.from(
      dialog.querySelectorAll<HTMLSelectElement>('form select:not(:disabled)'),
    ).find(visible);
    (firstInput ?? firstSelect ?? cancelButton).focus();
    return () => {
      dialog.close();
      const focusTarget =
        previousFocus?.isConnected && previousFocus !== document.body
          ? previousFocus
          : document.querySelector<HTMLElement>('#main');
      focusTarget?.focus({ preventScroll: true });
    };
  });

  async function submit(event: SubmitEvent): Promise<void> {
    event.preventDefault();
    if (busy) return;
    busy = true;
    error = '';
    try {
      await onsubmit();
    } catch (cause) {
      error = errorMessage(cause);
    } finally {
      busy = false;
    }
  }

  function cancel(event: Event): void {
    event.preventDefault();
    if (!busy) onclose();
  }
</script>

<dialog
  bind:this={dialog}
  aria-labelledby={titleId}
  aria-describedby="{titleId}-description"
  oncancel={cancel}
>
  <div class="modal-heading">
    <h2 id={titleId}>{title}</h2>
    <button class="close" aria-label="Dialog schließen" disabled={busy} onclick={onclose}>×</button>
  </div>
  <p id="{titleId}-description" class="description">{description}</p>
  <form onsubmit={submit} novalidate={applicationValidation}>
    {#if error}<div class="notice error" role="alert">{error}</div>{/if}
    <fieldset disabled={busy}>
      {@render children()}
    </fieldset>
    <div class="actions">
      <button
        bind:this={cancelButton}
        type="button"
        class="button secondary"
        disabled={busy}
        onclick={onclose}>Abbrechen</button
      >
      <button type="submit" class="button" class:primary={!danger} class:danger disabled={busy}
        >{busy ? 'Wird gespeichert …' : submitLabel}</button
      >
    </div>
  </form>
</dialog>

<style>
  dialog {
    width: min(530px, calc(100% - 32px));
    max-height: calc(100dvh - 32px);
    padding: 28px;
    overflow-y: auto;
    border: 1px solid var(--line);
    border-radius: var(--radius);
    background: var(--surface);
    color: var(--ink);
    box-shadow: var(--overlay-shadow);
  }
  dialog::backdrop {
    background: color-mix(in srgb, var(--night) 78%, transparent);
  }
  .modal-heading {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 20px;
  }
  h2 {
    font-size: 29px;
  }
  .close {
    display: grid;
    width: 32px;
    height: 32px;
    flex: none;
    place-items: center;
    margin: -6px -8px 0 0;
    border: 0;
    border-radius: var(--radius);
    background: transparent;
    color: var(--muted);
    font-size: 27px;
    line-height: 1;
  }
  .close:hover {
    background: var(--tint);
  }
  .description {
    margin-top: 13px;
    color: var(--muted);
    font-size: 14px;
    overflow-wrap: anywhere;
  }
  form {
    margin-top: 24px;
  }
  fieldset {
    min-width: 0;
    margin: 0;
    padding: 0;
    border: 0;
  }
  .actions {
    display: flex;
    flex-wrap: wrap;
    justify-content: flex-end;
    gap: 10px;
    margin-top: 23px;
  }
  @media (max-width: 500px) {
    dialog {
      padding: 23px;
    }
    h2 {
      font-size: 26px;
    }
    .actions .button {
      flex: 1;
    }
  }
</style>
