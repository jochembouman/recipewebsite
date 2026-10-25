# ja recipes

Onze tweetalige receptenwebsite (Nederlands en Engels). Gebouwd met [Astro](https://astro.build) als statische site en gehost op Vercel. Er is geen database en geen backend: elk recept is een Markdown-bestand in deze repository.

## Lokaal draaien

Je hebt [Node.js](https://nodejs.org) 22.23 of nieuwer nodig (aanbevolen: de LTS-versie, 24).

```sh
npm install      # eenmalig: installeert Astro
npm run dev      # start de site op http://localhost:4321 en ververst automatisch bij wijzigingen
npm run build    # bouwt de site naar de map dist/ (hetzelfde als Vercel doet)
npm run preview  # bekijk de gebouwde site uit dist/
```

Een fout in een recept (bijv. een onbekende tag of een vergeten veld) verschijnt in de terminal en in de browser, met de bestandsnaam en het veld dat niet klopt.

## Een recept toevoegen

1. Kopieer de map `src/content/_template/` naar `src/content/recepten/<slug>/`.
   De `<slug>` wordt het webadres, bijv. `pad-thai` → `/nl/recipes/pad-thai/`. Gebruik kleine letters en streepjes.
2. Vul `nl.md` in. Het sjabloon legt elk veld uit; de uitlegregels (beginnend met `#`) mogen weg.
3. Zet de foto in dezelfde map als `foto.jpg` (zie hieronder).
4. Optioneel: maak `en.md` voor de Engelse versie, met dezelfde velden. Zonder `en.md` toont de Engelse site de Nederlandse versie met een kleine melding.
5. Controleer met `npm run dev` of alles goed staat.

Een recept bestaat dus uit:

```
src/content/recepten/pad-thai/
├── nl.md
├── en.md        (optioneel)
└── foto.jpg
```

De twee recepten met **VOORBEELD** in de titel zijn testinhoud. Verwijder hun mappen zodra er echte recepten zijn.

### Concepten

Zet `draft: true` in de frontmatter om een recept als concept te bewaren. Een concept is zichtbaar in `npm run dev` (met een melding "Concept"), maar staat nergens op de live site: niet in de overzichten, de zoekfunctie, de sitemap en ook niet als losse pagina. Een concept mag nog onvolledig zijn (zonder foto, porties of ingrediënten); zodra je `draft` weghaalt, controleert de build of alles erin staat.

### Porties

`servings` heeft een getal en een eenheid, bijv. `{ amount: 30, unit: pieces }`. Mogelijke eenheden: `persons`, `portions`, `pieces`, `bowls`, `jars`, `loaves`, `scoops`, `skewers` (zie `src/lib/taxonomy.ts`). De portiekiezer toont dan bijv. "30 stuks" of "10 kommen".

## Recepten importeren uit het oude kookboek

`scripts/import-kookboek.mjs` zet de Google Docs-export in `Kookboek/` (staat in `.gitignore`) om naar conceptrecepten met `foto.jpg`, en schrijft een controlerapport naar `IMPORT-RAPPORT.md`. Het script is herhaalbaar, maar overschrijft dan de geïmporteerde mappen.

```sh
node scripts/import-kookboek.mjs                # alles + rapport
node scripts/import-kookboek.mjs --only kimchi  # één recept, zonder rapport
```

## Foto's klaarzetten

- Verklein de foto tot **ongeveer 1200 px breed** (liggend, bij voorkeur 3:2) en sla hem op als JPG. Op een Mac kan dat met Voorvertoning (Extra → Pas grootte aan), op Windows met Foto's of Paint (Formaat wijzigen).
- Astro maakt bij het bouwen automatisch kleinere varianten en WebP-versies, dus de originele foto hoeft niet extra gecomprimeerd te worden.
- Schrijf bij `imageAlt` in een zin wat er op de foto te zien is.

## Teksten, tags en vertalingen

- Alle vaste teksten van de site (menu, knoppen, labels, "Over ons") staan in `src/i18n/nl.json` en `src/i18n/en.json`.
- Tags en gangen hebben vaste sleutels (bijv. `vegetarian`) in `src/lib/taxonomy.ts`. Voeg je een sleutel toe, geef hem dan ook een label in beide vertaalbestanden.
- Landen gebruiken ISO-codes (`IT`, `JP`); de landnaam wordt automatisch in de juiste taal getoond.

## Vormgeving

- Alle kleuren, lettertypes, spacing, afrondingen en schaduwen staan als CSS-variabelen in `src/styles/tokens.css`. Het huidige matchagroene kleurenschema is een placeholder.
- Componenten in `src/components/` gebruiken alleen die variabelen. Componenten in `src/components/layout/` regelen alleen de positie (stapelen, rijen, rasters), niet het uiterlijk.
- Printweergave staat in `src/styles/print.css`. Een element met het attribuut `data-print-hidden` wordt niet geprint.

## Git-werkwijze

We werken nooit direct op `main`. Alles wat op `main` staat, gaat automatisch live.

1. Maak een nieuwe branch voor je wijziging:
   ```sh
   git checkout main
   git pull
   git checkout -b recept-pad-thai
   ```
2. Maak je wijzigingen, controleer ze met `npm run dev` en commit:
   ```sh
   git add .
   git commit -m "Recept pad thai toegevoegd"
   git push -u origin recept-pad-thai
   ```
3. Open op GitHub een **pull request** naar `main`.
4. Vercel bouwt automatisch een **preview** van de branch en zet de link in de pull request. Bekijk daar of alles goed staat, op je telefoon en op de computer.
5. Alles goed? Merge de pull request. Vercel zet de nieuwe versie dan binnen een minuut live.

## Vercel

- Framework preset: **Astro**. Build command `npm run build`, output directory `dist`. Vercel herkent dit meestal zelf.
- Stel de omgevingsvariabele `SITE_URL` in op het echte domein (bijv. `https://jarecipes.nl`). Die wordt gebruikt voor de sitemap, canonieke links en deelafbeeldingen. Zonder deze variabele wordt `https://ja-recipes.vercel.app` gebruikt.
- `vercel.json` stuurt `/` door naar `/nl/`.

## Mappen

```
src/
├── components/        losse onderdelen (kaarten, menu, sterren …)
│   └── layout/        alleen positie: Container, Stack, Cluster, Grid
├── content/
│   ├── recepten/      één map per recept
│   └── _template/     sjabloon voor een nieuw recept
├── content.config.ts  het receptschema (controle van de velden)
├── i18n/              vertalingen en taalhulpjes
├── layouts/           paginaraamwerk (head, header, footer)
├── lib/               receptlogica, hoeveelheden, vaste sleutels
├── pages/             de routes: /[lang]/…, 404, sitemap
└── styles/            tokens, basisstijlen, print
bron-google-docs/      originele recepten uit Google Docs (wordt niet gepubliceerd)
public/                bestanden die ongewijzigd online komen (favicon, standaard-deelafbeelding)
```
