// Klima: Temperatur und Eisbedeckung als eigener State, der sich pro Jahr nur ein
// Stück auf das durch die aktuelle Atmosphäre vorgegebene GLEICHGEWICHT zubewegt
// (Exponential-Glättung) — reale Ozeane/Eisschilde reagieren auf eine neue
// Strahlungsbilanz nur träge, nicht augenblicklich.

const Climate = (() => {
  let currentTemp = BASE_GLOBAL_TEMP;
  let currentIce = BASE_ICE_COVERAGE;

  // Zielwerte, denen sich currentTemp/currentIce jedes Jahr annähern — das sind
  // die ehemaligen (sofortigen) Formeln aus Phase 1, jetzt nur noch als Gleichgewicht.
  function equilibriumTemperature() {
    const forcing = Atmosphere.radiativeForcing();
    const deltaGhg = CLIMATE_SENSITIVITY * forcing;
    const deltaTotal = deltaGhg * (1 + WATER_VAPOR_AMPLIFICATION);
    return BASE_GLOBAL_TEMP + deltaTotal;
  }

  function equilibriumIceCoverage(temp) {
    const delta = temp - BASE_GLOBAL_TEMP;
    return clamp(BASE_ICE_COVERAGE - ICE_TEMP_SENSITIVITY * delta, 0, 1);
  }

  function init() {
    currentTemp = equilibriumTemperature();
    currentIce = equilibriumIceCoverage(currentTemp);
  }

  // Ein Simulationsjahr: Temperatur und Eis nähern sich mit unterschiedlicher
  // Trägheit ihrem jeweiligen Gleichgewicht an (Temperatur schneller als Eis).
  function tick() {
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
    return { temp: currentTemp, ice: currentIce };
  }

  function restore(saved) {
    if (saved && typeof saved.temp === "number" && typeof saved.ice === "number") {
      currentTemp = saved.temp;
      currentIce = saved.ice;
    } else {
      init();
    }
  }

  return { init, tick, globalTemperature, iceCoverage, meltedIcePercent, seaLevelRise, vegetationSuitability, serialize, restore };
})();
