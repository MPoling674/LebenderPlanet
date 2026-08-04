// Konstanten für "Der lebende Planet" — Planetenraster, Gase, Klimaformeln.
// Alle Ausgangswerte orientieren sich an realen Referenzgrößen (vorindustrielle Erde),
// damit die Wirkungsrichtungen und -größenordnungen glaubwürdig bleiben, auch wenn
// das Modell stark vereinfacht ist.

const GRID_WIDTH = 60;
const GRID_HEIGHT = 30;

// Zeithorizont-Rekalibrierung (empirisch ueberprueft: die urspruengliche Version
// liess die komplette Evolution — Prokaryoten bis Hochtechnologie — in
// ~20.000-45.000 Ticks ablaufen UND verzerrt: die fruehe mikrobielle Phase
// (Prokaryoten->Eukaryoten->erste Tiere), die real ueber 80% der gesamten
// Erdgeschichte ausmacht, war im Spiel eher KUERZER als die spaeteren
// Tier-Uebergaenge, statt weitaus laenger. EVOLUTION_TIME_FACTOR streckt alle
// rein biologisch/geologisch getriebenen Jahresraten (Wachstum, O2-Produktion,
// Zivilisations-Fortschritt, Naturkatastrophen-Haeufigkeit) GLEICHMAESSIG —
// Klimaphysik (Ozean-/Eis-Traegheit, Stroemungen, TEMP_RELAXATION_RATE etc.)
// bleibt bewusst UNVERAENDERT: reale thermische Traegheit ist unabhaengig
// davon, wie schnell sich Arten entwickeln (Klima reagiert in der Realitaet
// ohnehin um Groessenordnungen schneller als Evolution — das war vorher schon
// so und bleibt es).
const EVOLUTION_TIME_FACTOR = 25;

// Anzeige-Zeiteinheit: Geologische Skala in Mio. Jahren — intuitiver als
// "Jahrtausend", weil die Schluessel-Ereignisse (Magnetfeld-Erosion ~0,5 Mio.,
// Halbwertszeit ~0,29 Mio.) direkt als Dezimalbrueche lesbar sind.
// Intern (Speicherstand, Ticks) bleibt es bei rohen Jahren.
// Nachkommastellen adaptiv: < 0,1 Mio. → 3 Stellen, < 1 Mio. → 2, sonst 1.
function formatSimTime(rawYear) {
  if (rawYear === 0) return "0 Mio. Jahre";
  const mio = rawYear / 1_000_000;
  const dec = mio >= 1 ? 1 : mio >= 0.1 ? 2 : 3;
  return mio.toLocaleString("de-DE", { minimumFractionDigits: dec, maximumFractionDigits: dec }) + " Mio. Jahre";
}

// Gase, die der Spieler direkt regeln kann. potency = Treibhauswirkung relativ zu CO2
// pro Volumeneinheit (CH4 ≈ 25x CO2 über 100 Jahre, realer IPCC-Näherungswert/GWP100).
// startVariation: bei jedem Neustart (Atmosphere.init()) wird "start" um einen
// zufälligen Betrag in [-startVariation, +startVariation] verschoben, geklemmt auf
// min/max — jeder Planet beginnt dadurch mit einem spürbar anderen Klima/Zeitverlauf
// statt immer exakt demselben Ausgangspunkt.
const GASES = [
  { id: "co2", name: "Kohlendioxid", symbol: "CO₂", unit: "ppm", min: 150, max: 2000, start: 400, startVariation: 120, potency: 1 },
  { id: "ch4", name: "Methan", symbol: "CH₄", unit: "ppm", min: 0, max: 50, start: 1.8, startVariation: 1.2, potency: 25 },
  { id: "o2", name: "Sauerstoff", symbol: "O₂", unit: "%", min: 0, max: 35, start: 21, startVariation: 2, potency: 0 },
  // Haeufigstes Gas der realen Erdatmosphaere (~78%), aber weitgehend inert: kein
  // Treibhausgas (potency 0) und wird von Biologie in diesem Modell nicht
  // umgesetzt — dient der Vollstaendigkeit/Realitaetsnaehe der Atmosphaeren-
  // Zusammensetzung. KEIN eigener start/startVariation: N2 ist mit O2 gekoppelt
  // (siehe ATMOSPHERE_MAJOR_GAS_TOTAL/Atmosphere.set()) und wird immer aus dem
  // aktuellen O2-Wert abgeleitet, nie unabhaengig gewuerfelt oder veraendert.
  { id: "n2", name: "Stickstoff", symbol: "N₂", unit: "%", min: 0, max: 95, potency: 0 },
];

// O2 und N2 sind beide Volumenanteile DERSELBEN Atmosphaere, keine unabhaengigen
// Werte — ihre Summe darf realistisch nicht ueber ~100% (abzueglich Argon/Spuren-
// gasen, hier vereinfacht ignoriert) hinauswachsen. ATMOSPHERE_MAJOR_GAS_TOTAL ist
// die Ziel-Summe aus O2+N2 (realer Referenzwert: 21%+78%=99%). Siehe
// Atmosphere.set(): aendert sich eines der beiden (Biologie, Sauerstoffgenerator,
// Atmung ODER Spieler-Regler), gibt das jeweils andere im GLEICHEN Umfang nach —
// das verhindert sowohl eine unmoegliche Summe > 100% als auch ein unbegrenztes
// O2-Wachstum bis zum reinen Regler-Anschlag (35%), unabhaengig von der biologischen
// Atmungs-Balance (FAUNA_MAX_O2_CONSUMPTION_PER_YEAR).
const ATMOSPHERE_MAJOR_GAS_TOTAL = 99;

// Geologische Sauerstoffsenke (Oxidation/Verwitterung von Gestein, z.B. Eisen zu
// Eisenoxid) — unabhaengig von Biologie, wirkt sogar bevor irgendeine Fauna zum
// Atmen existiert. Ohne diesen Term konnte eine reine Prokaryoten-Frühphase (vor
// Eukaryoten/Vegetation/Fauna) O2 unopponiert bis zum Anschlag treiben. Als
// Relaxation Richtung eines geologischen Gleichgewichtswerts modelliert (gleiches
// Muster wie TEMP_RELAXATION_RATE bei Climate) statt eines reinen Einbahn-
// Verbrauchs — vereinfacht die realen zusaetzlichen Puffer-Prozesse, die O2 lange
// nahe seinem historischen Referenzwert halten.
const GEOLOGICAL_O2_EQUILIBRIUM = 21;
const GEOLOGICAL_O2_RELAXATION_RATE = 0.01 / EVOLUTION_TIME_FACTOR;

