// Ozeanstroemungen: vereinfachtes Breitenband-Modell (siehe CURRENT_BANDS in
// data.js), das pro Jahr Waerme (als Temperatur-Anomalie) und Salzgehalt
// zwischen benachbarten Ozeanzellen in Stromrichtung advehiert. Wie Fauna
// arbeitet dieses Modul rein auf uebergebenen Zell-Referenzen — Planet haelt
// das Gitter privat und ruft Currents.tick() mit einem Zellen-Zugriff auf.

const Currents = (() => {
  function currentDirectionFor(latitude) {
    for (let i = 0; i < CURRENT_BANDS.length; i++) {
      if (latitude <= CURRENT_BANDS[i].maxLatitude) return CURRENT_BANDS[i].direction;
    }
    return CURRENT_BANDS[CURRENT_BANDS.length - 1].direction;
  }

  // getCell(x,y) liefert die lebende Zellreferenz aus Planet, isOcean(cell) das
  // aktuelle Terrain. Grid-Rand wird geklemmt (kein Umlaufen), gleiche Konvention
  // wie PlanetMap.sampleColor.
  function tick(getCell, isOcean) {
    // Erst alle neuen Werte aus dem AKTUELLEN (unveraenderten) Zustand berechnen
    // und erst danach anwenden — sonst wuerden bereits aktualisierte Zellen die
    // Berechnung der naechsten Zelle in Stromrichtung im selben Tick verfaelschen.
    const updates = [];
    for (let y = 0; y < GRID_HEIGHT; y++) {
      for (let x = 0; x < GRID_WIDTH; x++) {
        const cell = getCell(x, y);
        if (!isOcean(cell)) continue;
        const direction = currentDirectionFor(cell.latitude);
        const upstreamX = clamp(x - direction, 0, GRID_WIDTH - 1);
        const upstream = getCell(upstreamX, y);
        if (upstream === cell || !isOcean(upstream)) continue;
        updates.push({
          cell,
          tempAnomaly: cell.tempAnomaly + (upstream.tempAnomaly - cell.tempAnomaly) * CURRENT_ADVECTION_RATE,
          salinity: cell.salinity + (upstream.salinity - cell.salinity) * CURRENT_ADVECTION_RATE,
        });
      }
    }
    updates.forEach(({ cell, tempAnomaly, salinity }) => {
      cell.tempAnomaly = tempAnomaly - tempAnomaly * CURRENT_RELAXATION_RATE;
      cell.salinity = clamp(salinity, OCEAN_SALINITY_MIN, OCEAN_SALINITY_MAX);
    });
  }

  return { tick, currentDirectionFor };
})();
