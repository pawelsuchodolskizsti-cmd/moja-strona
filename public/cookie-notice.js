(() => {
  'use strict';
  const key = 'oneday-cookie-notice-v1';
  const lifetime = 180 * 24 * 60 * 60 * 1000;
  function acknowledged() {
    try { const until = Number(localStorage.getItem(key)); return Number.isFinite(until) && until > Date.now() && until <= Date.now() + lifetime; } catch { return false; }
  }
  function mount() {
    if (document.getElementById('cookie-notice')) return;
    const banner = document.createElement('section');
    banner.id = 'cookie-notice';
    banner.className = 'cookie-notice';
    banner.setAttribute('aria-labelledby', 'cookie-notice-title');
    banner.innerHTML = '<h2 id="cookie-notice-title">Cookies w grze</h2><p>Korzystamy z niezbędnych cookies i pamięci przeglądarki, aby utrzymać Twoją sesję oraz zapamiętać postęp w grze. Nie używamy cookies reklamowych ani analitycznych.</p><div class="cookie-notice-actions"><button type="button">Rozumiem</button><a href="/cookies/">Więcej informacji</a></div>';
    const button = banner.querySelector('button');
    const opener = document.createElement('button');
    opener.type = 'button';
    opener.className = 'cookie-notice-reopen';
    opener.textContent = 'Cookies';
    opener.setAttribute('aria-controls', 'cookie-notice');
    function show(visible) { banner.hidden = !visible; opener.hidden = visible; }
    button.addEventListener('click', () => {
      try { localStorage.setItem(key, String(Date.now() + lifetime)); } catch {}
      show(false);
      opener.focus({preventScroll:true});
    });
    opener.addEventListener('click', () => { show(true); button.focus({preventScroll:true}); });
    document.body.append(banner, opener);
    show(!acknowledged());
    window.addEventListener('storage', event => { if (event.key === key || event.key === null) show(!acknowledged()); });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount, {once:true}); else mount();
})();
