// Canvas-Rendering des Planetenrasters + Klick-Handling für das aktive Terraforming-
// Werkzeug. Das Raster (60×30) wird zunächst auf einen unsichtbaren Offscreen-Canvas
// in exakter Rastergröße (ein Pixel pro Zelle) gezeichnet und dann mit aktivierter
// Bildglättung auf die sichtbare, größere Canvas hochskaliert — das ergibt weiche
// Farbübergänge zwischen Zellen, ohne eigene Interpolationslogik schreiben zu müssen.

const PlanetMap = (() => {
  let canvas = null;
  let ctx = null;
  let offscreen = null;
  let offCtx = null;
  let onCellClickCallback = null;

  function init(canvasEl) {
    canvas = canvasEl;
    ctx = canvas.getContext("2d");
    ctx.imageSmoothingEnabled = true;
    if ("imageSmoothingQuality" in ctx) ctx.imageSmoothingQuality = "high";

    offscreen = document.createElement("canvas");
    offscreen.width = GRID_WIDTH;
    offscreen.height = GRID_HEIGHT;
    offCtx = offscreen.getContext("2d");

    canvas.addEventListener("click", handleClick);
  }

  function onCellClick(cb) {
    onCellClickCallback = cb;
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
    return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)].map(Math.round);
  }

  const OCEAN_SHALLOW = [58, 128, 150];
  const OCEAN_DEEP = [8, 28, 58];
  const LAND_BARE = [176, 148, 106];
  const LAND_FOREST = [40, 110, 58];
  const ICE_COLOR = [225, 238, 246];

  function oceanColor(cell) {
    const depthFraction = (SEA_LEVEL_THRESHOLD - cell.elevation) / SEA_LEVEL_THRESHOLD;
    return lerpColor(OCEAN_SHALLOW, OCEAN_DEEP, depthFraction);
  }

  function landColor(cell) {
    const [r, g, b] = lerpColor(LAND_BARE, LAND_FOREST, cell.vegetation / 100);
    // Leichte Aufhellung in größerer Höhe — deutet Gebirge an.
    const brighten = clamp((cell.elevation - SEA_LEVEL_THRESHOLD) * 0.7, 0, 0.3);
    return [r, g, b].map((c) => Math.round(c + (255 - c) * brighten));
  }

  function colorFor(cell) {
    if (cell.terrain === "ocean") return oceanColor(cell);
    if (cell.terrain === "ice") return ICE_COLOR;
    return landColor(cell);
  }

  function render() {
    if (!ctx) return;
    Planet.allCells().forEach((cell) => {
      const [r, g, b] = colorFor(cell);
      offCtx.fillStyle = `rgb(${r},${g},${b})`;
      offCtx.fillRect(cell.x, cell.y, 1, 1);
    });
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(offscreen, 0, 0, canvas.width, canvas.height);
  }

  return { init, onCellClick, render };
})();
