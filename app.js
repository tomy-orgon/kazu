(() => {
'use strict';

// ===== 設定（ここをいじれば難易度が変わる） =====
const CFG = {
  order: ['1','2','3','4','5','6','7','8','9','10','0'], // 出題順（数字を足すならここと strokes.js）
  // 以下は数字の座標系(300x400)での値。ガイド線の太さが 26 なので、それを目安に。
  tol: 32,          // 線からどれだけ外れても進めるか。大きいほど甘い
  startTol: 46,     // 書き始めの丸の当たり判定
  strayLimit: 70,   // これ以上外れたら「はみ出し」とみなして進まない
  lookAhead: 2,     // 何個先までのチェックポイントを認めるか（小さいほど飛ばし書きできない）
  finishRatio: 0.97,// 何割たどれば完成扱いか
  cpStep: 16,       // チェックポイント間隔
  stepVB: 7,        // 指の動きを細かく拾う間隔（速く動かしても追いつくように）
  autoNext: false,  // true にすると書けたら自動で次の数字へ進む
};

const VB = window.VIEWBOX, SD = window.STROKES;
const $ = s => document.querySelector(s);
const cv = $('#board'), ctx = cv.getContext('2d');
const cfx = $('#confetti'), cfxc = cfx.getContext('2d');

// ===== 幾何 =====
function catmull(pts, samples = 14) {
  if (pts.length < 3) return pts.map(p => ({x:p[0], y:p[1]}));
  const p = [pts[0], ...pts, pts[pts.length-1]], out = [];
  for (let i = 0; i < p.length-3; i++) {
    const [p0,p1,p2,p3] = [p[i],p[i+1],p[i+2],p[i+3]];
    for (let s = 0; s < samples; s++) {
      const t = s/samples, t2 = t*t, t3 = t2*t;
      out.push({
        x: .5*((2*p1[0]) + (-p0[0]+p2[0])*t + (2*p0[0]-5*p1[0]+4*p2[0]-p3[0])*t2 + (-p0[0]+3*p1[0]-3*p2[0]+p3[0])*t3),
        y: .5*((2*p1[1]) + (-p0[1]+p2[1])*t + (2*p0[1]-5*p1[1]+4*p2[1]-p3[1])*t2 + (-p0[1]+3*p1[1]-3*p2[1]+p3[1])*t3)
      });
    }
  }
  out.push({x:pts[pts.length-1][0], y:pts[pts.length-1][1]});
  return out;
}
function resample(pts, step) {
  const out = [pts[0]]; let acc = 0;
  for (let i = 1; i < pts.length; i++) {
    const d = Math.hypot(pts[i].x-pts[i-1].x, pts[i].y-pts[i-1].y);
    acc += d;
    if (acc >= step) { out.push(pts[i]); acc = 0; }
  }
  const last = pts[pts.length-1];
  if (Math.hypot(last.x-out[out.length-1].x, last.y-out[out.length-1].y) > step*.4) out.push(last);
  return out;
}

// 数字ごとに dense（描画用）と cps（判定用）を用意
const SHAPES = {};
for (const k in SD) {
  SHAPES[k] = SD[k].map(st => {
    const dense = catmull(st);
    return { dense, cps: resample(dense, CFG.cpStep) };
  });
}

// ===== 画面座標 <-> viewBox座標 =====
let TR = {s:1, ox:0, oy:0, short:1};
function bbox(sh) {
  let x0=1e9, y0=1e9, x1=-1e9, y1=-1e9;
  sh.forEach(st => st.dense.forEach(p => {
    if (p.x<x0) x0=p.x; if (p.y<y0) y0=p.y; if (p.x>x1) x1=p.x; if (p.y>y1) y1=p.y;
  }));
  return {x0,y0,x1,y1,w:x1-x0,h:y1-y0,cx:(x0+x1)/2,cy:(y0+y1)/2};
}
function fit() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
  const r = cv.getBoundingClientRect();
  if (r.width < 2 || r.height < 2) return;   // ホーム表示中は #app が非表示なので何もしない
  cv.width = Math.round(r.width*dpr); cv.height = Math.round(r.height*dpr);
  cfx.width = Math.round(window.innerWidth*dpr); cfx.height = Math.round(window.innerHeight*dpr);
  cfxc.setTransform(dpr,0,0,dpr,0,0);
  ctx.setTransform(dpr,0,0,dpr,0,0);
  const bb = bbox(shape());
  // 大きさは全数字で共通（数字ごとに大小すると違和感が出るため）、横位置だけ字形に合わせて中央へ
  const m = 34, GW = 174, GH = 282, GCY = 201;   // 1桁の数字を含む共通の枠
  // 「10」のように横に広い字は、その字の幅に合わせて縮める
  const w = Math.max(GW, bb.w), h = Math.max(GH, bb.h);
  const s = Math.min((r.width - m*1.8)/(w + m*2), (r.height - m*1.8)/(h + m*2.6));
  TR = { s,
    ox: r.width/2  - bb.cx*s,
    oy: r.height/2 - GCY*s - r.height*0.03,
    short: Math.min(r.width, r.height), w:r.width, h:r.height };
  draw();
}
const toScreen = p => ({ x: p.x*TR.s + TR.ox, y: p.y*TR.s + TR.oy });
function toVB(clientX, clientY) {
  const r = cv.getBoundingClientRect();
  return { x: (clientX - r.left - TR.ox)/TR.s, y: (clientY - r.top - TR.oy)/TR.s };
}

// ===== 状態 =====
let idx = 0;                 // CFG.order のどこか
let strokeI = 0;             // 何画目
let cpI = 0;                 // チェックポイント進捗
let drawing = false;
let trail = [];              // 指の軌跡（viewBox座標）
let doneStrokes = [];        // 完了した画
let stars = 0;
const cur = () => CFG.order[idx];
const shape = () => SHAPES[cur()];

// ===== 描画 =====
const COLORS = ['#ff8a3d','#4aa3ff','#3fc06d'];
function pathOf(pts, from = 0, to = pts.length) {
  ctx.beginPath();
  for (let i = from; i < to; i++) {
    const q = toScreen(pts[i]);
    i === from ? ctx.moveTo(q.x, q.y) : ctx.lineTo(q.x, q.y);
  }
}
function draw() {
  const W = TR.w, H = TR.h;
  ctx.clearRect(0,0,W,H);
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  const lw = 26*TR.s;

  // うっすら全体の形（ゴールの姿）
  ctx.globalAlpha = 1;
  shape().forEach(st => {
    ctx.strokeStyle = '#f1eade'; ctx.lineWidth = lw;
    pathOf(st.dense); ctx.stroke();
  });

  // 完了した画を色つきで
  doneStrokes.forEach(i => {
    ctx.strokeStyle = COLORS[i % COLORS.length]; ctx.lineWidth = lw;
    pathOf(shape()[i].dense); ctx.stroke();
  });

  if (strokeI < shape().length) {
    const st = shape()[strokeI];
    // これから書く画：点線ガイド
    ctx.save();
    ctx.setLineDash([2*TR.s, 14*TR.s]);
    ctx.strokeStyle = '#b8ab9a'; ctx.lineWidth = 5*TR.s;
    pathOf(st.dense); ctx.stroke();
    ctx.restore();

    // 通過済みのぶんを色で塗る
    if (cpI > 0) {
      const ratio = cpI / st.cps.length;
      const upto = Math.max(2, Math.floor(st.dense.length * ratio));
      ctx.strokeStyle = COLORS[strokeI % COLORS.length]; ctx.lineWidth = lw;
      pathOf(st.dense, 0, upto); ctx.stroke();
    }

    // 始点マーカー（ぴょこぴょこ）
    if (cpI === 0) {
      const g = toScreen(st.cps[0]);
      const t = (Date.now() % 1000) / 1000;
      const r = (15 + Math.sin(t*Math.PI*2)*3.5) * TR.s;
      ctx.fillStyle = COLORS[strokeI % COLORS.length];
      ctx.beginPath(); ctx.arc(g.x, g.y, r, 0, 7); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.font = `bold ${16*TR.s}px sans-serif`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(String(strokeI+1), g.x, g.y+1*TR.s);
    }
  }

  // 指の軌跡（クレヨン風）
  if (trail.length > 1) {
    ctx.save();
    ctx.globalAlpha = .55; ctx.strokeStyle = COLORS[strokeI % COLORS.length];
    ctx.lineWidth = 14*TR.s;
    pathOf(trail); ctx.stroke();
    ctx.restore();
  }
}
function loop(){
  if (!atHome() && !drawing && strokeI < shape().length && cpI === 0) draw();
  requestAnimationFrame(loop);
}

// ===== 音 =====
let AC = null;
const ac = () => (AC ||= new (window.AudioContext || window.webkitAudioContext)());
function beep(freq, dur = .12, type = 'sine', vol = .18) {
  try {
    const a = ac(), o = a.createOscillator(), g = a.createGain();
    o.type = type; o.frequency.value = freq;
    g.gain.setValueAtTime(vol, a.currentTime);
    g.gain.exponentialRampToValueAtTime(.001, a.currentTime + dur);
    o.connect(g).connect(a.destination); o.start(); o.stop(a.currentTime + dur);
  } catch(e){}
}
const sfxTick  = () => beep(880, .05, 'triangle', .07);
const sfxStroke= () => { beep(660,.10); setTimeout(()=>beep(880,.14),90); };
const sfxDone  = () => { [523,659,784,1047].forEach((f,i)=>setTimeout(()=>beep(f,.20,'triangle',.22), i*110)); };
const sfxOops  = () => beep(300, .16, 'sine', .10);

// ===== 録音した声 =====
// 声は必ず1つずつ、順番に鳴らす。新しく喋りだすときは、前の声を止める。
const PRAISE = [
  { file:'yatta1', text:'できた！'   },
  { file:'yatta2', text:'すごい！'   },
  { file:'yatta3', text:'じょうず！' },
  { file:'yatta4', text:'はなまる！' },
  { file:'yatta5', text:'やったね！' },
  { file:'yatta6', text:'かんぺき！' },
];
const FALLBACK = { yatta1:'yatta', yatta2:'yatta', yatta3:'yatta',
                   yatta4:'yatta', yatta5:'yatta', yatta6:'yatta',
                   // 念のための保険。q_ookii/q_chiisai は録音済みだが、
                   // 万一ファイルが欠けても「おおい」「すくない」だけは鳴るようにしておく。
                   q_ookii:'g_ooi', q_chiisai:'g_sukunai' };
let lastPraise = -1;
const voices = {};
let curAudio = null, speakToken = 0;

function audioOf(name) {
  let a = voices[name];
  if (!a) {
    const src = (window.VOICE && window.VOICE[name]) || `assets/voice/${name}.mp3`;
    a = voices[name] = new Audio(src);
    a.preload = 'auto';
  }
  return a;
}

function stopSpeak() {
  speakToken++;
  if (curAudio) { try { curAudio.pause(); curAudio.currentTime = 0; } catch(e){} }
  curAudio = null;
}

// 言葉を順番に鳴らす。呼ばれた時点で鳴っている声は止める。
// opts: { delay, onStep(name,i), onDone() }
function speak(names, opts = {}) {
  if (typeof opts === 'number') opts = { delay: opts };
  const { delay = 0, onStep, onDone } = opts;
  stopSpeak();
  const my = speakToken;
  const list = names.filter(Boolean);
  const tried = {};
  let i = -1;
  const step = () => {
    if (my !== speakToken) return;            // 新しい発話に追い越されたら終わり
    if (!list.length) { curAudio = null; if (onDone) onDone(); return; }
    const n = list.shift(); i++;
    if (onStep) { try { onStep(n, i); } catch(e){} }
    let a;
    try { a = audioOf(n); } catch(e) { return step(); }
    const skip = () => {
      // 録音が無いものは、代わりの声があればそれを鳴らし、無ければ飛ばす
      if (FALLBACK[n] && !tried[n]) { tried[n] = 1; list.unshift(FALLBACK[n]); }
      step();
    };
    curAudio = a;
    a.onended = step; a.onerror = skip;
    try { a.currentTime = 0; const r = a.play(); if (r && r.catch) r.catch(skip); }
    catch(e) { skip(); }
  };
  if (delay > 0) setTimeout(() => { if (my === speakToken) step(); }, delay);
  else step();
}

function pickPraise() {
  let i; do { i = Math.floor(Math.random()*PRAISE.length); } while (PRAISE.length > 1 && i === lastPraise);
  lastPraise = i; return PRAISE[i];
}

// ===== 出題 =====
function setTarget(intro) {
  const n = cur();
  $('#targetNum').textContent = n;
  const dots = $('#targetDots'); dots.innerHTML = '';
  const count = n === '0' ? 0 : Number(n);
  for (let i = 0; i < count; i++) { const d = document.createElement('i'); d.className = 'dot'; dots.appendChild(d); }
  strokeI = 0; cpI = 0; trail = []; doneStrokes = [];
  fit(); speak([...(intro||[]), n, 'p_kaku']);
}
function resetStroke(soft) {
  cpI = 0; trail = []; if (!soft) sfxOops(); draw();
}

// ===== 入力 =====
function onDown(e) {
  ac(); // 最初のタッチで音を有効化
  if (strokeI >= shape().length) return;
  const p = toVB(e.clientX, e.clientY);
  const st = shape()[strokeI];
  const target = cpI === 0 ? st.cps[0] : st.cps[Math.min(cpI, st.cps.length-1)];
  const lim = cpI === 0 ? CFG.startTol : CFG.tol;
  if (Math.hypot(p.x-target.x, p.y-target.y) > lim) { resetStroke(true); return; }
  drawing = true; trail = [p];
  cv.setPointerCapture(e.pointerId);
  advance(p);
}
function onMove(e) {
  if (!drawing) return;
  const p = toVB(e.clientX, e.clientY);
  const last = trail[trail.length-1];
  // 前の位置から今の位置までを細かく刻んでたどる（速く動かしても取りこぼさない）
  if (last) {
    const d = Math.hypot(p.x-last.x, p.y-last.y);
    const n = Math.min(40, Math.ceil(d / CFG.stepVB));
    for (let i = 1; i <= n; i++) {
      advance({ x: last.x + (p.x-last.x)*i/n, y: last.y + (p.y-last.y)*i/n });
    }
  } else advance(p);
  trail.push(p); if (trail.length > 400) trail.shift();
  draw();
}
function advance(p) {
  if (strokeI >= shape().length) return;
  const st = shape()[strokeI];
  // 今いるべき場所から大きく外れていたら、何も進めない（線の上を通ることを要求する）
  const here = st.cps[Math.min(cpI, st.cps.length-1)];
  if (Math.hypot(p.x-here.x, p.y-here.y) > CFG.strayLimit) return;
  let moved = false;
  for (let k = cpI; k < Math.min(cpI + CFG.lookAhead, st.cps.length); k++) {
    if (Math.hypot(p.x-st.cps[k].x, p.y-st.cps[k].y) < CFG.tol) { cpI = k+1; moved = true; }
  }
  if (moved && cpI % 4 === 0) sfxTick();
  if (cpI >= st.cps.length * CFG.finishRatio) finishStroke();
}
function finishStroke() {
  drawing = false;
  doneStrokes.push(strokeI);
  strokeI++; cpI = 0; trail = [];
  if (strokeI >= shape().length) { draw(); setTimeout(celebrate, 160); }
  else { sfxStroke(); draw(); }
}
function onUp() {
  if (!drawing) return;
  drawing = false;
  if (strokeI < shape().length && cpI > 0 && cpI < shape()[strokeI].cps.length * CFG.finishRatio) resetStroke(false);
  else draw();
}

// ===== ごほうび =====
let parts = [];
function celebrate(after) {
  sfxDone();
  const pr = pickPraise();
  speak([pr.file], 300);   // お祝いの音が鳴り終わってから喋る
  stars = Math.min(stars + 1, 999);
  renderStars();
  const box = $('#reward');
  $('#rewardText').textContent = pr.text;
  box.classList.add('on');
  parts = Array.from({length: 90}, () => ({
    x: Math.random()*window.innerWidth, y: -20 - Math.random()*window.innerHeight*.5,
    vx: (Math.random()-.5)*2, vy: 2.5 + Math.random()*3.5,
    s: 6 + Math.random()*8, a: Math.random()*6,
    c: ['#ff8a3d','#4aa3ff','#3fc06d','#ffd23d','#ff6b9d'][Math.floor(Math.random()*5)]
  }));
  tickConfetti();
  setTimeout(() => {
    box.classList.remove('on');
    if (after) after();
    else if (CFG.autoNext) next();
    else hintNext();
  }, 1900);
}
function hintNext() {
  // 「つぎ」ボタンを少しだけ目立たせて、押すまでこの数字のまま待つ
  const b = $('#next'); b.classList.add('hint');
  setTimeout(() => b.classList.remove('hint'), 4000);
}
function tickConfetti() {
  cfxc.clearRect(0,0,window.innerWidth,window.innerHeight);
  let alive = false;
  parts.forEach(p => {
    p.x += p.vx; p.y += p.vy; p.a += .12;
    if (p.y < window.innerHeight + 30) alive = true;
    cfxc.save(); cfxc.translate(p.x,p.y); cfxc.rotate(p.a);
    cfxc.fillStyle = p.c; cfxc.fillRect(-p.s/2,-p.s/2,p.s,p.s*.6); cfxc.restore();
  });
  if (alive) requestAnimationFrame(tickConfetti); else cfxc.clearRect(0,0,window.innerWidth,window.innerHeight);
}

function renderStars() {
  // 星を並べると「数える対象」が画面に2つできてしまうので、星は1つ＋個数で見せる
  const el = $('#stars');
  el.classList.toggle('zero', stars === 0);
  el.innerHTML = '<span class="starIcon">⭐</span><span class="starNum">' + stars + '</span>';
}


// ===== えらぶモード =====
const QUIZ = {
  pool: ['1','2','3','4','5','6','7','8','9','10'], // 0 は「●が0個」が分かりにくいので出さない
  min: 3, max: 5,        // 選択肢の数の範囲
  up: 3,                 // 何問続けて正解したら1つ増やすか
};
let quizOn = false, qN = 3, qStreak = 0, qAnswer = null, qKind = 'sound', qLock = false;

function shuffle(a){ for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];} return a; }

