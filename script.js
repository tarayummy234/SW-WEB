const CHART_CONFIG = {
  songs: {
    label: "Songs",
    sheet: () => SHEETS.songs
  },
  albums: {
    label: "Albums",
    sheet: () => SHEETS.albums
  },
  videos: {
    label: "Music Videos",
    sheet: () => SHEETS.videos
  },
  streaming: {
    label: "Streaming",
    sheet: () => SHEETS.streaming
  },
  sales: {
    label: "Sales",
    sheet: () => SHEETS.sales
  },
  radio: {
    label: "Radio",
    sheet: () => SHEETS.radio
  }
};

let chartRows = [];
let chartWeeks = [];
let currentChartType = "";
let expandedHistoryKey = null;

let allArtistRows = [];
let currentArtist = "";
let currentArtistTab = "songs";
let artistShowFullList = false;

const previewCache = {};

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

function normalize(value) {
  return clean(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
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

function formatCompact(number) {
  if (!number || Number.isNaN(number)) return "0";

  if (Math.abs(number) >= 1000000000) {
    return `${(number / 1000000000).toFixed(1).replace(".0", "")}B`;
  }

  if (Math.abs(number) >= 1000000) {
    return `${(number / 1000000).toFixed(1).replace(".0", "")}M`;
  }

  if (Math.abs(number) >= 1000) {
    return `${(number / 1000).toFixed(1).replace(".0", "")}K`;
  }

  return Math.round(number).toLocaleString();
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
    const parts = text.split(" - ").map(clean).filter(Boolean);

    if (parts.length >= 2) {
      return {
        title: parts[0],
        artist: parts.slice(1).join(" - ")
      };
    }
  }

  return {
    title: text,
    artist: ""
  };
}

function splitArtists(artistText) {
  const text = clean(artistText);

  if (!text) return [];

  return text
    .replace(/\s+feat\.\s+/gi, ",")
    .replace(/\s+featuring\s+/gi, ",")
    .replace(/\s+with\s+/gi, ",")
    .replace(/\s+&\s+/g, ",")
    .replace(/\s+and\s+/gi, ",")
    .replace(/\s+x\s+/gi, ",")
    .split(",")
    .map(clean)
    .filter(Boolean);
}

function makeEntryKey(item) {
  return `${item.chartType}|${normalize(item.title)}|${normalize(item.artist)}`;
}

function artistURL(artist) {
  return `artists.html?artist=${encodeURIComponent(clean(artist))}`;
}

function parseChartCSV(data, chartType) {
  return data
    .map(row => {
      const fromFullName = splitFullName(row[2]);

      const title = clean(row[5]) || fromFullName.title;
      const artist = clean(row[6]) || fromFullName.artist;

      const metricRaw =
        chartType === "streaming" ||
        chartType === "sales" ||
        chartType === "radio"
          ? clean(row[9])
          : clean(row[3]);

      return {
        chartType,
        week: clean(row[0]),
        position: parsePosition(row[1]),
        title,
        artist,
        pointsRaw: clean(row[3]),
        cover: clean(row[8]),
        metricRaw,
        metricNumber: metricToNumber(metricRaw)
      };
    })
    .filter(item => {
      return (
        item.week &&
        item.title &&
        item.artist &&
        !Number.isNaN(item.position) &&
        item.position > 0
      );
    });
}

async function loadCSV(url, chartType) {
  const response = await fetch(url);
  const text = await response.text();

  const parsed = Papa.parse(text, {
    skipEmptyLines: true
  });

  return parseChartCSV(parsed.data, chartType);
}

function getUniqueWeeks(rows) {
  const seen = new Set();
  const weeks = [];

  rows.forEach(row => {
    if (!seen.has(row.week)) {
      seen.add(row.week);
      weeks.push(row.week);
    }
  });

  return weeks;
}

function getRowsForWeek(week) {
  return chartRows
    .filter(row => row.week === week)
    .sort((a, b) => a.position - b.position);
}

function getPreviousPosition(item) {
  const weekIndex = chartWeeks.indexOf(item.week);

  if (weekIndex === -1) return null;

  const previousWeek = chartWeeks[weekIndex + 1];

  if (!previousWeek) return null;

  const previousRow = chartRows.find(row => {
    return (
      row.week === previousWeek &&
      normalize(row.title) === normalize(item.title) &&
      normalize(row.artist) === normalize(item.artist)
    );
  });

  return previousRow ? previousRow.position : null;
}

function getMovement(item) {
  const previousPosition = getPreviousPosition(item);

  if (!previousPosition) {
    return {
      label: "NEW",
      className: "new"
    };
  }

  if (previousPosition === item.position) {
    return {
      label: "—",
      className: "same"
    };
  }

  if (item.position < previousPosition) {
    return {
      label: `▲ ${previousPosition - item.position}`,
      className: "up"
    };
  }

  return {
    label: `▼ ${item.position - previousPosition}`,
    className: "down"
  };
}

function getMetricLabel(item) {
  if (item.chartType === "streaming") {
    return `${formatCompact(item.metricNumber / 17)} streams`;
  }

  if (item.chartType === "sales") {
    return `${formatCompact(item.metricNumber)} sales`;
  }

  if (item.chartType === "radio") {
    return `${formatCompact(item.metricNumber)} audience`;
  }

  if (item.chartType === "albums" && item.metricNumber) {
    return `${formatCompact(item.metricNumber)} units`;
  }

  if (item.chartType === "videos" && item.metricNumber) {
    return `${formatCompact(item.metricNumber)} views`;
  }

  return clean(item.metricRaw);
}

function getEntryHistory(item) {
  const rows = chartRows
    .filter(row => {
      return (
        normalize(row.title) === normalize(item.title) &&
        normalize(row.artist) === normalize(item.artist)
      );
    })
    .sort((a, b) => {
      return chartWeeks.indexOf(a.week) - chartWeeks.indexOf(b.week);
    });

  const peak = Math.min(...rows.map(row => row.position));
  const peakRows = rows.filter(row => row.position === peak);
  const totalWeeks = rows.length;
  const weeksAtPeak = peakRows.length;
  const peakDate = peakRows[0] ? peakRows[0].week : "";

  return {
    rows,
    peak,
    peakDate,
    weeksAtPeak,
    totalWeeks
  };
}

function renderHistoryPanel(item) {
  const history = getEntryHistory(item);

  return `
    <div class="chart-history-panel ${expandedHistoryKey === makeEntryKey(item) ? "open" : ""}">
      <div class="history-stats">
        <div>
          <strong>#${history.peak}</strong>
          <span>Peak</span>
        </div>

        <div>
          <strong>${escapeHTML(history.peakDate)}</strong>
          <span>Peak Date</span>
        </div>

        <div>
          <strong>${history.weeksAtPeak}</strong>
          <span>Weeks at Peak</span>
        </div>

        <div>
          <strong>${history.totalWeeks}</strong>
          <span>Total Weeks</span>
        </div>
      </div>

      <div class="history-run">
        ${history.rows.map(row => {
          return `<span>${escapeHTML(row.week)}: #${row.position}</span>`;
        }).join("")}
      </div>
    </div>
  `;
}

function renderArtistLinks(artistText) {
  const artists = splitArtists(artistText);

  if (artists.length === 0) {
    return escapeHTML(artistText);
  }

  return artists.map(artist => {
    return `<a href="${artistURL(artist)}">${escapeHTML(artist)}</a>`;
  }).join(", ");
}

function renderCover(item) {
  return `
    <div class="cover-wrap">
      ${
        item.cover
          ? `<img class="cover" src="${escapeHTML(item.cover)}" alt="${escapeHTML(item.title)} cover" onerror="this.style.display='none'">`
          : `<div class="cover"></div>`
      }

      <button
        class="preview-button"
        type="button"
        data-title="${escapeHTML(item.title)}"
        data-artist="${escapeHTML(item.artist)}"
        title="Play preview"
      >
        ▶
      </button>
    </div>
  `;
}

function renderCompactChart(rows) {
  const chart = document.getElementById("chart");

  chart.innerHTML = rows.map(item => {
    const movement = getMovement(item);
    const metric = getMetricLabel(item);
    const key = makeEntryKey(item);

    return `
      <article class="compact-chart-row">
        <div class="position">#${item.position}</div>

        ${renderCover(item)}

        <div class="compact-song-info">
          <h3>${escapeHTML(item.title)}</h3>
          <p>${renderArtistLinks(item.artist)}</p>
        </div>

        <div class="compact-metric">
          ${metric ? escapeHTML(metric) : ""}
        </div>

        <div class="movement ${movement.className}">
          ${escapeHTML(movement.label)}
        </div>

        <button class="expand-button" type="button" data-key="${escapeHTML(key)}">
          +
        </button>

        ${renderHistoryPanel(item)}
      </article>
    `;
  }).join("");

  attachChartButtons();
}

function renderStreamingChart(rows) {
  const chart = document.getElementById("chart");

  chart.innerHTML = `
    <div class="spotify-chart-header">
      <span>#</span>
      <span>Title</span>
      <span>Streams</span>
      <span></span>
    </div>

    ${rows.map(item => {
      const key = makeEntryKey(item);

      return `
        <article class="spotify-chart-row">
          <div class="spotify-rank">${item.position}</div>

          ${renderCover(item)}

          <div class="spotify-title">
            <h3>${escapeHTML(item.title)}</h3>
            <p>${renderArtistLinks(item.artist)}</p>
          </div>

          <div class="spotify-streams">
            ${escapeHTML(formatCompact(item.metricNumber / 17))} streams
          </div>

          <button class="expand-button" type="button" data-key="${escapeHTML(key)}">
            +
          </button>

          ${renderHistoryPanel(item)}
        </article>
      `;
    }).join("")}
  `;

  attachChartButtons();
}

function attachChartButtons() {
  document.querySelectorAll(".expand-button").forEach(button => {
    button.addEventListener("click", () => {
      const key = button.dataset.key;
      expandedHistoryKey = expandedHistoryKey === key ? null : key;

      const selectedWeek = document.getElementById("weekSelect").value;
      renderSelectedWeek(selectedWeek);
    });
  });

  document.querySelectorAll(".preview-button").forEach(button => {
    button.addEventListener("click", () => {
      playPreview(button.dataset.title, button.dataset.artist, button);
    });
  });
}

function renderSelectedWeek(week) {
  const rows = getRowsForWeek(week);
  const count = document.getElementById("chartCount");

  if (count) {
    count.textContent = `${rows.length} entries`;
  }

  if (currentChartType === "streaming") {
    renderStreamingChart(rows);
  } else {
    renderCompactChart(rows);
  }
}

async function initChartPage() {
  currentChartType = document.body.dataset.chart;

  const config = CHART_CONFIG[currentChartType];

  if (!config) return;

  const chart = document.getElementById("chart");
  const weekSelect = document.getElementById("weekSelect");
  const count = document.getElementById("chartCount");

  if (chart) {
    chart.innerHTML = `<p class="loading-message">Loading ${config.label} chart...</p>`;
  }

  try {
    chartRows = await loadCSV(config.sheet(), currentChartType);
    chartWeeks = getUniqueWeeks(chartRows);

    weekSelect.innerHTML = chartWeeks.map(week => {
      return `<option value="${escapeHTML(week)}">${escapeHTML(week)}</option>`;
    }).join("");

    weekSelect.addEventListener("change", () => {
      expandedHistoryKey = null;
      renderSelectedWeek(weekSelect.value);
    });

    if (chartWeeks.length > 0) {
      renderSelectedWeek(chartWeeks[0]);
    } else {
      chart.innerHTML = `<p class="loading-message">No chart data found.</p>`;
      if (count) count.textContent = "0 entries";
    }
  } catch (error) {
    console.error(error);

    if (chart) {
      chart.innerHTML = `<p class="loading-message">Chart could not load. Check config.js and your published CSV link.</p>`;
    }

    if (count) {
      count.textContent = "Error";
    }
  }
}

async function searchITunesPreview(title, artist) {
  const cacheKey = `${normalize(title)}|${normalize(artist)}`;

  if (previewCache[cacheKey]) {
    return previewCache[cacheKey];
  }

  const query = encodeURIComponent(`${title} ${artist}`);
  const url = `https://itunes.apple.com/search?term=${query}&media=music&entity=song&limit=8`;

  const response = await fetch(url);
  const data = await response.json();

  const results = Array.isArray(data.results) ? data.results : [];

  const exact = results.find(result => {
    return (
      result.previewUrl &&
      normalize(result.trackName) === normalize(title) &&
      normalize(result.artistName).includes(normalize(splitArtists(artist)[0] || artist))
    );
  });

  const fallback = results.find(result => result.previewUrl);
  const chosen = exact || fallback;

  if (!chosen || !chosen.previewUrl) {
    throw new Error("Preview not found");
  }

  previewCache[cacheKey] = chosen.previewUrl;

  return chosen.previewUrl;
}

