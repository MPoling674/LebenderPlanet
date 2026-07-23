// Klima: rein abgeleitete Werte aus der aktuellen Atmosphäre — kein eigener State,
// damit sich Änderungen an den Gasreglern sofort und live auf Temperatur, Eis und
// Meeresspiegel auswirken (kein "Nachziehen" nötig).

const Climate = (() => {
  // Globale Durchschnittstemperatur: Basiswert + Treibhauserwärmung (inkl. Wasserdampf-
  // Rückkopplung, die die reine GHG-Erwärmung zusätzlich verstärkt).
  function globalTemperature() {
    const forcing = Atmosphere.radiativeForcing();
    const deltaGhg = CLIMATE_SENSITIVITY * forcing;
    const deltaTotal = deltaGhg * (1 + WATER_VAPOR_AMPLIFICATION);
    return BASE_GLOBAL_TEMP + deltaTotal;
  }

  // Anteil der Planetenoberfläche, der vereist ist (0..1) — sinkt mit steigender Temperatur.
  function iceCoverage() {
    const delta = globalTemperature() - BASE_GLOBAL_TEMP;
    return clamp(BASE_ICE_COVERAGE - ICE_TEMP_SENSITIVITY * delta, 0, 1);
  }

  // Wie viele Prozentpunkte Eisbedeckung gegenüber dem Basiszustand geschmolzen sind.
  function meltedIcePercent() {
    return Math.max(0, BASE_ICE_COVERAGE - iceCoverage()) * 100;
  }

  function seaLevelRise() {
    return meltedIcePercent() * SEA_LEVEL_PER_ICE_PERCENT;
  }

  // Eignung einer Zelle für Vegetationswachstum bei gegebener Temperatur (0..1,
  // Dreiecksfunktion mit Optimum bei VEG_OPTIMAL_TEMP, 0 außerhalb des Toleranzbereichs).
  function vegetationSuitability(temp) {
    if (temp <= VEG_MIN_TEMP || temp >= VEG_MAX_TEMP) return 0;
    if (temp <= VEG_OPTIMAL_TEMP) return (temp - VEG_MIN_TEMP) / (VEG_OPTIMAL_TEMP - VEG_MIN_TEMP);
    return (VEG_MAX_TEMP - temp) / (VEG_MAX_TEMP - VEG_OPTIMAL_TEMP);
  }

  return { globalTemperature, iceCoverage, meltedIcePercent, seaLevelRise, vegetationSuitability };
})();
