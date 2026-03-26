/**
 * PHONETIC DISTANCE ENGINE
 * ========================
 * Computes substitution costs between IPA consonants based on
 * articulatory feature vectors + hierarchical geometry weighting.
 *
 * Theoretical basis:
 * - Chomsky & Halle (1968) distinctive features
 * - Clements (1985) feature geometry (hierarchical node weighting)
 * - Empirical adjustments from cross-linguistic typology
 */

// ─────────────────────────────────────────────────────────────
// 1. FEATURE DEFINITIONS
// ─────────────────────────────────────────────────────────────

/**
 * Feature geometry: each feature belongs to a node.
 * Weights reflect how "structurally costly" it is to change
 * that node in cross-linguistic substitution patterns.
 *
 * Node weights (empirically motivated):
 *   LARYNGEAL  — voicing changes are cheap (0.15)
 *   PLACE      — place changes are moderate (0.30)
 *   MANNER     — manner changes are expensive (0.40)
 *   NASAL      — nasality toggle is moderate (0.25)
 *   LATERAL    — lateral toggle is moderate (0.25)
 *   CONTINUANT — continuancy is core to manner (0.35)
 *
 * Features per node:
 *   LARYNGEAL:  voiced
 *   PLACE:      labial, coronal, dorsal, glottal
 *               (coronal subfeatures: anterior, distributed)
 *   MANNER:     sonorant, continuant, nasal, lateral, trill, tap
 *               approximant, affricate
 */

const FEATURE_WEIGHTS = {
  // Laryngeal node — cheapest to change
  voiced:      0.15,

  // Place node — medium cost
  labial:      0.30,
  coronal:     0.20, // coronal is "default" in many langs, slightly cheaper
  dorsal:      0.30,
  glottal:     0.30,
  anterior:    0.15, // sub-feature of coronal (alv vs. palato-alv)
  distributed: 0.15, // sub-feature of coronal

  // Manner features — more expensive
  sonorant:    0.40,
  continuant:  0.35,
  nasal:       0.25,
  lateral:     0.25,
  trill:       0.30,
  tap:         0.25,
  approximant: 0.35,
  affricate:   0.30,
};

// ─────────────────────────────────────────────────────────────
// 2. CONSONANT FEATURE VECTORS
// ─────────────────────────────────────────────────────────────
// Each consonant = { feature: true/false }
// Missing features are treated as false (unmarked).

