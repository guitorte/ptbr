# ptbr — Portuguese Rhyme & Lyric Finder

A browser-based tool for finding rhymes, near-rhymes, assonances, and rhythmic matches in Brazilian Portuguese. It combines formal phonetics (IPA feature geometry), Portuguese-specific syllabification rules, and a multi-criteria scoring system to rank candidate words.

Besides rhymes, it can search by **consonant skeleton** or by **vowel sequence** while ignoring stress altogether — `metade` → `método` (same consonants) or `debate` (same vowels).

---

## How to Run

```bash
python -m http.server 8000
# then open http://localhost:8000/exp/index.html
# or the mobile similarity navigator: http://localhost:8000/som/
```

On Windows, double-click `start.bat`.

---

## Architecture

```
ptbr/
├── exp/index.html              # Main application (JS + HTML + CSS, ~3700 lines, self-contained)
├── som/                        # "Som": mobile similarity navigator (engine.js, worker.js, index.html)
├── song-analysis.html          # "Eco Sonoro": phonetic analysis of a full lyric
├── phonetic-engine.js          # IPA consonant distance engine (Chomsky & Halle features)
├── build-corpus.js             # CLI: processes letras_final.json → dic/corpus-schemes.json
├── rhyme-extract.js            # CLI: extracts rhyme schemes from individual songs
├── dic/
│   ├── palavras.txt            # 145,744 Portuguese words, one per line (1.5 MB)
│   └── corpus-schemes.json     # 474 songs, 3,254 deduplicated stanzas, compact {a,t,g,s[]} (139 KB)
├── upload/
│   └── letras_final.json       # 478 song lyrics with full text (MPB, Pagode, Sertanejo, Pop/Rock, Rap…)
├── backup/                     # Timestamped snapshots of exp/ taken before engine changes
├── README.md                   # This file
├── CLAUDE.md                   # Internal development documentation
└── start.bat                   # Windows launcher (python -m http.server 8000)
```

All application logic runs client-side. The dictionary is fetched over HTTP and analysed in memory on every page load. The corpus index is loaded on first use of corpus mode, and full lyrics only when a corpus card is opened. Saved words (★) and words you add (+) are kept in the browser's `localStorage`.

---

## File Reference

