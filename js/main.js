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
      civilization: Civilization.serialize(),
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
    Civilization.restore(payload.civilization); // faellt bei fehlendem/altem Speicherstand sauber auf 0 zurueck
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
    if (prevValue < threshold && newValue >= threshold && aboveMessage) UI.log(aboveMessage, "climate");
    if (prevValue >= threshold && newValue < threshold && belowMessage) UI.log(belowMessage, "climate");
  }

  function snapshot() {
    const stats = Planet.stats();
    return {
      temp: Climate.globalTemperature(),
      ice: stats.icePercent,
      seaLevel: Climate.seaLevelRise(),
      co2: Atmosphere.get("co2"),
      population: stats.totalPopulation,
      moonPlanetMassRatio: Climate.moonMassValue() / Climate.planetMassValue(),
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
    checkThreshold(before.moonPlanetMassRatio, after.moonPlanetMassRatio, 1,
      "Die Mondmasse reicht wieder aus, um die Achsneigung zu stabilisieren.",
      "Die Mondmasse reicht nicht mehr aus, um die Achsneigung zu stabilisieren — sie driftet ab jetzt langsam von selbst.");
  }

  // Rendert Dashboard UND Karte. Die Karte wird bewusst nur hier aufgerufen (bei
  // tatsächlichen Zustandsänderungen), nicht in einer Dauerschleife — das
  // supersampelte Kartenrendering (siehe js/map.js) waere bei 60 Aufrufen/Sekunde
  // unnoetig teuer, obwohl sich der Planet nur bei einem Tick/einer Aktion aendert.
  function renderAll() {
    UI.renderAll();
    try {
      PlanetMap.render();
      // Aktualisiert nur die Textur-Flagge des 3D-Widgets (billig, siehe
      // Planet3D.render()-Kommentar) und blittet das fertige Bild auf die
      // beiden Karten-Viewport-Kopien (ebenfalls billig, siehe
      // MapViewport.syncFromSource()-Kommentar) — keine der beiden Operationen
      // wiederholt PlanetMaps teuren Neuaufbau.
      Planet3D.render();
      MapViewport.syncFromSource();
    } catch (e) {
      console.error("Fehler beim Kartenrendern:", e);
    }
  }

  function tick(years) {
    for (let i = 0; i < years; i++) {
      const before = snapshot();
      year += 1;
      Climate.tick();
      const result = Planet.tick();
      const after = snapshot();
      checkMilestones(before, after);
      result.events.forEach((event) => UI.log(event.message, event.category, event));
      Charts.recordSample({
        year,
        temp: after.temp,
        co2: after.co2,
        population: after.population,
        oceanPH: Ocean.pH(),
        oceanO2: Ocean.dissolvedOxygenFraction() * 100,
        solar: Climate.solarLuminosity() * 100,
        tilt: Climate.axialTiltDegrees(),
      });
      // Nur wenn eingeschaltet (siehe Debug.setEnabled) — kein Overhead im
      // normalen Spielbetrieb, da Debug.runChecks() bei jedem Aufruf einen
      // vollen Planet.stats()-Scan macht.
      Debug.runChecks();
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

  // Gleiches Muster wie handleSetGas() oben, aber fuer Achsneigung/Mond-/
  // Planetenmasse (siehe ORBIT_CONTROLS in ui.js) — ein gemeinsamer Callback
  // statt drei, analog zu Atmosphere.set(gasId, value).
  function handleSetOrbit(orbitId, value) {
    const before = snapshot();
    if (orbitId === "tilt") Climate.setAxialTilt(value);
    else if (orbitId === "moonMass") Climate.setMoonMass(value);
    else if (orbitId === "planetMass") Climate.setPlanetMass(value);
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
    else if (tool === "trigger_volcano") res = Planet.triggerVolcano(x, y);
    else if (tool === "trigger_earthquake") res = Planet.triggerEarthquake(x, y);
    else if (tool === "trigger_tsunami") res = Planet.triggerTsunami(x, y);
    else if (tool === "trigger_plague") res = Planet.triggerPlague(x, y);
    else if (tool === "build_oxygen") res = Planet.toggleOxygenGenerator(x, y, true);
    else if (tool === "remove_oxygen") res = Planet.toggleOxygenGenerator(x, y, false);
    else if (tool === "build_scrubber") res = Planet.toggleCO2Scrubber(x, y, true);
    else if (tool === "remove_scrubber") res = Planet.toggleCO2Scrubber(x, y, false);
    else if (tool === "build_methane_scrubber") res = Planet.toggleMethaneScrubber(x, y, true);
    else if (tool === "remove_methane_scrubber") res = Planet.toggleMethaneScrubber(x, y, false);
    else if (tool === "build_emitter") res = Planet.toggleEmitter(x, y, true);
    else if (tool === "remove_emitter") res = Planet.toggleEmitter(x, y, false);
    else res = Planet.terraform(x, y, tool);
    if (!res.ok) {
      UI.log(res.reason);
      return;
    }
    if (tool === "detonate") UI.log("Eine Atombombe hat eine Hochtechnologie-Stadt zerstört — Nanotech-Roboter entstehen aus den Trümmern.", "civilization", { x, y });
    else if (tool === "trigger_volcano") UI.log("🌋 Ein ausgelöster Vulkanausbruch hat die Umgebung verwüstet und CO₂/CH₄ in die Atmosphäre geschleudert.", "disaster", { x, y });
    else if (tool === "trigger_earthquake") UI.log("🌍 Ein ausgelöstes Erdbeben hat die Region erschüttert.", "disaster", { x, y });
    else if (tool === "trigger_tsunami") UI.log("🌊 Ein ausgelöster Tsunami hat die Küste überflutet.", "disaster", { x, y });
    else if (tool === "trigger_plague") UI.log("☣️ Eine ausgelöste Seuche breitet sich aus.", "disaster", { x, y });
    renderAll();
    saveGame();
  }

  function handleCellHover(x, y, clientX, clientY) {
    if (x === null) {
      UI.hideTooltip();
      UI.showCellDebugData(null);
      return;
    }
    const info = Planet.cellInfoAt(x, y);
    if (!info) {
      UI.hideTooltip();
      UI.showCellDebugData(null);
      return;
    }
    UI.showTooltip(info, clientX, clientY);
    UI.showCellDebugData(info);
  }

  function handleSaveNow() {
    saveGame();
    UI.setSaveStatus(`Gespeichert (${formatSimTime(year)}).`);
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
    UI.setSaveStatus(`Als Datei gesichert (${formatSimTime(year)}).`);
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
    // Temperaturverlauf wird bewusst nicht mitgespeichert (siehe charts.js) — ein
    // importierter Spielstand zeigt den Verlauf ab dem Ladezeitpunkt neu, statt
    // eine Zeitreihe einer anderen Zeitlinie fortzuschreiben.
    Charts.resetHistory();
    saveGame();
    UI.setYear(year);
    renderAll();
    UI.setSaveStatus(`Spielstand aus Datei geladen (${formatSimTime(year)}).`);
    UI.log("Spielstand aus Datei geladen.");
  }

  function handleNewGame() {
    if (!window.confirm("Neue Simulation starten? Der aktuelle Fortschritt geht dabei verloren.")) return;
    localStorage.removeItem(SAVE_KEY);
    year = 0;
    Atmosphere.init();
    Climate.init();
    Planet.init();
    Civilization.init();
    Charts.resetHistory();
    UI.setYear(year);
    renderAll();
    UI.setSaveStatus("Neue Simulation gestartet.");
    UI.log("Eine neue Simulation beginnt.");
  }

  // Generalisierte Grundlage fuer alle Schnellstart-Presets (siehe PRESETS
  // unten) — ersetzt vier fast identische Handler durch EINEN, konfigurierten
  // Ablauf: Bestaetigung, Atmosphaere setzen, Klimazustand setzen, Planet neu
  // erzeugen, optional sofort mit ausgereiftem Leben besiedeln (statt ueber
  // Jahrtausende zu simulieren — das waere langsam UND wegen Zufallselementen
  // nicht zuverlaessig "wie gewuenscht"), speichern.
  function startPreset(preset) {
    if (!window.confirm(preset.confirmMessage + " Der aktuelle Fortschritt geht dabei verloren.")) return;
    localStorage.removeItem(SAVE_KEY);
    year = 0;
    Atmosphere.init();
    Atmosphere.set("co2", preset.atmosphere.co2);
    Atmosphere.set("ch4", preset.atmosphere.ch4);
    Atmosphere.set("o2", preset.atmosphere.o2);
    // Ueber Climate.restore() statt init(): init() wuerde primordialHeat/
    // outgassedWaterReserve immer auf den "kochender Startplanet"-Ausgangs-
    // zustand setzen (siehe PRIMORDIAL_HEAT_START-Kommentar in data.js) — die
    // Presets hier repraesentieren aber bereits abgekuehlte, ausgegaste
    // Planeten mit je eigenem Zielklima, gleiches Prinzip wie beim
    // Migrations-Default fuer alte Spielstaende.
    Climate.restore({
      orbitalYear: 0,
      orbitalPhase: { obliquity: 0, precession: 0, eccentricity: 0 },
      impactWinterIntensity: 0,
      primordialHeat: 0,
      outgassedWaterReserve: 1,
      waterVolume: 1,
      ...preset.climate,
    });
    Planet.init();
    if (preset.seedLife) {
      // Reihenfolge wichtig: forceLifeEstablished() VOR seedRealEarth(), da
      // Fauna.suitability() sonst fuer alles ausser Prokaryoten 0 liefert.
      Fauna.forceLifeEstablished();
      Planet.seedRealEarth();
    }
    Civilization.init();
    Charts.resetHistory();
    UI.setYear(year);
    renderAll();
    saveGame();
    UI.setSaveStatus(preset.statusMessage);
    UI.log(preset.logMessage);
  }

  // Vier Schnellstart-Szenarien (siehe UI-Buttons in index.html) — bewusst
  // unterschiedliche GAMEPLAY-Situationen, nicht nur andere Zahlen:
  const PRESETS = {
    // Reale Referenzwerte: CO2 ~425ppm, CH4 ~1,9ppm, O2 ~20,9% (Stand ~2024).
    earth: {
      confirmMessage: "Simulation mit dem heutigen Zustand der Erde starten?",
      atmosphere: { co2: 425, ch4: 1.9, o2: 20.9 },
      climate: {
        temp: 15, // grobe Naeherung an das reale globale Mittel heute
        ice: clamp(BASE_ICE_COVERAGE - ICE_TEMP_SENSITIVITY * (15 - BASE_GLOBAL_TEMP), 0, 1),
        solarLuminosityFactor: 1,
        fieldStrength: 1,
        axialTilt: TILT_REFERENCE_DEGREES,
        moonMass: MOON_MASS_DEFAULT,
        planetMass: PLANET_MASS_DEFAULT,
      },
      seedLife: true,
      statusMessage: "Simulation mit heutiger Erde gestartet.",
      logMessage: "Eine neue Simulation beginnt — mit dem heutigen Zustand der Erde.",
    },
    // Klein (PLANET_MASS_MIN=0,3 ist der niedrigste ueber den Regler
    // erreichbare Wert — der reale Mars liegt mit 0,107 Erdmassen darunter),
    // kalt, CO2-arm, kaum O2, SCHWACHES Magnetfeld — knuepft direkt an den
    // Atmosphaerenerosions-Mechanismus einer frueheren Session an: die
    // Atmosphaere erodiert bereits spuerbar, waehrend der Spieler sie
    // aufzubauen versucht. Achsneigung 25° = realer Marswert.
    mars: {
      confirmMessage: "Mars-artigen Planeten terraformen?",
      // o2:4 ist der PRAKTISCHE Mindestwert: O2/N2 sind gekoppelt (Summe fix
      // bei ATMOSPHERE_MAJOR_GAS_TOTAL=99, siehe atmosphere.js), N2 selbst hat
      // sein eigenes Maximum (95, siehe GASES in data.js) — tiefer als
      // 99-95=4 laesst sich O2 ueber Atmosphere.set() grundsaetzlich nicht
      // druecken, ein niedrigerer Zahlenwert hier wuerde beim naechsten
      // set()-Aufruf ohnehin still auf 4 angehoben.
      atmosphere: { co2: 190, ch4: 0, o2: 4 },
      climate: {
        temp: -60,
        ice: 0.35,
        solarLuminosityFactor: 1,
        fieldStrength: 0.15,
        axialTilt: 25,
        moonMass: 0.01,
        planetMass: PLANET_MASS_MIN,
      },
      seedLife: false,
      statusMessage: "Mars-Terraforming gestartet.",
      logMessage: "Eine neue Simulation beginnt — ein kalter, leblose Planet mit schwachem Magnetfeld wartet auf Terraforming.",
    },
    // Schneeball-Szenario (reale Analogie: die "Snowball Earth"-Hypothese,
    // bereits in den Albedo-Feedback-Kommentaren dieser Codebase referenziert)
    // — sehr kalt, CO2 nahe Minimum, hohe Eisbedeckung, gedaempfte
    // Sonnenleuchtkraft verschaerft die Herausforderung, den Planeten wieder
    // aufzutauen.
    ice: {
      confirmMessage: "Eisplanet (Schneeball-Szenario) erschaffen?",
      atmosphere: { co2: 160, ch4: 0.1, o2: 4 }, // siehe o2:4-Kommentar beim Mars-Preset oben
      climate: {
        temp: -40,
        ice: 0.9,
        solarLuminosityFactor: 0.85,
        fieldStrength: 1,
        axialTilt: TILT_REFERENCE_DEGREES,
        moonMass: MOON_MASS_DEFAULT,
        planetMass: PLANET_MASS_DEFAULT,
      },
      seedLife: false,
      statusMessage: "Eisplanet gestartet.",
      logMessage: "Eine neue Simulation beginnt — ein gefrorener Planet wartet darauf, aufgetaut zu werden.",
    },
    // Maximale Planetenmasse: staerkere Schwerkraft haelt die Atmosphaere
    // besser (Bonus-Kopplung aus einer frueheren Session, hier direkt
    // erlebbar), gemaessigtes Startklima nahe BASE_GLOBAL_TEMP — freundliche
    // Ausgangsbedingungen fuer die Evolution.
    superEarth: {
      confirmMessage: "Supererde erschaffen?",
      atmosphere: { co2: 320, ch4: 1, o2: 19 },
      climate: {
        temp: BASE_GLOBAL_TEMP,
        ice: BASE_ICE_COVERAGE,
        solarLuminosityFactor: 1,
        fieldStrength: 1,
        axialTilt: TILT_REFERENCE_DEGREES,
        moonMass: MOON_MASS_DEFAULT,
        planetMass: PLANET_MASS_MAX,
      },
      seedLife: false,
      statusMessage: "Supererde gestartet.",
      logMessage: "Eine neue Simulation beginnt — eine grosse, gastfreundliche Welt wartet auf ihre Evolution.",
    },
  };

  function handleStartPreset(presetKey) {
    const preset = PRESETS[presetKey];
    if (!preset) return;
    startPreset(preset);
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
    Civilization.init();
    year = 0;
    loadGame();

    // PlanetMap bleibt die Bildquelle (unveraendert, siehe map.js-Kommentar),
    // ist aber nicht mehr direkt sichtbar/interaktiv — MapViewport zeigt ihr
    // Ergebnis live gepannt/gezoomt an und uebernimmt Klick-/Hover-Handling.
    PlanetMap.init(document.getElementById("planet-canvas"));
    Planet3D.init(document.getElementById("planet-3d-widget"));
    UI.init();
    OrbitView.init(document.getElementById("orbit-view"));
    MapViewport.init(document.getElementById("map-viewport"), document.getElementById("planet-canvas"));

    MapViewport.onCellClick(handleCellClick);
    MapViewport.onCellHover(handleCellHover);
    UI.on("setGas", handleSetGas);
    UI.on("setOrbit", handleSetOrbit);
    UI.on("setSpeed", handleSetSpeed);
    UI.on("saveNow", handleSaveNow);
    UI.on("exportSave", handleExportSave);
    UI.on("importSave", handleImportSave);
    UI.on("newGame", handleNewGame);
    UI.on("startPreset", handleStartPreset);

    UI.setYear(year);
    UI.setSpeedLabel(simSpeed);
    UI.log("Willkommen! Die Simulation beginnt.");
    renderAll();
    scheduleAutoTick();
  }

  return { init, currentYear };
})();

document.addEventListener("DOMContentLoaded", Game.init);
