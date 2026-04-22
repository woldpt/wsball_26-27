import type { ActiveGame, Tactic } from "../types";

type Db = any;
type PlayerRow = any;
type MatchFixture = any;

// ── Junior GR (Juniores) ─────────────────────────────────────────────────────
const JUNIOR_FIRST_NAMES = [
  "Carlos",
  "João",
  "Miguel",
  "André",
  "Rui",
  "Diogo",
  "Pedro",
  "Tiago",
  "Nuno",
  "Luís",
  "Filipe",
  "Gonçalo",
  "Rodrigo",
  "Rafael",
  "Marco",
];
const JUNIOR_LAST_NAMES = [
  "Silva",
  "Santos",
  "Ferreira",
  "Pereira",
  "Oliveira",
  "Costa",
  "Rodrigues",
  "Martins",
  "Jesus",
  "Sousa",
  "Fernandes",
  "Gonçalves",
  "Gomes",
  "Lopes",
  "Marques",
];

/**
 * Generates a deterministic ephemeral junior GR player for a team.
 * Uses negative IDs so all DB write operations are harmless no-ops.
 * The same (teamId, matchweek, slotIndex) always produces the same name and ID.
 * ID scheme: -(teamId * 10 + slotIndex + 1)
 */
export function generateJuniorGR(
  teamId: number,
  matchweek: number,
  slotIndex: number,
): PlayerRow {
  const firstIdx =
    Math.abs(teamId * 37 + matchweek * 13 + slotIndex * 7) %
    JUNIOR_FIRST_NAMES.length;
  const lastIdx =
    Math.abs(teamId * 53 + matchweek * 17 + slotIndex * 11) %
    JUNIOR_LAST_NAMES.length;
  return {
    id: -(teamId * 10 + slotIndex + 1),
    name: `${JUNIOR_FIRST_NAMES[firstIdx]} ${JUNIOR_LAST_NAMES[lastIdx]} (Junior)`,
    position: "GR",
    skill: 1,
    gk: 8,
    defesa: 2,
    passe: 2,
    finalizacao: 1,
    resistencia: 60,
    aggressiveness: 3,
    isJunior: true,
    team_id: teamId,
    age: 17,
    form: 50,
    nationality: "🇵🇹",
    value: 0,
    wage: 0,
    goals: 0,
    is_star: 0,
    suspension_until_matchweek: 0,
    injury_until_matchweek: 0,
    games_played: 0,
    yellow_cards: 0,
    red_cards: 0,
    career_injuries: 0,
    career_reds: 0,
    transfer_status: "none",
    prev_skill: null,
    signed_season: null,
  };
}

/**
 * Injects junior GR players into a squad whenever there are fewer than 2 available GRs.
 * Accepts the full squad (including unavailable players) or a pre-filtered available subset;
 * in both cases it correctly counts only available GRs before deciding how many juniors to add.
 * The original array is never mutated.
 */
export function withJuniorGRs(
  squad: PlayerRow[],
  teamId: number,
  matchweek: number,
): PlayerRow[] {
  const availableGRCount = squad.filter(
    (p) => p.position === "GR" && isPlayerAvailable(p, matchweek),
  ).length;
  if (availableGRCount >= 2) return squad;
  const needed = 2 - availableGRCount;
  const juniors: PlayerRow[] = [];
  for (let i = 0; i < needed; i++) {
    juniors.push(generateJuniorGR(teamId, matchweek, i));
  }
  return [...squad, ...juniors];
}

// ── Commentary helpers ──────────────────────────────────────────────────────
function pickPhrase(phrases: string[]): string {
  return phrases[Math.floor(Math.random() * phrases.length)];
}

function goalPhrase(name: string): string {
  return pickPhrase([
    `GOLOOO! ${name} não perdoa!`,
    `${name} assina o golo. A baliza ficou sem palavras.`,
    `Ó ${name}! De onde veio isso?! É golooo!`,
    `${name} marca e faz das suas. Impossível de parar.`,
    `Golo! O guarda-redes ainda estava a processar o que aconteceu.`,
    `${name} coloca a bola no fundo das redes. Que momento!`,
    `De cabeça! ${name} não deu hipótese. Pura classe.`,
    `Que golaço de ${name}! De fora da área e sem aviso. Silêncio total na bancada adversária.`,
    `${name} rouba a bola, arranca, remata — GOLO! Foi tudo tão rápido.`,
    `Golo de calcanhar! ${name} vai ser notícia amanhã de manhã.`,
    `Pé esquerdo, ângulo fechado, redes a abanar. ${name} é mesmo assim.`,
    `${name} recebe, controla, vira… e manda para o fundo. Simples quando se sabe.`,
    `GOOOLO! A bancada levantou-se toda de uma vez. ${name} festeja como se fosse o último.`,
    `Que assistência, que finalização. ${name} estava no sítio certo à hora certa.`,
    `Nem o guarda-redes acreditou. ${name} marcou de enfiada, no canto oposto.`,
  ]);
}

function penaltyGoalPhrase(name: string): string {
  return pickPhrase([
    `Penálti convertido por ${name}. Frio como uma cerveja no ártico.`,
    `${name} bate e marca! O guarda-redes adivinhou o lado mas não chegou.`,
    `GOLO de penálti! ${name} não tremeu. Nervos de aço.`,
    `${name} — canto inferior, sem hipóteses. Impecável.`,
    `Da marca dos onze metros, ${name} não falha. Nunca.`,
    `Canto superior direito, velocidade de bala. ${name} é cruel.`,
    `O guarda-redes foi ao lado errado. ${name} sabia exactamente onde ia colocar.`,
    `Passada longa, balanço, remate seco. ${name} converteu como se fosse treino.`,
    `${name} encarou o guarda-redes, fez uma pausa… e atirou para o fundo. Teatro puro.`,
    `Penálti com categoria. ${name} enviou para o canto e não olhou para trás.`,
  ]);
}

function penaltyMissPhrase(name: string, missType: string): string {
  const pools: Record<string, string[]> = {
    "DEFENDEU!": [
      `${name} rematou e o guarda-redes voltou a ser herói. Hoje não, amigo.`,
      `Defendeu! ${name} vai querer esquecer este momento depressa.`,
      `O guarda-redes adivinhou! ${name} fica com a cabeça nas mãos.`,
      `Inacreditável! O guarda-redes atirou-se para o canto certo e negou o golo a ${name}.`,
      `Que defesa! O guarda-redes leu o remate de ${name} e mandou para canto. Herói.`,
      `${name} rematou forte mas o guarda-redes estava lá. Hoje não era o dia.`,
      `Defendeu com a ponta dos dedos! ${name} não pode acreditar no que está a ver.`,
    ],
    "AO POSTE!": [
      `Ó ferro! ${name} acertou no poste. O metal também tem sentimentos.`,
      `Ao poste! ${name} vai ouvir esse som nos sonhos esta noite.`,
      `O poste salva a equipa adversária. ${name} não acredita.`,
      `Toc! O ferro. ${name} atirou para o lado errado da trave. Por centímetros.`,
      `${name} mandou ao poste. A bola saiu. O desespero ficou.`,
      `Que azar de ${name}! A bola bateu na trave e saiu. O universo disse não.`,
    ],
    "AO LADO!": [
      `Ao lado! ${name} mandou para os bancais. Os adeptos nem queriam ver.`,
      `Fora! ${name} deu uma aula de como não bater um penálti.`,
      `${name} rematou para a assistência. Literalmente.`,
      `A bola passou ao lado da baliza. ${name} vira as costas e não quer saber de nada.`,
      `Completamente ao lado! ${name} esqueceu-se de mirar. Acontece aos melhores… raramente.`,
      `${name} perdeu a noção do espaço. O remate foi mais para a rua do que para a baliza.`,
    ],
    "PANENKA FALHADO!": [
      `${name} tentou a Panenka… e falhou. A coragem foi, o golo não.`,
      `Panenka falhado! Haverá maneira mais espectacular de falhar? Provavelmente não.`,
      `${name} quis ser elegante. Ficou apenas por querer.`,
      `A Panenka de ${name} foi apanhada pelo guarda-redes. Isso vai doer durante semanas.`,
      `${name} tentou a bola ao centro com classe. O guarda-redes ficou e apanhou. Que cena.`,
      `Tentar uma Panenka com este resultado? ${name} é corajoso. E agora também está envergonhado.`,
    ],
  };
  return pickPhrase(pools[missType] || [`${name} falhou o penálti. Acontece.`]);
}

function varPhrase(name: string): string {
  return pickPhrase([
    `VAR consulta. Golo de ${name} anulado. A tecnologia: 1, alegria: 0.`,
    `Anulado! O VAR viu o que os outros não viram. Fora de jogo por meio nariz.`,
    `${name} festejou cedo demais. O VAR diz que não.`,
    `Golo anulado por VAR. Ninguém na bancada percebeu porquê, mas aceitaram.`,
    `O árbitro de vídeo interveio. ${name} desce do céu ao relvado.`,
    `VAR! O golo de ${name} foi ao microscópio e não sobreviveu. Meio dedão em fora de jogo.`,
    `Reviravolta tecnológica: o VAR anulou o golo. ${name} ainda está à espera de perceber.`,
    `A sala do VAR falou. O golo de ${name} foi cancelado. A multidão vaiu a modernidade.`,
    `${name} marcou, festejou, tirou a camisola e vai ser multado… por nada. Golo anulado.`,
    `Fora de jogo milimétrico. O VAR traçou linhas durante dois minutos e ${name} ficou sem golo.`,
  ]);
}

