#!/usr/bin/env node
/**
 * Eenmalige, herhaalbare import van het oude Google Docs-kookboek naar concept-recepten.
 *
 *   node scripts/import-kookboek.mjs              alle recepten + IMPORT-RAPPORT.md
 *   node scripts/import-kookboek.mjs --only kimchi  alleen dit recept (geen rapport)
 *
 * Van dubbele titels wordt alleen de eerste versie geïmporteerd (de verschillen staan in
 * het rapport), en foto's die volgens de bron niet van ons zijn worden niet gebruikt.
 *
 * Leest Kookboek/Kookboek.html en Kookboek/images/, schrijft per recept
 * src/content/recepten/<slug>/nl.md (draft: true) en foto.jpg, en schrijft het
 * controlerapport naar IMPORT-RAPPORT.md in de projectmap. Opnieuw draaien
 * overschrijft de geïmporteerde mappen; handmatige wijzigingen daarin gaan dan verloren.
 *
 * Gebruikt de devDependencies cheerio (HTML lezen), sharp (foto's verkleinen en
 * metadata strippen) en yaml (frontmatter schrijven).
 */
import { load } from 'cheerio';
import sharp from 'sharp';
import YAML from 'yaml';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { diets, occasions, proteins } from '../src/lib/taxonomy.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE_DIR = join(ROOT, 'Kookboek');
const SOURCE_HTML = join(SOURCE_DIR, 'Kookboek.html');
const RECIPES_DIR = join(ROOT, 'src', 'content', 'recepten');
const REPORT = join(ROOT, 'IMPORT-RAPPORT.md');
const DIST = join(ROOT, 'dist');
const IMPORT_DATE = '2026-10-25';
const PHOTO = { maxWidth: 1600, quality: 82 };

const onlyIndex = process.argv.indexOf('--only');
const ONLY = onlyIndex === -1 ? undefined : process.argv[onlyIndex + 1];
if (onlyIndex !== -1 && !ONLY) throw new Error('Gebruik: --only <slug>');

// ─── Vaste keuzes ────────────────────────────────────────────────────────────

/** De vijf inhoudsopgaven in de bron, in volgorde. Alleen de eerste heeft een sectienaam. */
const TOC_SECTIONS = [
  { label: 'Voorgerechten', course: 'starter', direct: true },
  { label: 'Inhoudsopgave 2 (geen sectienaam; bevat hoofdgerechten)', course: 'main' },
  { label: 'Inhoudsopgave 3 (geen sectienaam; bijgerechten, zie "kopje Bijgerechten" bij Nasi Goreng)', course: 'side-salad' },
  { label: 'Inhoudsopgave 4 (geen sectienaam; zoetigheden)', course: 'dessert' },
  { label: 'Inhoudsopgave 5 (geen sectienaam; brood, lunch en dips)', course: 'breakfast-lunch' },
];

/** Categorie wijkt af van de sectie in de bron (regels uit de importopdracht). */
const COURSE_OVERRIDES = {
  kimchi: ['preserves-dips', 'ingemaakt (regel: kimchi → preserves-dips)'],
  'surinaams-zuurgoed': ['preserves-dips', 'ingelegd (regel: zuurgoed → preserves-dips)'],
  'ingelegde-bloemkool-met-wortel': ['preserves-dips', 'ingelegd (regel: ingelegde bloemkool → preserves-dips)'],
  hummus: ['preserves-dips', 'dip (regel: hummus → preserves-dips)'],
  'artisjok-dip': ['preserves-dips', 'dip (regel: artisjokdip → preserves-dips)'],
};

/** Recepten die in geen enkele inhoudsopgave staan. */
const COURSE_FALLBACK = {
  'champignon-room-pasta': ['main', 'staat in geen inhoudsopgave; pastagerecht onder de lijst "Nog doen" (hoofdgerechten) → zelf gekozen, controleren'],
};

/** Tagwoorden uit de bron → sleutel in src/lib/taxonomy.ts. Labels uit nl.json worden ook herkend. */
const TAG_WORDS = {
  vega: ['diet', 'vegetarian'],
  vegan: ['diet', 'vegan'],
  kip: ['protein', 'chicken'],
  rund: ['protein', 'beef'],
  vis: ['protein', 'fish'],
  doordeweeks: ['occasion', 'weeknight'],
  weekend: ['occasion', 'weekend'],
  japans: ['country', 'JP'],
  koreaans: ['country', 'KR'],
  thais: ['country', 'TH'],
  indonesisch: ['country', 'ID'],
};

/** Foto's die volgens de bron niet van ons zijn. Alleen eigen foto's gaan online. */
const NOT_OWN_PHOTOS = {
  'images/image8.png': 'geen eigen foto (bij Katsu Curry staat "is niet onze eigen foto!")',
  'images/image9.png': 'geen eigen foto (bij Sambal Goreng Tempeh staat "niet onze eigen foto")',
};

/**
 * Typefouten, handmatig verzameld uit de bron. Alleen spelling: geen herformuleringen,
 * hoeveelheden, tijden, temperaturen of ingrediënten. Hoofdlettergevoelig, hele woorden.
 */
