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
      }
    }
  }

  return { hasCity, isHighTech, tick };
})();
