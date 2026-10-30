"use strict";
/* 책마루 공통 코드 — 책 담기(upload.html)와 책 뷰어(index.html)가 함께 써요 */

/* ============ utils ============ */
const $ = s => document.querySelector(s);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const enc = encodeURIComponent;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const natCmp = (a, b) => a.localeCompare(b, undefined, {numeric: true, sensitivity: "base"});
const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const fmtMB = n => n < 1048576 ? Math.max(1, Math.round(n / 1024)) + "KB" : (n / 1048576).toFixed(n > 10485760 ? 0 : 1) + "MB";
function hashHue(s){ let h = 0; for (const ch of String(s)) h = (h * 31 + ch.codePointAt(0)) >>> 0; return h % 360; }
function toast(msg, ms = 2600){ const t = $("#toast"); t.textContent = msg; t.classList.remove("hidden"); clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.add("hidden"), ms); }
function loader(msg, pct, sub){
  const L = $("#loader");
  if (msg === false) { L.classList.add("hidden"); return; }
  L.classList.remove("hidden"); $("#ldMsg").textContent = msg || "";
  $("#ldBar").style.width = (pct == null ? 0 : clamp(pct, 0, 1) * 100) + "%";
  $("#ldBar").parentElement.style.display = pct == null ? "none" : "";
  $("#ldSub").textContent = sub || "";
}
async function fetchT(url, opt = {}, ms = 30000){
  const ac = new AbortController(); const t = setTimeout(() => ac.abort(), ms);
  try { const r = await fetch(url, {...opt, signal: ac.signal}); if (!r.ok) { const e = new Error("HTTP " + r.status); e.status = r.status; throw e; } return r; }
  finally { clearTimeout(t); }
}
const fetchJSON = (u, ms) => fetchT(u, {}, ms).then(r => r.json());
async function fetchTextAny(urls){
  const tries = [...urls];
  for (const u of urls) { tries.push("https://api.allorigins.win/raw?url=" + enc(u)); tries.push("https://corsproxy.io/?url=" + enc(u)); }
  let last;
  for (const u of tries) {
    try { const r = await fetchT(u, {}, 45000); const t = await r.text(); if (t && t.length > 200) return t; } catch (e) { last = e; }
  }
  throw last || new Error("받을 수 없어요");
}
function bytesToB64(u8){
  let s = ""; const CH = 0x8000;
  for (let i = 0; i < u8.length; i += CH) s += String.fromCharCode.apply(null, u8.subarray(i, i + CH));
  return btoa(s);
}
const strToB64 = str => bytesToB64(new TextEncoder().encode(str));
const b64ToStr = b64 => new TextDecoder().decode(Uint8Array.from(atob(b64.replace(/\s/g, "")), c => c.charCodeAt(0)));
async function blobToB64(blob){ return bytesToB64(new Uint8Array(await blob.arrayBuffer())); }

/* ============ local storage (IndexedDB) ============ */
const Store = (() => {
  let db = null; const mem = {};
  const NAMES = ["meta", "content", "files", "covers"];
  NAMES.forEach(n => mem[n] = new Map());
  const rq = r => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
  async function open(){
    try {
      db = await new Promise((res, rej) => {
        const r = indexedDB.open("chaekmaru", 2);
        r.onupgradeneeded = () => { for (const n of NAMES) if (!r.result.objectStoreNames.contains(n)) r.result.createObjectStore(n, {keyPath: "id"}); };
        r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
      });
    } catch (e) { db = null; }
  }
  const st = (n, m) => db.transaction(n, m).objectStore(n);
  async function put(n, v){ mem[n].set(v.id, v); if (db) try { await rq(st(n, "readwrite").put(v)); mem[n].delete(v.id); } catch (e) {} }
  async function get(n, id){ if (db) try { const v = await rq(st(n, "readonly").get(id)); if (v) return v; } catch (e) {} return mem[n].get(id); }
  async function keys(n){ if (db) try { return await rq(st(n, "readonly").getAllKeys()); } catch (e) {} return [...mem[n].keys()]; }
  async function del(n, id){ mem[n].delete(id); if (db) try { await rq(st(n, "readwrite").delete(id)); } catch (e) {} }
  return {open, put, get, keys, del, get ok(){ return !!db; }};
})();
const S = (() => {
  const def = {view: "auto", effect: "curl", fs: 19, lh: 1.85, font: "batang", theme: "paper", dir: "ltr", coverAlone: true, src: "all"};
  const s = {...def};
  try { Object.assign(s, JSON.parse(localStorage.getItem("cm_settings") || "{}")); } catch (e) {}
  return new Proxy(s, {set(o, k, v){ o[k] = v; try { localStorage.setItem("cm_settings", JSON.stringify(o)); } catch (e) {} return true; }});
})();

