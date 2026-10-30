"use strict";
/* 책마루 리더 — 한 쪽 / 두 쪽(펼침), 책장 넘김 효과 */
const READER_HTML = `
<div id="reader" class="hidden t-paper">
  <div id="stage"><div class="bookwrap" id="bookwrap"><div class="book" id="book"></div></div></div>
  <div id="measure"></div>
  <div class="rbar rtop">
    <button class="ib" id="rBack" title="서재로"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 5l-7 7 7 7"/></svg></button>
    <div class="ttl" id="rTitle"></div>
    <button class="ib txt" id="rView" title="한 쪽 / 두 쪽 전환"></button>
    <button class="ib" id="rSet" title="보기 설정"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 19 9 5h1l5 14M6 14h7M16 19l2.5-7h1L22 19M17 17h4"/></svg></button>
    <button class="ib" id="rFs" title="전체 화면"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg></button>
  </div>
  <div class="rbar rbot">
    <button class="ib" id="rPrev" title="이전"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 5l-7 7 7 7"/></svg></button>
    <input type="range" id="rSlider" min="0" max="0" value="0">
    <button class="ib" id="rNext" title="다음"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 5l7 7-7 7"/></svg></button>
    <div class="pn" id="rPn"></div>
  </div>
  <div class="sheet hidden" id="sheet"></div>
</div>`;
document.body.insertAdjacentHTML("beforeend", READER_HTML);

