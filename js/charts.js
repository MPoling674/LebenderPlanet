// Charts: Canvas-basierte Diagramme (Temperaturverlauf, Atmosphaeren-
// Zusammensetzung) — reines Vanilla-Canvas-Zeichnen, keine externe Bibliothek,
// gleicher Stil wie map.js. Farben aus der kategorialen dataviz-Referenzpalette
// (Dark-Mode-Stufen, als Set gegen Farbfehlsichtigkeit dokumentiert) — bewusst
// NICHT die im Skill markierte riskante Nachbarschaft "orange neben gelb"
// verwendet, sondern vier weiter auseinanderliegende Slots (blau/violett/rot/
// aqua), zusaetzlich IMMER mit Text-Label/Legende, damit Farbe nie allein die
// Bedeutung traegt.

const Charts = (() => {
  // Verlaufsdaten (Temperatur, CO2, Bevoelkerung) werden bewusst NICHT
  // serialisiert/gespeichert (siehe resetHistory()) — ein geladener Spielstand
  // zeigt den Verlauf einfach ab dem Ladezeitpunkt, statt die Speicherstruktur um
  // eine unbegrenzt wachsende Zeitreihe zu erweitern. Ausduennen statt Abschneiden
  // bei Ueberlaenge: halbiert die Aufloesung, behaelt aber den GESAMTEN bisherigen
  // Zeitraum sichtbar. Ein EINZIGES Array (statt drei getrennter) haelt die drei
  // Groessen desselben Jahres zusammen, damit sie in der Korrelationsgrafik
  // punktgenau nebeneinander liegen.
  const MAX_HISTORY_POINTS = 400;
  let history = []; // [{year, temp, co2, population, oceanPH, oceanO2, solar}]

  // Options-Objekt statt positionaler Parameter (urspruenglich nur year/temp/
  // co2/population) — mit den drei neuen Feedback-Groessen (Ozean-pH/-O2,
  // Sonnenleuchtkraft) waeren positionale Parameter an dieser Stelle nicht mehr
  // lesbar gewesen.
  function recordSample(sample) {
    history.push({ ...sample });
    if (history.length > MAX_HISTORY_POINTS) {
      history = history.filter((_, i) => i % 2 === 0);
    }
  }

  function resetHistory() {
    history = [];
  }

  const CHART_TEXT = "#93a3b8";
  const CHART_TEXT_STRONG = "#e6e8ec";
  const CHART_GRID = "#223047";
  const TEMP_LINE_COLOR = "#d95926";

  // Generischer Einzelserien-Linienchart: Temperatur-, CO2- und Bevoelkerungsverlauf
  // teilen sich Achsen-/Gitter-/Label-Logik (identisch zum bisherigen
  // renderTemperatureChart), unterscheiden sich nur in Wertzugriff, Farbe und
  // Formatierung — daher als EIN Parameter-Objekt statt drei fast identischer
  // Funktionskoerper.
  function renderSeriesChart(canvas, { getValue, color, format, emptyText }) {
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const w = canvas.width, h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    const points = history.filter((p) => getValue(p) != null);
    if (points.length < 2) {
      ctx.fillStyle = CHART_TEXT;
      ctx.font = "11px 'Segoe UI', sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(emptyText || "Noch nicht genug Daten…", w / 2, h / 2);
      return;
    }

    const padding = { top: 10, right: 12, bottom: 20, left: 46 };
    const plotW = w - padding.left - padding.right;
    const plotH = h - padding.top - padding.bottom;

    const years = points.map((p) => p.year);
    const values = points.map(getValue);
    const minYear = years[0], maxYear = years[years.length - 1];
    let minVal = Math.min(...values), maxVal = Math.max(...values);
    if (minVal === maxVal) { minVal -= 1; maxVal += 1; }
    const valPad = (maxVal - minVal) * 0.1;
    minVal -= valPad;
    maxVal += valPad;

    const xFor = (year) => padding.left + ((year - minYear) / (maxYear - minYear || 1)) * plotW;
    const yFor = (val) => padding.top + plotH - ((val - minVal) / (maxVal - minVal || 1)) * plotH;

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
    [maxVal, (minVal + maxVal) / 2, minVal].forEach((v, i) => {
      ctx.fillText(format(v), padding.left - 6, padding.top + plotH * (i / 2));
    });

    // 2px Linie (dataviz-Skill Mark-Spec).
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.lineJoin = "round";
    ctx.beginPath();
    points.forEach((p, i) => {
      const x = xFor(p.year), y = yFor(getValue(p));
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    ctx.stroke();

    // Direktes Label am aktuellen Endpunkt statt Legende (eine einzelne Serie
    // braucht keine, siehe dataviz-Skill) — Titel der Sektion nennt die Serie.
    const last = points[points.length - 1];
    const lx = xFor(last.year), ly = yFor(getValue(last));
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(lx, ly, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = CHART_TEXT_STRONG;
    ctx.font = "bold 11px 'Segoe UI', sans-serif";
    const labelRight = lx > w - 60;
    ctx.textAlign = labelRight ? "right" : "left";
    ctx.textBaseline = "bottom";
    ctx.fillText(format(getValue(last)), lx + (labelRight ? -6 : 6), ly - 4);

    ctx.fillStyle = CHART_TEXT;
    ctx.font = "10px 'Segoe UI', sans-serif";
    ctx.textBaseline = "top";
    ctx.textAlign = "left";
    ctx.fillText(formatSimTime(minYear), padding.left, h - padding.bottom + 4);
    ctx.textAlign = "right";
    ctx.fillText(formatSimTime(maxYear), w - padding.right, h - padding.bottom + 4);
  }

  function renderTemperatureChart(canvas) {
    renderSeriesChart(canvas, {
      getValue: (p) => p.temp,
      color: TEMP_LINE_COLOR,
      format: (v) => v.toFixed(1) + "°",
    });
  }

  // Dieselbe Farbe wie CO2 im Kuchendiagramm (Farbe folgt der Groesse ueber
  // Grafiken hinweg, nicht dem Zufall, siehe dataviz-Skill "color follows the
  // entity"). Gruen ist in dieser Datei bislang unbelegt (Referenzpalette Slot 6)
  // und passt inhaltlich zu "Leben/Bevoelkerung".
  const CO2_LINE_COLOR = "#e66767";
  const POPULATION_LINE_COLOR = "#008300";

  function renderCo2Chart(canvas) {
    renderSeriesChart(canvas, {
      getValue: (p) => p.co2,
      color: CO2_LINE_COLOR,
      format: (v) => v.toFixed(0) + " ppm",
    });
  }

  // Kompakte Formatierung grosser Einwohnerzahlen (Tsd./Mio./Mrd.) — bei
  // planetaren Bevoelkerungszahlen waeren rohe Ziffern auf der schmalen
  // Sidebar-Achse kaum lesbar.
  function formatPopulation(v) {
    if (v >= 1e9) return (v / 1e9).toFixed(1) + " Mrd.";
    if (v >= 1e6) return (v / 1e6).toFixed(1) + " Mio.";
    if (v >= 1e3) return (v / 1e3).toFixed(0) + " Tsd.";
    return v.toFixed(0);
  }

  function renderPopulationChart(canvas) {
    renderSeriesChart(canvas, {
      getValue: (p) => p.population,
      color: POPULATION_LINE_COLOR,
      format: formatPopulation,
      emptyText: "Noch keine Bevölkerung…",
    });
  }

  // Kombinationsgrafik CO2 + Bevoelkerung: EIN gemeinsames Diagramm, damit sich
  // zeitliche Zusammenhaenge (steigt die Bevoelkerung parallel zum CO2-Anstieg?)
  // auf einen Blick ablesen lassen. Bewusst KEIN Dual-Axis-Diagramm (zwei
  // Y-Skalen) — das dataviz-Skill-Anti-Pattern dazu: die Ausrichtung zweier
  // frei waehlbarer Skalen zueinander erfindet eine Korrelation, die in den
  // Daten gar nicht steckt. Stattdessen wird JEDE Reihe UNABHAENGIG auf ihre
  // EIGENE Min/Max-Spanne innerhalb des sichtbaren Fensters normiert (0-100) und
  // auf einer GEMEINSAMEN Achse geplottet — das zeigt den VERLAUF (steigt/faellt
  // gemeinsam?) korrekt. Die absoluten Werte stehen in den Einzelgrafiken
  // daneben; hier deshalb bewusst KEINE Achsenbeschriftung in ppm/Einwohnern,
  // um nicht faelschlich absolute Vergleichbarkeit zu suggerieren.
  function renderCorrelationChart(canvas, legendEl) {
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const w = canvas.width, h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    const points = history.filter((p) => p.co2 != null && p.population != null);
    if (points.length < 2) {
      ctx.fillStyle = CHART_TEXT;
      ctx.font = "11px 'Segoe UI', sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("Noch nicht genug Daten…", w / 2, h / 2);
      if (legendEl) legendEl.innerHTML = "";
      return;
    }

    const padding = { top: 10, right: 12, bottom: 20, left: 12 };
    const plotW = w - padding.left - padding.right;
    const plotH = h - padding.top - padding.bottom;
    const years = points.map((p) => p.year);
    const minYear = years[0], maxYear = years[years.length - 1];
    const xFor = (year) => padding.left + ((year - minYear) / (maxYear - minYear || 1)) * plotW;
    const yFor = (norm) => padding.top + plotH - (norm / 100) * plotH;

    // Normiert eine Reihe unabhaengig von der anderen auf 0-100 innerhalb des
    // aktuell sichtbaren Fensters (siehe Funktionskommentar oben).
    function normalize(getValue) {
      const vals = points.map(getValue);
      let min = Math.min(...vals), max = Math.max(...vals);
      if (min === max) { min -= 1; max += 1; }
      return vals.map((v) => ((v - min) / (max - min)) * 100);
    }
    const co2Norm = normalize((p) => p.co2);
    const popNorm = normalize((p) => p.population);

    ctx.strokeStyle = CHART_GRID;
    ctx.lineWidth = 1;
    [0, 0.5, 1].forEach((f) => {
      const y = padding.top + plotH * f;
      ctx.beginPath();
      ctx.moveTo(padding.left, y);
      ctx.lineTo(w - padding.right, y);
      ctx.stroke();
    });

    function drawLine(norms, color) {
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.lineJoin = "round";
      ctx.beginPath();
      points.forEach((p, i) => {
        const x = xFor(p.year), y = yFor(norms[i]);
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      });
      ctx.stroke();
      const lastX = xFor(points[points.length - 1].year), lastY = yFor(norms[norms.length - 1]);
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(lastX, lastY, 3, 0, Math.PI * 2);
      ctx.fill();
    }
    drawLine(co2Norm, CO2_LINE_COLOR);
    drawLine(popNorm, POPULATION_LINE_COLOR);

    ctx.fillStyle = CHART_TEXT;
    ctx.font = "10px 'Segoe UI', sans-serif";
    ctx.textBaseline = "top";
    ctx.textAlign = "left";
    ctx.fillText(formatSimTime(minYear), padding.left, h - padding.bottom + 4);
    ctx.textAlign = "right";
    ctx.fillText(formatSimTime(maxYear), w - padding.right, h - padding.bottom + 4);

    // Legende PFLICHT ab 2 Serien (dataviz-Skill) — Farbe traegt hier die
    // Identitaet, da beide Linien auf derselben normierten Achse liegen.
    if (legendEl) {
      legendEl.innerHTML = `
        <li class="chart-legend-item">
          <span class="chart-swatch" style="background:${CO2_LINE_COLOR}"></span>
          <span>CO₂ (relativ zur eigenen Spanne)</span>
        </li>
        <li class="chart-legend-item">
          <span class="chart-swatch" style="background:${POPULATION_LINE_COLOR}"></span>
          <span>Weltbevölkerung (relativ zur eigenen Spanne)</span>
        </li>
      `;
    }
  }

  // Ozean-pH: Violett (gleicher Slot wie N2 im Kuchendiagramm — beides
  // "chemische" Groessen, siehe dataviz-Skill "color follows the entity").
  const OCEAN_PH_LINE_COLOR = "#9085e9";
  // Ozean-O2: dieselbe Farbe wie O2 im Kuchendiagramm (GAS_CHART_COLORS.o2
  // weiter unten) — gleiche Bedeutung (Sauerstoff), nur ein anderer Kontext.
  const OCEAN_O2_LINE_COLOR = "#3987e5";
  const SOLAR_LINE_COLOR = "#e0a030"; // warmes Gold, Sonnen-Assoziation, von den uebrigen Farben klar abgesetzt

  function renderOceanPhChart(canvas) {
    renderSeriesChart(canvas, {
      getValue: (p) => p.oceanPH,
      color: OCEAN_PH_LINE_COLOR,
      format: (v) => v.toFixed(2),
      emptyText: "Noch nicht genug Daten…",
    });
  }

  function renderOceanO2Chart(canvas) {
    renderSeriesChart(canvas, {
      getValue: (p) => p.oceanO2,
      color: OCEAN_O2_LINE_COLOR,
      format: (v) => v.toFixed(0) + " %",
      emptyText: "Noch nicht genug Daten…",
    });
  }

  function renderSolarChart(canvas) {
    renderSeriesChart(canvas, {
      getValue: (p) => p.solar,
      color: SOLAR_LINE_COLOR,
      format: (v) => v.toFixed(0) + " %",
      emptyText: "Noch nicht genug Daten…",
    });
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

  return {
    recordSample,
    resetHistory,
    renderTemperatureChart,
    renderCompositionChart,
    renderCo2Chart,
    renderPopulationChart,
    renderCorrelationChart,
    renderOceanPhChart,
    renderOceanO2Chart,
    renderSolarChart,
  };
})();
