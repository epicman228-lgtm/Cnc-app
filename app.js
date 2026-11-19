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
    { id: "ball", label: "Kulfräs", sub: "Ball nose", rows: ["d"], blurb: "Halvrund spets för 3D-relief och mjuka konturer. Radien är halva diametern.",
      rowDefs: { d: { label: "Diameter och radie", fmt: (v) => `Ø${num(v)} · R${num(radiusFor("ball", v))}` } } },
    { id: "tapered", label: "Konisk kulfräs", sub: "Tapered ball", rows: ["radius"], blurb: "Konisk kropp med rundad spets. Fina 3D-detaljer med en stabil fräs. Välj spetsradie.",
      rowDefs: { radius: { label: "Spetsradie", fmt: (v) => `R${num(v)}` } } },
    { id: "compression", label: "Kompression", sub: "Upp + ned", rows: ["d"], blurb: "Uppåtskärande nertill och nedåtskärande upptill. Rena kanter på båda sidor av skivan." },
    { id: "straight", label: "Notfräs", sub: "Raka skär", rows: ["d"], blurb: "Raka skär för spår, fickor och kanter i trä och plast." },
    { id: "roundover", label: "Avrundning", sub: "Kantradie", rows: ["radius"], blurb: "Rundar av kanter. Välj radie.",
      rowDefs: { radius: { fmt: (v) => `R${num(v)}` } } },
    { id: "surfacing", label: "Planfräs", sub: "Spoilboard", rows: ["d"], blurb: "Bred fräs för att plana spoilboard och stora ytor." },
    { id: "flush", label: "Kopierfräs", sub: "Med lager", rows: ["d"], blurb: "Kopierfräs med lager som följer en mall." },
    { id: "pcb", label: "PCB-fräs", sub: "Majskolv", rows: ["d"], blurb: "Fräs för FR4 och kretskort." },
    { id: "acm", label: "V-spår ACM", sub: "Vikspår", rows: ["d"], blurb: "V-spår för att vika ACM- och Dibondskivor." },
  ];
  const TYPE = Object.fromEntries(TYPES.map((t) => [t.id, t]));
  function radiusFor(type, d) { const t = TOOLS.find((x) => x.type === type && x.d === d); return t && t.radius != null ? t.radius : d / 2; }

  const ROWS = {
    d: { label: "Diameter", unit: "mm", get: (t) => t.d, fmt: (v) => num(v) },
    angle: { label: "Vinkel", unit: "grader", get: (t) => t.angle, fmt: (v) => num(v) + "°" },
    tip: { label: "Spetsbredd", unit: "mm", get: (t) => t.tip, fmt: (v) => num(v) },
    radius: { label: "Radie", unit: "mm", get: (t) => t.radius, fmt: (v) => num(v) },
  };

  const RPM_MIN = 3000, RPM_MAX = 30000, RPM_STEP = 500;

  // ---------- State ----------
  const STORE_KEY = "frasmatning.v1";
  const state = Object.assign(
    { material: "hardwood", type: "upcut", sel: { d: 4 }, flutes: 2, article: null, rpm: null, rpmAuto: true, feed: null, feedAuto: true, depth: 6, collapsed: [] },
    load()
  );

  function load() {
    try {
      const s = JSON.parse(localStorage.getItem(STORE_KEY)) || {};
      delete s.ownOn; delete s.own; delete s.maxFeed;
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
    const recFeed = Math.round(ideal);
    if (state.feedAuto || !state.feed) state.feed = recFeed;
    const feed = state.feed;
    const chip = feed / (z * rpm);
    const ratio = chip / rec;
    const zone = ratio < 0.8 ? 0 : ratio > 1.2 ? 2 : 1;
    const plunge = Math.round(feed * (cut.plunge / cut.feed));
    const rpmForFeed = (f) => Math.round(f / (rec * z) / 100) * 100;   // varvtal som ger rätt chipload vid matning f
    return { feed, recFeed, ideal, chip, rec, ratio, zone, plunge, rpmForFeed };
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
        const b = el("button", { type: "button", class: "tile", "data-id": m.id, on: { click: () => { state.material = m.id; state.feedAuto = true; render(); } } },
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
      const def = Object.assign({}, ROWS[row.key], (r.type.rowDefs || {})[row.key]);
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

    if (r.type.id === "tapered") {
      const ds = uniq(r.cands.map((t) => t.d)).map((d) => `Ø${num(d)} mm`).join(", ");
      const as = uniq(r.cands.map((t) => t.codeAngle)).map((a) => `${a}°`).join(", ");
      box.appendChild(el("p", { class: "note" }, `Spetsradien är radien på den rundade toppen. Skaft ${ds}, konvinkel ${as}.`));
    }
    const hints = { vbit: "Diameter, vinkel och spetsbredd", ball: "Diameter, radie och antal skär", tapered: "Spetsradie och antal skär", roundover: "Radie och antal skär" };
    $("dim-hint").textContent = hints[r.type.id] || "Diameter (mm) och antal skär";
  }

  function renderMachine(r, c) {
    const rpmIn = $("rpm"), fIn = $("feedin"), dIn = $("depth");
    if (document.activeElement !== rpmIn) rpmIn.value = state.rpm;
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
        `Höj matningen till ${num(c.recFeed, 0)} mm/min` +
        (rpmFix < state.rpm ? ` eller sänk varvtalet till ${num(rpmFix, 0)} rpm. <button type="button" class="linkbtn" data-rpm="${rpmFix}">Använd ${num(rpmFix, 0)} rpm</button>` : ".") + `</p>`);
    } else if (!state.feedAuto && zone === 2) {
      const rpmFix = c.rpmForFeed(c.feed);
      msgs.push(`<p><b>För hög chipload (${num(c.ratio * 100, 0)} % av rätt).</b> Risk för fräsbrott, vibrationer och dålig yta. Sänk matningen till ${num(c.recFeed, 0)} mm/min` +
        (rpmFix <= RPM_MAX ? ` eller höj varvtalet till ${num(rpmFix, 0)} rpm. <button type="button" class="linkbtn" data-rpm="${rpmFix}">Använd ${num(rpmFix, 0)} rpm</button>` : ".") +
        ` Skärdjupet nedan är sänkt för att kompensera.</p>`);
    }
    call.innerHTML = msgs.join("");
    call.hidden = !msgs.length;
    call.querySelectorAll("[data-rpm]").forEach((b) => b.addEventListener("click", () => { state.rpmAuto = false; state.rpm = +b.dataset.rpm; render(); }));

    renderDepth(r, c);

    current = {
      material: state.material, code: tool.code, rpm: state.rpm, feed: c.feed, feedAuto: state.feedAuto,
      plunge: c.plunge, passDepth: lastPlan.ap, stepover: cut.stepover, d: tool.d,
      chip: Math.round(c.chip * 1000) / 1000, rec: c.rec, depth: state.depth,
    };
    $("chip-line").innerHTML = `Chipload <b>${num(c.chip, 3)}</b> mm/tand · rätt för materialet <b>${num(c.rec, 3)}</b>${cut.chipSource === "calc" ? " (beräknad)" : ""}`;
    const savedHere = findSaved(tool.code, state.material);
    const view = Object.assign({}, current, { toolNo: savedHere ? savedHere.toolNo : "" });
    const info = [tool.group, tool.len ? `skärlängd ${num(tool.len)} mm` : "", tool.dlc ? "DLC-belagd" : ""].filter(Boolean).join(" · ");
    let tip = "";
    if (tool.vtype === 5) tip = `<p class="note">Saknar din Aspire typen Tapered Ball Nose? Välj Ball Nose med diameter ${aspNum(tool.radius * 2)} mm (två gånger spetsradien).</p>`;
    $("aspire").innerHTML =
      `<div class="asp-head"><h3>Inmatning i Aspire 8.5</h3><span class="asp-toast" role="status" data-idle="Tryck på ett värde för att kopiera">Tryck på ett värde för att kopiera</span></div>` +
      `<p class="asp-info">${TOOL_SVG[tool.type]}<span>${info}</span></p>` + aspireHTML(view) + tip;

    // Mobilfot
    $("dock-feed").textContent = num(c.feed, 0);
    $("dock-sub").textContent = `${num(c.chip, 3)} mm/tand · ${["för lite", "rätt", "för mycket"][zone]}`;
    $("dock-mark").style.left = (pos * 100).toFixed(1) + "%";

    lastCopy = aspireText(view) + "\n" + [
      `Chipload: ${num(c.chip, 3)} mm/tand (rätt: ${num(c.rec, 3)})`,
      `Djup ${num(lastPlan.total, 1)} mm: ${lastPlan.passes} pass à ${num(lastPlan.perPass, 2)} mm`,
    ].join("\n");
  }
  let current = null;

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
    if (t.type === "tapered") return `R${num(t.radius)} konisk${t.codeAngle ? ` ${t.codeAngle}°` : ""}`;
    if (t.type === "ball") return `Ø${num(t.d)} mm R${num(t.radius != null ? t.radius : t.d / 2)}`;
    if (t.type === "roundover") return `R${num(t.radius)} avrundning`;
    if (t.type === "acm") return `${t.codeAngle || t.angle}° V-spår`;
    return `${num(t.d)} mm`;
  }

  // ---------- Händelser ----------
  let lastCopy = "";
  const STEPS = { rpm: RPM_STEP, feed: 50, depth: 0.5 };
  document.addEventListener("click", (e) => {
    const a = e.target.closest("[data-article]");
    if (a) { state.article = a.dataset.article; render(); return; }
    const b = e.target.closest("[data-step]");
    if (!b) return;
    const which = b.dataset.step, dir = +b.dataset.dir;
    if (which === "rpm") { state.rpmAuto = false; state.rpm = clamp(Math.round((state.rpm + dir * RPM_STEP) / RPM_STEP) * RPM_STEP, RPM_MIN, RPM_MAX); }
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
  bindInput("feedin", (v) => { state.feedAuto = false; state.feed = clamp(Math.round(v), 50, 30000); });
  bindInput("depth", (v) => { state.depth = clamp(Math.round(v * 10) / 10, 0.1, 100); });

  function copyText(text, toast) {
    const idle = toast.dataset.idle || "";
    const done = () => { toast.textContent = text.length < 40 && !text.includes("\n") ? `Kopierat: ${text}` : "Kopierat"; setTimeout(() => (toast.textContent = idle), 1800); };
    const fallback = () => {
      const ta = el("textarea", { style: "position:fixed;opacity:0" }); ta.value = text; document.body.appendChild(ta); ta.select();
      try { document.execCommand("copy"); done(); } catch (e) { toast.textContent = "Kunde inte kopiera"; }
      ta.remove();
    };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, fallback);
    else fallback();
  }
  $("copy").addEventListener("click", () => copyText(lastCopy, $("toast")));
  // Tryck på ett Aspire-värde för att kopiera just det
  document.addEventListener("click", (e) => {
    const v = e.target.closest(".asp-val[data-copy]");
    if (!v) return;
    const box = v.closest(".saved") || v.closest("#result");
    const toast = box && (box.querySelector(".asp-toast") || box.querySelector(".toast"));
    if (toast) copyText(v.dataset.copy, toast);
  });

  // ---------- Mina fräsar: sparade inställningar per fräs och material ----------
  const SAVED_KEY = "frasmatning.saved.v1";
  let saved = [];
  try { saved = JSON.parse(localStorage.getItem(SAVED_KEY)) || []; } catch (e) { saved = []; }
  function persistSaved() {
    try { localStorage.setItem(SAVED_KEY, JSON.stringify(saved)); return true; } catch (e) { return false; }
  }
  const matName = (id) => (MATERIALS.find((m) => m.id === id) || { full: id }).full;
  const findSaved = (code, material) => saved.find((x) => x.code === code && x.material === material);
  let savedFilter = "all";

  function updateSavedCount() { $("saved-count").textContent = saved.length; }

  // ---------- Aspire 8.5: samma fält, ordning och talformat som verktygsdialogen ----------
  const ASP_TYPE = { 1: "End Mill", 2: "Ball Nose", 4: "V-Bit", 5: "Tapered Ball Nose" };
  // Punkt som decimaltecken och minst en decimal, som Aspire visar talen (1.0, 2400.0)
  function aspNum(v, dec) {
    if (v == null || isNaN(v)) return "";
    const f = Math.pow(10, dec == null ? 3 : dec);
    let out = String(Math.round(v * f) / f);
    if (!out.includes(".")) out += ".0";
    return out;
  }
  function aspireModel(x) {
    const t = TOOLS.find((y) => y.code === x.code) || {};
    const geo = [];
    if (t.vtype === 5) {
      geo.push(["Tip Radius (R)", [[aspNum(t.radius), "mm"]]]);
      geo.push(["Diameter (D)", [[aspNum(t.d), "mm"]]]);
      if (t.angle) geo.push(["Angle (A)", [[aspNum(t.angle, 1), "°"]]]);
    } else {
      geo.push(["Diameter (D)", [[aspNum(t.d), "mm"]]]);
      if (t.vtype === 4) {
        geo.push(["Angle (A)", [[aspNum(t.angle, 1), "°"]]]);
        if (t.tip) geo.push(["Flat Diameter (F)", [[aspNum(t.tip), "mm"]]]);
      }
    }
    const pct = t.d ? aspNum((x.stepover / t.d) * 100, 1) : "";
    return [
      ["Tool Info", [
        ["Name", [[x.code, ""]]],
        ["Tool Type", [[ASP_TYPE[t.vtype] || "End Mill", ""]]],
        ["Notes", [[matName(x.material) + (x.note ? `, ${x.note}` : ""), ""]]],
      ]],
      ["Geometry", geo],
      ["Cutting Parameters", [
        ["Pass Depth", [[aspNum(x.passDepth, 2), "mm"]]],
        ["Stepover", [[aspNum(x.stepover, 3), "mm"], [pct, "%"]]],
      ]],
      ["Feeds and Speeds", [
        ["Spindle Speed", [[String(Math.round(x.rpm)), "r.p.m"]]],
        ["Feed Rate", [[aspNum(x.feed, 0), "mm/min"]]],
        ["Plunge Rate", [[aspNum(x.plunge, 0), "mm/min"]]],
      ]],
      ["Tool Number", [["Tool Number", [[x.toolNo || "", ""]]]]],
    ];
  }
  function aspireHTML(x) {
    return aspireModel(x).map(([title, rows]) => `<section class="asp-group">` +
      (title !== "Tool Number" ? `<h4>${title}</h4>` : "") +
      rows.map(([label, vals]) => `<div class="asp-row${title === "Tool Number" ? " strong" : ""}"><span class="asp-k">${label}</span><span class="asp-vals">` +
        vals.map(([v, u]) => (v !== ""
          ? `<button type="button" class="asp-val${title === "Tool Info" ? " wide" : ""}" data-copy="${escapeHtml(v)}" aria-label="Kopiera ${label}: ${escapeHtml(v)}">${escapeHtml(v)}</button>`
          : `<span class="asp-val empty">valfritt</span>`) + (u ? `<span class="asp-unit">${u}</span>` : "")).join("") +
        `</span></div>`).join("") + `</section>`).join("");
  }
  function aspireText(x) {
    const lines = x.name ? [x.name] : [];
    aspireModel(x).forEach(([, rows]) => rows.forEach(([label, vals]) => {
      const v = vals.filter(([val]) => val !== "").map(([val, u]) => (u ? `${val} ${u}` : val)).join(" / ");
      if (v) lines.push(`${label}: ${v}`);
    }));
    return lines.join("\n");
  }

  // Spara-formuläret
  const form = $("save-form");
  $("save-open").addEventListener("click", () => {
    if (!current) return;
    const t = TOOLS.find((x) => x.code === current.code);
    const old = findSaved(current.code, current.material);
    $("save-name").value = old ? old.name : `${TYPE[t.type].label} ${toolShort(t)} · ${matName(current.material)}`;
    $("save-toolno").value = old ? old.toolNo || "" : "";
    $("save-note").value = old ? old.note || "" : "";
    $("save-hint").textContent = old
      ? `Du har redan sparat ${current.code} för ${matName(current.material).toLowerCase()}. Den sparade versionen ersätts med värdena som visas nu.`
      : `Sparar matning ${num(current.feed, 0)} mm/min, varvtal ${num(current.rpm, 0)} rpm, nedmatning, skärdjup och stegöver.`;
    form.hidden = false;
    $("save-name").focus();
  });
  $("save-cancel").addEventListener("click", () => { form.hidden = true; });
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    if (!current) return;
    const old = findSaved(current.code, current.material);
    const entry = Object.assign({}, current, {
      id: old ? old.id : String(Date.now()),
      name: $("save-name").value.trim() || current.code,
      toolNo: $("save-toolno").value.trim(),
      note: $("save-note").value.trim(),
      savedAt: Date.now(),
    });
    if (old) saved[saved.indexOf(old)] = entry; else saved.unshift(entry);
    const ok = persistSaved();
    form.hidden = true;
    updateSavedCount();
    const toast = $("toast");
    toast.textContent = !ok ? "Sparad tills appen stängs (enheten tillåter inte lagring)" : old ? "Uppdaterad i Mina fräsar" : "Sparad i Mina fräsar";
    setTimeout(() => (toast.textContent = ""), 2600);
  });

  // Listan
  const sheet = $("sheet");
  let lastFocus = null;
  function openSheet() {
    lastFocus = document.activeElement;
    $("export-mat").textContent = matName(state.material).toLowerCase();
    $("export-note").textContent = "";
    renderSaved();
    sheet.hidden = false;
    document.body.style.overflow = "hidden";
    $("sheet-close").focus();
  }
  function closeSheet() {
    sheet.hidden = true;
    document.body.style.overflow = "";
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }
  $("open-saved").addEventListener("click", openSheet);
  $("sheet-close").addEventListener("click", closeSheet);
  sheet.addEventListener("click", (e) => { if (e.target === sheet) closeSheet(); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !sheet.hidden) closeSheet(); });

  function renderSaved() {
    const mats = MATERIALS.filter((m) => saved.some((x) => x.material === m.id));
    if (savedFilter !== "all" && !mats.some((m) => m.id === savedFilter)) savedFilter = "all";
    $("saved-filter").innerHTML = mats.length > 1
      ? [`<button type="button" data-filter="all" aria-pressed="${savedFilter === "all"}">Alla (${saved.length})</button>`]
          .concat(mats.map((m) => `<button type="button" data-filter="${m.id}" aria-pressed="${savedFilter === m.id}">${m.label} (${saved.filter((x) => x.material === m.id).length})</button>`)).join("")
      : "";
    const list = saved.filter((x) => savedFilter === "all" || x.material === savedFilter);
    if (!saved.length) {
      $("saved-list").innerHTML = `<div class="empty"><b>Inga sparade fräsar än.</b><span>Ställ in material och fräs, tryck sedan <b>Spara fräsen</b> under resultatet. Här ser du sedan matning, varvtal och de andra värdena att skriva in i Aspire.</span></div>`;
      return;
    }
    $("saved-list").innerHTML = list.map((x) => {
      const t = TOOLS.find((y) => y.code === x.code);
      const date = new Date(x.savedAt).toLocaleDateString("sv-SE", { day: "numeric", month: "short", year: "numeric" });
      return `<article class="saved" data-id="${x.id}">
        <div class="saved-top">${t ? TOOL_SVG[t.type] : ""}<h3>${escapeHtml(x.name)}</h3><code>${escapeHtml(x.code)}</code>
          <span class="meta">${escapeHtml(matName(x.material))}${x.toolNo ? ` · verktyg ${escapeHtml(x.toolNo)}` : ""} · sparad ${date}</span></div>
        <div class="saved-feed"><b>${num(x.feed, 0)}</b><span>mm/min matning</span></div>
        <div class="asp">${aspireHTML(x)}</div>
        ${x.note ? `<p class="saved-note">${escapeHtml(x.note)}</p>` : ""}
        <div class="actions">
          <button type="button" class="btn" data-act="load"${t ? "" : " disabled"}>Öppna i kalkylatorn</button>
          <button type="button" class="btn ghost" data-act="copy">Kopiera</button>
          <button type="button" class="btn danger" data-act="del">Ta bort</button>
          <span class="toast" role="status"></span>
        </div>
      </article>`;
    }).join("");
  }

  $("saved-filter").addEventListener("click", (e) => {
    const b = e.target.closest("[data-filter]");
    if (b) { savedFilter = b.dataset.filter; renderSaved(); }
  });
  $("saved-list").addEventListener("click", (e) => {
    const b = e.target.closest("[data-act]");
    if (!b) return;
    const card = b.closest(".saved");
    const x = saved.find((y) => y.id === card.dataset.id);
    if (!x) return;
    if (b.dataset.act === "copy") copyText(aspireText(x), card.querySelector(".toast"));
    if (b.dataset.act === "del") {
      if (!b.classList.contains("armed")) {
        b.classList.add("armed");
        b.textContent = "Tryck igen för att ta bort";
        setTimeout(() => { if (b.isConnected) { b.classList.remove("armed"); b.textContent = "Ta bort"; } }, 3500);
        return;
      }
      saved = saved.filter((y) => y !== x);
      persistSaved();
      updateSavedCount();
      renderSaved();
    }
    if (b.dataset.act === "load") {
      const t = TOOLS.find((y) => y.code === x.code);
      if (!t) return;
      state.material = t.cuts[x.material] ? x.material : state.material;
      applyTool(t);
      state.rpmAuto = false;
      state.rpm = x.rpm;
      state.feedAuto = !!x.feedAuto;
      state.feed = x.feed;
      if (x.depth) state.depth = x.depth;
      render();
      closeSheet();
      $("result").scrollIntoView({ behavior: "smooth", block: "start" });
    }
  });
  updateSavedCount();

  // ---------- Export till Aspire 8.5 (.tool) ----------
  const isExportable = (t) => t && window.AspireTool && window.AspireTool.supportedVtype(t.vtype);
  function toolForExport(x) {
    const t = TOOLS.find((y) => y.code === x.code);
    return {
      name: x.code, d: t.d, passDepth: x.passDepth, stepover: x.stepover, feed: x.feed, plunge: x.plunge,
      rpm: x.rpm, toolNo: x.toolNo || 1,
      notes: matName(x.material) + (x.note ? `, ${x.note}` : ""),
      path: matName(x.material),
    };
  }
  function groupsByMaterial(entries) {
    return MATERIALS.filter((m) => entries.some((x) => x.material === m.id))
      .map((m) => ({ name: m.full, tools: entries.filter((x) => x.material === m.id).map(toolForExport) }));
  }
  // Databasens värden vid databasens varvtal, som kalkylatorn räknar dem
  function dbEntry(t, material) {
    const cut = t.cuts[material];
    const feed = Math.round(cut.chip * t.flutes * cut.rpm);
    return { code: t.code, material, rpm: cut.rpm, feed, plunge: Math.round(feed * (cut.plunge / cut.feed)),
      passDepth: cut.stepdown, stepover: cut.stepover, toolNo: "", note: "" };
  }

  function bytesToBase64(bytes) {
    let s = "";
    for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(s);
  }
  // Minimal zip (okomprimerad) för vyer som bara tillåter vissa filtyper
  const CRC_TABLE = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  function crc32(b) { let c = 0xffffffff; for (let i = 0; i < b.length; i++) c = CRC_TABLE[(c ^ b[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }
  function zipOne(name, data) {
    const nm = new TextEncoder().encode(name), crc = crc32(data);
    const local = new DataView(new ArrayBuffer(30)), central = new DataView(new ArrayBuffer(46)), end = new DataView(new ArrayBuffer(22));
    [[0, 0x04034b50, 4], [4, 20, 2], [6, 0x0800, 2], [8, 0, 2], [10, 0, 2], [12, 0x21, 2], [14, crc, 4], [18, data.length, 4], [22, data.length, 4], [26, nm.length, 2], [28, 0, 2]]
      .forEach(([o, v, n]) => (n === 4 ? local.setUint32(o, v, true) : local.setUint16(o, v, true)));
    [[0, 0x02014b50, 4], [4, 20, 2], [6, 20, 2], [8, 0x0800, 2], [10, 0, 2], [12, 0, 2], [14, 0x21, 2], [16, crc, 4], [20, data.length, 4], [24, data.length, 4], [28, nm.length, 2], [30, 0, 2], [32, 0, 2], [34, 0, 2], [36, 0, 2], [38, 0, 4], [42, 0, 4]]
      .forEach(([o, v, n]) => (n === 4 ? central.setUint32(o, v, true) : central.setUint16(o, v, true)));
    const cdOffset = 30 + nm.length + data.length, cdSize = 46 + nm.length;
    [[0, 0x06054b50, 4], [4, 0, 2], [6, 0, 2], [8, 1, 2], [10, 1, 2], [12, cdSize, 4], [16, cdOffset, 4], [20, 0, 2]]
      .forEach(([o, v, n]) => (n === 4 ? end.setUint32(o, v, true) : end.setUint16(o, v, true)));
    const out = new Uint8Array(cdOffset + cdSize + 22);
    let p = 0;
    for (const part of [new Uint8Array(local.buffer), nm, data, new Uint8Array(central.buffer), nm, new Uint8Array(end.buffer)]) { out.set(part, p); p += part.length; }
    return out;
  }

  // Spara filen: Android-appen, vanlig webbläsare, eller Claude-vyn (som zip)
  async function saveToolFile(filename, bytes) {
    if (window.AndroidBridge && window.AndroidBridge.saveFile) {
      window.AndroidBridge.saveFile(filename, bytesToBase64(bytes), "application/octet-stream");
      return "Välj var filen ska sparas.";
    }
    if (window.top === window) {
      const url = URL.createObjectURL(new Blob([bytes], { type: "application/octet-stream" }));
      const a = el("a", { href: url, download: filename });
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
      return `Sparade ${filename}.`;
    }
    const dl = window.claude && window.claude.use ? await window.claude.use("downloads").catch(() => null) : null;
    if (!dl) throw { code: "unavailable" };
    const zipName = filename.replace(/\.tool$/, ".zip");
    await dl.save({ filename: zipName, data: new Blob([zipOne(filename, bytes)], { type: "application/zip" }) });
    return `Sparade ${zipName}. Packa upp den och importera ${filename} i Aspire.`;
  }

  // Alla fräsar för ett material: en grupp per frästyp, sorterade på diameter
  function groupsByType(entries, material) {
    const withTool = entries.map((x) => ({ x, t: TOOLS.find((y) => y.code === x.code) }));
    return TYPES.filter((ty) => withTool.some((e) => e.t.type === ty.id)).map((ty) => ({
      name: `${matName(material)} · ${ty.label}`,
      tools: withTool.filter((e) => e.t.type === ty.id).sort((a, b) => a.t.d - b.t.d || (a.t.len || 0) - (b.t.len || 0)).map((e) => {
        const tool = toolForExport(e.x);
        tool.path = `${matName(material)} · ${ty.label}`;
        return tool;
      }),
    }));
  }

  async function exportEntries(entries, filename, grouper) {
    const note = $("export-note");
    const ok = entries.filter((x) => isExportable(TOOLS.find((y) => y.code === x.code)));
    const skipped = entries.length - ok.length;
    if (!ok.length) {
      note.textContent = entries.length
        ? "Inga av fräsarna kan exporteras än. Just nu stöds bara typen End Mill (upcut, downcut, kompression, notfräs, planfräs, PCB- och kopierfräs)."
        : "Det finns inga fräsar att exportera.";
      return;
    }
    try {
      const bytes = window.AspireTool.build(grouper ? grouper(ok) : groupsByMaterial(ok));
      const msg = await saveToolFile(filename, bytes);
      note.textContent = `${msg} ${ok.length} fräs${ok.length === 1 ? "" : "ar"}.` +
        (skipped ? ` ${skipped} kulfräs/V-bit/konisk togs inte med, de typerna stöds inte än.` : "");
    } catch (e) {
      const code = e && e.code;
      note.textContent = code === "declined" ? "Exporten avbröts." : "Filen kunde inte sparas här. Prova i Android-appen eller GitHub Pages-versionen.";
    }
  }

  window.onAndroidSaved = (ok) => {
    $("export-note").textContent = ok ? "Filen sparades. Importera den i Aspires Tool Database." : "Filen sparades inte.";
  };
  $("export-saved").addEventListener("click", () => exportEntries(saved.slice(), "frasmatning-mina-frasar.tool"));
  $("export-all").addEventListener("click", () => {
    const list = TOOLS.filter((t) => t.cuts[state.material] && isExportable(t)).map((t) => dbEntry(t, state.material));
    const mat = state.material;
    exportEntries(list, `frasmatning-${mat}.tool`, (ok) => groupsByType(ok, mat));
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
    `Matning = chipload × antal skär × varvtal. Nedmatning, skärdjup och stegöver följer databasen.</p>`;

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

  // ---------- Hitta fräsen: foto av etiketten eller artikelkod ----------
  const CODES = TOOLS.map((t) => t.code);
  const normCode = (s) => String(s).toUpperCase().replace(/[–—_]/g, "-").replace(/,/g, ".").replace(/\s+/g, "");
  // Tecken som OCR ofta blandar ihop kostar mindre att byta
  const CONFUSE = new Set(["O0", "Q0", "D0", "I1", "L1", "T1", "S5", "B8", "Z2", "G6", "A4"]
    .flatMap((p) => [p, p[1] + p[0]]));
  function dist(a, b) {
    const m = a.length, n = b.length;
    let prev = Array.from({ length: n + 1 }, (_, j) => j), cur = new Array(n + 1);
    for (let i = 1; i <= m; i++) {
      cur[0] = i;
      for (let j = 1; j <= n; j++) {
        const x = a[i - 1], y = b[j - 1];
        const sub = x === y ? 0 : CONFUSE.has(x + y) ? 0.3 : 1;
        cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + sub);
      }
      [prev, cur] = [cur, prev];
    }
    return prev[n];
  }

  // Rangordna fräsar mot avläst text. Lägre poäng = bättre.
  function matchText(text) {
    const flat = normCode(text);
    const tokens = String(text).split(/[\s|,;:]+/).map(normCode).filter(Boolean).slice(0, 400);
    const cands = new Set(tokens.filter((t) => t.length >= 3));
    // Koden kan vara uppdelad på flera ord: prova följder av 2–6 ord, ihopskrivna och med bindestreck
    for (let i = 0; i < tokens.length; i++) {
      for (let k = 2; k <= 6 && i + k <= tokens.length; k++) {
        const part = tokens.slice(i, i + k);
        cands.add(part.join(""));
        cands.add(part.join("-"));
      }
    }
    return TOOLS.map((t) => {
      const c = normCode(t.code);
      if (flat.includes(c)) return { t, score: 0 };
      let best = 1;
      cands.forEach((w) => { best = Math.min(best, dist(w, c) / c.length); });
      return { t, score: best };
    }).sort((a, b) => a.score - b.score);
  }

  // Sök: flera ord (t.ex. "tb r0.5" eller "uc 6.0 l22") måste alla finnas i koden; ett ord tål stavfel.
  function searchCodes(q) {
    const terms = String(q).split(/\s+/).map(normCode).filter(Boolean);
    if (!terms.length) return [];
    return TOOLS.map((t) => {
      const c = normCode(t.code);
      let score = 0;
      for (const n of terms) {
        const i = c.indexOf(n);
        if (c === n) continue;
        if (i === 0) score += 0.1 + (c.length - n.length) / 1000;
        else if (i > 0) score += 0.2 + i / 100;
        else if (terms.length === 1 && n.length >= 4) {
          // Delar mellan bindestrecken: "UC-DLC-1F-D4.0" hittar "UC-AL-DLC-1F-D4.0-…" fast ett led saknas
          const canon = (x) => x.replace(/°/g, "").replace(/(\d)\.0+$/, "$1");
          const qp = n.split("-").filter(Boolean).map(canon), cp = c.split("-").map(canon);
          const hits = qp.filter((x) => cp.includes(x)).length;
          const partScore = qp.length >= 2 ? 0.3 + (1 - hits / qp.length) * 1.5 : 9;
          const whole = 0.5 + dist(n, c) / Math.max(n.length, c.length) * 2;
          const prefix = 0.5 + dist(n, c.slice(0, n.length)) / n.length;
          score += Math.min(partScore, whole, prefix);
        } else return null;
      }
      return { t, score: score / terms.length };
    }).filter((r) => r && r.score < 0.85).sort((a, b) => a.score - b.score).slice(0, 6);
  }

  function describe(t) {
    return [TYPE[t.type].label, toolShort(t), `${t.flutes} skär`, t.len ? `skärlängd ${num(t.len)} mm` : ""].filter(Boolean).join(" · ");
  }

  function applyTool(t) {
    let matNote = "";
    if (!t.cuts[state.material]) {
      // Fräsens eget material först (aluminiumfräs -> aluminium), annars första material med data
      const own = /-AL-/.test(t.code) ? "aluminium" : /^PCB/.test(t.code) ? "fr4" : /^VG-/.test(t.code) ? "acm" : null;
      const m = MATERIALS.find((x) => x.id === own && t.cuts[x.id]) || MATERIALS.find((x) => t.cuts[x.id]);
      const old = MATERIALS.find((x) => x.id === state.material);
      matNote = ` Den saknar data för ${old.full.toLowerCase()}, så materialet byttes till ${m.full.toLowerCase()}.`;
      state.material = m.id;
    }
    state.type = t.type;
    TYPE[t.type].rows.forEach((k) => { state.sel[k] = ROWS[k].get(t); });
    state.flutes = t.flutes;
    state.article = t.code;
    state.feedAuto = true;
    state.collapsed[1] = false;
    state.collapsed[2] = false;
    render();
    return matNote;
  }

  const out = $("finder-out");
  function candList(list, chosen) {
    return `<div class="cands">` + list.map(({ t }) =>
      `<button type="button" class="cand" data-pick="${t.code}" aria-pressed="${t.code === chosen}">${TOOL_SVG[t.type]}<span><code>${t.code}</code><span>${describe(t)}</span></span><span class="pick">${t.code === chosen ? "Vald" : "Välj"}</span></button>`
    ).join("") + `</div>`;
  }
  let lastList = [], lastThumb = "";
  function showResult(list, note) {
    lastList = list;
    const best = list[0];
    const clear = best && best.score <= 0.2 && (!list[1] || list[1].score - best.score >= 0.05);
    let h = lastThumb;
    if (!best || best.score > 0.45) {
      h += `<p class="f-status bad">Hittade ingen artikelkod som stämmer. Ta en skarpare bild rakt framifrån, eller skriv koden i sökfältet.</p>`;
      if (note) h += `<p class="note">Avläst text: ${escapeHtml(note.slice(0, 160))}</p>`;
      out.innerHTML = h;
      return;
    }
    const top = list.filter((r) => r.score <= Math.max(0.45, best.score + 0.15)).slice(0, 3);
    if (clear) {
      const msg = applyTool(best.t);
      h += `<p class="f-status good">Hittade ${best.t.code}.${escapeHtml(msg)}</p>`;
      if (top.length > 1) h += `<p class="note">Fel fräs? Välj en av de andra:</p>`;
      out.innerHTML = h + candList(top, best.t.code);
    } else {
      h += `<p class="f-status">Osäker avläsning. Välj den kod som står på etiketten:</p>`;
      out.innerHTML = h + candList(top, null);
    }
  }
  function escapeHtml(s) { return String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])); }

  out.addEventListener("click", (e) => {
    const b = e.target.closest("[data-pick]");
    if (b) {
      const t = TOOLS.find((x) => x.code === b.dataset.pick);
      const msg = applyTool(t);
      const list = lastList.length ? lastList : [{ t }];
      out.innerHTML = lastThumb + `<p class="f-status good">Vald: ${t.code}.${escapeHtml(msg)}</p>` + candList(list.slice(0, 3), t.code);
      $("code-search").value = "";
    }
    if (e.target.closest("#f-stop") && ctl) ctl.abort();
  });

  // Sökfält
  $("code-search").addEventListener("input", (e) => {
    const list = searchCodes(e.target.value);
    lastThumb = "";
    lastList = list;
    if (!e.target.value.trim()) { out.innerHTML = ""; return; }
    out.innerHTML = list.length ? candList(list, null) : `<p class="f-status bad">Ingen artikelkod matchar.</p>`;
  });

  // Bildavläsning: Claude om sidan körs i en Claude-vy, annars OCR i webbläsaren
  let ctl = null;
  async function getSample() {
    try {
      if (!window.claude || !window.claude.use) return null;
      const s = await window.claude.use("sample");
      if (!s) return null;
      const lim = await s.limits().catch(() => null);
      return lim && lim.images ? s : null;
    } catch (e) { return null; }
  }
  function shrink(file, max) {
    return new Promise((res) => {
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = () => {
        const k = Math.min(1, max / Math.max(img.width, img.height));
        const cv = document.createElement("canvas");
        cv.width = Math.round(img.width * k); cv.height = Math.round(img.height * k);
        cv.getContext("2d").drawImage(img, 0, 0, cv.width, cv.height);
        URL.revokeObjectURL(url);
        cv.toBlob((b) => res({ blob: b || file, thumb: cv.toDataURL("image/jpeg", 0.5) }), "image/jpeg", 0.9);
      };
      img.onerror = () => { URL.revokeObjectURL(url); res({ blob: file, thumb: "" }); };
      img.src = url;
    });
  }
  function loadScript(src) {
    return new Promise((res, rej) => {
      if (window.Tesseract) return res();
      const s = document.createElement("script");
      s.src = src; s.onload = res; s.onerror = () => rej(new Error("load"));
      document.head.appendChild(s);
    });
  }
  async function readWithOcr(blob) {
    await loadScript("https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js");
    const r = await window.Tesseract.recognize(blob, "eng");
    return r.data.text || "";
  }
  async function readWithClaude(sample, blob, signal) {
    const prompt =
      "Bilden visar etiketten eller förpackningen till en CNC-fräs (frässtål). Läs av artikelkoden som är tryckt på den. " +
      "Koden ska vara en av koderna i listan nedan; jämför tecken för tecken (diameter D, skärlängd L, radie R, vinkel ° och suffixet sist). " +
      'Svara endast med JSON: {"codes": [upp till 3 koder ur listan, mest sannolik först, tom lista om ingen passar], "text": "texten du kan läsa på etiketten"}.\n\nKoder:\n' +
      CODES.join("\n");
    return sample.json(prompt, { images: [blob], signal, modelTier: "default", effort: "low" });
  }

  $("photo").addEventListener("change", async (e) => {
    const file = e.target.files && e.target.files[0];
    e.target.value = "";
    if (!file) return;
    $("code-search").value = "";
    const { blob, thumb } = await shrink(file, 1600);
    lastThumb = thumb ? `<img class="thumb" src="${thumb}" alt="Din bild på etiketten">` : "";
    const working = (txt) => { out.innerHTML = `<div class="f-status">${lastThumb}<span class="spin" aria-hidden="true"></span><span>${txt}</span>${ctl ? ' <button type="button" class="linkbtn" id="f-stop">Avbryt</button>' : ""}</div>`; };
    const sample = await getSample();
    try {
      if (sample) {
        ctl = new AbortController();
        working("Claude läser etiketten …");
        const res = await readWithClaude(sample, blob, ctl.signal);
        ctl = null;
        const codes = Array.isArray(res && res.codes) ? res.codes.map(String) : [];
        const exact = codes.map((c) => TOOLS.find((t) => normCode(t.code) === normCode(c))).filter(Boolean);
        if (exact.length) {
          const rest = matchText((res.text || "") + " " + codes.join(" ")).filter((r) => !exact.includes(r.t));
          showResult(exact.map((t, i) => ({ t, score: i === 0 && exact.length === 1 ? 0 : 0.1 + i * 0.01 })).concat(rest.slice(0, 2)), res.text);
        } else {
          showResult(matchText((res && res.text) || ""), res && res.text);
        }
      } else {
        ctl = null;
        working("Läser texten på etiketten …");
        const text = await readWithOcr(blob);
        showResult(matchText(text), text.replace(/\s+/g, " ").trim());
      }
    } catch (err) {
      ctl = null;
      const code = err && err.code;
      if (code === "cancelled") { out.innerHTML = ""; return; }
      const msg = code === "not_granted" || code === "sampling_disabled" ? "Bildavläsning är inte tillåten här."
        : code === "rate_limited" ? "För många försök just nu. Vänta en stund och försök igen."
        : code === "image_rejected" ? "Bilden kunde inte läsas. Prova en annan bild."
        : "Kunde inte läsa bilden.";
      out.innerHTML = lastThumb + `<p class="f-status bad">${msg} Skriv artikelkoden i sökfältet i stället.</p>`;
    }
  });

  render();
})();
