let allRows = [];
let validWeeks = [];

function clean(value) {
  return value ? String(value).replaceAll('"', "").trim() : "";
}

function escapeHTML(value) {
  return clean(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

const CHART_LIMITS = {
  songs: 100,
  albums: 25,
  videos: 25,
  streaming: 50,
  sales: 25,
  radio: 25
};

function parsePosition(value) {
  const cleaned = clean(value).replace(/[^0-9]/g, "");
  return cleaned ? Number(cleaned) : NaN;
}

function parseMetric(value) {
  const cleaned = clean(value).replace(/,/g, "");
  const number = Number(cleaned);
  return isNaN(number) ? "" : number;
}

function makeKey(title, artist) {
  return `${clean(title).toLowerCase()}|${clean(artist).toLowerCase()}`;
}

function makeId(title, artist) {
  return `${title}-${artist}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

async function loadCSV(url) {
  const finalUrl = url.includes("?") ? `${url}&cache=${Date.now()}` : `${url}?cache=${Date.now()}`;
  const response = await fetch(finalUrl);
  const text = await response.text();

  const parsed = Papa.parse(text, {
    skipEmptyLines: true
  });

  return parsed.data
    .map((row, index) => {
      return {
        index,
        week: clean(row[0]),
        position: parsePosition(row[1]),
        fullName: clean(row[2]),
        metric: parseMetric(row[3]),
        title: clean(row[5]),
        artist: clean(row[6]),
        cover: clean(row[8]),
        audio: clean(row[9])
      };
    })
    .filter(item => {
      return (
        item.week &&
        !isNaN(item.position) &&
        item.position > 0 &&
        item.title &&
        item.artist
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
    if (!weeks.includes(item.week) && counts[item.week] >= 10) {
      weeks.push(item.week);
    }
  });

  return weeks.reverse();
}

function getPreviousWeek(currentWeek) {
  const index = validWeeks.indexOf(currentWeek);
  return validWeeks[index + 1] || null;
}

function getMovement(currentItem, previousRows) {
  const currentKey = makeKey(currentItem.title, currentItem.artist);

  const previous = previousRows.find(item => {
    return makeKey(item.title, item.artist) === currentKey;
  });

  const currentWeekIndex = validWeeks.indexOf(currentItem.week);

  const appearedBefore = allRows.some(item => {
    const itemWeekIndex = validWeeks.indexOf(item.week);

    return (
      makeKey(item.title, item.artist) === currentKey &&
      itemWeekIndex > currentWeekIndex
    );
  });

  if (!previous && appearedBefore) {
    return `<span class="tag reentry">RE-ENTRY</span>`;
  }

  if (!previous) {
    return `<span class="tag new">NEW</span>`;
  }

  if (currentItem.position < previous.position) {
    return `<span class="move up">▲ ${previous.position - currentItem.position}</span>`;
  }

  if (currentItem.position > previous.position) {
    return `<span class="move down">▼ ${currentItem.position - previous.position}</span>`;
  }

  return `<span class="move same">▬</span>`;
}

function getChartRun(title, artist) {
  const songKey = makeKey(title, artist);

  const run = allRows
    .filter(item => makeKey(item.title, item.artist) === songKey)
    .sort((a, b) => {
  return validWeeks.indexOf(b.week) - validWeeks.indexOf(a.week);
});

  if (run.length === 0) {
    return `<span>No chart history found.</span>`;
  }

  return run
    .map(item => {
      return `<span>${escapeHTML(item.week)}: #${escapeHTML(item.position)}</span>`;
    })
    .join("");
}

function renderChart(week) {
  const previousWeek = getPreviousWeek(week);

  const currentRows = allRows
    .filter(item => item.week === week)
    .sort((a, b) => a.position - b.position);

  const previousRows = previousWeek
    ? allRows.filter(item => item.week === previousWeek)
    : [];

  const chart = document.getElementById("chart");
  const chartCount = document.getElementById("chartCount");

  chart.innerHTML = "";
  chartCount.textContent = `${currentRows.length} songs · Week of ${week}`;

  currentRows.forEach(item => {
    const id = makeId(item.title, item.artist);

    chart.innerHTML += `
      <section class="chart-row">
        <div class="rank">#${escapeHTML(item.position)}</div>

        <div class="cover-wrap">
          ${
            item.cover
              ? `<img src="${escapeHTML(item.cover)}" class="cover" alt="${escapeHTML(item.title)}">`
              : `<div class="cover placeholder"></div>`
          }

          ${
            item.audio
              ? `<button class="play-button" data-audio="${escapeHTML(item.audio)}">▶</button>`
              : `<button class="play-button disabled" disabled>▶</button>`
          }
        </div>

        <div class="song-info">
          <h3>${escapeHTML(item.title)}</h3>
          <p>${escapeHTML(item.artist)}</p>
          <small>${item.metric !== "" ? Number(item.metric).toLocaleString() : ""} points</small>
        </div>

        <div class="movement">
          ${getMovement(item, previousRows)}
        </div>

        <button class="expand-button" data-run="${id}">+</button>
      </section>

      <div class="chart-run" id="${id}">
        ${getChartRun(item.title, item.artist)}
      </div>
    `;
  });

  activateButtons();
}

function activateButtons() {
  const audioPlayer = document.getElementById("audioPlayer");

  document.querySelectorAll(".play-button").forEach(button => {
    button.addEventListener("click", () => {
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
    button.addEventListener("click", () => {
      const runId = button.dataset.run;
      const runBox = document.getElementById(runId);

      runBox.classList.toggle("open");
      button.textContent = runBox.classList.contains("open") ? "−" : "+";
    });
  });
}

async function initSongsPage() {
  try {
    const chartType = document.body.dataset.chart || "songs";
allRows = await loadCSV(SHEETS[chartType]);

    const select = document.getElementById("weekSelect");
    select.innerHTML = "";

    validWeeks.forEach(week => {
      select.innerHTML += `<option value="${escapeHTML(week)}">${escapeHTML(week)}</option>`;
    });

    select.addEventListener("change", () => {
      renderChart(select.value);
    });

    renderChart(validWeeks[0]);
  } catch (error) {
    document.getElementById("chart").innerHTML = `
      <div class="error">
        <h3>Chart could not load.</h3>
        <p>Check your Google Sheets CSV link and make sure the file is published to web.</p>
      </div>
    `;

    console.error(error);
  }
}

if (document.getElementById("weekSelect")) {
  initSongsPage();
}