async function playPreview(title, artist, button) {
  const audio = document.getElementById("audioPlayer");

  if (!audio) return;

  const originalText = button ? button.textContent : "";

  try {
    if (button) {
      button.textContent = "…";
      button.disabled = true;
    }

    const previewURL = await searchITunesPreview(title, artist);

    audio.src = previewURL;
    audio.play();

    if (button) {
      button.textContent = "❚❚";
    }
  } catch (error) {
    console.error(error);

    if (button) {
      button.textContent = "!";
    }

    alert("Preview not found for this song.");
  } finally {
    if (button) {
      setTimeout(() => {
        button.disabled = false;
        button.textContent = originalText || "▶";
      }, 1200);
    }
  }
}

async function loadAllArtistRows() {
  const chartTypes = Object.keys(CHART_CONFIG);

  const all = await Promise.all(
    chartTypes.map(async chartType => {
      try {
        return await loadCSV(CHART_CONFIG[chartType].sheet(), chartType);
      } catch {
        return [];
      }
    })
  );

  allArtistRows = all.flat();
}

function getAllArtists() {
  const set = new Set();

  allArtistRows.forEach(row => {
    splitArtists(row.artist).forEach(artist => {
      set.add(artist);
    });
  });

  return Array.from(set).sort((a, b) => a.localeCompare(b));
}