const CORRECTIONS = [
  ['in the tomaat', 'in de tomaat'],
  ['djionmosterd', 'dijonmosterd'],
  ['djion mosterd', 'dijonmosterd'],
  ['peterseliee', 'peterselie'],
  ['een klein laagjes olie een koekenpan', 'een klein laagje olie in een koekenpan'],
  ['mosterzaad', 'mosterdzaad'],
  ['Vervarm', 'Verwarm'],
  ['maar zorgt dat', 'maar zorg dat'],
  ['worchestershire', 'worcestershire'],
  ['madam-chanettepeper', 'madame-jeanettepeper'],
  ['onstaat', 'ontstaat'],
  ['accesoires', 'accessoires'],
  ['accesoire', 'accessoire'],
  ['minstents', 'minstens'],
  ['teentejs', 'teentjes'],
  ['gesnippert', 'gesnipperd'],
  ['avocados', "avocado's"],
  ['oesterwzwammen', 'oesterzwammen'],
  ['Ijsergsla', 'IJsbergsla'],
  ['Siracha', 'Sriracha'],
  ['siracha', 'sriracha'],
  ['Kimchii', 'Kimchi'],
  ['kimchii', 'kimchi'],
  ['Bechemel', 'Bechamel'],
  ['bechemel', 'bechamel'],
  ['lasgana', 'lasagna'],
  ['lasgna', 'lasagna'],
  ['to de schaal', 'tot de schaal'],
  ['een zet deze', 'en zet deze'],
  ['fussili', 'fusilli'],
  ['tenslotten', 'tenslotte'],
  ['ingedriënten', 'ingrediënten'],
  ['ingredienten', 'ingrediënten'],
  ['1 grote uit', '1 grote ui'],
  ['gebruikt tofu', 'gebruik tofu'],
  ['niet perse', 'niet per se'],
  ['hele dunnen ringen', 'hele dunne ringen'],
  ['verpakkingin', 'verpakking in'],
  ['rode uit goed', 'rode ui goed'],
  ['karameliseren', 'karamelliseren'],
  ['eetlepes', 'eetlepels'],
  ['in de over', 'in de oven'],
  ['blijk', 'blik'],
  ['kalamataoljiven', 'kalamataolijven'],
  ['korianpoeder', 'korianderpoeder'],
  ['pittge', 'pittige'],
  ['raviolis', "ravioli's"],
  ['airfyer', 'airfryer'],
  ['pindas', "pinda's"],
  ['hardgekoookt', 'hardgekookt'],
  ['op smak', 'op smaak'],
  ['gemende peper', 'gemengde peper'],
  ['macademianoten', 'macadamianoten'],
  ['sesamzaadjefs', 'sesamzaadjes'],
  ['vuur hog', 'vuur hoog'],
  ['in de ijskast de ijskast', 'in de ijskast'],
  ['laag voer', 'laag vuur'],
  ['met mosters', 'met mosterd'],
  ['diagnonale', 'diagonale'],
  ['Daar vervolgens de komkommer om', 'Draai vervolgens de komkommer om'],
  ['pistache note', 'pistachenoten'],
  ['cripsy', 'crispy'],
  ['roei totdat', 'roer totdat'],
  ['gefrituurde stukje aubergine', 'gefrituurde stukjes aubergine'],
  ['gerapste', 'geraspte'],
  ['theelepelsl', 'theelepels'],
  ['shoaxing', 'shaoxing'],
  ['doceren', 'doseren'],
  ['mensel', 'mengsel'],
  ['Indonenische', 'Indonesische'],
  ['sijd doormiddel', 'snijd doormidden'],
  ['HIerna', 'Hierna'],
  ['in stukje gesneden', 'in stukjes gesneden'],
  ['flees', 'vlees'],
  ['baken even', 'bak even'],
  ['kardamom', 'kardemom'],
  ['geruimte tijd', 'geruime tijd'],
  ['poedersuiker en doorheen', 'poedersuiker erdoorheen'],
  ['to en mix', 'toe en mix'],
  ['burata', 'burrata'],
  ['koelkoest', 'koelkast'],
  ['bacterien', 'bacteriën'],
  ['kamertemparatuur', 'kamertemperatuur'],
  ['voedt de starter', 'voed de starter'],
  ['theeelepel', 'theelepel'],
  ['Ijsklontjes', 'IJsklontjes'],
  ['ontrokken', 'onttrokken'],
  ['tzatiki', 'tzatziki'],
];

/** Mogelijke fouten die bewust NIET zijn aangepast (twijfel of inhoud), uit handmatige controle. */
const MANUAL_DOUBTS = {
  'traditionele-misosoep': [
    'Stap 3 "Laat het water koken, zet dan het vuur." – er lijkt een woord te missen (uit? laag?).',
    'Stap 5: haakje "(het liefst met een zeef …" wordt niet gesloten.',
  ],
  'steak-tartaar-met-oesters': ['Stap 6 noemt "dille-olie", maar het recept maakt bieslook-olie.'],
  'tiradito-met-leche-de-tigre-van-aji-amarillo': [
    'Ingrediënt "100 g rode ui, in fijn gesneden" – overbodig "in"?',
  ],
  'aubergineknoedels-alla-parmigiana': [
    'Stap 1 "tot de lichtbruin en droog is" – waarschijnlijk "tot het".',
    'Ingrediënt "1,5 blik van 40 gram gepelde romatomaten … (600 gram)" – 40 gram lijkt 400 gram te moeten zijn.',
    'Ingrediënt "(liefst zuurdesem (dat zijn 2-3 sneden)" – haakje niet gesloten.',
    'Het recept stopt halverwege stap 3 ("… laat in de koelkast"); de rest ontbreekt in de bron.',
  ],
  'soto-ayam-indonesische-kippensoep': ['Stap 1 "Snijd de sjalotten grof fijn, de sjalotten doormidden." – één van beide is waarschijnlijk knoflook.'],
  'tamago-japans-ei': [
    'Ingrediënten "sugar" en "salt" staan in het Engels.',
    'Stap 1 "in een maatbeker een tutje" – bedoeld is waarschijnlijk "met een tuitje".',
  ],
  'dakdoritang-koreaanse-kipstoof': ['Ingrediënt "1,5 sojasaus" heeft geen eenheid (eetlepel?).'],
  'vega-roti': ['Stap 3 en 6 gebruiken eieren, maar die staan niet bij de ingrediënten.'],
  'ragu-bianco': ['Ingrediënten noemen pecorino, stap 4 "geraspte parmezaan".'],
  'nasi-goreng-met-tempeh': ['Ingrediënt "pakje tom yum …": haakje/zin na de link niet afgesloten.'],
  pizzabroodje: ['Stap 4 eindigt met "Bak" – de rest van de zin ontbreekt in de bron.', 'Stap 4 "rol het uit geleidelijk uit" – dubbel "uit".'],
  'zuurdesem-brood': [
    'Het recept stopt na "Dag 2" van het brood; de rest (rijzen, bakken) ontbreekt in de bron.',
    'Benodigdheden eindigen met "deegschraper en deeg" – woord onvolledig.',
  ],
  'tom-kha-gai': ['Tags bevatten zowel "Kip" als "Vega"; beide overgenomen.'],
  'champignon-room-pasta': ['Geen stappen in de bron (lege lijst).'],
};

const GENERAL_NOT_CHANGED = [
  'Losgeschreven samenstellingen (bijv. "soja saus", "bos ui", "sesam olie", "burger broodjes") zijn niet aaneengeschreven.',
  'Spellingsvarianten die allebei voorkomen zijn niet gelijkgetrokken: haloumi/halloumi, sumak/sumac, boemboe/bomboe/bumbu, trassi/trassie, soja/soya, tauge/taugé, mayonaise.',
  'Engelse woorden in de tekst (crispy, stir-fry, bite-size, ready, chill, go crazy) en spreektaal zijn niet vertaald of aangepast.',
  'Grammatica die geen typefout is (bijv. "het bloem", "het pasta") is niet aangepast.',
  'Ontbrekende sluithaakjes zijn niet aangevuld.',
];

// ─── Hulpfuncties ────────────────────────────────────────────────────────────

