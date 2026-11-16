/* ---------- settings: theme, sound, new cards per day, sync, export, reset; dev molecule bench ---------- */
function renderSettings(view) {
  const st = settings();
  view.innerHTML = `<section class="settings">
    <div class="eyebrow"><a href="#/">← Home</a></div><h1>Settings</h1>
    <div class="row"><span>Theme</span><div class="seg">${THEMES.map(([id, n]) => `<button data-theme="${id}" aria-pressed="${store.look.theme === id}">${n}</button>`).join("")}</div></div>
    <div class="row"><span>Sound</span><div class="seg"><button data-sound="1" aria-pressed="${store.sound !== false}">On</button><button data-sound="0" aria-pressed="${store.sound === false}">Off</button></div></div>
    <div class="row"><span>New cards per day</span><div class="seg">${[5, 10, 15, 20, 30].map(n => `<button data-new="${n}" aria-pressed="${st.newPerDay === n}">${n}</button>`).join("")}</div></div>
    <div class="row"><span>Your name <small class="mute">(optional, shown on exports)</small></span><input id="sName" value="${esc(store.name || "")}" maxlength="40"></div>
    <h2>Where you are in the course</h2>
    <div class="row"><span>Course</span><div class="seg">${[[1, "Orgo 1"], [2, "Orgo 2"]].map(([v, n]) => `<button data-level="${v}" aria-pressed="${(st.level || 2) === v}">${n}</button>`).join("")}</div></div>
    <p class="mute">Orgo 2 units you've covered in class open straight away, with optional lessons and no warm-up cards.</p>
    <div class="places">${placementList()}</div>
    <h2>Sync between devices</h2><div id="syncBox"></div>
    <h2>Your data</h2>
    <p class="mute">Progress is saved in this browser${CONTENT.dev ? " (the preview build keeps its own separate progress)" : ""}. Export it to send to whoever is running the pilot, or as a backup.</p>
    <div class="actions">${btn("Export progress (.json)", "export")}${btn("Replay the tour", "tourb")}${btn("Reset all progress", "danger reset")}</div>
    ${(store.reports || []).length ? `<h2>Problems you reported</h2><ul class="reports">${store.reports.map(r => `<li><code>${esc(r.card)}</code> ${esc(r.text)}</li>`).join("")}</ul>` : ""}
    <h2>About</h2>
    <p class="mute">Orgo Type drills organic chemistry by mechanism pattern with spaced, mixed retrieval practice. Molecules are drawn with RDKit (BSD licence); scheduling uses FSRS (ts-fsrs, MIT). Build ${BUILD_ID}.</p>
  </section>`;
  view.querySelectorAll("[data-theme]").forEach(b => b.onclick = () => { store.look.theme = b.dataset.theme; save(); applyTheme(); renderSettings(view); });
  view.querySelectorAll("[data-sound]").forEach(b => b.onclick = () => { store.sound = b.dataset.sound === "1"; save(); renderSettings(view); });
  view.querySelectorAll("[data-new]").forEach(b => b.onclick = () => { st.newPerDay = +b.dataset.new; save(); renderSettings(view); });
  $("#sName").onchange = e => { store.name = e.target.value.trim(); save(); };
  view.querySelector(".export").onclick = exportProgress;
  view.querySelector(".tourb").onclick = () => { store.toured = false; save(); go("#/"); };
  view.querySelector(".reset").onclick = () => {
    if (!confirm("Erase all progress in this browser? This can't be undone.")) return;
    for (const k of ["cards", "lessons", "log", "days", "reports", "diag"]) delete store[k];
    store.xp = 0; save(); toast("Progress reset"); go("#/");
  };
  wirePlacement(view, () => {});
  view.querySelectorAll(".seg [data-level]").forEach(b => b.onclick = () => {
    st.level = +b.dataset.level;
    if (st.level === 1) st.focus = ["side"]; else if (st.focus.length === 1 && st.focus[0] === "side") st.focus = [];
    save(); renderSettings(view);
  });
  renderSyncBox($("#syncBox"));
}

function exportProgress() {
  const data = JSON.stringify(Object.assign({ exportedAt: new Date().toISOString(), build: BUILD_ID, preview: !!CONTENT.dev }, store), null, 1);
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([data], { type: "application/json" }));
  a.download = `orgo-type-${(store.name || "progress").replace(/\W+/g, "-").toLowerCase()}-${today()}.json`;
  document.body.appendChild(a); a.click(); a.remove();
}

/* dev only: draw any SMILES and tap atoms, to check depictions while authoring */
function renderBench(view) {
  view.innerHTML = `<section><div class="eyebrow"><a href="#/">← Home</a> · Molecule bench</div>
    <form class="smirow" id="bForm"><input id="bSmi" value="[CH3:1][C:2](=[O:3])[CH3:4]" aria-label="SMILES" autocapitalize="off" spellcheck="false"><button class="btn primary">Draw</button></form>
    <div class="mol benchmol" id="bMol"></div><p class="readout" id="bOut"></p></section>`;
  const draw = async () => {
    try {
      const mv = await molPanel($("#bMol"), $("#bSmi").value.trim(), { width: 420, height: 260, tap: "atoms+bonds",
        onTap: k => { mv.clearMarks(); mv.mark(k, "tail"); $("#bOut").textContent = k; } });
      $("#bOut").textContent = `${mv.d.n} atoms · tap an atom or bond`;
    } catch (e) { $("#bOut").innerHTML = `<span class="err">${esc(e.message)}</span>`; }
  };
  $("#bForm").onsubmit = e => { e.preventDefault(); draw(); };
  draw();
}