/* ============ GitHub 저장소 ============ */
const GH = {
  cfg(){ try { return JSON.parse(localStorage.getItem("cm_gh") || "null"); } catch (e) { return null; } },
  save(c){ try { localStorage.setItem("cm_gh", JSON.stringify(c)); } catch (e) {} },
  clear(){ try { localStorage.removeItem("cm_gh"); } catch (e) {} },
  url(path){ const c = this.cfg(); return `https://api.github.com/repos/${enc(c.owner)}/${enc(c.repo)}` + (path ? "/" + path : ""); },
  async req(path, {method = "GET", body, accept = "application/vnd.github+json", ms = 60000} = {}){
    const c = this.cfg(); if (!c || !c.token) { const e = new Error("GitHub 연결이 필요해요"); e.status = 0; throw e; }
    const headers = {Authorization: "Bearer " + c.token, Accept: accept};
    if (body) headers["Content-Type"] = "application/json";
    const ac = new AbortController(); const t = setTimeout(() => ac.abort(), ms);
    let r;
    try { r = await fetch(this.url(path), {method, headers, body: body ? JSON.stringify(body) : undefined, cache: "no-store", signal: ac.signal}); }
    finally { clearTimeout(t); }
    if (!r.ok) {
      let msg = ""; try { msg = (await r.json()).message; } catch (e) {}
      const e = new Error(({401: "토큰이 틀렸거나 만료됐어요", 403: "토큰 권한이 부족해요 (Contents 읽기/쓰기 필요)", 404: "없음"})[r.status] || `GitHub 오류 ${r.status} ${msg}`);
      e.status = r.status; throw e;
    }
    return r;
  },
  p: path => "contents/" + path.split("/").map(enc).join("/"),
  async repoInfo(){ return (await this.req("")).json(); },
  async getJSON(path){
    try { const j = await (await this.req(this.p(path))).json(); return {data: JSON.parse(b64ToStr(j.content)), sha: j.sha}; }
    catch (e) { if (e.status === 404) return {data: null, sha: null}; throw e; }
  },
  async sha(path){ try { return (await (await this.req(this.p(path))).json()).sha; } catch (e) { if (e.status === 404) return null; throw e; } },
  async put(path, b64, message, sha){
    const r = await this.req(this.p(path), {method: "PUT", body: {message, content: b64, ...(sha ? {sha} : {})}, ms: 600000});
    return (await r.json()).content;
  },
  async del(path, message){ const sha = await this.sha(path); if (sha) await this.req(this.p(path), {method: "DELETE", body: {message, sha}}); },
  async raw(path, onProg){
    const r = await this.req(this.p(path), {accept: "application/vnd.github.raw", ms: 600000});
    const total = +r.headers.get("content-length") || 0;
    if (!r.body || !onProg) return r.blob();
    const rd = r.body.getReader(), parts = []; let got = 0;
    for (;;) { const {done, value} = await rd.read(); if (done) break; parts.push(value); got += value.length; onProg(got, total); }
    return new Blob(parts, {type: r.headers.get("content-type") || ""});
  },
  // library.json / progress.json 같은 작은 JSON을 안전하게 고쳐 쓰기 (동시 수정 시 재시도)
  async updateJSON(path, init, fn, message){
    let last;
    for (let i = 0; i < 4; i++) {
      const {data, sha} = await this.getJSON(path);
      const v = data || init(); fn(v);
      try { await this.put(path, strToB64(JSON.stringify(v, null, 1)), message, sha); return v; }
      catch (e) { last = e; if (e.status === 409 || e.status === 422) { await sleep(800 * (i + 1)); continue; } throw e; }
    }
    throw last;
  }
};
const Library = {
  async load(){ const {data} = await GH.getJSON("library.json"); const lib = data || {v: 1, books: []}; try { localStorage.setItem("cm_lib_cache", JSON.stringify(lib)); } catch (e) {} return lib; },
  cached(){ try { return JSON.parse(localStorage.getItem("cm_lib_cache") || "null"); } catch (e) { return null; } },
  add(entry){ return GH.updateJSON("library.json", () => ({v: 1, books: []}), lib => { lib.books = lib.books.filter(b => b.id !== entry.id); lib.books.push(entry); }, `책 추가: ${entry.title}`); },
  edit(id, patch){ return GH.updateJSON("library.json", () => ({v: 1, books: []}), lib => { const b = lib.books.find(b => b.id === id); if (b) Object.assign(b, patch); }, `책 정보 수정: ${patch.title || id}`); },
  async remove(entry){
    await GH.del(entry.path, `책 파일 삭제: ${entry.title}`);
    if (entry.coverPath) await GH.del(entry.coverPath, `표지 삭제: ${entry.title}`).catch(() => {});
    return GH.updateJSON("library.json", () => ({v: 1, books: []}), lib => { lib.books = lib.books.filter(b => b.id !== entry.id); }, `책 빼기: ${entry.title}`);
  }
};

