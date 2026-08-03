// 3D-Globus als kleines Sidebar-Widget (Three.js r128, siehe CDN-Kommentar in
// index.html) — dreht sich staendig von selbst, laesst sich per Maus-/Touch-
// Drag manuell weiterdrehen/-kippen, UND zeigt die spielergesteuerte
// Achsneigung (Climate.axialTiltDegrees()) inkl. der Milankovitch-Zyklen
// (Obliquitaets-Wobble + Praezession, siehe climate.js) als echte geometrische
// Neigung/Rotation der Achse. Rein informativ/dekorativ — kein Klick-Handling,
// keine Kopplung an die 2D-Karte (die zeigt unabhaengig davon immer den
// kompletten Planeten, siehe #planet-canvas-Kommentar in index.html).
// Wiederverwendet den bereits fertig gerenderten 2D-Canvas (#planet-canvas)
// DIREKT als Kugeltextur — GRID_WIDTH:GRID_HEIGHT ist 60:30 = 2:1, exakt das
// Seitenverhaeltnis einer equirektangularen Kugelprojektion.
//
// Szenengraph-Hierarchie (aussen nach innen), entspricht der realen Physik:
// precessionGroup (rotiert langsam um die Vertikale = Praezession)
//   -> tiltGroup (geneigt um axialTilt + Obliquitaets-Wobble)
//     -> sphere (spinnt um ihre eigene, jetzt geneigte Achse)

