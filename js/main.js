// Spielzustand, Simulationsschleife, Verkabelung der Module.

const Game = (() => {
  const SAVE_KEY = "lebenderplanet-save";

  let year = 0;

  function currentYear() {
    return year;
  }

  function buildPayload() {
    return {
      year,
      atmosphere: Atmosphere.serialize(),
      climate: Climate.serialize(),
      planet: Planet.serialize(),
    };
  }

  function saveGame() {
    localStorage.setItem(SAVE_KEY, JSON.stringify(buildPayload()));
  }

  function applyPayload(payload) {
    if (!payload || typeof payload.year !== "number" || !payload.atmosphere || !payload.planet) {
      throw new Error("Ungültiges Spielstand-Format.");
    }
    year = payload.year;
    Atmosphere.restore(payload.atmosphere);
    Climate.restore(payload.climate); // faellt bei fehlendem/altem Speicherstand sauber auf init() zurueck
    Planet.restore(payload.planet);
  }

  function loadGame() {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return false;
    try {
      applyPayload(JSON.parse(raw));
      return true;
    } catch (e) {
      return false;
    }
  }

  // Meldet im Ereignis-Log, wenn ein Wert eine Schwelle über- bzw. unterschreitet —
  // verhindert, dass das Log bei jedem Jahr mit denselben Zahlen vollläuft.
  function checkThreshold(prevValue, newValue, threshold, aboveMessage, belowMessage) {
    if (prevValue < threshold && newValue >= threshold && aboveMessage) UI.log(aboveMessage);
    if (prevValue >= threshold && newValue < threshold && belowMessage) UI.log(belowMessage);
  }

  function snapshot() {
    return {
      temp: Climate.globalTemperature(),
      ice: Planet.stats().icePercent,
      seaLevel: Climate.seaLevelRise(),
    };
  }

  // Wird sowohl nach einem Zeitsprung als auch nach jeder Gas-Reglerbewegung
  // aufgerufen — Ursache und Wirkung sollen unmittelbar sichtbar werden, nicht erst
  // nach dem nächsten Vorspulen.
  function checkMilestones(before, after) {
    checkThreshold(before.temp, after.temp, 16, "Die globale Durchschnittstemperatur übersteigt 16°C — spürbare Erwärmung.", "Die globale Durchschnittstemperatur sinkt wieder unter 16°C.");
    checkThreshold(before.temp, after.temp, 20, "Die globale Durchschnittstemperatur übersteigt 20°C — deutliche Erwärmung, Ökosysteme geraten unter Druck.", "Die globale Durchschnittstemperatur sinkt wieder unter 20°C.");
    checkThreshold(before.ice, after.ice, 5, null, "Die Polkappen schrumpfen auf unter 5% der Planetenoberfläche.");
    checkThreshold(before.seaLevel, after.seaLevel, 5, "Der Meeresspiegel ist um über 5m gestiegen — tief liegendes Land wird überflutet.", null);
  }

  // Rendert Dashboard UND Karte. Die Karte wird bewusst nur hier aufgerufen (bei
  // tatsächlichen Zustandsänderungen), nicht in einer Dauerschleife — das
  // supersampelte Kartenrendering (siehe js/map.js) waere bei 60 Aufrufen/Sekunde
  // unnoetig teuer, obwohl sich der Planet nur bei einem Tick/einer Aktion aendert.
  function renderAll() {
    UI.renderAll();
    try {
      PlanetMap.render();
    } catch (e) {
      console.error("Fehler beim Kartenrendern:", e);
    }
  }

  function tick(years) {
    for (let i = 0; i < years; i++) {
      const before = snapshot();
      year += 1;
      Climate.tick();
      Planet.tick();
      checkMilestones(before, snapshot());
    }
    UI.setYear(year);
    renderAll();
    saveGame();
  }

  function handleSetGas(gasId, value) {
    const before = snapshot();
    Atmosphere.set(gasId, value);
    checkMilestones(before, snapshot());
    renderAll();
    saveGame();
  }

  let simSpeed = 0; // Jahre pro Simulationsschritt; 0 = pausiert

  function handleSetSpeed(yearsPerTick) {
    simSpeed = yearsPerTick;
    UI.setSpeedLabel(simSpeed);
  }

  function handleCellClick(x, y) {
    const tool = UI.getActiveTool();
    if (!tool) return;
    let res;
    if (tool === "plant") res = Planet.terraform(x, y, tool, UI.getSelectedVegType());
    else if (tool === "salt_add") res = Planet.adjustSalinity(x, y, SALINITY_ADJUST_STEP);
    else if (tool === "salt_remove") res = Planet.adjustSalinity(x, y, -SALINITY_ADJUST_STEP);
    else if (tool === "release_fauna") res = Planet.terraformFauna(x, y, "release", UI.getSelectedFaunaType());
    else if (tool === "remove_fauna") res = Planet.terraformFauna(x, y, "remove");
    else if (tool === "detonate") res = Planet.detonate(x, y);
    else res = Planet.terraform(x, y, tool);
    if (!res.ok) {
      UI.log(res.reason);
      return;
    }
    if (tool === "detonate") UI.log("Eine Atombombe hat eine Hochtechnologie-Stadt zerstört — Nanotech-Roboter entstehen aus den Trümmern.");
    renderAll();
    saveGame();
  }

  function handleCellHover(x, y, clientX, clientY) {
    if (x === null) {
      UI.hideTooltip();
      return;
    }
    const info = Planet.cellInfoAt(x, y);
    if (!info) {
      UI.hideTooltip();
      return;
    }
    UI.showTooltip(info, clientX, clientY);
  }

  function handleSaveNow() {
    saveGame();
    UI.setSaveStatus(`Gespeichert (Jahr ${year}).`);
    UI.log("Spielstand manuell gespeichert.");
  }

  function handleExportSave() {
    const payload = buildPayload();
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `lebenderplanet-jahr${year}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    UI.setSaveStatus(`Als Datei gesichert (Jahr ${year}).`);
    UI.log("Spielstand als Datei heruntergeladen.");
  }

  function handleImportSave(jsonText) {
    try {
      applyPayload(JSON.parse(jsonText));
    } catch (e) {
      UI.setSaveStatus("Import fehlgeschlagen: " + e.message);
      UI.log("Import fehlgeschlagen: " + e.message);
      return;
    }
    saveGame();
    UI.setYear(year);
    renderAll();
    UI.setSaveStatus(`Spielstand aus Datei geladen (Jahr ${year}).`);
    UI.log("Spielstand aus Datei geladen.");
  }

  function handleNewGame() {
    if (!window.confirm("Neue Simulation starten? Der aktuelle Fortschritt geht dabei verloren.")) return;
    localStorage.removeItem(SAVE_KEY);
    year = 0;
    Atmosphere.init();
    Climate.init();
    Planet.init();
    UI.setYear(year);
    renderAll();
    UI.setSaveStatus("Neue Simulation gestartet.");
    UI.log("Eine neue Simulation beginnt.");
  }

  // Laeuft dauerhaft im Hintergrund; ein einzelner fehlerhafter Simulationsschritt
  // soll die automatische Zeit nicht dauerhaft anhalten (Resilienz-Muster wie in
  // HanseSpiel).
  function scheduleAutoTick() {
    setInterval(() => {
      if (simSpeed <= 0) return;
      try {
        tick(simSpeed);
      } catch (e) {
        console.error("Fehler im Simulations-Tick:", e);
        UI.log("Ein unerwarteter Fehler ist aufgetreten — die Simulation läuft weiter.");
      }
    }, TICK_INTERVAL_MS);
  }

  function init() {
    Atmosphere.init();
    Climate.init();
    Planet.init();
    year = 0;
    loadGame();

    PlanetMap.init(document.getElementById("planet-canvas"));
    UI.init();

    PlanetMap.onCellClick(handleCellClick);
    PlanetMap.onCellHover(handleCellHover);
    UI.on("setGas", handleSetGas);
    UI.on("setSpeed", handleSetSpeed);
    UI.on("saveNow", handleSaveNow);
    UI.on("exportSave", handleExportSave);
    UI.on("importSave", handleImportSave);
    UI.on("newGame", handleNewGame);

    UI.setYear(year);
    UI.setSpeedLabel(simSpeed);
    UI.log("Willkommen! Die Simulation beginnt.");
    renderAll();
    scheduleAutoTick();
  }

  return { init, currentYear };
})();

document.addEventListener("DOMContentLoaded", Game.init);
