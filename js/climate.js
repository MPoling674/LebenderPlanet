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

  // Einschlagswinter (siehe Events.tick()/Meteoriteneinschlag in data.js): eine
  // zusaetzliche, zeitlich abklingende Abkuehlung obendrauf auf das normale
  // Gleichgewicht — mehrere Einschlaege kurz hintereinander addieren sich.
  let impactWinterIntensity = 0;

  // Planetenentstehung (siehe PRIMORDIAL_HEAT_*/OUTGASSING_*-Kommentar in
  // data.js): primordialHeat ist die abklingende Restwaerme obendrauf auf die
  // normale Gleichgewichtstemperatur, outgassedWaterReserve waechst stetig
  // (Entgasung), waterVolume ist der tatsaechlich kondensierte Anteil (0..1),
  // der den effektiven Meeresspiegel in Planet.currentTerrain() antreibt.
  let primordialHeat = PRIMORDIAL_HEAT_START;
  let outgassedWaterReserve = 0;
  let waterVolume = 0;

  function triggerImpactWinter(intensity) {
    impactWinterIntensity += intensity;
  }

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
    return BASE_GLOBAL_TEMP + deltaTotal + orbitalForcing() - impactWinterIntensity + primordialHeat;
  }

  function equilibriumIceCoverage(temp) {
    const delta = temp - BASE_GLOBAL_TEMP;
    return clamp(BASE_ICE_COVERAGE - ICE_TEMP_SENSITIVITY * delta, 0, 1);
  }

  function init() {
    orbitalYear = 0;
    orbitalPhase = { obliquity: randomPhase(), precession: randomPhase(), eccentricity: randomPhase() };
    impactWinterIntensity = 0;
    primordialHeat = PRIMORDIAL_HEAT_START;
    outgassedWaterReserve = 0;
    waterVolume = 0;
    currentTemp = equilibriumTemperature();
    currentIce = equilibriumIceCoverage(currentTemp);
  }

  // Ein Simulationsjahr: Temperatur und Eis nähern sich mit unterschiedlicher
  // Trägheit ihrem jeweiligen Gleichgewicht an (Temperatur schneller als Eis).
  function tick() {
    orbitalYear += 1;
    impactWinterIntensity -= impactWinterIntensity * IMPACT_WINTER_RELAXATION_RATE;
    if (impactWinterIntensity < 0.01) impactWinterIntensity = 0;
    primordialHeat -= primordialHeat * PRIMORDIAL_HEAT_RELAXATION_RATE;
    if (primordialHeat < 0.5) primordialHeat = 0;
    const tempTarget = equilibriumTemperature();
    currentTemp += (tempTarget - currentTemp) * TEMP_RELAXATION_RATE;
    const iceTarget = equilibriumIceCoverage(currentTemp);
    currentIce += (iceTarget - currentIce) * ICE_RELAXATION_RATE;
    // Ausgegastes Wasser kondensiert erst zu Ozean, sobald es kuehl genug ist
    // (siehe WATER_CONDENSATION_TEMP-Kommentar in data.js) — davor waechst nur
    // das Reservoir, waterVolume bleibt 0.
    outgassedWaterReserve = clamp(outgassedWaterReserve + OUTGASSING_RATE, 0, 1);
    const condensationTarget = currentTemp < WATER_CONDENSATION_TEMP ? outgassedWaterReserve : 0;
    waterVolume += (condensationTarget - waterVolume) * WATER_CONDENSATION_RATE;
  }

  function globalTemperature() {
    return currentTemp;
  }

  function iceCoverage() {
    return currentIce;
  }

  // 0..1 — Anteil des vollen (heutigen) Meeresspiegels, der bereits kondensiert
  // ist. Treibt den effektiven Ozean-Schwellwert in Planet.currentTerrain().
  function waterCoverage() {
    return waterVolume;
  }

  function meltedIcePercent() {
    return Math.max(0, BASE_ICE_COVERAGE - currentIce) * 100;
  }

  function seaLevelRise() {
    // Vor der ersten Wasserkondensation (siehe waterCoverage()) gibt es noch
    // keinen Meeresspiegel, in den Schmelzwasser "hineinsteigen" koennte — sonst
    // zeigte das HUD waehrend der Planetenentstehungsphase einen irrefuehrenden
    // Anstieg an, obwohl noch gar kein Ozean existiert.
    if (waterVolume <= 0) return 0;
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
    return { temp: currentTemp, ice: currentIce, orbitalYear, orbitalPhase, impactWinterIntensity, primordialHeat, outgassedWaterReserve, waterVolume };
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
      // Aeltere Spielstaende kennen keinen Einschlagswinter — dann bei 0 starten.
      impactWinterIntensity = typeof saved.impactWinterIntensity === "number" ? saved.impactWinterIntensity : 0;
      // Aeltere Spielstaende kennen die Planetenentstehungsphase noch nicht —
      // ihr Planet hat laengst Ozeane (sonst gaebe es dort keine Ozeanzellen/
      // Fauna), also als bereits abgekuehlt und vollstaendig kondensiert annehmen
      // statt ihn rueckwirkend wieder aufzuheizen.
      primordialHeat = typeof saved.primordialHeat === "number" ? saved.primordialHeat : 0;
      outgassedWaterReserve = typeof saved.outgassedWaterReserve === "number" ? saved.outgassedWaterReserve : 1;
      waterVolume = typeof saved.waterVolume === "number" ? saved.waterVolume : 1;
    } else {
      init();
    }
  }

  return { init, tick, globalTemperature, iceCoverage, meltedIcePercent, seaLevelRise, waterCoverage, vegetationSuitability, triggerImpactWinter, serialize, restore };
})();
