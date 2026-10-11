// ============================================================
// 순천만 생태계 탐험 — 실시간 수업 앱
// - 학생: 반·학번·이름으로 입장 → 선생님이 연 문제만 풀이
// - 선생님: 설명 슬라이드 + 한 문항씩 진행하는 게임식 퀴즈 + 순위·시상
// - 저장소: Supabase (lesson_id = 'suncheon-ecosystem' 으로 다른 수업과 구분)
// - 주소 끝에 ?demo 를 붙이면 "데모 모드": 같은 컴퓨터의 브라우저 탭끼리만 연결(연습·점검용)
// ============================================================
"use strict";

const LESSON_ID = "suncheon-ecosystem";
const CLASS_COUNT = 10;
const SUPABASE_URL = "https://avmbzfazchpxpskwvysp.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF2bWJ6ZmF6Y2hweHBza3d2eXNwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTAyMzYwNjgsImV4cCI6MjEwNTgxMjA2OH0.0viP9fVvMISonzFOZOF3BJX0VtfgHfTNl1W3uVUgcSk";

const PARAMS = new URLSearchParams(location.search);
const DEMO = PARAMS.has("demo") || !window.supabase;

const $ = id => document.getElementById(id);
const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const nowIso = () => new Date().toISOString();
// 학생 신원: 실제 수업은 localStorage(창을 닫아도 유지), 데모는 탭마다 다른 학생이 되도록 sessionStorage
const idStore = {
  get(k){ try{ return (DEMO ? sessionStorage : localStorage).getItem(k); }catch(e){ return null; } },
  set(k,v){ try{ (DEMO ? sessionStorage : localStorage).setItem(k, v); }catch(e){} }
};
// 선생님 화면 설정(포인터·소리·이름 가리기 등)
const pref = {
  get(k,d){ try{ const v = localStorage.getItem("sc:"+k); return v === null ? d : v; }catch(e){ return d; } },
  set(k,v){ try{ localStorage.setItem("sc:"+k, v); }catch(e){} }
};
const sess = {
  get(k){ try{ return sessionStorage.getItem("sc:"+k); }catch(e){ return null; } },
  set(k,v){ try{ sessionStorage.setItem("sc:"+k, v); }catch(e){} }
};

// ============================================================
// 저장소
// ============================================================
const DB = (function(){
  if(!DEMO){
    const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    return {
      demo:false,
      async upsert(t,row){ const {error} = await sb.from(t).upsert(row); if(error) throw error; },
      async list(t,match){ const {data,error} = await sb.from(t).select("*").match(match||{}); if(error) throw error; return data||[]; },
      async drop(t,match){ const {error} = await sb.from(t).delete().match(match); if(error) throw error; },
      on(t,cb){
        sb.channel("sc-"+t+"-"+Math.random().toString(36).slice(2))
          .on("postgres_changes",{event:"*",schema:"public",table:t}, p => cb((p.new && Object.keys(p.new).length) ? p.new : (p.old||null)))
          .subscribe();
      }
    };
  }
  const bc = ("BroadcastChannel" in window) ? new BroadcastChannel("suncheon-demo") : null;
  const load = t => { try{ return JSON.parse(localStorage.getItem("scdemo:"+t)||"{}"); }catch(e){ return {}; } };
  const save = (t,o) => { try{ localStorage.setItem("scdemo:"+t, JSON.stringify(o)); }catch(e){} };
  const tl = {};
  if(bc) bc.onmessage = e => (tl[e.data]||[]).forEach(f => f(null));
  const fire = t => { if(bc) bc.postMessage(t); (tl[t]||[]).forEach(f => setTimeout(() => f(null))); };
  const hit = (r,m) => Object.entries(m||{}).every(([k,v]) => String(r[k]) === String(v));
  return {
    demo:true,
    async upsert(t,row){ const o = load(t); o[row.id] = {...(o[row.id]||{}), ...row}; save(t,o); fire(t); },
    async list(t,match){ return Object.values(load(t)).filter(r => hit(r,match)); },
    async drop(t,match){ const o = load(t); for(const k in o) if(hit(o[k],match)) delete o[k]; save(t,o); fire(t); },
    on(t,cb){ (tl[t]=tl[t]||[]).push(cb); }
  };
})();
async function getSetting(id){ const r = (await DB.list("settings",{id}))[0]; return r ? r.value : null; }
async function setSetting(id, value){ await DB.upsert("settings",{id, value}); }
const liveId = cls => LESSON_ID + "|" + cls;
const playerId = (cls,num) => `${LESSON_ID}|${cls}|${num}`;
const answerId = (cls,qid,num) => `${LESSON_ID}|${cls}|${qid}|${num}`;

// ============================================================
// 문항 (학습지 표현 기준: "비생물요소 → 생물요소" 처럼 영향의 방향으로 표현, 작용·반작용 용어는 쓰지 않음)
// answer = 정답 보기의 순서(0부터), limit = 제한 시간(초)
// ============================================================
const SHAPES = ["▲","◆","●","■"];
const QUIZ = {
  A: { title:"퀴즈 1", sub:"생태계 구성요소와 상호작용", items:[
    { id:"a1", type:"choice", limit:20, answer:0,
      text:"생태계를 이루는 단위를 <u>작은 것부터</u> 차례로 나열한 것은?",
      options:["개체 → 개체군 → 군집 → 생태계","개체군 → 개체 → 군집 → 생태계","개체 → 군집 → 개체군 → 생태계","생태계 → 군집 → 개체군 → 개체"],
      explain:"<b>개체 → 개체군 → 군집 → 생태계</b> 순서로 줌아웃! 생태계에는 비생물요소(환경)까지 들어가요." },
    { id:"a2", type:"choice", limit:20, answer:1,
      text:"순천만 갯벌에 사는 <u>짱뚱어 무리 전체</u>를 무엇이라고 할까?",
      options:["개체","개체군","군집","생태계"],
      explain:"<b>같은 종</b>의 개체 무리 = <b>개체군</b>. 여러 개체군이 모이면 군집이에요." },
    { id:"a3", type:"choice", limit:20, answer:1,
      text:"순천만 갯벌 표면에서 <u>광합성</u>을 하는 생산자는?",
      options:["짱뚱어","규조류","칠게","세균"],
      explain:"갯벌 표면의 <b>규조류</b>가 광합성으로 양분을 만들어요. 세균은 분해자!" },
    { id:"a4", type:"ox", limit:12, answer:1,
      text:"갯지렁이는 교과서 기준 <u>분해자</u>이다.",
      options:["O","X"],
      explain:"갯지렁이는 분해를 <b>돕지만</b>, 분해자는 <b>세균·곰팡이</b>예요." },
    { id:"a5", type:"choice", limit:25, answer:1,
      text:"강 쪽(염분 낮음)에는 갈대, 바다 쪽(염분 높음)에는 칠면초가 많다. 어떤 영향일까?",
      options:["생물요소 → 생물요소","비생물요소 → 생물요소","생물요소 → 비생물요소"],
      explain:"토양의 <b>염분(비생물요소)</b>이 식물이 사는 장소(생물요소)에 영향을 줬어요." },
    { id:"a6", type:"choice", limit:25, answer:1,
      text:"다음 중 <u>생물요소가 비생물요소에</u> 영향을 준 예는?",
      options:["추워지면 짱뚱어가 겨울잠을 잔다","갈대가 오염물질을 흡수해 물을 깨끗하게 한다","도요새가 칠게를 잡아먹는다","썰물 때 게가 구멍에서 나온다"],
      explain:"<b>갈대(생물) → 물(비생물)</b>. ①④는 비생물요소 → 생물요소, ③은 생물요소 ↔ 생물요소예요." },
    { id:"a7", type:"ox", limit:12, answer:0,
      text:"여러 도요새가 같은 게를 두고 경쟁하는 것도 생태계 구성요소 사이의 <u>상호작용</u>이다.",
      options:["O","X"],
      explain:"생물요소끼리도 서로 영향을 주고받아요 → <b>상호작용</b>!" }
  ]},
  B: { title:"퀴즈 2", sub:"먹이 관계와 생태계평형", items:[
    { id:"b1", type:"ox", limit:12, answer:1,
      text:"짱뚱어는 물고기이므로 <u>2차 소비자</u>이다.",
      options:["O","X"],
      explain:"짱뚱어는 갯벌 표면의 규조류를 긁어 먹는 <b>1차 소비자</b>!" },
    { id:"b2", type:"ox", limit:12, answer:0,
      text:"흑두루미는 논에 떨어진 낟알을 먹으므로 <u>1차 소비자</u>이다.",
      options:["O","X"],
      explain:"낟알(생산자)을 먹으니 <b>1차 소비자</b>예요." },
    { id:"b3", type:"choice", limit:20, answer:2,
      text:"먹이사슬 '규조류 → 칠게 → 알락꼬리마도요'에서 <u>2차 소비자</u>는?",
      options:["규조류","칠게","알락꼬리마도요"],
      explain:"생산자(규조류) → 1차 소비자(칠게) → <b>2차 소비자(알락꼬리마도요)</b>" },
    { id:"b4", type:"choice", limit:25, answer:1,
      text:"생태피라미드에서 상위 단계로 갈수록 <u>에너지양이 줄어드는</u> 까닭은?",
      options:["상위 단계 생물의 몸집이 작아서","각 단계에서 에너지의 대부분이 호흡(열) 등으로 빠져나가서","분해자가 에너지를 만들어서"],
      explain:"다음 단계로는 <b>일부(약 10%)</b>만 전달되고, 나머지는 호흡(열)·사체·배설물로 빠져나가요." },
    { id:"b5", type:"choice", limit:15, answer:1,
      text:"먹이그물이 <u>복잡할수록</u> 생태계는?",
      options:["불안정해진다","안정해진다","변화 없다"],
      explain:"한 생물이 줄어도 다른 먹이로 대신할 수 있어 <b>안정</b>해요." },
    { id:"b6", type:"choice", limit:25, answer:0,
      text:"칠게가 <u>일시적으로 늘어났다.</u> 바로 다음에 일어날 변화로 알맞은 것은?",
      options:["알락꼬리마도요는 늘고, 규조류는 줄어든다","알락꼬리마도요는 줄고, 규조류는 늘어난다","아무 변화도 일어나지 않는다"],
      explain:"먹이가 많아진 <b>알락꼬리마도요는 증가</b>, 칠게에게 먹힌 <b>규조류는 감소</b> → 그 뒤 다시 회복!" }
  ]}
};
const ESSAYS = [
  { id:"e1", title:"확장질문 1. 논과 흑두루미",
    prompt:"순천시는 순천만 주변 논에서 친환경 농법을 쓰고, 흑두루미 먹이가 되는 낟알을 남겨 두고 있다. 만약 이 논에서 추수 후 낟알을 모두 거둬들이고 농약을 많이 쓴다면 흑두루미에게 어떤 일이 생길지, <b>먹이 관계</b>를 이용해 설명하시오.",
    model:["흑두루미는 낟알을 먹는 <b>1차 소비자</b>이므로 먹이가 줄면 순천만을 찾는 흑두루미가 줄어든다.",
           "농약이 물과 흙(<b>비생물요소</b>)에 들어가면 갯벌 생물에게도 영향을 줄 수 있다."] },
  { id:"e2", title:"확장질문 2. 갈대밭과 주차장 (가상 상황)",
    prompt:"\"순천만을 찾는 관광객이 많으니 갈대밭 일부를 없애고 주차장을 넓히자\"는 <b>가상의</b> 의견이 있다. 이 의견에 대한 자신의 생각을 <b>생태계 구성요소 사이의 상호작용</b> 또는 <b>먹이 관계</b>를 근거로 써 보시오.",
    model:["갈대는 오염물질을 흡수해 물을 깨끗하게 한다(<b>생물요소 → 비생물요소</b>). 갈대밭이 줄면 수질이 나빠질 수 있다.",
           "갈대·칠면초 찌꺼기를 먹는 게·갯지렁이가 줄고, 이를 먹는 도요새도 줄어드는 등 <b>먹이그물 전체</b>에 영향을 준다.",
           "찬성 의견도 근거가 맞으면 인정 (예: 갈대밭이 아닌 기존 도심 쪽에 주차장을 만드는 대안 제시)"] }
];
const ALL_Q = [...QUIZ.A.items, ...QUIZ.B.items];
const qById = qid => ALL_Q.find(q => q.id === qid) || null;
const setOf = qid => QUIZ.A.items.some(q => q.id === qid) ? "A" : "B";
// O는 파랑, X는 빨강 / 선택형은 보기 순서대로 빨강·파랑·노랑·초록
const optColor = (q,i) => q.type === "ox" ? (i === 0 ? 1 : 0) : i;
const CIRCLED = ["①","②","③","④"];
const optLabel = (q,i) => q.type === "ox" ? q.options[i] : CIRCLED[i] + " " + q.options[i];