// Geologische CO2-Senke (vereinfachtes Abbild des Carbonat-Silikat-Verwitterungs-
// zyklus + der Tatsache, dass eine reife Biosphaere im Gleichgewicht Photosynthese
// und Gesamt-Atmung/Verrottung ausbalanciert): real haelt dieses Zusammenspiel
// atmosphaerisches CO2 nahe einem Referenzwert, ohne dass reine Fauna-Atmung
// (siehe FAUNA_MAX_CO2_RELEASE_PPM_PER_YEAR) allein CO2 unbegrenzt weitertreibt —
// in diesem Modell wird Vegetation nur der NETTO-Zuwachs erfasst (siehe
// tick()-Kommentar in planet.js), Fauna-Atmung aber als DAUERHAFTER, bestands-
// proportionaler Fluss — ohne Gegenstueck triebe ein einmal etabliertes,
// stabiles Oekosystem CO2 allein durch anhaltende Atmung unaufhaltsam an den
// Anschlag (2000 ppm, siehe GASES) und hielte es dort fuer immer fest (gemeldeter
// Fehler: "CO2 geht nicht mehr zurueck"), selbst OHNE Zivilisations-Emissionen.
// Die Rate ist bewusst so gewaehlt, dass sie typische anhaltende Atmungs-Fluesse
// ueber Jahrtausende ausgleichen kann, dabei aber deutlich traeger bleibt als
// Vegetation/Fauna (Jahrzehnte) oder sogar die O2-Variante oben (Jahrhunderte) —
// ein vom Spieler gesetzter CO2-Wert bleibt auf kurze/mittlere Sicht bestehen
// (Sandbox-Charakter, siehe Atmosphere-Kommentar), driftet aber ueber sehr lange
// Zeitraeume zu seinem natuerlichen Referenzwert zurueck, statt fuer immer am
// Anschlag haengen zu bleiben.
const GEOLOGICAL_CO2_EQUILIBRIUM = 280; // ppm, entspricht CO2_PREINDUSTRIAL_PPM
const GEOLOGICAL_CO2_RELAXATION_RATE = (1 / 1000) / EVOLUTION_TIME_FACTOR;

// Dynamische Silikatverwitterung (Carbonat-Silikat-Kreislauf als echter
// Thermostat, Walker/Hays/Kasting 1981): waermer (und damit real auch
// niederschlagsreicher, hier ohne eigene globale Niederschlags-Aggregation
// vereinfacht direkt an die Temperatur gekoppelt) verwittert Silikatgestein
// schneller und zieht dadurch schneller CO2 aus der Atmosphaere — ein
// stabilisierender Gegenkopplungseffekt, anders als die destabilisierenden
// Rueckkopplungen (Albedo/Wasserdampf) oben. Modifiziert NUR die RATE der
// bestehenden GEOLOGICAL_CO2_RELAXATION_RATE (siehe Climate.weatheringFactor()
// in climate.js, angewendet in planet.js), NICHT die Scrubber-/Emitter-
// Konstanten unten — bei BASE_GLOBAL_TEMP ist der Faktor exakt 1, die
// bestehende Terraforming-Kalibrierung bleibt dadurch unangetastet.
const SILICATE_WEATHERING_TEMP_SENSITIVITY = 0.05; // Anteil/°C Abweichung von BASE_GLOBAL_TEMP
const SILICATE_WEATHERING_MIN_FACTOR = 0.2;
const SILICATE_WEATHERING_MAX_FACTOR = 3;

const CO2_PREINDUSTRIAL_PPM = 280; // realer vorindustrieller Referenzwert

// Chemische CH4-Senke (troposphaerische Oxidation durch OH-Radikale zu CO2/H2O) —
// anders als bei CO2 (Verwitterung ueber Jahrtausende) ist das real ein SCHNELLER
// Prozess: atmosphaerisches Methan hat nur eine Lebensdauer von ~10 Jahren, bevor
// es abgebaut ist. Deshalb hier eine um zwei Groessenordnungen HOEHERE Rate als
// GEOLOGICAL_CO2_RELAXATION_RATE (1/10 statt 1/1000) — nicht identisch uebernommen.
// Ohne diesen Term hatte CH4 (anders als CO2/O2) KEINE Ruecksetzkraft und blieb bei
// jeder laufenden Quelle (Zivilisation, Emitter, Vulkane) dauerhaft am Anschlag
// (50 ppm, siehe GASES) haengen, selbst nachdem die Quelle laengst abgeklungen war.
const CH4_PREINDUSTRIAL_PPM = 0.7; // realer vorindustrieller Referenzwert (heute ~1.9 ppm)
const GEOLOGICAL_CH4_EQUILIBRIUM = CH4_PREINDUSTRIAL_PPM;
const GEOLOGICAL_CH4_RELAXATION_RATE = (1 / 10) / EVOLUTION_TIME_FACTOR;
const CO2_FORCING_COEFFICIENT = 5.35; // W/m² pro ln(CO2eq/CO2_ref) — vereinfachte reale IPCC-Formel
const CLIMATE_SENSITIVITY = 0.8; // °C pro W/m² Strahlungsantrieb (~3°C pro CO2-Verdopplung)
// Wasserdampf-Rueckkopplung: real das staerkste Treibhausgas, aber KEIN vom
// Spieler regelbares Gas — die Luft haelt bei hoeherer Temperatur exponentiell
// mehr Wasserdampf (Clausius-Clapeyron, ~7%/°C), was die GHG-Erwaermung
// zusaetzlich verstaerkt. Ersetzt die alte statische Konstante durch
// Climate.waterVaporAmplification() (climate.js) — BASE bleibt der alte Fixwert
// 0.4, damit die Kalibrierung bei BASE_GLOBAL_TEMP exakt erhalten bleibt, nur
// die Abweichung reagiert jetzt dynamisch. Skaliert zusaetzlich mit
// outgassedWaterReserve (nicht waterCoverage()!): ein kochender Planet VOR der
// Ozean-Kondensation hat bereits eine Dampfatmosphaere mit maximalem
// Wasserdampf-Treibhauseffekt (realer Grund, warum die fruehe Erde so lange
// zum Abkuehlen brauchte) — waterCoverage() waere hier faelschlich 0.
const WATER_VAPOR_BASE_AMPLIFICATION = 0.4;
const WATER_VAPOR_CC_COEFF = 0.07; // Anteil/°C, reale Clausius-Clapeyron-Groessenordnung
const WATER_VAPOR_MIN_AMPLIFICATION = 0.1;
const WATER_VAPOR_MAX_AMPLIFICATION = 1.0; // Deckel gegen Runaway-Zusammenspiel mit der Albedo-Rueckkopplung unten
const BASE_GLOBAL_TEMP = 14; // °C, realer vorindustrieller globaler Durchschnitt

const BASE_ICE_COVERAGE = 0.12; // Anteil der Planetenoberfläche bei Basistemperatur
const ICE_TEMP_SENSITIVITY = 0.018; // Aenderung des Eisanteils je °C Abweichung von BASE_GLOBAL_TEMP
const SEA_LEVEL_PER_ICE_PERCENT = 0.4; // m Meeresspiegelanstieg je 1 Prozentpunkt geschmolzenes Eis

// Eis-Albedo-Rueckkopplung (Budyko 1969/Sellers 1969): Eis reflektiert ca.
// 60-80% des Sonnenlichts, Ozean/Land deutlich weniger — waechst die Eisdecke,
// wird mehr Sonnenlicht reflektiert, was weiter abkuehlt (Gefahr einer
// "Schneeball-Erde"), und umgekehrt schmilzt weniger Eis die Rueckstrahlung
// weiter. Real waere das ueber S0/4*Albedo-Differenz ~170 W/m² pro 100%
// Eisanteil-Anomalie — das wuerde die CO2-Kraft (max. ~10 W/m²) komplett
// dominieren und zu einem im Spiel unkontrollierbaren Runaway fuehren, daher
// bewusst stark gedaempft (gleiches Vorgehen wie bei den MILANKOVITCH_*_
// AMPLITUDE-Werten oben). Siehe Climate.albedoForcing() — bei currentIce ===
// BASE_ICE_COVERAGE (Spielstart) ist der Term exakt 0.
const ALBEDO_FORCING_PER_ICE_FRACTION = 40; // W/m² pro 100 Prozentpunkte Eisanteil-Abweichung, gedaempft

