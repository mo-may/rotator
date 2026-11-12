<script lang="ts">
  import { savePreference } from '../lib/format';

  let dark = $state(document.documentElement.dataset.theme === 'dark');

  $effect(() => {
    const root = document.documentElement;
    root.dataset.theme = dark ? 'dark' : 'light';
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute('content', getComputedStyle(root).backgroundColor);
  });

  function toggle(): void {
    dark = !dark;
    savePreference('dark', dark);
  }
</script>

<button
  class="theme-switch"
  type="button"
  role="switch"
  aria-checked={dark}
  aria-label="Dark Mode"
  title="Dark Mode"
  onclick={toggle}
>
  <span class="switch-label">Dark Mode</span>
  <span class="track" aria-hidden="true"><span class="thumb"></span></span>
</button>

<style>
  .theme-switch {
    display: inline-flex;
    align-items: center;
    gap: 10px;
    min-height: 44px;
    padding: 4px;
    border: 0;
    border-radius: var(--radius);
    background: transparent;
    color: var(--muted);
    font-size: 12px;
  }
  .theme-switch:hover {
    color: var(--ink);
  }
  .theme-switch:active {
    background: var(--tint);
  }
  .track {
    display: inline-flex;
    align-items: center;
    width: 36px;
    height: 22px;
    padding: 3px;
    border: 1px solid var(--control-line);
    border-radius: 12px;
    background: var(--surface-muted);
  }
  .thumb {
    width: 14px;
    height: 14px;
    border-radius: 50%;
    background: var(--muted);
    transition: transform 150ms;
  }
  [aria-checked='true'] .track {
    border-color: var(--primary);
    background: var(--primary);
  }
  [aria-checked='true'] .thumb {
    transform: translateX(12px);
    background: var(--on-primary);
  }
  .theme-switch:hover .track {
    border-color: var(--accent-text);
  }
  @media (max-width: 600px) {
    .switch-label {
      display: none;
    }
  }
  @media (forced-colors: active) {
    .track {
      border-color: ButtonText;
    }
    .thumb {
      background: ButtonText;
    }
    [aria-checked='true'] .track {
      background: Highlight;
      border-color: Highlight;
    }
    [aria-checked='true'] .thumb {
      background: HighlightText;
    }
  }
</style>
