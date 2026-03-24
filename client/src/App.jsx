import { useEffect, useState, useMemo } from 'react';
import { socket } from './socket';

function formatCurrency(value) {
  return new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(value);
}

const playWhistle = () => {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain); gain.connect(ctx.destination);
    osc.type = 'square';
    osc.frequency.setValueAtTime(1500, ctx.currentTime);
    osc.frequency.linearRampToValueAtTime(1200, ctx.currentTime + 0.3);
    gain.gain.setValueAtTime(0.05, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
    osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 0.3);
  } catch (e) {}
};

const playGoal = () => {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain); gain.connect(ctx.destination);
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(440, ctx.currentTime);
    osc.frequency.setValueAtTime(554, ctx.currentTime + 0.1);
    osc.frequency.setValueAtTime(659, ctx.currentTime + 0.2);
    gain.gain.setValueAtTime(0.05, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.6);
    osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 0.6);
  } catch (e) {}
};

function App() {
  const [teams, setTeams] = useState([]);
  const [players, setPlayers] = useState([]);
  const [mySquad, setMySquad] = useState([]);
  const [me, setMe] = useState(null);
  
  const [name, setName] = useState('');
  const [roomCode, setRoomCode] = useState('');
  const [isNewRoom, setIsNewRoom] = useState(true);
  const [availableSaves, setAvailableSaves] = useState([]);
  
  const [matchResults, setMatchResults] = useState(null);
  const [matchweekCount, setMatchweekCount] = useState(0);
  const [activeTab, setActiveTab] = useState('dashboard');
  const [marketPairs, setMarketPairs] = useState([]);
  const [tactic, setTactic] = useState({ formation: '4-4-2', style: 'Balanced' });
  const [liveMinute, setLiveMinute] = useState(90);
  const [isPlayingMatch, setIsPlayingMatch] = useState(false);
  const [subsMade, setSubsMade] = useState(0);
  const [swapSource, setSwapSource] = useState(null);
  
  useEffect(() => {
    // Fetch saves on mount
    fetch('http://localhost:3000/saves')
      .then(r => r.json())
      .then(data => {
         setAvailableSaves(data);
         if (data.length > 0) {
            setIsNewRoom(false);
            setRoomCode(data[0]);
         }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    socket.on('teamsData', (data) => setTeams(data));
    socket.on('playerListUpdate', (data) => {
      setPlayers(data);
    });
    socket.on('mySquad', (data) => setMySquad(data));
    socket.on('marketUpdate', (data) => setMarketPairs(data));
    socket.on('systemMessage', (msg) => alert(msg));
    
    socket.on('halfTimeResults', (data) => {
      setMatchResults(data);
      setLiveMinute(0);
      setSubsMade(0);
      setSwapSource(null);
      setIsPlayingMatch(true);
      setActiveTab('live');
      playWhistle();
    });

    socket.on('matchResults', (data) => {
      setMatchResults(data);
      setMatchweekCount((prev) => prev + 1);
      setLiveMinute(45);
      setIsPlayingMatch(true);
      setActiveTab('live');
      playWhistle();
    });
    
    return () => {
      socket.off('teamsData'); socket.off('playerListUpdate');
      socket.off('mySquad'); socket.off('marketUpdate');
      socket.off('systemMessage'); socket.off('matchResults');
    };
  }, [me]);

  useEffect(() => {
    const onConnect = () => {
      if (me && me.roomCode && me.name) {
        socket.emit('joinGame', { name: me.name, roomCode: me.roomCode });
      }
    };
    socket.on('connect', onConnect);
    return () => socket.off('connect', onConnect);
  }, [me]);

  useEffect(() => {
    if (me && !me.teamId && players.length > 0) {
      const p = players.find(x => x.name === me.name);
      if (p && p.teamId) {
        setMe(p);
      }
    }
  }, [players, me]);

  useEffect(() => {
    if (isPlayingMatch) {
      const matchEvents = matchResults?.results?.[0]?.events || [];
      const hasSecondHalf = matchEvents.some(e => e.minute > 45);

      if (liveMinute < 45 || (liveMinute >= 45 && liveMinute < 90 && hasSecondHalf)) {
        const timer = setTimeout(() => {
          setLiveMinute(m => m + 1);
        }, 1000);
        return () => clearTimeout(timer);
      } else if (liveMinute === 45 && !hasSecondHalf) {
        setIsPlayingMatch(false);
      } else if (liveMinute >= 90) {
        const timer = setTimeout(() => {
           setIsPlayingMatch(false);
           setActiveTab('standings');
        }, 3000);
        return () => clearTimeout(timer);
      }
    }
  }, [isPlayingMatch, liveMinute, matchResults]);

  const handleJoin = () => {
    if (name && roomCode) {
      socket.emit('joinGame', { name, roomCode: roomCode.toUpperCase() });
      setMe({ name, roomCode: roomCode.toUpperCase() });
    }
  };

  const handleReady = () => {
    const isReady = players.find(p => p.name === me?.name)?.ready;
    socket.emit('setReady', !isReady);
  };

  const buyPlayer = (playerId) => {
    if (confirm('Fazer proposta de transferência por este jogador? (+20% prémio de assinatura)')) {
      socket.emit('buyPlayer', playerId);
    }
  };

  const updateTactic = (updates) => {
    const newTactic = { ...tactic, ...updates };
    setTactic(newTactic);
    socket.emit('setTactic', newTactic);
  };

  const handleAutoPick = (formationStr = tactic.formation) => {
      const sorted = [...mySquad].sort((a,b) => (b.skill * (b.form/100)) - (a.skill * (a.form/100)));
      const parts = formationStr.split('-');
      const req = { 'GK': 1, 'DEF': parseInt(parts[0]), 'MID': parseInt(parts[1]), 'ATK': parseInt(parts[2]) };
      const filled = { 'GK': 0, 'DEF': 0, 'MID': 0, 'ATK': 0 };
      
      const newPos = {};
      let bench = 5;

      sorted.forEach(p => {
         if (filled[p.position] < req[p.position]) {
             newPos[p.id] = 'Titular';
             filled[p.position]++;
         } else if (bench > 0) {
             newPos[p.id] = 'Suplente';
             bench--;
         } else {
             newPos[p.id] = 'Reserva';
         }
      });
      
      const tits = Object.values(newPos).filter(v => v === 'Titular').length;
      if (tits < 11) {
         sorted.forEach(p => {
            if (newPos[p.id] !== 'Titular' && Object.values(newPos).filter(v => v==='Titular').length < 11) {
               newPos[p.id] = 'Titular';
            }
         });
      }
      updateTactic({ formation: formationStr, positions: newPos });
  };

  useEffect(() => {
     if (mySquad.length > 0 && !tactic.positions) {
        handleAutoPick();
     }
  }, [mySquad, tactic.positions]);

  const handleSubSwap = (playerId) => {
     if (!swapSource) {
        setSwapSource(playerId);
     } else {
        if (swapSource === playerId) {
           setSwapSource(null);
        } else {
           if (activeTab === 'live' && subsMade >= 3) {
              alert('Já fizeste as 3 substituições permitidas!');
              setSwapSource(null);
              return;
           }
           const newPos = { ...tactic.positions };
           const temp = newPos[swapSource];
           newPos[swapSource] = newPos[playerId];
           newPos[playerId] = temp;
           
           updateTactic({ positions: newPos });
           if (activeTab === 'live') setSubsMade(s => s + 1);
           setSwapSource(null);
        }
     }
  };

  const annotatedSquad = useMemo(() => {
    if (!tactic.positions) return [...mySquad].map(p => ({...p, status: 'Reserva'}));
    const mapped = mySquad.map(p => ({ ...p, status: tactic.positions[p.id] || 'Reserva' }));
    const s = {Titular:1, Suplente:2, Reserva:3}; 
    return mapped.sort((a,b) => s[a.status] - s[b.status]);
  }, [mySquad, tactic.positions]);

  if (!me || !me.teamId) {
    return (
      <div className="min-h-screen bg-zinc-950 text-zinc-100 p-8 flex flex-col items-center justify-center font-sans">
        <h1 className="text-6xl font-black text-amber-500 mb-8 drop-shadow-xl tracking-tighter">CashBall <span className="text-zinc-100">26/27</span></h1>
        <div className="bg-zinc-900 p-8 rounded-3xl w-full max-w-md border border-zinc-800 relative overflow-hidden shadow-2xl">
          <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-amber-600 via-amber-400 to-amber-600"></div>
          
          <div className="flex gap-2 mb-6">
            <button onClick={() => setIsNewRoom(true)} className={`flex-1 py-3 text-sm font-black uppercase rounded-xl transition-all ${isNewRoom ? 'bg-amber-500 text-zinc-950' : 'bg-zinc-800 text-zinc-400'}`}>Nova Sala</button>
            <button onClick={() => setIsNewRoom(false)} className={`flex-1 py-3 text-sm font-black uppercase rounded-xl transition-all ${!isNewRoom ? 'bg-amber-500 text-zinc-950' : 'bg-zinc-800 text-zinc-400'}`}>Carregar</button>
          </div>

          <div className="mb-5">
            <label className="block text-[10px] text-base uppercase text-zinc-500 mb-2 font-bold">O teu nome de Treinador</label>
            <input 
              type="text" 
              className="w-full bg-zinc-950 border border-zinc-800 p-4 rounded-xl text-white text-lg font-black outline-none transition-all placeholder:text-zinc-700 focus:ring-2 focus:ring-amber-500"
              value={name} placeholder="Ex: Amorim" onChange={(e) => setName(e.target.value)}
            />
          </div>

          {isNewRoom ? (
            <div className="mb-8">
              <label className="block text-[10px] text-base uppercase text-zinc-500 mb-2 font-bold">Nome do Novo Jogo (SALA)</label>
              <input 
                type="text" 
                className="w-full bg-zinc-950 border border-zinc-800 p-4 rounded-xl text-white text-lg font-black outline-none transition-all placeholder:text-zinc-700 focus:ring-2 focus:ring-amber-500 uppercase"
                value={roomCode} placeholder="INVERNO" onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
              />
              <p className="text-sm font-bold text-amber-500 mt-3 text-center bg-amber-500/10 p-2 rounded-lg">Ficarás com um clube mágico da 4ª Divisão!</p>
            </div>
          ) : (
            <div className="mb-8">
              <label className="block text-[10px] text-base uppercase text-zinc-500 mb-2 font-bold">Salas Gravadas</label>
              <select 
                className="w-full bg-zinc-950 border border-zinc-800 p-4 rounded-xl text-white text-lg font-black outline-none focus:ring-2 focus:ring-amber-500 uppercase"
                value={roomCode} onChange={(e) => setRoomCode(e.target.value)}
              >
                <option value="" disabled>-- Seleciona um Save --</option>
                {availableSaves.map(save => <option key={save} value={save}>{save}</option>)}
              </select>
              {availableSaves.length === 0 && <p className="text-red-400 text-sm mt-2">Nenhum save encontrado no servidor.</p>}
            </div>
          )}

          <button onClick={handleJoin} disabled={!name || !roomCode} className="w-full bg-emerald-500 hover:bg-emerald-400 disabled:bg-zinc-800 disabled:text-zinc-600 text-zinc-950 py-5 rounded-xl font-black text-xl transition-all active:scale-95 border-b-4 border-emerald-700 active:border-b-0">
            {me ? 'A GERAR CONTRATO...' : 'ASSINAR CONTRATO'}
          </button>
        </div>
      </div>
    );
  }

  const teamInfo = teams.find(t => t.id == me.teamId);
  const myMatch = matchResults?.results.find(r => r.homeTeamId === me.teamId || r.awayTeamId === me.teamId);

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 font-sans pb-12 tracking-tight">
      <header className="bg-zinc-900 border-b border-zinc-800 p-4 md:px-8 flex items-center justify-between sticky top-0 shadow-sm z-20">
        <div className="flex items-center gap-4">
          <h1 className="text-2xl md:text-4xl font-black text-amber-500 tracking-tighter">CashBall <span className="text-zinc-100">26/27</span></h1>
          <p className="text-base font-bold text-zinc-400 uppercase">| SALA: {me.roomCode} | Jornada {matchweekCount + 1}</p>
        </div>
        <div className="flex items-center gap-4 hidden md:flex">
          <div className="text-right">
            <p className="font-bold text-lg">{me.name}</p>
            <p className="text-base text-amber-500 font-black tracking-widest">{teamInfo?.name}</p>
          </div>
        </div>
      </header>
      
      <div className="max-w-[1400px] mx-auto p-4 md:p-8">
        <div className="flex gap-4 mb-8 border-b border-zinc-800 pb-px overflow-x-auto">
          {['dashboard', 'live', 'standings', 'squad', 'market', 'finances'].map(tab => (
            <button key={tab} onClick={() => setActiveTab(tab)} className={`px-4 py-3 font-bold text-base md:text-lg uppercase transition-colors border-b-4 ${activeTab === tab ? 'border-amber-500 text-white' : 'border-transparent text-zinc-500 hover:text-zinc-300'}`}>
              {tab === 'dashboard' ? 'Geral' : tab === 'live' ? 'Jornada' : tab === 'standings' ? 'Tabela' : tab === 'squad' ? 'Plantel' : tab === 'market' ? 'Mercado' : 'Finanças'}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-4 gap-8">
          <div className="xl:col-span-3">
            {activeTab === 'dashboard' && (
              <div className="space-y-8">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div className="bg-zinc-900 p-6 rounded-3xl border border-zinc-800 shadow-sm">
                    <p className="text-sm text-zinc-500 uppercase font-black tracking-widest mb-2">Clube</p>
                    <p className="text-3xl font-black">{teamInfo?.name}</p>
                    <p className="text-lg font-semibold text-amber-500 mt-1">Divisão {teamInfo?.division}</p>
                  </div>
                  <div className="bg-amber-500 p-6 rounded-3xl border border-amber-400 text-zinc-950 flex flex-col justify-center items-center">
                    <p className="text-sm uppercase font-black tracking-widest opacity-80 mb-1">Classificação</p>
                    <p className="text-6xl font-black">1º</p>
                  </div>
                </div>
                
                {myMatch && (
                  <div className="bg-zinc-900 rounded-3xl border border-zinc-800 shadow-sm overflow-hidden">
                    <div className="bg-zinc-800/50 p-5 border-b border-zinc-800 flex justify-between">
                      <h3 className="font-bold text-white text-lg tracking-widest uppercase">Último Jogo (Jornada {matchResults.matchweek})</h3>
                    </div>
                    <div className="p-8">
                      <div className="flex items-center justify-center gap-8 mb-8">
                        <div className="text-3xl font-black flex-1 text-right">{teams.find(t => t.id === myMatch.homeTeamId)?.name}</div>
                        <div className="px-6 py-3 bg-zinc-950 border border-zinc-800 rounded-2xl text-6xl font-black text-white shadow-inner flex gap-4">
                          <span>{myMatch.finalHomeGoals ?? 0}</span><span className="text-zinc-700">-</span><span>{myMatch.finalAwayGoals ?? 0}</span>
                        </div>
                        <div className="text-3xl font-black flex-1 text-left">{teams.find(t => t.id === myMatch.awayTeamId)?.name}</div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {activeTab === 'live' && matchResults && (
              <div className="bg-zinc-900 min-h-[600px] text-zinc-100 font-sans p-8 rounded-3xl border border-zinc-800 shadow-sm relative overflow-hidden">
                 {liveMinute === 45 && !isPlayingMatch && (
                   <div className="absolute inset-0 bg-zinc-950/95 z-50 p-8 flex flex-col backdrop-blur-sm">
                      <h2 className="text-4xl font-black text-amber-500 mb-2 tracking-widest text-center uppercase">INTERVALO</h2>
                      <p className="text-center text-zinc-400 font-bold mb-8">Seleciona na Esquerda e na Direita para Substituir (Restam: {3 - subsMade})</p>
                      
                      <div className="flex-1 overflow-y-auto mb-8 grid grid-cols-2 gap-8 bg-zinc-900/50 p-6 rounded-2xl border border-zinc-800">
                         <div>
                           <h3 className="text-emerald-500 font-black mb-4 uppercase tracking-widest text-center">Em Campo (Titulares)</h3>
                           <div className="space-y-2">
                             {annotatedSquad.filter(p => p.status === 'Titular').map(p => (
                               <div key={p.id} onClick={() => handleSubSwap(p.id)} className={`p-3 rounded-lg border cursor-pointer font-bold transition-all flex justify-between select-none ${swapSource === p.id ? 'bg-amber-500 text-zinc-950 border-amber-400 scale-[1.02]' : 'bg-zinc-950 border-zinc-800 hover:border-emerald-500 hover:bg-zinc-800'}`}>
                                  <span>{p.name} <span className="text-[10px] opacity-70 ml-2">{p.position}</span></span>
                                  <span className="opacity-50">{p.skill}</span>
                               </div>
                             ))}
                           </div>
                         </div>
                         <div>
                           <h3 className="text-zinc-500 font-black mb-4 uppercase tracking-widest text-center">Banco (Suplentes)</h3>
                           <div className="space-y-2">
                             {annotatedSquad.filter(p => p.status !== 'Titular').map(p => (
                               <div key={p.id} onClick={() => handleSubSwap(p.id)} className={`p-3 rounded-lg border cursor-pointer font-bold transition-all flex justify-between select-none ${swapSource === p.id ? 'bg-amber-500 text-zinc-950 border-amber-400 scale-[1.02]' : 'bg-zinc-950 border-zinc-800 hover:border-zinc-500 hover:bg-zinc-800'}`}>
                                  <span>{p.name} <span className="text-[10px] opacity-70 ml-2">{p.position}</span></span>
                                  <span className={`opacity-80 ${p.status==='Suplente'?'text-emerald-400':'text-zinc-600'}`}>{p.status} {p.skill}</span>
                               </div>
                             ))}
                           </div>
                         </div>
                      </div>
                      
                      <button onClick={handleReady} className={`w-full py-6 rounded-2xl text-2xl font-black uppercase tracking-widest transition-all shadow-[0_0_30px_rgba(217,119,6,0.3)] ${players.find(p => p.name === me.name)?.ready ? 'bg-zinc-800 text-zinc-500' : 'bg-amber-600 hover:bg-amber-500 text-zinc-950'}`}>
                         {players.find(p => p.name === me.name)?.ready ? 'A AGUARDAR ADVERSÁRIOS...' : 'CONFIRMAR E IR PARA A 2ª PARTE'}
                      </button>
                   </div>
                 )}

                 <div className="absolute top-6 right-6 flex items-center gap-3">
                    {isPlayingMatch && <div className="w-4 h-4 rounded-full bg-red-600 animate-pulse"></div>}
                    <span className="text-3xl font-mono font-black">{Math.min(liveMinute, 90)}'</span>
                 </div>
                 <h2 className="text-2xl font-black text-amber-500 mb-8 pb-4 border-b border-zinc-800">Jornada em Direto {liveMinute === 45 && !isPlayingMatch ? '(INTERVALO)' : ''}</h2>

                 <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                   {[1,2,3,4].map(div => (
                     <div key={div}>
                       <h3 className="text-zinc-500 font-black uppercase text-sm mb-4">{div}ª Divisão</h3>
                       <div className="space-y-2">
                         {matchResults.results.filter(m => teams.find(t => t.id === m.homeTeamId)?.division === div).map((match, idx) => {
                            const hInfo = teams.find(t => t.id === match.homeTeamId);
                            const aInfo = teams.find(t => t.id === match.awayTeamId);
                            const matchEvents = match.events || [];
                            const currentHome = matchEvents.filter(e => e.minute <= liveMinute && e.type === 'goal' && e.team === 'home');
                            const currentAway = matchEvents.filter(e => e.minute <= liveMinute && e.type === 'goal' && e.team === 'away');
                            
                            const maxEvents = matchEvents.filter(e => e.minute <= liveMinute);
                            const scorersList = maxEvents.filter(e => e.type==='goal').sort((a,b) => a.minute - b.minute).map(g => {
                               const nameMatch = g.text ? g.text.match(/! (.*)$/) : null;
                               return `${nameMatch ? nameMatch[1] : 'Jgdr'} ${g.minute}'`;
                            }).join(', ');
                            
                            const isMyMatch = match.homeTeamId === me.teamId || match.awayTeamId === me.teamId;

                            return (
                              <div key={idx} className={`flex items-center text-sm font-bold bg-zinc-950 rounded-xl px-4 py-3 border ${isMyMatch ? 'border-amber-500 bg-amber-500/10' : 'border-zinc-800/50'}`}>
                                <div className={`w-32 uppercase truncate font-black text-right pr-4 ${isMyMatch ? 'text-amber-500' : 'text-zinc-300'}`}>{hInfo?.name}</div>
                                <div className="px-3 py-1 bg-zinc-900 rounded font-black text-white text-center shadow-inner text-base min-w-[50px]">{currentHome.length} - {currentAway.length}</div>
                                <div className={`w-32 uppercase truncate font-black text-left pl-4 ${isMyMatch ? 'text-amber-500' : 'text-zinc-300'}`}>{aInfo?.name}</div>
                                <div className="ml-4 text-xs font-medium text-zinc-500 flex-1 truncate">
                                  {scorersList && `⚽ ${scorersList}`}
                                </div>
                              </div>
                            );
                         })}
                       </div>
                     </div>
                   ))}
                 </div>
              </div>
            )}

            {activeTab === 'standings' && (
              <div className="bg-zinc-900 min-h-[600px] text-zinc-100 font-sans p-8 rounded-3xl border border-zinc-800 shadow-sm relative overflow-hidden">
                 <h2 className="text-2xl font-black text-amber-500 mb-8 pb-4 border-b border-zinc-800">Classificação Geral (Jornada {matchweekCount})</h2>
                 
                 <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-12 gap-y-8">
                   {[1,2,3,4].map(div => (
                     <div key={div}>
                       <h3 className="text-zinc-500 font-black uppercase text-sm mb-4">{div}ª Divisão</h3>
                       <div className="bg-zinc-950 border border-zinc-800 p-2 rounded-xl">
                         <table className="w-full text-xs font-bold text-right border-collapse">
                           <thead className="text-zinc-500 border-b border-zinc-800">
                             <tr>
                               <th className="text-left p-2">Equipa</th>
                               <th className="p-2 w-8 text-center">J</th>
                               <th className="p-2 w-8 text-center">V</th>
                               <th className="p-2 w-8 text-center text-zinc-600">E</th>
                               <th className="p-2 w-8 text-center text-red-500/50">D</th>
                               <th className="p-2 w-16 text-center">G</th>
                               <th className="p-2 w-10 text-center text-amber-500">Pts</th>
                             </tr>
                           </thead>
                           <tbody className="divide-y divide-zinc-800/50">
                             {teams.filter(t => t.division === div).sort((a,b) => (b.points||0) - (a.points||0) || ((b.goals_for||0) - (b.goals_against||0)) - ((a.goals_for||0) - (a.goals_against||0))).map((t, idx) => {
                               const isMe = t.id == me.teamId;
                               return (
                                 <tr key={t.id} className={`hover:bg-zinc-900 transition-colors ${isMe ? 'bg-amber-500/10' : ''}`}>
                                   <td className={`text-left uppercase p-2 w-[40%] truncate font-black ${isMe ? 'text-amber-500' : 'text-white'}`}>{idx+1}. {t.name}</td>
                                   <td className="w-8 text-center p-2 text-zinc-400">{(t.wins||0) + (t.draws||0) + (t.losses||0)}</td>
                                   <td className="w-8 text-center p-2 text-zinc-300">{t.wins||0}</td>
                                   <td className="w-8 text-center p-2 text-zinc-500">{t.draws||0}</td>
                                   <td className="w-8 text-center p-2 text-red-400/70">{t.losses||0}</td>
                                   <td className="w-16 text-center p-2 tracking-widest text-zinc-300">{t.goals_for||0}:{t.goals_against||0}</td>
                                   <td className="w-10 text-center p-2 text-white bg-zinc-900 rounded font-black">{t.points||0}</td>
                                 </tr>
                               );
                             })}
                           </tbody>
                         </table>
                       </div>
                     </div>
                   ))}
                 </div>
              </div>
            )}

            {activeTab === 'squad' && (
              <div className="space-y-6">
                <div className="bg-zinc-900 rounded-2xl border border-zinc-800 p-6 flex flex-col md:flex-row justify-between gap-4">
                  <div className="flex gap-4">
                    <select className="bg-zinc-950 border border-zinc-700 rounded-lg px-4 py-3 text-base font-bold text-white focus:ring-2 focus:ring-amber-500" value={tactic.formation} onChange={(e) => handleAutoPick(e.target.value)}>
                      <option value="4-4-2">4-4-2 Clássico</option>
                      <option value="4-3-3">4-3-3 Ofensivo</option>
                      <option value="3-5-2">3-5-2 Controlo da Bola</option>
                      <option value="5-3-2">5-3-2 Autocarro</option>
                      <option value="4-5-1">4-5-1 Catenaccio</option>
                      <option value="3-4-3">3-4-3 Ataque Total</option>
                      <option value="4-2-4">4-2-4 Avassalador</option>
                      <option value="5-4-1">5-4-1 Ferrolho</option>
                    </select>
                    <select className="bg-zinc-950 border border-zinc-700 rounded-lg px-4 py-3 text-base font-bold text-emerald-400 focus:ring-2 focus:ring-amber-500" value={tactic.style} onChange={(e) => updateTactic({ style: e.target.value })}>
                      <option value="Balanced">Equilibrado</option>
                      <option value="Offensive">Ofensivo (+15% Atk)</option>
                      <option value="Defensive">Defensivo (+20% Def)</option>
                    </select>
                  </div>
                  <p className="text-zinc-500 text-sm font-bold max-w-sm mt-3 md:mt-0 leading-tight">Clica nos jogadores em qualquer momento para escolheres os teus Titulares manualmente (Máx 3 Substituições durante o Intervalo do jogo).</p>
                </div>

                <div className="bg-zinc-900 rounded-3xl border border-zinc-800 shadow-sm overflow-hidden">
                  <table className="w-full text-left text-base">
                    <thead>
                      <tr className="bg-zinc-950/50 text-zinc-400 uppercase text-xs tracking-widest border-b border-zinc-800">
                        <th className="p-5 font-black">Seleção Clica p/Trocar</th>
                        <th className="p-5 font-black">Pos</th>
                        <th className="p-5 font-black">Nome</th>
                        <th className="p-5 font-black text-center">Nac</th>
                        <th className="p-5 font-black text-center">Qual</th>
                        <th className="p-5 font-black w-40 text-center">Forma</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-800/50 font-medium">
                      {annotatedSquad.map(player => (
                        <tr key={player.id} onClick={() => handleSubSwap(player.id)} className={`cursor-pointer hover:bg-zinc-800/50 transition-colors group select-none ${player.status==='Titular' ? 'bg-amber-500/5' : ''} ${swapSource === player.id ? 'ring-2 ring-inset ring-amber-500 bg-amber-500/20' : ''}`}>
                          <td className="p-5">
                            <span className={`text-xs px-2 py-1 rounded font-black tracking-widest uppercase shadow-sm ${player.status==='Titular' ? 'bg-amber-500 text-zinc-950': player.status==='Suplente' ? 'bg-zinc-700 text-white' : 'text-zinc-600 border border-zinc-800'}`}>{player.status}</span>
                          </td>
                          <td className={`p-5 font-black text-sm tracking-wider ${player.position === 'GK' ? 'text-yellow-500' : player.position === 'DEF' ? 'text-blue-500' : 'text-green-500'}`}>{player.position}</td>
                          <td className="p-5 font-bold text-white text-lg">{player.name}</td>
                          <td className="p-5 text-center text-zinc-400 font-bold">{player.nationality}</td>
                          <td className="p-5 text-center"><span className="bg-zinc-950 text-white font-black px-3 py-2 rounded text-lg border border-zinc-800">{player.skill}</span></td>
                          <td className="p-5">
                            <div className="flex items-center gap-3">
                              <div className="flex-1 bg-zinc-950 rounded-full h-3 overflow-hidden">
                                <div className={`h-3 rounded-full ${player.form > 90 ? 'bg-emerald-500' : player.form > 70 ? 'bg-amber-500' : 'bg-red-500'}`} style={{width: `${player.form}%`}}></div>
                              </div>
                              <span className="text-xs font-bold tracking-wider text-zinc-400 w-8">{player.form}</span>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {activeTab === 'market' && (
              <div className="bg-zinc-900 rounded-3xl border border-zinc-800 shadow-sm overflow-hidden">
                <table className="w-full text-left text-base">
                  <thead>
                    <tr className="bg-zinc-950/50 text-zinc-500 uppercase text-xs border-b border-zinc-800">
                      <th className="p-5 font-black">Pos</th>
                      <th className="p-5 font-black">Nome / Origem</th>
                      <th className="p-5 font-black text-center">Qual</th>
                      <th className="p-5 font-black text-right">Cláusula Rescisão</th>
                      <th className="p-5"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800/50 font-medium">
                    {marketPairs.filter(p => p.team_id !== me.teamId).map(player => {
                      const price = player.value * 1.2;
                      const canAfford = teamInfo?.budget >= price;
                      return (
                        <tr key={player.id} className="hover:bg-zinc-800/50 transition-colors">
                          <td className="p-5 font-black text-sm">{player.position}</td>
                          <td className="p-5"><p className="font-bold text-white text-lg">{player.name}</p></td>
                          <td className="p-5 text-center"><span className="bg-emerald-950 text-emerald-400 font-black px-3 py-2 rounded text-lg">{player.skill}</span></td>
                          <td className="p-5 text-right font-mono text-zinc-300 text-lg">{formatCurrency(price)}</td>
                          <td className="p-5 text-right">
                            <button onClick={() => buyPlayer(player.id)} disabled={!canAfford} className="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-30 disabled:hover:bg-emerald-600 text-white font-black uppercase text-sm px-6 py-3 rounded">
                              {canAfford ? 'Comprar' : 'Sem Gito'}
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {activeTab === 'finances' && (
              <div className="bg-zinc-900 p-8 rounded-3xl border border-zinc-800 shadow-sm">
                <h2 className="text-2xl font-black mb-8 text-emerald-400">Resumo Financeiro</h2>
                <div className="space-y-6 text-lg">
                  <div className="flex justify-between border-b border-zinc-800 pb-4">
                    <span className="text-zinc-400 font-bold">Orçamento Atual:</span>
                    <span className="font-mono text-white text-2xl font-black">{formatCurrency(teamInfo?.budget || 0)}</span>
                  </div>
                  <div className="flex justify-between border-b border-zinc-800 pb-4">
                    <span className="text-zinc-400 font-bold">Salários Activos (Semanais):</span>
                    <span className="font-mono text-red-400 font-bold">- {formatCurrency(mySquad.reduce((acc, p) => acc + p.wage, 0))}</span>
                  </div>
                  <div className="flex justify-between border-b border-zinc-800 pb-4">
                    <span className="text-zinc-400 font-bold">Bilheteiras (10€ \ lugar):</span>
                    <span className="font-mono text-emerald-400 font-bold">+ {formatCurrency((teamInfo?.stadium_capacity || 5000) * 10)}</span>
                  </div>
                  
                  <div className="flex justify-between border-b border-zinc-800 pb-4">
                    <span className="text-zinc-400 font-bold">Lotação do Estádio:</span>
                    <span className="font-mono text-white text-xl font-bold">{teamInfo?.stadium_capacity?.toLocaleString() || 5000} Lugares</span>
                  </div>

                  <div className="flex justify-between pb-4">
                    <span className="text-zinc-400 font-bold">Dívida ao Banco:</span>
                    <span className="font-mono text-red-500 text-xl font-bold">{formatCurrency(teamInfo?.loan_amount || 0)} <span className="text-sm">(5% juros/sem)</span></span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-8 pt-4 border-t border-zinc-800">
                    <div className="bg-zinc-950 p-4 rounded-xl border border-emerald-900 border-opacity-30">
                      <p className="text-sm font-bold text-amber-500 mb-3 uppercase tracking-widest">+2.000 Lugares Estádio</p>
                      <button onClick={() => socket.emit('buildStadium')} className="w-full bg-amber-600 hover:bg-amber-500 text-zinc-950 font-black py-3 rounded-lg text-sm transition-all uppercase">Expandir (250.000€)</button>
                    </div>
                    
                    <div className="bg-zinc-950 p-4 rounded-xl border border-red-900 border-opacity-30">
                      <p className="text-sm font-bold text-red-500 mb-3 uppercase tracking-widest">Apoio Bancário</p>
                      <div className="flex gap-2">
                        <button onClick={() => socket.emit('takeLoan')} className="flex-1 bg-red-900 hover:bg-red-800 text-white font-black py-3 rounded-lg text-xs transition-all uppercase">Pedir +500K</button>
                        <button onClick={() => socket.emit('payLoan')} className="flex-1 bg-emerald-900 hover:bg-emerald-800 text-white font-black py-3 rounded-lg text-xs transition-all uppercase">Pagar -500K</button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
          
          <div className="xl:col-span-1 space-y-6">
            <div className="bg-zinc-900 p-6 rounded-3xl border border-zinc-800 flex flex-col items-center sticky top-[100px]">
              <button 
                onClick={handleReady}
                className={`w-full py-6 font-black rounded-2xl text-2xl transition-all uppercase tracking-widest relative overflow-hidden border-b-6 active:border-b-0 active:translate-y-[6px] ${players.find(p => p.name === me.name)?.ready ? 'bg-zinc-800 text-zinc-500 border-zinc-950' : 'bg-emerald-500 text-zinc-950 hover:bg-emerald-400 border-emerald-700'}`}
              >
                {players.find(p => p.name === me.name)?.ready 
                  ? 'A AGUARDAR OUTROS' 
                  : (liveMinute === 45 && !isPlayingMatch && matchResults) 
                    ? '2ª PARTE' 
                    : 'JOGAR JORNADA'}
              </button>
              <p className="text-xs font-bold text-zinc-500 mt-4 text-center leading-relaxed">Se jogas com amigos, a jornada só avança quando TODOS clicarem.</p>
            </div>

            <div className="bg-zinc-900 p-6 rounded-3xl border border-zinc-800">
              <h2 className="text-sm font-black mb-5 text-zinc-400 uppercase flex justify-between">
                <span>Liga Activa</span><span className="text-amber-500">({players.length}/8)</span>
              </h2>
              <ul className="space-y-4">
                {players.map((p, i) => (
                  <li key={i} className="flex justify-between items-center bg-zinc-950 border border-zinc-800/50 p-4 rounded-2xl">
                    <div className="min-w-0 pr-2">
                      <p className="font-bold text-base text-white truncate">{p.name}</p>
                      <p className="text-xs font-bold uppercase text-zinc-500 truncate">{teams.find(t => t.id == p.teamId)?.name}</p>
                    </div>
                    <div className={`px-3 py-1 rounded border text-[10px] font-black uppercase ${p.ready ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'text-zinc-600 border-zinc-800'}`}>
                      {p.ready ? 'PRONTO' : 'ESPERA'}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default App
