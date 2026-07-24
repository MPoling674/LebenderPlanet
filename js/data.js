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

// Breitengrad-gebundene Oberflaechenstroemungs-Baender (0=Aequator..1=Pol),
// nach dem realen Muster: Passatwind-getriebene tropische Stroemung nach Westen,
// Westwinddrift in mittleren Breiten nach Osten, polare Ostwinde wieder nach
// Westen. direction: -1 = Richtung Westen (kleineres x), +1 = Richtung Osten.
const CURRENT_BANDS = [
  { maxLatitude: 0.33, direction: -1 },
  { maxLatitude: 0.67, direction: 1 },
  { maxLatitude: 1.0, direction: -1 },
];
const CURRENT_ADVECTION_RATE = 0.03; // Anteil/Jahr, der von der stromaufwaerts liegenden Zelle uebernommen wird
const CURRENT_RELAXATION_RATE = 0.05; // Anteil/Jahr, um den sich die Temperatur-Anomalie Richtung 0 (Atmosphaerenausgleich) bewegt

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
  // Sonderform: entsteht ausschliesslich zufaellig auf verstrahlten Zellen (siehe
  // MUTANT_PLANT_SPAWN_CHANCE, Planet.tick()) — radiationOnly schliesst sie aus
  // normaler Sukzession/manueller Aussaat aus (bestVegTypeFor ueberspringt sie).
  { id: "mutant", name: "Mutantenpflanzen", complexity: 0, tolerance: 30, radiationOnly: true, color: [150, 70, 176] },
];

function getVegType(typeId) {
  return VEGETATION_TYPES.find((t) => t.id === typeId) || null;
}

function vegTypeRange(type) {
  return [VEG_OPTIMAL_TEMP - type.tolerance, VEG_OPTIMAL_TEMP + type.tolerance];
}

