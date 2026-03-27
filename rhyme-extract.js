#!/usr/bin/env node
/**
 * rhyme-extract.js
 *
 * Processes letras_final.json and outputs the rhyme scheme of every song.
 * Uses the exact same phonetic engine as exp/index.html (silabificar,
 * identificarTonica, extrairRima) — no browser APIs required.
 *
 * Usage:
 *   node rhyme-extract.js [--song "Título"] [--artist "Artista"]
 *                         [--genre "Pagode"] [--index N]
 *                         [--output schemes|full]
 *
 * Output modes:
 *   schemes  (default) — compact: artist · title, then rhyme scheme per stanza
 *   full               — also show each original line alongside its rhyme
 */

'use strict';

const fs   = require('fs');
const path = require('path');

/* ═══════════════════════════════════════════════════════════════
   PHONETIC ENGINE (ported directly from exp/index.html)
═══════════════════════════════════════════════════════════════ */

const vRegex = /[aeiouáàâãéêíóôõúü]/i;

function normV(s) {
    return s.toLowerCase()
        .replace(/[áàâ]/g,'a').replace(/[éê]/g,'e').replace(/í/g,'i')
        .replace(/[óô]/g,'o').replace(/[úü]/g,'u');
}

function tratarHiatosVogais(blocoVoc, pLower) {
    if (blocoVoc.length <= 1) return [blocoVoc];
    let resultado = [], atual = blocoVoc[0];
    for (let i = 1; i < blocoVoc.length; i++) {
        let char = blocoVoc[i], par = (atual.slice(-1) + char).toLowerCase();
        let formamDitongo   = /^(ai|au|ei|eu|iu|oi|ou|ui|ão|õe|ãe)$/.test(par);
        let vogaisIdenticas = par[0] === par[1];
        let temHiatoAcent   = /[aeiouáéíóúâêôãõü][íú]/.test(par);
        let ehHiatoFinal    = /^(ai|ui|au|oe)$/.test(par) &&
                              (pLower.endsWith(par+"r")||pLower.endsWith(par+"z")||pLower.endsWith(par+"l"));
        let seguidoDeNh     = pLower.includes(par+"nh");
        let pos = pLower.indexOf(par);
        let seguidoDeNasal  = pos >= 0 && pLower[pos+2] === 'n' && pos+3 < pLower.length && !vRegex.test(pLower[pos+3]);
        let formaHiatoDit   = false;
        if (blocoVoc.length >= 3 && /^[aeo]$/.test(atual.slice(-1))) {
            let prox = blocoVoc[i+1] ? blocoVoc[i+1].toLowerCase() : "";
            if (/^(iu|ui)$/.test(char+prox)) formaHiatoDit = true;
        }
        if (formamDitongo && !temHiatoAcent && !vogaisIdenticas && !ehHiatoFinal && !seguidoDeNh && !seguidoDeNasal && !formaHiatoDit)
            atual += char;
        else { resultado.push(atual); atual = char; }
    }
    resultado.push(atual);
    return resultado;
}

function separarConsoantes(cBlock) {
    if (cBlock.length <= 1) return ["", cBlock];
    let tL = cBlock.toLowerCase();
    if (cBlock.length === 2) {
        if (/^(ch|lh|nh|gu|qu|br|cr|dr|fr|gr|pr|tr|vr|bl|cl|fl|gl|pl|tl)$/.test(tL)) return ["", cBlock];
        return [cBlock.slice(0,1), cBlock.slice(1)];
    }
    if (/^(ch|lh|nh|gu|qu|br|cr|dr|fr|gr|pr|tr|vr|bl|cl|fl|gl|pl|tl)$/.test(tL.slice(-2)))
        return [cBlock.slice(0,-2), cBlock.slice(-2)];
    return [cBlock.slice(0,-1), cBlock.slice(-1)];
}

function silabificar(palavra) {
    let blocos = [], tipoAt = '', textoAt = '';
    for (let i = 0; i < palavra.length; i++) {
        let ch = palavra[i], chL = ch.toLowerCase();
        if ((chL==='q'||chL==='g') && palavra[i+1] && palavra[i+1].toLowerCase()==='u'
            && palavra[i+2] && vRegex.test(palavra[i+2])) {
            if (tipoAt==='V') { blocos.push({tipo:'V',texto:textoAt}); textoAt=''; }
            blocos.push({tipo:'C',texto:ch+palavra[i+1]}); i++; tipoAt=''; continue;
        }
        let tipo = vRegex.test(ch) ? 'V' : 'C';
        if (tipo !== tipoAt) { if (textoAt) blocos.push({tipo:tipoAt,texto:textoAt}); tipoAt=tipo; textoAt=ch; }
        else textoAt += ch;
    }
    if (textoAt) blocos.push({tipo:tipoAt,texto:textoAt});
    let bExp = [];
    for (let b of blocos) {
        if (b.tipo==='V') tratarHiatosVogais(b.texto, palavra.toLowerCase()).forEach(v=>bExp.push({tipo:'V',texto:v}));
        else bExp.push(b);
    }
    let idxV = bExp.reduce((a,b,i)=>(b.tipo==='V'?[...a,i]:a),[]);
    if (!idxV.length) return [palavra];
    let sil = new Array(idxV.length).fill("");
    for (let i=0; i<idxV[0]; i++) sil[0] += bExp[i].texto;
    for (let k=0; k<idxV.length-1; k++) {
        sil[k] += bExp[idxV[k]].texto;
        let cT=""; for (let j=idxV[k]+1; j<idxV[k+1]; j++) cT+=bExp[j].texto;
        let [esq,dir] = separarConsoantes(cT); sil[k]+=esq; sil[k+1]+=dir;
    }
    let uV = idxV[idxV.length-1];
    sil[sil.length-1] += bExp[uV].texto;
    for (let i=uV+1; i<bExp.length; i++) sil[sil.length-1]+=bExp[i].texto;
    return sil;
}

