// 3D-Globus als kleines, rein dekoratives Sidebar-Widget (Three.js r128, siehe
// CDN-Kommentar in index.html) — analog zu js/orbitview.js: reine Auto-Rotation,
// KEIN OrbitControls-Drag, KEINE Klick-Interaktivitaet mehr (Terraforming bleibt
// exklusiv auf der 2D-Karte, siehe js/mapviewport.js). Wiederverwendet den
// bereits fertig gerenderten 2D-Canvas (#planet-canvas) DIREKT als Kugeltextur
// — GRID_WIDTH:GRID_HEIGHT ist 60:30 = 2:1, exakt das Seitenverhaeltnis einer
// equirektangularen Kugelprojektion, keine zweite Terrain-Farblogik noetig.
//
// currentLongitudeFraction() ist die Bruecke zu js/mapviewport.js: die grosse
// 2D-Karte liest diesen Wert jeden Frame und pannt sich passend dazu — die
// eigentlich teure Arbeit (PlanetMap.render()) bleibt dabei UNVERAENDERT nur
// ereignisgesteuert (siehe Kontext-Abschnitt im Plan), hier wird nur ein
// billiger Rotationswinkel berechnet.

const Planet3D = (() => {
  let canvas = null;
  let renderer = null;
  let scene = null;
  let camera = null;
  let sphere = null;
  let texture = null;
  let sunLight = null;
  let rafId = null;

  // Volle Umdrehung in ~40s — langsam und ruhig, aehnliche Groessenordnung wie
  // PLANET_ORBIT_PERIOD_MS in js/orbitview.js, aber bewusst deutlich langsamer
  // als der dortige Planetenumlauf (das hier ist die Ansicht des Planeten
  // SELBST, nicht seine Bahn um den Stern).
  const ROTATION_PERIOD_MS = 40000;

  function init(canvasEl) {
    canvas = canvasEl;
    if (!canvas) return;

    renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    renderer.setSize(canvas.width, canvas.height, false);

    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(45, canvas.width / canvas.height, 0.1, 100);
    camera.position.set(0, 0, 6);

    const geometry = new THREE.SphereGeometry(2.2, 48, 48);
    texture = new THREE.CanvasTexture(document.getElementById("planet-canvas"));
    const material = new THREE.MeshStandardMaterial({ map: texture });
    sphere = new THREE.Mesh(geometry, material);
    scene.add(sphere);

    // "Sonne" — Farbe/Intensitaet an Climate.solarLuminosity() gekoppelt (siehe
    // SOLAR_LUMINOSITY_START-Kommentar in data.js): bei geringerer Leuchtkraft
    // etwas gedaempfter und waermer/roetlicher — rein optisch.
    sunLight = new THREE.DirectionalLight(0xffffff, 1.4);
    sunLight.position.set(5, 3, 5);
    scene.add(sunLight);
    scene.add(new THREE.AmbientLight(0xffffff, 0.35));

    rafId = requestAnimationFrame(frame);
  }

  function frame(now) {
    if (!renderer) return;
    sphere.rotation.y = (now / ROTATION_PERIOD_MS) * Math.PI * 2;
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

  // 0..1 — welcher Laengengrad-Anteil der Karte gerade auf dem Widget "vorne"
  // (der Kamera zugewandt) sichtbar ist. Per Raycast auf die Bildschirmmitte
  // empirisch kalibriert (Three.js SphereGeometry: der Punkt phi=pi/2, also
  // u=0.25 bei rotation.y=0, zeigt bei Kamera auf +Z nach vorne; steigendes
  // rotation.y verschiebt den sichtbaren Punkt zu KLEINEREM u) — exakte
  // Uebereinstimmung mehrerer Messpunkte im Browser bestaetigt: u = 0.25 -
  // rotation.y/(2*pi).
  function currentLongitudeFraction() {
    if (!sphere) return 0.5;
    const raw = 0.25 - sphere.rotation.y / (Math.PI * 2);
    return ((raw % 1) + 1) % 1;
  }

  return { init, render, currentLongitudeFraction };
})();
