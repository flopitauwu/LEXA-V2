/***********************
  LEXA — Full V2 (pulido)
  - UI más lila suave
  - Calculadora sin badges innecesarios
  - Timer suma en segundos (ya no se pierde si pausas antes de 1 min)
  - Estudio acumulado por ramo SIEMPRE visible
  - Topbar limpio: solo semestre + cierre + informe
***********************/

const $ = (s, r=document) => r.querySelector(s);
const $$ = (s, r=document) => Array.from(r.querySelectorAll(s));

const KEY = "LEXA_FULL_V2";

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

/* Tiempo: mostramos bonito */
function studyTextFromSeconds(sec){
  sec = sec || 0;
  if(sec < 60) return `${sec}s`;
  const min = Math.floor(sec/60);
  if(min < 60) return `${min} min`;
  return `${round2(sec/3600)} h`;
}

/* Storage */
function load(){
  try{
    const raw = localStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : null;
  }catch{
    return null;
  }
}
function save(){
  localStorage.setItem(KEY, JSON.stringify(data));
}

/* Data */
let data = load() || {
  activeSemester: nowSemester(),
  semestres: {}
};

function ensureSemester(key){
  if(!data.semestres[key]){
    data.semestres[key] = {
      status: "open", // open | closed
      createdAt: isoDate(),
      closedAt: null,
      ramos: {},
      evaluaciones: []
    };
  }
}

/* Migración: si venías con minutosEstudio, lo paso a studySec */
function migrateSemester(sem){
  for(const r of Object.values(sem.ramos || {})){
    if(r.studySec == null){
      // si existía minutosEstudio, convierto; si no, 0
      const min = (r.minutosEstudio || 0);
      r.studySec = Math.round(min * 60);
      delete r.minutosEstudio;
    }
    if(r.targetHoras == null) r.targetHoras = 4;
    if(!Array.isArray(r.notas)) r.notas = [];
  }
  if(!Array.isArray(sem.evaluaciones)) sem.evaluaciones = [];
}

ensureSemester(data.activeSemester);
for(const sem of Object.values(data.semestres)) migrateSemester(sem);
save();

/* Views */
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

/* Cálculo notas */
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
    const denom = (restante/100);
    necesaria = (4 - acumulado) / denom;
    necesaria = round2(necesaria);

    if(acumulado >= 4) msg = "Vas sobre 4.0 en lo acumulado 💜";
    if(necesaria > 7){ risk = true; msg = "Riesgo: necesitarías más de 7.0 ⚠️"; }
    else if(necesaria <= 1){ msg = "Muy asegurado: incluso con 1.0 llegas a 4.0 ✅"; }
  }

  return { pct, acumulado: round2(acumulado), restante, notaFinal, necesaria, msg, risk };
}

function semesterSummary(semKey){
  const sem = data.semestres[semKey];
  const ramos = Object.entries(sem.ramos || {});
  const upcoming = (sem.evaluaciones||[])
    .slice()
    .sort((a,b)=> a.date.localeCompare(b.date))
    .filter(e=> daysUntil(e.date) >= 0);

  let sum=0, count=0;
  let totalSec=0;
  let risks=0;

  for(const [,r] of ramos){
    totalSec += (r.studySec||0);
    const st = ramoStats(r);
    if(st.pct > 0){
      sum += st.acumulado;
      count++;
    }
    if(st.risk) risks++;
  }

  return {
    avg: count ? round2(sum/count) : null,
    totalSec,
    risks,
    upcoming: upcoming.slice(0,5),
    totalRamos: ramos.length
  };
}

/* Top */
function renderTop(){
  const sel = $("#semesterSelect");
  const keys = Object.keys(data.semestres).sort((a,b)=> b.localeCompare(a));
  sel.innerHTML = keys.map(k=> `<option value="${k}">${k}</option>`).join("");
  sel.value = data.activeSemester;

  const sem = data.semestres[data.activeSemester];
  const closeBtn = $("#closeSemesterBtn");
  closeBtn.textContent = sem.status === "closed" ? "🔓 Reabrir" : "🔒 Cierre";
}

