// Ozeanstroemungen: zwei ueberlagerte Mechanismen.
// 1) Zonales Breitenband-Modell (siehe CURRENT_BANDS in data.js), das pro Jahr
//    Waerme (als Temperatur-Anomalie) und Salzgehalt zwischen benachbarten
//    Ozeanzellen in Stromrichtung advehiert — verteilt lokale Stoerungen
//    (z.B. Vulkanausbrueche) entlang eines Breitengrads, bewirkt aber NIE
//    meridionalen (Nord-Sued) Waermetransport.
// 2) Randstroeme (Golfstrom-Analogon, siehe BOUNDARY_CURRENT_*-Kommentar in
//    data.js): Ozeanzellen nahe einer Westkueste relaxieren Richtung eines
//    warmen Ziel-Werts (polwaertiger Waermetransport), nahe einer Ostkueste
//    Richtung eines kuehlen Ziel-Werts (Auftrieb) — offener Ozean weiterhin
//    Richtung 0 wie bisher.
// Wie Fauna arbeitet dieses Modul rein auf uebergebenen Zell-Referenzen —
// Planet haelt das Gitter privat und ruft Currents.tick() mit einem
// Zellen-Zugriff auf.

const Currents = (() => {
  function currentDirectionFor(latitude) {
    for (let i = 0; i < CURRENT_BANDS.length; i++) {
      if (latitude <= CURRENT_BANDS[i].maxLatitude) return CURRENT_BANDS[i].direction;
    }
    return CURRENT_BANDS[CURRENT_BANDS.length - 1].direction;
  }

  // +1 = Westrandstrom (Land liegt naeher im Westen als im Osten, warmer
  // polwaertiger Bias), -1 = Ostrandstrom (kuehler aequatorwaertiger Bias),
  // 0 = offener Ozean (keine Kueste innerhalb BOUNDARY_CURRENT_SCAN_RADIUS).
  // Ost/West wraparound statt Klemmen am Gitterrand (x=0 und x=GRID_WIDTH-1
  // sind geografisch derselbe Meridian) — sonst wirkte eine Kueste nahe am
  // Kartenrand faelschlich wie offener Ozean, weil die Suche in Richtung des
  // Randes einfach immer wieder dieselbe Randzelle traf statt zur
  // gegenueberliegenden Kartenseite weiterzusuchen (gemeldeter Fehler:
  // Stroemungen hoeren an der Kueste am Kartenrand einfach auf).
  function boundaryCurrentBias(getCell, isOcean, x, y) {
    let nearestWest = Infinity;
    let nearestEast = Infinity;
    for (let d = 1; d <= BOUNDARY_CURRENT_SCAN_RADIUS; d++) {
      if (nearestWest === Infinity) {
        const west = getCell((x - d + GRID_WIDTH) % GRID_WIDTH, y);
        if (west && !isOcean(west)) nearestWest = d;
      }
      if (nearestEast === Infinity) {
        const east = getCell((x + d) % GRID_WIDTH, y);
        if (east && !isOcean(east)) nearestEast = d;
      }
    }
    if (nearestWest === Infinity && nearestEast === Infinity) return 0;
    return nearestWest < nearestEast ? 1 : -1;
  }

  function boundaryCurrentTarget(bias) {
    if (bias > 0) return BOUNDARY_CURRENT_WARM_BIAS;
    if (bias < 0) return BOUNDARY_CURRENT_COOL_BIAS;
    return 0;
  }

  // getCell(x,y) liefert die lebende Zellreferenz aus Planet, isOcean(cell) das
  // aktuelle Terrain.
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
        // Wraparound statt Klemmen: x=0 und x=GRID_WIDTH-1 sind geografisch
        // benachbart (derselbe Meridian), sonst brach die zonale Advektion an
        // den Kartenraendern einfach ab (gemeldeter Fehler). direction ist
        // laut CURRENT_BANDS nie 0, daher liefert dies immer eine ECHTE
        // Nachbarzelle — die upstream!==cell-Pruefung unten bleibt trotzdem
        // als Absicherung stehen.
        const upstreamX = ((x - direction) % GRID_WIDTH + GRID_WIDTH) % GRID_WIDTH;
        const upstream = getCell(upstreamX, y);
        let tempAnomaly = cell.tempAnomaly;
        let salinity = cell.salinity;
        if (upstream !== cell && isOcean(upstream)) {
          tempAnomaly = cell.tempAnomaly + (upstream.tempAnomaly - cell.tempAnomaly) * CURRENT_ADVECTION_RATE;
          salinity = cell.salinity + (upstream.salinity - cell.salinity) * CURRENT_ADVECTION_RATE;
        }
        const target = boundaryCurrentTarget(boundaryCurrentBias(getCell, isOcean, x, y));
        updates.push({ cell, tempAnomaly, salinity, target });
      }
    }
    updates.forEach(({ cell, tempAnomaly, salinity, target }) => {
      cell.tempAnomaly = tempAnomaly + (target - tempAnomaly) * CURRENT_RELAXATION_RATE;
      cell.salinity = clamp(salinity, OCEAN_SALINITY_MIN, OCEAN_SALINITY_MAX);
    });
  }

  return { tick, currentDirectionFor, boundaryCurrentBias };
})();
