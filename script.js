const CHART_LIMITS = {
  songs: 100,
  albums: 25,
  videos: 25,
  streaming: 50,
  sales: 25,
  radio: 25
};

const CHART_LABELS = {
  songs: "Songs Chart",
  albums: "Albums Chart",
  videos: "Music Videos Chart",
  streaming: "SW Music Streaming Chart",
  sales: "Sales Chart",
  radio: "Global Airplay Chart"
};

const SHORT_CHART_LABELS = {
  songs: "Songs",
  albums: "Albums",
  videos: "Videos",
  streaming: "Streaming",
  sales: "Sales",
  radio: "Radio"
};

const METRIC_LABELS = {
  songs: "points",
  albums: "units",
  videos: "views",
  streaming: "streams",
  sales: "sales",
  radio: "audience"
};

const ARTIST_NAME_FIXES = {
  "ariana grand": "Ariana Grande",
  "arianna grande": "Ariana Grande"
};

const ARTIST_SPLIT_EXCEPTIONS = [
  "Tyler, The Creator",
  "Earth, Wind & Fire",
  "Marina and the Diamonds",
  "Florence + The Machine",
  "Chloe x Halle"
];

let allRows = [];
let validWeeks = [];
let weekLists = {};
let selectedArtistChart = "songs";

function clean(value) {
  return value === undefined || value === null
    ? ""
    : String(value).replaceAll('"', "").trim();
}

