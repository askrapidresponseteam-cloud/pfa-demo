(function(){
'use strict';

var D=window.PFA_DATA||{};
var P=window.PFA||{};
var shell=document.getElementById('quizShell');
if(!shell)return;

var TOTAL_QUESTIONS=15;
var QUESTION_SECONDS=10;
var STARTING_LIVES=3;
var EMBLEM_SRC='data:image/png;base64,';
var emblemImagePromise=null;
var timer=null;
var state=emptyState();

function emptyState(){
  return {
    name:'Wildlife Defender',
    questions:[],
    index:0,
    correct:0,
    lives:STARTING_LIVES,
    streak:0,
    bestStreak:0,
    locked:false,
    startTime:0,
    endTime:0,
    answers:[],
    code:makeCode()
  };
}

function q(selector,root){
  return (root||document).querySelector(selector);
}

function qa(selector,root){
  return Array.prototype.slice.call((root||document).querySelectorAll(selector));
}

function escapeText(value){
  if(P.escape)return P.escape(value);
  var div=document.createElement('div');
  div.textContent=value==null?'':String(value);
  return div.innerHTML;
}

function toast(text){
  if(P.toast)P.toast(text);
}

function copy(text){
  if(P.copy)P.copy(text);
}

function store(key,value){
  if(P.store)return P.store(key,value);
  try{
    if(arguments.length===1)return JSON.parse(localStorage.getItem(key)||'null');
    localStorage.setItem(key,JSON.stringify(value));
    return true;
  }catch(error){
    return false;
  }
}

function shuffle(items){
  var out=items.slice();
  for(var i=out.length-1;i>0;i--){
    var j=Math.floor(Math.random()*(i+1));
    var temp=out[i];
    out[i]=out[j];
    out[j]=temp;
  }
  return out;
}

function pickQuestions(){
  return shuffle(D.quizQuestions||[]).slice(0,TOTAL_QUESTIONS);
}

/* The certificate carries a name, so it follows the name rule: letters only,
   Title Case. Anything that is not a name falls back to the default. */
function cleanName(value){
  var R=window.PFA_RULES;
  var name=String(value||'').replace(/\s+/g,' ').trim();
  if(R){
    name=R.normaliseField('name',name);
    if(R.checkField('name',name,{required:false}))name='';
  }
  return name.slice(0,42)||'Wildlife Defender';
}

function makeCode(){
  var date=new Date();
  var stamp=[
    date.getFullYear(),
    String(date.getMonth()+1).padStart(2,'0'),
    String(date.getDate()).padStart(2,'0')
  ].join('');
  var random=Math.random().toString(36).slice(2,7).toUpperCase();
  return 'PFA-WG-'+stamp+'-'+random;
}

function formatTime(seconds){
  seconds=Math.max(0,Math.round(seconds||0));
  var mins=Math.floor(seconds/60);
  var secs=seconds%60;
  return mins+':'+String(secs).padStart(2,'0');
}

function getRank(result){
  var score=result.correct;
  var cleared=result.cleared;
  if(cleared&&score>=13){
    return {
      tier:'Champion',
      title:'Champion of the Wild',
      line:'You cleared the full gauntlet with championship-level accuracy.',
      color:'#0653EE'
    };
  }
  if(cleared&&score>=11){
    return {
      tier:'Ranger',
      title:'Wildlife Ranger',
      line:'You finished the gauntlet and held the field under pressure.',
      color:'#12B578'
    };
  }
  if(score>=7){
    return {
      tier:'Tracker',
      title:'Wildlife Tracker',
      line:'You read the clues well. A cleaner streak gets you to Ranger.',
      color:'#E0B24D'
    };
  }
  return {
    tier:'Scout',
    title:'Field Scout',
    line:'You entered the field. Train up, return, and take another run.',
    color:'#E35A42'
  };
}

function renderStart(){
  stopTimer();
  var previous=store('pfa_champion');
  var previousHtml='';
  if(previous&&previous.total){
    previousHtml='<p class="streak-line" style="margin-top:18px;color:#BFCDE2">Last run: '+escapeText(previous.correct)+' / '+escapeText(previous.total)+' in '+escapeText(formatTime(previous.seconds))+'</p>';
  }
  shell.innerHTML=
    '<div class="gauntlet-start">'+
      '<div class="start-grid">'+
        '<div class="start-panel">'+
          '<p class="champion-kicker">Ready check</p>'+
          '<h3>Step into the wildlife arena.</h3>'+
          '<p>You get fifteen shuffled questions from the PFA learning bank. Each one has a ten-second clock. Correct answers grow your streak. Wrong answers and timeouts burn lives. Your final rank goes on the certificate.</p>'+
          '<div class="power-meter" aria-label="Challenge intensity">'+
            '<div class="power-row"><span>Speed</span><i style="--fill:92%"></i><b>92</b></div>'+
            '<div class="power-row"><span>Risk</span><i style="--fill:78%"></i><b>78</b></div>'+
            '<div class="power-row"><span>Glory</span><i style="--fill:100%"></i><b>100</b></div>'+
          '</div>'+
          previousHtml+
        '</div>'+
        '<div class="name-panel">'+
          '<div>'+
            '<label for="playerName">Name on certificate</label>'+
            '<input id="playerName" type="text" maxlength="42" autocomplete="name" placeholder="Your name">'+
          '</div>'+
          '<button class="btn dark" id="startGame" type="button">Start timed run</button>'+
        '</div>'+
      '</div>'+
    '</div>';
  var input=q('#playerName',shell);
  var start=q('#startGame',shell);
  if(input){
    input.value=state.name==='Wildlife Defender'?'':state.name;
    input.addEventListener('keydown',function(event){
      if(event.key==='Enter')startGame();
    });
  }
  if(start)start.onclick=startGame;
}

function startGame(){
  var input=q('#playerName',shell);
  state=emptyState();
  state.name=cleanName(input&&input.value);
  state.questions=pickQuestions();
  state.startTime=Date.now();
  if(!state.questions.length){
    shell.innerHTML=
      '<div class="gauntlet-start"><div class="start-panel"><p class="champion-kicker">Arena unavailable</p><h3>No questions loaded.</h3><p>Please refresh the page and try again.</p></div></div>';
    return;
  }
  var arena=document.getElementById('arena');
  if(arena&&arena.scrollIntoView)arena.scrollIntoView({behavior:'smooth',block:'start'});
  renderQuestion();
}

function renderQuestion(){
  if(state.index>=state.questions.length||state.lives<=0){
    finishGame();
    return;
  }
  state.locked=false;
  var item=state.questions[state.index];
  var progress=(state.index/state.questions.length)*100;
  shell.innerHTML=
    '<div class="game-screen">'+
      '<div class="arena-head">'+
        '<div class="progress-wrap">'+
          '<div class="progress-label"><span>Round '+escapeText(state.index+1)+' of '+escapeText(state.questions.length)+'</span><span>'+escapeText(state.correct)+' correct</span></div>'+
          '<div class="game-progress" aria-hidden="true"><span style="width:'+progress+'%"></span></div>'+
        '</div>'+
        '<div class="timer-ring" id="timerRing" aria-label="Time left"><span id="timerText">'+QUESTION_SECONDS+'</span></div>'+
        '<div class="life-strip" aria-label="'+state.lives+' lives left">'+renderLives()+'</div>'+
      '</div>'+
      '<div class="game-card">'+
        '<div class="question-meta"><span>Streak '+escapeText(state.streak)+'</span><span>Best '+escapeText(state.bestStreak)+'</span></div>'+
        '<div class="question-text">'+escapeText(item.q)+'</div>'+
        '<div class="option-grid" id="optionGrid">'+renderOptions(item)+'</div>'+
        '<div class="explain-panel" id="explainPanel"></div>'+
      '</div>'+
      '<div class="arena-foot">'+
        '<div class="streak-line" id="streakLine">Answer before the ring empties.</div>'+
        '<button class="btn dark" id="nextQuestion" type="button" style="display:none">Next round</button>'+
      '</div>'+
    '</div>';
  qa('[data-answer]',shell).forEach(function(button){
    button.onclick=function(){
      answer(Number(button.getAttribute('data-answer')),false);
    };
  });
  var next=q('#nextQuestion',shell);
  if(next)next.onclick=nextQuestion;
  startTimer();
}

function renderLives(){
  var html='';
  for(var i=0;i<STARTING_LIVES;i++){
    html+='<span class="life-dot'+(i>=state.lives?' lost':'')+'"></span>';
  }
  return html;
}

function renderOptions(item){
  return (item.o||[]).map(function(option,index){
    return '<button class="option-btn" data-answer="'+index+'" type="button"><span>'+escapeText(option)+'</span></button>';
  }).join('');
}

function startTimer(){
  stopTimer();
  var started=Date.now();
  updateTimer(QUESTION_SECONDS);
  timer=setInterval(function(){
    var elapsed=(Date.now()-started)/1000;
    var remaining=Math.max(0,QUESTION_SECONDS-elapsed);
    updateTimer(remaining);
    if(remaining<=0){
      answer(null,true);
    }
  },100);
}

function stopTimer(){
  if(timer){
    clearInterval(timer);
    timer=null;
  }
}

function updateTimer(remaining){
  var ring=q('#timerRing',shell);
  var text=q('#timerText',shell);
  var pct=Math.max(0,Math.min(100,(remaining/QUESTION_SECONDS)*100));
  if(ring){
    ring.style.setProperty('--time',pct+'%');
    ring.style.background='conic-gradient('+(remaining<=3?'#E35A42':'#E0B24D')+' var(--time),rgba(255,255,255,.13) 0)';
  }
  if(text)text.textContent=String(Math.ceil(remaining));
}

function answer(choice,timedOut){
  if(state.locked)return;
  state.locked=true;
  stopTimer();
  var item=state.questions[state.index];
  var good=!timedOut&&choice===item.a;
  var buttons=qa('[data-answer]',shell);
  buttons.forEach(function(button){
    var value=Number(button.getAttribute('data-answer'));
    button.disabled=true;
    if(value===item.a)button.classList.add('correct');
    if(!good&&value===choice)button.classList.add('wrong');
  });
  if(good){
    state.correct++;
    state.streak++;
    state.bestStreak=Math.max(state.bestStreak,state.streak);
  }else{
    state.lives=Math.max(0,state.lives-1);
    state.streak=0;
  }
  state.answers.push({
    q:item.q,
    choice:choice,
    correct:item.a,
    good:good,
    timedOut:timedOut
  });
  var lifeStrip=q('.life-strip',shell);
  if(lifeStrip){
    lifeStrip.innerHTML=renderLives();
    lifeStrip.setAttribute('aria-label',state.lives+' lives left');
  }
  var explain=q('#explainPanel',shell);
  var right=(item.o||[])[item.a]||'the correct answer';
  var lead=good?'Correct. Streak secured. ':timedOut?'Time out. The correct answer was '+right+'. ':'Not this time. The correct answer was '+right+'. ';
  if(explain){
    explain.textContent=lead+(item.x||item.f||'');
    explain.classList.add('show');
  }
  var next=q('#nextQuestion',shell);
  if(next){
    next.style.display='inline-flex';
    next.textContent=(state.lives<=0||state.index+1>=state.questions.length)?'See result':'Next round';
    next.focus();
  }
  var streak=q('#streakLine',shell);
  if(streak){
    streak.textContent=good?'Streak '+state.streak+'. Keep moving.':state.lives+' lives left.';
  }
}

function nextQuestion(){
  state.index++;
  if(state.lives<=0||state.index>=state.questions.length){
    finishGame();
    return;
  }
  renderQuestion();
}

function finishGame(){
  stopTimer();
  state.endTime=Date.now();
  var elapsed=Math.max(1,Math.round((state.endTime-state.startTime)/1000));
  var result={
    name:state.name,
    correct:state.correct,
    total:state.questions.length||TOTAL_QUESTIONS,
    lives:state.lives,
    seconds:elapsed,
    bestStreak:state.bestStreak,
    cleared:state.index>=state.questions.length&&state.lives>0,
    code:state.code,
    at:Date.now()
  };
  result.rank=getRank(result);
  store('pfa_champion',result);
  renderResult(result);
}

function renderResult(result){
  var rank=result.rank;
  shell.innerHTML=
    '<div class="result-card">'+
      '<div class="result-layout">'+
        '<div class="result-copy">'+
          '<p class="champion-kicker">Run complete</p>'+
          '<h3>'+escapeText(rank.title)+'</h3>'+
          '<p>'+escapeText(rank.line)+' Your Certificate of Appreciation is ready as a downloadable PNG.</p>'+
          '<div class="score-grid">'+
            '<div class="score-box"><strong>'+escapeText(result.correct)+' / '+escapeText(result.total)+'</strong><span>Score</span></div>'+
            '<div class="score-box"><strong>'+escapeText(result.lives)+'</strong><span>Lives left</span></div>'+
            '<div class="score-box"><strong>'+escapeText(formatTime(result.seconds))+'</strong><span>Time</span></div>'+
          '</div>'+
          '<div class="name-panel">'+
            '<div>'+
              '<label for="certPlayerName">Certificate name</label>'+
              '<input id="certPlayerName" type="text" maxlength="42" value="'+escapeText(result.name)+'">'+
            '</div>'+
            '<div class="result-actions">'+
              '<button class="btn dark" id="downloadCert" type="button">Download certificate</button>'+
              '<button class="btn light" id="shareCert" type="button">Share certificate</button>'+
              '<button class="btn light" id="copyScore" type="button">Copy score</button>'+
              '<button class="btn light" id="playAgain" type="button">Play again</button>'+
              /* The Gauntlet used to end here, which made it a toy. It is the
                 entrance trial for training, so the run should hand you on. */
              '<a class="btn light" href="get-involved.html#apply">'+
                (result.cleared?'Apply to train with PFA':'Train with PFA anyway')+
              '</a>'+
            '</div>'+
          '</div>'+
        '</div>'+
        certificatePreview(result)+
      '</div>'+
    '</div>';
  var input=q('#certPlayerName',shell);
  if(input){
    input.addEventListener('input',function(){
      result.name=cleanName(input.value);
      updateCertificatePreview(result);
    });
  }
  var download=q('#downloadCert',shell);
  var share=q('#shareCert',shell);
  var score=q('#copyScore',shell);
  var again=q('#playAgain',shell);
  if(download)download.onclick=function(){downloadCertificate(result);};
  if(share)share.onclick=function(){shareCertificate(result);};
  if(score)score.onclick=function(){copy(shareText(result));};
  if(again)again.onclick=function(){state=emptyState();renderStart();};
}

function certificatePreview(result){
  var issueDate=new Date(result.at).toLocaleDateString('en-IN',{year:'numeric',month:'long',day:'numeric'});
  return ''+
    '<div class="certificate-preview" id="certificatePreview">'+
      '<span class="cert-corner tl"></span><span class="cert-corner tr"></span><span class="cert-corner bl"></span><span class="cert-corner br"></span>'+
      '<div class="cert-preview-inner">'+
        '<div>'+
          '<img class="cert-brand-mark" src="media/pfa-emblem.png" alt="People for Animals">'+
          '<div class="cert-brand-name">People for Animals</div>'+
          '<div class="cert-title">Certificate of Appreciation</div>'+
          '<div class="cert-presented">Is proudly presented to</div>'+
          '<div class="cert-name" id="certName">'+escapeText(result.name)+'</div>'+
          '<div class="cert-ornament"><span></span></div>'+
          '<div class="cert-meta" id="certMeta">'+escapeText(certificateBody(result))+'</div>'+
        '</div>'+
        '<div class="cert-signature-row">'+
          '<div class="cert-line">Authorised Signatory</div>'+
          '<div class="cert-line"><strong id="certDate">'+escapeText(issueDate)+'</strong>Date of Issue</div>'+
        '</div>'+
        '<div class="cert-bottom">'+
          '<div class="cert-code"><strong id="certCode">Certificate No '+escapeText(result.code)+'</strong>People for Animals. Wildlife Gauntlet</div>'+
        '</div>'+
      '</div>'+
    '</div>';
}

function updateCertificatePreview(result){
  var name=q('#certName',shell);
  var meta=q('#certMeta',shell);
  if(name)name.textContent=result.name;
  if(meta)meta.textContent=certificateBody(result);
}

function shareText(result){
  return result.name+' completed the PFA Wildlife Gauntlet and received a Certificate of Appreciation. Score '+result.correct+' / '+result.total+', best streak '+result.bestStreak+'. Verification '+result.code+'.';
}

function certificateBody(result){
  return 'In heartfelt appreciation for taking the PFA Wildlife Gauntlet, learning with care, and standing with animals. Score '+result.correct+' of '+result.total+'. Best streak '+result.bestStreak+'.';
}

function fileName(result){
  var slug=cleanName(result.name).toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')||'wildlife-defender';
  return 'PFA-Wildlife-Gauntlet-'+slug+'.png';
}

function loadEmbeddedEmblem(){
  if(emblemImagePromise)return emblemImagePromise;
  emblemImagePromise=new Promise(function(resolve){
    if(!EMBLEM_SRC||EMBLEM_SRC.indexOf('data:image')!==0){
      resolve(null);
      return;
    }
    var img=new Image();
    img.onload=function(){resolve(img);};
    img.onerror=function(){resolve(null);};
    img.src=EMBLEM_SRC;
  });
  return emblemImagePromise;
}

function makeCertificateBlob(result){
  return loadEmbeddedEmblem().then(function(emblem){
    var canvas=document.createElement('canvas');
    canvas.width=3000;
    canvas.height=2120;
    return new Promise(function(resolve,reject){
      try{
        drawCertificate(canvas,result,emblem);
        if(canvas.toBlob){
          canvas.toBlob(function(blob){
            resolve({blob:blob,canvas:canvas});
          },'image/png',.96);
        }else{
          resolve({blob:null,canvas:canvas});
        }
      }catch(error){
        reject(error);
      }
    });
  }).catch(function(){
    var canvas=document.createElement('canvas');
    canvas.width=3000;
    canvas.height=2120;
    drawCertificate(canvas,result,null);
    return new Promise(function(resolve){
      if(canvas.toBlob){
        canvas.toBlob(function(blob){
          resolve({blob:blob,canvas:canvas});
        },'image/png',.96);
      }else{
        resolve({blob:null,canvas:canvas});
      }
    });
  });
}

function downloadCertificate(result){
  var input=q('#certPlayerName',shell);
  result.name=cleanName(input&&input.value);
  updateCertificatePreview(result);
  makeCertificateBlob(result).then(function(output){
    triggerCertificateDownload(output,result);
  }).catch(function(){
    toast('Could not create certificate');
  });
}

function triggerCertificateDownload(output,result){
  var urlApi=window.URL||window.webkitURL;
  var objectUrl='';
  var link=document.createElement('a');
  link.download=fileName(result);
  link.rel='noopener';
  try{
    if(output.blob&&urlApi&&urlApi.createObjectURL){
      objectUrl=urlApi.createObjectURL(output.blob);
      link.href=objectUrl;
    }else{
      link.href=output.canvas.toDataURL('image/png');
    }
    document.body.appendChild(link);
    link.click();
    link.remove();
    if(objectUrl){
      setTimeout(function(){urlApi.revokeObjectURL(objectUrl);},1500);
    }
    toast('Certificate downloaded');
  }catch(error){
    try{
      window.open(output.canvas.toDataURL('image/png'),'_blank','noopener');
      toast('Certificate opened. Save the image.');
    }catch(innerError){
      toast('Could not download certificate');
    }
  }
}

function shareCertificate(result){
  var input=q('#certPlayerName',shell);
  result.name=cleanName(input&&input.value);
  updateCertificatePreview(result);
  makeCertificateBlob(result).then(function(output){
    var text=shareText(result);
    if(output.blob&&window.File&&navigator.canShare&&navigator.share){
      var file=new File([output.blob],fileName(result),{type:'image/png'});
      var data={title:'PFA Wildlife Gauntlet',text:text,files:[file]};
      if(navigator.canShare(data)){
        navigator.share(data).catch(function(){copy(text);});
        return;
      }
    }
    if(navigator.share){
      navigator.share({title:'PFA Wildlife Gauntlet',text:text,url:location.href}).catch(function(){copy(text);});
      return;
    }
    copy(text+' '+location.href);
  }).catch(function(){
    copy(shareText(result));
  });
}

function drawCertificateBrand(ctx,emblem){
  ctx.save();
  ctx.textAlign='center';
  if(emblem){
    var logoW=154;
    var logoH=140;
    ctx.drawImage(emblem,1500-logoW/2,150,logoW,logoH);
  }else{
    ctx.fillStyle='#F4EFE2';
    ctx.font='900 92px Arial, Helvetica, sans-serif';
    ctx.fillText('PFA',1500,244);
  }
  ctx.fillStyle='#E4C878';
  ctx.font='900 32px Arial, Helvetica, sans-serif';
  ctx.letterSpacing='10px';
  drawSpacedText(ctx,'PEOPLE FOR ANIMALS',1500,386,10);
  ctx.restore();
}

function drawCertificate(canvas,result,emblem){
  var ctx=canvas.getContext('2d');
  var w=canvas.width;
  var h=canvas.height;
  var gold='#E4C878';
  var softGold='rgba(228,200,120,.58)';
  var ivory='#F2EEE4';
  var muted='rgba(242,238,228,.56)';
  var bg=ctx.createLinearGradient(0,0,w,h);
  bg.addColorStop(0,'#15151B');
  bg.addColorStop(.48,'#090A0E');
  bg.addColorStop(1,'#030405');
  ctx.fillStyle=bg;
  ctx.fillRect(0,0,w,h);

  var glow=ctx.createRadialGradient(1500,140,80,1500,140,930);
  glow.addColorStop(0,'rgba(255,255,255,.18)');
  glow.addColorStop(.32,'rgba(255,255,255,.06)');
  glow.addColorStop(1,'rgba(255,255,255,0)');
  ctx.fillStyle=glow;
  ctx.fillRect(0,0,w,h);
  var midGlow=ctx.createRadialGradient(1500,910,60,1500,910,860);
  midGlow.addColorStop(0,'rgba(255,255,255,.06)');
  midGlow.addColorStop(1,'rgba(255,255,255,0)');
  ctx.fillStyle=midGlow;
  ctx.fillRect(0,0,w,h);

  ctx.strokeStyle='rgba(228,200,120,.88)';
  ctx.lineWidth=3;
  ctx.strokeRect(70,70,w-140,h-140);
  ctx.strokeStyle='rgba(228,200,120,.34)';
  ctx.lineWidth=2;
  ctx.strokeRect(84,84,w-168,h-168);
  drawCornerDiamond(ctx,64,64,gold);
  drawCornerDiamond(ctx,w-64,64,gold);
  drawCornerDiamond(ctx,64,h-64,gold);
  drawCornerDiamond(ctx,w-64,h-64,gold);

  drawCertificateBrand(ctx,emblem);

  ctx.textAlign='center';
  ctx.fillStyle=ivory;
  ctx.font='400 94px Georgia, Times New Roman, serif';
  ctx.fillText('Certificate of Appreciation',1500,594);

  ctx.fillStyle=muted;
  ctx.font='900 27px Arial, Helvetica, sans-serif';
  drawSpacedText(ctx,'IS PROUDLY PRESENTED TO',1500,684,14);

  ctx.fillStyle=gold;
  fitCenteredText(ctx,cleanName(result.name),1500,872,1500,128,66,'700','Georgia, Times New Roman, serif');

  drawOrnament(ctx,1500,990,gold);

  ctx.fillStyle='#DDD5C5';
  ctx.font='italic 43px Georgia, Times New Roman, serif';
  wrapText(ctx,certificateBody(result),1500,1116,1620,68,3);

  var issueDate=new Date(result.at).toLocaleDateString('en-IN',{year:'numeric',month:'long',day:'numeric'});
  drawSignatureBlock(ctx,360,1544,760,'','AUTHORISED SIGNATORY',gold,ivory);
  drawSignatureBlock(ctx,1880,1544,760,issueDate,'DATE OF ISSUE',gold,ivory);

  ctx.strokeStyle='rgba(228,200,120,.18)';
  ctx.lineWidth=1;
  ctx.beginPath();
  ctx.moveTo(260,1776);
  ctx.lineTo(2740,1776);
  ctx.stroke();

  ctx.textAlign='center';
  ctx.fillStyle='rgba(242,238,228,.75)';
  ctx.font='900 24px Arial, Helvetica, sans-serif';
  drawSpacedText(ctx,'CERTIFICATE No '+result.code,1500,1894,6);
  ctx.fillStyle='rgba(242,238,228,.45)';
  drawSpacedText(ctx,'PEOPLE FOR ANIMALS. WILDLIFE GAUNTLET',1500,1938,6);
}

function drawSpacedText(ctx,text,x,y,spacing){
  text=String(text||'');
  spacing=spacing||0;
  var align=ctx.textAlign||'left';
  var width=0;
  for(var i=0;i<text.length;i++){
    width+=ctx.measureText(text.charAt(i)).width;
    if(i<text.length-1)width+=spacing;
  }
  var start=x;
  if(align==='center')start=x-width/2;
  if(align==='right'||align==='end')start=x-width;
  ctx.save();
  ctx.textAlign='left';
  for(var j=0;j<text.length;j++){
    var ch=text.charAt(j);
    ctx.fillText(ch,start,y);
    start+=ctx.measureText(ch).width+spacing;
  }
  ctx.restore();
}

function drawCornerDiamond(ctx,x,y,color){
  ctx.save();
  ctx.translate(x,y);
  ctx.rotate(Math.PI/4);
  ctx.fillStyle=color;
  ctx.fillRect(-10,-10,20,20);
  ctx.restore();
}

function drawOrnament(ctx,cx,y,color){
  ctx.save();
  ctx.strokeStyle='rgba(228,200,120,.52)';
  ctx.lineWidth=2;
  ctx.beginPath();
  ctx.moveTo(cx-260,y);
  ctx.lineTo(cx-44,y);
  ctx.moveTo(cx+44,y);
  ctx.lineTo(cx+260,y);
  ctx.stroke();
  drawCornerDiamond(ctx,cx,y,color);
  ctx.restore();
}

function drawSignatureBlock(ctx,x,y,width,value,label,gold,ivory){
  ctx.save();
  ctx.strokeStyle='rgba(228,200,120,.76)';
  ctx.lineWidth=2;
  ctx.beginPath();
  ctx.moveTo(x,y);
  ctx.lineTo(x+width,y);
  ctx.stroke();
  ctx.textAlign='center';
  if(value){
    ctx.fillStyle=ivory;
    ctx.font='600 42px Georgia, Times New Roman, serif';
    ctx.fillText(value,x+width/2,y-20);
  }
  ctx.fillStyle=ivory;
  ctx.font='900 24px Arial, Helvetica, sans-serif';
  drawSpacedText(ctx,label,x+width/2,y+56,9);
  ctx.restore();
}

function fitCenteredText(ctx,text,x,y,maxWidth,startSize,minSize,weight,family){
  var size=startSize;
  family=family||'Arial, Helvetica, sans-serif';
  do{
    ctx.font=weight+' '+size+'px '+family;
    if(ctx.measureText(text).width<=maxWidth)break;
    size-=4;
  }while(size>minSize);
  ctx.fillText(text,x,y);
}

function wrapText(ctx,text,x,y,maxWidth,lineHeight,maxLines){
  var words=String(text||'').split(/\s+/);
  var line='';
  var lines=[];
  words.forEach(function(word){
    var test=line?line+' '+word:word;
    if(ctx.measureText(test).width>maxWidth&&line){
      lines.push(line);
      line=word;
    }else{
      line=test;
    }
  });
  if(line)lines.push(line);
  lines.slice(0,maxLines||lines.length).forEach(function(part,index){
    ctx.fillText(part,x,y+(index*lineHeight));
  });
}

function roundRect(ctx,x,y,width,height,radius,fill){
  ctx.beginPath();
  ctx.moveTo(x+radius,y);
  ctx.lineTo(x+width-radius,y);
  ctx.quadraticCurveTo(x+width,y,x+width,y+radius);
  ctx.lineTo(x+width,y+height-radius);
  ctx.quadraticCurveTo(x+width,y+height,x+width-radius,y+height);
  ctx.lineTo(x+radius,y+height);
  ctx.quadraticCurveTo(x,y+height,x,y+height-radius);
  ctx.lineTo(x,y+radius);
  ctx.quadraticCurveTo(x,y,x+radius,y);
  ctx.closePath();
  ctx.fillStyle=fill;
  ctx.fill();
}

renderStart();
})();