// Junge-schwache-Sonne (Gough 1981): junge Sterne strahlen schwaecher — die
// fruehe Sonne hatte real ca. 30% weniger Leuchtkraft als heute. Real braucht
// diese Aufhellung Milliarden Jahre, das waere im Spielverlauf nie sichtbar;
// SOLAR_LUMINOSITY_RAMP_RATE ist daher (wie EVOLUTION_TIME_FACTOR generell)
// bewusst auf die Spiel-Zeitskala komprimiert statt den realen Wert zu nutzen.
// Siehe Climate.solarLuminosityFactor — bei Faktor 1 (ausgereifter Stern) ist
// der Forcing-Term exakt 0.
const SOLAR_LUMINOSITY_START = 0.7;
const SOLAR_LUMINOSITY_RAMP_RATE = 0.02 / EVOLUTION_TIME_FACTOR;
const SOLAR_FORCING_PER_LUMINOSITY_UNIT = 40; // W/m² pro vollen Leuchtkraft-Anteilspunkt, gedaempft wie ALBEDO_FORCING_PER_ICE_FRACTION

// Planetenentstehung: der Spielstart ist ein "kochender" Planet OHNE Ozeane
// (Restwaerme aus Akkretion/Kernbildung), der erst abkuehlen muss, bevor
// ausgegastes Wasser ueberhaupt als Ozean kondensieren kann — reale Analogie:
// die fruehe Erde hatte eine heisse Dampfatmosphaere, Ozeane kondensierten erst,
// als die Oberflaeche unter den Siedepunkt fiel. primordialHeat ist ein
// zusaetzlicher, langsam abklingender Term OBEN AUF der normalen
// equilibriumTemperature() (siehe climate.js) — bewusst NICHT mit
// EVOLUTION_TIME_FACTOR skaliert: wie die uebrige Klimaphysik (TEMP_RELAXATION_RATE
// etc.) ist das ein rein geophysikalischer Abkuehlungsprozess, keine biologische
// Rate, und soll als klar abgegrenzte, ueberschaubare Vorphase VOR dem
// eigentlichen (durch EVOLUTION_TIME_FACTOR gestreckten) Evolutionsverlauf
// ablaufen.
const PRIMORDIAL_HEAT_START = 1200; // °C zusaetzlich zur normalen Gleichgewichtstemperatur
const PRIMORDIAL_HEAT_RELAXATION_RATE = 0.0015; // ~63% Abklingen in ~667 Jahren
// Ausgegastes Wasser sammelt sich unabhaengig von der Temperatur (Vulkanismus/
// Mantel-Entgasung laeuft schon waehrend der heissen Phase), kondensiert aber
// erst zu tatsaechlichem Ozean, sobald die Temperatur unter WATER_CONDENSATION_TEMP
// faellt — waterVolume (0..1) skaliert dann den effektiven Meeresspiegel-
// Schwellwert (siehe currentTerrain() in planet.js), 1 entspricht dem normalen
// SEA_LEVEL_THRESHOLD.
const WATER_CONDENSATION_TEMP = 100; // °C, vereinfachter Siedepunkt
const OUTGASSING_RATE = 1 / 1500; // Anteil/Jahr, Reservoir fuellt sich in ~1.500 Jahren
const WATER_CONDENSATION_RATE = 0.05; // ~63% Annaeherung an das Reservoir in ~20 Jahren, sobald kuehl genug

// Klima reagiert nicht sofort auf eine neue Strahlungsbilanz, sondern nur traege
// (Exponential-Glaettung Richtung Gleichgewicht) — realistische Naeherung an die
// thermische Traegheit von Ozean (Temperatur, Jahrzehnte) und Eisschilden
// (Jahrhunderte bis Jahrtausende).
const TEMP_RELAXATION_RATE = 1 / 30; // ~63% Annaeherung an neues Gleichgewicht in ~30 Jahren
const ICE_RELAXATION_RATE = 1 / 500; // ~63% Annaeherung in ~500 Jahren

// Milankovitch-Zyklen: periodische Schwankungen der Erdbahn/-achse, die real KEINE
// globale Temperaturaenderung direkt verursachen, sondern nur die Verteilung der
// Sonneneinstrahlung zwischen Breitengraden/Jahreszeiten verschieben (Antrieb der
// Eiszeitzyklen ueber Breitengrad-Rueckkopplungen, v.a. sommerliche Einstrahlung in
// hohen Breiten). Da dieses Modell keine Breitengrad-/Jahreszeiten-Klimaphysik
// kennt, wird ihr Netto-Effekt hier vereinfacht als direkte periodische Schwankung
// von equilibriumTemperature() angenaehert (siehe Climate.orbitalForcing()) —
// gleiche Vereinfachung wie beim uebrigen Klimamodell. Amplituden bewusst klein
// gehalten: reale Glazial/Interglazial-Schwankungen von 4-6°C entstehen erst durch
// Eis-Albedo- und CO2-Rueckkopplungen, die dieses Modell nicht abbildet (Eisdecke
// wirkt hier nicht auf die Temperatur zurueck) — hier nur der schwaechere direkte
// Orbitalanteil, als zusaetzliche natuerliche Schwankung ueber die vom Spieler
// gesteuerten Treibhausgase hinweg.
const MILANKOVITCH_OBLIQUITY_PERIOD_YEARS = 41000; // Achsneigung, staerkster Eiszeit-Treiber
// Skaliert mit der spielergesteuerten Achsneigung (siehe TILT_REFERENCE_DEGREES-
// Kommentar unten) — bei 0° Neigung gibt es keinen Wobble-Effekt, bei staerkerer
// Neigung als heute einen groesseren. Bei TILT_REFERENCE_DEGREES (23,5°, heutiger
// Wert) exakt dieser Fixwert.
const MILANKOVITCH_OBLIQUITY_AMPLITUDE = 0.7; // °C, bei Referenz-Achsneigung
// Fuer die 3D-Widget-Visualisierung (js/planet3d.js, Climate.obliquityWobbleDegrees()):
// echter Winkel-Wert statt des obigen °C-Terms — real schwankt die
// Erdachsneigung nur um ca. ±1,3°, hier etwas verstaerkt (Faktor ~2), damit
// die Schwankung auf dem kleinen Widget sichtbar bleibt (gleiches Prinzip wie
// die uebrigen bewusst gedaempften/verstaerkten Visualisierungskonstanten).
const OBLIQUITY_WOBBLE_AMPLITUDE_DEGREES = 3;
const MILANKOVITCH_PRECESSION_PERIOD_YEARS = 23000; // Praezession der Rotationsachse
const MILANKOVITCH_PRECESSION_AMPLITUDE = 0.5; // °C, durch Exzentrizitaet moduliert (siehe orbitalForcing())
const MILANKOVITCH_ECCENTRICITY_PERIOD_YEARS = 100000; // Exzentrizitaet der Erdbahn
const MILANKOVITCH_ECCENTRICITY_AMPLITUDE = 0.15; // °C, schwacher direkter Effekt

// Simulationstempo: TICK_INTERVAL_MS = Echtzeit-Abstand zwischen Simulationsschritten,
// SPEED_STEPS = moegliche "Jahre pro Schritt"-Werte (Index 0 = Pause).
const TICK_INTERVAL_MS = 500;
const SPEED_STEPS = [0, 1, 5, 20, 100, 500];