function artistMatches(row, artist) {
  return splitArtists(row.artist).some(name => normalize(name) === normalize(artist));
}

function aggregateArtistEntries(artist, chartType) {
  const map = new Map();

  allArtistRows
    .filter(row => row.chartType === chartType && artistMatches(row, artist))
    .forEach(row => {
      const key = `${normalize(row.title)}|${normalize(row.artist)}`;

      if (!map.has(key)) {
        map.set(key, {
          chartType,
          title: row.title,
          artist: row.artist,
          cover: row.cover,
          rows: [],
          totalMetric: 0,
          totalDisplayMetric: 0,
          peak: row.position,
          weeksAtPeak: 0,
          totalWeeks: 0,
          numberOneWeeks: 0
        });
      }

      const entry = map.get(key);

      entry.rows.push(row);
      entry.totalMetric += row.metricNumber || 0;
      entry.peak = Math.min(entry.peak, row.position);

      if (!entry.cover && row.cover) {
        entry.cover = row.cover;
      }
    });

  const entries = Array.from(map.values()).map(entry => {
    entry.totalWeeks = entry.rows.length;
    entry.weeksAtPeak = entry.rows.filter(row => row.position === entry.peak).length;
    entry.numberOneWeeks = entry.rows.filter(row => row.position === 1).length;

    if (entry.chartType === "streaming") {
      entry.totalDisplayMetric = entry.totalMetric / 17;
    } else {
      entry.totalDisplayMetric = entry.totalMetric;
    }

    return entry;
  });

  if (chartType === "songs") {
    entries.sort((a, b) => {
      return (
        b.numberOneWeeks - a.numberOneWeeks ||
        a.peak - b.peak ||
        b.weeksAtPeak - a.weeksAtPeak ||
        b.totalWeeks - a.totalWeeks ||
        b.totalMetric - a.totalMetric
      );
    });
  } else {
    entries.sort((a, b) => {
      return (
        b.totalMetric - a.totalMetric ||
        a.peak - b.peak ||
        b.totalWeeks - a.totalWeeks
      );
    });
  }

  return entries;
}

