#!/usr/bin/env node
/**
 * build-corpus.js
 *
 * Processes upload/letras_final.json → dic/corpus-schemes.json
 *
 * Each song is stored as { a, t, g, s[] } where s is a deduplicated
 * list of stanzas, each stanza being an array of rimaPerfeita strings
 * (one per line, last word of each line).
 *
 * Run: node build-corpus.js
 */
'use strict';

const fs   = require('fs');
const path = require('path');

/* ═══════════════════════════════════════════════════════════════
   PHONETIC ENGINE (same as exp/index.html and rhyme-extract.js)
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

function lastWordOf(line) {
    let clean = line.replace(/\(.*?\)/g, '').trim();
    if (!clean) return null;
    let tokens = clean.split(/\s+/);
    for (let i = tokens.length - 1; i >= 0; i--) {
        let w = tokens[i].replace(/[()[\]!?,.:;"'«»\-–—\/\\]/g, '').trim();
        if (w && vRegex.test(w)) return w;
    }
    return null;
}

function getRima(word) {
    if (!word) return null;
    let sil = silabificar(word);
    let ti  = identificarTonica(sil, word);
    return extrairRima(sil, ti);
}

function processarLetra(letra) {
    let seenKeys = new Set();
    let stanzas  = [];
    for (let rawStanza of letra.split(/\n{2,}/)) {
        let lines = rawStanza.split('\n').map(l => l.trim()).filter(Boolean);
        let rimas = lines
            .map(l => { let w = lastWordOf(l); return w ? getRima(w) : null; })
            .filter(Boolean);
        if (rimas.length < 2) continue;
        // Deduplicate repeated stanzas within the same song
        let key = rimas.join('|');
        if (seenKeys.has(key)) continue;
        seenKeys.add(key);
        stanzas.push(rimas);
    }
    return stanzas;
}

/* ═══════════════════════════════════════════════════════════════
   MAIN
═══════════════════════════════════════════════════════════════ */

const inPath  = path.join(__dirname, 'upload', 'letras_final.json');
const outPath = path.join(__dirname, 'dic', 'corpus-schemes.json');

const songs   = JSON.parse(fs.readFileSync(inPath, 'utf8'));
const corpus  = [];
let totalStanzas = 0;

for (const song of songs) {
    const stanzas = processarLetra(song.letra);
    if (!stanzas.length) continue;
    corpus.push({ a: song.artista, t: song.titulo, g: song.genero, s: stanzas });
    totalStanzas += stanzas.length;
}

fs.writeFileSync(outPath, JSON.stringify(corpus), 'utf8');

const kb = (fs.statSync(outPath).size / 1024).toFixed(1);
console.log(`Written ${corpus.length} songs, ${totalStanzas} unique stanzas → dic/corpus-schemes.json (${kb} KB)`);
