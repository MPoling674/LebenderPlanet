// 3D-Globus-Ansicht (Three.js r128, siehe CDN-Kommentar in index.html): spiegelt
// die PlanetMap-API (init/onCellClick/onCellHover/render), damit main.js beide
// Ansichten identisch verkabeln kann. Wiederverwendet den bereits fertig
// gerenderten 2D-Canvas (#planet-canvas) DIREKT als Kugeltextur — GRID_WIDTH:
// GRID_HEIGHT ist 60:30 = 2:1, exakt das Seitenverhaeltnis einer equirektangularen
// Kugelprojektion, keine zweite Terrain-Farblogik noetig.

const Planet3D = (() => {
  let canvas = null;
  let renderer = null;
  let scene = null;
  let camera = null;
  let controls = null;
  let sphere = null;
  let texture = null;
  let raycaster = null;
  let sunLight = null;
  let active = false;
  let rafId = null;
  let onCellClickCallback = null;
  let onCellHoverCallback = null;
  let pointerDownPos = null;

  // Mehr Bewegung zwischen Pointerdown/-up als dieser Schwellenwert (px) zaehlt
  // als Kamerarotation (OrbitControls), nicht als Klick — sonst wuerde jedes
  // Drehen der Kugel versehentlich ein Terraforming-Werkzeug ausloesen.
  const CLICK_DRAG_THRESHOLD = 5;
  // Ausrichtung der Kugel-UVs gegen die Canvas-Textur: im Browser empirisch
  // abgeglichen (Klick auf eine bekannte Zelle mit dem 2D-Ergebnis verglichen).
  const UV_FLIP_V = true;

  function init(canvasEl) {
    canvas = canvasEl;
    if (!canvas) return;

    renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    renderer.setSize(canvas.width, canvas.height, false);

    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(45, canvas.width / canvas.height, 0.1, 100);
    camera.position.set(0, 0, 6);

    const geometry = new THREE.SphereGeometry(2.2, 64, 64);
    texture = new THREE.CanvasTexture(document.getElementById("planet-canvas"));
    const material = new THREE.MeshStandardMaterial({ map: texture });
    sphere = new THREE.Mesh(geometry, material);
    scene.add(sphere);

    // "Sonne" — Farbe/Intensitaet an Climate.solarLuminosity() gekoppelt (siehe
    // SOLAR_LUMINOSITY_START-Kommentar in data.js): bei geringerer Leuchtkraft
    // (z.B. waehrend der "jungen schwachen Sonne"-Fruehphase) etwas gedaempfter
    // und waermer/roetlicher — rein optisch, keine Simulationswirkung.
    sunLight = new THREE.DirectionalLight(0xffffff, 1.4);
    sunLight.position.set(5, 3, 5);
    scene.add(sunLight);
    scene.add(new THREE.AmbientLight(0xffffff, 0.35));

    controls = new THREE.OrbitControls(camera, canvas);
    controls.enableDamping = true;
    controls.minDistance = 3.2;
    controls.maxDistance = 12;

    raycaster = new THREE.Raycaster();

    canvas.addEventListener("pointerdown", handlePointerDown);
    canvas.addEventListener("pointerup", handlePointerUp);
    canvas.addEventListener("mousemove", handleMouseMove);
    canvas.addEventListener("mouseleave", handleMouseLeave);
  }

  function onCellClick(cb) {
    onCellClickCallback = cb;
  }

  // cb(x, y, clientX, clientY) — gleiche Signatur wie PlanetMap.onCellHover().
  function onCellHover(cb) {
    onCellHoverCallback = cb;
  }

  function handlePointerDown(evt) {
    pointerDownPos = { x: evt.clientX, y: evt.clientY };
  }

  function handlePointerUp(evt) {
    if (!pointerDownPos) return;
    const dx = evt.clientX - pointerDownPos.x;
    const dy = evt.clientY - pointerDownPos.y;
    pointerDownPos = null;
    if (Math.hypot(dx, dy) > CLICK_DRAG_THRESHOLD) return;
    const cell = cellAtEvent(evt);
    if (cell && onCellClickCallback) onCellClickCallback(cell.x, cell.y);
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
    const ndcX = ((evt.clientX - rect.left) / rect.width) * 2 - 1;
    const ndcY = -((evt.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(new THREE.Vector2(ndcX, ndcY), camera);
    const hits = raycaster.intersectObject(sphere);
    if (hits.length === 0 || !hits[0].uv) return null;
    return uvToGridCell(hits[0].uv.x, hits[0].uv.y);
  }

  function uvToGridCell(u, v) {
    const gx = clamp(Math.floor(u * GRID_WIDTH), 0, GRID_WIDTH - 1);
    const vv = UV_FLIP_V ? 1 - v : v;
    const gy = clamp(Math.floor(vv * GRID_HEIGHT), 0, GRID_HEIGHT - 1);
    return { x: gx, y: gy };
  }

  // Von main.js beim Umschalten zwischen 2D/3D aufgerufen — der Render-Loop
  // laeuft NUR, waehrend die 3D-Ansicht tatsaechlich sichtbar ist (anders als
  // das kleine, dekorative OrbitView, ist ein volles WebGL-Rendering hier
  // teuer genug, um das Pausieren im Hintergrund zu verdienen).
  function setActive(isActive) {
    active = isActive;
    if (active && !rafId) rafId = requestAnimationFrame(frame);
  }

  function frame() {
    if (!active) { rafId = null; return; }
    controls.update();
    const solar = Climate.solarLuminosity();
    sunLight.intensity = 0.6 + 0.8 * solar;
    sunLight.color.setHSL(0.13, 0.5, 0.4 + 0.3 * solar);
    renderer.render(scene, camera);
    rafId = requestAnimationFrame(frame);
  }

  // Von main.js nach JEDEM PlanetMap.render() aufgerufen — markiert nur die
  // Textur als veraltet, keine eigene Terrain-Berechnung. Das eigentlich teure
  // WebGL-Rendering passiert ausschliesslich im frame()-Loop oben.
  function render() {
    if (texture) texture.needsUpdate = true;
  }

  return { init, onCellClick, onCellHover, render, setActive };
})();
