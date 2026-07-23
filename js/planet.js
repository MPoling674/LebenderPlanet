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
        cells.push({ elevation, latitude, vegetation: 0 });
      }
    }
  }

  function init() {
    generateTerrain();
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

  function terraform(x, y, action) {
    const cell = cellAt(x, y);
    if (!cell) return { ok: false, reason: "Ungültige Position." };
    const terrain = currentTerrain(cell);
    if (terrain !== "land") return { ok: false, reason: "Vegetation kann nur auf Landzellen angesiedelt werden." };
    if (action === "plant") {
      const suitability = Climate.vegetationSuitability(localTemperature(cell));
      if (suitability <= 0) return { ok: false, reason: "Das Klima an dieser Stelle ist für Vegetation ungeeignet." };
      cell.vegetation = clamp(cell.vegetation + 40, 0, 100);
      return { ok: true };
    }
    if (action === "clear") {
      cell.vegetation = 0;
      return { ok: true };
    }
    return { ok: false, reason: "Unbekannte Aktion." };
  }

  // Jährlicher Tick: Vegetation wächst/stirbt je nach lokaler Eignung, die
  // Gesamtvegetation wirkt per Photosynthese-Näherung auf CO2/O2 zurück.
  function tick() {
    let totalVegetation = 0;
    let landCells = 0;
    cells.forEach((cell) => {
      const terrain = currentTerrain(cell);
      if (terrain !== "land") {
        cell.vegetation = 0;
        return;
      }
      landCells += 1;
      const suitability = Climate.vegetationSuitability(localTemperature(cell));
      if (suitability > 0) {
        cell.vegetation = clamp(cell.vegetation + VEG_GROWTH_RATE * suitability * (100 - cell.vegetation), 0, 100);
      } else {
        cell.vegetation = clamp(cell.vegetation - VEG_DECAY_RATE * cell.vegetation, 0, 100);
      }
      totalVegetation += cell.vegetation;
    });

    const maxPossible = landCells * 100;
    const vegetationFraction = maxPossible > 0 ? totalVegetation / maxPossible : 0;
    const co2Absorbed = vegetationFraction * VEG_MAX_CO2_UPTAKE_PPM_PER_YEAR;
    const o2Released = vegetationFraction * VEG_MAX_O2_RELEASE_PERCENT_PER_YEAR;
    Atmosphere.adjust("co2", -co2Absorbed);
    Atmosphere.adjust("o2", o2Released);
    return { vegetationFraction, co2Absorbed, o2Released };
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

  function allCells() {
    return cells.map((cell, i) => ({
      x: i % GRID_WIDTH,
      y: Math.floor(i / GRID_WIDTH),
      terrain: currentTerrain(cell),
      vegetation: cell.vegetation,
      elevation: cell.elevation,
    }));
  }

  function serialize() {
    return { cells: cells.map((c) => ({ elevation: c.elevation, latitude: c.latitude, vegetation: c.vegetation })) };
  }

  function restore(saved) {
    if (saved && Array.isArray(saved.cells) && saved.cells.length === GRID_WIDTH * GRID_HEIGHT) {
      cells = saved.cells.map((c) => ({ ...c }));
    } else {
      generateTerrain();
    }
  }

  return { init, terraform, tick, stats, allCells, currentTerrain, localTemperature, serialize, restore };
})();
