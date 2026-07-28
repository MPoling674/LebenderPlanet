// Charts: Canvas-basierte Diagramme (Temperaturverlauf, Atmosphaeren-
// Zusammensetzung) — reines Vanilla-Canvas-Zeichnen, keine externe Bibliothek,
// gleicher Stil wie map.js. Farben aus der kategorialen dataviz-Referenzpalette
// (Dark-Mode-Stufen, als Set gegen Farbfehlsichtigkeit dokumentiert) — bewusst
// NICHT die im Skill markierte riskante Nachbarschaft "orange neben gelb"
// verwendet, sondern vier weiter auseinanderliegende Slots (blau/violett/rot/
// aqua), zusaetzlich IMMER mit Text-Label/Legende, damit Farbe nie allein die
// Bedeutung traegt.

const Charts = (() => {
  // Temperaturverlauf wird bewusst NICHT serialisiert/gespeichert (siehe
  // resetHistory()) — ein geladener Spielstand zeigt den Verlauf einfach ab dem
  // Ladezeitpunkt, statt die Speicherstruktur um eine unbegrenzt wachsende
  // Zeitreihe zu erweitern. Ausduennen statt Abschneiden bei Ueberlaenge: halbiert
  // die Aufloesung, behaelt aber den GESAMTEN bisherigen Zeitraum sichtbar.
  const MAX_HISTORY_POINTS = 400;
  let temperatureHistory = []; // [{year, temp}]

  function recordTemperatureSample(year, temp) {
    temperatureHistory.push({ year, temp });
    if (temperatureHistory.length > MAX_HISTORY_POINTS) {
      temperatureHistory = temperatureHistory.filter((_, i) => i % 2 === 0);
    }
  }

  function resetHistory() {
    temperatureHistory = [];
  }

  const CHART_TEXT = "#93a3b8";
  const CHART_TEXT_STRONG = "#e6e8ec";
  const CHART_GRID = "#223047";
  const TEMP_LINE_COLOR = "#d95926";

  function renderTemperatureChart(canvas) {
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const w = canvas.width, h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    if (temperatureHistory.length < 2) {
      ctx.fillStyle = CHART_TEXT;
      ctx.font = "11px 'Segoe UI', sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("Noch nicht genug Daten…", w / 2, h / 2);
      return;
    }

    const padding = { top: 10, right: 12, bottom: 20, left: 38 };
    const plotW = w - padding.left - padding.right;
    const plotH = h - padding.top - padding.bottom;

    const years = temperatureHistory.map((p) => p.year);
    const temps = temperatureHistory.map((p) => p.temp);
    const minYear = years[0], maxYear = years[years.length - 1];
    let minTemp = Math.min(...temps), maxTemp = Math.max(...temps);
    if (minTemp === maxTemp) { minTemp -= 1; maxTemp += 1; }
    const tempPad = (maxTemp - minTemp) * 0.1;
    minTemp -= tempPad;
    maxTemp += tempPad;

    const xFor = (year) => padding.left + ((year - minYear) / (maxYear - minYear || 1)) * plotW;
    const yFor = (temp) => padding.top + plotH - ((temp - minTemp) / (maxTemp - minTemp || 1)) * plotH;

    // Gitterlinien zurueckhaltend im Hintergrund (dataviz-Skill: "recessive grid").
    ctx.strokeStyle = CHART_GRID;
    ctx.lineWidth = 1;
    [0, 0.5, 1].forEach((f) => {
      const y = padding.top + plotH * f;
      ctx.beginPath();
      ctx.moveTo(padding.left, y);
      ctx.lineTo(w - padding.right, y);
      ctx.stroke();
    });

    ctx.fillStyle = CHART_TEXT;
    ctx.font = "10px 'Segoe UI', sans-serif";
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    [maxTemp, (minTemp + maxTemp) / 2, minTemp].forEach((t, i) => {
      ctx.fillText(t.toFixed(1) + "°", padding.left - 6, padding.top + plotH * (i / 2));
    });

    // 2px Linie (dataviz-Skill Mark-Spec).
    ctx.strokeStyle = TEMP_LINE_COLOR;
    ctx.lineWidth = 2;
    ctx.lineJoin = "round";
    ctx.beginPath();
    temperatureHistory.forEach((p, i) => {
      const x = xFor(p.year), y = yFor(p.temp);
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    ctx.stroke();

    // Direktes Label am aktuellen Endpunkt statt Legende (eine einzelne Serie
    // braucht keine, siehe dataviz-Skill) — Titel der Sektion nennt die Serie.
    const last = temperatureHistory[temperatureHistory.length - 1];
    const lx = xFor(last.year), ly = yFor(last.temp);
    ctx.fillStyle = TEMP_LINE_COLOR;
    ctx.beginPath();
    ctx.arc(lx, ly, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = CHART_TEXT_STRONG;
    ctx.font = "bold 11px 'Segoe UI', sans-serif";
    const labelRight = lx > w - 60;
    ctx.textAlign = labelRight ? "right" : "left";
    ctx.textBaseline = "bottom";
    ctx.fillText(`${last.temp.toFixed(1)} °C`, lx + (labelRight ? -6 : 6), ly - 4);

    ctx.fillStyle = CHART_TEXT;
    ctx.font = "10px 'Segoe UI', sans-serif";
    ctx.textBaseline = "top";
    ctx.textAlign = "left";
    ctx.fillText(`Jahr ${minYear}`, padding.left, h - padding.bottom + 4);
    ctx.textAlign = "right";
    ctx.fillText(`Jahr ${maxYear}`, w - padding.right, h - padding.bottom + 4);
  }

  const GAS_CHART_COLORS = { o2: "#3987e5", n2: "#9085e9", co2: "#e66767", ch4: "#199e70" };

  // CO2/CH4 sind in ppm gespeichert, O2/N2 in %-Volumenanteilen (siehe GASES in
  // data.js) — fuer eine EINZIGE Kuchen-/Donut-Darstellung "wie viel vom
  // Gesamtvolumen" werden CO2/CH4 auf dieselbe %-Basis umgerechnet (ppm/10000).
  // Realistisch bleiben sie dabei winzige Segmente, das ist gewollt (spiegelt die
  // reale Zusammensetzung wider) — die Legende zeigt zusaetzlich den exakten
  // ppm-Wert, damit die Information trotz unsichtbar duennem Segment ablesbar bleibt.
  function renderCompositionChart(canvas, legendEl) {
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const w = canvas.width, h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    const o2 = Atmosphere.get("o2");
    const n2 = Atmosphere.get("n2");
    const co2 = Atmosphere.get("co2");
    const ch4 = Atmosphere.get("ch4");
    const segments = [
      { id: "n2", label: "Stickstoff (N₂)", value: n2, display: n2.toFixed(1) + " %" },
      { id: "o2", label: "Sauerstoff (O₂)", value: o2, display: o2.toFixed(1) + " %" },
      { id: "co2", label: "Kohlendioxid (CO₂)", value: co2 / 10000, display: co2.toFixed(0) + " ppm" },
      { id: "ch4", label: "Methan (CH₄)", value: ch4 / 10000, display: ch4.toFixed(1) + " ppm" },
    ];
    const total = segments.reduce((s, seg) => s + seg.value, 0) || 1;

    const cx = w / 2, cy = h / 2;
    const outerRadius = Math.min(w, h) / 2 - 4;
    const innerRadius = outerRadius * 0.55;
    let angle = -Math.PI / 2;
    // 2px Oberflaechen-Luecke zwischen Segmenten (dataviz-Skill Mark-Spec).
    const gapRad = 0.02;
    segments.forEach((seg) => {
      const segAngle = (seg.value / total) * Math.PI * 2;
      const from = angle + Math.min(gapRad, segAngle / 4);
      const to = angle + segAngle - Math.min(gapRad, segAngle / 4);
      if (to > from) {
        ctx.beginPath();
        ctx.arc(cx, cy, outerRadius, from, to);
        ctx.arc(cx, cy, innerRadius, to, from, true);
        ctx.closePath();
        ctx.fillStyle = GAS_CHART_COLORS[seg.id];
        ctx.fill();
      }
      angle += segAngle;
    });

    if (legendEl) {
      legendEl.innerHTML = segments.map((seg) => `
        <li class="chart-legend-item">
          <span class="chart-swatch" style="background:${GAS_CHART_COLORS[seg.id]}"></span>
          <span>${seg.label}: <strong>${seg.display}</strong></span>
        </li>
      `).join("");
    }
  }

  return { recordTemperatureSample, resetHistory, renderTemperatureChart, renderCompositionChart };
})();
