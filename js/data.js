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

// Salzgehalt des Ozeans in PSU (Practical Salinity Units, ~g/kg) — realer globaler
// Mittelwert 35. Reale Verteilung ist NICHT linear mit der Breite: in den Subtropen
// (~starke Verdunstung, wenig Niederschlag) liegt der Salzgehalt ueber dem Mittel,
// am Aequator (viel Niederschlag) und an den Polen (Suesswasser aus Eisschmelze,
// wenig Verdunstung) darunter — daher eine eigene Kurvenform statt der linearen
// Breiten-Rampe wie bei der Temperatur.
const OCEAN_SALINITY_BASE = 35;
const OCEAN_SALINITY_MIN = 0;
const OCEAN_SALINITY_MAX = 45;
const SALINITY_SUBTROPICAL_LATITUDE = 0.35; // Breite (0=Aequator..1=Pol) des Salzgehalt-Maximums
const SALINITY_LATITUDE_AMPLITUDE = 5; // PSU Abweichung vom Mittel am Maximum/Minimum
const SALINITY_ADJUST_STEP = 2; // PSU je Klick mit dem Regel-Werkzeug

// Normierung, um Meeresspiegelanstieg (m) auf die 0..1-Hoehenskala zu beziehen.
// Bewusst NICHT die reale Hoehe des hoechsten Berges (das waere hier irrelevant,
// "elevation" hat sonst nirgends eine reale Meter-Bedeutung) - sondern so gewaehlt,
// dass die im Modell ueberhaupt erreichbare Meeresspiegeleerhoehung (max. ~4.8m,
// bei vollstaendigem Abschmelzen von BASE_ICE_COVERAGE) tatsaechlich einen sichtbaren
// Teil der Kuestenzellen von Land zu Ozean umklappt. Der alte Wert (4000, an realen
// Gebirgshoehen orientiert) verschob die Kuestenschwelle selbst im Extremfall nur um
// 0.0012 - viel zu wenig, um je eine Zelle umzuklappen (gemeldet: "Meeresspiegelanstieg
// wird nicht dargestellt").
const MAX_ELEVATION_METERS = 80;
const POLAR_LATITUDE_THRESHOLD = 0.82; // Breite (0=Aequator,1=Pol), ab der bei Basisklima Eis beginnt

const VEG_MIN_TEMP = 2; // °C, unterhalb stirbt Vegetation ab (Dauerfrost)
const VEG_MAX_TEMP = 32; // °C, oberhalb stirbt Vegetation ab (Hitzestress)
const VEG_OPTIMAL_TEMP = 17; // °C, beste Wachstumsbedingungen
const VEG_GROWTH_RATE = 0.015; // Anteil/Jahr Richtung 100%, bei optimalen Bedingungen (~65 Jahre bis ~63%)
const VEG_DECAY_RATE = 0.03; // Anteil/Jahr Richtung 0%, bei ungeeigneten Bedingungen

// Vegetationsstufen von einfach (toleriert fast jedes Klima) bis komplex (gedeiht
// nur in einem schmalen Band um VEG_OPTIMAL_TEMP). "tolerance" ist die zulaessige
// Abweichung von VEG_OPTIMAL_TEMP in beide Richtungen — je komplexer die Stufe,
// desto schmaler das Band. "grass" reproduziert bewusst die alten globalen
// VEG_MIN_TEMP/VEG_MAX_TEMP-Grenzen (Toleranz 15 = 17±15 = 2..32). Reihenfolge im
// Array = aufsteigende Komplexitaet (complexity-Feld dient nur der Klarheit).
const VEGETATION_TYPES = [
  { id: "moss", name: "Moose & Flechten", complexity: 0, tolerance: 25, color: [150, 168, 140] },
  { id: "grass", name: "Gräser", complexity: 1, tolerance: 15, color: [168, 176, 92] },
  { id: "shrub", name: "Büsche", complexity: 2, tolerance: 10, color: [110, 140, 76] },
  { id: "forest", name: "Wald", complexity: 3, tolerance: 7, color: [52, 108, 66] },
  { id: "rainforest", name: "Tropischer Regenwald", complexity: 4, tolerance: 4, color: [24, 92, 64] },
];

function getVegType(typeId) {
  return VEGETATION_TYPES.find((t) => t.id === typeId) || null;
}

function vegTypeRange(type) {
  return [VEG_OPTIMAL_TEMP - type.tolerance, VEG_OPTIMAL_TEMP + type.tolerance];
}

// Fauna-Stufen: "habitat" bindet eine Art an Land- oder Ozeanzellen. Landarten
// brauchen zusaetzlich eine Mindest-Vegetationsdeckung als Nahrungsgrundlage
// (minVegetation); Meeresarten haben statt dessen ein Salzgehalt-Toleranzband
// (salinityTolerance, analog "tolerance" aber um OCEAN_SALINITY_BASE statt
// VEG_OPTIMAL_TEMP). Reihenfolge je Habitat aufsteigend nach Komplexitaet,
// wie bei VEGETATION_TYPES.
const FAUNA_TYPES = [
  { id: "insects", name: "Insekten", habitat: "land", complexity: 0, tolerance: 22, minVegetation: 5, color: [176, 158, 64] },
  { id: "rodents", name: "Nager", habitat: "land", complexity: 1, tolerance: 16, minVegetation: 15, color: [150, 116, 80] },
  { id: "herd", name: "Herdentiere", habitat: "land", complexity: 2, tolerance: 11, minVegetation: 30, color: [196, 158, 92] },
  { id: "predators", name: "Raubtiere", habitat: "land", complexity: 3, tolerance: 9, minVegetation: 30, color: [140, 70, 56] },
  { id: "plankton", name: "Plankton", habitat: "ocean", complexity: 0, tolerance: 22, salinityTolerance: 20, color: [110, 168, 120] },
  { id: "fish", name: "Fischschwärme", habitat: "ocean", complexity: 1, tolerance: 14, salinityTolerance: 12, color: [90, 140, 168] },
  { id: "marine_mammals", name: "Meeressäuger", habitat: "ocean", complexity: 2, tolerance: 10, salinityTolerance: 8, color: [70, 96, 140] },
];

function getFaunaType(typeId) {
  return FAUNA_TYPES.find((t) => t.id === typeId) || null;
}

function faunaTempRange(type) {
  return [VEG_OPTIMAL_TEMP - type.tolerance, VEG_OPTIMAL_TEMP + type.tolerance];
}

function faunaSalinityRange(type) {
  return [OCEAN_SALINITY_BASE - type.salinityTolerance, OCEAN_SALINITY_BASE + type.salinityTolerance];
}

// Langsamer als Vegetation, da sich Tierbestaende in der Realitaet traeger
// aendern als Pflanzendecken (Fortpflanzungszyklen statt Ausbreitung/Wachstum).
const FAUNA_GROWTH_RATE = 0.01;
const FAUNA_DECAY_RATE = 0.025;

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
