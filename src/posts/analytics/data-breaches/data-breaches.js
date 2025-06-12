// Configuration
const CONFIG = {
  API_URL: "https://haveibeenpwned.com/api/v3/breaches",
  RETRY_ATTEMPTS: 3,
  RETRY_DELAY: 1000,
  DEBOUNCE_DELAY: 200,
  BUBBLE_SIZE: { mobile: [3, 30], desktop: [5, 50] },
  MARGIN: {
    mobile: { top: 20, right: 10, bottom: 50, left: 40 },
    desktop: { top: 20, right: 20, bottom: 60, left: 30 }
  },
  BREAKPOINT: 500,
  COLORS: { small: "#1f77b4", medium: "#ff7f0e", large: "#d62728" },
  THRESHOLDS: { medium: 1_000_000, large: 50_000_000 }
};

// Utilities
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const isMobile = () => window.innerWidth < CONFIG.BREAKPOINT;

function getColor(records) {
  if (records < CONFIG.THRESHOLDS.medium) return CONFIG.COLORS.small;
  if (records < CONFIG.THRESHOLDS.large) return CONFIG.COLORS.medium;
  return CONFIG.COLORS.large;
}

function debounce(fn, wait) {
  let timeout;
  return (...args) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => fn.apply(this, args), wait);
  };
}

