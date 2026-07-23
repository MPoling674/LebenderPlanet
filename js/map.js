// Canvas-Rendering des Planetenrasters + Klick-Handling für das aktive Terraforming-
// Werkzeug (gleiches Grundmuster wie das Karten-Rendering in HanseSpiel).

const PlanetMap = (() => {
  let canvas = null;
  let ctx = null;
  let onCellClickCallback = null;

  function init(canvasEl) {
    canvas = canvasEl;
    ctx = canvas.getContext("2d");
    canvas.addEventListener("click", handleClick);
  }

  function onCellClick(cb) {
    onCellClickCallback = cb;
  }

  function cellSize() {
    return { w: canvas.width / GRID_WIDTH, h: canvas.height / GRID_HEIGHT };
  }

  function cellAtEvent(evt) {
    const rect = canvas.getBoundingClientRect();
    const px = ((evt.clientX - rect.left) / rect.width) * canvas.width;
    const py = ((evt.clientY - rect.top) / rect.height) * canvas.height;
    const { w, h } = cellSize();
    const x = Math.floor(px / w);
    const y = Math.floor(py / h);
    if (x < 0 || x >= GRID_WIDTH || y < 0 || y >= GRID_HEIGHT) return null;
    return { x, y };
  }

  function handleClick(evt) {
    const cell = cellAtEvent(evt);
    if (cell && onCellClickCallback) onCellClickCallback(cell.x, cell.y);
  }

  function colorFor(cell) {
    if (cell.terrain === "ocean") return "#1b4f72";
    if (cell.terrain === "ice") return "#eaf2f8";
    // Land: kahl (braun) bis dicht bewachsen (grün), interpoliert nach Vegetationsanteil.
    const t = cell.vegetation / 100;
    const r = Math.round(139 + (34 - 139) * t);
    const g = Math.round(115 + (139 - 115) * t);
    const b = Math.round(85 + (34 - 85) * t);
    return `rgb(${r},${g},${b})`;
  }

  function render() {
    if (!ctx) return;
    const { w, h } = cellSize();
    Planet.allCells().forEach((cell) => {
      ctx.fillStyle = colorFor(cell);
      ctx.fillRect(cell.x * w, cell.y * h, Math.ceil(w) + 1, Math.ceil(h) + 1);
    });
  }

  return { init, onCellClick, render };
})();
