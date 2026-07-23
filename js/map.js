// Canvas-Rendering des Planetenrasters + Klick-Handling für das aktive Terraforming-
// Werkzeug. Statt jede Zelle als 1 Pixel zu zeichnen und das riesig hochzuskalieren
// (das ergibt nur eine verwaschene Unschärfe), wird ein Offscreen-Puffer in mehrfacher
// Auflösung ("Supersampling") erzeugt, in dem jeder Bildpunkt bilinear zwischen den
// vier umliegenden Zellmittelpunkten interpoliert wird — das ergibt echte, scharf
// definierte Farbverläufe an Küsten/Vegetationsgrenzen statt eines Weichzeichners.

const PlanetMap = (() => {
  const SUPERSAMPLE = 8;

  let canvas = null;
  let ctx = null;
  let offscreen = null;
  let offCtx = null;
  let onCellClickCallback = null;
  let onCellHoverCallback = null;
  let colorGrid = null; // colorGrid[y][x] = [r,g,b], neu befuellt bei jedem render()

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

  function oceanColor(cell) {
    const depthFraction = (SEA_LEVEL_THRESHOLD - cell.elevation) / SEA_LEVEL_THRESHOLD;
    return lerpColor(OCEAN_SHALLOW, OCEAN_DEEP, depthFraction);
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

  function colorFor(cell) {
    if (cell.terrain === "ocean") return oceanColor(cell);
    if (cell.terrain === "ice") return ICE_COLOR;
    return landColor(cell);
  }

  function buildColorGrid() {
    colorGrid = Array.from({ length: GRID_HEIGHT }, () => new Array(GRID_WIDTH));
    Planet.allCells().forEach((cell) => {
      colorGrid[cell.y][cell.x] = colorFor(cell);
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
  function sampleColor(gx, gy) {
    const x0 = clamp(Math.floor(gx), 0, GRID_WIDTH - 1);
    const x1 = clamp(x0 + 1, 0, GRID_WIDTH - 1);
    const y0 = clamp(Math.floor(gy), 0, GRID_HEIGHT - 1);
    const y1 = clamp(y0 + 1, 0, GRID_HEIGHT - 1);
    const tx = sharpenT(gx - Math.floor(gx));
    const ty = sharpenT(gy - Math.floor(gy));
    const top = lerpColor(colorGrid[y0][x0], colorGrid[y0][x1], tx);
    const bottom = lerpColor(colorGrid[y1][x0], colorGrid[y1][x1], tx);
    return lerpColor(top, bottom, ty);
  }

  // Wird nur aufgerufen, wenn sich der Planetenzustand tatsächlich ändert (Tick,
  // Terraforming, Gas-Regler) — nicht in einer Dauerschleife, da die supersampelte
  // Neuberechnung sonst unnötig Rechenzeit kosten würde.
  function render() {
    if (!ctx) return;
    buildColorGrid();

    const offW = offscreen.width;
    const offH = offscreen.height;
    const imageData = offCtx.createImageData(offW, offH);
    const data = imageData.data;
    for (let sy = 0; sy < offH; sy++) {
      const gy = (sy + 0.5) / SUPERSAMPLE - 0.5;
      for (let sx = 0; sx < offW; sx++) {
        const gx = (sx + 0.5) / SUPERSAMPLE - 0.5;
        const [r, g, b] = sampleColor(gx, gy);
        const idx = (sy * offW + sx) * 4;
        data[idx] = r;
        data[idx + 1] = g;
        data[idx + 2] = b;
        data[idx + 3] = 255;
      }
    }
    offCtx.putImageData(imageData, 0, 0);

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(offscreen, 0, 0, canvas.width, canvas.height);
  }

  return { init, onCellClick, onCellHover, render };
})();