function yellowPhrase(name: string): string {
  return pickPhrase([
    `Amarelo para ${name}. Atenção, que o próximo pode ser perigoso.`,
    `${name} vê cartão amarelo. O árbitro avisa: calm down.`,
    `Falta de ${name} resulta em amarelo. A agressividade tem custos.`,
    `${name} vai para o caderno do árbitro. Talvez a mãe não ficasse orgulhosa.`,
    `Amarelo! ${name} precisa de gerir melhor os nervos no resto do jogo.`,
    `${name} protestar deu resultado: saiu um amarelo, não a decisão. Lição aprendida?`,
    `Falta desnecessária de ${name}. O árbitro não hesitou. Cartão no bolso, régua na mão.`,
    `${name} recebeu o amarelo com cara de espanto, como se fosse a primeira vez. Não é.`,
    `Toque de mais em ${name}. O árbitro assinalou falta e exibiu o cartão amarelo. Óbvio.`,
    `${name} jogou duro demais. O árbitro aproximou-se e produziu o cartão da camisa.`,
    `Simulação ou falta real? O árbitro não teve dúvidas. Amarelo para ${name}.`,
  ]);
}

function redPhrase(name: string): string {
  return pickPhrase([
    `Vermelho! ${name} vai para o balneário mais cedo. Muito mais cedo.`,
    `${name} expulso! A equipa passa a jogar com dez. Matemática cruel.`,
    `Red card! ${name} não vai assistir ao resto. Talvez seja melhor assim.`,
    `${name} despede-se do relvado hoje. O árbitro não estava para brincadeiras.`,
    `Expulso! ${name} fez a mala mental e foi para os balneários.`,
    `Falta brutal de ${name}. Vermelho directo, sem hesitação. O banco vai ferver.`,
    `${name} perde a cabeça e o árbitro não perdoa. Dez jogadores em campo.`,
    `Segundo amarelo para ${name}. A experiência devia ter ensinado mais. Expulso.`,
    `${name} vai para o balneário e os colegas ficam a olhar uns para os outros. Que momento.`,
    `O treinador adversário já estava a protestar. O árbitro fez justiça. Vermelho, ${name}.`,
    `${name} saiu de campo com uma cara que diz tudo. Expulso, e com razão.`,
    `Tão desnecessário quanto espectacular: vermelho para ${name}. O banco vai estar quente.`,
  ]);
}

function injuryPhrase(name: string, severity: string): string {
  if (severity === "grave") {
    return pickPhrase([
      `${name} saiu de maca. As notícias não são boas, aparentemente.`,
      `Lesão grave para ${name}. O clube vai precisar de paciência (e suplentes).`,
      `${name} vai aos cuidados da equipa médica. Semanas fora, infelizmente.`,
      `${name} cai. O médico entra em campo com cara séria. Mau sinal.`,
      `${name} saiu a apoiar-se no médico. O estádio ficou em silêncio. Meses fora, talvez.`,
      `Lesão no joelho de ${name}? O médico chamou a maca. Ninguém sorri.`,
      `${name} ficou estendido. Demorou tempo. A maca entrou. Má notícia para o plantel.`,
      `${name} agarrou o tornozelo e não se levantou. Equipa médica a correr. Semanas fora.`,
    ]);
  }
  return pickPhrase([
    `${name} sentiu uma pancada. Nada de grave, mas saiu por precaução.`,
    `${name} leva um golpe do destino e precisa de ser substituído.`,
    `Lesão ligeira para ${name}. Vai a exames, mas parece que não é nada de sério.`,
    `${name} pede substituição. O corpo disse basta por hoje.`,
    `${name} ficou a coxear depois do choque. O treinador não arriscou e pediu substituição.`,
    `Cãibra? Distensão? Não se sabe ainda. ${name} saiu por precaução, com cara de frustração.`,
    `${name} caiu, levantou-se, voltou a cair. O médico acenou para o banco. Substituição.`,
    `Bateu com força no chão. ${name} pediu para sair. Leve, mas não joga mais hoje.`,
  ]);
}

function subPhrase(outName: string, inName: string): string {
  return pickPhrase([
    `Substituição: ${outName} cede o lugar a ${inName}. Rotatividade ao poder.`,
    `${outName} sai, ${inName} entra. Alguém precisa de descanso.`,
    `Troca táctica: ${inName} vai mostrar o que vale. Sem pressão, claro.`,
    `${outName} dá lugar a ${inName}. O banco estava gelado, agora vai aquecer.`,
    `${inName} entra em campo. ${outName} agradece e desaparece do relvado.`,
    `O treinador apostou em ${inName}. ${outName} sai com aplausos — merecia mais minutos.`,
    `Mudança táctica: ${outName} foi sacrificado. ${inName} entra com fome de bola.`,
    `${outName} saiu exausto. ${inName} entra fresco. Energia nova para os minutos finais.`,
    `Substituição forçada: ${outName} não conseguia mais. ${inName} aceita o desafio.`,
    `${inName} aqueceu durante vinte minutos. Chegou a sua hora. ${outName} agradece e sai.`,
  ]);
}

function nearMissPhrase(name: string): string {
  return pickPhrase([
    `Que remate de ${name}! A bola passou a centímetros do poste. Quase.`,
    `${name} atirou com tudo… e foi por cima da trave. A baliza ficou intacta mas tremia.`,
    `Boa oportunidade desperdiçada por ${name}. Estava mesmo ali.`,
    `${name} disparou de primeira — o guarda-redes espalmou para canto com os punhos. Que reflexos!`,
    `Cabeceamento de ${name} foi rasteiro mas o guarda-redes mergulhou e defendeu no chão.`,
    `${name} ficou cara a cara com o guarda-redes e… rematou para as mãos dele. Que pena.`,
    `A bola de ${name} bateu na trave e voltou para o campo. O ferro hoje está do outro lado.`,
    `${name} arriscou de fora da área. A bola passou ao lado por muito pouco. Suspirou a bancada.`,
    `Cruzamento tenso, ${name} apareceu ao segundo poste… e falhou o alvo por centímetros.`,
    `${name} recebeu em posição de golo e atirou por cima. Tinha tempo. Faltou frieza.`,
    `Remate em força de ${name} — o guarda-redes viu tarde e desviou para canto com a ponta dos dedos.`,
    `Chapéu de ${name} pareceu golo mas a bola picou mesmo na linha e o guarda-redes atirou para longe.`,
  ]);
}

function bigSavePhrase(grName: string): string {
  return pickPhrase([
    `Que defesa de ${grName}! Atirou-se para o canto e tirou a bola quase da linha.`,
    `${grName} voou! Defesa impossível que valeu o ponto. Herói da tarde.`,
    `Um a um, ${grName} saiu bem e fechou o ângulo. O avançado não teve para onde atirar.`,
    `${grName} adivinhou o canto e defendeu com a mão esquerda. Instinto puro.`,
    `Defesa de classe mundial de ${grName}. A bola parecia certeira — ele disse que não.`,
    `${grName} atirou-se aos pés do adversário e bloqueou o remate. Corajoso e eficaz.`,
    `Canto superior esquerdo, remate cruzado — ${grName} esticou-se todo e tocou para fora. Incrível.`,
    `${grName} saiu a tempo do cruzamento e agarrou a bola com firmeza. Sem chances para o avançado.`,
  ]);
}

function weatherPhrase(condition: string): string {
  const pools: Record<string, string[]> = {
    sol: [
      `Tarde soalheira para o jogo de hoje. Relvado perfeito, público à espera.`,
      `Sol de rachar no estádio. As equipas precisam de água — o jogo está quente antes de começar.`,
      `Dia de bom tempo. Condições ideais para um bom espectáculo.`,
    ],
    chuva: [
      `Está a chover no estádio. O relvado vai escorregar, a bola vai rolar mais rápido. Cuidado.`,
      `Chuva miúda no arranque da partida. Os jogadores já trouxeram as chuteiras de barro.`,
      `Tempo húmido e relvado pesado. Quem jogar mais directo tem vantagem hoje.`,
    ],
    chuva_forte: [
      `Aguaceiro forte antes do apito inicial. Visibilidade reduzida, relvado encharcado. Isto vai ser difícil.`,
      `Chuva torrencial no estádio! O árbitro avaliou as condições… e decidiu jogar na mesma.`,
      `Mau tempo de fazer ficar em casa. Quem está cá, está mesmo comprometido.`,
    ],
    vento: [
      `Vento forte hoje. As bolas paradas vão ser uma lotaria — para ambos os lados.`,
      `Ventania no estádio. Os guarda-redes vão ter dificuldades com as bolas altas.`,
      `Tarde ventosa. Os cruzamentos vão ser imprevisíveis e os remates de longe, perigosos.`,
    ],
    frio: [
      `Faz frio. Os jogadores aqueceram muito antes do jogo — e vão continuar a tentar aquecer no relvado.`,
      `Temperatura baixa no estádio. Dedos gelados nos bancos, pés pesados em campo.`,
      `Noite fria. Aqui precisa-se de movimento constante para não solidificar.`,
    ],
    nevoeiro: [
      `Nevoeiro no estádio. Mal se vê a baliza do lado oposto — e os adeptos das bancadas ainda menos.`,
      `Visibilidade reduzida pela neblina. Vai ser difícil acompanhar o jogo em tempo real.`,
      `Nevoeiro cerrado. O árbitro certificou-se que conseguia ver os dois postes antes de apitar.`,
    ],
    neve: [
      `Está a nevar! Relvado branco, bola laranja, condições de sonho para quem não tem que jogar.`,
      `Neve fina cobre o relvado. Vão ser noventa minutos de patinagem artística involuntária.`,
      `Que cenário! Neve a cair durante o aquecimento. O jogo vai ter um ambiente único.`,
    ],
  };
  return pickPhrase(
    pools[condition] || [`Condições variáveis no estádio hoje.`],
  );
}

function secondHalfStartPhrase(): string {
  return pickPhrase([
    `Recomeça a partida! Arranca a segunda parte.`,
    `As equipas regressam do balneário. Bola a rolar na segunda parte.`,
    `Tudo pronto para os últimos 45 minutos. Segunda parte em andamento.`,
    `Apita o árbitro: começa a segunda parte, com tudo em aberto.`,
    `Volta o futebol. A segunda parte promete emoção até ao fim.`,
  ]);
}