const CONSONANTS = {
  // ── BILABIALS ──────────────────────────────────────────────
  'p': {
    voiced: false, labial: true, coronal: false, dorsal: false, glottal: false,
    sonorant: false, continuant: false, nasal: false, lateral: false,
    trill: false, tap: false, approximant: false, affricate: false,
    anterior: false, distributed: false,
  },
  'b': {
    voiced: true, labial: true, coronal: false, dorsal: false, glottal: false,
    sonorant: false, continuant: false, nasal: false, lateral: false,
    trill: false, tap: false, approximant: false, affricate: false,
    anterior: false, distributed: false,
  },
  'm': {
    voiced: true, labial: true, coronal: false, dorsal: false, glottal: false,
    sonorant: true, continuant: false, nasal: true, lateral: false,
    trill: false, tap: false, approximant: false, affricate: false,
    anterior: false, distributed: false,
  },
  'ɸ': { // bilabial fricative
    voiced: false, labial: true, coronal: false, dorsal: false, glottal: false,
    sonorant: false, continuant: true, nasal: false, lateral: false,
    trill: false, tap: false, approximant: false, affricate: false,
    anterior: false, distributed: false,
  },
  'β': { // voiced bilabial fricative
    voiced: true, labial: true, coronal: false, dorsal: false, glottal: false,
    sonorant: false, continuant: true, nasal: false, lateral: false,
    trill: false, tap: false, approximant: false, affricate: false,
    anterior: false, distributed: false,
  },

  // ── LABIODENTALS ───────────────────────────────────────────
  'f': {
    voiced: false, labial: true, coronal: false, dorsal: false, glottal: false,
    sonorant: false, continuant: true, nasal: false, lateral: false,
    trill: false, tap: false, approximant: false, affricate: false,
    anterior: false, distributed: true,
  },
  'v': {
    voiced: true, labial: true, coronal: false, dorsal: false, glottal: false,
    sonorant: false, continuant: true, nasal: false, lateral: false,
    trill: false, tap: false, approximant: false, affricate: false,
    anterior: false, distributed: true,
  },

  // ── DENTALS / ALVEOLARS ────────────────────────────────────
  't': {
    voiced: false, labial: false, coronal: true, dorsal: false, glottal: false,
    sonorant: false, continuant: false, nasal: false, lateral: false,
    trill: false, tap: false, approximant: false, affricate: false,
    anterior: true, distributed: false,
  },
  'd': {
    voiced: true, labial: false, coronal: true, dorsal: false, glottal: false,
    sonorant: false, continuant: false, nasal: false, lateral: false,
    trill: false, tap: false, approximant: false, affricate: false,
    anterior: true, distributed: false,
  },
  'n': {
    voiced: true, labial: false, coronal: true, dorsal: false, glottal: false,
    sonorant: true, continuant: false, nasal: true, lateral: false,
    trill: false, tap: false, approximant: false, affricate: false,
    anterior: true, distributed: false,
  },
  's': {
    voiced: false, labial: false, coronal: true, dorsal: false, glottal: false,
    sonorant: false, continuant: true, nasal: false, lateral: false,
    trill: false, tap: false, approximant: false, affricate: false,
    anterior: true, distributed: false,
  },
  'z': {
    voiced: true, labial: false, coronal: true, dorsal: false, glottal: false,
    sonorant: false, continuant: true, nasal: false, lateral: false,
    trill: false, tap: false, approximant: false, affricate: false,
    anterior: true, distributed: false,
  },
  'l': {
    voiced: true, labial: false, coronal: true, dorsal: false, glottal: false,
    sonorant: true, continuant: true, nasal: false, lateral: true,
    trill: false, tap: false, approximant: true, affricate: false,
    anterior: true, distributed: false,
  },
  'ɾ': { // tap (flap) — "r" intervocálico português
    voiced: true, labial: false, coronal: true, dorsal: false, glottal: false,
    sonorant: true, continuant: false, nasal: false, lateral: false,
    trill: false, tap: true, approximant: false, affricate: false,
    anterior: true, distributed: false,
  },
  'r': { // trill — "rr" português
    voiced: true, labial: false, coronal: true, dorsal: false, glottal: false,
    sonorant: true, continuant: false, nasal: false, lateral: false,
    trill: true, tap: false, approximant: false, affricate: false,
    anterior: true, distributed: false,
  },

  // ── POSTALVEOLARS / PALATALS ───────────────────────────────
  'ʃ': { // sh
    voiced: false, labial: false, coronal: true, dorsal: false, glottal: false,
    sonorant: false, continuant: true, nasal: false, lateral: false,
    trill: false, tap: false, approximant: false, affricate: false,
    anterior: false, distributed: true,
  },
  'ʒ': { // zh
    voiced: true, labial: false, coronal: true, dorsal: false, glottal: false,
    sonorant: false, continuant: true, nasal: false, lateral: false,
    trill: false, tap: false, approximant: false, affricate: false,
    anterior: false, distributed: true,
  },
  'tʃ': { // ch
    voiced: false, labial: false, coronal: true, dorsal: false, glottal: false,
    sonorant: false, continuant: false, nasal: false, lateral: false,
    trill: false, tap: false, approximant: false, affricate: true,
    anterior: false, distributed: true,
  },
  'dʒ': { // j
    voiced: true, labial: false, coronal: true, dorsal: false, glottal: false,
    sonorant: false, continuant: false, nasal: false, lateral: false,
    trill: false, tap: false, approximant: false, affricate: true,
    anterior: false, distributed: true,
  },
  'ɲ': { // nh
    voiced: true, labial: false, coronal: true, dorsal: true, glottal: false,
    sonorant: true, continuant: false, nasal: true, lateral: false,
    trill: false, tap: false, approximant: false, affricate: false,
    anterior: false, distributed: true,
  },
  'ʎ': { // lh
    voiced: true, labial: false, coronal: true, dorsal: false, glottal: false,
    sonorant: true, continuant: true, nasal: false, lateral: true,
    trill: false, tap: false, approximant: true, affricate: false,
    anterior: false, distributed: true,
  },
  'j': { // semivowel y
    voiced: true, labial: false, coronal: false, dorsal: true, glottal: false,
    sonorant: true, continuant: true, nasal: false, lateral: false,
    trill: false, tap: false, approximant: true, affricate: false,
    anterior: false, distributed: false,
  },

  // ── VELARS ─────────────────────────────────────────────────
  'k': {
    voiced: false, labial: false, coronal: false, dorsal: true, glottal: false,
    sonorant: false, continuant: false, nasal: false, lateral: false,
    trill: false, tap: false, approximant: false, affricate: false,
    anterior: false, distributed: false,
  },
  'g': {
    voiced: true, labial: false, coronal: false, dorsal: true, glottal: false,
    sonorant: false, continuant: false, nasal: false, lateral: false,
    trill: false, tap: false, approximant: false, affricate: false,
    anterior: false, distributed: false,
  },
  'ŋ': { // ng nasal velar
    voiced: true, labial: false, coronal: false, dorsal: true, glottal: false,
    sonorant: true, continuant: false, nasal: true, lateral: false,
    trill: false, tap: false, approximant: false, affricate: false,
    anterior: false, distributed: false,
  },
  'x': { // velar fricative (rr in some dialects)
    voiced: false, labial: false, coronal: false, dorsal: true, glottal: false,
    sonorant: false, continuant: true, nasal: false, lateral: false,
    trill: false, tap: false, approximant: false, affricate: false,
    anterior: false, distributed: false,
  },
  'w': { // semivowel w
    voiced: true, labial: true, coronal: false, dorsal: true, glottal: false,
    sonorant: true, continuant: true, nasal: false, lateral: false,
    trill: false, tap: false, approximant: true, affricate: false,
    anterior: false, distributed: false,
  },

  // ── UVULARS ────────────────────────────────────────────────
  'ʁ': { // R carioca / uvular fricative
    voiced: true, labial: false, coronal: false, dorsal: true, glottal: false,
    sonorant: false, continuant: true, nasal: false, lateral: false,
    trill: false, tap: false, approximant: false, affricate: false,
    anterior: false, distributed: false,
  },

  // ── GLOTTALS ───────────────────────────────────────────────
  'h': {
    voiced: false, labial: false, coronal: false, dorsal: false, glottal: true,
    sonorant: false, continuant: true, nasal: false, lateral: false,
    trill: false, tap: false, approximant: false, affricate: false,
    anterior: false, distributed: false,
  },
  'ɦ': { // voiced h
    voiced: true, labial: false, coronal: false, dorsal: false, glottal: true,
    sonorant: false, continuant: true, nasal: false, lateral: false,
    trill: false, tap: false, approximant: false, affricate: false,
    anterior: false, distributed: false,
  },

  // ── ENGLISH-SPECIFIC ───────────────────────────────────────
  'θ': { // th voiceless (think)
    voiced: false, labial: false, coronal: true, dorsal: false, glottal: false,
    sonorant: false, continuant: true, nasal: false, lateral: false,
    trill: false, tap: false, approximant: false, affricate: false,
    anterior: true, distributed: true,
  },
  'ð': { // th voiced (the)
    voiced: true, labial: false, coronal: true, dorsal: false, glottal: false,
    sonorant: false, continuant: true, nasal: false, lateral: false,
    trill: false, tap: false, approximant: false, affricate: false,
    anterior: true, distributed: true,
  },
  'ɹ': { // English r
    voiced: true, labial: false, coronal: true, dorsal: false, glottal: false,
    sonorant: true, continuant: true, nasal: false, lateral: false,
    trill: false, tap: false, approximant: true, affricate: false,
    anterior: false, distributed: false,
  },
};