// ---------- 점수: 맞히면 500점 + 빠르기 보너스(최대 500점) ----------
function pointsFor(q, row){
  if(!q || !row || row.answer === undefined) return 0;
  if(Number(row.answer) !== q.answer) return 0;
  const lim = q.limit * 1000;
  const ms = Math.max(0, Math.min(Number(row.ms) || lim, lim));
  return Math.round(500 + 500 * (1 - ms / lim));
}
function leaderboard(players, answers, revealed){
  const map = new Map();
  for(const p of players) map.set(p.num, {num:p.num, name:p.name, score:0, correct:0, ms:0});
  for(const a of answers){
    if(!revealed.includes(a.qid)) continue;
    const q = qById(a.qid); if(!q) continue;
    if(!map.has(a.num)) map.set(a.num, {num:a.num, name:a.name, score:0, correct:0, ms:0});
    const r = map.get(a.num), pt = pointsFor(q, a);
    r.score += pt;
    if(pt > 0){ r.correct++; r.ms += Number(a.ms) || 0; }
  }
  return [...map.values()].sort((x,y) => y.score - x.score || y.correct - x.correct || x.ms - y.ms || String(x.num).localeCompare(String(y.num)));
}
function fastestCorrect(q, answers, n){
  return answers.filter(a => a.qid === q.id && pointsFor(q,a) > 0)
    .sort((x,y) => (Number(x.ms)||0) - (Number(y.ms)||0)).slice(0, n);
}
function toast(msg, ms){
  const el = document.createElement("div"); el.className = "toast"; el.textContent = msg;
  document.body.appendChild(el); setTimeout(() => el.remove(), ms || 2600);
}
// ============================================================
// 학생 화면
// ============================================================
const S = { cls:"", num:"", name:"", live:{}, mine:{}, lastKey:"", shownAt:0, raf:0, submitting:false, drafts:{}, rankCache:null };

function sPaint(html, game, login){
  $("s-screen").innerHTML = html;
  $("student-app").classList.toggle("game", !!game);
  $("student-app").classList.toggle("login", !!login);
}
function classOptions(sel){
  let h = '<option value="">반 선택</option>';
  for(let i=1;i<=CLASS_COUNT;i++){ const c = i+"반"; h += `<option value="${c}" ${c===sel?"selected":""}>${i}반</option>`; }
  return h;
}
function renderLogin(msg){
  $("s-me").textContent = ""; $("s-score").classList.add("hidden");
  const saved = { cls:idStore.get("sc:cls")||"", num:idStore.get("sc:num")||"", name:idStore.get("sc:name")||"" };
  sPaint(`
    <div class="lg-head">
      <div class="lg-titles">
        <h1 class="lg-title">순천만 생태계 탐험</h1>
        <div class="lg-sub">Ⅱ. 환경과 에너지 · 1-1. 생물과 환경</div>
      </div>
      <div class="lg-side">
        <div class="lg-chips">
          <span class="lg-chip" id="lg-net"><i></i><span>인터넷 연결 정상</span></span>
          <span class="lg-chip ${DB.demo ? "warn" : ""}"><i></i><span>${DB.demo ? "데모 모드" : "실시간 연결됨"}</span></span>
        </div>
        <button class="lg-teacher" id="in-teacher">🧑‍🏫 선생님 보기</button>
      </div>
    </div>
    <div class="s-card lg-card">
      <h2 class="lg-h">시작하기 전에</h2>
      <p class="s-sub">반과 학번, 이름을 입력하면 오늘 활동을 시작할 수 있어요. 나갔다 와도 <b>똑같이</b> 입력하면 점수가 이어져요.</p>
      <div class="lg-label">반 · 학번 · 이름</div>
      <div class="lg-row">
        <select id="in-cls" aria-label="반">${classOptions(saved.cls)}</select>
        <input id="in-num" inputmode="numeric" maxlength="5" placeholder="학번 (예: 10101)" aria-label="학번" value="${esc(saved.num)}">
        <input id="in-name" maxlength="10" placeholder="이름" aria-label="이름" value="${esc(saved.name)}">
      </div>
      <div class="lg-warn"><b>⚠️ 시작 전 꼭 확인하세요</b>선생님이 문제를 열어 줄 때까지 기다려 주세요. 반·학번·이름을 정확히 입력해야 내 점수가 이어져요.</div>
      <button class="btn s-big-btn" id="in-go">시작하기</button>
      <div class="s-msg" id="in-msg">${esc(msg||"")}</div>
    </div>`, false, true);
  $("in-go").onclick = doLogin;
  $("in-name").addEventListener("keydown", e => { if(e.key === "Enter") doLogin(); });
  $("in-teacher").onclick = openPass;
  const net = $("lg-net"), setNet = () => { net.classList.toggle("warn", !navigator.onLine); net.lastChild.textContent = navigator.onLine ? "인터넷 연결 정상" : "인터넷 연결 끊김"; };
  setNet(); window.addEventListener("online", setNet); window.addEventListener("offline", setNet);
}
async function doLogin(){
  const cls = $("in-cls").value, num = $("in-num").value.trim(), name = $("in-name").value.trim().replace(/\s+/g,"");
  const msg = $("in-msg");
  if(!cls){ msg.textContent = "반을 골라 주세요."; return; }
  if(!/^\d{4,5}$/.test(num)){ msg.textContent = "학번을 숫자 5자리로 입력해 주세요. (예: 10301)"; return; }
  if(!name){ msg.textContent = "이름을 입력해 주세요."; return; }
  const btn = $("in-go"); btn.disabled = true; btn.textContent = "연결 중…";
  try{
    // 선생님이 입장을 막았으면 새 학생은 못 들어오고, 이미 들어왔던 학생(폰 꺼짐 등)만 다시 들어올 수 있다
    const lv = await getSetting(liveId(cls));
    if(lv && lv.entry === false && !(await DB.list("lesson_players", {id:playerId(cls,num)})).length){
      btn.disabled = false; btn.textContent = "시작하기";
      msg.textContent = "🔒 지금은 입장이 닫혀 있어요. 선생님께 말씀해 주세요.";
      return;
    }
    await DB.upsert("lesson_players", {id:playerId(cls,num), lesson_id:LESSON_ID, cls, num, name, seen:nowIso()});
    idStore.set("sc:reset:" + cls, String((lv && lv.resetAt) || ""));   // 새로 들어온 시점의 기록을 기준으로 삼음
  }catch(e){
    btn.disabled = false; btn.textContent = "시작하기";
    msg.textContent = "연결에 실패했어요. 와이파이를 확인하고 다시 눌러 주세요.";
    console.error(e); return;
  }
  idStore.set("sc:cls", cls); idStore.set("sc:num", num); idStore.set("sc:name", name);
  Object.assign(S, {cls, num, name});
  enterStudent();
}
let studentStarted = false;
async function enterStudent(){
  $("s-me").textContent = `${S.cls} ${S.num} ${S.name}`;
  $("s-me").onclick = () => { if(confirm("다른 반·학번·이름으로 다시 들어갈까요?")){ idStore.set("sc:num",""); idStore.set("sc:name",""); location.reload(); } };
  DB.upsert("lesson_players", {id:playerId(S.cls,S.num), lesson_id:LESSON_ID, cls:S.cls, num:S.num, name:S.name, seen:nowIso()}).catch(() => {});
  sPaint(`<div class="wait-box"><div class="hero-emoji pulse">⏳</div><p class="s-sub">연결하는 중…</p></div>`);
  try{ await loadMine(); }catch(e){}
  if(!studentStarted){
    studentStarted = true;
    DB.on("settings", row => { if(!row || row.id === liveId(S.cls)) pullLive(); });
    setInterval(pullLive, 2500);
  }
  S.lastKey = "";
  pullLive();
}
async function loadMine(){
  const rows = await DB.list("lesson_answers", {lesson_id:LESSON_ID, cls:S.cls, num:S.num});
  S.mine = {}; rows.forEach(r => S.mine[r.qid] = r);
}
async function pullLive(){
  if(!S.cls || !S.num) return;
  try{ applyLive((await getSetting(liveId(S.cls))) || {}); }catch(e){}
}
function liveKey(v){
  return [v.phase, v.listen ? "listen" : "", v.qid, v.tab, (v.revealed||[]).length, JSON.stringify(v.mvp||[]), v.awardStep, JSON.stringify(v.essayMvp||{})].join("|");
}
function applyLive(v){
  // 선생님이 [이 반 기록 지우기]를 했으면: 이 폰에 남은 답·점수·쓰던 글을 비우고 처음 입장 화면으로
  const rk = "sc:reset:" + S.cls, rs = String(v.resetAt || ""), seen = idStore.get(rk);
  if(seen === null) idStore.set(rk, rs);
  else if(rs !== seen){ idStore.set(rk, rs); wipeStudent(); return; }
  const k = liveKey(v);
  S.live = v;
  if(k === S.lastKey) return;
  // 서술형을 쓰는 중에는 진행 표시만 바뀌어도 다시 그리지 않음(입력 중인 글 보호)
  if(S.lastKey && v.phase === "essay" && S.lastKey.startsWith("essay|")){ S.lastKey = k; return; }
  S.lastKey = k;
  renderStudent();
}
function wipeStudent(){
  stopTimer();
  Object.assign(S, {num:"", name:"", live:{}, mine:{}, lastKey:"", drafts:{}, rankCache:null, submitting:false});
  idStore.set("sc:num", ""); idStore.set("sc:name", "");
  renderLogin("선생님이 기록을 새로 시작했어요. 반·학번·이름을 다시 입력해 주세요.");
}
function myScore(){
  const rev = S.live.revealed || [];
  let s = 0; for(const qid of rev){ s += pointsFor(qById(qid), S.mine[qid]); } return s;
}
function paintScore(){
  const rev = S.live.revealed || [];
  const chip = $("s-score");
  chip.classList.toggle("hidden", !rev.length);
  chip.textContent = myScore().toLocaleString() + "점";
}
function stopTimer(){ if(S.raf) cancelAnimationFrame(S.raf); S.raf = 0; }
function renderStudent(){
  stopTimer(); paintScore();
  const v = S.live || {}, ph = v.phase || "wait", q = qById(v.qid);
  if(v.listen) return renderListen();
  if(ph === "question" && q) return S.mine[q.id] ? renderAnswered(q) : renderQuestion(q);
  if(ph === "closed" && q) return S.mine[q.id] ? renderAnswered(q) : renderTimeUp();
  if(ph === "reveal" && q) return renderReveal(q);
  if(ph === "board" || ph === "award") return renderMyRank();
  if(ph === "essay") return renderEssay();
  renderWait();
}
function renderWait(){
  const v = S.live || {};
  sPaint(`<div class="wait-box">
      <div class="hero-emoji pulse">👀</div>
      <h2 class="s-title" style="margin-top:14px">선생님 화면을 봐 주세요</h2>
      <p class="s-sub">문제가 열리면 이 화면이 저절로 바뀌어요.</p>
      <div class="now">📺 지금: ${esc(v.tab || "수업 준비 중")}</div>
    </div>`, false);
}
// 선생님이 [수업듣기!]를 켜면: 핸드폰은 내려놓고 수업 듣기
function renderListen(){
  sPaint(`<div class="wait-box">
      <div class="hero-emoji">📵</div>
      <h2 class="s-title" style="margin-top:14px">핸드폰을 내려놓고<br>수업을 들어요</h2>
      <p class="s-sub">화면을 엎어 두고 선생님 설명에 집중해 주세요.<br>문제가 시작되면 이 화면이 저절로 바뀌어요.</p>
    </div>`, true);
}
function qTag(q){ const st = setOf(q.id); return `${QUIZ[st].title} · ${QUIZ[st].items.indexOf(q)+1}번`; }
function renderQuestion(q){
  const ox = q.type === "ox";
  sPaint(`
    <div class="s-qhead"><span>${qTag(q)}</span><span>⏱ <b id="s-left">${q.limit}</b>초</span></div>
    <div class="s-timer"><i id="s-bar" style="width:100%"></i></div>
    <p class="s-qtext">${q.text}</p>
    <div class="s-opts ${ox?"ox":""}">
      ${q.options.map((o,i) => `<button class="s-opt c${optColor(q,i)}" data-i="${i}"><span class="shape">${SHAPES[i]}</span><span>${esc(o)}</span></button>`).join("")}
    </div>`, true);
  S.shownAt = performance.now();
  document.querySelectorAll(".s-opt").forEach(b => b.onclick = () => submitAnswer(q, +b.dataset.i));
  const tick = () => {
    const left = q.limit - (performance.now() - S.shownAt) / 1000;
    const bar = $("s-bar"), lab = $("s-left");
    if(!bar) return;
    bar.style.width = Math.max(0, left / q.limit * 100) + "%";
    lab.textContent = Math.max(0, Math.ceil(left));
    if(left <= 0){ if(!S.mine[q.id] && !S.submitting) renderTimeUp(); return; }
    S.raf = requestAnimationFrame(tick);
  };
  S.raf = requestAnimationFrame(tick);
}
async function submitAnswer(q, i){
  if(S.mine[q.id] || S.submitting) return;
  const ms = Math.round(performance.now() - S.shownAt);
  if(ms > q.limit * 1000 + 300){ renderTimeUp(); return; }
  S.submitting = true;
  document.querySelectorAll(".s-opt").forEach(b => { b.classList.toggle("picked", +b.dataset.i === i); b.classList.toggle("dim", +b.dataset.i !== i); b.disabled = true; });
  const row = {id:answerId(S.cls,q.id,S.num), lesson_id:LESSON_ID, cls:S.cls, qid:q.id, num:S.num, name:S.name, answer:String(i), ms, updated:nowIso()};
  let ok = false;
  for(let t=0; t<3 && !ok; t++){
    try{ await DB.upsert("lesson_answers", row); ok = true; }catch(e){ await sleep(700); }
  }
  S.submitting = false;
  if(ok){ S.mine[q.id] = row; stopTimer(); renderAnswered(q); }
  else{
    toast("전송이 안 됐어요. 다시 눌러 주세요!");
    document.querySelectorAll(".s-opt").forEach(b => { b.classList.remove("picked","dim"); b.disabled = false; });
  }
}
function renderAnswered(q){
  const r = S.mine[q.id], i = Number(r.answer);
  sPaint(`<div class="s-result">
      <div class="big pulse">📨</div>
      <h2>제출 완료!</h2>
      <p class="s-sub">${(r.ms/1000).toFixed(1)}초 만에 골랐어요. 정답 공개를 기다려요…</p>
      <div style="margin-top:18px"><span class="s-opt c${optColor(q,i)}" style="display:inline-flex;justify-content:center;min-height:auto;padding:12px 20px">${esc(optLabel(q,i))}</span></div>
    </div>`, true);
}
function renderTimeUp(){
  stopTimer();
  sPaint(`<div class="s-result"><div class="big">⏰</div><h2>시간이 끝났어요</h2><p class="s-sub">다음 문제를 노려 봐요!</p></div>`, true);
}
function renderReveal(q){
  const r = S.mine[q.id], v = S.live || {};
  const isMvp = (v.mvp || []).includes(S.num);
  const total = myScore().toLocaleString();
  let head;
  if(!r) head = `<div class="big">😶</div><h2>이번 문제는 응답하지 않았어요</h2>`;
  else if(pointsFor(q, r) > 0) head = `<div class="big">🎉</div><h2>정답!</h2><div class="pts">+${pointsFor(q,r)}점</div>`;
  else head = `<div class="big">💪</div><h2>아쉬워요</h2><div class="s-sub">정답: ${esc(optLabel(q,q.answer))}</div>`;
  const cls = !r ? "" : (pointsFor(q,r) > 0 ? "ok" : "no");
  sPaint(`${isMvp ? `<div class="s-mvp-banner">⚡ 이번 문제 MVP! 화면에 내 이름이 나왔어요</div>` : ""}
    <div class="s-result ${cls}">${head}
      <p class="s-sub" style="margin-top:10px">누적 <b style="color:var(--color-primary-on-dark)">${total}점</b></p>
      <div class="exp">💡 ${q.explain}</div>
    </div>`, true);
  if(isMvp) confetti(90);
}
async function renderMyRank(){
  const v = S.live || {}, award = v.phase === "award";
  sPaint(`<div class="s-result"><div class="big pulse">${award ? "🥁" : "🏆"}</div><h2>${award ? "시상식 진행 중!" : "중간 순위"}</h2><p class="s-sub">순위를 계산하는 중…</p></div>`, true);
  let players = [], answers = [];
  try{
    [players, answers] = await Promise.all([
      DB.list("lesson_players", {lesson_id:LESSON_ID, cls:S.cls}),
      DB.list("lesson_answers", {lesson_id:LESSON_ID, cls:S.cls})
    ]);
  }catch(e){}
  if(liveKey(S.live) !== liveKey(v)) return; // 그 사이 화면이 바뀜
  const lb = leaderboard(players, answers, v.revealed || []);
  const idx = lb.findIndex(r => r.num === S.num);
  const me = lb[idx] || {score:0, correct:0};
  const rank = idx + 1;
  let banner = "";
  if(award){
    const step = v.awardStep || 0;
    const essayMvp = Object.values(v.essayMvp || {}).some(a => (a||[]).includes(S.num));
    if(rank >= 1 && rank <= 3 && step >= 4 - rank) banner += `<div class="s-mvp-banner">🎉 퀴즈 TOP ${rank}! 축하해요</div>`;
    if(essayMvp && step >= 4) banner += `<div class="s-mvp-banner" style="margin-top:10px">✍️ 서술 MVP! 생각이 빛났어요</div>`;
    if(banner) confetti(120);
  }
  sPaint(`${banner}
    <div class="s-result">
      <div class="big">${award ? "🥁" : "🏆"}</div>
      <h2>${award ? "시상식이 진행 중이에요" : "지금 나는"}</h2>
      ${idx >= 0 ? `<div class="s-rank">${rank}위</div><p class="s-sub">${lb.length}명 중 · ${me.score.toLocaleString()}점 · ${me.correct}문제 정답</p>` : `<p class="s-sub">아직 기록이 없어요</p>`}
      <p class="s-sub" style="margin-top:14px">📺 선생님 화면을 봐 주세요!</p>
    </div>`, true);
}
function renderEssay(){
  sPaint(ESSAYS.map(e => {
    const saved = S.mine[e.id] ? S.mine[e.id].answer : "";
    const val = S.drafts[e.id] != null ? S.drafts[e.id] : saved;
    return `<div class="s-card s-essay">
      <h3 class="s-title" style="font-size:1.2rem">✍️ ${esc(e.title)}</h3>
      <div class="prompt">${e.prompt}</div>
      <textarea id="es-${e.id}" placeholder="내 생각을 근거와 함께 써 보세요.">${esc(val)}</textarea>
      <div class="row"><span class="saved" id="es-st-${e.id}">${saved ? "✅ 저장됨" : ""}</span><button class="btn" id="es-save-${e.id}">저장하기</button></div>
    </div>`;
  }).join("") + `<p class="s-sub" style="text-align:center">저장한 글은 이름을 가리고 선생님 화면에 보여요. 고쳐서 다시 저장해도 돼요.</p>`, false);
  ESSAYS.forEach(e => {
    const ta = $("es-"+e.id);
    ta.addEventListener("input", () => { S.drafts[e.id] = ta.value; $("es-st-"+e.id).textContent = "✏️ 저장 안 됨"; });
    $("es-save-"+e.id).onclick = async () => {
      const text = ta.value.trim();
      if(!text){ toast("내용을 먼저 써 주세요."); return; }
      const b = $("es-save-"+e.id); b.disabled = true; b.textContent = "저장 중…";
      const row = {id:answerId(S.cls,e.id,S.num), lesson_id:LESSON_ID, cls:S.cls, qid:e.id, num:S.num, name:S.name, answer:text, ms:null, updated:nowIso()};
      try{ await DB.upsert("lesson_answers", row); S.mine[e.id] = row; delete S.drafts[e.id]; $("es-st-"+e.id).textContent = "✅ 저장됨"; }
      catch(err){ toast("저장이 안 됐어요. 다시 눌러 주세요!"); }
      b.disabled = false; b.textContent = "저장하기";
    };
  });
}
// ============================================================
// 선생님 화면 — 암호·반 선택
// ============================================================
const T = {
  cls:"", tab:"qr", live:{phase:"wait", revealed:[]}, players:[], answers:[], dataErr:null,
  quizSet:"A", qi:{A:0, B:0}, qstage:{}, timer:0, qStart:0, lastCounts:{},
  showCounts: pref.get("showCounts","1") === "1", mask: pref.get("mask","0") === "1", sound: pref.get("sound","1") === "1",
  pointer: pref.get("pointer","0") === "1",
  rankMode:"board", awardStep:0, essaySel:"e1", showModel:false, bots:null, started:false
};
const TABS = [
  {id:"qr", label:"QR"},
  {id:"video", label:"🎬 순천 새멍 투어"},
  {id:"s1", label:"① 순천만 줌아웃"},
  {id:"s2", label:"② 상호작용"},
  {id:"qA", label:"🎮 퀴즈 1", game:true},
  {id:"s3", label:"③ 먹이 관계"},
  {id:"s4", label:"④ 생태계평형"},
  {id:"qB", label:"🎮 퀴즈 2", game:true},
  {id:"essay", label:"✍ 확장질문"},
  {id:"rank", label:"🏆 순위·시상", game:true},
  {id:"progress", label:"진행 상황"}
];
const dispName = name => {
  name = String(name || "");
  if(!T.mask || name.length < 2) return name;
  return name.length === 2 ? name[0] + "○" : name[0] + "○".repeat(name.length - 2) + name[name.length - 1];
};