function getArtistCustomData(artist) {
  const data = window.SWEET16_ARTIST_DATA || {};
  return data[artist] || {};
}

function getArtistFallbackCover(artist) {
  const row = allArtistRows.find(item => artistMatches(item, artist) && item.cover);
  return row ? row.cover : "";
}

function getArtistMetricLabel(entry) {
  if (entry.chartType === "songs") {
    return `Peak #${entry.peak} · ${entry.totalWeeks} weeks`;
  }

  if (entry.chartType === "albums") {
    return `${formatCompact(entry.totalDisplayMetric)} units`;
  }

  if (entry.chartType === "streaming") {
    return `${formatCompact(entry.totalDisplayMetric)} streams`;
  }

  if (entry.chartType === "sales") {
    return `${formatCompact(entry.totalDisplayMetric)} sales`;
  }

  if (entry.chartType === "radio") {
    return `${formatCompact(entry.totalDisplayMetric)} audience`;
  }

  if (entry.chartType === "videos") {
    return `${formatCompact(entry.totalDisplayMetric)} views`;
  }

  return `${formatCompact(entry.totalDisplayMetric)}`;
}

function renderArtistEntry(entry, index) {
  return `
    <article class="artist-top-track">
      <div class="artist-track-rank">${index + 1}</div>

      ${renderCover(entry)}

      <div class="artist-track-info">
        <h3>${escapeHTML(entry.title)}</h3>
        <p>${renderArtistLinks(entry.artist)}</p>
      </div>

      <div class="artist-track-metric">
        ${escapeHTML(getArtistMetricLabel(entry))}
      </div>
    </article>
  `;
}