function setDots(n) {
  const box = $('#targetDots'); box.innerHTML = '';
  for (let i = 0; i < n; i++) { const d = document.createElement('i'); d.className = 'dot'; box.appendChild(d); }
}

function newQuestion(intro) {
  qLock = false;
  qKind = Math.random() < 0.5 ? 'sound' : 'dots';
  document.body.classList.toggle('qsound', qKind === 'sound');
  document.body.classList.toggle('qdots',  qKind === 'dots');

  qAnswer = QUIZ.pool[Math.floor(Math.random()*QUIZ.pool.length)];
  const others = shuffle(QUIZ.pool.filter(v => v !== qAnswer)).slice(0, qN-1);
  const choices = shuffle([qAnswer, ...others]);

  window.__answer = qAnswer;   // 動作確認用
  if (qKind === 'dots') {
    setDots(Number(qAnswer));
    speak([...(intro||[]), 'p_ikutsu'], 250);
  } else {
    setDots(0);
    speak([...(intro||[]), qAnswer, 'p_dore'], 250);
  }

  const box = $('#qChoices'); box.innerHTML = '';
  choices.forEach(v => {
    const b = document.createElement('button');
    b.className = 'choice'; b.textContent = v; b.dataset.v = v;
    b.addEventListener('click', () => answer(b, v));
    box.appendChild(b);
  });
}

