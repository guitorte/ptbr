# CLAUDE.md — ptbr project context

## What this project is

A browser-based Portuguese rhyme and lyric tool. Users type a word and get ranked rhymes, near-rhymes, and assonances. A secondary **ESQ mode** searches a corpus of 474 real song lyrics for stanzas sharing the same rhyme profile, and clicking a result opens the full song with the matching stanza highlighted.

---

## File map

| File | Role |
|------|------|
| `exp/index.html` | Entire app — phonetic engine, scoring, UI, corpus, lyrics panel (~3680 lines, self-contained) |
| `phonetic-engine.js` | IPA consonant distance table (Chomsky & Halle features). Dual-mode: `window.PhoneticEngine` in the browser, `module.exports` in Node. Loaded by `exp/index.html` and `som/` (page + worker) via `../phonetic-engine.js` — the Node CLIs do *not* require it |
| `build-corpus.js` | CLI: `upload/letras_final.json` → `dic/corpus-schemes.json` |
| `rhyme-extract.js` | CLI: extract rhyme schemes from individual songs, with `--genre/--artist/--song/--index` flags |
| `dic/palavras.txt` | 145,744 Portuguese words, one per line (1.5 MB) |
| `dic/corpus-schemes.json` | 474 songs × deduplicated stanzas in compact `{a,t,g,s[]}` format (139 KB) |
| `upload/letras_final.json` | 478 song lyrics with full text (`{artista, titulo, letra, genero, fonte}`) — lazy-loaded in-browser on first card click |
| `som/` | **Som** — mobile-first "navegue semelhanças": one engine, four zoom levels (palavra `degustar`, fim `-bula` / início `ge-`, sílaba `ge`, som `t`). `engine.js` (G2P + weighted distances, dual-mode, testable in Node), `worker.js` (indexes `dic/palavras.txt` off the UI thread), `index.html` (UI). Loads `../phonetic-engine.js` |
| `song-analysis.html` | Standalone page "Eco Sonoro" — phonetic analysis of a full lyric. **Carries its own inlined copy of the phonetic engine** |
| `exp/v02.html` | Older standalone prototype ("Vocalis"), own inlined engine — historical, not wired to anything |
| `exp/index.backup.html` | Pre-refactor snapshot of `exp/index.html` — historical |
| `backup/` | Timestamped snapshots of `exp/` taken before risky engine changes |

---

## Key functions in exp/index.html

