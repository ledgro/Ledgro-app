(function () {
  // Dark by default; light or auto (follows the phone) if chosen. Runs before first paint so there is no flash.
  var pref = 'dark';
  try { pref = localStorage.getItem('ledgro-theme') || 'dark'; } catch (e) { /* storage blocked */ }
  var dark = pref === 'dark' || (pref === 'auto' && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
})();
