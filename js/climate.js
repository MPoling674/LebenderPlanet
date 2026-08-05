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

  // Junge-schwache-Sonne (siehe SOLAR_LUMINOSITY_START-Kommentar in data.js):
  // startet gedaempft, naehert sich ueber die Spielzeit der modernen Helligkeit
  // (1.0) an.
  let solarLuminosityFactor = SOLAR_LUMINOSITY_START;

  // Magnetfeld-/Dynamo-Staerke (siehe MAGNETIC_FIELD_DRIFT_RATE-Kommentar in
  // data.js): naehert sich dem masseabhaengigen Gleichgewicht an, gelegentliche
  // Polumkehrungen fallen kurz auf MAGNETIC_FIELD_REVERSAL_LOW.
  let fieldStrength = 1;
  let reversalThisTick = false;

  // Spielergesteuerte Achsneigung + Mond-/Planetenmasse (siehe
  // TILT_REFERENCE_DEGREES-Kommentar in data.js): axialTilt ist wie die
  // Gas-Werte in Atmosphere jederzeit direkt vom Spieler setzbar, driftet aber
  // OHNE ausreichende Mondmasse zusaetzlich von selbst weiter (siehe tick()).
  let axialTilt = TILT_REFERENCE_DEGREES;
  let moonMass = MOON_MASS_DEFAULT;
  let planetMass = PLANET_MASS_DEFAULT;

  function setAxialTilt(degrees) {
    axialTilt = clamp(degrees, AXIAL_TILT_MIN, AXIAL_TILT_MAX);
  }

  function setMoonMass(value) {
    moonMass = clamp(value, MOON_MASS_MIN, MOON_MASS_MAX);
  }

  function setPlanetMass(value) {
    planetMass = clamp(value, PLANET_MASS_MIN, PLANET_MASS_MAX);
  }

  function axialTiltDegrees() {
    return axialTilt;
  }

  function moonMassValue() {
    return moonMass;
  }

  function planetMassValue() {
    return planetMass;
  }

  // 0 (stabil, heutiges oder staerkeres Massenverhaeltnis) .. 1 (voellig
  // chaotisch, kein Mond). Exakt 0 beim heutigen realen Verhaeltnis
  // (moonMass===planetMass===1) — Null-Effekt-Prinzip.
  function tiltInstability() {
    return clamp(1 - moonMass / planetMass, 0, 1);
  }

  // Breitengradient-Skalierung fuer Planet.localTemperature() (siehe
  // TILT_GRADIENT_SENSITIVITY-Kommentar in data.js).
  function tiltGradientFactor() {
    const raw = 1 - TILT_GRADIENT_SENSITIVITY * (axialTilt - TILT_REFERENCE_DEGREES);
    return clamp(raw, TILT_GRADIENT_MIN_FACTOR, TILT_GRADIENT_MAX_FACTOR);
  }

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
    // Skaliert mit der spielergesteuerten Achsneigung (siehe axialTilt oben) —
    // bei 0° Neigung kein Wobble, bei TILT_REFERENCE_DEGREES exakt der Fixwert.
    const obliquityAmplitude = MILANKOVITCH_OBLIQUITY_AMPLITUDE * (axialTilt / TILT_REFERENCE_DEGREES);
    const obliquityTerm = obliquityAmplitude
      * Math.sin((2 * Math.PI * t) / MILANKOVITCH_OBLIQUITY_PERIOD_YEARS + orbitalPhase.obliquity);
    const eccentricityStrength = (eccentricitySignal + 1) / 2;
    const precessionTerm = MILANKOVITCH_PRECESSION_AMPLITUDE * eccentricityStrength
      * Math.sin((2 * Math.PI * t) / MILANKOVITCH_PRECESSION_PERIOD_YEARS + orbitalPhase.precession);
    const eccentricityTerm = MILANKOVITCH_ECCENTRICITY_AMPLITUDE * eccentricitySignal;
    return obliquityTerm + precessionTerm + eccentricityTerm;
  }

  // Fuer die Achsneigungs-Visualisierung des 3D-Widgets (js/planet3d.js) —
  // die reale Bedeutung von Obliquitaet (der Neigungswinkel selbst schwankt
  // periodisch, siehe MILANKOVITCH_OBLIQUITY_PERIOD_YEARS) als tatsaechlicher
  // Grad-Wert statt als Temperatur-Term wie in orbitalForcing() oben. Eigene
  // (kleine) Amplitude in Grad statt der dortigen °C-kalibrierten
  // MILANKOVITCH_OBLIQUITY_AMPLITUDE — beide leiten sich aus demselben
  // Phasenwinkel ab, daher bleiben sie synchron zueinander.
  function obliquityWobbleDegrees() {
    const amplitude = OBLIQUITY_WOBBLE_AMPLITUDE_DEGREES * (axialTilt / TILT_REFERENCE_DEGREES);
    return amplitude * Math.sin((2 * Math.PI * orbitalYear) / MILANKOVITCH_OBLIQUITY_PERIOD_YEARS + orbitalPhase.obliquity);
  }

  // Praezession: die NEIGUNGSRICHTUNG (nicht der -winkel) der Achse wandert
  // langsam im Kreis (realer Kreisel-Effekt, Periode MILANKOVITCH_
  // PRECESSION_PERIOD_YEARS) — im Widget als langsame Rotation der gesamten
  // Neigungsachse um die Vertikale sichtbar.
  function precessionAngleRadians() {
    return (2 * Math.PI * orbitalYear) / MILANKOVITCH_PRECESSION_PERIOD_YEARS + orbitalPhase.precession;
  }

  // Eis-Albedo-Rueckkopplung (siehe ALBEDO_FORCING_PER_ICE_FRACTION-Kommentar in
  // data.js): nutzt den TRAEGEN currentIce-State (nicht das sofortige
  // Gleichgewicht equilibriumIceCoverage()) — dadurch reagiert die
  // Rueckkopplung mit derselben realistischen Verzoegerung wie echtes Eis, statt
  // instantan auf jede Temperaturaenderung. Bei currentIce === BASE_ICE_COVERAGE
  // exakt 0, damit die Ausgangskalibrierung erhalten bleibt.
  function albedoForcing() {
    return -ALBEDO_FORCING_PER_ICE_FRACTION * (currentIce - BASE_ICE_COVERAGE);
  }

  // Junge-schwache-Sonne (siehe SOLAR_LUMINOSITY_START-Kommentar in data.js):
  // negativ, solange der Stern noch nicht seine volle (moderne) Helligkeit
  // erreicht hat, bei Faktor 1 exakt 0.
  function solarForcing() {
    return SOLAR_FORCING_PER_LUMINOSITY_UNIT * (solarLuminosityFactor - 1);
  }

  // Dynamische Wasserdampf-Verstaerkung (siehe WATER_VAPOR_BASE_AMPLIFICATION-
  // Kommentar in data.js) — nutzt den TRAEGEN currentTemp-Vorjahreswert (kein
  // Selbstbezug auf das gerade erst berechnete Gleichgewicht dieses Jahres,
  // gleiches Prinzip wie albedoForcing() oben) und skaliert zusaetzlich mit
  // outgassedWaterReserve: ohne ausgegastes Wasser (ganz fruehe Planetenphase)
  // gibt es noch keine nennenswerte Atmosphaerenfeuchte, die verstaerken koennte.
  function waterVaporAmplification() {
    const raw = WATER_VAPOR_BASE_AMPLIFICATION * Math.exp(WATER_VAPOR_CC_COEFF * (currentTemp - BASE_GLOBAL_TEMP));
    return clamp(raw, WATER_VAPOR_MIN_AMPLIFICATION, WATER_VAPOR_MAX_AMPLIFICATION) * outgassedWaterReserve;
  }

  // Dynamische Silikatverwitterung (siehe SILICATE_WEATHERING_TEMP_SENSITIVITY-
  // Kommentar in data.js) — Multiplikator auf GEOLOGICAL_CO2_RELAXATION_RATE,
  // angewendet in planet.js NUR auf die natuerliche geologische Senke, nicht auf
  // die Scrubber-/Emitter-Konstanten. Bei BASE_GLOBAL_TEMP exakt 1.
  function weatheringFactor(temp) {
    const raw = 1 + SILICATE_WEATHERING_TEMP_SENSITIVITY * (temp - BASE_GLOBAL_TEMP);
    return clamp(raw, SILICATE_WEATHERING_MIN_FACTOR, SILICATE_WEATHERING_MAX_FACTOR);
  }

  // Zielwerte, denen sich currentTemp/currentIce jedes Jahr annähern — das sind
  // die ehemaligen (sofortigen) Formeln aus Phase 1, jetzt nur noch als Gleichgewicht.
  function equilibriumTemperature() {
    const forcing = Atmosphere.radiativeForcing();
    const deltaGhg = CLIMATE_SENSITIVITY * forcing;
    const deltaTotal = deltaGhg * (1 + waterVaporAmplification());
    const deltaAlbedo = CLIMATE_SENSITIVITY * albedoForcing();
    const deltaSolar = CLIMATE_SENSITIVITY * solarForcing();
    return BASE_GLOBAL_TEMP + deltaTotal + deltaAlbedo + deltaSolar + orbitalForcing() - impactWinterIntensity + primordialHeat;
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
    solarLuminosityFactor = SOLAR_LUMINOSITY_START;
    fieldStrength = 1;
    reversalThisTick = false;
    axialTilt = TILT_REFERENCE_DEGREES;
    moonMass = MOON_MASS_DEFAULT;
    planetMass = PLANET_MASS_DEFAULT;
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
    solarLuminosityFactor += (1 - solarLuminosityFactor) * SOLAR_LUMINOSITY_RAMP_RATE;
    // Magnetfeld: naehert sich dem masseabhaengigen Dynamo-Gleichgewicht an.
    // Gleichgewicht steigt linear mit Planetenmasse; unter ~0.4 M⊕ reicht der
    // Kern nicht mehr fuer ein stabiles Feld (Mars-Analogie).
    const fieldEquilibrium = clamp(1.07 * planetMass - 0.22, 0.02, 1.0);
    fieldStrength += (fieldEquilibrium - fieldStrength) * MAGNETIC_FIELD_DRIFT_RATE;
    fieldStrength += (Math.random() - 0.5) * MAGNETIC_FIELD_FLUCTUATION;
    reversalThisTick = false;
    if (Math.random() < MAGNETIC_FIELD_REVERSAL_CHANCE) {
      // Polumkehrung: Feld bricht auf Nadir ein, erholt sich dann selbst via Drift.
      reversalThisTick = true;
      fieldStrength = Math.min(fieldStrength, MAGNETIC_FIELD_REVERSAL_LOW);
    }
    fieldStrength = clamp(fieldStrength, 0, 1);
    // Chaotischer Achsneigungs-Drift (siehe tiltInstability()-Kommentar oben) —
    // der Regler bleibt jederzeit bedienbar, aber ohne ausreichende Mondmasse
    // "laeuft" der Wert danach von selbst weiter weg.
    axialTilt += (Math.random() * 2 - 1) * TILT_CHAOTIC_DRIFT_RATE * tiltInstability();
    axialTilt = clamp(axialTilt, AXIAL_TILT_MIN, AXIAL_TILT_MAX);
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

  // Aufschluesselung der Beitraege zur Gleichgewichtstemperatur — fuer die
  // Temperatur-Analyse-Tabelle in ui.js. Gibt alle Einzel-Deltas (in °C,
  // relativ zur vorindustriellen Baseline BASE_GLOBAL_TEMP) zurueck sowie
  // die daraus resultierende Gleichgewichts-Zieltemperatur.
  // Hinweis: currentTemp ist die traegeitsgedaempfte Realtemperatur; sie
  // naehert sich dem hier berechneten equilibrium langsam an.
  function temperatureBreakdown() {
    const forcing = Atmosphere.radiativeForcing();
    const deltaGhg = CLIMATE_SENSITIVITY * forcing;
    const wva = waterVaporAmplification();
    const deltaWaterVapor = deltaGhg * wva;
    const deltaAlbedo = CLIMATE_SENSITIVITY * albedoForcing();
    const deltaSolar = CLIMATE_SENSITIVITY * solarForcing();
    const deltaMilankovitch = orbitalForcing();
    return {
      ghg: deltaGhg,
      waterVapor: deltaWaterVapor,
      albedo: deltaAlbedo,
      solar: deltaSolar,
      milankovitch: deltaMilankovitch,
      impactWinter: -impactWinterIntensity,
      primordialHeat: primordialHeat,
      equilibrium: BASE_GLOBAL_TEMP + deltaGhg + deltaWaterVapor + deltaAlbedo
                   + deltaSolar + deltaMilankovitch - impactWinterIntensity + primordialHeat,
    };
  }

  function iceCoverage() {
    return currentIce;
  }

  // 0..1 — Anteil des vollen (heutigen) Meeresspiegels, der bereits kondensiert
  // ist. Treibt den effektiven Ozean-Schwellwert in Planet.currentTerrain().
  function waterCoverage() {
    return waterVolume;
  }

  function solarLuminosity() {
    return solarLuminosityFactor;
  }

  function magneticFieldStrength() {
    return fieldStrength;
  }

  // Gibt true zurueck wenn in diesem Tick eine Polumkehrung ausgeloest wurde —
  // wird von planet.js scanForDiscoveries() abgefragt um ein Ereignis zu erzeugen.
  function wasReversal() {
    return reversalThisTick;
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
    return { temp: currentTemp, ice: currentIce, orbitalYear, orbitalPhase, impactWinterIntensity, primordialHeat, outgassedWaterReserve, waterVolume, solarLuminosityFactor, fieldStrength, axialTilt, moonMass, planetMass };
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
      // Aeltere Spielstaende kennen weder Sonnenleuchtkraft noch Magnetfeld —
      // beide auf den "unbedenklichen" Wert 1 (ausgereifter Stern, volle
      // Feldstaerke) defaulten statt rueckwirkend zu bestrafen, gleiches Prinzip
      // wie bei primordialHeat/waterVolume oben.
      solarLuminosityFactor = typeof saved.solarLuminosityFactor === "number" ? saved.solarLuminosityFactor : 1;
      fieldStrength = typeof saved.fieldStrength === "number" ? saved.fieldStrength : 1;
      // Aeltere Spielstaende kennen weder Achsneigung noch Mond-/Planetenmasse —
      // auf die Referenzwerte defaulten (identisch zum bisherigen impliziten
      // Verhalten, kein rueckwirkender Nachteil), gleiches Prinzip wie oben.
      axialTilt = typeof saved.axialTilt === "number" ? saved.axialTilt : TILT_REFERENCE_DEGREES;
      moonMass = typeof saved.moonMass === "number" ? saved.moonMass : MOON_MASS_DEFAULT;
      planetMass = typeof saved.planetMass === "number" ? saved.planetMass : PLANET_MASS_DEFAULT;
    } else {
      init();
    }
  }

  return {
    init, tick, globalTemperature, iceCoverage, meltedIcePercent, seaLevelRise, waterCoverage,
    vegetationSuitability, triggerImpactWinter, weatheringFactor, solarLuminosity, magneticFieldStrength, wasReversal,
    setAxialTilt, setMoonMass, setPlanetMass, axialTiltDegrees, moonMassValue, planetMassValue,
    tiltGradientFactor, obliquityWobbleDegrees, precessionAngleRadians, temperatureBreakdown, serialize, restore,
  };
})();