function openPass(){
  $("m-pass").classList.remove("hidden");
  $("m-pass-input").value = "";
  setTimeout(() => $("m-pass-input").focus(), 50);
}
$("m-pass-cancel").onclick = () => $("m-pass").classList.add("hidden");
$("m-pass-input").addEventListener("keydown", e => { if(e.key === "Enter") checkPass(); });
$("m-pass-ok").onclick = checkPass;
let passBusy = false;
async function checkPass(){
  if(passBusy) return;
  const val = $("m-pass-input").value.trim(); if(!val) return;
  passBusy = true; $("m-pass-ok").disabled = true; $("m-pass-ok").textContent = "확인 중…";
  let ok = false;
  if(DB.demo) ok = true;
  else{
    try{
      const r = await fetch(SUPABASE_URL + "/rest/v1/rpc/check_teacher_passcode", {method:"POST",
        headers:{"apikey":SUPABASE_ANON_KEY, "Authorization":"Bearer "+SUPABASE_ANON_KEY, "Content-Type":"application/json"},
        body: JSON.stringify({p: val})});
      ok = r.ok && (await r.json()) === true;
    }catch(e){ ok = false; }
  }
  passBusy = false; $("m-pass-ok").disabled = false; $("m-pass-ok").textContent = "확인";
  if(!ok){ $("m-pass-input").value = ""; $("m-pass-input").placeholder = "암호가 틀렸어요"; return; }
  sess.set("teacher", "1");
  $("m-pass").classList.add("hidden");
  openClassPicker();
}
function openClassPicker(){
  const last = pref.get("lastClass", "");
  let h = ""; for(let i=1;i<=CLASS_COUNT;i++){ const c = i+"반"; h += `<option value="${c}" ${c===last?"selected":""}>${i}반</option>`; }
  $("m-class-select").innerHTML = h;
  $("m-class").classList.remove("hidden");
}
// 전체화면: 브라우저는 버튼을 누를 때만 허용하므로 [이 반으로 시작]을 누를 때 켠다
function goFull(){ const d = document.documentElement; if(!document.fullscreenElement && d.requestFullscreen) d.requestFullscreen().catch(() => {}); }
function toggleFull(){ if(document.fullscreenElement) document.exitFullscreen().catch(() => {}); else goFull(); }
function paintFull(){ const b = $("tab-full"); if(b) b.textContent = document.fullscreenElement ? "↙ 창 모드" : "⛶ 전체화면"; }
document.addEventListener("fullscreenchange", paintFull);
$("m-class-ok").onclick = () => {
  goFull();
  const c = $("m-class-select").value; pref.set("lastClass", c);
  $("m-class").classList.add("hidden");
  startTeacher(c);
};
$("t-cls").onclick = openClassPicker;

