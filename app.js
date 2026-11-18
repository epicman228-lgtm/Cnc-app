/* Fräsmatning – räknar matning ur chipload, antal skär och varvtal.
   Skärdata kommer från window.TOOL_DB (data/tools.js, genererad ur .vtdb). */
(function () {
  "use strict";

  const DB = window.TOOL_DB;
  const TOOLS = DB.tools.map((t) => Object.assign({}, t, { codeAngle: parseAngle(t.code) }));

  // ---------- Material ----------
  const MATERIALS = [
    { id: "hardwood", label: "Hårt trä", sub: "Ek, bok, ask", full: "Hårt trä" },
    { id: "softwood", label: "Mjukt trä", sub: "Furu, gran, plywood", full: "Mjukt trä / plywood" },
    { id: "mdf", label: "MDF", sub: "MDF, spånskiva", full: "MDF / spånskiva" },
    { id: "melamine", label: "Melamin", sub: "Belagd skiva", full: "Melamin" },
    { id: "acrylic", label: "Akryl", sub: "PMMA, plexiglas", full: "Akryl" },
    { id: "hardplastic", label: "Hård plast", sub: "POM, PC, nylon", full: "Hård plast" },
    { id: "softplastic", label: "Mjuk plast", sub: "HDPE, LDPE, PP", full: "Mjuk plast" },
    { id: "aluminium", label: "Aluminium", sub: "Legeringar", full: "Aluminium" },
    { id: "fr4", label: "FR4 / PCB", sub: "Kretskort", full: "FR4 / PCB" },
    { id: "acm", label: "ACM", sub: "Dibond, alucobond", full: "ACM / Dibond" },
  ];

  // ---------- Frästyper ----------
  // rows = vilka mått man väljer innan antal skär
  const TYPES = [
    { id: "upcut", label: "Upcut", sub: "Uppåtskärande", rows: ["d"], blurb: "Lyfter upp spånen ur spåret. Bra för djupa spår och fickor, men kan ge fransig överkant." },
    { id: "downcut", label: "Downcut", sub: "Nedåtskärande", rows: ["d"], blurb: "Trycker ner fibrerna och ger ren överkant. Spånen packas i spåret, så kör grundare pass." },
    { id: "vbit", label: "V-bit", sub: "Gravyr, V-carve", rows: ["d", "angle", "tip"], blurb: "Spetsig fräs för gravyr, V-carve och fasning. Välj vinkel och spetsbredd." },
    { id: "ball", label: "Kulfräs", sub: "Ball nose", rows: ["d"], blurb: "Halvrund spets för 3D-relief och mjuka konturer. Radien är halva diametern." },
    { id: "tapered", label: "Konisk radie", sub: "Tapered ball", rows: ["radius"], blurb: "Konisk kropp med rundad spets. Fina 3D-detaljer med en stabil fräs." },
    { id: "compression", label: "Kompression", sub: "Upp + ned", rows: ["d"], blurb: "Uppåtskärande nertill och nedåtskärande upptill. Rena kanter på båda sidor av skivan." },
    { id: "straight", label: "Notfräs", sub: "Raka skär", rows: ["d"], blurb: "Raka skär för spår, fickor och kanter i trä och plast." },
    { id: "roundover", label: "Avrundning", sub: "Kantradie", rows: ["radius"], blurb: "Rundar av kanter. Välj radie." },
    { id: "surfacing", label: "Planfräs", sub: "Spoilboard", rows: ["d"], blurb: "Bred fräs för att plana spoilboard och stora ytor." },
    { id: "flush", label: "Kopierfräs", sub: "Med lager", rows: ["d"], blurb: "Kopierfräs med lager som följer en mall." },
    { id: "pcb", label: "PCB-fräs", sub: "Majskolv", rows: ["d"], blurb: "Fräs för FR4 och kretskort." },
    { id: "acm", label: "V-spår ACM", sub: "Vikspår", rows: ["d"], blurb: "V-spår för att vika ACM- och Dibondskivor." },
  ];
  const TYPE = Object.fromEntries(TYPES.map((t) => [t.id, t]));

  const ROWS = {
    d: { label: "Diameter", unit: "mm", get: (t) => t.d, fmt: (v) => num(v) },
    angle: { label: "Vinkel", unit: "grader", get: (t) => t.angle, fmt: (v) => num(v) + "°" },
    tip: { label: "Spetsbredd", unit: "mm", get: (t) => t.tip, fmt: (v) => num(v) },
    radius: { label: "Radie", unit: "mm", get: (t) => t.radius, fmt: (v) => num(v) },
  };

  const RPM_MIN = 3000, RPM_MAX = 30000, RPM_STEP = 500;
  const DEFAULT_MAXFEED = Math.max(...TOOLS.flatMap((t) => Object.values(t.cuts).map((c) => c.feed)));

  // ---------- State ----------
  const STORE_KEY = "frasmatning.v1";
  const state = Object.assign(
    { material: "hardwood", type: "upcut", sel: { d: 4 }, flutes: 2, article: null, rpm: null, rpmAuto: true, feed: null, feedAuto: true, maxFeed: DEFAULT_MAXFEED, depth: 6, collapsed: [] },
    load()
  );

  function load() {
    try {
      const s = JSON.parse(localStorage.getItem(STORE_KEY)) || {};
      delete s.ownOn; delete s.own;
      return s;
    } catch (e) { return {}; }
  }
  function save() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch (e) { /* ingen lagring */ }
  }

  // ---------- Hjälpare ----------
  const nf = (d) => new Intl.NumberFormat("sv-SE", { minimumFractionDigits: d, maximumFractionDigits: d });
  function num(v, dec) {
    if (v == null || isNaN(v)) return "–";
    if (dec == null) return new Intl.NumberFormat("sv-SE", { maximumFractionDigits: 3 }).format(v);
    return nf(dec).format(v);
  }
  function parseAngle(code) { const m = /(\d+(?:\.\d+)?)°/.exec(code); return m ? +m[1] : null; }
  const uniq = (arr) => [...new Set(arr.filter((v) => v != null))].sort((a, b) => a - b);
  function nearest(opts, v) {
    if (!opts.length) return null;
    if (v == null) return opts[0];
    return opts.reduce((best, o) => (Math.abs(o - v) < Math.abs(best - v) ? o : best), opts[0]);
  }
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  const $ = (id) => document.getElementById(id);
  function el(tag, attrs, html) {
    const e = document.createElement(tag);
    for (const k in attrs || {}) {
      if (k === "on") for (const ev in attrs.on) e.addEventListener(ev, attrs.on[ev]);
      else if (attrs[k] !== false && attrs[k] != null) e.setAttribute(k, attrs[k] === true ? "" : attrs[k]);
    }
    if (html != null) e.innerHTML = html;
    return e;
  }

  // ---------- Urval ----------
  function typesFor(material) { return new Set(TOOLS.filter((t) => t.cuts[material]).map((t) => t.type)); }

  function resolve() {
    const avail = typesFor(state.material);
    if (!avail.has(state.type)) state.type = TYPES.find((t) => avail.has(t.id)).id;
    const type = TYPE[state.type];

    let cands = TOOLS.filter((t) => t.type === type.id && t.cuts[state.material]);
    const rows = type.rows.map((key) => {
      const get = ROWS[key].get;
      const opts = uniq(cands.map(get));
      let val = state.sel[key];
      if (!opts.includes(val)) val = nearest(opts, val);
      state.sel[key] = val;
      cands = cands.filter((t) => get(t) === val);
      return { key, opts, val };
    });

    const flOpts = uniq(cands.map((t) => t.flutes));
    if (!flOpts.includes(state.flutes)) state.flutes = nearest(flOpts, state.flutes);
    cands = cands.filter((t) => t.flutes === state.flutes);

    let tool = cands.find((t) => t.code === state.article);
    if (!tool) {
      // Föredra icke-DLC och kortaste skärlängd som standard
      tool = cands.slice().sort((a, b) => (a.dlc - b.dlc) || ((a.len || 0) - (b.len || 0)))[0];
      state.article = tool.code;
    }
    const cut = tool.cuts[state.material];
    if (state.rpmAuto || !state.rpm) state.rpm = cut.rpm;
    return { avail, type, rows, flOpts, cands, tool, cut };
  }

  function compute(r) {
    const { tool, cut } = r;
    const z = tool.flutes;
    const rpm = state.rpm;
    const rec = cut.chip;
    const ideal = rec * z * rpm;                       // matning för exakt rätt chipload
    const recFeed = Math.round(Math.min(ideal, state.maxFeed));
    const capped = ideal > state.maxFeed;
    if (state.feedAuto || !state.feed) state.feed = recFeed;
    const feed = state.feed;
    const chip = feed / (z * rpm);
    const ratio = chip / rec;
    const zone = ratio < 0.8 ? 0 : ratio > 1.2 ? 2 : 1;
    const plunge = Math.round(feed * (cut.plunge / cut.feed));
    const rpmForFeed = (f) => Math.round(f / (rec * z) / 100) * 100;   // varvtal som ger rätt chipload vid matning f
    return { feed, recFeed, ideal, capped, chip, rec, ratio, zone, plunge, rpmForFeed, overMax: feed > state.maxFeed };
  }

  // ---------- Skärdjup ----------
  // Tumregel för adaptiv/HSM-fräsning: djup i antal diametrar och stegöver i andel av diametern.
  const HSM = {
    hardwood: [1.0, 0.12], softwood: [1.5, 0.15], mdf: [1.5, 0.15], melamine: [1.5, 0.15],
    acrylic: [1.0, 0.12], hardplastic: [1.0, 0.12], softplastic: [1.0, 0.15], aluminium: [0.5, 0.08],
  };
  const FLAT = ["upcut", "downcut", "compression", "straight"];

  function depthPlan(r, c) {
    const { tool, cut } = r;
    const base = cut.stepdown;
    // Högre chipload än rätt = större last per tand -> ta grundare pass i samma proportion.
    const scale = c.ratio > 1.05 ? 1 / c.ratio : 1;
    const ap = Math.max(0.05, Math.floor(base * scale * 100) / 100);
    const total = state.depth;
    const passes = Math.max(1, Math.ceil(total / ap - 1e-9));
    const perPass = total / passes;
    const ops = [];
    if (FLAT.includes(tool.type)) {
      ops.push({ name: "Spår / kontur", note: "full fräsbredd", ap, ae: `${num(tool.d)} mm`, src: "databas" });
      ops.push({ name: "Ficka / urfräsning", note: `stegöver ${num((cut.stepover / tool.d) * 100, 0)} %`, ap, ae: `${num(cut.stepover, 2)} mm`, src: "databas" });
      const h = HSM[state.material];
      if (h && tool.type !== "downcut") {
        const apH = Math.min(tool.len || Infinity, Math.round(tool.d * h[0] * 10) / 10);
        ops.push({ name: "Adaptiv / HSM", note: "smal stegöver, djupt pass", ap: apH, ae: `${num(Math.round(tool.d * h[1] * 100) / 100, 2)} mm`, src: "tumregel" });
      }
      const fin = Math.min(tool.len || total, total);
      ops.push({ name: "Finpass på sidan", note: "sista passet längs väggen", ap: fin, ae: "0,1–0,3 mm", src: "tumregel" });
    }
    let vMax = null;
    if ((tool.type === "vbit" || tool.type === "acm") && tool.angle) {
      vMax = (tool.d - (tool.tip || 0)) / 2 / Math.tan((tool.angle * Math.PI) / 360);
    }
    return { base, ap, scale, total, passes, perPass, ops, vMax, tooDeep: !vMax && tool.len && total > tool.len };
  }

  const TYPE_TIPS = {
    upcut: "Upcut drar upp spånen, så den klarar djupa spår bäst. Överkanten kan fransa sig.",
    downcut: "Downcut packar spånen i spåret. Håll dig till databasens djup och blås eller sug ur spåret. Använd hellre upcut för djupa spår.",
    compression: "Ta första passet djupare än den uppåtskärande delen längst ner på fräsen (ofta 3–6 mm), annars fransas överkanten.",
    straight: "Raka skär lyfter inte spånen. Grunda pass och bra spånsug.",
    vbit: "Vid V-carve bestämmer vinkeln och linjebredden djupet. Djupet per pass gäller gravyr och fasning i flera pass.",
    ball: "Grovfräs med en plan fräs först. Kulfräsen används till finpass med liten stegöver.",
    tapered: "Grovfräs med en plan fräs först. Den koniska fräsen tar finpasset.",
    roundover: "Ta radien i 2–3 pass i hårt trä för att undvika brännmärken och utslitningar.",
    surfacing: "Planfräsning: ta hellre flera tunna pass än ett tjockt.",
    flush: "Låt lagret ligga mot mallen. Ta bort det mesta materialet med annan fräs först om det är mycket kvar.",
    pcb: "FR4 sliter hårt. Fräs i flera pass och använd spånsug, dammet är skadligt.",
    acm: "Fräs V-spåret så att ca 0,3–0,5 mm av kärnan och bakre aluminiumskiktet blir kvar.",
  };

  // ---------- Rendering ----------
  function render() {
    const r = resolve();
    const c = compute(r);
    save();

    renderMaterials();
    renderTypes(r);
    renderDims(r);
    renderMachine(r, c);
    renderResult(r, c);
    renderSteps(r, c);
  }

  // ---------- Hopfällbara steg ----------
  const CHEV = `<svg class="chev" viewBox="0 0 20 20" aria-hidden="true"><path d="M5 8l5 5 5-5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  const STEPS_EL = [...document.querySelectorAll(".panel .step")];
  STEPS_EL.forEach((step, i) => {
    const head = step.querySelector(".step-head");
    const body = el("div", { class: "step-body" });
    [...step.children].filter((n) => n !== head).forEach((n) => body.appendChild(n));
    step.appendChild(body);
    body.id = `step-body-${i}`;
    head.setAttribute("role", "button");
    head.setAttribute("tabindex", "0");
    head.setAttribute("aria-controls", body.id);
    head.insertAdjacentHTML("beforeend", `<span class="step-sum"></span>${CHEV}`);
    const toggle = () => { state.collapsed[i] = !state.collapsed[i]; render(); };
    head.addEventListener("click", toggle);
    head.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggle(); } });
  });
  $("toggle-all").addEventListener("click", () => {
    const anyOpen = STEPS_EL.some((_, i) => !state.collapsed[i]);
    state.collapsed = STEPS_EL.map(() => anyOpen);
    render();
  });

  function renderSteps(r, c) {
    const mat = MATERIALS.find((m) => m.id === state.material);
    const p = lastPlan;
    const sums = [
      [mat.full],
      [r.type.label],
      [`${toolShort(r.tool)} · ${r.tool.flutes} skär`],
      [`${num(state.rpm, 0)} rpm · ${num(c.feed, 0)} mm/min`, c.zone !== 1],
      [`${num(p.total, 1)} mm · ${p.passes} pass` + (p.tooDeep || (p.vMax && p.total > p.vMax) ? " · för djupt" : ""), p.tooDeep || (p.vMax && p.total > p.vMax)],
    ];
    STEPS_EL.forEach((step, i) => {
      const closed = !!state.collapsed[i];
      step.classList.toggle("collapsed", closed);
      step.querySelector(".step-head").setAttribute("aria-expanded", String(!closed));
      const sum = step.querySelector(".step-sum");
      sum.textContent = sums[i][0];
      sum.classList.toggle("bad", !!sums[i][1]);
    });
    const anyOpen = STEPS_EL.some((_, i) => !state.collapsed[i]);
    $("toggle-all").textContent = anyOpen ? "Fäll ihop alla" : "Fäll ut alla";
  }

  function renderMaterials() {
    const box = $("materials");
    if (!box.childElementCount) {
      MATERIALS.forEach((m) => {
        const b = el("button", { type: "button", class: "tile", "data-id": m.id, on: { click: () => { state.material = m.id; state.article = null; state.feedAuto = true; render(); } } },
          MATERIAL_SVG[m.id] + `<span class="t-name">${m.label}</span><span class="t-sub">${m.sub}</span>`);
        box.appendChild(b);
      });
    }
    [...box.children].forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.id === state.material)));
  }

  function renderTypes(r) {
    const box = $("types");
    if (!box.childElementCount) {
      TYPES.forEach((t) => {
        const b = el("button", { type: "button", class: "tile", "data-id": t.id, on: { click: () => { state.type = t.id; state.article = null; state.feedAuto = true; render(); } } },
          TOOL_SVG[t.id] + `<span class="t-name">${t.label}</span><span class="t-sub">${t.sub}</span>`);
        box.appendChild(b);
      });
    }
    [...box.children].forEach((b) => {
      const ok = r.avail.has(b.dataset.id);
      b.disabled = !ok;
      b.title = ok ? "" : "Finns inga skärdata för det här materialet";
      b.setAttribute("aria-pressed", String(b.dataset.id === state.type));
    });
    const mat = MATERIALS.find((m) => m.id === state.material);
    const missing = TYPES.filter((t) => !r.avail.has(t.id)).length;
    $("type-blurb").innerHTML = `<strong>${r.type.label}:</strong> ${r.type.blurb}` +
      (missing ? ` <span>Gråade typer saknar skärdata för ${mat.full.toLowerCase()}.</span>` : "");
  }

  function seg(label, unit, items, onPick, extraClass) {
    const f = el("div", { class: "field" });
    f.appendChild(el("div", { class: "field-label" }, `${label}${unit ? ` <span style="font-weight:400">(${unit})</span>` : ""}`));
    const s = el("div", { class: "seg" + (extraClass ? " " + extraClass : ""), role: "group", "aria-label": label });
    items.forEach((it) => {
      s.appendChild(el("button", {
        type: "button", "aria-pressed": String(!!it.on), disabled: !!it.disabled, title: it.title || false,
        on: { click: () => onPick(it.value) },
      }, it.text));
    });
    f.appendChild(s);
    return f;
  }

  function renderDims(r) {
    const box = $("dims");
    box.innerHTML = "";
    r.rows.forEach((row) => {
      const def = ROWS[row.key];
      box.appendChild(seg(def.label, def.unit, row.opts.map((v) => ({ value: v, text: def.fmt(v), on: v === row.val })),
        (v) => { state.sel[row.key] = v; state.article = null; state.feedAuto = true; render(); }));
    });

    // Antal skär: alltid 1–4, de som inte finns gråas ut
    const flAll = [1, 2, 3, 4];
    box.appendChild(seg("Antal skär", "", flAll.map((n) => ({
      value: n, text: `${n} skär`, on: n === state.flutes, disabled: !r.flOpts.includes(n),
      title: r.flOpts.includes(n) ? "" : "Finns inte för vald fräs",
    })), (v) => { state.flutes = v; state.article = null; state.feedAuto = true; render(); }));

    if (r.cands.length > 1) {
      box.appendChild(seg("Artikel", "skärlängd", r.cands.map((t) => ({
        value: t.code, text: (t.len ? `${num(t.len)} mm` : t.code) + (t.dlc ? " DLC" : "") + (t.group.includes("O-flute") ? " O-flute" : t.group.includes("Aluminium") ? " Alu" : ""),
        on: t.code === r.tool.code, title: t.code,
      })), (v) => { state.article = v; state.feedAuto = true; render(); }, "articles"));
    }

    const hints = { vbit: "Diameter, vinkel och spetsbredd", tapered: "Spetsradie och antal skär", roundover: "Radie och antal skär" };
    $("dim-hint").textContent = hints[r.type.id] || "Diameter (mm) och antal skär";
  }

  function renderMachine(r, c) {
    const rpmIn = $("rpm"), mfIn = $("maxfeed"), fIn = $("feedin"), dIn = $("depth");
    if (document.activeElement !== rpmIn) rpmIn.value = state.rpm;
    if (document.activeElement !== mfIn) mfIn.value = state.maxFeed;
    if (document.activeElement !== fIn) fIn.value = state.feed;
    if (document.activeElement !== dIn) dIn.value = state.depth;
    const recRpm = r.cut.rpm;
    let html = `Databasens varvtal för den här fräsen: ${num(recRpm, 0)} rpm.`;
    if (state.rpm !== recRpm) html += ` <button type="button" class="linkbtn" id="use-rpm">Använd ${num(recRpm, 0)}</button>`;
    $("rpm-note").innerHTML = html;
    const u = $("use-rpm");
    if (u) u.addEventListener("click", () => { state.rpmAuto = true; state.rpm = recRpm; render(); });

    $("feed-note").innerHTML = state.feedAuto
      ? "Matningen följer varvtalet så att chiploaden blir rätt. Skriv in din egen matning för att se hur den påverkar chiploaden."
      : `Din egen matning. Rätt matning vid ${num(state.rpm, 0)} rpm är ${num(c.recFeed, 0)} mm/min. <button type="button" class="linkbtn" id="use-feed">Använd ${num(c.recFeed, 0)}</button>`;
    const uf = $("use-feed");
    if (uf) uf.addEventListener("click", () => { state.feedAuto = true; render(); });

    const pres = $("depth-presets");
    const opts = [3, 6, 12, 18];
    pres.innerHTML = "";
    opts.forEach((v) => pres.appendChild(el("button", { type: "button", "aria-pressed": String(state.depth === v), on: { click: () => { state.depth = v; render(); } } }, `${v}`)));
  }

  function renderResult(r, c) {
    const { tool, cut } = r;
    const mat = MATERIALS.find((m) => m.id === state.material);
    $("feed").textContent = num(c.feed, 0);
    $("summary").textContent = [mat.full, toolShort(tool), `${tool.flutes} skär`, `${num(state.rpm, 0)} rpm`].join(" · ");

    // Mätare: kvot 0,4 → vänster kant, 1,0 → mitten, 1,6 → höger kant
    const pos = clamp(0.5 + (c.ratio - 1) / 1.2, 0, 1);
    $("mark").style.left = (pos * 100).toFixed(1) + "%";
    const zone = c.zone;
    [...$("legend").children].forEach((s, i) => s.classList.toggle("on", i === zone));

    // Rekommendation och varningar
    const rl = $("rec-line");
    rl.hidden = state.feedAuto;
    rl.innerHTML = state.feedAuto ? "" : `Rätt matning: <b>${num(c.recFeed, 0)} mm/min</b> · <button type="button" class="linkbtn" id="use-feed2">Använd</button>`;
    const uf2 = $("use-feed2");
    if (uf2) uf2.addEventListener("click", () => { state.feedAuto = true; render(); });

    const call = $("callout");
    const msgs = [];
    if (!state.feedAuto && zone === 0) {
      const rpmFix = clamp(c.rpmForFeed(c.feed), RPM_MIN, RPM_MAX);
      msgs.push(`<p><b>För låg chipload (${num(c.ratio * 100, 0)} % av rätt).</b> Fräsen gnider mer än den skär, vilket ger värme, brännmärken och slöa skär. ` +
        (c.capped ? `Maskinens max ${num(state.maxFeed, 0)} mm/min räcker inte vid ${num(state.rpm, 0)} rpm, så sänk varvtalet` : `Höj matningen till ${num(c.recFeed, 0)} mm/min`) +
        (rpmFix < state.rpm ? `${c.capped ? "" : " eller sänk varvtalet"} till ${num(rpmFix, 0)} rpm. <button type="button" class="linkbtn" data-rpm="${rpmFix}">Använd ${num(rpmFix, 0)} rpm</button>` : ".") + `</p>`);
    } else if (!state.feedAuto && zone === 2) {
      const rpmFix = c.rpmForFeed(c.feed);
      msgs.push(`<p><b>För hög chipload (${num(c.ratio * 100, 0)} % av rätt).</b> Risk för fräsbrott, vibrationer och dålig yta. Sänk matningen till ${num(c.recFeed, 0)} mm/min` +
        (rpmFix <= RPM_MAX ? ` eller höj varvtalet till ${num(rpmFix, 0)} rpm. <button type="button" class="linkbtn" data-rpm="${rpmFix}">Använd ${num(rpmFix, 0)} rpm</button>` : ".") +
        ` Skärdjupet nedan är sänkt för att kompensera.</p>`);
    } else if (state.feedAuto && c.capped) {
      const better = clamp(Math.floor(state.maxFeed / (c.rec * r.tool.flutes) / 100) * 100, RPM_MIN, RPM_MAX);
      msgs.push(`<p><b>Maskinen hinner inte.</b> Rätt chipload kräver ${num(c.ideal, 0)} mm/min, men maxmatningen är ${num(state.maxFeed, 0)} mm/min.</p>` +
        (better < state.rpm ? `<p>Sänk varvtalet till ${num(better, 0)} rpm för rätt chipload. <button type="button" class="linkbtn" data-rpm="${better}">Använd ${num(better, 0)} rpm</button></p>` : ""));
    }
    if (c.overMax) msgs.push(`<p><b>Över maskinens maxmatning</b> (${num(state.maxFeed, 0)} mm/min). Maskinen kommer inte att gå så fort.</p>`);
    call.innerHTML = msgs.join("");
    call.hidden = !msgs.length;
    call.querySelectorAll("[data-rpm]").forEach((b) => b.addEventListener("click", () => { state.rpmAuto = false; state.rpm = +b.dataset.rpm; render(); }));

    renderDepth(r, c);

    const stepPct = tool.d && ["upcut", "downcut", "compression", "straight", "ball", "surfacing", "flush", "pcb"].includes(tool.type)
      ? ` <small>${num((cut.stepover / tool.d) * 100, 0)} %</small>` : "";
    const rows = [
      ["Chipload", `${num(c.chip, 3)} <small>mm/tand</small>`],
      ["Rätt för materialet", `${num(c.rec, 3)} <small>mm/tand${cut.chipSource === "calc" ? " (beräknad)" : ""}</small>`],
      ["Nedmatning", `${num(c.plunge, 0)} <small>mm/min</small>`],
      ["Skärdjup per pass", `${num(lastPlan.ap, 2)} <small>mm</small>`],
      ["Stegöver", `${num(cut.stepover, 2)} <small>mm</small>${stepPct}`],
      ["Varvtal", `${num(state.rpm, 0)} <small>rpm</small>`],
    ];
    $("kv").innerHTML = rows.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join("");

    const details = [tool.group];
    if (tool.len) details.push(`skärlängd ${num(tool.len)} mm`);
    if (tool.type === "ball") details.push(`radie ${num(tool.d / 2)} mm`);
    if (tool.type === "tapered" && tool.codeAngle) details.push(`konvinkel ${tool.codeAngle}°`);
    if (tool.type === "roundover") details.push(`Ø${num(tool.d)} mm`);
    if (tool.dlc) details.push("DLC-belagd");
    $("article").innerHTML = TOOL_SVG[tool.type] + `<code>${tool.code}</code><span>${details.join(" · ")}</span>`;

    // Mobilfot
    $("dock-feed").textContent = num(c.feed, 0);
    $("dock-sub").textContent = `${num(c.chip, 3)} mm/tand · ${["för lite", "rätt", "för mycket"][zone]}`;
    $("dock-mark").style.left = (pos * 100).toFixed(1) + "%";

    lastCopy = [
      `${mat.full}, ${tool.code} (${toolShort(tool)}, ${tool.flutes} skär)`,
      `Matning: ${num(c.feed, 0)} mm/min`,
      `Nedmatning: ${num(c.plunge, 0)} mm/min`,
      `Varvtal: ${num(state.rpm, 0)} rpm`,
      `Skärdjup per pass: ${num(lastPlan.ap, 2)} mm`,
      `Stegöver: ${num(cut.stepover, 2)} mm`,
      `Chipload: ${num(c.chip, 3)} mm/tand (rätt: ${num(c.rec, 3)})`,
      `Djup ${num(lastPlan.total, 1)} mm: ${lastPlan.passes} pass à ${num(lastPlan.perPass, 2)} mm`,
    ].join("\n");
  }

  let lastPlan = null;
  function renderDepth(r, c) {
    const p = depthPlan(r, c);
    lastPlan = p;
    const t = r.tool;
    let h = `<div class="r-label">Skärdjup</div>
      <div class="depth-head"><span class="depth-big">${p.passes} pass <small>à ${num(p.perPass, 2)} mm</small></span>
      <span class="note">för ${num(p.total, 1)} mm totalt, max ${num(p.ap, 2)} mm per pass</span></div>`;
    if (p.scale < 1) h += `<p class="note">Djupet per pass är sänkt från databasens ${num(p.base, 2)} mm eftersom chiploaden är ${num(c.ratio * 100, 0)} % av rätt.</p>`;
    const longer = p.tooDeep ? TOOLS.filter((x) => x.type === t.type && x.d === t.d && x.flutes === t.flutes && x.cuts[state.material] && x.len >= p.total)
      .sort((a, b) => a.len - b.len)[0] : null;
    let warn = "";
    if (p.tooDeep) warn = `${num(p.total, 1)} mm är djupare än fräsens skärlängd (${num(t.len)} mm). Skaftet kommer att gnida mot materialet. ` +
      (longer ? `Det finns en längre variant med ${num(longer.len)} mm skärlängd.` : "Ingen fräs av samma typ och storlek har tillräcklig skärlängd, så välj en annan diameter eller fräs från båda sidor.");
    if (p.vMax && p.total > p.vMax) warn = `V-biten når full bredd (Ø${num(t.d)} mm) redan vid ${num(p.vMax, 1)} mm djup. Djupare än så får spåret raka väggar och skaftet gnider.`;
    const maxLine = t.len ? `Max djup med den här fräsen: <b>${num(t.len)} mm</b> (skärlängd).`
      : p.vMax ? `V-biten når full bredd vid <b>${num(p.vMax, 1)} mm</b> djup.` : "Skärlängd saknas i databasen för den här fräsen.";
    $("depth-max").innerHTML = maxLine;
    const dw = $("depth-warn");
    dw.hidden = !warn;
    dw.innerHTML = warn + (longer ? ` <button type="button" class="linkbtn" data-article="${longer.code}">Byt till ${longer.code}</button>` : "");
    if (warn) h += `<p class="warnline">${dw.innerHTML}</p>`;
    h += `<p class="note">${maxLine}</p>`;
    if (p.ops.length) {
      h += `<div class="ops-wrap"><table class="ops"><thead><tr><th>Bearbetning</th><th>Djup/pass</th><th>Stegöver</th></tr></thead><tbody>` +
        p.ops.map((o) => `<tr><td><b>${o.name}</b><span class="src">${o.note} · ${o.src}</span></td><td><b>${num(o.ap, 2)}</b> mm</td><td>${o.ae}</td></tr>`).join("") +
        `</tbody></table></div>`;
    }
    const tips = [TYPE_TIPS[t.type]];
    if (state.material === "aluminium") tips.push("I aluminium: använd luft eller smörjning så att spånen inte svetsar fast. Grunt och jämnt är säkrare än djupt på en hobbymaskin.");
    if (FLAT.includes(t.type)) tips.push("Värden märkta <b>databas</b> kommer från verktygsfilen. <b>Tumregel</b> är allmänna startvärden som du bör provfräsa.");
    h += `<ul class="tips">${tips.map((x) => `<li>${x}</li>`).join("")}</ul>`;
    $("depth-out").innerHTML = h;
  }

  function toolShort(t) {
    if (t.type === "vbit") return `${t.angle}° V, Ø${num(t.d)} mm`;
    if (t.type === "tapered") return `R${num(t.radius)} konisk`;
    if (t.type === "roundover") return `R${num(t.radius)} avrundning`;
    if (t.type === "acm") return `${t.codeAngle || t.angle}° V-spår`;
    return `${num(t.d)} mm`;
  }

  // ---------- Händelser ----------
  let lastCopy = "";
  const STEPS = { rpm: RPM_STEP, maxfeed: 100, feed: 50, depth: 0.5 };
  document.addEventListener("click", (e) => {
    const a = e.target.closest("[data-article]");
    if (a) { state.article = a.dataset.article; render(); return; }
    const b = e.target.closest("[data-step]");
    if (!b) return;
    const which = b.dataset.step, dir = +b.dataset.dir;
    if (which === "rpm") { state.rpmAuto = false; state.rpm = clamp(Math.round((state.rpm + dir * RPM_STEP) / RPM_STEP) * RPM_STEP, RPM_MIN, RPM_MAX); }
    if (which === "maxfeed") state.maxFeed = clamp(state.maxFeed + dir * STEPS.maxfeed, 300, 30000);
    if (which === "feed") { state.feedAuto = false; state.feed = clamp(Math.round((state.feed + dir * STEPS.feed) / 50) * 50, 50, 30000); }
    if (which === "depth") state.depth = clamp(Math.round((state.depth + dir * STEPS.depth) * 2) / 2, 0.5, 100);
    render();
  });
  function bindInput(id, apply) {
    const i = $(id);
    i.addEventListener("change", () => { const v = parseFloat(String(i.value).replace(",", ".")); if (!isNaN(v)) apply(v); render(); });
    i.addEventListener("keydown", (e) => { if (e.key === "Enter") i.blur(); });
  }
  bindInput("rpm", (v) => { state.rpmAuto = false; state.rpm = clamp(Math.round(v), RPM_MIN, RPM_MAX); });
  bindInput("maxfeed", (v) => { state.maxFeed = clamp(Math.round(v), 300, 30000); });
  bindInput("feedin", (v) => { state.feedAuto = false; state.feed = clamp(Math.round(v), 50, 30000); });
  bindInput("depth", (v) => { state.depth = clamp(Math.round(v * 10) / 10, 0.1, 100); });

  $("copy").addEventListener("click", () => {
    const toast = $("toast");
    const done = () => { toast.textContent = "Kopierat"; setTimeout(() => (toast.textContent = ""), 1800); };
    const fallback = () => {
      const ta = el("textarea", { style: "position:fixed;opacity:0" }); ta.value = lastCopy; document.body.appendChild(ta); ta.select();
      try { document.execCommand("copy"); done(); } catch (e) { toast.textContent = "Kunde inte kopiera"; }
      ta.remove();
    };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(lastCopy).then(done, fallback);
    else fallback();
  });

  $("dock").addEventListener("click", () => $("result").scrollIntoView({ behavior: "smooth", block: "start" }));
  if ("IntersectionObserver" in window) {
    new IntersectionObserver((ents) => ents.forEach((en) => $("dock").classList.toggle("away", en.isIntersecting)), { threshold: 0.15 }).observe($("result"));
  }

  // Källa
  const ver = /Version\s+([\d.]+)/.exec(DB.notes);
  const prof = /Profil:\s*([^\n]+)/.exec(DB.notes);
  const advice = DB.notes.split("\n").filter((l) => l.startsWith("Startvärden")).join(" ");
  $("source").innerHTML =
    `<p>${advice || "Startvärden för provfräsning."}</p>` +
    `<p>Skärdata från verktygsdatabasen <b>${DB.library}</b>${ver ? ` version ${ver[1]}` : ""}${prof ? `, profil ${prof[1].trim()}` : ""} (${DB.tools.length} fräsar). ` +
    `Matning = chipload × antal skär × varvtal, begränsad av maskinens maxmatning. Nedmatning, skärdjup och stegöver följer databasen.</p>`;

  // ---------- Illustrationer ----------
  function cube(top, left, right, extra) {
    return `<svg width="64" height="54" viewBox="0 0 64 54" aria-hidden="true">
      <g stroke="currentColor" stroke-opacity=".35" stroke-width=".8" stroke-linejoin="round">
        <path d="M32 4 60 18 32 32 4 18Z" fill="${top}"/>
        <path d="M4 18 32 32 32 50 4 36Z" fill="${left}"/>
        <path d="M32 32 60 18 60 36 32 50Z" fill="${right}"/>
      </g>${extra || ""}</svg>`;
  }
  const grainL = (c) => `<g fill="none" stroke="${c}" stroke-width=".9" opacity=".7"><path d="M5 22c8 3 15 8 26 12"/><path d="M5 27c9 3 14 6 26 12"/><path d="M5 32c7 2 16 7 26 11"/></g>`;
  const rings = (c) => `<g fill="none" stroke="${c}" stroke-width=".9" opacity=".7"><path d="M39 33c3-4 9-6 13-6"/><path d="M42 36c3-3 7-5 11-5"/><path d="M36 40c4-6 12-10 20-10"/></g>`;
  const plies = (c) => `<g fill="none" stroke="${c}" stroke-width="1.1" opacity=".75"><path d="M4 22.5 32 36.5 60 22.5"/><path d="M4 27 32 41 60 27"/><path d="M4 31.5 32 45.5 60 31.5"/></g>`;
  function dots(c, n, seed) {
    let s = seed, out = "";
    const rnd = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
    for (let i = 0; i < n; i++) {
      const u = rnd(), v = rnd(), face = i % 3;
      let x, y;
      if (face === 0) { x = 32 + (u - v) * 26; y = 18 + (u + v - 1) * 13; }
      else if (face === 1) { x = 6 + u * 24; y = 20 + u * 12 + v * 16; }
      else { x = 34 + u * 24; y = 32 - u * 12 + v * 16; }
      out += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${(0.5 + rnd() * 0.6).toFixed(2)}" fill="${c}"/>`;
    }
    return `<g opacity=".55">${out}</g>`;
  }
  const MATERIAL_SVG = {
    hardwood: cube("#a2643a", "#7c4626", "#8d532e", grainL("#5a2f17") + rings("#5a2f17") + `<path d="M14 15c8-2 18 2 26 0" stroke="#6b3a1d" stroke-width=".8" fill="none" opacity=".6"/>`),
    softwood: cube("#ecd6a4", "#d9b979", "#e3c58c", plies("#b48a45")),
    mdf: cube("#b88c5c", "#99703f", "#a77c4b", dots("#5d3f1d", 60, 7)),
    melamine: cube("#f4f1ea", "#c39a68", "#cfa776", `<path d="M4 20 32 34 60 20" stroke="#f4f1ea" stroke-width="2.4" fill="none"/>` + dots("#6d4a25", 34, 3)),
    acrylic: cube("rgba(176,214,236,.75)", "rgba(132,186,216,.7)", "rgba(152,200,226,.7)", `<g stroke="#fff" stroke-width="1.2" opacity=".9" fill="none"><path d="M18 14 34 22"/><path d="M8 26 14 40"/><path d="M46 28 52 25"/></g>`),
    hardplastic: cube("#3a3d40", "#24272a", "#2e3134", `<ellipse cx="32" cy="17" rx="5" ry="2.6" fill="#141618"/>`),
    softplastic: cube("#f1efe8", "#d7d4ca", "#e3e0d7", ""),
    aluminium: cube("#d9dde1", "#a9b0b7", "#bfc5cb", `<g fill="none" stroke="#fff" stroke-width=".6" opacity=".8"><path d="M10 18 34 30"/><path d="M16 15 40 27"/><path d="M24 11 48 23"/></g><circle cx="38" cy="14" r="1.6" fill="#7d858c"/>`),
    fr4: cube("#3f7d3a", "#c9b56a", "#d4c178", `<g fill="none" stroke="#d9a441" stroke-width="1.4" stroke-linecap="round"><path d="M16 17 26 12 36 17"/><path d="M28 24 40 18 50 23"/></g><g fill="#d9a441"><circle cx="16" cy="17" r="1.6"/><circle cx="50" cy="23" r="1.6"/></g><g fill="none" stroke="#2f2f2f" stroke-width="2"><path d="M4 24 32 38 60 24" opacity=".7"/></g>`),
    acm: cube("#e7eaed", "#30343a", "#3a3f46", `<g stroke="#e7eaed" stroke-width="2.2" fill="none"><path d="M4 19.5 32 33.5 60 19.5"/><path d="M4 35 32 49 60 35"/></g>`),
  };

  // Fräsar ritas lodrätt: skaft upptill, skärdel nertill
  function bit(body, extra) {
    return `<svg width="44" height="60" viewBox="0 0 44 72" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round">
      <rect x="15" y="3" width="14" height="28" rx="2" fill="var(--surface-2)"/>
      ${body}${extra || ""}</svg>`;
  }
  const fl = "var(--surface-2)";
  const arrow = (up) => up
    ? `<path d="M38 56V38M34 42l4-4 4 4" stroke-width="1.4"/>`
    : `<path d="M38 38v18M34 52l4 4 4-4" stroke-width="1.4"/>`;
  const TOOL_SVG = {
    upcut: bit(`<path d="M15 31h14v33H15z" fill="${fl}"/><path d="M15 62 29 50M15 52 29 40M15 42 29 33"/>`, arrow(true)),
    downcut: bit(`<path d="M15 31h14v33H15z" fill="${fl}"/><path d="M15 50 29 62M15 40 29 52M15 32 27 41"/>`, arrow(false)),
    compression: bit(`<path d="M15 31h14v33H15z" fill="${fl}"/><path d="M15 64 29 54M15 56 27 47"/><path d="M15 38 29 47M17 31 29 39"/>`),
    straight: bit(`<path d="M15 31h14v33H15z" fill="${fl}"/><path d="M22 33v29"/>`),
    vbit: bit(`<path d="M15 31h14v5L22 66 15 36z" fill="${fl}"/><path d="M22 36v28"/>`),
    ball: bit(`<path d="M15 31h14v26a7 7 0 0 1-14 0z" fill="${fl}"/><path d="M15 54 29 44M15 44 29 35"/>`),
    tapered: bit(`<path d="M15 31h14l-5 31a2 2 0 0 1-4 0z" fill="${fl}"/><path d="M16 42 27 36M18 52 26 46"/>`),
    roundover: bit(`<path d="M15 31h14v4h6v6a10 10 0 0 0-10 10h-1v6h-9z" fill="${fl}"/><rect x="17" y="58" width="10" height="6" rx="2" fill="${fl}"/>`),
    surfacing: bit(`<path d="M17 31h10v12H17z" fill="${fl}"/><path d="M4 43h36v10H4z" fill="${fl}"/><path d="M10 53v-4M22 53v-4M34 53v-4"/>`),
    flush: bit(`<path d="M15 31h14v24H15z" fill="${fl}"/><path d="M15 50 29 42M15 41 29 34"/><rect x="14" y="56" width="16" height="8" rx="3" fill="${fl}"/>`),
    pcb: bit(`<path d="M18 31h8v33h-8z" fill="${fl}"/><path d="M18 36l8 4M18 42l8 4M18 48l8 4M18 54l8 4M26 36l-8 4M26 42l-8 4M26 48l-8 4M26 54l-8 4" stroke-width="1"/>`),
    acm: bit(`<path d="M15 31h14v6H15z" fill="${fl}"/><path d="M5 37h34L22 56z" fill="${fl}"/><path d="M22 40v14"/>`),
  };

  render();
})();