/* Dashboard */
function renderRiskBadges(sem){
  const entries = Object.entries(sem.ramos || {});
  const risks = entries
    .map(([name,r])=> ({name, st: ramoStats(r)}))
    .filter(x=> x.st.risk);

  if(!entries.length) return `<div class="muted">Agrega ramos en Calculadora.</div>`;
  if(!risks.length) return `<span class="badge ok">Todo estable por ahora 💜</span>`;
  return `<div class="row">${risks.map(r=> `<span class="badge risk">${escapeHtml(r.name)}</span>`).join("")}</div>`;
}

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
        <h2> 👾 Dashboard</h2>
        <div class="muted">Semestre: <b>${semKey}</b> • Estado: <b>${sem.status}</b></div>
        <div class="hr"></div>
        <span class="badge">Ramos: <b>${sum.totalRamos}</b></span>
      </div>

      <div class="card">
        <h2>📈 Promedio</h2>
        <div class="muted">Según lo acumulado (si no hay notas, aparece —)</div>
        <div class="hr"></div>
        <div style="font-weight:1000; font-size:26px;">
          ${sum.avg ?? "—"}
        </div>
      </div>

      <div class="card">
        <h2>⏳ Estudio</h2>
        <div class="muted">Tiempo total del semestre</div>
        <div class="hr"></div>
        <div style="font-weight:1000; font-size:26px;">
          ${studyTextFromSeconds(sum.totalSec)}
        </div>
        <div class="muted">Alertas de riesgo: <b>${sum.risks}</b></div>
      </div>
    </div>

    <div class="grid cols-2">
      <div class="card">
        <h3>📌 Próximas evaluaciones</h3>
        <div class="muted">Recordatorio visual automático ✅</div>
        <div class="hr"></div>
        ${upcomingHTML}
      </div>

      <div class="card">
        <h3> 📌 Ramos en riesgo</h3>
        <div class="muted">Se marca si necesitarías más de 7.0 o si ya reprobó.</div>
        <div class="hr"></div>
        ${renderRiskBadges(sem)}
      </div>
    </div>
  `;
}

/* Calculadora (limpia) */
function ramoCardHTML(name, r, locked){
  const st = ramoStats(r);
  const badge = st.risk ? `<span class="badge risk">Riesgo</span>` : `<span class="badge ok">OK</span>`;

  // línea compacta con info útil
  const neces = (st.pct === 0) ? "—" : (st.necesaria ?? "—");
  const pctTxt = st.pct ? `${st.pct}% evaluado` : "0% evaluado";

  return `
    <div class="ramo-card">
      <div class="ramo-head">
        <div>
          <div class="ramo-title">${escapeHtml(name)}</div>
          <div class="muted">
            Estudio: <b>${studyTextFromSeconds(r.studySec||0)}</b> •
            Sugerido/sem: <b>${r.targetHoras ?? 4}h</b> •
            <span>${pctTxt}</span>
          </div>
        </div>
        <div class="row" style="justify-content:flex-end; align-items:center;">
          ${badge}
          ${locked ? "" : `<button class="icon-btn" data-action="del-ramo" data-ramo="${escapeHtml(name)}" title="Borrar ramo">🗑️</button>`}
        </div>
      </div>

      <div class="row">
        <div>
          <div class="muted">Nota</div>
          <input ${locked?"disabled":""} id="nota-${cssSafe(name)}" type="number" min="1" max="7" step="0.1" placeholder="5.5" />
        </div>
        <div>
          <div class="muted">%</div>
          <input ${locked?"disabled":""} id="pct-${cssSafe(name)}" type="number" min="1" max="100" step="1" placeholder="30" />
        </div>
        ${locked ? "" : `<button class="btn ghost no-flex tiny" data-action="add-nota" data-ramo="${escapeHtml(name)}">➕</button>`}
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
                <td>
                  ${locked ? "" : `<button class="icon-btn" data-action="del-nota" data-ramo="${escapeHtml(name)}" data-idx="${idx}" title="Borrar nota">🗑️</button>`}
                </td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      ` : `<div class="muted">Aún no hay notas.</div>`}

      <div class="hr"></div>

      <div class="muted"><b>Necesaria para aprobar (4.0):</b> ${neces}</div>
      <div class="muted">${st.msg}</div>
    </div>
  `;
}

