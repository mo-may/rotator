// Run before styles load, including when the application bundle is still loading.
(() => {
  let dark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  try {
    const stored = localStorage.getItem('reihum-dark');
    if (stored === 'true' || stored === 'false') dark = stored === 'true';
  } catch {
    // System appearance remains available when browser storage is blocked.
  }
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
})();
