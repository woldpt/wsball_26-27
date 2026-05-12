# CashBall 26/27

Jogo de gestão de futebol baseado em texto/dados, inspirado no **Elifoot 98**, a correr no browser com suporte a **multiplayer assíncrono**. 1 a 8 treinadores humanos submetem tácticas quando podem; a simulação corre em directo quando todos confirmam "Pronto". Sem horários fixos — o ritmo é ditado pelos jogadores.

## Stack

| Camada | Tecnologia |
|--------|-----------|
| **Frontend** | React 19 + Vite 8, JavaScript puro + JSDoc, Tailwind CSS 4 |
| **Backend** | Node.js + Express 5 + Socket.io 4, TypeScript |
| **Base de dados** | SQLite (ficheiro local, uma DB por sala) |
| **Infra** | Docker Compose, rede externa `cftunnel` |

## Arranque

```bash
# Full stack
docker compose up --build

# Dev (dois terminais)
cd server && npm run dev        # Express + Socket.io, tsx hot-reload
cd client && npm run dev        # Vite dev server
```

| Acção | Comando |
|-------|---------|
| Backend dev | `cd server && npm run dev` |
| Backend build | `cd server && npm run build && npm start` |
| Backend typecheck | `cd server && npm run typecheck` |
| Backend seed | `cd server && npm run seed` |
| Frontend dev | `cd client && npm run dev` |
| Frontend lint | `cd client && npm run lint` |
| Frontend JSDoc check | `cd client && npm run check:types` |
| Socket.io audit | `cd server && npm run audit:socketio` |
| Game state audit | `cd server && npm run audit:gamestate <ROOM_CODE>` |

## Estrutura

```
server/
  index.ts                  ← Express + Socket.io, CORS, rate limiting
  gameManager.ts            ← Gestão de salas (criar, carregar, guardar estado)
  types.ts                  ← GamePhase, ActiveGame, Tactic
  gameConstants.ts          ← DIVISION_NAMES, SEASON_CALENDAR, CUP_ROUND_NAMES
  game/
    engine.ts               ← Motor de simulação (CommonJS)
    commentary.ts           ← Frases de narração
    playerUtils.ts          ← Seleção de jogadores
    matchCalculations.ts    ← Probabilidades
  socket*Handlers.ts        ← 7 ficheiros por domínio
  *Helpers.ts               ← 13 ficheiros de lógica de negócio
  auth.js                   ← Autenticação (bcrypt + accounts.db)
  db/
    schema.sql              ← Esquema (11 tabelas)
    seed.js                 ← Dados iniciais
    fixtures/               ← JSONs de seed

client/src/
  App.jsx                   ← Raiz (auth, 60+ state vars, match animation)
  main.jsx                  ← Entrada React
  socket.js                 ← Config Socket.io-client
  hooks/useSocketListeners.js ← 40+ socket.on() centralizados
  views/                    ← 9 tabs (Standings, Bracket, Training, Cup, etc.)
  components/               ← Modais, widgets, UI reutilizável
  utils/                    ← Audio, formatters, player/team helpers
  constants/index.js        ← DIVISION_NAMES, cores, posições
```

## Autenticação

Sem sessões, tokens ou cookies para jogadores. Autenticação por **nome + password** em cada pedido:

- **Jogadores:** REST `POST /auth/login` e `POST /auth/register` → `auth.js` verifica/hasha com bcrypt num DB separado (`accounts.db`). Depois o cliente envia `joinGame` via socket.
- **Admin:** Token Bearer com TTL de 2h, armazenado em `Map` na memória.
- **Persistência local:** `cashballSession` no `localStorage` (nome + password + roomCode).
- **Session displacement:** reconnect de outro dispositivo → socket antigo recebe `sessionDisplaced`.

## Mecânicas

### Atributos dos Jogadores

| Atributo | Descrição |
|----------|-----------|
| `posição` | GR, DEF, MED, ATA |
| `skill` (qualidade) | 1 a 50 |
| `wage` (salário) | Custo semanal |
| `aggressiveness` | 1 (Cordeirinho) a 5 (Caceteiro) |
| `is_star` (craque) | Flag booleana — apenas MED e ATA |