function renderCalculator(){
  const sem = data.semestres[data.activeSemester];
  const locked = sem.status === "closed";
  const ramos = Object.entries(sem.ramos || {});

  views.calculator.innerHTML = `
    <div class="card">
      <h2>📊 Calculadora</h2>
      <div class="muted">${locked ? "Este semestre está cerrado (solo lectura)." : "Compacta, directa, y con lo necesario ✅"}</div>
      <div class="hr"></div>

      <div class="row">
        <div style="flex:2">
          <div class="muted">Nombre del ramo</div>
          <input id="ramoName" ${locked?"disabled":""} placeholder="Ej: Civil / Penal / Procesal..." />
        </div>
        ${locked ? "" : `<button id="addRamoBtn" class="btn primary no-flex">➕ Agregar</button>`}
        <div id="ramoMsg" class="muted" style="flex:2"></div>
      </div>
    </div>

    <div class="card">
      <h3>📚 Mis ramos</h3>
      <div class="hr"></div>
      <div class="grid" id="ramosContainer">
        ${ramos.length ? ramos.map(([name,r])=> ramoCardHTML(name,r,locked)).join("") : `<div class="muted">Aún no hay ramos.</div>`}
      </div>
    </div>
  `;
}

/* Planificador + Flocus */
let timer = { running:false, ramo:null, startedAt:0, elapsedSec:0, tickId:null };

function mascotSvg(){
  return `
    <svg class="mascot" viewBox="0 0 420 360" aria-hidden="true">
      <defs>
        <linearGradient id="m1" x1="0" x2="1">
          <stop offset="0" stop-color="#7a5cff"/>
          <stop offset="1" stop-color="#c9beff"/>
        </linearGradient>
      </defs>

      <path d="M70 120c-24 0-44 16-44 36s20 36 44 36h250c28 0 50-18 50-40 0-20-18-36-42-36-10-26-36-44-66-44-24 0-45 10-58 26-10-8-24-12-40-12-20 0-38 8-48 20-12-14-28-22-46-22z"
            fill="rgba(255,255,255,.70)"/>

      <path d="M150 70c-20-30-10-60 10-62 18-2 30 18 30 40 0 16-10 30-40 22z" fill="url(#m1)" opacity=".9"/>
      <path d="M230 70c20-30 10-60-10-62-18-2-30 18-30 40 0 16 10 30 40 22z" fill="url(#m1)" opacity=".9"/>

      <circle cx="190" cy="130" r="70" fill="url(#m1)" opacity=".9"/>
      <circle cx="155" cy="145" r="10" fill="#ffd6e7" opacity=".9"/>
      <circle cx="225" cy="145" r="10" fill="#ffd6e7" opacity=".9"/>

      <circle cx="165" cy="125" r="8" fill="#19152c"/>
      <circle cx="215" cy="125" r="8" fill="#19152c"/>
      <circle cx="162" cy="122" r="3" fill="#fff"/>
      <circle cx="212" cy="122" r="3" fill="#fff"/>

      <path d="M176 150c8 10 20 10 28 0" stroke="#19152c" stroke-width="8" stroke-linecap="round" fill="none"/>

      <path d="M120 280c0-54 30-98 70-98s70 44 70 98c0 26-16 44-38 44h-64c-22 0-38-18-38-44z" fill="rgba(255,255,255,.78)"/>

      <path d="M90 250h210c10 0 18 8 18 18v46H72v-46c0-10 8-18 18-18z" fill="#19152c" opacity=".92"/>
      <path d="M100 242h190c10 0 18 8 18 18v46H82v-46c0-10 8-18 18-18z" fill="#fff"/>
      <path d="M110 265h85v10h-85zM210 265h85v10h-85z" fill="#dcf3ff"/>
      <path d="M110 285h85v10h-85zM210 285h85v10h-85z" fill="#fbf9ff"/>

      <path d="M332 86l6 12 14 2-10 9 2 14-12-6-12 6 2-14-10-9 14-2z" fill="rgba(122,92,255,.45)"/>
      <path d="M360 145l4 8 9 1-7 6 2 9-8-4-8 4 2-9-7-6 9-1z" fill="rgba(122,92,255,.35)"/>
    </svg>
  `;
}

