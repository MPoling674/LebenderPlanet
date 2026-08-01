// Naturereignisse: Vulkanausbrueche, Erdbeben, Meteoriteneinschlaege und Stuerme
// (Taifun/Hurrikan/Orkan) wuerfelt tick() jaehrlich zufaellig aus — unterbrechen
// den sonst glatten Wachstumsverlauf mit seltenen, aber spuerbaren lokalen
// Zerstoerungen (und beim Vulkan/Meteorit zusaetzlich globalen Auswirkungen auf
// Atmosphaere/Klima). Tsunami und Seuche sind KEINE Zufallsereignisse, sondern
// nur ueber Planet.triggerTsunami()/triggerPlague() vom Spieler gezielt
// ausloesbar (siehe apply*()-Kommentare unten). Struktur parallel zu
// currents.js/civilization.js (zustandslos, operiert auf uebergebenen
// Zellreferenzen) — Planet.tick() ruft tick() einmal pro Jahr auf.

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

  // Seuche-Pendant zu devastate(): wirkt NUR auf Fauna, nie auf Vegetation (siehe
  // PLAGUE_DAMAGE-Kommentar in data.js) und nie mit severity>=1 (kein Totalschaden).
  function afflict(cell, severity) {
    cell.fauna = clamp(cell.fauna * (1 - severity), 0, 100);
  }

  // Wirkung eines Vulkanausbruchs auf eine bereits validierte Landzelle (x,y) —
  // gemeinsam genutzt vom jaehrlichen Zufalls-Wuerfeln (tick() unten) UND von
  // Planet.triggerVolcano() (spielergesteuerte Ausloesung).
  function applyVolcano(x, y, getCell) {
    devastate(getCell(x, y), 1);
    neighborsWithin(x, y, getCell, 1).forEach((c) => devastate(c, VOLCANO_NEIGHBOR_DAMAGE));
    Atmosphere.adjust("co2", VOLCANO_CO2_BURST_PPM);
    Atmosphere.adjust("ch4", VOLCANO_CH4_BURST_PPM);
  }

  // Wirkung eines Erdbebens, gemeinsam genutzt von tick() und
  // Planet.triggerEarthquake() (siehe applyVolcano()-Kommentar).
  function applyEarthquake(x, y, getCell) {
    const cell = getCell(x, y);
    devastate(cell, EARTHQUAKE_DAMAGE);
    if (Civilization.hasCity(cell)) {
      cell.techLevel = clamp(cell.techLevel - EARTHQUAKE_TECH_DAMAGE, 0, 100);
    }
  }

  // Tsunami: nur von Planet.triggerTsunami() genutzt (siehe TSUNAMI_DAMAGE-
  // Kommentar in data.js — kein Zufallsereignis). Epizentrum + Nachbarn im
  // TSUNAMI_RADIUS werden getroffen, eine betroffene Stadt verliert zusaetzlich
  // Tech-Level (Infrastruktur-/Bevoelkerungsverlust durch die Flutwelle).
  function applyTsunami(x, y, getCell) {
    const cell = getCell(x, y);
    devastate(cell, TSUNAMI_DAMAGE);
    if (Civilization.hasCity(cell)) {
      cell.techLevel = clamp(cell.techLevel - TSUNAMI_TECH_DAMAGE, 0, 100);
    }
    neighborsWithin(x, y, getCell, TSUNAMI_RADIUS).forEach((c) => devastate(c, TSUNAMI_NEIGHBOR_DAMAGE));
  }

  // Seuche: nur von Planet.triggerPlague() genutzt (siehe PLAGUE_DAMAGE-Kommentar
  // in data.js — kein Zufallsereignis). Nutzt afflict() statt devastate(): trifft
  // Fauna/Bevoelkerung, laesst Vegetation unberuehrt.
  function applyPlague(x, y, getCell) {
    const cell = getCell(x, y);
    afflict(cell, PLAGUE_DAMAGE);
    if (Civilization.hasCity(cell)) {
      cell.techLevel = clamp(cell.techLevel - PLAGUE_TECH_DAMAGE, 0, 100);
    }
    neighborsWithin(x, y, getCell, PLAGUE_RADIUS).forEach((c) => afflict(c, PLAGUE_NEIGHBOR_DAMAGE));
  }

  function tick(getCell, currentTerrainFn) {
    const events = [];

    if (Math.random() < VOLCANO_ERUPTION_CHANCE_PER_YEAR) {
      const target = findRandomCell(getCell, currentTerrainFn, ["land"]);
      if (target) {
        applyVolcano(target.x, target.y, getCell);
        events.push({ category: "disaster", message: "🌋 Ein Vulkanausbruch hat die Umgebung verwüstet und CO₂/CH₄ in die Atmosphäre geschleudert.", x: target.x, y: target.y });
      }
    }

    if (Math.random() < EARTHQUAKE_CHANCE_PER_YEAR) {
      const target = findRandomCell(getCell, currentTerrainFn, ["land"]);
      if (target) {
        applyEarthquake(target.x, target.y, getCell);
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

    // Stuerme brauchen einen Wasser-/Atmosphaerenkreislauf — auf einem noch
    // kochenden Planeten ohne kondensiertes Wasser (siehe PRIMORDIAL_HEAT_*-
    // Kommentar in data.js) ergeben sie narrativ keinen Sinn.
    if (Climate.waterCoverage() > 0 && Math.random() < STORM_CHANCE_PER_YEAR) {
      const target = findRandomCell(getCell, currentTerrainFn, ["land"]);
      if (target) {
        devastate(target.cell, STORM_DAMAGE);
        const name = STORM_NAMES[Math.floor(Math.random() * STORM_NAMES.length)];
        events.push({ category: "disaster", message: `🌪️ Ein ${name} hat die Küste getroffen.`, x: target.x, y: target.y });
      }
    }

    return events;
  }

  return { tick, applyVolcano, applyEarthquake, applyTsunami, applyPlague };
})();