| Function | What it does |
|----------|-------------|
| `silabificar(word)` | Splits word into syllables using Portuguese rules |
| `identificarTonica(silabas, palavra)` | Returns index of the stressed syllable — see *Stress assignment* below |
| `extrairRima(silabas, tonicaIndex)` | Returns string from tonic vowel to end (`pas-TEL` → `el`). Takes the syllable array + stress index, **not** the word — the `u` of `qu`/`gu` + vowel is skipped (`al-GUÉM` → `ém`, `QUE-ro` → `ero`) |
| `idxNucleo(sil)` / `semGlideQU(s)` | Nucleus index of a syllable / strip the glide `u` of `qu`/`gu` + vowel. Every vowel-reading field (`onsetTonico`, `vogalTonica`, `vogaisRima`, `espinhaVocal`, `vogAntes/Depois`) goes through them, so `QUE-ro` has onset `qu`, stressed vowel `e` |
| `perfilFonetico(word)` | Returns full phonetic profile: `{p, sil, tonicaIndex, rimaPerfeita, vogaisRima, onsetTonico, espinhaVocal, vogalTonica, numSilabas, acentuacao, ...}` |
| `calcScore(a, b)` | Multi-criteria score comparing two phonetic profiles |
| `processarBusca()` | Main search: scores all dictionary words against `alvoAtual`, applies filters |
| `renderCorpus(results)` | Renders ESQ mode corpus cards |
| `buscarCorpus(alvo)` | Finds corpus stanzas matching a phonetic profile |
| `abrirLetra(r)` | Lazy-loads full lyrics, highlights matching stanza, shows lyrics panel |
| `fecharLetra()` | Returns to corpus view, restores scroll position |
| `toggleCorpusMode()` | Switches between rhyme-finder and ESQ corpus views |
| `calcEsqueleto(word)` | Phonetic consonant skeleton `{s, l, g, gs, leg}`: IPA symbols (`metade` → `mtd`, `gente` → `ʒŋt`), base letter of each consonant (`casa` → s `z` / l `s`), per-consonant gap cost (coda cheaper, coda nasal/`l` cheapest), readable legend `m·t·d`. A vowel-less input (`dt`) is read as the skeleton itself |
| `consQualquerOrdem(W, Q, tol)` | Filter *Consoantes em qualquer ordem* (`FILTROS_CONTEM.consLivre` / `toleranciaLivre`): every consonant of `Q` needs its own partner in `W` (bipartite matching, so `tt` needs two t's), any order/position. A pair matches by sound **or** letter (`s` → casa, cidade; `g` → gato, gente). Tol 1 = voicing pairs, tol 2 = + m/n, nh/n, liquids (r/l, lh/l) |
| `consCategoria(W, A)` | Skeleton category (works on `esq` and `esqV` alike); in CONS mode: consonant category for the second chip row (`#cat-grid`, filter `FILTRO_CAT`, result field `catCons`): `'mesmas'` = exactly the anchor's consonants in any order (`metade` → método, ditame); a symbol `X` = exactly the anchor's minus `X` ("sem m" → tudo, dote, adote). Strict: no leftover consonant, not even a coda nasal, so substitutions (`batido`, `entada`) stay in the bands. Category words bypass `CONS_PISO` |
| `calcScoreCons(item, alvo)` | CONS-mode score: weighted edit distance between skeletons (`distEsq`/`simEsq`, substitution cost from `phonetic-engine.js`, edge gaps ×0.6), mapped onto the same 160/130/100/60 bands; vowel sequence is only a ≤15-pt tiebreak |
| `calcEsqVogal(silabas)` | Vowel skeleton, same shape as `calcEsqueleto` (`{s, l, g, gs, leg}`): one symbol per vowel sound — `a e i o u`, nasals `ã ẽ ĩ õ ũ` (tilde or coda m/n: `gente` → `ẽ·e`), diphthong glides `ɪ ʊ` with a cheaper gap (`peito` → `eⁱ·o`, `mão` → `ãᵘ`, `quase` → `ᵘa·e`); silent `u` of que/gui dropped; é = ê = e. Uses the syllable split only to tell diphthong from hiatus — stress is not consulted. Stored as `esqV` on every profile |
| `calcScoreVog(item, alvo)` | VOG-mode score: `simEsq` over `esqV` with `_vogSub` costs (e~i, o~u 0.3; a~e 0.5; e~o 0.6; a~i 0.8; nasality +0.15), baseline `VOG_BASE_SIM` 0.45, same bands. Consonant-skeleton similarity adds at most +9 (ordering only) |
| `setModo('rima'｜'cons'｜'vog')` | Three-way selector under the search box (`#modo-seg`, state `modoBusca`). `cons`/`vog` swap rhyme scoring for skeleton scoring and ignore stress entirely; all filters still apply. `_esqK()` returns which skeleton field (`esq`/`esqV`) the current mode compares |

---

## CONS mode (busca sem tônica)

Answers "what *sounds* built like this word, whatever its stress?" — `metade` →
`método`, `metido`, `matado`, `medida`. Typing a bare skeleton (`dt`, `mtd`)
searches by skeleton directly (`dt` → `dote`, `dito`, `dieta`).

- Lives only in `exp/index.html`; it does **not** touch `silabificar` /
  `identificarTonica`, so there is nothing to sync with the other engine copies
  and no corpus rebuild.
- Bands are relabelled (Iguais / Quase / Próximas / Parciais — short on purpose,
  three chips must fit a phone row); results below 60 are dropped (`CONS_PISO`)
  unless they belong to a category, which keeps them as Distantes / Vagas.
- Second chip row answers "where is `adote` when I type `metade`?": **mesmas
  m·t·d · sem m · sem t · sem d**. Band row and category row combine (AND) and
  each row's counts already reflect the other's selection. Hidden for A∩B and
  for anchors with a single consonant.
- Hash: `#molde=metade&modo=cons`.
- Calibration: from `metade`, ~43 words share the exact skeleton, ~13k pass the
  floor. Two-consonant partials (`adoto`, `tudo`) land in *Parcial* — real
  3-consonant neighbours (`abatido` b·t·d) are genuinely closer.

---

## VOG mode (só vogais, sem tônica)

The mirror image of CONS: compares only the vowel-sound sequence. `metade`
(e·a·e) → mênade, desate, beldade, debate; then nasal variants (embate ẽ·a·e),
then neighbours. Typing only vowels searches the pattern itself (`eae`, `oao`).

- Same machinery as CONS (`distEsq`/`simEsq` take the substitution-cost function
  as a parameter; `consCategoria` and the category chip row are shared):
  **mesmas e·a·e · sem e · sem a**.
- Like CONS, lives only in `exp/index.html` and changes nothing in
  `silabificar`/`identificarTonica` — no other engine copy to sync, no corpus rebuild.
- Known limit: open vs closed e/o (é/ê, ó/ô) are not distinguished, because
  unaccented spelling doesn't say which one a vowel is.
- Calibration: from `metade`, 169 words share the exact sequence, ~13k pass the floor.
- Hash: `#molde=metade&modo=vog`.

---

## ⚠️ The phonetic engine is duplicated in 4 places

`silabificar`, `identificarTonica`, `extrairRima` and the helpers around them are
**copy-pasted**, not shared. A fix to one is a fix to none:

| Copy | Used by |
|------|---------|
| `exp/index.html` | the live app |
| `build-corpus.js` | corpus index build |
| `rhyme-extract.js` | per-song CLI |
| `song-analysis.html` | Eco Sonoro page |
| `som/engine.js` | Som (`silabificar`, `identificarTonica` + helpers, verbatim) |

Always patch all four (five, counting `som/engine.js`), then rebuild the corpus. `exp/index.backup.html` and
`exp/v02.html` hold two more stale copies — leave those alone, they are archives.

Verify: `grep -n "function identificarTonica" -A 10 exp/index.html build-corpus.js rhyme-extract.js song-analysis.html som/engine.js`

---

## Stress assignment (`identificarTonica`)

Resolution order — first rule that fires wins:

1. Explicit acute/circumflex accent (`á é í ó ú â ê ô`) → that syllable.
2. Nasal tilde (`ã õ`) → that syllable.
3. Oxytone endings `r l z x i is u us im ins om ons um uns` → last syllable.
4. Paroxytone endings `a as e es o os am em ens` → penultimate.
5. Default → penultimate.

Rules 3 and 4 encode Portuguese orthography, where the written accent marks the
*exception*: an unaccented word ending in `-om`/`-ons` is necessarily oxytone
(gar-ÇOM, mar-ROM), which is exactly why paroxytones in `-m` must be accented
(ímã, hífen, pólen). Before adding an ending to rule 3, diff the whole of
`dic/palavras.txt` old-regex vs new-regex and inspect every word that changes class.

Known gaps, deliberately left alone:

- **`-n`** is orthographically oxytone, but all 119 unaccented `-n` words in the
  dictionary are unadapted loanwords pronounced as paroxytones in BP (bacon,
  login, design, slogan, kelvin). Adding it would cause more errors than it fixes.
- **Accented diphthongs** — `tratarHiatosVogais` tests `/^(ai|au|ei|eu|iu|oi|ou|ui|ão|õe|ãe)$/`
  without the accented variants, so `troféu` splits as `tro-FÉ-u` (3 syllables
  instead of 2). Stress lands correctly; only the syllable count is wrong.

---

## Scoring system

`calcScore()` returns a number. Bands:

| Score | Label |
|-------|-------|
| ≥ 160 | Rima (perfect rhyme) |
| ≥ 130 | Quase-rima |
| ≥ 100 | Eco forte |
| ≥ 60  | Assonância |
| ≥ 25  | Proximidade |
| ≥ 10  | Ritmo |

Key weights: `rimaPerfeita` exact = +125 (dominant), `onsetTonico` full = +20, `espinhaVocal` = +20. Rhyme quality always outranks structural coincidence.

---

## State variables

| Variable | Description |
|----------|-------------|
| `alvoAtual` | Phonetic profile of the current anchor word (`null` in filter-only mode) |
| `alvoB` | Second word for intersection search |
| `dicionario` | Array of all phonetic profiles, loaded once on startup |
| `resultadosFiltrados` | Current filtered result set |
| `FILTROS` | Object of locked filter values (exact match) |
| `FILTROS_NEG` | Negated filter flags |
| `FILTROS_CONTEM` | Free-text filter values (vowels, consonants, onset fields) |
| `modoBusca` | `'rima'` \| `'cons'` \| `'vog'` — which engine ranks the results |
| `FILTRO_CAT` | Selected category chips in CONS/VOG mode (`'mesmas'` and/or missing-sound symbols) |
| `modoCorpus` | Boolean: ESQ mode active |
| `corpusEsquemas` | Loaded corpus index (`null` until first ESQ use) |
| `letrasDict` | `Map<"artista§titulo", letra>` — built lazily on first card click |
| `corpusScrollY` | Saved scroll position in `#corpus-viewport` for back-navigation |

---

## Development branch

Active branch: `claude/modo-vogais`

Always push to the active branch. Never push to main without explicit instruction.
Confirm the branch actually exists before trusting this line — it goes stale after
every merge (`git branch -a`).

Snapshots of `exp/` live in `backup/exp-<timestamp>/`, each with a README naming
the commit it was taken from. Take one before touching the phonetic engine.

---

## How to run locally

```bash
python -m http.server 8000
# open http://localhost:8000/exp/index.html
```

On Windows: double-click `start.bat`.

---

## Rebuild corpus index after changing lyrics or phonetic engine

```bash
node build-corpus.js
# output: dic/corpus-schemes.json
```

Required after **any** change to syllabification, stress or rhyme extraction —
the corpus stores pre-computed rhyme tokens, so a stale index silently disagrees
with the live app. To confirm a rebuild did what you expected, diff the rhyme-token
frequencies before and after rather than eyeballing the JSON.
