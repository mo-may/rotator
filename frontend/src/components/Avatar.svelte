<script lang="ts">
  import { initials } from '../lib/format';

  let { name, large = false }: { name: string; large?: boolean } = $props();
</script>

<span class:large class="avatar" aria-hidden="true">{initials(name)}</span>

<style>
  .avatar {
    display: inline-grid;
    flex: none;
    width: 40px;
    height: 40px;
    place-items: center;
    border-radius: var(--radius);
    background: var(--tint);
    color: var(--primary-hover);
    font-size: 14px;
    font-weight: 750;
  }

  .large {
    width: 66px;
    height: 66px;
    border-radius: var(--radius);
    background: var(--ink);
    color: var(--surface);
    font-size: 24px;
  }
</style>
