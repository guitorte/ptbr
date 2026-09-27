/**
 * SOM — motor de semelhança sonora
 * =================================
 * Um único mecanismo, quatro níveis de zoom:
 *
 *   som       /t/            → traços articulatórios, distância entre fonemas
 *   sílaba    ge             → onset + núcleo + coda, distância entre sílabas
 *   trecho    -bula, ge-     → alinhamento das k sílabas finais/iniciais
 *   palavra   degustar       → alinhamento ponderado de todas as sílabas + rima
 *
 * Cada nível é construído sobre o anterior: a distância entre palavras é uma
 * soma ponderada de distâncias entre sílabas, que por sua vez é uma soma de
 * distâncias entre fonemas. É a "distância de edição ponderada".
 *
 * Dual-mode: `window.Som` no navegador (depois de ../phonetic-engine.js),
 * `module.exports` no Node.
 */
(function () {
'use strict';

const PE = (typeof PhoneticEngine !== 'undefined') ? PhoneticEngine
         : (typeof require === 'function' ? require('../phonetic-engine.js') : null);

/* ═══════════════════════════════════════════════════════════════
   1. SILABIFICAÇÃO + TÔNICA
   Cópia literal de exp/index.html (ver CLAUDE.md: "o motor fonético
   está duplicado"). Se corrigir lá, corrija aqui.
═══════════════════════════════════════════════════════════════ */
const vRegex = /[aeiouáàâãéêíóôõúü]/i;

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
    if (t.match(/(r|l|z|x|i|is|u|us|im|ins|om|ons|um|uns)$/)) return silabas.length-1;
    if (t.match(/(a|as|e|es|o|os|am|em|ens)$/))        return Math.max(0,silabas.length-2);
    return Math.max(0,silabas.length-2);
}

/* ═══════════════════════════════════════════════════════════════
   2. INVENTÁRIO — o "mapa" do português brasileiro
═══════════════════════════════════════════════════════════════ */

// Consoantes do PB com a grafia mais comum de cada som e onde ficam no mapa.
// lugar: lab (lábios) · den (dentes) · pal (céu da boca) · vel (fundo)
// modo:  exp (explosiva) · chi (chiada) · afr (africada) · nas (nasal) · liq (líquida)
const CONS_PT = {
  'p':  { graf:['p'],          lugar:'lab', modo:'exp', ex:'pato' },
  'b':  { graf:['b'],          lugar:'lab', modo:'exp', ex:'bato' },
  't':  { graf:['t'],          lugar:'den', modo:'exp', ex:'tato' },
  'd':  { graf:['d'],          lugar:'den', modo:'exp', ex:'dado' },
  'k':  { graf:['c','qu','k'], lugar:'vel', modo:'exp', ex:'casa' },
  'g':  { graf:['g','gu'],     lugar:'vel', modo:'exp', ex:'gato' },
  'f':  { graf:['f'],          lugar:'lab', modo:'chi', ex:'faca' },
  'v':  { graf:['v'],          lugar:'lab', modo:'chi', ex:'vaca' },
  's':  { graf:['s','ss','c','ç','sc'], lugar:'den', modo:'chi', ex:'sapo' },
  'z':  { graf:['z','s','x'],  lugar:'den', modo:'chi', ex:'zelo' },
  'ʃ':  { graf:['ch','x'],     lugar:'pal', modo:'chi', ex:'chá' },
  'ʒ':  { graf:['j','g'],      lugar:'pal', modo:'chi', ex:'já' },
  'ʁ':  { graf:['rr','r'],     lugar:'vel', modo:'chi', ex:'rato' },
  'tʃ': { graf:['t(i)'],       lugar:'pal', modo:'afr', ex:'tia' },
  'dʒ': { graf:['d(i)'],       lugar:'pal', modo:'afr', ex:'dia' },
  'm':  { graf:['m'],          lugar:'lab', modo:'nas', ex:'mala' },
  'n':  { graf:['n'],          lugar:'den', modo:'nas', ex:'nada' },
  'ɲ':  { graf:['nh'],         lugar:'pal', modo:'nas', ex:'ninho' },
  'l':  { graf:['l'],          lugar:'den', modo:'liq', ex:'lata' },
  'ɾ':  { graf:['r'],          lugar:'den', modo:'liq', ex:'caro' },
  'ʎ':  { graf:['lh'],         lugar:'pal', modo:'liq', ex:'filho' },
  'w':  { graf:['u','l'],      lugar:'lab', modo:'sem', ex:'quase' },
  'j':  { graf:['i'],          lugar:'pal', modo:'sem', ex:'pai' },
};
const CONS_LIST = Object.keys(CONS_PT);

// Vogais: altura (0 aberta … 3 fechada), recuo (0 frente … 2 trás), lábios, nariz
const VOG = {
  'i': { h:3, b:0, r:0, n:0, graf:['i'],     ex:'vi' },
  'e': { h:2, b:0, r:0, n:0, graf:['ê','e'], ex:'vê' },
  'ɛ': { h:1, b:0, r:0, n:0, graf:['é','e'], ex:'pé' },
  'a': { h:0, b:1, r:0, n:0, graf:['a'],     ex:'pá' },
  'ɔ': { h:1, b:2, r:1, n:0, graf:['ó','o'], ex:'pó' },
  'o': { h:2, b:2, r:1, n:0, graf:['ô','o'], ex:'avô' },
  'u': { h:3, b:2, r:1, n:0, graf:['u'],     ex:'tu' },
  'ĩ': { h:3, b:0, r:0, n:1, graf:['in','im'], ex:'fim' },
  'ẽ': { h:2, b:0, r:0, n:1, graf:['en','em'], ex:'bem' },
  'ã': { h:0.5, b:1, r:0, n:1, graf:['ã','an','am'], ex:'lã' },
  'õ': { h:2, b:2, r:1, n:1, graf:['õ','on','om'], ex:'som' },
  'ũ': { h:3, b:2, r:1, n:1, graf:['un','um'], ex:'um' },
};
const VOG_LIST = Object.keys(VOG);
const isVog = s => s in VOG;

/* ═══════════════════════════════════════════════════════════════
   3. DISTÂNCIAS ENTRE SONS
   Duas lentes: "boca" (articulação, pesos do phonetic-engine.js) e
   "ouvido" (percepção, Miller & Nicely 1955: o ponto de articulação é
   o traço que mais se confunde no ruído; voz e nasalidade resistem).
═══════════════════════════════════════════════════════════════ */
const PLACE_F = ['labial','coronal','dorsal','glottal','anterior','distributed'];
const LENTES = {
  boca:   { place: 1.0, voiced: 1.0, nasal: 1.0, manner: 1.0 },
  ouvido: { place: 0.55, voiced: 1.8, nasal: 1.6, manner: 1.0 },
};
let lenteAtual = 'boca';
const cacheC = new Map();

function tracoPeso(f) {
  const L = LENTES[lenteAtual];
  const w = PE.FEATURE_WEIGHTS[f];
  if (PLACE_F.includes(f)) return w * L.place;
  if (f === 'voiced') return w * L.voiced;
  if (f === 'nasal')  return w * L.nasal;
  return w * L.manner;
}

// Custo 0‥1 entre duas consoantes. Normalizado para que "muito diferente"
// (ex.: t × m) fique perto de 1 — o phonetic-engine normaliza pelo máximo
// teórico, o que achata tudo abaixo de 0,4.
const C_NORM = 1.25;
function custoCons(a, b) {
  if (a === b) return 0;
  const key = a < b ? a + '|' + b : b + '|' + a;
  let c = cacheC.get(key);
  if (c !== undefined) return c;
  const A = PE.CONSONANTS[a], B = PE.CONSONANTS[b];
  if (!A || !B) c = 1;
  else {
    let raw = 0;
    for (const f in PE.FEATURE_WEIGHTS) if ((A[f] || false) !== (B[f] || false)) raw += tracoPeso(f);
    c = Math.min(1, raw / C_NORM);
  }
  cacheC.set(key, c);
  return c;
}

function tracosDiferentes(a, b) {
  const A = PE.CONSONANTS[a], B = PE.CONSONANTS[b];
  if (!A || !B) return [];
  const out = [];
  for (const f in PE.FEATURE_WEIGHTS) if ((A[f] || false) !== (B[f] || false)) out.push(f);
  return out;
}

function custoVog(a, b) {
  if (a === b) return 0;
  const A = VOG[a], B = VOG[b];
  if (!A || !B) return 1;
  const nas = lenteAtual === 'ouvido' ? 0.45 : 0.35;
  return Math.min(1, 0.22 * Math.abs(A.h - B.h) + 0.18 * Math.abs(A.b - B.b)
                   + 0.15 * Math.abs(A.r - B.r) + nas * Math.abs(A.n - B.n));
}

function custoSom(a, b) {
  if (a === b) return 0;
  const va = isVog(a), vb = isVog(b);
  if (va && vb) return custoVog(a, b);
  if (va || vb) return 1;
  return custoCons(a, b);
}

// Traduz a diferença de traços em linguagem de gente.
function explicarDiferenca(a, b) {
  if (a === b) return 'igual';
  if (isVog(a) && isVog(b)) {
    const A = VOG[a], B = VOG[b], d = [];
    if (A.h !== B.h) d.push(B.h > A.h ? 'mais fechada' : 'mais aberta');
    if (A.b !== B.b) d.push(B.b > A.b ? 'mais para trás' : 'mais para frente');
    if (A.r !== B.r) d.push(B.r ? 'lábios em bico' : 'sem bico');
    if (A.n !== B.n) d.push(B.n ? 'nasal' : 'sem nariz');
    return d.join(' · ');
  }
  const diff = tracosDiferentes(a, b);
  const partes = [];
  if (diff.includes('voiced')) partes.push(PE.CONSONANTS[b].voiced ? 'ganha voz' : 'perde a voz');
  if (diff.some(f => PLACE_F.includes(f))) {
    const lugarB = { lab:'lábios', den:'dentes', pal:'céu da boca', vel:'fundo' }[CONS_PT[b]?.lugar];
    partes.push('muda o lugar' + (lugarB ? ' (' + lugarB + ')' : ''));
  }
  if (diff.includes('nasal')) partes.push(PE.CONSONANTS[b].nasal ? 'passa pelo nariz' : 'sai do nariz');
  const modoF = ['sonorant','continuant','lateral','trill','tap','approximant','affricate'];
  if (diff.some(f => modoF.includes(f))) {
    const modoB = { exp:'explosiva', chi:'chiada', afr:'africada', nas:'nasal', liq:'líquida', sem:'semivogal' }[CONS_PT[b]?.modo];
    if (!diff.includes('nasal') || CONS_PT[b]?.modo !== 'nas') partes.push('muda o jeito' + (modoB ? ' (' + modoB + ')' : ''));
  }
  return partes.join(' · ') || 'detalhe fino';
}

function setLente(l) { if (LENTES[l] && l !== lenteAtual) { lenteAtual = l; cacheC.clear(); } }

/* ═══════════════════════════════════════════════════════════════
   4. GRAFIA → SOM (PB, pronúncia padrão urbana)
   Letra ≠ som: "c" de casa ≠ "c" de cedo; "ss" de passo = "ç" de paço.
   Produz sílabas fonológicas: { on:[], nu:'a', gl:'', co:[], t:bool, g:'grafia' }
═══════════════════════════════════════════════════════════════ */
const V_ANT = /[eiéêí]/;          // e/i seguintes → c/g "moles"
const MAPA_VOG = { a:'a', á:'a', à:'a', â:'a', ã:'ã', e:'e', é:'ɛ', ê:'e', i:'i', í:'i',
                   o:'o', ó:'ɔ', ô:'o', õ:'õ', u:'u', ú:'u', ü:'u' };
const NASALIZA = { a:'ã', e:'ẽ', ɛ:'ẽ', i:'ĩ', o:'õ', ɔ:'õ', u:'ũ', ã:'ã', ẽ:'ẽ', ĩ:'ĩ', õ:'õ', ũ:'ũ' };

// "r final cai" (degustar → degustá): aplicado na hora de comparar, não no
// índice, para que o interruptor não exija reindexar o dicionário.
let rFinalMudo = false;
function setRFinalMudo(v) { rFinalMudo = !!v; }
function comR(T) {
  if (!rFinalMudo) return T;
  if (T._semR) return T._semR;
  const n = T.sil.length, u = T.sil[n - 1];
  if (!u.co.length || u.co[u.co.length - 1] !== 'ɾ') return (T._semR = T);
  const sil = T.sil.slice();
  sil[n - 1] = { ...u, co: u.co.slice(0, -1) };
  return (T._semR = { ...T, sil });
}

function transcrever(palavra) {
  const w = palavra.toLowerCase().normalize('NFC').replace(/[^a-záàâãéêíóôõúüç]/g, '');
  if (!w || !vRegex.test(w)) return null;
  const sil = silabificar(w);
  const ti = identificarTonica(sil, w);
  const n = w.length;

  // índice de sílaba de cada letra
  const silDe = new Array(n);
  let pos = 0;
  sil.forEach((s, k) => { for (let i = 0; i < s.length; i++) silDe[pos++] = k; });

  const isV = c => c !== undefined && vRegex.test(c);
  const toks = [];   // { s: símbolo, k: sílaba, v: vogal?, orig: letra }
  const push = (s, k, v) => toks.push({ s, k, v: !!v });
  const ultimaVog = () => { for (let j = toks.length - 1; j >= 0; j--) if (toks[j].v) return toks[j]; return null; };

  for (let i = 0; i < n; i++) {
    const c = w[i], nx = w[i + 1], nx2 = w[i + 2], pv = w[i - 1], k = silDe[i];
    if (isV(c)) {
      // u mudo de gue/gui/que/qui já é consumido abaixo
      push(MAPA_VOG[c] || c, k, true);
      continue;
    }
    switch (c) {
      case 'h': break; // mudo (ch/lh/nh tratados nos seus pares)
      case 'c':
        if (nx === 'h') { push('ʃ', k); i++; }
        else if (nx && V_ANT.test(nx)) push('s', k);
        else push('k', k);
        break;
      case 'ç': push('s', k); break;
      case 'q':
        if (nx === 'u' || nx === 'ü') {
          if (nx === 'u' && nx2 && V_ANT.test(nx2)) { push('k', k); i++; }
          else if (nx2 && isV(nx2)) { push('k', k); push('w', k); i++; }
          else push('k', k);
        } else push('k', k);
        break;
      case 'g':
        if ((nx === 'u' || nx === 'ü') && nx2 && isV(nx2)) {
          if (nx === 'u' && V_ANT.test(nx2)) { push('g', k); i++; }
          else { push('g', k); push('w', k); i++; }
        } else if (nx && V_ANT.test(nx)) push('ʒ', k);
        else push('g', k);
        break;
      case 'j': push('ʒ', k); break;
      case 'l':
        if (nx === 'h') { push('ʎ', k); i++; }
        else if (!isV(nx)) push('w', k, false); // "sal" → saw
        else push('l', k);
        break;
      case 'm': case 'n':
        if (c === 'n' && nx === 'h') { push('ɲ', k); i++; break; }
        if (!isV(nx) && toks.length && toks[toks.length - 1].v) {
          const v = toks[toks.length - 1];
          v.s = NASALIZA[v.s] || v.s;
          if (i === n - 1 && c === 'm') {            // falam → ãw, tem → tẽj
            if (v.s === 'ã') push('w', k);
            else if (v.s === 'ẽ') push('j', k);
          } else if (c === 'n' && nx === 's' && i === n - 2 && v.s === 'ẽ') push('j', k); // bens
          break;
        }
        push(c, k);
        break;
      case 'r':
        if (nx === 'r') { push('ʁ', silDe[i + 1]); i++; }
        else if (i === 0 || pv === 'n' || pv === 'l' || pv === 's') push('ʁ', k);
        else push('ɾ', k);
        break;
      case 's':
        if (nx === 's') { push('s', silDe[i + 1]); i++; }
        else if (nx === 'c' && nx2 && V_ANT.test(nx2)) { push('s', silDe[i + 1]); i++; }
        else if (nx === 'ç') { push('s', silDe[i + 1]); i++; }
        else if (isV(pv) && isV(nx)) push('z', k);
        else push('s', k);
        break;
      case 'x':
        if (i === n - 1) { push('k', k); push('s', k); }
        else if (nx === 'c' && nx2 && V_ANT.test(nx2)) { push('s', silDe[i + 1]); i++; }
        else if (/^e$/.test(pv) && i === 1 && isV(nx)) push('z', k);        // exame
        else if (/^(ine|e)$/.test(w.slice(0, i)) && isV(nx)) push('z', k);  // inexato
        else push('ʃ', k);
        break;
      case 'z':
        push(isV(nx) ? 'z' : 's', k);
        break;
      case 'w': push('w', k); break;
      case 'y': push('i', k, true); break;
      case 'k': push('k', k); break;
      default: push(c, k);
    }
  }

  // redução das vogais finais átonas: leite → leitʃi, gato → gatu
  const ult = sil.length - 1;
  if (ti !== ult) {
    const orig = sil[ult];
    for (const t of toks) if (t.k === ult && t.v) {
      if (t.s === 'e' && !/[éê]/.test(orig)) t.s = 'i';
      else if (t.s === 'o' && !/[óô]/.test(orig)) t.s = 'u';
    }
  }
  // palatalização: t/d + i → tʃ/dʒ (tia, dia, leite)
  for (let j = 0; j < toks.length - 1; j++) {
    const a = toks[j], b = toks[j + 1];
    if (b.v && (b.s === 'i' || b.s === 'ĩ')) {
      if (a.s === 't') a.s = 'tʃ';
      else if (a.s === 'd') a.s = 'dʒ';
    }
  }

  // monta as sílabas
  const out = sil.map((g, k) => ({ g, t: k === ti, on: [], nu: '', gl: '', co: [] }));
  const porSil = sil.map(() => []);
  for (const t of toks) porSil[t.k].push(t);
  for (let k = 0; k < sil.length; k++) {
    const ts = porSil[k];
    let peak = null, primeira = null;
    for (const t of ts) if (t.v) {
      if (!primeira) primeira = t;
      if (!peak && t.s !== 'i' && t.s !== 'u' && t.s !== 'ĩ' && t.s !== 'ũ') peak = t;
    }
    peak = peak || primeira;
    // "ão", "ãe", "õe": a segunda vogal é semivogal
    let passou = false;
    for (const t of ts) {
      if (t === peak) { out[k].nu = t.s; passou = true; continue; }
      if (t.v) {
        const gl = /^[iĩe]$/.test(t.s) ? 'j' : 'w';
        if (passou) out[k].gl += gl; else out[k].on.push(gl);
      } else if (!passou) out[k].on.push(t.s);
      else if (t.s === 'j' || t.s === 'w') out[k].gl += t.s;
      else out[k].co.push(t.s);
    }
    if (!peak) out[k].nu = 'ə'; // sílaba sem vogal (não deve ocorrer)
  }
  return { w, sil: out, ti };
}

/* ═══════════════════════════════════════════════════════════════
   5. DISTÂNCIA ENTRE SEQUÊNCIAS, SÍLABAS E PALAVRAS
═══════════════════════════════════════════════════════════════ */
function distSeq(A, B, gap) {
  const la = A.length, lb = B.length;
  if (!la) return lb * gap;
  if (!lb) return la * gap;
  if (la === 1 && lb === 1) return custoSom(A[0], B[0]);
  let prev = new Array(lb + 1);
  for (let j = 0; j <= lb; j++) prev[j] = j * gap;
  for (let i = 1; i <= la; i++) {
    const cur = [i * gap];
    for (let j = 1; j <= lb; j++)
      cur[j] = Math.min(prev[j - 1] + custoSom(A[i - 1], B[j - 1]), prev[j] + gap, cur[j - 1] + gap);
    prev = cur;
  }
  return prev[lb];
}

// Pesos das partes de uma sílaba: o núcleo (vogal) é o coração.
const P_ON = 0.8, P_NU = 1.4, P_GL = 0.35, P_CO = 0.7;
const GAP_ON = 0.7, GAP_CO = 0.55;
const MAX_SIL = P_ON * 1.4 + P_NU + P_GL + P_CO * 1.1;  // ≈ "sílaba totalmente outra"

function distSilaba(x, y, comTonica) {
  let d = P_ON * distSeq(x.on, y.on, GAP_ON)
        + P_NU * custoVog(x.nu, y.nu)
        + P_GL * (x.gl === y.gl ? 0 : (x.gl && y.gl ? 0.5 : 1))
        + P_CO * distSeq(x.co, y.co, GAP_CO);
  if (comTonica && x.t !== y.t) d += 0.9;
  return d;
}

// Peso de cada sílaba do alvo: palco (tônica e rima) × coxia (pretônicas).
function pesosPosicao(T) {
  return T.sil.map((_, k) => {
    if (k === T.ti) return 3;
    if (k > T.ti)  return 2.4;
    const dist = T.ti - k;
    return Math.max(0.45, 1.3 * Math.pow(0.72, dist - 1));
  });
}

// Alinhamento de sílabas (Needleman-Wunsch) a partir do FIM da palavra,
// porque é no fim que mora a rima. Devolve distância e o par de cada sílaba.
function alinhar(T, C, pesos, comTraco) {
  const a = T.sil.slice().reverse(), b = C.sil.slice().reverse();
  const pw = pesos.slice().reverse();
  const la = a.length, lb = b.length;
  const GAP_SIL = MAX_SIL * 0.75;
  const D = [], P = [];
  for (let i = 0; i <= la; i++) { D.push(new Float64Array(lb + 1)); P.push(new Uint8Array(lb + 1)); }
  for (let i = 1; i <= la; i++) { D[i][0] = D[i - 1][0] + pw[i - 1] * GAP_SIL; P[i][0] = 1; }
  for (let j = 1; j <= lb; j++) {
    const w = pw[Math.min(la - 1, Math.max(0, j - 1))] * 0.45; // sílaba extra no candidato pesa menos
    D[0][j] = D[0][j - 1] + w * GAP_SIL; P[0][j] = 2;
  }
  for (let i = 1; i <= la; i++) {
    for (let j = 1; j <= lb; j++) {
      const sub = D[i - 1][j - 1] + pw[i - 1] * distSilaba(a[i - 1], b[j - 1], true);
      const del = D[i - 1][j] + pw[i - 1] * GAP_SIL;
      const ins = D[i][j - 1] + pw[Math.min(la - 1, i)] * 0.45 * GAP_SIL;
      if (sub <= del && sub <= ins) { D[i][j] = sub; P[i][j] = 0; }
      else if (del <= ins)          { D[i][j] = del; P[i][j] = 1; }
      else                          { D[i][j] = ins; P[i][j] = 2; }
    }
  }
  let dist = D[la][lb];
  if (!comTraco) return { dist };
  // traço: para cada sílaba do alvo, a qualidade do casamento (0 = igual … 1 = ausente)
  const traco = new Array(la).fill(1);
  let i = la, j = lb;
  while (i > 0 || j > 0) {
    const p = i > 0 && j > 0 ? P[i][j] : (i > 0 ? 1 : 2);
    if (p === 0) { traco[i - 1] = Math.min(1, distSilaba(a[i - 1], b[j - 1], true) / (MAX_SIL * 0.7)); i--; j--; }
    else if (p === 1) { traco[i - 1] = 1; i--; }
    else j--;
  }
  return { dist, traco: traco.reverse() };
}

/* ── rima ─────────────────────────────────────────────────────── */
function chaveRima(T) {
  const s = T.sil.slice(T.ti);
  return s.map((x, k) => (k === 0 ? '' : x.on.join('')) + x.nu + x.gl + x.co.join('')).join('.');
}
function chaveToante(T) { return T.sil.slice(T.ti).map(x => x.nu).join('.'); }

// 0 nenhuma · 1 toante (só vogais) · 2 perfeita · 3 rica (perfeita + mesmo ataque da tônica)
function nivelRima(T, C) {
  if (T.sil.length - T.ti !== C.sil.length - C.ti) return 0;
  if (chaveRima(T) === chaveRima(C)) {
    const oT = T.sil[T.ti].on.join(''), oC = C.sil[C.ti].on.join('');
    return oT && oT === oC ? 3 : 2;
  }
  return chaveToante(T) === chaveToante(C) ? 1 : 0;
}
const RIMA_LABEL = ['', 'toante', 'rima', 'rima rica'];
const RIMA_FATOR = [0, 0.35, 1, 1.25];

/* ═══════════════════════════════════════════════════════════════
   6. ÍNDICE DO DICIONÁRIO
═══════════════════════════════════════════════════════════════ */
const somSil = x => x.on.join('') + x.nu + x.gl + x.co.join('');
const chaveFon = T => T.sil.map(somSil).join('.');

function criarIndice() {
  return { itens: [], porChave: new Map(), silabas: new Map(), pronto: false };
}

function indexarLote(ind, palavras) {
  for (const p of palavras) {
    const T = transcrever(p);
    if (!T) continue;
    T.chave = chaveFon(T);
    ind.itens.push(T);
    if (!ind.porChave.has(T.chave)) ind.porChave.set(T.chave, T.w);
    T.sil.forEach((x, k) => {
      const key = somSil(x);
      let e = ind.silabas.get(key);
      if (!e) { e = { key, x: { on: x.on, nu: x.nu, gl: x.gl, co: x.co, t: false }, n: 0, graf: new Map() }; ind.silabas.set(key, e); }
      e.n++;
      const g = x.g.toLowerCase();
      e.graf.set(g, (e.graf.get(g) || 0) + 1);
    });
  }
}

function finalizarIndice(ind) {
  ind.itens.sort((a, b) => a.w.length - b.w.length || (a.w < b.w ? -1 : 1));
  ind.pronto = true;
}

/* ═══════════════════════════════════════════════════════════════
   7. CONSULTAS — os quatro zooms
═══════════════════════════════════════════════════════════════ */

// ── 7a. palavra ─────────────────────────────────────────────────
class TopK {
  constructor(k) { this.k = k; this.a = []; this.min = -Infinity; }
  add(item) {
    if (this.a.length >= this.k && item.score <= this.min) return;
    this.a.push(item);
    if (this.a.length > this.k * 2) this.corta();
  }
  corta() {
    this.a.sort((x, y) => y.score - x.score || x.C.w.length - y.C.w.length);
    this.a.length = Math.min(this.a.length, this.k);
    if (this.a.length >= this.k) this.min = this.a[this.a.length - 1].score;
    return this.a;
  }
}

// Devolve três listas: geral, só rimas (perfeita/rica) e só não-rimas —
// para que "o que soa parecido SEM rimar" não suma quando a rima pesa muito.
function buscarPalavra(ind, texto, opts = {}) {
  const T0 = transcrever(texto);
  if (!T0) return null;
  const T = comR(T0);
  const pesos = pesosPosicao(T);
  const somaP = pesos.reduce((a, b) => a + b, 0);
  const pesoRima = opts.pesoRima ?? 1.5;
  const limite = opts.limite ?? 200;
  const escala = somaP * MAX_SIL * 0.55;
  const nT = T.sil.length;
  const geral = new TopK(limite), rimam = new TopK(limite), naoRimam = new TopK(limite);
  for (const C0 of ind.itens) {
    if (C0.w === T.w) continue;
    if (Math.abs(C0.sil.length - nT) > 2) continue;
    const C = comR(C0);
    const r = alinhar(T, C, pesos, false);
    const nivel = nivelRima(T, C);
    const sim = Math.max(0, 1 - r.dist / escala);
    const item = { C: C0, Cc: C, score: sim + pesoRima * 0.12 * RIMA_FATOR[nivel], sim, nivel };
    geral.add(item);
    if (nivel >= 2) rimam.add(item); else naoRimam.add(item);
  }
  const fim = lst => { const a = lst.corta(); for (const b of a) if (!b.traco) b.traco = alinhar(T, b.Cc, pesos, true).traco; return a; };
  return { T: T0, pesos, geral: fim(geral), rimam: fim(rimam), naoRimam: fim(naoRimam) };
}

// ── 7b. trecho (fim "-bula" / início "ge-") ────────────────────
function transcreverTrecho(texto, lado) {
  const T = transcrever(texto);
  if (!T) return null;
  const temAcento = /[áéíóúâêôãõ]/.test(texto);
  // sem acento, a tônica do trecho é desconhecida: comparamos só o som
  if (!temAcento) T.sil.forEach(x => x.t = false);
  T.tonicaConhecida = temAcento;
  T.lado = lado;
  return T;
}

function buscarTrecho(ind, texto, lado, opts = {}) {
  let F = transcreverTrecho(texto, lado);
  if (!F) return null;
  if (lado === 'fim') F = comR(F);
  const k = F.sil.length;
  // o fim pesa mais que o começo no "-bula"; o começo mais que o fim no "ge-"
  const pesos = F.sil.map((_, i) => lado === 'fim' ? 1 + 0.35 * i : 1 + 0.35 * (k - 1 - i));
  const somaP = pesos.reduce((a, b) => a + b, 0);
  const grupos = new Map();
  for (const C0 of ind.itens) {
    if (C0.sil.length < k) continue;
    const C = lado === 'fim' ? comR(C0) : C0;
    const pedaco = lado === 'fim' ? C.sil.slice(-k) : C.sil.slice(0, k);
    let d = 0;
    for (let i = 0; i < k; i++) d += pesos[i] * distSilaba(F.sil[i], pedaco[i], F.tonicaConhecida);
    const sim = Math.max(0, 1 - d / (somaP * MAX_SIL * 0.6));
    if (sim < 0.35) continue;
    // grupo = som do trecho + onde cai a tônica dentro dele
    const offTon = lado === 'fim' ? C.ti - (C.sil.length - k) : C.ti;
    const tonDentro = offTon >= 0 && offTon < k ? offTon : -1;
    const key = pedaco.map(somSil).join('.') + '#' + tonDentro;
    let g = grupos.get(key);
    if (!g) {
      g = { key, sil: pedaco, tonDentro, sim, palavras: [], grafias: new Map() };
      grupos.set(key, g);
    }
    g.palavras.push(C.w);
    const graf = pedaco.map((x, i) => i === tonDentro ? x.g.toUpperCase() : x.g).join('');
    g.grafias.set(graf, (g.grafias.get(graf) || 0) + 1);
  }
  const lista = [...grupos.values()];
  // desempate: grupos mais populosos primeiro (são os sons "vivos" da língua)
  lista.sort((a, b) => b.sim - a.sim || b.palavras.length - a.palavras.length);
  for (const g of lista) g.grafia = [...g.grafias.entries()].sort((a, b) => b[1] - a[1])[0][0];
  return { F, grupos: lista.slice(0, opts.limite ?? 80) };
}

// ── 7c. sílaba ("ge") ──────────────────────────────────────────
function buscarSilaba(ind, texto, opts = {}) {
  const T = transcrever(texto);
  if (!T || T.sil.length !== 1) return null;
  const S = T.sil[0];
  S.t = false;
  const lista = [];
  for (const e of ind.silabas.values()) {
    if (e.n < (opts.minFreq ?? 3)) continue;
    const d = distSilaba(S, e.x, false);
    lista.push({ ...e, d, sim: Math.max(0, 1 - d / (MAX_SIL * 0.6)),
                 grafias: [...e.graf.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(g => g[0]) });
  }
  lista.sort((a, b) => a.d - b.d || b.n - a.n);
  return { S, chave: somSil(S), vizinhas: lista.slice(0, opts.limite ?? 60) };
}

// Palavras que contêm uma sílaba (pelo som), por posição.
function exemplosSilaba(ind, chave, max = 12) {
  const out = { inicio: [], tonica: [], fim: [], meio: [] };
  for (const C of ind.itens) {
    const n = C.sil.length;
    for (let k = 0; k < n; k++) {
      if (somSil(C.sil[k]) !== chave) continue;
      const alvo = k === C.ti ? 'tonica' : k === 0 ? 'inicio' : k === n - 1 ? 'fim' : 'meio';
      if (out[alvo].length < max) out[alvo].push({ w: C.w, k, sil: C.sil });
      break;
    }
    if (out.inicio.length >= max && out.tonica.length >= max && out.fim.length >= max && out.meio.length >= max) break;
  }
  return out;
}

// ── 7d. som ("t") ──────────────────────────────────────────────
// Letra → sons possíveis
const LETRA_SONS = {
  a:['a','ã'], á:['a'], â:['a'], ã:['ã'], e:['e','ɛ','i'], é:['ɛ'], ê:['e'], i:['i'], í:['i'],
  o:['o','ɔ','u'], ó:['ɔ'], ô:['o'], õ:['õ'], u:['u'], ú:['u'],
  b:['b'], c:['k','s'], ç:['s'], d:['d','dʒ'], f:['f'], g:['g','ʒ'], h:[], j:['ʒ'], k:['k'],
  l:['l','w'], m:['m'], n:['n'], p:['p'], q:['k'], r:['ɾ','ʁ'], s:['s','z'], t:['t','tʃ'],
  v:['v'], w:['w'], x:['ʃ','z','s'], y:['i'], z:['z','s'],
  ch:['ʃ'], lh:['ʎ'], nh:['ɲ'], rr:['ʁ'], ss:['s'], qu:['k'], gu:['g'], sc:['s'],
  tch:['tʃ'], dj:['dʒ'],
};
const SONS_EXEMPLO_LETRA = {
  't|t':'tatu', 't|tʃ':'tia', 'd|d':'dado', 'd|dʒ':'dia', 'c|k':'casa', 'c|s':'cedo',
  'g|g':'gato', 'g|ʒ':'gelo', 's|s':'sapo', 's|z':'casa', 'r|ɾ':'caro', 'r|ʁ':'rato',
  'x|ʃ':'xícara', 'x|z':'exame', 'x|s':'próximo', 'l|l':'lata', 'l|w':'sal',
  'e|e':'medo', 'e|ɛ':'festa', 'e|i':'leite', 'o|o':'bolo', 'o|ɔ':'bola', 'o|u':'gato',
  'a|a':'casa', 'a|ã':'cama', 'z|z':'zelo', 'z|s':'paz',
};

function vizinhosSom(sym) {
  const lista = isVog(sym) ? VOG_LIST : CONS_LIST;
  return lista.filter(s => s !== sym).map(s => ({
    s, d: custoSom(sym, s), por: explicarDiferenca(sym, s),
    tracos: isVog(sym) ? null : tracosDiferentes(sym, s).length,
  })).sort((a, b) => a.d - b.d);
}

// Pares mínimos: palavras que viram outra trocando um único som.
// tia → dia, gato → gado. É a prova de que dois sons são "vizinhos" na língua.
function paresMinimos(ind, sym, alvos, max = 4) {
  const res = new Map(alvos.map(a => [a, []]));
  let faltam = alvos.length;
  for (const C of ind.itens) {
    if (!faltam) break;
    if (C.w.length > 9) break;
    if (C.w.length < 3) continue;
    const partes = C.sil.map(x => [...x.on, '|' + x.nu, ...(x.gl ? ['|' + x.gl] : []), ...x.co.map(c => '^' + c)]);
    const flat = []; partes.forEach((p, k) => p.forEach(s => flat.push({ s, k })));
    const idxs = [];
    flat.forEach((f, i) => { if (f.s.replace(/^[|^]/, '') === sym) idxs.push(i); });
    if (!idxs.length) continue;
    for (const q of alvos) {
      const lst = res.get(q);
      if (lst.length >= max) continue;
      for (const i of idxs) {
        const pref = flat[i].s[0] === '|' || flat[i].s[0] === '^' ? flat[i].s[0] : '';
        const novo = flat.map((f, j) => j === i ? pref + q : f.s);
        // reconstruir a chave no formato somSil
        const sils = C.sil.map(() => '');
        novo.forEach((s, j) => { sils[flat[j].k] += s.replace(/^[|^]/, ''); });
        const w2 = ind.porChave.get(sils.join('.'));
        if (w2 && w2 !== C.w && !lst.some(p => p[1] === w2)) {
          lst.push([C.w, w2]);
          if (lst.length >= max) faltam--;
          break;
        }
      }
    }
  }
  return res;
}

/* ── interpretação da consulta ───────────────────────────────── */
function interpretar(q) {
  const raw = q.trim().toLowerCase();
  if (!raw) return null;
  if (/^\/.+\/$/.test(raw) || raw.startsWith('[')) {
    const s = raw.replace(/[\/\[\]]/g, '');
    if (CONS_PT[s] || VOG[s]) return { modo: 'som', sons: [s], texto: raw };
  }
  if (CONS_PT[raw] && !LETRA_SONS[raw]) return { modo: 'som', sons: [raw], texto: raw };
  if (raw.startsWith('-') || raw.startsWith('…')) {
    const t = raw.replace(/^[-…]+/, '');
    return t ? { modo: 'fim', texto: t } : null;
  }
  if (raw.endsWith('-')) {
    const t = raw.replace(/-+$/, '');
    return t ? { modo: 'inicio', texto: t } : null;
  }
  if (LETRA_SONS[raw]) return { modo: 'som', sons: LETRA_SONS[raw], letra: raw, texto: raw };
  const T = transcrever(raw);
  if (!T) return null;
  // uma sílaba curta ("ge", "tra", "mar") → zoom de sílaba; o resto → palavra
  if (T.sil.length === 1 && raw.length <= 4) return { modo: 'silaba', texto: raw };
  return { modo: 'palavra', texto: raw };
}

/* ── utilidades de exibição ─────────────────────────────────── */
function ipaSil(x) { return x.on.join('') + x.nu + x.gl + x.co.join(''); }
function ipaPalavra(T) { return T.sil.map((x, k) => (k === T.ti && T.sil.length > 1 ? 'ˈ' : '') + ipaSil(x)).join('.'); }

const Som = {
  silabificar, identificarTonica, transcrever, transcreverTrecho,
  custoCons, custoVog, custoSom, explicarDiferenca, setLente, setRFinalMudo,
  distSilaba, alinhar, pesosPosicao, nivelRima, chaveRima, RIMA_LABEL,
  criarIndice, indexarLote, finalizarIndice,
  buscarPalavra, buscarTrecho, buscarSilaba, exemplosSilaba, vizinhosSom, paresMinimos,
  interpretar, ipaSil, ipaPalavra, somSil, chaveFon,
  CONS_PT, CONS_LIST, VOG, VOG_LIST, LETRA_SONS, SONS_EXEMPLO_LETRA, isVog,
  get lente() { return lenteAtual; }, get rFinalMudo() { return rFinalMudo; },
};

if (typeof module !== 'undefined' && module.exports) module.exports = Som;
if (typeof self !== 'undefined') self.Som = Som;   // janela ou worker
})();
