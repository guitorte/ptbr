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
├── exp/index.html              # Full application (JS + HTML + CSS, ~3100 lines, self-contained)
├── phonetic-engine.js          # IPA consonant distance engine (Chomsky & Halle features)
├── build-corpus.js             # CLI: processes letras_final.json → dic/corpus-schemes.json
├── rhyme-extract.js            # CLI: extracts rhyme schemes from individual songs
├── dic/
│   ├── palavras.txt            # ~320k Portuguese words, one per line
│   └── corpus-schemes.json     # 474 songs × stanzas, compact {a,t,g,s[]} format (139 KB)
├── upload/
│   └── letras_final.json       # 478 song lyrics with full text (MPB, Pagode, Sertanejo)
├── README.md                   # This file
├── CLAUDE.md                   # Internal development documentation
└── start.bat                   # Windows launcher (python -m http.server 8000)
```

All application logic runs client-side. The dictionary and corpus index are fetched via HTTP and processed in-memory on first load. Full lyrics are lazy-loaded only when a corpus card is opened.

---

## File Reference

| File | Purpose | Details |
|------|---------|---------|
| **exp/index.html** | Complete web application | Phonetic engine, scoring algorithm, UI, corpus search, lyrics panel. Self-contained—no external dependencies. |
| **phonetic-engine.js** | Phonetic distance library | IPA consonant feature table (Chomsky & Halle 1968). Imported by Node CLIs; not used in browser. |
| **build-corpus.js** | Corpus builder CLI | Reads `upload/letras_final.json`, extracts rhyme schemes, deduplicates stanzas, outputs compact index to `dic/corpus-schemes.json` |
| **rhyme-extract.js** | Song analyzer CLI | Extracts rhyme schemes from individual songs. Flags: `--genre`, `--artist`, `--song`, `--index`, `--output` |
| **dic/palavras.txt** | Dictionary | ~320k Portuguese words, one per line. Loaded once on app startup. |
| **dic/corpus-schemes.json** | Corpus index | Deduplicated stanzas from 474 songs in compact format: `{a: artist, t: title, g: genre, s: [{scheme, lyrics}]}` |
| **upload/letras_final.json** | Song lyrics database | 478 songs with full text. Lazy-loaded in-browser on first card click. |
| **CLAUDE.md** | Dev documentation | Codebase map, key functions, state variables, active branch info. |

---

## Key Functions (exp/index.html)

| Function | Input | Output | Purpose |
|----------|-------|--------|---------|
| `silabificar(word)` | Portuguese word | `[sílaba, ...]` | Splits word into syllables using Portuguese syllabification rules |
| `identificarTonica(silabasList)` | Syllable array | Integer index | Finds which syllable carries primary stress |
| `extrairRima(word)` | Portuguese word | String | Returns phonetic material from tonic vowel to end (e.g., `pastel` → `el`) |
| `perfilFonetico(word)` | Portuguese word | Phonetic profile object | Analyzes word completely: syllables, stress, vowels, consonants, rhyme, onset, features |
| `calcScore(profileA, profileB)` | Two profile objects | Number (0–300+) | Compares two phonetic profiles, returns multi-criteria score |
| `processarBusca()` | (from UI state) | `void` (updates DOM) | Main search: scores all dictionary words against `alvoAtual`, applies filters, renders results |
| `renderCorpus(results)` | Array of stanzas | `void` | Renders ESQ mode corpus cards with rhyme schemes, titles, artists |
| `buscarCorpus(perfil)` | Phonetic profile | Array of stanzas | Searches corpus index for stanzas matching the rhyme profile |
| `abrirLetra(r)` | Stanza record | `void` | Lazy-loads full lyrics from `letras_final.json`, highlights matching stanza, opens lyrics panel |
| `fecharLetra()` | (none) | `void` | Closes lyrics panel, restores scroll position in corpus viewport |
| `toggleCorpusMode()` | (none) | `void` | Switches between rhyme-finder and ESQ corpus modes |

---

## State Variables (exp/index.html)

| Variable | Type | Description |
|----------|------|-------------|
| `alvoAtual` | Object or `null` | Phonetic profile of the currently searched word; `null` in filter-only mode |
| `alvoB` | Object or `null` | Second word profile for intersection searches |
| `dicionario` | Array | All phonetic profiles, loaded once at startup from `dic/palavras.txt` |
| `resultadosFiltrados` | Array | Current filtered/scored result set |
| `FILTROS` | Object | Locked filter values (exact match mode)—keys: `syllables`, `tonica`, `rhyme`, etc. |
| `FILTROS_NEG` | Object | Negated filter flags—e.g., `exclude_oxítona: true` |
| `FILTROS_CONTEM` | Object | Free-text filter values—e.g., `vogais: "aei"`, `onset: "pl"` |
| `modoCorpus` | Boolean | `true` if ESQ corpus mode active; `false` for rhyme-finder |
| `corpusEsquemas` | Array or `null` | Loaded corpus index; `null` until first ESQ search |
| `letrasDict` | Map | Lazily-built map of `"artista§titulo"` → full song object |
| `corpusScrollY` | Number | Saved scroll position in `#corpus-viewport` for back-navigation |