// ============================================================
// 선생님 화면 — 시작·실시간 데이터
// ============================================================
async function startTeacher(cls){
  document.documentElement.classList.add("teacher");
  $("student-app").classList.add("hidden");
  $("teacher-app").classList.remove("hidden");
  T.cls = cls; $("t-cls").textContent = cls + " ▾";
  T.qstage = {}; T.qi = {A:0, B:0}; T.awardStep = 0; T.rankMode = "board";
  let v = null; try{ v = await getSetting(liveId(cls)); }catch(e){}
  T.live = Object.assign({phase:"wait", revealed:[], nonce:0, essayMvp:{}}, v || {});
  if(!Array.isArray(T.live.revealed)) T.live.revealed = [];
  // 새로 고침해도 하던 문항에서 이어 가기
  if(T.live.qid && qById(T.live.qid)){
    const st = setOf(T.live.qid);
    T.quizSet = st; T.qi[st] = QUIZ[st].items.findIndex(q => q.id === T.live.qid);
    if(T.live.phase === "question") T.qstage[T.live.qid] = "closed";
  }
  if(T.live.phase === "question") pushLive({phase:"closed"});
  if(!T.started){
    T.started = true;
    buildTabs(); initTools(); initSlides(); initImages();
    DB.on("lesson_answers", scheduleRefresh);
    DB.on("lesson_players", scheduleRefresh);
    setInterval(refreshData, 4000);
  }
  paintGates();
  await refreshData();
  switchTab(sess.get("tab") || "qr");
}
function pushLive(patch){
  // 학생이 핸드폰으로 할 일이 생기면(문제·확장질문·순위) [수업듣기!]는 저절로 꺼진다
  if(["question","essay","board","award"].includes(patch.phase)) patch = Object.assign({}, patch, {listen:false});
  T.live = Object.assign({}, T.live, patch, {nonce:(T.live.nonce||0)+1, at:Date.now()});
  paintGates();
  return setSetting(liveId(T.cls), T.live).catch(e => { console.error(e); toast("⚠️ 학생 화면에 전달이 안 됐어요. 인터넷을 확인하세요."); });
}
let refreshTimer = 0;
function scheduleRefresh(){ if(refreshTimer) return; refreshTimer = setTimeout(() => { refreshTimer = 0; refreshData(); }, 300); }
async function refreshData(){
  if(!T.cls) return;
  try{
    const [pl, an] = await Promise.all([
      DB.list("lesson_players", {lesson_id:LESSON_ID, cls:T.cls}),
      DB.list("lesson_answers", {lesson_id:LESSON_ID, cls:T.cls})
    ]);
    T.players = pl.sort((a,b) => String(a.num).localeCompare(String(b.num)));
    T.answers = an; T.dataErr = null;
  }catch(e){ T.dataErr = e; console.error(e); }
  onData();
}
function onData(){
  $("t-live").innerHTML = `<i></i>접속 ${T.players.length}명`;
  if(T.tab === "qA" || T.tab === "qB") updateQuizCounts();
  else if(T.tab === "essay") renderEssayView(true);
  else if(T.tab === "progress") renderProgress();
}

// ============================================================
// 탭
// ============================================================
// 상단에는 QR · [📚 학습내용 ▾] · 진행 상황만 두고, 수업 흐름(슬라이드·퀴즈·확장질문·순위)은 학습내용 메뉴 안에 순서대로 모은다
const LESSON_TABS = TABS.filter(t => t.id !== "qr" && t.id !== "progress");
function buildTabs(){
  $("t-tabs").innerHTML =
    `<button data-tab="qr">QR</button>` +
    `<button id="tab-menu" class="menu">📚 학습내용 ▾</button>` +
    `<button data-tab="progress">진행 상황</button>` +
    `<button id="tab-full" class="full">⛶ 전체화면</button>`;
  const menu = document.createElement("div");
  menu.id = "t-menu"; menu.className = "t-menu hidden";
  menu.innerHTML = LESSON_TABS.map((t,i) => `<button data-tab="${t.id}" class="${t.game?"game":""}"><span class="no">${i+1}</span>${t.label}</button>`).join("");
  document.body.appendChild(menu);
  document.querySelectorAll("button[data-tab]").forEach(b => b.onclick = () => { closeMenu(); switchTab(b.dataset.tab); });
  $("tab-menu").onclick = e => {
    e.stopPropagation();
    if(!menu.classList.contains("hidden")) return closeMenu();
    const r = $("tab-menu").getBoundingClientRect();
    menu.style.left = r.left + "px"; menu.style.top = (r.bottom + 6) + "px";
    menu.classList.remove("hidden");
  };
  document.addEventListener("click", e => { if(!menu.contains(e.target)) closeMenu(); });
  $("tab-full").onclick = () => { toggleFull(); $("tab-full").blur(); };
  paintFull();
}
function closeMenu(){ const m = $("t-menu"); if(m) m.classList.add("hidden"); }
function paintMenu(id){
  const b = $("tab-menu"); if(!b) return;
  const t = LESSON_TABS.find(x => x.id === id);
  b.classList.toggle("active", !!t);
  b.textContent = t ? `📚 ${t.label} ▾` : "📚 학습내용 ▾";
}
function viewOf(id){ return (id === "qA" || id === "qB") ? "tv-quiz" : "tv-" + id; }
function switchTab(id){
  if(!TABS.some(t => t.id === id)) id = "qr";
  T.tab = id; sess.set("tab", id);
  document.querySelectorAll("#t-tabs button[data-tab], #t-menu button").forEach(b => b.classList.toggle("active", b.dataset.tab === id));
  paintMenu(id);
  document.querySelectorAll(".t-view").forEach(v => v.classList.toggle("hidden", v.id !== viewOf(id)));
  const tab = TABS.find(t => t.id === id);
  if(id !== "video") stopVideo();
  if(id === "video") showVideo();   // 수업 도입 영상: 학생 핸드폰과는 연결하지 않음
  else if(/^s\d$/.test(id)){
    renderSlide(id);
    if(T.live.phase !== "wait" || T.live.tab !== tab.label) pushLive({phase:"wait", tab:tab.label});
  }else if(id === "qA" || id === "qB"){
    const set = id === "qA" ? "A" : "B";
    T.quizSet = set;
    const busy = ["question","closed","reveal"].includes(T.live.phase) && T.live.qid && setOf(T.live.qid) === set;
    if(!busy) pushLive({phase:"wait", tab:QUIZ[set].title + " 준비 중"});
    renderQuiz();
  }else if(id === "essay") renderEssayView();
  else if(id === "rank") enterRank();
  else if(id === "progress") renderProgress();
}
// ============================================================
// 도입 영상 — 스브스뉴스 '순천시 새멍 투어' 2:27부터 끝까지
//   기본: 유튜브 삽입 / 유튜브가 막히면: 이 컴퓨터의 mp4 파일을 골라 재생(파일은 업로드되지 않음)
// ============================================================
const VIDEO = {id:"jz92pFezOwg", start:147};
function ytSrc(){ return `https://www.youtube-nocookie.com/embed/${VIDEO.id}?start=${VIDEO.start}&rel=0&modestbranding=1&playsinline=1`; }
function showVideo(){
  const yt = $("vd-yt"), lv = $("vd-local");
  if(lv.src){ yt.classList.add("hidden"); lv.classList.remove("hidden"); return; }
  if(!yt.src) yt.src = ytSrc();
}
function stopVideo(){
  const yt = $("vd-yt"), lv = $("vd-local");
  if(!lv.paused) lv.pause();
  if(yt.src) yt.removeAttribute("src");   // 다른 탭으로 가면 유튜브 소리도 멈춤
}
$("vd-use-yt").onclick = () => {
  const lv = $("vd-local"); lv.pause(); lv.removeAttribute("src"); lv.load(); lv.classList.add("hidden");
  $("vd-yt").classList.remove("hidden"); $("vd-yt").src = ytSrc();
};
$("vd-file").onchange = e => {
  const f = e.target.files && e.target.files[0]; if(!f) return;
  const lv = $("vd-local"), yt = $("vd-yt");
  yt.removeAttribute("src"); yt.classList.add("hidden");
  lv.src = URL.createObjectURL(f); lv.classList.remove("hidden");
  lv.onloadedmetadata = () => { lv.currentTime = Math.min(VIDEO.start, lv.duration || VIDEO.start); lv.play().catch(() => {}); };
  e.target.value = "";
};
function goNextTab(){
  const i = TABS.findIndex(t => t.id === T.tab);
  if(i >= 0 && i < TABS.length - 1) switchTab(TABS[i+1].id);
}

// ============================================================
// 설명 슬라이드 엔진 — [data-step] 요소를 하나씩 펼치고, 다 펼치면 다음 장 → 다음 탭
// ============================================================
const SLIDE = {};
const pagesOf = tab => [...$("tv-"+tab).querySelectorAll(".page")];
function stepsOf(page){
  if(page.dataset.steps) return +page.dataset.steps;
  let m = 0; page.querySelectorAll("[data-step]").forEach(e => m = Math.max(m, +e.dataset.step)); return m;
}
function initSlides(){
  ["s1","s2","s3","s4"].forEach(tab => {
    SLIDE[tab] = {page:0, step:0};
    const sec = $("tv-"+tab);
    sec.querySelector(".sn-next").onclick = () => slideNext(tab);
    sec.querySelector(".sn-prev").onclick = () => slidePrev(tab);
  });
  buildZoom(); buildWeb(); initPyramid();
}
function renderSlide(tab){
  const st = SLIDE[tab], pages = pagesOf(tab), p = pages[st.page];
  pages.forEach((x,i) => x.classList.toggle("cur", i === st.page));
  p.querySelectorAll("[data-step]").forEach(e => e.classList.toggle("on", +e.dataset.step <= st.step));
  const hook = HOOKS[p.dataset.key]; if(hook) hook(st.step);
  $("tv-"+tab).querySelector(".slide-dots").innerHTML = pages.map((x,i) => `<i class="${i===st.page?"cur":""}"></i>`).join("");
}
function slideNext(tab){
  const st = SLIDE[tab], pages = pagesOf(tab);
  if(st.step < stepsOf(pages[st.page])) st.step++;
  else if(st.page < pages.length - 1){ st.page++; st.step = 0; }
  else { goNextTab(); return; }
  renderSlide(tab);
}
function slidePrev(tab){
  const st = SLIDE[tab], pages = pagesOf(tab);
  if(st.step > 0) st.step--;
  else if(st.page > 0){ st.page--; st.step = stepsOf(pages[st.page]); }
  else return;
  renderSlide(tab);
}
const IMG_FILES = {
  "intro-bay.jpg":["순천만 전경.png"], "reed.jpg":["순천만 갈대밭.png"], "chilmyeoncho.jpg":["붉게 물든 칠면조 군락.png","붉게 물든 칠면초 군락.png"],
  "mudflat.jpg":["썰물 때 드러난 갯벌.png"], "mudskipper.jpg":["짱뚱어.png"], "fiddler-crab.jpg":["농게.png"], "chilge.jpg":["칠게.png"],
  "lugworm.jpg":["갯지렁이.png"], "hooded-crane.jpg":["논에서 먹이를 먹는 흑두루미 무리.png"], "spoonbill.jpg":["노랑부리저어새.png"],
  "curlew.jpg":["알락꼬리마도요.png"], "gull.jpg":["검은머리갈매기.png"], "leopard-cat.jpg":["삵.png"], "otter.jpg":["수달.png"],
  "diatom.jpg":["규조류 현미경 사진.png"]
};
function initImages(){
  document.querySelectorAll("figure.ph[data-img]").forEach(fig => {
    const name = fig.dataset.img;
    fig.innerHTML = `<div class="fallback"><div class="emo">${fig.dataset.emo||"🖼️"}</div>이미지 준비 중: ${esc(name)}<small>images 폴더에 넣으면 자동으로 보여요</small></div>` +
      (fig.dataset.cap ? `<figcaption>${esc(fig.dataset.cap)}</figcaption>` : "");
    const im = new Image();
    im.alt = fig.dataset.cap || name;
    im.onload = () => { fig.prepend(im); fig.classList.add("loaded"); };
    // 영어 이름(reed.jpg)이 있으면 그것을, 없으면 한글 파일 이름(IMG_FILES)을 찾는다
    const cands = [name].concat(IMG_FILES[name] || []);
    let ci = 0;
    im.onerror = () => { ci++; if(ci < cands.length) im.src = "images/" + encodeURIComponent(cands[ci]); };
    im.src = "images/" + encodeURIComponent(cands[0]);
  });
  const qr = $("qr-img");
  const qrFail = () => { $("qr-box").innerHTML = "images 폴더에 qr.png를 넣어 주세요"; };
  if(qr.complete && !qr.naturalWidth) qrFail(); else qr.onerror = qrFail;
  $("qr-url").textContent = location.origin + location.pathname;
}

