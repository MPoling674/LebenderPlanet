// Umlaufbahn-Animation: rein dekoratives Schema (Stern, Planet, Mond), NICHT
// massstabsgetreu — echte Orbitalperioden/-radien werden im Spiel nirgends
// modelliert (siehe Climate.axialTilt/-moonMass/-planetMass-Kommentare in
// data.js). Laeuft unabhaengig vom Simulationstakt per requestAnimationFrame
// in Echtzeit, liest Achsneigung/Mond-/Planetenmasse aber bei JEDEM Frame live
// aus Climate, damit Reglerbewegungen sofort sichtbar werden, ohne an
// UI.renderAll() gekoppelt zu sein.

const OrbitView = (() => {
  let canvas = null;
  let ctx = null;
  let rafId = null;

  const PLANET_ORBIT_RADIUS = 90;
  const PLANET_ORBIT_PERIOD_MS = 14000;
  const MOON_ORBIT_RADIUS_BASE = 24;
  const MOON_ORBIT_PERIOD_MS = 2600;
  const STAR_RADIUS = 16;
  const PLANET_RADIUS_BASE = 9;
  const MOON_RADIUS_BASE = 3.5;

  function init(canvasEl) {
    canvas = canvasEl;
    if (!canvas) return;
    ctx = canvas.getContext("2d");
    if (rafId) cancelAnimationFrame(rafId);
    rafId = requestAnimationFrame(frame);
  }

  function frame(now) {
    if (!ctx) return;
    render(now);
    rafId = requestAnimationFrame(frame);
  }

  function render(now) {
    const w = canvas.width, h = canvas.height;
    ctx.clearRect(0, 0, w, h);
    const cx = w / 2, cy = h / 2;

    // Planetenbahn um den Stern (leichte Ellipse fuer Tiefenwirkung, rein optisch).
    ctx.strokeStyle = "#223047";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.ellipse(cx, cy, PLANET_ORBIT_RADIUS, PLANET_ORBIT_RADIUS * 0.55, 0, 0, Math.PI * 2);
    ctx.stroke();

    ctx.fillStyle = "#e0a030";
    ctx.beginPath();
    ctx.arc(cx, cy, STAR_RADIUS, 0, Math.PI * 2);
    ctx.fill();

    const planetMass = Climate.planetMassValue();
    const moonMass = Climate.moonMassValue();
    const tiltDeg = Climate.axialTiltDegrees();

    const planetAngle = ((now % PLANET_ORBIT_PERIOD_MS) / PLANET_ORBIT_PERIOD_MS) * Math.PI * 2;
    const px = cx + Math.cos(planetAngle) * PLANET_ORBIT_RADIUS;
    const py = cy + Math.sin(planetAngle) * PLANET_ORBIT_RADIUS * 0.55;

    // Groesse skaliert mit derselben Masse-Radius-Naeherung wie im
    // Groessenvergleich-Diagramm (siehe estimatedPlanetRadiusKm() in data.js),
    // nur auf Bildschirm-Pixel statt km gemuenzt.
    const planetRadius = clamp(PLANET_RADIUS_BASE * Math.cbrt(planetMass), 4, 16);

    const moonOrbitRadius = MOON_ORBIT_RADIUS_BASE + planetRadius;
    ctx.strokeStyle = "#3a4a63";
    ctx.beginPath();
    ctx.arc(px, py, moonOrbitRadius, 0, Math.PI * 2);
    ctx.stroke();

    const moonAngle = ((now % MOON_ORBIT_PERIOD_MS) / MOON_ORBIT_PERIOD_MS) * Math.PI * 2;
    const mx = px + Math.cos(moonAngle) * moonOrbitRadius;
    const my = py + Math.sin(moonAngle) * moonOrbitRadius * 0.6;
    // Math.max(moonMass, 0.05) statt 0: bei Mondmasse=0 soll trotzdem noch ein
    // winziger Punkt sichtbar bleiben (kein abruptes Verschwinden), waehrend
    // die Stabilisierungswirkung bereits bei 0 beginnt (siehe tiltInstability()
    // in climate.js) — rein optische Entkopplung, keine Simulationswirkung.
    const moonRadius = clamp(MOON_RADIUS_BASE * Math.cbrt(Math.max(moonMass, 0.05)), 1.5, 7);

    // Planet mit Achsneigungs-Anzeige: eine Linie durch den Mittelpunkt im
    // Winkel der aktuellen Achsneigung macht den chaotischen Drift ohne
    // ausreichende Mondmasse (siehe TILT_CHAOTIC_DRIFT_RATE in data.js) auch
    // hier sichtbar, nicht nur im separaten Achsneigungs-Diagramm.
    ctx.save();
    ctx.translate(px, py);
    ctx.fillStyle = "#4682b4";
    ctx.beginPath();
    ctx.arc(0, 0, planetRadius, 0, Math.PI * 2);
    ctx.fill();
    const tiltRad = (tiltDeg / 180) * Math.PI;
    ctx.strokeStyle = "#e6e8ec";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(-Math.sin(tiltRad) * (planetRadius + 7), -Math.cos(tiltRad) * (planetRadius + 7));
    ctx.lineTo(Math.sin(tiltRad) * (planetRadius + 7), Math.cos(tiltRad) * (planetRadius + 7));
    ctx.stroke();
    ctx.restore();

    ctx.fillStyle = "#b8c4d4";
    ctx.beginPath();
    ctx.arc(mx, my, moonRadius, 0, Math.PI * 2);
    ctx.fill();
  }

  return { init };
})();
