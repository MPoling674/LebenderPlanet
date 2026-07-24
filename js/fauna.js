// Fauna: Wachstum/Sterben von Tierbestaenden je Zelle, analog zur Vegetationslogik
// in planet.js, aber als eigenes Modul, da Fauna eine eigene Systemgrenze ist
// (zwei Habitate, eigenes Terraforming-Werkzeug, eigene Eignungsformel). Arbeitet
// rein auf uebergebenen Zellobjekten/Kontext (terrain, temp) — Planet.tick() ruft
// tickCell() pro Zelle auf, keine Rueckrufe von hier zu Planet noetig.

const Fauna = (() => {
  // Eignung 0..1: Land braucht zusaetzlich zur Temperatur eine Mindest-
  // Vegetationsdeckung (Nahrungsgrundlage), Meer kombiniert Temperatur- und
  // Salzgehalt-Eignung (jeweils schlechtester Wert zaehlt).
  function suitability(cell, terrain, temp, type) {
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

  // Komplexeste Art des passenden Habitats, deren Eignung > 0 ist — analog zu
  // Planet.bestVegTypeFor, aber je Habitat gefiltert (Land-/Meeresketten sind
  // unabhaengig voneinander).
  function bestTypeFor(cell, terrain, temp) {
    for (let i = FAUNA_TYPES.length - 1; i >= 0; i--) {
      const type = FAUNA_TYPES[i];
      if (type.habitat !== terrain) continue;
      if (suitability(cell, terrain, temp, type) > 0) return type;
    }
    return null;
  }

  // Ein Jahresschritt fuer den Faunabestand einer Zelle — Struktur bewusst
  // parallel zu Planet.tickCellVegetation (natuerliche Besiedlung, Wachstum/
  // Schwund nach eigener Eignung, Sukzession erst bei ausgereiftem Bestand).
  function tickCell(cell, terrain, temp) {
    const best = bestTypeFor(cell, terrain, temp);
    const currentType = cell.faunaType ? getFaunaType(cell.faunaType) : null;

    if (!currentType) {
      if (!best) {
        cell.fauna = 0;
        return;
      }
      const s = suitability(cell, terrain, temp, best);
      cell.faunaType = best.id;
      cell.fauna = clamp(FAUNA_GROWTH_RATE * s * 100, 0, 100);
      return;
    }

    if (best && best.id === currentType.id) {
      const s = suitability(cell, terrain, temp, currentType);
      cell.fauna = clamp(cell.fauna + FAUNA_GROWTH_RATE * s * (100 - cell.fauna), 0, 100);
      return;
    }

    if (best && best.complexity > currentType.complexity && cell.fauna >= 90) {
      cell.faunaType = best.id;
      cell.fauna = 50;
      return;
    }

    const s = suitability(cell, terrain, temp, currentType);
    if (s > 0) {
      cell.fauna = clamp(cell.fauna + FAUNA_GROWTH_RATE * s * (100 - cell.fauna), 0, 100);
    } else {
      cell.fauna = clamp(cell.fauna - FAUNA_DECAY_RATE * cell.fauna, 0, 100);
      if (cell.fauna <= 0) cell.faunaType = null;
    }
  }

  return { suitability, tickCell };
})();
