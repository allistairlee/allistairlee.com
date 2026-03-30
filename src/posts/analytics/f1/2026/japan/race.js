/* F1 2026 Japan Race - Race-Specific JS */
(function () {
  "use strict";

  if (!window.F1Base) {
    return;
  }

  /* Init */
  F1Base.waitForD3(async function () {
    // 1. Init all base charts
    var data = await F1Base.initBaseCharts({
      year: 2026,
      country: "Japan",
      sessionName: "Race"
    });

    // 2. Colorize driver spotlight cards
    F1Base.colorizeDriverCards("driver-cards");

    // 3. Resize handler
    var resizeTimer;
    window.addEventListener("resize", function () {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(function () {
        F1Base.handleResize(data);
      }, 250);
    });
  });
})();
