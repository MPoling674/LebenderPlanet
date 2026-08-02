// Karten-Viewport: laesst die grosse 2D-Karte live der Drehung des kleinen
// 3D-Sidebar-Widgets (js/planet3d.js) folgen — zoomt/pannt kontinuierlich auf
// den Laengengrad, der dort gerade "vorne" sichtbar ist.
//
// js/map.js (PlanetMap) bleibt UNVERAENDERT und macht weiterhin seinen vollen,
// teuren Neuaufbau (Farb-Grids, Supersampling, Marching-Squares-Kuestenlinie)
// nur bei tatsaechlichen Zustandsaenderungen (Tick/Klick/Regler) — dieses
// Modul liest davon nur das fertige Bild und blittet es (billig) auf zwei
// nebeneinanderliegende Canvas-Kopien. Das kontinuierliche Mitlaufen mit der
// Drehung passiert AUSSCHLIESSLICH ueber eine CSS-Transformation dieser
// beiden Kopien (translateX/scaleX), nicht ueber erneutes Rendern — dadurch
// bleibt das jeden-Frame-Update praktisch kostenlos.
//
// Beide Kopien sind vollstaendige, unveraenderte Karten-Abbilder (keine
// gefensterten Ausschnitte) — dadurch funktioniert Klick-Handling exakt wie
// bei der alten PlanetMap.cellAtEvent()-Logik, nur auf zwei Elementen statt
// einem: getBoundingClientRect() liefert bei transformierten Elementen
// automatisch die tatsaechliche Bildschirmposition/-groesse, kein manuelles
// Wraparound-Rechnen noetig.

const MapViewport = (() => {
  // Sichtbarer Ausschnitt: halbe Kartenbreite (Laengengrad) auf einmal.
  const ZOOM = 2;

  let viewport = null;
  let strip = null;
  let canvasA = null;
  let canvasB = null;
  let source = null; // #planet-canvas — die von PlanetMap befuellte Bildquelle
  let onCellClickCallback = null;
  let onCellHoverCallback = null;
  let displayWidth = 0;
  let displayHeight = 0;

  function init(viewportEl, sourceCanvas) {
    viewport = viewportEl;
    source = sourceCanvas;
    if (!viewport || !source) return;

    strip = document.createElement("div");
    strip.id = "map-strip";
    canvasA = document.createElement("canvas");
    canvasB = document.createElement("canvas");
    [canvasA, canvasB].forEach((c) => {
      c.width = source.width;
      c.height = source.height;
      c.className = "map-strip-canvas";
      strip.appendChild(c);
    });
    viewport.appendChild(strip);

    layout();
    [canvasA, canvasB].forEach((c) => {
      c.addEventListener("click", handleClick);
      c.addEventListener("mousemove", handleMouseMove);
      c.addEventListener("mouseleave", handleMouseLeave);
    });

    syncFromSource();
    requestAnimationFrame(frame);
  }

  // Feste Anzeigegroesse einmalig aus der verfuegbaren Viewport-Breite
  // berechnet (wie der Rest des Projekts behandelt auch dieses Modul
  // Fenstergroessenaenderungen nicht gesondert, siehe #planet-canvas-Muster
  // in style.css).
  function layout() {
    const viewportWidth = viewport.clientWidth;
    displayWidth = viewportWidth * ZOOM;
    displayHeight = displayWidth / (GRID_WIDTH / GRID_HEIGHT);
    // BUGFIX: hier stand faelschlich "displayHeight / ZOOM" — das machte den
    // Viewport nur halb so hoch wie der (auf ZOOM-fache Breite gestreckte)
    // Kartenstreifen tatsaechlich ist, wodurch overflow:hidden die komplette
    // untere Haelfte der Karte abschnitt (weder sichtbar noch anklickbar,
    // gemeldeter Fehler). Der Viewport muss die VOLLE Streifenhoehe zeigen,
    // da vertikal (Breitengrad) bewusst NICHT gezoomt/gepannt wird (siehe
    // Datei-Kommentar oben) — nur die Breite wird auf ZOOM gestreckt.
    viewport.style.height = displayHeight + "px";
    [canvasA, canvasB].forEach((c) => {
      c.style.width = displayWidth + "px";
      c.style.height = displayHeight + "px";
    });
  }

  // Von main.js nach JEDEM PlanetMap.render() aufgerufen — billiger Blit des
  // fertigen Kartenbilds auf beide Streifen-Kopien, keine eigene Berechnung.
  function syncFromSource() {
    if (!canvasA) return;
    [canvasA, canvasB].forEach((c) => {
      c.getContext("2d").drawImage(source, 0, 0);
    });
  }

  function frame() {
    if (strip) {
      const lonFrac = Planet3D.currentLongitudeFraction();
      const viewportWidth = viewport.clientWidth;
      let shift = lonFrac * displayWidth - viewportWidth / 2;
      shift = ((shift % displayWidth) + displayWidth) % displayWidth;
      strip.style.transform = `translateX(${-shift}px)`;
    }
    requestAnimationFrame(frame);
  }

  function onCellClick(cb) {
    onCellClickCallback = cb;
  }

  function onCellHover(cb) {
    onCellHoverCallback = cb;
  }

  // Identisches Prinzip wie PlanetMap.cellAtEvent() (js/map.js) — jede der
  // beiden Kopien ist eine VOLLSTAENDIGE, unveraenderte Karte, daher reicht
  // die normale Canvas-lokale Umrechnung, kein Wraparound-Sonderfall noetig.
  function cellAtEvent(evt) {
    const rect = evt.currentTarget.getBoundingClientRect();
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

  function handleMouseMove(evt) {
    if (!onCellHoverCallback) return;
    const cell = cellAtEvent(evt);
    onCellHoverCallback(cell ? cell.x : null, cell ? cell.y : null, evt.clientX, evt.clientY);
  }

  function handleMouseLeave() {
    if (onCellHoverCallback) onCellHoverCallback(null, null, 0, 0);
  }

  return { init, onCellClick, onCellHover, syncFromSource };
})();