function identificarTonica(silabas, p) {
    let t = p.toLowerCase();
    for (let i=0;i<silabas.length;i++) if(/[áéíóúâêô]/i.test(silabas[i])) return i;
    for (let i=0;i<silabas.length;i++) if(/[ãõ]/i.test(silabas[i])) return i;
    if (t.match(/(r|l|z|x|i|is|u|us|im|ins|um|uns)$/)) return silabas.length-1;
    if (t.match(/(a|as|e|es|o|os|am|em|ens)$/))        return Math.max(0,silabas.length-2);
    return Math.max(0,silabas.length-2);
}

function extrairRima(sil, ti) {
    let pf = sil.slice(ti).join(''), m = pf.match(vRegex);
    return m ? pf.slice(m.index).toLowerCase() : pf.toLowerCase();
}

/* ═══════════════════════════════════════════════════════════════
   LYRIC PROCESSING
═══════════════════════════════════════════════════════════════ */

/**
 * Clean a single word for phonetic processing:
 * strip punctuation, parentheses annotations, diacritics that
 * don't affect stress, lowercase.
 */
function cleanWord(raw) {
    return raw
        .replace(/[()[\]!?,.:;"'«»\-–—\/\\]/g, '')
        .replace(/\s+/g, '')
        .trim();
}

/**
 * Extract the last meaningful word from a lyric line.
 * Returns null if the line is empty or instrumental.
 */
function lastWordOf(line) {
    // Strip parenthetical annotations like (bis), (2x), (refrão)
    let clean = line.replace(/\(.*?\)/g, '').trim();
    if (!clean) return null;
    let tokens = clean.split(/\s+/);
    // Walk right-to-left to find first token with a vowel
    for (let i = tokens.length - 1; i >= 0; i--) {
        let w = cleanWord(tokens[i]);
        if (w && vRegex.test(w)) return w;
    }
    return null;
}

/**
 * Get the rimaPerfeita for a word using the exact engine logic.
 */
function getRima(word) {
    if (!word) return null;
    let sil = silabificar(word);
    let ti  = identificarTonica(sil, word);
    return extrairRima(sil, ti);
}

/**
 * Process one song's letra into a rhyme scheme.
 * Returns an array of stanzas; each stanza is an array of
 * { line, word, rima } objects.
 */
function extractScheme(letra) {
    let stanzas = letra.split(/\n{2,}/);
    return stanzas.map(stanza => {
        let lines = stanza.split('\n').map(l => l.trim()).filter(Boolean);
        return lines.map(line => {
            let word = lastWordOf(line);
            let rima = word ? getRima(word) : null;
            return { line, word, rima };
        }).filter(r => r.rima);
    }).filter(s => s.length > 0);
}

/* ═══════════════════════════════════════════════════════════════
   CLI
═══════════════════════════════════════════════════════════════ */

function parseArgs() {
    let args = process.argv.slice(2);
    let opts = { song: null, artist: null, genre: null, index: null, output: 'schemes' };
    for (let i = 0; i < args.length; i++) {
        if (args[i] === '--song')   opts.song   = args[++i];
        if (args[i] === '--artist') opts.artist = args[++i];
        if (args[i] === '--genre')  opts.genre  = args[++i];
        if (args[i] === '--index')  opts.index  = parseInt(args[++i]);
        if (args[i] === '--output') opts.output = args[++i];
    }
    return opts;
}

function formatSong(song, opts) {
    let scheme = extractScheme(song.letra);
    let header = `## ${song.artista} · ${song.titulo} [${song.genero}]`;
    let body;
    if (opts.output === 'full') {
        body = scheme.map(stanza =>
            stanza.map(r => `  ${r.line.padEnd(45)} → -${r.rima}`).join('\n')
        ).join('\n\n');
    } else {
        body = scheme.map(stanza =>
            stanza.map(r => `-${r.rima}`).join('\n')
        ).join('\n\n');
    }
    return `${header}\n\n${body}`;
}

function main() {
    let opts = parseArgs();
    let jsonPath = path.join(__dirname, 'upload', 'letras_final.json');
    if (!fs.existsSync(jsonPath)) {
        console.error(`ERROR: ${jsonPath} not found.`);
        process.exit(1);
    }
    let songs = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));

    let selected = songs;
    if (opts.index !== null) {
        selected = [songs[opts.index]].filter(Boolean);
    } else {
        if (opts.artist) selected = selected.filter(s => s.artista.toLowerCase().includes(opts.artist.toLowerCase()));
        if (opts.song)   selected = selected.filter(s => s.titulo.toLowerCase().includes(opts.song.toLowerCase()));
        if (opts.genre)  selected = selected.filter(s => (s.genero||'').toLowerCase().includes(opts.genre.toLowerCase()));
    }

    if (selected.length === 0) {
        console.log('No songs matched the given filters.');
        process.exit(0);
    }

    console.log(`Processing ${selected.length} song(s)...\n`);
    selected.forEach((song, i) => {
        if (i > 0) console.log('\n' + '─'.repeat(60) + '\n');
        console.log(formatSong(song, opts));
    });
}

main();