const normalize = (text) =>
  text
    .replace(/[​-‍﻿]/g, '')
    .replace(/ /g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const slugify = (text) =>
  text
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

const escapeRegExp = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const correctionPatterns = CORRECTIONS.map(([from, to]) => ({
  from,
  to,
  regex: new RegExp(`(?<!\\p{L})${escapeRegExp(from)}(?!\\p{L})`, 'gu'),
}));

const corrections = []; // { slug, field, from, to, context }

/** Applies the typo list to one piece of text and logs every replacement (unless `slug` is undefined). */
function fix(text, slug, field) {
  let result = text;
  for (const { from, to, regex } of correctionPatterns) {
    result = result.replace(regex, (match, offset, whole) => {
      if (slug === undefined) return to;
      const start = Math.max(0, offset - 25);
      const end = Math.min(whole.length, offset + match.length + 25);
      corrections.push({
        slug,
        field,
        from,
        to,
        context: `${start > 0 ? '…' : ''}${whole.slice(start, end)}${end < whole.length ? '…' : ''}`,
      });
      return to;
    });
  }
  return result;
}

const formatBytes = (bytes) =>
  bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.round(bytes / 1024)} kB`;

const md = (text) => String(text).replace(/\|/g, '\\|');

// ─── Bron inlezen ────────────────────────────────────────────────────────────

const $ = load(readFileSync(SOURCE_HTML, 'utf8'));
/** Every block element of the body, with list items flattened. */
const nodes = [];
const nodeById = new Map();

$('body')
  .children()
  .each((_, el) => {
    const add = ($el, extra) => {
      const node = {
        index: nodes.length,
        tag: el.tagName,
        text: normalize($el.text()),
        images: $el.find('img').map((_, img) => $(img).attr('src')).get(),
        links: $el.find('a[href^="#"]').map((_, a) => ({ id: $(a).attr('href').slice(1), text: normalize($(a).text()) })).get(),
        status: undefined,
        ...extra,
      };
      for (const id of [$el.attr('id'), ...$el.find('[id]').map((_, x) => $(x).attr('id')).get()]) {
        if (id) nodeById.set(id, node);
      }
      nodes.push(node);
    };
    if (el.tagName === 'ul' || el.tagName === 'ol') {
      $(el)
        .children('li')
        .each((_, li) => add($(li), { tag: 'li', list: el.tagName }));
    } else {
      add($(el), {});
    }
  });

// Inhoudsopgaven
const TOC_START = /^(Voorgerechten|Inhoudsopgave)$/;
const TOC_ENTRY = /^(.*\S)\s+\d+$/;
const tocs = [];
for (const node of nodes) {
  if (node.tag !== 'p' || !TOC_START.test(node.text)) continue;
  const toc = { start: node.index, heading: node.text, titles: [], lines: [node.text] };
  node.status = 'toc';
  for (let i = node.index + 1; nodes[i]?.tag === 'p' && TOC_ENTRY.test(nodes[i].text); i++) {
    toc.titles.push(nodes[i].text.match(TOC_ENTRY)[1]);
    toc.lines.push(nodes[i].text);
    nodes[i].status = 'toc';
  }
  tocs.push(toc);
}
if (tocs.length !== TOC_SECTIONS.length) throw new Error(`Verwacht ${TOC_SECTIONS.length} inhoudsopgaven, gevonden: ${tocs.length}`);
const tocByTitle = new Map();
tocs.forEach((toc, i) => toc.titles.forEach((title) => tocByTitle.set(title.toLowerCase(), i)));

// Blokken: elke <h1> tot de volgende <h1> of inhoudsopgave
const boundaries = nodes.filter((n) => n.tag === 'h1' || tocs.some((t) => t.start === n.index)).map((n) => n.index);
const blocks = [];
for (const [k, start] of boundaries.entries()) {
  const head = nodes[start];
  if (head.tag !== 'h1') continue;
  const end = boundaries[k + 1] ?? nodes.length;
  blocks.push({ head, nodes: nodes.slice(start, end) });
}

// ─── Recepten ontleden ───────────────────────────────────────────────────────

function isGroupHeader(node) {
  if (node.tag === 'li') return /^[^\d:]{1,30}:$/.test(node.text) || /^optioneel$/i.test(node.text);
  return node.text.length <= 40 && !/\d/.test(node.text) && !/\.$/.test(node.text);
}

/** Splits a block into the fields of the old document format. Marks every node it uses. */
function parseBlock(block) {
  const raw = {
    title: block.head.text,
    tags: '',
    equipment: '',
    servings: undefined,
    servingsHeader: undefined,
    groups: [{ group: undefined, items: [] }],
    body: [],
    note: [],
    images: [...block.head.images],
    loose: [],
    moved: [],
    links: [...block.head.links],
  };
  let state = 'head';
  let ended = false;
  for (const node of block.nodes.slice(1)) {
    raw.images.push(...node.images);
    raw.links.push(...node.links);
    const text = node.text;
    if (node.tag === 'hr') {
      if (state === 'steps' || state === 'note') ended = true;
      node.status = 'hr';
      continue;
    }
    if (!text) {
      node.status = node.images.length ? 'image' : 'empty';
      continue;
    }
    if (ended) {
      node.status = 'loose';
      raw.loose.push(node);
      continue;
    }
    node.status = 'recipe';
    let match;
    if ((match = text.match(/^Tags:\s*(.*)$/i))) {
      raw.tags = match[1];
      state = 'tags';
    } else if ((match = text.match(/^Benodigdheden:\s*(.*)$/i))) {
      raw.equipment = match[1];
      state = 'equipment';
    } else if ((match = text.match(/^Ingr[eë]di[eë]nten\b\s*(.*)$/i))) {
      raw.servings = match[1];
      raw.servingsHeader = text;
      state = 'ingredients';
    } else if (/^Stappen:?$/i.test(text)) {
      state = 'steps';
    } else if ((match = text.match(/^Opmerking:?\s*(.*)$/i))) {
      if (match[1]) raw.note.push(match[1]);
      state = 'note';
    } else if (state === 'ingredients') {
      if (isGroupHeader(node)) {
        const name = text.replace(/:$/, '');
        const current = raw.groups.at(-1);
        if (current.items.length === 0 && !current.group) current.group = name;
        else raw.groups.push({ group: name, items: [] });
      } else if (node.tag === 'li') {
        raw.groups.at(-1).items.push(text);
      } else {
        raw.note.push(text);
        raw.moved.push({ text, to: 'opmerking (stond tussen de ingrediënten)' });
      }
    } else if (state === 'steps') {
      if (node.tag === 'li' && node.list === 'ol') {
        raw.body.push({ type: 'step', text });
      } else {
        raw.body.push({ type: 'paragraph', text });
        raw.moved.push({ text, to: 'bereiding (losse alinea tussen/na de stappen)' });
      }
    } else if (state === 'note') {
      raw.note.push(text);
    } else {
      raw.note.unshift(text);
      raw.moved.push({ text, to: 'opmerking (stond boven de ingrediënten)' });
    }
  }
  return raw;
}

// Porties
const SERVING_UNITS = [
  [/^(personen|persoon|mensen)$/, 'persons'],
  [/^(porties|portie)$/, 'portions'],
  [/^(stuks|stuk|stukjes|koekjes|broodjes|pannenkoeken)$/, 'pieces'],
  [/^kommen$/, 'bowls'],
  [/^(wekpotten|potten)$/, 'jars'],
  [/^broden$/, 'loaves'],
  [/^bollen$/, 'scoops'],
  [/^stokjes$/, 'skewers'],
];

function parseServings(rawText) {
  if (rawText === undefined) return { todo: 'geen ingrediëntenkop in de bron' };
  const text = rawText.replace(/[():]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!text) return { todo: 'geen porties in de bron' };
  if (/\d+\s*(-|–|tot)\s*\d+/.test(text)) return { todo: `bereik in de bron ("${text}"), niet zelf gekozen` };
  const found = [];
  for (const m of text.matchAll(/(\d+)\s+(?:kleine\s+)?(\p{L}+)/gu)) {
    const unit = SERVING_UNITS.find(([re]) => re.test(m[2].toLowerCase()))?.[1];
    if (unit) found.push({ amount: Number(m[1]), unit, match: m[0] });
  }
  if (found.length !== 1) return { todo: `porties niet eenduidig ("${text}")` };
  const [{ amount, unit, match }] = found;
  const rest = text.replace(match, '').replace(/^voor\b/i, '').replace(/[,\s]+/g, ' ').trim();
  return { servings: { amount, unit }, extra: rest || undefined };
}

// Ingrediënten
const UNITS = new Set(['g', 'gr', 'gram', 'kg', 'mg', 'ml', 'cl', 'dl', 'l', 'L', 'liter', 'el', 'tl', 'eetlepel', 'eetlepels', 'theelepel', 'theelepels', 'cm', 'kopje', 'kopjes']);
const FRACTIONS = { '½': '1/2', '¼': '1/4', '¾': '3/4', '⅓': '1/3', '⅔': '2/3', '⅛': '1/8' };
const AMOUNT = /^(\d+\s+\d+\/\d+|\d+\/\d+|\d+(?:[.,]\d+)?(?:\s*[½¼¾⅓⅔⅛])?|[½¼¾⅓⅔⅛])(?=\s|\p{L}|$)/u;
const NUMBER_WORDS = /^(een|één|twee|drie|vier|vijf|zes|zeven|acht|negen|tien|paar|half|halve|aantal)\b/i;
const UNIT_WITHOUT_NUMBER = /^(eetlepel|theelepel)\b/i;

/** Number for decimals, "1/2"-style string for fractions (the schema accepts both). */
function toAmount(text) {
  const t = text.replace(/\s+/g, ' ').trim();
  const fraction = t.match(/^(\d+)?\s*([½¼¾⅓⅔⅛])$/);
  if (fraction) return fraction[1] ? `${fraction[1]} ${FRACTIONS[fraction[2]]}` : FRACTIONS[fraction[2]];
  if (t.includes('/')) return t;
  return Number(t.replace(',', '.'));
}

const stripParens = (text) => {
  let previous;
  let result = text;
  do {
    previous = result;
    result = result.replace(/\([^()]*\)/g, '');
  } while (result !== previous);
  return result;
};

/** Splits "sjalot, gesnipperd" at the first comma outside parentheses. */
function splitNote(text) {
  let depth = 0;
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '(') depth++;
    else if (text[i] === ')') depth = Math.max(0, depth - 1);
    else if (text[i] === ',' && depth === 0) return [text.slice(0, i).trim(), text.slice(i + 1).trim()];
  }
  return [text.trim(), undefined];
}

function parseIngredient(text) {
  const doubt = (reason) => ({ item: { name: text }, doubt: reason });
  if (/^[±~]/.test(text) || /^\d+([.,]\d+)?\s*(-|–|tot\b|x\b)/i.test(text)) return doubt('bereik of geschatte hoeveelheid');
  if (NUMBER_WORDS.test(text)) return doubt('hoeveelheid in woorden');
  if (UNIT_WITHOUT_NUMBER.test(text)) return doubt('eenheid zonder getal');
  if (/per persoon/i.test(text)) return doubt('hoeveelheid per persoon (schaalt niet goed mee)');
  const match = text.match(AMOUNT);
  if (!match) {
    if (/^[^:]{1,25}:\s+\S/.test(text) && !/^optioneel:/i.test(text)) return doubt('samengestelde regel (meerdere ingrediënten)');
    if (/\d/.test(stripParens(text))) return doubt('hoeveelheid staat in de tekst (schaalt niet mee)');
    return { item: { name: text } };
  }
  let rest = text.slice(match[0].length).trim();
  let unit;
  const unitMatch = rest.match(/^(\p{L}+)(?=\s|$)/u);
  if (unitMatch && UNITS.has(unitMatch[1])) {
    unit = unitMatch[1];
    rest = rest.slice(unitMatch[0].length).trim();
  }
  const [name, note] = splitNote(rest);
  if (!name) return doubt('geen naam na de hoeveelheid');
  if ((note && /^\d/.test(note)) || /\d/.test(stripParens(name))) return doubt('meerdere hoeveelheden in één regel');
  return { item: { amount: toAmount(match[1]), ...(unit && { unit }), name, ...(note && { note }) } };
}

// Tags
const tagLookup = new Map(Object.entries(TAG_WORDS));
const nl = JSON.parse(readFileSync(join(ROOT, 'src', 'i18n', 'nl.json'), 'utf8'));
for (const [group, keys] of [['diet', diets], ['protein', proteins], ['occasion', occasions]]) {
  for (const key of keys) tagLookup.set(nl.tags[group][key].toLowerCase(), [group, key]);
}
const allowed = { diet: new Set(diets), protein: new Set(proteins), occasion: new Set(occasions) };
const regionNames = new Intl.DisplayNames(['en'], { type: 'region', fallback: 'none' });

function parseTags(rawText) {
  const words = rawText
    .split(/\s+/)
    .filter(Boolean)
    .flatMap((word) => word.split(/(?<=\p{Ll})(?=\p{Lu})/u));
  const tags = { diet: [], protein: [], occasion: [], country: [] };
  const unknown = [];
  for (const word of words) {
    const hit = tagLookup.get(word.toLowerCase());
    const valid = hit && (hit[0] === 'country' ? regionNames.of(hit[1]) !== undefined : allowed[hit[0]].has(hit[1]));
    if (!valid) unknown.push(word);
    else if (!tags[hit[0]].includes(hit[1])) tags[hit[0]].push(hit[1]);
  }
  for (const key of Object.keys(tags)) if (tags[key].length === 0) delete tags[key];
  return { tags, words, unknown };
}

function parseEquipment(text) {
  if (!text || text === '-') return [];
  const parts = [];
  for (const part of text.split(/,\s*/)) {
    if (parts.length && /^(maar|en|of)\b/.test(part)) parts[parts.length - 1] += `, ${part}`;
    else if (part) parts.push(part);
  }
  return parts;
}

// ─── Alles samenvoegen ───────────────────────────────────────────────────────

const recipes = [];
const skipped = [];
const slugCount = new Map();

for (const block of blocks) {
  const { head } = block;
  if (!head.text) {
    head.status = 'empty-h1';
    if (head.images.length) throw new Error(`Lege kop met afbeelding op positie ${head.index}`);
    continue;
  }
  if (head.text === 'Test') {
    for (const node of block.nodes) if (node.text || node.images.length) node.status = 'skipped';
    skipped.push({ block, reason: 'sjabloon "Test" (leeg formulier om recepten te kopiëren)' });
    continue;
  }
  head.status = 'recipe';
  const raw = parseBlock(block);
  const preliminarySlug = slugify(fix(raw.title));
  const occurrence = (slugCount.get(preliminarySlug) ?? 0) + 1;
  slugCount.set(preliminarySlug, occurrence);
  const slug = occurrence === 1 ? preliminarySlug : `${preliminarySlug}-v${occurrence}`;

  const title = fix(raw.title, slug, 'titel');
  const tocIndex = tocByTitle.get(raw.title.toLowerCase());
  let course;
  let courseReason;
  if (COURSE_OVERRIDES[preliminarySlug]) {
    [course, courseReason] = COURSE_OVERRIDES[preliminarySlug];
    courseReason = `bron: ${TOC_SECTIONS[tocIndex].label}; ${courseReason}`;
  } else if (tocIndex !== undefined) {
    const section = TOC_SECTIONS[tocIndex];
    course = section.course;
    courseReason = section.direct ? undefined : `afgeleid uit ${section.label}`;
    if (occurrence > 1) courseReason = `tweede versie staat niet in een inhoudsopgave; zelfde sectie als de eerste (${section.label})`;
  } else if (COURSE_FALLBACK[preliminarySlug]) {
    [course, courseReason] = COURSE_FALLBACK[preliminarySlug];
  } else {
    throw new Error(`Geen categorie voor "${raw.title}"`);
  }

  const { tags, words: tagWords, unknown: unknownTags } = parseTags(raw.tags);
  const servings = parseServings(raw.servings);
  const doubts = [];
  const groups = raw.groups
    .map((group) => ({
      ...(group.group && { group: fix(group.group, slug, 'ingrediëntgroep') }),
      items: group.items.map((text) => {
        const parsed = parseIngredient(fix(text, slug, 'ingrediënt'));
        if (parsed.doubt) doubts.push({ text: parsed.item.name, reason: parsed.doubt });
        return parsed.item;
      }),
    }))
    .filter((group) => group.items.length > 0);
  const emptyGroups = raw.groups.filter((g) => g.group && g.items.length === 0).map((g) => g.group);

  recipes.push({
    slug,
    occurrence,
    duplicate: occurrence > 1,
    baseSlug: preliminarySlug,
    title,
    rawTitle: raw.title,
    position: head.index,
    course,
    courseReason,
    servings,
    rawServings: raw.servings,
    servingsHeader: raw.servingsHeader,
    tags,
    tagWords,
    unknownTags,
    groups,
    emptyGroups,
    doubts,
    equipment: parseEquipment(fix(raw.equipment, slug, 'benodigdheden')),
    body: raw.body.map((b) => ({ ...b, text: fix(b.text, slug, b.type === 'step' ? 'stap' : 'bereiding') })),
    note: raw.note.map((t) => fix(t, slug, 'opmerking')).join('\n\n') || undefined,
    images: raw.images.filter((src) => !NOT_OWN_PHOTOS[src]),
    excludedImages: raw.images.filter((src) => NOT_OWN_PHOTOS[src]),
    loose: raw.loose,
    moved: raw.moved,
    links: raw.links
      .filter((l) => !l.id.startsWith('cmnt'))
      .map((l) => ({ text: l.text, target: nodeById.get(l.id)?.text ?? `#${l.id}` })),
    rawText: block.nodes.filter((n) => n.status === 'recipe').map((n) => n.text),
  });
}