// ---------- 줌아웃 무대 ----------
const ZOOM_ITEMS = [
  // [이모지, 이름표, x%, y%, 단계]
  ["🐟","짱뚱어",50,56,1],
  ["🐟","",44.5,51.5,2],["🐟","",55.5,51,2],["🐟","",45.5,61,2],["🐟","",54.5,61.5,2],["🐟","",50,49,2],["🐟","",57.5,56.5,2],["🐟","",42.5,56.5,2],
  ["🦀","칠게",30,46,3],["🦀","",33.5,51,3],["🦀","",27.5,52,3],
  ["🦀","농게",69,46,3],["🦀","",72.5,51.5,3],
  ["🌾","갈대",19,34,3],["🌾","",23,32,3],["🌾","",27,35,3],
  ["🌿","칠면초",75,33,3],["🌿","",79,35.5,3],["🌿","",83,32.5,3],
  ["〰️","갯지렁이",37,70,3],["〰️","",41,73,3],
  ["🟤","규조류",61,71,3],["🟤","",64,68,3],
  ["🦠","세균",68,76,3],
  ["🐦","도요새",24,61,3],["🐦","저어새",77,62,3],["🐦","흑두루미",85,47,3]
];
function buildZoom(){
  const w = $("zoom-world");
  let h = "";
  h += `<div class="z-ring lv2" style="left:50%;top:56%;width:22%;height:36%;border-color:#0071e3"><span class="tag" style="background:#0071e3">개체군 · 짱뚱어 무리</span></div>`;
  h += `<div class="z-ring lv3" style="left:51%;top:54%;width:84%;height:74%;border-color:#1d1d1f"><span class="tag" style="background:#1d1d1f">군집 · 여러 개체군</span></div>`;
  h += `<div class="z-frame lv4"><span class="tag">생태계 · 군집 + 비생물요소</span></div>`;
  for(const [e,l,x,y,lv] of ZOOM_ITEMS){
    const filt = e === "🌿" ? "filter:hue-rotate(-100deg) saturate(1.6);" : "";
    h += `<div class="z-it ${lv>1?"lv"+lv:""}" style="left:${x}%;top:${y}%"><span class="e" style="${filt}">${e}</span>${l?`<span class="l">${l}</span>`:""}</div>`;
  }
  const env = [["☀️ 빛",12,10],["💨 공기",50,7],["🌡️ 온도",88,10],["🌊 물 (밀물·썰물)",22,93],["🟫 토양 (펄갯벌·염분)",76,93]];
  for(const [t,x,y] of env) h += `<div class="env lv4" style="left:${x}%;top:${y}%">${t}</div>`;
  w.innerHTML = h;
}
const ZOOM_CAP = ["개체: 짱뚱어 한 마리","개체군: 같은 종(짱뚱어)의 무리","군집: 순천만의 모든 개체군","생태계: 군집 + 빛·물·온도·토양·공기"];
const HOOKS = {
  zoom(step){
    const lv = Math.min(step + 1, 4);
    $("zoom-world").className = "zoom-world L" + lv;
    $("zoom-wrap").className = "zoom-wrap L" + lv;
    $("zoom-cap").textContent = ZOOM_CAP[lv-1];
    document.querySelectorAll(".zlv").forEach(z => { const n = +z.dataset.lv; z.classList.toggle("on", n <= lv); z.classList.toggle("cur", n === lv); });
    $("zoom-sum").style.opacity = step >= 4 ? 1 : 0;
  },
  web(step){
    WEB.removed = step >= 1; WEB.sel = null;
    paintWeb();
    $("web-c1").style.opacity = step >= 2 ? 1 : 0;
    $("web-c2").style.opacity = step >= 3 ? 1 : 0;
  },
  balance(step){
    // 단계별 개체수(밑변 폭 %): [알락꼬리마도요, 칠게, 규조류]. 평소에는 34·67·100 → 세 단이 하나의 삼각형으로 이어짐
    const W = [[34,67,100],[34,88,100],[50,88,76],[50,52,76],[34,52,100],[34,67,100]];
    const AR = [["","",""],["","▲",""],["▲","","▼"],["","▼",""],["▼","","▲"],["","",""]];
    const s = Math.min(step, 5);
    [3,2,1].forEach((lv,k) => {
      const b = $("bal-"+lv), w = W[s][k], t = Math.max(w - 33, 1);   // 윗변 = 밑변 - 33 → 옆면 기울기가 늘 같음
      b.style.clipPath = `polygon(${50-t/2}% 0,${50+t/2}% 0,${50+w/2}% 100%,${50-w/2}% 100%)`;
      b.innerHTML = AR[s][k] ? `<span class="ar">${AR[s][k]}</span>` : "";
      // 개체수가 바뀐 단은 잠깐 밝게 빛나서 눈에 띄게
      if(b.dataset.w && +b.dataset.w !== w){ b.classList.remove("chg"); void b.offsetWidth; b.classList.add("chg"); }
      b.dataset.w = w;
    });
    document.querySelectorAll(".bal-step").forEach(e => { const n = +e.dataset.bs; e.classList.toggle("on", n <= s); e.classList.toggle("cur", n === s); });
  },
  human(step){
    const on = step >= 3;
    $("cc-b1").style.height = on ? "2%" : "0";
    $("cc-b2").style.height = on ? "100%" : "0";
    countUp($("cc-v1"), on ? 75 : 0, "마리");
    countUp($("cc-v2"), on ? 8600 : 0, "마리", "약 ");
  }
};
function countUp(el, to, unit, prefix){
  const from = 0, t0 = performance.now(), dur = 1600;
  if(el._raf) cancelAnimationFrame(el._raf);
  const f = now => {
    const k = Math.min(1, (now - t0) / dur), e = 1 - Math.pow(1 - k, 3);
    el.textContent = (to ? (prefix||"") : "") + Math.round(from + (to - from) * e).toLocaleString() + (unit||"");
    if(k < 1) el._raf = requestAnimationFrame(f);
  };
  el._raf = requestAnimationFrame(f);
}

// ---------- 먹이그물 ----------
const WEB = { sel:null, removed:false,
  nodes:{
    top:   {t:"🐾 삵·수달", x:500, y:62,  lv:"최종 소비자", c:"#7c3aed"},
    spoon: {t:"🐦 저어새", x:190, y:195, lv:"2차 소비자", c:"#ea580c"},
    curlew:{t:"🐦 알락꼬리마도요", x:500, y:195, lv:"2차 소비자", c:"#ea580c"},
    gull:  {t:"🕊️ 검은머리갈매기", x:810, y:195, lv:"2차 소비자", c:"#ea580c"},
    mud:   {t:"🐟 짱뚱어", x:180, y:345, lv:"1차 소비자", c:"#ca8a04"},
    crab:  {t:"🦀 칠게·농게", x:500, y:345, lv:"1차 소비자", c:"#ca8a04"},
    worm:  {t:"〰️ 갯지렁이", x:800, y:345, lv:"1차 소비자", c:"#ca8a04"},
    diatom:{t:"🟤 규조류(미세조류)", x:300, y:490, lv:"생산자", c:"#15803d"},
    reed:  {t:"🌾 갈대·칠면초(찌꺼기)", x:650, y:490, lv:"생산자", c:"#15803d"},
    bact:  {t:"🦠 세균", x:890, y:490, lv:"분해자", c:"#8b6b4a"}
  },
  // [먹히는 것, 먹는 것]
  edges:[["diatom","mud"],["diatom","crab"],["reed","crab"],["reed","worm"],["diatom","worm"],
         ["mud","spoon"],["crab","spoon"],["crab","curlew"],["worm","curlew"],["crab","gull"],
         ["spoon","top"],["curlew","top"],["gull","top"],["mud","top"]],
  dec:[["bact","reed"]]
};
function buildWeb(){
  const svg = $("foodweb"), N = WEB.nodes;
  const box = n => ({w: n.t.length * 21 + 34, h: 52});
  let h = `<defs><marker id="wa" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M0,0 L10,5 L0,10 z" fill="#8a9a98"/></marker>
    <marker id="wa-g" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto"><path d="M0,0 L10,5 L0,10 z" fill="#16a34a"/></marker>
    <marker id="wa-o" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto"><path d="M0,0 L10,5 L0,10 z" fill="#ea580c"/></marker>
    <marker id="wa2" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M0,0 L10,5 L0,10 z" fill="#8b6b4a"/></marker></defs>`;
  WEB.edges.forEach(([a,b],i) => {
    const A = N[a], B = N[b];
    const x1 = A.x, y1 = A.y - 26, x2 = B.x, y2 = B.y + 30;
    const mx = (x1+x2)/2 + (x2 > x1 ? -18 : 18), my = (y1+y2)/2;
    h += `<path class="web-edge" data-from="${a}" data-to="${b}" d="M${x1},${y1} Q${mx},${my} ${x2},${y2}" marker-end="url(#wa)"/>`;
  });
  h += `<path class="web-edge dec" d="M${N.bact.x - 60},${N.bact.y} L${N.reed.x + 150},${N.reed.y}" marker-end="url(#wa2)"/>`;
  h += `<text x="${N.bact.x + 70}" y="${N.bact.y + 50}" text-anchor="end" font-size="16" font-weight="600" fill="#8b6b4a">모든 단계의 사체·배설물 → 무기물</text>`;
  Object.entries(N).forEach(([id,n]) => {
    const b = box(n);
    h += `<g class="web-node" data-id="${id}"><rect x="${n.x - b.w/2}" y="${n.y - b.h/2}" width="${b.w}" height="${b.h}" rx="14" stroke="${n.c}"/>
      <text x="${n.x}" y="${n.y + 8}" text-anchor="middle" font-size="22" fill="#1d1d1f">${n.t}</text></g>`;
  });
  svg.innerHTML = h;
  svg.querySelectorAll(".web-node").forEach(g => g.onclick = () => { const id = g.dataset.id; WEB.sel = WEB.sel === id ? null : id; paintWeb(); });
  $("web-remove").onclick = () => { WEB.removed = !WEB.removed; WEB.sel = null; paintWeb(); };
  $("web-reset").onclick = () => { WEB.removed = false; WEB.sel = null; paintWeb(); };
}
function paintWeb(){
  const svg = $("foodweb"), N = WEB.nodes, sel = WEB.sel, rem = WEB.removed;
  const edges = [...svg.querySelectorAll(".web-edge[data-from]")];
  const linked = new Set();
  edges.forEach(e => {
    const f = e.dataset.from, t = e.dataset.to;
    e.classList.remove("in","out","dim","gone");
    if(rem && (f === "crab" || t === "crab")){ e.classList.add("gone"); return; }
    if(sel){
      if(t === sel){ e.classList.add("in"); linked.add(f); }
      else if(f === sel){ e.classList.add("out"); linked.add(t); }
      else e.classList.add("dim");
    }else if(rem && ((f === "worm" && t === "curlew") || (f === "mud" && t === "spoon"))) e.classList.add("in");
  });
  svg.querySelectorAll(".web-node").forEach(g => {
    const id = g.dataset.id;
    g.classList.toggle("gone", rem && id === "crab");
    g.classList.toggle("sel", id === sel);
    g.classList.toggle("dim", !!sel && id !== sel && !linked.has(id));
  });
  const info = $("web-info");
  if(sel){
    const eats = WEB.edges.filter(([a,b]) => b === sel && !(rem && a === "crab")).map(([a]) => N[a].t.replace(/^\S+\s/,""));
    const eaten = WEB.edges.filter(([a,b]) => a === sel && !(rem && b === "crab")).map(([,b]) => N[b].t.replace(/^\S+\s/,""));
    info.innerHTML = `<span class="ic">${N[sel].t.split(" ")[0]}</span><div><b>${N[sel].t.replace(/^\S+\s/,"")}</b> (${N[sel].lv})<br>
      <span style="color:#16a34a;font-weight:600">먹는 것:</span> ${eats.length ? eats.join(", ") : (sel === "bact" ? "모든 단계의 사체·배설물" : "— (스스로 양분을 만듦)")}<br>
      <span style="color:#ea580c;font-weight:600">먹히는 곳:</span> ${eaten.length ? eaten.join(", ") : "—"}</div>`;
  }else if(rem){
    info.innerHTML = `<span class="ic">🦀</span><div>칠게가 줄어도…<br><b style="color:#16a34a">알락꼬리마도요 ← 갯지렁이</b><br><b style="color:#16a34a">저어새 ← 짱뚱어</b><br>다른 먹이가 남아 있어요!</div>`;
  }else{
    info.innerHTML = `<span class="ic">👆</span><div>생물을 누르면 <b style="color:#16a34a">먹는 것</b>과 <b style="color:#ea580c">먹히는 곳</b>이 표시돼요.</div>`;
  }
}

