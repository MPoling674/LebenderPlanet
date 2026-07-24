// Fauna: Wachstum/Sterben von Tierbestaenden je Zelle, analog zur Vegetationslogik
// in planet.js, aber als eigenes Modul, da Fauna eine eigene Systemgrenze ist
// (mehrere Habitate, verzweigter Evolutionsbaum, eigenes Terraforming-Werkzeug).
// Arbeitet rein auf uebergebenen Zellobjekten/Zugriffsfunktionen — Planet.tick()
// ruft computeGate()/tickCell()/tickSpawns() auf, keine Rueckrufe von hier zu
// Planet noetig.

const Fauna = (() => {
  // Vom letzten computeGate()-Aufruf zwischengespeicherte Praerequisiten-Gates:
  // einmal pro Jahr per Grid-Scan berechnet, nicht bei jeder einzelnen Zellen-
  // Pruefung neu — sonst muesste suitability() bei jedem Aufruf selbst das ganze
  // Gitter durchsuchen. Zwei getrennte Zustaende fuer Eukaryoten, damit das
  // Henne-Ei-Problem sauber aufgeloest ist:
  // - cachedEukaryotesCanGrow: O2-Schwelle erreicht UND globale Temperatur in
  //   einem lebensfreundlichen Band (siehe EUKARYOTE_O2_THRESHOLD-Kommentar in
  //   data.js) — reine UMWELTBEDINGUNG, gilt auch fuer die allererste Zelle, die
  //   ueberhaupt zu Eukaryoten werden koennte (sonst koennten nie welche entstehen).
  // - cachedEukaryotesEstablished: canGrow UND es existiert bereits mindestens
  //   eine tatsaechliche Eukaryoten-Population irgendwo. Nur DIESES Gate darf
  //   Pflanzen/Radiata & Co. freischalten — sonst waeren Bedingungen allein schon
  //   ausreichend, obwohl nie ein einziger Eukaryot entstanden ist (gemeldeter
  //   Fehler: Arthropoden/Vegetation erschienen, obwohl 0% Eukaryoten vorhanden waren).
  let cachedEukaryotesCanGrow = false;
  let cachedEukaryotesEstablished = false;
  let cachedLifeEstablished = false;

  // getCell(x,y) liefert die lebende Zellreferenz aus Planet, currentTerrainFn das
  // aktuelle Terrain — gleiches Zugriffsmuster wie Currents.tick().
  function computeGate(getCell, currentTerrainFn) {
    let hasVegetation = false;
    let hasEukaryotes = false;
    for (let y = 0; y < GRID_HEIGHT; y++) {
      for (let x = 0; x < GRID_WIDTH; x++) {
        const cell = getCell(x, y);
        if (!hasVegetation && currentTerrainFn(cell) === "land" && cell.vegetation > 0) hasVegetation = true;
        if (!hasEukaryotes && cell.faunaType === "eukaryotes" && cell.fauna > 0) hasEukaryotes = true;
      }
    }
    const o2Sufficient = Atmosphere.get("o2") >= EUKARYOTE_O2_THRESHOLD;
    const temp = Climate.globalTemperature();
    const temperatureSurvivable = temp >= EUKARYOTE_MIN_GLOBAL_TEMP && temp <= EUKARYOTE_MAX_GLOBAL_TEMP;
    cachedEukaryotesCanGrow = o2Sufficient && temperatureSurvivable;
    cachedEukaryotesEstablished = cachedEukaryotesCanGrow && hasEukaryotes;
    cachedLifeEstablished = cachedEukaryotesEstablished && hasVegetation;
  }

  // Gate fuer die bestehende Vegetation (Pflanzen-Stufe): Prokaryoten reichern die
  // Atmosphaere mit O2 an (oder ein Sauerstoffgenerator beschleunigt das), einmal
  // ueber der Schwelle koennen Eukaryoten entstehen — erst wenn tatsaechlich
  // welche EXISTIEREN, duerfen Pflanzen wachsen/gepflanzt werden (siehe planet.js).
  function eukaryotesEstablished() {
    return cachedEukaryotesEstablished;
  }

  // Eignung 0..1: Land braucht zusaetzlich zur Temperatur eine Mindest-
  // Vegetationsdeckung (Nahrungsgrundlage), Meer kombiniert Temperatur- und
  // Salzgehalt-Eignung (jeweils schlechtester Wert zaehlt). Praerequisiten-Gates
  // (siehe FAUNA_TYPES-Kommentar in data.js) werden zuerst geprueft.
  function suitability(cell, terrain, temp, type) {
    if (type.id === "nanobots") return 1; // kuenstliches Leben ist klimaunabhaengig
    // Eukaryoten selbst brauchen nur die Umweltbedingung (canGrow), nicht dass
    // schon welche existieren (sonst koennten nie welche entstehen). Sie sterben
    // bei extremer Kaelte/Hitze auch als bereits etablierte Population wieder ab
    // (nicht nur als Neuentstehung blockiert) — das gleiche canGrow=false loest
    // ueber den normalen Zerfallspfad in tickCell() (suitability<=0 -> Bestand
    // schrumpft) auch ein Sterben bestehender Zellen aus, kein Sonderfall noetig.
    if (type.id === "eukaryotes" && !cachedEukaryotesCanGrow) return 0;
    if (type.id !== "prokaryotes" && type.id !== "eukaryotes" && !cachedLifeEstablished) return 0;
    if (type.habitat !== terrain) return 0;
    const [tMin, tMax] = faunaTempRange(type);
    const tempSuit = Climate.vegetationSuitability(temp, tMin, tMax);
    if (tempSuit <= 0) return 0;
    if (type.habitat === "land") {
      return cell.vegetation >= type.minVegetation ? tempSuit : 0;
    }
    const [sMin, sMax] = faunaSalinityRange(type);
    const salinitySuit = Climate.vegetationSuitability(cell.salinity, sMin, sMax);
    return Math.min(tempSuit, salinitySuit);
  }

  // Fuer eine LEERE Zelle: nur "Wurzel"-Taxa (successorOnly:false) koennen spontan
  // besiedeln — alles andere ist ausschliesslich ueber Sukzession/Spawn erreichbar
  // (siehe FAUNA_TYPES-Kommentar in data.js). Array-Reihenfolge dient als
  // Prioritaet, falls mehrere Wurzeln gleichzeitig geeignet sind (letzter Eintrag
  // gewinnt) — gleiches Muster wie Planet.bestVegTypeFor.
  function bestTypeFor(cell, terrain, temp) {
    for (let i = FAUNA_TYPES.length - 1; i >= 0; i--) {
      const type = FAUNA_TYPES[i];
      if (type.successorOnly) continue;
      if (type.habitat !== terrain) continue;
      if (suitability(cell, terrain, temp, type) > 0) return type;
    }
    return null;
  }

  // Ein Jahresschritt fuer den Faunabestand einer Zelle. Anders als bei der
  // linearen Vegetations-Sukzession (eine "komplexeste passende Stufe") prueft
  // eine reife Zelle hier die successors-Liste ihres AKTUELLEN Taxons der Reihe
  // nach; das erste geeignete (nicht crossHabitat) gewinnt. crossHabitat-
  // Uebergaenge werden NICHT hier, sondern in tickSpawns() behandelt.
  function tickCell(cell, terrain, temp) {
    const currentType = cell.faunaType ? getFaunaType(cell.faunaType) : null;

    if (!currentType) {
      // Nicht sofort besiedeln, sobald geeignet — sonst "erscheint" eine Art auf
      // der gesamten passenden Flaeche gleichzeitig (siehe NATURAL_COLONIZATION_
      // CHANCE-Kommentar in data.js).
      const best = bestTypeFor(cell, terrain, temp);
      if (!best || Math.random() >= NATURAL_COLONIZATION_CHANCE) {
        cell.fauna = 0;
        return;
      }
      const s = suitability(cell, terrain, temp, best);
      cell.faunaType = best.id;
      cell.fauna = clamp(FAUNA_GROWTH_RATE * s * 100, 0, 100);
      return;
    }

    if (cell.fauna >= 90 && currentType.successors.length > 0) {
      for (const succ of currentType.successors) {
        if (succ.crossHabitat) continue;
        const succType = getFaunaType(succ.id);
        if (!succType) continue;
        const s = suitability(cell, terrain, temp, succType);
        if (s > 0) {
          cell.faunaType = succType.id;
          cell.fauna = 50;
          return;
        }
      }
    }

    const s = suitability(cell, terrain, temp, currentType);
    if (s > 0) {
      cell.fauna = clamp(cell.fauna + FAUNA_GROWTH_RATE * s * (100 - cell.fauna), 0, 100);
    } else {
      cell.fauna = clamp(cell.fauna - FAUNA_DECAY_RATE * cell.fauna, 0, 100);
      if (cell.fauna <= 0) cell.faunaType = null;
    }
  }

  // Zweiter Grid-Durchlauf NACH der Haupt-Sukzession: behandelt crossHabitat-
  // Nachfolger (z.B. Fische -> Amphibien), die NICHT die eigene Zelle ersetzen,
  // sondern mit kleiner Jahreswahrscheinlichkeit eine benachbarte Zelle passenden
  // Habitats neu besiedeln — die Ursprungspopulation bleibt bestehen. Zielzelle
  // darf leer sein ODER von einer noch UNREIFEN Wurzelart (successorOnly:false,
  // fauna<50) besetzt sein: eine schnell wachsende Wurzelart wie Arthropoden
  // wuerde eine leere Landzelle sonst praktisch immer als Erstes (deterministisch,
  // gleicher Tick) besiedeln, noch bevor die nur mit 10%/Jahr wuerfelnde
  // evolutionaere Neubesiedlung ueberhaupt eine Chance haette — der Uebergang
  // waere de facto nie erreichbar. Ausgereifte (>=50) oder bereits ueber
  // Sukzession/Spawn entstandene Populationen bleiben geschuetzt. Sammelt erst
  // alle Spawns aus dem unveraenderten Ausgangszustand und wendet sie danach an
  // (gleiches Zweiphasen-Muster wie Currents.tick), damit ein Spawn im selben Jahr
  // nicht die Nachbarpruefung einer anderen Zelle verfaelscht.
  function tickSpawns(getCell, currentTerrainFn, localTemperatureFn) {
    const spawns = [];
    const deltas = [[-1, 0], [1, 0], [0, -1], [0, 1]];
    for (let y = 0; y < GRID_HEIGHT; y++) {
      for (let x = 0; x < GRID_WIDTH; x++) {
        const cell = getCell(x, y);
        if (!cell.faunaType || cell.fauna < 90) continue;
        const type = getFaunaType(cell.faunaType);
        const crossSuccessors = type.successors.filter((s) => s.crossHabitat);
        if (crossSuccessors.length === 0) continue;
        deltas.forEach(([dx, dy]) => {
          const nx = x + dx, ny = y + dy;
          if (nx < 0 || nx >= GRID_WIDTH || ny < 0 || ny >= GRID_HEIGHT) return;
          const neighbor = getCell(nx, ny);
          if (neighbor.faunaType) {
            const occupant = getFaunaType(neighbor.faunaType);
            if (!occupant || occupant.successorOnly || neighbor.fauna >= 50) return;
          }
          const neighborTerrain = currentTerrainFn(neighbor);
          for (const succ of crossSuccessors) {
            const succType = getFaunaType(succ.id);
            if (!succType || succType.habitat !== neighborTerrain) continue;
            const temp = localTemperatureFn(neighbor);
            if (suitability(neighbor, neighborTerrain, temp, succType) > 0 && Math.random() < CROSS_HABITAT_SPAWN_CHANCE) {
              spawns.push({ x: nx, y: ny, typeId: succType.id });
            }
            break;
          }
        });
      }
    }
    spawns.forEach(({ x, y, typeId }) => {
      const cell = getCell(x, y);
      cell.faunaType = typeId;
      cell.fauna = 20;
    });
  }

  return { computeGate, eukaryotesEstablished, suitability, tickCell, tickSpawns };
})();
