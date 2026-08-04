// Spielziel-System — vier wählbare Herausforderungen plus Freies Spiel.
// Goals.tick(year) wird von main.js in jedem Simulationsschritt aufgerufen und
// prüft Bedingungen sowie Zeitlimits. Bei Abschluss oder Ablauf feuert es ein
// "complete"- bzw. "fail"-Event, das UI.showGoalResult() triggert.

const Goals = (() => {
  const GOALS = [
    {
      id: "free",
      title: "Freies Spiel",
      description: "Kein Ziel gesetzt — experimentiere frei.",
      timeLimit: null,
      conditions: [],
    },
    {
      id: "mars",
      title: "Mars terraformen",
      description: "Mache den Mars in 20 Jahrtausenden lebensfähig.",
      timeLimit: 20000,
      conditions: [
        { label: "Temperatur > 0 °C",  check: () => Climate.globalTemperature() > 0 },
        { label: "Sauerstoff > 15 %",  check: () => Atmosphere.get("o2") > 15 },
        { label: "Ozeane > 10 %",      check: () => Climate.waterCoverage() > 0.10 },
        { label: "Fauna vorhanden",    check: () => Planet.stats().avgFauna > 0 },
      ],
    },
    {
      id: "ice",
      title: "Schneeball-Erde auftauen",
      description: "Taue den gefrorenen Planeten auf und bringe Leben hervor.",
      timeLimit: null,
      conditions: [
        { label: "Eis < 20 %",         check: () => Climate.iceCoverage() < 0.20 },
        { label: "Temperatur > 5 °C",  check: () => Climate.globalTemperature() > 5 },
        { label: "Fauna vorhanden",    check: () => Planet.stats().avgFauna > 0 },
      ],
    },
    {
      id: "green",
      title: "Grüne Zivilisation",
      description: "Erreiche 1 Milliarde Einwohner ohne Klimakollaps.",
      timeLimit: null,
      conditions: [
        { label: "Bevölkerung ≥ 1 Mrd.", check: () => Planet.stats().totalPopulation >= 1e9 },
        { label: "CO₂ < 500 ppm",        check: () => Atmosphere.get("co2") < 500 },
        { label: "Biodiversität > 50 %", check: () => Planet.stats().avgFauna > 50 },
      ],
    },
  ];

  let activeId = "free";
  let startYear = 0;
  let state = "idle"; // "idle" | "running" | "won" | "lost"
  const listeners = {};

  function find(id) { return GOALS.find(g => g.id === id) || GOALS[0]; }

  function setGoal(id, year) {
    activeId = id;
    startYear = year;
    state = id === "free" ? "idle" : "running";
  }

  function tick(year) {
    if (state !== "running") return;
    const goal = find(activeId);

    if (goal.timeLimit !== null && year - startYear > goal.timeLimit) {
      state = "lost";
      emit("fail", goal);
      return;
    }

    if (goal.conditions.every(c => { try { return c.check(); } catch { return false; } })) {
      state = "won";
      emit("complete", goal);
    }
  }

  function status(year) {
    const goal = find(activeId);
    return {
      goal,
      state,
      elapsed: year - startYear,
      conditions: goal.conditions.map(c => {
        let met;
        try { met = c.check(); } catch { met = false; }
        return { label: c.label, met };
      }),
    };
  }

  function on(event, fn) { listeners[event] = fn; }
  function emit(event, data) { if (listeners[event]) listeners[event](data); }

  return { GOALS, setGoal, tick, status, on };
})();
