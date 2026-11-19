# Fräsmatning

Webbapp som räknar fram matning och varvtal för CNC-fräsar. Skärdata kommer från
verktygsdatabasen `data/verkstaden5-vectric-hobby.vtdb` (Vectric-format, profil Hobbymaskin).

## Så fungerar den

**Hitta din fräs:** fota etiketten eller skriv artikelkoden. Koderna i databasen är exakt de som står på
förpackningen, så appen jämför det avlästa mot alla 120 koder och väljer typ, mått, antal skär och artikel.
I den publicerade Claude-versionen läser Claude bilden. Som fristående sida används Tesseract.js
(OCR i webbläsaren, laddas från cdn.jsdelivr.net vid första fotot). Sökfältet fungerar överallt.

1. **Material** – hårt trä, mjukt trä/plywood, MDF, melamin, akryl, hård plast, mjuk plast, aluminium, FR4/PCB, ACM.
2. **Typ av fräs** – upcut, downcut, V-bit, kulfräs, konisk kulfräs, kompression, notfräs,
   avrundning, planfräs, kopierfräs, PCB-fräs och V-spår för ACM. Typer som saknar data för materialet gråas ut.
3. **Fräsen** – diameter (för kulfräs även radien, för V-bit vinkel och spetsbredd, för konisk kulfräs spetsradien, för avrundning radien),
   antal skär och vid behov artikel/skärlängd.
4. **Varvtal och matning** – varvtal och matning.
   Matningen följer varvtalet tills du skriver in en egen, sedan visar mätaren om chiploaden blir för låg eller för hög.
5. **Skärdjup** – totalt djup ger antal pass, plus förslag per bearbetning (spår, ficka, adaptiv, finpass).
   Djup per pass kommer från databasen och sänks automatiskt när chiploaden är högre än rätt.

Matning = chipload × antal skär × varvtal. Nedmatning, skärdjup per pass och stegöver tas från databasen.
Förslagen för adaptiv fräsning och finpass är tumregler, inte databasvärden, och är märkta så i appen.

**Mina fräsar:** tryck *Spara fräsen* under resultatet för att spara matning, varvtal, nedmatning,
skärdjup och stegöver för just den fräsen och materialet (med valfritt verktygsnummer och anteckning).
Menyn *Mina fräsar* visar värdena med Aspires fältnamn (Pass Depth, Stepover, Spindle Speed, Feed Rate,
Plunge Rate) i samma ordning som i verktygsdialogen. Listan sparas på enheten.

## Android-app (.apk)

`dist/frasmatning.apk` är appen som en vanlig Android-app (Android 6 eller nyare). Den fungerar offline
och "Fota etiketten" öppnar kameran eller bildgalleriet.

1. Ladda ner `dist/frasmatning.apk` till telefonen (från GitHub: öppna filen och tryck *Download raw file*).
2. Öppna filen. Android frågar om du vill tillåta installation från den här källan (webbläsaren eller
   Filer-appen): tillåt det och installera.
3. Play Protect kan varna för att appen kommer från en okänd utvecklare. Välj *Installera ändå*.

Bygg om med `scripts/build_apk.sh` (kräver `aapt apksigner dalvik-exchange android-sdk-platform-23 zipalign`
och en JDK). Signeringsnyckeln `android/release.keystore` skapas första gången och checkas inte in. En app
signerad med en annan nyckel kan inte installeras ovanpå den gamla; avinstallera den gamla först.

## Installera som app på mobilen

Appen är en installerbar webbapp (PWA) och fungerar offline efter första besöket.

1. **Slå på GitHub Pages en gång:** repot på GitHub → *Settings* → *Pages* → *Build and deployment* →
   Source: *Deploy from a branch* → Branch: `claude/frasstol-calculator-app-rrjnb0`, mapp `/ (root)` → *Save*.
2. Efter någon minut finns appen på `https://epicman228-lgtm.github.io/Cnc-app/`.
3. Öppna adressen i mobilen och installera:
   - **iPhone (Safari):** Dela → *Lägg till på hemskärmen*.
   - **Android (Chrome):** knappen *Installera appen* i appen, eller menyn ⋮ → *Installera app*.

Nya versioner som pushas till grenen hämtas automatiskt nästa gång appen öppnas med internet.
Fotoavläsningen använder Tesseract.js, som laddas ner vid första fotot (kräver internet den gången).

## Köra lokalt

Öppna `index.html` i en webbläsare, eller använd den fristående filen `dist/frasmatning.html`
(allt inbakat, en enda fil).

## Uppdatera data från en ny .vtdb

```sh
python3 scripts/extract_vtdb.py path/till/databas.vtdb   # skriver data/tools.js
python3 scripts/build_single.py                          # bygger dist/frasmatning.html
```