// ---------- 생태피라미드 ----------
const PYR = {
  4:["최종 소비자", ["🐾 삵","🦦 수달"]],
  3:["2차 소비자", ["🐦 도요새","🐦 저어새"]],
  2:["1차 소비자", ["🦀 칠게","🐟 짱뚱어","🐦 흑두루미"]],
  1:["생산자", ["🟤 규조류","🌾 갈대","🌿 칠면초"]]
};
function initPyramid(){
  document.querySelectorAll("#pyr .lvl").forEach(l => l.onclick = () => {
    document.querySelectorAll("#pyr .lvl").forEach(x => x.classList.toggle("sel", x === l));
    const [name, list] = PYR[l.dataset.lv];
    $("pyr-info").innerHTML = `<b>${name}</b><div class="chips">${list.map(s => `<span class="chip">${s}</span>`).join("")}</div>`;
  });
}
// ============================================================
// 게임식 퀴즈 (선생님이 한 문항씩 진행)
//  ready(문제만 보임) → live(학생 핸드폰에 열림, 실시간 선택 수) → closed(마감)
//  → reveal(정답은 밝게, 오답은 어둡게) → mvp(가장 빨리 맞힌 친구) → 다음 문항
// ============================================================
const curSet = () => QUIZ[T.quizSet];
const curQ = () => curSet().items[T.qi[T.quizSet]];
function stageOf(q){
  if(T.qstage[q.id]) return T.qstage[q.id];
  return (T.live.revealed || []).includes(q.id) ? "reveal" : "ready";
}
function renderQuiz(){
  const set = curSet(), i = T.qi[T.quizSet], q = curQ(), st = stageOf(q);
  const n = q.options.length, revealed = st === "reveal" || st === "mvp";
  const dots = set.items.map((x,k) => `<i class="${k===i?"cur":((T.live.revealed||[]).includes(x.id)?"done":"")}"></i>`).join("");
  const tiles = q.options.map((o,k) => {
    const cls = revealed ? (k === q.answer ? "right" : "wrong") : "";
    return `<div class="g-tile c${optColor(q,k)} ${cls}"><div class="fill" id="gq-f${k}"></div>
      <div class="top"><span class="shape">${SHAPES[k]}</span><span>${esc(o)}</span></div>
      <div class="cnt" id="gq-c${k}">0<small>명</small></div></div>`;
  }).join("");
  $("tv-quiz").innerHTML = `
    <div class="g-head">
      <span class="g-set">🎮 ${set.title} · ${set.sub}</span>
      <span class="g-qno">${i+1} / ${set.items.length}</span>
      <div class="g-dots">${dots}</div>
      <span class="g-spacer"></span>
      <button class="g-btn small" id="gq-eye">${T.showCounts ? "👁 선택 수 보이기" : "🙈 선택 수 숨기기"}</button>
      <button class="g-btn small" id="gq-redo" title="이 문항의 답을 지우고 다시 진행">↺ 다시</button>
      <button class="g-btn small" id="gq-board">🏆 중간 순위</button>
    </div>
    <div class="g-main">
      <div class="g-qcol">
        <div class="g-q"><span>${q.text}</span></div>
        <div class="g-tiles-wrap">
          <div class="g-tiles ${q.type==="ox"?"ox":""} ${n===3?"n3":""}" id="gq-tiles">${tiles}</div>
          ${st === "ready" ? `<div class="g-ready"><div>▶ 시작을 누르면 핸드폰에 문제가 열려요<small>제한 시간 ${q.limit}초 · 빨리 맞힐수록 점수 UP</small></div></div>` : ""}
        </div>
        ${revealed ? `<div class="g-explain">💡 ${q.explain}</div>` : ""}
      </div>
      <div class="g-side">
        <div class="g-timer" id="gq-timer"><svg viewBox="0 0 120 120"><circle class="bg" cx="60" cy="60" r="52"/><circle class="fg" id="gq-ring" cx="60" cy="60" r="52" stroke-dasharray="326.7" stroke-dashoffset="${st==="ready"?0:326.7}"/></svg><div class="num" id="gq-num">${st==="ready"?q.limit:(st==="live"?"":"끝")}</div></div>
        <div class="g-answered"><div class="n" id="gq-ans">0</div><div class="t">/ <span id="gq-tot">0</span>명 응답</div><div class="bar"><i id="gq-bar"></i></div></div>
        <div class="g-status" id="gq-status"></div>
      </div>
    </div>
    <div class="g-foot">
      <button class="g-btn" id="gq-prev" ${i===0?"disabled":""}>◀ 이전 문제</button>
      <span class="g-spacer"></span>
      <button class="g-btn main" id="gq-main"></button>
    </div>`;
  $("gq-eye").onclick = () => { T.showCounts = !T.showCounts; pref.set("showCounts", T.showCounts?"1":"0"); renderQuiz(); };
  $("gq-redo").onclick = redoQ;
  $("gq-board").onclick = () => { T.rankMode = "board"; switchTab("rank"); };
  $("gq-prev").onclick = prevQ;
  $("gq-main").onclick = quizMain;
  T.lastCounts = {};
  paintQuizMain();
  updateQuizCounts(true);
  if(st === "mvp") showMvp(true);
}
function paintQuizMain(){
  const q = curQ(), st = stageOf(q), b = $("gq-main"); if(!b) return;
  const last = T.qi[T.quizSet] === curSet().items.length - 1;
  const L = { ready:["▶ 시작","go"], live:["⏹ 마감","stop"], closed:["💡 정답 공개",""], reveal:["⚡ MVP 보기",""],
              mvp:[last ? "🏆 중간 순위 보기" : "다음 문제 ▶", "go"] }[st];
  b.textContent = L[0]; b.className = "g-btn main " + L[1];
  const s = $("gq-status");
  if(s) s.textContent = {ready:"준비", live:"학생들이 고르는 중!", closed:"마감! 정답을 공개할까요?", reveal:"정답 공개", mvp:"MVP 발표"}[st];
}
function quizMain(){
  const st = stageOf(curQ());
  if(st === "ready") startQ();
  else if(st === "live") closeQ();
  else if(st === "closed") revealQ();
  else if(st === "reveal") showMvp();
  else nextQ();
}
function startQ(){
  const q = curQ();
  T.qstage[q.id] = "live"; T.qStart = Date.now(); T.autoClosing = false;
  pushLive({phase:"question", qid:q.id, limit:q.limit, startedAt:T.qStart, mvp:[], tab:curSet().title + " 진행 중"});
  SND.start();
  renderQuiz();
  const wrap = document.querySelector(".g-tiles-wrap");
  if(wrap){ const c = document.createElement("div"); c.className = "g-count3"; c.innerHTML = "<span>GO!</span>"; wrap.appendChild(c); setTimeout(() => c.remove(), 900); }
  let lastSec = q.limit;
  clearInterval(T.timer);
  T.timer = setInterval(() => {
    const left = q.limit - (Date.now() - T.qStart) / 1000;
    const ring = $("gq-ring"), num = $("gq-num"), tm = $("gq-timer");
    if(ring){ ring.style.strokeDashoffset = 326.7 * (1 - Math.max(0,left) / q.limit); num.textContent = Math.max(0, Math.ceil(left)); tm.classList.toggle("urgent", left <= 5); }
    const sec = Math.ceil(left);
    if(sec !== lastSec){ lastSec = sec; if(sec <= 5 && sec > 0) SND.tick(); }
    if(left <= 0) closeQ();
  }, 100);
  if(T.bots) botsAnswer(q);
}
function closeQ(){
  const q = curQ();
  clearInterval(T.timer); T.timer = 0;
  if(stageOf(q) !== "live") return;
  T.qstage[q.id] = "closed";
  pushLive({phase:"closed", qid:q.id});
  SND.end();
  const ring = $("gq-ring"); if(ring) ring.style.strokeDashoffset = 326.7;
  const num = $("gq-num"); if(num) num.textContent = "끝";
  const tm = $("gq-timer"); if(tm) tm.classList.remove("urgent");
  paintQuizMain(); updateQuizCounts();
}
async function revealQ(){
  const q = curQ();
  await refreshData();
  T.qstage[q.id] = "reveal";
  const rev = [...new Set([...(T.live.revealed||[]), q.id])];
  pushLive({phase:"reveal", qid:q.id, revealed:rev, mvp:[]});
  SND.reveal();
  renderQuiz();
}
function qAnswers(q){
  const lim = q.limit * 1000 + 1500;
  return T.answers.filter(a => a.qid === q.id && (Number(a.ms) || 0) <= lim);
}
function showMvp(silent){
  const q = curQ();
  const rows = qAnswers(q);
  const top = fastestCorrect(q, rows, 3);
  const right = rows.filter(a => pointsFor(q,a) > 0).length;
  T.qstage[q.id] = "mvp";
  if(!silent){ pushLive({mvp: top.map(a => a.num)}); SND.fanfare(); if(top.length) confetti(180); }
  paintQuizMain();
  const medals = ["🥇","🥈","🥉"];
  const order = top.length === 3 ? [1,0,2] : top.length === 2 ? [1,0] : [0];
  const cards = top.length ? order.map((k,j) => {
    const a = top[k];
    return `<div class="mvp-card ${k===0?"first":""}" style="animation-delay:${0.25 + (k===0?0.6:j*0.25)}s">
      <div class="medal">${medals[k]}</div><div class="nm">${esc(dispName(a.name))}</div>
      <div class="meta">${(a.ms/1000).toFixed(1)}초 · +${pointsFor(q,a)}점</div></div>`;
  }).join("") : `<div class="mvp-card first" style="animation-delay:.2s"><div class="medal">😮</div><div class="nm" style="font-size:2rem">정답자가 없어요!</div><div class="meta">다음 문제에서 도전!</div></div>`;
  const ov = document.createElement("div");
  ov.className = "mvp-ov"; ov.id = "mvp-ov";
  ov.innerHTML = `<h2>⚡ 이번 문제 MVP</h2><div class="sub">정답을 가장 빨리 맞힌 친구</div>
    <div class="mvp-cards">${cards}</div>
    <div class="mvp-stats"><span>✅ 정답률 ${rows.length ? Math.round(right/rows.length*100) : 0}% (${right}/${rows.length}명)</span><span>👥 응답 ${rows.length}명</span></div>
    <div class="sub" style="font-size:1rem">화면을 누르면 닫혀요</div>`;
  ov.onclick = () => ov.remove();
  const old = $("mvp-ov"); if(old) old.remove();
  $("tv-quiz").appendChild(ov);
}
function nextQ(){
  const set = curSet();
  const o = $("mvp-ov"); if(o) o.remove();
  if(T.qi[T.quizSet] < set.items.length - 1){
    T.qi[T.quizSet]++;
    pushLive({phase:"wait", mvp:[], tab:set.title + " · 다음 문제 준비 중"});
    renderQuiz();
  }else{
    T.rankMode = "board"; switchTab("rank");
  }
}
function prevQ(){
  if(T.qi[T.quizSet] === 0) return;
  clearInterval(T.timer); T.timer = 0;
  const q = curQ(); if(stageOf(q) === "live") T.qstage[q.id] = "closed";
  T.qi[T.quizSet]--;
  const p = curQ(); if(T.qstage[p.id] === "mvp") T.qstage[p.id] = "reveal";
  renderQuiz();
}
async function redoQ(){
  const q = curQ();
  if(!confirm(`이 문항(${T.qi[T.quizSet]+1}번)의 학생 답을 모두 지우고 처음부터 다시 진행할까요?`)) return;
  clearInterval(T.timer); T.timer = 0;
  try{ await DB.drop("lesson_answers", {lesson_id:LESSON_ID, cls:T.cls, qid:q.id}); }catch(e){ toast("지우지 못했어요."); }
  delete T.qstage[q.id];
  pushLive({phase:"wait", revealed:(T.live.revealed||[]).filter(x => x !== q.id), mvp:[]});
  await refreshData(); renderQuiz();
}
function updateQuizCounts(first){
  const q = curQ(); if(!q || !$("gq-tiles")) return;
  const st = stageOf(q), rows = qAnswers(q);
  const counts = q.options.map((_,k) => rows.filter(a => Number(a.answer) === k).length);
  const total = Math.max(T.players.length, rows.length);
  $("gq-ans").textContent = rows.length; $("gq-tot").textContent = total;
  $("gq-bar").style.width = (total ? rows.length / total * 100 : 0) + "%";
  $("gq-tiles").classList.toggle("hidecount", (!T.showCounts && st === "live") || st === "ready");
  counts.forEach((c,k) => {
    const el = $("gq-c"+k), f = $("gq-f"+k); if(!el) return;
    el.innerHTML = c + "<small>명</small>";
    f.style.height = (rows.length ? c / rows.length * 100 : 0) + "%";
    if(!first && c > (T.lastCounts[k] || 0)){ el.classList.remove("bump"); void el.offsetWidth; el.classList.add("bump"); if(st === "live") SND.pop(); }
    T.lastCounts[k] = c;
  });
  // 접속한 학생이 모두 답하면 1.2초 뒤 자동 마감
  if(st === "live" && T.players.length > 0 && rows.length >= T.players.length && !T.autoClosing){
    T.autoClosing = true;
    setTimeout(() => { if(stageOf(curQ()) === "live" && curQ().id === q.id) closeQ(); }, 1200);
  }
}