// Breitenabhängiges Temperaturgefälle (grobe Näherung an reale Werte: Äquator ~27°C,
// Pole ~-13°C im Schnitt, bei einem globalen Mittel von ~14°C).
const EQUATOR_TEMP_BONUS = 13;
const POLE_TEMP_RANGE = 40;

// Spielergesteuerte Achsneigung (js/climate.js: axialTilt, Planet.localTemperature()):
// TILT_REFERENCE_DEGREES ist die reale heutige Erdachsneigung — bei diesem Wert
// bleibt JEDE hier abgeleitete Groesse exakt beim bisherigen Verhalten (Null-
// Effekt-Prinzip, siehe GEOLOGICAL_CO2_EQUILIBRIUM-Kommentar-Stil oben).
const TILT_REFERENCE_DEGREES = 23.5;
const AXIAL_TILT_MIN = 0;
const AXIAL_TILT_MAX = 90;
// Breitengradient-Skalierung (Climate.tiltGradientFactor(), genutzt in
// Planet.localTemperature()): bei 0° Neigung gibt es keine Jahreszeiten und Pole
// bekommen nie hohen Sonnenstand -> STEILERER Gradient (Faktor > 1). Real kehrt
// sich der Jahresmittel-Gradient bei sehr hoher Neigung (>50-60°, Williams &
// Pollard 2003) sogar um (Pole waermer als Aequator) — bewusst NICHT bis zur
// Umkehr simuliert (Risiko fuer die Vegetations-/Fauna-Zonierung), sondern nur
// stark abgeflacht (MIN_FACTOR statt negativ).
const TILT_GRADIENT_SENSITIVITY = 0.012; // Anteil/° Abweichung von TILT_REFERENCE_DEGREES
const TILT_GRADIENT_MIN_FACTOR = 0.2;
const TILT_GRADIENT_MAX_FACTOR = 1.4;
// Chaotischer Achsneigungs-Drift ohne ausreichende Mondmasse (Laskar & Robutel
// 1993: ohne stabilisierenden Mond kann die Achsneigung eines Planeten ueber
// geologische Zeitraeume chaotisch zwischen ~0° und ~85° wandern). Bei
// heutigem Massenverhaeltnis (Mondmasse=1, Planetenmasse=1) ist die
// Instabilitaet exakt 0 -> kein Drift. Kalibrierung im Browser verifiziert:
// der urspruengliche Wert (0.004) war um etwa Faktor 1000 zu klein — bei einem
// Random Walk (Schrittweite RATE/sqrt(3)) betrug die Streuung nach 39 Millionen
// Jahren nur ~0,1-0,4°, praktisch unsichtbar innerhalb eines realistischen
// Spieldurchlaufs (hunderttausende Jahre). 5/EVOLUTION_TIME_FACTOR ergibt eine
// erwartete Streuung von rund 35-40° nach ~100.000 Jahren — spuerbar, aber
// nicht sofort/absurd schnell.
const TILT_CHAOTIC_DRIFT_RATE = 5 / EVOLUTION_TIME_FACTOR;
const MOON_MASS_DEFAULT = 1; // heutiger Erdmond
const MOON_MASS_MIN = 0;
const MOON_MASS_MAX = 2;
const PLANET_MASS_DEFAULT = 1; // Erdmasse
const PLANET_MASS_MIN = 0.3;
const PLANET_MASS_MAX = 3;

// Groessenvergleich (js/charts.js: renderSizeComparisonChart()): reale
// Aequatorradien der Sonnensystem-Planeten in km (NASA Planetary Fact Sheet).
// Der eigene Planet hat im Spiel keinen eigenen Radius-Wert — er wird ueber
// eine vereinfachte Masse-Radius-Beziehung geschaetzt (radius ~ masse^(1/3),
// entspricht gleichbleibender mittlerer Dichte — eine grobe, aber fuer
// terrestrische Planeten im PLANET_MASS_MIN/_MAX-Bereich plausible Naeherung;
// echte Gesteinsplaneten komprimieren bei hoeherer Masse leicht staerker, das
// wird hier bewusst vernachlaessigt).
const EARTH_RADIUS_KM = 6371;
const SOLAR_SYSTEM_PLANETS = [
  { name: "Merkur", radiusKm: 2440, color: [154, 140, 128] },
  { name: "Venus", radiusKm: 6052, color: [216, 178, 122] },
  { name: "Erde", radiusKm: EARTH_RADIUS_KM, color: [70, 130, 180] },
  { name: "Mars", radiusKm: 3390, color: [193, 96, 66] },
  { name: "Jupiter", radiusKm: 69911, color: [200, 168, 128] },
  { name: "Saturn", radiusKm: 58232, color: [212, 192, 140] },
  { name: "Uranus", radiusKm: 25362, color: [150, 210, 220] },
  { name: "Neptun", radiusKm: 24622, color: [80, 110, 210] },
];
function estimatedPlanetRadiusKm(planetMass) {
  return EARTH_RADIUS_KM * Math.cbrt(planetMass);
}

const SEA_LEVEL_THRESHOLD = 0.58; // Hoehen-Schwelle (0..1): darunter Ozean, darueber Land

// Salzgehalt des Ozeans in PSU (Practical Salinity Units, ~g/kg) — realer globaler
// Mittelwert 35. Reale Verteilung ist NICHT linear mit der Breite: in den Subtropen
// (~starke Verdunstung, wenig Niederschlag) liegt der Salzgehalt ueber dem Mittel,
// am Aequator (viel Niederschlag) und an den Polen (Suesswasser aus Eisschmelze,
// wenig Verdunstung) darunter — daher eine eigene Kurvenform statt der linearen
// Breiten-Rampe wie bei der Temperatur.
// Ozeanchemie (js/ocean.js): beide Werte reine Ableitungen des aktuellen
// Atmosphaerenzustands (Chemie/Loeslichkeit stellen sich schnell genug ein,
// dass keine eigene Traegheit noetig ist) — kein eigener Save-State.
// Ozeanversauerung (Zeebe & Wolf-Gladrow 2001): hoeheres CO2 bildet mehr
// Kohlensaeure im Wasser, senkt den pH-Wert — realer Referenzwert ~0.3-0.4
// pH-Abfall pro CO2-Verdopplung.
const OCEAN_PH_PREINDUSTRIAL = 8.1;
const OCEAN_PH_CO2_SENSITIVITY = 0.3; // pH-Punkte pro Verdopplung von CO2 (log2)
const OCEAN_PH_MIN = 6.5;
// Wirkung auf pH-empfindliche Meeresarten (siehe FAUNA_TYPES phSensitive-Flag,
// bisher nur Mollusken/Kalkschaler): Eignung faellt linear mit dem pH-Abfall
// unter den vorindustriellen Referenzwert.
const OCEAN_PH_SENSITIVITY = 0.6;

// Gelöster Sauerstoff im Ozean (Keeling et al. 2010, "ocean deoxygenation"):
// waermeres Wasser kann weniger Gas loesen — bei steigender Temperatur sinkt
// der Sauerstoffgehalt, was zu anoxischen Ereignissen und Massenaussterben
// mariner Fauna fuehrt. Gilt fuer ALLE Meeresarten (nicht nur pH-empfindliche),
// siehe Fauna.suitability().
const OXYGEN_SOLUBILITY_TEMP_COEFF = 0.03; // Anteil/°C Abweichung von BASE_GLOBAL_TEMP
const OXYGEN_SOLUBILITY_MIN_FRACTION = 0.05;

