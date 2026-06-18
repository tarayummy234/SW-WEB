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
      return getWeekIndex(b) - getWeekIndex(a);
    });

  if (run.length === 0) {
    return `
      <div class="run-empty">No chart history found.</div>
    `;
  }

  const peak = Math.min(...run.map(item => item.position));
  const weeks = run.length;
  const debut = run[0];
  const latest = run[run.length - 1];

  return `
    <div class="run-stats">
      <div>
        <strong>#${escapeHTML(peak)}</strong>
        <span>Peak</span>
      </div>

      <div>
        <strong>${escapeHTML(weeks)}</strong>
        <span>Total weeks</span>
      </div>

      <div>
        <strong>${escapeHTML(debut.week)}</strong>
        <span>Debut week</span>
      </div>

      <div>
        <strong>#${escapeHTML(latest.position)}</strong>
        <span>Latest position</span>
      </div>
    </div>

    <div class="run-history">
      ${run.map(item => `
        <div class="run-week">
          <span>${escapeHTML(item.week)}</span>
          <strong>#${escapeHTML(item.position)}</strong>
        </div>
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
      <article class="compact-chart-item">
        <div class="compact-rank">#${escapeHTML(item.position)}</div>

        <div class="compact-cover-wrap ${item.audio ? "has-audio" : ""}" ${item.audio ? `data-audio="${escapeHTML(item.audio)}"` : ""}>
          ${item.cover ? `
            <img class="compact-cover" src="${escapeHTML(item.cover)}" alt="${escapeHTML(item.title)} cover">
          ` : `
            <div class="compact-cover placeholder-cover"></div>
          `}

          ${item.audio ? `
            <button class="play-button image-play-button" data-audio="${escapeHTML(item.audio)}" aria-label="Play preview">
              ▶
            </button>
          ` : ""}
        </div>

        <div class="compact-main">
          <h3>${escapeHTML(item.title)}</h3>
          <p>${renderArtistLinks(item)}</p>

          <div class="compact-meta">
            ${metric ? `<span>${escapeHTML(metric)}</span>` : ""}
            <span class="movement ${movementClass}">${escapeHTML(movement)}</span>
          </div>
        </div>

        <button class="compact-expand-button expand-button" data-run="run-${id}" aria-label="Show chart history">
          +
        </button>

        <div class="compact-chart-run chart-run" id="run-${id}">
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
    audioPlayer.controls = true;
    document.body.appendChild(audioPlayer);
  }

  function playPreview(audioUrl) {
    if (!audioUrl) return;

    if (audioPlayer.src === audioUrl && !audioPlayer.paused) {
      audioPlayer.pause();
      return;
    }

    audioPlayer.src = audioUrl;
    audioPlayer.play().catch(error => {
      console.error("Preview could not play:", error);
    });
  }

  document.querySelectorAll(".play-button").forEach(button => {
    button.addEventListener("click", event => {
      event.preventDefault();
      event.stopPropagation();
      playPreview(button.dataset.audio);
    });
  });

  document.querySelectorAll(".compact-cover-wrap.has-audio").forEach(cover => {
    cover.addEventListener("click", event => {
      event.preventDefault();
      event.stopPropagation();
      playPreview(cover.dataset.audio);
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
