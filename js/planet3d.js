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
//     -> fieldLinesGroup (dreht NICHT mit — Magnetfeld ist raumfest)
//     -> haloMesh (leuchtet um den Planeten, Staerke = fieldStrength)

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
  let fieldLineMaterial = null;
  let haloMaterial = null;
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
  const SPHERE_RADIUS = 2.2;

  // Baut Feldlinien-Geometrien fuer ein magnetisches Dipolfeld.
  // Jede Feldlinie folgt r = L * R * cos²(λ), wobei λ die magnetische
  // Breite (−lambdaMax bis +lambdaMax) und L die Shell-Nummer ist
  // (maximale Ausbuchtung in Vielfachen des Planetenradius). Die Linien
  // beginnen und enden an der Planetoberflaeche.
  function buildMagneticFieldLines() {
    fieldLineMaterial = new THREE.LineBasicMaterial({
      color: 0x44aaff,
      transparent: true,
      opacity: 0.7,
      depthWrite: false,
    });

    const group = new THREE.Group();
    // Drei Shell-Ebenen: niedrige (~32°), mittlere (~42°), hohe (~48°) Breite
    const L_SHELLS = [1.4, 1.8, 2.2];
    const N_LONGITUDES = 8;
    const STEPS = 60;

    L_SHELLS.forEach((L) => {
      // Breite, bei der die Feldlinie die Planetoberflaeche trifft: cos²(lM) = 1/L
      const lambdaMax = Math.acos(1 / Math.sqrt(L));

      for (let i = 0; i < N_LONGITUDES; i++) {
        const phi = (i / N_LONGITUDES) * Math.PI * 2;
        const points = [];
        for (let j = 0; j <= STEPS; j++) {
          const lambda = (j / STEPS - 0.5) * 2 * lambdaMax;
          const r = L * SPHERE_RADIUS * Math.cos(lambda) ** 2;
          points.push(
            new THREE.Vector3(
              r * Math.cos(lambda) * Math.cos(phi),
              r * Math.sin(lambda),
              r * Math.cos(lambda) * Math.sin(phi)
            )
          );
        }
        group.add(
          new THREE.Line(
            new THREE.BufferGeometry().setFromPoints(points),
            fieldLineMaterial
          )
        );
      }
    });

    return group;
  }

  function init(canvasEl) {
    canvas = canvasEl;
    if (!canvas) return;

    renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    renderer.setSize(canvas.width, canvas.height, false);
    // Ohne sRGB-Ausgabekodierung rechnet Three.js die Beleuchtung im linearen
    // Farbraum, gibt das Ergebnis aber ungewandelt aus — dadurch wirkte die
    // sonnenzugewandte Seite ueberstrahlt/flach (Gamma-Fehlkorrektur druecht
    // Mitteltoene zu hell), waehrend die Nachtseite (nur Umgebungslicht)
    // kaum betroffen war. Betraf gemeldeten "unpassenden Uebergang".
    renderer.outputEncoding = THREE.sRGBEncoding;

    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(45, canvas.width / canvas.height, 0.1, 100);
    camera.position.set(0, 0, CAMERA_DISTANCE);

    precessionGroup = new THREE.Group();
    tiltGroup = new THREE.Group();
    precessionGroup.add(tiltGroup);
    scene.add(precessionGroup);

    const geometry = new THREE.SphereGeometry(SPHERE_RADIUS, 48, 48);
    texture = new THREE.CanvasTexture(document.getElementById("planet-canvas"));
    // Muss zur renderer.outputEncoding-Einstellung oben passen, sonst wird die
    // Kartenfarbe falsch interpretiert.
    texture.encoding = THREE.sRGBEncoding;
    // MeshStandardMaterial ist ohne explizite Werte halb metallisch
    // (Default metalness 0.5) — ohne Environment-Map liefert das bei einem
    // einzelnen Richtungslicht einen unnatuerlich harten, teils ueberstrahlten
    // Glanz statt einer ruhigen, matten Planetenoberflaeche. metalness:0 macht
    // die Kugel rein diffus (Lambert-artig), der Tag/Nacht-Uebergang wird
    // dadurch gleichmaessig statt fleckig.
    const material = new THREE.MeshStandardMaterial({ map: texture, roughness: 1, metalness: 0 });
    sphere = new THREE.Mesh(geometry, material);
    tiltGroup.add(sphere);

    // Magnetfeld-Visualisierung: Feldlinien + Halo-Kugel.
    // Beide Objekte sind Kinder von tiltGroup — sie kippen mit der
    // Polachse, drehen sich aber NICHT mit dem Planeten (sphere.rotation.y).
    tiltGroup.add(buildMagneticFieldLines());

    // Halo: leicht groessere Kugel, nur Innenflaeche (BackSide) sichtbar —
    // erzeugt einen weichen Leuchtrand um den Planeten.
    haloMaterial = new THREE.MeshBasicMaterial({
      color: 0x3377ff,
      transparent: true,
      opacity: 0.06,
      side: THREE.BackSide,
      depthWrite: false,
    });
    tiltGroup.add(new THREE.Mesh(new THREE.SphereGeometry(SPHERE_RADIUS + 0.4, 32, 32), haloMaterial));

    // "Sonne" — Farbe/Intensitaet an Climate.solarLuminosity() gekoppelt (siehe
    // SOLAR_LUMINOSITY_START-Kommentar in data.js): bei geringerer Leuchtkraft
    // etwas gedaempfter und waermer/roetlicher — rein optisch.
    sunLight = new THREE.DirectionalLight(0xffffff, 1.2);
    sunLight.position.set(5, 3, 5);
    scene.add(sunLight);
    // Hoeher als vorher (0.35): reduziert den Helligkeitssprung zwischen Tag-
    // und Nachtseite, damit der Uebergang als Verlauf statt als harte Kante
    // wirkt (siehe Saettigungs-Kommentar in frame() zur Farbursache).
    scene.add(new THREE.AmbientLight(0xffffff, 0.5));

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
    sunLight.intensity = 0.5 + 0.7 * solar;
    // Saettigung war vorher 0.5 (kraeftiges Orange) — multipliziert auf die
    // Textur drehte das den blauen Ozean auf der Tagseite Richtung Gold/Braun,
    // waehrend die Nachtseite (nur weisses Umgebungslicht) die echten Farben
    // zeigte. Der Farbsprung genau an der Tag/Nacht-Grenze wirkte dadurch wie
    // eine harte Kante statt eines weichen Verlaufs (gemeldeter Fehler) — mit
    // niedriger Saettigung bleibt das Sonnenlicht nahezu neutral/leicht warm.
    sunLight.color.setHSL(0.13, 0.15, 0.55 + 0.2 * solar);

    // Magnetfeld: Staerke (0..1) steuert Sichtbarkeit und Farbe der Feldlinien
    // sowie des Halo-Leuchtring.
    // Volles Feld: helles Cyanblau, gut sichtbar.
    // Schwaches Feld (<30%): verblasst und verdunkelt sich — Warnsignal.
    const field = Climate.magneticFieldStrength();
    if (fieldLineMaterial) {
      // Hue 0.58 (Cyan-Blau) bleibt; Helligkeit und Deckkraft sinken mit dem Feld.
      fieldLineMaterial.color.setHSL(0.58, 0.7 + field * 0.3, 0.2 + field * 0.5);
      fieldLineMaterial.opacity = 0.08 + field * 0.72;
    }
    if (haloMaterial) {
      haloMaterial.opacity = field * 0.09;
    }

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
