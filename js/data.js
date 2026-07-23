// Konstanten für "Der lebende Planet" — Planetenraster, Gase, Klimaformeln.
// Alle Ausgangswerte orientieren sich an realen Referenzgrößen (vorindustrielle Erde),
// damit die Wirkungsrichtungen und -größenordnungen glaubwürdig bleiben, auch wenn
// das Modell stark vereinfacht ist.

const GRID_WIDTH = 60;
const GRID_HEIGHT = 30;

// Gase, die der Spieler direkt regeln kann. potency = Treibhauswirkung relativ zu CO2
// pro Volumeneinheit (CH4 ≈ 25x CO2 über 100 Jahre, realer IPCC-Näherungswert/GWP100).
const GASES = [
  { id: "co2", name: "Kohlendioxid", symbol: "CO₂", unit: "ppm", min: 150, max: 2000, start: 400, potency: 1 },
  { id: "ch4", name: "Methan", symbol: "CH₄", unit: "ppm", min: 0, max: 50, start: 1.8, potency: 25 },
  { id: "o2", name: "Sauerstoff", symbol: "O₂", unit: "%", min: 0, max: 35, start: 21, potency: 0 },
];

const CO2_PREINDUSTRIAL_PPM = 280; // realer vorindustrieller Referenzwert
const CO2_FORCING_COEFFICIENT = 5.35; // W/m² pro ln(CO2eq/CO2_ref) — vereinfachte reale IPCC-Formel
const CLIMATE_SENSITIVITY = 0.8; // °C pro W/m² Strahlungsantrieb (~3°C pro CO2-Verdopplung)
const WATER_VAPOR_AMPLIFICATION = 0.4; // Wasserdampf-Rückkopplung verstärkt die GHG-Erwärmung zusätzlich
const BASE_GLOBAL_TEMP = 14; // °C, realer vorindustrieller globaler Durchschnitt

const BASE_ICE_COVERAGE = 0.12; // Anteil der Planetenoberfläche bei Basistemperatur
const ICE_TEMP_SENSITIVITY = 0.018; // Aenderung des Eisanteils je °C Abweichung von BASE_GLOBAL_TEMP
const SEA_LEVEL_PER_ICE_PERCENT = 0.4; // m Meeresspiegelanstieg je 1 Prozentpunkt geschmolzenes Eis

// Klima reagiert nicht sofort auf eine neue Strahlungsbilanz, sondern nur traege
// (Exponential-Glaettung Richtung Gleichgewicht) — realistische Naeherung an die
// thermische Traegheit von Ozean (Temperatur, Jahrzehnte) und Eisschilden
// (Jahrhunderte bis Jahrtausende).
const TEMP_RELAXATION_RATE = 1 / 30; // ~63% Annaeherung an neues Gleichgewicht in ~30 Jahren
const ICE_RELAXATION_RATE = 1 / 500; // ~63% Annaeherung in ~500 Jahren

// Simulationstempo: TICK_INTERVAL_MS = Echtzeit-Abstand zwischen Simulationsschritten,
// SPEED_STEPS = moegliche "Jahre pro Schritt"-Werte (Index 0 = Pause).
const TICK_INTERVAL_MS = 500;
const SPEED_STEPS = [0, 1, 5, 20, 100, 500];

// Breitenabhängiges Temperaturgefälle (grobe Näherung an reale Werte: Äquator ~27°C,
// Pole ~-13°C im Schnitt, bei einem globalen Mittel von ~14°C).
const EQUATOR_TEMP_BONUS = 13;
const POLE_TEMP_RANGE = 40;

const SEA_LEVEL_THRESHOLD = 0.58; // Hoehen-Schwelle (0..1): darunter Ozean, darueber Land
const MAX_ELEVATION_METERS = 4000; // Normierung, um Meeresspiegelanstieg (m) auf die 0..1-Hoehenskala zu beziehen
const POLAR_LATITUDE_THRESHOLD = 0.82; // Breite (0=Aequator,1=Pol), ab der bei Basisklima Eis beginnt

const VEG_MIN_TEMP = 2; // °C, unterhalb stirbt Vegetation ab (Dauerfrost)
const VEG_MAX_TEMP = 32; // °C, oberhalb stirbt Vegetation ab (Hitzestress)
const VEG_OPTIMAL_TEMP = 17; // °C, beste Wachstumsbedingungen
const VEG_GROWTH_RATE = 0.015; // Anteil/Jahr Richtung 100%, bei optimalen Bedingungen (~65 Jahre bis ~63%)
const VEG_DECAY_RATE = 0.03; // Anteil/Jahr Richtung 0%, bei ungeeigneten Bedingungen

// Photosynthese-Näherung: volle Vegetationsdecke (Summe über alle Zellen bei 100%)
// entzieht der Atmosphäre so viel CO2 und gibt so viel O2 ab, pro Jahr.
const VEG_MAX_CO2_UPTAKE_PPM_PER_YEAR = 6;
const VEG_MAX_O2_RELEASE_PERCENT_PER_YEAR = 0.05;

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function getGas(gasId) {
  return GASES.find((g) => g.id === gasId);
}
