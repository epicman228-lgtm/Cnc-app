/* Skriver verktygsdatabaser i det äldre Vectric-formatet (.tool) som Aspire / VCarve 8.x importerar.
   Formatet är en MFC CArchive-ström. Strukturen är kartlagd från en fil exporterad ur Aspire 8.5:
     int32 3, int32 antal objekt, därefter objekten:
       mcToolGroupMarker (typ 11 = gruppstart, 12 = gruppslut) och verktyg (mcEndMillTool, typ 1).
   Klasser skrivs första gången som 0xFFFF + schema + namn, därefter som 0x8000 | klassindex.
   Bara End Mill stöds än; andra verktygstyper har egna klasser som inte är kartlagda. */
(function (root) {
  "use strict";

  const DBL_MAX = 1.7976931348623157e308;

  function Writer() {
    let buf = new Uint8Array(4096), len = 0;
    const grow = (n) => {
      if (len + n <= buf.length) return;
      let size = buf.length * 2;
      while (size < len + n) size *= 2;
      const nb = new Uint8Array(size); nb.set(buf.subarray(0, len)); buf = nb;
    };
    const dv = () => new DataView(buf.buffer);
    return {
      u8(v) { grow(1); buf[len++] = v & 0xff; },
      u16(v) { grow(2); dv().setUint16(len, v, true); len += 2; },
      i32(v) { grow(4); dv().setInt32(len, v, true); len += 4; },
      f32(v) { grow(4); dv().setFloat32(len, v, true); len += 4; },
      f64(v) { grow(8); dv().setFloat64(len, v, true); len += 8; },
      bytes(a) { grow(a.length); buf.set(a, len); len += a.length; },
      result() { return buf.slice(0, len); },
    };
  }

  // Windows-1252 för de korta strängarna (namn), som Aspire 8.5 skriver dem
  const CP1252_EXTRA = { 0x20ac: 0x80, 0x201a: 0x82, 0x0192: 0x83, 0x201e: 0x84, 0x2026: 0x85, 0x2020: 0x86, 0x2021: 0x87,
    0x02c6: 0x88, 0x2030: 0x89, 0x0160: 0x8a, 0x2039: 0x8b, 0x0152: 0x8c, 0x017d: 0x8e, 0x2018: 0x91, 0x2019: 0x92,
    0x201c: 0x93, 0x201d: 0x94, 0x2022: 0x95, 0x2013: 0x96, 0x2014: 0x97, 0x02dc: 0x98, 0x2122: 0x99, 0x0161: 0x9a,
    0x203a: 0x9b, 0x0153: 0x9c, 0x017e: 0x9e, 0x0178: 0x9f };
  function cp1252(s) {
    const out = [];
    for (const ch of String(s)) {
      const c = ch.codePointAt(0);
      if (c < 0x80 || (c >= 0xa0 && c <= 0xff)) out.push(c);
      else out.push(CP1252_EXTRA[c] || 0x3f); // ? för tecken som saknas
    }
    return out;
  }
  // int32 längd inklusive avslutande NUL, sedan tecknen och NUL
  function ansiString(w, s) {
    const b = cp1252(s);
    w.i32(b.length + 1); w.bytes(b); w.u8(0);
  }
  // MFC CString i Unicode: 0xFF, 0xFFFE, längd (byte, eller 0xFF + uint16), UTF-16LE
  function cString(w, s) {
    s = String(s || "");
    w.u8(0xff); w.u16(0xfffe);
    if (s.length < 0xff) w.u8(s.length);
    else { w.u8(0xff); w.u16(Math.min(s.length, 0xfffe)); s = s.slice(0, 0xfffe); }
    for (let i = 0; i < s.length; i++) w.u16(s.charCodeAt(i));
  }

  function guid(rand) {
    const g = new Uint8Array(16);
    for (let i = 0; i < 16; i++) g[i] = rand() & 0xff;
    g[7] = (g[7] & 0x0f) | 0x40; // version 4 (byte 7 i Windows GUID-ordning)
    g[8] = (g[8] & 0x3f) | 0x80;
    return g;
  }
  function defaultRand() {
    if (root.crypto && root.crypto.getRandomValues) {
      const a = new Uint8Array(1);
      return () => (root.crypto.getRandomValues(a), a[0]);
    }
    return () => Math.floor(Math.random() * 256);
  }

  // Verktygets kontur för förhandsbilden: radie upp till skärlängd, sedan skaft upp till total längd.
  // Aspire 8.5 själv skriver (r,0) (r,25) (r,8D) (0,8D). Resten av blocket är en fast struct på 416 byte.
  function outline(w, d) {
    const r = d / 2;
    const total = 8 * d;
    const cut = Math.min(25, total * 25 / 32);
    const v = new Array(51).fill(0);
    for (let k = 1; k <= 7; k++) v[k] = DBL_MAX;
    [[r, 0], [r, cut], [r, total], [0, total]].forEach(([x, y], i) => { v[16 + 7 * i] = x; v[17 + 7 * i] = y; });
    w.i32(4);   // antal punkter
    w.i32(0);   // utfyllnad
    v.forEach((x) => w.f64(x));
  }

  function groupMarker(w, type, name, rand) {
    w.i32(2); w.i32(type);
    w.f32(0); w.i32(0); w.i32(5); w.u8(0);
    for (let k = 0; k < 5; k++) w.f64(0);
    w.i32(0); w.i32(0); w.i32(0);
    ansiString(w, name);
    w.f64(0);
    w.i32(1); w.i32(1); w.i32(0);
    cString(w, ""); cString(w, "");
    w.i32(0); w.i32(0);
    w.bytes(guid(rand));
    w.u16(0); w.i32(1);
    w.u8(type === 11 ? 1 : 0);
  }

  function endMill(w, t, rand) {
    w.i32(2); w.i32(1);          // version, verktygstyp End Mill
    w.f32(t.d / 2); w.i32(0);
    w.i32(5); w.u8(1);
    w.f64(t.d);
    w.f64(t.passDepth);
    w.f64(t.stepover);
    w.f64(t.feed);
    w.f64(t.plunge);
    w.i32(1);                    // matningsenhet mm/min
    w.i32(Math.round(t.rpm));
    w.i32(Math.max(0, Math.round(Number(t.toolNo) || 0)));
    ansiString(w, t.name);
    w.f64(Math.round(t.stepover * 1.6 * 1e9) / 1e9); // dolt fält: 1,6 × stepover i Aspires egen export
    w.i32(1); w.i32(1); w.i32(0);
    cString(w, t.notes);
    cString(w, t.path);
    w.i32(0); w.i32(440); w.i32(440); w.i32(1);
    w.bytes(guid(rand));
    outline(w, t.d);
    w.bytes(guid(rand));
    w.u16(0); w.i32(1);
  }

  /**
   * groups: [{ name, tools: [{ name, d, passDepth, stepover, feed, plunge, rpm, toolNo, notes, path }] }]
   * Returnerar Uint8Array med .tool-filen.
   */
  function build(groups, opts) {
    const rand = (opts && opts.rand) || defaultRand();
    const w = Writer();
    const count = groups.reduce((n, g) => n + g.tools.length + 2, 0);
    w.i32(3); w.i32(count);
    const classIndex = {};
    let mapCount = 1;
    const writeClass = (name) => {
      if (classIndex[name]) { w.u16(0x8000 | classIndex[name]); }
      else {
        w.u16(0xffff); w.u16(1); w.u16(name.length);
        for (let i = 0; i < name.length; i++) w.u8(name.charCodeAt(i));
        classIndex[name] = mapCount++;
      }
      mapCount++; // objektet själv får också ett index
    };
    for (const g of groups) {
      writeClass("mcToolGroupMarker"); groupMarker(w, 11, g.name, rand);
      for (const t of g.tools) { writeClass("mcEndMillTool"); endMill(w, t, rand); }
      writeClass("mcToolGroupMarker"); groupMarker(w, 12, "ToolGroup - End", rand);
    }
    return w.result();
  }

  const api = { build, supportedVtype: (vtype) => vtype === 1 };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.AspireTool = api;
})(typeof window !== "undefined" ? window : globalThis);