// Magnetfeld & Atmosphaerenerosion (Lammer et al. 2008): ohne intaktes
// Magnetfeld blaest der Sonnenwind die Atmosphaere allmaehlich ab (siehe Mars).
// fieldStrength (Climate) klingt rein monoton ab wie RADIATION_DECAY_RATE
// (ein Dynamo erholt sich nicht von selbst) — bewusst MIT EVOLUTION_TIME_FACTOR
// skaliert (anders als PRIMORDIAL_HEAT_RELAXATION_RATE!): real bleibt ein
// Planetenmagnetfeld Milliarden Jahre stabil, das waere im Spiel nie sichtbar;
// an die Evolutions-Zeitskala gekoppelt wird es zu einem Spaetspiel-Ereignis
// (Hochtechnologie-Aera), nicht zu einer Bedrohung der fruehen mikrobiellen
// Phase. Unterhalb MAGNETIC_FIELD_EROSION_THRESHOLD erodiert Atmosphere.erode()
// (siehe atmosphere.js) alle Hauptgase gemeinsam proportional zur Unterschreitung.
// Kalibrierung im Browser verifiziert (siehe Verifikations-Session): 0.03 war
// um GROESSENORDNUNGEN zu schnell — das Feld brach bereits nach ~1000-2500
// Jahren zusammen (noch in der fruehen mikrobiellen Phase) und erodierte die
// Atmosphaere daraufhin ueber hunderttausende Jahre permanent auf ihre
// Minimalwerte (O2 blieb bei 0% haengen, Eukaryoten konnten nie entstehen).
// 0.00006 verschiebt die Schwellenwert-Unterschreitung auf ~500.000 Jahre —
// weit nach der mikrobiellen Fruehphase, ein echtes Spaetspiel-Ereignis.
const MAGNETIC_FIELD_DECAY_RATE = 0.00006 / EVOLUTION_TIME_FACTOR;
const MAGNETIC_FIELD_EROSION_THRESHOLD = 0.3;
const ATMOSPHERIC_EROSION_MAX_FRACTION_PER_YEAR = 0.004 / EVOLUTION_TIME_FACTOR;

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
const CURRENT_RELAXATION_RATE = 0.05; // Anteil/Jahr, um den sich die Temperatur-Anomalie Richtung ihres Ziels (siehe unten) bewegt

// Randstroeme (Golfstrom-Analogon, siehe Currents.boundaryCurrentBias() in
// currents.js): CURRENT_BANDS oben ist rein zonal (Ost-West) und kann daher
// GRUNDSAETZLICH keinen polwaertigen Waermetransport abbilden — genau das ist
// aber die reale Kernwirkung des Golfstroms (waermt Nordeuropa deutlich ueber
// die Breitengrad-Erwartung hinaus). Modelliert stattdessen die reale
// Ozeanwirbel-Physik: Westrandstroeme (an der Westkueste eines Ozeanbeckens)
// transportieren warmes Wasser polwaerts, Ostrandstroeme kuehles Wasser
// aequatorwaerts (Auftrieb, reales Beispiel Humboldtstrom vor Peru/
// Kalifornien) — dieselbe Zirkulation, zwei Seiten. BOUNDARY_CURRENT_SCAN_
// RADIUS bestimmt, wie nah eine Ozeanzelle an einer Kueste liegen muss, um
// als Randstrom zu gelten. WARM_BIAS/COOL_BIAS sind die Ziel-Temperatur-
// anomalien, denen sich cell.tempAnomaly annaehert (ersetzt die vorherige
// feste Relaxation Richtung 0 fuer offenen Ozean bleibt weiterhin 0).
const BOUNDARY_CURRENT_SCAN_RADIUS = 4;
const BOUNDARY_CURRENT_WARM_BIAS = 4; // °C, Westrandstrom (golfstromartig)
const BOUNDARY_CURRENT_COOL_BIAS = -3; // °C, Ostrandstrom (Auftrieb)

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

// Lokaler Niederschlag (0-100, grobe Groessenordnung statt echter mm-Simulation):
// feuchte Meeresluft draengt vom Ozean landeinwaerts und verliert dabei zunehmend
// Feuchtigkeit (Kontinentalitaets-Effekt) — daher COAST_FALLOFF pro Gitterzelle
// Entfernung zur naechsten Kueste. Kalte Luft kann weniger Feuchtigkeit halten
// (polare/kontinentale Trockenheit), Vegetation erhoeht die lokale Feuchte ueber
// Evapotranspiration (Regenwald-Rueckkopplung). coastDistance selbst wird einmalig
// aus der (fixen) Hoehenkarte berechnet, siehe Planet.computeCoastDistances —
// bewusst NICHT von der aktuellen (durch Meeresspiegel/Eis schwankenden) Kueste
// abgeleitet, da reale Kontinentalitaet nicht mit kurzfristigen Klimaschwankungen
// mitwandert.
const PRECIPITATION_OCEAN_BASE = 90;
const PRECIPITATION_ICE_BASE = 35;
const PRECIPITATION_COAST_FALLOFF_PER_CELL = 4;
const PRECIPITATION_MIN = 5;
const PRECIPITATION_COLD_THRESHOLD = 0; // °C, darunter sinkt die Luftfeuchte-Kapazitaet
const PRECIPITATION_COLD_PENALTY_PER_DEGREE = 1.5;
const PRECIPITATION_HOT_THRESHOLD = 28; // °C, darueber steigt die Verdunstung (Wuesteneffekt)
const PRECIPITATION_HOT_PENALTY_PER_DEGREE = 3.5; // Wert ergibt mit quadratischer mm-Skalierung realistische Wuesten
const PRECIPITATION_VEGETATION_BONUS_MAX = 15; // bei 100% Vegetationsbedeckung

// Atmosphärisches Feuchtetransport-Modell (ersetzt einfachen Küstenabstand-Ansatz):
// Luftmassen nehmen über dem Ozean Feuchtigkeit auf und verlieren sie beim Überqueren
// von Land (Kontinentalisierung) und Gebirge (orographischer Lift → Regenschatteneffekt).
// MOISTURE_OCEAN_BASE: Feuchte, mit der eine Luftmasse frisch vom Ozean auf Land trifft.
// MOISTURE_OCEAN_GAIN:  Feuchtegewinn pro Ozeanzelle im Windstrom.
// MOISTURE_BASE_LOSS:   Feuchteanteil, der auf flachem Küstenland als Regen fällt (0–1).
// OROGRAPHIC_LIFT:      Zusätzlicher Feuchteanteil pro Einheit relativer Gebirgshöhe.
// MOISTURE_VEG_FEED:    Wald/Vegetation gibt Feuchtigkeit durch Evapotranspiration zurück.
// MOISTURE_ICE_LOSS:    Eis entzieht der Luft kaum Feuchtigkeit (Kaltluft hält wenig).
const MOISTURE_OCEAN_BASE = 85;
const MOISTURE_OCEAN_GAIN = 20;
const MOISTURE_MAX = 100;
const MOISTURE_BASE_LOSS = 0.50;
const OROGRAPHIC_LIFT = 0.45;
const MOISTURE_VEG_FEED = 2.5;
const MOISTURE_ICE_LOSS = 0.06;