function answer(btn, v) {
  if (qLock) return;
  if (v === qAnswer) {
    qLock = true;
    btn.classList.add('right');
    qStreak++;
    if (qStreak % QUIZ.up === 0 && qN < QUIZ.max) qN++;
    celebrate(() => { if (quizOn) newQuestion(); });
  } else {
    // まちがいはペナルティなし。カードが揺れて、もう一度選べる
    sfxOops(); speak(['p_oshii'], 180);   // 効果音が鳴り終わってから喋る
    btn.classList.add('wrong');
    btn.disabled = true;
    qStreak = 0;
    if (qN > QUIZ.min) qN--;
    setTimeout(() => btn.classList.remove('wrong'), 420);
  }
}

function setMode(mode, intro) {
  quizOn = (mode === 'quiz');
  shopOn = (mode === 'shop');
  compareOn = (mode === 'compare');
  document.body.classList.toggle('quiz', quizOn);
  document.body.classList.toggle('shop', shopOn);
  document.body.classList.toggle('compare', compareOn);
  if (!quizOn) document.body.classList.remove('qsound','qdots');
  if (!compareOn) document.body.classList.remove('cbig','csmall');
  if (quizOn)         { qN = QUIZ.min; qStreak = 0; newQuestion(intro); }
  else if (shopOn)    { newOrder(intro); }
  else if (compareOn) { cStreak = 0; cLevel = 0; newCompare(intro); }
  else                { setTarget(intro); }
}


