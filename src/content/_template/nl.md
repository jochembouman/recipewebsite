---
# ─────────────────────────────────────────────────────────────────────────────
# RECEPTSJABLOON
# Kopieer deze map naar src/content/recepten/<slug>/ (bijv. "pad-thai").
# De mapnaam wordt de URL: /nl/recipes/pad-thai/ en /en/recipes/pad-thai/.
# Gebruik kleine letters, cijfers en streepjes. Gebruik dezelfde map voor beide talen:
#   nl.md   Nederlandse versie (aanbevolen)
#   en.md   Engelse versie (optioneel; zonder deze versie toont de Engelse site de Nederlandse)
#   foto.jpg   de foto, ca. 1200 px breed
# Regels die met # beginnen zijn uitleg en mogen weg.
# Deze map (_template) wordt zelf NIET op de site getoond.
# ─────────────────────────────────────────────────────────────────────────────

# Verplicht. De titel van het recept.
title: "Naam van het recept"

# Optioneel. Met draft: true is het recept een concept: zichtbaar in `npm run dev`,
# maar nergens op de live site (niet in overzichten, zoeken, sitemap of als pagina).
# Een concept mag nog onvolledig zijn (zonder foto, porties of ingrediënten).
draft: false

# Optioneel. Eén of twee zinnen; verschijnt onder de titel en in zoekmachines/deellinks.
description: "Korte omschrijving."

# Verplicht. Precies één van: starter | main | dessert | side-salad | preserves-dips | breakfast-lunch
course: main

# Verplicht. Datum van toevoegen (JJJJ-MM-DD). Bepaalt de volgorde bij "Laatste recepten".
date: 2026-01-31

# Verplicht. Voor hoeveel de hoeveelheden hieronder zijn.
#   amount  heel getal
#   unit    persons | portions | pieces | bowls | jars | loaves | scoops | skewers
#           (personen, porties, stuks, kommen, potten, broden, bolletjes, stokjes)
servings:
  amount: 4
  unit: persons

# Optioneel. Tijden in minuten.
prepTime: 15
cookTime: 30

# Verplicht. Ingrediënten, altijd in één of meer groepen.
# - "group" is de kop van de groep (bijv. "Saus", "Deeg"). Laat weg als je geen groepen nodig hebt.
# - "items" is de lijst ingrediënten. Per ingrediënt:
#     amount  getal: 200, 1.5, "1,5", "1/2" of "1 1/2". Laat weg bij "naar smaak".
#     unit    optioneel: g, kg, ml, l, el, tl, teen, stuk, bosje, snufje …
#             (bij g/kg/ml/l wordt decimaal afgerond, anders in breuken als ½ en ¼)
#     name    verplicht: wat het is
#     note    optioneel: toelichting, bijv. "fijngehakt" of "naar smaak"
ingredients:
  - group: Saus
    items:
      - amount: 400
        unit: g
        name: tomaten in blik
      - amount: 1/2
        unit: tl
        name: chilivlokken
        note: of meer, naar smaak
  - group: Voor erbij
    items:
      - name: verse basilicum
        note: naar smaak

# Optioneel. Benodigdheden; wordt alleen getoond als je iets invult.
equipment:
  - Ovenschaal
  - Staafmixer

# Optioneel. Een opmerking, tip of variatie.
note: "Lekker met een frisse salade."

# Verplicht. Bestandsnaam van de foto in dezelfde map, met ./ ervoor.
image: ./foto.jpg
# Verplicht. Beschrijf wat er op de foto staat, voor wie hem niet kan zien.
imageAlt: "Ovenschaal met goudbruine lasagne op een houten tafel."

# Optioneel. Waar het recept vandaan komt. url mag weg als er geen link is.
source:
  label: "Kookboek van oma"
  url: "https://example.com/recept"

# Optioneel. Tags in vaste groepen. Alleen deze waarden zijn toegestaan; een tikfout geeft een foutmelding.
#   diet:     vegetarian, vegan, pescatarian, gluten-free, dairy-free
#   protein:  chicken, beef, pork, lamb, duck, fish, seafood, tofu, tempeh, seitan, egg, legumes, cheese, nuts
#   occasion: weeknight, weekend, party, holiday, picnic, meal-prep, comfort
#   country:  ISO-landcodes van twee letters, bijv. NL, IT, JP, TH, MX (de naam wordt automatisch vertaald)
# Nieuwe waarde nodig? Voeg hem toe in src/lib/taxonomy.ts en geef hem een label in src/i18n/nl.json en en.json.
tags:
  diet: [vegetarian]
  protein: [cheese]
  occasion: [weeknight, comfort]
  country: [IT]

# Optioneel. Ratings van 1 tot 5, halve sterren mogen (bijv. 3.5). Laat een regel weg om hem te verbergen.
ratings:
  easeOfCooking: 4    # Op gemak
  tokoFactor: 2       # Toko gehalte
  jochem: 4.5         # Lekker Jochem
  anna: 5             # Lekker Anna
---

<!--
Hieronder komt de bereiding, in gewone Markdown.
Schrijf de stappen als genummerde lijst ("1. ", "2. ", …); de site maakt er nette genummerde stappen van.
Een korte inleiding vóór de stappen mag ook.
-->

1. Eerste stap.
2. Tweede stap.
3. Derde stap.
