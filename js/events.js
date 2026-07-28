// Zufaellige Naturereignisse: Vulkanausbrueche, Erdbeben, Meteoriteneinschlaege
// und Stuerme (Taifun/Hurrikan/Orkan) — unterbrechen den sonst glatten
// Wachstumsverlauf mit seltenen, aber spuerbaren lokalen Zerstoerungen (und beim
// Vulkan/Meteorit zusaetzlich globalen Auswirkungen auf Atmosphaere/Klima).
// Struktur parallel zu currents.js/civilization.js (zustandslos, operiert auf
// uebergebenen Zellreferenzen) — Planet.tick() ruft tick() einmal pro Jahr auf.

const Events = (() => {
  // Sucht per Zufalls-Retry eine Zelle mit passendem Terrain — bei seltenen
  // Ereignissen guenstiger als ein voller Grid-Scan. Auf sehr ungewoehnlichen
  // Planeten (z.B. fast nur Eis) kann kein Ziel gefunden werden; das Ereignis
  // faellt dann fuer dieses Jahr einfach aus, statt eine Endlosschleife zu riskieren.
  function findRandomCell(getCell, currentTerrainFn, allowedTerrains) {
    for (let attempt = 0; attempt < 30; attempt++) {
      const x = Math.floor(Math.random() * GRID_WIDTH);
      const y = Math.floor(Math.random() * GRID_HEIGHT);
      const cell = getCell(x, y);
      if (allowedTerrains.includes(currentTerrainFn(cell))) return { x, y, cell };
    }
    return null;
  }

  // Diamant-Radius (Manhattan-Distanz) um (x,y), analog zum bestehenden
  // Nachbarschafts-Muster bei Planet.detonate() (dort radius=1 -> 4 Nachbarn).
  function neighborsWithin(x, y, getCell, radius) {
    const result = [];
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        if (dx === 0 && dy === 0) continue;
        if (Math.abs(dx) + Math.abs(dy) > radius) continue;
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || nx >= GRID_WIDTH || ny < 0 || ny >= GRID_HEIGHT) continue;
        result.push(getCell(nx, ny));
      }
    }
    return result;
  }

  // severity 1 = vollstaendige Zerstoerung (wie Atombombe), <1 = Teilschaden
  // (Bestand wird nur reduziert statt geloescht).
  function devastate(cell, severity) {
    if (severity >= 1) {
      cell.vegetation = 0;
      cell.vegetationType = null;
      cell.fauna = 0;
      cell.faunaType = null;
    } else {
      cell.vegetation = clamp(cell.vegetation * (1 - severity), 0, 100);
      cell.fauna = clamp(cell.fauna * (1 - severity), 0, 100);
    }
  }

  function tick(getCell, currentTerrainFn) {
    const events = [];

    if (Math.random() < VOLCANO_ERUPTION_CHANCE_PER_YEAR) {
      const target = findRandomCell(getCell, currentTerrainFn, ["land"]);
      if (target) {
        devastate(target.cell, 1);
        neighborsWithin(target.x, target.y, getCell, 1).forEach((c) => devastate(c, VOLCANO_NEIGHBOR_DAMAGE));
        Atmosphere.adjust("co2", VOLCANO_CO2_BURST_PPM);
        Atmosphere.adjust("ch4", VOLCANO_CH4_BURST_PPM);
        events.push({ category: "disaster", message: "🌋 Ein Vulkanausbruch hat die Umgebung verwüstet und CO₂/CH₄ in die Atmosphäre geschleudert.", x: target.x, y: target.y });
      }
    }

    if (Math.random() < EARTHQUAKE_CHANCE_PER_YEAR) {
      const target = findRandomCell(getCell, currentTerrainFn, ["land"]);
      if (target) {
        devastate(target.cell, EARTHQUAKE_DAMAGE);
        if (Civilization.hasCity(target.cell)) {
          target.cell.techLevel = clamp(target.cell.techLevel - EARTHQUAKE_TECH_DAMAGE, 0, 100);
        }
        events.push({ category: "disaster", message: "🌍 Ein Erdbeben hat die Region erschüttert.", x: target.x, y: target.y });
      }
    }

    if (Math.random() < METEOR_IMPACT_CHANCE_PER_YEAR) {
      const target = findRandomCell(getCell, currentTerrainFn, ["land", "ocean"]);
      if (target) {
        devastate(target.cell, 1);
        target.cell.techLevel = 0;
        neighborsWithin(target.x, target.y, getCell, METEOR_DEVASTATION_RADIUS).forEach((c) => devastate(c, METEOR_NEIGHBOR_DAMAGE));
        Climate.triggerImpactWinter(METEOR_IMPACT_WINTER_COOLING);
        events.push({ category: "disaster", message: "☄️ Ein Meteorit ist eingeschlagen — die aufgewirbelte Staubwolke kühlt das Klima für Jahrzehnte spürbar ab.", x: target.x, y: target.y });
      }
    }

    if (Math.random() < STORM_CHANCE_PER_YEAR) {
      const target = findRandomCell(getCell, currentTerrainFn, ["land"]);
      if (target) {
        devastate(target.cell, STORM_DAMAGE);
        const name = STORM_NAMES[Math.floor(Math.random() * STORM_NAMES.length)];
        events.push({ category: "disaster", message: `🌪️ Ein ${name} hat die Küste getroffen.`, x: target.x, y: target.y });
      }
    }

    return events;
  }

  return { tick };
})();