// ===== くらべる（どちらが おおい／すくない）=====
// 毎回「数字」と「イラストの個数」を1つずつ組み合わせて出す
// （どちらが数字/イラストになるかはランダム）— 数字と実際の量を結びつける
//
// むずかしさは3段階。3問続けて正解すると1つ上がる（まちがえたら下がる）。
//   0: 1〜6 で 差4以上   1: 1〜10 で 差2以上   2: 1〜10 で 差1以上
const COMPARE = {
  levels: [ {min:1,max:6,gap:4}, {min:1,max:10,gap:2}, {min:1,max:10,gap:1} ],
  up: 3,          // 何問続けて正解したら次の段階へ
};
let compareOn = false, cKind = 'big', cAnswerIdx = 0, cLock = false;
let cStreak = 0, cLevel = 0, cMiss = 0;

// カードの中身を作る。isNum なら数字、そうでなければ絵を value 個ならべる
function fillCmpSide(el, isNum, value, icon) {
  el.className = 'cmpCard';
  el.dataset.num = String(value);
  el.dataset.kind = isNum ? 'num' : 'ill';
  el.innerHTML = '';
  if (isNum) {
    const t = document.createElement('span');
    t.className = 'cmpNumBig'; t.textContent = value;
    el.appendChild(t);
  } else {
    const wrap = document.createElement('div');
    wrap.className = 'cmpIll';
    // 数えやすい形に並べる（6は3×2、9は3×3、10は5×2 など）
    const COLS = {1:1,2:2,3:3,4:2,5:5,6:3,7:4,8:4,9:3,10:5};
    wrap.style.gridTemplateColumns = 'repeat(' + (COLS[value] || 5) + ',1fr)';
    for (let i = 0; i < value; i++) {
      const s = document.createElement('span');
      s.textContent = icon;
      wrap.appendChild(s);
    }
    el.appendChild(wrap);
    const badge = document.createElement('span');
    badge.className = 'cmpBadge'; badge.textContent = value;
    el.appendChild(badge);
  }
}

