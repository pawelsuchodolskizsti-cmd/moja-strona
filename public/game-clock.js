/* One server-synchronised, monotonic clock for participants, the desk and the display. */
window.GameClock = (() => {
  let epoch = Date.now(), tick = performance.now();
  function sync(serverNow) {
    const time = Date.parse(serverNow);
    if (Number.isFinite(time)) { epoch = time; tick = performance.now(); }
  }
  return {sync, now:() => epoch + performance.now() - tick};
})();
