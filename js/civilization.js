// Zivilisation: Tech-Level-Fortschritt zivilisationsfaehiger Taxa und die daraus
// abgeleiteten Staedte/Hochtechnologie-Schwellen. Struktur parallel zu currents.js
// (zustandslos, operiert auf uebergebenen Zellreferenzen) — Planet.tick() ruft
// tick() nach der Fauna-Sukzession auf, damit der diesjaehrige Reifegrad zaehlt.

const Civilization = (() => {
  // Gesamtausstoss durch Zivilisation seit Spielbeginn (siehe tick()) — getrennt
  // von den aktuellen Atmosphaerenwerten, die durch andere Prozesse (Vegetation,
  // Fauna-Atmung, Spieler-Regler) ebenfalls veraendert werden. Fuer die "wie viel
  // hat die Zivilisation insgesamt eingebracht"-HUD-Anzeige (siehe ui.js).
  let cumulativeCo2 = 0;
  let cumulativeCh4 = 0;

  function init() {
    cumulativeCo2 = 0;
    cumulativeCh4 = 0;
  }

  function hasCity(cell) {
    return cell.techLevel >= CITY_TECH_THRESHOLD;
  }

  function isHighTech(cell) {
    return cell.techLevel >= HIGH_TECH_THRESHOLD;
  }

  function cumulativeEmissions() {
    return { co2: cumulativeCo2, ch4: cumulativeCh4 };
  }

  // getCell(x,y) liefert die lebende Zellreferenz aus Planet — gleiches
  // Zugriffsmuster wie Currents.tick()/Fauna.computeGate().
  function tick(getCell) {
    let totalTechLevel = 0;
    for (let y = 0; y < GRID_HEIGHT; y++) {
      for (let x = 0; x < GRID_WIDTH; x++) {
        const cell = getCell(x, y);
        const type = cell.faunaType ? getFaunaType(cell.faunaType) : null;
        const advancing = type && type.civilizationCapable && cell.fauna >= 90;
        if (advancing) {
          cell.techLevel = clamp(cell.techLevel + CIVILIZATION_GROWTH_RATE, 0, 100);
        } else {
          cell.techLevel = clamp(cell.techLevel - CIVILIZATION_DECAY_RATE, 0, 100);
        }
        if (cell.radiation > 0) cell.radiation = clamp(cell.radiation - RADIATION_DECAY_RATE, 0, 100);
        totalTechLevel += cell.techLevel;
      }
    }
    // Emissionen als Anteil am theoretischen Maximum (JEDE Zelle des Planeten auf
    // Techlevel 100), gleiches Muster wie respiringBiomassFraction in planet.js —
    // siehe CIVILIZATION_CO2_EMISSION_PPM_PER_YEAR-Kommentar in data.js.
    const techFraction = totalTechLevel / (GRID_WIDTH * GRID_HEIGHT * 100);
    const co2Emitted = techFraction * CIVILIZATION_CO2_EMISSION_PPM_PER_YEAR;
    const ch4Emitted = techFraction * CIVILIZATION_CH4_EMISSION_PPM_PER_YEAR;
    if (co2Emitted > 0) Atmosphere.adjust("co2", co2Emitted);
    if (ch4Emitted > 0) Atmosphere.adjust("ch4", ch4Emitted);
    cumulativeCo2 += co2Emitted;
    cumulativeCh4 += ch4Emitted;
  }

  // Zerstoert eine Hochtechnologie-Stadt: Ziel- und Nachbarzellen verlieren ihre
  // Fauna/Vegetation und werden verstrahlt; an der Zielzelle entsteht Nanotech-
  // Roboter-Leben aus den Truemmern. Aufrufer (Planet.detonate) validiert bereits
  // isHighTech(cell) und stellt die Nachbarzellen zusammen.
  function detonate(cell, neighborCells) {
    [cell, ...neighborCells].forEach((c) => {
      c.fauna = 0;
      c.faunaType = null;
      c.vegetation = 0;
      c.vegetationType = null;
      c.techLevel = 0;
      c.radiation = 100;
    });
    cell.faunaType = "nanobots";
    cell.fauna = NANOBOT_START_POPULATION;
  }

  function serialize() {
    return { cumulativeCo2, cumulativeCh4 };
  }

  function restore(saved) {
    // Aeltere Spielstaende kennen den Emissions-Tracker noch nicht — dann bei 0
    // starten statt den bisherigen (unbekannten) Ausstoss zu erfinden.
    cumulativeCo2 = typeof saved?.cumulativeCo2 === "number" ? saved.cumulativeCo2 : 0;
    cumulativeCh4 = typeof saved?.cumulativeCh4 === "number" ? saved.cumulativeCh4 : 0;
  }

  return { init, hasCity, isHighTech, cumulativeEmissions, tick, detonate, serialize, restore };
})();
