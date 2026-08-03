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
        cells.push({ elevation, latitude, vegetation: 0, vegetationType: null, salinity: salinityForLatitude(latitude), fauna: 0, faunaType: null, tempAnomaly: 0, techLevel: 0, radiation: 0, oxygenGenerator: false, co2Scrubber: false, methaneScrubber: false, emitter: false, coastDistance: 0 });
      }
    }
    computeCoastDistances();
  }

  // Fuellt cell.coastDistance (Gitterzellen bis zur naechsten Basis-Ozeanzelle,
  // per Breitensuche von allen Ozeanzellen gleichzeitig aus) — einmalig aus der
  // fixen Hoehenkarte abgeleitet, siehe PRECIPITATION_*-Kommentar in data.js.
  function computeCoastDistances() {
    const queue = [];
    cells.forEach((cell, i) => {
      if (cell.elevation <= SEA_LEVEL_THRESHOLD) {
        cell.coastDistance = 0;
        queue.push(i);
      } else {
        cell.coastDistance = -1; // noch unbesucht
      }
    });
    let head = 0;
    while (head < queue.length) {
      const i = queue[head++];
      const x = i % GRID_WIDTH;
      const y = Math.floor(i / GRID_WIDTH);
      const neighbors = [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]];
      for (const [nx, ny] of neighbors) {
        if (nx < 0 || nx >= GRID_WIDTH || ny < 0 || ny >= GRID_HEIGHT) continue;
        const ni = index(nx, ny);
        if (cells[ni].coastDistance === -1) {
          cells[ni].coastDistance = cells[i].coastDistance + 1;
          queue.push(ni);
        }
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
  let oceansFormed = false;

  function rebuildDiscoveries() {
    discoveredVeg = new Set();
    discoveredFauna = new Set();
    cityFounded = false;
    highTechReached = false;
    oceansFormed = cells.some((cell) => currentTerrain(cell) === "ocean");
    cells.forEach((cell) => {
      if (cell.vegetationType) discoveredVeg.add(cell.vegetationType);
      if (cell.faunaType) discoveredFauna.add(cell.faunaType);
      if (Civilization.hasCity(cell)) cityFounded = true;
      if (Civilization.isHighTech(cell)) highTechReached = true;
    });
  }

  // Scannt nach jedem tick() auf neu hinzugekommene Taxa/Zivilisationsmeilensteine
  // und liefert die zugehoerigen Ereignis-Log-Meldungen — jede Meldung erscheint
  // ueber die Laufzeit eines Spielstands nur EIN einziges Mal. Alle hier
  // erzeugten Events sind mit milestone:true markiert (siehe UI.log()/
  // showEventPopup() in ui.js) — das sind genau die "Entwicklungsstufen", die
  // zusaetzlich zum Ereignis-Log als Popup erscheinen sollen, da sie (anders
  // als z.B. Temperaturschwellen) einmalig und unumkehrbar sind statt hin und
  // her zu oszillieren.
  function scanForDiscoveries() {
    const events = [];
    if (!oceansFormed && cells.some((c) => currentTerrain(c) === "ocean")) {
      oceansFormed = true;
      events.push({ category: "climate", message: "🌊 Die Oberflächentemperatur ist unter den Siedepunkt gefallen — die ersten Ozeane kondensieren aus der Dampfatmosphäre.", milestone: true });
    }
    cells.forEach((cell) => {
      if (cell.vegetationType && !discoveredVeg.has(cell.vegetationType)) {
        discoveredVeg.add(cell.vegetationType);
        const type = getVegType(cell.vegetationType);
        const message = type.radiationOnly ? `${type.name} sind durch Strahlung mutiert.` : `${type.name} sind entstanden.`;
        events.push({ category: "evolution", message, kind: "vegetation", typeId: type.id, milestone: true });
      }
      if (cell.faunaType && !discoveredFauna.has(cell.faunaType)) {
        discoveredFauna.add(cell.faunaType);
        const type = getFaunaType(cell.faunaType);
        const message = type.id === "nanobots" ? `${type.name} sind aus den Trümmern entstanden.` : `${type.name} sind entstanden.`;
        events.push({ category: "evolution", message, kind: "fauna", typeId: type.id, milestone: true });
      }
    });
    if (!cityFounded && cells.some((c) => Civilization.hasCity(c))) {
      cityFounded = true;
      events.push({ category: "civilization", message: "Die erste Stadt ist entstanden.", milestone: true });
    }
    if (!highTechReached && cells.some((c) => Civilization.isHighTech(c))) {
      highTechReached = true;
      events.push({ category: "civilization", message: "Eine Stadt hat Hochtechnologie erreicht.", milestone: true });
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
    // ">" statt ">=": bei extremer Hitze (z.B. waehrend der Planetenentstehung,
    // siehe PRIMORDIAL_HEAT_*) klemmt effectiveThreshold auf genau 1 — und die
    // Zeilen y=0/y=GRID_HEIGHT-1 haben eine Breite von exakt 1.0 (siehe
    // generateTerrain()). Mit ">=" waeren diese Pol-Zeilen selbst auf einem
    // gluehend heissen Planeten faelschlich "Eis"; ">" bedeutet "Schwelle bei
    // exakt 1 -> ueberhaupt kein Eis", was fuer diesen Grenzfall korrekt ist.
    if (cell.latitude > effectiveThreshold) return "ice";
    // Waehrend der Planetenentstehungsphase (siehe PRIMORDIAL_HEAT_*-Kommentar in
    // data.js) ist noch kein Wasser kondensiert — waterCoverage() ist dann 0 und
    // praktisch die gesamte Oberflaeche zaehlt als "Land" (heisses Gestein ohne
    // Ozean), bis genug abgekuehlt und ausgegast ist.
    const waterThreshold = Climate.waterCoverage() * SEA_LEVEL_THRESHOLD;
    const seaLevelOffset = Climate.seaLevelRise() / MAX_ELEVATION_METERS;
    if (cell.elevation - seaLevelOffset <= waterThreshold) return "ocean";
    return "land";
  }

  // Breitenabhängige lokale Temperatur (Äquator wärmer, Pole kälter als der globale
  // Durchschnitt) — grobe, aber realitätsnahe Näherung.
  function localTemperature(cell) {
    const globalTemp = Climate.globalTemperature();
    // Skaliert mit der spielergesteuerten Achsneigung (siehe tiltGradientFactor()-
    // Kommentar in climate.js/data.js) — bei TILT_REFERENCE_DEGREES exakt der
    // bisherige Gradient.
    const factor = Climate.tiltGradientFactor();
    return globalTemp + EQUATOR_TEMP_BONUS * factor - cell.latitude * ((EQUATOR_TEMP_BONUS + POLE_TEMP_RANGE) * factor) + cell.tempAnomaly;
  }

  // Lokaler Niederschlag (0-100) — siehe PRECIPITATION_*-Kommentar in data.js.
  function localPrecipitation(cell, terrain, temp) {
    let value;
    if (terrain === "ocean") {
      value = PRECIPITATION_OCEAN_BASE;
    } else if (terrain === "ice") {
      value = PRECIPITATION_ICE_BASE;
    } else {
      const distance = cell.coastDistance >= 0 ? cell.coastDistance : GRID_WIDTH + GRID_HEIGHT;
      value = PRECIPITATION_OCEAN_BASE - distance * PRECIPITATION_COAST_FALLOFF_PER_CELL;
      value += (cell.vegetation / 100) * PRECIPITATION_VEGETATION_BONUS_MAX;
    }
    if (temp < PRECIPITATION_COLD_THRESHOLD) {
      value -= (PRECIPITATION_COLD_THRESHOLD - temp) * PRECIPITATION_COLD_PENALTY_PER_DEGREE;
    }
    return clamp(value, PRECIPITATION_MIN, 100);
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

  // CO2-Scrubber: senkt CO2 kontinuierlich (Kohlenstoffabscheidung). Gleiche
  // Platzierungsregeln wie der Sauerstoffgenerator.
  function toggleCO2Scrubber(x, y, build) {
    const cell = cellAt(x, y);
    if (!cell) return { ok: false, reason: "Ungültige Position." };
    const terrain = currentTerrain(cell);
    if (terrain === "ice") return { ok: false, reason: "Auf Eis kann kein CO2-Scrubber gebaut werden." };
    if (build) {
      if (cell.co2Scrubber) return { ok: false, reason: "Hier steht bereits ein CO2-Scrubber." };
      cell.co2Scrubber = true;
    } else {
      if (!cell.co2Scrubber) return { ok: false, reason: "Hier steht kein CO2-Scrubber." };
      cell.co2Scrubber = false;
    }
    return { ok: true };
  }

  // Methanfilter: senkt CH4 kontinuierlich (Gegenstueck zum CO2-Scrubber, siehe
  // METHANE_SCRUBBER_OUTPUT_PER_YEAR-Kommentar in data.js). Gleiche
  // Platzierungsregeln wie der Sauerstoffgenerator.
  function toggleMethaneScrubber(x, y, build) {
    const cell = cellAt(x, y);
    if (!cell) return { ok: false, reason: "Ungültige Position." };
    const terrain = currentTerrain(cell);
    if (terrain === "ice") return { ok: false, reason: "Auf Eis kann kein Methanfilter gebaut werden." };
    if (build) {
      if (cell.methaneScrubber) return { ok: false, reason: "Hier steht bereits ein Methanfilter." };
      cell.methaneScrubber = true;
    } else {
      if (!cell.methaneScrubber) return { ok: false, reason: "Hier steht kein Methanfilter." };
      cell.methaneScrubber = false;
    }
    return { ok: true };
  }

  // Emitter (Industrieanlage/Vulkanschlot): erhoeht CO2 UND CH4 kontinuierlich —
  // Gegenstueck zum CO2-Scrubber, um das Klima gezielt aufzuheizen. Gleiche
  // Platzierungsregeln wie der Sauerstoffgenerator.
  function toggleEmitter(x, y, build) {
    const cell = cellAt(x, y);
    if (!cell) return { ok: false, reason: "Ungültige Position." };
    const terrain = currentTerrain(cell);
    if (terrain === "ice") return { ok: false, reason: "Auf Eis kann kein Emitter gebaut werden." };
    if (build) {
      if (cell.emitter) return { ok: false, reason: "Hier steht bereits ein Emitter." };
      cell.emitter = true;
    } else {
      if (!cell.emitter) return { ok: false, reason: "Hier steht kein Emitter." };
      cell.emitter = false;
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

  // "Heutige Erde"-Startpreset (siehe main.js handleStartRealEarth()): seedet
  // direkt einen ausgereiften, besiedelten Planetenzustand, statt ihn ueber
  // Jahrtausende zu simulieren (waere langsam UND wegen der Zufallselemente in
  // tickCell()/tickCellVegetation() nicht zuverlaessig "erdaehnlich" im
  // Ergebnis). Nutzt dieselbe Eignungslogik wie normales Terraforming
  // (bestVegTypeFor/Fauna.suitability) — reine Startbelegung, keine neue Regel.
  // Aufrufer muss VORHER Fauna.forceLifeEstablished() aufrufen, sonst liefert
  // Fauna.suitability() fuer alles ausser Prokaryoten 0 (siehe dortiger
  // cachedLifeEstablished-Guard).
  const REAL_EARTH_LAND_FAUNA_PRIORITY = ["placentals", "reptiles", "arthropods"];
  const REAL_EARTH_CITY_CHANCE = 0.18; // Anteil zivilisationsfaehiger Landzellen mit einer Stadt

  function seedRealEarth() {
    cells.forEach((cell) => {
      const terrain = currentTerrain(cell);
      const temp = localTemperature(cell);
      if (terrain === "ocean") {
        const fish = getFaunaType("fish");
        if (Fauna.suitability(cell, terrain, temp, fish) > 0) {
          cell.faunaType = "fish";
          cell.fauna = 80 + Math.random() * 20;
        } else {
          cell.faunaType = "prokaryotes";
          cell.fauna = 100;
        }
        return;
      }
      if (terrain !== "land") return; // Eis bleibt unbesiedelt

      const vegType = bestVegTypeFor(temp);
      if (vegType) {
        cell.vegetationType = vegType.id;
        cell.vegetation = 70 + Math.random() * 20;
      }

      for (const typeId of REAL_EARTH_LAND_FAUNA_PRIORITY) {
        const type = getFaunaType(typeId);
        if (Fauna.suitability(cell, terrain, temp, type) > 0) {
          cell.faunaType = typeId;
          cell.fauna = 70 + Math.random() * 25;
          if (type.civilizationCapable && Math.random() < REAL_EARTH_CITY_CHANCE) {
            cell.techLevel = 70 + Math.random() * 25;
          }
          break;
        }
      }
    });
    rebuildDiscoveries();
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

  // Loest einen Vulkanausbruch gezielt an (x,y) aus — dieselbe Wirkung wie das
  // Zufallsereignis in Events.tick(), nur spielergesteuert statt gewuerfelt.
  function triggerVolcano(x, y) {
    const cell = cellAt(x, y);
    if (!cell) return { ok: false, reason: "Ungültige Position." };
    if (currentTerrain(cell) !== "land") return { ok: false, reason: "Ein Vulkan kann nur auf einer Landzelle ausbrechen." };
    Events.applyVolcano(x, y, cellAt);
    return { ok: true };
  }

  // Loest ein Erdbeben gezielt an (x,y) aus (siehe triggerVolcano()-Kommentar).
  function triggerEarthquake(x, y) {
    const cell = cellAt(x, y);
    if (!cell) return { ok: false, reason: "Ungültige Position." };
    if (currentTerrain(cell) !== "land") return { ok: false, reason: "Ein Erdbeben kann nur auf einer Landzelle ausgelöst werden." };
    Events.applyEarthquake(x, y, cellAt);
    return { ok: true };
  }

  // Tsunami: nur auf Kuestenlandzellen (coastDistance===1, direkt angrenzend an
  // die urspruengliche Ozeanflaeche, siehe computeCoastDistances()) — anders als
  // die uebrigen currentTerrain()-Pruefungen bewusst zusaetzlich ueber die FIXE
  // Hoehenkarte statt nur das aktuelle Terrain, weil ein Tsunami eine Kuestennaehe
  // voraussetzt, die sich nicht durch kurzfristigen Meeresspiegelanstieg aendert.
  function triggerTsunami(x, y) {
    const cell = cellAt(x, y);
    if (!cell) return { ok: false, reason: "Ungültige Position." };
    if (currentTerrain(cell) !== "land") return { ok: false, reason: "Ein Tsunami trifft nur Landzellen an der Küste." };
    if (cell.coastDistance !== 1) return { ok: false, reason: "Ein Tsunami kann nur eine Zelle direkt an der Küste treffen." };
    Events.applyTsunami(x, y, cellAt);
    return { ok: true };
  }

  // Seuche: braucht ein Ziel mit etwas, das sie befallen kann (Fauna oder eine
  // Stadt) — auf Eis gibt es ohnehin nie Fauna (siehe Planet.tick()), daher reicht
  // die Fauna/Stadt-Pruefung allein, ohne die Eis-Sonderregel der uebrigen Werkzeuge.
  function triggerPlague(x, y) {
    const cell = cellAt(x, y);
    if (!cell) return { ok: false, reason: "Ungültige Position." };
    if (cell.fauna <= 0 && !Civilization.hasCity(cell)) {
      return { ok: false, reason: "Hier gibt es keine Fauna oder Bevölkerung, die eine Seuche befallen könnte." };
    }
    Events.applyPlague(x, y, cellAt);
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
    let co2ScrubberCount = 0;
    let methaneScrubberCount = 0;
    let emitterCount = 0;
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
      // Fauna lebt auf Land UND im Ozean, aber nicht auf Eis. Wechselt das TERRAIN
      // selbst (z.B. Meeresspiegelanstieg ueberflutet eine Landzelle, oder Land
      // faellt trocken), muss die dort lebende Fauna sofort verschwinden — genau
      // wie Vegetation oben bei jedem Nicht-Land-Terrain sofort auf 0 gesetzt wird.
      // Ohne diese Pruefung blieb z.B. eine Landart wie Arthropoden auf einer nun
      // ozeanischen Zelle fauna.js's suitability()=0 nur langsam ueber
      // FAUNA_DECAY_RATE verfallend erhalten — bis dahin zaehlte Planet.stats()
      // diese Zelle sowohl als "jetzt Ozean" (Nenner) als auch mit ihrem alten
      // Landarten-Typ (Zaehler), wodurch der Fauna-Arten-Anteil im HUD ueber 100%
      // steigen konnte (gemeldeter Fehler). "habitat: null" (Nanotech-Roboter) ist
      // bewusst klimaunabhaengig und bleibt von dieser Pruefung ausgenommen.
      const currentFaunaType = cell.faunaType ? getFaunaType(cell.faunaType) : null;
      if (currentFaunaType && currentFaunaType.habitat !== null && currentFaunaType.habitat !== terrain) {
        cell.fauna = 0;
        cell.faunaType = null;
      }
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
      if (cell.co2Scrubber) co2ScrubberCount += 1;
      if (cell.methaneScrubber) methaneScrubberCount += 1;
      if (cell.emitter) emitterCount += 1;
    });

    // CO2-Scrubber/Methanfilter/Emitter: gebaute Strukturen wirken kontinuierlich,
    // im Gegensatz zum einmaligen Sprung des Gas-Reglers — verschieben zusammen mit
    // der jeweiligen geologischen/chemischen Senke den Gleichgewichtspunkt um
    // Strukturanzahl * MAX_SHIFT (siehe *_OUTPUT_PER_YEAR-Kommentar in data.js),
    // statt (wie zuvor) unbegrenzt bis zum Anschlag zu laufen.
    Atmosphere.adjust("co2", -co2ScrubberCount * CO2_SCRUBBER_OUTPUT_PER_YEAR);
    Atmosphere.adjust("ch4", -methaneScrubberCount * METHANE_SCRUBBER_OUTPUT_PER_YEAR);
    Atmosphere.adjust("co2", emitterCount * EMITTER_CO2_OUTPUT_PER_YEAR);
    Atmosphere.adjust("ch4", emitterCount * EMITTER_CH4_OUTPUT_PER_YEAR);

    // Alle O2-Fluesse dieses Jahres (Biologie UND Geologie) werden zu EINEM Delta
    // aufsummiert und als EINZIGER Atmosphere.adjust()-Aufruf angewandt, statt
    // nacheinander vier einzelne (die sich bei O2 nahe des Gleichgewichts fast
    // aufheben, z.B. +0.02 gefolgt von -0,019999...). Mehrere sequentielle
    // Adjust()-Aufrufe runden JEDER FUER SICH auf den naechsten double, wodurch das
    // sehr kleine Netto-Delta (Groessenordnung 1e-14 nahe 23%) durch Rundung in
    // der Addition/Subtraktion komplett verschluckt wurde — die Simulation blieb
    // dadurch bei exakt 22,999999999998...% haengen, hauchduenn UNTER
    // EUKARYOTE_O2_THRESHOLD, und die >=-Pruefung schlug fuer immer fehl (Teil des
    // gemeldeten "O2 bleibt bei jedem Neustart haengen"-Fehlers). Mit einem
    // einzigen aufsummierten Delta rundet die Fliesskomma-Arithmetik nur noch
    // einmal, wodurch der rechnerische Fixpunkt (GEOLOGICAL_O2_EQUILIBRIUM plus
    // Generatorenanzahl * OXYGEN_GENERATOR_MAX_SHIFT, siehe dessen Kommentar in
    // data.js) tatsaechlich erreicht wird, statt hauchduenn darunter stecken zu bleiben.
    const o2AtYearStart = Atmosphere.get("o2");

    // Prokaryoten reichern die Atmosphaere langsam mit O2 an (siehe
    // PROKARYOTE_O2_RELEASE_PER_YEAR-Kommentar in data.js), Sauerstoffgeneratoren
    // beschleunigen das unabhaengig von Biologie — beides macht den Weg zum
    // Eukaryoten-Gate (Fauna.eukaryotesEstablished) am O2-HUD-Wert sichtbar.
    const prokaryoteBiomassFraction = oceanCells > 0 ? prokaryoteBiomass / (oceanCells * 100) : 0;
    let o2Delta = prokaryoteBiomassFraction * PROKARYOTE_O2_RELEASE_PER_YEAR;
    o2Delta += oxygenGeneratorCount * OXYGEN_GENERATOR_OUTPUT_PER_YEAR;

    // Atmung der uebrigen Fauna wirkt entgegen: verbraucht O2, setzt CO2 frei —
    // schliesst den Kreislauf, damit O2 nicht unbegrenzt bis zum Anschlag steigt.
    const totalFaunaCells = landCells + oceanCells;
    const respiringBiomassFraction = totalFaunaCells > 0 ? respiringBiomass / (totalFaunaCells * 100) : 0;
    o2Delta -= respiringBiomassFraction * FAUNA_MAX_O2_CONSUMPTION_PER_YEAR;
    Atmosphere.adjust("co2", respiringBiomassFraction * FAUNA_MAX_CO2_RELEASE_PPM_PER_YEAR);

    // Geologische Oxidation/Verwitterung wirkt unabhaengig von Biologie, auch
    // bevor irgendeine Fauna zum Atmen existiert (siehe GEOLOGICAL_O2_EQUILIBRIUM-
    // Kommentar in data.js).
    o2Delta -= (o2AtYearStart - GEOLOGICAL_O2_EQUILIBRIUM) * GEOLOGICAL_O2_RELAXATION_RATE;
    Atmosphere.adjust("o2", o2Delta);

    // Geologische CO2-Senke (Carbonat-Silikat-Verwitterungszyklus) — analog zur
    // O2-Variante oben, aber um Groessenordnungen langsamer (siehe
    // GEOLOGICAL_CO2_RELAXATION_RATE-Kommentar in data.js): reale Verwitterung
    // stabilisiert CO2 erst ueber zehntausende bis hunderttausende Jahre. Ohne
    // diesen Term hatte CO2 KEINE langfristige Ruecksetzkraft und blieb nach
    // genug Spieljahren (Zivilisations-Emissionen, siehe civilization.js) fuer
    // immer am Anschlag (2000 ppm) haengen, selbst wenn Vegetation laengst durch
    // die Hitze abgestorben war und keinen Ausgleich mehr liefern konnte
    // (gemeldeter Fehler: "CO2 geht nicht mehr zurueck"). Die RATE wird
    // zusaetzlich mit Climate.weatheringFactor() moduliert (dynamische
    // Silikatverwitterung, siehe SILICATE_WEATHERING_TEMP_SENSITIVITY-Kommentar
    // in data.js) — NUR hier, NICHT bei den Scrubber-/Emitter-Konstanten unten,
    // deren Kalibrierung dadurch unangetastet bleibt.
    const co2 = Atmosphere.get("co2");
    Atmosphere.adjust("co2", -(co2 - GEOLOGICAL_CO2_EQUILIBRIUM) * GEOLOGICAL_CO2_RELAXATION_RATE * Climate.weatheringFactor(Climate.globalTemperature()));

    // Chemische CH4-Senke (troposphaerische OH-Oxidation, siehe GEOLOGICAL_CH4_
    // RELAXATION_RATE-Kommentar in data.js) — deutlich schneller als die CO2-Senke
    // oben, da Methan real binnen ~einem Jahrzehnt abgebaut wird statt ueber
    // Jahrtausende. Ohne diesen Term blieb CH4 bei jeder laufenden Quelle
    // (Zivilisation, Emitter, Vulkane) permanent am Anschlag (50 ppm) haengen.
    Atmosphere.adjust("ch4", -(Atmosphere.get("ch4") - GEOLOGICAL_CH4_EQUILIBRIUM) * GEOLOGICAL_CH4_RELAXATION_RATE);

    // Magnetfeld-Erosion (siehe MAGNETIC_FIELD_DECAY_RATE-Kommentar in data.js):
    // erst spuerbar, wenn die Feldstaerke unter den Schwellenwert gefallen ist,
    // dann proportional zur Unterschreitung — ein echtes Spaetspiel-Risiko statt
    // eines abrupten Kollapses.
    const fieldStrength = Climate.magneticFieldStrength();
    if (fieldStrength < MAGNETIC_FIELD_EROSION_THRESHOLD) {
      const erosionIntensity = (MAGNETIC_FIELD_EROSION_THRESHOLD - fieldStrength) / MAGNETIC_FIELD_EROSION_THRESHOLD;
      // Ein massereicherer Planet haelt seine Atmosphaere trotz schwachem Feld
      // besser (reale Analogie: Venus haelt dank ausreichender Masse/Schwerkraft
      // eine dichte Atmosphaere ganz ohne nennenswertes Magnetfeld). Bei
      // PLANET_MASS_DEFAULT (1) exakt die bisherige Erosionsrate.
      Atmosphere.erode(erosionIntensity * ATMOSPHERIC_EROSION_MAX_FRACTION_PER_YEAR / Climate.planetMassValue());
    }

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
    // Am Jahresende pruefen, ob die zu JAHRESBEGINN geltende O2-Bedingung (siehe
    // computeGate()) diesjaehrige Prokaryoten->Eukaryoten-Uebergaenge tatsaechlich
    // hervorgebracht hat (siehe Fauna.noteYearEnd()-Kommentar) — NICHT durch einen
    // erneuten computeGate()-Aufruf, der den durch genau diese Uebergaenge bereits
    // wieder gesunkenen O2-Wert saehe und die Erkennung dadurch permanent verpassen
    // wuerde (Kernursache des gemeldeten Fehlers "Eukaryoten entstehen nie").
    Fauna.noteYearEnd(cellAt);
    // Naturereignisse zuletzt: koennen Vegetation/Fauna/Zivilisation betreffen, die
    // dieses Jahr bereits fertig weiterentwickelt wurden — ihre Wirkung ist damit
    // der ENDGUELTIGE Zustand fuer dieses Jahr, nicht durch nachfolgendes Wachstum
    // im selben Tick ueberdeckt. In der Ereignis-Liste bewusst NACH den
    // Entstehungs-Meldungen (siehe UI.log(): der zuletzt eingefuegte Eintrag
    // erscheint oben — ein Vulkanausbruch soll auffaelliger stehen als "X sind
    // entstanden").
    const disasterEvents = Events.tick(cellAt, currentTerrain);
    return { vegetationFraction, co2Absorbed, o2Released, events: [...scanForDiscoveries(), ...disasterEvents] };
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
    let totalPopulation = 0;
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
        if (Civilization.hasCity(cell)) {
          cityCount += 1;
          totalPopulation += Civilization.population(cell);
        }
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
      totalPopulation,
    };
  }

  // Leichtgewichtiger Einzelzellen-Lookup fuer den Maus-Hover-Tooltip — baut
  // (anders als allCells()) NICHT das gesamte 1800-Zellen-Array bei jedem
  // Mousemove-Event neu auf.
  function cellInfoAt(x, y) {
    const cell = cellAt(x, y);
    if (!cell) return null;
    const terrain = currentTerrain(cell);
    const boundaryBias = terrain === "ocean"
      ? Currents.boundaryCurrentBias(cellAt, (c) => currentTerrain(c) === "ocean", x, y)
      : 0;
    return {
      x,
      y,
      terrain: currentTerrain(cell),
      vegetation: cell.vegetation,
      vegetationType: cell.vegetationType,
      temperature: localTemperature(cell),
      precipitation: localPrecipitation(cell, currentTerrain(cell), localTemperature(cell)),
      salinity: cell.salinity,
      fauna: cell.fauna,
      faunaType: cell.faunaType,
      currentDirection: Currents.currentDirectionFor(cell.latitude),
      // Randstrom-Klassifikation (siehe BOUNDARY_CURRENT_*-Kommentar in
      // data.js) — nur fuer den Tooltip relevant, daher hier statt in einem
      // heissen Pfad wie Planet.tick() berechnet.
      boundaryCurrent: boundaryBias > 0 ? "warm" : boundaryBias < 0 ? "cool" : null,
      techLevel: cell.techLevel,
      hasCity: Civilization.hasCity(cell),
      isHighTech: Civilization.isHighTech(cell),
      population: Civilization.population(cell),
      radiation: cell.radiation,
      oxygenGenerator: cell.oxygenGenerator,
      co2Scrubber: cell.co2Scrubber,
      methaneScrubber: cell.methaneScrubber,
      emitter: cell.emitter,
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
      // Von PlanetMap.oceanColor() (js/map.js) fuer den Stroemungs-Tint
      // benoetigt — ohne dieses Feld war cell.tempAnomaly dort `undefined`,
      // was ueber Math.abs()/clamp() zu NaN-Farbwerten fuehrte (in einem
      // Uint8ClampedArray wird NaN zu 0 -> die betroffenen Zellen erschienen
      // schwarz statt in ihrer eigentlichen Ozeanfarbe).
      tempAnomaly: cell.tempAnomaly,
      fauna: cell.fauna,
      faunaType: cell.faunaType,
      techLevel: cell.techLevel,
      radiation: cell.radiation,
      oxygenGenerator: cell.oxygenGenerator,
      co2Scrubber: cell.co2Scrubber,
      methaneScrubber: cell.methaneScrubber,
      emitter: cell.emitter,
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
        co2Scrubber: c.co2Scrubber,
        methaneScrubber: c.methaneScrubber,
        emitter: c.emitter,
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
        // Aeltere Spielstaende kennen Sauerstoffgeneratoren/CO2-Scrubber/Methanfilter/Emitter noch nicht.
        oxygenGenerator: c.oxygenGenerator === true,
        co2Scrubber: c.co2Scrubber === true,
        methaneScrubber: c.methaneScrubber === true,
        emitter: c.emitter === true,
        coastDistance: 0,
      }));
      // coastDistance wird nie serialisiert (rein aus der Hoehenkarte ableitbar,
      // siehe computeCoastDistances) — nach jedem Laden aus der (immer vorhandenen)
      // Hoehenkarte neu berechnen, auch fuer Spielstaende von vor diesem Feature.
      computeCoastDistances();
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

  return { init, terraform, adjustSalinity, toggleOxygenGenerator, toggleCO2Scrubber, toggleMethaneScrubber, toggleEmitter, terraformFauna, detonate, triggerVolcano, triggerEarthquake, triggerTsunami, triggerPlague, tick, stats, allCells, cellInfoAt, currentTerrain, localTemperature, seedRealEarth, serialize, restore };
})();
