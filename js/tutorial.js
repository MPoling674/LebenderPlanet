// Geführte Einführung (6 Schritte) — zeigt sich beim ersten Laden automatisch
// (localStorage-Flag "lp-tutorial-done"), danach über den "Tutorial"-Button im
// Schnellstart-Bereich. Spotlight via box-shadow-Trick: #tutorial-spot wird auf
// das Ziel-Element positioniert und wirft einen 9999px-Schatten auf den Rest der
// Seite — kein separates Overlay-Element nötig, kein pointer-events-Block auf
// Bereiche außerhalb (der Schatten ist ein CSS-Effekt, kein DOM-Knoten).

const Tutorial = (() => {
  const STEPS = [
    {
      title: "Dein Planet",
      text: "Die Karte zeigt deinen Planeten in Echtzeit. Sandgelb = heiße Wüste, Graugrün = Tundra, Weiß = Eiskappe, Blau = Ozean. Die Klimazonen reagieren direkt auf deine Einstellungen.",
      highlight: "#planet-canvas",
    },
    {
      title: "Kennzahlen im HUD",
      text: "Temperatur und Zeitstempel sind immer sichtbar. Die fünf Tabs (Übersicht, Zivilisation, Atmosphäre …) sortieren die weiteren Werte übersichtlich — nie alle auf einmal.",
      highlight: "#hud",
    },
    {
      title: "Atmosphäre als Thermostat",
      text: "CO₂ ist der wichtigste Hebel: mehr CO₂ → wärmer → weniger Eis → mehr bebaubare Fläche. Sauerstoff entscheidet, welche Tier- und Pflanzenarten entstehen können. Klicke in der rechten Sidebar auf 'Atmosphäre'.",
      highlight: "#sidebar-tabs",
    },
    {
      title: "Simulation starten",
      text: "Der Zeitregler oben in der Sidebar steuert die Geschwindigkeit. Bei '100 Jahre/Sek' siehst du live: Eis schmilzt, Vegetation breitet sich aus, erste Fauna erscheint.",
      highlight: "#panel-time",
    },
    {
      title: "Schnellstart-Szenarien",
      text: "'Heutige Erde' startet mit voll entwickeltem Leben. 'Eisplanet' und 'Mars terraformen' sind Herausforderungen. 'Supererde' bietet freundliche Startbedingungen für die Evolution.",
      highlight: "#quickstart",
    },
    {
      title: "Bereit!",
      text: "Klicke auf Kartenzellen für Detailinfos zum Terrain. Meilensteine (erste Vegetation, erste Stadt …) erscheinen als kurze Popups oben rechts. Nutze 'Terraforming' in der Sidebar für direkten Eingriff. Viel Erfolg!",
      highlight: null,
    },
  ];

  let step = 0;
  let spotEl = null;
  let cardEl = null;

  function init() {
    spotEl = document.getElementById("tutorial-spot");
    cardEl = document.getElementById("tutorial-card");
    if (!spotEl || !cardEl) return;

    document.getElementById("tutorial-next").addEventListener("click", next);
    document.getElementById("tutorial-prev").addEventListener("click", prev);
    document.getElementById("tutorial-skip").addEventListener("click", finish);
    const startBtn = document.getElementById("tutorial-start-btn");
    if (startBtn) startBtn.addEventListener("click", start);

    document.addEventListener("keydown", (e) => {
      if (cardEl.classList.contains("hidden")) return;
      if (e.key === "Escape") finish();
      if (e.key === "ArrowRight") next();
      if (e.key === "ArrowLeft") prev();
    });

    if (!localStorage.getItem("lp-tutorial-done")) {
      // 80 ms nach window.load reichen aus, damit die Flex-/Canvas-Größen stabil
      // sind und getBoundingClientRect() die richtigen Werte liefert. setTimeout
      // feuert auch in nicht-sichtbaren Tabs (anders als requestAnimationFrame).
      // Falls window.load bereits gefeuert hat, starten wir sofort per Timeout.
      const autoStart = () => setTimeout(start, 80);
      if (document.readyState === "complete") {
        autoStart();
      } else {
        window.addEventListener("load", autoStart, { once: true });
      }
    }
  }

  function start() {
    step = 0;
    cardEl.classList.remove("hidden");
    showStep();
  }

  function showStep() {
    const s = STEPS[step];

    document.getElementById("tutorial-step-title").textContent = s.title;
    document.getElementById("tutorial-step-text").textContent = s.text;
    document.getElementById("tutorial-counter").textContent = `Schritt ${step + 1} von ${STEPS.length}`;
    document.getElementById("tutorial-prev").disabled = step === 0;
    document.getElementById("tutorial-next").textContent =
      step === STEPS.length - 1 ? "Fertig ✓" : "Weiter →";

    if (s.highlight) {
      const target = document.querySelector(s.highlight);
      if (target) {
        const rect = target.getBoundingClientRect();
        const pad = 6;
        Object.assign(spotEl.style, {
          display: "block",
          top: `${rect.top - pad}px`,
          left: `${rect.left - pad}px`,
          width: `${rect.width + pad * 2}px`,
          height: `${rect.height + pad * 2}px`,
        });
      }
    } else {
      spotEl.style.display = "none";
    }
  }

  function next() {
    if (step >= STEPS.length - 1) { finish(); return; }
    step++;
    showStep();
  }

  function prev() {
    if (step <= 0) return;
    step--;
    showStep();
  }

  function finish() {
    cardEl.classList.add("hidden");
    spotEl.style.display = "none";
    localStorage.setItem("lp-tutorial-done", "1");
  }

  return { init, start };
})();