// Alles wat niet in een recept, inhoudsopgave of overgeslagen blok zit
for (const node of nodes) {
  if (node.status === undefined && (node.text || node.images.length)) node.status = 'loose';
}
const unaccounted = nodes.filter((n) => (n.text || n.images.length) && !n.status);
if (unaccounted.length) throw new Error(`Niet verwerkte bronregels: ${unaccounted.map((n) => n.index).join(', ')}`);

// ─── Schrijven ───────────────────────────────────────────────────────────────

function frontmatter(recipe) {
  const data = { title: recipe.title, draft: true, course: recipe.course, date: IMPORT_DATE };
  if (recipe.servings.servings) data.servings = recipe.servings.servings;
  data.ingredients = recipe.groups;
  if (recipe.equipment.length) data.equipment = recipe.equipment;
  if (recipe.note) data.note = recipe.note;
  if (recipe.images.length) {
    data.image = './foto.jpg';
    data.imageAlt = recipe.title;
  }
  if (Object.keys(recipe.tags).length) data.tags = recipe.tags;

  const comments = ['Geïmporteerd uit Kookboek/Kookboek.html door scripts/import-kookboek.mjs. Concept: nog controleren.'];
  comments.push(`Ingrediëntenkop in de bron: ${recipe.servingsHeader === undefined ? '(geen)' : JSON.stringify(recipe.servingsHeader)}`);
  if (recipe.servings.todo) comments.push(`TODO: servings ontbreekt (${recipe.servings.todo}). Vul aan als { amount, unit }.`);
  if (recipe.excludedImages.length) comments.push('TODO: geen eigen foto (de foto in de bron is niet van ons).');
  else if (!recipe.images.length) comments.push('TODO: geen foto in de bron.');
  if (recipe.images.length > 1) comments.push(`Extra foto('s) uit de bron in deze map: ${recipe.images.slice(1).map((_, i) => `foto-${i + 2}.jpg`).join(', ')}`);
  if (recipe.groups.length === 0) comments.push('TODO: geen ingrediënten in de bron.');

  const yaml = YAML.stringify(data, { lineWidth: 0 });
  return `---\n${comments.map((c) => `# ${c}`).join('\n')}\n${yaml}---\n`;
}