const Planet3D = (() => {
  let canvas = null;
  let renderer = null;
  let scene = null;
  let camera = null;
  let precessionGroup = null;
  let tiltGroup = null;
  let sphere = null;
  let texture = null;
  let sunLight = null;
  let rafId = null;
  let lastFrameTime = null;
  let autoRotation = 0;
  let dragging = false;
  let lastPointerX = 0;
  let lastPointerY = 0;
  // Vertikaler Kamera-Blickwinkel (Bogenmass, 0 = Aequatorhoehe) — steuert NUR
  // die Kamera, keine Simulationsgroesse.
  let cameraTilt = 0;

  // Volle Umdrehung in ~40s ohne Zutun — langsam und ruhig, aehnliche
  // Groessenordnung wie PLANET_ORBIT_PERIOD_MS in js/orbitview.js, aber
  // bewusst deutlich langsamer als der dortige Planetenumlauf (das hier ist
  // die Ansicht des Planeten SELBST, nicht seine Bahn um den Stern).
  const ROTATION_PERIOD_MS = 40000;
  // Bogenmass Drehung/Kippung pro Pixel Mausbewegung beim Ziehen.
  const DRAG_SENSITIVITY = 0.01;
  const CAMERA_DISTANCE = 6;
  // Knapp unter 90°, damit die Kamera nie exakt ueber/unter dem Pol steht
  // (dort waere "oben" nicht mehr eindeutig definiert — ein ploetzliches
  // Umklappen der Ansicht).
  const CAMERA_TILT_MAX = 1.4;

  function init(canvasEl) {
    canvas = canvasEl;
    if (!canvas) return;

    renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    renderer.setSize(canvas.width, canvas.height, false);

    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(45, canvas.width / canvas.height, 0.1, 100);
    camera.position.set(0, 0, CAMERA_DISTANCE);

    precessionGroup = new THREE.Group();
    tiltGroup = new THREE.Group();
    precessionGroup.add(tiltGroup);
    scene.add(precessionGroup);

    const geometry = new THREE.SphereGeometry(2.2, 48, 48);
    texture = new THREE.CanvasTexture(document.getElementById("planet-canvas"));
    const material = new THREE.MeshStandardMaterial({ map: texture });
    sphere = new THREE.Mesh(geometry, material);
    tiltGroup.add(sphere);

    // "Sonne" — Farbe/Intensitaet an Climate.solarLuminosity() gekoppelt (siehe
    // SOLAR_LUMINOSITY_START-Kommentar in data.js): bei geringerer Leuchtkraft
    // etwas gedaempfter und waermer/roetlicher — rein optisch.
    sunLight = new THREE.DirectionalLight(0xffffff, 1.4);
    sunLight.position.set(5, 3, 5);
    scene.add(sunLight);
    scene.add(new THREE.AmbientLight(0xffffff, 0.35));

    canvas.style.touchAction = "none"; // sonst scrollt eine Touch-Drag-Geste die Seite statt die Kugel zu drehen
    canvas.style.cursor = "grab";
    canvas.addEventListener("pointerdown", handlePointerDown);
    canvas.addEventListener("pointermove", handlePointerMove);
    canvas.addEventListener("pointerup", handlePointerUp);
    canvas.addEventListener("pointerleave", handlePointerUp);

    rafId = requestAnimationFrame(frame);
  }

  function handlePointerDown(evt) {
    dragging = true;
    lastPointerX = evt.clientX;
    lastPointerY = evt.clientY;
    canvas.style.cursor = "grabbing";
    canvas.setPointerCapture(evt.pointerId);
  }

  function handlePointerMove(evt) {
    if (!dragging) return;
    const dx = evt.clientX - lastPointerX;
    const dy = evt.clientY - lastPointerY;
    lastPointerX = evt.clientX;
    lastPointerY = evt.clientY;
    // Nach rechts ziehen laesst die Kugel wie einen Globus unter der Hand nach
    // rechts/oestlich weiterdrehen.
    autoRotation -= dx * DRAG_SENSITIVITY;
    // Nach oben ziehen kippt die Kamera nach oben (man blickt mehr von oben
    // auf den Pol) — reine Kamerabewegung.
    cameraTilt = clamp(cameraTilt + dy * DRAG_SENSITIVITY, -CAMERA_TILT_MAX, CAMERA_TILT_MAX);
  }

  function handlePointerUp() {
    dragging = false;
    canvas.style.cursor = "grab";
  }

  function frame(now) {
    if (!renderer) return;
    if (lastFrameTime === null) lastFrameTime = now;
    const dtMs = now - lastFrameTime;
    lastFrameTime = now;
    // Auto-Spin laeuft immer weiter, auch waehrend/nach dem Ziehen — kein
    // separates Pausieren noetig, das Ziehen "ueberholt" die langsame
    // automatische Drehung einfach kurzzeitig.
    autoRotation += (dtMs / ROTATION_PERIOD_MS) * Math.PI * 2;
    sphere.rotation.y = autoRotation;

    // Achsneigung (Climate.axialTiltDegrees()) + Obliquitaets-Wobble als
    // Winkel der Neigungs-Gruppe; Praezession als langsame Rotation der
    // GESAMTEN Neigungsachse um die Vertikale (siehe Datei-Kommentar oben).
    const tiltDeg = Climate.axialTiltDegrees() + Climate.obliquityWobbleDegrees();
    tiltGroup.rotation.z = -(tiltDeg / 180) * Math.PI;
    precessionGroup.rotation.y = Climate.precessionAngleRadians();

    // Kamera orbitet vertikal um die Kugel (bleibt dabei immer in derselben
    // Meridianebene, nur die Hoehe aendert sich).
    camera.position.set(0, CAMERA_DISTANCE * Math.sin(cameraTilt), CAMERA_DISTANCE * Math.cos(cameraTilt));
    camera.lookAt(0, 0, 0);

    const solar = Climate.solarLuminosity();
    sunLight.intensity = 0.6 + 0.8 * solar;
    sunLight.color.setHSL(0.13, 0.5, 0.4 + 0.3 * solar);
    renderer.render(scene, camera);
    rafId = requestAnimationFrame(frame);
  }

  // Von main.js nach JEDEM PlanetMap.render() aufgerufen — markiert nur die
  // Textur als veraltet, keine eigene Terrain-Berechnung.
  function render() {
    if (texture) texture.needsUpdate = true;
  }

  return { init, render };
})();