/* GitHub 연결 설정 화면 (두 사이트 공통) */
function renderSetup(el, onDone){
  const c = GH.cfg() || {};
  el.innerHTML = `
    <h3>GitHub 저장소 연결</h3>
    <p class="d">책 파일은 내 GitHub의 <b>비공개 저장소</b>에 보관하고, 두 사이트가 같은 저장소를 읽고 써요. 이 기기에서 한 번만 설정하면 돼요.</p>
    <ol class="steps">
      <li>github.com에서 <b>비공개(Private)</b> 저장소를 하나 만드세요. 예: <code>my-books</code></li>
      <li>Settings → Developer settings → Personal access tokens → <b>Fine-grained tokens</b> → Generate new token</li>
      <li>Repository access는 <b>Only select repositories</b>로 위 저장소만 고르고, Permissions → <b>Contents: Read and write</b>로 설정</li>
      <li>만들어진 토큰(<code>github_pat_…</code>)을 아래에 붙여 넣기</li>
    </ol>
    <div class="fields">
      <div><label>GitHub 아이디</label><input id="ghOwner" value="${esc(c.owner || "")}" placeholder="예: jaymaro1212" autocapitalize="off" spellcheck="false"></div>
      <div><label>저장소 이름</label><input id="ghRepo" value="${esc(c.repo || "")}" placeholder="예: my-books" autocapitalize="off" spellcheck="false"></div>
      <div class="full"><label>토큰</label><input id="ghToken" type="password" value="${esc(c.token || "")}" placeholder="github_pat_..." autocapitalize="off" spellcheck="false"></div>
    </div>
    <div class="row"><button class="btn primary" id="ghSave">연결하기</button>${c.token ? `<button class="btn ghost" id="ghCancel">닫기</button><button class="btn ghost danger" id="ghOut">이 기기에서 연결 해제</button>` : ""}<span id="ghMsg"></span></div>`;
  el.querySelector("#ghSave").onclick = async () => {
    const cfg = {owner: $("#ghOwner").value.trim(), repo: $("#ghRepo").value.trim().replace(/\.git$/, ""), token: $("#ghToken").value.trim()};
    const m = $("#ghMsg");
    if (!cfg.owner || !cfg.repo || !cfg.token) { m.innerHTML = `<span class="warn">세 칸을 모두 채워 주세요</span>`; return; }
    const prev = GH.cfg(); GH.save(cfg); m.innerHTML = `<span class="warn">확인 중…</span>`;
    try {
      const info = await GH.repoInfo();
      cfg.private = !!info.private; cfg.canWrite = !!(info.permissions && info.permissions.push); GH.save(cfg);
      onDone(cfg);
    } catch (e) { if (prev) GH.save(prev); else GH.clear(); m.innerHTML = `<span class="warn">${esc(e.status === 404 ? "저장소를 찾을 수 없어요. 아이디·이름과 토큰의 저장소 선택을 확인해 주세요" : e.message)}</span>`; }
  };
  el.querySelector("#ghCancel")?.addEventListener("click", () => onDone(GH.cfg()));
  el.querySelector("#ghOut")?.addEventListener("click", () => { if (confirm("이 기기에서 GitHub 연결을 지울까요? (저장소의 책은 그대로 있어요)")) { GH.clear(); location.reload(); } });
}