// ─────────────────────────────────────────────────────────────
// 3. DISTANCE COMPUTATION
// ─────────────────────────────────────────────────────────────

/**
 * Compute the phonetic substitution cost between two consonants.
 *
 * Algorithm:
 * 1. For each feature, check if the two consonants differ.
 * 2. If they differ, add FEATURE_WEIGHTS[feature] to total cost.
 * 3. Normalize to [0, 1] by dividing by theoretical maximum cost.
 *
 * The theoretical max is the sum of ALL feature weights —
 * i.e., two sounds that differ on every single feature.
 *
 * @param {string} sym1 - IPA symbol
 * @param {string} sym2 - IPA symbol
 * @returns {{ cost: number, diffFeatures: string[], sharedFeatures: string[] }}
 */
function phoneticDistance(sym1, sym2) {
  const c1 = CONSONANTS[sym1];
  const c2 = CONSONANTS[sym2];

  if (!c1 || !c2) {
    return { cost: null, diffFeatures: [], sharedFeatures: [], error: `Unknown symbol: ${!c1 ? sym1 : sym2}` };
  }

  if (sym1 === sym2) {
    return { cost: 0, diffFeatures: [], sharedFeatures: Object.keys(FEATURE_WEIGHTS), identical: true };
  }

  const features = Object.keys(FEATURE_WEIGHTS);
  const totalMaxCost = features.reduce((sum, f) => sum + FEATURE_WEIGHTS[f], 0);

  let rawCost = 0;
  const diffFeatures = [];
  const sharedFeatures = [];

  for (const feature of features) {
    const val1 = c1[feature] ?? false;
    const val2 = c2[feature] ?? false;

    if (val1 !== val2) {
      rawCost += FEATURE_WEIGHTS[feature];
      diffFeatures.push(feature);
    } else {
      sharedFeatures.push(feature);
    }
  }

  const normalizedCost = parseFloat((rawCost / totalMaxCost).toFixed(3));

  return {
    cost: normalizedCost,
    rawCost: parseFloat(rawCost.toFixed(3)),
    maxPossible: parseFloat(totalMaxCost.toFixed(3)),
    diffFeatures,
    sharedFeatures,
    c1features: c1,
    c2features: c2,
  };
}

