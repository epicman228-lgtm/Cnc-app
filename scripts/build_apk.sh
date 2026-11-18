#!/usr/bin/env bash
# Bygger dist/frasmatning.apk: webbappen i en Android-WebView.
# Kräver (Ubuntu/Debian): apt-get install aapt apksigner dalvik-exchange android-sdk-platform-23 zipalign + JDK
# Signeringsnyckeln sparas i android/release.keystore (skapas första gången, checkas inte in).
# Samma nyckel måste användas för att kunna uppdatera en installerad app.
set -euo pipefail
cd "$(dirname "$0")/.."
ROOT=$PWD
SDK_JAR=${ANDROID_JAR:-/usr/lib/android-sdk/platforms/android-23/android.jar}
KS=${KEYSTORE:-$ROOT/android/release.keystore}
KS_PASS=${KEYSTORE_PASS:-frasmatning}
B=$ROOT/android/build
rm -rf "$B" && mkdir -p "$B/classes" "$B/assets" "$B/res"

# 1. Webbappen som en enda fil
python3 scripts/build_single.py "$B/assets/index.html" >/dev/null

# 2. Resurser och ikon
cp -r android/res/. "$B/res/"
mkdir -p "$B/res/drawable-nodpi"
cp icons/icon-192.png "$B/res/drawable-nodpi/ic_launcher.png"

# 3. Paketera manifest, resurser och assets (resources.arsc okomprimerad)
aapt package -f -M android/AndroidManifest.xml -S "$B/res" -A "$B/assets" -I "$SDK_JAR" -0 arsc -F "$B/app.unsigned.apk"

# 4. Kompilera Java och gör om till Dalvik-bytekod
javac -nowarn -Xlint:-options -source 8 -target 8 -bootclasspath "$SDK_JAR" -d "$B/classes" \
  $(find android/src -name '*.java')
dalvik-exchange --dex --output="$B/classes.dex" "$B/classes"
(cd "$B" && aapt add app.unsigned.apk classes.dex >/dev/null)

# 5. Justera och signera
zipalign -p -f 4 "$B/app.unsigned.apk" "$B/app.aligned.apk"
if [ ! -f "$KS" ]; then
  keytool -genkeypair -keystore "$KS" -storepass "$KS_PASS" -keypass "$KS_PASS" -alias frasmatning \
    -keyalg RSA -keysize 2048 -validity 10000 -dname "CN=Frasmatning" >/dev/null 2>&1
fi
mkdir -p dist
apksigner sign --ks "$KS" --ks-pass "pass:$KS_PASS" --ks-key-alias frasmatning \
  --out dist/frasmatning.apk "$B/app.aligned.apk"
apksigner verify dist/frasmatning.apk
rm -f dist/frasmatning.apk.idsig
echo "dist/frasmatning.apk ($(( $(stat -c %s dist/frasmatning.apk) / 1024 )) kB)"