// Taxonomie-Baum (SimEarth-inspiriert): "habitat" bindet eine Art an Land- oder
// Ozeanzellen. Landarten brauchen zusaetzlich eine Mindest-Vegetationsdeckung als
// Nahrungsgrundlage (minVegetation); Meeresarten haben statt dessen ein
// Salzgehalt-Toleranzband (salinityTolerance, analog "tolerance" aber um
// OCEAN_SALINITY_BASE statt VEG_OPTIMAL_TEMP). "successorOnly" markiert Taxa, die
// NIE spontan eine leere Zelle besiedeln, sondern ausschliesslich ueber Sukzession
// (successors-Liste eines Vorgaengers) oder einen Sonder-Trigger (Nanotech-Roboter
// ueber Planet.detonate()) erreichbar sind — noetig, weil der Baum verzweigt und es
// daher (anders als bei der linearen Vegetations-Kette) keine eindeutige "naechst-
// komplexere Stufe" fuer eine leere Zelle mehr gibt. "successors" listet moegliche
// Nachfolge-Taxa; "crossHabitat: true" bedeutet, der Uebergang passiert NICHT in der
// gleichen Zelle, sondern als Neubesiedlung einer benachbarten Zelle passenden
// Habitats (siehe Fauna.tickSpawns) — z.B. Fische (Ozean) -> Amphibien (Land).
const FAUNA_TYPES = [
  // Mikroorganismen — civilizationCapable: nein, muessen sich global etablieren,
  // bevor jegliche Fauna ab Radiata ueberhaupt entstehen kann (siehe Fauna.computeGate).
  { id: "prokaryotes", name: "Prokaryoten", habitat: "ocean", civilizationCapable: false, manualPlacement: true, successorOnly: false, tolerance: 30, salinityTolerance: 25, color: [120, 168, 120], successors: [] },
  { id: "eukaryotes", name: "Eukaryoten", habitat: "ocean", civilizationCapable: false, manualPlacement: true, successorOnly: false, tolerance: 25, salinityTolerance: 20, color: [96, 156, 132], successors: [] },

  // Wasserbewohner (Wurzeln, unabhaengig voneinander) — alle civilizationCapable.
  { id: "radiata", name: "Radiata", habitat: "ocean", civilizationCapable: true, manualPlacement: true, successorOnly: false, tolerance: 20, salinityTolerance: 15, color: [150, 110, 168], successors: [] },
  { id: "mollusks", name: "Mollusken", habitat: "ocean", civilizationCapable: true, manualPlacement: true, successorOnly: false, tolerance: 18, salinityTolerance: 14, color: [176, 132, 104], successors: [] },
  { id: "trichordates", name: "Trichordaten", habitat: "ocean", civilizationCapable: true, manualPlacement: true, successorOnly: false, tolerance: 16, salinityTolerance: 12, color: [120, 132, 176], successors: [] },
  { id: "fish", name: "Fische", habitat: "ocean", civilizationCapable: true, manualPlacement: true, successorOnly: false, tolerance: 14, salinityTolerance: 12, color: [90, 140, 168], successors: [{ id: "amphibians", crossHabitat: true }] },

  // Land-/Luftbewohner.
  { id: "arthropods", name: "Arthropoden", habitat: "land", civilizationCapable: true, manualPlacement: true, successorOnly: false, tolerance: 24, minVegetation: 5, color: [176, 158, 64], successors: [] },
  { id: "amphibians", name: "Amphibien", habitat: "land", civilizationCapable: true, manualPlacement: true, successorOnly: true, tolerance: 14, minVegetation: 15, color: [110, 150, 110], successors: [{ id: "reptiles" }, { id: "therapsids" }] },
  { id: "reptiles", name: "Reptilien", habitat: "land", civilizationCapable: true, manualPlacement: true, successorOnly: true, tolerance: 12, minVegetation: 10, color: [120, 140, 84], successors: [{ id: "dinosaurs" }, { id: "avians" }] },
  { id: "dinosaurs", name: "Dinosphen", habitat: "land", civilizationCapable: true, manualPlacement: true, successorOnly: true, tolerance: 8, minVegetation: 5, color: [150, 100, 76], successors: [{ id: "avians" }] },
  { id: "avians", name: "Avialae", habitat: "land", civilizationCapable: true, manualPlacement: true, successorOnly: true, tolerance: 16, minVegetation: 10, color: [190, 168, 90], successors: [] },

  // Saeugetiere.
  { id: "therapsids", name: "Therapsiden", habitat: "land", civilizationCapable: true, manualPlacement: true, successorOnly: true, tolerance: 13, minVegetation: 20, color: [140, 108, 84], successors: [{ id: "marsupials" }, { id: "placentals" }] },
  { id: "marsupials", name: "Marsupilier", habitat: "land", civilizationCapable: true, manualPlacement: true, successorOnly: true, tolerance: 11, minVegetation: 25, color: [168, 132, 108], successors: [] },
  { id: "placentals", name: "Plazentatiere", habitat: "land", civilizationCapable: true, manualPlacement: true, successorOnly: true, tolerance: 10, minVegetation: 30, color: [150, 116, 80], successors: [{ id: "ceti" }, { id: "primates" }] },
  { id: "ceti", name: "Ceti", habitat: "land", civilizationCapable: true, manualPlacement: true, successorOnly: true, tolerance: 9, minVegetation: 20, color: [100, 120, 132], successors: [{ id: "cetaceans", crossHabitat: true }] },
  { id: "cetaceans", name: "Cetaceen", habitat: "ocean", civilizationCapable: true, manualPlacement: true, successorOnly: true, tolerance: 12, salinityTolerance: 10, color: [70, 96, 140], successors: [] },
  { id: "primates", name: "Primaten", habitat: "land", civilizationCapable: true, manualPlacement: true, successorOnly: true, tolerance: 8, minVegetation: 35, color: [140, 70, 56], successors: [] },

  // Sonderform: entsteht ausschliesslich ueber Planet.detonate() (Atombombe auf eine
  // Hochtechnologie-Stadt), nie spontan oder ueber normale Sukzession — daher
  // successorOnly UND manualPlacement:false. habitat ist bewusst offen (das
  // Zielgelaende kann Land oder Ozean sein); Fauna.suitability() behandelt Roboter
  // klimaunabhaengig als Sonderfall.
  { id: "nanobots", name: "Nanotech-Roboter", habitat: null, civilizationCapable: true, manualPlacement: false, successorOnly: true, tolerance: 0, color: [120, 200, 210], successors: [] },
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

// Praerequisiten-Gate fuer Eukaryoten (siehe Fauna.suitability()): erst wenn der
// O2-Gehalt der Atmosphaere diese Schwelle erreicht UND die globale Temperatur in
// einem lebensfreundlichen Band liegt, kann komplexe Zellentwicklung entstehen —
// bei extremen Eiszeiten oder kochenden Ozeanen (Temperatur ausserhalb des Bands)
// stirbt sie wieder ab (suitability()=0 loest den bestehenden Zerfallspfad aus).
// Reale Analogie: die "Great Oxidation Event" genannte Anreicherung der fruehen
// Erdatmosphaere mit Sauerstoff durch photosynthetisierende Prokaryoten war
// Voraussetzung fuer komplexeres Leben. O2_THRESHOLD liegt bewusst nur wenig ueber
// dem Startwert (21%, siehe GASES in data.js), damit die langsame biologische
// Anreicherung UND der beschleunigte Weg ueber Sauerstoffgeneratoren (siehe
// OXYGEN_GENERATOR_OUTPUT_PER_YEAR) beide in ueberschaubarer Zeit ans Ziel fuehren.
const EUKARYOTE_O2_THRESHOLD = 23;
const EUKARYOTE_MIN_GLOBAL_TEMP = 5; // °C, darunter globale Vereisung
const EUKARYOTE_MAX_GLOBAL_TEMP = 26; // °C, darueber kochende/lebensfeindliche Ozeane

// Sauerstoffproduktion der Prokaryoten: Anteil/Jahr O2-Zuwachs bei VOLLER
// Saettigung (jede Ozeanzelle traegt Prokaryoten mit Bestand 100) — reale
// Photosynthese-Prokaryoten (Cyanobakterien) reicherten die fruehe Erdatmosphaere
// tatsaechlich ueber geologische Zeitraeume langsam mit Sauerstoff an.
const PROKARYOTE_O2_RELEASE_PER_YEAR = 0.02;

// Sauerstoffgenerator: technologische Abkuerzung zum Eukaryoten-Gate, unabhaengig
// von biologischer Prokaryoten-Aktivitaet — deutlich schneller als der biologische
// Weg, damit sich das Bauen tatsaechlich als Beschleunigung anfuehlt.
const OXYGEN_GENERATOR_OUTPUT_PER_YEAR = 0.15;

// Jahreswahrscheinlichkeit, mit der ein reifes Taxon mit crossHabitat-Nachfolger
// (z.B. Fische -> Amphibien) eine geeignete leere Nachbarzelle neu besiedelt.
const CROSS_HABITAT_SPAWN_CHANCE = 0.1;

// Zivilisation: Zellen mit reifem (>=90%) zivilisationsfaehigem Taxon bauen pro
// Jahr Tech-Level auf (0..100), sonst faellt er zurueck — Kollaps schneller als
// Aufstieg (COLLAPSE_RATE > GROWTH_RATE), reale Analogie: eine Zivilisation
// zerfaellt schneller, als sie entsteht. Ab CITY_TECH_THRESHOLD gilt eine Zelle
// als "Stadt", ab HIGH_TECH_THRESHOLD als "Hochtechnologie" (Voraussetzung fuer
// die Atombombe, siehe civilization.js).
const CIVILIZATION_GROWTH_RATE = 0.4;
const CIVILIZATION_DECAY_RATE = 0.8;
const CITY_TECH_THRESHOLD = 30;
const HIGH_TECH_THRESHOLD = 80;

// Atombombe: zerstoert eine Hochtechnologie-Stadt (siehe Planet.detonate()).
// Betroffene Zellen werden verstrahlt (radiation 0..100, klingt langsam ab —
// ~100 Jahre bis zur vollstaendigen Erholung) und die Zielzelle wird mit
// Nanotech-Robotern neu besiedelt (siehe civilizationCapable-Sonderform in
// FAUNA_TYPES).
const RADIATION_DECAY_RATE = 1;
const NANOBOT_START_POPULATION = 40;

// Jahreswahrscheinlichkeit, mit der eine verstrahlte Landzelle (radiation>0)
// spontan zu Mutantenpflanzen mutiert statt normal weiterzuwachsen.
const MUTANT_PLANT_SPAWN_CHANCE = 0.05;

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