// ─────────────────────────────────────────────────────────────
// 4. COST LABEL
// ─────────────────────────────────────────────────────────────

/**
 * Returns a qualitative label for a normalized cost.
 */
function costLabel(cost) {
  if (cost === 0)   return { label: 'idêntico',        tier: 0 };
  if (cost < 0.10)  return { label: 'mínimo',          tier: 1 };
  if (cost < 0.20)  return { label: 'muito baixo',     tier: 2 };
  if (cost < 0.35)  return { label: 'baixo',           tier: 3 };
  if (cost < 0.50)  return { label: 'médio',           tier: 4 };
  if (cost < 0.65)  return { label: 'alto',            tier: 5 };
  if (cost < 0.80)  return { label: 'muito alto',      tier: 6 };
  return                   { label: 'máximo',          tier: 7 };
}

// ─────────────────────────────────────────────────────────────
// 5. FULL MATRIX GENERATOR
// ─────────────────────────────────────────────────────────────

/**
 * Returns the full NxN distance matrix for all consonants.
 * Matrix[i][j] = { cost, diffFeatures, sharedFeatures }
 */
function buildFullMatrix() {
  const symbols = Object.keys(CONSONANTS);
  const matrix = {};

  for (const s1 of symbols) {
    matrix[s1] = {};
    for (const s2 of symbols) {
      matrix[s1][s2] = phoneticDistance(s1, s2);
    }
  }

  return { matrix, symbols };
}

// ─────────────────────────────────────────────────────────────
// 6. NEAREST NEIGHBORS
// ─────────────────────────────────────────────────────────────

/**
 * Given a consonant, returns all others sorted by cost ascending.
 * @param {string} sym - IPA symbol
 * @returns {Array<{ symbol, cost, label, diffFeatures }>}
 */
function nearestNeighbors(sym) {
  const symbols = Object.keys(CONSONANTS).filter(s => s !== sym);
  const results = symbols.map(s => {
    const d = phoneticDistance(sym, s);
    return {
      symbol: s,
      cost: d.cost,
      ...costLabel(d.cost),
      diffFeatures: d.diffFeatures,
      sharedFeatures: d.sharedFeatures,
    };
  });

  results.sort((a, b) => a.cost - b.cost);
  return results;
}

// ─────────────────────────────────────────────────────────────
// 7. FEATURE PROFILE
// ─────────────────────────────────────────────────────────────

/**
 * Returns the feature profile of a consonant in human-readable form.
 */
function featureProfile(sym) {
  const c = CONSONANTS[sym];
  if (!c) return null;

  const active = Object.entries(c)
    .filter(([, v]) => v === true)
    .map(([k]) => k);

  const inactive = Object.entries(c)
    .filter(([, v]) => v === false)
    .map(([k]) => k);

  return { symbol: sym, active, inactive, vector: c };
}

// ─────────────────────────────────────────────────────────────
// 8. GROUP BY COST TIER (for a given source consonant)
// ─────────────────────────────────────────────────────────────

/**
 * Groups all neighbors of a consonant by cost tier.
 */
function groupByTier(sym) {
  const neighbors = nearestNeighbors(sym);
  const groups = {};

  for (const n of neighbors) {
    if (!groups[n.tier]) groups[n.tier] = { label: n.label, tier: n.tier, items: [] };
    groups[n.tier].items.push(n);
  }

  return Object.values(groups).sort((a, b) => a.tier - b.tier);
}

// ─────────────────────────────────────────────────────────────
// 9. EXPORTS (for use in HTML via <script> or module)
// ─────────────────────────────────────────────────────────────

const PhoneticEngine = {
  CONSONANTS,
  FEATURE_WEIGHTS,
  phoneticDistance,
  costLabel,
  buildFullMatrix,
  nearestNeighbors,
  featureProfile,
  groupByTier,
  symbols: Object.keys(CONSONANTS),
};

// Node.js / CommonJS
if (typeof module !== 'undefined' && module.exports) {
  module.exports = PhoneticEngine;
}

// Browser global
if (typeof window !== 'undefined') {
  window.PhoneticEngine = PhoneticEngine;
}