const Reader = (() => {
  const R = {meta: null, type: "text", paras: null, imgs: null, pdf: null, count: 0, pages: [], two: false, offset: 0, spread: 0, pw: 0, ph: 0, aspect: 0.66, token: 0, anim: null, hooks: {}, pdfCache: new Map()};
  const book = $("#book"), wrap = $("#bookwrap"), reader = $("#reader"), measure = $("#measure");
  const FONTS = {batang: '"Gowun Batang",serif', myeongjo: '"Nanum Myeongjo",serif', sans: '"Noto Sans KR",sans-serif'};
  let wakeLock = null;
  const isOpen = () => !reader.classList.contains("hidden");

  async function open(b, hooks = {}){
    R.meta = b.meta; R.type = b.meta.type; R.hooks = hooks;
    R.paras = b.paras || null; R.imgs = b.imgs || null; R.pdf = b.pdf || null; R.pdfCache.forEach(u => URL.revokeObjectURL(u)); R.pdfCache.clear();
    if (R.type === "comic") {
      R.count = R.pdf ? R.pdf.numPages : R.imgs.length;
      if (R.pdf) { const v = (await R.pdf.getPage(1)).getViewport({scale: 1}); R.aspect = clamp(v.width / v.height, 0.4, 1.6); }
      else R.aspect = await new Promise(res => { const im = new Image(); im.onload = () => res(clamp(im.naturalWidth / im.naturalHeight, 0.4, 1.6)); im.onerror = () => res(0.66); im.src = R.imgs[0]; setTimeout(() => res(0.66), 8000); });
      if (R.aspect > 1.1) R.aspect /= 2;
    }
    $("#rTitle").textContent = R.meta.title;
    reader.classList.remove("hidden"); reader.classList.add("ui"); $("#sheet").classList.add("hidden");
    try { wakeLock = await navigator.wakeLock?.request("screen"); } catch (e) {}
    applyTheme(); await relayout(true);
    setTimeout(() => reader.classList.remove("ui"), 1800);
  }
  function close(){
    if (R.anim) { R.anim.cancelled = true; R.anim = null; }
    flushSave();
    R.token++; reader.classList.add("hidden"); book.innerHTML = "";
    try { wakeLock?.release(); } catch (e) {} wakeLock = null;
    R.pdfCache.forEach(u => URL.revokeObjectURL(u)); R.pdfCache.clear();
    R.hooks.onClose?.();
  }
  function applyTheme(){
    reader.className = reader.className.replace(/\bt-\w+/g, "").trim() + " t-" + S.theme;
    reader.style.setProperty("--fs", S.fs + "px"); reader.style.setProperty("--lh", S.lh);
    reader.style.setProperty("--rfont", FONTS[S.font] || FONTS.batang);
    reader.style.setProperty("--pgap", (S.lh > 1.7 ? 0.25 : 0.4) + "em");
  }
  function computeLayout(){
    const W = window.innerWidth, H = window.innerHeight, landscape = W > H * 1.08;
    R.two = S.view === "two" || (S.view === "auto" && landscape);
    const m = Math.max(10, Math.min(W, H) * 0.025);
    const aw = W - 2 * m, ah = H - 2 * m;
    let pw, ph;
    if (R.type === "comic") {
      ph = ah; pw = ph * R.aspect;
      const tot = R.two ? 2 * pw : pw;
      if (tot > aw) { const k = aw / tot; pw *= k; ph *= k; }
    } else ph = ah, pw = R.two ? Math.min(aw / 2, ph * 0.78) : Math.min(aw, Math.max(ph * 0.72, Math.min(aw, 720)));
    R.pw = Math.floor(pw); R.ph = Math.floor(ph);
    R.offset = R.two && R.type === "comic" && S.coverAlone ? 1 : 0;
    const bw = R.pw * (R.two ? 2 : 1);
    Object.assign(wrap.style, {width: bw + "px", height: R.ph + "px", left: Math.round((W - bw) / 2) + "px", top: Math.round((H - R.ph) / 2) + "px"});
    reader.style.setProperty("--pw", R.pw + "px"); reader.style.setProperty("--ph", R.ph + "px");
    reader.style.setProperty("--padx", Math.round(clamp(R.pw * 0.085, 20, 64)) + "px");
    reader.style.setProperty("--pady", Math.round(clamp(R.ph * 0.035, 16, 40)) + "px");
    book.classList.toggle("two", R.two);
    book.classList.toggle("rtl", R.type === "comic" && S.dir === "rtl");
    $("#rView").textContent = R.two ? "두 쪽" : "한 쪽";
  }

  /* --- 페이지 나누기 --- */
  function paraEl(p, from, to){
    if (p.t === "h" || p.t === "h1") { const h = document.createElement("h3"); if (p.t === "h1") h.className = "h1"; h.textContent = p.x.slice(from, to); return h; }
    const el = document.createElement("p");
    if (p.t === "v") el.className = "v" + (p.gap ? " gap" : "");
    if (from > 0 && p.t !== "v") el.classList.add("cont");
    if (to < p.x.length && p.t !== "v") el.classList.add("brk");
    el.textContent = p.x.slice(from, to);
    return el;
  }
  function measureBody(){
    measure.innerHTML = "";
    Object.assign(measure.style, {width: R.pw + "px", height: R.ph + "px", position: "absolute"});
    const pg = document.createElement("div"); pg.className = "page";
    pg.innerHTML = `<div class="pin"><div class="ph">.</div><div class="pb"></div><div class="pf">1</div></div>`;
    measure.appendChild(pg);
    return pg.querySelector(".pb");
  }
  async function paginate(token){
    const paras = R.paras, body = measureBody(), H = body.clientHeight;
    const fits = () => body.scrollHeight <= H + 1;
    const pages = [];
    let p = 0, c = 0, t0 = performance.now();
    while (p < paras.length) {
      if (paras[p].t === "pb") { p++; c = 0; continue; }
      body.textContent = "";
      const start = {p, c};
      let n = 0, lastHeadIdx = -1;
      while (p < paras.length) {
        const para = paras[p];
        if (para.t === "pb") { if (n) break; p++; continue; }
        if (para.t === "h1" && n && c === 0) break;
        const el = paraEl(para, c, para.x.length);
        body.appendChild(el);
        if (fits()) { lastHeadIdx = (para.t === "h" || para.t === "h1") ? p : -1; p++; c = 0; n++; continue; }
        if ((para.t === "h" || para.t === "h1") && n) { el.remove(); break; }
        let lo = 0, hi = para.x.length - c;
        while (lo < hi) { const mid = (lo + hi + 1) >> 1; el.textContent = para.x.slice(c, c + mid); if (fits()) lo = mid; else hi = mid - 1; }
        let k = lo;
        if (k > 0 && c + k < para.x.length) { const seg = para.x.slice(c, c + k), sp = seg.lastIndexOf(" "); if (sp > 0 && sp > k - 30) k = sp + 1; }
        if (k === 0) {
          el.remove();
          if (!n) { c += Math.max(1, Math.min(20, para.x.length - c)); if (c >= para.x.length) { p++; c = 0; } }
          else if (lastHeadIdx === p - 1 && n > 1) { p = lastHeadIdx; c = 0; }
          break;
        }
        c += k; if (c >= para.x.length) { p++; c = 0; }
        n++; break;
      }
      if (p === start.p && c === start.c) { p++; c = 0; }
      pages.push(start);
      if (performance.now() - t0 > 40) {
        loader("페이지를 나누는 중…", p / paras.length);
        await sleep(0); t0 = performance.now();
        if (token !== R.token) return null;
      }
    }
    loader(false);
    return pages.length ? pages : [{p: 0, c: 0}];
  }
  function posToPage(pos){
    if (R.type === "comic") return clamp(pos | 0, 0, R.count - 1);
    if (!pos || typeof pos !== "object") return 0;
    let lo = 0, hi = R.pages.length - 1;
    while (lo < hi) { const mid = (lo + hi + 1) >> 1; const s = R.pages[mid]; if (s.p < pos.p || (s.p === pos.p && s.c <= pos.c)) lo = mid; else hi = mid - 1; }
    return lo;
  }
  async function relayout(first){
    const token = ++R.token;
    const keep = first ? R.meta.pos : currentPos();
    if (R.anim) { R.anim.cancelled = true; R.anim = null; }
    computeLayout();
    if (R.type === "text") {
      try { await document.fonts.ready; } catch (e) {}
      const pages = await paginate(token); if (!pages) return;
      R.pages = pages; R.count = pages.length;
    }
    R.spread = spreadOf(posToPage(keep));
    $("#rSlider").max = R.count - 1;
    renderSpread(first);
  }
  const currentPos = () => { const i = firstPage(R.spread); return R.type === "comic" ? i : R.pages[i]; };
  const spreadOf = i => R.two ? Math.floor((i + R.offset) / 2) : i;
  const spreadPages = s => R.two ? [2 * s - R.offset, 2 * s + 1 - R.offset] : [s];
  const maxSpread = () => spreadOf(R.count - 1);
  const firstPage = s => clamp(spreadPages(s).find(i => i >= 0 && i < R.count) ?? 0, 0, R.count - 1);

  function pdfUrl(i){
    if (R.pdfCache.has(i)) return Promise.resolve(R.pdfCache.get(i));
    const w = Math.min(2200, Math.round(R.pw * Math.min(2, window.devicePixelRatio || 1)));
    return pdfPageBlob(R.pdf, i, w).then(b => {
      const u = URL.createObjectURL(b); R.pdfCache.set(i, u);
      if (R.pdfCache.size > 16) { const k = R.pdfCache.keys().next().value; URL.revokeObjectURL(R.pdfCache.get(k)); R.pdfCache.delete(k); }
      return u;
    });
  }
  function pageEl(i, side){
    const el = document.createElement("div");
    el.className = "page" + (side === "L" ? " shade-r" : side === "R" ? " shade-l" : "");
    if (i < 0 || i >= R.count) { el.classList.add("blank"); return el; }
    const pin = document.createElement("div"); pin.className = "pin"; el.appendChild(pin);
    if (R.type === "comic") {
      el.classList.add("comic");
      const im = document.createElement("img"); im.decoding = "async"; im.draggable = false; im.alt = "";
      const fail = () => { pin.innerHTML = `<div class="err">이 쪽을 불러오지 못했어요<br>(인터넷 연결 확인)</div>`; };
      im.onerror = () => { if (!im.dataset.r && /\/page\/n\d+\.jpg$/.test(im.src)) { im.dataset.r = 1; im.src = im.src.replace(/\.jpg$/, "_large.jpg"); } else fail(); };
      if (R.pdf) pdfUrl(i).then(u => { im.src = u; }, fail); else im.src = R.imgs[i];
      pin.appendChild(im);
      return el;
    }
    const s = R.pages[i], e = R.pages[i + 1] || {p: R.paras.length, c: 0};
    const ph = document.createElement("div"); ph.className = "ph"; ph.textContent = side === "R" ? (R.meta.author || R.meta.title) : R.meta.title;
    const pb = document.createElement("div"); pb.className = "pb";
    for (let p = s.p; p <= e.p && p < R.paras.length; p++) {
      if (R.paras[p].t === "pb") continue;
      const from = p === s.p ? s.c : 0, to = p === e.p ? e.c : R.paras[p].x.length;
      if (to > from) pb.appendChild(paraEl(R.paras[p], from, to));
    }
    if (i === R.count - 1) { const d = document.createElement("div"); d.className = "end"; d.textContent = "— 끝 —"; pb.appendChild(d); }
    const pf = document.createElement("div"); pf.className = "pf"; pf.textContent = i + 1;
    pin.append(ph, pb, pf);
    return el;
  }
  function slot(cls, i, side){ const s = document.createElement("div"); s.className = "slot " + cls; s.style.left = cls === "R" ? "var(--pw)" : "0"; s.appendChild(pageEl(i, side)); return s; }
  function renderSpread(noSave){
    book.innerHTML = "";
    const pg = spreadPages(R.spread);
    if (R.two) book.append(slot("L", pg[0], "L"), slot("R", pg[1], "R")); else book.append(slot("S", pg[0], ""));
    updateChrome(); if (!noSave) saveProgress(); preload();
  }
  function preload(){
    if (R.type !== "comic") return;
    for (const s of [R.spread + 1, R.spread + 2, R.spread - 1]) for (const i of spreadPages(s)) if (i >= 0 && i < R.count) { if (R.pdf) pdfUrl(i).catch(() => {}); else { const im = new Image(); im.src = R.imgs[i]; } }
  }
  function updateChrome(){
    const pg = spreadPages(R.spread).filter(i => i >= 0 && i < R.count);
    const a = (pg[0] ?? 0) + 1, b = (pg[pg.length - 1] ?? 0) + 1;
    $("#rPn").textContent = `${a === b ? a : a + "–" + b} / ${R.count}`;
    $("#rSlider").value = pg[0] ?? 0;
  }
  let saveT, pending = null;
  function saveProgress(){
    const last = spreadPages(R.spread).filter(i => i < R.count).pop() ?? 0;
    pending = {pos: currentPos(), pct: R.count > 1 ? clamp(last / (R.count - 1), 0, 1) : 1, t: Date.now()};
    R.meta.pos = pending.pos; R.meta.pct = pending.pct;
    clearTimeout(saveT); saveT = setTimeout(flushSave, 400);
  }
  function flushSave(){ clearTimeout(saveT); if (pending && R.meta) { R.hooks.onProgress?.(R.meta.id, pending); pending = null; } }

  /* --- 책장 넘기기 --- */
  function beginFlip(dir){
    const next = R.spread + dir;
    if (next < 0 || next > maxSpread()) return null;
    const cur = spreadPages(R.spread), nx = spreadPages(next);
    const f = {dir, next, p: 0, el: document.createElement("div"), cast: document.createElement("div")};
    f.el.className = "flipper " + (dir > 0 ? "fwd" : "bwd"); f.cast.className = "cast";
    const face = (cls, i, side) => { const d = document.createElement("div"); d.className = "face " + cls; d.appendChild(pageEl(i, side)); const g = document.createElement("div"); g.className = "gloss"; d.appendChild(g); return d; };
    if (R.two) {
      const [Ls, Rs] = book.children;
      if (dir > 0) {
        Rs.replaceChildren(pageEl(nx[1], "R"));
        f.el.style.left = "var(--pw)"; f.el.style.transformOrigin = "left center";
        f.el.append(face("front", cur[1], "R"), face("back", nx[0], "L")); f.from = 0; f.to = -180;
        f.cast.style.left = "var(--pw)"; f.cast.style.background = "linear-gradient(90deg,rgba(0,0,0,.28),transparent 60%)";
      } else {
        Ls.replaceChildren(pageEl(nx[0], "L"));
        f.el.style.left = "0"; f.el.style.transformOrigin = "right center";
        f.el.append(face("front", cur[0], "L"), face("back", nx[1], "R")); f.from = 0; f.to = 180;
        f.cast.style.left = "0"; f.cast.style.background = "linear-gradient(270deg,rgba(0,0,0,.28),transparent 60%)";
      }
    } else {
      const Ss = book.children[0];
      f.single = true; f.el.style.left = "0"; f.el.style.transformOrigin = "left center";
      f.cast.style.left = "0"; f.cast.style.background = "linear-gradient(90deg,rgba(0,0,0,.25),transparent 70%)";
      if (dir > 0) { Ss.replaceChildren(pageEl(nx[0], "")); f.el.append(face("front", cur[0], ""), face("back", -1, "")); f.from = 0; f.to = -180; }
      else { f.el.append(face("front", nx[0], ""), face("back", -1, "")); f.from = -180; f.to = 0; f.reverse = true; }
    }
    book.append(f.cast, f.el); setFlip(f, 0);
    return f;
  }
  function setFlip(f, p){
    f.p = p;
    const a = f.from + (f.to - f.from) * p, turn = Math.abs(a) / 180;
    f.el.style.transform = `rotateY(${a}deg)`;
    const g = f.el.querySelectorAll(".gloss");
    g[0].style.opacity = (turn * 0.9).toFixed(3); g[1].style.opacity = ((1 - turn) * 0.9).toFixed(3);
    if (f.single) { const vis = f.reverse ? p : 1 - p; f.el.style.opacity = clamp(vis * 1.8, 0, 1).toFixed(3); f.cast.style.opacity = (Math.sin(Math.PI * Math.min(turn, .5)) * 0.9 * (1 - turn)).toFixed(3); }
    else f.cast.style.opacity = (Math.sin(Math.PI * p) * 0.9).toFixed(3);
  }
  function finishFlip(f, commit, ms){
    return new Promise(res => {
      R.anim = f;
      const from = f.p, to = commit ? 1 : 0, dur = ms ?? Math.max(120, 520 * Math.abs(to - from)), t0 = performance.now();
      const ease = t => 1 - Math.pow(1 - t, 3);
      const step = now => {
        if (f.cancelled) { res(); return; }
        const t = clamp((now - t0) / dur, 0, 1);
        setFlip(f, from + (to - from) * ease(t));
        if (t < 1) requestAnimationFrame(step);
        else { if (commit) R.spread = f.next; R.anim = null; renderSpread(!commit); res(); }
      };
      requestAnimationFrame(step);
    });
  }
  let queue = Promise.resolve();
  function go(dir){
    queue = queue.then(async () => {
      if (!R.meta || !isOpen()) return;
      const next = R.spread + dir;
      if (next < 0 || next > maxSpread()) { toast(dir > 0 ? "마지막 쪽이에요" : "첫 쪽이에요", 1200); return; }
      if (S.effect === "curl") { const f = beginFlip(dir); if (f) await finishFlip(f, true, 560); }
      else {
        R.spread = next; renderSpread();
        if (S.effect === "slide") { const dx = (book.classList.contains("rtl") ? -1 : 1) * dir * 60; await wrap.animate([{transform: `translateX(${dx}px)`, opacity: 0.2}, {transform: "none", opacity: 1}], {duration: 240, easing: "cubic-bezier(.2,.7,.2,1)"}).finished.catch(() => {}); }
      }
    });
    return queue;
  }
  function goPage(i){ R.spread = spreadOf(clamp(i, 0, R.count - 1)); renderSpread(); }

  /* --- 손가락 / 키보드 --- */
  let drag = null;
  const isRtl = () => book.classList.contains("rtl");
  const stage = $("#stage");
  stage.addEventListener("pointerdown", e => {
    if (!$("#sheet").classList.contains("hidden")) { $("#sheet").classList.add("hidden"); return; }
    if (R.anim || e.button > 0) return;
    drag = {x: e.clientX, y: e.clientY, t: performance.now(), moved: false, f: null, id: e.pointerId};
    try { stage.setPointerCapture(e.pointerId); } catch (_) {}
  });
  stage.addEventListener("pointermove", e => {
    if (!drag || e.pointerId !== drag.id) return;
    let dx = e.clientX - drag.x; const dy = e.clientY - drag.y;
    if (isRtl()) dx = -dx;
    if (!drag.moved && Math.abs(dx) > 12 && Math.abs(dx) > Math.abs(dy)) { drag.moved = true; drag.dir = dx < 0 ? 1 : -1; if (S.effect === "curl") drag.f = beginFlip(drag.dir); }
    if (drag.f) setFlip(drag.f, clamp((drag.dir > 0 ? -dx : dx) / (R.pw * (R.two ? 1.5 : 1.1)), 0, 1));
  });
  const endDrag = e => {
    if (!drag || e.pointerId !== drag.id) return;
    const d = drag; drag = null;
    let dx = e.clientX - d.x; if (isRtl()) dx = -dx;
    if (!d.moved) {
      if (e.type === "pointercancel") return;
      const x = e.clientX / window.innerWidth;
      if (x > 0.32 && x < 0.68) { reader.classList.toggle("ui"); return; }
      let dir = x >= 0.68 ? 1 : -1; if (isRtl()) dir = -dir;
      reader.classList.remove("ui"); go(dir); return;
    }
    if (d.f) { const v = Math.abs(dx) / Math.max(1, performance.now() - d.t); finishFlip(d.f, e.type !== "pointercancel" && (d.f.p > 0.3 || (v > 0.45 && d.f.p > 0.05))); }
    else if (e.type !== "pointercancel" && Math.abs(dx) > 40) go(d.dir);
  };
  stage.addEventListener("pointerup", endDrag); stage.addEventListener("pointercancel", endDrag);
  document.addEventListener("keydown", e => {
    if (!isOpen()) return;
    if (e.key === "Escape") { close(); return; }
    let dir = ["ArrowRight", "PageDown", " ", "ArrowDown"].includes(e.key) ? 1 : ["ArrowLeft", "PageUp", "ArrowUp"].includes(e.key) ? -1 : 0;
    if (!dir) return; e.preventDefault();
    if (isRtl() && (e.key === "ArrowRight" || e.key === "ArrowLeft")) dir = -dir;
    go(dir);
  });
  $("#rBack").onclick = close;
  $("#rFs").onclick = toggleFs;
  $("#rPrev").onclick = () => go(isRtl() ? 1 : -1);
  $("#rNext").onclick = () => go(isRtl() ? -1 : 1);
  $("#rSlider").oninput = e => { $("#rPn").textContent = `${+e.target.value + 1} / ${R.count}`; };
  $("#rSlider").onchange = e => goPage(+e.target.value);
  $("#rView").onclick = () => { S.view = R.two ? "one" : "two"; relayout(); renderSheet(); };
  let rzT; window.addEventListener("resize", () => { if (!isOpen()) return; clearTimeout(rzT); rzT = setTimeout(() => relayout(), 250); });
  document.addEventListener("visibilitychange", async () => {
    if (!isOpen()) return;
    if (document.visibilityState === "hidden") flushSave();
    else { try { wakeLock = await navigator.wakeLock?.request("screen"); } catch (e) {} }
  });

  /* --- 보기 설정 --- */
  const opt = (key, val, label) => `<button data-k="${key}" data-v="${val}" aria-pressed="${String(S[key]) === String(val)}">${label}</button>`;
  function renderSheet(){
    const text = R.type === "text";
    $("#sheet").innerHTML = `
      <h4>화면 구성</h4>
      <div class="opts">${opt("view","auto","자동")}${opt("view","one","한 쪽")}${opt("view","two","두 쪽 (펼침)")}</div>
      <div class="hint">자동: 가로로 들면 두 쪽, 세로로 들면 한 쪽</div>
      <h4>넘김 효과</h4>
      <div class="opts">${opt("effect","curl","책장 넘기기")}${opt("effect","slide","밀어 넘기기")}${opt("effect","none","바로")}</div>
      ${text ? `
      <h4>글자 크기</h4><div class="rowr"><input type="range" min="14" max="32" step="1" value="${S.fs}" data-r="fs"><output>${S.fs}px</output></div>
      <h4>줄 간격</h4><div class="rowr"><input type="range" min="1.4" max="2.3" step="0.05" value="${S.lh}" data-r="lh"><output>${(+S.lh).toFixed(2)}</output></div>
      <h4>글꼴</h4><div class="opts">${opt("font","batang","고운바탕")}${opt("font","myeongjo","나눔명조")}${opt("font","sans","고딕")}</div>` : `
      <h4>읽기 방향</h4><div class="opts">${opt("dir","ltr","왼쪽 → 오른쪽")}${opt("dir","rtl","오른쪽 → 왼쪽")}</div>
      <div class="hint">일본식 만화는 오른쪽 → 왼쪽으로 넘겨요</div>
      <h4>두 쪽일 때 표지</h4><div class="opts">${opt("coverAlone","true","표지 따로")}${opt("coverAlone","false","처음부터 짝지어")}</div>`}
      <h4>배경</h4>
      <div class="th">
        <button data-k="theme" data-v="paper" aria-pressed="${S.theme==="paper"}" style="background:#f8f2e4;color:#2b2520">종이</button>
        <button data-k="theme" data-v="sepia" aria-pressed="${S.theme==="sepia"}" style="background:#efe0c2;color:#3d2f20">세피아</button>
        <button data-k="theme" data-v="night" aria-pressed="${S.theme==="night"}" style="background:#1f1d1b;color:#cfc6b6">야간</button>
      </div>`;
  }
  $("#rSet").onclick = e => { e.stopPropagation(); renderSheet(); $("#sheet").classList.toggle("hidden"); };
  $("#sheet").addEventListener("click", e => {
    const b = e.target.closest("button[data-k]"); if (!b) return;
    let v = b.dataset.v; if (v === "true") v = true; else if (v === "false") v = false;
    S[b.dataset.k] = v; renderSheet(); applyTheme();
    if (["view", "font", "dir", "coverAlone"].includes(b.dataset.k)) relayout();
  });
  let rT;
  $("#sheet").addEventListener("input", e => {
    const r = e.target.closest("input[data-r]"); if (!r) return;
    S[r.dataset.r] = +r.value; r.nextElementSibling.textContent = r.dataset.r === "fs" ? r.value + "px" : (+r.value).toFixed(2);
    applyTheme(); clearTimeout(rT); rT = setTimeout(() => relayout(), 350);
  });

  return {open, close, go, relayout, R, isOpen};
})();
