/* F1 2026 Australian GP — Race-Specific Charts
   
  Base charts (gap, stint, pace, championships) are handled
  by F1Base.initBaseCharts(). This file adds:
    - Telemetry trace: 2025 vs 2026 regulation comparison
*/
(function () {
  "use strict";

  if (!window.F1Base) {
    return;
  }

  /* Simulated 2025 vs 2026 telemetry (regulation narrative) */
  var telemetryData = [];
  for (var i = 0; i <= 5300; i += 53) {
    var p = (i / 5300) * 100;
    var s25 = 200 + Math.sin(p / 10) * 100 + p / 2;
    var s26 = 190 + Math.sin(p / 10) * 80 + p / 2.5;
    if (p > 70) s26 -= (p - 70) * 1.5;
    telemetryData.push({ dist: i, s2025: s25, s2026: s26 });
  }

  /* Telemetry Chart (2025 vs 2026 Regulation Compare) */
  function renderTelemetryChart() {
    var el = document.getElementById("chart-telemetry");
    if (!el) return;
    el.innerHTML = "";

    var dims = F1Base.dims(el, { ml: 120, mr: 80, mt: 20 });
    var svg = d3.select(el).append("svg").attr("width", dims.w).attr("height", dims.h);
    var g = svg.append("g").attr("transform", "translate(" + dims.ml + "," + dims.mt + ")");

    var x = d3.scaleLinear().domain([0, 5300]).range([0, dims.iw]);
    var y = d3.scaleLinear().domain([100, 350]).range([dims.ih, 0]);

    g.append("g").attr("transform", "translate(0," + dims.ih + ")")
      .call(d3.axisBottom(x).ticks(5).tickFormat(function (d) { return d + "m"; }));
    g.append("g")
      .call(d3.axisLeft(y).ticks(5).tickFormat(function (d) { return d + "kph"; }));

    var line2025 = d3.line().x(function (d) { return x(d.dist); }).y(function (d) { return y(d.s2025); }).curve(d3.curveMonotoneX);
    var line2026 = d3.line().x(function (d) { return x(d.dist); }).y(function (d) { return y(d.s2026); }).curve(d3.curveMonotoneX);

    var color2025 = F1Base.getTeamColor("McLaren");
    var color2026 = F1Base.getTeamColor("Mercedes");

    g.append("path").datum(telemetryData)
      .attr("fill", "none").attr("stroke", color2025).attr("stroke-width", 2).attr("stroke-dasharray", "4").attr("opacity", 0.6)
      .attr("d", line2025);
    g.append("path").datum(telemetryData)
      .attr("fill", "none").attr("stroke", color2026).attr("stroke-width", 2.5)
      .attr("d", line2026);

    // Legend
    var leg = g.append("g").attr("transform", "translate(" + (dims.iw - 180) + ", 10)");
    leg.append("line").attr("x1", 0).attr("x2", 20).attr("y1", 0).attr("y2", 0).attr("stroke", color2025).attr("stroke-dasharray", "3").attr("stroke-width", 2);
    leg.append("text").attr("x", 25).attr("y", 4).style("fill", color2025).text("2025 Pole (Norris)");
    leg.append("line").attr("x1", 0).attr("x2", 20).attr("y1", 20).attr("y2", 20).attr("stroke", color2026).attr("stroke-width", 2.5);
    leg.append("text").attr("x", 25).attr("y", 24).style("fill", color2026).text("2026 Pole (Russell)");

    // Interactive tooltip
    var bisect = d3.bisector(function (d) { return d.dist; }).left;
    var focus = g.append("g").style("display", "none");
    focus.append("line").attr("y1", 0).attr("y2", dims.ih).attr("stroke", "var(--color-border)").attr("stroke-width", 1).attr("stroke-dasharray", "2");
    var focusDot25 = focus.append("circle").attr("r", 4).attr("fill", "var(--color-bg)").attr("stroke", color2025).attr("stroke-width", 2);
    var focusDot26 = focus.append("circle").attr("r", 4).attr("fill", "var(--color-bg)").attr("stroke", color2026).attr("stroke-width", 2);

    g.append("rect").attr("width", dims.iw).attr("height", dims.ih)
      .attr("fill", "none").attr("pointer-events", "all")
      .on("mouseover", function () { focus.style("display", null); })
      .on("mouseout", function () { focus.style("display", "none"); F1Base.hideTooltip(); })
      .on("mousemove", function (event) {
        var xCoord = d3.pointer(event)[0];
        var dist = x.invert(xCoord);
        var idx = bisect(telemetryData, dist, 1);
        var d0 = telemetryData[idx - 1];
        var d1 = telemetryData[idx];
        if (!d0 || !d1) return;
        var d = dist - d0.dist > d1.dist - dist ? d1 : d0;

        focus.attr("transform", "translate(" + x(d.dist) + ", 0)");
        focusDot25.attr("cy", y(d.s2025));
        focusDot26.attr("cy", y(d.s2026));

        var content =
          '<div style="font-weight:700;margin-bottom:4px;font-size:10px;color:var(--color-muted)">DISTANCE: ' + d.dist + 'm</div>' +
          '<div style="color:' + color2025 + '">2025: <span style="font-weight:700;color:var(--color-text)">' + d.s2025.toFixed(0) + ' km/h</span></div>' +
          '<div style="color:' + color2026 + '">2026: <span style="font-weight:700;color:var(--color-text)">' + d.s2026.toFixed(0) + ' km/h</span></div>';
        F1Base.showTooltip(content, event);
      });
  }

  /* Init */
  F1Base.waitForD3(async function () {
    // 1. Init all 5 base charts (including telemetry skeleton)
    var data = await F1Base.initBaseCharts({
      year: 2026,
      country: "Australia",
      chartIds: { telemetry: "chart-telemetry" }
    });

    // 2. Race-specific charts
    renderTelemetryChart();

    // 3. Colorize driver spotlight cards
    F1Base.colorizeDriverCards("driver-cards");

    // 4. Resize handler
    var resizeTimer;
    window.addEventListener("resize", function () {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(function () {
        F1Base.handleResize(data);
        renderTelemetryChart();
      }, 250);
    });
  });
})();