function extraTimeStartPhrase(): string {
  return pickPhrase([
    `Começa o prolongamento. Mais 30 minutos para decidir tudo.`,
    `Sem vencedor no tempo regulamentar: arranca o prolongamento.`,
    `As pernas pesam, mas a decisão continua adiada. Prolongamento em jogo.`,
    `Recomeça a batalha no minuto 91. Está aberto o prolongamento.`,
    `Ninguém cedeu nos 90 minutos. Agora decide-se no prolongamento.`,
  ]);
}
// ── End commentary helpers ───────────────────────────────────────────────────

function pickBestPlayer(players: PlayerRow[] = []) {
  if (!players.length) return null;
  return [...players].sort((a, b) => getOverall(b) - getOverall(a))[0];
}

/**
 * Weighted random pick for goal scorer.
 * Stars (MED/ATA with is_star=1) get a 3× weight so they score more often.
 */
function weightedPickScorer(players: PlayerRow[] = []) {
  if (!players.length) return null;
  const weights = players.map((p) => (p.is_star ? 3 : 1));
  const total = weights.reduce((s, w) => s + w, 0);
  let r = Math.random() * total;
  for (let i = 0; i < players.length; i++) {
    r -= weights[i];
    if (r <= 0) return players[i];
  }
  return players[players.length - 1];
}

function isPlayerAvailable(player: PlayerRow, currentMatchweek = 1) {
  const suspensionUntil = player.suspension_until_matchweek || 0;
  const injuryUntil = player.injury_until_matchweek || 0;
  return currentMatchweek > suspensionUntil && currentMatchweek > injuryUntil;
}

async function getTeamSquad(
  db: Db,
  teamId: number,
  tactic: Tactic | null,
  currentMatchweek = 1,
): Promise<PlayerRow[]> {
  return new Promise<PlayerRow[]>((resolve, reject) => {
    db.all("SELECT * FROM players WHERE team_id = ?", [teamId], (err, rows) => {
      if (err) return reject(err);

      // Build available roster and inject junior GRs if fewer than 2 are available
      const availableReal = (rows || []).filter((p) =>
        isPlayerAvailable(p, currentMatchweek),
      );
      const availableRows = withJuniorGRs(
        availableReal,
        teamId,
        currentMatchweek,
      );

      // If tactic has explicit position assignments, use them
      if (tactic && tactic.positions) {
        const lineup = availableRows.filter(
          (p) => tactic.positions[p.id] === "Titular",
        );
        if (lineup.length === 11) return resolve(lineup);
      }

      // Auto-pick best 11 based on formation
      const sorted = [...availableRows].sort(
        (a, b) => getOverall(b) - getOverall(a),
      );
      const lineup = [];
      const formationStr =
        tactic && tactic.formation ? tactic.formation : "4-4-2";
      const parts = formationStr.split("-");
      const positions = {
        GR: 1,
        DEF: parseInt(parts[0], 10),
        MED: parseInt(parts[1], 10),
        ATA: parseInt(parts[2], 10),
      };
      const currentPos = { GR: 0, DEF: 0, MED: 0, ATA: 0 };

      sorted.forEach((p) => {
        if (currentPos[p.position] < positions[p.position]) {
          lineup.push(p);
          currentPos[p.position]++;
        }
      });

      if (lineup.length < 11) {
        const missing = 11 - lineup.length;
        // Never fill with a 2nd GK — that causes the 2-GK bug
        const remaining = sorted.filter(
          (p) => !lineup.includes(p) && p.position !== "GR",
        );
        lineup.push(...remaining.slice(0, missing));
      }

      resolve(lineup);
    });
  });
}

async function generateFixturesForDivision(
  db: Db,
  division: number,
  matchweek: number,
  userTeamId?: number,
): Promise<MatchFixture[]> {
  return new Promise<MatchFixture[]>((resolve) => {
    db.all(
      "SELECT id FROM teams WHERE division = ? ORDER BY id",
      [division],
      (err, teams) => {
        if (err || !teams || teams.length < 2) return resolve([]);

        const n = teams.length;
        const totalRounds = n - 1;
        const totalMatchweeks = totalRounds * 2;
        const normMw = ((matchweek - 1) % totalMatchweeks) + 1;
        const isSecondLeg = normMw > totalRounds;
        const round = isSecondLeg ? normMw - totalRounds - 1 : normMw - 1;
        const rotating = teams.slice(1);

        const rotated = [];
        for (let i = 0; i < rotating.length; i++) {
          rotated.push(rotating[(i + round) % rotating.length]);
        }

        const allTeams = [teams[0], ...rotated];
        const fixtures = [];

        for (let i = 0; i < n / 2; i++) {
          let homeTeam = allTeams[i];
          let awayTeam = allTeams[n - 1 - i];
          if (isSecondLeg) {
            [homeTeam, awayTeam] = [awayTeam, homeTeam];
          }

          fixtures.push({
            homeTeamId: homeTeam.id,
            awayTeamId: awayTeam.id,
            finalHomeGoals: 0,
            finalAwayGoals: 0,
            events: [],
          });
        }

        // Ensure home/away alternation for userTeam across the season.
        // Compute, for each first-leg round, whether a swap is needed so
        // the user's team never plays two consecutive home (or away) games.
        if (userTeamId) {
          const swapMap: Record<number, boolean> = {};
          let prevCorrectedHome: boolean | null = null;
          for (let r = 0; r < totalRounds; r++) {
            const rot = rotating.map(
              (_, i) => rotating[(i + r) % rotating.length],
            );
            const all = [teams[0], ...rot];
            let rawIsHome: boolean | null = null;
            for (let i = 0; i < Math.floor(n / 2); i++) {
              if (all[i].id === userTeamId) {
                rawIsHome = true;
                break;
              }
              if (all[n - 1 - i].id === userTeamId) {
                rawIsHome = false;
                break;
              }
            }
            if (rawIsHome === null) continue;
            const needsSwap =
              prevCorrectedHome !== null && rawIsHome === prevCorrectedHome;
            swapMap[r] = needsSwap;
            prevCorrectedHome = needsSwap ? !rawIsHome : rawIsHome;
          }

          if (swapMap[round]) {
            const idx = fixtures.findIndex(
              (f) => f.homeTeamId === userTeamId || f.awayTeamId === userTeamId,
            );
            if (idx >= 0) {
              const f = fixtures[idx];
              [f.homeTeamId, f.awayTeamId] = [f.awayTeamId, f.homeTeamId];
            }
          }
        }

        resolve(fixtures);
      },
    );
  });
}

function getCurrentPlayerState(game: ActiveGame, teamId: number) {
  return Object.values(game.playersByName).find(
    (p) => p.teamId === teamId && p.socketId,
  );
}

function waitForMatchAction({
  game,
  io,
  type,
  teamId,
  payload,
  timeoutMs,
  fallback,
}: {
  game: ActiveGame;
  io: any;
  type: string;
  teamId: number;
  payload: Record<string, unknown>;
  timeoutMs: number;
  fallback: () => any;
}): Promise<{ choice: any; source: string }> {
  const humanCoach = getCurrentPlayerState(game, teamId);
  if (!humanCoach) {
    return Promise.resolve({ choice: fallback(), source: "auto" });
  }

  return new Promise<{ choice: any; source: string }>((resolve) => {
    const actionId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const finalize = (choice, source = "auto") => {
      const pendingAction: any = game.pendingMatchAction;
      if (pendingAction && pendingAction.actionId === actionId) {
        clearTimeout(pendingAction.timer);
        game.pendingMatchAction = null;
      }
      io.to(game.roomCode).emit("matchActionResolved", {
        actionId,
        teamId,
        source,
      });
      resolve({ choice, source });
    };

    const timer = setTimeout(() => {
      finalize(fallback(), "auto");
    }, timeoutMs);

    game.pendingMatchAction = {
      actionId,
      type,
      teamId,
      timer,
      finalize,
      fallback,
    };

    io.to(game.roomCode).emit("matchActionRequired", {
      actionId,
      type,
      teamId,
      ...payload,
    });
  });
}

function getAvailableBench(teamSquad: PlayerRow[], lineupIds: Set<number>) {
  return teamSquad.filter((p) => !lineupIds.has(p.id));
}

function selectPenaltyTaker(squad: PlayerRow[] = []) {
  return pickBestPlayer(squad) || null;
}

function clampSkill(value: number) {
  return Math.max(0, Math.min(50, Math.round(value)));
}

