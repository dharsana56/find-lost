function escapeHtml(s = "") {
  return s.replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[c]));
}

function makeCaseId(prefix = "C") {
  const rand = Math.random().toString(36).slice(2, 7).toUpperCase();
  const t = Date.now().toString().slice(-6);
  return `${prefix}-${t}-${rand}`;
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function getSession() {
  try { return JSON.parse(localStorage.getItem("lf_session") || "null"); }
  catch { return null; }
}

function requireLogin() {
  const s = getSession();
  if (!s) {
    window.location.href = "./signin.html";
    return false;
  }
  return true;
}

function normalizeText(s) {
  return (s || "").toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}

function tokenSet(s) {
  const words = normalizeText(s).split(" ").filter(w => w.length >= 3);
  return new Set(words);
}

function jaccard(a, b) {
  const A = tokenSet(a);
  const B = tokenSet(b);
  if (A.size === 0 || B.size === 0) return { score: 0, common: [] };
  const common = [];
  A.forEach(w => { if (B.has(w)) common.push(w); });
  const union = new Set([...A, ...B]).size;
  const score = Math.round((common.length / union) * 100);
  return { score, common: common.slice(0, 10) };
}

function timeBoost(lostISO, foundISO) {
  if (!lostISO || !foundISO) return 0;
  const t1 = new Date(lostISO).getTime();
  const t2 = new Date(foundISO).getTime();
  if (isNaN(t1) || isNaN(t2)) return 0;
  const diffMin = Math.abs(t2 - t1) / 60000;
  if (diffMin <= 30) return 12;
  if (diffMin <= 120) return 8;
  if (diffMin <= 1440) return 4;
  return 0;
}

function locationBoost(lostLoc, foundLoc) {
  const a = normalizeText(lostLoc);
  const b = normalizeText(foundLoc);
  if (!a || !b) return 0;

  const strong = ["cafeteria","canteen","library","lab","classroom","seminar","auditorium","hostel","bus","gate","parking","ground","block"];
  const A = tokenSet(a);
  const B = tokenSet(b);

  for (const k of strong) {
    if (A.has(k) && B.has(k)) return 10;
  }

  const common = [];
  A.forEach(w => { if (B.has(w)) common.push(w); });
  if (common.length >= 2) return 5;
  return 0;
}

function computeFinalScore(lostObj, foundObj) {
  const lostText = `${lostObj.itemType || ""} ${lostObj.description || ""} ${lostObj.location || ""}`;
  const foundText = `${foundObj.itemType || ""} ${foundObj.description || ""} ${foundObj.foundAt || ""} ${foundObj.handedTo || ""}`;
  const base = jaccard(lostText, foundText);

  const tBoost = timeBoost(lostObj.createdAt, foundObj.createdAt);
  const locA = lostObj.location || "";
  const locB = foundObj.foundAt || foundObj.handedTo || "";
  const lBoost = locationBoost(locA, locB);

  const finalScore = Math.min(100, base.score + tBoost + lBoost);

  return {
    textScore: base.score,
    finalScore,
    timeBoost: tBoost,
    locationBoost: lBoost,
    common: base.common
  };
}

function renderRecentFound() {
  const container = document.getElementById("recentFoundList");
  if (!container) return;

  const found = JSON.parse(localStorage.getItem("found_reports") || "[]");
  const latest = found.slice(0, 6);

  if (latest.length === 0) {
    container.innerHTML = `<div class="card">No found reports yet.</div>`;
    return;
  }

  container.innerHTML = latest.map(item => {
    const img = item.imageBase64
      ? `<img src="${item.imageBase64}" alt="Found item" style="width:100%; max-height:220px; object-fit:cover; border-radius:14px; border:1px solid rgba(255,255,255,0.12); margin-top:10px;">`
      : "";

    return `
      <div class="card">
        <div style="display:flex; justify-content:space-between; gap:10px; flex-wrap:wrap;">
          <div>
            <b>${escapeHtml(item.itemType || "Item")}</b><br/>
            <span style="color: rgba(241,245,255,0.7); font-weight:800;">Case ID: ${escapeHtml(item.id || "")}</span><br/>
            <span style="color: rgba(241,245,255,0.7);">Status: <b>${escapeHtml(item.status || "")}</b></span>
          </div>
          <a class="btn btn-primary" href="./tracking.html?case=${encodeURIComponent(item.id || "")}">Track / Claim</a>
        </div>

        <div style="margin-top:10px; color: rgba(241,245,255,0.75); line-height:1.6;">
          ${escapeHtml(item.description || "")}
        </div>

        ${img}

        <div style="margin-top:10px; color: rgba(241,245,255,0.7);">
          Found at: <b>${escapeHtml(item.foundAt || "Not mentioned")}</b><br/>
          Handed to: <b>${escapeHtml(item.handedTo || "Not mentioned")}</b><br/>
          Reported by: <b>${escapeHtml(item.reportedBy || "")}</b>
        </div>
      </div>
    `;
  }).join("");
}

function initAiPageAutoFill() {
  const lostSelect = document.getElementById("lostSelect");
  const foundSelect = document.getElementById("foundSelect");
  const btnCompare = document.getElementById("btnCompare");
  const resultBox = document.getElementById("aiResult");
  if (!lostSelect || !foundSelect || !btnCompare || !resultBox) return;

  const lost = JSON.parse(localStorage.getItem("lost_reports") || "[]");
  const found = JSON.parse(localStorage.getItem("found_reports") || "[]");

  if (lost.length === 0) {
    lostSelect.innerHTML = `<option value="">No lost reports found</option>`;
  } else {
    lostSelect.innerHTML = lost.map((x, i) => {
      const t = `${x.itemType || "Item"} • ${x.location || "Location"} • ${(x.createdAt || "").slice(0,10)}`;
      return `<option value="${i}">${escapeHtml(t)}</option>`;
    }).join("");
  }

  if (found.length === 0) {
    foundSelect.innerHTML = `<option value="">No found reports found</option>`;
  } else {
    foundSelect.innerHTML = found.map((x, i) => {
      const loc = x.foundAt || x.handedTo || "Location";
      const t = `${x.itemType || "Item"} • ${loc} • ${(x.createdAt || "").slice(0,10)} • ${x.id || ""}`;
      return `<option value="${i}">${escapeHtml(t)}</option>`;
    }).join("");
  }

  btnCompare.addEventListener("click", () => {
    const li = parseInt(lostSelect.value, 10);
    const fi = parseInt(foundSelect.value, 10);

    if (isNaN(li) || isNaN(fi) || !lost[li] || !found[fi]) {
      resultBox.style.display = "block";
      resultBox.innerHTML = `❌ Select both a lost report and a found report.`;
      return;
    }

    const r = computeFinalScore(lost[li], found[fi]);
    const id = found[fi].id || "";
    const common = r.common.length ? r.common.map(escapeHtml).join(", ") : "none";

    resultBox.style.display = "block";
    resultBox.innerHTML = `
      <b>Text Similarity:</b> ${r.textScore}%<br/>
      <b>Context Boost:</b> +${r.timeBoost + r.locationBoost} (Time +${r.timeBoost}, Location +${r.locationBoost})<br/>
      <b>Final Confidence:</b> ${r.finalScore}%<br/>
      <span style="color:rgba(241,245,255,0.75); font-weight:800;">Common keywords:</span> ${common}<br/>
      <div style="margin-top:10px;">
        <a class="btn btn-primary" href="./tracking.html?case=${encodeURIComponent(id)}">Track / Claim</a>
      </div>
    `;
  });
}

function bucketLocation(raw) {
  const s = normalizeText(raw);
  if (!s) return "Other";
  const rules = [
    ["Cafeteria", ["cafeteria","canteen"]],
    ["Library", ["library"]],
    ["Labs", ["lab","laboratory"]],
    ["Classrooms", ["classroom","class","seminar"]],
    ["Auditorium", ["auditorium"]],
    ["Hostel", ["hostel"]],
    ["Gate", ["gate","entrance"]],
    ["Parking", ["parking"]],
    ["Ground", ["ground","playground"]],
    ["Bus Stop", ["bus","stop"]],
    ["Block", ["block","corridor"]],
    ["Office/Security", ["security","office","admin"]]
  ];
  for (const [name, keys] of rules) {
    for (const k of keys) {
      if (s.includes(k)) return name;
    }
  }
  return "Other";
}

function buildHotspotCounts() {
  const lost = JSON.parse(localStorage.getItem("lost_reports") || "[]");
  const found = JSON.parse(localStorage.getItem("found_reports") || "[]");
  const counts = {};
  const inc = (k) => { counts[k] = (counts[k] || 0) + 1; };

  lost.forEach(r => inc(bucketLocation(r.location || "")));
  found.forEach(r => inc(bucketLocation(r.foundAt || r.handedTo || "")));

  return counts;
}

function levelFromCount(c, max) {
  if (!max || max <= 0) return 0;
  const p = c / max;
  if (c === 0) return 0;
  if (p <= 0.2) return 1;
  if (p <= 0.4) return 2;
  if (p <= 0.6) return 3;
  if (p <= 0.8) return 4;
  return 5;
}

function initHeatmapPage() {
  const grid = document.getElementById("heatGrid");
  const topList = document.getElementById("topList");
  const btn = document.getElementById("refreshHeat");
  if (!grid || !topList || !btn) return;

  const zones = ["Cafeteria","Library","Labs","Classrooms","Auditorium","Hostel","Gate","Parking","Ground","Bus Stop","Block","Office/Security","Other"];

  const render = () => {
    const counts = buildHotspotCounts();
    const arr = zones.map(z => ({ zone: z, count: counts[z] || 0 }));
    const max = Math.max(...arr.map(x => x.count), 0);

    grid.innerHTML = arr.map(x => {
      const lvl = levelFromCount(x.count, max);
      return `<div class="heatcell lvl${lvl}">
        <div class="heatname">${escapeHtml(x.zone)}</div>
        <div class="heatmeta">Reports: <b>${x.count}</b></div>
      </div>`;
    }).join("");

    const top = [...arr].sort((a,b) => b.count - a.count).slice(0, 5);
    topList.innerHTML = top.map((x,i) => `
      <div class="topitem">
        <div><b>#${i+1} ${escapeHtml(x.zone)}</b></div>
        <div style="color:rgba(241,245,255,.75); font-weight:900;">${x.count} reports</div>
      </div>
    `).join("");

    if (max === 0) {
      topList.innerHTML = `<div class="topitem"><div>No data yet. Submit a few Lost/Found reports to see hotspots.</div></div>`;
    }
  };

  btn.addEventListener("click", render);
  render();
}

document.addEventListener("DOMContentLoaded", () => {
  renderRecentFound();
  initAiPageAutoFill();
  initHeatmapPage();
});