const VEG_MIN_TEMP = 2; // °C, unterhalb stirbt Vegetation ab (Dauerfrost)
const VEG_MAX_TEMP = 32; // °C, oberhalb stirbt Vegetation ab (Hitzestress)
const VEG_OPTIMAL_TEMP = 17; // °C, beste Wachstumsbedingungen
// Bewusst langsam (~4x langsamer als eine fruehere Version) — Evolution soll sich
// ueber Jahrtausende statt Jahrhunderte entfalten, nicht in wenigen hundert Jahren
// bis zur Hochtechnologie durchlaufen.
const VEG_GROWTH_RATE = 0.004 / EVOLUTION_TIME_FACTOR; // Anteil/Jahr Richtung 100%, bei optimalen Bedingungen
const VEG_DECAY_RATE = 0.008 / EVOLUTION_TIME_FACTOR; // Anteil/Jahr Richtung 0%, bei ungeeigneten Bedingungen

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
  // tolerance/salinityTolerance werden fuer Prokaryoten NICHT zur Eignungspruefung
  // herangezogen (siehe Fauna.suitability()-Sonderfall) — sie sind als extremophile
  // Basis der Nahrungskette klimaunabhaengig im gesamten Ozean lebensfaehig, analog
  // zu den Nanotech-Robotern. Werte hier dienen nur noch als Alt-Referenz.
  // successors:[eukaryotes] ist NOTWENDIG, nicht nur kosmetisch: Eukaryoten
  // koennen nur ueber leere Ozeanzellen ODER Sukzession aus einer reifen
  // Vorgaenger-Population entstehen (siehe Fauna.tickCell/bestTypeFor). Sobald
  // der O2-Gehalt die Schwelle erreicht, ist der Ozean aber typischerweise schon
  // VOLLSTAENDIG mit Prokaryoten besiedelt (das ist ja gerade die Voraussetzung
  // fuer den hohen O2-Wert) — ohne diese Sukzessionsroute gab es dann keine
  // leere Zelle mehr, in der Eukaryoten je haetten entstehen koennen: ein
  // permanenter Sackgassen-Zustand, selbst nachdem O2 tatsaechlich ausreichte
  // (Kernursache des gemeldeten Fehlers "Eukaryoten entstehen nie").
  { id: "prokaryotes", name: "Prokaryoten", habitat: "ocean", civilizationCapable: false, manualPlacement: true, successorOnly: false, tolerance: 30, salinityTolerance: 25, color: [120, 168, 120], successors: [{ id: "eukaryotes" }] },
  { id: "eukaryotes", name: "Eukaryoten", habitat: "ocean", civilizationCapable: false, manualPlacement: true, successorOnly: false, tolerance: 25, salinityTolerance: 20, color: [96, 156, 132], successors: [] },

  // Wasserbewohner (Wurzeln, unabhaengig voneinander) — alle civilizationCapable:false,
  // aus denselben realen biologischen Gruenden wie bei Arthropoden (siehe Kommentar
  // unten), zusaetzlich verhindert das Wasser selbst Feuer/Metallurgie als
  // Grundvoraussetzung jeder bekannten technologischen Zivilisation:
  // - Radiata: wie reale Nesseltiere/Stachelhaeuter nur ein Nervennetz, kein
  //   zentrales Gehirn, radiale statt bilaterale Symmetrie ohne Greifwerkzeuge.
  // - Mollusken: reale Kopffuesser (Oktopusse) zeigen zwar Intelligenz, aber kurze
  //   Lebensspanne (1-2 Jahre) und Einzelgaengertum verhindern kulturelle
  //   Weitergabe von Wissen ueber Generationen — eine Zivilisation braucht beides.
  // - Trichordaten: primitive Vorstufe echter Wirbeltiere (real z.B. Lanzettfischchen),
  //   ohne zentrales Gehirn und ohne Gliedmaßen.
  // - Fische: Flossen statt Greifhaende, zusaetzlich zum generellen Wasser-Feuer-Problem.
  // Die Nachfolgelinie an Land (Amphibien etc., siehe successors bei "fish") bleibt
  // civilizationCapable, sobald sie das Wasser verlaesst.
  { id: "radiata", name: "Radiata", habitat: "ocean", civilizationCapable: false, manualPlacement: true, successorOnly: false, tolerance: 20, salinityTolerance: 15, color: [150, 110, 168], successors: [] },
  // phSensitive: reale Kalkschaler (Muscheln/Schnecken) sind besonders
  // empfindlich gegenueber Ozeanversauerung (Zeebe & Wolf-Gladrow 2001) — siehe
  // OCEAN_PH_SENSITIVITY-Kommentar oben und Fauna.suitability(). Andere
  // Meeresarten bekommen keinen kuenstlichen pH-Malus, nur den allgemeinen
  // gelöst-O2-Effekt (gilt fuer alle Meeresarten).
  { id: "mollusks", name: "Mollusken", habitat: "ocean", civilizationCapable: false, manualPlacement: true, successorOnly: false, tolerance: 18, salinityTolerance: 14, phSensitive: true, color: [176, 132, 104], successors: [] },
  { id: "trichordates", name: "Trichordaten", habitat: "ocean", civilizationCapable: false, manualPlacement: true, successorOnly: false, tolerance: 16, salinityTolerance: 12, color: [120, 132, 176], successors: [] },
  { id: "fish", name: "Fische", habitat: "ocean", civilizationCapable: false, manualPlacement: true, successorOnly: false, tolerance: 14, salinityTolerance: 12, color: [90, 140, 168], successors: [{ id: "amphibians", crossHabitat: true }] },

  // Land-/Luftbewohner.
  // civilizationCapable:false ist eine bewusste biologische Grenze, keine
  // Balance-Entscheidung: das Exoskelett begrenzt Koerpergroesse (haeutungs-
  // limitiert) und die Tracheenatmung (Sauerstoffdiffusion durch Roehren statt
  // Lunge/Kiemen) begrenzt sie zusaetzlich weiter — beides zusammen laesst real
  // kein Arthropoden-Gehirn mit der noetigen Neuronendichte fuer Werkzeugbau/
  // Zivilisation zu, trotz oft hoher OEkologischer Vielfalt und Anpassungsfaehigkeit
  // (Insekten gab es bereits ueber 100 Millionen Jahre vor den ersten Landwirbel-
  // tieren, ohne dass daraus je eine Zivilisation entstand).
  { id: "arthropods", name: "Arthropoden", habitat: "land", civilizationCapable: false, manualPlacement: true, successorOnly: false, tolerance: 24, minVegetation: 5, color: [176, 158, 64], successors: [] },
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
// Ebenfalls ~4x gegenueber einer fruehen Version verlangsamt (siehe VEG_GROWTH_RATE).
const FAUNA_GROWTH_RATE = 0.0025 / EVOLUTION_TIME_FACTOR;
const FAUNA_DECAY_RATE = 0.006 / EVOLUTION_TIME_FACTOR;

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
const PROKARYOTE_O2_RELEASE_PER_YEAR = 0.02 / EVOLUTION_TIME_FACTOR;

// Atmung: jede Fauna AUSSER Prokaryoten (die stattdessen Photosynthese betreiben,
// siehe oben) verbraucht O2 und setzt CO2 frei — proportional zum AKTUELLEN
// Gesamtbestand (nicht zur Aenderung wie bei Vegetation, siehe VEG_MAX_CO2_UPTAKE_
// PPM_PER_YEAR-Kommentar): echte Atmung findet kontinuierlich statt, auch bei
// stabilem Bestand, anders als der Netto-Kohlenstoff-Umsatz eines ausgewachsenen
// Waldes. Das schliesst den Kreislauf zur einseitigen O2-Produktion (Prokaryoten/
// Vegetation/Sauerstoffgenerator) — ohne Gegenspieler stieg O2 sonst unbegrenzt
// bis zum Anschlag (35%).
const FAUNA_MAX_O2_CONSUMPTION_PER_YEAR = 0.06 / EVOLUTION_TIME_FACTOR;
const FAUNA_MAX_CO2_RELEASE_PPM_PER_YEAR = 8 / EVOLUTION_TIME_FACTOR;