### Craques

- ~10% dos MED e ATA são craques (`is_star = 1`)
- Visível no plantel com `*` após o nome
- **+20% de chance de marcar um golo decisivo** por craque em campo (cap 60%)
- **Conflito de egos:** 3+ craques no onze titular reduzem probabilidade de golo (-10% por craque acima de 2, cap -30%)
- GR e DEF nunca são craques

### Simulação de Jogos

- **Submissão assíncrona, simulação síncrona** — cada treinador submete quando pode; a partida só arranca quando todos confirmam "Pronto"
- **45 segundos** de 1.ª Parte → **intervalo** (substituições) → **45 segundos** de 2.ª Parte
- Taça com empate → **30 segundos** de tempo extra → **penalties** se necessário
- Resultado calculado **in loco** minuto a minuto, nunca pré-calculado
- Forças recalculadas após substituições e expulsões
- **Juniores temporários:** se um plantel não tiver jogadores suficientes para o banco de suplentes (1 GR + 4 campo), são gerados automaticamente juniores efémeros (IDs negativos, sem persistência na BD) para garantir que o banco fica sempre completo. Ver `playerUtils.ts` → `ensureFullBench()`.

### Formações

4-4-2, 4-3-3, 3-5-2, 5-3-2, 4-5-1, 3-4-3, 4-2-4, 5-4-1

### Árbitros

Inclinação gerada **aleatoriamente por jogo** (não é atributo fixo). Afeta cartões e penaltis (±15%). **Não se aplica** às probabilidades de conversão em penalties da Taça.

## Competições

### Campeonato

4 divisões jogáveis (8 equipas cada), todos-contra-todos (ida e volta), **14 jornadas** por época.

| Divisão | Nível |
|---------|-------|
| Primeira Liga | 1 |
| Segunda Liga | 2 |
| Liga 3 | 3 |
| Campeonato de Portugal | 4 |

Subidas: top 2 de cada divisão (exceto divisão 1). Descidas: últimos 2 (divisões 1-3) ou últimos 2 + treinador observador (divisão 4).

### Taça de Portugal

5 rondas knock-out (32 → 16 → 8 → 4 → 2). Final no Jamor (local neutro). Treinadores eliminados ficam só a observar.

### Calendário da Época

19 entradas lineares, intercalando campeonato e taça — **nunca correm em paralelo**:

```
1.  Jornada 1 (liga)
2.  Jornada 2 (liga)
3.  Jornada 3 (liga)
4.  16 avos de final (taça)
5.  Jornada 4 (liga)
6.  Jornada 5 (liga)
7.  Jornada 6 (liga)
8.  Oitavos de final (taça)
9.  Jornada 7 (liga)
10. Jornada 8 (liga)
11. Jornada 9 (liga)
12. Quartos de final (taça)
13. Jornada 10 (liga)
14. Jornada 11 (liga)
15. Meias-finais (taça)
16. Jornada 12 (liga)
17. Jornada 13 (liga)
18. Jornada 14 (liga)
19. Final (taça)
```

Cada entrada = uma fase de submissão. Máximo 19 fases por treinador (menos se eliminado na Taça).

## Máquina de Estados

```
lobby → match_first_half → match_halftime → match_second_half
                                                    ↓
                                        match_finalizing → (próxima entrada)
                                                    ↓
                                        match_et_gate → match_extra_time → match_finalizing
                                                                 (cup only)
season_end (fim da época: promoções, descidas, prémios)
```

## Gestão de Treinadores

- **Entrada:** sorteio aleatório de equipa do Campeonato de Portugal
- **Máximo 8 humanos por sala**, acesso por senha de 6 letras
- **Despedimento automático** por má posição, sequência de derrotas ou crise financeira
- **Descida aos Distritais:** treinador fica observador até receber convite
- **Convites de clubes mais fortes:** avaliados no final de cada jornada, expiram em 10 minutos
- **Convites de crise:** para treinadores sem clube ou clubes sem treinador humano

