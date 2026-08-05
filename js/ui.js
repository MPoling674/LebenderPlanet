// Dashboard: Gas-Regler, Kennzahlen, Terraforming-Werkzeuge, Ereignis-Log,
// Spielstand-Aktionen. Callback-Registrierung über UI.on(name, handler) — gleiches
// Grundmuster wie in HanseSpiel.

const UI = (() => {
  const el = {};
  const callbacks = {};
  let activeTool = null; // "plant" | "clear" | "salt_add" | "salt_remove" | "release_fauna" | "remove_fauna" | null
  let selectedVegType = VEGETATION_TYPES[0].id;
  let selectedFaunaType = FAUNA_TYPES[0].id;

  // Tab-Umschaltung (Muster aus HanseSpiel uebernommen, siehe style.css-
  // Kommentar) — gescoped auf den jeweiligen Container statt global, damit ZWEI
  // unabhaengige Tab-Gruppen (Sidebar + HUD) nicht gegenseitig ihre Panels
  // umschalten. Erwartet, dass die `.tab-panel`-Elemente direkte Geschwister
  // der `.tabs`-Leiste sind (gleicher Elternknoten) — `data-tab="x"` auf dem
  // Button muss zu `id="tab-x"` auf dem zugehoerigen Panel passen.
  function initTabs(tabsEl) {
    if (!tabsEl || !tabsEl.parentElement) return;
    const scope = tabsEl.parentElement;
    const buttons = tabsEl.querySelectorAll(".tab-btn");
    buttons.forEach((btn) => {
      btn.addEventListener("click", () => {
        buttons.forEach((b) => b.classList.remove("active"));
        scope.querySelectorAll(":scope > .tab-panel").forEach((p) => p.classList.remove("active"));
        btn.classList.add("active");
        const panel = document.getElementById("tab-" + btn.dataset.tab);
        if (panel) panel.classList.add("active");
      });
    });
  }

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
    el.hudCities = document.getElementById("hud-cities");
    el.hudPopulation = document.getElementById("hud-population");
    el.hudO2 = document.getElementById("hud-o2");
    el.hudCo2 = document.getElementById("hud-co2");
    el.hudCh4 = document.getElementById("hud-ch4");
    el.hudCivCo2 = document.getElementById("hud-civ-co2");
    el.hudCivCh4 = document.getElementById("hud-civ-ch4");
    el.hudOceanPh = document.getElementById("hud-ocean-ph");
    el.hudOceanO2 = document.getElementById("hud-ocean-o2");
    el.hudSolar = document.getElementById("hud-solar");
    el.hudMagneticField = document.getElementById("hud-magnetfield");
    el.hudTilt = document.getElementById("hud-tilt");
    el.hudMoonMass = document.getElementById("hud-moonmass");
    el.hudPlanetMass = document.getElementById("hud-planetmass");
    el.orbitControls = document.getElementById("orbit-controls");
    el.vegLegend = document.getElementById("veg-legend");
    el.speciesList = document.getElementById("species-list");
    el.speciesModal = document.getElementById("species-modal");
    el.speciesModalImg = document.getElementById("species-modal-img");
    el.speciesDetail = document.getElementById("species-detail");
    el.mapTooltip = document.getElementById("map-tooltip");
    el.tempBreakdown = document.getElementById("temp-breakdown-table");
    el.tempChart = document.getElementById("temp-chart");
    el.co2Chart = document.getElementById("co2-chart");
    el.populationChart = document.getElementById("population-chart");
    el.correlationChart = document.getElementById("correlation-chart");
    el.correlationLegend = document.getElementById("correlation-legend");
    el.compositionChart = document.getElementById("composition-chart");
    el.compositionLegend = document.getElementById("composition-legend");
    el.oceanPhChart = document.getElementById("ocean-ph-chart");
    el.oceanO2Chart = document.getElementById("ocean-o2-chart");
    el.solarChart = document.getElementById("solar-chart");
    el.tiltChart = document.getElementById("tilt-chart");
    el.sizeComparisonChart = document.getElementById("size-comparison-chart");
    el.sizeComparisonLegend = document.getElementById("size-comparison-legend");
    el.debugEnabled = document.getElementById("debug-enabled");
    el.debugWarnings = document.getElementById("debug-warnings");
    el.debugCellDump = document.getElementById("debug-cell-dump");

    el.gasControls = document.getElementById("gas-controls");
    el.toolButtons = document.getElementById("tool-buttons");
    el.eventLog = document.getElementById("event-log");
    el.eventPopups = document.getElementById("event-popups");
    el.speedSlider = document.getElementById("speed-slider");
    el.speedLabel = document.getElementById("speed-label");
    el.saveNowBtn = document.getElementById("save-now-btn");
    el.saveExportBtn = document.getElementById("save-export-btn");
    el.saveImportBtn = document.getElementById("save-import-btn");
    el.saveImportInput = document.getElementById("save-import-input");
    el.saveStatus = document.getElementById("save-status");
    el.newGameBtn = document.getElementById("new-game-btn");
    el.quickstartButtons = document.querySelectorAll(".quickstart-buttons button[data-preset]");

    el.goalSelect = document.getElementById("goal-select");
    el.goalStatus = document.getElementById("goal-status");
    el.goalResult = document.getElementById("goal-result");
    el.goalResultIcon = document.getElementById("goal-result-icon");
    el.goalResultTitle = document.getElementById("goal-result-title");
    el.goalResultText = document.getElementById("goal-result-text");

    el.eventsOverviewBtn = document.getElementById("events-overview-btn");
    el.eventsOverviewModal = document.getElementById("events-overview-modal");
    el.eventsOverviewClose = document.getElementById("events-overview-close");
    el.eventsOverviewFilters = document.getElementById("events-overview-filters");
    el.eventsOverviewList = document.getElementById("events-overview-list");
    el.eventsOverviewDetail = document.getElementById("events-overview-detail");

    renderGasControls();
    renderOrbitControls();
    renderToolButtons();
    renderVegLegend();
    renderSpeciesList();
    initTabs(document.getElementById("sidebar-tabs"));
    initTabs(document.getElementById("hud-tabs"));

    // Schwierigkeitsgrad: setzt eine CSS-Klasse auf <body>, die per
    // style.css alle Elemente mit passendem data-minlevel ein- bzw. ausblendet.
    // Startet mit "fortgeschritten" (dem Select-Default), damit erfahrene
    // Nutzer alle sinnvollen Regler sofort sehen.
    const applyDifficulty = (level) => {
      document.body.classList.remove("level-einsteiger", "level-fortgeschritten", "level-wissenschaftler");
      document.body.classList.add("level-" + level);
      // Tab-Buttons koennen nach dem Ausblenden als aktiv markiert sein —
      // in diesem Fall den ersten sichtbaren Tab derselben Gruppe aktivieren.
      ["sidebar-tabs", "hud-tabs"].forEach((tabsId) => {
        const tabsEl = document.getElementById(tabsId);
        if (!tabsEl) return;
        const active = tabsEl.querySelector(".tab-btn.active");
        if (active && getComputedStyle(active).display === "none") {
          const first = tabsEl.querySelector(".tab-btn:not([style*='display: none'])");
          if (first) first.click();
        }
      });
    };
    const diffSel = document.getElementById("difficulty-select");
    if (diffSel) {
      diffSel.addEventListener("change", () => applyDifficulty(diffSel.value));
      applyDifficulty(diffSel.value); // Initialzustand setzen
    }

    el.speedSlider.addEventListener("input", () => {
      const idx = parseInt(el.speedSlider.value, 10);
      callbacks.setSpeed && callbacks.setSpeed(SPEED_STEPS[idx]);
    });
    el.debugEnabled.addEventListener("change", () => {
      Debug.setEnabled(el.debugEnabled.checked);
      renderDebugWarnings();
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
    el.quickstartButtons.forEach((btn) => {
      btn.addEventListener("click", () => callbacks.startPreset && callbacks.startPreset(btn.dataset.preset));
    });

    document.getElementById("species-modal-close")?.addEventListener("click", () => {
      el.speciesModal?.classList.add("hidden");
    });
    el.speciesModal?.addEventListener("click", (e) => {
      if (e.target === el.speciesModal) el.speciesModal.classList.add("hidden");
    });

    document.getElementById("goal-set-btn")?.addEventListener("click", () => {
      const id = el.goalSelect?.value || "free";
      callbacks.setGoal && callbacks.setGoal(id);
    });
    document.getElementById("goal-result-continue")?.addEventListener("click", () => {
      el.goalResult?.classList.add("hidden");
    });

    el.eventsOverviewBtn.addEventListener("click", () => {
      el.eventsOverviewModal.classList.remove("hidden");
      renderEventsOverview();
    });
    el.eventsOverviewClose.addEventListener("click", () => el.eventsOverviewModal.classList.add("hidden"));
    el.eventsOverviewModal.addEventListener("click", (e) => {
      if (e.target === el.eventsOverviewModal) el.eventsOverviewModal.classList.add("hidden");
    });
    el.eventsOverviewFilters.addEventListener("change", renderEventsOverview);
  }

  function on(name, cb) {
    callbacks[name] = cb;
  }

  function decimalsFor(gas) {
    return gas.unit === "%" ? 1 : 0;
  }

  // Orbit-/Massenregler (Achsneigung, Mondmasse, Planetenmasse): gleiches
  // Regler-Wertanzeige-Muster wie GASES/renderGasControls(), aber als eigene
  // UI-lokale Liste statt eines data.js-Arrays, da diese Werte (anders als
  // GASES) nur von der UI gebraucht werden, nicht von der Simulationslogik
  // selbst iteriert werden.
  const ORBIT_CONTROLS = [
    { id: "tilt", name: "Achsneigung", unit: "°", min: AXIAL_TILT_MIN, max: AXIAL_TILT_MAX, step: 0.5, decimals: 1, getValue: () => Climate.axialTiltDegrees() },
    { id: "moonMass", name: "Mondmasse", unit: "×", min: MOON_MASS_MIN, max: MOON_MASS_MAX, step: 0.05, decimals: 2, getValue: () => Climate.moonMassValue() },
    { id: "planetMass", name: "Planetenmasse", unit: "×", min: PLANET_MASS_MIN, max: PLANET_MASS_MAX, step: 0.05, decimals: 2, getValue: () => Climate.planetMassValue() },
  ];

  function renderOrbitControls() {
    let html = "";
    ORBIT_CONTROLS.forEach((c) => {
      const value = c.getValue();
      html += `<div class="gas-control">
        <label>${c.name}</label>
        <input type="range" min="${c.min}" max="${c.max}" step="${c.step}" value="${value}" data-orbit="${c.id}">
        <span class="gas-value" data-orbit-value="${c.id}">${value.toFixed(c.decimals)} ${c.unit}</span>
      </div>`;
    });
    el.orbitControls.innerHTML = html;
    el.orbitControls.querySelectorAll("input[type=range]").forEach((input) => {
      input.addEventListener("input", () => {
        const value = parseFloat(input.value);
        callbacks.setOrbit && callbacks.setOrbit(input.dataset.orbit, value);
      });
      // Gleicher Grund wie bei den Gas-Reglern (siehe renderGasControls()
      // unten): "change" feuert erst beim Loslassen, danach Fokus abgeben.
      input.addEventListener("change", () => input.blur());
    });
  }

  function renderOrbitValues() {
    ORBIT_CONTROLS.forEach((c) => {
      const span = el.orbitControls.querySelector(`[data-orbit-value="${c.id}"]`);
      if (span) span.textContent = `${c.getValue().toFixed(c.decimals)} ${c.unit}`;
      const input = el.orbitControls.querySelector(`input[data-orbit="${c.id}"]`);
      if (input && document.activeElement !== input) input.value = c.getValue();
    });
  }

  function renderGasControls() {
    let html = "";
    GASES.forEach((g) => {
      const value = Atmosphere.get(g.id);
      const levelAttr = g.minLevel ? ` data-minlevel="${g.minLevel}"` : "";
      html += `<div class="gas-control"${levelAttr}>
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
    // radiationOnly (Mutantenpflanzen) sind nie direkt aussaebar — sie entstehen
    // ausschliesslich zufaellig auf verstrahlten Zellen.
    const vegOptions = VEGETATION_TYPES.filter((t) => !t.radiationOnly).map(
      (t) => `<option value="${t.id}" ${t.id === selectedVegType ? "selected" : ""}>${t.name}</option>`
    ).join("");
    // manualPlacement:false (z.B. Nanotech-Roboter) sind nie direkt aussetzbar —
    // sie entstehen ausschliesslich ueber Sondermechaniken.
    const faunaOptions = FAUNA_TYPES.filter((t) => t.manualPlacement !== false).map(
      (t) => `<option value="${t.id}" ${t.id === selectedFaunaType ? "selected" : ""}>${t.name} (${t.habitat === "land" ? "Land" : "Ozean"})</option>`
    ).join("");
    const a = (tool) => activeTool === tool ? "tool-active" : "";
    el.toolButtons.innerHTML = `
      <select id="veg-type-select">${vegOptions}</select>
      <button data-tool="plant" class="${a("plant")}">🌱 Vegetation pflanzen</button>
      <button data-tool="clear" class="${a("clear")}">🪓 Vegetation entfernen</button>
      <select id="fauna-type-select">${faunaOptions}</select>
      <button data-tool="release_fauna" class="${a("release_fauna")}">🐾 Tier aussetzen</button>
      <button data-tool="remove_fauna" class="${a("remove_fauna")}">🪤 Tier entfernen</button>
      <button data-tool="salt_add" class="${a("salt_add")}" data-minlevel="fortgeschritten">🧂 Salz zuführen</button>
      <button data-tool="salt_remove" class="${a("salt_remove")}" data-minlevel="fortgeschritten">🧂 Salz entnehmen</button>
      <button data-tool="build_oxygen" class="${a("build_oxygen")}" data-minlevel="fortgeschritten">🏭 Sauerstoffgenerator bauen</button>
      <button data-tool="remove_oxygen" class="${a("remove_oxygen")}" data-minlevel="fortgeschritten">🏭 Sauerstoffgenerator entfernen</button>
      <button data-tool="build_scrubber" class="${a("build_scrubber")}" data-minlevel="fortgeschritten">🏭 CO2-Scrubber bauen</button>
      <button data-tool="remove_scrubber" class="${a("remove_scrubber")}" data-minlevel="fortgeschritten">🏭 CO2-Scrubber entfernen</button>
      <button data-tool="build_methane_scrubber" class="${a("build_methane_scrubber")}" data-minlevel="fortgeschritten">🏭 Methanfilter bauen</button>
      <button data-tool="remove_methane_scrubber" class="${a("remove_methane_scrubber")}" data-minlevel="fortgeschritten">🏭 Methanfilter entfernen</button>
      <button data-tool="build_emitter" class="${a("build_emitter")}" data-minlevel="fortgeschritten">🌋 Emitter bauen</button>
      <button data-tool="remove_emitter" class="${a("remove_emitter")}" data-minlevel="fortgeschritten">🌋 Emitter entfernen</button>
      <button data-tool="detonate" class="${a("detonate")}" data-minlevel="fortgeschritten">💣 Atombombe</button>
      <button data-tool="trigger_volcano" class="${a("trigger_volcano")}" data-minlevel="fortgeschritten">🌋 Vulkanausbruch auslösen</button>
      <button data-tool="trigger_earthquake" class="${a("trigger_earthquake")}" data-minlevel="fortgeschritten">🌍 Erdbeben auslösen</button>
      <button data-tool="trigger_tsunami" class="${a("trigger_tsunami")}" data-minlevel="fortgeschritten">🌊 Tsunami auslösen</button>
      <button data-tool="trigger_plague" class="${a("trigger_plague")}" data-minlevel="fortgeschritten">☣️ Seuche auslösen</button>
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
      const rgb = `rgb(${t.color[0]}, ${t.color[1]}, ${t.color[2]})`;
      // radiationOnly-Arten sind nicht temperaturgesteuert (siehe FAUNA_TYPES-
      // Pendant bestVegTypeFor) — ein Temperaturband waere hier irrefuehrend.
      const range = t.radiationOnly
        ? "nur bei Strahlung"
        : (() => {
            const [min, max] = vegTypeRange(t);
            return `${min.toFixed(0)}–${max.toFixed(0)} °C`;
          })();
      return `<div class="veg-legend-item">
        <span class="veg-swatch" style="background:${rgb}"></span>
        <span>${t.name} <small>(${range})</small></span>
      </div>`;
    }).join("");
  }

  // Kompakte Entstehungsbedingung fuer eine Vegetationsstufe — statisch (haengt nur
  // von Konstanten ab), daher nur einmal bei init() gerendert.
  function describeVegType(type) {
    if (type.radiationOnly) {
      return `<strong>${type.name}</strong>: entstehen nur zufällig auf verstrahlten Zellen (nach einer Atombombe), nicht durch Aussaat.`;
    }
    const [min, max] = vegTypeRange(type);
    return `<strong>${type.name}</strong>: ${min.toFixed(0)}–${max.toFixed(0)} °C. Voraussetzung: etablierte Eukaryoten (siehe Sauerstoffgehalt im HUD).`;
  }

  // Kompakte Entstehungsbedingung fuer ein Fauna-Taxon: Temperatur/Salzgehalt bzw.
  // Vegetationsbedarf, Praerequisiten-Gate und woraus es sich entwickelt (aus den
  // successors-Listen der ANDEREN Taxa rueckwaerts ermittelt, da FAUNA_TYPES nur
  // Nachfolger, keine Vorgaenger speichert).
  function describeFaunaType(type) {
    if (type.id === "nanobots") {
      return `<strong>${type.name}</strong>: entstehen nur, wenn eine Hochtechnologie-Stadt durch eine Atombombe zerstört wird.`;
    }
    // Prokaryoten sind klimaunabhaengig (siehe Fauna.suitability()-Sonderfall) —
    // kein numerisches Temperaturband anzeigen, das faelschlich eine Einschraenkung
    // suggerieren wuerde.
    const climateLabel = type.id === "prokaryotes" ? "beliebig" : (() => {
      const [tMin, tMax] = faunaTempRange(type);
      return `${tMin.toFixed(0)}–${tMax.toFixed(0)} °C`;
    })();
    const habitatLabel = type.habitat === "land" ? "Land" : "Ozean";
    let need;
    if (type.habitat === "land") {
      need = `Vegetation ≥ ${type.minVegetation}%`;
    } else if (type.id === "prokaryotes") {
      need = "Salzgehalt beliebig";
    } else {
      const [sMin, sMax] = faunaSalinityRange(type);
      need = `Salzgehalt ${sMin.toFixed(0)}–${sMax.toFixed(0)}‰`;
    }
    let prereq = "";
    if (type.id === "eukaryotes") {
      prereq = ` Voraussetzung: O₂ ≥ ${EUKARYOTE_O2_THRESHOLD}%, globale Temperatur ${EUKARYOTE_MIN_GLOBAL_TEMP}–${EUKARYOTE_MAX_GLOBAL_TEMP} °C (Sauerstoffgenerator beschleunigt dies).`;
    } else if (type.id !== "prokaryotes") {
      prereq = " Voraussetzung: etablierte Eukaryoten + Vegetation.";
    }
    const predecessors = FAUNA_TYPES.filter((t) => t.successors.some((s) => s.id === type.id)).map((t) => t.name);
    const evolvesFrom = predecessors.length ? ` Entwickelt sich aus: ${predecessors.join(", ")}.` : "";
    const extra = type.id === "prokaryotes" ? " Reichert die Atmosphäre langsam mit O₂ an." : "";
    return `<strong>${type.name}</strong> (${habitatLabel}): ${climateLabel}, ${need}.${prereq}${evolvesFrom}${extra}`;
  }

  const SPECIES_LORE = {
    moss: "Moose und Flechten sind die Pioniere des Lebens an Land. Sie besiedeln nackte Felsen und nährstoffarme Böden und bereiten so den Weg für komplexere Pflanzen. Ihre extreme Toleranz gegenüber Kälte und Trockenheit macht sie zur ersten Stufe der Landvegetation.",
    grass: "Gräser entwickeln dichte Wurzelnetzwerke, die den Boden stabilisieren und Humus aufbauen. Sie tolerieren saisonale Kälte und Trockenheit besser als Büsche oder Wälder. Ihre schnelle Ausbreitung verwandelt karge Böden in produktive Savannen und Steppen.",
    shrub: "Büsche bilden den Übergang zwischen Gras- und Waldvegetation. Ihre holzige Substanz speichert mehr Kohlenstoff als Gräser und bietet Tieren Deckung und Nahrung. Sie bevorzugen gemäßigtes Klima mit ausreichender Feuchtigkeit.",
    forest: "Wälder sind die produktivsten Landökosysteme und produzieren große Mengen Sauerstoff. Das Kronendach reguliert das lokale Mikroklima und hält Feuchtigkeit im Boden. Sie benötigen warmes, stabiles Klima und einen etablierten O₂-Gehalt.",
    rainforest: "Der tropische Regenwald beheimatet die größte Artenvielfalt des Planeten. Er speichert enorme Kohlenstoffmengen und treibt den globalen Wasserkreislauf an. Nur in dauerhaft feuchtwarmem Klima mit hohem Sauerstoffanteil kann er gedeihen.",
    mutant: "Mutantenpflanzen entstehen durch ionisierende Strahlung nach nuklearen Ereignissen. Ihre violette Färbung rührt von Photosynthesepigmenten her, die auch unter erhöhter UV-Strahlung funktionieren. Sie sind äußerst robust, aber auf verstrahlte Gebiete beschränkt und nicht aussäbar.",
    prokaryotes: "Prokaryoten sind die älteste Lebensform — einzellige Organismen ohne Zellkern. Sie sind extrem widerstandsfähig und kolonisieren nahezu jeden Ozean. Über Millionen Jahre reichern sie die Atmosphäre durch Photosynthese langsam mit Sauerstoff an.",
    eukaryotes: "Eukaryoten besitzen einen echten Zellkern und bilden die Grundlage aller komplexeren Lebewesen. Sie entstehen erst, wenn die Atmosphäre genug Sauerstoff enthält und das Klima gemäßigt ist. Im Ozean formen sie Plankton-Schwärme, die die Basis der Nahrungskette darstellen.",
    radiata: "Radiata (Strahltiere) wie Quallen und Korallen sind radialsymmetrische Meerestiere. Sie bewegen sich passiv mit den Strömungen und ernähren sich von Plankton. Ihre gelatinösen Körper bevölkern schon früh die Küstengewässer junger Ozeane.",
    mollusks: "Mollusken (Weichtiere) umfassen Tintenfische, Muscheln und Schnecken. Viele bilden Kalkschalen, die bei saurem Meerwasser aufgelöst werden — sie sind pH-sensitiv. Ihre hochentwickelten Nervensysteme machen sie zu frühen Vorzeige-Tieren der Evolution.",
    trichordates: "Trichordaten sind bilateral-symmetrische Meerestiere mit einem primitiven Rückenstrang. Als Vorläufer echter Chordaten füllen sie die ökologische Nische zwischen Weichtieren und Fischen. Sie bevorzugen sauberes, sauerstoffreiches Meerwasser.",
    fish: "Fische sind die ersten Wirbeltiere — gekennzeichnet durch Kiemen, Flossen und ein Knochenskelett. Sie dominieren marine Ökosysteme und erschließen als erste Lebewesen größere Wassertiefen. Aus ihren Flossensäumen entwickeln sich die ersten Landextremitäten.",
    arthropods: "Arthropoden (Gliederfüßer) sind die artenreichste Tiergruppe überhaupt. Auf dem Land besiedeln sie Böden, Vegetation und Gewässerränder. Ihr chitinöses Außenskelett und segmentierte Gliedmaßen erlauben extreme ökologische Anpassungsvielfalt.",
    amphibians: "Amphibien sind die ersten Wirbeltiere auf dem Land — ein Bindeglied zwischen Wasser und Festland. Sie müssen zur Fortpflanzung ins Wasser zurückkehren und benötigen feuchtes Klima. Aus ihnen entwickeln sich alle höheren Landwirbeltiere.",
    reptiles: "Reptilien sind die ersten vollständig landunabhängigen Wirbeltiere. Das wasserundurchlässige Amnionei macht sie unabhängig von Gewässern. Ihr effizienter Stoffwechsel erlaubt Überleben auch in trockenen und heißen Klimazonen.",
    dinosaurs: "Dinosphen sind eine mächtige Reptiliengruppe, die in dieser Simulation den alternativen Weg von Reptilien zu Avialae darstellt. Als Großtiere besetzen sie ökologische Schlüsselpositionen in Nahrungsnetzen. Unter bestimmten Bedingungen können aus ihnen vogelartige Lebewesen entstehen.",
    avians: "Avialae (Vogelartige) kombinieren Flugreisen mit endothermer Körpertemperatur. Sie verbreiten Samen über weite Distanzen und schließen wichtige ökologische Kreisläufe. Ihre Vorfahren sind entweder Reptilien oder Dinosphen.",
    therapsids: "Therapsiden sind säugetierähnliche Reptilien und direkte Vorläufer der Säugetiere. Ihr frühes Fell und die gleichwarme Körpertemperatur erlauben Aktivität auch bei niedrigen Temperaturen. Aus ihnen entstehen sowohl Beuteltiere als auch Plazentatiere.",
    marsupials: "Marsupilier (Beuteltiere) tragen ihren Nachwuchs in einem Körperbeutel und sind extrem anpassungsfähig. Sie gedeihen besonders auf isolierten Kontinenten ohne Konkurrenz durch Plazentatiere. Ihre einfachere Fortpflanzung ermöglicht schnelle Evolution unter Extrembedingungen.",
    placentals: "Plazentatiere nähren ihren Nachwuchs über eine komplexe Plazenta und dominieren die meisten Ökosysteme. Aus ihnen entwickeln sich sowohl Meeressäuger als auch Primaten. Sie benötigen dichte Vegetation als Lebensraum und Nahrungsquelle.",
    ceti: "Ceti sind hochintelligente Landsäugetiere mit ausgeprägten sozialen Strukturen und Kommunikationsfähigkeiten. Als alternativer Entwicklungszweig zu Primaten können sie unter den richtigen Bedingungen den Weg ins Meer einschlagen. Ihre soziale Organisation bildet eine Grundlage für potenzielle Zivilisationen.",
    cetaceans: "Cetaceen (Wale und Delfine) sind ins Meer zurückgekehrte Säugetiere mit großem Gehirn. Sie kommunizieren über komplexe Lautsprachen und zeigen kooperatives Sozialverhalten. In dieser Simulation entstehen sie aus den Ceti-Vorfahren, die den Übergang von Land zu Wasser vollziehen.",
    primates: "Primaten sind hochentwickelte Säugetiere mit Greifhänden, Stereosehen und großem Gehirn. Ihre Fähigkeit zur Werkzeugnutzung und sozialen Organisation bildet die Grundlage für mögliche Zivilisationen. Sie benötigen ausgedehnte Vegetation und stabiles, warmes Klima.",
    nanobots: "Nanotech-Roboter entstehen aus den Trümmern einer Hochtechnologie-Zivilisation nach einem nuklearen Ereignis. Sie sind selbstreplizierende Maschinen, die biologische Ökosysteme ergänzen oder ersetzen können. Trotz ihres künstlichen Ursprungs verhalten sie sich wie ein eigenständiger Organismus im Planeten-Ökosystem.",
  };

  function renderSpeciesList() {
    if (!el.speciesList) return;
    let html = `<li class="species-group-label">Vegetation</li>`;
    VEGETATION_TYPES.forEach((t) => {
      const rgb = `rgb(${t.color[0]}, ${t.color[1]}, ${t.color[2]})`;
      html += `<li class="species-entry" data-id="${t.id}" data-kind="veg">
        <span class="species-dot" style="background:${rgb}"></span>
        <span class="species-name">${t.name}</span>
      </li>`;
    });
    html += `<li class="species-group-label">Fauna</li>`;
    FAUNA_TYPES.forEach((t) => {
      const rgb = `rgb(${t.color[0]}, ${t.color[1]}, ${t.color[2]})`;
      html += `<li class="species-entry" data-id="${t.id}" data-kind="fauna">
        <span class="species-dot" style="background:${rgb}"></span>
        <span class="species-name">${t.name}</span>
      </li>`;
    });
    el.speciesList.innerHTML = html;
    el.speciesList.querySelectorAll(".species-entry").forEach((item) => {
      item.addEventListener("click", () => {
        el.speciesList.querySelectorAll(".species-entry.active").forEach((a) => a.classList.remove("active"));
        item.classList.add("active");
        showSpeciesDetail(item.dataset.id, item.dataset.kind);
      });
    });
  }

  const SPECIES_WIKI = {
    moss: "Moss", grass: "Poaceae", shrub: "Shrub", forest: "Forest",
    rainforest: "Tropical_rainforest",
    prokaryotes: "Prokaryote", eukaryotes: "Eukaryote", radiata: "Cnidaria",
    mollusks: "Mollusca", fish: "Fish", arthropods: "Arthropod",
    amphibians: "Amphibian", reptiles: "Reptile", dinosaurs: "Dinosaur",
    avians: "Bird", therapsids: "Therapsida", marsupials: "Marsupial",
    placentals: "Placentalia", cetaceans: "Cetacea", primates: "Primate",
  };
  const wikiImageCache = {};

  function fetchWikiImage(id) {
    if (id in wikiImageCache) {
      applyWikiImage(wikiImageCache[id]);
      return;
    }
    const title = SPECIES_WIKI[id];
    if (!title) { wikiImageCache[id] = null; applyWikiImage(null); return; }
    fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`)
      .then((r) => r.json())
      .then((data) => {
        const url = data.thumbnail?.source || null;
        wikiImageCache[id] = url;
        applyWikiImage(url);
      })
      .catch(() => { wikiImageCache[id] = null; applyWikiImage(null); });
  }

  function applyWikiImage(url) {
    if (!el.speciesModalImg) return;
    if (url) {
      el.speciesModalImg.src = url;
      el.speciesModalImg.classList.remove("hidden");
    } else {
      el.speciesModalImg.classList.add("hidden");
    }
  }

  function showSpeciesDetail(id, kind) {
    if (!el.speciesDetail) return;
    const stats = Planet.stats();
    let type, rgb, habitatLabel, isActive, reqs, evo, civBadge;

    if (kind === "veg") {
      type = getVegType(id);
      if (!type) return;
      rgb = `rgb(${type.color[0]}, ${type.color[1]}, ${type.color[2]})`;
      habitatLabel = "Land";
      isActive = (stats.vegetationByType[id] || 0) >= 0.1;
      const reqLines = [];
      if (type.radiationOnly) {
        reqLines.push("Entsteht nur auf verstrahlten Zellen (nach Atombombe)");
        reqLines.push("Kann nicht manuell ausgesät werden");
      } else {
        const [tMin, tMax] = vegTypeRange(type);
        reqLines.push(`Temperatur: ${tMin.toFixed(0)} – ${tMax.toFixed(0)} °C`);
        if (type.complexity > 0) reqLines.push("Voraussetzung: Eukaryoten etabliert (O₂ ≥ " + EUKARYOTE_O2_THRESHOLD + " %)");
        if (type.complexity > 1) reqLines.push("Voraussetzung: einfachere Vegetationsstufen aktiv");
      }
      reqs = reqLines;
      const idx = VEGETATION_TYPES.findIndex((t) => t.id === id);
      const pred = idx > 0 && !type.radiationOnly ? VEGETATION_TYPES[idx - 1] : null;
      const succ = idx >= 0 && idx < VEGETATION_TYPES.length - 1 && !type.radiationOnly ? VEGETATION_TYPES[idx + 1] : null;
      const predHtml = pred ? `<span class="sd-evo-pred">${pred.name}</span> → ` : "";
      const succHtml = succ ? ` → <span class="sd-evo-succ">${succ.name}</span>` : "";
      evo = `${predHtml}<strong>${type.name}</strong>${succHtml}`;
      civBadge = null;
    } else {
      type = getFaunaType(id);
      if (!type) return;
      rgb = `rgb(${type.color[0]}, ${type.color[1]}, ${type.color[2]})`;
      habitatLabel = type.habitat === "land" ? "Land" : type.habitat === "ocean" ? "Ozean" : "Künstlich";
      isActive = (stats.faunaByType[id] || 0) >= 0.1;
      const reqLines = [];
      if (id === "nanobots") {
        reqLines.push("Entsteht nur durch Atomexplosion in einer Hochtechnologie-Stadt");
        reqLines.push("Kann nicht manuell ausgesetzt werden");
      } else if (id === "prokaryotes") {
        reqLines.push("Temperatur: beliebig");
        reqLines.push("Salzgehalt: beliebig");
        reqLines.push("Keine weiteren Voraussetzungen — erste mögliche Lebensform");
      } else {
        const [tMin, tMax] = faunaTempRange(type);
        reqLines.push(`Temperatur: ${tMin.toFixed(0)} – ${tMax.toFixed(0)} °C`);
        if (type.habitat === "ocean") {
          const [sMin, sMax] = faunaSalinityRange(type);
          reqLines.push(`Salzgehalt: ${sMin.toFixed(0)} – ${sMax.toFixed(0)} ‰`);
        } else {
          reqLines.push(`Vegetation: ≥ ${type.minVegetation} %`);
        }
        if (id === "eukaryotes") {
          reqLines.push(`O₂: ≥ ${EUKARYOTE_O2_THRESHOLD} %, globale Temperatur ${EUKARYOTE_MIN_GLOBAL_TEMP} – ${EUKARYOTE_MAX_GLOBAL_TEMP} °C`);
        } else {
          reqLines.push("Voraussetzung: Eukaryoten + Vegetation etabliert");
        }
        if (type.successorOnly) reqLines.push("Nur durch Evolution aus einer Vorläufer-Art");
      }
      reqs = reqLines;
      const predecessors = FAUNA_TYPES.filter((t) => t.successors.some((s) => s.id === id));
      const predHtml = predecessors.length
        ? predecessors.map((p) => `<span class="sd-evo-pred">${p.name}</span>`).join(", ") + " → "
        : "";
      const succHtml = type.successors.length
        ? " → " + type.successors.map((s) => {
            const st = getFaunaType(s.id);
            return `<span class="sd-evo-succ">${st ? st.name : s.id}</span>`;
          }).join(", ")
        : "";
      evo = `${predHtml}<strong>${type.name}</strong>${succHtml}`;
      civBadge = type.civilizationCapable
        ? `<span class="sd-civ-badge sd-civ-yes">Zivilisationsfähig</span>`
        : `<span class="sd-civ-badge sd-civ-no">Kein Zivilisationspotenzial</span>`;
    }

    const lore = SPECIES_LORE[id] || "";
    const activeHtml = isActive
      ? `<span class="sd-badge sd-badge-active">Aktiv auf dem Planeten</span>`
      : `<span class="sd-badge sd-badge-inactive">Nicht etabliert</span>`;
    const reqHtml = reqs.map((r) => `<li>${r}</li>`).join("");

    el.speciesDetail.innerHTML = `
      <div class="sd-header">
        <span class="sd-dot" style="background:${rgb}"></span>
        <div>
          <div class="sd-name">${type.name}</div>
          <div class="sd-badges">
            <span class="sd-badge sd-badge-habitat">${habitatLabel}</span>
            ${activeHtml}
          </div>
        </div>
      </div>
      <p class="sd-lore">${lore}</p>
      <div class="sd-section">
        <div class="sd-section-title">Entstehungsbedingungen</div>
        <ul class="sd-reqs">${reqHtml}</ul>
      </div>
      <div class="sd-section">
        <div class="sd-section-title">Entwicklungsbaum</div>
        <div class="sd-evo">${evo}</div>
      </div>
      ${civBadge ? `<div class="sd-section">${civBadge}</div>` : ""}
    `;
    applyWikiImage(null);
    fetchWikiImage(id);
    if (el.speciesModal) el.speciesModal.classList.remove("hidden");
  }

  function getActiveTool() {
    return activeTool;
  }

  function terrainLabel(terrain) {
    if (terrain === "ocean") return "Ozean";
    if (terrain === "ice") return "Eis";
    return "Land";
  }

  function precipToMm(pct) {
    return Math.round((pct / 100) ** 2 * 2500);
  }

  function biomeLabel(info) {
    const t = info.temperature;
    const mm = precipToMm(info.precipitation);
    if (info.terrain === "ice") return "Eisschild";
    if (info.terrain === "ocean") {
      if (t < -2)  return "Polarmeer";
      if (t < 5)   return "Subpolares Meer";
      if (t < 15)  return info.boundaryCurrent ? "Schelf / Küstengewässer" : "Gemäßigtes Meer";
      if (t < 25)  return info.boundaryCurrent ? "Schelf / Küstengewässer" : "Subtropisches Meer";
      return "Tropisches Meer";
    }
    // Land
    if (t < -15) return "Polartundra";
    if (t < -2)  return "Tundra";
    if (t < 3)   return mm < 250 ? "Kältesteppe" : "Taiga";
    if (t < 10) {
      if (mm < 300) return "Steppe";
      if (mm < 900) return "Gemäßigtes Grasland";
      return "Gemäßigter Wald";
    }
    if (t < 18) {
      if (mm < 250) return "Halbwüste";
      if (mm < 700) return "Mediterran";
      return "Feuchtgemäßigt";
    }
    // t ≥ 18 °C
    if (mm < 150)  return "Wüste";
    if (mm < 400)  return "Dornsavanne";
    if (mm < 900)  return "Savanne";
    if (mm < 1600) return "Tropen";
    return "Tropischer Regenwald";
  }

  function showTooltip(info, clientX, clientY) {
    if (!el.mapTooltip) return;
    let html = `<strong>${biomeLabel(info)}</strong><br>Temperatur: ${info.temperature.toFixed(1)} °C`;
    html += `<br>Niederschlag: ~${precipToMm(info.precipitation)} mm/Jahr`;
    if (info.terrain === "land" || info.terrain === "ice") {
      const elevM = Math.max(0, Math.round((info.elevation - 0.58) / (1 - 0.58) * 4000));
      html += `<br>Höhe: ~${elevM} m ü.NN`;
    }
    if (info.terrain === "land") {
      const type = info.vegetationType ? getVegType(info.vegetationType) : null;
      html += type
        ? `<br>${type.name}: ${info.vegetation.toFixed(0)} %`
        : `<br>Keine Vegetation`;
    }
    if (info.terrain === "ocean") {
      html += `<br>Salzgehalt: ${info.salinity.toFixed(1)} ‰`;
      html += `<br>Strömung: Richtung ${info.currentDirection > 0 ? "Osten" : "Westen"}`;
      if (info.boundaryCurrent === "warm") html += ` (warmer Küstenstrom, golfstromartig)`;
      else if (info.boundaryCurrent === "cool") html += ` (kalter Auftriebsstrom)`;
    }
    if (info.faunaType) {
      const faunaType = getFaunaType(info.faunaType);
      html += `<br>${faunaType.name}: ${info.fauna.toFixed(0)} %`;
    }
    if (info.hasCity) {
      html += `<br>🏙 Stadt (Tech-Level ${info.techLevel.toFixed(0)}${info.isHighTech ? ", Hochtechnologie" : ""}), Bevölkerung: ${info.population.toLocaleString("de-DE")}`;
    }
    if (info.radiation > 0) {
      html += `<br>☢ Verstrahlt (${info.radiation.toFixed(0)})`;
    }
    if (info.oxygenGenerator) {
      html += `<br>🏭 Sauerstoffgenerator`;
    }
    if (info.co2Scrubber) {
      html += `<br>🏭 CO2-Scrubber`;
    }
    if (info.methaneScrubber) {
      html += `<br>🏭 Methanfilter`;
    }
    if (info.emitter) {
      html += `<br>🌋 Emitter`;
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

  // Temperatur-Analyse-Tabelle im Grafiken-Tab: zeigt, welche Faktoren wie viel
  // zur Gleichgewichtstemperatur beitragen (Deltas relativ zur 14-°C-Baseline).
  // Einschlagswinter und primordiale Waerme erscheinen nur wenn aktiv (> 0).
  function renderTempBreakdown() {
    if (!el.tempBreakdown) return;
    const bd = Climate.temperatureBreakdown();
    const rows = [
      { icon: "🌞", label: "Sonnenstrahlung", value: bd.solar },
      { icon: "🌫️", label: "Treibhausgase (CO₂/CH₄)", value: bd.ghg },
      { icon: "💧", label: "Wasserdampf-Rückkopplung", value: bd.waterVapor },
      { icon: "🧊", label: "Eis-Albedo", value: bd.albedo },
      { icon: "🌍", label: "Milanković-Zyklen", value: bd.milankovitch },
    ];
    if (bd.impactWinter < -0.1)
      rows.push({ icon: "☄️", label: "Einschlagswinter", value: bd.impactWinter });
    if (bd.primordialHeat > 0.5)
      rows.push({ icon: "🌋", label: "Primordiale Wärme", value: bd.primordialHeat });

    const sign = (v) => (v >= 0 ? "+" : "");
    const fmt = (v) => v.toLocaleString("de-DE", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
    const rows_html = rows
      .map((r) => {
        const cls = r.value >= 0 ? "temp-delta-pos" : "temp-delta-neg";
        return `<tr>
          <td class="temp-breakdown-label">${r.icon} ${r.label}</td>
          <td class="temp-breakdown-value ${cls}">${sign(r.value)}${fmt(r.value)} °C</td>
        </tr>`;
      })
      .join("");
    const eqCls = bd.equilibrium > Climate.globalTemperature() ? "temp-delta-pos" : "temp-delta-neg";
    el.tempBreakdown.innerHTML = `
      ${rows_html}
      <tr class="temp-breakdown-total">
        <td class="temp-breakdown-label">→ Gleichgewicht</td>
        <td class="temp-breakdown-value ${eqCls}">${fmt(bd.equilibrium)} °C</td>
      </tr>`;
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
    el.hudCities.textContent = stats.cityCount;
    el.hudPopulation.textContent = stats.totalPopulation.toLocaleString("de-DE");
    el.hudO2.textContent = Atmosphere.get("o2").toFixed(1) + " %";
    el.hudCo2.textContent = Atmosphere.get("co2").toFixed(0) + " ppm";
    el.hudCh4.textContent = Atmosphere.get("ch4").toFixed(1) + " ppm";
    const civEmissions = Civilization.cumulativeEmissions();
    el.hudCivCo2.textContent = civEmissions.co2.toFixed(1) + " ppm";
    el.hudCivCh4.textContent = civEmissions.ch4.toFixed(2) + " ppm";
    el.hudOceanPh.textContent = Ocean.pH().toFixed(2);
    el.hudOceanO2.textContent = (Ocean.dissolvedOxygenFraction() * 100).toFixed(0) + " %";
    el.hudSolar.textContent = (Climate.solarLuminosity() * 100).toFixed(0) + " %";
    el.hudMagneticField.textContent = (Climate.magneticFieldStrength() * 100).toFixed(0) + " %";
    el.hudTilt.textContent = Climate.axialTiltDegrees().toFixed(1) + " °";
    el.hudMoonMass.textContent = Climate.moonMassValue().toFixed(2) + "×";
    el.hudPlanetMass.textContent = Climate.planetMassValue().toFixed(2) + "×";
    renderGasValues();
    renderOrbitValues();
    Charts.renderTemperatureChart(el.tempChart);
    Charts.renderCo2Chart(el.co2Chart);
    Charts.renderPopulationChart(el.populationChart);
    Charts.renderCorrelationChart(el.correlationChart, el.correlationLegend);
    Charts.renderCompositionChart(el.compositionChart, el.compositionLegend);
    Charts.renderOceanPhChart(el.oceanPhChart);
    Charts.renderOceanO2Chart(el.oceanO2Chart);
    Charts.renderSolarChart(el.solarChart);
    Charts.renderTiltChart(el.tiltChart);
    Charts.renderSizeComparisonChart(el.sizeComparisonChart, el.sizeComparisonLegend);
    renderTempBreakdown();
    renderDebugWarnings();
    renderGoal();
  }

  // Zeigt die aktuellen Konsistenzpruefungs-Ergebnisse (siehe Debug.runChecks(),
  // von main.js einmal pro Simulationsjahr aufgerufen) — IMMER der aktuelle
  // Stand, kein Log: eine dauerhaft bestehende Abweichung soll sichtbar bleiben,
  // statt im Ereignis-Log unterzugehen oder es zuzuspammen.
  function renderDebugWarnings() {
    if (!el.debugWarnings) return;
    if (!Debug.isEnabled()) {
      el.debugWarnings.innerHTML = `<li class="debug-off">Konsistenzprüfung ausgeschaltet.</li>`;
      return;
    }
    const warnings = Debug.currentWarnings();
    el.debugWarnings.innerHTML = warnings.length
      ? warnings.map((w) => `<li class="debug-warning">⚠️ ${w}</li>`).join("")
      : `<li class="debug-ok">✅ Keine Auffälligkeiten.</li>`;
  }

  // Roh-JSON der gerade gehoverten Zelle (siehe Planet.cellInfoAt) — zeigt ALLE
  // Felder, nicht nur die im normalen Tooltip kuratierte Auswahl, damit sich
  // ein konkreter Zellzustand ohne Konsolen-Skript nachvollziehen laesst.
  function showCellDebugData(info) {
    if (!el.debugCellDump) return;
    el.debugCellDump.textContent = info ? JSON.stringify(info, null, 1) : "Keine Zelle unter dem Mauszeiger.";
  }

  let currentYear = 0;

  function renderGoal() {
    if (!el.goalStatus) return;
    const s = Goals.status(currentYear);
    if (!s || s.goal.id === "free") {
      el.goalStatus.innerHTML = '<p class="goal-none">Kein aktives Ziel — wähle oben ein Ziel aus.</p>';
      return;
    }
    const { goal, state, elapsed, conditions } = s;
    const stateClass = state === "won" ? "goal-won" : state === "lost" ? "goal-lost" : "";
    let timeHtml = "";
    if (goal.timeLimit) {
      const pct = Math.min(100, (elapsed / goal.timeLimit) * 100);
      const remaining = Math.max(0, goal.timeLimit - elapsed);
      timeHtml = `<div class="goal-time">
        <span>Verstrichene Zeit: ${formatSimTime(elapsed)}</span>
        <div class="goal-time-bar"><div class="goal-time-fill" style="width:${pct.toFixed(1)}%"></div></div>
        <span class="goal-time-remaining">${formatSimTime(remaining)} verbleibend</span>
      </div>`;
    }
    const condHtml = conditions.map(c =>
      `<li class="${c.met ? "goal-cond-met" : ""}">${c.met ? "✓" : "○"} ${c.label}</li>`
    ).join("");
    el.goalStatus.innerHTML = `<div class="goal-active ${stateClass}">
      <div class="goal-active-title">${goal.title}</div>
      <div class="goal-active-desc">${goal.description}</div>
      ${timeHtml}
      <ul class="goal-conditions">${condHtml}</ul>
    </div>`;
  }

  function showGoalResult(goal, success) {
    if (!el.goalResult) return;
    el.goalResultIcon.textContent = success ? "🏆" : "⏱";
    el.goalResultTitle.textContent = success ? "Ziel erreicht!" : "Zeit abgelaufen";
    el.goalResultText.textContent = success
      ? `"${goal.title}" erfolgreich abgeschlossen. Die Simulation läuft im freien Modus weiter.`
      : `Die Zeitgrenze für "${goal.title}" wurde überschritten. Du kannst weiter experimentieren.`;
    el.goalResult.classList.remove("hidden");
  }

  function setYear(year) {
    currentYear = year;
    el.hudYear.textContent = formatSimTime(year);
  }

  function setSpeedLabel(yearsPerTick) {
    if (yearsPerTick <= 0) {
      el.speedLabel.textContent = "Pausiert";
      return;
    }
    const perSecond = yearsPerTick * (1000 / TICK_INTERVAL_MS);
    el.speedLabel.textContent = `${perSecond} Jahre/Sekunde`;
  }

  // Volle, unbegrenzte Ereignis-Historie fuer die Uebersicht (siehe
  // renderEventsOverview) — getrennt vom sichtbaren #event-log, das aus
  // Performance-/Uebersichtsgruenden auf die letzten 60 Eintraege gekappt wird.
  // Nicht Teil des Spielstands (siehe Charts.resetHistory()-Kommentar: die
  // Historie beginnt mit jedem Laden/Neustart neu, wie der sichtbare Log auch).
  let eventHistory = [];

  const EVENT_CATEGORY_LABELS = {
    evolution: "Evolution",
    disaster: "Naturereignis",
    climate: "Klima",
    civilization: "Zivilisation",
    system: "System",
    error: "Hinweis",
  };
  const EVENT_CATEGORY_ICONS = {
    evolution: "🧬",
    disaster: "⚠️",
    climate: "🌍",
    civilization: "🏙️",
    system: "ℹ️",
    error: "🚫",
  };

  const EVENT_POPUP_DURATION_MS = 8000;
  const EVENT_POPUP_FADE_MS = 300; // muss zur CSS-Transition von .event-popup-closing passen

  // Meilenstein-Ereignisse (milestone:true, siehe scanForDiscoveries() in
  // planet.js) erscheinen zusaetzlich zum Ereignis-Log als vergaengliches
  // Popup — sie sind einmalig/unumkehrbar ("Entwicklungsstufen"), im
  // Gegensatz zu z.B. oszillierenden Temperaturschwellen, die deshalb bewusst
  // NICHT hier landen (staendige Popups waeren sonst nur Laerm).
  function showEventPopup(entry) {
    if (!el.eventPopups) return;
    const div = document.createElement("div");
    div.className = `event-popup event-popup-${entry.category}`;
    const icon = EVENT_CATEGORY_ICONS[entry.category] || "";
    const label = EVENT_CATEGORY_LABELS[entry.category] || entry.category;
    div.innerHTML = `
      <button class="event-popup-close" aria-label="Schließen">&times;</button>
      <div class="event-popup-header">${icon} ${label}</div>
      <div class="event-popup-body"></div>
    `;
    div.querySelector(".event-popup-body").textContent = entry.message;

    if (entry.milestone && entry.typeId && SPECIES_WIKI[entry.typeId]) {
      const img = document.createElement("img");
      img.className = "event-popup-img hidden";
      img.alt = "";
      div.appendChild(img);
      if (wikiImageCache[entry.typeId]) {
        img.src = wikiImageCache[entry.typeId];
        img.classList.remove("hidden");
      } else {
        fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(SPECIES_WIKI[entry.typeId])}`)
          .then((r) => r.json())
          .then((data) => {
            if (data.thumbnail?.source) {
              wikiImageCache[entry.typeId] = data.thumbnail.source;
              img.src = data.thumbnail.source;
              img.classList.remove("hidden");
            }
          })
          .catch(() => {});
      }
    }
    let dismissTimer = null;
    const remove = () => {
      if (dismissTimer) clearTimeout(dismissTimer);
      div.classList.add("event-popup-closing");
      setTimeout(() => div.remove(), EVENT_POPUP_FADE_MS);
    };
    div.querySelector(".event-popup-close").addEventListener("click", remove);
    el.eventPopups.appendChild(div);
    dismissTimer = setTimeout(remove, EVENT_POPUP_DURATION_MS);
  }

  function log(message, category, meta) {
    const cat = category || "system";
    const entry = { year: Game.currentYear(), category: cat, message, ...(meta || {}) };
    eventHistory.push(entry);

    const li = document.createElement("li");
    li.textContent = `${formatSimTime(entry.year)}: ${message}`;
    el.eventLog.insertBefore(li, el.eventLog.firstChild);
    while (el.eventLog.children.length > 60) el.eventLog.removeChild(el.eventLog.lastChild);

    if (el.eventsOverviewModal && !el.eventsOverviewModal.classList.contains("hidden")) renderEventsOverview();
    if (entry.milestone || entry.popup) showEventPopup(entry);
  }

  function showError(message) {
    log(message, "system");
    showEventPopup({ year: Game.currentYear(), category: "error", message });
  }

  function activeEventCategories() {
    const boxes = el.eventsOverviewFilters.querySelectorAll("input[type=checkbox]");
    const active = new Set();
    boxes.forEach((box) => { if (box.checked) active.add(box.dataset.category); });
    return active;
  }

  // Detailtext je Ereignis: Evolutions-Ereignisse verweisen auf dieselbe
  // Beschreibung wie das Artenlexikon (describeVegType/describeFaunaType), damit
  // die Information nur an einer Stelle gepflegt werden muss; andere Kategorien
  // zeigen Jahr/Kategorie und, falls vorhanden, den betroffenen Kartenort.
  function eventDetailHtml(entry) {
    let html = `<strong>${formatSimTime(entry.year)}</strong> — ${EVENT_CATEGORY_LABELS[entry.category] || entry.category}<br>${entry.message}`;
    if (entry.kind === "vegetation") {
      const type = getVegType(entry.typeId);
      if (type) html += `<hr>${describeVegType(type)}`;
    } else if (entry.kind === "fauna") {
      const type = getFaunaType(entry.typeId);
      if (type) html += `<hr>${describeFaunaType(type)}`;
    }
    if (typeof entry.x === "number" && typeof entry.y === "number") {
      html += `<br>Ort: Zelle (${entry.x}, ${entry.y})`;
    }
    return html;
  }

  function renderEventsOverview() {
    if (!el.eventsOverviewList) return;
    const active = activeEventCategories();
    const filtered = eventHistory.filter((e) => active.has(e.category));
    el.eventsOverviewList.innerHTML = "";
    for (let i = filtered.length - 1; i >= 0; i--) {
      const entry = filtered[i];
      const li = document.createElement("li");
      li.innerHTML = `<span class="events-overview-category">${EVENT_CATEGORY_LABELS[entry.category] || entry.category}</span>${formatSimTime(entry.year)}: ${entry.message}`;
      li.addEventListener("click", () => {
        el.eventsOverviewList.querySelectorAll("li.selected").forEach((n) => n.classList.remove("selected"));
        li.classList.add("selected");
        el.eventsOverviewDetail.innerHTML = eventDetailHtml(entry);
      });
      el.eventsOverviewList.appendChild(li);
    }
    if (filtered.length === 0) {
      el.eventsOverviewDetail.textContent = "Keine Ereignisse in dieser Auswahl.";
    }
  }

  function setSaveStatus(message) {
    el.saveStatus.textContent = message;
  }

  return { init, on, renderAll, setYear, setSpeedLabel, log, showError, setSaveStatus, getActiveTool, getSelectedVegType, getSelectedFaunaType, showTooltip, hideTooltip, showCellDebugData, showGoalResult };
})();