function renderPlanner(){
  const sem = data.semestres[data.activeSemester];
  const locked = sem.status === "closed";
  const ramos = Object.keys(sem.ramos || {});
  const evals = (sem.evaluaciones||[]).slice().sort((a,b)=> a.date.localeCompare(b.date));

  views.planner.innerHTML = `
    <div class="grid cols-2">
      <div class="card">
        <h2>📅 Planificador</h2>
        <div class="muted">${locked ? "Semestre cerrado (solo lectura)." : "Registra evaluaciones y aparecerán en Dashboard."}</div>
        <div class="hr"></div>

        <div class="row">
          <div>
            <div class="muted">Fecha</div>
            <input id="evDate" ${locked?"disabled":""} type="date" />
          </div>
          <div>
            <div class="muted">Ramo</div>
            <select id="evRamo" ${locked?"disabled":""}>
              ${ramos.length ? ramos.map(r=> `<option value="${escapeHtml(r)}">${escapeHtml(r)}</option>`).join("") : `<option value="">(sin ramos)</option>`}
            </select>
          </div>
          <div>
            <div class="muted">Tipo</div>
            <select id="evTipo" ${locked?"disabled":""}>
              <option>prueba</option>
              <option>solemne</option>
              <option>examen</option>
            </select>
          </div>
          ${locked ? "" : `<button id="addEvalBtn" class="btn primary no-flex">Agregar</button>`}
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
                    <td>${locked ? "" : `<button class="icon-btn" data-action="del-eval" data-id="${e.id}">🗑️</button>`}</td>
                  </tr>
                `).join("")}
              </tbody>
            </table>
          ` : `<div class="muted">Aún no registras evaluaciones.</div>`
        }
      </div>

      <div class="card flocus-card">
        <h2>⏱ Tiempo de Flocus 🤓</h2>
        <div class="muted">${locked ? "Semestre cerrado (timer deshabilitado)." : "Tap en el reloj para iniciar/pausar • suma tiempo aunque sea poquito."}</div>
        <div class="hr"></div>

        <div class="row">
          <div>
            <div class="muted">Ramo en foco</div>
            <select id="timerRamo" ${locked?"disabled":""}>
              <option value="">— Selecciona —</option>
              ${ramos.map(r=> `<option value="${escapeHtml(r)}">${escapeHtml(r)}</option>`).join("")}
            </select>
          </div>

          <div>
            <div class="muted">Editar horas sugeridas/sem</div>
            <select id="targetRamo" ${locked?"disabled":""}>
              <option value="">— Selecciona —</option>
              ${ramos.map(r=> `<option value="${escapeHtml(r)}">${escapeHtml(r)}</option>`).join("")}
            </select>
          </div>

          <div>
            <div class="muted">Horas</div>
            <input id="targetHours" ${locked?"disabled":""} type="number" min="0" step="0.5" placeholder="4" />
          </div>

          ${locked ? "" : `<button id="saveTargetBtn" class="btn ghost no-flex">Guardar</button>`}
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
                ${locked ? "" : `<button id="resetTimerBtn" class="btn ghost no-flex tiny">↩️ Reiniciar</button>`}
              </div>
            </div>
          </div>

          ${mascotSvg()}
        </div>

        <div class="hr"></div>
        <div class="muted">Al pausar, el tiempo se suma al ramo y se refleja en la Calculadora ✅</div>
      </div>
    </div>
  `;
}

