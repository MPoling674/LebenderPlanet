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
        cells.push({ elevation, latitude, vegetation: 0, vegetationType: null });
      }
    }
  }

  function init() {
    generateTerrain();
    lastTotalVegetation = 0;
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
    return globalTemp + EQUATOR_TEMP_BONUS - cell.latitude * (EQUATOR_TEMP_BONUS + POLE_TEMP_RANGE);
  }

  // Komplexeste Vegetationsstufe, deren Toleranzband die gegebene Temperatur
  // noch einschliesst (VEGETATION_TYPES ist aufsteigend nach Komplexitaet
  // sortiert, daher rueckwaerts durchsuchen) — oder null, wenn keine Stufe
  // dieses Klima traegt.
  function bestVegTypeFor(temp) {
    for (let i = VEGETATION_TYPES.length - 1; i >= 0; i--) {
      const type = VEGETATION_TYPES[i];
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
      const type = getVegType(typeId) || VEGETATION_TYPES[0];
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
    const best = bestVegTypeFor(temp);
    const currentType = cell.vegetationType ? getVegType(cell.vegetationType) : null;

    if (!currentType) {
      if (!best) {
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
    let totalVegetation = 0;
    let landCells = 0;
    cells.forEach((cell) => {
      const terrain = currentTerrain(cell);
      if (terrain !== "land") {
        cell.vegetation = 0;
        cell.vegetationType = null;
        return;
      }
      landCells += 1;
      tickCellVegetation(cell, localTemperature(cell));
      totalVegetation += cell.vegetation;
    });

    const maxPossible = landCells * 100;
    const vegetationFraction = maxPossible > 0 ? totalVegetation / maxPossible : 0;
    const netFraction = maxPossible > 0 ? (totalVegetation - lastTotalVegetation) / maxPossible : 0;
    const co2Absorbed = netFraction * VEG_MAX_CO2_UPTAKE_PPM_PER_YEAR;
    const o2Released = netFraction * VEG_MAX_O2_RELEASE_PERCENT_PER_YEAR;
    Atmosphere.adjust("co2", -co2Absorbed);
    Atmosphere.adjust("o2", o2Released);
    lastTotalVegetation = totalVegetation;
    return { vegetationFraction, co2Absorbed, o2Released };
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
    cells.forEach((cell) => {
      const t = currentTerrain(cell);
      if (t === "ocean") ocean += 1;
      else if (t === "ice") ice += 1;
      else {
        land += 1;
        vegSum += cell.vegetation;
      }
    });
    const total = cells.length;
    return {
      oceanPercent: (ocean / total) * 100,
      landPercent: (land / total) * 100,
      icePercent: (ice / total) * 100,
      avgVegetation: land > 0 ? vegSum / land : 0,
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
    }));
  }

  function serialize() {
    return {
      cells: cells.map((c) => ({ elevation: c.elevation, latitude: c.latitude, vegetation: c.vegetation, vegetationType: c.vegetationType })),
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
      }));
      // Aeltere Spielstaende kennen lastTotalVegetation noch nicht — dann den
      // aktuellen Bestand als Basislinie nehmen, statt eine falsche Sprung-
      // Aenderung im naechsten tick() zu erzeugen.
      lastTotalVegetation = typeof saved.lastTotalVegetation === "number" ? saved.lastTotalVegetation : sumVegetation();
    } else {
      generateTerrain();
      lastTotalVegetation = 0;
    }
  }

  return { init, terraform, tick, stats, allCells, cellInfoAt, currentTerrain, localTemperature, serialize, restore };
})();
