/* Keep the initial view hidden until the session and destination are resolved. */
window.ViewLoading = (() => {
  const root = document.documentElement;
  function error(message = 'Ładowanie trwa dłużej. Sprawdź połączenie lub odśwież stronę.') {
    if (!root.classList.contains('view-pending')) return;
    const label = document.getElementById('view-loading-message');
    if (label) label.textContent = message;
    const retry = document.getElementById('view-loading-retry');
    if (retry) retry.hidden = false;
  }
  const timer = setTimeout(() => error(), 12000);
  function finish() {
    clearTimeout(timer);
    root.classList.remove('view-pending');
  }
  return {finish, error};
})();