/* Timer (ahora suma segundos) */
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
function pauseAndCommit(){
  timer.running = false;
  clearInterval(timer.tickId);
  timer.tickId = null;

  const sem = data.semestres[data.activeSemester];
  if(timer.elapsedSec > 0 && timer.ramo && sem?.ramos?.[timer.ramo]){
    sem.ramos[timer.ramo].studySec = (sem.ramos[timer.ramo].studySec||0) + timer.elapsedSec;
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

/* Historial */
function historyBlockHTML(semKey){
  const sem = data.semestres[semKey];
  const sum = semesterSummary(semKey);
  const ramos = Object.entries(sem.ramos || {});
  return `
    <div class="card" style="box-shadow:none; border-style:dashed;">
      <div class="row" style="align-items:center; justify-content:space-between;">
        <span class="badge">Semestre <b>${semKey}</b></span>
        <span class="badge ok">Cerrado: <b>${sem.closedAt || "—"}</b></span>
      </div>

      <div class="hr"></div>

      <div class="row">
        <span class="badge">Promedio: <b>${sum.avg ?? "—"}</b></span>
        <span class="badge">Estudio: <b>${studyTextFromSeconds(sum.totalSec)}</b></span>
        <span class="badge">Ramos: <b>${sum.totalRamos}</b></span>
      </div>

      <div class="hr"></div>

      ${ramos.length ? `
        <table class="table">
          <thead><tr><th>Ramo</th><th>Final</th><th>Estudio</th></tr></thead>
          <tbody>
            ${ramos.map(([name,r])=>{
              const st = ramoStats(r);
              return `
                <tr>
                  <td><b>${escapeHtml(name)}</b></td>
                  <td>${st.notaFinal ?? "—"}</td>
                  <td>${studyTextFromSeconds(r.studySec||0)}</td>
                </tr>
              `;
            }).join("")}
          </tbody>
        </table>
      ` : `<div class="muted">Semestre sin ramos.</div>`}
    </div>
  `;
}

function renderHistory(){
  const keys = Object.keys(data.semestres).sort((a,b)=> b.localeCompare(a));
  const closed = keys.filter(k => data.semestres[k].status === "closed");

  views.history.innerHTML = `
    <div class="card">
      <h2>📚 Historial</h2>
      <div class="muted">Aquí aparecen SOLO los semestres cerrados con “Cierre”.</div>
      <div class="hr"></div>

      ${closed.length ? closed.map(k=> historyBlockHTML(k)).join("") : `<div class="muted">Aún no has cerrado ningún semestre.</div>`}
    </div>
  `;
}

/* Informe (HTML descargable) */
function buildReportHTML(semKey){
  const sem = data.semestres[semKey];
  const sum = semesterSummary(semKey);
  const ramos = Object.entries(sem.ramos || {});
  const evals = (sem.evaluaciones||[]).slice().sort((a,b)=> a.date.localeCompare(b.date));

  const rowsR = ramos.map(([name,r])=>{
    const st = ramoStats(r);
    return `<tr>
      <td>${escapeHtml(name)}</td>
      <td>${st.notaFinal ?? "—"}</td>
      <td>${studyTextFromSeconds(r.studySec||0)}</td>
      <td>${(r.targetHoras ?? 4)} h/sem</td>
    </tr>`;
  }).join("");

  const rowsE = evals.map(e=> `<tr>
    <td>${e.date}</td>
    <td>${escapeHtml(e.ramo)}</td>
    <td>${escapeHtml(e.tipo)}</td>
  </tr>`).join("");

  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>LEXA Informe ${semKey}</title>
<style>
  body{font-family:Arial,system-ui; background:#fff; color:#19152c; padding:18px;}
  h1{margin:0 0 6px 0;}
  .muted{color:#6e678a; margin:0 0 14px 0;}
  .box{border:1px solid #eee9fb; border-radius:14px; padding:12px; margin:12px 0;}
  table{width:100%; border-collapse:collapse;}
  th,td{padding:8px; border-bottom:1px solid #eee9fb; text-align:left; font-size:13px;}
  th{color:#6e678a; font-size:12px;}
  .pill{display:inline-block; padding:6px 10px; border:1px solid #eee9fb; border-radius:999px; margin-right:8px; font-weight:700; font-size:12px;}
</style>
</head>
<body>
  <h1>LEXA 💜⚖️ — Informe de Semestre</h1>
  <p class="muted">Semestre: <b>${semKey}</b> • Estado: <b>${sem.status}</b> • Cierre: <b>${sem.closedAt || "—"}</b></p>

  <div class="box">
    <span class="pill">Promedio: <b>${sum.avg ?? "—"}</b></span>
    <span class="pill">Estudio: <b>${studyTextFromSeconds(sum.totalSec)}</b></span>
    <span class="pill">Ramos: <b>${sum.totalRamos}</b></span>
    <span class="pill">Riesgos: <b>${sum.risks}</b></span>
  </div>

  <div class="box">
    <h3>Ramos</h3>
    <table>
      <thead><tr><th>Ramo</th><th>Nota final</th><th>Estudio</th><th>Sugerido</th></tr></thead>
      <tbody>${rowsR || `<tr><td colspan="4">Sin ramos</td></tr>`}</tbody>
    </table>
  </div>

  <div class="box">
    <h3>Evaluaciones</h3>
    <table>
      <thead><tr><th>Fecha</th><th>Ramo</th><th>Tipo</th></tr></thead>
      <tbody>${rowsE || `<tr><td colspan="3">Sin evaluaciones</td></tr>`}</tbody>
    </table>
  </div>

  <p class="muted">Tip: en iPad puedes “Compartir → Imprimir” y guardarlo como PDF.</p>
</body>
</html>`;
}

function downloadTextFile(filename, content, mime="text/html"){
  const blob = new Blob([content], {type:mime});
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/* Render */
function renderAll(){
  ensureSemester(data.activeSemester);
  migrateSemester(data.semestres[data.activeSemester]);
  save();

  renderTop();
  renderDashboard();
  renderCalculator();
  renderPlanner();
  renderHistory();
}

/* Init */
function init(){
  // nav
  $$(".nav-btn").forEach(btn=>{
    btn.addEventListener("click", ()=> showView(btn.dataset.view));
  });

  // semester select
  $("#semesterSelect").addEventListener("change", (e)=>{
    data.activeSemester = e.target.value;
    ensureSemester(data.activeSemester);
    migrateSemester(data.semestres[data.activeSemester]);
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
    migrateSemester(data.semestres[key]);
    data.activeSemester = key;
    save();
    renderAll();
  });

  // close semester toggle
  $("#closeSemesterBtn").addEventListener("click", ()=>{
    const sem = data.semestres[data.activeSemester];
    if(sem.status === "open"){
      const ok = confirm("¿Cerrar el semestre? Quedará en solo lectura y aparecerá en Historial.");
      if(!ok) return;
      sem.status = "closed";
      sem.closedAt = isoDate();
      if(timer.running) pauseAndCommit();
    } else {
      const ok = confirm("¿Reabrir este semestre?");
      if(!ok) return;
      sem.status = "open";
      sem.closedAt = null;
    }
    save();
    renderAll();
  });

  // download report
  $("#downloadReportBtn").addEventListener("click", ()=>{
    const semKey = data.activeSemester;
    const html = buildReportHTML(semKey);
    downloadTextFile(`LEXA-informe-${semKey}.html`, html, "text/html");
  });

  // delegated clicks (para que no se rompa al re-render)
  document.addEventListener("click", (ev)=>{
    const t = ev.target;
    const sem = data.semestres[data.activeSemester];
    const locked = sem.status === "closed";

    // add ramo
    if(t.id === "addRamoBtn"){
      if(locked) return;
      const name = $("#ramoName")?.value?.trim();
      const msg = $("#ramoMsg");
      if(!name){ if(msg) msg.textContent="Escribe el nombre del ramo."; return; }
      if(sem.ramos[name]){ if(msg) msg.textContent="Ese ramo ya existe (no se duplica)."; return; }
      sem.ramos[name] = { notas: [], studySec: 0, targetHoras: 4 };
      if(msg) msg.textContent="Ramo agregado ✅";
      $("#ramoName").value = "";
      save(); renderAll();
      return;
    }

    // del ramo
    if(t.dataset?.action === "del-ramo"){
      if(locked) return;
      const ramo = t.dataset.ramo;
      const ok = confirm(`¿Borrar "${ramo}" y sus datos?`);
      if(!ok) return;
      delete sem.ramos[ramo];
      sem.evaluaciones = (sem.evaluaciones||[]).filter(e=> e.ramo !== ramo);
      save(); renderAll();
      return;
    }

    // add nota
    if(t.dataset?.action === "add-nota"){
      if(locked) return;
      const ramo = t.dataset.ramo;
      const notaEl = $("#nota-" + cssSafe(ramo));
      const pctEl  = $("#pct-" + cssSafe(ramo));
      const msgEl  = $("#msg-" + cssSafe(ramo));

      const nota = safeNum(notaEl?.value);
      const pct  = safeNum(pctEl?.value);

      if(nota == null || nota < 1 || nota > 7){ if(msgEl) msgEl.textContent="Nota inválida (1.0 a 7.0)"; return; }
      if(pct == null || pct <= 0 || pct > 100){ if(msgEl) msgEl.textContent="Porcentaje inválido"; return; }

      const r = sem.ramos[ramo];
      const total = (r.notas||[]).reduce((a,n)=> a+n.porcentaje, 0);
      if(total + pct > 100){ if(msgEl) msgEl.textContent="No puedes superar 100%."; return; }

      r.notas.push({ nota: round2(nota), porcentaje: round2(pct) });
      if(notaEl) notaEl.value="";
      if(pctEl) pctEl.value="";
      if(msgEl) msgEl.textContent="Agregado ✅";
      save(); renderAll();
      return;
    }

    // del nota
    if(t.dataset?.action === "del-nota"){
      if(locked) return;
      const ramo = t.dataset.ramo;
      const idx = Number(t.dataset.idx);
      sem.ramos[ramo].notas.splice(idx,1);
      save(); renderAll();
      return;
    }

    // add eval
    if(t.id === "addEvalBtn"){
      if(locked) return;
      const msg = $("#evMsg");
      const ramos = Object.keys(sem.ramos||{});
      if(!ramos.length){ if(msg) msg.textContent="Primero agrega ramos en Calculadora."; return; }

      const date = $("#evDate")?.value;
      const ramo = $("#evRamo")?.value;
      const tipo = $("#evTipo")?.value;

      if(!date){ if(msg) msg.textContent="Elige una fecha."; return; }
      if(!ramo){ if(msg) msg.textContent="Elige un ramo."; return; }

      sem.evaluaciones.push({ id: uuid(), date, ramo, tipo });
      if(msg) msg.textContent="Evaluación agregada ✅";
      save(); renderAll();
      return;
    }

    // del eval
    if(t.dataset?.action === "del-eval"){
      if(locked) return;
      const id = t.dataset.id;
      sem.evaluaciones = sem.evaluaciones.filter(e=> e.id !== id);
      save(); renderAll();
      return;
    }

    // save target
    if(t.id === "saveTargetBtn"){
      if(locked) return;
      const ramo = $("#targetRamo")?.value;
      const hrs = safeNum($("#targetHours")?.value);
      if(!ramo){ alert("Selecciona un ramo."); return; }
      if(hrs == null || hrs < 0){ alert("Horas inválidas."); return; }
      sem.ramos[ramo].targetHoras = hrs;
      save(); renderAll();
      return;
    }

    // timer reset
    if(t.id === "resetTimerBtn"){
      if(locked) return;
      resetTimer();
      updateClockUI();
      return;
    }

    // clock tap
    if(t.id === "clock" || t.closest?.("#clock")){
      if(locked) return;
      const chosen = $("#timerRamo")?.value;
      if(!chosen){
        alert("Selecciona un ramo antes de iniciar.");
        return;
      }
      if(timer.running){
        pauseAndCommit();
        save(); renderAll();
      } else {
        startTimer(chosen);
        updateClockUI();
      }
      return;
    }
  });

  renderAll();
  showView("dashboard");
}

init();
