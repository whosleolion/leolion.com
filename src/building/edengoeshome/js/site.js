// Eden Goes Home — tiny enhancements. Site works fully without JS.
(function () {
  // Countdown to first performance (Dec 8 2026, 9pm Eastern = 02:00 UTC Dec 9)
  var el = document.getElementById('countdown');
  if (el) {
    var target = Date.UTC(2026, 11, 9, 2, 0, 0);
    var tick = function () {
      var d = target - Date.now();
      if (d <= 0) { el.hidden = true; return; }
      var s = Math.floor(d / 1000);
      var v = [Math.floor(s / 86400), Math.floor(s % 86400 / 3600), Math.floor(s % 3600 / 60), s % 60];
      el.querySelectorAll('b').forEach(function (b, i) { b.textContent = v[i]; });
    };
    tick(); setInterval(tick, 1000);
  }
})();
