# Fräsmatning

Webbapp som räknar fram matning och varvtal för CNC-fräsar. Skärdata kommer från
verktygsdatabasen `data/verkstaden5-vectric-hobby.vtdb` (Vectric-format, profil Hobbymaskin).

## Så fungerar den

1. **Material** – hårt trä, mjukt trä/plywood, MDF, melamin, akryl, hård plast, mjuk plast, aluminium, FR4/PCB, ACM.
2. **Typ av fräs** – upcut, downcut, V-bit, kulfräs, konisk radiefräs, kompression, notfräs,
   avrundning, planfräs, kopierfräs, PCB-fräs och V-spår för ACM. Typer som saknar data för materialet gråas ut.
3. **Fräsen** – diameter (för V-bit även vinkel och spetsbredd, för konisk radie och avrundning radien),
   antal skär och vid behov artikel/skärlängd.
4. **Maskin och varvtal** – varvtal och maskinens maxmatning (2 500 mm/min i hobbyprofilen).

Matning = chipload × antal skär × varvtal, begränsad av maxmatningen. Om taket nås visas
vilket varvtal som ger rätt chipload. Nedmatning, skärdjup per pass och stegöver tas från databasen.
Man kan också skriva in sin egen matning och se om chiploaden blir för låg eller för hög.

## Köra

Öppna `index.html` i en webbläsare, eller använd den fristående filen `dist/frasmatning.html`
(allt inbakat, fungerar offline – kan läggas på telefonen).

## Uppdatera data från en ny .vtdb

```sh
python3 scripts/extract_vtdb.py path/till/databas.vtdb   # skriver data/tools.js
python3 scripts/build_single.py                          # bygger dist/frasmatning.html
```