// 絵のほうに「いくつ？」の数字を出す（正解のとき・2回まちがえたとき）
function revealCmpCounts() {
  [$('#cmpA'), $('#cmpB')].forEach(el => el.classList.add('show-num'));
}

function newCompare(intro) {
  cLock = false; cMiss = 0;
  cKind = Math.random() < 0.5 ? 'big' : 'small';
  document.body.classList.toggle('cbig', cKind === 'big');
  document.body.classList.toggle('csmall', cKind === 'small');
  $('#targetNum').textContent = cKind === 'big' ? '⬆️' : '⬇️';

  // 段階に合わせて、差のひらいた2つを選ぶ
  const L = COMPARE.levels[Math.min(cLevel, COMPARE.levels.length - 1)];
  const span = L.max - L.min + 1;
  let na, nb, guard = 0;
  do {
    na = L.min + Math.floor(Math.random()*span);
    nb = L.min + Math.floor(Math.random()*span);
  } while (Math.abs(na - nb) < L.gap && ++guard < 200);
  if (na === nb) nb = na === L.max ? na - 1 : na + 1;

  cAnswerIdx = (cKind === 'big') ? (na > nb ? 0 : 1) : (na < nb ? 0 : 1);

  const numSide = Math.random() < 0.5 ? 0 : 1;   // 0=Aが数字/Bが絵, 1=その逆
  const icon = SHOP.goods[Math.floor(Math.random()*SHOP.goods.length)].emoji;
  fillCmpSide($('#cmpA'), numSide === 0, na, icon);
  fillCmpSide($('#cmpB'), numSide === 1, nb, icon);

  speak([...(intro||[]), cKind === 'big' ? 'q_ookii' : 'q_chiisai'], 250);
}

