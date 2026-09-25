const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');
const QRCode = require('qrcode');

const app = express();
const server = http.createServer(app);
const io = new Server(server);
const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, 'public')));
app.get('/api/join-url', async (req, res) => {
  const host = req.get('host');
  const proto = req.headers['x-forwarded-proto'] || req.protocol;
  const base = `${proto}://${host}`;
  const url = `${base}/player.html`;
  try {
    const dataUrl = await QRCode.toDataURL(url, { width: 280, margin: 2 });
    res.json({ url, qr: dataUrl });
  } catch (e) { res.status(500).json({ error: 'QR generation failed' }); }
});

const rooms = new Map();
const cats = [
  {id:0, name:'Orange Cat', emoji:'🐱', color:'#ff8a3d'},
  {id:1, name:'Blue Cat', emoji:'🐱', color:'#4da6ff'},
  {id:2, name:'Pink Cat', emoji:'🐱', color:'#ff6fae'},
  {id:3, name:'Purple Cat', emoji:'🐱', color:'#9b6cff'},
  {id:4, name:'Green Cat', emoji:'🐱', color:'#50c878'}
];
function code(){ return 'CAREER-' + Math.floor(100 + Math.random()*900); }
function publicRoom(r){
  return {code:r.code, status:r.status, round:r.round, totalRounds:r.totalRounds,
    players:r.players.map(p=>({id:p.id, team:p.team, player:p.player, cat:p.cat, ready:p.ready, score:p.score, answerLocked:p.answerLocked}))};
}
function emitRoom(r){ io.to(r.code).emit('room:update', publicRoom(r)); }
function roomFor(code){ return rooms.get(String(code||'').toUpperCase()); }
function resetRound(r){
  r.answers = []; r.roundStartedAt = Date.now();
  r.players.forEach(p=>{p.answerLocked=false; p.lastAnswer=null; p.roundPoints=0; p.moveTo=null;});
}
function finishRound(r){
  if(r.status !== 'question') return;
  const correct = r.answers.filter(a=>a.correct).sort((a,b)=>a.time-b.time);
  const awards=[5,3,2];
  correct.slice(0,3).forEach((a,i)=>{ const p=r.players.find(x=>x.id===a.playerId); if(p){p.score+=awards[i];p.roundPoints=awards[i];} });
  r.status='results';
  io.to(r.code).emit('round:results', {rankings: correct.map((a,i)=>({playerId:a.playerId, points:awards[i]||0, time:a.time})), players:r.players.map(p=>({id:p.id,team:p.team,score:p.score,roundPoints:p.roundPoints}))});
  emitRoom(r);
}
function startRound(r){
  if(r.round >= r.totalRounds){ r.status='finished'; io.to(r.code).emit('game:finished', publicRoom(r)); return; }
  r.round += 1; r.status='question'; r.answers=[]; r.roundStartedAt=Date.now();
  r.players.forEach(p=>{p.answerLocked=false;p.lastAnswer=null;p.roundPoints=0;p.moveTo=null;});
  io.to(r.code).emit('round:start',{round:r.round,totalRounds:r.totalRounds,startedAt:r.roundStartedAt,question:r.currentQuestion});
  emitRoom(r);
}

