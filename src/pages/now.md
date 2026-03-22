---
title: Now
permalink: /now/
---

_Last updated: **{{ page.date | formatDate }}**_

<div id="visitor-info" style="margin-top: 0.5rem; margin-bottom: 2rem; font-style: italic; color: #6b7280; font-size: 0.9em; min-height: 1.5em;">Loading visitor info…</div>

<script>
  (async function() {
    const infoDiv = document.getElementById('visitor-info');
    if (!infoDiv) return;

    try {
      // 1. Get visitor's location via GeoJS (IP-based, no API key)
      const geoRes = await fetch('https://get.geojs.io/v1/ip/geo.json');
      if (!geoRes.ok) throw new Error('Failed to fetch location');
      const geoData = await geoRes.json();

      const city = geoData.city || 'your location';
      const lat = parseFloat(geoData.latitude);
      const lon = parseFloat(geoData.longitude);

      // 2. Format local time using the browser clock (accurate to the user's system)
      const timeString = new Date().toLocaleTimeString(undefined, {
        hour: 'numeric',
        minute: '2-digit'
      });

      // 3. Get weather via Open-Meteo (no API key required)
      if (!isNaN(lat) && !isNaN(lon)) {
        const weatherRes = await fetch(
          `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
          `&current=temperature_2m,weather_code,wind_speed_10m&temperature_unit=celsius&wind_speed_unit=kmh`
        );
        if (weatherRes.ok) {
          const weatherData = await weatherRes.json();
          const current = weatherData.current;
          const temp = Math.round(current.temperature_2m);
          const weatherCode = current.weather_code;

          // WMO weather code mapping
          let weatherDesc = "☁️ Cloudy";
          if (weatherCode === 0)                           weatherDesc = "☀️ Clear";
          else if (weatherCode === 1)                      weatherDesc = "🌤️ Mainly clear";
          else if (weatherCode === 2)                      weatherDesc = "⛅ Partly cloudy";
          else if (weatherCode === 3)                      weatherDesc = "☁️ Overcast";
          else if (weatherCode >= 45 && weatherCode <= 48) weatherDesc = "🌫️ Foggy";
          else if (weatherCode >= 51 && weatherCode <= 55) weatherDesc = "🌦️ Drizzle";
          else if (weatherCode >= 56 && weatherCode <= 57) weatherDesc = "🌧️ Freezing drizzle";
          else if (weatherCode >= 61 && weatherCode <= 65) weatherDesc = "🌧️ Rain";
          else if (weatherCode >= 66 && weatherCode <= 67) weatherDesc = "🌧️ Freezing rain";
          else if (weatherCode >= 71 && weatherCode <= 75) weatherDesc = "❄️ Snow";
          else if (weatherCode === 77)                     weatherDesc = "❄️ Snow grains";
          else if (weatherCode >= 80 && weatherCode <= 82) weatherDesc = "🌧️ Rain showers";
          else if (weatherCode >= 85 && weatherCode <= 86) weatherDesc = "❄️ Snow showers";
          else if (weatherCode === 95)                     weatherDesc = "⛈️ Thunderstorm";
          else if (weatherCode >= 96 && weatherCode <= 99) weatherDesc = "⛈️ Thunderstorm with hail";

          const tempF = Math.round(current.temperature_2m * 9 / 5 + 32);
          infoDiv.textContent = `It's currently ${timeString} and ${temp}°C / ${tempF}°F — ${weatherDesc} in ${city}.`;
          return;
        }
      }

      // Fallback: location only, no weather
      infoDiv.textContent = ` It's currently ${timeString} in ${city}.`;

    } catch (e) {
      // Silently fail — likely blocked by an ad blocker or privacy extension
      infoDiv.textContent = '';
    }
  })();
</script>

This is a <a href="https://nownownow.com/about" target="_blank" rel="noopener noreferrer">/now page</a> — a snapshot of what I'm up to at this point in my life.

- **Business Intelligence Analyst @ Bayer Crop Science** Day-to-day, I'm building out BI tooling for teams to make better operational decisions. Still figuring out a lot as I go, which keeps it interesting.

- **The One Minute Manager** by *Ken Blanchard* Short book, but there's more to chew on than I expected. The One Minute Reprimand section especially made me think about how I give (and receive) feedback.

- **Learning** Communication masterclass with Vinh Giang.

- **Project** Sitting on an ask-me-anything concept. Shipping soon.

- **Personal site** Moving [from WordPress to 11ty](/posts/from-wordpress-to-11ty/). It's been a fun journey so far.