// ============================================================
// 순위 · 시상식
// ============================================================
function enterRank(){
  if(T.rankMode === "award") pushLive({phase:"award", awardStep:T.awardStep, tab:"시상식"});
  else pushLive({phase:"board", tab:"중간 순위"});
  renderRank();
}
function renderRank(){ if(T.rankMode === "award") renderAward(); else renderBoard(); }
function renderBoard(){
  const rev = T.live.revealed || [];
  const lb = leaderboard(T.players, T.answers, rev);
  const prevRev = rev.slice(0, -1);
  const before = leaderboard(T.players, T.answers, prevRev);
  const posBefore = new Map(before.map((r,i) => [r.num, i+1]));
  let rocket = null;
  if(prevRev.length) lb.forEach((r,i) => { const up = (posBefore.get(r.num) || lb.length) - (i+1); if(up >= 2 && (!rocket || up > rocket.up)) rocket = {r, up, from:posBefore.get(r.num), to:i+1}; });
  const top = lb.slice(0, 5), max = Math.max(1, ...top.map(r => r.score));
  $("tv-rank").innerHTML = `
    <div class="rank-title"><h2>🏆 중간 순위</h2><p>지금까지 ${rev.length}문항 · 참가 ${lb.length}명 · 맞히면 500점 + 빠르기 보너스</p></div>
    ${rocket ? `<div class="rocket">🚀 순위 급상승 · ${esc(dispName(rocket.r.name))} (${rocket.from}위 → ${rocket.to}위)</div>` : ""}
    ${top.length && rev.length ? `<div class="rank-list">${top.map((r,i) => `
      <div class="rk r${i+1}" style="animation-delay:${(top.length - i) * 0.18}s">
        <div class="no">${i+1}</div>
        <div class="bar"><i data-w="${r.score / max * 100}"></i><span>${esc(dispName(r.name))}<span class="up">${r.correct}문제 정답</span></span></div>
        <div class="pt" data-to="${r.score}">0</div>
      </div>`).join("")}</div>` : `<div class="rank-empty">아직 정답이 공개된 문제가 없어요.</div>`}
    <div class="g-foot"><button class="g-btn" id="rk-back">◀ 퀴즈로</button><span class="g-spacer"></span>
      <button class="g-btn" id="rk-refresh">🔄 다시 계산</button><button class="g-btn main" id="rk-award">🎉 시상식 시작</button></div>`;
  setTimeout(() => {
    document.querySelectorAll("#tv-rank .rk .bar i").forEach(i => i.style.width = i.dataset.w + "%");
    document.querySelectorAll("#tv-rank .rk .pt").forEach(el => countUp(el, +el.dataset.to, "점"));
  }, 400);
  if(top.length && rev.length) SND.reveal();
  $("rk-back").onclick = () => switchTab(T.quizSet === "B" ? "qB" : "qA");
  $("rk-refresh").onclick = async () => { await refreshData(); renderBoard(); };
  $("rk-award").onclick = () => { T.rankMode = "award"; T.awardStep = 0; enterRank(); };
}
function renderAward(){
  const lb = leaderboard(T.players, T.answers, T.live.revealed || []);
  const s = T.awardStep;
  const essayMvp = T.live.essayMvp || {};
  const pd = (k, cls) => {
    const r = lb[k];
    return `<div class="pd ${cls} ${s >= 3 - k ? "on" : ""}">
      <div class="who"><div class="medal">${["🥇","🥈","🥉"][k]}</div><div class="nm">${r ? esc(dispName(r.name)) : "—"}</div><div class="pt">${r ? r.score.toLocaleString() + "점" : ""}</div></div>
      <div class="block">${k+1}</div></div>`;
  };
  const emCards = [];
  ESSAYS.forEach(e => (essayMvp[e.id] || []).forEach(num => {
    const a = T.answers.find(x => x.qid === e.id && x.num === num);
    const pl = T.players.find(x => x.num === num);
    if(a) emCards.push(`<div class="em-card" style="animation-delay:${0.2 + emCards.length * 0.3}s"><div class="h"><span>✍️ ${esc(dispName((pl||a).name))}</span><small>${esc(e.title.split(".")[0])}</small></div><p>${esc(a.answer)}</p></div>`);
  }));
  $("tv-rank").innerHTML = s < 4 ? `
    <div class="rank-title"><h2>🎉 오늘의 퀴즈 MVP</h2><p>${["두근두근… 누가 시상대에 오를까요? 🥁","3위 발표!","2위 발표!","1위 발표!"][s]}</p></div>
    <div class="podium">${pd(1,"p2")}${pd(0,"p1")}${pd(2,"p3")}</div>
    <div class="g-foot"><button class="g-btn" id="aw-board">◀ 중간 순위</button><span class="g-spacer"></span><button class="g-btn main" id="aw-next">${["3위 공개","2위 공개","1위 공개","✍️ 서술 MVP"][s]}</button></div>`
  : `
    <div class="rank-title"><h2>✍️ 서술 MVP</h2><p>순천만의 미래를 가장 잘 생각한 친구</p></div>
    <div class="essay-mvp">${emCards.length ? emCards.join("") : `<div class="rank-empty">확장질문 탭에서 ⭐로 서술 MVP를 골라 주세요.</div>`}</div>
    <div class="g-foot"><button class="g-btn" id="aw-board">◀ 시상대</button><span class="g-spacer"></span><button class="g-btn main" id="aw-next">🎊 수고했어요!</button></div>`;
  $("aw-board").onclick = () => { if(s >= 4){ T.awardStep = 3; enterRank(); } else { T.rankMode = "board"; enterRank(); } };
  $("aw-next").onclick = awardNext;
}
function awardNext(){
  if(T.awardStep < 4){ T.awardStep++; pushLive({phase:"award", awardStep:T.awardStep}); renderAward(); }
  else confetti(240);
  if(T.awardStep === 3){ SND.fanfare(); confetti(260); }
  else if(T.awardStep === 4){ SND.fanfare(); confetti(160); }
  else SND.reveal();
}

// ============================================================
// 확장질문 (서술형)
// ============================================================
function renderEssayView(fromData){
  const sec = $("tv-essay");
  const open = T.live.phase === "essay";
  const e = ESSAYS.find(x => x.id === T.essaySel);
  const rows = T.answers.filter(a => a.qid === e.id).sort((a,b) => String(a.updated).localeCompare(String(b.updated)));
  const mvp = (T.live.essayMvp || {})[e.id] || [];
  if(fromData && sec._sig === rows.length + "|" + rows.map(r => r.updated).join()) return;
  sec._sig = rows.length + "|" + rows.map(r => r.updated).join();
  sec.innerHTML = `
    <div class="essay-head"><h2>✍ 확장질문 — 순천만의 미래</h2>
      <button class="btn ${open?"warn":""}" id="es-open">${open ? "⏹ 학생 화면 닫기" : "📱 학생 화면에 열기"}</button>
      <button class="btn soft" id="es-model">${T.showModel ? "예시 답안 숨기기" : "📋 예시 답안 보기"}</button></div>
    <div class="essay-prompts">${ESSAYS.map(x => `<div class="ep ${x.id===e.id?"cur":""}" data-id="${x.id}"><h3>${esc(x.title)}</h3><p>${x.prompt}</p>
      <div class="cnt">📨 ${T.answers.filter(a => a.qid === x.id).length} / ${T.players.length}명 제출 · ⭐ ${((T.live.essayMvp||{})[x.id]||[]).length}명</div></div>`).join("")}</div>
    ${T.showModel ? `<div class="model-ans"><h4>예시 답안 (채점 포인트)</h4><ul>${e.model.map(m => `<li>${m}</li>`).join("")}</ul></div>` : ""}
    <div class="essay-cards">${rows.length ? rows.map((a,k) => `
      <div class="ec ${mvp.includes(a.num)?"mvp":""}" data-k="${k}"><div class="who">학생 ${k+1}</div>${esc(a.answer)}
        <button class="star" data-num="${esc(a.num)}">${mvp.includes(a.num) ? "⭐ MVP" : "☆ MVP"}</button></div>`).join("")
      : `<p style="color:var(--muted);font-size:1.2rem">아직 제출한 학생이 없어요. ${open ? "학생들이 쓰는 중이에요…" : "[📱 학생 화면에 열기]를 눌러 주세요."}</p>`}</div>`;
  $("es-open").onclick = () => { pushLive(open ? {phase:"wait", tab:"확장질문 정리"} : {phase:"essay", tab:"확장질문"}); sec._sig = ""; renderEssayView(); if(!open && T.bots) botsEssay(); };
  $("es-model").onclick = () => { T.showModel = !T.showModel; sec._sig = ""; renderEssayView(); };
  sec.querySelectorAll(".ep").forEach(d => d.onclick = () => { T.essaySel = d.dataset.id; sec._sig = ""; renderEssayView(); });
  sec.querySelectorAll(".ec").forEach(d => d.onclick = ev => {
    if(ev.target.classList.contains("star")) return;
    $("spot-text").textContent = rows[+d.dataset.k].answer; $("spot").classList.remove("hidden");
  });
  sec.querySelectorAll(".ec .star").forEach(b => b.onclick = () => {
    const all = Object.assign({}, T.live.essayMvp || {});
    let list = [...(all[e.id] || [])];
    const num = b.dataset.num;
    if(list.includes(num)) list = list.filter(x => x !== num);
    else { if(list.length >= 2){ toast("서술 MVP는 문항마다 2명까지 고를 수 있어요."); return; } list.push(num); }
    all[e.id] = list; pushLive({essayMvp:all}); sec._sig = ""; renderEssayView();
  });
}
$("spot").onclick = () => $("spot").classList.add("hidden");

// ============================================================
// 진행 상황 · 기록 내려받기 · 초기화
// ============================================================
function renderProgress(){
  const rev = T.live.revealed || [];
  const lb = leaderboard(T.players, T.answers, rev);
  const rank = new Map(lb.map((r,i) => [r.num, i+1]));
  const cnt = (num, ids) => T.answers.filter(a => a.num === num && ids.includes(a.qid)).length;
  const A = QUIZ.A.items.map(q => q.id), B = QUIZ.B.items.map(q => q.id), E = ESSAYS.map(e => e.id);
  const score = new Map(lb.map(r => [r.num, r]));
  $("tv-progress").innerHTML = `
    ${T.dataErr ? `<div class="setup-warn">⚠️ 기록을 불러오지 못했어요. Supabase 대시보드 › SQL Editor에서 <b>supabase-setup.sql</b>을 한 번 실행했는지, 프로젝트가 일시 정지되지 않았는지 확인해 주세요.<br><small>${esc(T.dataErr.message || T.dataErr)}</small></div>` : ""}
    <div class="prog-head"><h2>📋 ${esc(T.cls)} 진행 상황 · 접속 ${T.players.length}명</h2>
      <button class="btn" id="pg-csv">📥 기록 내려받기(엑셀)</button>
      ${DB.demo ? `<button class="btn gold" id="pg-bots">🤖 가상 학생 24명 입장</button>` : ""}
      <button class="btn warn" id="pg-reset">🗑 이 반 기록 지우기</button></div>
    <table class="ptable"><thead><tr><th>순위</th><th>학번</th><th>이름</th><th>퀴즈 1</th><th>퀴즈 2</th><th>확장질문</th><th>정답</th><th>점수</th></tr></thead>
    <tbody>${T.players.map(p => { const s = score.get(p.num) || {score:0, correct:0}; return `<tr>
      <td>${rank.get(p.num) || "-"}</td><td>${esc(p.num)}</td><td class="l">${esc(p.name)}</td>
      <td>${cnt(p.num,A)} / ${A.length}</td><td>${cnt(p.num,B)} / ${B.length}</td>
      <td class="${cnt(p.num,E)===E.length?"on":""}">${cnt(p.num,E)} / ${E.length}</td>
      <td>${s.correct}</td><td><b>${s.score.toLocaleString()}</b></td></tr>`; }).join("") || `<tr><td colspan="8" class="off">아직 접속한 학생이 없어요.</td></tr>`}</tbody></table>
    <p class="prog-note">· 점수는 <b>정답을 공개한 문항</b>만 계산해요 (맞히면 500점 + 빠르기 보너스 최대 500점).<br>
      · 학생이 나갔다 들어와도 같은 반·학번·이름이면 이어서 풀 수 있어요.<br>
      · 수업이 끝나면 [📥 기록 내려받기]로 학생 답(서술형 포함)을 저장해 두세요.</p>`;
  $("pg-csv").onclick = downloadCsv;
  $("pg-reset").onclick = resetClass;
  if($("pg-bots")) $("pg-bots").onclick = addBots;
}
function downloadCsv(){
  const rev = T.live.revealed || [];
  const lb = leaderboard(T.players, T.answers, rev);
  const rank = new Map(lb.map((r,i) => [r.num, [i+1, r.score]]));
  const head = ["반","학번","이름"];
  ALL_Q.forEach(q => head.push(`${q.id} 답`, `${q.id} 정오`, `${q.id} 걸린 시간(초)`));
  head.push("총점","순위", ...ESSAYS.map(e => e.title));
  const lines = [head];
  T.players.forEach(p => {
    const row = [T.cls, p.num, p.name];
    ALL_Q.forEach(q => {
      const a = T.answers.find(x => x.qid === q.id && x.num === p.num);
      row.push(a ? optLabel(q, Number(a.answer)) : "", a ? (pointsFor(q,a) > 0 ? "O" : "X") : "", a ? (a.ms/1000).toFixed(1) : "");
    });
    const r = rank.get(p.num) || ["",0];
    row.push(r[1], r[0]);
    ESSAYS.forEach(e => { const a = T.answers.find(x => x.qid === e.id && x.num === p.num); row.push(a ? a.answer : ""); });
    lines.push(row);
  });
  const csv = "\uFEFF" + lines.map(r => r.map(c => `"${String(c).replace(/"/g,'""')}"`).join(",")).join("\r\n");
  const url = URL.createObjectURL(new Blob([csv], {type:"text/csv;charset=utf-8"}));
  const a = document.createElement("a"); a.href = url; a.download = `순천만생태계_${T.cls}_${new Date().toISOString().slice(0,10)}.csv`;
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 2000);
}
async function resetClass(){
  const v = prompt(`${T.cls}의 이 수업 기록(접속·답·점수)을 모두 지웁니다.\n계속하려면 '삭제'라고 입력하세요.`);
  if(v !== "삭제") return;
  try{
    await DB.drop("lesson_answers", {lesson_id:LESSON_ID, cls:T.cls});
    await DB.drop("lesson_players", {lesson_id:LESSON_ID, cls:T.cls});
  }catch(e){ toast("지우지 못했어요: " + (e.message || e)); }
  T.qstage = {}; T.qi = {A:0, B:0}; T.awardStep = 0; T.rankMode = "board"; T.bots = null; T.lastCounts = {};
  // resetAt이 바뀌면 학생 핸드폰도 풀던 답·점수·쓰던 글을 비우고 입장 화면으로 돌아간다. 입장은 다시 열어 둔다.
  await pushLive({phase:"wait", revealed:[], mvp:[], essayMvp:{}, qid:null, awardStep:0, tab:"수업 준비 중", listen:false, entry:true, resetAt:Date.now()});
  await refreshData(); renderProgress(); toast("지웠어요.");
}

