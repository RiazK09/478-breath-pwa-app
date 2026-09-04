(() => {
  'use strict';

  const DUR = { prepare: 3, inhale: 4, hold: 7, exhale: 8 };
  const ROUND_SECONDS = 19;
  const DAILY_GOAL = 360;
  const HISTORY_KEY = '478_history_v1';
  const SESSION_KEY = '478_session_v2';
  const SETTINGS = {
    rounds: '478_rounds', guidance: '478_guidance', haptic: '478_haptic', wake: '478_wake',
    completion: '478_completion', largeText: '478_large_text'
  };
  const el = id => document.getElementById(id);

  const phaseEl = el('phase'), countEl = el('countdown'), mainBtn = el('mainBtn');
  const stopBtn = el('stopBtn'), breathDisc = el('breathDisc'), pulseOrb = el('pulseOrb');
  const roundLabel = el('roundLabel'), remainingTime = el('remainingTime'), roundDots = el('roundDots');
  const roundsSelect = el('rounds'), guidanceMode = el('guidanceMode'), hapticToggle = el('hapticToggle');
  const wakeToggle = el('wakeToggle'), completionToggle = el('completionToggle'), largeTextToggle = el('largeTextToggle');
  const addRoundsBtn = el('addRoundsBtn');
  const segments = { inhale: el('segInhale'), hold: el('segHold'), exhale: el('segExhale') };
  const nodes = [el('n1'), el('n2'), el('n3'), el('n4')];

  let state = 'idle', phase = 'prepare', remaining = 0, round = 1, timer = null;
  let phaseStart = 0, phaseDuration = 0, raf = null, wakeLock = null, audioCtx = null;
  let totalRounds = +(localStorage.getItem(SETTINGS.rounds) || 19);
  let guidance = localStorage.getItem(SETTINGS.guidance) || 'male';
  let hapticsOn = localStorage.getItem(SETTINGS.haptic) !== 'false';
  let wakeOn = localStorage.getItem(SETTINGS.wake) !== 'false';
  let completionOn = localStorage.getItem(SETTINGS.completion) !== 'false';
  let largeTextOn = localStorage.getItem(SETTINGS.largeText) === 'true';
  let autoPaused = false;

  const phaseNames = { prepare:'Prepare', inhale:'Inhale', hold:'Hold in', exhale:'Exhale', complete:'Complete' };
  const phaseSpeech = { inhale:'Inhale', hold:'Hold in', exhale:'Exhale' };

  function populateRounds(){
    roundsSelect.innerHTML = '';
    for(let i=3;i<=40;i++){
      const o=document.createElement('option'); o.value=i; o.textContent=`${i} rounds · ${shortDuration(i*ROUND_SECONDS)}`; roundsSelect.appendChild(o);
    }
    if(totalRounds < 3 || totalRounds > 40) totalRounds = 19;
    roundsSelect.value = String(totalRounds);
  }

  function applySettingsUI(){
    guidanceMode.value = guidance; hapticToggle.checked = hapticsOn; wakeToggle.checked = wakeOn;
    completionToggle.checked = completionOn; largeTextToggle.checked = largeTextOn;
    document.body.classList.toggle('large-text', largeTextOn); updatePresetButtons();
  }

  function toast(msg){ const t=el('toast'); t.textContent=msg; t.classList.add('show'); clearTimeout(t._x); t._x=setTimeout(()=>t.classList.remove('show'),2200); }
  function vibrate(pattern=25){ if(hapticsOn && navigator.vibrate) navigator.vibrate(pattern); }

  function voices(){ return ('speechSynthesis' in window) ? speechSynthesis.getVoices() : []; }
  function englishVoices(){ const v=voices(); const e=v.filter(x=>/^en(?:-|_)/i.test(x.lang)||/^en$/i.test(x.lang)); return e.length?e:v; }
  function chooseVoice(kind){
    const list=englishVoices();
    const male=/Daniel|Aaron|Arthur|Fred|Alex|Oliver|Eddy|Ralph|Reed|Rocko|Gordon|James|Thomas|David|Guy|Ryan|Brian|George|Mark|Male/i;
    const female=/Samantha|Karen|Moira|Tessa|Ava|Allison|Susan|Zira|Hazel|Aria|Jenny|Sonia|Serena|Victoria|Female/i;
    const rx=kind==='female'?female:male;
    return list.find(v=>rx.test(v.name)) || list.find(v=>/South Africa|UK|British|English/i.test(v.name)) || list[0];
  }

  function ensureAudio(){
    try { const C=window.AudioContext||window.webkitAudioContext; if(!C) return null; if(!audioCtx) audioCtx=new C(); if(audioCtx.state==='suspended') audioCtx.resume().catch(()=>{}); return audioCtx; } catch(e){ return null; }
  }

  function playTing(preview=false){
    const ctx=ensureAudio(); if(!ctx) return;
    const now=ctx.currentTime, osc=ctx.createOscillator(), gain=ctx.createGain();
    osc.type='sine'; osc.frequency.setValueAtTime(preview?740:690,now); osc.frequency.exponentialRampToValueAtTime(preview?880:820,now+.12);
    gain.gain.setValueAtTime(.0001,now); gain.gain.exponentialRampToValueAtTime(.18,now+.015); gain.gain.exponentialRampToValueAtTime(.0001,now+.48);
    osc.connect(gain); gain.connect(ctx.destination); osc.start(now); osc.stop(now+.52);
  }

  function playSoftChime(){
    const ctx=ensureAudio(); if(!ctx) return; const now=ctx.currentTime;
    [523.25,659.25].forEach((freq,i)=>{ const o=ctx.createOscillator(),g=ctx.createGain(); o.type='sine';o.frequency.value=freq;const s=now+i*.12;g.gain.setValueAtTime(.0001,s);g.gain.exponentialRampToValueAtTime(.09,s+.02);g.gain.exponentialRampToValueAtTime(.0001,s+.7);o.connect(g);g.connect(ctx.destination);o.start(s);o.stop(s+.75); });
  }

  function playBowl(){
    const ctx=ensureAudio(); if(!ctx) return; const now=ctx.currentTime;
    [220,440,660].forEach((freq,i)=>{const o=ctx.createOscillator(),g=ctx.createGain();o.type='sine';o.frequency.value=freq;g.gain.setValueAtTime(.0001,now);g.gain.exponentialRampToValueAtTime(i? .025:.075,now+.025);g.gain.exponentialRampToValueAtTime(.0001,now+2.4);o.connect(g);g.connect(ctx.destination);o.start(now);o.stop(now+2.5)});
  }

  function playBreathTone(next){
    const ctx=ensureAudio(); if(!ctx) return; const now=ctx.currentTime,d=Math.max(.7,DUR[next]||1),o=ctx.createOscillator(),g=ctx.createGain();o.type='sine';
    const a=next==='inhale'?196:next==='hold'?246.94:246.94,b=next==='inhale'?293.66:next==='hold'?246.94:174.61;o.frequency.setValueAtTime(a,now);o.frequency.exponentialRampToValueAtTime(b,now+d);g.gain.setValueAtTime(.0001,now);g.gain.exponentialRampToValueAtTime(.045,now+.18);g.gain.setValueAtTime(.045,now+Math.max(.2,d-.35));g.gain.exponentialRampToValueAtTime(.0001,now+d);o.connect(g);g.connect(ctx.destination);o.start(now);o.stop(now+d+.05);
  }

  function playCompletionChime(){
    if(!completionOn) return; const ctx=ensureAudio(); if(!ctx) return; const now=ctx.currentTime;
    [523.25,659.25,783.99].forEach((freq,i)=>{ const osc=ctx.createOscillator(), gain=ctx.createGain(); osc.type='sine'; osc.frequency.value=freq; const s=now+i*.22; gain.gain.setValueAtTime(.0001,s); gain.gain.exponentialRampToValueAtTime(.15,s+.025); gain.gain.exponentialRampToValueAtTime(.0001,s+.62); osc.connect(gain); gain.connect(ctx.destination); osc.start(s); osc.stop(s+.68); });
  }

  function speak(text, kind=guidance){
    if(!('speechSynthesis' in window) || (kind!=='male' && kind!=='female')) return;
    try { speechSynthesis.cancel(); const u=new SpeechSynthesisUtterance(text); const v=chooseVoice(kind); if(v) u.voice=v; u.rate=.82; u.pitch=kind==='female'?1.03:.84; u.volume=1; speechSynthesis.speak(u); } catch(e){}
  }

  function cuePhase(next){
    if(guidance==='ting') playTing();
    else if(guidance==='bowl') playBowl();
    else if(guidance==='breath') playBreathTone(next);
    else if(guidance==='chime') playSoftChime();
    else if(guidance==='male'||guidance==='female') speak(phaseSpeech[next],guidance);
  }

  async function requestWake(){ if(!wakeOn||!('wakeLock' in navigator)) return; try{ wakeLock=await navigator.wakeLock.request('screen'); wakeLock.addEventListener('release',()=>wakeLock=null); }catch(e){} }
  async function releaseWake(){ try{await wakeLock?.release();}catch(e){} wakeLock=null; }

  function formatDuration(seconds){ const m=Math.floor(seconds/60), s=Math.max(0,seconds%60); return `${m} min ${String(s).padStart(2,'0')} sec`; }
  function shortDuration(seconds){ const m=Math.floor(seconds/60), s=Math.max(0,seconds%60); return s?`${m}:${String(s).padStart(2,'0')}`:`${m} min`; }
  function prettyMinutes(seconds){ const m=Math.floor(seconds/60),s=seconds%60; if(!seconds)return'0 min'; return s?`${m}:${String(s).padStart(2,'0')}`:`${m} min`; }

  function updatePresetButtons(){ document.querySelectorAll('.preset').forEach(b=>b.classList.toggle('active',+b.dataset.rounds===totalRounds)); }
  function makeDots(){
    roundDots.innerHTML='';
    const visualMax=32, count=Math.min(totalRounds,visualMax);
    for(let i=1;i<=count;i++){ const d=document.createElement('span'); d.className='round-dot'+(i<round?' done':i===round&&state!=='idle'?' current':''); roundDots.appendChild(d); }
  }
  function estimateRemainingSeconds(){
    if(state==='idle'||state==='complete') return totalRounds*ROUND_SECONDS;
    const futureRounds=Math.max(0,totalRounds-round);
    let current=remaining;
    if(phase==='prepare') current += ROUND_SECONDS;
    else if(phase==='inhale') current += DUR.hold+DUR.exhale;
    else if(phase==='hold') current += DUR.exhale;
    return Math.max(0,current+futureRounds*ROUND_SECONDS);
  }
  function updateMeta(){
    if(state==='complete') roundLabel.innerHTML=`<strong>${totalRounds} rounds complete</strong>`;
    else if(state==='idle') roundLabel.textContent=`${totalRounds} rounds · ${formatDuration(totalRounds*ROUND_SECONDS)}`;
    else roundLabel.innerHTML=`Round <strong>${Math.min(round,totalRounds)}</strong> of ${totalRounds}`;
    const rem=estimateRemainingSeconds(); remainingTime.textContent=state==='complete'?'Session complete':state==='idle'?`About ${shortDuration(rem)} total`:`About ${shortDuration(rem)} remaining`;
    addRoundsBtn.classList.toggle('session-active',state==='running'||state==='paused'); makeDots(); updatePresetButtons();
  }

  function paintSegment(name,p){ const s=segments[name]; if(!s)return; const pct=Math.round(Math.max(0,Math.min(1,p))*100); if(name==='hold') s.style.background=`linear-gradient(90deg,var(--purple-light) 0 ${pct}%,var(--track) ${pct}% 100%)`; else if(name==='inhale') s.style.background=`linear-gradient(0deg,var(--purple-light) 0 ${pct}%,var(--track) ${pct}% 100%)`; else s.style.background=`linear-gradient(180deg,var(--purple-2) 0 ${pct}%,var(--track) ${pct}% 100%)`; }
  function resetGuide(){ Object.keys(segments).forEach(k=>paintSegment(k,0)); nodes.forEach(n=>n.classList.remove('active')); pulseOrb.classList.remove('visible'); breathDisc.classList.remove('active'); breathDisc.removeAttribute('data-phase'); }
  function pointForPhase(p,progress){ const g=el('guide').getBoundingClientRect(); const pts={a:[g.width*.105,g.height*.93],b:[g.width*.285,g.height*.17],c:[g.width*.715,g.height*.17],d:[g.width*.895,g.height*.93]}; let s,e; if(p==='inhale'){s=pts.a;e=pts.b}else if(p==='hold'){s=pts.b;e=pts.c}else{s=pts.c;e=pts.d} return[s[0]+(e[0]-s[0])*progress,s[1]+(e[1]-s[1])*progress]; }
  function animate(){ if(state!=='running'||phase==='prepare')return; const elapsed=(performance.now()-phaseStart)/1000,p=Math.min(1,Math.max(0,elapsed/phaseDuration)); paintSegment(phase,p); const pt=pointForPhase(phase,p); pulseOrb.style.left=`${pt[0]-16}px`;pulseOrb.style.top=`${pt[1]-16}px`;pulseOrb.classList.add('visible');if(p<1)raf=requestAnimationFrame(animate); }

  function persistSession(){
    if(state==='idle'||state==='complete'){ localStorage.removeItem(SESSION_KEY); return; }
    localStorage.setItem(SESSION_KEY,JSON.stringify({state:'paused',phase,remaining,round,totalRounds,savedAt:Date.now()}));
  }
  function clearSession(){ localStorage.removeItem(SESSION_KEY); }

  function setPhase(next, skipCue=false){
    phase=next; remaining=DUR[next]||0; phaseDuration=remaining; phaseStart=performance.now(); phaseEl.textContent=phaseNames[next]; countEl.textContent=String(remaining).padStart(2,'0'); resetGuide();
    if(next==='prepare') nodes[0].classList.add('active');
    else { breathDisc.classList.add('active'); breathDisc.setAttribute('data-phase',next); if(next==='inhale'){nodes[0].classList.add('active');if(!skipCue)cuePhase(next);vibrate(25)} if(next==='hold'){nodes[1].classList.add('active');if(!skipCue)cuePhase(next);vibrate([20,45,20]);paintSegment('inhale',1)} if(next==='exhale'){nodes[2].classList.add('active');if(!skipCue)cuePhase(next);vibrate(35);paintSegment('inhale',1);paintSegment('hold',1)} cancelAnimationFrame(raf);raf=requestAnimationFrame(animate); }
    persistSession(); updateMeta();
  }
  function advance(){ if(phase==='prepare')return setPhase('inhale'); if(phase==='inhale')return setPhase('hold'); if(phase==='hold')return setPhase('exhale'); if(phase==='exhale'){if(round>=totalRounds)return complete();round++;updateMeta();return setPhase('inhale');} }
  function tick(){ if(state!=='running')return; remaining--; if(remaining<=0)advance();else{countEl.textContent=String(remaining).padStart(2,'0');persistSession();updateMeta();} }

  async function start(){
    ensureAudio(); if(state==='paused')return resume(); state='running';round=1;autoPaused=false;mainBtn.textContent='Pause';await requestWake();setPhase('prepare',true);vibrate(20);clearInterval(timer);timer=setInterval(tick,1000);updateMeta();
  }
  function pause(isAuto=false){ if(state!=='running')return;state='paused';autoPaused=isAuto;clearInterval(timer);cancelAnimationFrame(raf);mainBtn.textContent='Resume';phaseEl.textContent='Paused';try{speechSynthesis.cancel()}catch(e){};releaseWake();persistSession();updateMeta();if(isAuto)toast('Session paused'); }
  function resume(){ state='running';autoPaused=false;mainBtn.textContent='Pause';phaseEl.textContent=phaseNames[phase];phaseDuration=Math.max(1,remaining);phaseStart=performance.now();if(phase!=='prepare')raf=requestAnimationFrame(animate);timer=setInterval(tick,1000);requestWake();persistSession();updateMeta(); }
  function reset(){ state='idle';phase='prepare';round=1;remaining=0;autoPaused=false;clearInterval(timer);cancelAnimationFrame(raf);try{speechSynthesis.cancel()}catch(e){};releaseWake();clearSession();resetGuide();phaseEl.textContent='Ready';countEl.textContent='—';mainBtn.textContent='Start breathing';updateMeta(); }

  function getHistory(){ try{return JSON.parse(localStorage.getItem(HISTORY_KEY)||'[]')}catch(e){return[]} }
  function localDateKey(date=new Date()){ const y=date.getFullYear(),m=String(date.getMonth()+1).padStart(2,'0'),d=String(date.getDate()).padStart(2,'0');return`${y}-${m}-${d}`; }
  function saveCompletedSession(){ const h=getHistory(),now=new Date();h.push({id:now.getTime(),date:localDateKey(now),timestamp:now.toISOString(),rounds:totalRounds,seconds:totalRounds*ROUND_SECONDS});localStorage.setItem(HISTORY_KEY,JSON.stringify(h.slice(-730))); }
  function calculateStreak(history){ const active=new Set(history.map(x=>x.date));let cursor=new Date();if(!active.has(localDateKey(cursor)))cursor.setDate(cursor.getDate()-1);let streak=0;while(active.has(localDateKey(cursor))){streak++;cursor.setDate(cursor.getDate()-1)}return streak; }
  function todaySummary(history=getHistory()){ const key=localDateKey();const items=history.filter(x=>x.date===key);return{items,seconds:items.reduce((a,x)=>a+(x.seconds||0),0),rounds:items.reduce((a,x)=>a+(x.rounds||0),0)}; }

  function renderMonth(history){
    const cal=el('monthCalendar');cal.innerHTML='';const now=new Date(),year=now.getFullYear(),month=now.getMonth(),first=new Date(year,month,1),days=new Date(year,month+1,0).getDate();const byDay={};history.forEach(x=>{if(x.date.startsWith(`${year}-${String(month+1).padStart(2,'0')}-`))byDay[x.date]=(byDay[x.date]||0)+(x.seconds||0)});
    for(let i=0;i<first.getDay();i++){const b=document.createElement('div');b.className='month-day blank';cal.appendChild(b)}
    for(let d=1;d<=days;d++){const dt=new Date(year,month,d),key=localDateKey(dt),sec=byDay[key]||0,cell=document.createElement('div');cell.className='month-day'+(sec?' active':'')+(sec>=DAILY_GOAL?' goal':'')+(key===localDateKey()?' today':'');cell.textContent=d;cell.title=sec?`${prettyMinutes(sec)} trained`:'No training';cal.appendChild(cell)}
  }

  function renderHistory(){
    const history=getHistory(),today=todaySummary(history);el('todayTime').textContent=prettyMinutes(today.seconds);el('todaySessions').textContent=today.items.length;el('todayRounds').textContent=today.rounds;el('currentStreak').textContent=calculateStreak(history);
    el('goalProgressText').textContent=`${shortDuration(today.seconds)} / 6:00`;el('goalFill').style.width=`${Math.min(100,(today.seconds/DAILY_GOAL)*100)}%`;const badge=el('goalBadge');const complete=today.seconds>=DAILY_GOAL;badge.textContent=complete?'Complete ✓':'Keep going';badge.classList.toggle('complete',complete);
    const days=[];for(let i=6;i>=0;i--){const d=new Date();d.setHours(12,0,0,0);d.setDate(d.getDate()-i);const key=localDateKey(d),sec=history.filter(x=>x.date===key).reduce((a,x)=>a+(x.seconds||0),0);days.push({d,key,sec})}
    const max=Math.max(1,...days.map(x=>x.sec)),total=days.reduce((a,x)=>a+x.sec,0);el('weekTotal').textContent=`${prettyMinutes(total)} total`;const chart=el('weekChart');chart.innerHTML='';days.forEach((x,i)=>{const col=document.createElement('div');col.className='day-column'+(i===6?' today':'');const value=document.createElement('div');value.className='day-value';value.textContent=x.sec?`${Math.round(x.sec/60)}m`:'';const track=document.createElement('div');track.className='day-bar-track';const bar=document.createElement('div');bar.className='day-bar';bar.style.height=x.sec?`${Math.max(5,(x.sec/max)*100)}%`:'3px';bar.style.opacity=x.sec?'1':'.18';const name=document.createElement('div');name.className='day-name';name.textContent=x.d.toLocaleDateString(undefined,{weekday:'short'}).slice(0,2);track.appendChild(bar);col.append(value,track,name);chart.appendChild(col)});
    renderMonth(history);
    const recent=el('recentList');recent.innerHTML='';const latest=[...history].sort((a,b)=>new Date(b.timestamp)-new Date(a.timestamp)).slice(0,8);if(!latest.length)recent.innerHTML='<div class="empty-history">Complete a breathing session and it will appear here automatically.</div>';else latest.forEach(x=>{const d=new Date(x.timestamp),row=document.createElement('div');row.className='session-row';const main=document.createElement('div');main.className='session-main';const b=document.createElement('b');b.textContent=d.toLocaleDateString(undefined,{weekday:'short',day:'numeric',month:'short'});const sub=document.createElement('span');sub.textContent=`${d.toLocaleTimeString(undefined,{hour:'2-digit',minute:'2-digit'})} · ${x.rounds} rounds`;const dur=document.createElement('div');dur.className='session-duration';dur.textContent=prettyMinutes(x.seconds||0);main.append(b,sub);row.append(main,dur);recent.appendChild(row)});
  }

  function showCompletion(){
    const h=getHistory(),today=todaySummary(h),streak=calculateStreak(h);el('completedTime').textContent=shortDuration(totalRounds*ROUND_SECONDS);el('completedRounds').textContent=totalRounds;el('completedStreak').textContent=streak;el('goalCompleteMessage').classList.toggle('hidden',today.seconds<DAILY_GOAL);el('completionDialog').classList.add('open');
  }
  function complete(){ state='complete';clearInterval(timer);cancelAnimationFrame(raf);releaseWake();clearSession();resetGuide();phase='complete';phaseEl.textContent='Well done';countEl.textContent='✓';mainBtn.textContent='Start again';vibrate([30,70,30]);playCompletionChime();saveCompletedSession();renderHistory();updateMeta();showCompletion(); }

  function setRounds(n,doReset=true){ totalRounds=Math.max(3,Math.min(40,+n||19));roundsSelect.value=String(totalRounds);localStorage.setItem(SETTINGS.rounds,totalRounds);updatePresetButtons();if(doReset)reset();else updateMeta(); }

  mainBtn.addEventListener('click',()=>{if(state==='running')pause();else start()});
  stopBtn.addEventListener('click',reset);
  addRoundsBtn.addEventListener('click',()=>{if(state!=='running'&&state!=='paused')return;totalRounds=Math.min(40,totalRounds+2);roundsSelect.value=String(totalRounds);localStorage.setItem(SETTINGS.rounds,totalRounds);persistSession();updateMeta();vibrate([18,35,18]);toast(`2 rounds added · ${totalRounds} total`)});

  document.querySelectorAll('.preset').forEach(b=>b.addEventListener('click',()=>setRounds(+b.dataset.rounds)));
  roundsSelect.addEventListener('change',()=>setRounds(+roundsSelect.value));
  guidanceMode.addEventListener('change',()=>{guidance=guidanceMode.value;localStorage.setItem(SETTINGS.guidance,guidance)});
  el('previewCue').addEventListener('click',()=>{ensureAudio();if(guidance==='ting')playTing(true);else if(guidance==='bowl')playBowl();else if(guidance==='breath')playBreathTone('inhale');else if(guidance==='chime')playSoftChime();else if(guidance==='male'||guidance==='female')speak('Inhale',guidance);else toast('Silent + haptics selected')});
  completionToggle.addEventListener('change',()=>{completionOn=completionToggle.checked;localStorage.setItem(SETTINGS.completion,completionOn)});
  hapticToggle.addEventListener('change',()=>{hapticsOn=hapticToggle.checked;localStorage.setItem(SETTINGS.haptic,hapticsOn);if(hapticsOn)vibrate(25)});
  wakeToggle.addEventListener('change',()=>{wakeOn=wakeToggle.checked;localStorage.setItem(SETTINGS.wake,wakeOn);if(!wakeOn)releaseWake()});
  largeTextToggle.addEventListener('change',()=>{largeTextOn=largeTextToggle.checked;localStorage.setItem(SETTINGS.largeText,largeTextOn);document.body.classList.toggle('large-text',largeTextOn)});

  function modal(id,open=true){el(id).classList.toggle('open',open)}
  el('historyBtn').addEventListener('click',()=>{renderHistory();modal('historyDialog')});el('closeHistory').addEventListener('click',()=>modal('historyDialog',false));
  el('settingsBtn').addEventListener('click',()=>modal('settingsDialog'));el('closeSettings').addEventListener('click',()=>modal('settingsDialog',false));el('doneSettings').addEventListener('click',()=>modal('settingsDialog',false));
  ['historyDialog','settingsDialog'].forEach(id=>el(id).addEventListener('click',e=>{if(e.target===el(id))modal(id,false)}));
  el('completionDone').addEventListener('click',()=>{modal('completionDialog',false);reset()});
  el('breatheAgain').addEventListener('click',()=>{modal('completionDialog',false);reset();start()});

  function loadRecovery(){
    let saved=null;try{saved=JSON.parse(localStorage.getItem(SESSION_KEY)||'null')}catch(e){}
    if(!saved||!saved.phase||Date.now()-(saved.savedAt||0)>6*60*60*1000){clearSession();return}
    totalRounds=Math.max(3,Math.min(40,+saved.totalRounds||19));round=Math.max(1,Math.min(totalRounds,+saved.round||1));phase=saved.phase;remaining=Math.max(1,+saved.remaining||DUR[phase]||1);state='paused';roundsSelect.value=String(totalRounds);phaseEl.textContent='Paused';countEl.textContent=String(remaining).padStart(2,'0');mainBtn.textContent='Resume';updateMeta();el('recoveryCopy').textContent=`Round ${round} of ${totalRounds} was interrupted during ${phaseNames[phase].toLowerCase()}.`;modal('recoveryDialog');
  }
  el('recoverBtn').addEventListener('click',()=>{modal('recoveryDialog',false);resume()});
  el('discardRecovery').addEventListener('click',()=>{modal('recoveryDialog',false);reset()});

  document.addEventListener('visibilitychange',()=>{
    if(document.visibilityState==='hidden'&&state==='running') pause(true);
    else if(document.visibilityState==='visible'&&state==='paused'&&autoPaused) toast('Tap Resume when you are ready');
  });
  window.addEventListener('pagehide',()=>{if(state==='running')pause(true);else persistSession();releaseWake()});
  window.addEventListener('beforeunload',()=>{persistSession();releaseWake()});

  populateRounds();applySettingsUI();resetGuide();updateMeta();renderHistory();loadRecovery();
  if('speechSynthesis' in window){speechSynthesis.getVoices();speechSynthesis.onvoiceschanged=()=>speechSynthesis.getVoices()}
  if('serviceWorker' in navigator&&location.protocol.startsWith('http'))navigator.serviceWorker.register('./sw.js').catch(()=>{});
})();
