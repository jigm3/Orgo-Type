/* ---------- first-visit tour: five short cards, each pointing at one part of the home screen ---------- */
const TOUR = [
  { sel: null, title: "Welcome to Orgo Type",
    text: "Orgo 2 looks like dozens of separate reactions, but most of them run on four mechanism patterns. This app teaches the patterns, then drills them with short daily practice." },
  { sel: ".today", title: "One button a day",
    text: "Start runs today's reviews plus a few new cards, mixed across topics. You answer before you see the answer, and you get one try. Misses come back until you get them right." },
  { sel: ".pmap", title: "The pattern map",
    text: "Each pattern fills in as you master its cards. A card counts as mastered once you've got it right on three separate days, because that's what lasts until the exam." },
  { sel: ".units", title: "Units and lessons",
    text: "Each unit opens with a short lesson: a worked example, then steps where you do more of it yourself. Later units open as you learn the earlier ones, or you can open them early." },
  { sel: ".foot", title: "Your streak, sync and themes",
    text: "Your streak counts days you clear all your due reviews. Settings has themes, the number of new cards per day, sync between devices, and a progress export." },
];
let tourAt = -1;
function maybeTour() { if (!store.placed) return; if (!store.toured && !navigator.webdriver && tourAt < 0 && (location.hash || "#/") === "#/") startTour(); }
function startTour() { tourAt = 0; showTour(); }
function endTour() {
  tourAt = -1; store.toured = true; save();
  $("#tour").hidden = true;
  document.querySelectorAll(".tourlit").forEach(e => e.classList.remove("tourlit"));
}
function showTour() {
  const t = TOUR[tourAt], box = $("#tour");
  document.querySelectorAll(".tourlit").forEach(e => e.classList.remove("tourlit"));
  const target = t.sel && document.querySelector(t.sel);
  if (target) { target.classList.add("tourlit"); target.scrollIntoView({ block: "center", behavior: "smooth" }); }
  box.hidden = false;
  box.innerHTML = `<div class="tcard" role="dialog" aria-modal="true" aria-labelledby="tTitle">
    <div class="eyebrow">${tourAt + 1} of ${TOUR.length}</div><h3 id="tTitle">${esc(t.title)}</h3><p>${esc(t.text)}</p>
    <div class="actions">${btn("Skip", "skip")}${btn(tourAt + 1 < TOUR.length ? "Next" : "Let's go", "primary nx")}</div></div>`;
  box.querySelector(".skip").onclick = endTour;
  box.querySelector(".nx").onclick = () => { tourAt++; tourAt < TOUR.length ? showTour() : endTour(); };
  box.querySelector(".nx").focus({ preventScroll: true });
}
addEventListener("keydown", e => { if (e.key === "Escape" && tourAt >= 0) endTour(); });