function sayCompare() { speak([cKind === 'big' ? 'q_ookii' : 'q_chiisai']); }

function cmpAnswer(btn, i) {
  if (cLock) return;
  if (i === cAnswerIdx) {
    cLock = true;
    btn.classList.add('right');
    revealCmpCounts();
    if (cMiss === 0 && ++cStreak >= COMPARE.up) {
      cStreak = 0;
      cLevel = Math.min(cLevel + 1, COMPARE.levels.length - 1);
    }
    celebrate(() => { if (compareOn) newCompare(); });
  } else {
    cStreak = 0; cMiss++;
    if (cMiss >= 2) {
      cLevel = Math.max(cLevel - 1, 0);
      revealCmpCounts();          // 2回まちがえたら、絵の数を数字で見せる
    }
    sfxOops(); speak(['p_oshii'], 180);
    btn.classList.add('wrong');
    setTimeout(() => btn.classList.remove('wrong'), 420);
  }
}


// ===== おみせやさん（指定された数だけカゴに移す） =====
const SHOP = {
  goods: [
    { key:'it_ringo',  emoji:'🍎', name:'りんご'  },
    { key:'it_mikan',  emoji:'🍊', name:'みかん'  },
    { key:'it_ichigo', emoji:'🍓', name:'いちご'  },
    { key:'it_cookie', emoji:'🍪', name:'クッキー' },
  ],
  shelf: 10,      // 棚に並べる数
  max: 10,        // お題の最大
};
const KO = n => 'ko' + n;                    // 1→ko1（いっこ）… 10→ko10（じゅっこ）
let shopOn = false, shopTarget = 0, shopGood = null, shopLock = false;

