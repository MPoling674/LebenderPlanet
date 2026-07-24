// Planet: das Zellgitter (Höhe, Breite, Vegetation), Terraforming-Eingriffe und das
// jährliche Vegetationswachstum inkl. Photosynthese-Rückkopplung auf die Atmosphäre.
// Terrain (Ozean/Land/Eis) wird bewusst NICHT als eigener State gespeichert, sondern
// live aus Höhe/Breite + aktuellem Klima abgeleitet — so bleiben Meeresspiegelanstieg
// und wandernde Eiskappen immer konsistent mit dem aktuellen Atmosphärenzustand.

const Planet = (() => {
  let cells = [];

  function index(x, y) {
    return y * GRID_WIDTH + x;
  }

  function cellAt(x, y) {
    if (x < 0 || x >= GRID_WIDTH || y < 0 || y >= GRID_HEIGHT) return null;
    return cells[index(x, y)];
  }

  // Einfaches Kontinente/Ozean-Muster aus überlagerten Sinuswellen + Rauschen —
  // reicht für ein plausibles Planetenraster, ohne echtes Perlin-Noise zu benötigen.
  function generateTerrain() {
    cells = [];
    const seedX = Math.random() * 1000;
    const seedY = Math.random() * 1000;
    for (let y = 0; y < GRID_HEIGHT; y++) {
      const latitude = Math.abs(y / (GRID_HEIGHT - 1) - 0.5) * 2; // 0 Äquator .. 1 Pol
      for (let x = 0; x < GRID_WIDTH; x++) {
        const nx = x / GRID_WIDTH;
        const ny = y / GRID_HEIGHT;
        let elevation =
          Math.sin((nx + seedX) * Math.PI * 3) * 0.3 +
          Math.cos((ny + seedY) * Math.PI * 2.5) * 0.3 +
          Math.sin((nx * 2 + ny * 1.7 + seedX) * Math.PI * 2) * 0.2 +
          (Math.random() - 0.5) * 0.2;
        elevation = clamp((elevation + 1) / 2, 0, 1);
        cells.push({ elevation, latitude, vegetation: 0, vegetationType: null, salinity: salinityForLatitude(latitude), fauna: 0, faunaType: null, tempAnomaly: 0, techLevel: 0, radiation: 0, oxygenGenerator: false });
      }
    }
  }

  function init() {
    generateTerrain();
    lastTotalVegetation = 0;
    rebuildDiscoveries();
  }

  // Welche Vegetations-/Fauna-Taxa bereits irgendwo existieren bzw. ob schon eine
  // Stadt/Hochtechnologie-Stadt entstanden ist — Grundlage fuer die einmaligen
  // Entstehungs-Hinweise im Ereignis-Log (siehe scanForDiscoveries()). Wird NICHT
  // separat serialisiert, sondern nach init()/restore() immer frisch aus dem
  // aktuellen Zellzustand abgeleitet: so loest das Laden eines Spielstands keine
  // Flut nachtraeglicher "X ist entstanden"-Meldungen fuer laengst vorhandene
  // Arten aus, waehrend echte NEUE Entstehungen waehrend des Spielens weiter
  // erkannt werden.
  let discoveredVeg = new Set();
  let discoveredFauna = new Set();
  let cityFounded = false;
  let highTechReached = false;

  function rebuildDiscoveries() {
    discoveredVeg = new Set();
    discoveredFauna = new Set();
    cityFounded = false;
    highTechReached = false;
    cells.forEach((cell) => {
      if (cell.vegetationType) discoveredVeg.add(cell.vegetationType);
      if (cell.faunaType) discoveredFauna.add(cell.faunaType);
      if (Civilization.hasCity(cell)) cityFounded = true;
      if (Civilization.isHighTech(cell)) highTechReached = true;
    });
  }

  // Scannt nach jedem tick() auf neu hinzugekommene Taxa/Zivilisationsmeilensteine
  // und liefert die zugehoerigen Ereignis-Log-Meldungen — jede Meldung erscheint
  // ueber die Laufzeit eines Spielstands nur EIN einziges Mal.
  function scanForDiscoveries() {
    const events = [];
    cells.forEach((cell) => {
      if (cell.vegetationType && !discoveredVeg.has(cell.vegetationType)) {
        discoveredVeg.add(cell.vegetationType);
        const type = getVegType(cell.vegetationType);
        events.push(type.radiationOnly ? `${type.name} sind durch Strahlung mutiert.` : `${type.name} sind entstanden.`);
      }
      if (cell.faunaType && !discoveredFauna.has(cell.faunaType)) {
        discoveredFauna.add(cell.faunaType);
        const type = getFaunaType(cell.faunaType);
        events.push(type.id === "nanobots" ? `${type.name} sind aus den Trümmern entstanden.` : `${type.name} sind entstanden.`);
      }
    });
    if (!cityFounded && cells.some((c) => Civilization.hasCity(c))) {
      cityFounded = true;
      events.push("Die erste Stadt ist entstanden.");
    }
    if (!highTechReached && cells.some((c) => Civilization.isHighTech(c))) {
      highTechReached = true;
      events.push("Eine Stadt hat Hochtechnologie erreicht.");
    }
    return events;
  }

  // Breitenabhaengiger Ausgangs-Salzgehalt: Maximum in den Subtropen (Verdunstung
  // > Niederschlag), Minimum am Aequator (Niederschlag) und am Pol (Schmelzwasser) —
  // zwei Halbwellen zwischen Aequator/Maximum und Maximum/Pol statt einer linearen Rampe.
  function salinityForLatitude(latitude) {
    let t;
    if (latitude <= SALINITY_SUBTROPICAL_LATITUDE) {
      t = latitude / SALINITY_SUBTROPICAL_LATITUDE;
    } else {
      t = 1 - (latitude - SALINITY_SUBTROPICAL_LATITUDE) / (1 - SALINITY_SUBTROPICAL_LATITUDE);
    }
    return OCEAN_SALINITY_BASE - SALINITY_LATITUDE_AMPLITUDE + SALINITY_LATITUDE_AMPLITUDE * 2 * t;
  }

  // Aktuelles Terrain einer Zelle — abhängig vom (fixen) Höhenwert und dem AKTUELLEN
  // Klima (Meeresspiegel, Eiskappen-Ausdehnung).
  function currentTerrain(cell) {
    // Polare Breiten zuerst prüfen: sowohl vereistes Land (Antarktis) als auch
    // gefrorene Ozeanflächen (arktisches Meereis) erscheinen als Eis, unabhängig
    // von der zugrunde liegenden Höhe. Je höher die globale Eisbedeckung, desto
    // weiter reicht das Eis Richtung Äquator (und umgekehrt bei Erwärmung).
    const iceCoverage = Climate.iceCoverage();
    const effectiveThreshold = clamp(POLAR_LATITUDE_THRESHOLD - (iceCoverage - BASE_ICE_COVERAGE) * 2, 0, 1);
    if (cell.latitude >= effectiveThreshold) return "ice";
    const seaLevelOffset = Climate.seaLevelRise() / MAX_ELEVATION_METERS;
    if (cell.elevation - seaLevelOffset <= SEA_LEVEL_THRESHOLD) return "ocean";
    return "land";
  }

  // Breitenabhängige lokale Temperatur (Äquator wärmer, Pole kälter als der globale
  // Durchschnitt) — grobe, aber realitätsnahe Näherung.
  function localTemperature(cell) {
    const globalTemp = Climate.globalTemperature();
    return globalTemp + EQUATOR_TEMP_BONUS - cell.latitude * (EQUATOR_TEMP_BONUS + POLE_TEMP_RANGE) + cell.tempAnomaly;
  }

  // Komplexeste Vegetationsstufe, deren Toleranzband die gegebene Temperatur
  // noch einschliesst (VEGETATION_TYPES ist aufsteigend nach Komplexitaet
  // sortiert, daher rueckwaerts durchsuchen) — oder null, wenn keine Stufe
  // dieses Klima traegt.
  function bestVegTypeFor(temp) {
    for (let i = VEGETATION_TYPES.length - 1; i >= 0; i--) {
      const type = VEGETATION_TYPES[i];
      if (type.radiationOnly) continue;
      const [min, max] = vegTypeRange(type);
      if (temp > min && temp < max) return type;
    }
    return null;
  }

  function terraform(x, y, action, typeId) {
    const cell = cellAt(x, y);
    if (!cell) return { ok: false, reason: "Ungültige Position." };
    const terrain = currentTerrain(cell);
    if (terrain !== "land") return { ok: false, reason: "Vegetation kann nur auf Landzellen angesiedelt werden." };
    if (action === "plant") {
      if (!Fauna.eukaryotesEstablished()) {
        return { ok: false, reason: "Es müssen sich erst Eukaryoten im Ozean etabliert haben, bevor Pflanzen wachsen können." };
      }
      const type = getVegType(typeId) || VEGETATION_TYPES[0];
      if (type.radiationOnly) return { ok: false, reason: `"${type.name}" entsteht nur zufällig auf verstrahlten Zellen, nicht durch Aussaat.` };
      const [min, max] = vegTypeRange(type);
      const suitability = Climate.vegetationSuitability(localTemperature(cell), min, max);
      if (suitability <= 0) return { ok: false, reason: `Das Klima an dieser Stelle ist für "${type.name}" ungeeignet.` };
      cell.vegetationType = type.id;
      cell.vegetation = clamp(cell.vegetation + 40, 0, 100);
      return { ok: true };
    }
    if (action === "clear") {
      cell.vegetation = 0;
      cell.vegetationType = null;
      return { ok: true };
    }
    return { ok: false, reason: "Unbekannte Aktion." };
  }

  // Regionale Salzgehalt-Regelung: nur auf Ozean-Zellen wirksam (Land/Eis haben
  // keinen sinnvollen Salzgehalt-Wert), klemmt auf den realistischen Wertebereich.
  function adjustSalinity(x, y, delta) {
    const cell = cellAt(x, y);
    if (!cell) return { ok: false, reason: "Ungültige Position." };
    if (currentTerrain(cell) !== "ocean") return { ok: false, reason: "Salzgehalt kann nur auf Ozeanzellen verändert werden." };
    cell.salinity = clamp(cell.salinity + delta, OCEAN_SALINITY_MIN, OCEAN_SALINITY_MAX);
    return { ok: true };
  }

  // Sauerstoffgenerator: technologische Abkuerzung zum Eukaryoten-Gate (siehe
  // OXYGEN_GENERATOR_OUTPUT_PER_YEAR-Kommentar in data.js), auf Land- oder
  // Ozeanzellen baubar, nicht auf Eis.
  function toggleOxygenGenerator(x, y, build) {
    const cell = cellAt(x, y);
    if (!cell) return { ok: false, reason: "Ungültige Position." };
    const terrain = currentTerrain(cell);
    if (terrain === "ice") return { ok: false, reason: "Auf Eis kann kein Sauerstoffgenerator gebaut werden." };
    if (build) {
      if (cell.oxygenGenerator) return { ok: false, reason: "Hier steht bereits ein Sauerstoffgenerator." };
      cell.oxygenGenerator = true;
    } else {
      if (!cell.oxygenGenerator) return { ok: false, reason: "Hier steht kein Sauerstoffgenerator." };
      cell.oxygenGenerator = false;
    }
    return { ok: true };
  }

  function terraformFauna(x, y, action, typeId) {
    const cell = cellAt(x, y);
    if (!cell) return { ok: false, reason: "Ungültige Position." };
    const terrain = currentTerrain(cell);
    if (terrain !== "land" && terrain !== "ocean") return { ok: false, reason: "Tiere können nur auf Land- oder Ozeanzellen angesiedelt werden." };
    if (action === "release") {
      const type = getFaunaType(typeId);
      if (!type) return { ok: false, reason: "Unbekannte Tierart." };
      if (type.habitat !== terrain) {
        return { ok: false, reason: `"${type.name}" lebt nicht ${terrain === "land" ? "an Land" : "im Ozean"}.` };
      }
      const suitability = Fauna.suitability(cell, terrain, localTemperature(cell), type);
      if (suitability <= 0) return { ok: false, reason: `Die Bedingungen an dieser Stelle sind für "${type.name}" ungeeignet.` };
      cell.faunaType = type.id;
      cell.fauna = clamp(cell.fauna + 40, 0, 100);
      return { ok: true };
    }
    if (action === "remove") {
      cell.fauna = 0;
      cell.faunaType = null;
      return { ok: true };
    }
    return { ok: false, reason: "Unbekannte Aktion." };
  }

  // Zerstoert eine Hochtechnologie-Stadt per Atombombe (siehe Civilization.detonate).
  function detonate(x, y) {
    const cell = cellAt(x, y);
    if (!cell) return { ok: false, reason: "Ungültige Position." };
    if (!Civilization.isHighTech(cell)) return { ok: false, reason: "Hier gibt es keine Hochtechnologie-Stadt zum Zerstören." };
    const neighbors = [cellAt(x - 1, y), cellAt(x + 1, y), cellAt(x, y - 1), cellAt(x, y + 1)].filter(Boolean);
    Civilization.detonate(cell, neighbors);
    return { ok: true };
  }

  // Summe der Vegetation aller Landzellen zum Zeitpunkt des letzten tick() —
  // Referenzwert fuer die CO2/O2-Nettobilanz (siehe tick()).
  let lastTotalVegetation = 0;

  // Jährlicher Tick: Vegetation wächst/stirbt je nach lokaler Eignung. Auf die
  // Atmosphäre wirkt dabei bewusst nur die AENDERUNG der Gesamtvegetation seit
  // dem letzten Jahr, nicht ihr Bestand — genau wie ein ausgewachsener, stabiler
  // Wald in der Realität ungefähr CO2-neutral ist (Photosynthese ≈ Atmung/
  // Verrottung im Gleichgewicht) und nur waehrend des Wachstums netto CO2 bindet.
  // Waechst die Vegetationsdecke, wird CO2 gebunden/O2 freigesetzt; stirbt sie ab
  // (Klimawandel, Rodung, Ueberflutung durch Meeresspiegelanstieg), wird der
  // gespeicherte Kohlenstoff wieder freigesetzt. Eine stabile Vegetationsdecke
  // haelt sich damit im Gleichgewicht, statt die Atmosphaere jedes Jahr erneut
  // um ihren vollen Bestand zu veraendern (das fuehrte vorher zu einem CO2-Wert,
  // der nie ein Gleichgewicht erreichte, sondern unbegrenzt weiter sank).
  // Vegetation je Zelle einen Jahresschritt weiterentwickeln: natuerliche
  // Besiedlung kahler Zellen mit der best-angepassten Stufe, Wachstum/Schwund der
  // bestehenden Stufe nach ihrer EIGENEN Eignung, und Sukzession zu einer
  // komplexeren Stufe erst, wenn die aktuelle ausgereift ist (>=90%). Wird die
  // aktuelle Stufe vom Klima nicht mehr getragen, schrumpft sie zurueck (nicht
  // sofort durch die neue best-passende Stufe ersetzt) — realistischer Uebergang
  // statt eines abrupten Arten-Wechsels.
  function tickCellVegetation(cell, temp) {
    const best = Fauna.eukaryotesEstablished() ? bestVegTypeFor(temp) : null;
    const currentType = cell.vegetationType ? getVegType(cell.vegetationType) : null;

    if (!currentType) {
      // Nicht sofort besiedeln, sobald geeignet — sonst "blueht" die gesamte
      // Landflaeche im selben Jahr gleichzeitig auf (siehe NATURAL_COLONIZATION_
      // CHANCE-Kommentar in data.js).
      if (!best || Math.random() >= NATURAL_COLONIZATION_CHANCE) {
        cell.vegetation = 0;
        return;
      }
      const [min, max] = vegTypeRange(best);
      const suitability = Climate.vegetationSuitability(temp, min, max);
      cell.vegetationType = best.id;
      cell.vegetation = clamp(VEG_GROWTH_RATE * suitability * 100, 0, 100);
      return;
    }

    if (best && best.id === currentType.id) {
      const [min, max] = vegTypeRange(currentType);
      const suitability = Climate.vegetationSuitability(temp, min, max);
      cell.vegetation = clamp(cell.vegetation + VEG_GROWTH_RATE * suitability * (100 - cell.vegetation), 0, 100);
      return;
    }

    if (best && best.complexity > currentType.complexity && cell.vegetation >= 90) {
      // Ausgereifte einfachere Vegetation macht komplexerer Platz, sobald das
      // Klima es zulaesst (z.B. Buesche -> Wald) — startet mit reduziertem
      // Bestand, muss selbst erst nachwachsen.
      cell.vegetationType = best.id;
      cell.vegetation = 50;
      return;
    }

    // Aktuelle Stufe wird vom Klima nicht mehr (oder nicht mehr voll) getragen —
    // mit ihrer EIGENEN Eignung weiter entwickeln, nicht mit der von "best".
    const [min, max] = vegTypeRange(currentType);
    const suitability = Climate.vegetationSuitability(temp, min, max);
    if (suitability > 0) {
      cell.vegetation = clamp(cell.vegetation + VEG_GROWTH_RATE * suitability * (100 - cell.vegetation), 0, 100);
    } else {
      cell.vegetation = clamp(cell.vegetation - VEG_DECAY_RATE * cell.vegetation, 0, 100);
      if (cell.vegetation <= 0) cell.vegetationType = null;
    }
  }

  function tick() {
    // Stroemungen zuerst: verteilen Waerme/Salzgehalt um, bevor Vegetation/Fauna
    // im selben Jahr auf die (nun aktuelle) lokale Temperatur reagieren.
    Currents.tick(cellAt, (cell) => currentTerrain(cell) === "ocean");
    // Praerequisiten-Gate einmal pro Jahr neu berechnen (siehe FAUNA_TYPES-Kommentar
    // in data.js) — bevor die Zellschleife suitability()/tickCellVegetation() nutzt.
    Fauna.computeGate(cellAt, currentTerrain);

    let totalVegetation = 0;
    let landCells = 0;
    let oceanCells = 0;
    let prokaryoteBiomass = 0;
    let respiringBiomass = 0;
    let oxygenGeneratorCount = 0;
    cells.forEach((cell) => {
      const terrain = currentTerrain(cell);
      const temp = localTemperature(cell);
      if (terrain === "land") {
        landCells += 1;
        // Verstrahlte Zellen mutieren mit kleiner Jahreswahrscheinlichkeit zu
        // Mutantenpflanzen, statt normal weiterzuwachsen (siehe VEGETATION_TYPES-
        // Kommentar zu "mutant" in data.js).
        if (cell.radiation > 0 && Math.random() < MUTANT_PLANT_SPAWN_CHANCE) {
          cell.vegetationType = "mutant";
          cell.vegetation = 40;
        } else {
          tickCellVegetation(cell, temp);
        }
        totalVegetation += cell.vegetation;
      } else {
        cell.vegetation = 0;
        cell.vegetationType = null;
      }
      // Fauna lebt auf Land UND im Ozean, aber nicht auf Eis (Habitat-Pruefung
      // selbst uebernimmt Fauna.tickCell/-suitability anhand von terrain).
      if (terrain === "ice") {
        cell.fauna = 0;
        cell.faunaType = null;
      } else {
        Fauna.tickCell(cell, terrain, temp);
      }
      if (terrain === "ocean") {
        oceanCells += 1;
        if (cell.faunaType === "prokaryotes") prokaryoteBiomass += cell.fauna;
      }
      // Atmung: jede Fauna AUSSER Prokaryoten (siehe FAUNA_MAX_O2_CONSUMPTION_
      // PER_YEAR-Kommentar in data.js) verbraucht O2, unabhaengig vom Habitat.
      if (cell.faunaType && cell.faunaType !== "prokaryotes") respiringBiomass += cell.fauna;
      if (cell.oxygenGenerator) oxygenGeneratorCount += 1;
    });

    // Prokaryoten reichern die Atmosphaere langsam mit O2 an (siehe
    // PROKARYOTE_O2_RELEASE_PER_YEAR-Kommentar in data.js), Sauerstoffgeneratoren
    // beschleunigen das unabhaengig von Biologie — beides macht den Weg zum
    // Eukaryoten-Gate (Fauna.eukaryotesEstablished) am O2-HUD-Wert sichtbar.
    const prokaryoteBiomassFraction = oceanCells > 0 ? prokaryoteBiomass / (oceanCells * 100) : 0;
    Atmosphere.adjust("o2", prokaryoteBiomassFraction * PROKARYOTE_O2_RELEASE_PER_YEAR);
    Atmosphere.adjust("o2", oxygenGeneratorCount * OXYGEN_GENERATOR_OUTPUT_PER_YEAR);

    // Atmung der uebrigen Fauna wirkt entgegen: verbraucht O2, setzt CO2 frei —
    // schliesst den Kreislauf, damit O2 nicht unbegrenzt bis zum Anschlag steigt.
    const totalFaunaCells = landCells + oceanCells;
    const respiringBiomassFraction = totalFaunaCells > 0 ? respiringBiomass / (totalFaunaCells * 100) : 0;
    Atmosphere.adjust("o2", -respiringBiomassFraction * FAUNA_MAX_O2_CONSUMPTION_PER_YEAR);
    Atmosphere.adjust("co2", respiringBiomassFraction * FAUNA_MAX_CO2_RELEASE_PPM_PER_YEAR);

    // Geologische Oxidation/Verwitterung wirkt unabhaengig von Biologie, auch
    // bevor irgendeine Fauna zum Atmen existiert (siehe GEOLOGICAL_O2_EQUILIBRIUM-
    // Kommentar in data.js).
    Atmosphere.adjust("o2", -(Atmosphere.get("o2") - GEOLOGICAL_O2_EQUILIBRIUM) * GEOLOGICAL_O2_RELAXATION_RATE);

    // Cross-Habitat-Uebergaenge (z.B. Fische -> Amphibien) NACH der Haupt-
    // Sukzession, damit sie den diesjaehrigen Reifegrad der Zellen sehen.
    Fauna.tickSpawns(cellAt, currentTerrain, localTemperature);
    // Tech-Level ebenfalls NACH der Sukzession, damit ein diesjaehriger
    // Artwechsel (z.B. Sukzession zu einer nicht-zivilisationsfaehigen Stufe)
    // den Zivilisationsfortschritt schon in diesem Jahr beeinflusst.
    Civilization.tick(cellAt);

    const maxPossible = landCells * 100;
    const vegetationFraction = maxPossible > 0 ? totalVegetation / maxPossible : 0;
    const netFraction = maxPossible > 0 ? (totalVegetation - lastTotalVegetation) / maxPossible : 0;
    const co2Absorbed = netFraction * VEG_MAX_CO2_UPTAKE_PPM_PER_YEAR;
    const o2Released = netFraction * VEG_MAX_O2_RELEASE_PERCENT_PER_YEAR;
    Atmosphere.adjust("co2", -co2Absorbed);
    Atmosphere.adjust("o2", o2Released);
    lastTotalVegetation = totalVegetation;
    return { vegetationFraction, co2Absorbed, o2Released, events: scanForDiscoveries() };
  }

  function sumVegetation() {
    let sum = 0;
    cells.forEach((cell) => {
      if (currentTerrain(cell) === "land") sum += cell.vegetation;
    });
    return sum;
  }

  function stats() {
    let ocean = 0;
    let land = 0;
    let ice = 0;
    let vegSum = 0;
    let salinitySum = 0;
    let faunaSum = 0;
    let cityCount = 0;
    const typeCounts = {};
    VEGETATION_TYPES.forEach((t) => {
      typeCounts[t.id] = 0;
    });
    const faunaTypeCounts = {};
    FAUNA_TYPES.forEach((t) => {
      faunaTypeCounts[t.id] = 0;
    });
    cells.forEach((cell) => {
      const t = currentTerrain(cell);
      if (t === "ocean") {
        ocean += 1;
        salinitySum += cell.salinity;
      } else if (t === "ice") ice += 1;
      else {
        land += 1;
        vegSum += cell.vegetation;
        if (cell.vegetationType) typeCounts[cell.vegetationType] += 1;
      }
      if (t !== "ice") {
        faunaSum += cell.fauna;
        if (cell.faunaType) faunaTypeCounts[cell.faunaType] += 1;
        if (Civilization.hasCity(cell)) cityCount += 1;
      }
    });
    const total = cells.length;
    // Anteil jeder Vegetationsstufe an der LANDFLAECHE (Zellanzahl, nicht
    // Dichte-gewichtet) — beantwortet "wie viel Prozent des Landes ist Wald/
    // Gräser/...", ergaenzend zur durchschnittlichen Gesamtdichte avgVegetation.
    const vegetationByType = {};
    VEGETATION_TYPES.forEach((t) => {
      vegetationByType[t.id] = land > 0 ? (typeCounts[t.id] / land) * 100 : 0;
    });
    // Fauna-Anteil je Art bezogen auf ihr eigenes Habitat-Zellenkontingent
    // (Land- bzw. Ozeanzellen), gleiches Prinzip wie vegetationByType.
    const faunaByType = {};
    FAUNA_TYPES.forEach((t) => {
      const pool = t.habitat === "land" ? land : ocean;
      faunaByType[t.id] = pool > 0 ? (faunaTypeCounts[t.id] / pool) * 100 : 0;
    });
    const habitatCells = land + ocean;
    return {
      oceanPercent: (ocean / total) * 100,
      landPercent: (land / total) * 100,
      icePercent: (ice / total) * 100,
      avgVegetation: land > 0 ? vegSum / land : 0,
      vegetationByType,
      avgSalinity: ocean > 0 ? salinitySum / ocean : 0,
      avgFauna: habitatCells > 0 ? faunaSum / habitatCells : 0,
      faunaByType,
      cityCount,
    };
  }

  // Leichtgewichtiger Einzelzellen-Lookup fuer den Maus-Hover-Tooltip — baut
  // (anders als allCells()) NICHT das gesamte 1800-Zellen-Array bei jedem
  // Mousemove-Event neu auf.
  function cellInfoAt(x, y) {
    const cell = cellAt(x, y);
    if (!cell) return null;
    return {
      x,
      y,
      terrain: currentTerrain(cell),
      vegetation: cell.vegetation,
      vegetationType: cell.vegetationType,
      temperature: localTemperature(cell),
      salinity: cell.salinity,
      fauna: cell.fauna,
      faunaType: cell.faunaType,
      currentDirection: Currents.currentDirectionFor(cell.latitude),
      techLevel: cell.techLevel,
      hasCity: Civilization.hasCity(cell),
      isHighTech: Civilization.isHighTech(cell),
      radiation: cell.radiation,
      oxygenGenerator: cell.oxygenGenerator,
    };
  }

  function allCells() {
    return cells.map((cell, i) => ({
      x: i % GRID_WIDTH,
      y: Math.floor(i / GRID_WIDTH),
      terrain: currentTerrain(cell),
      vegetation: cell.vegetation,
      vegetationType: cell.vegetationType,
      elevation: cell.elevation,
      salinity: cell.salinity,
      fauna: cell.fauna,
      faunaType: cell.faunaType,
      techLevel: cell.techLevel,
      radiation: cell.radiation,
      oxygenGenerator: cell.oxygenGenerator,
    }));
  }

  function serialize() {
    return {
      cells: cells.map((c) => ({
        elevation: c.elevation,
        latitude: c.latitude,
        vegetation: c.vegetation,
        vegetationType: c.vegetationType,
        salinity: c.salinity,
        fauna: c.fauna,
        faunaType: c.faunaType,
        tempAnomaly: c.tempAnomaly,
        techLevel: c.techLevel,
        radiation: c.radiation,
        oxygenGenerator: c.oxygenGenerator,
      })),
      lastTotalVegetation,
    };
  }

  function restore(saved) {
    if (saved && Array.isArray(saved.cells) && saved.cells.length === GRID_WIDTH * GRID_HEIGHT) {
      cells = saved.cells.map((c) => ({
        elevation: c.elevation,
        latitude: c.latitude,
        vegetation: c.vegetation,
        // Aeltere Spielstaende kennen vegetationType noch nicht — vorhandene
        // Vegetation dann als "Gräser" annehmen, statt sie stillschweigend zu loeschen.
        vegetationType: c.vegetationType !== undefined ? c.vegetationType : (c.vegetation > 0 ? "grass" : null),
        // Aeltere Spielstaende kennen salinity noch nicht — dann den breitenabhaengigen
        // Ausgangswert annehmen statt eines global einheitlichen Werts.
        salinity: typeof c.salinity === "number" ? c.salinity : salinityForLatitude(c.latitude),
        // Aeltere Spielstaende kennen Fauna noch nicht, oder referenzieren ein
        // inzwischen aus FAUNA_TYPES entferntes/umbenanntes Taxon (z.B. nach einer
        // Erweiterung der Taxonomie-Tabelle) — in beiden Faellen als unbesiedelt
        // annehmen, statt mit einer ungueltigen ID weiterzuarbeiten.
        fauna: typeof c.fauna === "number" && getFaunaType(c.faunaType) ? c.fauna : 0,
        faunaType: getFaunaType(c.faunaType) ? c.faunaType : null,
        // Aeltere Spielstaende kennen Stroemungen noch nicht — dann keine Anomalie annehmen.
        tempAnomaly: typeof c.tempAnomaly === "number" ? c.tempAnomaly : 0,
        // Aeltere Spielstaende kennen Zivilisation noch nicht — dann bei 0 starten.
        techLevel: typeof c.techLevel === "number" ? c.techLevel : 0,
        // Aeltere Spielstaende kennen Strahlung noch nicht — dann unverstrahlt annehmen.
        radiation: typeof c.radiation === "number" ? c.radiation : 0,
        // Aeltere Spielstaende kennen Sauerstoffgeneratoren noch nicht.
        oxygenGenerator: c.oxygenGenerator === true,
      }));
      // Aeltere Spielstaende kennen lastTotalVegetation noch nicht — dann den
      // aktuellen Bestand als Basislinie nehmen, statt eine falsche Sprung-
      // Aenderung im naechsten tick() zu erzeugen.
      lastTotalVegetation = typeof saved.lastTotalVegetation === "number" ? saved.lastTotalVegetation : sumVegetation();
    } else {
      generateTerrain();
      lastTotalVegetation = 0;
    }
    rebuildDiscoveries();
  }

  return { init, terraform, adjustSalinity, toggleOxygenGenerator, terraformFauna, detonate, tick, stats, allCells, cellInfoAt, currentTerrain, localTemperature, serialize, restore };
})();
