// Canvas-Rendering des Planetenrasters + Klick-Handling für das aktive Terraforming-
// Werkzeug. Zwei Ebenen: Ozean- und Land-Farbverlaeufe werden weiterhin wie bisher
// per Offscreen-Supersampling bilinear zwischen Zellmittelpunkten interpoliert (das
// ergibt weiche, aber nicht verwaschene Verlaeufe fuer Vegetations-/Tiefenzonen) —
// die Land/Ozean-GRENZE selbst kommt aber nicht mehr aus diesem Blending, sondern aus
// einem per Marching Squares erzeugten Vektor-Pfad, an dem die Land-Ebene geclippt
// wird. Das macht die Kuestenlinie scharf und aufloesungsunabhaengig, ohne dass ein
// schmales Blend-Band ("EDGE_BAND") zwischen zu weich/nebelig und zu hart/anstrengend
// abwaegen muss — dieser Kompromiss war vorher unausweichlich, weil Land- und
// Ozeanfarbe im selben Raster gemischt wurden. Eiskappen sind eine reine
// Breiten-Schwelle (kein Hoehenfeld) und werden daher einfacher als zwei
// Rechteck-Clips an der (fraktionalen) Breiten-Grenze gezeichnet.

const PlanetMap = (() => {
  const SUPERSAMPLE = 8;

  let canvas = null;
  let ctx = null;
  let offscreen = null;
  let offCtx = null;
  let onCellClickCallback = null;
  let onCellHoverCallback = null;
  let oceanColorGrid = null; // grid[y][x] = [r,g,b], neu befuellt bei jedem render()
  let landColorGrid = null;
  let elevationGrid = null;

  function init(canvasEl) {
    canvas = canvasEl;
    ctx = canvas.getContext("2d");
    // "high" wuerde hier zusaetzlich zu unserer eigenen Kantenglaettung
    // (sharpenT) noch ein staerker schaerfendes Resampling beim Hochskalieren
    // anwenden — das kann an Farbgrenzen einen leichten "Halo"/Ueberschwinger
    // erzeugen, was zum gemeldeten unruhigen, augenanstrengenden Bild beitraegt.
    ctx.imageSmoothingEnabled = true;

    offscreen = document.createElement("canvas");
    offscreen.width = GRID_WIDTH * SUPERSAMPLE;
    offscreen.height = GRID_HEIGHT * SUPERSAMPLE;
    offCtx = offscreen.getContext("2d");

    canvas.addEventListener("click", handleClick);
    canvas.addEventListener("mousemove", handleMouseMove);
    canvas.addEventListener("mouseleave", handleMouseLeave);
  }

  function onCellClick(cb) {
    onCellClickCallback = cb;
  }

  // cb(x, y, clientX, clientY) — x/y sind null, wenn die Maus ausserhalb des
  // Rasters steht oder den Canvas verlassen hat.
  function onCellHover(cb) {
    onCellHoverCallback = cb;
  }

  function handleMouseMove(evt) {
    if (!onCellHoverCallback) return;
    const cell = cellAtEvent(evt);
    onCellHoverCallback(cell ? cell.x : null, cell ? cell.y : null, evt.clientX, evt.clientY);
  }

  function handleMouseLeave() {
    if (onCellHoverCallback) onCellHoverCallback(null, null, 0, 0);
  }

  function cellAtEvent(evt) {
    const rect = canvas.getBoundingClientRect();
    const px = ((evt.clientX - rect.left) / rect.width) * GRID_WIDTH;
    const py = ((evt.clientY - rect.top) / rect.height) * GRID_HEIGHT;
    const x = Math.floor(px);
    const y = Math.floor(py);
    if (x < 0 || x >= GRID_WIDTH || y < 0 || y >= GRID_HEIGHT) return null;
    return { x, y };
  }

  function handleClick(evt) {
    const cell = cellAtEvent(evt);
    if (cell && onCellClickCallback) onCellClickCallback(cell.x, cell.y);
  }

  function lerp(a, b, t) {
    return a + (b - a) * clamp(t, 0, 1);
  }

  function lerpColor(a, b, t) {
    return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
  }

  // Kontrast bewusst gedaempft (dunkelster/hellster Wert liegen naeher an
  // einem mittleren Grauton) — der vorherige Sprung von fast Schwarz (Ozean)
  // zu fast Weiss (Eis) an Polargrenzen war ein Teil des gemeldeten "harten,
  // augenanstrengenden" Bildeindrucks.
  const OCEAN_SHALLOW = [64, 124, 142];
  const OCEAN_DEEP = [26, 52, 82];
  const LAND_BARE = [168, 144, 108];
  const LAND_FOREST = [52, 108, 66];
  const ICE_COLOR = [206, 218, 226];

  // Salzgehalt-Tint: niedriger Salzgehalt (Suesswassereinfluss, z.B. durch das
  // Salz-Werkzeug entnommen) faerbt leicht gruenlich, hoher Salzgehalt leicht
  // ins Tuerkise — dezent, damit die Tiefenfaerbung dominant bleibt.
  const SALINITY_LOW_TINT = [58, 128, 108];
  const SALINITY_HIGH_TINT = [58, 118, 148];

  function oceanColor(cell) {
    const depthFraction = (SEA_LEVEL_THRESHOLD - cell.elevation) / SEA_LEVEL_THRESHOLD;
    const base = lerpColor(OCEAN_SHALLOW, OCEAN_DEEP, depthFraction);
    const salinityFraction = clamp((cell.salinity - OCEAN_SALINITY_MIN) / (OCEAN_SALINITY_MAX - OCEAN_SALINITY_MIN), 0, 1);
    const tint = lerpColor(SALINITY_LOW_TINT, SALINITY_HIGH_TINT, salinityFraction);
    return lerpColor(base, tint, 0.15);
  }

  function landColor(cell) {
    // Farbe nach angesiedelter Vegetationsstufe (siehe VEGETATION_TYPES in
    // data.js) — macht die unterschiedlichen Vegetationszonen auf der Karte
    // sichtbar, statt nur "mehr/weniger Gruen" ohne Artunterschied zu zeigen.
    const type = cell.vegetationType ? getVegType(cell.vegetationType) : null;
    const vegColor = type ? type.color : LAND_FOREST;
    const base = lerpColor(LAND_BARE, vegColor, cell.vegetation / 100);
    // Leichte Aufhellung in größerer Höhe — deutet Gebirge an.
    const brighten = clamp((cell.elevation - SEA_LEVEL_THRESHOLD) * 0.7, 0, 0.3);
    return base.map((c) => c + (255 - c) * brighten);
  }

  // Beide Farbfelder werden UNABHAENGIG vom tatsaechlichen Terrain der Zelle
  // berechnet (auch eine Landzelle bekommt einen — fiktiven, aber unschaedlichen —
  // Ozeanfarbwert und umgekehrt). Das ist bewusst so: welche Ebene an welcher
  // Stelle sichtbar wird, entscheidet ausschliesslich der Vektor-Clip in render(),
  // nicht das Terrain hier — so bleiben die Farbverlaeufe ueber Zellgrenzen hinweg
  // glatt, auch dort wo der Clip sie kurz danach wieder abschneidet.
  function buildColorGrids() {
    oceanColorGrid = Array.from({ length: GRID_HEIGHT }, () => new Array(GRID_WIDTH));
    landColorGrid = Array.from({ length: GRID_HEIGHT }, () => new Array(GRID_WIDTH));
    elevationGrid = Array.from({ length: GRID_HEIGHT }, () => new Array(GRID_WIDTH));
    Planet.allCells().forEach((cell) => {
      oceanColorGrid[cell.y][cell.x] = oceanColor(cell);
      landColorGrid[cell.y][cell.x] = landColor(cell);
      elevationGrid[cell.y][cell.x] = cell.elevation;
    });
  }

  // Anteil der Zellbreite um die Zellgrenze herum, der tatsaechlich
  // ueberblendet wird (0..0.5). Ausserhalb dieses Bands bleibt die Zellfarbe
  // voll erhalten — das ergibt zusammenhaengende, klar erkennbare Land-/
  // Meeresflaechen mit weich (aber schmal) geglaetteten Kuestenlinien statt
  // einer Farbe, die ueber die GESAMTE Zellbreite in die Nachbarzelle
  // hinueberblendet (das war die Ursache fuer den "nebeligen" Gesamteindruck).
  const EDGE_BAND = 0.12;

  function sharpenT(t) {
    const lo = 0.5 - EDGE_BAND;
    const hi = 0.5 + EDGE_BAND;
    if (t <= lo) return 0;
    if (t >= hi) return 1;
    const u = (t - lo) / (hi - lo);
    return u * u * (3 - 2 * u); // smoothstep
  }

  // Bilineare Farbinterpolation zwischen den vier Zellmittelpunkten, die die
  // (fraktionale) Rasterposition (gx, gy) umgeben. Raender werden geklemmt
  // (kein Umlaufen), das reicht fuer die flache Plattkarten-Darstellung.
  function sampleColor(grid, gx, gy) {
    const x0 = clamp(Math.floor(gx), 0, GRID_WIDTH - 1);
    const x1 = clamp(x0 + 1, 0, GRID_WIDTH - 1);
    const y0 = clamp(Math.floor(gy), 0, GRID_HEIGHT - 1);
    const y1 = clamp(y0 + 1, 0, GRID_HEIGHT - 1);
    const tx = sharpenT(gx - Math.floor(gx));
    const ty = sharpenT(gy - Math.floor(gy));
    const top = lerpColor(grid[y0][x0], grid[y0][x1], tx);
    const bottom = lerpColor(grid[y1][x0], grid[y1][x1], tx);
    return lerpColor(top, bottom, ty);
  }

  // Rendert ein Farbfeld supersampelt in den (wiederverwendeten) Offscreen-Puffer
  // und skaliert ihn auf den Haupt-Canvas — identischer Ablauf fuer Ozean- und
  // Land-Ebene, nur mit unterschiedlichem Quellgrid.
  function renderLayer(grid) {
    const offW = offscreen.width;
    const offH = offscreen.height;
    const imageData = offCtx.createImageData(offW, offH);
    const data = imageData.data;
    for (let sy = 0; sy < offH; sy++) {
      const gy = (sy + 0.5) / SUPERSAMPLE - 0.5;
      for (let sx = 0; sx < offW; sx++) {
        const gx = (sx + 0.5) / SUPERSAMPLE - 0.5;
        const [r, g, b] = sampleColor(grid, gx, gy);
        const idx = (sy * offW + sx) * 4;
        data[idx] = r;
        data[idx + 1] = g;
        data[idx + 2] = b;
        data[idx + 3] = 255;
      }
    }
    offCtx.putImageData(imageData, 0, 0);
    ctx.drawImage(offscreen, 0, 0, canvas.width, canvas.height);
  }

  // Geklemmter Zugriff auf das Hoehenfeld — auch ausserhalb 0..GRID_WIDTH/HEIGHT-1
  // gueltig (siehe landPolygonPath: ein Ring virtueller Randzellen sorgt dafuer,
  // dass die Kontur bis an den Canvas-Rand reicht, nicht nur bis zum aeussersten
  // Zellmittelpunkt).
  function elevationAt(x, y) {
    return elevationGrid[clamp(y, 0, GRID_HEIGHT - 1)][clamp(x, 0, GRID_WIDTH - 1)];
  }

  // Marching Squares ueber das Hoehenfeld bei der aktuellen Meeresspiegel-Schwelle:
  // erzeugt direkt das Land-Teilpolygon jeder 2x2-Zellmittelpunkt-Nachbarschaft
  // (16-Faelle-Standardtabelle mit linear interpolierten Kantenschnittpunkten,
  // Faelle 5/10 sind Sattelpunkte und werden vereinfacht als zwei getrennte
  // Eckdreiecke behandelt statt mit einer zusaetzlichen Mittelpunkt-Abfrage
  // aufgeloest — im Rahmen des bewusst vereinfachten Gesamtmodells akzeptabel).
  // Alle Teilpolygone landen in EINEM Path2D, damit beim Fuellen keine
  // Anti-Aliasing-Nahtstellen zwischen benachbarten Zellen entstehen.
  function landPolygonPath(threshold) {
    const cellW = canvas.width / GRID_WIDTH;
    const cellH = canvas.height / GRID_HEIGHT;
    const path = new Path2D();

    function addPoly(localPoints, gx, gy) {
      if (localPoints.length < 3) return;
      const px = ([lx, ly]) => [(gx + 0.5 + lx) * cellW, (gy + 0.5 + ly) * cellH];
      const first = px(localPoints[0]);
      path.moveTo(first[0], first[1]);
      for (let i = 1; i < localPoints.length; i++) {
        const p = px(localPoints[i]);
        path.lineTo(p[0], p[1]);
      }
      path.closePath();
    }

    // Ring virtueller Randzellen (-1..GRID_WIDTH-1 bzw. -1..GRID_HEIGHT-1), damit
    // die Kontur auch die aeusserste halbe Zellbreite bis zum Canvas-Rand abdeckt
    // (sonst bliebe dort immer die Ozean-Ebene sichtbar, selbst auf Landzellen).
    for (let gy = -1; gy < GRID_HEIGHT; gy++) {
      for (let gx = -1; gx < GRID_WIDTH; gx++) {
        const vTL = elevationAt(gx, gy);
        const vTR = elevationAt(gx + 1, gy);
        const vBR = elevationAt(gx + 1, gy + 1);
        const vBL = elevationAt(gx, gy + 1);
        const iTL = vTL > threshold, iTR = vTR > threshold, iBR = vBR > threshold, iBL = vBL > threshold;
        const caseIdx = (iTL ? 8 : 0) | (iTR ? 4 : 0) | (iBR ? 2 : 0) | (iBL ? 1 : 0);
        if (caseIdx === 0) continue;
        const tTop = clamp((threshold - vTL) / (vTR - vTL), 0, 1);
        const tRight = clamp((threshold - vTR) / (vBR - vTR), 0, 1);
        const tBottom = clamp((threshold - vBL) / (vBR - vBL), 0, 1);
        const tLeft = clamp((threshold - vTL) / (vBL - vTL), 0, 1);
        const TL = [0, 0], TR = [1, 0], BR = [1, 1], BL = [0, 1];
        const top = [tTop, 0], right = [1, tRight], bottom = [tBottom, 1], left = [0, tLeft];
        let polys;
        switch (caseIdx) {
          case 1: polys = [[BL, left, bottom]]; break;
          case 2: polys = [[BR, bottom, right]]; break;
          case 3: polys = [[BL, BR, right, left]]; break;
          case 4: polys = [[TR, right, top]]; break;
          case 5: polys = [[TR, right, top], [BL, left, bottom]]; break;
          case 6: polys = [[TR, BR, bottom, top]]; break;
          case 7: polys = [[left, top, TR, BR, BL]]; break;
          case 8: polys = [[TL, top, left]]; break;
          case 9: polys = [[TL, top, bottom, BL]]; break;
          case 10: polys = [[TL, top, left], [BR, bottom, right]]; break;
          case 11: polys = [[TL, top, right, BR, BL]]; break;
          case 12: polys = [[TL, TR, right, left]]; break;
          case 13: polys = [[TL, TR, right, bottom, BL]]; break;
          case 14: polys = [[TL, TR, BR, bottom, left]]; break;
          default: polys = [[TL, TR, BR, BL]]; break; // case 15
        }
        polys.forEach((poly) => addPoly(poly, gx, gy));
      }
    }
    return path;
  }

  // Reine Breiten-Schwelle (siehe Planet.currentTerrain/generateTerrain: latitude
  // ist eine feste Funktion der Zeilennummer) — hier dupliziert statt aus planet.js
  // importiert, da beide nur von oeffentlich zugaenglichem Zustand (Climate,
  // globale Konstanten) abhaengen.
  function iceLatitudeThreshold() {
    const iceCoverage = Climate.iceCoverage();
    return clamp(POLAR_LATITUDE_THRESHOLD - (iceCoverage - BASE_ICE_COVERAGE) * 2, 0, 1);
  }

  function drawIceLayer() {
    const threshold = iceLatitudeThreshold();
    const cellH = canvas.height / GRID_HEIGHT;
    // Umkehrung von latitude(y) = |y/(GRID_HEIGHT-1) - 0.5| * 2 (siehe
    // Planet.generateTerrain) nach der Zeilenposition, an der die Schwelle
    // ueberschritten wird — ergibt eine fraktionale, nicht nur zeilengenaue Grenze.
    const yNorth = clamp((GRID_HEIGHT - 1) * (0.5 - threshold / 2), 0, GRID_HEIGHT - 1);
    const ySouth = clamp((GRID_HEIGHT - 1) * (0.5 + threshold / 2), 0, GRID_HEIGHT - 1);
    const pixelYNorth = clamp((yNorth + 0.5) * cellH, 0, canvas.height);
    const pixelYSouth = clamp((ySouth + 0.5) * cellH, 0, canvas.height);
    ctx.fillStyle = `rgb(${ICE_COLOR[0]}, ${ICE_COLOR[1]}, ${ICE_COLOR[2]})`;
    ctx.fillRect(0, 0, canvas.width, pixelYNorth);
    ctx.fillRect(0, pixelYSouth, canvas.width, canvas.height - pixelYSouth);
  }

  // Drei duenne Overlays direkt auf dem Haupt-Canvas, kein Vektor-Clip noetig
  // (anders als Land/Eis brauchen sie keine scharfe Kontur): ein dezenter
  // gelbgruenlicher Tint auf verstrahlten Zellen (Staerke ~ radiation/100), ein
  // heller Punkt auf Staedten (groesser/kraeftiger bei Hochtechnologie) und ein
  // kleines helles Quadrat auf Sauerstoffgeneratoren.
  function drawOverlays() {
    const cellW = canvas.width / GRID_WIDTH;
    const cellH = canvas.height / GRID_HEIGHT;
    Planet.allCells().forEach((cell) => {
      if (cell.radiation > 0) {
        const alpha = (cell.radiation / 100) * 0.45;
        ctx.fillStyle = `rgba(190, 210, 60, ${alpha})`;
        ctx.fillRect(cell.x * cellW, cell.y * cellH, cellW, cellH);
      }
      if (cell.oxygenGenerator) {
        const px = (cell.x + 0.5) * cellW;
        const py = (cell.y + 0.5) * cellH;
        const size = Math.max(2, Math.min(cellW, cellH) * 0.32);
        ctx.fillStyle = "rgba(140, 220, 255, 0.95)";
        ctx.fillRect(px - size / 2, py - size / 2, size, size);
      }
      if (cell.techLevel >= CITY_TECH_THRESHOLD) {
        const highTech = cell.techLevel >= HIGH_TECH_THRESHOLD;
        const px = (cell.x + 0.5) * cellW;
        const py = (cell.y + 0.5) * cellH;
        const radius = Math.max(1.5, Math.min(cellW, cellH) * (highTech ? 0.28 : 0.18));
        ctx.fillStyle = highTech ? "rgba(255, 225, 140, 0.95)" : "rgba(255, 255, 255, 0.85)";
        ctx.beginPath();
        ctx.arc(px, py, radius, 0, Math.PI * 2);
        ctx.fill();
      }
    });
  }

  // Wird nur aufgerufen, wenn sich der Planetenzustand tatsächlich ändert (Tick,
  // Terraforming, Gas-Regler) — nicht in einer Dauerschleife, da die supersampelte
  // Neuberechnung sonst unnötig Rechenzeit kosten würde.
  function render() {
    if (!ctx) return;
    buildColorGrids();
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Ebene 1: Ozean ueber den gesamten Canvas.
    renderLayer(oceanColorGrid);

    // Ebene 2: Land, geclippt an der per Marching Squares erzeugten Kuestenlinie.
    const seaLevelOffset = Climate.seaLevelRise() / MAX_ELEVATION_METERS;
    const landPath = landPolygonPath(SEA_LEVEL_THRESHOLD + seaLevelOffset);
    ctx.save();
    ctx.clip(landPath);
    renderLayer(landColorGrid);
    ctx.restore();

    // Ebene 3: Eiskappen, geclippt an der (fraktionalen) Breiten-Grenze.
    drawIceLayer();

    drawOverlays();
  }

  return { init, onCellClick, onCellHover, render };
})();