const shelfEl  = () => $('#shelf');
const basketEl = () => $('#basket');

function makeGood(g) {
  const el = document.createElement('div');
  el.className = 'goods'; el.textContent = g.emoji;
  el.addEventListener('pointerdown', e => onGoodDown(e, el));
  return el;
}

function newOrder(intro) {
  shopLock = false; $('#done').disabled = false;
  shopGood = SHOP.goods[Math.floor(Math.random()*SHOP.goods.length)];
  shopTarget = 1 + Math.floor(Math.random()*SHOP.max);
  $('#targetNum').textContent = shopTarget;
  $('#orderItem').textContent = shopGood.emoji;
  shelfEl().innerHTML = ''; basketEl().innerHTML = '';
  for (let i = 0; i < SHOP.shelf; i++) shelfEl().appendChild(makeGood(shopGood));
  speak([...(intro||[]), shopGood.key, KO(shopTarget), 'g_kago'], 250);
}

function sayOrder() { speak([shopGood.key, KO(shopTarget), 'g_kago']); }

// --- ドラッグ（押したまま動かす）と、タップでも移せるようにする ---
let dragEl = null, dragDX = 0, dragDY = 0, dragFrom = null, dragMoved = false, dragT0 = 0;

function onGoodDown(e, el) {
  if (shopLock) return;
  dragEl = el; dragFrom = el.parentElement; dragMoved = false; dragT0 = Date.now();
  const r = el.getBoundingClientRect();
  dragDX = e.clientX - r.left; dragDY = e.clientY - r.top;
  el.classList.add('dragging');
  el.style.width = r.width + 'px'; el.style.height = r.height + 'px';
  el.style.left = r.left + 'px';  el.style.top = r.top + 'px';
  try { el.setPointerCapture(e.pointerId); } catch(err) {}
  e.preventDefault();
}
function onGoodMove(e) {
  if (!dragEl) return;
  if (Math.abs(e.clientX - (dragEl.getBoundingClientRect().left + dragDX)) > 3 ||
      Math.abs(e.clientY - (dragEl.getBoundingClientRect().top  + dragDY)) > 3) dragMoved = true;
  dragEl.style.left = (e.clientX - dragDX) + 'px';
  dragEl.style.top  = (e.clientY - dragDY) + 'px';
  const over = inBasket(e.clientX, e.clientY);
  basketEl().classList.toggle('over', over && dragFrom !== basketEl());
}
function inBasket(x, y) {
  const r = basketEl().getBoundingClientRect();
  return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
}
function onGoodUp(e) {
  if (!dragEl) return;
  const el = dragEl; dragEl = null;
  el.classList.remove('dragging');
  el.style.cssText = '';
  basketEl().classList.remove('over');
  const quick = (Date.now() - dragT0) < 300 && !dragMoved;
  let to;
  if (quick) to = (dragFrom === basketEl()) ? shelfEl() : basketEl();   // タップでも行き来できる
  else       to = inBasket(e.clientX, e.clientY) ? basketEl() : shelfEl();
  if (to !== el.parentElement) { to.appendChild(el); sfxTick(); }
}

