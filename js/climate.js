// Klima: Temperatur und Eisbedeckung als eigener State, der sich pro Jahr nur ein
// Stück auf das durch die aktuelle Atmosphäre vorgegebene GLEICHGEWICHT zubewegt
// (Exponential-Glättung) — reale Ozeane/Eisschilde reagieren auf eine neue
// Strahlungsbilanz nur träge, nicht augenblicklich.

const Climate = (() => {
  let currentTemp = BASE_GLOBAL_TEMP;
  let currentIce = BASE_ICE_COVERAGE;
  // Zaehlt Simulationsjahre seit init()/restore() unabhaengig vom UI-Jahreszaehler
  // in main.js — nur fuer die Phase der Milankovitch-Zyklen relevant (siehe
  // orbitalForcing()). orbitalPhase verschiebt jeden der drei Zyklen bei init()
  // zufaellig (analog zur GASES-startVariation in data.js), damit nicht jeder
  // Planet exakt dieselbe Eiszeit-Phasenlage zu Spielbeginn hat.
  let orbitalYear = 0;
  let orbitalPhase = { obliquity: 0, precession: 0, eccentricity: 0 };

  function randomPhase() {
    return Math.random() * Math.PI * 2;
  }

  // Milankovitch-Zyklen (siehe Konstanten-Kommentar in data.js): drei ueberlagerte
  // periodische Schwankungen, die zusaetzlich zum Treibhauseffekt auf das
  // Temperatur-Gleichgewicht wirken. Praezession wird durch die Exzentrizitaet
  // moduliert (real: bei einer kreisrunden Bahn hat die Ausrichtung des Perihels
  // zu den Jahreszeiten keinen Effekt) — eccentricitySignal in [-1,1] dient dafuer
  // gleichgerichtet auf [0,1] als Staerke-Multiplikator.
  function orbitalForcing() {
    const t = orbitalYear;
    const eccentricitySignal = Math.sin((2 * Math.PI * t) / MILANKOVITCH_ECCENTRICITY_PERIOD_YEARS + orbitalPhase.eccentricity);
    const obliquityTerm = MILANKOVITCH_OBLIQUITY_AMPLITUDE
      * Math.sin((2 * Math.PI * t) / MILANKOVITCH_OBLIQUITY_PERIOD_YEARS + orbitalPhase.obliquity);
    const eccentricityStrength = (eccentricitySignal + 1) / 2;
    const precessionTerm = MILANKOVITCH_PRECESSION_AMPLITUDE * eccentricityStrength
      * Math.sin((2 * Math.PI * t) / MILANKOVITCH_PRECESSION_PERIOD_YEARS + orbitalPhase.precession);
    const eccentricityTerm = MILANKOVITCH_ECCENTRICITY_AMPLITUDE * eccentricitySignal;
    return obliquityTerm + precessionTerm + eccentricityTerm;
  }

  // Zielwerte, denen sich currentTemp/currentIce jedes Jahr annähern — das sind
  // die ehemaligen (sofortigen) Formeln aus Phase 1, jetzt nur noch als Gleichgewicht.
  function equilibriumTemperature() {
    const forcing = Atmosphere.radiativeForcing();
    const deltaGhg = CLIMATE_SENSITIVITY * forcing;
    const deltaTotal = deltaGhg * (1 + WATER_VAPOR_AMPLIFICATION);
    return BASE_GLOBAL_TEMP + deltaTotal + orbitalForcing();
  }

  function equilibriumIceCoverage(temp) {
    const delta = temp - BASE_GLOBAL_TEMP;
    return clamp(BASE_ICE_COVERAGE - ICE_TEMP_SENSITIVITY * delta, 0, 1);
  }

  function init() {
    orbitalYear = 0;
    orbitalPhase = { obliquity: randomPhase(), precession: randomPhase(), eccentricity: randomPhase() };
    currentTemp = equilibriumTemperature();
    currentIce = equilibriumIceCoverage(currentTemp);
  }

  // Ein Simulationsjahr: Temperatur und Eis nähern sich mit unterschiedlicher
  // Trägheit ihrem jeweiligen Gleichgewicht an (Temperatur schneller als Eis).
  function tick() {
    orbitalYear += 1;
    const tempTarget = equilibriumTemperature();
    currentTemp += (tempTarget - currentTemp) * TEMP_RELAXATION_RATE;
    const iceTarget = equilibriumIceCoverage(currentTemp);
    currentIce += (iceTarget - currentIce) * ICE_RELAXATION_RATE;
  }

  function globalTemperature() {
    return currentTemp;
  }

  function iceCoverage() {
    return currentIce;
  }

  function meltedIcePercent() {
    return Math.max(0, BASE_ICE_COVERAGE - currentIce) * 100;
  }

  function seaLevelRise() {
    return meltedIcePercent() * SEA_LEVEL_PER_ICE_PERCENT;
  }

  // minTemp/maxTemp erlauben die Eignung fuer eine SPEZIFISCHE Vegetationsstufe
  // zu berechnen (siehe VEGETATION_TYPES in data.js) — Default reproduziert die
  // urspruengliche globale Schwelle (entspricht der Stufe "Gräser").
  function vegetationSuitability(temp, minTemp = VEG_MIN_TEMP, maxTemp = VEG_MAX_TEMP) {
    if (temp <= minTemp || temp >= maxTemp) return 0;
    if (temp <= VEG_OPTIMAL_TEMP) return (temp - minTemp) / (VEG_OPTIMAL_TEMP - minTemp);
    return (maxTemp - temp) / (maxTemp - VEG_OPTIMAL_TEMP);
  }

  function serialize() {
    return { temp: currentTemp, ice: currentIce, orbitalYear, orbitalPhase };
  }

  function restore(saved) {
    if (saved && typeof saved.temp === "number" && typeof saved.ice === "number") {
      currentTemp = saved.temp;
      currentIce = saved.ice;
      // Aeltere Spielstaende kennen die Milankovitch-Zyklen noch nicht — dann bei
      // Jahr 0 mit einer frischen zufaelligen Phasenlage starten statt abzustuerzen.
      orbitalYear = typeof saved.orbitalYear === "number" ? saved.orbitalYear : 0;
      orbitalPhase = saved.orbitalPhase && typeof saved.orbitalPhase.obliquity === "number"
        ? saved.orbitalPhase
        : { obliquity: randomPhase(), precession: randomPhase(), eccentricity: randomPhase() };
    } else {
      init();
    }
  }

  return { init, tick, globalTemperature, iceCoverage, meltedIcePercent, seaLevelRise, vegetationSuitability, serialize, restore };
})();
