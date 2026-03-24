import { useEffect, useState } from 'react';
import { socket } from './socket';

function formatCurrency(value) {
  return new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(value);
}

const playWhistle = () => {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = 'square';
    osc.frequency.setValueAtTime(1500, ctx.currentTime);
    osc.frequency.linearRampToValueAtTime(1200, ctx.currentTime + 0.3);
    gain.gain.setValueAtTime(0.05, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.3);
  } catch (e) {}
};

const playGoal = () => {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(440, ctx.currentTime);
    osc.frequency.setValueAtTime(554, ctx.currentTime + 0.1);
    osc.frequency.setValueAtTime(659, ctx.currentTime + 0.2);
    gain.gain.setValueAtTime(0.05, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.6);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.6);
  } catch (e) {}
};

function App() {
  const [teams, setTeams] = useState([]);
  const [players, setPlayers] = useState([]);
  const [mySquad, setMySquad] = useState([]);
  const [me, setMe] = useState(null);
  const [name, setName] = useState('');
  const [selectedTeam, setSelectedTeam] = useState('');
  const [matchResults, setMatchResults] = useState(null);
  const [matchweekCount, setMatchweekCount] = useState(0);
  const [activeTab, setActiveTab] = useState('dashboard');
  const [marketPairs, setMarketPairs] = useState([]);
  const [tactic, setTactic] = useState({ formation: '4-4-2', style: 'Balanced' });
  
  useEffect(() => {
    socket.on('connect', () => console.log('Connected to server'));
    socket.on('teamsData', (data) => setTeams(data));
    socket.on('playerListUpdate', (data) => setPlayers(data));
    socket.on('mySquad', (data) => setMySquad(data));
    socket.on('marketUpdate', (data) => setMarketPairs(data));
    
    // System notifications mapping
    socket.on('systemMessage', (msg) => {
      // In a real app we'd use toast notifications
      console.log('SYSTEM:', msg);
    });
    
    socket.on('matchResults', (data) => {
      setMatchResults(data);
      setMatchweekCount((prev) => prev + 1);
      
      const hasGoal = data.results.homeGoals > 0 || data.results.awayGoals > 0;
      if (hasGoal) {
        playGoal();
        setTimeout(playWhistle, 600);
      } else {
        playWhistle();
      }
    });
    
    return () => {
      socket.off('connect');
      socket.off('teamsData');
      socket.off('playerListUpdate');
      socket.off('mySquad');
      socket.off('marketUpdate');
      socket.off('systemMessage');
      socket.off('matchResults');
    };
  }, []);

  const handleJoin = () => {
    if (name && selectedTeam) {
      const data = { name, teamId: selectedTeam };
      socket.emit('joinGame', data);
      setMe(data);
    }
  };

  const handleReady = () => {
    socket.emit('setReady', true);
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

  if (!me) {
    return (
      <div className="min-h-screen bg-zinc-950 text-zinc-100 p-8 flex flex-col items-center justify-center font-sans tracking-tight">
        <h1 className="text-6xl font-black text-amber-500 mb-8 drop-shadow-xl tracking-tighter">ELIFOOT <span className="text-zinc-100">98</span></h1>
        <div className="bg-zinc-900 p-8 rounded-3xl w-full max-w-md border border-zinc-800 relative overflow-hidden shadow-2xl">
          <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-amber-600 via-amber-400 to-amber-600"></div>
          <h2 className="text-xl font-bold mb-6 text-zinc-300 uppercase tracking-widest text-center">Entrar na Liga</h2>
          <div className="mb-5">
            <label className="block text-xs uppercase text-zinc-500 mb-2 font-bold tracking-wider">O teu nome de Treinador</label>
            <input 
              type="text" 
              className="w-full bg-zinc-950 border border-zinc-800 p-3 rounded-xl text-white focus:ring-2 focus:ring-amber-500/50 outline-none transition-all placeholder:text-zinc-700 font-medium"
              value={name} placeholder="Ex: José Mourinho" onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="mb-8">
            <label className="block text-xs uppercase text-zinc-500 mb-2 font-bold tracking-wider">Escolhe o teu Clube</label>
            <select 
              className="w-full bg-zinc-950 border border-zinc-800 p-3 rounded-xl text-white focus:ring-2 focus:ring-amber-500/50 outline-none transition-all appearance-none font-medium text-sm"
              value={selectedTeam} onChange={(e) => setSelectedTeam(e.target.value)}
            >
              <option value="">-- Selecionar Clube --</option>
              {teams.map(t => <option key={t.id} value={t.id}>{t.name} (Divisao {t.division})</option>)}
            </select>
          </div>
          <button 
            onClick={handleJoin} disabled={!name || !selectedTeam}
            className="w-full bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 disabled:cursor-not-allowed text-zinc-950 py-4 rounded-xl font-black text-lg transition-all active:scale-[0.98]"
          >
            ASSINAR CONTRATO
          </button>
        </div>
      </div>
    );
  }

  const teamInfo = teams.find(t => t.id == me.teamId);

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 font-sans selection:bg-amber-500 selection:text-zinc-900 pb-12 tracking-tight">
      <header className="bg-zinc-900 border-b border-zinc-800 p-4 md:px-8 flex flex-col md:flex-row justify-between items-center z-10 sticky top-0 shadow-sm">
        <div className="flex items-center gap-4">
          <h1 className="text-2xl font-black text-amber-500 tracking-tighter">ELIFOOT <span className="text-zinc-100">98</span></h1>
          <div className="h-6 w-px bg-zinc-700 mx-2"></div>
          <p className="text-sm font-bold text-zinc-400 uppercase tracking-widest pl-1">Jornada {matchweekCount + 1}</p>
        </div>
        <div className="mt-4 md:mt-0 flex items-center gap-4">
          <div className="text-right hidden md:block">
            <p className="font-bold relative top-[2px]">{me.name}</p>
            <p className="text-xs text-amber-500 font-black tracking-widest uppercase">{teamInfo?.name}</p>
          </div>
          <div className="w-10 h-10 bg-zinc-800 rounded-full flex items-center justify-center font-bold text-lg border-2 border-amber-500 text-amber-500 shadow-md">
            {me.name.charAt(0).toUpperCase()}
          </div>
        </div>
      </header>
      
      <div className="max-w-7xl mx-auto p-4 md:p-8 mt-4">
        {/* Tabs */}
        <div className="flex gap-2 mb-8 border-b border-zinc-800 pb-px">
          <button onClick={() => setActiveTab('dashboard')} className={`px-4 py-3 font-bold text-sm tracking-widest uppercase transition-colors border-b-2 ${activeTab === 'dashboard' ? 'border-amber-500 text-white' : 'border-transparent text-zinc-500 hover:text-zinc-300'}`}>Visão Geral</button>
          <button onClick={() => setActiveTab('squad')} className={`px-4 py-3 font-bold text-sm tracking-widest uppercase transition-colors border-b-2 flex items-center gap-2 ${activeTab === 'squad' ? 'border-amber-500 text-white' : 'border-transparent text-zinc-500 hover:text-zinc-300'}`}>O Meu Plantel <span className="bg-zinc-800 text-zinc-400 py-0.5 px-2 rounded-full text-[10px]">{mySquad.length}</span></button>
          <button onClick={() => setActiveTab('market')} className={`px-4 py-3 font-bold text-sm tracking-widest uppercase transition-colors border-b-2 flex items-center gap-2 ${activeTab === 'market' ? 'border-emerald-500 text-emerald-400' : 'border-transparent text-zinc-500 hover:text-zinc-300'}`}>Mercado Livres</button>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-4 gap-8">
          <div className="xl:col-span-3">
            {activeTab === 'dashboard' && (
              <div className="space-y-8 animate-in fade-in duration-300">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="bg-zinc-900 p-6 rounded-3xl border border-zinc-800 shadow-sm relative overflow-hidden">
                    <p className="text-[10px] text-zinc-500 uppercase font-black tracking-[0.2em] mb-2">Clube</p>
                    <p className="text-2xl font-black tracking-tight">{teamInfo?.name}</p>
                    <p className="text-sm font-semibold text-amber-500 mt-1">Divisão {teamInfo?.division}</p>
                  </div>
                  <div className="bg-zinc-900 p-6 rounded-3xl border border-zinc-800 shadow-sm">
                    <p className="text-[10px] text-zinc-500 uppercase font-black tracking-[0.2em] mb-2">Finanças</p>
                    <p className="text-2xl font-black text-emerald-400 tracking-tight">{formatCurrency(teamInfo?.budget || 0)}</p>
                    <p className="text-xs font-semibold text-zinc-500 mt-1">+ € 3,500 Previstos</p>
                  </div>
                  <div className="bg-amber-500 p-6 rounded-3xl border border-amber-400 shadow-sm text-zinc-950 flex flex-col justify-center items-center">
                    <p className="text-[10px] uppercase font-black tracking-[0.2em] opacity-70 mb-1">Classificação Atual</p>
                    <p className="text-5xl font-black tracking-tighter">1º</p>
                  </div>
                </div>
                
                {matchResults && (
                  <div className="bg-zinc-900 rounded-3xl border border-zinc-800 shadow-sm overflow-hidden">
                    <div className="bg-zinc-800/50 p-5 border-b border-zinc-800 flex justify-between items-center">
                      <h3 className="font-bold text-white text-xs tracking-widest uppercase flex items-center gap-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse"></span>
                        Último Jogo (Jornada {matchResults.matchweek})
                      </h3>
                    </div>
                    <div className="p-8">
                      <div className="flex items-center justify-center gap-4 md:gap-8 mb-8">
                        <div className="text-xl md:text-3xl font-black flex-1 text-right text-zinc-300 tracking-tight">{me.teamId === matchResults.results.homeTeamId ? teamInfo?.name : "Equipa Casa"}</div>
                        <div className="px-6 py-3 bg-zinc-950 border border-zinc-800 rounded-2xl text-4xl mb:text-5xl font-black font-mono text-white shadow-inner flex gap-4">
                          <span>{matchResults.results.homeGoals}</span>
                          <span className="text-zinc-700">-</span>
                          <span>{matchResults.results.awayGoals}</span>
                        </div>
                        <div className="text-xl md:text-3xl font-black flex-1 text-left text-zinc-300 tracking-tight">Adversário</div>
                      </div>
                      <div className="bg-zinc-950 rounded-2xl p-6 text-sm text-zinc-400 h-64 overflow-y-auto space-y-3 border border-zinc-800 font-medium">
                        {matchResults.results.narrative.map((event, idx) => {
                          const isGoal = event.includes('GOLO');
                          const isRed = event.includes('VERMELHO');
                          const isYellow = event.includes('Amarelo');
                          let bg = "bg-transparent";
                          if (isGoal) bg = "bg-emerald-500/10 text-emerald-400 p-2 rounded-lg -mx-2 font-bold";
                          if (isRed) bg = "bg-red-500/10 text-red-500 p-2 rounded-lg -mx-2 font-bold";
                          if (isYellow) bg = "text-amber-400";
                          return <div key={idx} className={`${bg} transition-colors`}>{event}</div>
                        })}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {activeTab === 'squad' && (
              <div className="space-y-6 animate-in fade-in duration-300">
                <div className="bg-zinc-900 rounded-2xl border border-zinc-800 shadow-sm p-5 flex flex-col md:flex-row justify-between items-center gap-4">
                  <h3 className="font-bold text-amber-500 text-xs tracking-widest uppercase">Estratégia do Jogo</h3>
                  <div className="flex gap-4">
                    <div>
                      <select 
                        className="bg-zinc-950 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500 font-medium"
                        value={tactic.formation} onChange={(e) => updateTactic({ formation: e.target.value })}
                      >
                        <option value="4-4-2">4-4-2 Clássico</option>
                        <option value="4-3-3">4-3-3 Ofensivo</option>
                        <option value="3-5-2">3-5-2 Controlo da Bola</option>
                        <option value="5-3-2">5-3-2 Autocarro</option>
                        <option value="4-5-1">4-5-1 Catenaccio</option>
                      </select>
                    </div>
                    <div>
                      <select 
                        className="bg-zinc-950 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-emerald-400 focus:outline-none focus:border-amber-500 font-medium"
                        value={tactic.style} onChange={(e) => updateTactic({ style: e.target.value })}
                      >
                        <option value="Balanced">Equilibrado Normal</option>
                        <option value="Offensive">Futebol de Ataque (+15% Atk)</option>
                        <option value="Defensive">Ultradefensivo (+20% Def)</option>
                      </select>
                    </div>
                  </div>
                </div>

                <div className="bg-zinc-900 rounded-3xl border border-zinc-800 shadow-sm overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse text-sm">
                      <thead>
                        <tr className="bg-zinc-950/50 text-zinc-500 uppercase text-[10px] tracking-widest border-b border-zinc-800">
                          <th className="p-4 font-black">Pos</th>
                          <th className="p-4 font-black">Nome</th>
                          <th className="p-4 font-black text-center">Idd</th>
                          <th className="p-4 font-black text-center">Nac</th>
                          <th className="p-4 font-black text-center">Qual</th>
                          <th className="p-4 font-black text-center w-32">Forma</th>
                          <th className="p-4 font-black">Agres</th>
                          <th className="p-4 font-black text-right">Salário</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-zinc-800/50 font-medium">
                        {mySquad.sort((a,b) => {
                          const posOrder = {GK: 1, DEF: 2, MID: 3, ATK: 4};
                          return posOrder[a.position] - posOrder[b.position];
                        }).map(player => (
                          <tr key={player.id} className="hover:bg-zinc-800/50 transition-colors group">
                            <td className={`p-4 font-black text-xs tracking-wider ${
                              player.position === 'GK' ? 'text-yellow-500' :
                              player.position === 'DEF' ? 'text-blue-500' :
                              player.position === 'MID' ? 'text-green-500' : 'text-red-500'
                            }`}>{player.position}</td>
                            <td className="p-4 font-bold text-white group-hover:text-amber-400 transition-colors">{player.name}</td>
                            <td className="p-4 text-center text-zinc-400">{player.age}</td>
                            <td className="p-4 text-center text-zinc-400 font-bold">{player.nationality}</td>
                            <td className="p-4 text-center">
                              <span className="bg-zinc-950 text-white font-black px-2 py-1 rounded inline-block min-w-8 border border-zinc-800 group-hover:border-amber-500/50 transition-colors">{player.skill}</span>
                            </td>
                            <td className="p-4">
                              <div className="flex items-center gap-2">
                                <div className="flex-1 bg-zinc-950 rounded-full h-1.5 overflow-hidden">
                                  <div className={`h-1.5 rounded-full ${player.form > 90 ? 'bg-emerald-500' : player.form > 70 ? 'bg-amber-500' : 'bg-red-500'}`} style={{width: `${player.form}%`}}></div>
                                </div>
                                <span className="text-[10px] font-bold tracking-wider text-zinc-500 w-6 text-right">{player.form}</span>
                              </div>
                            </td>
                            <td className="p-4">
                              <span className={`text-[10px] px-2 py-1 rounded font-black tracking-widest uppercase ${
                                player.aggressiveness === 'High' ? 'bg-red-500/10 text-red-500' : 
                                player.aggressiveness === 'Low' ? 'bg-emerald-500/10 text-emerald-500' : 
                                'bg-zinc-800 text-zinc-400'
                              }`}>{player.aggressiveness}</span>
                            </td>
                            <td className="p-4 text-right font-mono text-xs text-zinc-400">{formatCurrency(player.wage)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'market' && (
              <div className="bg-zinc-900 rounded-3xl border border-zinc-800 shadow-sm overflow-hidden animate-in fade-in duration-300">
                <div className="p-5 border-b border-zinc-800 bg-zinc-800/50 flex justify-between items-center">
                  <h3 className="font-bold text-emerald-400 text-xs tracking-widest uppercase">Lista de Transferências ({marketPairs.length})</h3>
                  <span className="text-zinc-500 text-xs">Cláusula = Valor Base + 20%</span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-sm">
                    <thead>
                      <tr className="bg-zinc-950/50 text-zinc-500 uppercase text-[10px] tracking-widest border-b border-zinc-800">
                        <th className="p-4 font-black">Pos</th>
                        <th className="p-4 font-black">Nome / Origem</th>
                        <th className="p-4 font-black text-center">Qual</th>
                        <th className="p-4 font-black text-center">Forma</th>
                        <th className="p-4 font-black text-right">Cláusula Rescisão</th>
                        <th className="p-4 font-black text-right">Ação</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-800/50 font-medium">
                      {marketPairs.filter(p => p.team_id !== me.teamId).map(player => {
                        const originalTeam = teams.find(t => t.id === player.team_id)?.name || 'Livre';
                        const price = player.value * 1.2;
                        const canAfford = teamInfo?.budget >= price;

                        return (
                          <tr key={player.id} className="hover:bg-zinc-800/50 transition-colors group">
                            <td className="p-4 font-black text-xs">{player.position}</td>
                            <td className="p-4">
                               <p className="font-bold text-white mb-0.5">{player.name}</p>
                               <p className="text-[10px] uppercase text-zinc-500 font-black tracking-widest">{originalTeam}</p>
                            </td>
                            <td className="p-4 text-center">
                              <span className="bg-emerald-950 text-emerald-400 font-black px-2 py-1 rounded inline-block min-w-8 border border-emerald-900">{player.skill}</span>
                            </td>
                            <td className="p-4 text-center text-zinc-500">{player.form}%</td>
                            <td className="p-4 text-right font-mono text-zinc-300">{formatCurrency(price)}</td>
                            <td className="p-4 text-right">
                              <button 
                                onClick={() => buyPlayer(player.id)}
                                disabled={!canAfford}
                                className="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-30 disabled:hover:bg-emerald-600 text-white font-black uppercase text-[10px] tracking-widest px-3 py-2 rounded transition-colors"
                              >
                                {canAfford ? 'Comprar' : 'Sem Fundo'}
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
          
          <div className="xl:col-span-1 space-y-6">
            <div className="bg-zinc-900 p-6 rounded-3xl border border-zinc-800 shadow-sm flex flex-col items-center sticky top-[100px]">
              <button 
                onClick={handleReady}
                className="w-full py-5 bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-black rounded-2xl text-xl transition-all shadow-xl shadow-emerald-500/20 active:scale-95 uppercase tracking-widest relative overflow-hidden ring-1 ring-emerald-400/50"
              >
                JOGAR JORNADA
              </button>
              <p className="text-[10px] uppercase tracking-widest font-bold text-zinc-500 mt-4 text-center px-4 leading-relaxed">Confirma a tua equipa para simular a ronda</p>
            </div>

            <div className="bg-zinc-900 p-6 rounded-3xl border border-zinc-800 shadow-sm">
              <h2 className="text-xs font-black mb-5 text-zinc-400 tracking-[0.2em] uppercase flex items-center justify-between">
                <span>Liga Activa</span>
                <span className="text-amber-500 bg-amber-500/10 px-2 py-0.5 rounded-full">({players.length}/8)</span>
              </h2>
              <ul className="space-y-3">
                {players.map((p, i) => (
                  <li key={i} className="flex justify-between items-center bg-zinc-950 border border-zinc-800/50 p-4 rounded-2xl">
                    <div className="min-w-0 pr-2">
                      <p className="font-bold text-sm text-white truncate">{p.name}</p>
                      <p className="text-[10px] font-bold tracking-widest uppercase text-zinc-500 truncate">{teams.find(t => t.id == p.teamId)?.name}</p>
                    </div>
                    <div className={`shrink-0 px-2.5 py-1 rounded border text-[9px] font-black tracking-[0.2em] uppercase ${p.ready ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-transparent text-zinc-600 border-zinc-800'}`}>
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
