/* Spread background traffic across devices. Retries are only for idempotent login. */
window.PlayerNetwork = (() => {
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  async function postJsonWithRetry(url, payload, options = {}) {
    const {retries = 2, retryDelayMs = 700, timeoutMs = 12000} = options;
    let lastError;
    for (let attempt = 0; attempt <= retries; attempt++) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);
      let retryAfter = 0;
      try {
        const response = await fetch(url, {
          method:'POST', headers:{'Content-Type':'application/json'},
          body:JSON.stringify(payload), signal:controller.signal
        });
        const raw = await response.text();
        let data;
        try { data = raw ? JSON.parse(raw) : {}; }
        catch { data = {error:'Serwer jest chwilowo niedostępny. Spróbuj ponownie.'}; }
        if (![429,500,502,503,504].includes(response.status) || attempt === retries) return {response,data};
        const value = response.headers.get('Retry-After');
        retryAfter = /^\d+$/.test(value || '') ? Number(value)*1000 : Math.max(0,Date.parse(value)-Date.now()) || 0;
        lastError = new Error(data.error || 'Serwer jest chwilowo zajęty.');
      } catch (error) {
        lastError = error;
      } finally { clearTimeout(timeout); }
      if (attempt < retries) await sleep(Math.min(8000,Math.max(retryAfter,retryDelayMs*2**attempt)+Math.random()*700));
    }
    throw new Error(lastError?.name === 'AbortError'
      ? 'Logowanie trwało zbyt długo. Spróbuj ponownie - użyj tych samych danych.'
      : 'Nie udało się połączyć. Sprawdź internet i spróbuj ponownie.');
  }
  function startPolling(task, intervalMs = 10000, jitterMs = 2000) {
    let stopped = false, timer;
    const run = async () => {
      try { if (!document.hidden) await task(); }
      catch { /* The next refresh can recover; do not overlap requests. */ }
      finally { if (!stopped) timer = setTimeout(run, intervalMs + Math.random()*jitterMs); }
    };
    timer = setTimeout(run, intervalMs * Math.random());
    return () => { stopped = true; clearTimeout(timer); };
  }
  return {postJsonWithRetry,startPolling};
})();