function body(recipe) {
  if (recipe.body.length === 0) return '<!-- TODO: geen stappen in de bron. -->\n';
  const chunks = [];
  let list = [];
  const flush = () => {
    if (list.length) chunks.push(list.map((text, i) => `${i + 1}. ${text}`).join('\n'));
    list = [];
  };
  for (const part of recipe.body) {
    if (part.type === 'step') {
      list.push(part.text);
    } else {
      flush();
      chunks.push(part.text.length <= 40 && part.text.endsWith(':') ? `**${part.text}**` : part.text);
    }
  }
  flush();
  return `${chunks.join('\n\n')}\n`;
}

const processedImages = new Map();
async function processImage(source) {
  if (!processedImages.has(source)) {
    const buffer = await sharp(join(SOURCE_DIR, source))
      .rotate() // apply EXIF orientation before the metadata is dropped
      .resize({ width: PHOTO.maxWidth, withoutEnlargement: true })
      .flatten({ background: '#ffffff' })
      .jpeg({ quality: PHOTO.quality, mozjpeg: true })
      .toBuffer(); // sharp writes no metadata unless asked to
    processedImages.set(source, buffer);
  }
  return processedImages.get(source);
}

/** Second versions of duplicate titles are only used for the diff in the report. */
const imported = recipes.filter((r) => !r.duplicate);
const selected = ONLY ? imported.filter((r) => r.slug === ONLY) : imported;
if (ONLY && selected.length === 0) throw new Error(`Onbekende slug "${ONLY}". Bekend: ${imported.map((r) => r.slug).join(', ')}`);