// --- 「できた」→ 1つずつ数えて答え合わせ ---
function checkOrder() {
  if (shopLock) return;
  const items = [...basketEl().children];
  shopLock = true; $('#done').disabled = true;
  const clear = () => items.forEach(el => { el.classList.remove('counting'); delete el.dataset.count; });
  if (!items.length) {
    speak(['g_dekita', 'g_sukunai', 'g_chigau'], { onDone: () => { shopLock = false; $('#done').disabled = false; } });
    return;
  }
  const seq = ['g_dekita', 'g_kazoete', ...items.map((_, i) => String(i + 1))];
  speak(seq, {
    onStep: (n, i) => {
      clear();
      const k = i - 2;                       // 先頭2つは「できた」「かぞえて みよう」
      if (k >= 0 && items[k]) { items[k].classList.add('counting'); items[k].dataset.count = String(k + 1); }
    },
    onDone: () => {
      clear();
      const n = items.length;
      if (n === shopTarget) {
        celebrate(() => { if (shopOn) newOrder(); });
      } else {
        speak([n > shopTarget ? 'g_ooi' : 'g_sukunai', 'g_chigau'],
              { onDone: () => { shopLock = false; $('#done').disabled = false; } });
      }
    }
  });
}

// ===== ホーム画面 =====
// 追加録音（まだ無ければ自動で無音スキップされる）
//   g_nanishite … 「なにを して あそぶ？」
//   b_ouchi     … 「おうちに もどる」
const V_HOME = 'g_nanishite', V_BACK = 'b_ouchi';
const MODE_VOICE = { write:'m_kaku', quiz:'m_erabu', shop:'m_omise', compare:'m_kurabu' };

const atHome = () => document.body.classList.contains('home');

function showHome(intro) {
  stopSpeak();
  quizOn = false; shopOn = false; compareOn = false; dragEl = null;
  document.body.classList.remove('quiz','shop','qsound','qdots','compare','cbig','csmall');
  document.body.classList.add('home');
  speak([...(intro||[]), V_HOME], 120);
}

function enterMode(mode) {
  ac();                                   // 最初のタップで音を有効化
  document.body.classList.remove('home'); // 先に表示してから fit() させる
  setMode(mode, [MODE_VOICE[mode]]);
}

// ===== ナビ =====
function next(intro){ idx = (idx+1) % CFG.order.length; setTarget(intro); }
function prev(intro){ idx = (idx-1+CFG.order.length) % CFG.order.length; setTarget(intro); }

cv.addEventListener('pointerdown', onDown);
cv.addEventListener('pointermove', onMove);
cv.addEventListener('pointerup', onUp);
cv.addEventListener('pointercancel', onUp);
cv.addEventListener('contextmenu', e => e.preventDefault());
$('#next').addEventListener('click', () => next(['b_tsugi']));
$('#prev').addEventListener('click', () => prev(['b_mae']));
$('#again').addEventListener('click', () => {
  strokeI = 0; cpI = 0; trail = []; doneStrokes = []; draw();
  speak(['b_mouichido', cur(), 'p_kaku']);
});
$('#target').addEventListener('click', () => {
  if (shopOn) sayOrder();
  else if (compareOn) sayCompare();
  else if (!quizOn) speak([cur(), 'p_kaku']);
});
$('#cmpA').addEventListener('click', () => cmpAnswer($('#cmpA'), 0));
$('#cmpB').addEventListener('click', () => cmpAnswer($('#cmpB'), 1));
$('#bigSpeak').addEventListener('click', e => { e.stopPropagation(); speak([qAnswer, 'p_dore']); });
document.querySelectorAll('.hcard').forEach(b =>
  b.addEventListener('click', () => enterMode(b.dataset.mode)));
$('#homeSpeak').addEventListener('click', () => { ac(); speak([V_HOME]); });
$('#homeBtn').addEventListener('click', () => { ac(); showHome([V_BACK]); });
$('#done').addEventListener('click', checkOrder);
window.addEventListener('pointermove', onGoodMove);
window.addEventListener('pointerup', onGoodUp);
window.addEventListener('pointercancel', onGoodUp);
window.addEventListener('resize', fit);
window.addEventListener('orientationchange', () => setTimeout(fit, 250));

renderStars(); loop();
showHome();
// 起動直後は音が鳴らせないことがあるので、最初のタップでもう一度だけ声をかける
document.addEventListener('pointerdown', function once() {
  document.removeEventListener('pointerdown', once);
  ac();
}, { once:true });
})();
