const seedGrid = document.getElementById("seed-grid");
const generateBtn = document.getElementById("generate-btn");
const playBtn = document.getElementById("play-btn");
const stopBtn = document.getElementById("stop-btn");
const downloadBtn = document.getElementById("download-btn");
const statusEl = document.getElementById("status");
const restProb = document.getElementById("rest-prob");
const restProbValue = document.getElementById("rest-prob-value");
const csvFile = document.getElementById("csv-file");
const csvStatus = document.getElementById("csv-status");
const genLength = document.getElementById("gen-length");
const tempoInput = document.getElementById("tempo");
const samplingSeed = document.getElementById("sampling-seed");
const randomSeedInput = document.getElementById("random-seed");
const statChords = document.getElementById("stat-chords");
const statRange = document.getElementById("stat-range");
const statRests = document.getElementById("stat-rests");
const notesTable = document.getElementById("notes-table");
const toggleNotes = document.getElementById("toggle-notes");
const canvas = document.getElementById("piano-canvas");
const ctx = canvas.getContext("2d");

let csvSeed = null;
let currentChorale = null;
let generatedStart = 0;
let showAllNotes = false;
let audioContext = null;
let activeNodes = [];

const defaultSeed = [
  [60, 64, 67, 72],
  [62, 65, 69, 74],
  [59, 63, 67, 71],
  [60, 64, 67, 72],
  [55, 60, 64, 67],
  [57, 60, 64, 69],
  [59, 62, 65, 69],
  [60, 64, 67, 72]
];

function buildSeedGrid() {
  seedGrid.innerHTML = "";
  for (let row = 0; row < 8; row += 1) {
    for (let col = 0; col < 4; col += 1) {
      const input = document.createElement("input");
      input.type = "number";
      input.min = "0";
      input.max = "127";
      input.placeholder = "0";
      input.value = defaultSeed[row][col];
      seedGrid.appendChild(input);
    }
  }
}

function setSeedGrid(seed) {
  const inputs = Array.from(seedGrid.querySelectorAll("input"));
  inputs.forEach((input, index) => {
    const row = Math.floor(index / 4);
    const col = index % 4;
    input.value = seed[row]?.[col] ?? 0;
  });
}

function getManualSeed() {
  const inputs = Array.from(seedGrid.querySelectorAll("input"));
  const seed = [];
  for (let row = 0; row < 8; row += 1) {
    const chord = [];
    for (let col = 0; col < 4; col += 1) {
      const value = inputs[row * 4 + col].value;
      chord.push(value === "" ? 0 : Number(value));
    }
    seed.push(chord);
  }
  return seed;
}

function getActiveSeedType() {
  const active = document.querySelector(".tab.active");
  return active ? active.dataset.seed : "manual";
}

function parseCsv(text) {
  const lines = text.split(/\r?\n/).filter((line) => line.trim().length > 0);
  const rows = [];
  for (const line of lines) {
    const parts = line.split(",");
    if (parts.length < 4) continue;
    const numbers = parts.slice(0, 4).map((value) => {
      const cleaned = value.trim();
      const parsed = Number(cleaned);
      return Number.isFinite(parsed) ? parsed : 0;
    });
    rows.push(numbers);
    if (rows.length >= 8) break;
  }
  return rows.length === 8 ? rows : null;
}

function updateStats(chorale) {
  if (!chorale) {
    statChords.textContent = "--";
    statRange.textContent = "--";
    statRests.textContent = "--";
    return;
  }
  const flat = chorale.flat();
  const notes = flat.filter((n) => n > 0);
  const rests = flat.filter((n) => n === 0).length;
  const min = notes.length ? Math.min(...notes) : "--";
  const max = notes.length ? Math.max(...notes) : "--";
  statChords.textContent = chorale.length;
  statRange.textContent = notes.length ? `${min} - ${max}` : "--";
  statRests.textContent = rests;
}

function renderNotes(chorale) {
  if (!chorale) {
    notesTable.innerHTML = "";
    return;
  }
  const limit = showAllNotes ? chorale.length : Math.min(24, chorale.length);
  const rows = chorale.slice(0, limit);
  let html = "<table><thead><tr><th>#</th><th>Note 1</th><th>Note 2</th><th>Note 3</th><th>Note 4</th></tr></thead><tbody>";
  rows.forEach((chord, index) => {
    const highlight = index < generatedStart ? " style=\"color:#f7b733\"" : "";
    html += `<tr${highlight}><td>${index + 1}</td><td>${chord[0]}</td><td>${chord[1]}</td><td>${chord[2]}</td><td>${chord[3]}</td></tr>`;
  });
  html += "</tbody></table>";
  notesTable.innerHTML = html;
  toggleNotes.textContent = showAllNotes ? "Show less" : "Show all";
}