for (const recipe of selected) {
  const dir = join(RECIPES_DIR, recipe.slug);
  mkdirSync(dir, { recursive: true });
  for (const name of readdirSync(dir)) if (/^foto(-\d+)?\.jpg$/.test(name)) rmSync(join(dir, name));
  writeFileSync(join(dir, 'nl.md'), `${frontmatter(recipe)}\n${body(recipe)}`);
  for (const [i, source] of recipe.images.entries()) {
    writeFileSync(join(dir, i === 0 ? 'foto.jpg' : `foto-${i + 1}.jpg`), await processImage(source));
  }
  console.log(`✓ ${recipe.slug}${recipe.images.length ? '' : ' (geen foto)'}`);
}

if (ONLY) {
  console.log('Alleen dit recept bijgewerkt; IMPORT-RAPPORT.md is niet opnieuw geschreven.');
  process.exit(0);
}

// ─── Controles ───────────────────────────────────────────────────────────────

/** True when the JPEG still has EXIF/XMP/IPTC metadata, checked with sharp and on the raw bytes. */
async function metadataProblems(file) {
  const bytes = readFileSync(file);
  const meta = await sharp(bytes).metadata();
  const problems = [];
  if (meta.exif) problems.push('EXIF');
  if (meta.xmp) problems.push('XMP');
  if (meta.iptc) problems.push('IPTC');
  for (let i = 2; i < bytes.length - 3 && bytes[i] === 0xff; ) {
    const marker = bytes[i + 1];
    if (marker === 0xda) break; // start of image data
    if (marker === 0xe1 && !problems.includes('APP1')) problems.push('APP1 (EXIF/XMP-blok)');
    i += 2 + bytes.readUInt16BE(i + 2);
  }
  if (bytes.includes(Buffer.from('GPS'))) problems.push('tekst "GPS" gevonden');
  return problems;
}

const jpegs = [];
const walk = (dir) => {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full);
    else if (/\.jpe?g$/i.test(name)) jpegs.push(full);
  }
};
walk(RECIPES_DIR);
const metadataResults = [];
for (const file of jpegs) metadataResults.push({ file: relative(ROOT, file).replaceAll('\\', '/'), problems: await metadataProblems(file) });

const sourceImages = [];
for (const name of readdirSync(join(SOURCE_DIR, 'images')).sort((a, b) => a.localeCompare(b, 'en', { numeric: true }))) {
  const file = join(SOURCE_DIR, 'images', name);
  const meta = await sharp(file).metadata();
  const usedBy = imported.filter((r) => r.images.includes(`images/${name}`));
  sourceImages.push({ name, size: statSync(file).size, width: meta.width, height: meta.height, exif: Boolean(meta.exif), usedBy });
}
const referencedMissing = [...new Set(imported.flatMap((r) => r.images))].filter((src) => !existsSync(join(SOURCE_DIR, src)));

function checkDist() {
  if (!existsSync(DIST)) return undefined;
  const drafts = imported.map((r) => r.slug);
  const hits = [];
  for (const slug of drafts) {
    for (const lang of ['nl', 'en']) {
      if (existsSync(join(DIST, lang, 'recipes', slug))) hits.push(`map dist/${lang}/recipes/${slug}/`);
    }
  }
  const files = [];
  const collect = (dir) => {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      if (statSync(full).isDirectory()) collect(full);
      else if (/\.(html|xml|txt|json|js)$/.test(name)) files.push(full);
    }
  };
  collect(DIST);
  for (const file of files) {
    const text = readFileSync(file, 'utf8');
    for (const slug of drafts) {
      if (text.includes(`/recipes/${slug}/`)) hits.push(`${relative(ROOT, file).replaceAll('\\', '/')} verwijst naar ${slug}`);
    }
  }
  return { builtAt: statSync(DIST).mtime, files: files.length, hits };
}
const dist = checkDist();

// ─── Rapport ─────────────────────────────────────────────────────────────────

function lcsDiff(a, b) {
  const dp = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0));
  for (let i = a.length - 1; i >= 0; i--)
    for (let j = b.length - 1; j >= 0; j--) dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const out = [];
  let i = 0;
  let j = 0;
  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && a[i] === b[j]) {
      i++;
      j++;
    } else if (j >= b.length || (i < a.length && dp[i + 1][j] >= dp[i][j + 1])) out.push(`- ${a[i++]}`);
    else out.push(`+ ${b[j++]}`);
  }
  return out;
}

const describeRecipe = (r) => [...r.rawText, ...r.images.map((src) => `[afbeelding ${src}]`)];
const sizeOf = (r) => (r.servings.servings ? `${r.servings.servings.amount} ${r.servings.servings.unit}` : 'TODO');

const headings = nodes.filter((n) => n.tag === 'h1');
const emptyHeadings = headings.filter((n) => !n.text);
const duplicates = recipes.filter((r) => r.duplicate);
const loose = nodes.filter((n) => n.status === 'loose' && n.text);
const looseImages = nodes.filter((n) => n.status === 'loose' && n.images.length);
const out = [];
const line = (text = '') => out.push(text);