## Mercado de Transferências

- **Lista fixa:** preço definido pelo treinador, qualquer clube pode comprar
- **Leilão imediato:** 15 segundos de tempo real, pop-up para todos os 32 clubes, uma licitação por clube
- **Desempate:** timestamp do servidor (não ordem de clique)
- **Preço mínimo de venda:** 1€

## Finanças

| Receita | Descrição |
|---------|-----------|
| Bilheteira | Capacidade × ocupação × 15€ (ocupação 30%-100% baseada nos últimos 5 jogos) |
| Prémios liga | Campeão da 1.ª Liga: 1.000.000€ |
| Prémio taça | Vencedor: 500.000€ |
| Transferências | Venda de jogadores (mín. 1€) |

| Despesa | Descrição |
|---------|-----------|
| Salários | Soma semanal do plantel |
| Compra de jogadores | Custo de transferências |
| Estádio | 300.000€ por 5.000 lugares (máx. 120.000) |
| Juros | 2,5% por semana (máx. 5 empréstimos activos) |

## Plantel

- Mínimo: 11 jogadores (1 GR obrigatório)
- Máximo: 24 jogadores
- Substituições ao intervalo: até 3 no total, distribuídas entre intervalo principal e pré-extra-time

## Moral da Equipa

- Range: 0-100, inicial: 50
- Vitória: +10, Empate: 0, Derrota: -15
- Afeta só o ataque: bónus = (moral - 50) × 0.005 (±50%)
- Partilhada entre Campeonato e Taça, pertence ao clube

## Dados de Base

- 32 clubes (8 por divisão), geridos por `db/seed.js`
- Plantel fixo e permanente — jogadores não envelhecem nem se reformam
- `skill` flutua entre 1 e 50; `is_star` é permanente
- Fixture files em `server/db/fixtures/`

## Arquitetura

**Backend:** Factory pattern por domínio. `index.ts` instancia helpers (`createAuctionHelpers`, `createContractHelpers`, etc.) e passa dependências. Socket handlers registam listeners via `registerXxxSocketHandlers(socket, deps)`. Estado em memória (`activeGames` record) com persistência periódica a SQLite por sala.

**Frontend:** `App.jsx` geria todo o estado com 60+ `useState`. Socket listeners extraídos para `useSocketListeners.js`. Tabs como componentes stateless que recebem props.

**Comunicação:** Socket.io é o canal primário. REST só para auth e gestão de saves.

## Regras para Assistente

1. **Português de Portugal** em UI, mensagens e comentários de código
2. **Frontend é JS, nunca TS** — usar JSDoc para type hints
3. **`game/engine.ts`** usa CommonJS (`module.exports`); outros ficheiros `game/` usam ES modules
4. **Narração** só em `game/commentary.ts` — nunca duplicar frases
5. **Socket listeners** só em `hooks/useSocketListeners.js` — verificar que setters estão no objecto `handlers` passado de `App.jsx`
6. **SQLite** — sem tipos PostgreSQL-específicos (`SERIAL`, `JSONB`, etc.)
7. **Divisão 5 (Distritais)** existe só internamente como pool IA
8. **Craques** apenas MED e ATA — nunca atribuir a GR ou DEF
9. **Árbitro** — inclinação aleatória por jogo, não se aplica a penalties
10. **Empréstimos** — máx 5 activos, 2,5% juros/semana
11. **Plantel** — mín 11, máx 24
12. **Estádio** — máx 120.000 lugares
13. **Sem Distritais com simulação** — sorteio simples de promoção
14. **Em caso de dúvida sobre mecânica não descrita, perguntar antes de inventar**

## Skills de Auditoria

```bash
# Toquei Socket.io?
cd server && npm run audit:socketio

# Toquei React?
cd client && npm run check:types

# Após simulação de jornada?
cd server && npm run audit:gamestate TEST-ROOM
```

Documentação completa em `SKILLS.md`.
