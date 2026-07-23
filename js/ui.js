// Dashboard: Gas-Regler, Kennzahlen, Terraforming-Werkzeuge, Ereignis-Log,
// Spielstand-Aktionen. Callback-Registrierung über UI.on(name, handler) — gleiches
// Grundmuster wie in HanseSpiel.

const UI = (() => {
  const el = {};
  const callbacks = {};
  let activeTool = null; // "plant" | "clear" | null

  function init() {
    el.hudYear = document.getElementById("hud-year");
    el.hudTemp = document.getElementById("hud-temp");
    el.hudSeaLevel = document.getElementById("hud-sealevel");
    el.hudIce = document.getElementById("hud-ice");
    el.hudVegetation = document.getElementById("hud-vegetation");
    el.hudO2 = document.getElementById("hud-o2");

    el.gasControls = document.getElementById("gas-controls");
    el.toolButtons = document.getElementById("tool-buttons");
    el.eventLog = document.getElementById("event-log");
    el.speedSlider = document.getElementById("speed-slider");
    el.speedLabel = document.getElementById("speed-label");
    el.saveNowBtn = document.getElementById("save-now-btn");
    el.saveExportBtn = document.getElementById("save-export-btn");
    el.saveImportBtn = document.getElementById("save-import-btn");
    el.saveImportInput = document.getElementById("save-import-input");
    el.saveStatus = document.getElementById("save-status");
    el.newGameBtn = document.getElementById("new-game-btn");

    renderGasControls();
    renderToolButtons();

    el.speedSlider.addEventListener("input", () => {
      const idx = parseInt(el.speedSlider.value, 10);
      callbacks.setSpeed && callbacks.setSpeed(SPEED_STEPS[idx]);
    });
    el.saveNowBtn.addEventListener("click", () => callbacks.saveNow && callbacks.saveNow());
    el.saveExportBtn.addEventListener("click", () => callbacks.exportSave && callbacks.exportSave());
    el.saveImportBtn.addEventListener("click", () => el.saveImportInput.click());
    el.saveImportInput.addEventListener("change", () => {
      const file = el.saveImportInput.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => callbacks.importSave && callbacks.importSave(reader.result);
      reader.readAsText(file);
      el.saveImportInput.value = "";
    });
    el.newGameBtn.addEventListener("click", () => callbacks.newGame && callbacks.newGame());
  }

  function on(name, cb) {
    callbacks[name] = cb;
  }

  function decimalsFor(gas) {
    return gas.unit === "%" ? 1 : 0;
  }

  function renderGasControls() {
    let html = "";
    GASES.forEach((g) => {
      const value = Atmosphere.get(g.id);
      html += `<div class="gas-control">
        <label>${g.name} (${g.symbol})</label>
        <input type="range" min="${g.min}" max="${g.max}" step="${(g.max - g.min) / 200}" value="${value}" data-gas="${g.id}">
        <span class="gas-value" data-gas-value="${g.id}">${value.toFixed(decimalsFor(g))} ${g.unit}</span>
      </div>`;
    });
    el.gasControls.innerHTML = html;
    el.gasControls.querySelectorAll("input[type=range]").forEach((input) => {
      input.addEventListener("input", () => {
        const value = parseFloat(input.value);
        callbacks.setGas && callbacks.setGas(input.dataset.gas, value);
      });
      // "change" feuert erst beim Loslassen — danach Fokus abgeben, sonst haelt
      // der Browser den Regler dauerhaft fokussiert und renderGasValues()
      // wuerde seine Position (wegen des activeElement-Schutzes beim Ziehen)
      // nie wieder mit dem tatsaechlichen Gaswert nachziehen.
      input.addEventListener("change", () => input.blur());
    });
  }

  function renderToolButtons() {
    el.toolButtons.innerHTML = `
      <button data-tool="plant" class="${activeTool === "plant" ? "tool-active" : ""}">🌱 Vegetation pflanzen</button>
      <button data-tool="clear" class="${activeTool === "clear" ? "tool-active" : ""}">🪓 Vegetation entfernen</button>
      <button data-tool="none" class="${activeTool === null ? "tool-active" : ""}">Werkzeug abwählen</button>
    `;
    el.toolButtons.querySelectorAll("button").forEach((btn) => {
      btn.addEventListener("click", () => {
        activeTool = btn.dataset.tool === "none" ? null : btn.dataset.tool;
        renderToolButtons();
      });
    });
  }

  function getActiveTool() {
    return activeTool;
  }

  function renderGasValues() {
    GASES.forEach((g) => {
      const span = el.gasControls.querySelector(`[data-gas-value="${g.id}"]`);
      if (span) span.textContent = `${Atmosphere.get(g.id).toFixed(decimalsFor(g))} ${g.unit}`;
      const input = el.gasControls.querySelector(`input[data-gas="${g.id}"]`);
      if (input && document.activeElement !== input) input.value = Atmosphere.get(g.id);
    });
  }

  function renderAll() {
    const temp = Climate.globalTemperature();
    const seaLevel = Climate.seaLevelRise();
    const stats = Planet.stats();
    el.hudTemp.textContent = temp.toFixed(1) + " °C";
    el.hudSeaLevel.textContent = "+" + seaLevel.toFixed(1) + " m";
    el.hudIce.textContent = stats.icePercent.toFixed(1) + " %";
    el.hudVegetation.textContent = stats.avgVegetation.toFixed(1) + " %";
    el.hudO2.textContent = Atmosphere.get("o2").toFixed(1) + " %";
    renderGasValues();
  }

  function setYear(year) {
    el.hudYear.textContent = "Jahr " + year;
  }

  function setSpeedLabel(yearsPerTick) {
    if (yearsPerTick <= 0) {
      el.speedLabel.textContent = "Pausiert";
      return;
    }
    const perSecond = yearsPerTick * (1000 / TICK_INTERVAL_MS);
    el.speedLabel.textContent = `${perSecond} Jahre/Sekunde`;
  }

  function log(message) {
    const li = document.createElement("li");
    li.textContent = `Jahr ${Game.currentYear()}: ${message}`;
    el.eventLog.insertBefore(li, el.eventLog.firstChild);
    while (el.eventLog.children.length > 60) el.eventLog.removeChild(el.eventLog.lastChild);
  }

  function setSaveStatus(message) {
    el.saveStatus.textContent = message;
  }

  return { init, on, renderAll, setYear, setSpeedLabel, log, setSaveStatus, getActiveTool };
})();