function renderArtistPage() {
  const content = document.getElementById("artistPageContent");

  if (!content) return;

  if (!currentArtist) {
    content.innerHTML = `
      <section class="artist-empty">
        <h2>Select an artist</h2>
        <p>Choose an artist from the dropdown to view their Sweet 16 page.</p>
      </section>
    `;
    return;
  }

  const custom = getArtistCustomData(currentArtist);
  const fallbackCover = getArtistFallbackCover(currentArtist);

  const banner = custom.banner || fallbackCover;
  const image = custom.image || fallbackCover;
  const subtitle = custom.subtitle || "Sweet 16 Charts artist";
  const bio = custom.bio || "No artist information has been added yet. Add this artist inside designer.html, then copy the generated code into artist-data.js.";
  const facts = Array.isArray(custom.facts) ? custom.facts : [];

  const entries = aggregateArtistEntries(currentArtist, currentArtistTab);
  const visibleEntries = artistShowFullList ? entries : entries.slice(0, 10);

  content.innerHTML = `
    <section
      class="artist-spotify-hero"
      style="${banner ? `background-image: linear-gradient(to bottom, rgba(0,0,0,0.05), rgba(0,0,0,0.88)), url('${escapeHTML(banner)}');` : ""}"
    >
      <div class="artist-hero-fade"></div>

      <div class="artist-hero-content">
        ${
          image
            ? `<img class="artist-avatar" src="${escapeHTML(image)}" alt="${escapeHTML(currentArtist)} image" onerror="this.style.display='none'">`
            : `<div class="artist-avatar"></div>`
        }

        <div>
          <span class="artist-label">Artist</span>
          <h2>${escapeHTML(currentArtist)}</h2>
          <p>${escapeHTML(subtitle)}</p>
        </div>
      </div>
    </section>

    <section class="artist-top-section">
      <div class="artist-section-head">
        <div>
          <h2>Best Performing</h2>
          <p>${escapeHTML(CHART_CONFIG[currentArtistTab].label)} ranking</p>
        </div>
      </div>

      <div class="artist-chart-tabs">
        ${Object.keys(CHART_CONFIG).map(chartType => {
          return `
            <button
              class="artist-chart-tab ${currentArtistTab === chartType ? "active" : ""}"
              type="button"
              data-tab="${chartType}"
            >
              ${escapeHTML(CHART_CONFIG[chartType].label)}
            </button>
          `;
        }).join("")}
      </div>

      <div class="artist-top-list">
        ${
          visibleEntries.length > 0
            ? visibleEntries.map(renderArtistEntry).join("")
            : `<p class="loading-message">No ${escapeHTML(CHART_CONFIG[currentArtistTab].label)} entries found for this artist.</p>`
        }
      </div>

      ${
        entries.length > 10
          ? `
            <button id="artistViewMoreButton" class="artist-view-more-button" type="button">
              ${artistShowFullList ? "Show Top 10" : "View Full List"}
            </button>
          `
          : ""
      }
    </section>

    <section class="artist-info-section">
      <h2>About ${escapeHTML(currentArtist)}</h2>
      <p>${escapeHTML(bio)}</p>

      ${
        facts.length > 0
          ? `
            <div class="artist-facts">
              ${facts.map(fact => `<span>${escapeHTML(fact)}</span>`).join("")}
            </div>
          `
          : ""
      }
    </section>
  `;

  document.querySelectorAll(".artist-chart-tab").forEach(button => {
    button.addEventListener("click", () => {
      currentArtistTab = button.dataset.tab;
      artistShowFullList = false;
      renderArtistPage();
    });
  });

  const viewMore = document.getElementById("artistViewMoreButton");

  if (viewMore) {
    viewMore.addEventListener("click", () => {
      artistShowFullList = !artistShowFullList;
      renderArtistPage();
    });
  }

  attachChartButtons();
}