line('# Importrapport Kookboek');
line();
line(`Gegenereerd door \`scripts/import-kookboek.mjs\` op ${new Date().toISOString().slice(0, 16).replace('T', ' ')} (UTC). Bron: \`Kookboek/Kookboek.html\` en \`Kookboek/images/\`.`);
line('Alle geïmporteerde recepten staan op `draft: true`: zichtbaar in `npm run dev`, niet op de live site.');
line();
line('## Tellingen');
line();
line('| | Aantal |');
line('|---|---|');
line(`| Koppen (\`<h1>\`) in de bron | ${headings.length} |`);
line(`| – waarvan leeg | ${emptyHeadings.length} |`);
line(`| – waarvan met titel | ${headings.length - emptyHeadings.length} |`);
line(`| Geïmporteerd als recept | ${imported.length} |`);
line(`| Overgeslagen: sjabloon | ${skipped.length} |`);
line(`| Overgeslagen: tweede versie van een dubbele titel | ${duplicates.length} |`);
line(`| Afbeeldingen in images/ | ${sourceImages.length} |`);
line(`| – gebruikt | ${sourceImages.filter((i) => i.usedBy.length).length} |`);
line(`| Recepten zonder foto | ${imported.filter((r) => !r.images.length).length} |`);
line(`| Typefout-correcties | ${corrections.filter((c) => imported.some((r) => r.slug === c.slug)).length} |`);
line(`| Niet-verwerkte bronregels (moet 0 zijn) | ${unaccounted.length} |`);
line();
line('Controle: elke niet-lege regel en elke afbeelding uit de bron is ingedeeld als recept, inhoudsopgave, overgeslagen sjabloon of "losse tekst" (hieronder letterlijk). Het script stopt met een fout als er iets overblijft.');
line();

line('## Receptblokken in de bron');
line();
line('| # | Titel in de bron | Resultaat | Categorie | Porties | Foto |');
line('|---|---|---|---|---|---|');
let n = 0;
for (const node of headings) {
  n++;
  if (!node.text) {
    line(`| ${n} | *(lege kop)* | overgeslagen: lege \`<h1>\` | | | |`);
    continue;
  }
  const recipe = recipes.find((r) => r.position === node.index);
  if (!recipe) {
    const skip = skipped.find((s) => s.block.head === node);
    line(`| ${n} | ${md(node.text)} | overgeslagen: ${skip.reason} | | | |`);
    continue;
  }
  if (recipe.duplicate) {
    line(`| ${n} | ${md(node.text)} | overgeslagen: dubbele titel, eerste versie behouden (\`${recipe.baseSlug}\`) | | | |`);
    continue;
  }
  line(`| ${n} | ${md(node.text)} | \`src/content/recepten/${recipe.slug}/\` | ${recipe.course}${recipe.courseReason ? ' *' : ''} | ${sizeOf(recipe)} | ${recipe.images.length ? recipe.images.map((s) => s.replace('images/', '')).join(', ') : '–'} |`);
}
line();
line('\\* categorie niet rechtstreeks uit een benoemde bronsectie; zie "Categorieën".');
line();

line('## Afbeeldingen');
line();
line('| Bestand | Grootte | Afmetingen | EXIF in bron | Gebruikt bij |');
line('|---|---|---|---|---|');
for (const img of sourceImages) {
  const used = img.usedBy.length
    ? img.usedBy.map((r) => `${r.slug} (${r.images.indexOf(`images/${img.name}`) === 0 ? 'foto.jpg' : `foto-${r.images.indexOf(`images/${img.name}`) + 1}.jpg`})`).join(', ')
    : `niet gebruikt: ${NOT_OWN_PHOTOS[`images/${img.name}`] ?? 'staat bij geen enkel recept in de bron'}`;
  line(`| ${img.name} | ${formatBytes(img.size)} | ${img.width}×${img.height} | ${img.exif ? 'ja' : 'nee'} | ${used} |`);
}
line();
if (referencedMissing.length) line(`**Let op:** in de HTML genoemd maar niet gevonden in images/: ${referencedMissing.join(', ')}`);
if (looseImages.length) line(`**Let op:** afbeeldingen buiten een recept: ${looseImages.flatMap((n) => n.images).join(', ')}`);
line(`Verwerking: verkleind tot max. ${PHOTO.maxWidth} px breed (niet vergroot), JPEG kwaliteit ${PHOTO.quality}, oriëntatie toegepast, transparantie op wit, alle metadata verwijderd.`);
line();
line("Recepten met meer dan één afbeelding (eerste = foto.jpg, de rest staat als foto-2.jpg enz. in dezelfde map en wordt nog niet getoond):");
line();
for (const r of imported.filter((r) => r.images.length > 1)) line(`- ${r.slug}: ${r.images.join(', ')}`);
line();

line('## Tekst uit de bron die niet in een recept staat');
line();
line('Letterlijk overgenomen, in de volgorde van de bron.');
line();
line('### Losse tekst');
line();
let previousTitle;
for (const node of loose) {
  const before = [...headings].reverse().find((h) => h.index < node.index && h.text)?.text ?? '(begin van het document)';
  if (before !== previousTitle) {
    line();
    line(`Na "${before}":`);
    line();
    previousTitle = before;
  }
  line(`> ${node.tag === 'li' ? '- ' : ''}${node.text}`);
  line('>');
}
line();
line('### Inhoudsopgaven (bewust niet geïmporteerd)');
line();
tocs.forEach((toc, i) => {
  line(`${i + 1}. ${TOC_SECTIONS[i].label} → ${TOC_SECTIONS[i].course}`);
  line();
  line('   ```');
  for (const l of toc.lines) line(`   ${l}`);
  line('   ```');
});
line();
line('### Overgeslagen blokken');
line();
for (const s of skipped) {
  line(`"${s.block.head.text}" (${s.reason}):`);
  line();
  line('```');
  for (const node of s.block.nodes.filter((n) => n.text)) line(node.text);
  line('```');
}
line();
line(`Daarnaast ${emptyHeadings.length} lege koppen zonder tekst.`);
line();
line('### Tekst die binnen een recept naar een ander veld is verplaatst');
line();
line('Niet verloren, maar staat niet op de "normale" plek. Graag controleren.');
line();
for (const r of recipes) for (const m of r.moved) line(`- **${r.slug}** → ${m.to}: "${m.text}"`);
line();
line('### Interne links in de bron (linktekst overgenomen, de link zelf niet)');
line();
const recipesWithLinks = imported.filter((r) => r.links.length);
if (!recipesWithLinks.length) line('Geen.');
for (const r of recipesWithLinks) for (const l of r.links) line(`- **${r.slug}**: "${l.text}" verwees naar "${l.target}"`);
line();

