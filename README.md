# Fräsmatning

Webbapp som räknar fram matning och varvtal för CNC-fräsar. Skärdata kommer från
verktygsdatabasen `data/verkstaden5-vectric-hobby.vtdb` (Vectric-format, profil Hobbymaskin).

## Så fungerar den

**Hitta din fräs:** fota etiketten eller skriv artikelkoden. Koderna i databasen är exakt de som står på
förpackningen, så appen jämför det avlästa mot alla 120 koder och väljer typ, mått, antal skär och artikel.
I den publicerade Claude-versionen läser Claude bilden. Som fristående sida används Tesseract.js
(OCR i webbläsaren, laddas från cdn.jsdelivr.net vid första fotot). Sökfältet fungerar överallt.

1. **Material** – hårt trä, mjukt trä/plywood, MDF, melamin, akryl, hård plast, mjuk plast, aluminium, FR4/PCB, ACM.
2. **Typ av fräs** – upcut, downcut, V-bit, kulfräs, konisk radiefräs, kompression, notfräs,
   avrundning, planfräs, kopierfräs, PCB-fräs och V-spår för ACM. Typer som saknar data för materialet gråas ut.
3. **Fräsen** – diameter (för V-bit även vinkel och spetsbredd, för konisk radie och avrundning radien),
   antal skär och vid behov artikel/skärlängd.
4. **Varvtal och matning** – varvtal och matning.
   Matningen följer varvtalet tills du skriver in en egen, sedan visar mätaren om chiploaden blir för låg eller för hög.
5. **Skärdjup** – totalt djup ger antal pass, plus förslag per bearbetning (spår, ficka, adaptiv, finpass).
   Djup per pass kommer från databasen och sänks automatiskt när chiploaden är högre än rätt.

Matning = chipload × antal skär × varvtal. Nedmatning, skärdjup per pass och stegöver tas från databasen.
Förslagen för adaptiv fräsning och finpass är tumregler, inte databasvärden, och är märkta så i appen.

## Köra

Öppna `index.html` i en webbläsare, eller använd den fristående filen `dist/frasmatning.html`
(allt inbakat, fungerar offline – kan läggas på telefonen).

## Uppdatera data från en ny .vtdb

```sh
python3 scripts/extract_vtdb.py path/till/databas.vtdb   # skriver data/tools.js
python3 scripts/build_single.py                          # bygger dist/frasmatning.html
```