| File | Purpose | Details |
|------|---------|---------|
| **exp/index.html** | Main web application | Phonetic engine, scoring, the three search modes, filters, corpus search, lyrics panel. Its only dependency is `../phonetic-engine.js`. |
| **som/** | Similarity navigator | Mobile-first page with four zoom levels (word, ending/beginning, syllable, sound). Indexes the dictionary in a Web Worker. |
| **song-analysis.html** | Eco Sonoro | Paste a lyric and get its phonetic analysis (rhymes, alliteration). Carries its own copy of the phonetic engine. |
| **phonetic-engine.js** | Phonetic distance library | IPA consonant feature table (Chomsky & Halle 1968). Loaded in the browser by `exp/` and `som/`; the Node CLIs do **not** use it. |
| **build-corpus.js** | Corpus builder CLI | Reads `upload/letras_final.json`, extracts rhyme schemes, deduplicates stanzas, outputs compact index to `dic/corpus-schemes.json` |
| **rhyme-extract.js** | Song analyzer CLI | Extracts rhyme schemes from individual songs. Flags: `--genre`, `--artist`, `--song`, `--index`, `--output` |
| **dic/palavras.txt** | Dictionary | 145,744 Portuguese words, one per line. Loaded once on app startup. |
| **dic/corpus-schemes.json** | Corpus index | 3,254 deduplicated stanzas from 474 songs in compact format: `{a: artist, t: title, g: genre, s: [...]}` |
| **upload/letras_final.json** | Song lyrics database | 478 songs with full text. Lazy-loaded in-browser on first card click. |
| **CLAUDE.md** | Dev documentation | Codebase map, key functions, state variables, active branch info. |

---

## Key Functions (exp/index.html)

| Function | Input | Output | Purpose |
|----------|-------|--------|---------|
| `silabificar(word)` | Portuguese word | `[sílaba, ...]` | Splits word into syllables using Portuguese syllabification rules |
| `identificarTonica(silabas, palavra)` | Syllable array + word | Integer index | Finds which syllable carries primary stress |
| `extrairRima(silabas, tonicaIndex)` | Syllable array + stress index | String | Returns material from the tonic vowel to the end (`pastel` → `el`); the `u` of `qu`/`gu` is skipped (`quero` → `ero`) |
| `perfilFonetico(word)` | Portuguese word | Phonetic profile object | Analyzes word completely: syllables, stress, vowels, consonants, rhyme, onset, features |
| `calcScore(profileA, profileB)` | Two profile objects | Number (0–300+) | Rhyme mode: compares two phonetic profiles, returns multi-criteria score |
| `calcScoreCons(profileA, profileB)` | Two profile objects | Number | Consonant mode: similarity of consonant skeletons, same bands |
| `calcScoreVog(profileA, profileB)` | Two profile objects | Number | Vowel mode: similarity of vowel sequences, same bands |
| `setModo(modo)` | `'rima'` / `'cons'` / `'vog'` | `void` | Switches the search mode (Rima · Consoantes · Vogais selector) |
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
| `FILTROS` | Object | Locked filter values (exact match)—keys `numSilabas`, `acentuacao`, `vogalTonica`, `onsetTonico`, `familiaCluster`, `rimaPerfeita`, `vogaisRima`, `espinhaVocal`, `coda`, `classe`, `freq` |
| `FILTROS_NEG` | Object | Same keys as `FILTROS`; `true` negates that filter |
| `FILTROS_CONTEM` | Object | Free-text filter values—vowels, consonant sequence, consonants in any order (`consLivre`), onset, endings, beginnings… |
| `modoBusca` | String | `'rima'`, `'cons'` or `'vog'`: which engine ranks the results |
| `modoCorpus` | Boolean | `true` if ESQ corpus mode is active |
| `corpusEsquemas` | Array or `null` | Loaded corpus index; `null` until first ESQ search |
| `letrasDict` | Map | Lazily-built map of `"artista§titulo"` → lyric text |
| `corpusScrollY` | Number | Saved scroll position in `#corpus-viewport` for back-navigation |

---

## Features

The selector under the search box switches between three ways of ranking the dictionary. All filters work in every mode.

### Rima (rhyme)
Type a word → ranked list of rhymes, near-rhymes, assonances, and rhythmic matches from the 145,744-word dictionary, all built around the stressed syllable.

### Consoantes (consonants, stress ignored)
Compares only the word's consonant sounds: `metade` (m·t·d) → `método`, `metido`, `medida`. Similar sounds count as close (t/d, p/b). Typing only consonants searches that skeleton directly: `dt` → `dote`, `dito`. A second row of chips groups words with **exactly the same consonants in any order** (`mesmas m·t·d`) or with **one of them missing** (`sem m` → `tudo`, `dote`).

### Vogais (vowels, stress ignored)
Compares only the vowel sounds: `metade` (e·a·e) → `debate`, `beldade`, then nasal variants (`embate`). Typing only vowels searches the pattern directly: `eae`, `oao`. Diphthongs and nasal vowels count (`peito` → eⁱ·o, `gente` → ẽ·e). Same chip row: `mesmas e·a·e`, `sem e`, `sem a`. Open and closed e/o (é/ê, ó/ô) are not told apart.

### Other tools
- **∩** — intersection: words that match two anchor words at once
- **⏱** — search history
- **SÍL** — show/hide syllable separation on the cards
- **+** — add a word missing from the dictionary (saved in the browser)
- **★** — saved words

### ESQ Mode — Corpus Catalog (currently hidden)
Searches the corpus of 474 real song lyrics for stanzas that match the rhyme profile of the typed word, showing each stanza's rhyme scheme with title, artist and genre. Clicking a card opens the full lyric with the matching stanza highlighted; **← Voltar** returns to the same scroll position.

The code is still in `exp/index.html`, but its top-bar button (`btn-corpus`) was removed in June 2026 to declutter the bar, so the mode currently has no entry point in the interface.

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
| `rimaPerfeita` two differences | +10 to +40 | Same length, two differences, rhyme of 3+ letters; less the more distant the sounds |
| `rimaPerfeita` different length | +65 / +40 | Edit distance 1 / 2 (the latter only for rhymes of 3+ letters) |
| `vogaisRima` match | +60 | Same vowels in rhyming portion (normalized) |
| `onsetTonico` full match | +20 | Identical onset of tonic syllable |
| `onsetTonico` partial match | +10 | At least one shared consonant in onset |
| `familiaCluster` match | +20 | Same cluster family (pl, fl, af…) — complex onsets only |
| `assConsonantal` match | +30 | Jaccard ≥ 0.5 on post-tonic consonants |
| `espinhaVocal` match | +20 | Full vowel sequence of the word matches (words with 2+ vowels) |
| `vogalTonica` match | +15 | Same tonic vowel |
| syllable count + stress | +10 | Same number of syllables and accentuation class |

These weights apply to Rima mode. Consoantes and Vogais use their own similarity scores (see `CLAUDE.md`) mapped onto the same bands, with relabelled chips: Iguais / Quase / Próximas / Parciais / Distantes / Vagas.

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

The syllable carrying primary stress. Identified by, in order:
1. An acute or circumflex accent (á, é, í, ó, ú, â, ê, ô)
2. A nasal tilde (ã, õ)
3. Final stress (oxítona) if the word ends in r, l, z, x, i(s), u(s), im, ins, om, ons, um, uns
4. Penultimate stress (paroxítona) otherwise — the most common case in Portuguese
5. Antepenultimate stress (proparoxítona) only ever comes from a written accent

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

Filters work on their own (no anchor word) or on top of any search mode:
- Syllable count (equal / less / greater)
- Accentuation class (oxítona / paroxítona / proparoxítona)
- Tonic vowel
- Rhyme ending (`rimaPerfeita`) — type it directly, e.g. `el`, `ão`, `or`
- Exact ending and exact beginning (spelling), and letters before/after the tonic vowel
- Onset of the tonic syllable (with phonetic tolerance)
- Vowel pattern, vowel spine
- Consonant sequence (in order) and **consonants in any order** (`td` → dote, tudo, data; with its own tolerance: exact / voicing / liquids & nasals)
- Coda consonants (with phonetic feature filters)
- Word class (noun, adjective, verb, adverb — suffix heuristics)
- Frequency tier (comum / média / rara — estimated from length and suffixes)

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

### Branches

Work happens on a short-lived branch per change, merged into `main` through a pull request. Never push to `main` directly without explicit instruction.

> ⚠️ The phonetic engine (`silabificar`, `identificarTonica`, `extrairRima`…) is **copy-pasted** into `exp/index.html`, `build-corpus.js`, `rhyme-extract.js`, `song-analysis.html` and `som/engine.js`. A fix to one is a fix to none — see `CLAUDE.md` before touching it.

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
   - Switch between Rima, Consoantes and Vogais
   - Use filters to verify scoring logic

5. **Commit and push** to a branch of your own, then open a pull request:
   ```bash
   git checkout -b my-change
   git add .
   git commit -m "Brief, descriptive message"
   git push -u origin my-change
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

- **Dictionary load:** 145,744 words, each fully analysed in memory on every page load (the text file itself may come from the browser's HTTP cache).
- **Corpus index:** 139 KB, loaded on first use of corpus mode.
- **Lyrics lazy-loading:** full song text is fetched only when a corpus card is opened.
- **Scoring:** every dictionary word is scored in memory per search, on the main thread — roughly 0.1–0.3 s per search in Consoantes/Vogais mode. (`som/` does its indexing in a Web Worker.)

---

## Backup & Snapshots

- `backup/exp-<timestamp>/` — snapshots of `exp/` taken before risky engine changes, each with a README naming the source commit and how to restore it.
- Branch `backup/corpus-v1` — an earlier state of the corpus, kept as a restore point.

---

## Related Resources

- **IPA Feature Geometry:** Chomsky & Halle (1968), *The Sound Pattern of English*
- **Portuguese Phonology:** Câmara Jr. (1970), *Estrutura da Língua Portuguesa*