function renderPianoRoll(chorale) {
  if (!chorale) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    return;
  }
  const chords = chorale.length;
  const cellWidth = 10;
  const minNote = 36;
  const maxNote = 81;
  const noteCount = maxNote - minNote + 1;
  const width = Math.max(canvas.width, chords * cellWidth);
  const height = noteCount * 6;
  canvas.width = width;
  canvas.height = height;

  ctx.fillStyle = "rgba(10, 12, 18, 0.9)";
  ctx.fillRect(0, 0, width, height);

  const seedWidth = generatedStart * cellWidth;
  ctx.fillStyle = "rgba(247, 183, 51, 0.08)";
  ctx.fillRect(0, 0, seedWidth, height);

  for (let i = 0; i < chords; i += 1) {
    const chord = chorale[i];
    chord.forEach((note) => {
      if (note <= 0) return;
      const y = (maxNote - note) * 6;
      ctx.fillStyle = i < generatedStart ? "#f7b733" : "#8ecae6";
      ctx.fillRect(i * cellWidth, y, cellWidth - 1, 5);
    });
  }

  ctx.strokeStyle = "rgba(255,255,255,0.08)";
  ctx.beginPath();
  ctx.moveTo(seedWidth, 0);
  ctx.lineTo(seedWidth, height);
  ctx.stroke();
}

function midiToFreq(midi) {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

function stopAudio() {
  activeNodes.forEach((node) => {
    try {
      node.stop();
    } catch (err) {
      // ignore
    }
  });
  activeNodes = [];
}

function playChorale() {
  if (!currentChorale) return;
  stopAudio();
  if (!audioContext) {
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
  }
  const tempo = Number(tempoInput.value) || 90;
  const chordDuration = 60 / tempo;
  const start = audioContext.currentTime + 0.1;

  currentChorale.forEach((chord, index) => {
    const time = start + index * chordDuration;
    chord.forEach((note) => {
      if (note <= 0) return;
      const osc = audioContext.createOscillator();
      const gain = audioContext.createGain();
      osc.type = "sine";
      osc.frequency.value = midiToFreq(note);
      gain.gain.setValueAtTime(0.0001, time);
      gain.gain.exponentialRampToValueAtTime(0.25, time + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, time + chordDuration);
      osc.connect(gain).connect(audioContext.destination);
      osc.start(time);
      osc.stop(time + chordDuration + 0.02);
      activeNodes.push(osc);
    });
  });
}

async function generateChorale() {
  const seedType = getActiveSeedType();
  const payload = {
    seed_type: seedType,
    length: Number(genLength.value) || 56,
    random_seed: samplingSeed.value === "" ? null : Number(samplingSeed.value),
  };

  if (seedType === "manual") {
    payload.seed_chords = getManualSeed();
  }

  if (seedType === "csv") {
    if (!csvSeed) {
      csvStatus.textContent = "Please upload a CSV first.";
      return;
    }
    payload.seed_chords = csvSeed;
  }

  if (seedType === "random") {
    payload.seed_random = randomSeedInput.value === "" ? null : Number(randomSeedInput.value);
    payload.rest_probability = Number(restProb.value);
  }

  generateBtn.disabled = true;
  statusEl.textContent = "Generating...";

  try {
    const response = await fetch("/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      const error = await response.text();
      throw new Error(error || "Generation failed");
    }
    const data = await response.json();
    currentChorale = data.chorale;
    generatedStart = data.generated_start || 0;
    setSeedGrid(data.seed_chords || getManualSeed());
    updateStats(currentChorale);
    renderPianoRoll(currentChorale);
    renderNotes(currentChorale);
    statusEl.textContent = "Generation complete.";
  } catch (err) {
    statusEl.textContent = `Error: ${err.message}`;
  } finally {
    generateBtn.disabled = false;
  }
}

async function downloadMidi() {
  if (!currentChorale) return;
  try {
    const response = await fetch("/api/midi", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chorale: currentChorale }),
    });
    if (!response.ok) {
      throw new Error("MIDI generation failed");
    }
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "generated_chorale.mid";
    link.click();
    URL.revokeObjectURL(url);
  } catch (err) {
    statusEl.textContent = `Error: ${err.message}`;
  }
}

function setupTabs() {
  const tabs = document.querySelectorAll(".tab");
  const panels = document.querySelectorAll(".tab-panel");
  tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      tabs.forEach((t) => t.classList.remove("active"));
      panels.forEach((panel) => panel.classList.remove("active"));
      tab.classList.add("active");
      const target = tab.dataset.seed;
      const panel = document.querySelector(`.tab-panel[data-panel="${target}"]`);
      if (panel) panel.classList.add("active");
    });
  });
}

async function checkStatus() {
  try {
    const response = await fetch("/api/status");
    const data = await response.json();
    statusEl.textContent = data.model_loaded ? "Model loaded." : "Model not loaded.";
  } catch (err) {
    statusEl.textContent = "Model status unavailable.";
  }
}

restProb.addEventListener("input", () => {
  restProbValue.textContent = `Rest probability: ${Number(restProb.value).toFixed(2)}`;
});

csvFile.addEventListener("change", async (event) => {
  const file = event.target.files?.[0];
  if (!file) return;
  const text = await file.text();
  const parsed = parseCsv(text);
  if (!parsed) {
    csvStatus.textContent = "CSV must have at least 8 rows of 4 numbers.";
    csvSeed = null;
    return;
  }
  csvSeed = parsed;
  csvStatus.textContent = "CSV loaded. Ready to generate.";
  setSeedGrid(parsed);
});

toggleNotes.addEventListener("click", () => {
  showAllNotes = !showAllNotes;
  renderNotes(currentChorale);
});

generateBtn.addEventListener("click", generateChorale);
playBtn.addEventListener("click", playChorale);
stopBtn.addEventListener("click", stopAudio);
downloadBtn.addEventListener("click", downloadMidi);

buildSeedGrid();
setupTabs();
updateStats(null);
renderNotes(null);
renderPianoRoll(null);
checkStatus();
