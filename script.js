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

const DEFAULT_SITE_SETTINGS = {
  siteTitle: "Sweet 16 Charts",
  siteTagline: "The official weekly music chart",
  newsTitle: "Sweet 16 News",
  newsBody: "Latest chart news will appear here.",
  newsImage: "",
  accentColor: ""
};

let allRows = [];
let validWeeks = [];
let weekLists = {};
let selectedArtistChart = "songs";

function clean(value) {
  return value === undefined || value === null ? "" : String(value).replaceAll('"', "").trim();
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

  if (preferredUnit === "B") {
    return `${(number / 1000000000).toFixed(1).replace(".0", "")}B`;
  }

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

  return Math.round(number).toLocaleString();
}

function formatMetric(item) {
  const label = METRIC_LABELS[item.chartType] || "points";
  const number = item.metricNumber || 0;

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

function getMetricRaw(row, chartType) {
  // Column J = index 9.
  // This is where streaming, sales, and radio numbers are in your data.
  if (chartType === "streaming" || chartType === "sales" || chartType === "radio") {
    return clean(row[9]);
  }

  // Regular songs/albums/videos usually use column D.
  return clean(row[3]);
}

function getMetricNumber(row, chartType) {
  const raw = getMetricRaw(row, chartType);
  let number = metricToNumber(raw);

  // IMPORTANT:
  // Streaming data comes from column J, but the page must show column J divided by 17.
  // Example: 99M / 17 = 5.8M streams.
  if (chartType === "streaming") {
    number = number / 17;
  }

  return number;
}

function isPlayableAudioURL(value) {
  const url = clean(value);

  if (!/^https?:\/\//i.test(url)) return false;

  const lower = url.toLowerCase();

  if (lower.match(/\.(jpg|jpeg|png|gif|webp)(\?|$)/)) return false;
  if (lower.includes("spotify.com/track")) return false;
  if (lower.includes("music.apple.com")) return false;

  return (
    lower.includes("audio-ssl.itunes.apple.com") ||
    lower.includes("audio.itunes.apple.com") ||
    lower.includes(".m4a") ||
    lower.includes(".mp3") ||
    lower.includes(".aac") ||
    lower.includes(".wav")
  );
}

function findPreviewAudio(row) {
  // This scans the whole row so previews can work on songs, albums,
  // streaming, sales, radio, videos, and artist pages.
  for (const cell of row) {
    if (isPlayableAudioURL(cell)) {
      return clean(cell);
    }
  }

  return "";
}

function findImage(row, fallbackIndex = 8) {
  const fallback = clean(row[fallbackIndex]);

  if (fallback && /^https?:\/\//i.test(fallback)) {
    return fallback;
  }

  for (const cell of row) {
    const value = clean(cell);

    if (/^https?:\/\//i.test(value) && value.toLowerCase().match(/\.(jpg|jpeg|png|gif|webp)(\?|$)/)) {
      return value;
    }
  }

  return "";
}

async function loadCSV(url, chartType) {
  const finalUrl = url.includes("?") ? `${url}&cache=${Date.now()}` : `${url}?cache=${Date.now()}`;
  const response = await fetch(finalUrl);
  const text = await response.text();

  if (!window.Papa) {
    throw new Error("PapaParse is missing. Make sure papaparse is loaded before script.js.");
  }

  const parsed = Papa.parse(text, {
    skipEmptyLines: true
  });

  return parsed.data
    .map((row, index) => {
      const fromFullName = splitFullName(row[2]);

      const title = clean(row[5]) || fromFullName.title;
      const artistRaw = clean(row[6]) || fromFullName.artist;

      const metricRaw = getMetricRaw(row, chartType);
      const metricNumber = getMetricNumber(row, chartType);

      return {
        index,
        chartType,
        week: clean(row[0]),
        position: parsePosition(row[1]),
        fullName: clean(row[2]),
        metricRaw,
        metricNumber,
        title,
        artistRaw,
        artistCredits: splitArtists(artistRaw),
        cover: findImage(row, 8),
        audio: findPreviewAudio(row)
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

function getWeekScore(week) {
  const text = clean(week);

  const dateAttempt = Date.parse(text);

  if (!Number.isNaN(dateAttempt)) {
    return dateAttempt;
  }

  const numberMatch = text.match(/\d+/g);

  if (numberMatch && numberMatch.length) {
    return Number(numberMatch.join(""));
  }

  return null;
}

function getValidWeeks(rows) {
  const counts = {};
  const weeks = [];

  rows.forEach(item => {
    counts[item.week] = (counts[item.week] || 0) + 1;

    if (!weeks.includes(item.week)) {
      weeks.push(item.week);
    }
  });

  const valid = weeks.filter(week => counts[week] >= 5);

  const scored = valid.map((week, originalIndex) => {
    return {
      week,
      score: getWeekScore(week),
      originalIndex
    };
  });

  const hasScores = scored.some(item => item.score !== null);

  if (hasScores) {
    return scored
      .sort((a, b) => {
        const aScore = a.score === null ? -Infinity : a.score;
        const bScore = b.score === null ? -Infinity : b.score;
        return bScore - aScore;
      })
      .map(item => item.week);
  }

  // Fallback: keep the order from the sheet.
  // This avoids loading the very first/oldest week first.
  return valid;
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

function getPreviousWeek(currentWeek, chartType = getChartType()) {
  const list = weekLists[chartType] || validWeeks || [];
  const index = list.indexOf(currentWeek);

  return list[index + 1] || null;
}

function getMovement(currentItem, previousRows) {
  const currentKey = makeKey(currentItem.title, currentItem.artistRaw);

  const previous = previousRows.find(item => {
    return makeKey(item.title, item.artistRaw) === currentKey;
  });

  const list = weekLists[currentItem.chartType] || validWeeks || [];
  const currentWeekIndex = list.indexOf(currentItem.week);

  const appearedBefore = allRows.some(item => {
    const itemWeekIndex = list.indexOf(item.week);

    return (
      item.chartType === currentItem.chartType &&
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

function getChartRun(title, artistRaw, chartType = getChartType()) {
  const itemKey = makeKey(title, artistRaw);

  const run = allRows
    .filter(item => {
      return item.chartType === chartType && makeKey(item.title, item.artistRaw) === itemKey;
    })
    .sort((a, b) => {
      // Oldest first, so the history starts with debut and ends with most recent.
      return getWeekIndex(b) - getWeekIndex(a);
    });

  if (run.length === 0) {
    return `
      <div class="history-stats">
        <div>
          <strong>—</strong>
          <span>No history</span>
        </div>
      </div>
    `;
  }

  const peak = Math.min(...run.map(item => item.position));
  const weeks = run.length;
  const debut = run[0];
  const latest = run[run.length - 1];

  return `
    <div class="history-stats">
      <div>
        <strong>#${escapeHTML(peak)}</strong>
        <span>Peak</span>
      </div>

      <div>
        <strong>${escapeHTML(weeks)}</strong>
        <span>Total weeks</span>
      </div>

      <div>
        <strong>#${escapeHTML(debut.position)}</strong>
        <span>Debut</span>
      </div>

      <div>
        <strong>#${escapeHTML(latest.position)}</strong>
        <span>Most recent</span>
      </div>
    </div>

    <div class="history-run">
      ${run.map(item => `
        <span>${escapeHTML(item.week)} · #${escapeHTML(item.position)}</span>
      `).join("")}
    </div>
  `;
}

function renderArtistLinks(item) {
  return item.artistCredits
    .map(artist => {
      return `<a href="${artistURL(artist)}">${escapeHTML(artist)}</a>`;
    })
    .join(` & `);
}

function renderChart(week) {
  const chartType = getChartType();
  const limit = CHART_LIMITS[chartType] || 100;
  const previousWeek = getPreviousWeek(week, chartType);

  const currentRows = allRows
    .filter(item => item.chartType === chartType && item.week === week)
    .sort((a, b) => a.position - b.position);

  const limitedRows = currentRows.slice(0, limit);

  const previousRows = previousWeek
    ? allRows.filter(item => item.chartType === chartType && item.week === previousWeek)
    : [];

  const chart = document.getElementById("chart");
  const chartCount = document.getElementById("chartCount");

  if (!chart) return;

  chart.classList.add("chart-list");
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
      <article class="compact-chart-row">
        <div class="position">#${escapeHTML(item.position)}</div>

        <div class="cover-wrap ${item.audio ? "has-preview" : ""}" ${item.audio ? `data-audio="${escapeHTML(item.audio)}"` : ""}>
          ${item.cover ? `
            <img class="cover" src="${escapeHTML(item.cover)}" alt="${escapeHTML(item.title)} cover">
          ` : `
            <div class="cover"></div>
          `}

          ${item.audio ? `
            <button class="preview-button play-button" data-audio="${escapeHTML(item.audio)}" aria-label="Play preview">
              ▶
            </button>
          ` : ""}
        </div>

        <div class="compact-song-info">
          <h3>${escapeHTML(item.title)}</h3>
          <p>${renderArtistLinks(item)}</p>
        </div>

        <div class="compact-metric">
          ${metric ? escapeHTML(metric) : ""}
        </div>

        <div class="movement ${movementClass}">
          ${escapeHTML(movement)}
        </div>

        <button class="expand-button" data-run="run-${id}" aria-label="Show chart history">
          +
        </button>

        <div class="chart-history-panel" id="run-${id}">
          ${getChartRun(item.title, item.artistRaw, chartType)}
        </div>
      </article>
    `;
  });

  activateButtons();
}

function activateButtons() {
  let audioPlayer = document.getElementById("audioPlayer");

  if (!audioPlayer) {
    audioPlayer = document.createElement("audio");
    audioPlayer.id = "audioPlayer";
    audioPlayer.className = "audio-player";
    audioPlayer.preload = "none";
    document.body.appendChild(audioPlayer);
  }

  audioPlayer.controls = false;
  audioPlayer.removeAttribute("controls");
  audioPlayer.style.display = "none";

  function resetButtons() {
    document.querySelectorAll(".play-button").forEach(button => {
      button.textContent = "▶";
      button.classList.remove("is-playing");
    });
  }

  audioPlayer.onpause = resetButtons;
  audioPlayer.onended = resetButtons;

  function playPreview(audioUrl, clickedButton = null) {
    if (!audioUrl) return;

    const absolute = new URL(audioUrl, location.href).href;
    const alreadyPlaying = audioPlayer.src === absolute && !audioPlayer.paused;

    if (alreadyPlaying) {
      audioPlayer.pause();
      resetButtons();
      return;
    }

    audioPlayer.src = audioUrl;
    audioPlayer.play().then(() => {
      resetButtons();
      if (clickedButton) {
        clickedButton.textContent = "❚❚";
        clickedButton.classList.add("is-playing");
      }
    }).catch(error => {
      console.error("Preview could not play:", error);
      resetButtons();
    });
  }

  document.querySelectorAll(".play-button").forEach(button => {
    if (button.dataset.previewBound === "true") return;
    button.dataset.previewBound = "true";

    button.addEventListener("click", event => {
      event.preventDefault();
      event.stopPropagation();
      playPreview(button.dataset.audio, button);
    });
  });

  document.querySelectorAll(".cover-wrap.has-preview").forEach(cover => {
    if (cover.dataset.previewBound === "true") return;
    cover.dataset.previewBound = "true";

    cover.addEventListener("click", event => {
      if (event.target.closest("a")) return;
      event.preventDefault();
      event.stopPropagation();

      const button = cover.querySelector(".play-button");
      playPreview(cover.dataset.audio, button);
    });
  });

  document.querySelectorAll(".expand-button").forEach(button => {
    if (button.dataset.expandBound === "true") return;
    button.dataset.expandBound = "true";

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
      select.value = validWeeks[0];
      renderChart(validWeeks[0]);
    }
  } catch (error) {
    const chart = document.getElementById("chart");

    if (chart) {
      chart.innerHTML = `
        <div class="panel">
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
    const selected = normalizeText(artist) === normalizeText(selectedArtist) ? "selected" : "";
    artistSelect.innerHTML += `<option value="${escapeHTML(artist)}" ${selected}>${escapeHTML(artist)}</option>`;
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
        audio: item.audio,
        rows: []
      });
    }

    const entry = entryMap.get(key);

    entry.rows.push(item);

    if (!entry.cover && item.cover) {
      entry.cover = item.cover;
    }

    if (!entry.audio && item.audio) {
      entry.audio = item.audio;
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
        <button class="artist-chart-tab ${chartType === activeChartType ? "active" : ""}" data-artist-chart="${escapeHTML(chartType)}">
          ${escapeHTML(SHORT_CHART_LABELS[chartType] || chartType)}
        </button>
      `).join("")}
    </div>
  `;
}

function renderArtistProfile(artist, chartType = selectedArtistChart) {
  const profile = document.getElementById("artistPageContent") || document.getElementById("artistProfile");

  if (!profile) return;

  if (!artist) {
    profile.innerHTML = `
      <section class="artist-empty">
        <h2>Choose an artist</h2>
        <p>Select an artist from the dropdown to see their chart history.</p>
      </section>
    `;
    return;
  }

  const availableCharts = getAvailableChartsForArtist(artist);

  if (availableCharts.length === 0) {
    profile.innerHTML = `
      <section class="artist-empty">
        <h2>Artist not found</h2>
        <p>This artist has not charted yet based on the current data.</p>
      </section>
    `;
    return;
  }

  if (!availableCharts.includes(chartType)) {
    chartType = availableCharts[0];
  }

  selectedArtistChart = chartType;

  const stats = getArtistStats(artist, chartType);
  const chartLabel = CHART_LABELS[chartType] || chartType;

  const customArtistData =
    window.SWEET16_ARTIST_DATA && window.SWEET16_ARTIST_DATA[artist]
      ? window.SWEET16_ARTIST_DATA[artist]
      : {};

  const firstEntry = stats.entries[0] || {};
  const banner = customArtistData.banner || firstEntry.cover || "";
  const image = customArtistData.image || firstEntry.cover || "";
  const subtitle = customArtistData.subtitle || `${stats.chartDebuts} chart entries · ${stats.totalChartWeeks} total chart weeks`;
  const bio = customArtistData.bio || `${artist} has charted on the Sweet 16 ${chartLabel}.`;
  const facts = Array.isArray(customArtistData.facts) ? customArtistData.facts : [];

  profile.innerHTML = `
    <section class="artist-spotify-hero" ${banner ? `style="background-image: linear-gradient(to bottom, rgba(35,35,35,0.1), rgba(0,0,0,0.9)), url('${escapeHTML(banner)}')"` : ""}>
      <div class="artist-hero-fade"></div>

      <div class="artist-hero-content">
        ${image ? `<img class="artist-avatar" src="${escapeHTML(image)}" alt="${escapeHTML(artist)}">` : `<div class="artist-avatar"></div>`}

        <div>
          <span class="artist-label">Artist</span>
          <h2>${escapeHTML(artist)}</h2>
          <p>${escapeHTML(subtitle)}</p>
        </div>
      </div>
    </section>

    <section class="artist-top-section">
      <div class="artist-section-head">
        <div>
          <h2>${escapeHTML(chartLabel)}</h2>
          <p>
            #${escapeHTML(stats.bestPeak)} best peak ·
            ${escapeHTML(stats.numberOnes)} different #1s ·
            ${escapeHTML(stats.chartDebuts)} chart debuts
          </p>
        </div>
      </div>

      ${renderArtistChartButtons(artist, chartType)}

      <div class="artist-top-list">
        ${stats.entries.length ? stats.entries.map((entry, index) => `
          <article class="artist-top-track">
            <div class="artist-track-rank">#${index + 1}</div>

            ${entry.cover ? `
              <img class="cover" src="${escapeHTML(entry.cover)}" alt="${escapeHTML(entry.title)} cover">
            ` : `
              <div class="cover"></div>
            `}

            <div class="artist-track-info">
              <h3>${escapeHTML(entry.title)}</h3>
              <p>${escapeHTML(entry.artistRaw)}</p>
              <p>
                Peak #${escapeHTML(entry.bestPeak)} ·
                ${escapeHTML(entry.weeksAtPeak)} weeks at peak ·
                ${escapeHTML(entry.totalWeeks)} total weeks
              </p>
            </div>

            <div class="artist-track-metric">
              ${entry.totalMetric ? `${escapeHTML(shortNumber(entry.totalMetric))} total ${escapeHTML(METRIC_LABELS[chartType] || "points")}` : ""}
            </div>
          </article>
        `).join("") : `
          <p>No entries found for this chart.</p>
        `}
      </div>
    </section>

    <section class="artist-info-section">
      <h2>About</h2>
      <p>${escapeHTML(bio)}</p>

      ${facts.length ? `
        <div class="artist-facts">
          ${facts.map(fact => `<span>${escapeHTML(fact)}</span>`).join("")}
        </div>
      ` : ""}
    </section>
  `;

  document.querySelectorAll(".artist-chart-tab").forEach(button => {
    button.addEventListener("click", () => {
      const nextChart = button.dataset.artistChart;

      selectedArtistChart = nextChart;
      updateArtistURL(artist, nextChart);
      renderArtistProfile(artist, nextChart);
    });
  });

  activateButtons();
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
        <h3>Artist page could not load.</h3>
        <p>Check your Google Sheets links in config.js.</p>
      `;
    }

    console.error(error);
  }
}

function getSiteSettings() {
  let saved = {};

  try {
    saved = JSON.parse(localStorage.getItem("sweet16SiteSettings") || "{}");
  } catch (error) {
    saved = {};
  }

  return {
    ...DEFAULT_SITE_SETTINGS,
    ...(window.SWEET16_SETTINGS || {}),
    ...saved
  };
}

function applySiteSettings() {
  const settings = getSiteSettings();

  if (settings.accentColor) {
    document.documentElement.style.setProperty("--accent", settings.accentColor);
    document.documentElement.style.setProperty("--accent-soft", `${settings.accentColor}28`);
  }

  const headerTitle = document.querySelector(".site-header h1");

if (headerTitle && settings.siteTitle) {
  headerTitle.textContent = settings.siteTitle;
}

const headerTagline = document.querySelector(".site-header p");

if (
  headerTagline &&
  settings.siteTagline &&
  (document.body.dataset.page === "home" || document.body.dataset.page === "admin")
) {
  headerTagline.textContent = settings.siteTagline;
}

  renderHomeNews(settings);
}

function renderHomeNews(settings) {
  const isHome =
    document.body.dataset.page === "home" ||
    location.pathname.endsWith("index.html") ||
    location.pathname.endsWith("/");

  if (!isHome) return;

  const oldNews = window.SWEET16_SITE_DATA && window.SWEET16_SITE_DATA.homeNews
    ? window.SWEET16_SITE_DATA.homeNews
    : {};

  const newsData = {
    visible: oldNews.visible !== false,
    eyebrow: oldNews.eyebrow || "This Week on Sweet 16",
    headline: settings.newsTitle || oldNews.headline || "Sweet 16 News",
    description: settings.newsBody || oldNews.description || "Latest chart news will appear here.",
    banner: settings.newsImage || oldNews.banner || "",
    cover: oldNews.cover || settings.newsImage || "",
    link: oldNews.link || "songs.html",
    buttonText: oldNews.buttonText || "View Chart",
    accent: settings.accentColor || oldNews.accent || "",
    textColor: oldNews.textColor || ""
  };

  let news = document.getElementById("homeNews");

  if (!news) {
    const hero = document.querySelector(".home-hero") || document.querySelector("main");
    if (!hero) return;

    news = document.createElement("section");
    news.id = "homeNews";
    hero.insertAdjacentElement("afterend", news);
  }

  if (!newsData.visible) {
    news.innerHTML = "";
    return;
  }

  news.className = "home-news";

  if (newsData.banner) {
    news.style.backgroundImage = `
      linear-gradient(90deg, rgba(0,0,0,0.92), rgba(0,0,0,0.65)),
      url("${newsData.banner}")
    `;
  }

  if (newsData.accent) {
    news.style.setProperty("--news-accent", newsData.accent);
  }

  if (newsData.textColor) {
    news.style.setProperty("--news-text", newsData.textColor);
  }

  news.innerHTML = `
    <div class="home-news-content">
      <span>${escapeHTML(newsData.eyebrow)}</span>
      <h2>${escapeHTML(newsData.headline)}</h2>
      <p>${escapeHTML(newsData.description)}</p>
      <a href="${escapeHTML(newsData.link)}">${escapeHTML(newsData.buttonText)}</a>
    </div>

    ${newsData.cover ? `
      <img class="home-news-cover" src="${escapeHTML(newsData.cover)}" alt="News cover">
    ` : ""}
  `;
}

function initAdminPage() {
  const form = document.getElementById("customizeForm");

  if (!form) return;

  const settings = getSiteSettings();

  document.getElementById("siteTitle").value = settings.siteTitle || "";
  document.getElementById("siteTagline").value = settings.siteTagline || "";
  document.getElementById("newsTitle").value = settings.newsTitle || "";
  document.getElementById("newsBody").value = settings.newsBody || "";
  document.getElementById("newsImage").value = settings.newsImage || "";
  document.getElementById("accentColor").value = settings.accentColor || "#ffffff";

  const exportBox = document.getElementById("settingsExport");

  function collectSettings() {
    return {
      siteTitle: document.getElementById("siteTitle").value,
      siteTagline: document.getElementById("siteTagline").value,
      newsTitle: document.getElementById("newsTitle").value,
      newsBody: document.getElementById("newsBody").value,
      newsImage: document.getElementById("newsImage").value,
      accentColor: document.getElementById("accentColor").value
    };
  }

  function updateExportBox(nextSettings) {
    if (!exportBox) return;

    exportBox.value = `window.SWEET16_SETTINGS = ${JSON.stringify(nextSettings, null, 2)};`;
  }

  updateExportBox(settings);

  form.addEventListener("submit", event => {
    event.preventDefault();

    const nextSettings = collectSettings();

    localStorage.setItem("sweet16SiteSettings", JSON.stringify(nextSettings));
    updateExportBox(nextSettings);
    applySiteSettings();

    const status = document.getElementById("adminStatus");

    if (status) {
      status.textContent = "Saved in this browser. To make it public for everyone, copy the export code into site-settings.js.";
    }
  });

  const resetButton = document.getElementById("resetCustomize");

  if (resetButton) {
    resetButton.addEventListener("click", () => {
      localStorage.removeItem("sweet16SiteSettings");
      location.reload();
    });
  }
}

document.addEventListener("DOMContentLoaded", () => {
  applySiteSettings();

  if (document.getElementById("weekSelect")) {
    initChartPage();
  }

  if (document.body.dataset.page === "artists" || document.getElementById("artistSelect")) {
    initArtistPage();
  }

  if (document.body.dataset.page === "admin" || document.getElementById("customizeForm")) {
    initAdminPage();
  }
});

/* =========================================================
   SWEET 16 FIX PATCH — previews, streaming, #1s, admin pages
   Paste at the VERY BOTTOM of script.js
========================================================= */

const SWEET16_CHART_PAGES = ["songs", "albums", "streaming", "sales", "radio", "videos"];

const SWEET16_PAGE_LABELS = {
  home: "Home",
  songs: "Songs Chart",
  albums: "Albums Chart",
  streaming: "Streaming Chart",
  sales: "Sales Chart",
  radio: "Radio Chart",
  videos: "Music Videos Chart",
  artists: "Artist Pages",
  "number-ones": "All #1s",
  "year-end": "Year-End",
  certifications: "Certifications",
  designer: "Designer",
  admin: "Admin"
};

const SWEET16_PAGE_URLS = {
  home: "index.html",
  songs: "songs.html",
  albums: "albums.html",
  streaming: "streaming.html",
  sales: "sales.html",
  radio: "radio.html",
  videos: "videos.html",
  artists: "artists.html",
  "number-ones": "number-ones.html",
  "year-end": "year-end.html",
  certifications: "certifications.html",
  designer: "designer.html",
  admin: "admin.html"
};

function sweet16PageStatusDefaults() {
  const output = {};
  Object.keys(SWEET16_PAGE_LABELS).forEach(key => {
    output[key] = {
      enabled: true,
      messageType: "coming-soon",
      customMessage: ""
    };
  });
  return output;
}

function getSiteSettings() {
  let saved = {};
  try {
    saved = JSON.parse(localStorage.getItem("sweet16SiteSettings") || "{}");
  } catch (error) {
    saved = {};
  }

  const defaults = {
    ...(typeof DEFAULT_SITE_SETTINGS !== "undefined" ? DEFAULT_SITE_SETTINGS : {}),
    pageStatus: sweet16PageStatusDefaults()
  };

  return {
    ...defaults,
    ...(window.SWEET16_SETTINGS || {}),
    ...saved,
    pageStatus: {
      ...sweet16PageStatusDefaults(),
      ...((window.SWEET16_SETTINGS && window.SWEET16_SETTINGS.pageStatus) || {}),
      ...(saved.pageStatus || {})
    }
  };
}

function getCurrentSweet16PageKey() {
  if (document.body.dataset.chart) return document.body.dataset.chart;
  if (document.body.dataset.page) return document.body.dataset.page;

  const file = location.pathname.split("/").pop() || "index.html";
  const match = Object.entries(SWEET16_PAGE_URLS).find(([, url]) => url === file);
  return match ? match[0] : "home";
}

function getDisabledMessage(status) {
  if (!status) return "Coming Soon";
  if (status.messageType === "maintenance") return "Under Maintenance";
  if (status.messageType === "other") return status.customMessage || "This page is temporarily unavailable.";
  return "Coming Soon";
}

function renderDisabledPageIfNeeded() {
  const key = getCurrentSweet16PageKey();
  if (key === "admin") return false;

  const settings = getSiteSettings();
  const status = settings.pageStatus && settings.pageStatus[key];

  if (!status || status.enabled !== false) return false;

  const main = document.querySelector("main");
  if (!main) return true;

  main.innerHTML = `
    <section class="disabled-page-card">
      <span class="disabled-page-kicker">${escapeHTML(SWEET16_PAGE_LABELS[key] || "Sweet 16")}</span>
      <h2>${escapeHTML(getDisabledMessage(status))}</h2>
      <p>This Sweet 16 page is currently not available.</p>
      <a href="index.html">Back to Home</a>
    </section>
  `;

  return true;
}

/* ---------- stronger metric parsing ---------- */

function sweet16MetricCellToNumber(value) {
  const text = clean(value);
  if (!text || /^https?:\/\//i.test(text)) return 0;

  const upper = text.toUpperCase().replace(/,/g, "");
  const match = upper.match(/[-+]?\d*\.?\d+/);
  if (!match) return 0;

  let number = Number(match[0]);
  if (Number.isNaN(number)) return 0;

  if (upper.includes("B")) number *= 1000000000;
  else if (upper.includes("M")) number *= 1000000;
  else if (upper.includes("K")) number *= 1000;

  return number;
}

function getMetricRaw(row, chartType) {
  // Streaming, Sales, Radio: column J = index 9.
  // If J is empty, fall back to column D.
  if (chartType === "streaming" || chartType === "sales" || chartType === "radio") {
    return clean(row[9]) || clean(row[3]);
  }

  return clean(row[3]);
}

function getMetricNumber(row, chartType) {
  let number = sweet16MetricCellToNumber(getMetricRaw(row, chartType));

  // Streaming must show column J divided by 17.
  // Example: 99M / 17 = 5.8M streams.
  if (chartType === "streaming" && number) {
    number = number / 17;
  }

  return number;
}

/* ---------- preview audio restore ---------- */

function isPlayableAudioURL(value) {
  const url = clean(value);
  if (!/^https?:\/\//i.test(url)) return false;

  const lower = url.toLowerCase();

  if (lower.match(/\.(jpg|jpeg|png|gif|webp)(\?|$)/)) return false;
  if (lower.includes("spotify.com/track")) return false;
  if (lower.includes("music.apple.com/us/album")) return false;
  if (lower.includes("music.apple.com/us/song")) return false;

  return (
    lower.includes("audio-ssl.itunes.apple.com") ||
    lower.includes("audio.itunes.apple.com") ||
    lower.includes(".m4a") ||
    lower.includes(".mp3") ||
    lower.includes(".aac") ||
    lower.includes(".wav")
  );
}

function findPreviewAudio(row) {
  // Prefer your preview columns first:
  // K = 10, L = 11, M = 12, N = 13
  const preferred = [13, 10, 11, 12];

  for (const index of preferred) {
    if (isPlayableAudioURL(row[index])) return clean(row[index]);
  }

  // Backup: scan whole row.
  for (const cell of row) {
    if (isPlayableAudioURL(cell)) return clean(cell);
  }

  return "";
}

function resetPreviewButtons() {
  document.querySelectorAll(".play-button").forEach(button => {
    button.textContent = "▶";
    button.classList.remove("is-playing");
  });
}

function activateButtons() {
  let audioPlayer = document.getElementById("audioPlayer");

  if (!audioPlayer) {
    audioPlayer = document.createElement("audio");
    audioPlayer.id = "audioPlayer";
    audioPlayer.className = "audio-player";
    document.body.appendChild(audioPlayer);
  }

  // Hide the ugly browser audio bar completely.
  audioPlayer.controls = false;
audioPlayer.removeAttribute("controls");
audioPlayer.style.display = "none";

  audioPlayer.onpause = resetPreviewButtons;
  audioPlayer.onended = resetPreviewButtons;

  function playPreview(audioUrl, clickedButton = null) {
    if (!audioUrl) return;

    const absoluteAudio = new URL(audioUrl, location.href).href;
    const alreadyPlaying = audioPlayer.src === absoluteAudio && !audioPlayer.paused;

    if (alreadyPlaying) {
      audioPlayer.pause();
      resetPreviewButtons();
      return;
    }

    audioPlayer.src = audioUrl;
    audioPlayer.play().then(() => {
      resetPreviewButtons();
      if (clickedButton) {
        clickedButton.textContent = "❚❚";
        clickedButton.classList.add("is-playing");
      }
    }).catch(error => {
      console.error("Preview could not play:", error);
      resetPreviewButtons();
    });
  }

  document.querySelectorAll(".play-button").forEach(button => {
    if (button.dataset.previewBound === "true") return;
    button.dataset.previewBound = "true";

    button.addEventListener("click", event => {
      event.preventDefault();
      event.stopPropagation();
      playPreview(button.dataset.audio, button);
    });
  });

  document.querySelectorAll(".cover-wrap.has-preview").forEach(cover => {
    if (cover.dataset.previewBound === "true") return;
    cover.dataset.previewBound = "true";

    cover.addEventListener("click", event => {
      if (event.target.closest("a")) return;
      event.preventDefault();
      event.stopPropagation();

      const button = cover.querySelector(".play-button");
      playPreview(cover.dataset.audio, button);
    });
  });

  document.querySelectorAll(".expand-button").forEach(button => {
    if (button.dataset.expandBound === "true") return;
    button.dataset.expandBound = "true";

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

/* ---------- homepage latest #1 previews ---------- */

function sweet16ChartHref(chartType) {
  return SWEET16_PAGE_URLS[chartType] || `${chartType}.html`;
}

function getEntryRunStats(item, rows) {
  const key = makeKey(item.title, item.artistRaw);

  const run = rows
    .filter(row => makeKey(row.title, row.artistRaw) === key)
    .sort((a, b) => getWeekIndex(a) - getWeekIndex(b)); // latest first

  return {
    weeksAtOne: run.filter(row => row.position === 1).length,
    totalWeeks: run.length,
    lastWeek: run[0] ? run[0].week : "—"
  };
}

function getLatestWeekRows(rows, chartType) {
  const weeks = getValidWeeks(rows);
  const latestWeek = weeks[0];
  if (!latestWeek) return [];
  return rows
    .filter(row => row.week === latestWeek)
    .sort((a, b) => a.position - b.position);
}

function getSupportMetricsForSong(songItem, chartRowsMap) {
  const key = makeKey(songItem.title, songItem.artistRaw);

  function matchMetric(chartType) {
    const rows = chartRowsMap[chartType] || [];
    const latestRows = getLatestWeekRows(rows, chartType);
    const found = latestRows.find(row => makeKey(row.title, row.artistRaw) === key);
    return found ? formatMetric(found) : "—";
  }

  return {
    streaming: matchMetric("streaming"),
    sales: matchMetric("sales"),
    radio: matchMetric("radio")
  };
}

function renderHomePreviewCard(item, chartType, week, stats, supportMetrics = null) {
  const metric = formatMetric(item);
  const label = SHORT_CHART_LABELS[chartType] || chartType;

  return `
    <article class="home-preview-card format-${escapeHTML(chartType)}">
      <div class="home-preview-head">
        <span class="home-format-pill">${escapeHTML(label)}</span>
        <span class="home-week-pill">${escapeHTML(week)}</span>
      </div>

      <div class="home-preview-main">
        <div class="cover-wrap ${item.audio ? "has-preview" : ""}" ${item.audio ? `data-audio="${escapeHTML(item.audio)}"` : ""}>
          ${
            item.cover
              ? `<img class="cover" src="${escapeHTML(item.cover)}" alt="${escapeHTML(item.title)} cover">`
              : `<div class="cover"></div>`
          }
          ${
            item.audio
              ? `<button class="preview-button play-button" data-audio="${escapeHTML(item.audio)}" aria-label="Play preview">▶</button>`
              : ""
          }
        </div>

        <div class="home-preview-info">
          <h3>#1 ${escapeHTML(item.title)}</h3>
          <p>${escapeHTML(item.artistRaw)}</p>
          ${metric ? `<strong>${escapeHTML(metric)}</strong>` : ""}
        </div>
      </div>

      <div class="home-preview-stats">
        <div>
          <span>Weeks at #1</span>
          <strong>${escapeHTML(stats.weeksAtOne)}</strong>
        </div>
        <div>
          <span>Total Weeks</span>
          <strong>${escapeHTML(stats.totalWeeks)}</strong>
        </div>
        <div>
          <span>Last Week</span>
          <strong>${escapeHTML(stats.lastWeek)}</strong>
        </div>
      </div>

      ${
        chartType === "songs" && supportMetrics
          ? `
            <div class="home-support-metrics">
              <div><span>Streaming</span><strong>${escapeHTML(supportMetrics.streaming)}</strong></div>
              <div><span>Sales</span><strong>${escapeHTML(supportMetrics.sales)}</strong></div>
              <div><span>Radio</span><strong>${escapeHTML(supportMetrics.radio)}</strong></div>
            </div>
          `
          : ""
      }
    </article>
  `;
}

async function initHomeChartPreviews() {
  const grid = document.getElementById("homeChartPreviews");
  if (!grid || typeof SHEETS === "undefined") return;

  grid.innerHTML = `<p class="loading-message">Loading latest #1 chart previews...</p>`;

  const chartRowsMap = {};

  await Promise.all(
    SWEET16_CHART_PAGES.map(async chartType => {
      try {
        chartRowsMap[chartType] = await loadCSV(SHEETS[chartType], chartType);
      } catch (error) {
        console.error(`Could not load homepage preview for ${chartType}`, error);
        chartRowsMap[chartType] = [];
      }
    })
  );

  const cards = SWEET16_CHART_PAGES.map(chartType => {
    const rows = chartRowsMap[chartType] || [];
    const weeks = getValidWeeks(rows);
    const latestWeek = weeks[0];

    if (!latestWeek) return "";

    weekLists[chartType] = weeks;

    const latestRows = rows
      .filter(item => item.week === latestWeek)
      .sort((a, b) => a.position - b.position);

    const leader = latestRows.find(item => item.position === 1) || latestRows[0];
    if (!leader) return "";

    const stats = getEntryRunStats(leader, rows);
    const supportMetrics =
      chartType === "songs"
        ? getSupportMetricsForSong(leader, chartRowsMap)
        : null;

    return renderHomePreviewCard(leader, chartType, latestWeek, stats, supportMetrics);
  }).filter(Boolean);

  grid.innerHTML = cards.length
    ? cards.join("")
    : `
      <div class="panel">
        <h3>No latest #1s found.</h3>
        <p>Check your Google Sheets links in config.js.</p>
      </div>
    `;

  activateButtons();
}
/* ---------- All #1s page ---------- */

function buildNumberOneEntries(chartType) {
  const rows = allRows.filter(item => item.chartType === chartType && item.position === 1);
  const map = new Map();

  rows.forEach(item => {
    const key = makeKey(item.title, item.artistRaw);

    if (!map.has(key)) {
      map.set(key, {
        chartType,
        title: item.title,
        artistRaw: item.artistRaw,
        artistCredits: item.artistCredits,
        cover: item.cover,
        audio: item.audio,
        rows: []
      });
    }

    const entry = map.get(key);
    entry.rows.push(item);

    if (!entry.cover && item.cover) entry.cover = item.cover;
    if (!entry.audio && item.audio) entry.audio = item.audio;
  });

  return Array.from(map.values()).map(entry => {
    const oldestFirst = [...entry.rows].sort((a, b) => getWeekIndex(b) - getWeekIndex(a));
    const newestFirst = [...entry.rows].sort((a, b) => getWeekIndex(a) - getWeekIndex(b));

    return {
      ...entry,
      weeksAtOne: entry.rows.length,
      firstWeekAtOne: oldestFirst[0] ? oldestFirst[0].week : "—",
      latestWeekAtOne: newestFirst[0] ? newestFirst[0].week : "—",
      totalMetric: entry.rows.reduce((sum, row) => sum + (row.metricNumber || 0), 0)
    };
  }).sort((a, b) => {
    if (b.weeksAtOne !== a.weeksAtOne) return b.weeksAtOne - a.weeksAtOne;
    return b.totalMetric - a.totalMetric;
  });
}

function renderNumberOneEntry(entry, index, chartType) {
  const id = makeId(entry.title, entry.artistRaw);
  const metricLabel = METRIC_LABELS[chartType] || "points";

  return `
    <article class="compact-chart-row">
      <div class="position">#${index + 1}</div>

      <div class="cover-wrap ${entry.audio ? "has-preview" : ""}" ${entry.audio ? `data-audio="${escapeHTML(entry.audio)}"` : ""}>
        ${
          entry.cover
            ? `<img class="cover" src="${escapeHTML(entry.cover)}" alt="${escapeHTML(entry.title)} cover">`
            : `<div class="cover"></div>`
        }
        ${
          entry.audio
            ? `<button class="preview-button play-button" data-audio="${escapeHTML(entry.audio)}" aria-label="Play preview">▶</button>`
            : ""
        }
      </div>

      <div class="compact-song-info">
        <h3>${escapeHTML(entry.title)}</h3>
        <p>${renderArtistLinks(entry)}</p>
      </div>

      <div class="compact-metric">
        ${escapeHTML(entry.weeksAtOne)} weeks at #1
      </div>

      <div class="movement same">
        ${entry.totalMetric ? `${escapeHTML(shortNumber(entry.totalMetric))} ${escapeHTML(metricLabel)}` : "—"}
      </div>

      <button class="expand-button" data-run="number-one-run-${id}" aria-label="Show #1 history">+</button>

      <div class="chart-history-panel" id="number-one-run-${id}">
        <div class="history-stats">
          <div>
            <strong>${escapeHTML(entry.weeksAtOne)}</strong>
            <span>Weeks at #1</span>
          </div>
          <div>
            <strong>${escapeHTML(entry.firstWeekAtOne)}</strong>
            <span>First #1 week</span>
          </div>
          <div>
            <strong>${escapeHTML(entry.latestWeekAtOne)}</strong>
            <span>Latest #1 week</span>
          </div>
        </div>

        <div class="history-run">
          ${entry.rows
            .sort((a, b) => getWeekIndex(b) - getWeekIndex(a))
            .map(row => `<span>${escapeHTML(row.week)} · #1</span>`)
            .join("")}
        </div>
      </div>
    </article>
  `;
}

async function initNumberOnesPage() {
  const tabs = document.getElementById("numberOnesTabs");
  const content = document.getElementById("numberOnesContent");

  if (!tabs || !content || typeof SHEETS === "undefined") return;

  content.innerHTML = `<p class="loading-message">Loading all #1s...</p>`;

  const results = await Promise.all(
    SWEET16_CHART_PAGES.map(([chartType]) => chartType)
  ).catch(() => []);

  const loaded = await Promise.all(
    SWEET16_CHART_PAGES.map(chartType => {
      return loadCSV(SHEETS[chartType], chartType).catch(error => {
        console.error(`Could not load ${chartType} #1s`, error);
        return [];
      });
    })
  );

  allRows = loaded.flat();
  rebuildWeekLists();

  let activeChart = "songs";

  function renderTabs() {
    tabs.innerHTML = SWEET16_CHART_PAGES.map(chartType => `
      <button class="artist-chart-tab ${chartType === activeChart ? "active" : ""}" data-number-one-chart="${escapeHTML(chartType)}">
        ${escapeHTML(SHORT_CHART_LABELS[chartType] || chartType)}
      </button>
    `).join("");

    tabs.querySelectorAll("[data-number-one-chart]").forEach(button => {
      button.addEventListener("click", () => {
        activeChart = button.dataset.numberOneChart;
        renderTabs();
        renderContent();
      });
    });
  }

  function renderContent() {
    const entries = buildNumberOneEntries(activeChart);

    content.classList.add("chart-list");

    if (!entries.length) {
      content.innerHTML = `
        <div class="panel">
          <h3>No #1s found.</h3>
          <p>Check the ${escapeHTML(SHORT_CHART_LABELS[activeChart] || activeChart)} data.</p>
        </div>
      `;
      return;
    }

    content.innerHTML = entries
      .map((entry, index) => renderNumberOneEntry(entry, index, activeChart))
      .join("");

    activateButtons();
  }

  renderTabs();
  renderContent();
}

/* ---------- Admin page controls ---------- */

function renderAdminPageStatusControls(settings) {
  const form = document.getElementById("customizeForm");
  if (!form || document.getElementById("pageStatusAdmin")) return;

  const block = document.createElement("section");
  block.id = "pageStatusAdmin";
  block.className = "admin-page-status";

  block.innerHTML = `
    <h2>Page Status Controls</h2>
    <p>Disable or enable pages and choose what message appears publicly.</p>

    <div class="page-status-grid">
      ${Object.entries(SWEET16_PAGE_LABELS).filter(([key]) => key !== "admin").map(([key, label]) => {
        const status = settings.pageStatus[key] || { enabled: true, messageType: "coming-soon", customMessage: "" };

        return `
          <div class="page-status-row" data-page-status-key="${escapeHTML(key)}">
            <div>
              <strong>${escapeHTML(label)}</strong>
              <small>${escapeHTML(SWEET16_PAGE_URLS[key] || "")}</small>
            </div>

            <label>
              <input type="checkbox" class="page-status-enabled" ${status.enabled !== false ? "checked" : ""}>
              Enabled
            </label>

            <select class="page-status-message-type">
              <option value="coming-soon" ${status.messageType === "coming-soon" ? "selected" : ""}>Coming Soon</option>
              <option value="maintenance" ${status.messageType === "maintenance" ? "selected" : ""}>Under Maintenance</option>
              <option value="other" ${status.messageType === "other" ? "selected" : ""}>Other</option>
            </select>

            <input class="page-status-custom-message" type="text" placeholder="Custom message" value="${escapeHTML(status.customMessage || "")}">
          </div>
        `;
      }).join("")}
    </div>
  `;

  form.insertAdjacentElement("beforeend", block);
}

function collectPageStatusSettings() {
  const pageStatus = sweet16PageStatusDefaults();

  document.querySelectorAll("[data-page-status-key]").forEach(row => {
    const key = row.dataset.pageStatusKey;

    pageStatus[key] = {
      enabled: row.querySelector(".page-status-enabled").checked,
      messageType: row.querySelector(".page-status-message-type").value,
      customMessage: row.querySelector(".page-status-custom-message").value
    };
  });

  return pageStatus;
}

function initAdminPage() {
  const form = document.getElementById("customizeForm");
  if (!form) return;

  const settings = getSiteSettings();

  document.getElementById("siteTitle").value = settings.siteTitle || "";
  document.getElementById("siteTagline").value = settings.siteTagline || "";
  document.getElementById("newsTitle").value = settings.newsTitle || "";
  document.getElementById("newsBody").value = settings.newsBody || "";
  document.getElementById("newsImage").value = settings.newsImage || "";
  document.getElementById("accentColor").value = settings.accentColor || "#ffffff";

  renderAdminPageStatusControls(settings);

  const exportBox = document.getElementById("settingsExport");

  function collectSettings() {
    return {
      siteTitle: document.getElementById("siteTitle").value,
      siteTagline: document.getElementById("siteTagline").value,
      newsTitle: document.getElementById("newsTitle").value,
      newsBody: document.getElementById("newsBody").value,
      newsImage: document.getElementById("newsImage").value,
      accentColor: document.getElementById("accentColor").value,
      pageStatus: collectPageStatusSettings()
    };
  }

  function updateExportBox(nextSettings) {
    if (!exportBox) return;
    exportBox.value = `window.SWEET16_SETTINGS = ${JSON.stringify(nextSettings, null, 2)};`;
  }

  updateExportBox(settings);

  form.addEventListener("submit", event => {
    event.preventDefault();

    const nextSettings = collectSettings();
    localStorage.setItem("sweet16SiteSettings", JSON.stringify(nextSettings));

    updateExportBox(nextSettings);
    applySiteSettings();

    const status = document.getElementById("adminStatus");
    if (status) {
      status.textContent = "Saved in this browser. Copy the export code into site-settings.js to make it public.";
    }
  });

  const resetButton = document.getElementById("resetCustomize");

  if (resetButton) {
    resetButton.addEventListener("click", () => {
      localStorage.removeItem("sweet16SiteSettings");
      location.reload();
    });
  }
}

/* ---------- extra page startup ---------- */

document.addEventListener("DOMContentLoaded", () => {
  const disabled = renderDisabledPageIfNeeded();
  if (disabled) return;

  if (document.body.dataset.page === "home") {
    initHomeChartPreviews();
  }

  if (document.body.dataset.page === "number-ones") {
    initNumberOnesPage();
  }
});

/* =========================================================
   SWEET 16 THEME + PREVIEW + HOME CARD PATCH
   Paste at the VERY BOTTOM of script.js
========================================================= */

const SWEET16_THEME_PAGE_KEYS = [
  "home",
  "songs",
  "albums",
  "streaming",
  "sales",
  "radio",
  "videos",
  "artists",
  "number-ones",
  "year-end",
  "certifications",
  "designer",
  "admin"
];

const SWEET16_DEFAULT_PAGE_THEMES = {
  home: {
    pageBg: "#22171a",
    pageText: "#ffffff",
    cardBg: "#6b5256",
    cardText: "#ffffff",
    accent: "#f0a7b3",
    headingFont: "inherit",
    bodyFont: "inherit"
  },
  songs: {
    pageBg: "#e9a8a5",
    pageText: "#ffffff",
    cardBg: "#050505",
    cardText: "#ffffff",
    accent: "#aab0b4",
    headingFont: "inherit",
    bodyFont: "inherit"
  },
  albums: {
    pageBg: "#1d1422",
    pageText: "#ffffff",
    cardBg: "#120d17",
    cardText: "#ffffff",
    accent: "#9b59ff",
    headingFont: "inherit",
    bodyFont: "inherit"
  },
  streaming: {
    pageBg: "#101a14",
    pageText: "#ffffff",
    cardBg: "#0a110d",
    cardText: "#ffffff",
    accent: "#2ecc71",
    headingFont: "inherit",
    bodyFont: "inherit"
  },
  sales: {
    pageBg: "#211c0b",
    pageText: "#ffffff",
    cardBg: "#141103",
    cardText: "#ffffff",
    accent: "#f1c40f",
    headingFont: "inherit",
    bodyFont: "inherit"
  },
  radio: {
    pageBg: "#0f1724",
    pageText: "#ffffff",
    cardBg: "#09111b",
    cardText: "#ffffff",
    accent: "#3498db",
    headingFont: "inherit",
    bodyFont: "inherit"
  },
  videos: {
    pageBg: "#24111b",
    pageText: "#ffffff",
    cardBg: "#150913",
    cardText: "#ffffff",
    accent: "#ff4fa3",
    headingFont: "inherit",
    bodyFont: "inherit"
  },
  artists: {
    pageBg: "#151515",
    pageText: "#ffffff",
    cardBg: "#080808",
    cardText: "#ffffff",
    accent: "#ffffff",
    headingFont: "inherit",
    bodyFont: "inherit"
  },
  "number-ones": {
    pageBg: "#161616",
    pageText: "#ffffff",
    cardBg: "#0b0b0b",
    cardText: "#ffffff",
    accent: "#ffffff",
    headingFont: "inherit",
    bodyFont: "inherit"
  },
  "year-end": {
    pageBg: "#e9a8a5",
    pageText: "#ffffff",
    cardBg: "#050505",
    cardText: "#ffffff",
    accent: "#ffd54a",
    headingFont: "inherit",
    bodyFont: "inherit"
  },
  certifications: {
    pageBg: "#e9a8a5",
    pageText: "#ffffff",
    cardBg: "#050505",
    cardText: "#ffffff",
    accent: "#ffffff",
    headingFont: "inherit",
    bodyFont: "inherit"
  },
  designer: {
    pageBg: "#121212",
    pageText: "#ffffff",
    cardBg: "#0a0a0a",
    cardText: "#ffffff",
    accent: "#ffffff",
    headingFont: "inherit",
    bodyFont: "inherit"
  },
  admin: {
    pageBg: "#121212",
    pageText: "#ffffff",
    cardBg: "#0a0a0a",
    cardText: "#ffffff",
    accent: "#ffffff",
    headingFont: "inherit",
    bodyFont: "inherit"
  }
};

function sweet16DeepMerge(base, override) {
  const out = { ...base };
  Object.keys(override || {}).forEach(key => {
    const baseValue = out[key];
    const overrideValue = override[key];

    if (
      baseValue &&
      overrideValue &&
      typeof baseValue === "object" &&
      typeof overrideValue === "object" &&
      !Array.isArray(baseValue) &&
      !Array.isArray(overrideValue)
    ) {
      out[key] = sweet16DeepMerge(baseValue, overrideValue);
    } else {
      out[key] = overrideValue;
    }
  });
  return out;
}

function normalizePageThemes(rawThemes = {}) {
  const themes = {};

  SWEET16_THEME_PAGE_KEYS.forEach(key => {
    themes[key] = {
      ...SWEET16_DEFAULT_PAGE_THEMES[key],
      ...(rawThemes[key] || {})
    };
  });

  return themes;
}

function getCurrentSweet16PageKey() {
  if (document.body.dataset.page) return document.body.dataset.page;
  if (document.body.dataset.chart) return document.body.dataset.chart;

  const file = location.pathname.split("/").pop() || "index.html";
  if (file === "" || file === "index.html") return "home";
  if (file === "songs.html") return "songs";
  if (file === "albums.html") return "albums";
  if (file === "streaming.html") return "streaming";
  if (file === "sales.html") return "sales";
  if (file === "radio.html") return "radio";
  if (file === "videos.html") return "videos";
  if (file === "artists.html") return "artists";
  if (file === "number-ones.html") return "number-ones";
  if (file === "year-end.html") return "year-end";
  if (file === "certifications.html") return "certifications";
  if (file === "designer.html") return "designer";
  if (file === "admin.html") return "admin";
  return "home";
}

function getSiteSettings() {
  let saved = {};
  try {
    saved = JSON.parse(localStorage.getItem("sweet16SiteSettings") || "{}");
  } catch (error) {
    saved = {};
  }

  const merged = sweet16DeepMerge(
    {
      ...DEFAULT_SITE_SETTINGS,
      pageThemes: SWEET16_DEFAULT_PAGE_THEMES
    },
    sweet16DeepMerge(window.SWEET16_SETTINGS || {}, saved || {})
  );

  merged.pageThemes = normalizePageThemes(merged.pageThemes || {});
  return merged;
}

function applyCurrentPageTheme(settings) {
  const pageKey = getCurrentSweet16PageKey();
  const theme = (settings.pageThemes && settings.pageThemes[pageKey]) || SWEET16_DEFAULT_PAGE_THEMES[pageKey] || SWEET16_DEFAULT_PAGE_THEMES.home;

  document.documentElement.style.setProperty("--page-bg", theme.pageBg || "#121212");
  document.documentElement.style.setProperty("--page-text", theme.pageText || "#ffffff");
  document.documentElement.style.setProperty("--page-card-bg", theme.cardBg || "#0a0a0a");
  document.documentElement.style.setProperty("--page-card-text", theme.cardText || "#ffffff");
  document.documentElement.style.setProperty("--page-accent", theme.accent || "#ffffff");
  document.documentElement.style.setProperty("--accent", theme.accent || "#ffffff");
  document.documentElement.style.setProperty("--accent-soft", `${(theme.accent || "#ffffff")}28`);

  if (theme.headingFont && theme.headingFont !== "inherit") {
    document.documentElement.style.setProperty("--page-heading-font", theme.headingFont);
  } else {
    document.documentElement.style.setProperty("--page-heading-font", "inherit");
  }

  if (theme.bodyFont && theme.bodyFont !== "inherit") {
    document.documentElement.style.setProperty("--page-body-font", theme.bodyFont);
  } else {
    document.documentElement.style.setProperty("--page-body-font", "inherit");
  }
}

function applySiteSettings() {
  const settings = getSiteSettings();

  applyCurrentPageTheme(settings);

  const headerTitle = document.querySelector(".site-header h1");
  if (headerTitle && settings.siteTitle) {
    headerTitle.textContent = settings.siteTitle;
  }

  const headerTagline = document.querySelector(".site-header p");
  if (
    headerTagline &&
    settings.siteTagline &&
    (document.body.dataset.page === "home" || document.body.dataset.page === "admin")
  ) {
    headerTagline.textContent = settings.siteTagline;
  }

  renderHomeNews(settings);
}

/* ---------- audio preview force buttons ---------- */

function ensurePreviewButtons() {
  document.querySelectorAll(".cover-wrap.has-preview").forEach(cover => {
    if (!cover.dataset.audio) return;

    let button = cover.querySelector(".play-button");
    if (!button) {
      button = document.createElement("button");
      button.className = "preview-button play-button";
      button.type = "button";
      button.textContent = "▶";
      button.setAttribute("aria-label", "Play preview");
      button.dataset.audio = cover.dataset.audio;
      cover.appendChild(button);
    }
  });
}

function activateButtons() {
  ensurePreviewButtons();

  let audioPlayer = document.getElementById("audioPlayer");

  if (!audioPlayer) {
    audioPlayer = document.createElement("audio");
    audioPlayer.id = "audioPlayer";
    audioPlayer.className = "audio-player";
    audioPlayer.preload = "none";
    document.body.appendChild(audioPlayer);
  }

  audioPlayer.controls = false;
  audioPlayer.removeAttribute("controls");
  audioPlayer.style.display = "none";

  function resetButtons() {
    document.querySelectorAll(".play-button").forEach(button => {
      button.textContent = "▶";
      button.classList.remove("is-playing");
    });
  }

  audioPlayer.onpause = resetButtons;
  audioPlayer.onended = resetButtons;

  function playPreview(audioUrl, clickedButton = null) {
    if (!audioUrl) return;

    const absolute = new URL(audioUrl, location.href).href;
    const alreadyPlaying = audioPlayer.src === absolute && !audioPlayer.paused;

    if (alreadyPlaying) {
      audioPlayer.pause();
      resetButtons();
      return;
    }

    audioPlayer.src = audioUrl;
    audioPlayer.play().then(() => {
      resetButtons();
      if (clickedButton) {
        clickedButton.textContent = "❚❚";
        clickedButton.classList.add("is-playing");
      }
    }).catch(error => {
      console.error("Preview could not play:", error);
      resetButtons();
    });
  }

  document.querySelectorAll(".play-button").forEach(button => {
    if (button.dataset.previewBound === "true") return;
    button.dataset.previewBound = "true";

    button.addEventListener("click", event => {
      event.preventDefault();
      event.stopPropagation();
      playPreview(button.dataset.audio, button);
    });
  });

  document.querySelectorAll(".cover-wrap.has-preview").forEach(cover => {
    if (cover.dataset.previewBound === "true") return;
    cover.dataset.previewBound = "true";

    cover.addEventListener("click", event => {
      if (event.target.closest("a")) return;
      event.preventDefault();
      event.stopPropagation();

      const button = cover.querySelector(".play-button");
      playPreview(cover.dataset.audio, button);
    });
  });

  document.querySelectorAll(".expand-button").forEach(button => {
    if (button.dataset.expandBound === "true") return;
    button.dataset.expandBound = "true";

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

/* ---------- homepage latest #1s ---------- */

function getEntryRunStats(item, rows) {
  const key = makeKey(item.title, item.artistRaw);

  const run = rows
    .filter(row => makeKey(row.title, row.artistRaw) === key)
    .sort((a, b) => getWeekIndex(a) - getWeekIndex(b));

  return {
    weeksAtOne: run.filter(row => row.position === 1).length,
    totalWeeks: run.length,
    lastWeek: run[0] ? run[0].week : "—"
  };
}

function getLatestWeekRows(rows, chartType) {
  const weeks = getValidWeeks(rows);
  const latestWeek = weeks[0];
  if (!latestWeek) return [];
  return rows
    .filter(row => row.week === latestWeek)
    .sort((a, b) => a.position - b.position);
}

function getSupportMetricsForSong(songItem, chartRowsMap) {
  const key = makeKey(songItem.title, songItem.artistRaw);

  function matchMetric(chartType) {
    const rows = chartRowsMap[chartType] || [];
    const latestRows = getLatestWeekRows(rows, chartType);
    const found = latestRows.find(row => makeKey(row.title, row.artistRaw) === key);
    return found ? formatMetric(found) : "—";
  }

  return {
    streaming: matchMetric("streaming"),
    sales: matchMetric("sales"),
    radio: matchMetric("radio")
  };
}

function renderHomePreviewCard(item, chartType, week, stats, supportMetrics = null) {
  const metric = formatMetric(item);
  const label = SHORT_CHART_LABELS[chartType] || chartType;

  return `
    <article class="home-preview-card format-${escapeHTML(chartType)}">
      <div class="home-preview-head">
        <span class="home-format-pill">${escapeHTML(label)}</span>
        <span class="home-week-pill">${escapeHTML(week)}</span>
      </div>

      <div class="home-preview-main">
        <div class="cover-wrap ${item.audio ? "has-preview" : ""}" ${item.audio ? `data-audio="${escapeHTML(item.audio)}"` : ""}>
          ${
            item.cover
              ? `<img class="cover" src="${escapeHTML(item.cover)}" alt="${escapeHTML(item.title)} cover">`
              : `<div class="cover"></div>`
          }
          ${
            item.audio
              ? `<button class="preview-button play-button" data-audio="${escapeHTML(item.audio)}" aria-label="Play preview">▶</button>`
              : ""
          }
        </div>

        <div class="home-preview-info">
          <h3>#1 ${escapeHTML(item.title)}</h3>
          <p>${escapeHTML(item.artistRaw)}</p>
          ${metric ? `<strong>${escapeHTML(metric)}</strong>` : ""}
        </div>
      </div>

      <div class="home-preview-stats">
        <div><span>Weeks at #1</span><strong>${escapeHTML(stats.weeksAtOne)}</strong></div>
        <div><span>Total Weeks</span><strong>${escapeHTML(stats.totalWeeks)}</strong></div>
        <div><span>Last Week</span><strong>${escapeHTML(stats.lastWeek)}</strong></div>
      </div>

      ${
        chartType === "songs" && supportMetrics
          ? `
            <div class="home-support-metrics">
              <div><span>Streaming</span><strong>${escapeHTML(supportMetrics.streaming)}</strong></div>
              <div><span>Sales</span><strong>${escapeHTML(supportMetrics.sales)}</strong></div>
              <div><span>Radio</span><strong>${escapeHTML(supportMetrics.radio)}</strong></div>
            </div>
          `
          : ""
      }
    </article>
  `;
}

async function initHomeChartPreviews() {
  const grid = document.getElementById("homeChartPreviews");
  if (!grid || typeof SHEETS === "undefined") return;

  grid.innerHTML = `<p class="loading-message">Loading latest #1 chart previews...</p>`;

  const chartRowsMap = {};

  await Promise.all(
    SWEET16_CHART_PAGES.map(async chartType => {
      try {
        chartRowsMap[chartType] = await loadCSV(SHEETS[chartType], chartType);
      } catch (error) {
        console.error(`Could not load homepage preview for ${chartType}`, error);
        chartRowsMap[chartType] = [];
      }
    })
  );

  const cards = SWEET16_CHART_PAGES.map(chartType => {
    const rows = chartRowsMap[chartType] || [];
    const weeks = getValidWeeks(rows);
    const latestWeek = weeks[0];

    if (!latestWeek) return "";

    weekLists[chartType] = weeks;

    const latestRows = rows
      .filter(item => item.week === latestWeek)
      .sort((a, b) => a.position - b.position);

    const leader = latestRows.find(item => item.position === 1) || latestRows[0];
    if (!leader) return "";

    const stats = getEntryRunStats(leader, rows);
    const supportMetrics =
      chartType === "songs"
        ? getSupportMetricsForSong(leader, chartRowsMap)
        : null;

    return renderHomePreviewCard(leader, chartType, latestWeek, stats, supportMetrics);
  }).filter(Boolean);

  grid.innerHTML = cards.length
    ? cards.join("")
    : `
      <div class="panel">
        <h3>No latest #1s found.</h3>
        <p>Check your Google Sheets links in config.js.</p>
      </div>
    `;

  activateButtons();
}

/* ---------- admin / designer page themes ---------- */

function renderAdminThemeControls(settings) {
  const form = document.getElementById("customizeForm");
  if (!form || document.getElementById("pageThemeAdmin")) return;

  const pageLabels = {
    home: "Home",
    songs: "Songs",
    albums: "Albums",
    streaming: "Streaming",
    sales: "Sales",
    radio: "Radio",
    videos: "Videos",
    artists: "Artists",
    "number-ones": "All #1s",
    "year-end": "Year-End",
    certifications: "Certifications",
    designer: "Designer",
    admin: "Admin"
  };

  const section = document.createElement("section");
  section.id = "pageThemeAdmin";
  section.className = "admin-theme-panel";

  section.innerHTML = `
    <h2>Page Theme Controls</h2>
    <p>Set a different background, card color, text color, accent color, and fonts for every page.</p>

    <div class="page-theme-grid">
      ${SWEET16_THEME_PAGE_KEYS.map(key => {
        const theme = settings.pageThemes[key] || SWEET16_DEFAULT_PAGE_THEMES[key];
        return `
          <div class="page-theme-row" data-theme-key="${key}">
            <div class="page-theme-title">${pageLabels[key]}</div>

            <label>Page BG
              <input class="theme-page-bg" type="color" value="${theme.pageBg || "#121212"}">
            </label>

            <label>Page Text
              <input class="theme-page-text" type="color" value="${theme.pageText || "#ffffff"}">
            </label>

            <label>Card BG
              <input class="theme-card-bg" type="color" value="${theme.cardBg || "#0a0a0a"}">
            </label>

            <label>Card Text
              <input class="theme-card-text" type="color" value="${theme.cardText || "#ffffff"}">
            </label>

            <label>Accent
              <input class="theme-accent" type="color" value="${theme.accent || "#ffffff"}">
            </label>

            <label>Heading Font
              <input class="theme-heading-font" type="text" value="${theme.headingFont || "inherit"}" placeholder="inherit or Inter, Arial, sans-serif">
            </label>

            <label>Body Font
              <input class="theme-body-font" type="text" value="${theme.bodyFont || "inherit"}" placeholder="inherit or Inter, Arial, sans-serif">
            </label>
          </div>
        `;
      }).join("")}
    </div>
  `;

  form.insertAdjacentElement("beforeend", section);
}

function collectPageThemeSettings() {
  const pageThemes = {};

  document.querySelectorAll("[data-theme-key]").forEach(row => {
    const key = row.dataset.themeKey;
    pageThemes[key] = {
      pageBg: row.querySelector(".theme-page-bg").value,
      pageText: row.querySelector(".theme-page-text").value,
      cardBg: row.querySelector(".theme-card-bg").value,
      cardText: row.querySelector(".theme-card-text").value,
      accent: row.querySelector(".theme-accent").value,
      headingFont: row.querySelector(".theme-heading-font").value || "inherit",
      bodyFont: row.querySelector(".theme-body-font").value || "inherit"
    };
  });

  return pageThemes;
}

function initAdminPage() {
  const form = document.getElementById("customizeForm");
  if (!form) return;

  const settings = getSiteSettings();

  document.getElementById("siteTitle").value = settings.siteTitle || "";
  document.getElementById("siteTagline").value = settings.siteTagline || "";
  document.getElementById("newsTitle").value = settings.newsTitle || "";
  document.getElementById("newsBody").value = settings.newsBody || "";
  document.getElementById("newsImage").value = settings.newsImage || "";
  document.getElementById("accentColor").value = settings.accentColor || "#ffffff";

  if (typeof renderAdminPageStatusControls === "function") {
    renderAdminPageStatusControls(settings);
  }

  renderAdminThemeControls(settings);

  const exportBox = document.getElementById("settingsExport");

  function collectSettings() {
    return {
      siteTitle: document.getElementById("siteTitle").value,
      siteTagline: document.getElementById("siteTagline").value,
      newsTitle: document.getElementById("newsTitle").value,
      newsBody: document.getElementById("newsBody").value,
      newsImage: document.getElementById("newsImage").value,
      accentColor: document.getElementById("accentColor").value,
      pageStatus: typeof collectPageStatusSettings === "function" ? collectPageStatusSettings() : {},
      pageThemes: collectPageThemeSettings()
    };
  }

  function updateExportBox(nextSettings) {
    if (!exportBox) return;
    exportBox.value = `window.SWEET16_SETTINGS = ${JSON.stringify(nextSettings, null, 2)};`;
  }

  updateExportBox(settings);

  form.addEventListener("submit", event => {
    event.preventDefault();

    const nextSettings = collectSettings();
    localStorage.setItem("sweet16SiteSettings", JSON.stringify(nextSettings));
    updateExportBox(nextSettings);
    applySiteSettings();

    const status = document.getElementById("adminStatus");
    if (status) {
      status.textContent = "Saved in this browser. Copy the export code into site-settings.js to make it public.";
    }
  });

  const resetButton = document.getElementById("resetCustomize");
  if (resetButton && !resetButton.dataset.themeBound) {
    resetButton.dataset.themeBound = "true";
    resetButton.addEventListener("click", () => {
      localStorage.removeItem("sweet16SiteSettings");
      location.reload();
    });
  }
}

/* ---------- startup ---------- */

document.addEventListener("DOMContentLoaded", () => {
  applySiteSettings();
  activateButtons();

  if (document.body.dataset.page === "home") {
    initHomeChartPreviews();
  }

  if (document.body.dataset.page === "admin") {
    initAdminPage();
  }
});

/* =========================================================
   SWEET 16 AUTO PREVIEW PATCH
   Apple/iTunes preview lookup + hidden audio player
   Paste at the VERY BOTTOM of script.js
========================================================= */

const SWEET16_PREVIEW_CACHE_KEY = "sweet16PreviewCacheV3";

function getPreviewCache() {
  try {
    return JSON.parse(localStorage.getItem(SWEET16_PREVIEW_CACHE_KEY) || "{}");
  } catch (error) {
    return {};
  }
}

function savePreviewCache(cache) {
  try {
    localStorage.setItem(SWEET16_PREVIEW_CACHE_KEY, JSON.stringify(cache));
  } catch (error) {
    console.warn("Could not save preview cache", error);
  }
}

function normalizePreviewText(value) {
  return clean(value)
    .toLowerCase()
    .replace(/\([^)]*\)/g, " ")
    .replace(/\[[^\]]*\]/g, " ")
    .replace(/feat\.|ft\.|featuring/g, " ")
    .replace(/[^a-z0-9áéíóúñü]+/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function makePreviewCacheKey(title, artist) {
  return `${normalizePreviewText(title)}|${normalizePreviewText(artist)}`;
}

function isDirectPreviewUrl(value) {
  const url = clean(value);
  if (!/^https?:\/\//i.test(url)) return false;

  const lower = url.toLowerCase();

  if (lower.match(/\.(jpg|jpeg|png|gif|webp)(\?|$)/)) return false;
  if (lower.includes("spotify.com/track")) return false;
  if (lower.includes("spotify.com/album")) return false;
  if (lower.includes("music.apple.com")) return false;

  return (
    lower.includes("audio-ssl.itunes.apple.com") ||
    lower.includes("audio.itunes.apple.com") ||
    lower.includes(".m4a") ||
    lower.includes(".mp3") ||
    lower.includes(".aac") ||
    lower.includes(".wav")
  );
}

function extractPreviewTitle(row) {
  if (!row) return "";

  const titleNode =
    row.querySelector(".home-preview-info h3") ||
    row.querySelector(".compact-song-info h3") ||
    row.querySelector(".year-end-main h3") ||
    row.querySelector(".certification-main h3") ||
    row.querySelector("h3");

  let title = titleNode ? titleNode.textContent : "";

  title = title
    .replace(/^#\d+\s*/i, "")
    .replace(/^#1\s*/i, "")
    .replace(/^NEW\s*/i, "")
    .trim();

  return title;
}

function extractPreviewArtist(row) {
  if (!row) return "";

  const artistLinks = Array.from(row.querySelectorAll('a[href*="artists.html"]'))
    .map(link => clean(link.textContent))
    .filter(Boolean);

  if (artistLinks.length) return artistLinks.join(" & ");

  const artistNode =
    row.querySelector(".home-preview-info p") ||
    row.querySelector(".compact-song-info p") ||
    row.querySelector(".year-end-artists") ||
    row.querySelector(".certification-artists") ||
    row.querySelector("p");

  return artistNode ? clean(artistNode.textContent) : "";
}

function getPreviewRowFromElement(element) {
  return (
    element.closest(".home-preview-card") ||
    element.closest(".compact-chart-row") ||
    element.closest(".artist-entry") ||
    element.closest(".artist-card") ||
    element.closest(".year-end-card") ||
    element.closest(".year-end-card-clean") ||
    element.closest(".certification-card") ||
    element.closest("article") ||
    element.closest("li") ||
    element.parentElement
  );
}

function scoreITunesResult(result, title, artist) {
  const targetTitle = normalizePreviewText(title);
  const targetArtist = normalizePreviewText(artist);
  const resultTitle = normalizePreviewText(result.trackName || "");
  const resultArtist = normalizePreviewText(result.artistName || "");

  let score = 0;

  if (resultTitle === targetTitle) score += 100;
  else if (resultTitle.includes(targetTitle) || targetTitle.includes(resultTitle)) score += 45;

  if (resultArtist === targetArtist) score += 80;
  else if (resultArtist.includes(targetArtist) || targetArtist.includes(resultArtist)) score += 35;

  if (result.previewUrl) score += 30;

  return score;
}

async function lookupITunesTrackPreview(title, artist) {
  const query = `${title} ${artist}`.trim();
  if (!query) return "";

  const url =
    "https://itunes.apple.com/search" +
    `?term=${encodeURIComponent(query)}` +
    "&media=music" +
    "&entity=song" +
    "&limit=15" +
    "&country=US";

  const response = await fetch(url);
  if (!response.ok) return "";

  const data = await response.json();
  const results = Array.isArray(data.results) ? data.results : [];

  const best = results
    .filter(result => result.previewUrl)
    .sort((a, b) => scoreITunesResult(b, title, artist) - scoreITunesResult(a, title, artist))[0];

  return best ? best.previewUrl : "";
}

async function lookupITunesAlbumPreview(title, artist) {
  const query = `${title} ${artist}`.trim();
  if (!query) return "";

  const albumSearchUrl =
    "https://itunes.apple.com/search" +
    `?term=${encodeURIComponent(query)}` +
    "&media=music" +
    "&entity=album" +
    "&limit=5" +
    "&country=US";

  const response = await fetch(albumSearchUrl);
  if (!response.ok) return "";

  const data = await response.json();
  const albums = Array.isArray(data.results) ? data.results : [];
  const album = albums[0];

  if (!album || !album.collectionId) return "";

  const lookupUrl =
    "https://itunes.apple.com/lookup" +
    `?id=${encodeURIComponent(album.collectionId)}` +
    "&entity=song" +
    "&limit=10" +
    "&country=US";

  const lookupResponse = await fetch(lookupUrl);
  if (!lookupResponse.ok) return "";

  const lookupData = await lookupResponse.json();
  const tracks = Array.isArray(lookupData.results) ? lookupData.results : [];

  const firstTrackWithPreview = tracks.find(item => item.wrapperType === "track" && item.previewUrl);

  return firstTrackWithPreview ? firstTrackWithPreview.previewUrl : "";
}

async function getAutoPreviewUrl(title, artist, preferAlbum = false) {
  const cacheKey = makePreviewCacheKey(title, artist);
  const cache = getPreviewCache();

  if (cache[cacheKey]) return cache[cacheKey];

  let preview = "";

  try {
    preview = preferAlbum
      ? await lookupITunesAlbumPreview(title, artist)
      : await lookupITunesTrackPreview(title, artist);

    if (!preview && !preferAlbum) {
      preview = await lookupITunesAlbumPreview(title, artist);
    }

    if (!preview && preferAlbum) {
      preview = await lookupITunesTrackPreview(title, artist);
    }
  } catch (error) {
    console.warn("Preview lookup failed:", title, artist, error);
  }

  if (preview) {
    cache[cacheKey] = preview;
    savePreviewCache(cache);
  }

  return preview;
}

function getOrCreateHiddenAudioPlayer() {
  let audioPlayer = document.getElementById("audioPlayer");

  if (!audioPlayer) {
    audioPlayer = document.createElement("audio");
    audioPlayer.id = "audioPlayer";
    audioPlayer.className = "audio-player";
    audioPlayer.preload = "none";
    document.body.appendChild(audioPlayer);
  }

  audioPlayer.controls = false;
  audioPlayer.removeAttribute("controls");
  audioPlayer.style.display = "none";

  return audioPlayer;
}

function resetSweet16PreviewButtons() {
  document.querySelectorAll(".play-button").forEach(button => {
    button.textContent = "▶";
    button.classList.remove("is-playing");
    button.classList.remove("is-loading");
  });
}

async function playSweet16Preview(button) {
  const audioPlayer = getOrCreateHiddenAudioPlayer();

  let audioUrl = clean(button.dataset.audio);
  const title = clean(button.dataset.title);
  const artist = clean(button.dataset.artist);
  const preferAlbum = button.dataset.chartType === "albums";

  if (!audioUrl && title) {
    button.textContent = "…";
    button.classList.add("is-loading");

    audioUrl = await getAutoPreviewUrl(title, artist, preferAlbum);

    button.classList.remove("is-loading");

    if (audioUrl) {
      button.dataset.audio = audioUrl;

      const cover = button.closest(".cover-wrap") || button.parentElement;
      if (cover) {
        cover.dataset.audio = audioUrl;
        cover.classList.add("has-preview");
      }
    }
  }

  if (!audioUrl) {
    button.textContent = "×";
    setTimeout(() => {
      button.textContent = "▶";
    }, 900);
    return;
  }

  const absolute = new URL(audioUrl, location.href).href;
  const alreadyPlaying = audioPlayer.src === absolute && !audioPlayer.paused;

  if (alreadyPlaying) {
    audioPlayer.pause();
    resetSweet16PreviewButtons();
    return;
  }

  audioPlayer.src = audioUrl;

  audioPlayer.play().then(() => {
    resetSweet16PreviewButtons();
    button.textContent = "❚❚";
    button.classList.add("is-playing");
  }).catch(error => {
    console.error("Preview could not play:", error);
    resetSweet16PreviewButtons();
  });
}

function addPreviewButtonToCover(coverTarget) {
  if (!coverTarget) return;

  const row = getPreviewRowFromElement(coverTarget);
  const title = extractPreviewTitle(row);
  const artist = extractPreviewArtist(row);
  const chartType = document.body.dataset.chart || "";

  if (!title) return;

  coverTarget.classList.add("cover-wrap");
  coverTarget.style.position = "relative";

  let directAudio = clean(coverTarget.dataset.audio);

  if (!directAudio) {
    const possibleDirect = Array.from(row ? row.querySelectorAll("[data-audio]") : [])
      .map(item => clean(item.dataset.audio))
      .find(isDirectPreviewUrl);

    directAudio = possibleDirect || "";
  }

  let button = coverTarget.querySelector(".play-button");

  if (!button) {
    button = document.createElement("button");
    button.type = "button";
    button.className = "preview-button play-button";
    button.textContent = "▶";
    button.setAttribute("aria-label", "Play preview");
    coverTarget.appendChild(button);
  }

  button.dataset.title = title;
  button.dataset.artist = artist;
  button.dataset.chartType = chartType;

  if (directAudio) {
    button.dataset.audio = directAudio;
    coverTarget.dataset.audio = directAudio;
    coverTarget.classList.add("has-preview");
  }

  coverTarget.classList.add("has-preview");
}

function ensurePreviewButtons() {
  const coverTargets = new Set();

  document.querySelectorAll(".cover-wrap").forEach(item => coverTargets.add(item));

  document.querySelectorAll("img.cover, .cover, .year-end-cover, .certification-cover").forEach(item => {
    const target = item.closest(".cover-wrap") || item.parentElement;
    if (target) coverTargets.add(target);
  });

  coverTargets.forEach(target => addPreviewButtonToCover(target));
}

function activateButtons() {
  const audioPlayer = getOrCreateHiddenAudioPlayer();

  audioPlayer.onpause = resetSweet16PreviewButtons;
  audioPlayer.onended = resetSweet16PreviewButtons;

  ensurePreviewButtons();

  document.querySelectorAll(".play-button").forEach(button => {
    if (button.dataset.previewBound === "true") return;
    button.dataset.previewBound = "true";

    button.addEventListener("click", event => {
      event.preventDefault();
      event.stopPropagation();
      playSweet16Preview(button);
    });
  });

  document.querySelectorAll(".cover-wrap").forEach(cover => {
    if (cover.dataset.coverPreviewBound === "true") return;
    cover.dataset.coverPreviewBound = "true";

    cover.addEventListener("click", event => {
      if (event.target.closest("a")) return;
      if (event.target.closest(".expand-button")) return;

      event.preventDefault();
      event.stopPropagation();

      const button = cover.querySelector(".play-button");
      if (button) playSweet16Preview(button);
    });
  });

  document.querySelectorAll(".expand-button").forEach(button => {
    if (button.dataset.expandBound === "true") return;
    button.dataset.expandBound = "true";

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

document.addEventListener("DOMContentLoaded", () => {
  activateButtons();

  const observer = new MutationObserver(() => {
    activateButtons();
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true
  });
});

/* =========================================================
   SWEET 16 MOVEMENT + PAGE REOPEN PATCH
   Paste at the VERY BOTTOM of script.js
========================================================= */

function s16NormalizeMovementText(text) {
  return String(text || "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, " ");
}

function s16ApplyMovementClasses() {
  const possibleBadges = Array.from(document.querySelectorAll(
    ".movement, .chart-movement, .compact-movement, .position-change, .movement-badge, .compact-chart-row > div, .compact-chart-row span"
  ));

  possibleBadges.forEach(el => {
    const text = s16NormalizeMovementText(el.textContent);

    if (!text) return;

    el.classList.remove(
      "s16-move-new",
      "s16-move-up",
      "s16-move-down",
      "s16-move-reentry",
      "s16-move-current"
    );

    if (text === "NEW") {
      el.classList.add("s16-move-badge", "s16-move-new");
    } else if (text.includes("▲") || text.includes("RISE") || text.includes("UP")) {
      el.classList.add("s16-move-badge", "s16-move-up");
    } else if (text.includes("▼") || text.includes("FALL") || text.includes("DOWN")) {
      el.classList.add("s16-move-badge", "s16-move-down");
    } else if (text.includes("RE-ENTRY") || text.includes("RE ENTRY") || text.includes("RE-ENTER") || text.includes("RE ENTER")) {
      el.classList.add("s16-move-badge", "s16-move-reentry");
    } else if (text === "▬" || text === "—" || text === "-" || text.includes("CURRENT") || text.includes("SAME")) {
      el.classList.add("s16-move-badge", "s16-move-current");
    }
  });
}

function s16GetSettingsForPagePatch() {
  try {
    return JSON.parse(localStorage.getItem("sweet16SiteSettings") || "{}");
  } catch (error) {
    return {};
  }
}

function s16SaveSettingsForPagePatch(settings) {
  localStorage.setItem("sweet16SiteSettings", JSON.stringify(settings));
}

function s16EnableAllPages() {
  const settings = s16GetSettingsForPagePatch();

  const keys = [
    "home",
    "songs",
    "albums",
    "streaming",
    "sales",
    "radio",
    "videos",
    "artists",
    "number-ones",
    "year-end",
    "certifications",
    "designer",
    "admin"
  ];

  settings.pageStatus = settings.pageStatus || {};

  keys.forEach(key => {
    settings.pageStatus[key] = {
      ...(settings.pageStatus[key] || {}),
      enabled: true,
      messageType: "coming-soon",
      customMessage: ""
    };
  });

  s16SaveSettingsForPagePatch(settings);

  alert("All pages were re-enabled in this browser. Copy/export your settings again if you want this public.");
  location.reload();
}

function s16AddReopenPagesButton() {
  const page =
    document.body.dataset.page ||
    document.body.dataset.chart ||
    location.pathname.split("/").pop().replace(".html", "");

  if (page !== "admin" && page !== "designer") return;
  if (document.getElementById("s16EnableAllPages")) return;

  const target =
    document.getElementById("s16ThemeStudio") ||
    document.querySelector("main") ||
    document.body;

  const box = document.createElement("section");
  box.className = "s16-page-rescue-box";
  box.innerHTML = `
    <h2>Page Access Rescue</h2>
    <p>If you disabled pages and they will not open again, use this to re-enable every page in this browser.</p>
    <button type="button" id="s16EnableAllPages">Re-open All Pages</button>
  `;

  target.insertAdjacentElement("beforebegin", box);

  document.getElementById("s16EnableAllPages").addEventListener("click", s16EnableAllPages);
}

document.addEventListener("DOMContentLoaded", () => {
  s16ApplyMovementClasses();
  s16AddReopenPagesButton();

  const movementObserver = new MutationObserver(() => {
    s16ApplyMovementClasses();
    s16AddReopenPagesButton();
  });

  movementObserver.observe(document.body, {
    childList: true,
    subtree: true,
    characterData: true
  });
});

/* =========================================================
   SWEET 16 MOVEMENT BUG FIX
========================================================= */

function s16NormalizeMoveText(value) {
  return String(value || "").trim().toUpperCase().replace(/\s+/g, " ");
}

function s16ApplyMovementClasses() {
  const nodes = document.querySelectorAll(
    ".movement, .chart-movement, .position-change, .movement-badge, .compact-chart-row .movement"
  );

  nodes.forEach(el => {
    const text = s16NormalizeMoveText(el.textContent);

    el.classList.remove(
      "s16-move-new",
      "s16-move-up",
      "s16-move-down",
      "s16-move-reentry",
      "s16-move-current",
      "s16-move-badge"
    );

    if (!text) return;

    if (text === "NEW") {
      el.classList.add("s16-move-badge", "s16-move-new");
      return;
    }

    if (text === "RE-ENTRY" || text === "RE ENTRY" || text === "REENTER" || text === "RE-ENTER") {
      el.classList.add("s16-move-badge", "s16-move-reentry");
      return;
    }

    if (/^▲\s*\d+$/.test(text) || /^UP\s*\d+$/.test(text) || /^RISE\s*\d+$/.test(text)) {
      el.classList.add("s16-move-badge", "s16-move-up");
      return;
    }

    if (/^▼\s*\d+$/.test(text) || /^DOWN\s*\d+$/.test(text) || /^FALL\s*\d+$/.test(text)) {
      el.classList.add("s16-move-badge", "s16-move-down");
      return;
    }

    if (text === "▬" || text === "—" || text === "-" || text === "SAME" || text === "CURRENT") {
      el.classList.add("s16-move-badge", "s16-move-current");
    }
  });
}

document.addEventListener("DOMContentLoaded", () => {
  s16ApplyMovementClasses();

  const obs = new MutationObserver(() => {
    s16ApplyMovementClasses();
  });

  obs.observe(document.body, {
    childList: true,
    subtree: true,
    characterData: true
  });
});

/* =========================================================
   SWEET 16 IMAGE + ARTIST + HOME BANNER EMERGENCY FIX
   Paste at the VERY BOTTOM of script.js
========================================================= */

function s16CleanValue(value) {
  return value === undefined || value === null ? "" : String(value).replaceAll('"', "").trim();
}

function s16LooksLikeImageUrl(value) {
  const url = s16CleanValue(value);
  if (!/^https?:\/\//i.test(url)) return false;

  const lower = url.toLowerCase();

  if (lower.includes("spotify.com/track")) return false;
  if (lower.includes("spotify.com/album")) return false;
  if (lower.includes("music.apple.com")) return false;
  if (lower.includes("youtube.com/watch")) return false;
  if (lower.includes("youtu.be/")) return false;

  return (
    /\.(jpg|jpeg|png|gif|webp)(\?|$)/i.test(lower) ||
    lower.includes("is1-ssl.mzstatic.com") ||
    lower.includes("is2-ssl.mzstatic.com") ||
    lower.includes("is3-ssl.mzstatic.com") ||
    lower.includes("is4-ssl.mzstatic.com") ||
    lower.includes("is5-ssl.mzstatic.com") ||
    lower.includes("i.scdn.co/image") ||
    lower.includes("image-cdn-ak.spotifycdn.com") ||
    lower.includes("ytimg.com/vi/") ||
    lower.includes("googleusercontent.com") ||
    lower.includes("wikimedia.org") ||
    lower.includes("media.discordapp.net") ||
    lower.includes("cdn.discordapp.com")
  );
}

function s16PreferImageUrl(value, chartType = "") {
  const url = s16CleanValue(value);
  if (!s16LooksLikeImageUrl(url)) return "";

  const lower = url.toLowerCase();

  if (chartType !== "videos" && lower.includes("ytimg.com/vi/")) {
    return "";
  }

  return url;
}

/* Override the old image finder.
   This scans the whole row and supports Spotify/Apple image URLs without extensions. */
function findImage(row, fallbackIndex = 8) {
  const chartType = typeof getChartType === "function" ? getChartType() : "";

  const preferredColumns = [
    fallbackIndex,
    8,  // common final cover
    4,  // custom song cover
    7,  // custom video cover
    6,  // YouTube thumbnail
    1,  // iTunes / possible image
    2,  // Apple Music / possible image
    3   // Spotify / possible image
  ];

  for (const index of preferredColumns) {
    const found = s16PreferImageUrl(row[index], chartType);
    if (found) return found;
  }

  for (const cell of row) {
    const found = s16PreferImageUrl(cell, chartType);
    if (found) return found;
  }

  return "";
}

/* Also override loadCSV so every chart type passes into the image finder correctly. */
async function loadCSV(url, chartType) {
  const finalUrl = url.includes("?") ? `${url}&cache=${Date.now()}` : `${url}?cache=${Date.now()}`;
  const response = await fetch(finalUrl);
  const text = await response.text();

  if (!window.Papa) {
    throw new Error("PapaParse is missing. Make sure papaparse is loaded before script.js.");
  }

  const parsed = Papa.parse(text, { skipEmptyLines: true });

  return parsed.data
    .map((row, index) => {
      const fromFullName = splitFullName(row[2]);
      const title = clean(row[5]) || fromFullName.title;
      const artistRaw = clean(row[6]) || fromFullName.artist;
      const metricRaw = getMetricRaw(row, chartType);
      const metricNumber = getMetricNumber(row, chartType);

      return {
        index,
        chartType,
        week: clean(row[0]),
        position: parsePosition(row[1]),
        fullName: clean(row[2]),
        metricRaw,
        metricNumber,
        title,
        artistRaw,
        artistCredits: splitArtists(artistRaw),
        cover: findImage(row, chartType === "videos" ? 9 : 8),
        audio: findPreviewAudio(row)
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

/* Read BOTH old settings and new settings so banner works either way. */
function s16GetMergedSettingsForBanner() {
  let saved = {};

  try {
    saved = JSON.parse(localStorage.getItem("sweet16SiteSettings") || "{}");
  } catch (error) {
    saved = {};
  }

  return {
    ...(window.SWEET16_SETTINGS || {}),
    ...saved
  };
}

function s16GetHomeNewsData() {
  const settings = s16GetMergedSettingsForBanner();
  const homeNews = settings.homeNews || {};

  return {
    eyebrow: homeNews.eyebrow || "This Week on Sweet 16",
    title: homeNews.title || settings.newsTitle || "Sweet 16 News",
    body: homeNews.body || settings.newsBody || "Latest chart news will appear here.",
    banner: homeNews.banner || settings.newsImage || "",
    songTitle: homeNews.songTitle || "",
    songArtist: homeNews.songArtist || "",
    songCover: homeNews.songCover || homeNews.cover || "",
    songAudio: homeNews.songAudio || homeNews.audio || "",
    buttonText: homeNews.buttonText || "View Songs Chart",
    link: homeNews.link || "songs.html"
  };
}

function s16ForceHomeNewsBanner() {
  const isHome =
    document.body.dataset.page === "home" ||
    location.pathname.endsWith("index.html") ||
    location.pathname.endsWith("/");

  if (!isHome) return;

  const news = s16GetHomeNewsData();

  let block = document.getElementById("homeNews");

  if (!block) {
    const hero = document.querySelector(".home-hero") || document.querySelector("main");
    if (!hero) return;

    block = document.createElement("section");
    block.id = "homeNews";
    hero.insertAdjacentElement("afterend", block);
  }

  block.className = "home-news s16-home-news-fixed";

  block.style.backgroundImage = news.banner
    ? `linear-gradient(90deg, rgba(0,0,0,.90), rgba(0,0,0,.52)), url("${news.banner}")`
    : `linear-gradient(90deg, rgba(0,0,0,.94), rgba(0,0,0,.66))`;

  block.innerHTML = `
    <div class="home-news-copy">
      <span class="home-news-kicker">${escapeHTML(news.eyebrow)}</span>
      <h2>${escapeHTML(news.title)}</h2>
      <p>${escapeHTML(news.body)}</p>
      <a class="home-news-button" href="${escapeHTML(news.link)}">${escapeHTML(news.buttonText)}</a>
    </div>

    ${
      news.songTitle || news.songCover
        ? `
          <div class="home-news-song">
            <div class="cover-wrap has-preview" ${news.songAudio ? `data-audio="${escapeHTML(news.songAudio)}"` : ""}>
              ${
                news.songCover
                  ? `<img class="cover" src="${escapeHTML(news.songCover)}" alt="${escapeHTML(news.songTitle)} cover">`
                  : `<div class="cover"></div>`
              }
              <button
                class="preview-button play-button"
                aria-label="Play preview"
                data-title="${escapeHTML(news.songTitle)}"
                data-artist="${escapeHTML(news.songArtist)}"
                ${news.songAudio ? `data-audio="${escapeHTML(news.songAudio)}"` : ""}
              >▶</button>
            </div>

            <div class="home-news-song-info">
              <h3>${escapeHTML(news.songTitle)}</h3>
              <p>${escapeHTML(news.songArtist)}</p>
            </div>
          </div>
        `
        : ""
    }
  `;

  if (typeof activateButtons === "function") {
    activateButtons();
  }
}

/* Repair artist/certification/year-end rows after they render. */
function s16RepairVisibleRows() {
  const rows = document.querySelectorAll(`
    .artist-entry,
    .artist-card,
    .artist-song-card,
    .artist-panel article,
    .certification-card,
    .year-end-card,
    .year-end-card-clean,
    #certificationChart article,
    #certificationChart > div,
    #yearEndChart article,
    #yearEndChart > div
  `);

  rows.forEach(row => {
    row.classList.add("s16-visible-row");

    const cover =
      row.querySelector(".cover-wrap") ||
      row.querySelector("img.cover")?.parentElement ||
      row.querySelector(".certification-cover")?.parentElement ||
      row.querySelector(".year-end-cover")?.parentElement;

    if (cover) {
      cover.classList.add("cover-wrap");
    }
  });
}

document.addEventListener("DOMContentLoaded", () => {
  setTimeout(() => {
    s16ForceHomeNewsBanner();
    s16RepairVisibleRows();

    if (typeof activateButtons === "function") {
      activateButtons();
    }
  }, 250);

  const s16RepairObserver = new MutationObserver(() => {
    s16RepairVisibleRows();
  });

  s16RepairObserver.observe(document.body, {
    childList: true,
    subtree: true
  });
});
