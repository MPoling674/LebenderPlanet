// Atmosphäre: Gasanteile als State, vom Spieler frei einstellbar (Sandbox, kein
// Ressourcenmodell), plus die daraus abgeleitete Treibhauswirkung.

const Atmosphere = (() => {
  let gases = {};

  function init() {
    gases = {};
    GASES.forEach((g) => {
      gases[g.id] = g.start;
    });
  }

  function get(gasId) {
    return gases[gasId] || 0;
  }

  function set(gasId, value) {
    const g = getGas(gasId);
    gases[gasId] = clamp(value, g.min, g.max);
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
