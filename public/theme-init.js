(function () {
  // Light, dark or auto (follows the phone). Runs before first paint so there is no flash.
  var pref = 'auto';
  try { pref = localStorage.getItem('ledgro-theme') || 'auto'; } catch (e) { /* storage blocked */ }
  var dark = pref === 'dark' || (pref === 'auto' && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
})();
