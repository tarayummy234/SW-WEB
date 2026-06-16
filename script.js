let chartData = {};

async function loadCharts() {
  const response = await fetch("charts.json");
  chartData = await response.json();
  showChart("songs");
}

function showChart(type) {
  const chart = chartData[type];
  const chartDiv = document.getElementById("chart");
  const title = document.getElementById("chart-title");

  title.textContent = chart.name;
  chartDiv.innerHTML = "";

  chart.songs.forEach(song => {
    chartDiv.innerHTML += `
      <div class="song">
        <div class="position">#${song.position}</div>
        <img class="cover" src="${song.cover}" alt="${song.title}">
        <div>
          <div class="title">${song.title}</div>
          <div class="artist">${song.artist}</div>
        </div>
      </div>
    `;
  });
}

loadCharts();