io.on('connection', socket=>{
  socket.on('teacher:create', ({totalRounds=12}={})=>{
    let c; do c=code(); while(rooms.has(c));
    const r={code:c, teacherId:socket.id, status:'lobby', round:0, totalRounds:Math.min(15,Math.max(10,Number(totalRounds)||12)), players:[], answers:[], roundStartedAt:null};
    rooms.set(c,r); socket.join(c); socket.data.room=c; socket.data.role='teacher';
    socket.emit('teacher:created', {room:publicRoom(r)}); emitRoom(r);
  });
  socket.on('player:join', ({code:raw,team,player,catId})=>{
    const r=roomFor(raw);
    if(!r) return socket.emit('join:error','Game code not found.');
    if(r.status!=='lobby') return socket.emit('join:error','This game has already started.');
    if(r.players.length>=5) return socket.emit('join:error','This game already has 5 players.');
    const teamName=String(team||'').trim().slice(0,24); if(!teamName) return socket.emit('join:error','Enter a team name.');
    if(r.players.some(p=>p.team.toLowerCase()===teamName.toLowerCase())) return socket.emit('join:error','That team name is already used.');
    const used=r.players.map(p=>p.cat); let chosen=Number(catId); if(!Number.isInteger(chosen)||chosen<0||chosen>4||used.includes(chosen)) chosen=[0,1,2,3,4].find(x=>!used.includes(x));
    const p={id:socket.id,team:teamName,player:String(player||'').trim().slice(0,24),cat:chosen,ready:true,score:0,roundPoints:0,answerLocked:false,lastAnswer:null,moveTo:null};
    r.players.push(p); socket.join(r.code); socket.data.room=r.code; socket.data.role='player'; socket.emit('player:joined',{player:p,room:publicRoom(r)}); emitRoom(r);
  });
  socket.on('teacher:start', ()=>{const r=roomFor(socket.data.room); if(!r||r.teacherId!==socket.id)return; if(r.players.length!==5)return socket.emit('teacher:error','All 5 players must join before starting.'); startRound(r);});
  socket.on('teacher:next', ()=>{const r=roomFor(socket.data.room); if(!r||r.teacherId!==socket.id)return; if(r.status==='results') startRound(r);});
  socket.on('teacher:pause', ()=>{const r=roomFor(socket.data.room); if(!r||r.teacherId!==socket.id)return; if(r.status==='question') {r.status='paused';io.to(r.code).emit('game:paused');emitRoom(r);} else if(r.status==='paused'){r.status='question';io.to(r.code).emit('game:resumed');emitRoom(r);}});
  socket.on('teacher:reset', ()=>{const r=roomFor(socket.data.room); if(!r||r.teacherId!==socket.id)return; r.status='lobby';r.round=0;r.players.forEach(p=>{p.score=0;p.roundPoints=0;p.answerLocked=false;p.lastAnswer=null;});io.to(r.code).emit('game:reset');emitRoom(r);});
  socket.on('teacher:end', ()=>{const r=roomFor(socket.data.room); if(!r||r.teacherId!==socket.id)return; r.status='finished';io.to(r.code).emit('game:finished',publicRoom(r));emitRoom(r);});
  socket.on('player:answer', ({answer})=>{
    const r=roomFor(socket.data.room); const p=r?.players.find(x=>x.id===socket.id);
    if(!r||!p||r.status!=='question'||p.answerLocked) return;
    const idx=Number(answer); if(![0,1,2].includes(idx)) return;
    // The authoritative question is sent separately to clients; the server stores the answer key for the current round.
    if(r.correctIndex===undefined) return;
    const time=Math.max(0,Date.now()-r.roundStartedAt); const correct=idx===r.correctIndex;
    p.answerLocked=true;p.lastAnswer=idx;p.moveTo=idx;
    r.answers.push({playerId:p.id,answer:idx,correct,time});
    socket.emit('answer:locked',{correct,time}); io.to(r.code).emit('player:move',{playerId:p.id,answer:idx,correct}); emitRoom(r);
    if(r.answers.filter(a=>a.correct).length>=3 || r.answers.length===r.players.length) finishRound(r);
  });
  socket.on('round:setQuestion', ({correctIndex,question})=>{
    const r=roomFor(socket.data.room); if(!r||r.teacherId!==socket.id)return;
    r.correctIndex=Number(correctIndex); if (question) r.currentQuestion=question; resetRound(r);
  });
  socket.on('disconnect',()=>{const r=roomFor(socket.data.room); if(!r)return; const idx=r.players.findIndex(p=>p.id===socket.id); if(idx>=0){r.players.splice(idx,1);emitRoom(r);}});
});

server.listen(PORT,'0.0.0.0',()=>console.log(`Cat Dash running on port ${PORT}`));