// ============================================================
// 데모 모드 전용: 가상 학생 (리허설·화면 점검용)
// ============================================================
const BOT_NAMES = ["김민준","이서연","박도윤","최하은","정지호","강수아","조예준","윤지유","장시우","임서윤","한주원","오하린","서건우","신지민","권우진","황채원","안현우","송다은","류준서","전소율","홍유찬","고나윤","문태윤","양가은"];
async function addBots(){
  const no = parseInt(T.cls) || 1;
  T.bots = BOT_NAMES.map((name,i) => ({num:`1${String(no).padStart(2,"0")}${String(i+1).padStart(2,"0")}`, name, skill:0.45 + Math.random()*0.5}));
  for(const b of T.bots) await DB.upsert("lesson_players", {id:playerId(T.cls,b.num), lesson_id:LESSON_ID, cls:T.cls, num:b.num, name:b.name, seen:nowIso()});
  await refreshData(); toast("가상 학생 24명이 들어왔어요. 퀴즈를 시작하면 자동으로 답해요.");
}
function botsAnswer(q){
  T.bots.forEach(b => {
    const ms = Math.round(1200 + Math.random() * q.limit * 1000 * 0.75);
    setTimeout(() => {
      if(stageOf(q) !== "live") return;
      const right = Math.random() < b.skill;
      let ans = q.answer;
      if(!right){ const others = q.options.map((_,k) => k).filter(k => k !== q.answer); ans = others[Math.floor(Math.random()*others.length)]; }
      DB.upsert("lesson_answers", {id:answerId(T.cls,q.id,b.num), lesson_id:LESSON_ID, cls:T.cls, qid:q.id, num:b.num, name:b.name, answer:String(ans), ms, updated:nowIso()});
    }, ms);
  });
}
function botsEssay(){
  const sample = {
    e1:["흑두루미는 낟알을 먹는 1차 소비자라서 낟알이 없어지면 먹이가 부족해 순천만에 오는 흑두루미가 줄어든다.","농약이 흙과 물로 들어가면 갯벌 생물도 줄어들 수 있다.","먹이가 줄어서 다른 곳으로 떠날 것 같다."],
    e2:["반대한다. 갈대는 오염물질을 흡수해서 물을 깨끗하게 하는데 갈대밭이 줄면 물이 더러워진다.","갈대 찌꺼기를 먹는 게와 갯지렁이가 줄고 그걸 먹는 도요새도 줄어든다.","찬성한다. 대신 갈대밭이 아니라 도심 쪽에 주차장을 만들면 된다."]
  };
  T.bots.slice(0, 14).forEach((b,i) => ESSAYS.forEach(e => setTimeout(() => {
    DB.upsert("lesson_answers", {id:answerId(T.cls,e.id,b.num), lesson_id:LESSON_ID, cls:T.cls, qid:e.id, num:b.num, name:b.name, answer:sample[e.id][i % 3], ms:null, updated:nowIso()});
  }, 1500 + Math.random() * 6000)));
}

// ============================================================
// 도구: 포인터 · 소리 · 이름 가리기
// ============================================================
function initTools(){
  const paint = () => {
    $("tool-pointer").textContent = T.pointer ? "🖱 포인터 ON" : "🖱 포인터 OFF";
    $("tool-pointer").classList.toggle("on", T.pointer);
    $("tool-sound").textContent = T.sound ? "🔊 소리" : "🔇 소리";
    $("tool-sound").classList.toggle("on", T.sound);
    $("tool-mask").textContent = T.mask ? "👤 이름 가림" : "👤 이름 보임";
    $("tool-mask").classList.toggle("on", T.mask);
  };
  $("tool-pointer").onclick = () => { T.pointer = !T.pointer; pref.set("pointer", T.pointer?"1":"0"); paint(); $("tool-pointer").blur(); };
  $("tool-sound").onclick = () => { T.sound = !T.sound; pref.set("sound", T.sound?"1":"0"); paint(); $("tool-sound").blur(); };
  $("tool-mask").onclick = () => { T.mask = !T.mask; pref.set("mask", T.mask?"1":"0"); paint(); $("tool-mask").blur(); if(T.tab === "rank") renderRank(); };
  paint();
  $("tool-listen").onclick = () => {
    const on = !T.live.listen;
    pushLive({listen:on}); $("tool-listen").blur();
    toast(on ? "🎧 학생 핸드폰이 '수업 듣는 중' 화면으로 바뀌었어요" : "🎧 수업듣기를 껐어요");
  };
  $("tool-entry").onclick = () => {
    const open = T.live.entry === false;
    pushLive({entry:open}); $("tool-entry").blur();
    toast(open ? "🚪 입장을 열었어요" : "🔒 입장을 닫았어요 (이미 들어온 학생은 다시 들어올 수 있어요)");
  };
}
// [수업듣기!]·[입장가능!] 버튼 모양을 지금 반의 상태에 맞춘다
function paintGates(){
  const l = $("tool-listen"), e = $("tool-entry"), open = T.live.entry !== false;
  l.classList.toggle("on", !!T.live.listen);
  l.textContent = T.live.listen ? "🎧 수업듣기! ON" : "🎧 수업듣기!";
  e.classList.toggle("on", open); e.classList.toggle("off", !open);
  e.textContent = open ? "🚪 입장가능!" : "🔒 입장마감";
}
// PPT 포인터: 다음 = PageDown/→/↓/Space, 이전 = PageUp/←/↑, 화면 검게(B, .)는 무시
document.addEventListener("keydown", e => {
  if(!T.pointer || !T.cls || $("teacher-app").classList.contains("hidden")) return;
  const t = e.target; if(t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable)) return;
  const k = e.key;
  let act = null;
  if(["PageDown","ArrowRight","ArrowDown"," ","Spacebar"].includes(k)) act = "next";
  else if(["PageUp","ArrowLeft","ArrowUp"].includes(k)) act = "prev";
  else if(["b","B","."].includes(k)){ e.preventDefault(); return; }
  if(!act) return;
  e.preventDefault(); e.stopPropagation();
  if(!$("spot").classList.contains("hidden")){ $("spot").classList.add("hidden"); return; }
  const tab = T.tab;
  if(/^s\d$/.test(tab)) return act === "next" ? slideNext(tab) : slidePrev(tab);
  if(tab === "qA" || tab === "qB") return act === "next" ? quizMain() : prevQ();
  if(tab === "rank"){
    if(act === "next"){ if(T.rankMode === "board"){ T.rankMode = "award"; T.awardStep = 0; enterRank(); } else awardNext(); }
    else if(T.rankMode === "award"){ if(T.awardStep > 0){ T.awardStep--; pushLive({awardStep:T.awardStep}); renderAward(); } else { T.rankMode = "board"; enterRank(); } }
    return;
  }
  if(tab === "video") return act === "next" ? goNextTab() : switchTab("qr");
  if(act === "next" && tab === "qr") goNextTab();
}, true);

// ---------- 효과음 (파일 없이 브라우저에서 바로 만든 소리) ----------
const SND = (function(){
  let ctx = null, lastPop = 0;
  const c = () => ctx || (ctx = new (window.AudioContext || window.webkitAudioContext)());
  function tone(f, d, type, v, when){
    if(!T.sound) return;
    try{
      const a = c(), o = a.createOscillator(), g = a.createGain(), t0 = a.currentTime + (when||0);
      o.type = type || "sine"; o.frequency.value = f;
      g.gain.setValueAtTime(v || .12, t0); g.gain.exponentialRampToValueAtTime(.0001, t0 + d);
      o.connect(g); g.connect(a.destination); o.start(t0); o.stop(t0 + d + .03);
    }catch(e){}
  }
  return {
    tick(){ tone(880, .09, "square", .05); },
    start(){ [523,659,784,1047].forEach((f,i) => tone(f, .16, "triangle", .12, i*.08)); },
    end(){ tone(220, .4, "sawtooth", .07); tone(165, .5, "sawtooth", .06, .12); },
    reveal(){ [523,659,784,1047].forEach((f,i) => tone(f, .25, "triangle", .12, i*.1)); },
    fanfare(){ [784,784,784,1047,988,1047].forEach((f,i) => tone(f, i>=3 ? .35 : .12, "square", .06, i*.13)); },
    pop(){ const n = Date.now(); if(n - lastPop < 120) return; lastPop = n; tone(700 + Math.random()*300, .06, "sine", .05); }
  };
})();

// ---------- 색종이 ----------
const CONF = { parts:[], raf:0 };
function confetti(n){
  const cv = $("confetti"), ctx = cv.getContext("2d");
  cv.width = innerWidth; cv.height = innerHeight;
  const colors = ["#0071e3","#2997ff","#ff3b30","#ff9f0a","#34c759","#ffffff"];
  for(let i=0;i<(n||150);i++) CONF.parts.push({x:innerWidth*(0.2+Math.random()*0.6), y:innerHeight*0.35, vx:(Math.random()-.5)*16, vy:-Math.random()*16-4, s:6+Math.random()*8, c:colors[i%colors.length], r:Math.random()*6, vr:(Math.random()-.5)*.3, life:0});
  if(CONF.raf) return;
  const step = () => {
    ctx.clearRect(0,0,cv.width,cv.height);
    CONF.parts = CONF.parts.filter(p => p.y < cv.height + 40 && p.life < 260);
    for(const p of CONF.parts){
      p.vy += .38; p.vx *= .99; p.x += p.vx; p.y += p.vy; p.r += p.vr; p.life++;
      ctx.save(); ctx.translate(p.x,p.y); ctx.rotate(p.r); ctx.fillStyle = p.c; ctx.fillRect(-p.s/2,-p.s/3,p.s,p.s*.6); ctx.restore();
    }
    if(CONF.parts.length) CONF.raf = requestAnimationFrame(step); else { CONF.raf = 0; ctx.clearRect(0,0,cv.width,cv.height); }
  };
  CONF.raf = requestAnimationFrame(step);
}

// ============================================================
// 시작
// ============================================================
(function init(){
  if(DB.demo){ const d = document.createElement("div"); d.className = "demo-badge"; d.textContent = "데모 모드 · 이 컴퓨터 안에서만 연결"; document.body.appendChild(d); }
  if(PARAMS.has("t") || sess.get("teacher") === "1"){
    renderLogin();
    if(sess.get("teacher") === "1") openClassPicker(); else openPass();
    return;
  }
  const cls = idStore.get("sc:cls"), num = idStore.get("sc:num"), name = idStore.get("sc:name");
  if(cls && num && name){ Object.assign(S, {cls, num, name}); enterStudent(); }
  else renderLogin();
})();