function clampPercent(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

// Per-minute goal probability multiplier based on real football time distribution.
// Weights are normalised so the average across 90 min = 1.0 (total goals unchanged).
function getGoalTimeMultiplier(minute: number): number {
  if (minute <= 10) return 0.66; // 00'–10' ~7-8%
  if (minute <= 20) return 0.83; // 11'–20' ~9-10%
  if (minute <= 30) return 0.94; // 21'–30' ~11%
  if (minute <= 40) return 1.02; // 31'–40' ~12%
  if (minute <= 45) return 1.11; // 41'–HT  ~13%
  if (minute <= 55) return 0.85; // 46'–55' ~10%
  if (minute <= 65) return 0.94; // 56'–65' ~11%
  if (minute <= 75) return 1.11; // 66'–75' ~13%
  if (minute <= 85) return 1.28; // 76'–85' ~15%
  return 1.62; // 86'–FT  ~18-20%
}

function normaliseStyle(style: unknown) {
  const raw = String(style || "Balanced")
    .trim()
    .toUpperCase();
  if (raw === "DEFENSIVO" || raw === "DEFENSIVE") return "DEFENSIVO";
  if (raw === "OFENSIVO" || raw === "OFFENSIVE") return "OFENSIVO";
  return "EQUILIBRADO";
}

function getAggressivenessValue(player: PlayerRow) {
  if (typeof player?.aggressiveness === "number") {
    return Math.max(1, Math.min(5, Math.round(player.aggressiveness)));
  }

  const AGG_TIER_VALUES = {
    Cordeirinho: 1,
    Cavalheiro: 2,
    "Fair Play": 3,
    Caneleiro: 4,
    Caceteiro: 5,
  };

  return AGG_TIER_VALUES[player?.aggressiveness] ?? 3;
}

function average(values: number[] = []) {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function getAttr(player: PlayerRow, key: string, fallback = 1) {
  const value = player?.[key];
  if (typeof value === "number") return value;
  if (typeof player?.skill === "number") return player.skill;
  return fallback;
}

function getOverall(player: PlayerRow) {
  const gk = getAttr(player, "gk", 1);
  const defesa = getAttr(player, "defesa", 1);
  const passe = getAttr(player, "passe", 1);
  const finalizacao = getAttr(player, "finalizacao", 1);
  const forma = Math.max(1, Math.min(50, player?.form ?? 25));
  const base = (gk + defesa + passe + finalizacao) / 4;
  return base * (0.8 + forma / 250);
}

async function applyInjuryEvent({
  db,
  fixture,
  teamSide,
  squad,
  fullRoster,
  lineupIds,
  currentMatchweek,
  io,
  game,
}: {
  db: Db;
  fixture: MatchFixture;
  teamSide: "home" | "away";
  squad: PlayerRow[];
  fullRoster: PlayerRow[];
  lineupIds: Set<number>;
  currentMatchweek: number;
  io: any;
  game: ActiveGame;
}) {
  if (!squad.length) return { replaced: false, injuredPlayer: null };

  const injuredPlayer = squad[Math.floor(Math.random() * squad.length)];
  const severityRoll = Math.random();
  let injuryWeeks;
  let injuryLabel;
  if (severityRoll < 0.1) {
    // Grave: 3–8 semanas, incomum
    injuryWeeks = 3 + Math.floor(Math.random() * 6);
    injuryLabel = "grave";
  } else {
    // Leve: 1 semana (afasta da próxima convocatória), comum
    injuryWeeks = 1;
    injuryLabel = "leve";
  }

  const injuryUntil = currentMatchweek + injuryWeeks;
  const qualityLoss =
    injuryLabel === "grave" ? 2 + Math.floor(Math.random() * 4) : 0;
  db.run(
    "UPDATE players SET injuries = injuries + 1, career_injuries = career_injuries + 1, form = MAX(1, form - ?), injury_until_matchweek = CASE WHEN injury_until_matchweek > ? THEN injury_until_matchweek ELSE ? END WHERE id = ?",
    [qualityLoss * 3, injuryUntil, injuryUntil, injuredPlayer.id],
  );

  fixture.events.push({
    minute: fixture._minute,
    type: "injury",
    team: teamSide,
    emoji: "🚑",
    playerId: injuredPlayer.id,
    playerName: injuredPlayer.name,
    text: `[${fixture._minute}'] 🚑 ${injuryPhrase(injuredPlayer.name, injuryLabel)}`,
    severity: injuryLabel,
  });

  const teamId = teamSide === "home" ? fixture.homeTeamId : fixture.awayTeamId;

  // Only show players who were explicitly chosen as "Suplente" in the pre-match tactic.
  // This prevents listing the full squad and showing players that weren't on the bench.
  const tactic = teamSide === "home" ? fixture._t1 : fixture._t2;
  const tacticPositions: Record<number, string> = tactic?.positions || {};
  const benchIds = new Set(
    Object.entries(tacticPositions)
      .filter(([, status]) => status === "Suplente")
      .map(([id]) => Number(id)),
  );
  const roster = fullRoster || squad;
  const availableBench = roster.filter(
    (p) => !lineupIds.has(p.id) && (benchIds.size === 0 || benchIds.has(p.id)),
  );

  // If the injured player is a goalkeeper, prefer substituting with another goalkeeper
  let substituteCandidates = availableBench;
  if (injuredPlayer.position === "GR") {
    const grBench = availableBench.filter((p) => p.position === "GR");
    substituteCandidates = grBench.length > 0 ? grBench : availableBench;
  }

  const fallback = () => pickBestPlayer(substituteCandidates)?.id || null;
  const result = await waitForMatchAction({
    game,
    io,
    type: "injury",
    teamId,
    payload: {
      minute: fixture._minute,
      teamId,
      injuredPlayer: {
        id: injuredPlayer.id,
        name: injuredPlayer.name,
        position: injuredPlayer.position,
      },
      benchPlayers: substituteCandidates.map((p) => ({
        id: p.id,
        name: p.name,
        position: p.position,
        skill: Math.round(getOverall(p)),
      })),
      currentScore: {
        home: fixture.finalHomeGoals,
        away: fixture.finalAwayGoals,
      },
    },
    timeoutMs: 60000,
    fallback,
  });

  const replacement =
    result.choice && availableBench.find((p) => p.id === result.choice);
  if (replacement) {
    const idx = squad.findIndex((p) => p.id === injuredPlayer.id);
    if (idx > -1) squad.splice(idx, 1, replacement);
    lineupIds.delete(injuredPlayer.id);
    lineupIds.add(replacement.id);

    // Actualizar snapshot de lineup para que o ecrã de intervalo reflicta a substituição
    const lineupRef =
      teamSide === "home" ? fixture.homeLineup : fixture.awayLineup;
    if (lineupRef) {
      const li = lineupRef.findIndex((p: any) => p.id === injuredPlayer.id);
      if (li > -1) {
        lineupRef[li] = {
          id: replacement.id,
          name: replacement.name,
          position: replacement.position,
          is_star: replacement.is_star || 0,
<<<<<<< HEAD
          skill: Math.round(getOverall(replacement)),
=======
          skill: replacement.skill,
>>>>>>> d8a30d5 (more errors on substitutions in half time)
        };
      }
    }

    fixture.events.push({
      minute: fixture._minute,
      type: "substitution",
      team: teamSide,
      emoji: "🔁",
      playerId: replacement.id,
      playerName: replacement.name,
      text: `[${fixture._minute}'] 🔁 ${subPhrase(injuredPlayer.name, replacement.name)}`,
    });
    return { replaced: true, injuredPlayer, replacement };
  }

  const idx = squad.findIndex((p) => p.id === injuredPlayer.id);
  if (idx > -1) squad.splice(idx, 1);
  lineupIds.delete(injuredPlayer.id);

  // Remover jogador do snapshot de lineup quando sai sem substituto
  const lineupRefNoSub =
    teamSide === "home" ? fixture.homeLineup : fixture.awayLineup;
  if (lineupRefNoSub) {
    const li = lineupRefNoSub.findIndex((p: any) => p.id === injuredPlayer.id);
    if (li > -1) lineupRefNoSub.splice(li, 1);
  }

  return { replaced: false, injuredPlayer, replacement: null };
}

async function applyPenaltyEvent({
  db,
  fixture,
  teamSide,
  squad,
  currentMatchweek,
  io,
  game,
}: {
  db: Db;
  fixture: MatchFixture;
  teamSide: "home" | "away";
  squad: PlayerRow[];
  currentMatchweek: number;
  io: any;
  game: ActiveGame;
}) {
  const teamId = teamSide === "home" ? fixture.homeTeamId : fixture.awayTeamId;
  const takerCandidates = squad.filter((p) =>
    isPlayerAvailable(p, currentMatchweek),
  );
  const fallback = () => selectPenaltyTaker(takerCandidates)?.id || null;
  const result = await waitForMatchAction({
    game,
    io,
    type: "penalty",
    teamId,
    payload: {
      minute: fixture._minute,
      teamId,
      takerCandidates: takerCandidates.map((p) => ({
        id: p.id,
        name: p.name,
        position: p.position,
        skill: Math.round(getOverall(p)),
      })),
      currentScore: {
        home: fixture.finalHomeGoals,
        away: fixture.finalAwayGoals,
      },
    },
    timeoutMs: 12000,
    fallback,
  });

  const taker =
    result.choice && takerCandidates.find((p) => p.id === result.choice)
      ? takerCandidates.find((p) => p.id === result.choice)
      : fallback();
  if (!taker) return;

  // Base 82% goal rate, skill (range 5–50) shifts it ±6 pp around the mean (30)
  const penaltySkill =
    getAttr(taker, "finalizacao", 1) * 0.75 + getAttr(taker, "passe", 1) * 0.25;
  const goalChance = Math.max(
    0.74,
    Math.min(0.92, 0.82 + (penaltySkill - 30) / 250),
  );
  const scored = Math.random() < goalChance;

  if (scored) {
    if (teamSide === "home") fixture.finalHomeGoals++;
    else fixture.finalAwayGoals++;
    db.run(
      "UPDATE players SET goals = goals + 1, career_goals = career_goals + 1 WHERE id = ?",
      [taker.id],
    );
    fixture.events.push({
      minute: fixture._minute,
      type: "penalty_goal",
      team: teamSide,
      emoji: "⚽",
      playerId: taker.id,
      playerName: taker.name,
      text: `[${fixture._minute}'] ⚽ ${penaltyGoalPhrase(taker.name)}`,
      penaltySuspense: true,
      penaltyResult: "GOLO!!!",
    });
  } else {
    // Miss type proportions: 60% save · 20% post/wide · 20% panenka
    const missRoll = Math.random();
    let missType: string;
    if (missRoll < 0.6) {
      missType = "DEFENDEU!";
    } else if (missRoll < 0.7) {
      missType = "AO POSTE!";
    } else if (missRoll < 0.8) {
      missType = "AO LADO!";
    } else {
      missType = "PANENKA FALHADO!";
    }
    fixture.events.push({
      minute: fixture._minute,
      type: "penalty_miss",
      team: teamSide,
      emoji: "❌",
      playerId: taker.id,
      playerName: taker.name,
      text: `[${fixture._minute}'] ❌ ${penaltyMissPhrase(taker.name, missType)}`,
      penaltySuspense: true,
      penaltyResult: missType,
    });
  }
}

function applyFatigue(
  squad: PlayerRow[],
  lineupIds: Set<number>,
  amount: number,
) {
  for (const p of squad) {
    if (lineupIds.has(p.id)) {
      const formDrop = amount * 2;
      p.form = Math.max(1, (p.form ?? 25) - formDrop);
      if (typeof p.resistencia === "number") {
        p.resistencia = Math.max(1, p.resistencia - amount * 1);
      }
    }
  }
}

async function simulateMatchSegment(
  db: Db,
  fixture: MatchFixture,
  homeTactic: Tactic | null,
  awayTactic: Tactic | null,
  startMin: number,
  endMin: number,
  context: any = {},
) {
  const currentMatchweek = context.matchweek || 1;
  const io = context.io;
  const game = context.game;

  let homeSquad;
  if (fixture._homeSquad) {
    homeSquad = fixture._homeSquad;
  } else if (fixture.homeLineup && fixture.homeLineup.length > 0) {
    const homeIds = new Set(fixture.homeLineup.map((p: any) => p.id));
    for (const e of fixture.events || []) {
      if (e.team === "home") {
        if ((e.type === "red" || e.type === "injury") && e.playerId)
          homeIds.delete(e.playerId);
        if (e.type === "substitution" && e.playerId) homeIds.add(e.playerId);
      }
    }
    // Junior GRs have negative IDs — fetch real players from DB, then re-add any juniors.
    homeSquad = await new Promise<any[]>((resolve) => {
      const allIds = Array.from(homeIds);
      const realIds = allIds.filter((id: number) => id > 0);
      const juniorIds = new Set(allIds.filter((id: number) => id < 0));
      const ph = realIds.length > 0 ? realIds.map(() => "?").join(",") : "0";
      db.all(
        `SELECT * FROM players WHERE id IN (${ph})`,
        realIds.length > 0 ? realIds : [],
        (_, r) => {
          const dbPlayers = r || [];
          // Re-add cached junior GRs whose IDs are still in the active lineup.
          const cachedJuniors = (fixture._homeFullRoster || []).filter(
            (p: any) => juniorIds.has(p.id),
          );
          resolve([...dbPlayers, ...cachedJuniors]);
        },
      );
    });
    fixture._homeSquad = homeSquad;
  } else {
    homeSquad = await getTeamSquad(
      db,
      fixture.homeTeamId,
      homeTactic,
      currentMatchweek,
    );
    fixture._homeSquad = homeSquad;
  }

  let awaySquad;
  if (fixture._awaySquad) {
    awaySquad = fixture._awaySquad;
  } else if (fixture.awayLineup && fixture.awayLineup.length > 0) {
    const awayIds = new Set(fixture.awayLineup.map((p: any) => p.id));
    for (const e of fixture.events || []) {
      if (e.team === "away") {
        if ((e.type === "red" || e.type === "injury") && e.playerId)
          awayIds.delete(e.playerId);
        if (e.type === "substitution" && e.playerId) awayIds.add(e.playerId);
      }
    }
    // Junior GRs have negative IDs — fetch real players from DB, then re-add any juniors.
    awaySquad = await new Promise<any[]>((resolve) => {
      const allIds = Array.from(awayIds);
      const realIds = allIds.filter((id: number) => id > 0);
      const juniorIds = new Set(allIds.filter((id: number) => id < 0));
      const ph = realIds.length > 0 ? realIds.map(() => "?").join(",") : "0";
      db.all(
        `SELECT * FROM players WHERE id IN (${ph})`,
        realIds.length > 0 ? realIds : [],
        (_, r) => {
          const dbPlayers = r || [];
          const cachedJuniors = (fixture._awayFullRoster || []).filter(
            (p: any) => juniorIds.has(p.id),
          );
          resolve([...dbPlayers, ...cachedJuniors]);
        },
      );
    });
    fixture._awaySquad = awaySquad;
  } else {
    awaySquad = await getTeamSquad(
      db,
      fixture.awayTeamId,
      awayTactic,
      currentMatchweek,
    );
    fixture._awaySquad = awaySquad;
  }

  if (!fixture._yellowCards) {
    fixture._yellowCards = {};
  }

  // Track games played — increment once per match (startMin === 1, first minute of first half only)
  // Exclude junior GR negative IDs — they are ephemeral and have no DB row.
  if (startMin === 1) {
    const participantIds = [
      ...Array.from(new Set((homeSquad || []).map((p: any) => p.id))),
      ...Array.from(new Set((awaySquad || []).map((p: any) => p.id))),
    ].filter((id) => typeof id === "number" && id > 0);
    if (participantIds.length > 0) {
      const ph = participantIds.map(() => "?").join(",");
      db.run(
        `UPDATE players SET games_played = games_played + 1 WHERE id IN (${ph})`,
        participantIds,
      );
    }

    // Weather event — emitted once at the start of each match
    if (!fixture._weather) {
      const weatherRoll = Math.random();
      let weatherCondition: string;
      if (weatherRoll < 0.35) weatherCondition = "sol";
      else if (weatherRoll < 0.65) weatherCondition = "chuva";
      else if (weatherRoll < 0.8) weatherCondition = "vento";
      else if (weatherRoll < 0.88) weatherCondition = "chuva_forte";
      else if (weatherRoll < 0.95) weatherCondition = "frio";
      else if (weatherRoll < 0.98) weatherCondition = "nevoeiro";
      else weatherCondition = "neve";

      const weatherEmojis: Record<string, string> = {
        sol: "☀️",
        chuva: "🌧️",
        chuva_forte: "⛈️",
        vento: "💨",
        frio: "🥶",
        nevoeiro: "🌫️",
        neve: "❄️",
      };
      fixture._weather = weatherCondition;
      fixture.events.push({
        minute: 1,
        type: "weather",
        team: null,
        emoji: weatherEmojis[weatherCondition] || "🌤️",
        text: `[1'] ${weatherEmojis[weatherCondition] || "🌤️"} ${weatherPhrase(weatherCondition)}`,
      });
    }
  }

  // Load team morale values (cached on fixture for minute-by-minute mode)
  let homeMorale: number, awayMorale: number;
  if (fixture._homeMorale !== undefined) {
    homeMorale = fixture._homeMorale;
    awayMorale = fixture._awayMorale;
  } else {
    [homeMorale, awayMorale] = await Promise.all([
      new Promise<number>((res) =>
        db.get(
          "SELECT morale FROM teams WHERE id = ?",
          [fixture.homeTeamId],
          (err, row) => res(row && row.morale != null ? row.morale : 50),
        ),
      ),
      new Promise<number>((res) =>
        db.get(
          "SELECT morale FROM teams WHERE id = ?",
          [fixture.awayTeamId],
          (err, row) => res(row && row.morale != null ? row.morale : 50),
        ),
      ),
    ]);
    fixture._homeMorale = homeMorale;
    fixture._awayMorale = awayMorale;
  }

  // Load full rosters for bench availability during injuries (cached on fixture)
  let homeFullRoster: PlayerRow[], awayFullRoster: PlayerRow[];
  if (fixture._homeFullRoster) {
    homeFullRoster = fixture._homeFullRoster;
    awayFullRoster = fixture._awayFullRoster;
  } else {
    homeFullRoster = await new Promise<PlayerRow[]>((resolve, reject) => {
      db.all(
        "SELECT * FROM players WHERE team_id = ?",
        [fixture.homeTeamId],
        (err, rows) => {
          if (err) return reject(err);
          const available = (rows || []).filter((p) =>
            isPlayerAvailable(p, currentMatchweek),
          );
          resolve(
            withJuniorGRs(available, fixture.homeTeamId, currentMatchweek),
          );
        },
      );
    });
    awayFullRoster = await new Promise<PlayerRow[]>((resolve, reject) => {
      db.all(
        "SELECT * FROM players WHERE team_id = ?",
        [fixture.awayTeamId],
        (err, rows) => {
          if (err) return reject(err);
          const available = (rows || []).filter((p) =>
            isPlayerAvailable(p, currentMatchweek),
          );
          resolve(
            withJuniorGRs(available, fixture.awayTeamId, currentMatchweek),
          );
        },
      );
    });
    fixture._homeFullRoster = homeFullRoster;
    fixture._awayFullRoster = awayFullRoster;
  }

  // Snapshot the lineups for this segment so clients can display "who was on the pitch"
  const lineupSnapshot = (squad: any[]) =>
    squad.map((p) => ({
      id: p.id,
      name: p.name,
      position: p.position,
      is_star: p.is_star || 0,
      skill: Math.round(getOverall(p)),
      gk: getAttr(p, "gk", 1),
      defesa: getAttr(p, "defesa", 1),
      passe: getAttr(p, "passe", 1),
      finalizacao: getAttr(p, "finalizacao", 1),
      form: p.form ?? 25,
    }));
  if (!fixture.homeLineup || fixture.homeLineup.length === 0) {
    fixture.homeLineup = lineupSnapshot(homeSquad);
    fixture.awayLineup = lineupSnapshot(awaySquad);
  }

  // Persistent lineup tracking across all minutes in this segment
  const homeLineupIds = new Set<number>(homeSquad.map((p: any) => p.id));
  const awayLineupIds = new Set<number>(awaySquad.map((p: any) => p.id));

  const getPower = (squad, tactic, morale = 50) => {
    const formation = String(tactic?.formation || "4-4-2");
    const style = normaliseStyle(tactic?.style);

    const midfielders = squad.filter((p) => p.position === "MED");
    const forwards = squad.filter((p) => p.position === "ATA");
    const defenders = squad.filter((p) => p.position === "DEF");
    const keepers = squad.filter((p) => p.position === "GR");

    const avgMidfielderPass = average(
      midfielders.map((p) => getAttr(p, "passe", 1)),
    );
    const avgMidfielderForm = average(midfielders.map((p) => p.form || 25));
    const avgForwardFin = average(
      forwards.map((p) => getAttr(p, "finalizacao", 1)),
    );
    const avgForwardPass = average(forwards.map((p) => getAttr(p, "passe", 1)));
    const avgForwardForm = average(forwards.map((p) => p.form || 25));
    const avgDefenderDef = average(
      defenders.map((p) => getAttr(p, "defesa", 1)),
    );
    const avgKeeperGk = average(keepers.map((p) => getAttr(p, "gk", 1)));
    const avgBacklineForm = average(
      [...defenders, ...keepers].map((p) => p.form || 25),
    );

    const formationOffensiveFactors = {
      "4-2-4": 1.15,
      "3-4-3": 1.12,
      "4-3-3": 1.08,
      "3-5-2": 1.05,
      "4-4-2": 1.0,
      "4-5-1": 0.9,
      "5-3-2": 0.85,
      "5-4-1": 0.8,
    };

    const formationDefensiveFactors = {
      "5-4-1": 1.25,
      "5-3-2": 1.2,
      "4-5-1": 1.1,
      "4-4-2": 1.0,
      "3-5-2": 0.95,
      "4-3-3": 0.9,
      "3-4-3": 0.85,
      "4-2-4": 0.75,
    };

    const styleOffensiveFactor = {
      DEFENSIVO: 0.85,
      EQUILIBRADO: 1.0,
      OFENSIVO: 1.15,
    };

    const formationAttack = formationOffensiveFactors[formation] ?? 1.0;
    const formationDefense = formationDefensiveFactors[formation] ?? 1.0;

    const moraleFactor = 1 + (morale - 50) * 0.005;
    const moraleAdjusted = Math.max(0.5, Math.min(1.5, moraleFactor));
    const midfieldBase = avgMidfielderPass * 0.75 + avgMidfielderForm * 0.25;
    const attackBase =
      avgForwardFin * 0.7 + avgForwardPass * 0.15 + avgForwardForm * 0.15;
    const defenseBase =
      avgDefenderDef * 0.68 + avgKeeperGk * 0.32 + avgBacklineForm * 0.1;

    return {
      midfield: midfieldBase * moraleAdjusted,
      attack:
        attackBase *
        formationAttack *
        moraleAdjusted *
        styleOffensiveFactor[style],
      defense: defenseBase * formationDefense,
      style,
      squad,
    };
  };

  const home = getPower(homeSquad, homeTactic, homeMorale);
  const away = getPower(awaySquad, awayTactic, awayMorale);

  for (let minute = startMin; minute <= endMin; minute++) {
    fixture._minute = minute;

    if (minute === 46 && !fixture._secondHalfStartComment) {
      fixture.events.push({
        minute,
        type: "phase_start",
        team: null,
        emoji: "🔔",
        text: `[46'] 🔔 ${secondHalfStartPhrase()}`,
      });
      fixture._secondHalfStartComment = true;
    }

    if (minute === 91 && !fixture._extraTimeStartComment) {
      fixture.events.push({
        minute,
        type: "phase_start",
        team: null,
        emoji: "⏱️",
        text: `[91'] ⏱️ ${extraTimeStartPhrase()}`,
      });
      fixture._extraTimeStartComment = true;
    }

    // Cansaço: -1 a partir do minuto 46, -2 total a partir do minuto 70
    if (minute === 46 && !fixture._fatigue1Applied) {
      applyFatigue(homeSquad, homeLineupIds, 1);
      applyFatigue(awaySquad, awayLineupIds, 1);
      fixture._fatigue1Applied = true;
    }
    if (minute === 70 && !fixture._fatigue2Applied) {
      applyFatigue(homeSquad, homeLineupIds, 1);
      applyFatigue(awaySquad, awayLineupIds, 1);
      fixture._fatigue2Applied = true;
    }

    const currentHome = getPower(home.squad, homeTactic, homeMorale);
    const currentAway = getPower(away.squad, awayTactic, awayMorale);

    let goalScoredThisMinute = false;
    let chanceTriggered = false;

    const processChance = (attackingSide: "home" | "away") => {
      const attacking = attackingSide === "home" ? currentHome : currentAway;
      const defending = attackingSide === "home" ? currentAway : currentHome;
      const isHome = attackingSide === "home";
      const scoringSquad = isHome ? home.squad : away.squad;

      const STYLE_FACTORS = {
        DEFENSIVO: 0.85,
        EQUILIBRADO: 1.0,
        OFENSIVO: 1.15,
      };
      const opponentStyleFactor = STYLE_FACTORS[defending.style] || 1.0;
      const adjustedAttack =
        (attacking.attack || 1) * (1.0 / opponentStyleFactor);
      const ratio =
        adjustedAttack / (adjustedAttack + (defending.defense || 1));
      let probGoal = ratio * 0.17 * getGoalTimeMultiplier(fixture._minute);
      probGoal *= isHome ? 1.05 : 0.95;

      const craquesInXI = scoringSquad.filter(
        (p) => p.is_star && (p.position === "MED" || p.position === "ATA"),
      ).length;
      if (craquesInXI > 2) {
        const egoPenalty = Math.min(0.3, (craquesInXI - 2) * 0.1);
        probGoal *= 1.0 - egoPenalty;
      }

      const scorers = scoringSquad.filter(
        (p) => p.position === "ATA" || p.position === "MED",
      );
      const scorer =
        scorers.length > 0 ? weightedPickScorer(scorers) : scoringSquad[0];

      if (Math.random() < probGoal) {
        if (Math.random() < 0.05) {
          fixture.events.push({
            minute,
            type: "var_disallowed",
            team: attackingSide,
            emoji: "🚩",
            playerId: scorer ? scorer.id : null,
            playerName: scorer ? scorer.name : "Jogador",
            text: `[${minute}'] 🚩 ${varPhrase(scorer ? scorer.name : "Jogador")}`,
            wasGoal: true,
          });
          return;
        }

        if (isHome) fixture.finalHomeGoals++;
        else fixture.finalAwayGoals++;
        goalScoredThisMinute = true;
        const decisiveChance = Math.min(0.6, craquesInXI * 0.2);
        fixture.events.push({
          minute,
          type: "goal",
          team: attackingSide,
          emoji: "⚽",
          playerId: scorer ? scorer.id : null,
          playerName: scorer ? scorer.name : "Jogador",
          text: `[${minute}'] ⚽ ${goalPhrase(scorer ? scorer.name : "Jogador")}`,
          isDecisive: Math.random() < decisiveChance,
        });
        if (scorer) {
          db.run(
            "UPDATE players SET goals = goals + 1, career_goals = career_goals + 1 WHERE id = ?",
            [scorer.id],
          );
        }
        return;
      }

      if (scorer) {
        const defendingSquad = isHome ? away.squad : home.squad;
        const grPlayer = defendingSquad.find((p) => p.position === "GR");
        const phrase =
          Math.random() < 0.45 && grPlayer
            ? bigSavePhrase(grPlayer.name)
            : nearMissPhrase(scorer.name);
        fixture.events.push({
          minute,
          type: "near_miss",
          team: attackingSide,
          emoji: "🥅",
          playerId: scorer.id,
          playerName: scorer.name,
          text: `[${minute}'] 🥅 ${phrase}`,
        });
      }
    };

    const penaltyChance = 0.002;
    if (Math.random() < penaltyChance) {
      const attackingSide = Math.random() < 0.5 ? "home" : "away";
      const attackingSquad = attackingSide === "home" ? home.squad : away.squad;
      const totalGoalsBefore = fixture.finalHomeGoals + fixture.finalAwayGoals;
      await applyPenaltyEvent({
        db,
        fixture,
        teamSide: attackingSide,
        squad: attackingSquad,
        currentMatchweek,
        io,
        game,
      });
      if (fixture.finalHomeGoals + fixture.finalAwayGoals > totalGoalsBefore) {
        goalScoredThisMinute = true;
      }
    }

    const homeMid = currentHome.midfield || 1;
    const awayMid = currentAway.midfield || 1;
    const homePossessionChance = homeMid / (homeMid + awayMid);
    const teamInControl =
      Math.random() < homePossessionChance ? "home" : "away";
    const chanceOfAction = 0.14;
    if (Math.random() < chanceOfAction) {
      chanceTriggered = true;
      processChance(teamInControl);
    }

    // Near-miss / big save events — roughly 1–2 per match, commentary-only
    if (!goalScoredThisMinute && !chanceTriggered && Math.random() < 0.012) {
      const nearMissSide =
        currentHome.attack > currentAway.attack
          ? Math.random() < 0.55
            ? "home"
            : "away"
          : Math.random() < 0.55
            ? "away"
            : "home";
      const nearMissSquad = nearMissSide === "home" ? home.squad : away.squad;
      const oppSquad = nearMissSide === "home" ? away.squad : home.squad;
      const attackers = nearMissSquad.filter(
        (p) => p.position === "ATA" || p.position === "MED",
      );
      const attacker =
        attackers.length > 0 ? weightedPickScorer(attackers) : nearMissSquad[0];
      if (attacker) {
        const isBigSave = Math.random() < 0.45;
        const grPlayer = oppSquad.find((p) => p.position === "GR");
        const phrase =
          isBigSave && grPlayer
            ? bigSavePhrase(grPlayer.name)
            : nearMissPhrase(attacker.name);
        fixture.events.push({
          minute,
          type: "near_miss",
          team: nearMissSide,
          emoji: "🥅",
          playerId: isBigSave && grPlayer ? grPlayer.id : attacker.id,
          playerName: isBigSave && grPlayer ? grPlayer.name : attacker.name,
          text: `[${minute}'] 🥅 ${phrase}`,
        });
      }
    }

    const homeAggAvg = average(
      home.squad.map((p) => getAggressivenessValue(p)),
    );
    const awayAggAvg = average(
      away.squad.map((p) => getAggressivenessValue(p)),
    );

    const emitCard = (isHomeCard: boolean) => {
      const squad = isHomeCard ? home.squad : away.squad;
      const side = isHomeCard ? "home" : "away";
      if (squad.length > 0) {
        const offender = squad[Math.floor(Math.random() * squad.length)];
        const offenderId = offender.id;

        const executeRedCard = () => {
          // Cartão vermelho — 2 jogos de suspensão
          db.run(
            "UPDATE players SET red_cards = red_cards + 1, career_reds = career_reds + 1, suspension_games = suspension_games + 2, suspension_until_matchweek = CASE WHEN suspension_until_matchweek > ? THEN suspension_until_matchweek ELSE ? END WHERE id = ?",
            [currentMatchweek + 2, currentMatchweek + 2, offender.id],
          );
          fixture.events.push({
            minute,
            type: "red",
            team: side,
            emoji: "🟥",
            playerId: offender.id,
            playerName: offender.name,
            text: `[${minute}'] 🟥 ${redPhrase(offender.name)}`,
          });
          const idx = squad.findIndex((p: any) => p.id === offender.id);
          if (idx > -1) squad.splice(idx, 1);
        };

        if (fixture._yellowCards[offenderId] >= 1) {
          // If the player already has a yellow card, there's only a 15% chance this foul results in a second yellow (red).
          // Otherwise, it's just a warning/foul with no card given.
          if (Math.random() < 0.15) {
            executeRedCard();
          }
        } else if (Math.random() < 0.005) {
          // Straight red card chance lowered from 4% to 0.5% (more realistic)
          executeRedCard();
        } else {
          // Cartão amarelo — sem expulsão
          fixture._yellowCards[offenderId] =
            (fixture._yellowCards[offenderId] || 0) + 1;
          fixture.events.push({
            minute,
            type: "yellow",
            team: side,
            emoji: "🟨",
            playerId: offender.id,
            playerName: offender.name,
            text: `[${minute}'] 🟨 ${yellowPhrase(offender.name)}`,
          });
        }
      }
    };

    const homeCardProb = 0.015 * (1 + (homeAggAvg - 3) * 0.1);
    const awayCardProb = 0.015 * (1 + (awayAggAvg - 3) * 0.1);
    if (Math.random() < homeCardProb) emitCard(true);
    if (Math.random() < awayCardProb) emitCard(false);

    const injuryChance = Math.random();
    if (injuryChance < 0.003) {
      const isHomeInjury = Math.random() > 0.5;
      const squad = isHomeInjury ? home.squad : away.squad;
      const side = isHomeInjury ? "home" : "away";
      const lineupIds = isHomeInjury ? homeLineupIds : awayLineupIds;
      const fullRoster = isHomeInjury ? homeFullRoster : awayFullRoster;
      if (squad.length > 0) {
        const injuryResult = await applyInjuryEvent({
          db,
          fixture,
          teamSide: side,
          squad,
          fullRoster,
          lineupIds,
          currentMatchweek,
          io,
          game,
        });
        if (injuryResult.replaced && side === "home") home.squad = squad;
        if (injuryResult.replaced && side === "away") away.squad = squad;
      }
    }

    // User substitutions
    if (game.pendingSubstitutions && game.pendingSubstitutions.size > 0) {
      const teamsToSub = [fixture.homeTeamId, fixture.awayTeamId].filter((id) =>
        game.pendingSubstitutions.has(id),
      );
      for (const teamId of teamsToSub) {
        game.pendingSubstitutions.delete(teamId);

        const isHome = teamId === fixture.homeTeamId;
        const squad = isHome ? home.squad : away.squad;
        const fullRoster = isHome ? homeFullRoster : awayFullRoster;
        const tactic = isHome ? homeTactic : awayTactic;
        const side = isHome ? "home" : "away";
        const lineupIds = isHome ? homeLineupIds : awayLineupIds;

        const onPitch = squad.filter((p: any) => lineupIds.has(p.id));

        const tacticPositions: Record<number, string> = tactic?.positions || {};
        const benchIds = new Set(
          Object.entries(tacticPositions)
            .filter(([, status]) => status === "Suplente")
            .map(([id]) => Number(id)),
        );
        const availableBench = fullRoster.filter(
          (p: any) => !lineupIds.has(p.id) && benchIds.has(p.id),
        );

        if (onPitch.length > 0 && availableBench.length > 0) {
          const result = await waitForMatchAction({
            game,
            io,
            type: "user_substitution",
            teamId,
            payload: {
              minute: fixture._minute,
              teamId,
              onPitch: onPitch.map((p: any) => ({
                id: p.id,
                name: p.name,
                position: p.position,
                skill: Math.round(getOverall(p)),
              })),
              benchPlayers: availableBench.map((p: any) => ({
                id: p.id,
                name: p.name,
                position: p.position,
                skill: Math.round(getOverall(p)),
              })),
            },
            timeoutMs: 60000,
            fallback: () => null,
          });

          if (
            result.choice &&
            result.choice.playerOut &&
            result.choice.playerIn
          ) {
            const playerOutId = result.choice.playerOut;
            const playerInId = result.choice.playerIn;

            const playerOut = squad.find((p: any) => p.id === playerOutId);
            const playerIn = fullRoster.find((p: any) => p.id === playerInId);

            if (playerOut && playerIn) {
              const idx = squad.findIndex((p: any) => p.id === playerOutId);
              if (idx > -1) squad.splice(idx, 1, playerIn);
              lineupIds.delete(playerOutId);
              lineupIds.add(playerInId);

              // Actualizar snapshot de lineup para que o ecrã de intervalo reflicta a substituição
<<<<<<< HEAD
              const lineupRef = isHome
                ? fixture.homeLineup
                : fixture.awayLineup;
=======
              const lineupRef = isHome ? fixture.homeLineup : fixture.awayLineup;
>>>>>>> d8a30d5 (more errors on substitutions in half time)
              if (lineupRef) {
                const li = lineupRef.findIndex(
                  (p: any) => p.id === playerOutId,
                );
                if (li > -1) {
                  lineupRef[li] = {
                    id: playerIn.id,
                    name: playerIn.name,
                    position: playerIn.position,
                    is_star: playerIn.is_star || 0,
<<<<<<< HEAD
                    skill: Math.round(getOverall(playerIn)),
=======
                    skill: playerIn.skill,
>>>>>>> d8a30d5 (more errors on substitutions in half time)
                  };
                }
              }

              // Keep tactic positions in sync so applyHalftimeSubs/applyETSubs
              // don't undo this substitution when the next phase starts.
              const coachState = Object.values(game.playersByName).find(
                (p: any) => (p as any).teamId === teamId,
              ) as any;
              if (coachState?.tactic?.positions) {
                delete coachState.tactic.positions[playerOutId];
                coachState.tactic.positions[playerInId] = "Titular";
              }

              fixture.events.push({
                minute: fixture._minute,
                type: "substitution",
                team: side,
                emoji: "🔁",
                playerId: playerInId,
                playerName: playerIn.name,
                text: `[${fixture._minute}'] 🔁 ${subPhrase(playerOut.name, playerIn.name)}`,
              });

              if (isHome) home.squad = squad;
              if (!isHome) away.squad = squad;
            }
          }
        }
      }
    }
  }

  delete fixture._minute;
}

async function applyPostMatchQualityEvolution(
  db: Db,
  fixtures: MatchFixture[],
  currentMatchweek: number,
) {
  return new Promise<void>((resolve) => {
    const teamResults = new Map();
    for (const match of fixtures || []) {
      const homeResult =
        match.finalHomeGoals > match.finalAwayGoals
          ? "W"
          : match.finalHomeGoals < match.finalAwayGoals
            ? "L"
            : "D";
      const awayResult =
        match.finalAwayGoals > match.finalHomeGoals
          ? "W"
          : match.finalAwayGoals < match.finalHomeGoals
            ? "L"
            : "D";
      teamResults.set(match.homeTeamId, homeResult);
      teamResults.set(match.awayTeamId, awayResult);
    }

    // ── Morale update per team ─────────────────────────────────────────────
    const moraleUpdates = [];
    for (const [teamId, result] of teamResults.entries()) {
      let delta;
      if (result === "W") delta = 20;
      else if (result === "L") delta = -15;
      else delta = 5;
      moraleUpdates.push({ teamId, delta });
    }

    if (moraleUpdates.length > 0) {
      db.all(
        "SELECT id, morale FROM teams WHERE id IN (" +
          moraleUpdates.map(() => "?").join(",") +
          ")",
        moraleUpdates.map((u) => u.teamId),
        (err, rows) => {
          if (err || !rows) return;
          rows.forEach((row) => {
            const upd = moraleUpdates.find((u) => u.teamId === row.id);
            if (!upd) return;
            const newMorale = Math.max(
              0,
              Math.min(100, (row.morale ?? 50) + upd.delta),
            );
            db.run("UPDATE teams SET morale = ? WHERE id = ?", [
              newMorale,
              row.id,
            ]);
          });
        },
      );
    }

    // ── Player attribute evolution ─────────────────────────────────────────
    db.all(
      "SELECT id, team_id, position, gk, defesa, passe, finalizacao, form, resistencia, injury_until_matchweek, suspension_until_matchweek FROM players WHERE team_id IS NOT NULL ORDER BY team_id, id",
      (err, players) => {
        if (err || !players || players.length === 0) {
          resolve();
          return;
        }

        const teamGroups = new Map();
        for (const player of players) {
          if (!teamGroups.has(player.team_id))
            teamGroups.set(player.team_id, []);
          teamGroups.get(player.team_id).push(player);
        }

        const updates = [];
        for (const player of players) {
          if ((player.injury_until_matchweek || 0) >= currentMatchweek)
            continue;
          if ((player.suspension_until_matchweek || 0) >= currentMatchweek)
            continue;

          const group = teamGroups.get(player.team_id) || [];
          const playerOverall = getOverall(player);
          const avgOverall =
            group.reduce((sum, p) => sum + getOverall(p), 0) /
            Math.max(1, group.length);
          const diff = avgOverall - playerOverall;
          const teamResult = teamResults.get(player.team_id) || "D";

          let deltaForm = 0;
          let deltaRes = 0;
          const deltas = { gk: 0, defesa: 0, passe: 0, finalizacao: 0 };
          const primaryAttrByPosition = {
            GR: "gk",
            DEF: "defesa",
            MED: "passe",
            ATA: "finalizacao",
          };
          const primaryAttr = primaryAttrByPosition[player.position] || "passe";

          // Convivência: jogadores abaixo da média do plantel evoluem ao
          // conviver com colegas mais talentosos (spec: "evoluem se
          // conviverem com jogadores mais talentosos")
          if (diff >= 1 && Math.random() < Math.min(0.66, 0.15 + diff / 27)) {
            deltas[primaryAttr] += 1;
          }

          // Vitória reforça evolução para jogadores abaixo da média
          if (
            teamResult === "W" &&
            diff >= 0 &&
            Math.random() < Math.min(0.3, 0.06 + diff / 73)
          ) {
            deltas[primaryAttr] += 1;
            deltaForm += 1;
          }

          // Maus resultados: jogadores perdem qualidade se houver derrotas
          // (spec: "perdem qualidade se houver muitos maus resultados seguidos")
          // Jogadores acima da média do plantel são mais afectados
          if (teamResult === "L") {
            const lossPressure = Math.min(
              0.12,
              0.02 + Math.max(0, -diff) / 250,
            );
            if (Math.random() < lossPressure) {
              deltas[primaryAttr] -= 1;
              deltaForm -= 2;
            }
          }

          // Empate contra equipa mais forte — pequena hipótese de evolução
          if (teamResult === "D" && diff >= 5 && Math.random() < 0.12) {
            deltas[primaryAttr] += 1;
            deltaForm += 1;
          }

          if (teamResult === "W" && Math.random() < 0.35) deltaRes += 1;
          if (teamResult === "L" && Math.random() < 0.25) deltaRes -= 1;

          if (
            deltas.gk !== 0 ||
            deltas.defesa !== 0 ||
            deltas.passe !== 0 ||
            deltas.finalizacao !== 0 ||
            deltaForm !== 0 ||
            deltaRes !== 0
          ) {
            updates.push({
              id: player.id,
              gk: clampSkill((player.gk || 1) + deltas.gk),
              defesa: clampSkill((player.defesa || 1) + deltas.defesa),
              passe: clampSkill((player.passe || 1) + deltas.passe),
              finalizacao: clampSkill(
                (player.finalizacao || 1) + deltas.finalizacao,
              ),
              form: clampSkill((player.form || 25) + deltaForm),
              resistencia: clampSkill((player.resistencia || 25) + deltaRes),
              overall: Math.round(playerOverall),
            });
          }
        }

        if (updates.length === 0) {
          db.run(
            "UPDATE players SET prev_skill = NULL WHERE team_id IS NOT NULL",
            () => resolve(),
          );
          return;
        }

        let remaining = updates.length;
        db.serialize(() => {
          // Limpar prev_skill de semanas anteriores; só os que mudam esta semana ficam marcados
          db.run(
            "UPDATE players SET prev_skill = NULL WHERE team_id IS NOT NULL",
          );
          updates.forEach((update) => {
            db.run(
              "UPDATE players SET prev_skill = ?, gk = ?, defesa = ?, passe = ?, finalizacao = ?, form = ?, resistencia = ? WHERE id = ?",
              [
                update.overall,
                update.gk,
                update.defesa,
                update.passe,
                update.finalizacao,
                update.form,
                update.resistencia,
                update.id,
              ],
              () => {
                remaining -= 1;
                if (remaining === 0) resolve();
              },
            );
          });
        });
      },
    );
  });
}

module.exports = {
  withJuniorGRs,
  simulateMatchSegment,
  getTeamSquad,
  generateFixturesForDivision,
  isPlayerAvailable,
  applyPostMatchQualityEvolution,
  simulateExtraTime,
  simulatePenaltyShootout,
};

// ─── EXTRA TIME ──────────────────────────────────────────────────────────────
// Simulates a single continuous extra-time period (91–120).
// No halftime pause at 105 — ET runs straight through.
async function simulateExtraTime(
  db: Db,
  fixture: MatchFixture,
  homeTactic: Tactic | null,
  awayTactic: Tactic | null,
  context: any,
) {
  // Use real-time speed ONLY if a human coach is participating in ANY of the ET fixtures.
  // When multiple ET fixtures run in parallel (Promise.all), NPC-only fixtures
  // must use the same delay as the human fixture — otherwise they race from
  // 91→120 in ~3s and their matchMinuteUpdate events advance liveMinute to 120
  // before the human fixture's minute-91 update arrives, causing the clock to
  // visibly jump forward and then snap back.
  // If no human is in ANY ET fixture, run fast (100ms) to avoid wasting time.
  const anyHumanInET =
    context.hasHumanInET ??
    (context.game &&
      Object.values(context.game.playersByName).some(
        (p: any) =>
          !!p.socketId &&
          (p.teamId === fixture.homeTeamId || p.teamId === fixture.awayTeamId),
      ));
  const msPerMinute = anyHumanInET ? 1000 : 100;

  const emitMinuteUpdate = (minute: number) => {
    if (!context.io || !context.game) return;
    context.io.to(context.game.roomCode).emit("matchMinuteUpdate", {
      minute,
      fixtures: [
        {
          homeTeamId: fixture.homeTeamId,
          awayTeamId: fixture.awayTeamId,
          homeGoals: fixture.finalHomeGoals,
          awayGoals: fixture.finalAwayGoals,
          minuteEvents: (fixture.events || []).filter(
            (e: any) => e.minute === minute,
          ),
        },
      ],
    });
  };

  // Single ET period: minutes 91–120, no halftime pause
  for (let minute = 91; minute <= 120; minute++) {
    await simulateMatchSegment(
      db,
      fixture,
      homeTactic,
      awayTactic,
      minute,
      minute,
      context,
    );
    emitMinuteUpdate(minute);
    if (minute < 120) await new Promise((r) => setTimeout(r, msPerMinute));
  }

  const etEvents = fixture.events.filter((e: any) => e.minute >= 91);
  return { et1Events: etEvents, et2Events: [] };
}

// ─── PENALTY SHOOTOUT ─────────────────────────────────────────────────────────
// Simulates a penalty shootout between two squads.
// Returns { homeGoals, awayGoals, kicks: [{team, playerName, scored}] }
function simulatePenaltyShootout(
  homeSquad: PlayerRow[],
  awaySquad: PlayerRow[],
) {
  const kicks = [];
  let homeGoals = 0;
  let awayGoals = 0;

  const pickShooter = (squad, usedIds) => {
    const available = squad.filter((p) => !usedIds.has(p.id));
    if (available.length === 0) {
      // Cycle through again if all have taken a penalty
      usedIds.clear();
      return squad[0] || null;
    }
    // Pick by overall quality
    available.sort((a, b) => getOverall(b) - getOverall(a));
    return available[0];
  };

  const homeUsed = new Set();
  const awayUsed = new Set();
  const homeGK = homeSquad.find((p) => p.position === "GR") || homeSquad[0];
  const awayGK = awaySquad.find((p) => p.position === "GR") || awaySquad[0];

  const calcScoredChance = (taker, gk) => {
    const takerSkill = taker
      ? getAttr(taker, "finalizacao", 10) * 0.7 +
        getAttr(taker, "passe", 10) * 0.3
      : 10;
    const gkSkill = gk ? getAttr(gk, "gk", 10) : 10;
    return Math.max(0.55, Math.min(0.88, 0.72 + (takerSkill - gkSkill) / 200));
  };

  // 5 regulation rounds
  for (let round = 0; round < 5; round++) {
    const homeTaker = pickShooter(homeSquad, homeUsed);
    const awayTaker = pickShooter(awaySquad, awayUsed);
    if (homeTaker) homeUsed.add(homeTaker.id);
    if (awayTaker) awayUsed.add(awayTaker.id);

    const homeScored = Math.random() < calcScoredChance(homeTaker, awayGK);
    const awayScored = Math.random() < calcScoredChance(awayTaker, homeGK);

    if (homeScored) homeGoals++;
    if (awayScored) awayGoals++;

    kicks.push({
      team: "home",
      playerName: homeTaker ? homeTaker.name : "?",
      scored: homeScored,
    });
    kicks.push({
      team: "away",
      playerName: awayTaker ? awayTaker.name : "?",
      scored: awayScored,
    });

    // Early finish: if one side can't catch up after n rounds
    const remaining = 4 - round;
    if (homeGoals > awayGoals + remaining || awayGoals > homeGoals + remaining)
      break;
  }

  // Sudden death if still tied
  let sdRound = 0;
  while (homeGoals === awayGoals && sdRound < 20) {
    sdRound++;
    const homeTaker = pickShooter(homeSquad, homeUsed);
    const awayTaker = pickShooter(awaySquad, awayUsed);
    if (homeTaker) homeUsed.add(homeTaker.id);
    if (awayTaker) awayUsed.add(awayTaker.id);

    const homeScored = Math.random() < calcScoredChance(homeTaker, awayGK);
    const awayScored = Math.random() < calcScoredChance(awayTaker, homeGK);

    if (homeScored) homeGoals++;
    if (awayScored) awayGoals++;

    kicks.push({
      team: "home",
      playerName: homeTaker ? homeTaker.name : "?",
      scored: homeScored,
      suddenDeath: true,
    });
    kicks.push({
      team: "away",
      playerName: awayTaker ? awayTaker.name : "?",
      scored: awayScored,
      suddenDeath: true,
    });

    if (homeScored !== awayScored) break; // One scored, other didn't → winner decided
  }

  // Tiebreak failsafe
  if (homeGoals === awayGoals) homeGoals++;

  return { homeGoals, awayGoals, kicks };
}
