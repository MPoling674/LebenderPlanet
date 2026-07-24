// Atmosphäre: Gasanteile als State, vom Spieler frei einstellbar (Sandbox, kein
// Ressourcenmodell), plus die daraus abgeleitete Treibhauswirkung.

const Atmosphere = (() => {
  let gases = {};

  // O2 und N2 sind Volumenanteile DERSELBEN Atmosphaere, kein unabhaengiges
  // Wertepaar — siehe ATMOSPHERE_MAJOR_GAS_TOTAL-Kommentar in data.js. Aendert
  // sich eines, gibt das andere im gleichen Umfang nach (set() unten).
  const GAS_PAIRS = { o2: "n2", n2: "o2" };

  function init() {
    gases = {};
    GASES.forEach((g) => {
      if (g.id === "n2") return; // wird unten aus O2 abgeleitet, nicht unabhaengig gewuerfelt
      const variation = g.startVariation || 0;
      const randomized = g.start + (Math.random() * 2 - 1) * variation;
      gases[g.id] = clamp(randomized, g.min, g.max);
    });
    const n2Gas = getGas("n2");
    gases.n2 = clamp(ATMOSPHERE_MAJOR_GAS_TOTAL - gases.o2, n2Gas.min, n2Gas.max);
  }

  function get(gasId) {
    return gases[gasId] || 0;
  }

  // Fuer die meisten Gase eine simple Klemmung. O2/N2 sind gekoppelt: der
  // angeforderte Wert wird nur so weit uebernommen, wie der GEKOPPELTE Wert
  // tatsaechlich nachgeben kann (er wird ebenfalls geklemmt) — dadurch bleibt die
  // Summe beider IMMER erhalten (kein Wert kann auf Kosten des anderen ueber
  // dessen eigene Grenze hinaus wachsen, z.B. O2 nicht weiter steigen, wenn N2
  // bereits bei 0 angekommen ist).
  function set(gasId, value) {
    const g = getGas(gasId);
    const requested = clamp(value, g.min, g.max);
    const pairedId = GAS_PAIRS[gasId];
    if (!pairedId) {
      gases[gasId] = requested;
      return;
    }
    const requestedDelta = requested - get(gasId);
    const pg = getGas(pairedId);
    const pairedOld = get(pairedId);
    const pairedNew = clamp(pairedOld - requestedDelta, pg.min, pg.max);
    const actualDelta = pairedOld - pairedNew; // wie weit der Partner TATSAECHLICH nachgab
    gases[pairedId] = pairedNew;
    gases[gasId] = clamp(get(gasId) + actualDelta, g.min, g.max);
  }

  function adjust(gasId, delta) {
    set(gasId, get(gasId) + delta);
  }

  // CO2-Äquivalent in ppm: CO2 plus andere Treibhausgase, gewichtet mit ihrer
  // relativen Treibhauspotenz (CH4-potency=25 ⇒ 1 ppm CH4 zählt wie 25 ppm CO2).
  // O2 hat potency=0 und trägt nicht bei (real ist Sauerstoff kein Treibhausgas).
  function co2Equivalent() {
    let co2eq = 0;
    GASES.forEach((g) => {
      if (g.potency > 0) co2eq += get(g.id) * g.potency;
    });
    return co2eq;
  }

  // Strahlungsantrieb in W/m² — vereinfachte, aber reale IPCC-Näherungsformel für CO2:
  // ΔF = 5.35 · ln(C / C₀). Andere Treibhausgase fließen über das CO2-Äquivalent ein.
  function radiativeForcing() {
    const co2eq = Math.max(1, co2Equivalent());
    return CO2_FORCING_COEFFICIENT * Math.log(co2eq / CO2_PREINDUSTRIAL_PPM);
  }

  function serialize() {
    return { ...gases };
  }

  function restore(saved) {
    init();
    if (saved) Object.assign(gases, saved);
  }

  return { init, get, set, adjust, co2Equivalent, radiativeForcing, serialize, restore };
})();
