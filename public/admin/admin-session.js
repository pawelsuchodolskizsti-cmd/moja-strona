window.AdminSession = {
  async fetch(url, options = {}) {
    const response = await fetch(url, {...options, credentials:'same-origin', cache:'no-store'});
    if (response.status === 401) window.dispatchEvent(new Event('admin-session-expired'));
    return response;
  },
  async check() { const r=await fetch('/api/admin-session',{credentials:'same-origin',cache:'no-store'});return r.ok && (await r.json()).authenticated; },
  async login(login,password) {
    const r=await fetch('/api/admin-session',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({login,password})});
    const data=await r.json();if(!r.ok)throw Error(data.error||'Nie udało się zalogować.');return data.authenticated;
  },
  async logout() { const r=await fetch('/api/admin-session',{method:'DELETE',credentials:'same-origin'});if(!r.ok)throw Error('Nie udało się zakończyć sesji. Spróbuj ponownie.'); },
  redirect() { location.assign('/admin/?next='+encodeURIComponent(location.pathname+location.search)); }
};