/* ============ text → paragraphs ============ */
const BLOCK = new Set(["P","DIV","H1","H2","H3","H4","H5","H6","UL","OL","LI","DL","DD","DT","BLOCKQUOTE","PRE","CENTER","SECTION","ARTICLE","TABLE","TR","TD","TH","TBODY","HR","FIGURE","HEADER","FOOTER","NAV","MAIN","ASIDE","BODY"]);
function normWS(s){ return s.replace(/[\t\r ]+/g, " ").replace(/ *\n */g, "\n"); }
function htmlToParas(rootEl, {allowLi = true} = {}){
  const out = [];
  rootEl.querySelectorAll("br").forEach(b => b.replaceWith("\n"));
  const push = (txt, type) => {
    const lines = normWS(txt).split("\n").map(l => l.trim());
    const nonEmpty = lines.filter(Boolean);
    if (!nonEmpty.length) return;
    if (type === "v") { lines.forEach(l => { if (l) out.push({t: "v", x: l}); else if (out.length && out[out.length-1].t === "v") out[out.length-1].gap = true; }); if (out.length) out[out.length-1].gap = true; }
    else nonEmpty.forEach(l => out.push({t: type, x: l}));
  };
  const walk = (el, inPoem) => {
    let buf = "";
    const flush = () => { if (buf.trim()) push(buf, inPoem ? "v" : "p"); buf = ""; };
    for (const n of el.childNodes) {
      if (n.nodeType === 3) { buf += n.nodeValue; continue; }
      if (n.nodeType !== 1) continue;
      const tag = n.tagName.toUpperCase();
      if (!BLOCK.has(tag)) { buf += n.textContent; continue; }
      flush();
      const poem = inPoem || (n.classList && (n.classList.contains("poem") || n.classList.contains("verse")));
      if (/^H[1-6]$/.test(tag)) { const t = normWS(n.textContent).replace(/\n/g, " ").trim(); if (t) out.push({t: "h", x: t}); }
      else if (tag === "P" || tag === "DD" || tag === "DT" || tag === "PRE") push(n.textContent, poem || tag === "PRE" ? "v" : "p");
      else if (tag === "LI") { if (allowLi) push(n.textContent, poem ? "v" : "p"); }
      else if (tag === "HR") {}
      else walk(n, poem);
    }
    flush();
  };
  walk(rootEl, false);
  return out;
}
function textToParas(raw){
  let t = raw.replace(/\r\n?/g, "\n").replace(/^﻿/, "");
  const s = t.search(/\*\*\*\s*START OF (THE|THIS) PROJECT GUTENBERG[^\n]*/i);
  if (s >= 0) t = t.slice(t.indexOf("\n", s) + 1);
  const e = t.search(/\*\*\*\s*END OF (THE|THIS) PROJECT GUTENBERG/i);
  if (e >= 0) t = t.slice(0, e);
  const hasBlank = /\n[ \t]*\n/.test(t);
  const blocks = hasBlank ? t.split(/\n[ \t]*\n+/) : t.split("\n");
  const out = [];
  for (let b of blocks) {
    b = b.replace(/_([^_\n]+)_/g, "$1");
    const lines = b.split("\n").map(l => l.replace(/\s+$/, ""));
    const clean = lines.map(l => l.trim()).filter(Boolean);
    if (!clean.length) continue;
    const joined = clean.join(" ").replace(/\s+/g, " ");
    if (/^(CHAPTER|BOOK|PART|VOLUME|STAVE|LETTER|ACT|KAPITEL)\b[\s.\w:'-]{0,60}$/i.test(clean[0]) && joined.length < 90) { out.push({t: "h1", x: joined}); continue; }
    if (/^제\s*\d+\s*[장화부편]/.test(joined) && joined.length < 40) { out.push({t: "h1", x: joined}); continue; }
    const verse = hasBlank && clean.length > 1 && lines.filter(l => /^\s{2,}/.test(l)).length >= clean.length / 2 && Math.max(...clean.map(l => l.length)) < 70;
    if (verse) { clean.forEach(l => out.push({t: "v", x: l})); out[out.length-1].gap = true; }
    else if (!hasBlank) out.push({t: "p", x: joined});
    else out.push({t: clean.length === 1 && joined.length < 50 && joined === joined.toUpperCase() && /[A-Z]/.test(joined) ? "h" : "p", x: joined});
  }
  return out;
}
function decodeText(buf){
  let t = new TextDecoder("utf-8").decode(buf);
  if ((t.match(/�/g) || []).length > 5) { try { t = new TextDecoder("euc-kr").decode(buf); } catch (e) {} }
  return t;
}

/* ============ 파일 형식 ============ */
const IMG_RE = /\.(jpe?g|png|gif|webp)$/i;
async function zipImages(blob, prog){
  if (!window.JSZip) throw new Error("압축 해제 도구를 불러오지 못했어요 (인터넷 연결 확인)");
  const z = await JSZip.loadAsync(blob);
  const names = Object.keys(z.files).filter(n => !z.files[n].dir && IMG_RE.test(n) && !/__MACOSX/.test(n)).sort(natCmp);
  const out = [];
  for (let i = 0; i < names.length; i++) {
    const ext = names[i].split(".").pop().toLowerCase();
    const type = ext === "png" ? "image/png" : ext === "gif" ? "image/gif" : ext === "webp" ? "image/webp" : "image/jpeg";
    out.push(new Blob([await z.files[names[i]].async("arraybuffer")], {type}));
    if (i % 5 === 0) prog?.(i / names.length);
  }
  if (!out.length) throw new Error("이미지가 없는 압축 파일이에요");
  return out;
}
async function readEpub(file, prog){
  if (!window.JSZip) throw new Error("압축 해제 도구를 불러오지 못했어요");
  const z = await JSZip.loadAsync(file);
  const txt = p => z.file(p)?.async("string");
  const contXml = await txt("META-INF/container.xml");
  if (!contXml) throw new Error("EPUB 형식이 아니에요");
  const cont = new DOMParser().parseFromString(contXml, "application/xml");
  const opfPath = cont.querySelector("rootfile").getAttribute("full-path");
  const dir = opfPath.includes("/") ? opfPath.slice(0, opfPath.lastIndexOf("/") + 1) : "";
  const opf = new DOMParser().parseFromString(await txt(opfPath), "application/xml");
  const encXml = (await txt("META-INF/encryption.xml")) || "";
  const algs = [...encXml.matchAll(/EncryptionMethod[^>]*Algorithm="([^"]+)"/g)].map(m => m[1]);
  if (z.file("META-INF/rights.xml") || algs.some(a => !/idpf\.org\/2008\/embedding|ns\.adobe\.com\/pdf\/enc#RC/.test(a)))
    throw new Error("DRM(복제 방지)이 걸린 EPUB이라 열 수 없어요");
  const g = tag => opf.getElementsByTagNameNS("*", tag)[0]?.textContent?.trim() || "";
  const man = {}, props = {};
  for (const it of opf.getElementsByTagNameNS("*", "item")) { man[it.getAttribute("id")] = it.getAttribute("href"); props[it.getAttribute("id")] = it.getAttribute("properties") || ""; }
  const spine = [...opf.getElementsByTagNameNS("*", "itemref")].map(r => man[r.getAttribute("idref")]).filter(Boolean);
  const resolve = href => (dir + decodeURIComponent(href)).replace(/[^/]+\/\.\.\//g, "");
  // 표지
  let coverBlob = null;
  try {
    let cid = Object.keys(props).find(k => /cover-image/.test(props[k]));
    if (!cid) cid = [...opf.getElementsByTagNameNS("*", "meta")].find(m => m.getAttribute("name") === "cover")?.getAttribute("content");
    const href = cid && man[cid];
    if (href && IMG_RE.test(href)) coverBlob = new Blob([await z.file(resolve(href)).async("arraybuffer")], {type: /png$/i.test(href) ? "image/png" : "image/jpeg"});
  } catch (e) {}
  const paras = [];
  for (let i = 0; i < spine.length; i++) {
    prog?.(i / spine.length);
    const html = await txt(resolve(spine[i])); if (!html) continue;
    const d = new DOMParser().parseFromString(html, "text/html");
    d.querySelectorAll("script,style,img,svg").forEach(e => e.remove());
    const ps = htmlToParas(d.body);
    if (!ps.length) continue;
    if (paras.length) paras.push({t: "pb", x: ""});
    paras.push(...ps);
  }
  if (!paras.length) throw new Error("본문을 찾지 못했어요 (DRM이 걸린 파일일 수 있어요)");
  return {title: g("title"), author: g("creator"), paras, coverBlob};
}
let pdfjsP = null;
function loadPdfJs(){
  if (window.pdfjsLib) return Promise.resolve(window.pdfjsLib);
  if (!pdfjsP) pdfjsP = new Promise((res, rej) => {
    const s = document.createElement("script");
    s.src = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js";
    s.onload = () => { window.pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js"; res(window.pdfjsLib); };
    s.onerror = () => { pdfjsP = null; rej(new Error("PDF 도구를 불러오지 못했어요 (인터넷 연결 확인)")); };
    document.head.appendChild(s);
  });
  return pdfjsP;
}
async function openPdf(blob){
  const lib = await loadPdfJs();
  return lib.getDocument({data: new Uint8Array(await blob.arrayBuffer())}).promise;
}
async function pdfPageBlob(doc, i, width, type = "image/jpeg"){
  const page = await doc.getPage(i + 1);
  const v1 = page.getViewport({scale: 1});
  const vp = page.getViewport({scale: width / v1.width});
  const cv = document.createElement("canvas"); cv.width = Math.round(vp.width); cv.height = Math.round(vp.height);
  const ctx = cv.getContext("2d"); ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, cv.width, cv.height);
  await page.render({canvasContext: ctx, viewport: vp}).promise;
  return new Promise(r => cv.toBlob(r, type, 0.88));
}
async function thumbFromImage(blob, w = 320){
  const url = URL.createObjectURL(blob);
  try {
    const im = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
    let sw = im.naturalWidth, sx = 0;
    if (sw > im.naturalHeight * 1.1) { sw = sw / 2; sx = sw; } // 펼친 면이면 오른쪽(앞표지)만
    const h = Math.round(w * im.naturalHeight / sw);
    const cv = document.createElement("canvas"); cv.width = w; cv.height = h;
    cv.getContext("2d").drawImage(im, sx, 0, sw, im.naturalHeight, 0, 0, w, h);
    return await new Promise(r => cv.toBlob(r, "image/jpeg", 0.82));
  } finally { URL.revokeObjectURL(url); }
}

/* ============ 공개 도서관 (저작권 만료 작품만) ============ */
const KO2EN = {"데미안":"demian","싯다르타":"siddhartha","수레바퀴 아래서":"unterm rad","이상한 나라의 앨리스":"alice wonderland","앨리스":"alice wonderland","셜록 홈즈":"sherlock holmes","셜록":"sherlock holmes","홈즈":"sherlock holmes","오만과 편견":"pride and prejudice","프랑켄슈타인":"frankenstein","드라큘라":"dracula","보물섬":"treasure island","피터팬":"peter pan","피터 팬":"peter pan","오즈의 마법사":"wizard of oz","톰 소여":"tom sawyer","허클베리 핀":"huckleberry finn","작은 아씨들":"little women","위대한 개츠비":"great gatsby","모비 딕":"moby dick","지킬 박사와 하이드":"jekyll hyde","지킬":"jekyll hyde","크리스마스 캐럴":"christmas carol","80일간의 세계일주":"around the world in eighty days","해저 2만리":"twenty thousand leagues","빨간 머리 앤":"anne of green gables","키다리 아저씨":"daddy long legs","비밀의 화원":"secret garden","레 미제라블":"les miserables","몬테크리스토 백작":"count of monte cristo","삼총사":"three musketeers","햄릿":"hamlet","로미오와 줄리엣":"romeo and juliet","걸리버 여행기":"gulliver","로빈슨 크루소":"robinson crusoe","정글북":"jungle book","안데르센":"andersen fairy tales","그림 동화":"grimm fairy tales","이솝":"aesop","투명인간":"invisible man","타임머신":"time machine","우주 전쟁":"war of the worlds","죄와 벌":"crime and punishment","전쟁과 평화":"war and peace","안나 카레니나":"anna karenina","제인 에어":"jane eyre","폭풍의 언덕":"wuthering heights","오페라의 유령":"phantom of the opera","변신":"metamorphosis kafka","노트르담의 꼽추":"hunchback of notre dame","돈키호테":"don quixote","두 도시 이야기":"tale of two cities","올리버 트위스트":"oliver twist","도리언 그레이":"dorian gray","아라비안 나이트":"arabian nights","에드거 앨런 포":"poe","코난 도일":"conan doyle","마크 트웨인":"mark twain","찰스 디킨스":"dickens","제인 오스틴":"jane austen","톨스토이":"tolstoy","도스토옙스키":"dostoyevsky","셰익스피어":"shakespeare","쥘 베른":"jules verne","헤르만 헤세":"hesse","헤세":"hesse","카프카":"kafka","괴테":"goethe","젊은 베르테르의 슬픔":"werther"};
const KO2EN_COMIC = {"공포":"horror","호러":"horror","로맨스":"romance","연애":"romance","서부":"western","카우보이":"western","정글":"jungle","공상과학":"science fiction","SF":"science fiction","우주":"space","슈퍼히어로":"superhero","히어로":"hero","전쟁":"war","범죄":"crime","탐정":"detective","동물":"funny animal","유머":"humor","미스터리":"mystery","캡틴 마블":"captain marvel","블루 비틀":"blue beetle","팬텀 레이디":"phantom lady"};
function translateQ(q, map){ const k = Object.keys(map).find(k => q.replace(/\s/g,"").includes(k.replace(/\s/g,""))); return k ? map[k] : q; }
function pdKorea(p){
  const yr = new Date().getFullYear();
  if (p.death_year != null) return p.death_year <= Math.max(1962, yr - 71);
  if (p.birth_year != null) return p.birth_year < 1840;
  return false;
}
const flipName = n => { const m = String(n).match(/^([^,]+),\s*(.+?)(\s*\(.*\))?$/); return m ? `${m[2]} ${m[1]}` : n; };
const LANG = {en: "영어", de: "독일어", fr: "프랑스어", ko: "한국어", ja: "일본어", zh: "중국어", es: "스페인어", it: "이탈리아어", ru: "러시아어"};

function probeCount(urlOf){
  const ok = i => new Promise(res => { const im = new Image(); im.onload = () => res(true); im.onerror = () => res(false); im.src = urlOf(i); });
  return (async () => {
    if (!(await ok(0))) return 0;
    let lo = 0, hi = 1;
    while (hi < 2048 && await ok(hi)) { lo = hi; hi *= 2; }
    while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (await ok(mid)) lo = mid; else hi = mid; }
    return lo + 1;
  })();
}
const Sources = {
  ws: {
    label: "한국 고전소설 · 위키문헌",
    api: "https://ko.wikisource.org/w/api.php",
    item(title, author, snip){
      const root = title.split("/")[0];
      const m = root.match(/^(.*?)\s*\(([^)]+)\)$/);
      return {id: "ws:" + root, source: "ws", type: "text", wtitle: root, title: m ? m[1] : root, author: author || (m ? m[2] : ""), snippet: snip || ""};
    },
    async search(q, mode){ return (mode === "author") ? this.searchAuthor(q) : this.searchTitle(q); },
    async searchTitle(q){
      const norm = s => s.replace(/\s/g, "").toLowerCase(), nq = norm(q);
      const docs = [];
      // 제목 안에서만 찾기 (본문 매칭 제외)
      try { const j = await fetchJSON(`${this.api}?action=query&list=search&srsearch=${enc("intitle:" + q)}&srnamespace=0&srlimit=40&format=json&origin=*`); for (const r of (j.query?.search || [])) docs.push({title: r.title, snip: r.snippet}); } catch (e) {}
      try { const p = await fetchJSON(`${this.api}?action=query&list=prefixsearch&pssearch=${enc(q)}&psnamespace=0&pslimit=40&format=json&origin=*`); for (const x of (p.query?.prefixsearch || [])) if (!docs.find(d => d.title === x.title)) docs.push({title: x.title, snip: ""}); } catch (e) {}
      const seen = new Map();
      for (const r of docs) {
        const root = r.title.split("/")[0], base = root.replace(/\s*\([^)]*\)$/, "");
        if (!norm(base).includes(nq)) continue; // 제목에 검색어가 실제로 들어간 것만
        if (seen.has(root)) continue;
        const snip = (r.snip || "").replace(/<[^>]+>/g, "").replace(/&[a-z#0-9]+;/gi, " ");
        const it = this.item(root, "", snip);
        if (!it.author) { const am = snip.match(/저자[\s:：]+([가-힣]{2,12})/); if (am) it.author = am[1]; }
        seen.set(root, it);
      }
      const list = [...seen.values()].slice(0, 24);
      await this.fillAuthors(list);
      return list;
    },
    async searchAuthor(q){
      const name = q.replace(/^저자[\s:：]*/, "").trim();
      const out = new Map();
      const addFrom = async (authorPage, label) => {
        const j = await fetchJSON(`${this.api}?action=query&list=backlinks&bltitle=${enc(authorPage)}&blnamespace=0&bllimit=500&blfilterredir=nonredirects&format=json&origin=*`);
        for (const b of (j.query?.backlinks || [])) { const root = b.title.split("/")[0]; if (!out.has(root)) out.set(root, this.item(root, label)); }
      };
      try { await addFrom("저자:" + name, name); } catch (e) {}
      if (out.size === 0) { // 부분 일치: 저자 이름 후보를 찾아서
        try {
          const p = await fetchJSON(`${this.api}?action=query&list=prefixsearch&pssearch=${enc("저자:" + name)}&pslimit=5&format=json&origin=*`);
          for (const a of (p.query?.prefixsearch || [])) { try { await addFrom(a.title, a.title.replace(/^저자:/, "")); } catch (e) {} }
        } catch (e) {}
      }
      return [...out.values()].slice(0, 60);
    },
    async fillAuthors(list){
      const need = list.filter(it => !it.author);
      if (!need.length) return;
      try {
        const w = await fetchJSON(`${this.api}?action=query&prop=revisions&rvprop=content&rvslots=main&rvsection=0&titles=${enc(need.map(it => it.wtitle).join("|"))}&redirects=1&format=json&formatversion=2&origin=*`);
        const norm = {}; for (const r of (w.query?.normalized || [])) norm[r.from] = r.to;
        const byTitle = {}; for (const pg of (w.query?.pages || [])) byTitle[pg.title] = pg.revisions?.[0]?.slots?.main?.content || "";
        for (const it of need) {
          const wt = byTitle[norm[it.wtitle] || it.wtitle] || "";
          const am = wt.match(/(?:저자|author)\s*=\s*(?:\[\[\s*(?:저자|Author)\s*:)?\s*([^\|\]\n}#]+)/i);
          if (am) { const a = am[1].trim(); if (a && a.length <= 20) it.author = a; }
        }
      } catch (e) {}
    },
    async parse(title){
      const j = await fetchJSON(`${this.api}?action=parse&page=${enc(title)}&prop=text&redirects=1&formatversion=2&format=json&origin=*`);
      if (j.error) throw new Error(j.error.info);
      return {doc: new DOMParser().parseFromString(j.parse.text, "text/html"), title: j.parse.title};
    },
    clean(doc){
      let author = "";
      const a = [...doc.querySelectorAll("a")].find(a => /\/wiki\/(%EC%A0%80%EC%9E%90|저자):/.test(a.getAttribute("href") || ""));
      if (a) author = a.textContent.trim();
      doc.querySelectorAll(".mw-editsection,.ws-noexport,.noprint,table,style,script,sup.reference,.reference,.references,.mw-references-wrap,.navbox,.metadata,.licenseContainer,.ws-header,#headertemplate,.header_box,.mw-empty-elt,figure,.thumb,img,.gallery,.toc,#toc,link,meta").forEach(e => e.remove());
      return author;
    },
    async load(item, prog){
      prog("위키문헌에서 받는 중…", 0.05);
      const {doc, title} = await this.parse(item.wtitle);
      const subLinks = [...doc.querySelectorAll("a[href^='/wiki/']")].map(a => { try { return decodeURIComponent(a.getAttribute("href").slice(6)).replace(/_/g, " ").split("#")[0]; } catch (e) { return ""; } });
      const author = this.clean(doc) || item.author;
      const sp = await fetchJSON(`${this.api}?action=query&list=allpages&apprefix=${enc(title + "/")}&apnamespace=0&aplimit=300&format=json&origin=*`).catch(() => ({}));
      let subs = (sp.query?.allpages || []).map(p => p.title);
      let paras = htmlToParas(doc.querySelector(".mw-parser-output") || doc.body, {allowLi: !subs.length});
      if (subs.length) {
        const set = new Set(subs), ordered = [];
        for (const l of subLinks) if (set.has(l) && !ordered.includes(l)) ordered.push(l);
        subs = ordered.concat(subs.filter(s => !ordered.includes(s)).sort(natCmp)).slice(0, 200);
        const parts = new Array(subs.length); let done = 0, i = 0;
        const worker = async () => {
          while (i < subs.length) {
            const k = i++;
            try { const r = await this.parse(subs[k]); this.clean(r.doc); parts[k] = htmlToParas(r.doc.querySelector(".mw-parser-output") || r.doc.body); } catch (e) { parts[k] = []; }
            done++; prog(`장(章) 받는 중… ${done} / ${subs.length}`, 0.05 + 0.9 * done / subs.length);
          }
        };
        await Promise.all([worker(), worker(), worker(), worker()]);
        if (paras.length > 12 || paras.some(p => p.x.length > 200)) paras.push({t: "pb", x: ""}); else paras = [];
        subs.forEach((s, k) => {
          if (!parts[k] || !parts[k].length) return;
          const name = s.slice(title.length + 1);
          if (!(parts[k][0].t === "h" && parts[k][0].x.includes(name))) paras.push({t: "h1", x: name.replace(/\//g, " · ")});
          else parts[k][0].t = "h1";
          paras.push(...parts[k]);
        });
      }
      paras = paras.filter(p => p.t === "pb" || p.x.trim());
      if (paras.filter(p => p.t === "p" || p.t === "v").length < 2) throw new Error("본문이 없는 문서예요 (목록/동음이의 문서일 수 있어요)");
      return {meta: {title: item.title, author}, content: {paras}};
    }
  },
  gb: {
    label: "세계 고전 · 프로젝트 구텐베르크",
    async search(q){
      const qq = translateQ(q, KO2EN);
      const j = await fetchJSON(`https://gutendex.com/books/?search=${enc(qq)}`, 30000);
      return (j.results || [])
        .filter(b => (b.authors || []).every(pdKorea) && (b.translators || []).every(pdKorea))
        .filter(b => Object.keys(b.formats || {}).some(k => k.startsWith("text/plain")))
        .slice(0, 24)
        .map(b => ({id: "gb:" + b.id, source: "gb", type: "text", gid: b.id, title: b.title.replace(/\s*\$[a-z]\s*/g, " "),
          author: (b.authors || []).map(a => flipName(a.name)).join(", "),
          cover: b.formats["image/jpeg"] || "",
          txt: Object.entries(b.formats).filter(([k]) => k.startsWith("text/plain")).sort(([a], [b]) => (b.includes("utf-8") - a.includes("utf-8")))[0][1],
          snippet: `${(b.languages || []).map(l => LANG[l] || l).join(", ")} 원문 · 다운로드 ${(b.download_count || 0).toLocaleString()}회`}));
    },
    async load(item, prog){
      prog("프로젝트 구텐베르크에서 받는 중…", 0.2, "책이 크면 조금 걸릴 수 있어요");
      const id = item.gid;
      const raw = await fetchTextAny([`https://www.gutenberg.org/cache/epub/${id}/pg${id}.txt`, item.txt].filter(Boolean));
      prog("정리하는 중…", 0.9);
      const paras = textToParas(raw);
      if (paras.length < 3) throw new Error("본문을 읽지 못했어요");
      return {meta: {}, content: {paras}};
    }
  },
  ia: {
    label: "고전 만화 · 인터넷 아카이브",
    async search(q){
      const qq = translateQ(q, KO2EN_COMIC).replace(/[():"\[\]{}^~*?\\]/g, " ").trim();
      const query = `collection:(goldenagecomics)` + (qq ? ` AND (${qq})` : "");
      const u = `https://archive.org/advancedsearch.php?q=${enc(query)}&fl%5B%5D=identifier&fl%5B%5D=title&fl%5B%5D=creator&fl%5B%5D=date&fl%5B%5D=imagecount&rows=40&page=1&sort%5B%5D=downloads+desc&output=json`;
      const j = await fetchJSON(u);
      return (j.response?.docs || []).map(d => ({id: "ia:" + d.identifier, source: "ia", type: "comic", ident: d.identifier,
        title: Array.isArray(d.title) ? d.title[0] : (d.title || d.identifier), author: [].concat(d.creator || []).join(", "),
        cover: `https://archive.org/services/img/${d.identifier}`, snippet: [String(d.date || "").slice(0, 4), d.imagecount ? d.imagecount + "쪽" : ""].filter(Boolean).join(" · ")}));
    },
    async load(item, prog){
      prog("인터넷 아카이브에서 만화 정보를 받는 중…", 0.1);
      const id = item.ident;
      const m = await fetchJSON(`https://archive.org/metadata/${enc(id)}`);
      const files = m.files || [];
      const base = `https://archive.org/download/${enc(id)}/`;
      const encPath = p => p.split("/").map(enc).join("/");
      if (files.some(f => /_jp2\.(zip|tar)$/i.test(f.name))) {
        let n = parseInt(m.metadata?.imagecount) || 0;
        if (!n) { prog("쪽수를 세는 중…", 0.4); n = await probeCount(i => `${base}page/n${i}_thumb.jpg`); }
        if (!n) throw new Error("페이지를 찾지 못했어요");
        return {meta: {count: n}, content: {pages: Array.from({length: n}, (_, i) => `${base}page/n${i}.jpg`)}};
      }
      const imgs = files.filter(f => IMG_RE.test(f.name) && f.source === "original" && !/thumb/i.test(f.name)).map(f => f.name).sort(natCmp);
      if (imgs.length > 1) return {meta: {count: imgs.length}, content: {pages: imgs.map(n => base + encPath(n))}};
      const cbz = files.find(f => /\.(cbz|zip)$/i.test(f.name) && !/_jp2|_images/i.test(f.name));
      if (cbz) {
        prog("만화 파일을 받는 중…", 0.3, fmtMB(+cbz.size || 0));
        const blob = await fetchT(base + encPath(cbz.name), {}, 180000).then(r => r.blob());
        return {meta: {}, content: {zip: blob}};
      }
      throw new Error("이 만화는 브라우저에서 볼 수 있는 형식이 아니에요");
    }
  }
};

/* ============ 표지 ============ */
function genCover(title, author){
  const h = hashHue((title || "") + (author || ""));
  return `<div class="gen" style="background:linear-gradient(160deg,hsl(${h} 32% 34%),hsl(${(h+20)%360} 38% 22%))"><b>${esc(title)}</b><span>${esc(author || "")}</span></div>`;
}
function coverHTML(b, src){
  const u = src || b.cover;
  if (u) return `<img loading="lazy" src="${esc(u)}" alt="" data-t="${esc(b.title)}" data-a="${esc(b.author || "")}" onerror="cmCoverFail(this)">`;
  return genCover(b.title, b.author);
}
window.cmCoverFail = img => { const d = document.createElement("div"); d.innerHTML = genCover(img.dataset.t, img.dataset.a); img.replaceWith(d.firstElementChild); };
function toggleFs(){ try { if (document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen({navigationUI: "hide"}); } catch (e) { toast("전체 화면을 지원하지 않는 브라우저예요"); } }
