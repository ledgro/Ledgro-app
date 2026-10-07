(function () {
  try {
    var theme = localStorage.getItem('ledgro-theme') || 'system';
    var prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    document.documentElement.setAttribute('data-theme', theme === 'dark' || (theme === 'system' && prefersDark) ? 'dark' : 'light');
  } catch (_e) {
    document.documentElement.setAttribute('data-theme', 'light');
  }
})();
