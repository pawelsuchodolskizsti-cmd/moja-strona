/* One server-synchronised, monotonic clock for participants, the desk and the display. */
window.GameClock = (() => {
  let epoch = Date.now(), tick = performance.now();
  function sync(serverNow) {
    const time = Date.parse(serverNow);
    if (Number.isFinite(time)) { epoch = time; tick = performance.now(); }
  }
  const now = () => epoch + performance.now() - tick;
  function gatheringRemaining(state) {
    const deadlines = [];
    if (state.startedAt) deadlines.push(Date.parse(state.startedAt) + Number(state.durationMinutes || 180) * 60000);
    if (state.endedAt) deadlines.push(Date.parse(state.endedAt));
    const end = Math.min(...deadlines.filter(Number.isFinite));
    if (!Number.isFinite(end) || now() < end) return null;
    return Math.max(0, end + 15 * 60000 - now());
  }
  return {sync, now, gatheringRemaining};
})();