---

## Features

### Rhyme Finder
Type a word → ranked list of rhymes, near-rhymes, assonances, and rhythmic matches from the ~320k word dictionary.

### Filters (filter-only mode)
Search the dictionary without an anchor word using any combination of:
- Syllable count (equal / less / greater)
- Accentuation class (oxítona / paroxítona / proparoxítona)
- Tonic vowel
- Rhyme ending (rimaPerfeita) — type directly, e.g. `el`, `ão`, `or`
- Onset of tonic syllable (with fuzzy phonetic tolerance)
- Vowel pattern, vowel spine, coda consonants
- Word class (noun, adjective, verb, adverb — via suffix heuristics)
- Frequency tier (comum / média / rara)

### ESQ Mode — Corpus Catalog
Click **ESQ** to search the corpus of 474 real song lyrics for stanzas that match the rhyme profile of the typed word. Results show the rhyme scheme of each matching stanza alongside song metadata (title, artist, genre).

### Lyrics Detail View
Click any ESQ result card to open the full song lyrics. The matching stanza is highlighted in green and scrolled into view. Press **← Voltar** to return to the exact corpus scroll position.

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

## CLI Tools

### Rebuild the corpus index

```bash
node build-corpus.js
# Reads upload/letras_final.json → writes dic/corpus-schemes.json
# Run this after modifying lyrics, adding songs, or changing the phonetic engine
```

### Extract rhyme schemes from individual songs

```bash
node rhyme-extract.js --genre MPB
node rhyme-extract.js --artist "Chico Buarque"
node rhyme-extract.js --song "Construção" --output full
node rhyme-extract.js --index 42
# Options: --genre, --artist, --song, --index, --output
```

---

## Development

### Active Development Branch

All development happens on branch `claude/repo-overview-ZsAGc`. Always commit and push to this branch—never push to `main` without explicit instruction.

### Workflow

1. **Clone and run locally:**
   ```bash
   git clone https://github.com/guitorte/ptbr.git
   cd ptbr
   python -m http.server 8000
   # open http://localhost:8000/exp/index.html
   ```

2. **Make changes** in `exp/index.html` (the main app) or supporting files

3. **Rebuild corpus** if you change the phonetic engine or lyrics:
   ```bash
   node build-corpus.js
   ```

4. **Test** by interacting with the app in your browser:
   - Type words to test rhyme finding
   - Use filters to verify scoring logic
   - Click **ESQ** to test corpus search
   - Click corpus cards to verify lyrics loading

5. **Commit and push** to the development branch:
   ```bash
   git add .
   git commit -m "Brief, descriptive message"
   git push -u origin claude/repo-overview-ZsAGc
   ```

### Testing the Scoring System

To verify scoring changes, look at high-scoring results in a particular score band. The `calcScore()` function is the single point of truth—all results are ranked by its output.

Example: if you change `rimaPerfeita` weights, run a search for a common word and observe where results fall in the band table (Rima, Quase-rima, Eco forte, etc.).

---

## Known Limitations

- Syllabification is rule-based and may fail on loanwords, proper nouns, or unusual clusters.
- Word class detection uses suffix heuristics — not morphological analysis.
- The dictionary (`palavras.txt`) has no frequency data; frequency tiers are estimated from word length and suffix patterns.
- Corpus stanza matching uses rimaPerfeita string equality — stanzas with identical rhyme arrays are deduplicated per song.
- No support for European Portuguese phonology.

---

## Performance Notes

- **Dictionary load:** ~320k words × full phonetic analysis = ~2–3 seconds on first load. Cached in browser after.
- **Corpus index:** 474 songs, deduplicated stanzas = 139 KB. Loaded on first ESQ search.
- **Lyrics lazy-loading:** Full song text only fetched when a corpus card is clicked. Reduces initial payload.
- **Scoring:** All dictionary words scored in-memory per search. Multi-threaded in future versions.

---

## Backup & Snapshots

- Backup snapshot: `backup/corpus-v1` — earlier corpus state if needed for rollback.
- Always tag releases or stable points before major refactors.

---

## Related Resources

- **IPA Feature Geometry:** Chomsky & Halle (1968), *The Sound Pattern of English*
- **Portuguese Phonology:** Câmara Jr. (1970), *The Portuguese Language*
- **Syllabification Rules:** Crawley et al. (2002) on Romance language phonotactics
