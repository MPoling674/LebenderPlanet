// Zivilisation: Tech-Level-Fortschritt zivilisationsfaehiger Taxa und die daraus
// abgeleiteten Staedte/Hochtechnologie-Schwellen. Struktur parallel zu currents.js
// (zustandslos, operiert auf uebergebenen Zellreferenzen) — Planet.tick() ruft
// tick() nach der Fauna-Sukzession auf, damit der diesjaehrige Reifegrad zaehlt.

const Civilization = (() => {
  function hasCity(cell) {
    return cell.techLevel >= CITY_TECH_THRESHOLD;
  }

  function isHighTech(cell) {
    return cell.techLevel >= HIGH_TECH_THRESHOLD;
  }

  // getCell(x,y) liefert die lebende Zellreferenz aus Planet — gleiches
  // Zugriffsmuster wie Currents.tick()/Fauna.computeGate().
  function tick(getCell) {
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
      }
    }
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

  return { hasCity, isHighTech, tick, detonate };
})();
