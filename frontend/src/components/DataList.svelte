<script lang="ts" generics="Item extends { id: number | string }">
  import type { Snippet } from 'svelte';

  let {
    label,
    items,
    columns,
    href,
    muted,
  }: {
    label: string;
    items: Item[];
    columns: { label: string; content: Snippet<[Item]> }[];
    href?: (item: Item) => string;
    muted?: (item: Item) => boolean;
  } = $props();
</script>

{#snippet cells(item: Item)}
  {#each columns as column, index (column.label)}
    <div class="data-cell">
      {#if index > 0}<span class="cell-label">{column.label}</span>{/if}
      <div class="cell-content">{@render column.content(item)}</div>
    </div>
  {/each}
{/snippet}

<div class="data-list" style:--secondary-columns={columns.length - 1}>
  <div class="column-headings" aria-hidden="true">
    {#each columns as column (column.label)}<span>{column.label}</span>{/each}
  </div>
  <ul aria-label={label}>
    {#each items as item (item.id)}
      <li class:muted={muted?.(item)}>
        {#if href}
          <a class="data-row" href={href(item)} data-route>{@render cells(item)}</a>
        {:else}
          <div class="data-row">{@render cells(item)}</div>
        {/if}
      </li>
    {/each}
  </ul>
</div>

<style>
  .data-list {
    color: var(--ink);
  }
  ul {
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .column-headings,
  .data-row {
    display: grid;
    grid-template-columns: minmax(0, 1.5fr) repeat(var(--secondary-columns), minmax(0, 1fr));
    align-items: center;
    gap: 24px;
    padding-inline: 16px;
    border-bottom: 1px solid var(--line);
  }
  .column-headings {
    padding-block: 8px;
    color: var(--muted);
    font-size: 12px;
  }
  .data-row {
    min-height: 60px;
    padding-block: 10px;
    font-size: 14px;
  }
  a.data-row {
    transition: background 150ms;
  }
  a.data-row:hover {
    background: var(--surface-muted);
  }
  a.data-row:active {
    background: var(--tint);
  }
  .data-cell,
  .cell-content {
    min-width: 0;
    overflow-wrap: anywhere;
  }
  .cell-label {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
  }
  .data-cell :global(.list-title) {
    font-size: 16px;
    font-weight: 500;
    line-height: 1.4;
  }
  .data-cell :global(.list-description) {
    margin-top: 4px;
    color: var(--muted);
    font-size: 12px;
  }
  .data-cell :global(.list-note) {
    margin-top: 4px;
    color: var(--accent-text);
    font-size: 12px;
  }
  .muted :global(.list-title) {
    color: var(--muted);
  }
  @media (max-width: 650px) {
    .column-headings {
      display: none;
    }
    ul {
      border-top: 1px solid var(--line);
    }
    .data-row {
      grid-template-columns: minmax(0, 1fr);
      gap: 8px;
      padding: 12px 4px;
    }
    .data-cell:not(:first-child) {
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .cell-label {
      position: static;
      display: inline;
      width: auto;
      height: auto;
      overflow: visible;
      clip-path: none;
      flex: 0 0 108px;
      color: var(--muted);
      font-size: 12px;
    }
  }
</style>
