/* F1 Base — Reusable Charts & Data Layer for F1 Race Posts

  Base provides 5 standard charts for every race post:
    1. Final Classification — Gap to Leader (Top 10)
    2. Stint Strategy (Top 10) with VSC/SC overlays
    3. Race Pace (Box Plot)
    4. Drivers' Championship (auto-calculated from API)
    5. Constructors' Championship (auto-calculated from API)

  Race-specific JS files call F1Base.initBaseCharts(config)
  and then layer on any optional per-race analysis.
*/
(function () {
  "use strict";

  const F1Base = {};

  /* Utilities */
  F1Base.getTokens = function () {
    return {
      text2: "var(--color-muted)",
      border: "var(--color-border)",
    };
  };

  F1Base.dims = function (el, { mt = 28, mr = 16, mb = 32, ml = 80 } = {}) {
    const w = el.clientWidth || 400;
    const h = el.clientHeight || 220;
    return { w, h, mt, mr, mb, ml, iw: w - ml - mr, ih: h - mt - mb };
  };

  /* Team Colors */
  F1Base.dynamicTeamColors = {};

  F1Base.getTeamColor = function (teamName) {
    if (!teamName) return "#999999";
    const n = teamName.toLowerCase().trim();
    if (this.dynamicTeamColors[n]) return this.dynamicTeamColors[n];
    for (const key in this.dynamicTeamColors) {
      if (n.includes(key) || key.includes(n)) return this.dynamicTeamColors[key];
    }
    return "#999999";
  };

  /* D3.js */
  F1Base.waitForD3 = function (cb) {
    if (typeof d3 !== "undefined") return cb();
    const iv = setInterval(() => {
      if (typeof d3 !== "undefined") { clearInterval(iv); cb(); }
    }, 100);
  };

  /* Rate-Limited Fetch */
  let lastRequestTime = 0;
  const REQUEST_DELAY_MS = 500;

  F1Base.fetchWithRetry = async function (url, maxRetries = 5) {
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      const now = Date.now();
      const elapsed = now - lastRequestTime;
      if (elapsed < REQUEST_DELAY_MS) {
        await new Promise(r => setTimeout(r, REQUEST_DELAY_MS - elapsed));
      }
      lastRequestTime = Date.now();
      try {
        const res = await fetch(url);
        if (res.status === 429) {
          await new Promise(r => setTimeout(r, 2000));
          continue;
        }
        if (!res.ok) throw new Error("HTTP " + res.status);
        return await res.json();
      } catch (e) {
        if (attempt === maxRetries - 1) throw e;
        await new Promise(r => setTimeout(r, 1000));
      }
    }
    throw new Error("Failed after retries: " + url);
  };

  /* Fetch OpenF1 data */
  F1Base.fetchAllRaceData = async function (year, countryName, sessionName) {
    var _cacheKey = "f1_" + sessionName.toLowerCase() + "_" + year + "_" + countryName.replace(/\s+/g, "_");
    var _cached = window.ApiCache && ApiCache.get(_cacheKey);
    if (_cached) {
      Object.values(_cached.driverMap || {}).forEach(function (d) {
        if (d.team_colour && d.team_name) {
          F1Base.dynamicTeamColors[d.team_name.toLowerCase().trim()] = "#" + d.team_colour;
        }
      });
      return _cached;
    }

    var result = {
      sessionKey: null,
      driverMap: {},
      positions: [],
      gapData: [],
      stintData: [],
      raceControl: [],
      allLaps: [],
      paceData: [],
      totalLaps: 0,
      pitStops: [],
      teamPitData: [],
    };

    try {
      // 0. Pre-fetch latest API team colors
      try {
        var latest = await this.fetchWithRetry(
          "https://api.openf1.org/v1/drivers?session_key=latest"
        );
        latest.forEach(function (d) {
          if (d.team_colour) {
            F1Base.dynamicTeamColors[d.team_name.toLowerCase().trim()] = "#" + d.team_colour;
          }
        });
      } catch (e) {
        // Silently ignore pre-fetch errors
      }

      // 1. Session key
      var sessions = await this.fetchWithRetry(
        "https://api.openf1.org/v1/sessions?year=" + year + "&country_name=" + encodeURIComponent(countryName) + "&session_name=" + encodeURIComponent(sessionName)
      );
      if (!sessions || sessions.length === 0) return result;
      result.session = sessions[0];
      result.sessionKey = sessions[0].session_key;
      var sk = result.sessionKey;

      // 2-7. Fetch all session data in parallel (6 requests → 1 round-trip)
      var _api = "https://api.openf1.org/v1/";
      var _fetches = await Promise.all([
        this.fetchWithRetry(_api + "drivers?session_key=" + sk),
        this.fetchWithRetry(_api + "position?session_key=" + sk),
        this.fetchWithRetry(_api + "intervals?session_key=" + sk),
        this.fetchWithRetry(_api + "stints?session_key=" + sk),
        this.fetchWithRetry(_api + "pit?session_key=" + sk).catch(function () { return []; }),
        this.fetchWithRetry(_api + "race_control?session_key=" + sk),
        this.fetchWithRetry(_api + "laps?session_key=" + sk),
      ]);
      var drivers = _fetches[0];
      var positionsRaw = _fetches[1];
      var intervals = _fetches[2];
      var stints = _fetches[3];
      var pitStops = _fetches[4];
      var rc = _fetches[5];
      var allLaps = _fetches[6];

      // Process drivers
      drivers.forEach(function (d) {
        if (d.team_colour) {
          F1Base.dynamicTeamColors[d.team_name.toLowerCase().trim()] = "#" + d.team_colour;
        }
        result.driverMap[d.driver_number] = d;
      });

      // Process final positions (ISO string comparison avoids Date allocation)
      var finalPos = {};
      positionsRaw.forEach(function (p) {
        if (!finalPos[p.driver_number] || p.date > finalPos[p.driver_number].date) {
          finalPos[p.driver_number] = p;
        }
      });
      result.positions = Object.values(finalPos).sort(function (a, b) { return a.position - b.position; });

      // Process intervals (gap to leader)
      var finalIntervals = {};
      intervals.forEach(function (i) {
        if (i.gap_to_leader !== null &&
          (!finalIntervals[i.driver_number] ||
            i.date > finalIntervals[i.driver_number].date)) {
          finalIntervals[i.driver_number] = i;
        }
      });

      // Build gap data — top 10
      result.positions.forEach(function (p) {
        if (p.position > 10) return;
        var d = result.driverMap[p.driver_number];
        if (!d) return;
        var interval = finalIntervals[p.driver_number];
        var gap = 0;
        var lapped = false;
        if (p.position > 1) {
          if (interval && interval.gap_to_leader != null) {
            var rawGap = interval.gap_to_leader;
            // OpenF1 returns "+1 LAP" as a string for lapped drivers
            if (typeof rawGap === "string" && /lap/i.test(rawGap)) {
              lapped = true;
            } else {
              var gapVal = typeof rawGap === "number" ? rawGap : parseFloat(rawGap);
              if (isNaN(gapVal) || gapVal > 200) {
                lapped = true;
              } else {
                gap = gapVal;
              }
            }
          } else {
            lapped = true;
          }
        }
        result.gapData.push({
          pos: p.position,
          driver: d.name_acronym || d.last_name,
          fullName: d.last_name,
          team: d.team_name,
          gap: gap,
          lapped: lapped,
          color: "#" + (d.team_colour || "999999"),
        });
      });

      // Assign pre-fetched data to result
      result.stintData = stints;
      result.pitStops = pitStops;
      result.raceControl = rc;
      result.allLaps = allLaps;

      // Derive totalLaps: prefer laps data, fall back to stints, then race_control
      var _totalFromLaps = allLaps.length > 0
        ? d3.max(allLaps, function (l) { return l.lap_number; }) || 0
        : 0;
      var _totalFromStints = stints.length > 0
        ? d3.max(stints, function (s) { return s.lap_end || 0; }) || 0
        : 0;
      var _totalFromRC = rc.length > 0
        ? d3.max(rc, function (r) { return r.lap_number || 0; }) || 0
        : 0;
      result.totalLaps = Math.max(_totalFromLaps, _totalFromStints, _totalFromRC);

      // Fastest lap
      var validLaps = allLaps.filter(function (l) {
        return l.lap_duration != null && l.lap_number > 1;
      });
      if (validLaps.length > 0) {
        var fl = validLaps.reduce(function (a, b) { return a.lap_duration < b.lap_duration ? a : b; });
        var flDriver = result.driverMap[fl.driver_number];
        if (flDriver) {
          result.fastestLap = {
            driverNumber: fl.driver_number,
            acronym: flDriver.name_acronym || flDriver.last_name,
            team: flDriver.team_name,
            time: fl.lap_duration,
          };
        }
      }

      // Build race pace box plot data (top 10)
      var scLaps = new Set();
      this._parseSafetyCarPeriods(rc).forEach(function (period) {
        for (var l = period.startLap; l <= period.endLap; l++) scLaps.add(l);
      });

      var top10Numbers = result.positions
        .filter(function (p) { return p.position <= 10; })
        .map(function (p) { return p.driver_number; });

      // Pre-index laps by driver for O(1) lookup instead of full scan per driver
      var lapsByDriver = {};
      allLaps.forEach(function (l) {
        if (!lapsByDriver[l.driver_number]) lapsByDriver[l.driver_number] = [];
        lapsByDriver[l.driver_number].push(l);
      });

      var self = this;
      result.paceData = top10Numbers.map(function (num) {
        var d = result.driverMap[num];
        var driverLaps = (lapsByDriver[num] || [])
          .filter(function (l) {
            return l.lap_number > 1 &&
              l.lap_duration != null &&
              !scLaps.has(l.lap_number) &&
              l.is_pit_out_lap !== true;
          })
          .map(function (l) { return l.lap_duration; })
          .sort(d3.ascending);

        // Remove outliers beyond 1.5 × IQR
        if (driverLaps.length >= 4) {
          var q1 = d3.quantile(driverLaps, 0.25);
          var q3 = d3.quantile(driverLaps, 0.75);
          var iqr = q3 - q1;
          var cleaned = driverLaps.filter(function (t) {
            return t >= q1 - 1.5 * iqr && t <= q3 + 1.5 * iqr;
          });
          if (cleaned.length >= 4) return self._boxStats(d, cleaned);
        }
        return self._boxStats(d, driverLaps);
      }).filter(function (d) { return d.avg > 0; });

      // Build team average pit lane times + per-driver stop details
      var _teamPitMap = {};
      var _selfPit = this;
      result.pitStops.forEach(function (p) {
        if (p.pit_duration == null || p.pit_duration <= 0) return;
        var d = result.driverMap[p.driver_number];
        if (!d || !d.team_name) return;
        var team = d.team_name;
        if (!_teamPitMap[team]) _teamPitMap[team] = { team: team, total: 0, count: 0, drivers: [] };
        _teamPitMap[team].total += p.pit_duration;
        _teamPitMap[team].count += 1;
        _teamPitMap[team].drivers.push({
          acronym: d.name_acronym || d.last_name,
          lap: p.lap_number,
          duration: p.pit_duration,
        });
      });
      result.teamPitData = Object.values(_teamPitMap)
        .filter(function (t) { return t.count > 0; })
        .map(function (t) {
          // Sort driver stops by duration (fastest first)
          t.drivers.sort(function (a, b) { return a.lap - b.lap; });
          return {
            team: t.team,
            avg: t.total / t.count,
            count: t.count,
            drivers: t.drivers,
            color: _selfPit.getTeamColor(t.team),
          };
        })
        .sort(function (a, b) { return a.avg - b.avg; });

      // Build per-driver pit data (for driver pit view)
      var _driverPitMap = {};
      result.pitStops.forEach(function (p) {
        if (p.pit_duration == null || p.pit_duration <= 0) return;
        var d = result.driverMap[p.driver_number];
        if (!d) return;
        var key = p.driver_number;
        if (!_driverPitMap[key]) {
          _driverPitMap[key] = {
            driver: d.name_acronym || d.last_name,
            team: d.team_name,
            total: 0,
            count: 0,
            stops: [],
            color: _selfPit.getTeamColor(d.team_name),
          };
        }
        _driverPitMap[key].total += p.pit_duration;
        _driverPitMap[key].count += 1;
        _driverPitMap[key].stops.push({ lap: p.lap_number, duration: p.pit_duration });
      });
      result.driverPitData = Object.values(_driverPitMap)
        .filter(function (d) { return d.count > 0; })
        .map(function (d) {
          d.stops.sort(function (a, b) { return a.lap - b.lap; });
          d.avg = d.total / d.count;
          return d;
        })
        .sort(function (a, b) { return a.avg - b.avg; });

    } catch (err) {
      // Silently ignore fetch errors
    }

    if (window.ApiCache && result.sessionKey) {
      ApiCache.set(_cacheKey, result, 7 * 24 * 60 * 60 * 1000); // 7 days — race data is immutable
    }
    return result;
  };

  /* Box Plot Stats */
  F1Base._boxStats = function (driver, laps) {
    if (!laps.length) {
      return {
        driver: driver.name_acronym || driver.last_name,
        fullName: driver.last_name, team: driver.team_name,
        avg: 0, q1: 0, median: 0, q3: 0, min: 0, max: 0,
      };
    }
    return {
      driver: driver.name_acronym || driver.last_name,
      fullName: driver.last_name,
      team: driver.team_name,
      avg: d3.mean(laps),
      q1: d3.quantile(laps, 0.25),
      median: d3.quantile(laps, 0.5),
      q3: d3.quantile(laps, 0.75),
      min: laps[0],
      max: laps[laps.length - 1],
    };
  };

  /* Safety Car Period Parser */
  F1Base._parseSafetyCarPeriods = function (raceControl) {
    var periods = [];
    var current = null;

    // Sort ALL events chronologically (ISO string comparison avoids Date allocation)
    var sorted = raceControl.slice().sort(function (a, b) {
      return a.date < b.date ? -1 : a.date > b.date ? 1 : 0;
    });

    sorted.forEach(function (rc) {
      var flag = (rc.flag || "").toUpperCase();
      var msg = (rc.message || "").toUpperCase();
      var txt = flag + " " + msg;
      var lap = rc.lap_number || 0;

      var isVsc = txt.includes("VIRTUAL") || txt.includes("VSC");
      var isSc = !isVsc && (txt.includes("SAFETY CAR") || flag === "SC");

      // VSC/SC Deployment
      if (isVsc && (txt.includes("DEPLOYED") || txt.includes("ACTIVATED"))) {
        if (current) periods.push(Object.assign({}, current));
        current = { type: "VSC", startLap: lap, endLap: lap };

      } else if (isSc && (txt.includes("DEPLOYED") || txt.includes("ACTIVATED"))) {
        if (current) periods.push(Object.assign({}, current));
        current = { type: "SC", startLap: lap, endLap: lap };

        // Ending / Clear
      } else if (current && (
        txt.includes("ENDING") ||
        txt.includes("IN THIS LAP") ||
        txt.includes("TRACK CLEAR") ||
        flag === "GREEN" ||
        flag === "CLEAR"
      )) {
        current.endLap = lap || current.endLap;
        periods.push(Object.assign({}, current));
        current = null;
      }
    });

    if (current) periods.push(current);

    return periods;
  };

  /* Championship Standing */
  F1Base.fetchChampionshipStandings = async function (year, currentSK, currentData) {
    var _standingsKey = "f1_standings_" + year + "_" + currentSK;
    var _cachedStandings = window.ApiCache && ApiCache.get(_standingsKey);
    if (_cachedStandings) {
      return _cachedStandings;
    }

    var RACE_POINTS = { 1: 25, 2: 18, 3: 15, 4: 12, 5: 10, 6: 8, 7: 6, 8: 4, 9: 2, 10: 1 };
    var SPRINT_POINTS = { 1: 8, 2: 7, 3: 6, 4: 5, 5: 4, 6: 3, 7: 2, 8: 1 };
    var driverTotals = {};
    var round = 1;

    try {
      // Cache the sessions lists — stable between loads, but new races get added through the year
      var _sessionsKey = "f1_sessions_" + year;
      var raceSessions = window.ApiCache && ApiCache.get(_sessionsKey);
      if (!raceSessions) {
        raceSessions = await this.fetchWithRetry(
          "https://api.openf1.org/v1/sessions?year=" + year + "&session_name=Race"
        );
        if (window.ApiCache && raceSessions && raceSessions.length) {
          ApiCache.set(_sessionsKey, raceSessions, 6 * 60 * 60 * 1000); // 6 hours
        }
      }

      var _sprintSessionsKey = "f1_sprint_sessions_" + year;
      var sprintSessions = window.ApiCache && ApiCache.get(_sprintSessionsKey);
      if (!sprintSessions) {
        try {
          sprintSessions = await this.fetchWithRetry(
            "https://api.openf1.org/v1/sessions?year=" + year + "&session_name=Sprint"
          );
        } catch (e) { sprintSessions = []; }
        if (window.ApiCache) {
          ApiCache.set(_sprintSessionsKey, sprintSessions || [], 6 * 60 * 60 * 1000);
        }
      }
      if (!sprintSessions) sprintSessions = [];
      if (!raceSessions || !raceSessions.length) return null;

      // Merge Race + Sprint sessions, tag each, sort chronologically
      var allScored = raceSessions.map(function (s) { return Object.assign({}, s, { _isSprint: false }); })
        .concat(sprintSessions.map(function (s) { return Object.assign({}, s, { _isSprint: true }); }));
      allScored.sort(function (a, b) { return a.date_start < b.date_start ? -1 : a.date_start > b.date_start ? 1 : 0; });

      var nowISO = new Date().toISOString();
      var completed = allScored.filter(function (s) { return s.date_start <= nowISO; });

      // Determine round by matching current session's meeting against race calendar
      var sortedRaces = raceSessions.slice().sort(function (a, b) { return a.date_start < b.date_start ? -1 : a.date_start > b.date_start ? 1 : 0; });
      var currentMeeting = null;
      for (var c = 0; c < completed.length; c++) {
        if (completed[c].session_key === currentSK) { currentMeeting = completed[c].meeting_key; break; }
      }
      if (currentMeeting) {
        for (var r = 0; r < sortedRaces.length; r++) {
          if (sortedRaces[r].meeting_key === currentMeeting) { round = r + 1; break; }
        }
      }

      for (var i = 0; i < completed.length; i++) {
        var sk = completed[i].session_key;
        var isCurrent = (sk === currentSK);
        var isSprint = completed[i]._isSprint;
        var POINTS = isSprint ? SPRINT_POINTS : RACE_POINTS;

        try {
          var positions, driverMap, allLaps;

          if (isCurrent) {
            positions = currentData.positions;
            driverMap = currentData.driverMap;
            allLaps = currentData.allLaps;
          } else {
            /* Past session — cache positions+drivers per session key (immutable) */
            var _raceKey = "f1_past_race_" + sk;
            var _raceData = window.ApiCache && ApiCache.get(_raceKey);

            if (_raceData) {
              positions = _raceData.positions;
              driverMap = _raceData.driverMap;
            } else {
              // Fetch positions + drivers in parallel per past session
              var _raceResults = await Promise.all([
                this.fetchWithRetry("https://api.openf1.org/v1/position?session_key=" + sk),
                this.fetchWithRetry("https://api.openf1.org/v1/drivers?session_key=" + sk),
              ]);
              var posRaw = _raceResults[0];
              var finalPos = {};
              posRaw.forEach(function (p) {
                if (!finalPos[p.driver_number] || p.date > finalPos[p.driver_number].date) {
                  finalPos[p.driver_number] = p;
                }
              });
              positions = Object.values(finalPos)
                .sort(function (a, b) { return a.position - b.position; });

              var drivers = _raceResults[1];
              driverMap = {};
              drivers.forEach(function (d) { driverMap[d.driver_number] = d; });

              if (window.ApiCache) {
                ApiCache.set(_raceKey, { positions: positions, driverMap: driverMap }, 7 * 24 * 60 * 60 * 1000);
              }
            }

            allLaps = null; // skip laps fetch for past sessions
          }

          /* Apply points (race or sprint scale) */
          positions.forEach(function (p) {
            var d = driverMap[p.driver_number];
            if (!d) return;
            var pts = POINTS[p.position] || 0;
            if (!driverTotals[p.driver_number]) {
              driverTotals[p.driver_number] = {
                driver: d.name_acronym || d.last_name,
                fullName: d.last_name,
                team: d.team_name,
                pts: 0,
              };
            }
            driverTotals[p.driver_number].driver = d.name_acronym || d.last_name;
            driverTotals[p.driver_number].team = d.team_name;
            driverTotals[p.driver_number].pts += pts;
          });

          /* Fastest-lap bonus — non-sprint current session only */
          if (!isSprint && allLaps && allLaps.length > 0) {
            var fastest = null;
            allLaps.forEach(function (l) {
              if (l.lap_duration != null && l.lap_number > 1) {
                if (!fastest || l.lap_duration < fastest.lap_duration) fastest = l;
              }
            });
            if (fastest) {
              var flPos = positions.find(function (p) {
                return p.driver_number === fastest.driver_number;
              });
              if (flPos && flPos.position <= 10 && driverTotals[fastest.driver_number]) {
                driverTotals[fastest.driver_number].pts += 1;
              }
            }
          }
        } catch (err) {
          // Skip standings quietly
        }
      }
    } catch (err) {
      return null;
    }

    var self = this;
    var driverStandings = Object.values(driverTotals)
      .filter(function (d) { return d.pts > 0; })
      .sort(function (a, b) { return b.pts - a.pts; })
      .map(function (d) { return Object.assign({}, d, { color: self.getTeamColor(d.team) }); });

    var constructorMap = {};
    Object.values(driverTotals).forEach(function (d) {
      if (!constructorMap[d.team]) constructorMap[d.team] = { team: d.team, pts: 0 };
      constructorMap[d.team].pts += d.pts;
    });
    var constructorStandings = Object.values(constructorMap)
      .filter(function (c) { return c.pts > 0; })
      .sort(function (a, b) { return b.pts - a.pts; })
      .map(function (c) { return Object.assign({}, c, { color: self.getTeamColor(c.team) }); });

    var _standingsResult = { round: round, driverStandings: driverStandings, constructorStandings: constructorStandings };
    if (window.ApiCache) {
      ApiCache.set(_standingsKey, _standingsResult, 7 * 24 * 60 * 60 * 1000); // 7 days
    }
    return _standingsResult;
  };

  /* Gap to Leader (Top 10) Chart */
  F1Base.renderGapChart = function (elId, gapData) {
    var el = document.getElementById(elId);
    if (!el || gapData.length === 0) return;
    el.innerHTML = "";

    var TOKENS = this.getTokens();
    var dims = this.dims(el, { ml: 70, mr: 80 });
    var w = dims.w, h = dims.h, mt = dims.mt, mr = dims.mr, mb = dims.mb, ml = dims.ml, iw = dims.iw, ih = dims.ih;

    var svg = d3.select(el).append("svg").attr("width", w).attr("height", h);
    var g = svg.append("g").attr("transform", "translate(" + ml + "," + mt + ")");

    // Only use numeric gaps for scale; lapped drivers get a fixed representation
    var numericGaps = gapData.filter(function (d) { return !d.lapped && d.gap > 0; });
    var maxGap = numericGaps.length > 0 ? d3.max(numericGaps, function (d) { return d.gap; }) : 40;
    var x = d3.scaleLinear().domain([0, maxGap * 1.2]).range([0, iw]);
    var y = d3.scaleBand()
      .domain(gapData.map(function (d) { return d.driver; }))
      .range([0, ih])
      .padding(0.2);

    var self = this;

    g.append("g").attr("class", "grid")
      .call(d3.axisBottom(x).tickSize(ih).tickFormat(""));

    g.append("g").attr("transform", "translate(0," + ih + ")")
      .call(d3.axisBottom(x).ticks(6).tickFormat(function (d) { return "+" + d + "s"; }));

    g.append("g").call(d3.axisLeft(y).tickSize(0).tickPadding(8));

    g.selectAll(".bar").data(gapData).join("rect")
      .attr("class", "bar")
      .attr("x", 0)
      .attr("y", function (d) { return y(d.driver); })
      .attr("height", y.bandwidth())
      .attr("rx", 3)
      .attr("fill", function (d) { return d.color; })
      .attr("opacity", 0.85)
      .attr("width", 0)
      .transition().duration(800).delay(function (_, i) { return i * 60; })
      .attr("width", function (d) {
        if (d.pos === 1) return 3;
        if (d.lapped) return iw * 0.15;
        return x(d.gap);
      });

    g.selectAll(".label").data(gapData).join("text")
      .attr("x", function (d) {
        if (d.pos === 1) return 10;
        if (d.lapped) return iw * 0.15 + 6;
        return x(d.gap) + 6;
      })
      .attr("y", function (d) { return y(d.driver) + y.bandwidth() / 2; })
      .attr("dy", "0.35em")
      .attr("fill", TOKENS.text2)
      .attr("font-size", "11px")
      .text(function (d) {
        if (d.pos === 1) return "WINNER";
        if (d.lapped) return "+1 LAPS";
        return "+" + d.gap.toFixed(1) + "s";
      });

    // Transparent hit targets for tooltips
    g.selectAll(".bar-hit").data(gapData).join("rect")
      .attr("class", "bar-hit")
      .attr("x", 0)
      .attr("y", function (d) { return y(d.driver); })
      .attr("width", iw)
      .attr("height", y.bandwidth())
      .attr("fill", "transparent")
      .on("mousemove", function (event, d) {
        var gapText = "";
        if (d.pos === 1) gapText = "Winner";
        else if (d.lapped) gapText = "+1 LAPS";
        else gapText = "+" + d.gap.toFixed(3) + "s";

        var content =
          '<div style="font-weight:700;margin-bottom:4px;font-size:10px;color:var(--color-muted)">' + d.team.toUpperCase() + '</div>' +
          '<div style="color:var(--color-text)"><strong style="color:' + d.color + '">' + d.driver + '</strong></div>' +
          '<div style="margin-top:6px;line-height:1.4;color:var(--color-text)">' +
          'Gap: <strong>' + gapText + '</strong></div>';
        self.showTooltip(content, event);
      })
      .on("mouseout", function () { self.hideTooltip(); });
  };

  /* Stint Strategy (Top 10) with VSC/SC Chart */
  F1Base.renderStintChart = function (elId, stintData, raceControl, driverMap, positions, totalLaps) {
    var el = document.getElementById(elId);
    if (!el) return;

    var periods = this._parseSafetyCarPeriods(raceControl);
    var top10 = positions.filter(function (p) { return p.position <= 10; });
    var tl = totalLaps || 58;

    var compoundClass = {
      SOFT: "compound--S", MEDIUM: "compound--M", HARD: "compound--H",
      INTERMEDIATE: "compound--I", WET: "compound--W",
    };
    var compoundLabel = {
      SOFT: "Soft", MEDIUM: "Medium", HARD: "Hard",
      INTERMEDIATE: "Inter", WET: "Wet", UNKNOWN: "Unknown",
    };
    var periodColor = { VSC: "#ff3c00", SC: "#ff8d22" };

    // Collect used compounds
    var usedCompounds = new Set();
    var top10Nums = new Set(top10.map(function (p) { return p.driver_number; }));
    stintData.forEach(function (s) {
      if (top10Nums.has(s.driver_number)) usedCompounds.add((s.compound || "UNKNOWN").toUpperCase());
    });

    // Legend
    var html = '<div class="strategy-legend">';
    periods.forEach(function (p) {
      var c = periodColor[p.type] || "#ff3c00";
      var lapRange = p.startLap === p.endLap
        ? "Lap " + p.startLap
        : "Lap " + p.startLap + "–" + p.endLap;
      html += '<div class="strategy-legend__item">' +
        '<div class="strategy-legend__bar" style="background:' + c + '"></div>' +
        '<div><span class="strategy-legend__title" style="color:' + c + '">' + p.type + '</span> ' +
        '<span class="strategy-legend__note">(' + lapRange + ')</span></div></div>';
    });
    html += '<div class="strategy-legend__item strategy-legend__compounds">';
    usedCompounds.forEach(function (c) {
      html += '<div class="strategy-legend__compound"><div class="compound ' + (compoundClass[c] || "compound--UNKNOWN") + '"></div> <span>' + (compoundLabel[c] || c) + '</span></div>';
    });
    html += "</div></div>";

    // Header lap markers
    var markers = [1];
    var step = Math.max(1, Math.round(tl / 6));
    for (var l = step; l < tl; l += step) markers.push(l);
    if (markers[markers.length - 1] !== tl) markers.push(tl);

    html += '<div class="gantt-chart"><div class="gantt-header"><div class="gantt-driver-col"></div><div class="gantt-laps">';
    markers.forEach(function (lap, i) {
      var pct = ((lap - 1) / (tl - 1)) * 100;
      var style = "left:" + pct + "%";
      if (i === 0) style += ";transform:none";
      else if (i === markers.length - 1) style = "left:100%;transform:translateX(-100%)";
      html += '<span style="' + style + '">' + lap + '</span>';
    });
    html += '</div><div class="gantt-stops"></div></div>';

    // Rows
    var self = this;
    top10.forEach(function (p) {
      var d = driverMap[p.driver_number];
      if (!d) return;
      var color = self.getTeamColor(d.team_name);
      var name = d.name_acronym || d.last_name;
      var driverStints = stintData
        .filter(function (s) { return s.driver_number === p.driver_number; })
        .sort(function (a, b) { return a.stint_number - b.stint_number; });
      var stops = Math.max(0, driverStints.length - 1);

      var trackHtml = "";

      // Stint blocks (rendered first so VSC/SC markers sit on top)
      driverStints.forEach(function (s) {
        var startPct = ((s.lap_start - 1) / tl) * 100;
        var endLap = s.lap_end || tl;
        var widthPct = ((endLap - s.lap_start + 1) / tl) * 100;
        var cls = compoundClass[(s.compound || "UNKNOWN").toUpperCase()] || "compound--UNKNOWN";
        var lapCount = endLap - s.lap_start + 1;
        trackHtml += '<div class="gantt-stint ' + cls + '" style="left:' + startPct + '%;width:' + widthPct + '%">' + lapCount + '</div>';
      });

      // VSC/SC vertical markers (rendered after stints so they appear on top)
      periods.forEach(function (period) {
        var startPct = ((period.startLap - 1) / tl) * 100;
        var c = periodColor[period.type] || "#ff3c00";
        trackHtml += '<div class="gantt-vsc" style="left:' + startPct + '%;background:' + c + '"></div>';
      });

      html += '<div class="gantt-row">' +
        '<div class="gantt-driver"><div class="gantt-driver__stripe" style="background:' + color + '"></div>' + name + '</div>' +
        '<div class="gantt-track">' + trackHtml + '</div>' +
        '<div class="gantt-stops">' + stops + ' Stop' + (stops !== 1 ? "s" : "") + '</div></div>';
    });

    html += "</div>";
    el.innerHTML = html;
  };

  /* Race Pace Chart */
  F1Base.renderRacePaceChart = function (elId, paceData) {
    var el = document.getElementById(elId);
    if (!el) return;
    if (!paceData || paceData.length === 0) {
      el.innerHTML = '<div class="chart-message">Lap timing data not available from the API for this session.</div>';
      return;
    }
    el.innerHTML = "";

    var TOKENS = this.getTokens();
    var dims = this.dims(el, { ml: 70, mr: 100, mt: 12, mb: 20 });
    var w = dims.w, h = dims.h, mt = dims.mt, mr = dims.mr, mb = dims.mb, ml = dims.ml, iw = dims.iw, ih = dims.ih;

    var svg = d3.select(el).append("svg").attr("width", w).attr("height", h);
    var g = svg.append("g").attr("transform", "translate(" + ml + "," + mt + ")");

    var minX = d3.min(paceData, function (d) { return d.min; }) - 0.2;
    var maxX = d3.max(paceData, function (d) { return d.max; }) + 1.0;

    var x = d3.scaleLinear().domain([minX, maxX]).range([0, iw]);
    var y = d3.scaleBand()
      .domain(paceData.map(function (d) { return d.driver; }))
      .range([0, ih])
      .padding(0.35);

    g.append("g").attr("class", "grid")
      .call(d3.axisBottom(x).tickSize(ih).tickFormat("").ticks(5))
      .attr("stroke-opacity", 0.1);

    g.append("g").attr("transform", "translate(0," + ih + ")")
      .call(d3.axisBottom(x).ticks(5).tickFormat(function (d) { return "1:" + (d - 60).toFixed(1); }));

    g.append("g").call(d3.axisLeft(y).tickSize(0).tickPadding(8));

    var self = this;

    // Whiskers (min → max)
    g.selectAll(".whisker").data(paceData).join("line")
      .attr("x1", function (d) { return x(d.min); })
      .attr("x2", function (d) { return x(d.max); })
      .attr("y1", function (d) { return y(d.driver) + y.bandwidth() / 2; })
      .attr("y2", function (d) { return y(d.driver) + y.bandwidth() / 2; })
      .attr("stroke", function (d) { return self.getTeamColor(d.team); })
      .attr("stroke-width", 1.5).attr("opacity", 0.5);

    // Box (Q1 → Q3)
    g.selectAll(".box").data(paceData).join("rect")
      .attr("x", function (d) { return x(d.q1); })
      .attr("width", function (d) { return Math.max(0, x(d.q3) - x(d.q1)); })
      .attr("y", function (d) { return y(d.driver); })
      .attr("height", y.bandwidth())
      .attr("fill", function (d) { return self.getTeamColor(d.team); })
      .attr("opacity", 0.2)
      .attr("stroke", function (d) { return self.getTeamColor(d.team); })
      .attr("stroke-width", 1.5)
      .on("mouseover", function () { d3.select(this).attr("opacity", 0.5); })
      .on("mouseout", function () { d3.select(this).attr("opacity", 0.2); F1Base.hideTooltip(); })
      .on("mousemove", function (event, d) {
        var content =
          '<div style="font-weight:700;margin-bottom:4px;font-size:10px;color:var(--color-muted)">' + d.team.toUpperCase() + '</div>' +
          '<div style="color:var(--color-text)"><strong style="color:' + self.getTeamColor(d.team) + '">' + d.driver + '</strong></div>' +
          '<div style="margin-top:6px;line-height:1.4;color:var(--color-text)">' +
          'Avg: <strong>1:' + (d.avg - 60).toFixed(3) + '</strong><br>' +
          'Med: 1:' + (d.median - 60).toFixed(3) + '<br>' +
          'Range: 1:' + (d.min - 60).toFixed(3) + ' – 1:' + (d.max - 60).toFixed(3) + '</div>';
        F1Base.showTooltip(content, event);
      });

    // Median line
    g.selectAll(".median").data(paceData).join("line")
      .attr("x1", function (d) { return x(d.median); })
      .attr("x2", function (d) { return x(d.median); })
      .attr("y1", function (d) { return y(d.driver); })
      .attr("y2", function (d) { return y(d.driver) + y.bandwidth(); })
      .attr("stroke", function (d) { return self.getTeamColor(d.team); })
      .attr("stroke-width", 2);

    // Average dot
    g.selectAll(".average").data(paceData).join("circle")
      .attr("cx", function (d) { return x(d.avg); })
      .attr("cy", function (d) { return y(d.driver) + y.bandwidth() / 2; })
      .attr("r", 3.5)
      .attr("fill", "var(--color-bg)")
      .attr("stroke", function (d) { return self.getTeamColor(d.team); })
      .attr("stroke-width", 2);

    // Whisker end caps
    g.selectAll(".whisker-end")
      .data(paceData.flatMap(function (d) {
        return [
          { val: d.min, driver: d.driver, team: d.team },
          { val: d.max, driver: d.driver, team: d.team },
        ];
      }))
      .join("line")
      .attr("x1", function (d) { return x(d.val); })
      .attr("x2", function (d) { return x(d.val); })
      .attr("y1", function (d) { return y(d.driver) + y.bandwidth() * 0.2; })
      .attr("y2", function (d) { return y(d.driver) + y.bandwidth() * 0.8; })
      .attr("stroke", function (d) { return self.getTeamColor(d.team); })
      .attr("stroke-width", 1.5).attr("opacity", 0.5);

    // Labels
    g.selectAll(".label").data(paceData).join("text")
      .attr("x", function (d) { return x(d.max) + 8; })
      .attr("y", function (d) { return y(d.driver) + y.bandwidth() / 2; })
      .attr("dy", "0.35em")
      .attr("fill", TOKENS.text2)
      .attr("font-size", "11px")
      .text(function (d) { return "1:" + (d.avg - 60).toFixed(3); });
  };

  /* Championship Standing Chart */
  F1Base.renderDriversChart = function (elId, driversData, labelKey) {
    labelKey = labelKey || "driver";
    var el = document.getElementById(elId);
    if (!el || driversData.length === 0) return;
    el.innerHTML = "";

    var TOKENS = this.getTokens();
    var dims = this.dims(el, { ml: 100, mr: 60, mt: 12, mb: 20 });
    var w = dims.w, h = dims.h, mt = dims.mt, mr = dims.mr, mb = dims.mb, ml = dims.ml, iw = dims.iw, ih = dims.ih;

    var svg = d3.select(el).append("svg").attr("width", w).attr("height", h);
    var g = svg.append("g").attr("transform", "translate(" + ml + "," + mt + ")");

    var self = this;

    var x = d3.scaleLinear()
      .domain([0, d3.max(driversData, function (d) { return d.pts; }) * 1.15])
      .range([0, iw]);
    var y = d3.scaleBand()
      .domain(driversData.map(function (d) { return d[labelKey]; }))
      .range([0, ih])
      .padding(0.25);

    g.append("g").attr("class", "grid")
      .call(d3.axisBottom(x).tickSize(ih).tickFormat(""));
    g.append("g").attr("transform", "translate(0," + ih + ")")
      .call(d3.axisBottom(x).ticks(5));
    g.append("g").call(d3.axisLeft(y).tickSize(0).tickPadding(8));

    g.selectAll(".bar").data(driversData).join("rect")
      .attr("x", 0)
      .attr("y", function (d) { return y(d[labelKey]); })
      .attr("height", y.bandwidth())
      .attr("rx", 3)
      .attr("fill", function (d) { return d.color || self.getTeamColor(d.team); })
      .attr("opacity", 0.85)
      .attr("width", 0)
      .transition().duration(700).delay(function (_, i) { return i * 60; })
      .attr("width", function (d) { return x(d.pts); });

    g.selectAll(".label").data(driversData).join("text")
      .attr("x", function (d) { return x(d.pts) + 6; })
      .attr("y", function (d) { return y(d[labelKey]) + y.bandwidth() / 2; })
      .attr("dy", "0.35em")
      .attr("fill", TOKENS.text2)
      .attr("font-size", "11px")
      .text(function (d) { return d.pts; });
  };

  F1Base.renderConstructorsChart = function (elId, data) {
    this.renderDriversChart(elId, data, "team");
  };

  /* Average Pit Lane Time Chart — Team view */

  F1Base.renderPitTimesChart = function (elId, teamPitData) {
    var el = document.getElementById(elId);
    if (!el || !teamPitData || teamPitData.length === 0) return;
    el.innerHTML = "";

    var TOKENS = this.getTokens();
    var dims = this.dims(el, { ml: 130, mr: 130, mt: 12, mb: 30 });
    var w = dims.w, h = dims.h, mt = dims.mt, mr = dims.mr, mb = dims.mb, ml = dims.ml, iw = dims.iw, ih = dims.ih;

    var svg = d3.select(el).append("svg").attr("width", w).attr("height", h);
    var g = svg.append("g").attr("transform", "translate(" + ml + "," + mt + ")");

    var self = this;

    var minVal = d3.min(teamPitData, function (d) { return d.avg; });
    var maxVal = d3.max(teamPitData, function (d) { return d.avg; });
    var pad = Math.max((maxVal - minVal) * 0.4, 0.5);
    var xMin = Math.max(0, minVal - pad);
    var xMax = maxVal + pad * 1.5;

    var x = d3.scaleLinear().domain([xMin, xMax]).range([0, iw]);
    var y = d3.scaleBand()
      .domain(teamPitData.map(function (d) { return d.team; }))
      .range([0, ih])
      .padding(0.3);

    g.append("g").attr("class", "grid")
      .call(d3.axisBottom(x).tickSize(ih).tickFormat("").ticks(5))
      .attr("stroke-opacity", 0.1);

    g.append("g").attr("transform", "translate(0," + ih + ")")
      .call(d3.axisBottom(x).ticks(5).tickFormat(function (d) { return d.toFixed(1) + "s"; }));

    g.append("g").call(d3.axisLeft(y).tickSize(0).tickPadding(8));

    // Bars (animate from xMin baseline)
    g.selectAll(".bar").data(teamPitData).join("rect")
      .attr("class", "bar")
      .attr("x", 0)
      .attr("y", function (d) { return y(d.team); })
      .attr("height", y.bandwidth())
      .attr("rx", 3)
      .attr("fill", function (d) { return d.color; })
      .attr("opacity", 0.85)
      .attr("width", 0)
      .transition().duration(700).delay(function (_, i) { return i * 60; })
      .attr("width", function (d) { return Math.max(2, x(d.avg)); });

    // Value labels
    g.selectAll(".pit-label").data(teamPitData).join("text")
      .attr("class", "pit-label")
      .attr("x", function (d) { return x(d.avg) + 6; })
      .attr("y", function (d) { return y(d.team) + y.bandwidth() / 2; })
      .attr("dy", "0.35em")
      .attr("fill", TOKENS.text2)
      .attr("font-size", "11px")
      .text(function (d) {
        return d.avg.toFixed(2) + "s";
      });

    // Transparent hit targets for tooltips
    g.selectAll(".bar-hit").data(teamPitData).join("rect")
      .attr("class", "bar-hit")
      .attr("x", 0)
      .attr("y", function (d) { return y(d.team); })
      .attr("width", iw)
      .attr("height", y.bandwidth())
      .attr("fill", "transparent")
      .on("mousemove", function (event, d) {
        var content =
          '<div style="font-weight:700;margin-bottom:4px;font-size:10px;color:var(--color-muted)">' + d.team.toUpperCase() + '</div>' +
          '<div style="margin-top:4px;line-height:1.6;color:var(--color-text)">' +
          'Avg pitlane: <strong>' + d.avg.toFixed(3) + 's</strong><br>' +
          'Pit stops: <strong>' + d.count + '</strong></div>';
        if (d.drivers && d.drivers.length > 0) {
          content += '<div style="margin-top:6px;border-top:1px solid var(--color-border);padding-top:6px;line-height:1.5;color:var(--color-text)">';
          d.drivers.forEach(function (dr) {
            content += '<div>' + dr.acronym + ' · Lap ' + dr.lap + ' · <strong>' + dr.duration.toFixed(1) + 's</strong></div>';
          });
          content += '</div>';
        }
        self.showTooltip(content, event);
      })
      .on("mouseout", function () { self.hideTooltip(); });
  };

  /* Pit Lane Time Chart — Driver view (one bar per driver, sorted ASC) */

  F1Base.renderPitTimesDriverChart = function (elId, driverPitData) {
    var el = document.getElementById(elId);
    if (!el || !driverPitData || driverPitData.length === 0) return;
    el.innerHTML = "";

    var TOKENS = this.getTokens();
    var dims = this.dims(el, { ml: 70, mr: 130, mt: 12, mb: 30 });
    var w = dims.w, h = dims.h, mt = dims.mt, mr = dims.mr, mb = dims.mb, ml = dims.ml, iw = dims.iw, ih = dims.ih;

    var svg = d3.select(el).append("svg").attr("width", w).attr("height", h);
    var g = svg.append("g").attr("transform", "translate(" + ml + "," + mt + ")");

    var self = this;

    var minVal = d3.min(driverPitData, function (d) { return d.avg; });
    var maxVal = d3.max(driverPitData, function (d) { return d.avg; });
    var pad = Math.max((maxVal - minVal) * 0.4, 0.5);
    var xMin = Math.max(0, minVal - pad);
    var xMax = maxVal + pad * 1.5;

    var x = d3.scaleLinear().domain([xMin, xMax]).range([0, iw]);
    var y = d3.scaleBand()
      .domain(driverPitData.map(function (d) { return d.driver; }))
      .range([0, ih])
      .padding(0.3);

    g.append("g").attr("class", "grid")
      .call(d3.axisBottom(x).tickSize(ih).tickFormat("").ticks(5))
      .attr("stroke-opacity", 0.1);

    g.append("g").attr("transform", "translate(0," + ih + ")")
      .call(d3.axisBottom(x).ticks(5).tickFormat(function (d) { return d.toFixed(1) + "s"; }));

    g.append("g").call(d3.axisLeft(y).tickSize(0).tickPadding(8));

    // Bars
    g.selectAll(".bar").data(driverPitData).join("rect")
      .attr("class", "bar")
      .attr("x", 0)
      .attr("y", function (d) { return y(d.driver); })
      .attr("height", y.bandwidth())
      .attr("rx", 3)
      .attr("fill", function (d) { return d.color; })
      .attr("opacity", 0.85)
      .attr("width", 0)
      .transition().duration(700).delay(function (_, i) { return i * 60; })
      .attr("width", function (d) { return Math.max(2, x(d.avg) - x(xMin)); });

    // Value labels
    g.selectAll(".pit-label").data(driverPitData).join("text")
      .attr("class", "pit-label")
      .attr("x", function (d) { return x(d.avg) + 6; })
      .attr("y", function (d) { return y(d.driver) + y.bandwidth() / 2; })
      .attr("dy", "0.35em")
      .attr("fill", TOKENS.text2)
      .attr("font-size", "11px")
      .text(function (d) { return d.avg.toFixed(2) + "s"; });

    // Transparent hit targets for tooltips
    g.selectAll(".bar-hit").data(driverPitData).join("rect")
      .attr("class", "bar-hit")
      .attr("x", 0)
      .attr("y", function (d) { return y(d.driver); })
      .attr("width", iw)
      .attr("height", y.bandwidth())
      .attr("fill", "transparent")
      .on("mousemove", function (event, d) {
        var content =
          '<div style="font-weight:700;margin-bottom:2px;font-size:10px;color:var(--color-muted)">' + (d.team || "").toUpperCase() + '</div>' +
          '<div style="font-weight:700;color:' + d.color + '">' + d.driver + '</div>';
        if (d.stops && d.stops.length > 0) {
          content += '<div style="margin-top:6px;line-height:1.6;color:var(--color-text)">';
          d.stops.forEach(function (s) {
            content += '<div>Lap ' + s.lap + ' \u00b7 <strong>' + s.duration.toFixed(3) + 's</strong></div>';
          });
          content += '</div>';
        }
        if (d.count > 1) {
          content += '<div style="margin-top:4px;color:var(--color-muted);font-size:10px">Avg: ' + d.avg.toFixed(3) + 's (' + d.count + ' stops)</div>';
        }
        self.showTooltip(content, event);
      })
      .on("mouseout", function () { self.hideTooltip(); });
  };
  F1Base.colorizeDriverCards = function (containerId) {
    var el = document.getElementById(containerId);
    if (!el) return;
    el.querySelectorAll(".driver-card").forEach(function (card) {
      var teamEl = card.querySelector(".driver-card__team");
      if (teamEl) {
        card.style.borderLeftColor = F1Base.getTeamColor(teamEl.textContent.trim());
      }
    });
  };

  F1Base.colorizeHeroStats = function () {
    document.querySelectorAll(".hero-stat").forEach(function (stat) {
      var team = stat.getAttribute("data-team");
      if (!team) return;
      var value = stat.querySelector(".hero-stat__value");
      if (value) value.style.color = F1Base.getTeamColor(team);
    });
  };

  // Cached tooltip reference — avoids repeated getElementById on every mouse event
  var _tooltipEl = null;

  F1Base.setupTooltip = function () {
    if (_tooltipEl && _tooltipEl.parentNode) return _tooltipEl;
    _tooltipEl = document.getElementById("chart-tooltip");
    if (!_tooltipEl) {
      _tooltipEl = document.createElement("div");
      _tooltipEl.id = "chart-tooltip";
      _tooltipEl.className = "chart-tooltip";
      document.body.appendChild(_tooltipEl);
    }
    return _tooltipEl;
  };

  F1Base.showTooltip = function (content, event) {
    var tt = this.setupTooltip();
    tt.innerHTML = content;
    tt.style.visibility = "visible";
    tt.style.left = (event.pageX + 10) + "px";
    tt.style.top = (event.pageY + 10) + "px";
  };

  F1Base.moveTooltip = function (event) {
    if (!_tooltipEl) return;
    _tooltipEl.style.left = (event.pageX + 10) + "px";
    _tooltipEl.style.top = (event.pageY + 10) + "px";
  };

  F1Base.hideTooltip = function () {
    if (_tooltipEl) _tooltipEl.style.visibility = "hidden";
  };

  /* Hero Stats */
  F1Base.populateHeroStats = function (data) {
    var winnerEl = document.getElementById("hero-winner");
    if (winnerEl && data.gapData && data.gapData.length > 0) {
      var winner = data.gapData[0];
      winnerEl.setAttribute("data-team", winner.team);
      var v = winnerEl.querySelector(".hero-stat__value");
      if (v) v.textContent = winner.driver;
    }

    var flEl = document.getElementById("hero-fastest-lap");
    if (flEl && data.fastestLap) {
      var fl = data.fastestLap;
      flEl.setAttribute("data-team", fl.team);
      var mins = Math.floor(fl.time / 60);
      var secs = (fl.time % 60).toFixed(3);
      if (parseFloat(secs) < 10) secs = "0" + secs;
      var fv = flEl.querySelector(".hero-stat__value");
      if (fv) fv.textContent = fl.acronym;
      var flLabel = flEl.querySelector(".hero-stat__label");
      if (flLabel) flLabel.innerHTML = '<span style="color:#B114FF;font-weight:800">Fastest Lap</span> \u00B7 ' + mins + ":" + secs;
    }

    var lapsEl = document.getElementById("hero-laps");
    if (lapsEl && data.totalLaps) {
      var lv = lapsEl.querySelector(".hero-stat__value");
      if (lv) lv.textContent = data.totalLaps;
    }

    this.colorizeHeroStats();
  };

  /* Race Header ─ populate round · circuit · date */
  F1Base.populateRaceHeader = function (data, round) {
    var el = document.getElementById("race-header");
    if (!el || !data.session) return;
    var s = data.session;
    var d = new Date(s.date_start);
    var dateStr = d.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
    var parts = [];
    if (round) parts.push("Round " + round);
    if (s.session_name && s.session_name !== "Race") parts.push(s.session_name);
    if (s.circuit_short_name) parts.push(s.circuit_short_name);
    if (s.location) parts.push(s.location);
    parts.push(dateStr);
    el.textContent = parts.join(" \u00B7 ");
  };

  /* Next Race — fetch from sessions API */
  F1Base.populateNextRace = async function (year, currentSessionKey, currentSessionDate) {
    var titleEl = document.getElementById("next-race-title");
    var metaEl = document.getElementById("next-race-meta");
    if (!titleEl && !metaEl) return;
    try {
      var sessions = await this.fetchWithRetry(
        "https://api.openf1.org/v1/sessions?year=" + year + "&session_name=Race"
      );
      sessions.sort(function (a, b) { return new Date(a.date_start) - new Date(b.date_start); });
      var idx = sessions.findIndex(function (s) { return s.session_key === currentSessionKey; });
      var next, round;
      if (idx !== -1 && idx + 1 < sessions.length) {
        next = sessions[idx + 1];
        round = idx + 2;
      } else if (idx === -1 && currentSessionDate) {
        // Current session is not a Race (e.g. Sprint) — find next Race after it
        for (var j = 0; j < sessions.length; j++) {
          if (sessions[j].date_start > currentSessionDate) {
            next = sessions[j];
            round = j + 1;
            break;
          }
        }
      }
      if (next) {
        var d = new Date(next.date_start);
        var dateStr = d.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
        if (titleEl) titleEl.textContent = "Round " + round + " \u2014 " + next.country_name + " Grand Prix";
        if (metaEl) metaEl.textContent = next.circuit_short_name + " \u00B7 " + dateStr;
      } else {
        if (titleEl) titleEl.textContent = "Season Complete";
        if (metaEl) metaEl.textContent = "";
      }
    } catch (e) {
      // Ignore errors when fetching next race session
    }
  };

  /* Main Init */
  F1Base.initBaseCharts = async function (config) {
    var ids = Object.assign({
      gap: "chart-gap",
      stint: "chart-stint",
      pace: "chart-pace",
      pitTimes: "chart-pit-times",
      drivers: "chart-drivers",
      constructors: "chart-constructors",
    }, config.chartIds || {});

    // Loading skeleton
    Object.values(ids).forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.innerHTML = '<div class="chart-skeleton">Loading race data...</div>';
    });

    // 1. Fetch OpenF1 race data (session_name defaults to "Race"; pass "Sprint" for sprints)
    var data = await this.fetchAllRaceData(config.year, config.country, config.sessionName);
    var totalLaps = config.totalLaps || data.totalLaps || 58;

    // 2. Gap to leader (top 10)
    this.renderGapChart(ids.gap, data.gapData);

    // 3. Stint strategy (top 10)
    this.renderStintChart(ids.stint, data.stintData, data.raceControl,
      data.driverMap, data.positions, totalLaps);

    // 4. Race pace box plot
    this.renderRacePaceChart(ids.pace, data.paceData);

    // 4b. Pit lane time — team or driver view
    if (config.pitView === "driver") {
      this.renderPitTimesDriverChart(ids.pitTimes, data.driverPitData);
    } else {
      this.renderPitTimesChart(ids.pitTimes, data.teamPitData);
    }

    // 5. Championship standings (auto-calculated from API)
    if (data.sessionKey) {
      var standings = await this.fetchChampionshipStandings(config.year, data.sessionKey, data);
      if (standings) {
        data._round = standings.round;
        data._driverStandings = standings.driverStandings;
        data._constructorStandings = standings.constructorStandings;
        this.renderDriversChart(ids.drivers, standings.driverStandings);
        this.renderConstructorsChart(ids.constructors, standings.constructorStandings);
        this.populateRaceHeader(data, standings.round);
      }
    }

    // Hero stats + next race (next race is non-blocking)
    this.populateHeroStats(data);
    this.populateNextRace(config.year, data.sessionKey, data.session && data.session.date_start);

    // Stash metadata for resize / race-specific access
    data._totalLaps = totalLaps;
    data._ids = ids;
    data._config = config;

    return data;
  };

  /* Resize handler — re-renders all base charts */
  F1Base.handleResize = function (data) {
    if (!data || !data._ids) return;
    var ids = data._ids;
    var totalLaps = data._totalLaps || 58;

    this.renderGapChart(ids.gap, data.gapData);
    this.renderStintChart(ids.stint, data.stintData, data.raceControl,
      data.driverMap, data.positions, totalLaps);
    this.renderRacePaceChart(ids.pace, data.paceData);
    if (data._config && data._config.pitView === "driver") {
      this.renderPitTimesDriverChart(ids.pitTimes, data.driverPitData);
    } else {
      this.renderPitTimesChart(ids.pitTimes, data.teamPitData);
    }

    // Re-render championship from cached standings
    if (data._driverStandings) {
      this.renderDriversChart(ids.drivers, data._driverStandings);
    }
    if (data._constructorStandings) {
      this.renderConstructorsChart(ids.constructors, data._constructorStandings);
    }
  };

  window.F1Base = F1Base;
})();
