// Global Utility for Chart UI States
window.ChartUtils = {
  /**
   * Inject a skeleton loader into an array of element IDs (used when charting replaces innerHTML directly).
   * @param {string[]} ids - An array of container element IDs
   * @param {string} msg - The loading message to display
   */
  initSkeleton: function (ids, msg = "Fetching Data...") {
    ids.forEach(id => {
      const el = document.getElementById(id);
      if (el) {
        el.innerHTML = `<div class="chart-skeleton">${msg}</div>`;
      }
    });
  },

  /**
   * For SVG environments (like D3 simulations) where the SVG is hidden while a skeleton is overlaid.
   */
  showSvgSkeleton: function (svgId, containerId, msg = "Loading Data...") {
    const svg = document.getElementById(svgId);
    const container = document.getElementById(containerId);
    if (!svg || !container) return;

    let skeleton = document.getElementById(`${svgId}-skeleton`);
    if (!skeleton) {
      skeleton = document.createElement("div");
      skeleton.id = `${svgId}-skeleton`;
      skeleton.className = "chart-skeleton";
      skeleton.textContent = msg;

      const chartHeight = container.clientHeight || 500;
      skeleton.style.height = `${chartHeight}px`;

      container.appendChild(skeleton);
      svg.style.display = "none";
    }
  },

  /**
   * Removes the SVG skeleton and unhides the SVG.
   */
  hideSvgSkeleton: function (svgId) {
    const svg = document.getElementById(svgId);
    const skeleton = document.getElementById(`${svgId}-skeleton`);

    if (skeleton) skeleton.remove();
    if (svg) svg.style.display = "block";
  }
};