function escapeHTML(value) {
  return clean(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeRegExp(value) {
  return clean(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeText(value) {
  return clean(value).toLowerCase().replace(/\s+/g, " ");
}

function fixArtistName(name) {
  const cleaned = clean(name).replace(/\s+/g, " ");
  const key = normalizeText(cleaned);

  return ARTIST_NAME_FIXES[key] || cleaned;
}

function parsePosition(value) {
  const cleaned = clean(value).replace(/[^0-9]/g, "");
  return cleaned ? Number(cleaned) : NaN;
}

function metricToNumber(value) {
  const text = clean(value).toUpperCase().replace(/,/g, "");
  const match = text.match(/[-+]?\d*\.?\d+/);

  if (!match) return 0;

  let number = Number(match[0]);

  if (Number.isNaN(number)) return 0;

  if (text.includes("B")) number *= 1000000000;
  else if (text.includes("M")) number *= 1000000;
  else if (text.includes("K")) number *= 1000;

  return number;
}

function shortNumber(number, preferredUnit = "auto") {
  if (!number || Number.isNaN(number)) return "";

  if (preferredUnit === "M") {
    return `${(number / 1000000).toFixed(1).replace(".0", "")}M`;
  }

  if (preferredUnit === "K") {
    return `${(number / 1000).toFixed(1).replace(".0", "")}K`;
  }

  if (number >= 1000000000) {
    return `${(number / 1000000000).toFixed(1).replace(".0", "")}B`;
  }

  if (number >= 1000000) {
    return `${(number / 1000000).toFixed(1).replace(".0", "")}M`;
  }

  if (number >= 1000) {
    return `${(number / 1000).toFixed(1).replace(".0", "")}K`;
  }

  return number.toLocaleString();
}

function formatMetric(item) {
  const label = METRIC_LABELS[item.chartType] || "points";
  const number = item.metricNumber || metricToNumber(item.metricRaw);

  if (!number) return "";

  if (item.chartType === "radio") {
    return `${shortNumber(number, "M")} ${label}`;
  }

  if (item.chartType === "sales") {
    return `${shortNumber(number, "K")} ${label}`;
  }

  if (item.chartType === "streaming") {
    return `${shortNumber(number, "M")} ${label}`;
  }

  return `${shortNumber(number)} ${label}`;
}

function getChartType() {
  return document.body.dataset.chart || "songs";
}

function makeKey(title, artist) {
  return `${normalizeText(title)}|${normalizeText(artist)}`;
}

function makeEntryKey(item) {
  return `${item.chartType}|${normalizeText(item.title)}|${normalizeText(item.artistRaw)}`;
}

function makeId(title, artist) {
  return `${title}-${artist}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function artistURL(artist) {
  return `artists.html?artist=${encodeURIComponent(clean(artist))}`;
}

function splitFullName(fullName) {
  const text = clean(fullName);

  if (text.includes("\n")) {
    const parts = text.split("\n").map(clean).filter(Boolean);

    if (parts.length >= 2) {
      return {
        title: parts[0],
        artist: parts.slice(1).join(" ")
      };
    }
  }

  if (text.includes(" - ")) {
    const parts = text.split(" - ");

    if (parts.length >= 2) {
      return {
        title: clean(parts[0]),
        artist: clean(parts.slice(1).join(" - "))
      };
    }
  }

  return {
    title: text,
    artist: ""
  };
}

function splitArtists(rawArtist) {
  let text = clean(rawArtist).replace(/\s+/g, " ");

  if (!text) return [];

  const protectedNames = new Map();

  ARTIST_SPLIT_EXCEPTIONS.forEach((name, index) => {
    const token = `__ARTIST_EXCEPTION_${index}__`;
    const regex = new RegExp(escapeRegExp(name), "gi");

    if (regex.test(text)) {
      text = text.replace(regex, token);
      protectedNames.set(token, name);
    }
  });

  text = text
    .replace(/\s*\((feat\.?|ft\.?|featuring)\s+([^)]+)\)/gi, " & $2")
    .replace(/\s+(feat\.?|ft\.?|featuring)\s+/gi, " & ")
    .replace(/\s+with\s+/gi, " & ")
    .replace(/\s+x\s+/gi, " & ")
    .replace(/\s*\/\s*/g, " & ");

  const parts = text
    .split(/\s*(?:&|\+|,)\s*/)
    .map(part => protectedNames.get(part) || part)
    .map(fixArtistName)
    .filter(Boolean);

  const unique = [];

  parts.forEach(artist => {
    const key = normalizeText(artist);

    if (!unique.some(existing => normalizeText(existing) === key)) {
      unique.push(artist);
    }
  });

  return unique;
}

function artistMatches(item, artist) {
  const artistKey = normalizeText(artist);

  return item.artistCredits.some(credit => {
    return normalizeText(credit) === artistKey;
  });
}

async function loadCSV(url, chartType) {
  const finalUrl = url.includes("?")
    ? `${url}&cache=${Date.now()}`
    : `${url}?cache=${Date.now()}`;

  const response = await fetch(finalUrl);
  const text = await response.text();
  const parsed = Papa.parse(text, { skipEmptyLines: true });

  return parsed.data
    .map((row, index) => {
      const fromFullName = splitFullName(row[2]);

      const title = clean(row[5]) || fromFullName.title;
      const artistRaw = clean(row[6]) || fromFullName.artist;

      const metricRaw =
        chartType === "streaming" || chartType === "sales" || chartType === "radio"
          ? clean(row[9])
          : clean(row[3]);

      return {
        index,
        chartType,
        week: clean(row[0]),
        position: parsePosition(row[1]),
        fullName: clean(row[2]),
        metricRaw,
        metricNumber: metricToNumber(metricRaw),
        title,
        artistRaw,
        artistCredits: splitArtists(artistRaw),
        cover: clean(row[8]),
        audio: chartType === "songs" ? clean(row[9]) : ""
      };
    })
    .filter(item => {
      return (
        item.week &&
        !Number.isNaN(item.position) &&
        item.position > 0 &&
        item.title &&
        item.artistRaw &&
        item.artistCredits.length > 0
      );
    });
}

function getValidWeeks(rows) {
  const counts = {};

  rows.forEach(item => {
    counts[item.week] = (counts[item.week] || 0) + 1;
  });

  const weeks = [];

  rows.forEach(item => {
    if (!weeks.includes(item.week) && counts[item.week] >= 5) {
      weeks.push(item.week);
    }
  });

  return weeks.reverse();
}

function rebuildWeekLists() {
  weekLists = {};

  Object.keys(SHEETS).forEach(chartType => {
    const rows = allRows.filter(item => item.chartType === chartType);
    weekLists[chartType] = getValidWeeks(rows);
  });
}

function getWeekIndex(item) {
  const list = weekLists[item.chartType] || validWeeks || [];
  const index = list.indexOf(item.week);

  return index === -1 ? 999999 : index;
}

function getPreviousWeek(currentWeek) {
  const index = validWeeks.indexOf(currentWeek);
  return validWeeks[index + 1] || null;
}

function getMovement(currentItem, previousRows) {
  const currentKey = makeKey(currentItem.title, currentItem.artistRaw);

  const previous = previousRows.find(item => {
    return makeKey(item.title, item.artistRaw) === currentKey;
  });

  const currentWeekIndex = validWeeks.indexOf(currentItem.week);

  const appearedBefore = allRows.some(item => {
    const itemWeekIndex = validWeeks.indexOf(item.week);

    return (
      makeKey(item.title, item.artistRaw) === currentKey &&
      itemWeekIndex > currentWeekIndex
    );
  });

  if (!previous && appearedBefore) return "RE-ENTRY";
  if (!previous) return "NEW";
  if (currentItem.position < previous.position) return `▲ ${previous.position - currentItem.position}`;
  if (currentItem.position > previous.position) return `▼ ${currentItem.position - previous.position}`;

  return "▬";
}

function getMovementClass(movement) {
  if (movement.includes("▲")) return "up";
  if (movement.includes("▼")) return "down";
  if (movement === "NEW") return "new";
  if (movement === "RE-ENTRY") return "reentry";

  return "same";
}

function getChartRun(title, artistRaw) {
  const itemKey = makeKey(title, artistRaw);

  const run = allRows
    .filter(item => makeKey(item.title, item.artistRaw) === itemKey)
    .sort((a, b) => getWeekIndex(b) - getWeekIndex(a));

  if (run.length === 0) {
    return `<span>No chart history found.</span>`;
  }

  return run
    .map(item => {
      return `<span>${escapeHTML(item.week)}: #${escapeHTML(item.position)}</span>`;
    })
    .join("");
}

function renderArtistLinks(item) {
  return item.artistCredits
    .map(artist => {
      return `<a class="artist-link" href="${artistURL(artist)}">${escapeHTML(artist)}</a>`;
    })
    .join(`<span class="artist-separator"> & </span>`);
}

function renderChart(week) {
  const chartType = getChartType();
  const limit = CHART_LIMITS[chartType] || 100;
  const previousWeek = getPreviousWeek(week);

  const currentRows = allRows
    .filter(item => item.week === week)
    .sort((a, b) => a.position - b.position);

  const limitedRows = currentRows.slice(0, limit);
  const previousRows = previousWeek ? allRows.filter(item => item.week === previousWeek) : [];

  const chart = document.getElementById("chart");
  const chartCount = document.getElementById("chartCount");

  if (!chart) return;

  chart.innerHTML = "";

  if (chartCount) {
    chartCount.textContent = `${limitedRows.length} entries · Week of ${week}`;
  }

  limitedRows.forEach(item => {
    const id = makeId(item.title, item.artistRaw);
    const metric = formatMetric(item);
    const movement = getMovement(item, previousRows);
    const movementClass = getMovementClass(movement);

    chart.innerHTML += `
      <article class="chart-row">
        <div class="rank">#${escapeHTML(item.position)}</div>

        <div class="cover-wrap">
          ${
            item.cover
              ? `<img class="cover" src="${escapeHTML(item.cover)}" alt="${escapeHTML(item.title)} cover" onerror="this.style.display='none'">`
              : `<div class="cover placeholder"></div>`
          }

          ${
            item.audio
              ? `<button class="play-button" data-audio="${escapeHTML(item.audio)}" aria-label="Play preview">▶</button>`
              : ""
          }
        </div>

        <div class="song-info">
          <h3>${escapeHTML(item.title)}</h3>
          <div class="artist-credit-line">${renderArtistLinks(item)}</div>
          ${metric ? `<small>${escapeHTML(metric)}</small>` : ""}
        </div>

        <div class="movement ${movementClass}">${escapeHTML(movement)}</div>

        <button class="expand-button" data-run="run-${id}">+</button>
      </article>

      <div class="chart-run" id="run-${id}">
        ${getChartRun(item.title, item.artistRaw)}
      </div>
    `;
  });

  activateButtons();
}

function activateButtons() {
  const audioPlayer = document.getElementById("audioPlayer");

  document.querySelectorAll(".play-button").forEach(button => {
    button.addEventListener("click", event => {
      event.preventDefault();
      event.stopPropagation();

      if (!audioPlayer) return;

      const audioUrl = button.dataset.audio;

      if (!audioUrl) return;

      if (audioPlayer.src === audioUrl && !audioPlayer.paused) {
        audioPlayer.pause();
        return;
      }

      audioPlayer.src = audioUrl;
      audioPlayer.play();
    });
  });

  document.querySelectorAll(".expand-button").forEach(button => {
    button.addEventListener("click", event => {
      event.preventDefault();
      event.stopPropagation();

      const runId = button.dataset.run;
      const runBox = document.getElementById(runId);

      if (!runBox) return;

      runBox.classList.toggle("open");
      button.textContent = runBox.classList.contains("open") ? "−" : "+";
    });
  });
}

async function initChartPage() {
  try {
    const chartType = getChartType();
    const sheetUrl = SHEETS[chartType];

    if (!sheetUrl) {
      throw new Error(`No Google Sheets link found for ${chartType}`);
    }

    allRows = await loadCSV(sheetUrl, chartType);
    validWeeks = getValidWeeks(allRows);
    weekLists[chartType] = validWeeks;

    const select = document.getElementById("weekSelect");

    if (!select) return;

    select.innerHTML = "";

    validWeeks.forEach(week => {
      select.innerHTML += `<option value="${escapeHTML(week)}">${escapeHTML(week)}</option>`;
    });

    select.addEventListener("change", () => {
      renderChart(select.value);
    });

    const pageTitle = document.querySelector(".chart-top h2");

    if (pageTitle) {
      pageTitle.textContent = CHART_LABELS[chartType] || "Chart";
    }

    if (validWeeks.length > 0) {
      renderChart(validWeeks[0]);
    }
  } catch (error) {
    const chart = document.getElementById("chart");

    if (chart) {
      chart.innerHTML = `
        <div class="error">
          <h3>Chart could not load.</h3>
          <p>Check your Google Sheets CSV link and make sure the file is published to web.</p>
        </div>
      `;
    }

    console.error(error);
  }
}

async function loadAllArtistRows() {
  const entries = Object.entries(SHEETS);

  const results = await Promise.all(
    entries.map(([chartType, url]) => {
      return loadCSV(url, chartType).catch(error => {
        console.error(`Could not load ${chartType}`, error);
        return [];
      });
    })
  );

  allRows = results.flat();
  rebuildWeekLists();
}

function getArtistNames() {
  const map = new Map();

  allRows.forEach(item => {
    item.artistCredits.forEach(artist => {
      const fixed = fixArtistName(artist);
      const key = normalizeText(fixed);

      if (fixed && !map.has(key)) {
        map.set(key, fixed);
      }
    });
  });

  return Array.from(map.values()).sort((a, b) => a.localeCompare(b));
}

function populateArtistDropdown(selectedArtist = "") {
  const artistSelect = document.getElementById("artistSelect");

  if (!artistSelect) return;

  const artists = getArtistNames();

  artistSelect.innerHTML = `<option value="">Choose an artist...</option>`;

  artists.forEach(artist => {
    const selected =
      normalizeText(artist) === normalizeText(selectedArtist)
        ? "selected"
        : "";

    artistSelect.innerHTML += `
      <option value="${escapeHTML(artist)}" ${selected}>${escapeHTML(artist)}</option>
    `;
  });
}

function getAvailableChartsForArtist(artist) {
  return Object.keys(SHEETS).filter(chartType => {
    return allRows.some(item => {
      return item.chartType === chartType && artistMatches(item, artist);
    });
  });
}

function buildArtistEntries(artist, chartType) {
  const rows = allRows.filter(item => {
    return item.chartType === chartType && artistMatches(item, artist);
  });

  const entryMap = new Map();

  rows.forEach(item => {
    const key = makeEntryKey(item);

    if (!entryMap.has(key)) {
      entryMap.set(key, {
        chartType: item.chartType,
        title: item.title,
        artistRaw: item.artistRaw,
        artistCredits: item.artistCredits,
        cover: item.cover,
        rows: []
      });
    }

    const entry = entryMap.get(key);

    entry.rows.push(item);

    if (!entry.cover && item.cover) {
      entry.cover = item.cover;
    }
  });

  const entries = Array.from(entryMap.values()).map(entry => {
    const rowsOldestFirst = [...entry.rows].sort((a, b) => {
      return getWeekIndex(b) - getWeekIndex(a);
    });

    const debutRow = rowsOldestFirst[0];

    const bestPeak = Math.min(...entry.rows.map(row => row.position));

    const peakRows = entry.rows
      .filter(row => row.position === bestPeak)
      .sort((a, b) => getWeekIndex(b) - getWeekIndex(a));

    const peakRow = peakRows[0];

    const newestRow = [...entry.rows].sort((a, b) => {
      return getWeekIndex(a) - getWeekIndex(b);
    })[0];

    return {
      ...entry,
      debutDate: debutRow ? debutRow.week : "—",
      peakDate: peakRow ? peakRow.week : "—",
      bestPeak,
      weeksAtPeak: peakRows.length,
      totalWeeks: entry.rows.length,
      latestPosition: newestRow ? newestRow.position : "—",
      totalMetric: entry.rows.reduce((sum, row) => sum + (row.metricNumber || 0), 0)
    };
  });

  return entries.sort((a, b) => {
    if (a.bestPeak !== b.bestPeak) return a.bestPeak - b.bestPeak;
    if (b.weeksAtPeak !== a.weeksAtPeak) return b.weeksAtPeak - a.weeksAtPeak;
    if (b.totalWeeks !== a.totalWeeks) return b.totalWeeks - a.totalWeeks;
    return b.totalMetric - a.totalMetric;
  });
}

function getArtistStats(artist, chartType) {
  const entries = buildArtistEntries(artist, chartType);
  const totalChartWeeks = entries.reduce((sum, entry) => sum + entry.totalWeeks, 0);
  const numberOnes = entries.filter(entry => entry.bestPeak === 1).length;
  const bestPeak = entries.length ? Math.min(...entries.map(entry => entry.bestPeak)) : "—";

  return {
    entries,
    numberOnes,
    chartDebuts: entries.length,
    totalChartWeeks,
    bestPeak
  };
}

function updateArtistURL(artist, chartType) {
  if (!artist) {
    window.history.replaceState({}, "", "artists.html");
    return;
  }

  const url = `artists.html?artist=${encodeURIComponent(artist)}&chart=${encodeURIComponent(chartType)}`;
  window.history.replaceState({}, "", url);
}

function renderArtistChartButtons(artist, activeChartType) {
  const availableCharts = getAvailableChartsForArtist(artist);

  if (availableCharts.length === 0) return "";

  return `
    <div class="artist-chart-tabs">
      ${availableCharts.map(chartType => `
        <button
          class="artist-chart-tab ${chartType === activeChartType ? "active" : ""}"
          data-artist-chart="${escapeHTML(chartType)}"
        >
          ${escapeHTML(SHORT_CHART_LABELS[chartType] || chartType)}
        </button>
      `).join("")}
    </div>
  `;
}

function renderArtistProfile(artist, chartType = selectedArtistChart) {
  const profile = document.getElementById("artistProfile");

  if (!profile) return;

  if (!artist) {
    profile.innerHTML = `
      <div class="artist-profile-card">
        <h2>Choose an artist</h2>
        <p>Select an artist from the dropdown to see their chart history.</p>
      </div>
    `;

    return;
  }

  const availableCharts = getAvailableChartsForArtist(artist);

  if (availableCharts.length === 0) {
    profile.innerHTML = `
      <div class="artist-profile-card">
        <h2>Artist not found</h2>
        <p>This artist has not charted yet based on the current data.</p>
      </div>
    `;

    return;
  }

  if (!availableCharts.includes(chartType)) {
    chartType = availableCharts[0];
  }

  selectedArtistChart = chartType;

  const stats = getArtistStats(artist, chartType);
  const chartLabel = CHART_LABELS[chartType] || chartType;

  profile.innerHTML = `
    <div class="artist-profile-card">
      <h2>${escapeHTML(artist)}</h2>
      <p class="artist-subtitle">Viewing ${escapeHTML(chartLabel)}</p>

      ${renderArtistChartButtons(artist, chartType)}

      <div class="artist-stats-grid">
        <div>
          <strong>${escapeHTML(stats.numberOnes)}</strong>
          <span>Different #1s</span>
        </div>

        <div>
          <strong>${escapeHTML(stats.chartDebuts)}</strong>
          <span>Chart Debuts</span>
        </div>

        <div>
          <strong>${escapeHTML(stats.totalChartWeeks)}</strong>
          <span>Total Chart Weeks</span>
        </div>

        <div>
          <strong>#${escapeHTML(stats.bestPeak)}</strong>
          <span>Best Peak</span>
        </div>
      </div>

      <h3>Best Performing Entries</h3>

      <div class="artist-entry-list">
        ${
          stats.entries.length
            ? stats.entries.map(entry => `
              <article class="artist-entry">
                ${
                  entry.cover
                    ? `<img src="${escapeHTML(entry.cover)}" alt="${escapeHTML(entry.title)} cover" onerror="this.style.display='none'">`
                    : `<div class="artist-entry-cover"></div>`
                }

                <div class="artist-entry-main">
                  <h4>${escapeHTML(entry.title)}</h4>
                  <p>${escapeHTML(entry.artistRaw)}</p>

                  <div class="artist-entry-dates">
                    <span>Debut: ${escapeHTML(entry.debutDate)}</span>
                    <span>Peak date: ${escapeHTML(entry.peakDate)}</span>
                  </div>
                </div>

                <div class="artist-entry-numbers">
                  <strong>#${escapeHTML(entry.bestPeak)}</strong>
                  <span>${escapeHTML(entry.weeksAtPeak)} weeks at peak</span>
                  <span>${escapeHTML(entry.totalWeeks)} total weeks</span>
                </div>
              </article>
            `).join("")
            : `<p class="empty-message">No entries found for this chart.</p>`
        }
      </div>
    </div>
  `;

  document.querySelectorAll(".artist-chart-tab").forEach(button => {
    button.addEventListener("click", () => {
      const nextChart = button.dataset.artistChart;
      selectedArtistChart = nextChart;
      updateArtistURL(artist, nextChart);
      renderArtistProfile(artist, nextChart);
    });
  });
}

async function initArtistPage() {
  try {
    const artistSelect = document.getElementById("artistSelect");

    if (!artistSelect) return;

    await loadAllArtistRows();

    const params = new URLSearchParams(window.location.search);
    const selectedArtist = params.get("artist") || "";
    const selectedChart = params.get("chart") || "songs";

    selectedArtistChart = selectedChart;

    populateArtistDropdown(selectedArtist);

    if (selectedArtist) {
      renderArtistProfile(selectedArtist, selectedChart);
    } else {
      renderArtistProfile("");
    }

    artistSelect.addEventListener("change", () => {
      const artist = artistSelect.value;
      const availableCharts = artist ? getAvailableChartsForArtist(artist) : [];
      const firstChart = availableCharts[0] || "songs";

      selectedArtistChart = firstChart;
      updateArtistURL(artist, firstChart);
      renderArtistProfile(artist, firstChart);
    });
  } catch (error) {
    const profile = document.getElementById("artistProfile");

    if (profile) {
      profile.innerHTML = `
        <div class="error">
          <h3>Artist page could not load.</h3>
          <p>Check your Google Sheets links in config.js.</p>
        </div>
      `;
    }

    console.error(error);
  }
}

if (document.getElementById("weekSelect")) {
  initChartPage();
}

if (document.body.dataset.page === "artists" || document.getElementById("artistSelect")) {
  initArtistPage();
}