// Data fetching
async function fetchData() {
  const _cached = window.ApiCache && ApiCache.get("hibp_breaches");
  if (_cached) return _cached;

  for (let attempt = 1; attempt <= CONFIG.RETRY_ATTEMPTS; attempt++) {
    try {
      const res = await fetch(CONFIG.API_URL, {
        headers: { "Accept": "application/json" }
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (window.ApiCache) ApiCache.set("hibp_breaches", data, 60 * 60 * 1000); // 1 hour
      return data;
    } catch (err) {
      if (attempt === CONFIG.RETRY_ATTEMPTS) throw err;
      await sleep(CONFIG.RETRY_DELAY * attempt);
    }
  }
}

function processData(raw) {
  return raw
    .filter(d => d.IsVerified)
    .map(d => ({
      name: d.Name,
      domain: d.Domain,
      breachDate: new Date(d.BreachDate),
      records: d.PwnCount,
      logo: d.LogoPath,
      description: d.Description
    }))
    .sort((a, b) => a.breachDate - b.breachDate);
}

// Tooltip
class Tooltip {
  constructor() {
    this.el = d3.select(".chart-tooltip");
    if (this.el.empty()) {
      this.el = d3.select("body").append("div").attr("class", "chart-tooltip");
    }
  }

  show(event, d) {
    this.el.html(`
      <img src="${d.logo}" alt="${d.name}"><br>
      <strong>${d.name}</strong><br>
      <small>(${d.domain})</small><br>
      Records: ${d.records.toLocaleString()}<br>
      Date: ${d.breachDate.toISOString().split("T")[0]}<br>
      <hr>
      <small>${d.description}</small>
    `).style("visibility", "visible");
    this.position(event);
  }

  position(e) {
    const node = this.el.node();
    const w = node.offsetWidth, h = node.offsetHeight;
    let left = e.pageX + 15, top = e.pageY - h / 2;

    if (left + w > window.innerWidth - 20) left = e.pageX - w - 15;
    if (top < 10) top = 10;
    if (top + h > window.innerHeight - 10) top = window.innerHeight - h - 10;

    this.el.style("left", `${left}px`).style("top", `${top}px`);
  }

  hide() {
    this.el.style("visibility", "hidden");
  }
}

// Visualization
async function draw() {
  const container = document.getElementById("chart-container");
  if (!container) return;

  const width = container.clientWidth;
  const height = Math.max(container.clientHeight, 500);
  const mobile = isMobile();
  const margin = mobile ? CONFIG.MARGIN.mobile : CONFIG.MARGIN.desktop;

  const svg = d3.select("#breachVisualization")
    .attr("width", width)
    .attr("height", height)
    .attr("viewBox", `0 0 ${width} ${height}`)
    .attr("preserveAspectRatio", "xMidYMid meet");

  svg.selectAll("*").remove();

  if (!(window.ApiCache && ApiCache.get("hibp_breaches")) && window.ChartUtils) {
    window.ChartUtils.showSvgSkeleton("breachVisualization", "chart-container", "Fetching Breach Data...");
  }

  try {
    const raw = await fetchData();
    const data = processData(raw);

    if (window.ChartUtils) window.ChartUtils.hideSvgSkeleton("breachVisualization");

    if (!data.length) {
      svg.append("text")
        .attr("x", width / 2).attr("y", height / 2)
        .attr("text-anchor", "middle")
        .attr("fill", "currentColor")
        .text("No verified breach data available");
      return;
    }

    // Scales
    const bubbleRange = mobile ? CONFIG.BUBBLE_SIZE.mobile : CONFIG.BUBBLE_SIZE.desktop;
    const sizeScale = d3.scaleSqrt().domain(d3.extent(data, d => d.records)).range(bubbleRange);
    const yScale = d3.scaleTime().domain(d3.extent(data, d => d.breachDate)).range([height - margin.bottom, margin.top]);

    // Position data
    data.forEach(d => {
      d.x0 = margin.left + Math.random() * (width - margin.left - margin.right);
      d.x = d.x0;
      d.y = yScale(d.breachDate);
    });

    const tooltip = new Tooltip();

    // Bubbles
    const bubbles = svg.selectAll("circle")
      .data(data).enter().append("circle")
      .attr("r", d => sizeScale(d.records))
      .attr("fill", d => getColor(d.records))
      .attr("cx", d => d.x).attr("cy", d => d.y)
      .style("opacity", 0.8).style("cursor", "pointer")
      .on("mouseover touchstart", function (e, d) {
        d3.select(this).style("opacity", 1);
        tooltip.show(e, d);
      })
      .on("mouseout touchend", function () {
        d3.select(this).style("opacity", 0.8);
        tooltip.hide();
      });

    // Force simulation
    d3.forceSimulation(data)
      .force("x", d3.forceX(d => d.x0).strength(mobile ? 0.1 : 0.3))
      .force("y", d3.forceY(d => yScale(d.breachDate)).strength(1.0))
      .force("collision", d3.forceCollide(d => sizeScale(d.records) + 1))
      .alphaDecay(0.05)
      .on("tick", () => {
        bubbles
          .attr("cx", d => d.x = Math.max(margin.left + sizeScale(d.records), Math.min(width - margin.right - sizeScale(d.records), d.x)))
          .attr("cy", d => d.y = Math.max(margin.top + sizeScale(d.records), Math.min(height - margin.bottom - sizeScale(d.records), d.y)));
      });

    // Y-axis
    svg.append("g")
      .attr("transform", `translate(${margin.left},0)`)
      .call(d3.axisLeft(yScale).tickFormat(d3.timeFormat("%Y")));

    // Legend
    const legendData = [
      { label: "< 1M Records", color: CONFIG.COLORS.small },
      { label: "1M - 50M Records", color: CONFIG.COLORS.medium },
      { label: "> 50M Records", color: CONFIG.COLORS.large }
    ];

    const legend = svg.append("g")
      .attr("class", "chart-legend")
      .attr("transform", `translate(${width - 190}, ${height - 85})`);

    legend.append("rect")
      .attr("class", "chart-legend-bg")
      .attr("width", 180).attr("height", 75).attr("rx", 5);

    legendData.forEach((d, i) => {
      const g = legend.append("g").attr("transform", `translate(10, ${10 + i * 20})`);
      g.append("rect").attr("class", "legend-swatch").attr("width", 12).attr("height", 12).attr("fill", d.color);
      g.append("text").attr("class", "chart-legend-label").attr("x", 20).attr("y", 10).text(d.label);
    });

  } catch (err) {
    svg.append("text")
      .attr("x", width / 2).attr("y", height / 2)
      .attr("text-anchor", "middle")
      .attr("fill", "currentColor")
      .text(`Error: ${err.message}`);
  }
}

// Initialize
function init() {
  draw();
  window.addEventListener("resize", debounce(draw, CONFIG.DEBOUNCE_DELAY));
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}