const $ = (s, r=document) => r.querySelector(s);
const $$ = (s, r=document) => Array.from(r.querySelectorAll(s));

const KEY = "LEXA_STEP_BY_STEP_V1";

function nowSemester(){
  const d = new Date();
  const y = d.getFullYear();
  const s = (d.getMonth() <= 5) ? 1 : 2;
  return `${y}-${s}`;
}

function load(){
  try{
    const raw = localStorage.getItem(KEY);
    if(!raw) return null;
    return JSON.parse(raw);
  }catch{return null;}
}
function save(data){
  localStorage.setItem(KEY, JSON.stringify(data));
}

let data = load() || { activeSemester: nowSemester(), semestres: {} };
if(!data.semestres[data.activeSemester]) data.semestres[data.activeSemester] = { ramos:{}, evaluaciones:[] };

const views = {
  dashboard: $("#view-dashboard"),
  calculator: $("#view-calculator"),
  planner: $("#view-planner"),
  history: $("#view-history"),
};

function showView(name){
  Object.keys(views).forEach(k=>{
    views[k].classList.toggle("hidden", k !== name);
  });
  $$(".nav-btn").forEach(b=> b.classList.toggle("active", b.dataset.view === name));
}

function renderTop(){
  const sel = $("#semesterSelect");
  const keys = Object.keys(data.semestres).sort((a,b)=> b.localeCompare(a));
  sel.innerHTML = keys.map(k=> `<option value="${k}">${k}</option>`).join("");
  sel.value = data.activeSemester;
}

function renderDashboard(){
  const sem = data.activeSemester;
  views.dashboard.innerHTML = `
    <div class="grid cols-3">
      <div class="card">
        <h2>🏠 Dashboard</h2>
        <div class="muted">Semestre: <b>${sem}</b></div>
      </div>
      <div class="card">
        <h2>✨ En breve</h2>
        <div class="muted">Aquí pondremos promedio, horas y alertas (paso 2).</div>
      </div>
      <div class="card">
        <h2>📌 Próximas pruebas</h2>
        <div class="muted">Aquí irá la lista de evaluaciones (paso 3).</div>
      </div>
    </div>
  `;
}

function init(){
  // nav
  $$(".nav-btn").forEach(btn=>{
    btn.addEventListener("click", ()=> showView(btn.dataset.view));
  });

  // top semester
  $("#semesterSelect").addEventListener("change", (e)=>{
    data.activeSemester = e.target.value;
    save(data);
    render();
  });

  $("#newSemesterBtn").addEventListener("click", ()=>{
    const k = prompt('Nuevo semestre (ej: "2026-1")');
    if(!k) return;
    const key = k.trim();
    if(!key) return;
    if(!data.semestres[key]) data.semestres[key] = { ramos:{}, evaluaciones:[] };
    data.activeSemester = key;
    save(data);
    render();
  });

  $("#exportBtn").addEventListener("click", ()=>{
    const blob = new Blob([JSON.stringify(data, null, 2)], {type:"application/json"});
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "LEXA-backup.json";
    a.click();
    URL.revokeObjectURL(url);
  });

  $("#importInput").addEventListener("change", async (e)=>{
    const file = e.target.files?.[0];
    if(!file) return;
    try{
      const txt = await file.text();
      const obj = JSON.parse(txt);
      if(!obj?.semestres) throw new Error("Archivo inválido.");
      data = obj;
      save(data);
      render();
      alert("Importado ✅");
    }catch(err){
      alert("No se pudo importar: " + err.message);
    }finally{
      e.target.value = "";
    }
  });

  render();
  showView("dashboard");
}

function render(){
  // safety
  if(!data.semestres[data.activeSemester]) data.semestres[data.activeSemester] = { ramos:{}, evaluaciones:[] };
  save(data);

  renderTop();
  renderDashboard();

  // placeholders por ahora
  views.calculator.innerHTML = `<div class="card"><h2>📊 Calculadora</h2><div class="muted">La armamos en el paso 2 (compacta y linda).</div></div>`;
  views.planner.innerHTML = `<div class="card"><h2>📅 Planificador</h2><div class="muted">Lo armamos en el paso 3 (incluye Flocus 🤓).</div></div>`;
  views.history.innerHTML = `<div class="card"><h2>📚 Historial</h2><div class="muted">Lo armamos en el paso 4.</div></div>`;
}

init();
