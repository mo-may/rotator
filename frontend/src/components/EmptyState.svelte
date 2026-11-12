<script lang="ts">
  let {
    title,
    description,
    actionLabel,
    onaction,
  }: { title: string; description: string; actionLabel?: string; onaction?: () => void } = $props();
</script>

<div class="empty-state">
  <h2>{title}</h2>
  <p>{description}</p>
  {#if actionLabel && onaction}
    <button class="button primary" onclick={onaction}>{actionLabel}</button>
  {/if}
</div>

<style>
  .empty-state {
    color: var(--ink);
    padding: 48px 24px;
    border-top: 1px solid var(--line);
    background: var(--surface);
    text-align: center;
  }

  h2 {
    margin: 22px 0 12px;
    font-size: 20px;
  }
  p {
    max-width: 470px;
    margin: 0 auto 24px;
    color: var(--muted);
  }
</style>
