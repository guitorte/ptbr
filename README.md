# ptbr — Portuguese Rhyme & Lyric Finder

A browser-based tool for finding rhymes, near-rhymes, assonances, and rhythmic matches in Brazilian Portuguese. It combines formal phonetics (IPA feature geometry), Portuguese-specific syllabification rules, and a multi-criteria scoring system to rank candidate words.

---

## How to Run

```bash
python -m http.server 8000
# then open http://localhost:8000/exp/index.html
```

On Windows, double-click `start.bat`.

---

## Architecture

```
ptbr/
├── exp/index.html        # Full application (JS + HTML + CSS, self-contained)
├── phonetic-engine.js    # IPA consonant distance engine (Chomsky & Halle features)
└── dic/palavras.txt      # ~320k Portuguese words, one per line
```

All logic runs client-side. The dictionary is fetched via HTTP and processed in-memory on first load.

---

## Scoring System

Each candidate word receives a numeric score against the input word. The score is the sum of independent criteria:

| Criterion | Points | Description |
|-----------|--------|-------------|
| `rimaPerfeita` exact | +125 | Identical string from tonic vowel to end of word |
| `rimaPerfeita` near (voicing pair) | +88 | Single difference, cost < 0.10 (p/b, t/d…) |
| `rimaPerfeita` near (liquid/nasal) | +74 | Single difference, cost < 0.20 (r/l, m/n) |
| `rimaPerfeita` near (similar) | +58 | Single difference, cost < 0.35 |
| `rimaPerfeita` near (distant) | +40 | Single difference, cost ≥ 0.35 |
| `vogaisRima` match | +60 | Same vowels in rhyming portion (normalized) |
| `onsetTonico` full match | +20 | Identical onset of tonic syllable |
| `onsetTonico` partial match | +10 | At least one shared consonant in onset |
| `familiaCluster` match | +20 | Same cluster family (pl, fl, af…) — complex onsets only |
| `assConsonantal` match | +30 | Jaccard ≥ 0.5 on post-tonic consonants |
| `espinhaVocal` match | +20 | Full vowel sequence of the word matches |
| `vogalTonica` match | +15 | Same tonic vowel |
| syllable count + stress | +10 | Same number of syllables and accentuation class |

### Score Bands

| Band | Threshold | Label |
|------|-----------|-------|
| Rima | ≥ 160 | Perfect rhyme |
| Quase-rima | ≥ 130 | Near-rhyme |
| Eco forte | ≥ 100 | Strong echo |
| Assonância | ≥ 60 | Assonance |
| Proximidade | ≥ 25 | Proximity |
| Ritmo | ≥ 10 | Rhythmic match |

### Scoring Philosophy

Rhyme quality (the tonic vowel + everything after it) is the primary criterion. Structural similarity features — onset of the tonic syllable, vowel spine — are secondary bonuses that refine rankings within the same rhyme class, not criteria that should override rhyme quality. A perfect rhyme always outranks a near-rhyme, regardless of structural coincidences.

---

## Linguistic Concepts

### Tonic Syllable

The syllable carrying primary stress. Identified by:
1. Explicit accent marks (á, é, í, ó, ú, ã, õ)
2. Stress rules for unaccented words:
   - Final stress (oxítona) if word ends in r, l, z, x, i(s), u(s), im, ins, um, uns
   - Penultimate stress (paroxítona) otherwise (most common in Portuguese)
   - Explicit accent required for antepenultimate (proparoxítona)

### Accentuation Classes

| Class | Description | Example |
|-------|-------------|---------|
| oxítona | Stress on final syllable | café, pastel, amor |
| paroxítona | Stress on penultimate syllable | casa, flores, fácil |
| proparoxítona | Stress on antepenultimate | música, árvore |

### Rhyme (rimaPerfeita)

The string from the tonic vowel to the end of the word. For `pastel`: `el`. For `amor`: `or`. Words sharing this string are perfect rhymes.

### Phonetic Distance

Consonant similarity uses IPA distinctive features (Chomsky & Halle 1968, Clements feature geometry). Distance is computed over: LARYNGEAL (voicing), PLACE (labial/coronal/dorsal), MANNER (sonorant/continuant/nasal/lateral). Lower cost = more similar sounds.

---

## Filters

The interface exposes filters for:
- Syllable count (with range modes: equal / less / greater)
- Accentuation class
- Tonic vowel
- Onset of tonic syllable (with fuzzy phonetic tolerance)
- Rhyme, vowel pattern, vowel spine
- Coda consonants (with phonetic feature filters)
- Word class (noun, adjective, verb, adverb — detected via suffix heuristics)
- Frequency tier (comum / media / rara)

---

## Known Limitations

- Syllabification is rule-based and may fail on loanwords, proper nouns, or unusual clusters.
- Word class detection uses suffix heuristics — not morphological analysis.
- The dictionary (`palavras.txt`) is a raw word list with no frequency data; frequency tiers are estimated by word length and suffix patterns.
- No support for European Portuguese phonology differences.