// Sauerstoffgenerator/CO2-Scrubber/Methanfilter/Emitter: alle vier wirken als
// KONSTANTER Jahresfluss, der der jeweiligen geologischen/chemischen Senke
// (GEOLOGICAL_O2_RELAXATION_RATE/GEOLOGICAL_CO2_RELAXATION_RATE/GEOLOGICAL_CH4_
// RELAXATION_RATE, siehe deren Kommentare oben) entgegenwirkt. Ein konstanter
// Fluss gegen eine Senke, die proportional zur Abweichung vom Referenzwert
// zurueckzieht, pendelt sich mathematisch auf einen NEUEN, stabilen Fixpunkt ein:
// Referenzwert + (Fluss / Senkenrate) — z.B. verschiebt EIN Sauerstoffgenerator
// den O2-Fixpunkt dauerhaft von GEOLOGICAL_O2_EQUILIBRIUM (21%) auf 22%, statt
// (wie zuvor) unbegrenzt bis zum Anschlag (35%) zu wachsen. *_OUTPUT_PER_YEAR wird
// deshalb bewusst NICHT als eigener, willkuerlich gewaehlter Wert definiert,
// sondern aus dem gewuenschten Fixpunkt-Versatz (*_MAX_SHIFT) und der jeweiligen
// Senkenrate ZURUECKGERECHNET — nur so ergibt sich exakt dieser Versatz und kein
// anderer. Wichtige Nebenwirkung: die Anflugsgeschwindigkeit zum neuen Fixpunkt
// ist an die Senkenrate gekoppelt (nicht mehr frei ueber TOOL_TIME_FACTOR
// einstellbar) — Strukturen wirken damit auf derselben geologischen Zeitskala wie
// die Senke selbst, statt als kurzfristige Abkuerzung.
const OXYGEN_GENERATOR_MAX_SHIFT = 1; // Prozentpunkte O2, Fixpunkt-Versatz PRO Generator
const OXYGEN_GENERATOR_OUTPUT_PER_YEAR = OXYGEN_GENERATOR_MAX_SHIFT * GEOLOGICAL_O2_RELAXATION_RATE;

// CO2-Scrubber/Emitter: analoge Terraforming-Strukturen fuer CO2 statt O2 (siehe
// Kommentar oben). MAX_SHIFT aequivalent zu OXYGEN_GENERATOR_MAX_SHIFT abgeleitet:
// 1% von O2s Spanne (0-35) ist 1/35 davon; derselbe Anteil auf die CO2-Spanne
// (150-2000, siehe GASES) angewendet ergibt ~50 ppm.
const CO2_SCRUBBER_MAX_SHIFT = -50; // ppm CO2, Fixpunkt-Versatz PRO Scrubber
const CO2_SCRUBBER_OUTPUT_PER_YEAR = -CO2_SCRUBBER_MAX_SHIFT * GEOLOGICAL_CO2_RELAXATION_RATE;
const EMITTER_CO2_MAX_SHIFT = 50; // ppm CO2, Fixpunkt-Versatz PRO Emitter
const EMITTER_CO2_OUTPUT_PER_YEAR = EMITTER_CO2_MAX_SHIFT * GEOLOGICAL_CO2_RELAXATION_RATE;

// Methanfilter: Gegenstueck zum CO2-Scrubber, aber fuer CH4 (siehe Kommentar
// oben) — MAX_SHIFT aequivalent zu OXYGEN_GENERATOR_MAX_SHIFT abgeleitet: derselbe
// Anteil (1/35) auf die CH4-Spanne (0-50 ppm, siehe GASES) angewendet ergibt ~1,5 ppm.
const METHANE_SCRUBBER_MAX_SHIFT = -1.5; // ppm CH4, Fixpunkt-Versatz PRO Methanfilter
const METHANE_SCRUBBER_OUTPUT_PER_YEAR = -METHANE_SCRUBBER_MAX_SHIFT * GEOLOGICAL_CH4_RELAXATION_RATE;
const EMITTER_CH4_MAX_SHIFT = 1.5; // ppm CH4, Fixpunkt-Versatz PRO Emitter
const EMITTER_CH4_OUTPUT_PER_YEAR = EMITTER_CH4_MAX_SHIFT * GEOLOGICAL_CH4_RELAXATION_RATE;

// Jahreswahrscheinlichkeit, mit der ein reifes Taxon mit crossHabitat-Nachfolger
// (z.B. Fische -> Amphibien) eine geeignete leere Nachbarzelle neu besiedelt.
const CROSS_HABITAT_SPAWN_CHANCE = 0.1 / 3;

// Jahreswahrscheinlichkeit, mit der eine geeignete, noch unbesiedelte Zelle
// spontan von der best-passenden Wurzelart (Vegetation ODER Fauna) kolonisiert
// wird — NICHT sofort im selben Jahr, sobald sie geeignet ist. Ohne dieses
// Element wuerden nach dem Oeffnen eines Gates (z.B. Eukaryoten-Gate) praktisch
// ALLE geeigneten Zellen der Welt im exakt selben Jahr gleichzeitig "aufbluehen"
// (deterministisch, kein Zufall) — das wirkte wie ein einziger globaler Sprung
// statt einer organisch ueber die Karte wandernden Besiedlung, und machte den
// Spielverlauf bei gleichem Vorgehen praktisch identisch reproduzierbar.
const NATURAL_COLONIZATION_CHANCE = 0.15 / 3;

// Zivilisation: Zellen mit reifem (>=90%) zivilisationsfaehigem Taxon bauen pro
// Jahr Tech-Level auf (0..100), sonst faellt er zurueck — Kollaps schneller als
// Aufstieg (COLLAPSE_RATE > GROWTH_RATE), reale Analogie: eine Zivilisation
// zerfaellt schneller, als sie entsteht. Ab CITY_TECH_THRESHOLD gilt eine Zelle
// als "Stadt", ab HIGH_TECH_THRESHOLD als "Hochtechnologie" (Voraussetzung fuer
// die Atombombe, siehe civilization.js).
const CIVILIZATION_GROWTH_RATE = 0.1 / EVOLUTION_TIME_FACTOR;
const CIVILIZATION_DECAY_RATE = 0.2 / EVOLUTION_TIME_FACTOR;
const CITY_TECH_THRESHOLD = 30;
const HIGH_TECH_THRESHOLD = 80;

// Einwohnerzahl einer Stadt-Zelle: rein aus dem Tech-Level abgeleitet (kein
// eigener State), exponentiell zwischen CITY_POPULATION_MIN (an der Stadt-
// Schwelle, kleine Siedlung) und CITY_POPULATION_MAX (bei Tech-Level 100,
// Megastadt) interpoliert — Staedte wachsen real eher exponentiell als linear
// mit ihrer technologischen/wirtschaftlichen Reife.
const CITY_POPULATION_MIN = 5000;
const CITY_POPULATION_MAX = 12000000;