async function initArtistPage() {
  const select = document.getElementById("artistSelect");
  const params = new URLSearchParams(window.location.search);
  const artistFromURL = params.get("artist");

  const content = document.getElementById("artistPageContent");

  if (content) {
    content.innerHTML = `<p class="loading-message">Loading artist database...</p>`;
  }

  try {
    await loadAllArtistRows();

    const artists = getAllArtists();

    select.innerHTML = `
      <option value="">Select an artist...</option>
      ${artists.map(artist => {
        return `<option value="${escapeHTML(artist)}">${escapeHTML(artist)}</option>`;
      }).join("")}
    `;

    if (artistFromURL) {
      currentArtist = artistFromURL;
      select.value = artistFromURL;
    }

    select.addEventListener("change", () => {
      currentArtist = select.value;
      currentArtistTab = "songs";
      artistShowFullList = false;

      if (currentArtist) {
        const url = new URL(window.location.href);
        url.searchParams.set("artist", currentArtist);
        window.history.replaceState({}, "", url);
      }

      renderArtistPage();
    });

    renderArtistPage();
  } catch (error) {
    console.error(error);

    if (content) {
      content.innerHTML = `<p class="loading-message">Artist page could not load. Check config.js and your CSV links.</p>`;
    }
  }
}

document.addEventListener("DOMContentLoaded", () => {
  if (document.body.dataset.chart) {
    initChartPage();
  }

  if (document.body.dataset.page === "artists") {
    initArtistPage();
  }
});
