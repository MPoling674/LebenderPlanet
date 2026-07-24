// Dashboard: Gas-Regler, Kennzahlen, Terraforming-Werkzeuge, Ereignis-Log,
// Spielstand-Aktionen. Callback-Registrierung über UI.on(name, handler) — gleiches
// Grundmuster wie in HanseSpiel.

const UI = (() => {
  const el = {};
  const callbacks = {};
  let activeTool = null; // "plant" | "clear" | "salt_add" | "salt_remove" | "release_fauna" | "remove_fauna" | null
  let selectedVegType = VEGETATION_TYPES[0].id;
  let selectedFaunaType = FAUNA_TYPES[0].id;

  function init() {
    el.hudYear = document.getElementById("hud-year");
    el.hudTemp = document.getElementById("hud-temp");
    el.hudSeaLevel = document.getElementById("hud-sealevel");
    el.hudIce = document.getElementById("hud-ice");
    el.hudVegetation = document.getElementById("hud-vegetation");
    el.hudVegTypes = document.getElementById("hud-vegtypes");
    el.hudSalinity = document.getElementById("hud-salinity");
    el.hudFauna = document.getElementById("hud-fauna");
    el.hudFaunaTypes = document.getElementById("hud-faunatypes");
    el.hudO2 = document.getElementById("hud-o2");
    el.hudCo2 = document.getElementById("hud-co2");
    el.hudCh4 = document.getElementById("hud-ch4");
    el.vegLegend = document.getElementById("veg-legend");
    el.mapTooltip = document.getElementById("map-tooltip");

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
    renderVegLegend();

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
    const vegOptions = VEGETATION_TYPES.map(
      (t) => `<option value="${t.id}" ${t.id === selectedVegType ? "selected" : ""}>${t.name}</option>`
    ).join("");
    // manualPlacement:false (z.B. Nanotech-Roboter) sind nie direkt aussetzbar —
    // sie entstehen ausschliesslich ueber Sondermechaniken.
    const faunaOptions = FAUNA_TYPES.filter((t) => t.manualPlacement !== false).map(
      (t) => `<option value="${t.id}" ${t.id === selectedFaunaType ? "selected" : ""}>${t.name} (${t.habitat === "land" ? "Land" : "Ozean"})</option>`
    ).join("");
    el.toolButtons.innerHTML = `
      <select id="veg-type-select">${vegOptions}</select>
      <button data-tool="plant" class="${activeTool === "plant" ? "tool-active" : ""}">🌱 Vegetation pflanzen</button>
      <button data-tool="clear" class="${activeTool === "clear" ? "tool-active" : ""}">🪓 Vegetation entfernen</button>
      <select id="fauna-type-select">${faunaOptions}</select>
      <button data-tool="release_fauna" class="${activeTool === "release_fauna" ? "tool-active" : ""}">🐾 Tier aussetzen</button>
      <button data-tool="remove_fauna" class="${activeTool === "remove_fauna" ? "tool-active" : ""}">🪤 Tier entfernen</button>
      <button data-tool="salt_add" class="${activeTool === "salt_add" ? "tool-active" : ""}">🧂 Salz zuführen</button>
      <button data-tool="salt_remove" class="${activeTool === "salt_remove" ? "tool-active" : ""}">🧂 Salz entnehmen</button>
      <button data-tool="none" class="${activeTool === null ? "tool-active" : ""}">Werkzeug abwählen</button>
    `;
    el.toolButtons.querySelectorAll("button").forEach((btn) => {
      btn.addEventListener("click", () => {
        activeTool = btn.dataset.tool === "none" ? null : btn.dataset.tool;
        renderToolButtons();
      });
    });
    el.toolButtons.querySelector("#veg-type-select").addEventListener("change", (evt) => {
      selectedVegType = evt.target.value;
    });
    el.toolButtons.querySelector("#fauna-type-select").addEventListener("change", (evt) => {
      selectedFaunaType = evt.target.value;
    });
  }

  function renderVegLegend() {
    if (!el.vegLegend) return;
    el.vegLegend.innerHTML = VEGETATION_TYPES.map((t) => {
      const [min, max] = vegTypeRange(t);
      const rgb = `rgb(${t.color[0]}, ${t.color[1]}, ${t.color[2]})`;
      return `<div class="veg-legend-item">
        <span class="veg-swatch" style="background:${rgb}"></span>
        <span>${t.name} <small>(${min.toFixed(0)}–${max.toFixed(0)} °C)</small></span>
      </div>`;
    }).join("");
  }

  function getActiveTool() {
    return activeTool;
  }

  function terrainLabel(terrain) {
    if (terrain === "ocean") return "Ozean";
    if (terrain === "ice") return "Eis";
    return "Land";
  }

  // info kommt aus Planet.cellInfoAt(x,y). Zeigt aktuell Terrain/Temperatur und
  // (auf Land) die angesiedelte Vegetationsstufe. Sobald es ein Tier-/Fauna-
  // Modell gibt, kann hier einfach eine weitere Zeile ergaenzt werden — info
  // liefert bereits die rohen Zelldaten dafuer.
  function showTooltip(info, clientX, clientY) {
    if (!el.mapTooltip) return;
    let html = `<strong>${terrainLabel(info.terrain)}</strong><br>Temperatur: ${info.temperature.toFixed(1)} °C`;
    if (info.terrain === "land") {
      const type = info.vegetationType ? getVegType(info.vegetationType) : null;
      html += type
        ? `<br>${type.name}: ${info.vegetation.toFixed(0)} %`
        : `<br>Keine Vegetation`;
    }
    if (info.terrain === "ocean") {
      html += `<br>Salzgehalt: ${info.salinity.toFixed(1)} ‰`;
      html += `<br>Strömung: Richtung ${info.currentDirection > 0 ? "Osten" : "Westen"}`;
    }
    if (info.faunaType) {
      const faunaType = getFaunaType(info.faunaType);
      html += `<br>${faunaType.name}: ${info.fauna.toFixed(0)} %`;
    }
    el.mapTooltip.innerHTML = html;
    el.mapTooltip.style.left = clientX + 14 + "px";
    el.mapTooltip.style.top = clientY + 14 + "px";
    el.mapTooltip.classList.remove("hidden");
  }

  function hideTooltip() {
    if (el.mapTooltip) el.mapTooltip.classList.add("hidden");
  }

  function getSelectedVegType() {
    return selectedVegType;
  }

  function getSelectedFaunaType() {
    return selectedFaunaType;
  }

  function renderGasValues() {
    GASES.forEach((g) => {
      const span = el.gasControls.querySelector(`[data-gas-value="${g.id}"]`);
      if (span) span.textContent = `${Atmosphere.get(g.id).toFixed(decimalsFor(g))} ${g.unit}`;
      const input = el.gasControls.querySelector(`input[data-gas="${g.id}"]`);
      if (input && document.activeElement !== input) input.value = Atmosphere.get(g.id);
    });
  }

  // Kompakte Aufschluesselung "Wald 12% · Gräser 30% · ..." — Anteil jeder
  // Stufe an der Landflaeche (siehe Planet.stats().vegetationByType). Stufen
  // ohne nennenswerten Anteil werden weggelassen, damit die Zeile nicht mit
  // lauter "0%"-Eintraegen vollläuft.
  function vegBreakdownText(stats) {
    const parts = VEGETATION_TYPES.map((t) => ({ name: t.name, pct: stats.vegetationByType[t.id] }))
      .filter((p) => p.pct >= 0.1)
      .map((p) => `${p.name} ${p.pct.toFixed(0)}%`);
    return parts.length ? parts.join(" · ") : "keine";
  }

  // Analog zu vegBreakdownText, aber ueber Land- UND Meeresarten hinweg
  // (stats.faunaByType, siehe Planet.stats()).
  function faunaBreakdownText(stats) {
    const parts = FAUNA_TYPES.map((t) => ({ name: t.name, pct: stats.faunaByType[t.id] }))
      .filter((p) => p.pct >= 0.1)
      .map((p) => `${p.name} ${p.pct.toFixed(0)}%`);
    return parts.length ? parts.join(" · ") : "keine";
  }

  function renderAll() {
    const temp = Climate.globalTemperature();
    const seaLevel = Climate.seaLevelRise();
    const stats = Planet.stats();
    el.hudTemp.textContent = temp.toFixed(1) + " °C";
    el.hudSeaLevel.textContent = "+" + seaLevel.toFixed(1) + " m";
    el.hudIce.textContent = stats.icePercent.toFixed(1) + " %";
    el.hudVegetation.textContent = stats.avgVegetation.toFixed(1) + " %";
    el.hudVegTypes.textContent = vegBreakdownText(stats);
    el.hudSalinity.textContent = stats.avgSalinity.toFixed(1) + " ‰";
    el.hudFauna.textContent = stats.avgFauna.toFixed(1) + " %";
    el.hudFaunaTypes.textContent = faunaBreakdownText(stats);
    el.hudO2.textContent = Atmosphere.get("o2").toFixed(1) + " %";
    el.hudCo2.textContent = Atmosphere.get("co2").toFixed(0) + " ppm";
    el.hudCh4.textContent = Atmosphere.get("ch4").toFixed(1) + " ppm";
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

  return { init, on, renderAll, setYear, setSpeedLabel, log, setSaveStatus, getActiveTool, getSelectedVegType, getSelectedFaunaType, showTooltip, hideTooltip };
})();
