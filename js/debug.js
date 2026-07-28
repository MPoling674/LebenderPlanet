// Debug: automatische Konsistenzpruefungen + Roh-Zellinspektor — helfen, die
// Simulation auf Korrektheit zu pruefen, ohne bei jeder Vermutung ein Ad-hoc-
// Skript in der Browser-Konsole schreiben zu muessen. Struktur aehnlich zu
// civilization.js (zustandslos-ish, liest oeffentlichen Zustand direkt), aber
// bewusst NICHT Teil der eigentlichen Simulationsschleife: Planet.tick() weiss
// nichts von Debug, main.js ruft runChecks() separat auf (siehe checkMilestones-
// Muster) — ein Fehler in einer Pruefung darf nie die Simulation selbst stoeren.

const Debug = (() => {
  let enabled = false;
  let warnings = [];

  function setEnabled(value) {
    enabled = value;
    if (!enabled) warnings = [];
  }

  function isEnabled() {
    return enabled;
  }

  function check(condition, message) {
    if (!condition) warnings.push(message);
  }

  // Prueft grundlegende Invarianten, die bei korrektem Verhalten IMMER gelten
  // muessen — faengt Regressionen automatisch ab, statt auf zufaellig
  // auffallende Symptome angewiesen zu sein (z.B. waere "O2 steigt unbegrenzt"
  // oder "Fauna-Anteil ueber 100%" hier sofort sichtbar gewesen, statt erst nach
  // laengerem Spielen manuell aufzufallen).
  function runChecks() {
    warnings = [];
    if (!enabled) return warnings;

    // Atmosphaeren-Kopplung: O2+N2 muss konstant bleiben (siehe
    // ATMOSPHERE_MAJOR_GAS_TOTAL-Kommentar in data.js).
    const o2 = Atmosphere.get("o2");
    const n2 = Atmosphere.get("n2");
    check(
      Math.abs(o2 + n2 - ATMOSPHERE_MAJOR_GAS_TOTAL) < DEBUG_EPSILON,
      `O2+N2-Summe weicht ab: ${(o2 + n2).toFixed(3)} (erwartet ${ATMOSPHERE_MAJOR_GAS_TOTAL})`
    );

    GASES.forEach((g) => {
      const v = Atmosphere.get(g.id);
      check(Number.isFinite(v), `${g.name}: nicht-numerischer Wert (${v})`);
      check(
        v >= g.min - DEBUG_EPSILON && v <= g.max + DEBUG_EPSILON,
        `${g.name} ausserhalb Wertebereich: ${v.toFixed(2)} (erlaubt ${g.min}–${g.max})`
      );
    });

    check(Number.isFinite(Climate.globalTemperature()), "Globale Temperatur ist nicht-numerisch (NaN/Infinity).");
    const water = Climate.waterCoverage();
    check(water >= -DEBUG_EPSILON && water <= 1 + DEBUG_EPSILON, `Wasserbedeckung ausserhalb 0–1: ${water.toFixed(4)}`);

    const stats = Planet.stats();
    const terrainSum = stats.oceanPercent + stats.landPercent + stats.icePercent;
    check(Math.abs(terrainSum - 100) < 0.1, `Terrain-Anteile summieren nicht zu 100%: ${terrainSum.toFixed(2)}`);
    check(stats.avgVegetation >= -DEBUG_EPSILON && stats.avgVegetation <= 100 + DEBUG_EPSILON, `Ø Vegetation ausserhalb 0–100%: ${stats.avgVegetation.toFixed(2)}`);
    check(stats.avgFauna >= -DEBUG_EPSILON && stats.avgFauna <= 100 + DEBUG_EPSILON, `Ø Fauna ausserhalb 0–100%: ${stats.avgFauna.toFixed(2)}`);
    Object.entries(stats.vegetationByType).forEach(([id, pct]) => {
      check(pct >= -DEBUG_EPSILON && pct <= 100 + DEBUG_EPSILON, `Vegetationsanteil "${id}" ausserhalb 0–100%: ${pct.toFixed(2)}`);
    });
    Object.entries(stats.faunaByType).forEach(([id, pct]) => {
      check(pct >= -DEBUG_EPSILON && pct <= 100 + DEBUG_EPSILON, `Faunaanteil "${id}" ausserhalb 0–100%: ${pct.toFixed(2)}`);
    });

    return warnings;
  }

  function currentWarnings() {
    return warnings;
  }

  return { setEnabled, isEnabled, runChecks, currentWarnings };
})();