line('## Dubbele titels');
line();
line('Alleen de eerste versie is geïmporteerd. Hieronder de verschillen met de tweede versie (- eerste, + tweede), zodat er niets ongemerkt verdwijnt.');
line();
for (const v2 of duplicates) {
  const v1 = recipes.find((r) => r.slug === v2.baseSlug);
  const diff = lcsDiff(describeRecipe(v1), describeRecipe(v2));
  line(`### ${v1.title}`);
  line();
  line(`Geïmporteerd: \`${v1.slug}\` (positie ${v1.position}); overgeslagen: tweede versie op positie ${v2.position}.`);
  line();
  if (!diff.length) line('Inhoud identiek.');
  else {
    line('```diff');
    for (const d of diff) line(d);
    line('```');
  }
  line();
}

line('## Recepten zonder foto');
line();
for (const r of imported.filter((r) => !r.images.length)) line(`- ${r.slug}`);
line();
line('Waarvan zonder foto omdat de foto in de bron niet van jullie is: ' + imported.filter((r) => r.excludedImages.length).map((r) => `${r.slug} (${r.excludedImages.join(', ')})`).join(', ') + '.');
line();

line('## Tags');
line();
line('Niet herkende tagwoorden zijn weggelaten (besluit: deze tags vallen af).');
line();
line('| Recept | Tags in de bron | Overgenomen | Niet herkend |');
line('|---|---|---|---|');
for (const r of imported.filter((r) => r.tagWords.length)) {
  const taken = Object.entries(r.tags).map(([g, v]) => `${g}: ${v.join(', ')}`).join('; ');
  line(`| ${r.slug} | ${md(r.tagWords.join(' '))} | ${taken || '–'} | ${r.unknownTags.join(', ') || '–'} |`);
}
const unknownWords = [...new Set(imported.flatMap((r) => r.unknownTags))];
line();
line(`Alle niet-herkende woorden: ${unknownWords.join(', ') || 'geen'}.`);
line(`Recepten zonder tags in de bron: ${imported.filter((r) => !r.tagWords.length).length}.`);
line();

line('## Niet-gestructureerde ingrediënten');
line();
line('Volledige originele tekst staat in `name`, zonder `amount`. Er zijn geen hoeveelheden verzonnen.');
line();
for (const r of imported.filter((r) => r.doubts.length)) {
  line(`**${r.slug}**`);
  for (const d of r.doubts) line(`- "${d.text}" – ${d.reason}`);
  line();
}
const emptyGroupRecipes = imported.filter((r) => r.emptyGroups.length);
if (emptyGroupRecipes.length) {
  line('Groepskoppen zonder ingrediënten (weggelaten):');
  for (const r of emptyGroupRecipes) line(`- ${r.slug}: ${r.emptyGroups.join(', ')}`);
  line();
}

line('## Porties');
line();
line('Ontbrekend of niet eenduidig (servings leeg gelaten, TODO in de frontmatter):');
line();
for (const r of imported.filter((r) => r.servings.todo)) line(`- ${r.slug}: ${r.servings.todo}`);
line();
line('Overgenomen met extra informatie uit de kop (originele kop staat als commentaar in de frontmatter):');
line();
for (const r of imported.filter((r) => r.servings.extra)) line(`- ${r.slug}: ${sizeOf(r)} – bron: "${r.servingsHeader}"`);
line();

line('## Categorieën');
line();
line('Alleen de eerste inhoudsopgave heeft een sectienaam ("Voorgerechten"). De andere heten alleen "Inhoudsopgave"; hun categorie is afgeleid uit de inhoud. Alle categorieën die niet rechtstreeks uit "Voorgerechten" komen:');
line();
line('| Recept | Categorie | Waarom |');
line('|---|---|---|');
for (const r of imported.filter((r) => r.courseReason)) line(`| ${r.slug} | ${r.course} | ${md(r.courseReason)} |`);
line();

line('## Typefout-correcties');
line();
line('Formaat: origineel → verbeterd (veld, context in de bron).');
line();
for (const r of recipes) {
  const list = corrections.filter((c) => c.slug === r.slug);
  if (!list.length) continue;
  line(`**${r.slug}**`);
  for (const c of list) line(`- "${c.from}" → "${c.to}" (${c.field}: "${c.context}")`);
  line();
}
line('### Twijfelgevallen en mogelijke fouten (niet aangepast)');
line();
for (const [slug, items] of Object.entries(MANUAL_DOUBTS)) {
  if (!imported.some((r) => r.slug === slug)) throw new Error(`MANUAL_DOUBTS noemt onbekende slug ${slug}`);
  for (const item of items) line(`- **${slug}**: ${item}`);
}
line();
line('Algemeen niet aangepast:');
line();
for (const item of GENERAL_NOT_CHANGED) line(`- ${item}`);
line();

line('## Metadata-controle foto\'s (EXIF/GPS)');
line();
const dirty = metadataResults.filter((m) => m.problems.length);
line(`${metadataResults.length} JPEG-bestanden in \`src/content/recepten/\` gecontroleerd (met sharp en op APP1-blokken in de bytes).`);
line();
if (!dirty.length) line('Resultaat: **geen enkele foto bevat EXIF-, GPS-, XMP- of IPTC-gegevens.**');
for (const m of dirty) line(`- **${m.file}**: ${m.problems.join(', ')}`);
line();

line('## Concepten in de productiebuild');
line();
if (!dist) line('Nog geen `dist/` gevonden. Draai `npm run build` en daarna dit script opnieuw om de controle uit te voeren.');
else {
  line(`Gecontroleerd: \`dist/\` (gebouwd ${dist.builtAt.toISOString().slice(0, 16).replace('T', ' ')} UTC, ${dist.files} bestanden), op mappen en verwijzingen naar alle ${imported.length} concept-slugs.`);
  line();
  if (!dist.hits.length) line('Resultaat: **geen enkel concept-recept in de productiebuild** (geen pagina, geen link in overzichten/zoekfunctie, niet in de sitemap).');
  for (const hit of dist.hits) line(`- ${hit}`);
}
line();

writeFileSync(REPORT, `${out.join('\n')}\n`);
console.log(`\n${imported.length} recepten geïmporteerd, ${skipped.length} overgeslagen, ${duplicates.length} dubbel. Rapport: ${relative(ROOT, REPORT)}`);
if (dirty.length) {
  console.error(`LET OP: ${dirty.length} foto('s) met metadata.`);
  process.exitCode = 1;
}