// Zivilisation stoesst CO2/CH4 aus, proportional zum Tech-Level jeder Zelle
// (0..100) — genau wie Fauna-Atmung/Vegetation als ANTEIL am theoretischen
// Maximum (JEDE Zelle des Planeten auf Techlevel 100) modelliert, siehe
// Civilization.tick(). Die Werte hier sind dieses theoretische Maximum pro Jahr;
// realistisch bleibt der tatsaechliche Ausstoss weit darunter, da selten das
// gesamte Planetenraster gleichzeitig hochindustrialisiert ist. CH4 hat einen viel
// kleineren ppm-Massstab als CO2 (siehe GASES in data.js), traegt ueber seine hohe
// Treibhauspotenz (potency:25) aber trotzdem spuerbar zur Erwaermung bei.
// Civilization.cumulativeEmissions() summiert den bisherigen Gesamtausstoss separat
// von den (durch andere Prozesse wie Vegetation ebenfalls veraenderten) aktuellen
// Atmosphaerenwerten — fuer die "wie viel hat die Zivilisation insgesamt
// eingebracht"-Anzeige im HUD.
const CIVILIZATION_CO2_EMISSION_PPM_PER_YEAR = 5 / EVOLUTION_TIME_FACTOR;
const CIVILIZATION_CH4_EMISSION_PPM_PER_YEAR = 0.3 / EVOLUTION_TIME_FACTOR;

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
const VEG_MAX_CO2_UPTAKE_PPM_PER_YEAR = 6 / EVOLUTION_TIME_FACTOR;
const VEG_MAX_O2_RELEASE_PERCENT_PER_YEAR = 0.05 / EVOLUTION_TIME_FACTOR;

// Zufaellige Naturereignisse (siehe js/events.js): seltene, aber spuerbare
// Unterbrechungen des sonst glatten Wachstumsverlaufs. Jaehrliche
// Wahrscheinlichkeit je Ereignistyp, unabhaengig voneinander gewuerfelt. Reale
// Haeufigkeiten grosser Ereignisse (z.B. VEI-6-Vulkanausbrueche global ~1x/100
// Jahre) dienen als grobe Groessenordnung, nicht als exakte Simulation — auf
// Spielbarkeit/Erzaehlwert statt geologischer Praezision getrimmt.
const VOLCANO_ERUPTION_CHANCE_PER_YEAR = 0.01 / EVOLUTION_TIME_FACTOR;
const EARTHQUAKE_CHANCE_PER_YEAR = 0.015 / EVOLUTION_TIME_FACTOR;
const METEOR_IMPACT_CHANCE_PER_YEAR = 0.003 / EVOLUTION_TIME_FACTOR;
const STORM_CHANCE_PER_YEAR = 0.04 / EVOLUTION_TIME_FACTOR;

// Vulkanausbruch: zerstoert die Einschlagzelle vollstaendig, die Nachbarzellen
// (Diamant-Radius 1, gleiches Muster wie Planet.detonate) teilweise, und
// schleudert CO2/CH4 in die Atmosphaere — reale Vulkanausbrueche setzen beide
// Gase frei, hier fuer spuerbare Spielwirkung skaliert (siehe allgemeines
// Simplifizierungs-Prinzip im GEOLOGICAL_CO2_EQUILIBRIUM-Kommentar).
const VOLCANO_NEIGHBOR_DAMAGE = 0.6;
const VOLCANO_CO2_BURST_PPM = 30;
const VOLCANO_CH4_BURST_PPM = 1;

// Erdbeben: mildere, rein lokale Zerstoerung ohne Atmosphaeren-Wirkung, trifft
// aber gezielt Infrastruktur (Tech-Level-Rueckschlag), wenn eine Stadt betroffen ist.
const EARTHQUAKE_DAMAGE = 0.4;
const EARTHQUAKE_TECH_DAMAGE = 15;

// Meteoriteneinschlag: das seltenste, aber verheerendste Ereignis — kann auch
// Ozeanzellen treffen, zerstoert einen groesseren Radius vollstaendig/teilweise
// UND loest einen "Einschlagswinter" aus (globale Abkuehlung, klingt ueber
// Jahrzehnte ab, siehe Climate.triggerImpactWinter) — reale Analogie: der Staub-/
// Aerosolschleier nach grossen Einschlaegen (z.B. Chicxulub) blockierte ueber
// Jahre bis Jahrzehnte Sonnenlicht.
const METEOR_DEVASTATION_RADIUS = 2;
const METEOR_NEIGHBOR_DAMAGE = 0.7;
const METEOR_IMPACT_WINTER_COOLING = 4; // °C
const IMPACT_WINTER_RELAXATION_RATE = 1 / 40; // ~63% Erholung in ~40 Jahren

// Sturm (Taifun/Hurrikan/Orkan — je nach Weltregion unterschiedlich benannte
// tropische/aussertropische Wirbelstuerme, hier mechanisch identisch behandelt,
// nur der angezeigte Name wechselt zufaellig): das haeufigste, aber mildeste
// Ereignis — nur lokale Teilzerstoerung, keine Atmosphaeren-/Klimawirkung.
const STORM_DAMAGE = 0.25;
const STORM_NAMES = ["Taifun", "Hurrikan", "Orkan"];

// Tsunami: existiert (anders als die vier Ereignisse oben) NICHT als
// Zufallsereignis, sondern nur als vom Spieler gezielt ausgeloestes Werkzeug
// (siehe Planet.triggerTsunami) — reale Tsunamis werden durch Unterwasser-
// Erdbeben/Erdrutsche ausgeloest, die hier nicht simuliert werden; der Spieler
// spielt stattdessen direkt die Ausloesung. Trifft nur Kuestenlandzellen
// (cell.coastDistance === 1, siehe Planet.computeCoastDistances), staerker als
// ein Erdbeben, mit groesserem Wirkradius als Vulkan/Erdbeben, da die Wellen
// weiter ins Landesinnere reichen als eine lokale Erschuetterung.
const TSUNAMI_DAMAGE = 0.6;
const TSUNAMI_NEIGHBOR_DAMAGE = 0.3;
const TSUNAMI_RADIUS = 2;
const TSUNAMI_TECH_DAMAGE = 20;

// Seuche: ebenfalls rein spielergesteuert (siehe Tsunami-Kommentar oben), kein
// Zufallsereignis. Anders als die physischen Katastrophen oben wirkt sie NICHT
// auf Vegetation (eine Krankheit vernichtet keine Pflanzen) und richtet auch bei
// vollem Ausbruch keine Totalzerstoerung an (Populationen erholen sich, anders
// als bei Atombombe/Meteor) — dafuer breitet sie sich als Kontagion ueber einen
// GROESSEREN Radius aus als die physischen Ereignisse, da Ansteckung nicht durch
// die Wirkung einer lokalen Explosion/Erschuetterung begrenzt ist.
const PLAGUE_DAMAGE = 0.5;
const PLAGUE_NEIGHBOR_DAMAGE = 0.25;
const PLAGUE_RADIUS = 3;
const PLAGUE_TECH_DAMAGE = 20;

// Toleranz fuer die automatischen Konsistenzpruefungen (siehe js/debug.js) — rein
// fuer Entwicklungs-/Pruefzwecke, kein Gameplay-Wert. Groesser als reine
// Fliesskomma-Rundungsfehler, aber klein genug, um echte Abweichungen zu erkennen.
const DEBUG_EPSILON = 0.05;

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function getGas(gasId) {
  return GASES.find((g) => g.id === gasId);
}
