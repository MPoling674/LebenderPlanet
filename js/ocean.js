// Ozeanchemie: pH-Wert und gelöster Sauerstoff als reine Ableitungen des
// aktuellen Atmosphären-/Klimazustands (siehe OCEAN_PH_PREINDUSTRIAL-Kommentar
// in data.js) — anders als Climate/Atmosphere hat dieses Modul KEINEN eigenen
// Save-State: chemisches Gleichgewicht (CO2-Loeslichkeit, Sauerstoff-
// Loeslichkeit) stellt sich schnell genug ein, dass eine eigene Traegheit
// keinen spuerbaren Unterschied machen wuerde, gleiches Prinzip wie
// Atmosphere.radiativeForcing().

const Ocean = (() => {
  // Ozeanversauerung (Zeebe & Wolf-Gladrow 2001): mehr CO2 bildet mehr
  // Kohlensaeure im Wasser, senkt den pH-Wert. log2, da OCEAN_PH_CO2_SENSITIVITY
  // als "pH-Abfall pro CO2-VERDOPPLUNG" kalibriert ist. Bei CO2_PREINDUSTRIAL_PPM
  // exakt OCEAN_PH_PREINDUSTRIAL (log2(1) = 0).
  function pH() {
    const co2 = Atmosphere.get("co2");
    const drop = OCEAN_PH_CO2_SENSITIVITY * Math.log2(co2 / CO2_PREINDUSTRIAL_PPM);
    return clamp(OCEAN_PH_PREINDUSTRIAL - drop, OCEAN_PH_MIN, OCEAN_PH_PREINDUSTRIAL);
  }

  // Gelöster Sauerstoff im Ozean (Keeling et al. 2010): waermeres Wasser loest
  // weniger Gas. 1.0 = vorindustrieller Referenzwert (100% Saettigung) bei
  // BASE_GLOBAL_TEMP, faellt mit steigender Temperatur.
  function dissolvedOxygenFraction() {
    const delta = Climate.globalTemperature() - BASE_GLOBAL_TEMP;
    return clamp(1 - OXYGEN_SOLUBILITY_TEMP_COEFF * delta, OXYGEN_SOLUBILITY_MIN_FRACTION, 1.3);
  }

  return { pH, dissolvedOxygenFraction };
})();
