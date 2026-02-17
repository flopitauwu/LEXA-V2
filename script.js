/*****************
  LEXA — Step 2 (funcional)
  - Calculadora compacta (ramos + notas + necesaria para 4.0)
  - Planificador (evaluaciones + lista próxima)
  - Flocus: reloj interactivo (tap start/pause) + mascota
  - Dashboard: promedio (simple), horas estudiadas, alertas, próximas evaluaciones
  - Horas sugeridas por ramo (editable)
******************/

const $ = (s, r=document) => r.querySelector(s);
const $$ = (s, r=document) => Array.from(r.querySelectorAll(s));

const KEY = "LEXA_STEP_BY_STEP_V2";

const round2 = (n)=> Math.round(n*100)/100;
const pad2 = (n)=> String(n).padStart(2,"0");
const isoDate = (d=new Date()) => `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}`;
const safeNum = (v)=> {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
const formatHMS = (sec)=>{
  const h = Math.floor(sec/3600);
  const m = Math.floor((sec%3600)/60);
  const s = sec%60;
  return `${pad2(h)}:${pad2(m)}:${pad2(s)}`;
};

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
function save(){
  localStorage.setItem(KEY, JSON.stringify(data));
}
function uuid(){
  if (window.crypto?.randomUUID) return crypto.randomUUID();
  return "id-" + Math.random().toString(16).slice(2) + "-" + Date.now();
}
function escapeHtml(s){
  return String(s)
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;");
}
function cssSafe(s){
  return String(s).replaceAll(" ","_").replaceAll(/[^\w-]/g,"_");
}
function daysUntil(iso){
  const today = new Date();
  today.setHours(0,0,0,0);
  const d = new Date(iso + "T00:00:00");
  return Math.round((d - today) / (1000*60*60*24));
}
function minutesToHoursText(min){
  return `${round2(min/60)} h`;
}

/******** DATA ********/
let data = load() || {
  activeSemester: nowSemester(),
  semestres: {}
};

function ensureSemester(key){
  if(!data.semestres[key]){
    data.semestres[key] = {
      status: "open", // open | closed (lo activamos en paso 3)
      ramos: {},      // { "Penal": { notas:[], minutosEstudio:0, targetHoras:4 } }
      evaluaciones: []// [{id,date,ramo,tipo}]
    };
  }
}

ensureSemester(data.activeSemester);
save();

/******** DOM ********/
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

/******** CALC HELPERS ********/
function ramoStats(r){
  const notas = r.notas || [];
  const pct = notas.reduce((a,n)=> a+n.porcentaje, 0);
  const acumulado = notas.reduce((a,n)=> a + (n.nota*(n.porcentaje/100)), 0);
  const restante = 100 - pct;

  let notaFinal = null;
  let necesaria = null;
  let msg = "";
  let risk = false;

  if(pct === 0){
    msg = "Agrega tu primera nota para calcular ✨";
  } else if(pct === 100){
    notaFinal = round2(acumulado);
    if(notaFinal >= 4) msg = `Aprobado ✅ (${notaFinal})`;
    else { msg = `Reprobado ⚠️ (${notaFinal})`; risk = true; }
  } else {
    // notaNecesaria = (4.0 - acumuladoActual) / (pesoRestante/100)
    const denom = (restante/100);
    necesaria = (4 - acumulado) / denom;
    necesaria = round2(necesaria);

    if(acumulado >= 4) msg = "Vas sobre 4.0 en lo acumulado 💜";
    if(necesaria > 7){ risk = true; msg = "Riesgo: necesitarías más de 7.0 ⚠️"; }
    else if(necesaria <= 1){ msg = "Muy asegurado: incluso con 1.0 llegas a 4.0 ✅"; }
  }

  return {
    pct,
    acumulado: round2(acumulado),
    restante,
    notaFinal,
    necesaria,
    msg,
    risk
  };
}

function semesterSummary(semKey){
  const sem = data.semestres[semKey];
  const ramos = Object.entries(sem.ramos || {});
  const upcoming = (sem.evaluaciones||[])
    .slice()
    .sort((a,b)=> a.date.localeCompare(b.date))
    .filter(e=> daysUntil(e.date) >= 0);

  // promedio simple con lo acumulado de cada ramo que tenga notas
  let sum=0, count=0;
  let totalMin=0;
  let risks=0;

  for(const [,r] of ramos){
    totalMin += (r.minutosEstudio||0);
    const st = ramoStats(r);
    if(st.pct > 0){
      sum += st.acumulado;
      count++;
    }
    if(st.risk) risks++;
  }

  return {
    avg: count ? round2(sum/count) : null,
    totalMin,
    risks,
    upcoming: upcoming.slice(0,5),
    totalRamos: ramos.length
  };
}

/******** RENDER TOP ********/
function renderTop(){
  const sel = $("#semesterSelect");
  const keys = Object.keys(data.semestres).sort((a,b)=> b.localeCompare(a));
  sel.innerHTML = keys.map(k=> `<option value="${k}">${k}</option>`).join("");
  sel.value = data.activeSemester;
}

/******** DASHBOARD ********/
function renderDashboard(){
  const semKey = data.activeSemester;
  const sem = data.semestres[semKey];
  const sum = semesterSummary(semKey);

  const upcomingHTML = sum.upcoming.length ? `
    <table class="table">
      <thead><tr><th>Fecha</th><th>Ramo</th><th>Tipo</th><th>Alerta</th></tr></thead>
      <tbody>
        ${sum.upcoming.map(e=>{
          const d = daysUntil(e.date);
          const badge =
            d === 0 ? `<span class="badge warn">HOY</span>` :
            d <= 3 ? `<span class="badge warn">En ${d} días</span>` :
            d <= 7 ? `<span class="badge ok">En ${d} días</span>` :
            `<span class="badge">En ${d} días</span>`;
          return `
            <tr>
              <td><b>${e.date}</b></td>
              <td>${escapeHtml(e.ramo)}</td>
              <td>${escapeHtml(e.tipo)}</td>
              <td>${badge}</td>
            </tr>
          `;
        }).join("")}
      </tbody>
    </table>
  ` : `<div class="muted">No hay evaluaciones próximas. Agrégalas en Planificador.</div>`;

  views.dashboard.innerHTML = `
    <div class="grid cols-3">
      <div class="card">
        <h2>🏠 Dashboard</h2>
        <div class="muted">Semestre: <b>${semKey}</b> • Estado: <b>${sem.status}</b></div>
        <div class="hr"></div>
        <span class="badge">Ramos: <b>${sum.totalRamos}</b></span>
      </div>

      <div class="card">
        <h2>📈 Avance</h2>
        <div class="muted">Promedio (según lo acumulado)</div>
        <div class="hr"></div>
        <div style="font-weight:1000; font-size:26px;">
          ${sum.avg ?? "—"}
        </div>
      </div>

      <div class="card">
        <h2>⏳ Estudio</h2>
        <div class="muted">Horas estudiadas en el semestre</div>
        <div class="hr"></div>
        <div style="font-weight:1000; font-size:26px;">
          ${minutesToHoursText(sum.totalMin)}
        </div>
        <div class="muted">Alertas de riesgo: <b>${sum.risks}</b></div>
      </div>
    </div>

    <div class="grid cols-2">
      <div class="card">
        <h3>📌 Próximas evaluaciones</h3>
        <div class="muted">Tu “recordatorio” es visual y siempre visible aquí ✅</div>
        <div class="hr"></div>
        ${upcomingHTML}
      </div>

      <div class="card">
        <h3>⚠️ Ramos en riesgo</h3>
        <div class="muted">Se marca si la nota necesaria supera 7.0 o si reprobó.</div>
        <div class="hr"></div>
        ${renderRiskBadges(sem)}
      </div>
    </div>
  `;
}

function renderRiskBadges(sem){
  const entries = Object.entries(sem.ramos || {});
  const risks = entries
    .map(([name,r])=> ({name, st: ramoStats(r)}))
    .filter(x=> x.st.risk);

  if(!entries.length) return `<div class="muted">Agrega ramos en Calculadora.</div>`;
  if(!risks.length) return `<span class="badge ok">Todo estable por ahora 💜</span>`;

  return `<div class="row">${risks.map(r=> `<span class="badge risk">${escapeHtml(r.name)}</span>`).join("")}</div>`;
}

/******** CALCULADORA ********/
function renderCalculator(){
  const semKey = data.activeSemester;
  const sem = data.semestres[semKey];

  const ramos = Object.entries(sem.ramos || {});

  views.calculator.innerHTML = `
    <div class="card">
      <h2>📊 Calculadora (compacta)</h2>
      <div class="muted">Agrega ramos y registra notas. La “nota necesaria” se ve abajo, siempre.</div>
      <div class="hr"></div>

      <div class="row">
        <div style="flex:2">
          <div class="muted">Nombre del ramo</div>
          <input id="ramoName" placeholder="Ej: Civil / Penal / Procesal..." />
        </div>
        <button id="addRamoBtn" class="btn ghost no-flex">➕ Agregar</button>
        <div id="ramoMsg" class="muted" style="flex:2"></div>
      </div>
    </div>

    <div class="card">
      <h3>📚 Mis ramos</h3>
      <div class="hr"></div>
      <div class="grid" id="ramosContainer">
        ${ramos.length ? ramos.map(([name,r])=> ramoCardHTML(name,r)).join("") : `<div class="muted">Aún no hay ramos.</div>`}
      </div>
    </div>
  `;

  $("#addRamoBtn").addEventListener("click", ()=>{
    const name = $("#ramoName").value.trim();
    const msg = $("#ramoMsg");
    if(!name){ msg.textContent = "Escribe el nombre del ramo."; return; }
    if(sem.ramos[name]){ msg.textContent = "Ese ramo ya existe (no se duplica)."; return; }

    sem.ramos[name] = { notas: [], minutosEstudio: 0, targetHoras: 4 };
    msg.textContent = "Ramo agregado ✅";
    $("#ramoName").value = "";
    save();
    renderAll();
  });

  // delete ramo
  $$("[data-action='del-ramo']", views.calculator).forEach(btn=>{
    btn.addEventListener("click", ()=>{
      const ramo = btn.dataset.ramo;
      if(!confirm(`¿Borrar "${ramo}" y sus datos?`)) return;

      delete sem.ramos[ramo];
      sem.evaluaciones = (sem.evaluaciones||[]).filter(e=> e.ramo !== ramo);
      save();
      renderAll();
    });
  });

  // add note
  $$("[data-action='add-nota']", views.calculator).forEach(btn=>{
    btn.addEventListener("click", ()=>{
      const ramo = btn.dataset.ramo;
      const notaEl = $("#nota-" + cssSafe(ramo), views.calculator);
      const pctEl  = $("#pct-" + cssSafe(ramo), views.calculator);
      const msgEl  = $("#msg-" + cssSafe(ramo), views.calculator);

      const nota = safeNum(notaEl.value);
      const pct  = safeNum(pctEl.value);

      if(nota == null || nota < 1 || nota > 7){ msgEl.textContent="Nota inválida (1.0 a 7.0)"; return; }
      if(pct == null || pct <= 0 || pct > 100){ msgEl.textContent="Porcentaje inválido"; return; }

      const r = sem.ramos[ramo];
      const total = (r.notas||[]).reduce((a,n)=> a+n.porcentaje, 0);
      if(total + pct > 100){ msgEl.textContent="No puedes superar 100%."; return; }

      r.notas.push({ nota: round2(nota), porcentaje: round2(pct) });
      notaEl.value=""; pctEl.value="";
      msgEl.textContent="Agregado ✅";
      save();
      renderAll();
    });
  });

  // delete note
  $$("[data-action='del-nota']", views.calculator).forEach(btn=>{
    btn.addEventListener("click", ()=>{
      const ramo = btn.dataset.ramo;
      const idx = Number(btn.dataset.idx);
      sem.ramos[ramo].notas.splice(idx,1);
      save();
      renderAll();
    });
  });
}

function ramoCardHTML(name, r){
  const st = ramoStats(r);
  const badge = st.risk ? `<span class="badge risk">Riesgo</span>` : `<span class="badge ok">OK</span>`;

  return `
    <div class="ramo-card">
      <div class="ramo-head">
        <div>
          <div class="ramo-title">${escapeHtml(name)}</div>
          <div class="muted">Estudio: <b>${minutesToHoursText(r.minutosEstudio||0)}</b> • Sugerido/sem: <b>${r.targetHoras ?? 4}h</b></div>
        </div>
        <div class="row" style="justify-content:flex-end; align-items:center;">
          ${badge}
          <button class="icon-btn" data-action="del-ramo" data-ramo="${escapeHtml(name)}" title="Borrar ramo">🗑️</button>
        </div>
      </div>

      <div class="row">
        <div>
          <div class="muted">Nota</div>
          <input id="nota-${cssSafe(name)}" type="number" min="1" max="7" step="0.1" placeholder="5.5" />
        </div>
        <div>
          <div class="muted">%</div>
          <input id="pct-${cssSafe(name)}" type="number" min="1" max="100" step="1" placeholder="30" />
        </div>
        <button class="btn ghost no-flex tiny" data-action="add-nota" data-ramo="${escapeHtml(name)}">➕</button>
        <div id="msg-${cssSafe(name)}" class="muted" style="flex:2"></div>
      </div>

      ${r.notas?.length ? `
        <table class="table">
          <thead><tr><th>#</th><th>Nota</th><th>%</th><th></th></tr></thead>
          <tbody>
            ${r.notas.map((n,idx)=>`
              <tr>
                <td>${idx+1}</td>
                <td><b>${n.nota}</b></td>
                <td>${n.porcentaje}%</td>
                <td><button class="icon-btn" data-action="del-nota" data-ramo="${escapeHtml(name)}" data-idx="${idx}" title="Borrar nota">🗑️</button></td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      ` : `<div class="muted">Aún no hay notas.</div>`}

      <div class="hr"></div>

      <div class="row">
        <span class="badge">Evaluado: <b>${st.pct}%</b></span>
        <span class="badge">Acumulado: <b>${st.pct ? st.acumulado : "—"}</b></span>
        <span class="badge">Necesaria 4.0: <b>${st.pct ? (st.necesaria ?? "—") : "—"}</b></span>
      </div>
      <div class="muted">${st.msg}</div>
    </div>
  `;
}

/******** PLANIFICADOR + FLOOCUS ********/
let timer = { running:false, ramo:null, startedAt:0, elapsedSec:0, tickId:null };

function renderPlanner(){
  const semKey = data.activeSemester;
  const sem = data.semestres[semKey];
  const ramos = Object.keys(sem.ramos || {});
  const evals = (sem.evaluaciones||[]).slice().sort((a,b)=> a.date.localeCompare(b.date));

  views.planner.innerHTML = `
    <div class="grid cols-2">
      <div class="card">
        <h2>📅 Planificador</h2>
        <div class="muted">Registra evaluaciones y LEXA te las mostrará como recordatorio en Dashboard.</div>
        <div class="hr"></div>

        <div class="row">
          <div>
            <div class="muted">Fecha</div>
            <input id="evDate" type="date" />
          </div>
          <div>
            <div class="muted">Ramo</div>
            <select id="evRamo">
              ${ramos.length ? ramos.map(r=> `<option value="${escapeHtml(r)}">${escapeHtml(r)}</option>`).join("") : `<option value="">(sin ramos)</option>`}
            </select>
          </div>
          <div>
            <div class="muted">Tipo</div>
            <select id="evTipo">
              <option>prueba</option>
              <option>solemne</option>
              <option>examen</option>
            </select>
          </div>
          <button id="addEvalBtn" class="btn ghost no-flex">Agregar</button>
        </div>

        <div id="evMsg" class="muted" style="margin-top:8px;"></div>

        <div class="hr"></div>

        <h3>📌 Próximas</h3>
        ${
          evals.length ? `
            <table class="table">
              <thead><tr><th>Fecha</th><th>Ramo</th><th>Tipo</th><th></th></tr></thead>
              <tbody>
                ${evals.map(e=>`
                  <tr>
                    <td><b>${e.date}</b></td>
                    <td>${escapeHtml(e.ramo)}</td>
                    <td>${escapeHtml(e.tipo)}</td>
                    <td><button class="icon-btn" data-action="del-eval" data-id="${e.id}">🗑️</button></td>
                  </tr>
                `).join("")}
              </tbody>
            </table>
          ` : `<div class="muted">Aún no registras evaluaciones.</div>`
        }
      </div>

      <div class="card flocus-card">
        <h2>⏱ Tiempo de Flocus 🤓</h2>
        <div class="muted">Tap en el reloj para iniciar/pausar • al pausar suma minutos al ramo.</div>
        <div class="hr"></div>

        <div class="row">
          <div>
            <div class="muted">Ramo en foco</div>
            <select id="timerRamo">
              <option value="">— Selecciona —</option>
              ${ramos.map(r=> `<option value="${escapeHtml(r)}">${escapeHtml(r)}</option>`).join("")}
            </select>
          </div>

          <div>
            <div class="muted">Horas sugeridas/semana</div>
            <select id="targetRamo">
              <option value="">— Selecciona —</option>
              ${ramos.map(r=> `<option value="${escapeHtml(r)}">${escapeHtml(r)}</option>`).join("")}
            </select>
          </div>

          <div>
            <div class="muted">Editar a</div>
            <input id="targetHours" type="number" min="0" step="0.5" placeholder="4" />
          </div>

          <button id="saveTargetBtn" class="btn ghost no-flex">Guardar</button>
        </div>

        <div class="hr"></div>

        <div class="flocus-wrap">
          <div>
            <div class="clock" id="clock" title="Tap para iniciar/pausar">
              <div class="ticks"></div>
              <div id="hourHand" class="hand hour"></div>
              <div id="minHand" class="hand min"></div>
              <div id="secHand" class="hand sec"></div>
              <div class="center"></div>
            </div>

            <div style="margin-top:10px;">
              <div class="hint" id="clockHint">${timer.running ? "Tap para pausar" : "Tap para iniciar"}</div>
              <div class="digital" id="digital">${formatHMS(timer.elapsedSec)}</div>
              <div class="muted" id="timerState">${timer.running ? "En foco ✅" : "Pausado"}</div>
              <div class="row" style="margin-top:8px;">
                <button id="resetTimerBtn" class="btn ghost no-flex tiny">↩️ Reiniciar</button>
              </div>
            </div>
          </div>

          ${mascotSvg()}
        </div>

        <div class="hr"></div>

        <div class="muted">
          Tip: tus horas de estudio se acumulan por ramo y se ven en Calculadora + Dashboard ✅
        </div>
      </div>
    </div>
  `;

  // add evaluation
  $("#addEvalBtn").addEventListener("click", ()=>{
    const msg = $("#evMsg");
    if(!ramos.length){ msg.textContent="Primero agrega ramos en Calculadora."; return; }

    const date = $("#evDate").value;
    const ramo = $("#evRamo").value;
    const tipo = $("#evTipo").value;

    if(!date){ msg.textContent="Elige una fecha."; return; }
    if(!ramo){ msg.textContent="Elige un ramo."; return; }

    sem.evaluaciones.push({ id: uuid(), date, ramo, tipo });
    msg.textContent = "Evaluación agregada ✅";
    save();
    renderAll();
  });

  // delete evaluation
  $$("[data-action='del-eval']", views.planner).forEach(btn=>{
    btn.addEventListener("click", ()=>{
      const id = btn.dataset.id;
      sem.evaluaciones = sem.evaluaciones.filter(e=> e.id !== id);
      save();
      renderAll();
    });
  });

  // set target hours
  $("#saveTargetBtn").addEventListener("click", ()=>{
    const ramo = $("#targetRamo").value;
    const hrs = safeNum($("#targetHours").value);
    if(!ramo){ alert("Selecciona un ramo."); return; }
    if(hrs == null || hrs < 0){ alert("Horas inválidas."); return; }

    sem.ramos[ramo].targetHoras = hrs;
    save();
    renderAll();
  });

  // timer interactions
  $("#resetTimerBtn").addEventListener("click", ()=>{
    resetTimer();
    updateClockUI();
  });

  $("#clock").addEventListener("click", ()=>{
    const chosen = $("#timerRamo").value;
    if(!chosen){
      alert("Selecciona un ramo antes de iniciar.");
      return;
    }

    if(timer.running){
      pauseAndCommit(semKey); // suma al ramo
      save();
      renderAll();
    } else {
      startTimer(chosen);
      updateClockUI();
    }
  });

  updateClockUI();
}

/******** TIMER CORE ********/
function startTimer(ramo){
  if(timer.running) return;
  timer.ramo = ramo;
  timer.running = true;
  timer.startedAt = Date.now() - (timer.elapsedSec*1000);

  timer.tickId = setInterval(()=>{
    timer.elapsedSec = Math.floor((Date.now() - timer.startedAt)/1000);
    updateClockUI();
  }, 250);
}

function pauseAndCommit(semKey){
  timer.running = false;
  clearInterval(timer.tickId);
  timer.tickId = null;

  const minutes = Math.round(timer.elapsedSec/60);
  if(minutes > 0 && timer.ramo){
    const sem = data.semestres[semKey];
    const r = sem.ramos[timer.ramo];
    if(r){
      r.minutosEstudio = (r.minutosEstudio||0) + minutes;
    }
  }

  timer.elapsedSec = 0;
  timer.ramo = null;
}

function resetTimer(){
  if(timer.running){
    timer.running = false;
    clearInterval(timer.tickId);
    timer.tickId = null;
  }
  timer.elapsedSec = 0;
  timer.ramo = null;
}

function updateClockUI(){
  const digital = $("#digital", views.planner);
  const hint = $("#clockHint", views.planner);
  const state = $("#timerState", views.planner);

  if(digital) digital.textContent = formatHMS(timer.elapsedSec);
  if(hint) hint.textContent = timer.running ? "Tap para pausar" : "Tap para iniciar";
  if(state) state.textContent = timer.running ? "En foco ✅" : "Pausado";

  const secHand = $("#secHand", views.planner);
  const minHand = $("#minHand", views.planner);
  const hourHand = $("#hourHand", views.planner);

  const s = timer.elapsedSec;
  const sec = s % 60;
  const min = Math.floor(s/60) % 60;
  const hr = Math.floor(s/3600);

  const secAngle = (sec / 60) * 360;
  const minAngle = ((min + sec/60) / 60) * 360;
  const hourAngle = (((hr % 12) + min/60) / 12) * 360;

  if(secHand) secHand.style.transform = `translate(-50%,-100%) rotate(${secAngle}deg)`;
  if(minHand) minHand.style.transform = `translate(-50%,-100%) rotate(${minAngle}deg)`;
  if(hourHand) hourHand.style.transform = `translate(-50%,-100%) rotate(${hourAngle}deg)`;
}

/******** HISTORY (placeholder por ahora, se completa en paso 3) ********/
function renderHistory(){
  const keys = Object.keys(data.semestres).sort((a,b)=> b.localeCompare(a));
  views.history.innerHTML = `
    <div class="card">
      <h2>📚 Historial</h2>
      <div class="muted">Paso 3: aquí saldrán semestres cerrados con resumen e informe descargable.</div>
      <div class="hr"></div>
      <div class="muted">Semestres existentes: <b>${keys.join(", ")}</b></div>
    </div>
  `;
}

/******** MASCOT ********/
function mascotSvg(){
  // Conejita/animalito tierno estudiando (sonriente) + libro
  // (sin imágenes externas, 100% compatible con GitHub Pages)
  return `
    <svg class="mascot" viewBox="0 0 420 360" aria-hidden="true">
      <defs>
        <linearGradient id="m1" x1="0" x2="1">
          <stop offset="0" stop-color="#6f4cff"/>
          <stop offset="1" stop-color="#b8aaff"/>
        </linearGradient>
      </defs>

      <!-- nube suave -->
      <path d="M70 120c-24 0-44 16-44 36s20 36 44 36h250c28 0 50-18 50-40 0-20-18-36-42-36-10-26-36-44-66-44-24 0-45 10-58 26-10-8-24-12-40-12-20 0-38 8-48 20-12-14-28-22-46-22z"
            fill="rgba(255,255,255,.65)"/>

      <!-- orejas -->
      <path d="M150 70c-20-30-10-60 10-62 18-2 30 18 30 40 0 16-10 30-40 22z" fill="url(#m1)" opacity=".9"/>
      <path d="M230 70c20-30 10-60-10-62-18-2-30 18-30 40 0 16 10 30 40 22z" fill="url(#m1)" opacity=".9"/>

      <!-- cabeza -->
      <circle cx="190" cy="130" r="70" fill="url(#m1)" opacity=".9"/>
      <!-- mejillas -->
      <circle cx="155" cy="145" r="10" fill="#ffd6e7" opacity=".9"/>
      <circle cx="225" cy="145" r="10" fill="#ffd6e7" opacity=".9"/>

      <!-- ojos -->
      <circle cx="165" cy="125" r="8" fill="#171428"/>
      <circle cx="215" cy="125" r="8" fill="#171428"/>
      <circle cx="162" cy="122" r="3" fill="#fff"/>
      <circle cx="212" cy="122" r="3" fill="#fff"/>

      <!-- sonrisa -->
      <path d="M176 150c8 10 20 10 28 0" stroke="#171428" stroke-width="8" stroke-linecap="round" fill="none"/>

      <!-- cuerpo -->
      <path d="M120 280c0-54 30-98 70-98s70 44 70 98c0 26-16 44-38 44h-64c-22 0-38-18-38-44z" fill="rgba(255,255,255,.75)"/>

      <!-- libro -->
      <path d="M90 250h210c10 0 18 8 18 18v46H72v-46c0-10 8-18 18-18z" fill="#171428" opacity=".92"/>
      <path d="M100 242h190c10 0 18 8 18 18v46H82v-46c0-10 8-18 18-18z" fill="#fff"/>
      <path d="M110 265h85v10h-85zM210 265h85v10h-85z" fill="#d7f0ff"/>
      <path d="M110 285h85v10h-85zM210 285h85v10h-85z" fill="#f7f6ff"/>

      <!-- estrellitas -->
      <path d="M332 86l6 12 14 2-10 9 2 14-12-6-12 6 2-14-10-9 14-2z" fill="rgba(111,76,255,.45)"/>
      <path d="M360 145l4 8 9 1-7 6 2 9-8-4-8 4 2-9-7-6 9-1z" fill="rgba(111,76,255,.35)"/>
    </svg>
  `;
}

/******** RENDER ALL ********/
function renderAll(){
  ensureSemester(data.activeSemester);
  save();

  renderTop();
  renderDashboard();
  renderCalculator();
  renderPlanner();
  renderHistory();
}

/******** INIT EVENTS ********/
function init(){
  // nav
  $$(".nav-btn").forEach(btn=>{
    btn.addEventListener("click", ()=> showView(btn.dataset.view));
  });

  // semester change
  $("#semesterSelect").addEventListener("change", (e)=>{
    data.activeSemester = e.target.value;
    ensureSemester(data.activeSemester);
    save();
    renderAll();
  });

  // new semester
  $("#newSemesterBtn").addEventListener("click", ()=>{
    const k = prompt('Nuevo semestre (ej: "2026-1")');
    if(!k) return;
    const key = k.trim();
    if(!key) return;
    ensureSemester(key);
    data.activeSemester = key;
    save();
    renderAll();
  });

  // export/import
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
      if(!data.activeSemester) data.activeSemester = nowSemester();
      ensureSemester(data.activeSemester);
      save();
      renderAll();
      alert("Importado ✅");
    }catch(err){
      alert("No se pudo importar: " + err.message);
    }finally{
      e.target.value = "";
    }
  });

  renderAll();
  showView("dashboard");
}

init();
