# CashBall 26/27

## Conceito Central

Jogo de gestão de futebol baseado em texto/dados, fiel ao espírito minimalista e estatístico do **Elifoot 98**, mas correndo num browser moderno com suporte a **multiplayer orientado à disponibilidade dos treinadores**. O jogo não tem horários fixos: a jornada avança assim que **todos os treinadores activos submetem a sua táctica**. Num mesmo dia podem realizar-se zero jogos ou várias jornadas completas — depende inteiramente da rapidez com que os participantes respondem. **A submissão de tácticas é assíncrona, mas a simulação da partida é síncrona** — todos os treinadores humanos devem estar presentes e confirmar "Pronto" no início do jogo, ao intervalo e antes do tempo extra. Os treinadores acompanham o desenrolar dos eventos em simultâneo, à semelhança do Football Manager ou Hattrick.

---

## Género e Referências

- **Género**: Gestão desportiva, turn-based, estratégia leve

- **Tom**: Nostálgico mas moderno — interface limpa, dados densos, sem gráficos 3D

- **Referências principais**:
  - Elifoot 98 (mecânicas base, filosofia de jogo)
  - Football Manager (profundidade de elenco, simulação síncrona de partidas)
  - Hattrick (modelo de acompanhamento de partida em simultâneo entre treinadores)
  - Lichess (UX limpo)

---

## Plataforma e Stack

### Frontend (`/client`)

- **React 19 com Vite 8** — SPA em JavaScript puro
- **Tailwind CSS 4** via plugin Vite
- **Socket.io-client 4** — comunicação em tempo real com o servidor
- **JSDoc** — type hints sem compilação (intellisense no VS Code)

### Backend (`/server`)

- **Node.js com Express 5** — API REST em TypeScript
- **Socket.io 4** — notificações em tempo real (submissões, resultados de jornada)
- **SQLite 3** — base de dados local em ficheiro
- **bcryptjs** — hashing de passwords
- **dotenv** — configuração por variáveis de ambiente
- **express-rate-limit** — protecção contra abuso da API

### Infraestrutura

- **Docker Compose** — orquestração de containers (client + server)
- **Deploy**: Web — desktop e mobile browser

### Notas de Arquitectura

- **TypeScript no Backend** — Express em TypeScript para lógica crítica (cálculos de jornadas, transferências, finanças); Frontend em JavaScript puro com JSDoc para type hints
- A base de dados é **SQLite** (ficheiro local), não PostgreSQL — adequado para desenvolvimento e para a escala actual do jogo (32 treinadores)
- **Submissão assíncrona, simulação síncrona** — não é necessário estar online em simultâneo para submeter a táctica, mas a simulação da partida requer a presença de todos os treinadores humanos. A partida só arranca quando todos confirmam "Pronto"; ao intervalo e antes do tempo extra a simulação pausa e aguarda nova confirmação. Eventos transmitidos via Socket.io
- **JavaScript + JSDoc no Frontend** — sem compilação adicional, intellisense no VS Code, simples e rápido
- **Stack recomendado**: React 19 + Vite no frontend (JavaScript + JSDoc), Node.js + Express 5 no backend (TypeScript), SQLite como base de dados. Dependências principais: `socket.io-client` (frontend), `socket.io`, `bcryptjs`, `dotenv`, `express-rate-limit` (backend)
- **Divisão 5 (Distritais)** — existe internamente no backend como base da pirâmide de clubes (`gameConstants.ts`), mas é invisível e não jogável por humanos; serve apenas para abastecer o pool de equipas IA que sobem/descem entre divisões

---

## Ciclo de Jogo

### Estrutura de uma Época

```
Pré-época
└── Definição de formação e táctica inicial
└── Novo ano fiscal

Época Regular
└── 19 jogos
└── 14 jornadas de campeonato por divisão
└── 5 rondas de Taça intercaladas (incluindo final no Jamor)
└── Cada semana avança quando todos os treinadores activos submetem a táctica
└── A simulação é síncrona: só arranca quando todos os humanos confirmam "Pronto" (início, intervalo, tempo extra)
└── Todos os treinadores acompanham os eventos da partida em simultâneo (via Socket.io)
└── Rondas da Taça: treinador ainda em competição submete a táctica. Treinadores já eliminados ficam só a observar as partidas.

Pós-época
└── Subidas / descidas apuradas (campeonato)
└── Vencedor do Campeonato e da Taça de Portugal proclamado
└── Atribuição de prémios de ambas as competições
└── Convites de clubes mais fortes emitidos aos treinadores em destaque
```

### O que faz o Treinador antes de Submeter

Antes de submeter a táctica para a próxima jornada, o treinador pode:

1. **Definir formação e táctica** para o próximo jogo
2. **Analisar próximo adversário** (ver últimos resultados, plantel, etc.)
3. **Escolher jogadores titulares e suplentes**
4. **Dar ordens de equipa** (Escolha de táctica. Ex: 4-4-2, 4-3-3, 5-3-2, etc.)
5. **Negociar transferências** (analisar mercado de transferências, colocar jogadores em leilão)
6. **Gerir finanças** (consultar balanço, renegociar contratos, pedir empréstimo bancário)
7. **Submeter** → A jornada simula quando o último treinador activo submete

---

## Mecânicas Principais

### Atributos dos Jogadores

Cada jogador tem os seguintes atributos:

`posição` - Posição em campo (GR, DEF, MED, ATA);
└── GR - Guarda-Redes
└── DEF - Defesa
└── MED - Médio
└── ATA - Avançado

`gk` - Competência de guarda-redes (1 a 50, principal em GR);

`defesa` - Capacidade defensiva (1 a 50, principal em DEF);

`passe` - Qualidade de construção e meio-campo (1 a 50, principal em MED);

`finalizacao` - Capacidade ofensiva de remate/decisão (1 a 50, principal em ATA);

`forma` - Estado atual do jogador (0 a 100, afeta rendimento em jogo);

`resistencia` - Capacidade física de manter rendimento ao longo da partida (0 a 100);

`salario` - Custo semanal para o clube (€);

`agressividade` - Agressividade (calmo ou agressivo);
└── 1 - Cordeirinho
└── 2 - Cavalheiro
└── 3 - Fair-Play
└── 4 - Caneleiro
└── 5 - Caceteiro

`craque` - Flag booleana — ver secção **Craques**.

### Craques

Aproximadamente **10% dos jogadores das posições Médios e Avançados** são considerados craques. São jogadores que se destacam claramente dos demais e têm impacto desproporcional na simulação de jogos. Todas as equipas devem começar com pelo menos 1 craque.

- A flag `craque` é visível no plantel e no mercado — é informação pública, e é definida por um \* sempre após o nome;
- Craques têm o atributo principal da posição significativamente acima da média;
- São mais caros (salário e valor de mercado mais elevados);
- Guarda-redes e Defesas **não têm flag de craque** — a distinção aplica-se apenas a Médios e Avançados;
- **Craques não afectam directamente a probabilidade de vitória**, mas têm **+20% de chance de marcar um golo decisivo** durante a simulação de um jogo;
- Ter demasiados craques numa equipa pode criar efeitos indesejados (conflitos de egos) — ver secção **Conflito de Egos entre Craques**.

### Simulação de Jogos

- Simulação **estatística/probabilística**, calculada **in loco** durante a partida;
- O resultado **não é pré-calculado** — é simulado em directo: 45 segundos de 1.ª Parte, intervalo com mudança de táctica/substituições, depois mais 45 segundos de 2.ª Parte com dados actualizados. Cada bloco (1.ª Parte, 2.ª Parte, tempo extra) só arranca após todos os treinadores humanos confirmarem "Pronto";
- Resultado calculado com base em:
  - Atributos médios ponderados por posição;
  - Presença de craques em campo (+20% chance de golo decisivo por craque em campo);
  - Formação e táctica escolhidas
  - Moral da equipa
  - Factor casa/fora
  - Inclinação do árbitro (ver secção Árbitros)
  - Aleatoriedade controlada (seed por jornada)

- Após simulação, é gerado um **relatório de jogo** com eventos principais:
  - Golos (quem, minuto aproximado)
  - Cartões (amarelo/vermelho)
  - Estatísticas (posse de bola, remates, etc.)
  - Avaliação do árbitro (inclinação visível)

### Formações Suportadas

- 4-4-2 (Clássico)
- 4-3-3 (Ofensivo)
- 3-5-2 (Controlo de bola)
- 5-3-2 (Autocarro)
- 4-5-1 (Catenaccio)
- 3-4-3 (Ataque total)
- 4-2-4 (Avassalador)
- 5-4-1 (Ferrolho)

### Tácticas de Equipa

- **Estilo**: Defensivo / Equilibrado / Ofensivo

### Posições dos Jogadores

```
GR — Guarda-Redes
DEF — Defesas
MED — Médios
ATA — Avançados
```

### Árbitros

Cada partida tem um **árbitro nomeado pelo servidor**. A inclinação do árbitro é **gerada aleatoriamente para cada jogo** — não é uma característica fixa de cada árbitro, é simplesmente um elemento de surpresa por jogo.

- A inclinação é **visível antes da partida** através de uma pequena balança que mostra a tendência para a Equipa A ou Equipa B;
- A inclinação afecta a probabilidade de **cartões (vermelho/amarelo)** e **penaltis durante o jogo**, com variação até ±15% em relação à probabilidade base;
- **Nas grandes penalidades da Taça**, a inclinação do árbitro **NÃO se aplica** às probabilidades de conversão em golo — cada penalti depende exclusivamente da qualidade do executante vs. guarda-redes;
- **Não afecta directamente o resultado do jogo** — é um factor leve, apenas por diversão, que acrescenta imprevisibilidade e conversa entre treinadores;

---

## Gestão de Treinadores

### Entrada no Jogo

Quando um treinador humano entra numa sala nova criada por si, ou através da senha de convite de sala criada por outro treinador humano, é-lhe atribuída uma equipa do **Campeonato de Portugal** escolhida aleatoriamente de entre as disponíveis (sem treinador humano). O treinador não escolhe o clube — é sorteado. Pode entrar em qualquer jornada ou época em que o jogo esteja.

### Despedimento

Um treinador que esteja a fazer uma época claramente abaixo das expectativas pode ser **despedido** pelo clube. O despedimento é avaliado automaticamente pelo servidor com base em:

- Posição na tabela vs. expectativa para o clube;
- Sequência de derrotas consecutivas;
- Estado financeiro do clube (saldo negativo prolongado);

Após ser despedido, o treinador fica **sem clube** durante algumas jornadas, em modo de espera. Durante esse período:

- O clube passa a ser **gerido por IA** até o treinador aceitar um novo convite;
- O treinador pode observar os jogos e o mercado, mas não gere nenhum clube;
- Está elegível para receber **convites de clubes em situação de desespero** (equipas em risco de descida, ou com treinador que acabou de sair);
- Aceitar um convite coloca-o imediatamente à frente desse clube - a IA deixa de o gerir;

### Descida aos Distritais

Quando um clube humano é despromovido do **Campeonato de Portugal** (últimos 2 da divisão 4), o treinador fica **sem clube activo** e entra em modo de **observador apenas**:

- Fica à espera de receber um convite de um clube sem treinador humano que o convide para treinar;
- Durante este período, pode observar todos os jogos e o mercado, mas não pode fazer nenhuma acção de gestão;
- Quando um clube sem humano o convida, o treinador regressa imediatamente com esse novo clube;
- Não há limite de descidas — um treinador pode descer múltiplas vezes;

**Quando um clube de IA desce ao Distrital:** Um treinador IA não tem modo de "observador" — o clube simplesmente sai da competição activa. O clube reaparece no **sorteio de promoção** para o Campeonato de Portugal normalmente após **uma época inteira de interregno** (a mesma regra que se aplica a todos os clubes relegados).

### Convites para Clubes Mais Fortes

Um treinador que esteja a fazer um trabalho excelente — posição acima do esperado, sequência de vitórias, moral da equipa alta — pode receber **convites de clubes de divisões superiores**. Os convites são avaliados **no final de cada jornada**.

- O convite aparece na interface do treinador em qualquer altura da época;
- O treinador pode aceitar (sobe de divisão com novo clube) ou recusar (mantém o clube actual);
- Recusar um convite não tem penalização;
- Aceitar um convite deixa o clube anterior **sem treinador**, que entra no sistema de convites de desespero.

---

## Multiplayer e Filosofia de Jogo

### Princípio Central: Submissão Assíncrona + Simulação Síncrona

O CashBall 26/27 **não tem hora marcada para os jogos**. Não há calendário real, não há notificações de "o teu jogo começa às 20h". O ritmo do jogo é ditado colectivamente pelos participantes.

**Fase 1 — Submissão (assíncrona):** Uma jornada está **pendente** até que todos os treinadores activos submetam a sua táctica para o próximo jogo. Cada treinador submete quando pode — não é necessário estar online em simultâneo.

**Fase 2 — Simulação (síncrona):** Assim que o último treinador submete, a jornada fica pronta para simular, mas os jogos **só arrancam quando todos os treinadores humanos confirmam "Pronto"**. A simulação da partida requer a presença de todos — os treinadores acompanham o desenrolar dos eventos em simultâneo (evento por evento, via Socket.io), à semelhança do Football Manager ou Hattrick.

**Checkpoints de confirmação ("Pronto"):**

1. **Início da partida** — a simulação da 1.ª Parte só começa quando todos os humanos confirmam
2. **Intervalo** — a simulação pausa; cada treinador pode fazer substituições/ajustes e confirma "Pronto" para a 2.ª Parte
3. **Antes do tempo extra** (apenas Taça, se empate) — nova pausa e confirmação antes dos 30 segundos extra

Isto significa que:

- Num dia em que todos os treinadores estejam online ao mesmo tempo, podem realizar-se **várias jornadas consecutivas** no espaço de horas;
- Num dia em que ninguém aceda ao jogo, **nenhum jogo acontece**;
- Se um treinador não confirmar "Pronto", a simulação fica em espera — quem não está presente bloqueia o avanço;
- Quem não assistiu pode consultar os resultados e relatórios de jogo quando voltar;
- Não existe penalização automática por demora — o ritmo é ditado colectivamente pelos participantes.

### O que é uma "Submissão de Táctica"

Submeter uma táctica significa o treinador confirmar, para o próximo jogo pendente:

1. **Formação** (ex: 4-3-3)
2. **Onze titular** e **suplentes** (incluindo 5 suplentes, dos quais pode trocar até 3 no(s) intervalo(s))
3. **Instruções de equipa** (estilo: defensivo/equilibrado/ofensivo)

Após submeter, o treinador pode **alterar a táctica** enquanto a jornada ainda não tiver sido simulada (ou seja, enquanto houver pelo menos outro treinador que ainda não submeteu). Assim que o último treinador submete, as tácticas ficam bloqueadas e a simulação corre.

### Substituições durante a Simulação

As substituições são escolhidas pelos treinadores **ao intervalo**:

- A simulação decorre em **45 segundos por parte** (1ª Parte e 2ª Parte);
- Ao intervalo entre as partes, aparece um **pop-up de substituições** com a lista de jogadores em campo e suplentes disponíveis;
- O treinador pode escolher **até 3 substituições no total** (distribuídas entre os intervalos disponíveis — intervalo principal entre 1ª e 2ª Parte, e potencial intervalo de tempo extra);
- Em partidas da Taça com tempo extra (30 segundos adicionais), há um novo intervalo após a 2ª Parte, antes do tempo extra;
- O treinador pode usar as suas 3 substituições em qualquer intervalo ou não as usar todas;

**Timings de Simulação:**

- **1ª Parte**: 45 segundos de simulação cronometrada
- **Intervalo**: Pop-up de substituições (o treinador tem tempo suficiente para escolher)
- **2ª Parte**: 45 segundos de simulação cronometrada
- **Se for Taça e empate ao fim do tempo regulamentar:**
  - **Tempo Extra**: 30 segundos adicionais de simulação
  - **Intervalo antes do Extra**: Pop-up de substituições (se ainda houver disponíveis)
  - **Se continuar empatado**: Simulação de grandes penalidades (uma a uma)

### Estados de uma Jornada

```
ABERTA
└── Jornada disponível para submissão de tácticas
└── Cada treinador vê quem já submeteu e quem falta (sem ver a táctica adversária)
└── Treinadores de IA submetem automaticamente no momento em que a jornada abre

COMPLETA (todos submeteram)
└── Todos os treinadores humanos devem confirmar "Pronto" — simulação só arranca com OK de todos
└── 1ª Parte: simulação estatística com descrição de eventos (golos, cartões, etc.) — 45 segundos
└── Intervalo: simulação pausa; treinadores fazem substituições e confirmam "Pronto" para a 2ª Parte
└── 2ª Parte: continuação da simulação — 45 segundos
└── Se for uma partida da Taça e estiver empatada ao fim do tempo regulamentar:
    └── Pausa: treinadores confirmam "Pronto" para o tempo extra
    └── Tempo extra: 30 segundos adicionais de simulação
    └── Se continuar empatado, avança-se para simulação de grandes penalidades (uma a uma)
└── Próxima jornada transita para ABERTA automaticamente após simulação
```

### Visibilidade de Submissões

- Cada treinador vê **quem já submeteu** a táctica (lista de clubes: ✅ / ⏳)
- **Não é visível o conteúdo** da táctica antes da simulação — só após os resultados
- Isto cria um elemento estratégico: saber que o adversário já submeteu pode influenciar a decisão de alterar a própria táctica antes de confirmar

### Semanas com Jogo de Taça

Quando uma semana inclui um jogo de campeonato seguido de um jogo de Taça, o treinador submete uma táctica de cada vez para cada jogo, em **ciclos de submissão independentes**:

1. **Ciclo 1:** Submissão para o jogo de campeonato
   - Todos os treinadores submetem tácticas para o campeonato
   - Jogo de campeonato é simulado e transmitido em directo
2. **Ciclo 2:** Submissão para o jogo de Taça
   - Todos os treinadores submetem tácticas para o jogo da Taça
   - Jogo da Taça é simulado e transmitido em directo
   - Próxima jornada transita para ABERTA

- Pode definir formações, titulares e instruções diferentes para cada jogo;
- As tácticas são submetidas em separado — nada obriga a que o jogo da Taça seja simulado no mesmo dia que o campeonato;

### Modos de Jogo

**Principal** - A liga principal do jogo — até 8 clubes humanos nas 4 divisões

### Criação e Entrada numa Sala de Jogo

O primeiro jogador humano a criar uma sala de jogo torna-se o seu **fundador** e recebe uma **senha única** de 6 letras gerada pelo servidor. Esta senha é o único mecanismo de acesso — o fundador partilha-a com quem quiser convidar.

- A senha é uma string curta e legível (ex: `ABCDEF`);
- Qualquer pessoa com a senha pode juntar-se à sala **a qualquer momento** — em qualquer jornada ou época em que o jogo esteja;
- Ao entrar, o novo treinador recebe uma equipa do Campeonato de Portugal sorteada aleatoriamente de entre as disponíveis (sem treinador humano);
- **Máximo de 8 jogadores humanos** por sala — tentativas de entrada após esse limite são recusadas;
- Os restantes clubes sem treinador humano são geridos por IA até alguém se juntar;

### Mercado de Transferências

**O mercado está aberto ao longo de toda a época**, sem restrições de tempo a não ser que exista um jogo em simulação (nesse período é bloqueado).

Há duas formas de vender jogadores:

#### A) Lista de Transferências

- O treinador coloca um jogador à venda com um preço fixo pedido;
- Qualquer clube pode comprá-lo pelo preço pedido, a qualquer momento;
- O jogador fica listado publicamente no mercado até ser comprado ou retirado da lista.

#### B) Leilão Imediato

- O treinador coloca um jogador em leilão imediato com um timeout de **15 segundos de tempo real**;
- **Um pop-up de leilão aparece para todos os 32 treinadores humanos** das 4 divisões principais;
- Cada clube pode dar **uma única licitação** durante os 15 segundos;
- Os clubes de IA licitam respeitando o orçamento disponível de cada um;
- Após os 15 segundos, o leilão encerra:
  - O nome do vencedor (clube que licitou mais alto) aparece num pop-up confirmação;
  - O jogador é transferido automaticamente para o vencedor;
  - O saldo do vencedor é actualizado imediatamente.

### Regras do Plantel

- Mínimo obrigatório: **11 jogadores** (suficiente para formar um onze);
- Mínimo de 1 guarda-redes por plantel - se este se lesionar, joga um jogador de campo na baliza;
- Máximo permitido: **24 jogadores**;
- Não é possível vender ou leiloar um jogador se isso fizer descer o plantel abaixo de 11;

---

## Finanças

| Receita         | Descrição                               |
| --------------- | --------------------------------------- |
| Bilheteira      | Ver fórmula de bilheteira abaixo        |
| Prémios de liga | Vencedor da Primeira Liga — 1.000.000€  |
| Prémio da taça  | Vencedor da Taça de Portugal — 500.000€ |
| Transferências  | Venda de jogadores (preço mínimo: 1€)   |

| Despesa             | Descrição                                 |
| ------------------- | ----------------------------------------- |
| Salários            | Soma dos salários semanais do plantel     |
| Compra de jogadores | Custo de transferências                   |
| Estádio             | Custo de aumento da capacidade do estádio |
| Juros de empréstimo | 2,5% do valor em dívida por semana        |

### Estádio

Todos os clubes têm um estádio com pelo menos 10.000 lugares.
Podem construir lotes de 5.000 lugares com o custo de 300.000€ cada.
**Limite máximo de capacidade: 120.000 lugares** — não é possível expandir para além deste valor.
A receita da bilheteira de cada jogo varia consoante a fase boa ou má da equipa.

### Fórmula de Bilheteira

A receita de bilheteira por jogo em casa depende da capacidade do estádio e dos resultados recentes:

```typescript
function calculateTicketRevenue(team: Team, stadiumCapacity: number): number {
  // Calcular índice de forma (0.0 a 1.0) com base nos últimos 5 jogos
  const recentResults = getLastNResults(team, 5); // array de "W", "D", "L"
  const formPoints =
    recentResults.reduce((sum, r) => {
      if (r === "W") return sum + 1.0;
      if (r === "D") return sum + 0.4;
      return sum; // Derrota = 0
    }, 0) / 5; // formPoints entre 0.0 (5 derrotas) e 1.0 (5 vitórias)

  // Ocupação do estádio: mínimo 30%, máximo 100%
  // Boa fase (formPoints ~1.0) = lotação esgotada
  // Má fase (formPoints ~0.0) = estádio quase vazio
  const occupancyRate = 0.3 + formPoints * 0.7; // 30% a 100%

  const attendance = Math.floor(stadiumCapacity * occupancyRate);

  // Preço médio do bilhete: 15€
  const ticketPrice = 15;

  return attendance * ticketPrice;
}

// Exemplos:
// 5 vitórias seguidas, estádio 20.000: 20.000 * 1.0 * 15€ = 300.000€
// 5 derrotas seguidas, estádio 20.000: 20.000 * 0.30 * 15€ = 90.000€
// 3V 1E 1D, estádio 50.000: 50.000 * 0.856 * 15€ = 642.000€
```

### Preço Mínimo de Venda de Jogadores

Não existe preço mínimo de venda obrigatório — um jogador pode ser vendido por **1€**. O treinador é livre de definir qualquer preço, incluindo valores simbólicos.

### Empréstimos Bancários

Os clubes podem solicitar **empréstimos bancários** para cobrir despesas ou financiar contratações.

- **Limite máximo de 5 empréstimos activos em simultâneo** — o clube não pode solicitar um novo empréstimo se já tiver 5 em curso;
- O empréstimo é creditado imediatamente no saldo do clube;
- São cobrados **2.5% de juros por semana** sobre o valor em dívida;
- O clube pode amortizar o empréstimo parcial ou totalmente a qualquer momento;
- Clube com saldo negativo prolongado entra em **modo de crise** — o treinador tem elevada probabilidade de ser despedido.

---

## Competições

Cada época, todos os clubes participam **simultaneamente em duas competições distintas**: o **Campeonato** e a **Taça de Portugal**. São competições independentes, com formatos e objectivos diferentes, mas que correm em paralelo ao longo da mesma época. Um clube pode vencer as duas, uma, ou nenhuma.

O jogo tem **32 clubes jogáveis** (controlados por jogadores humanos), distribuídos igualmente por 4 divisões de 8 equipas cada. Em vez de uma quinta divisão com simulação, os Distritais, o sistema usa simplesmente um **sorteio de promoção** no final da época.

---

### Competição 1 — Campeonato (Liga por Pontos)

O Campeonato é a competição principal, organizado em **quatro divisões jogáveis** com um total de **32 clubes humanos**. Todas as divisões têm **8 equipas** e jogam em regime de todos-contra-todos com jogos de ida e volta, totalizando **14 jornadas** por época.

#### Estrutura das Divisões

| Divisão                    | Nível | Jogável | Clubes | Jornadas |
| -------------------------- | ----- | ------- | ------ | -------- |
| **Primeira Liga**          | 1     | ✅ Sim  | 8      | 14       |
| **Segunda Liga**           | 2     | ✅ Sim  | 8      | 14       |
| **Liga 3**                 | 3     | ✅ Sim  | 8      | 14       |
| **Campeonato de Portugal** | 4     | ✅ Sim  | 8      | 14       |

#### Formato

- Cada par de clubes joga **dois jogos** por época (casa e fora);
- **Vitória**: 3 pontos · **Empate**: 1 ponto · **Derrota**: 0 pontos;
- Em caso de igualdade de pontos, os critérios de desempate são (por ordem):
  1.  Diferença de golos
  2.  Golos marcados
  3.  Confronto directo

#### Calendarização

- As 14 jornadas do campeonato são distribuídas ao longo da época
- Em semanas sem jogo de Taça, o clube joga **exclusivamente** para o campeonato
- Em semanas com jogo de Taça, o turno inclui **dois jogos a gerir** (ver Taça abaixo)

#### Subidas e Descidas

```
Primeira Liga (8 clubes — nível 1)
└── Últimos 2 descem para a Segunda Liga

Segunda Liga (8 clubes — nível 2)
└── Top 2 sobem para a Primeira Liga
└── Últimos 2 descem para a Liga 3

Liga 3 (8 clubes — nível 3)
└── Top 2 sobem para a Segunda Liga
└── Últimos 2 descem para o Campeonato de Portugal

Campeonato de Portugal (8 clubes — nível 4)
└── Top 2 sobem para a Liga 3
└── Últimos 2: treinador perde clube e fica como observador
```

- Novos jogadores entram sempre no **Campeonato de Portugal**. Equipa a treinar é sorteada aleatoriamente;
- Subidas e descidas acontecem no **final de cada época**, após o fim do campeonato e da Taça de Portugal.
- No final da época, 2 clubes são **sorteados aleatoriamente** de entre os clubes elegíveis (excluindo os que desceram na época anterior e que ainda estão em período de espera de 1 época) para serem promovidos e regressarem à competição activa na época seguinte, substituindo os 2 que desceram do Campeonato de Portugal;
- **Clubes que desceram têm de esperar 1 época completa** antes de entrarem novamente no sorteio de promoção para o Campeonato de Portugal;

#### Prémios do Campeonato

| Classificação              | Prémio                                                      |
| -------------------------- | ----------------------------------------------------------- |
| 1.º lugar                  | Campeão da divisão (Registo no Palmarés) + subida garantida |
| 2.º lugar                  | Subida garantida                                            |
| Últimos 2 (níveis 1–3)     | Descida de divisão                                          |
| Últimos 2 (Camp. Portugal) | Descida — jogador perde clube e aguarda regresso            |

---

### Competição 2 — Taça de Portugal (Eliminatórias Knock-out)

A Taça de Portugal é uma competição paralela ao campeonato, de carácter **eliminatório**: perder significa ficar imediatamente fora. Participam **apenas as 32 equipas dos quatro campeonatos principais** (Primeira Liga, Segunda Liga, Liga 3 e Campeonato de Portugal). É a única competição transversal a todas as divisões jogáveis — um clube do Campeonato de Portugal pode eliminar o campeão da Primeira Liga.

#### Calendário da Taça

A Taça tem **5 rondas** distribuídas ao longo da época (Rondas 1–5), intercaladas com jornadas de campeonato. O calendário de datas exactas é gerado no seed e publicado no início da época.

#### Formato Geral

- **32 equipas** participantes — número que produz um quadro perfeitamente limpo por potências de 2;
- Cada eliminatória é disputada a **jogo único**;
- Em caso de empate no tempo regulamentar, o jogo avança para 30 minutos extra;
- Em caso de empate no tempo extra, o resultado é decidido por **grandes penalidades** (simuladas probabilisticamente, uma a uma);
- O vencedor avança; o perdedor está imediatamente eliminado;
- **Não há cabeças-de-série** — o sorteio é completamente aberto em cada ronda;

#### Estrutura das Rondas

```
Ronda 1 (16 avos) — 32 equipas → 16 jogos → 16 apuradas
Ronda 2 (8 avos) — 16 equipas → 8 jogos → 8 apuradas
Quartos-de-final — 8 equipas → 4 jogos → 4 apuradas
Meias-finais — 4 equipas → 2 jogos → 2 apuradas
Final (Jamor) — 2 equipas → 1 jogo → 1 vencedor
```

#### Sorteio

- O sorteio é realizado **antes de cada ronda**, não no início da época;
- Todas as equipas ainda em prova entram num sorteio aberto, sem potes nem restrições geográficas;
- O sorteio é executado pelo servidor de forma transparente, com seed auditável e registado;
- Os treinadores são notificados do adversário assim que o sorteio termina;

#### Submissão de Tácticas na Taça

Os jogos de Taça seguem exactamente o mesmo modelo de submissão do campeonato: **a eliminatória só é simulada quando ambos os treinadores submetem a táctica**. Se o jogo de Taça coincide com uma jornada de campeonato, o treinador submete primeiro a táctica do campeonato; após a simulação do jogo de campeonato, **apenas os treinadores cuja equipa ainda está em competição** (não foram eliminados) escolhem a táctica para o jogo da Taça (em ciclo de submissão independente). Os treinadores cujas equipas foram eliminadas apenas observam.

#### Local da Final — Estádio do Jamor

- A final é sempre disputada em **local neutro: o Estádio do Jamor**;
- Não há equipa da casa nem equipa de fora — factor casa/fora é **0** para ambas;
- O Jamor é um atributo fixo e imutável da final da Taça, independentemente de quem chega.

#### Grandes Penalidades

- Sequência de 5 penaltis por equipa, simulados individualmente;
- Probabilidade de conversão baseada nos atributos de `qualidade` do executante e `qualidade` do guarda-redes adversário;
- **A inclinação do árbitro NÃO se aplica** às probabilidades de conversão nas grandes penalidades — cada penalti depende exclusivamente da qualidade do executante vs. guarda-redes;
- Em caso de igualdade após 5 penaltis, é morte súbita (penalti a penalti até haver vencedor).

#### Prémios da Taça de Portugal

| Resultado | Prémio                        |
| --------- | ----------------------------- |
| Vencedor  | Troféu + 500.000€ + prestígio |

> **Nota:** Finalista, meias-finalistas, quartos-de-final e eliminados antes não recebem prémios financeiros nem de prestígio — participam apenas pela competição e pela honra de vencer.

> A Taça não afecta subidas nem descidas — é uma competição de prestígio e financeira, completamente independente do campeonato.

---

### Evolução dos Jogadores

- O elenco de jogadores é **fixo e permanente** — não há jogadores novos criados pelo jogo, nem jogadores que se reformem ou envelheçam;
- Os mesmos jogadores existem desde o início e mantêm-se indefinidamente no universo do jogo;
- A `qualidade` de um jogador pode flutuar ao longo do tempo, com os limites **mínimo 1 e máximo 50**:
  - Qualidade aumenta **+1** se o jogador jogou em **5+ jornadas consecutivas** na mesma equipa, ao lado de jogadores **da mesma posição** com qualidade acima da sua (jogadores mais fortes na mesma posição tendem a fazer melhorar os mais fracos);
  - Jogadores perdem qualidade se houver **3 empates ou derrotas seguidos**;
- A flag `craque` é **permanente** — não muda independentemente da evolução da `qualidade`;
- Moral da equipa flutua com resultados em **ambas as competições**.

### Conflito de Egos entre Craques

Quando uma equipa tem **3 ou mais craques no onze titular**, surgem conflitos de egos que prejudicam o desempenho ofensivo. A penalização aplica-se à probabilidade de golo:

```typescript
function calculateEgoConflictPenalty(craquesInStartingXI: number): number {
  // Sem penalização para 0, 1 ou 2 craques
  if (craquesInStartingXI <= 2) return 1.0;

  // Penalização progressiva a partir de 3 craques
  // 3 craques: -10% na prob de golo
  // 4 craques: -20% na prob de golo
  // 5+ craques: -30% (cap)
  const penalty = Math.min(0.3, (craquesInStartingXI - 2) * 0.1);
  return 1.0 - penalty;
}

// Aplicar na fórmula de probabilidade de golo:
// probGoal *= calculateEgoConflictPenalty(craquesInField);
```

### Auto-Golos

Defesas podem marcar auto-golos durante a simulação. A probabilidade é baixa e depende da pressão ofensiva adversária:

```typescript
function checkOwnGoal(
  defendingTeam: Team,
  attackingOffensiveForce: number,
  defendingDefensiveForce: number,
  rng: SeededRandom,
): MatchEvent | null {
  // Probabilidade base muito baixa: 0.05% por minuto (~2% por jogo)
  const baseProbOwnGoal = 0.0005;

  // Quanto maior a pressão ofensiva adversária vs defesa, maior a probabilidade
  const pressureRatio =
    attackingOffensiveForce /
    (defendingDefensiveForce + attackingOffensiveForce);
  const adjustedProb = baseProbOwnGoal * (1 + pressureRatio);

  if (rng.next() < adjustedProb) {
    // Seleccionar o defesa que marca o auto-golo
    const defenders = defendingTeam.players.filter((p) => p.position === "DEF");
    const ownGoalScorer = defenders[Math.floor(rng.next() * defenders.length)];

    return {
      minute: calculateCurrentMinute(),
      part: calculateCurrentPart(),
      type: "OWN_GOAL",
      team: "HOME", // equipa que SOFRE o golo (invertido na contagem)
      player: ownGoalScorer,
      isOwnGoal: true,
    };
  }

  return null;
}
```

### Cartão Vermelho Directo e Recálculo de Forças

Se um jogador recebe **cartão vermelho directo** (ou duplo amarelo) durante a 1.ª Parte, a equipa joga com **10 jogadores** (ou menos) durante o resto do jogo. Isto tem impacto directo:

- As forças ofensiva e defensiva são **recalculadas imediatamente** após a expulsão;
- Os jogadores expulsos são removidos do cálculo de qualidade média por posição;
- A equipa sofre uma **penalização adicional de -10% nas forças** por cada jogador a menos (simulando inferioridade numérica);
- O treinador **pode substituir posicionalmente** ao intervalo para compensar a expulsão (por exemplo, meter um defesa se foi expulso um defesa);

```typescript
function recalculateTeamForces(
  team: Team,
  submission: Submission,
  expelledPlayerIds: string[],
  moral: number,
): { offensiveForce: number; defensiveForce: number } {
  // Remover jogadores expulsos do onze
  const activePlayerIds = submission.startingXI.filter(
    (id) => !expelledPlayerIds.includes(id),
  );

  // Penalização por inferioridade numérica: -10% por jogador a menos
  const numericalPenalty = Math.pow(0.9, 11 - activePlayerIds.length);

  const offensiveForce =
    calculateOffensiveForce(
      team,
      {
        ...submission,
        startingXI: activePlayerIds,
      },
      moral,
    ) * numericalPenalty;

  const defensiveForce =
    calculateDefensiveForce(team, {
      ...submission,
      startingXI: activePlayerIds,
    }) * numericalPenalty;

  return { offensiveForce, defensiveForce };
}
```

---

## Interface e UX

### Princípios de Design

- **Dados em primeiro lugar** — tabelas, números, listas densas;
- **Sem gráficos animados pesados** — máximo: sparklines e barras simples;
- **Modo escuro por defeito** — paleta inspirada em terminais e estatísticas desportivas;
- **Responsivo** — funciona em mobile (acções de turno simples) e desktop (gestão completa).

### Ecrãs Principais

| Ecrã                  | Descrição                                                   |
| --------------------- | ----------------------------------------------------------- |
| **Dashboard**         | Resumo: próxima jornada, saldo, notificações, convites      |
| **Plantel**           | Lista de jogadores com atributos, ordenável e filtrável     |
| **Formação**          | Editor táctico drag-and-drop (campo de futebol esquemático) |
| **Mercado**           | Pesquisa de listas de transferência e leilões               |
| **Campeonato**        | Classificação da divisão, calendário, resultados            |
| **Taça**              | Quadro de eliminatórias, próximo adversário, resultados     |
| **Relatório de Jogo** | Eventos do jogo simulado, árbitro, estatísticas             |
| **Finanças**          | Balanço, receitas, despesas, empréstimos activos            |
| **Configurações**     | Notificações, preferências                                  |

---

## Dados de Base (Seed Data)

- O jogo arranca com **32 clubes** (8 por divisão, nas 4 divisões jogáveis);
- O script `db/seed.js` popula a base de dados inicial;
- O elenco de jogadores é gerado **uma única vez** no seed e nunca é alterado pelo sistema — não há criação de novos jogadores nem remoção de jogadores existentes:
  - Plantel inicial de cada clube gerado a partir de ficheiros JSON (`/server/db/fixtures/players.json`, `/server/db/fixtures/all_teams.json`, `/server/db/fixtures/managers.json`, `/server/db/fixtures/referees.json`, `/server/db/fixtures/stadiums.json`) com base em:
    - Divisão de entrada (clubes de divisões superiores têm plantel mais forte)
    - Variância aleatória (para diferenciação entre clubes da mesma divisão)
    - ~10% dos Médios e Avançados gerados com flag `craque = true`
    - Nomes de jogadores lidos de ficheiro JSON (`/server/db/fixtures/players.json`)

- A inclinação do árbitro é gerada aleatoriamente no momento de cada jogo — não há pool de árbitros no seed;
- Os ficheiros de fixtures estão em `/server/db/fixtures/` e serão utilizados durante a inicialização do projecto.

---

## Estados do Jogo

```
PRE_EPOCA — Mercado e preparação activos
JORNADA_ABERTA — À espera de submissões; cada treinador pode submeter/rever táctica
JORNADA_SIMULANDO — Simulação em decurso; transmissão em directo via Socket.io
POS_JORNADA — Resultados visíveis; próxima jornada transita para ABERTA
RONDA_TACA_ABERTA — Sorteio da ronda publicado; equipas a submeter tácticas
RONDA_TACA_SIMULANDO — Simulação em decurso; transmissão em directo
FIM_EPOCA — Apuramento de subidas/descidas, vencedor da Taça, prémios, convites de clubes mais fortes emitidos
ENCERRADA — Época terminada (arquivo)
```

---

## Regras e Restrições para o Assistente

> Estas regras aplicam-se sempre que o Copilot ajudar a desenvolver este projecto.

1. **Manter coerência com as mecânicas acima** — não introduzir sistemas não descritos sem aviso explícito.
2. **Fidelidade ao espírito do Elifoot 98** — simplicidade e dados em primeiro lugar; evitar complexidade desnecessária tipo FIFA Ultimate Team.
3. **Submissão assíncrona, simulação síncrona** — a submissão de tácticas é assíncrona (cada treinador submete quando pode); a simulação da partida é síncrona e requer a presença de todos os treinadores humanos, que confirmam "Pronto" em cada checkpoint (início, intervalo, tempo extra). Modelo inspirado em Football Manager / Hattrick. Nunca sugerir timers de jogo fixos ou horas marcadas.
4. **Stack: React 19 + Vite no frontend (JavaScript + JSDoc), Node.js + Express 5 no backend (TypeScript), SQLite como base de dados** — sugerir sempre código nesse contexto. Dependências recomendadas: `socket.io-client` (frontend), `socket.io`, `bcryptjs`, `dotenv`, `express-rate-limit` (backend).
5. **Português de Portugal** em todos os textos de UI, mensagens de sistema e comentários de código.
6. **Sem microtransacções ou mecânicas de monetização** — este é um projecto independente/hobby.
7. **Base de dados SQLite** — modelar com SQL compatível com SQLite (sem tipos PostgreSQL-específicos como `SERIAL`, `JSONB`, etc.).
8. **Socket.io já está implementado** — usar para notificações em tempo real (jornada simulada, sorteio da Taça, transmissão de eventos de jogo, pop-ups de leilão, etc.), nunca para sincronização de estado de jogo que deveria ser tratada por polling/API.
9. A **Taça de Portugal tem 32 participantes** (apenas clubes das 4 divisões principais).
10. **Craques existem apenas nas posições Médios e Avançados** — nunca atribuir flag `craque` a GR ou Defesas. Craques têm +20% chance de marcar um golo decisivo.
11. **Árbitros não têm perfil fixo** — a inclinação é gerada aleatoriamente por jogo, afecta apenas a probabilidade de cartões e penaltis (±15%), não o resultado geral. **Nas grandes penalidades da Taça, a inclinação não se aplica às probabilidades de conversão.**
12. **Empréstimos bancários têm 2,5% de juros por semana** — taxa intencional para penalizar má gestão financeira. **Máximo de 5 empréstimos activos em simultâneo.**
13. **Plantel mínimo 11, máximo 24** — nunca permitir venda/leilão que faça descer abaixo de 11.
14. **Leilões incluem todos os 32 clubes das divisões principais** como potenciais licitadores (humanos e IA). Pop-up de leilão aparece para todos; cada clube dá uma única licitação em 15 segundos de tempo real.
15. **O elenco de jogadores é fixo** — nunca sugerir criação de novos jogadores, reformas, ou envelhecimento. Os jogadores do seed são permanentes. A `qualidade` flutua entre 1 e 50; a flag `craque` nunca muda.
16. **Máximo 8 jogadores humanos por sala** — o acesso é feito exclusivamente por senha única gerada no momento da criação da sala.
17. **Sem Distritais com simulação** — usar sorteio simples de promoção no final da época para economizar CPU.
18. **Substituições são escolhidas ao intervalo** — ao intervalo a simulação pausa e aguarda que todos os treinadores humanos façam (ou não) substituições e confirmem "Pronto" para o bloco seguinte. Pop-up permite até 3 substituições no total, distribuídas entre o intervalo principal e o potencial intervalo antes do tempo extra. **A IA também faz substituições ao intervalo** se tiver jogadores de maior qualidade no banco.
19. **Semanas com duplo jogo (Campeonato + Taça) têm ciclos de submissão independentes** — o treinador submete para o campeonato, após simulação submete para a Taça. Podem ocorrer em dias diferentes.
20. **Convites de clubes mais fortes são avaliados no final de cada jornada** — aparece na interface do treinador imediatamente. **Convites expiram em 10 minutos.**
21. **Descida aos Distritais deixa o treinador como observador** — fica sem clube até receber um convite de um clube sem humano. Não há limite de descidas. **Clubes de IA que descem reaparecem no sorteio de promoção após 1 época de interregno.**
22. **O resultado do jogo é calculado in loco** — a simulação decorre em directo (45s + intervalo + 45s), com cada bloco a arrancar apenas após todos os humanos confirmarem "Pronto". Recálculo de forças após substituições e expulsões. O resultado nunca é pré-calculado.
23. **Jogos da mesma jornada são simulados em paralelo** — todos visíveis em simultâneo.
24. **Auto-golos de defesas são possíveis** — probabilidade baixa, depende da pressão ofensiva adversária.
25. **Cartão vermelho directo recalcula forças** — equipa fica com menos jogadores e sofre penalização de -10% por jogador a menos.
26. **Conflito de egos entre craques** — 3+ craques no onze titular reduzem probabilidade de golo progressivamente (-10% por craque acima de 2, cap -30%).
27. **Estádio tem capacidade máxima de 120.000 lugares** — não é possível expandir para além deste valor.
28. **Preço mínimo de venda de jogador: 1€** — o treinador pode vender a qualquer preço.
29. Em caso de dúvida sobre uma mecânica não descrita, **perguntar antes de inventar**.

# CashBall 26/27 — Detalhamento Técnico

Este documento complementa a especificação principal e clarifica sistemas críticos para evitar ambiguidades durante a implementação.

---

## 1. MORAL DA EQUIPA

### Range e Escala

- **Range**: 0 a 100 (inteiro)
- **Inicial**: 50 (neutro) para todas as equipas no início da época

### Cálculo de Mudança

Após cada jogo (campeonato ou Taça):

```
if (resultado == VITÓRIA):
  moral += 10
elif (resultado == EMPATE):
  moral += 0
elif (resultado == DERROTA):
  moral -= 15

// Caps
moral = max(0, min(100, moral))
```

**Nota especial:** A moral é **compartilhada entre Campeonato e Taça** — uma derrota em qualquer competição afecta a mesma moral.

**Despedimento e mudança de clube:** Se um treinador é despedido e aceita um convite de outro clube, a **moral da nova equipa permanece inalterada** — o treinador herda a moral que o clube já tinha. A moral pertence ao clube, não ao treinador.

### Impacto no Resultado do Jogo

A moral afecta a **probabilidade de golos marcados** (ataque):

```
bónus_moral = (moral - 50) * 0.005
// Se moral = 50: bónus = 0
// Se moral = 100: bónus = +0.5 (50% de aumento na probabilidade de golo)
// Se moral = 0: bónus = -0.5 (-50% na probabilidade de golo)
```

A moral **não afecta defesa** — golos sofridos dependem apenas dos atributos defensivos da equipa adversária e da sua moral.

---

## 2. CÁLCULO DO RESULTADO DO JOGO

### Modelo Base: Força Ofensiva vs. Força Defensiva

A simulação de um jogo calcula:

1. **Força Ofensiva da Equipa A** (ataque)
2. **Força Defensiva da Equipa B** (defesa)
3. Probabilidade de golo da Equipa A
4. Repetir para Equipa B
5. Determinar resultado final

### Cálculo de Força Ofensiva

```
força_ofensiva = (
  qualidade_média_médios * 0.4 +
  qualidade_média_avançados * 0.6
)

// Aplicar factor formação (mais ofensiva = mais golos)
formação_ofensiva_factor = {
  "4-2-4": 1.15,    // Muito ofensiva
  "3-4-3": 1.12,    // Ofensiva
  "4-3-3": 1.08,    // Ligeiramente ofensiva
  "3-5-2": 1.05,    // Controlo de bola com ataque moderado
  "4-4-2": 1.00,    // Neutra
  "4-5-1": 0.90,    // Defensiva
  "5-3-2": 0.85,    // Muito defensiva
  "5-4-1": 0.80     // Defensiva máxima
}

força_ofensiva *= formação_ofensiva_factor

// Aplicar bónus de moral
bónus_moral = (moral_equipa_a - 50) * 0.005
força_ofensiva *= (1 + bónus_moral)

// Aplicar estilo de jogo
estilo_factor = {
  "DEFENSIVO": 0.85,
  "EQUILIBRADO": 1.00,
  "OFENSIVO": 1.15
}
força_ofensiva *= estilo_factor["sua_instrução"]
força_ofensiva *= (1 / estilo_factor[adversário_instrução])  // Penalizar se adversário é defensivo
```

### Cálculo de Força Defensiva

```
força_defensiva = (
  qualidade_média_defesas * 0.6 +
  qualidade_média_guarda_redes * 0.4
)

// Aplicar factor formação (mais defesas = menos golos sofridos)
formação_defensiva_factor = {
  "5-4-1": 1.25,    // Máxima defesa (menos golos sofridos)
  "5-3-2": 1.20,
  "4-5-1": 1.10,
  "4-4-2": 1.00,    // Neutra
  "3-5-2": 0.95,    // Controlo de bola, defesa moderada
  "4-3-3": 0.90,
  "3-4-3": 0.85,
  "4-2-4": 0.75     // Mínima defesa (mais golos sofridos)
}

força_defensiva *= formação_defensiva_factor

// Nota: Força defensiva não sofre impacto directo de moral
// (a moral só afecta ataque, não defesa)
```

### Cálculo de Probabilidade de Golo

Para cada minuto de simulação (45 + 45 + potencial 30 extra):

```
// Função base: quanto maior o ataque, mais alta a probabilidade
// quanto maior a defesa, mais baixa

prob_golo_base = força_ofensiva / (força_ofensiva + força_defensiva_adversária * 2)

// Normalizar para intervalo 0-10% por minuto
prob_golo_por_minuto = prob_golo_base * 0.02  // ~2% de chance base por minuto se forças iguais

// Factor casa/fora
if (is_home_team):
  prob_golo_por_minuto *= 1.05  // +5% para equipa de casa
else:
  prob_golo_por_minuto *= 0.95  // -5% para equipa fora

// Factor inclinação árbitro (afecta apenas cartões/penaltis, não golos directos)
// não afecta esta probabilidade

### Cálculo de Probabilidade de Cartão

```

// Probability de cartão amarelo por minuto
prob_cartao_amarelo_base = 0.02 // 2% por minuto com agressividade neutra

// Modificar com base na agressividade média da equipa
agressividade_média_equipa = média(agressividade dos 11 em campo)

prob*cartao_amarelo = prob_cartao_amarelo_base * (1 + (agressividade*média_equipa - 3) * 0.1)

// Exemplos:
// - Agressividade média = 1 (Cordeirinho): 1 - 0.2 = 0.8 (20% menos cartões)
// - Agressividade média = 3 (Fair-Play): 1 + 0 = 1.0 (probabilidade base)
// - Agressividade média = 5 (Caceteiro): 1 + 0.2 = 1.2 (20% mais cartões)

// Cartão vermelho é mais raro e geralmente apenas por acumulação ou transgressão grave
prob_cartao_vermelho = prob_cartao_amarelo \* 0.15 // 15% de cartão amarelo vira vermelho

// Determinar se há golo neste minuto
if (random(0, 1) < prob_golo_por_minuto):
golo_marcado = true

// Verificar se é um "golo decisivo" (craque pode influenciar)
if (número*craques_em_campo > 0):
prob_golo_decisivo = 0.2 \* número_craques_em_campo
if (random(0, 1) < prob_golo_decisivo):
golo*é_decisivo = true
// (nota: isto apenas afecta narrativa ou atributo do relatório, não o cálculo)

```

### Resumo de Pesos

| Factor | Descrição | Peso |
|--------|-----------|------|
| Qualidade Médios (Ataque) | Contribuem para golos | 0.4 |
| Qualidade Avançados (Ataque) | Contribuem para golos | 0.6 |
| Qualidade Defesas (Defesa) | Reduzem golos sofridos | 0.6 |
| Qualidade GR (Defesa) | Reduz golos sofridos | 0.4 |
| Formação | Modifica ofensa/defesa | ±15% |
| Estilo | Modifica ofensa/defesa | ±15% |
| Moral (Ataque) | Aumenta probabilidade golo | ±50% max |
| Casa/Fora | Casa +5%, Fora -5% | ±5% |
| Craques | +20% prob golo decisivo | +20% |

**Importante**: Guarda-redes **não contribui** ao ataque — apenas à defesa.

---

## 3. SISTEMA DE CONVITES

### Avaliação

Os convites são avaliados **no final de cada jornada** (após simulação e atualização de tabelas).

### Critérios para Receber Convite

**Convites de Clubes Mais Fortes** (promoção):
- Treinador no topo da sua divisão (dentro dos top 3)
- Sequência de 3+ vitórias consecutivas (em qualquer competição)
- Moral de equipa > 70

**Convites de Clubes em Crise** (fundo/ascensão):
- Treinador em modo observador (sem clube)
- Clube em risco de descida (nos últimos 2 da sua divisão)
- **OU** clube sem treinador (despedido ou promovido)

### Frequência

- Máximo **um convite por treinador por jornada**
- Nem todas as jornadas têm convites — apenas quando critérios são encontrados
- A probabilidade é **rara** — aproximadamente 20-30% de chance numa jornada típica para um treinador elegível

### Múltiplos Convites Simultâneos

Um treinador **nunca recebe mais de um convite numa mesma jornada**. Se vários clubes o querem, apenas o primeiro a cumprir os critérios envia convite.

### IA também Recebe Convites

Sim. Clubes geridos por IA também podem receber convites para trocar de treinador. Quando isto acontece, o servidor aloca um novo "treinador IA" com personalidade e comportamento diferentes (mais conservador, mais ofensivo, etc.). Isto afecta:
- Seleção de tácticas
- Estilo de jogo preferido
- Estratégia de transferências
- Gestão financeira

---

## 4. MERCADO DE TRANSFERÊNCIAS

### Leilão Imediato — Desempate em Caso de Bids Simultâneos

Se dois ou mais clubes licitem com o mesmo valor:

```

vencedor = clube_com_menor_timestamp_de_bid

```

**O desempate é feito pelo timestamp do servidor** (timestamp do momento exacto em que o servidor recebe o bid), não pela ordem de clique no cliente. Isto garante:
- Imparcialidade (clock única de verdade no servidor)
- Impossibilidade de "lag gaming"
- Reprodutibilidade para auditorias

### Lista de Transferências — Venda Simultânea

Se múltiplos clubes tentarem comprar o mesmo jogador à venda por preço fixo no mesmo segundo:

```

comprador = clube_com_menor_timestamp_de_compra

````

Mesma regra: **timestamp do servidor**.

### Limite de Budget para IA em Leilões

Quando um clube de IA participa num leilão:

```typescript
function calculateMaxBidForAiTeam(aiTeam: Team, player: Player): number {
  // Budget disponível = saldo actual
  const budgetAvailable = aiTeam.balance;

  // Threshold: IA não gasta mais de 40% do saldo em um jogador
  const maxSpendThreshold = 0.40;

  // Preço máximo que IA vai oferecer
  const playerMarketValue = player.quality * 50000; // Estimativa: 50k por qualidade

  // IA nunca licita acima do saldo - margem de segurança (5 semanas de salários)
  const safetyMargin = aiTeam.squad
    .reduce((acc, p) => acc + p.salary * 5, 0); // 5 semanas de salários

  const maxBid = Math.min(
    playerMarketValue,
    (budgetAvailable - safetyMargin) * maxSpendThreshold
  );

  // IA só licita se consegue pagar
  if (maxBid < player.salary * 4) {
    return 0; // Não licita
  }

  // Licitação aleatória até ao máximo
  return Math.floor(maxBid * (0.7 + Math.random() * 0.3));
}
````

**Regras:**

- IA respeita **40% do saldo** como limite de gasto por jogador
- IA mantém **5 semanas de salários** como margem de segurança
- IA **não licita** se não conseguir pagar 4 semanas de salário do jogador
- Licitação varia entre 70-100% do máximo calculado (variabilidade)

---

## 5. REGRA DE CRAQUES NA SIMULAÇÃO

### Definição Precisa

Para cada **evento de golo decisivo** durante a simulação:

```
probabilidade_golo_decisivo = 0.2 * número_craques_em_campo_na_equipa

// Exemplo:
// - 0 craques: 0% chance de golo decisivo
// - 1 craque: 20% chance
// - 2 craques: 40% chance
// - 3+ craques: 60% cap máximo (evitar OP)

// Implementação:
probabilidade_golo_decisivo = min(0.6, 0.2 * número_craques)
```

**Efeito do Golo Decisivo:**

- Aumenta dramaticamente a visualização no relatório (descrição épica)
- Afecta narrativa do jogo, não o cálculo de resultado
- Um golo marcado é um golo — seja decisivo ou não, vale 1 ponto
- Serve principalmente para criar tensão e conversa entre treinadores

---

## 6. LOOP PRINCIPAL DO JOGO

```typescript
async function seasonLoop(seasonId: string) {
  let season = await db.getSeason(seasonId);

  while (season.status !== "ENCERRADA") {
    // FASE 1: Abrir submissão
    await openSubmissionPhase(season);
    console.log(
      `[${new Date().toISOString()}] Jornada ${season.currentRound} aberta`,
    );

    // FASE 2: Esperar por submissões
    let allSubmitted = false;
    while (!allSubmitted) {
      await sleep(5000); // Verificar a cada 5 segundos

      const submissions = await db.getSubmissions(
        season.id,
        season.currentRound,
      );
      const activeTrainers = await db.getActiveTrainers(season.id);

      allSubmitted = submissions.length === activeTrainers.length;
    }

    console.log(
      `[${new Date().toISOString()}] Todas as submissões recebidas. Iniciando simulação...`,
    );

    // FASE 3: Simular matches
    season.status = "JORNADA_SIMULANDO";
    await db.updateSeason(season);

    const matches = await db.getMatches(season.id, season.currentRound);
    // Todos os jogos da jornada são simulados em PARALELO e visíveis em simultâneo
    await Promise.all(
      matches.map(async (match) => {
        const result = await replayMatchViaSockets(io, season.id, match);
        await db.updateMatchResult(match.id, result);

        // Broadcast evento via Socket.io
        io.to(`season_${season.id}`).emit("match:simulated", {
          matchId: match.id,
          result: result,
          timestamp: new Date(),
        });
      }),
    );

    // FASE 4: Atualizar estado
    season.status = "POS_JORNADA";
    season.currentRound += 1;

    // Avaliar convites
    await evaluateInvites(season);

    // Atualizar tabelas
    await updateStandings(season);

    // Verificar se epoch terminou
    if (season.currentRound > season.totalRounds) {
      season.status = "FIM_EPOCA";
      await finalizeEpoch(season);
      season.status = "ENCERRADA";
    }

    await db.updateSeason(season);
    console.log(
      `[${new Date().toISOString()}] Jornada completada. Próxima: ${season.currentRound}`,
    );
  }
}
```

---

## 7. SEED E CONSISTÊNCIA

### Onde é Guardado

```typescript
interface Season {
  id: string;
  year: number;
  seed: string; // Seed global da época
  currentRound: number;
  roundSeeds: Map<number, string>; // Seed específica de cada jornada
}

interface Match {
  id: string;
  seasonId: string;
  round: number;
  roundSeed: string; // Referência à seed da jornada
  homeTeamId: string;
  awayTeamId: string;
  result: {
    homeGoals: number;
    awayGoals: number;
  };
  simulatedAt: Date;
}
```

### Reprodutibilidade

Para recriar exactamente o mesmo jogo:

```typescript
function simulateMatch(match: Match, roundSeed: string): MatchResult {
  // Criar RNG determinístico a partir da seed
  const rng = seededRandom(roundSeed);

  // Usar rng() para todas as decisões
  const homeGoals = calculateGoals(match.homeTeam, match.awayTeam, true, rng);

  const awayGoals = calculateGoals(match.awayTeam, match.homeTeam, false, rng);

  return { homeGoals, awayGoals };
}

// Exemplo: Mesma seed = mesmos resultados
const seed1 = generateSeed(); // "a7f3b2e1c9d0..."
const result1 = simulateMatch(match, seed1);
const result2 = simulateMatch(match, seed1);
// result1 === result2 (idêntico)
```

### Dependência de Ordem de Execução

**Não depende.** A seed é **global por jornada** — não importa a ordem em que os jogos são processados dentro dessa jornada. Cada jogo tem:

```typescript
const match_seed = roundSeed + "_" + match.id;
```

Isto garante que cada jogo é independente e reprodutível.

---

## 8. MÁQUINA DE ESTADOS FORMAL

### Estados e Transições Válidas

```
┌─────────────────────────────────────────────────────────┐
│                      PRE_EPOCA                           │
│  (Mercado aberto, preparação inicial)                    │
│  Treinadores: podem editar formação, mercado activo      │
└─────────────────────┬──────────────────────────────────┘
                      │
                      v
┌─────────────────────────────────────────────────────────┐
│                  JORNADA_ABERTA                          │
│  (Aguardando submissões de tácticas)                     │
│  Treinadores: podem submeter/alterar táctica             │
│  IA: submete automaticamente                             │
└─────────────────────┬──────────────────────────────────┘
                      │
              (todos submeteram)
                      v
┌─────────────────────────────────────────────────────────┐
│                JORNADA_SIMULANDO                         │
│  (Simulação a correr, transmissão em directo)            │
│  Treinadores: apenas observam, podem fazer subs          │
│  ao intervalo (pop-up obrigatório)                       │
└─────────────────────┬──────────────────────────────────┘
                      │
          (45s + intervalo + 45s)
                      v
┌─────────────────────────────────────────────────────────┐
│                  POS_JORNADA                             │
│  (Resultados finais, relatórios disponíveis)             │
│  Treinadores: podem ver resultados, mercado activo       │
└─────────────┬──────────────────┬────────────────────────┘
              │                  │
    (próxima jornada)    (se há jogo de Taça)
              │                  │
              v                  v
     JORNADA_ABERTA   RONDA_TACA_ABERTA
       (campeonato)         (Taça)
```

### Transições Explícitas

```typescript
enum SeasonState {
  PRE_EPOCA = "PRE_EPOCA",
  JORNADA_ABERTA = "JORNADA_ABERTA",
  JORNADA_SIMULANDO = "JORNADA_SIMULANDO",
  POS_JORNADA = "POS_JORNADA",
  RONDA_TACA_ABERTA = "RONDA_TACA_ABERTA",
  RONDA_TACA_SIMULANDO = "RONDA_TACA_SIMULANDO",
  FIM_EPOCA = "FIM_EPOCA",
  ENCERRADA = "ENCERRADA",
}

interface StateTransition {
  from: SeasonState;
  to: SeasonState;
  trigger: string;
  condition?: () => boolean;
}

const validTransitions: StateTransition[] = [
  { from: "PRE_EPOCA", to: "JORNADA_ABERTA", trigger: "epoch_start" },
  { from: "JORNADA_ABERTA", to: "JORNADA_SIMULANDO", trigger: "all_submitted" },
  {
    from: "JORNADA_SIMULANDO",
    to: "POS_JORNADA",
    trigger: "simulation_complete",
  },
  {
    from: "POS_JORNADA",
    to: "JORNADA_ABERTA",
    trigger: "next_round",
    condition: () => hasMoreRounds(),
  },
  {
    from: "POS_JORNADA",
    to: "RONDA_TACA_ABERTA",
    trigger: "cup_round_available",
    condition: () => isCupRound(),
  },
  {
    from: "RONDA_TACA_ABERTA",
    to: "RONDA_TACA_SIMULANDO",
    trigger: "all_submitted_cup",
  },
  {
    from: "RONDA_TACA_SIMULANDO",
    to: "POS_JORNADA",
    trigger: "cup_simulation_complete",
  },
  {
    from: "POS_JORNADA",
    to: "FIM_EPOCA",
    trigger: "epoch_end",
    condition: () => isLastRound(),
  },
  { from: "FIM_EPOCA", to: "ENCERRADA", trigger: "finalize_epoch" },
];

// Validação
function canTransition(from: SeasonState, to: SeasonState): boolean {
  const transition = validTransitions.find(
    (t) => t.from === from && t.to === to,
  );
  return transition && (!transition.condition || transition.condition());
}
```

---

## 9. EVENTOS SOCKET.IO — CONTRATO

### Namespaces

```
/seasons/:seasonId
  └── Todos os eventos relacionados com a época

/matches/:matchId
  └── Eventos relacionados com o jogo específico

/auction/:auctionId
  └── Eventos de leilões
```

### Eventos de Jornada

#### `round:opened`

```typescript
{
  seasonId: string;
  round: number;
  type: "CHAMPIONSHIP" | "CUP";
  deadline?: null; // sem deadline
  timestamp: Date;
}
```

#### `round:all_submitted`

```typescript
{
  seasonId: string;
  round: number;
  type: "CHAMPIONSHIP" | "CUP";
  submissionCount: number;
  timestamp: Date;
}
```

#### `round:simulation_start`

```typescript
{
  seasonId: string;
  round: number;
  type: "CHAMPIONSHIP" | "CUP";
  matchCount: number;
  timestamp: Date;
}
```

#### `round:simulation_complete`

```typescript
{
  seasonId: string;
  round: number;
  type: "CHAMPIONSHIP" | "CUP";
  timestamp: Date;
}
```

### Eventos de Match

#### `match:start`

```typescript
{
  matchId: string;
  seasonId: string;
  round: number;
  homeTeam: {
    id: string;
    name: string;
  }
  awayTeam: {
    id: string;
    name: string;
  }
  homeFormation: string;
  awayFormation: string;
  homeStyle: "DEFENSIVO" | "EQUILIBRADO" | "OFENSIVO";
  awayStyle: "DEFENSIVO" | "EQUILIBRADO" | "OFENSIVO";
  referee: {
    name: string;
    bias: "HOME" | "NEUTRAL" | "AWAY";
  }
  timestamp: Date;
}
```

#### `match:event`

```typescript
{
  matchId: string;
  minute: number;
  part: "1ST_HALF" | "INTERVAL" | "2ND_HALF" | "EXTRA_TIME" | "PENALTIES";
  type: "GOAL" | "YELLOW_CARD" | "RED_CARD" | "SUBSTITUTION";

  // Para GOAL:
  // {
  //   team: "HOME" | "AWAY";
  //   player: { id: string; name: string };
  //   isDecisive: boolean;
  //   isOwnGoal?: boolean; // true se auto-golo
  // }

  // Para PENALTY_MISS:
  // {
  //   team: "HOME" | "AWAY";
  //   player: { id: string; name: string };
  // }

  // Para YELLOW_CARD / RED_CARD:
  // {
  //   team: "HOME" | "AWAY";
  //   player: { id: string; name: string };
  // }

  // Para SUBSTITUTION:
  // {
  //   team: "HOME" | "AWAY";
  //   playerOut: { id: string; name: string };
  //   playerIn: { id: string; name: string };
  // }

  timestamp: Date;
}
```

#### `match:interval_substitutions_available`

```typescript
{
  matchId: string;
  team: "HOME" | "AWAY";
  currentScore: {
    home: number;
    away: number;
  }
  remainingSubstitutions: number;
  minute: number;
  part: "1ST_HALF" | "2ND_HALF" | "EXTRA_TIME";
  timeout: 60000; // 60 segundos em ms para escolher
  timestamp: Date;
}
```

#### `match:end`

```typescript
{
  matchId: string;
  seasonId: string;
  round: number;
  homeTeam: { id: string; name: string };
  awayTeam: { id: string; name: string };
  finalScore: { home: number; away: number };
  result: "HOME_WIN" | "AWAY_WIN" | "DRAW";
  penalties?: {
    homeShots: number;
    awayShots: number;
    homeConverted: number;
    awayConverted: number;
    winner: "HOME" | "AWAY";
  };
  homeTeamMoralChange: number;
  awayTeamMoralChange: number;
  timestamp: Date;
}
```

### Eventos de Leilão

#### `auction:start`

```typescript
{
  auctionId: string;
  seasonId: string;
  player: {
    id: string;
    name: string;
    position: string;
    quality: number;
  }
  sellingTeam: {
    id: string;
    name: string;
  }
  minimumBid: number;
  timeout: 15000; // 15 segundos
  timestamp: Date;
}
```

#### `auction:bid_received`

```typescript
{
  auctionId: string;
  biddingTeam: {
    id: string;
    name: string;
  }
  bidAmount: number;
  timestamp: Date;
  // Nota: Apenas enviado para a equipa que licita, não broadcast
}
```

#### `auction:end`

```typescript
{
  auctionId: string;
  player: {
    id: string;
    name: string;
  }
  sellingTeam: {
    id: string;
    name: string;
  }
  winningTeam: {
    id: string;
    name: string;
  }
  finalPrice: number;
  allBids: {
    team: {
      id: string;
      name: string;
    }
    amount: number;
  }
  [];
  timestamp: Date;
}
```

### Eventos de Sistema

#### `season:invite_received`

```typescript
{
  seasonId: string;
  trainerId: string;
  offeringTeam: { id: string; name: string; division: number };
  currentTeam?: { id: string; name: string }; // se trocando de clube
  reason: "PROMOTION" | "CRISIS" | "FIRED";
  timestamp: Date;
  expiresAt: Date; // 10 minutos para responder
}
```

#### `season:standings_updated`

```typescript
{
  seasonId: string;
  round: number;
  type: "CHAMPIONSHIP" | "CUP";
  standings: {
    division: number;
    teams: {
      id: string;
      name: string;
      position: number;
      points: number;
      played: number;
      won: number;
      drawn: number;
      lost: number;
      goalsFor: number;
      goalsAgainst: number;
      goalDifference: number;
    }
    [];
  }
  [];
  timestamp: Date;
}
```

---

## 10. MODELO DE DADOS EXPLÍCITO

### Entidades Principais

```typescript
interface Season {
  id: string;
  year: number;
  status: SeasonState;
  seed: string;
  startedAt: Date;
  currentRound: number;
  totalRounds: number; // 14 para campeonato + 5 para taça = 19 total
  endedAt?: Date;
}

interface Team {
  id: string;
  name: string;
  division: number; // 1-4
  seasonId: string;
  balance: number; // em euros
  stadium: {
    capacity: number; // mínimo 10.000, máximo 120.000
    expansionCost: number; // 300.000 por 5.000 lugares
  };
  currentTrainerId?: string; // null se gerido por IA
  aiPersonality?: AiPersonality;
  morale: number; // 0-100
  createdAt: Date;
}

interface Player {
  id: string;
  name: string;
  position: "GR" | "DEF" | "MED" | "ATA";
  quality: number; // 1-50
  salary: number; // euros por semana
  aggressiveness: 1 | 2 | 3 | 4 | 5; // 1=calm, 5=aggressive
  isCraque: boolean;
  teamId: string;
  acquiredAt: Date;
  lastQualityChangeRound?: number;
  qualityChangeStreak?: number; // para rastrear 5+ jornadas
}

interface Submission {
  id: string;
  seasonId: string;
  round: number;
  type: "CHAMPIONSHIP" | "CUP";
  trainerId: string;
  teamId: string;
  formation: string; // "4-3-3", etc.
  style: "DEFENSIVO" | "EQUILIBRADO" | "OFENSIVO";
  startingXI: string[]; // array de player IDs
  substitutes: string[]; // array de player IDs (até 5)
  submittedAt: Date;
}

interface Match {
  id: string;
  seasonId: string;
  round: number;
  type: "CHAMPIONSHIP" | "CUP";
  homeTeamId: string;
  awayTeamId: string;
  status: "SCHEDULED" | "SIMULATING" | "COMPLETED";
  roundSeed: string;
  result?: {
    homeGoals: number;
    awayGoals: number;
    resultType: "HOME_WIN" | "AWAY_WIN" | "DRAW";
    events: MatchEvent[];
    penalties?: PenaltyShootout;
    referee: {
      name: string;
      bias: "HOME" | "NEUTRAL" | "AWAY";
    };
  };
  homeSubmission: Submission;
  awaySubmission: Submission;
  simulatedAt?: Date;
}

interface MatchEvent {
  minute: number;
  part: "1ST_HALF" | "INTERVAL" | "2ND_HALF" | "EXTRA_TIME" | "PENALTIES";
  type:
    | "GOAL"
    | "YELLOW_CARD"
    | "RED_CARD"
    | "SUBSTITUTION"
    | "PENALTY_MISS"
    | "OWN_GOAL";
  team: "HOME" | "AWAY";
  player: { id: string; name: string };

  // Se GOAL
  isDecisive?: boolean;
  isOwnGoal?: boolean; // true se auto-golo de defesa

  // Se SUBSTITUTION
  playerOut?: { id: string; name: string };
}

interface PenaltyShootout {
  homeShots: {
    order: number;
    player: { id: string; name: string };
    scored: boolean;
  }[];
  awayShots: {
    order: number;
    player: { id: string; name: string };
    scored: boolean;
  }[];
  winner: "HOME" | "AWAY";
}

interface Auction {
  id: string;
  seasonId: string;
  playerId: string;
  sellingTeamId: string;
  minimumBid: number;
  status: "OPEN" | "CLOSED";
  openedAt: Date;
  closesAt: Date;
  bids: {
    teamId: string;
    amount: number;
    bidAt: Date;
  }[];
  winner?: {
    teamId: string;
    amount: number;
  };
  closedAt?: Date;
}

interface TransferOffer {
  id: string;
  seasonId: string;
  playerId: string;
  sellingTeamId: string;
  requestedPrice: number;
  status: "ACTIVE" | "SOLD" | "WITHDRAWN";
  createdAt: Date;
  soldAt?: Date;
  soldToTeamId?: string;
}

interface Invite {
  id: string;
  seasonId: string;
  fromTeamId: string;
  toTrainerId: string;
  reason: "PROMOTION" | "CRISIS" | "FIRED";
  status: "PENDING" | "ACCEPTED" | "REJECTED";
  sentAt: Date;
  expiresAt: Date;
  respondedAt?: Date;
}

interface AiPersonality {
  name: string;
  tacticalStyle: "DEFENSIVE" | "BALANCED" | "OFFENSIVE";
  riskTolerance: number; // 0-100
  marketAggression: number; // 0-100 (como de agressivo no mercado)
  formationPreference: string[]; // ordenado por preferência
}
```

### Índices Recomendados (Base de Dados)

```sql
-- Performance crítica
CREATE INDEX idx_season_status ON seasons(status);
CREATE INDEX idx_match_season_round ON matches(seasonId, round);
CREATE INDEX idx_submission_season_round_team ON submissions(seasonId, round, teamId);
CREATE INDEX idx_team_season_division ON teams(seasonId, division);
CREATE INDEX idx_player_team ON players(teamId);
CREATE INDEX idx_auction_season_status ON auctions(seasonId, status);
CREATE INDEX idx_invite_trainer_status ON invites(toTrainerId, status);

-- Para queries comuns
CREATE INDEX idx_match_status ON matches(status);
CREATE INDEX idx_submission_team ON submissions(teamId);
```

---

## 11. FLUXO DE SIMULAÇÃO VISUAL

```
┌─────────────────────────────────────────────┐
│    Todas as submissões recebidas             │
│    Estado: JORNADA_SIMULANDO                │
│    Evento: round:simulation_start            │
└────────────────────┬────────────────────────┘
                     │
                     v
     ┌─────────────────────────────────┐
     │   Para cada Match:              │
     │   1. Calcular forças            │
     │   2. Gerar RNG com seed         │
     │   3. Simular 45s (1ª Parte)     │
     └────────────┬────────────────────┘
                  │
        Evento: match:start
        Broadcast: match:event (cada minuto)
                  │
                  v
     ┌─────────────────────────────────┐
     │    Intervalo                    │
     │    Popup: substitutions_available
     │    Treinos: ~60s para escolher  │
     │    Evento: match:interval_..    │
     └────────────┬────────────────────┘
                  │
                  v
     ┌─────────────────────────────────┐
     │   Simular 45s (2ª Parte)        │
     │   Broadcast: match:event        │
     └────────────┬────────────────────┘
                  │
         ┌────────┴────────┐
         │                 │
   (resultado             (Taça +
    definitivo)           Empate)
         │                 │
         v                 v
    match:end      ┌──────────────────┐
                   │ Tempo Extra 30s   │
                   │ Intervalo + Subs  │
                   │ match:event       │
                   └────────┬──────────┘
                            │
              ┌─────────────┴─────────────┐
              │                           │
        (Resultado                   (Ainda
         definitivo)                  empate)
              │                           │
              v                           v
         match:end            ┌──────────────────┐
                              │ Grandes Penaltis │
                              │ (uma a uma)      │
                              │ match:event      │
                              └────────┬─────────┘
                                       │
                                       v
                                  match:end

│ Após todos os matches completados:
│ Evento: round:simulation_complete
│ Estado: POS_JORNADA
│ Atualizar tabelas
│ Avaliar convites
│ Evento: season:standings_updated
│ Evento: season:invite_received (se houver)
```

---

## CHECKSUM DE IMPLEMENTAÇÃO

Antes de começar o desenvolvimento, valida:

- [ ] Moral usa range 0-100, sobe/desce com resultados, afecta só ataque — pertence ao clube, não ao treinador
- [ ] Cálculo de força inclui pesos por posição, formação (incl. 3-5-2), estilo, moral, casa/fora
- [ ] Resultado calculado IN LOCO (45s + intervalo com subs/táctica + 45s recalculada) — nunca pré-calculado
- [ ] Craques têm +20% prob golo decisivo (não aditivo, capped em 60%) — conflito de egos 3+ craques
- [ ] Convites avaliados fim da jornada, máximo 1 por treinador, raros — expiram em 10 minutos
- [ ] Mercado: timestamp do servidor desempata bids simultâneos — preço mínimo venda 1€
- [ ] Seed é reprodutível e única por jornada + matchId
- [ ] Estados forma máquina formal com transições explícitas
- [ ] Socket.io eventos têm contrato definido (incl. PENALTY_MISS e OWN_GOAL)
- [ ] Modelo de dados tem todas as entidades e índices
- [ ] Loop semanal: abrir → esperar → simular em paralelo → atualizar
- [ ] Empréstimos bancários: máx 5 activos, 2.5% juros/semana
- [ ] Estádio: máx 120.000 lugares
- [ ] Auto-golos e cartão vermelho directo recalculam forças
- [ ] IA faz substituições ao intervalo se melhorar a equipa
- [ ] Sorteio de promoção exclui clubes descidos nessa mesma época

# CashBall 26/27 — Clarificações Críticas

Este documento resolve ambiguidades que causariam bugs na implementação.

---

## 1. CALENDÁRIO EXATO DA ÉPOCA

### Estrutura Semanal

```
Época = 19 Jornadas Total
├── 14 Jornadas de Campeonato (obrigatórias)
└── 5 Rondas de Taça (até eliminação ou vitória final)

Distribuição ao longo da época:
Semana 1:  Jornada 1 Campeonato (submissão 1)
Semana 2:  Jornada 2 Campeonato (submissão 2)
Semana 3:  Jornada 3 Campeonato (submissão 3) + Ronda 1 Taça (submissão 4)
Semana 4:  Jornada 4 Campeonato (submissão 5)
Semana 5:  Jornada 5 Campeonato (submissão 6)
Semana 6:  Jornada 6 Campeonato (submissão 7) + Ronda 2 Taça (submissão 8)
Semana 7:  Jornada 7 Campeonato (submissão 9)
Semana 8:  Jornada 8 Campeonato (submissão 10)
Semana 9:  Jornada 9 Campeonato (submissão 11) + Quartos-de-Final Taça (submissão 12)
Semana 10: Jornada 10 Campeonato (submissão 13)
Semana 11: Jornada 11 Campeonato (submissão 14)
Semana 12: Jornada 12 Campeonato (submissão 15) + Meias-Finais Taça (submissão 16)
Semana 13: Jornada 13 Campeonato (submissão 17)
Semana 14: Jornada 14 Campeonato (submissão 18) + Final Taça (submissão 19)
```

### Semanas com Duplo Jogo

**Exatamente 5 semanas com 2 submissões**: Semanas 3, 6, 9, 12, 14

### Fluxo Temporal Preciso de uma Semana com Duplo Jogo

```
SEMANA 3 (Exemplo)
├─ Estado: JORNADA_ABERTA (Campeonato, Jornada 3)
├─ Treinadores submetem tácticas para Campeonato
├─ QUANDO TODOS SUBMETEM:
│  └─ Estado: JORNADA_SIMULANDO
│  └─ Simulação decorre (45s + intervalo + 45s)
│  └─ Eventos transmitidos em directo
│  └─ Ao intervalo: pop-up substituições
│  └─ Jogo termina
├─ Após simulação do Campeonato:
│  └─ Estado: RONDA_TACA_ABERTA (Ronda 1 Taça)
│  └─ Sorteio da Ronda 1 Taça publicado
│  └─ Treinadores ainda na Taça (32 inicialmente) vêem seu adversário
│  └─ Treinadores submetem tácticas para Taça
├─ QUANDO TODOS SUBMETEM TAÇA:
│  └─ Estado: RONDA_TACA_SIMULANDO
│  └─ Jogo da Taça simulado (mesmo processo)
├─ Após jogo da Taça:
│  └─ Estado: POS_JORNADA
│  └─ Próxima semana: JORNADA_ABERTA (Semana 4, Campeonato Jornada 4)
```

### Número Total de Fases de Submissão

- **Sem eliminar ninguém da Taça**: 14 (campeonato) + 5 (taça) = **19 fases de submissão**
- **Se um treinador é eliminado na Ronda 1**: fica com 14 (campeonato) + 0 (taça) = **14 fases de submissão**
- **Máximo diferença entre treinadores**: 5 fases (quem vai à final vs quem sai na ronda 1)

---

## 2. SUBMISSÃO EM SEMANAS DE DUPLO JOGO

### Fluxo Exato

```typescript
// FASE 1: CAMPEONATO
async function weekDoubleGameFlow(seasonId: string, week: number) {
  // Estado: JORNADA_ABERTA (Campeonato)
  season.status = "JORNADA_ABERTA";
  season.currentCompetition = "CHAMPIONSHIP";
  season.currentRound = championshipRound;

  // Todos os treinadores submetem TÁTICA DE CAMPEONATO
  await waitForAllSubmissions(seasonId, "CHAMPIONSHIP");

  // Simular campeonato
  season.status = "JORNADA_SIMULANDO";
  await simulateAndBroadcastMatches(seasonId, "CHAMPIONSHIP");

  // Atualizar tabelas de campeonato
  season.status = "POS_JORNADA";
  await updateStandings(seasonId, "CHAMPIONSHIP");

  // ===== INTERVALO ENTRE COMPETIÇÕES =====
  // Sorteio da Taça (se aplicável)
  if (isFirstRoundOfCup(cupRound)) {
    await performCupDrawForRound(seasonId, cupRound);
  }

  // FASE 2: TAÇA
  // Estado: RONDA_TACA_ABERTA
  season.status = "RONDA_TACA_ABERTA";
  season.currentCompetition = "CUP";
  season.currentCupRound = cupRound;

  // Notificar treinadores dos seus adversários (via Socket.io)
  io.to(`season_${seasonId}`).emit('cup:round_draw_complete', {
    round: cupRound,
    matches: [...] // adversários, horários, etc.
  });

  // Todos os treinadores (que ainda estão na Taça) submetem TÁTICA DE TAÇA
  // Treinadores eliminados NÃO submetem, apenas observam
  const activeTeamsInCup = await db.getTeamsStillInCup(seasonId);
  await waitForSubmissions(seasonId, "CUP", activeTeamsInCup.length);

  // Simular taça
  season.status = "RONDA_TACA_SIMULANDO";
  await simulateAndBroadcastMatches(seasonId, "CUP");

  // Atualizar tabelas de taça (quadro de eliminatórias)
  season.status = "POS_JORNADA";
  await updateStandings(seasonId, "CUP");

  // Próxima semana volta a JORNADA_ABERTA (campeonato)
}
```

### Chave: Duas Submissões Independentes

1. **Submissão de Campeonato**: Todos os 32 treinadores (ou quantos estão ativos)
2. **Submissão de Taça**: Apenas treinadores cujas equipas ainda estão em prova

---

## 3. HUMANOS vs IA: CLARIFICAÇÃO

### Estrutura Correcta

```
32 Equipas Totais (sempre)
├─ Máximo 8 Humanos por Sala
└─ 24-32 Controladas por IA (conforme quantos humanos entram)

Exemplo 1: 3 Humanos numa Sala
├─ Humano 1: Campeão de Portugal
├─ Humano 2: Segunda Liga
├─ Humano 3: Liga 3
└─ 29 Equipas: Controladas por IA (Primeira Liga, Segunda Liga x2, Liga 3 x2, Campeonato x4, etc.)

Exemplo 2: 8 Humanos numa Sala
├─ 8 Humanos: Distribuídos pelas 4 divisões
└─ 24 Equipas: Controladas por IA
```

### Eventos Socket.io e o Público

Quando emitimos eventos como:

- **Leilão**: "Pop-up aparece para todos os 32 treinadores"
- **Standings**: "Classificação de todos os 32 clubes"
- **Convites**: "Todos os treinadores podem receber convites"

Significa:

- **Humanos**: Recebem eventos via Socket.io (UI actualiza)
- **IA**: Recebe informação internamente (BD), mas não "UI"

O sistema é **único** — a competição é entre 32 equipas, mas apenas até 8 são humanas.

---

## 4. SIMULAÇÃO EM TEMPO REAL (45 + 45 + 30 segundos)

### Gap na Implementação Anterior

O `seasonLoop` não tinha:

- Simulação in loco (o resultado era pré-calculado — ERRADO)
- Atraso de 45 segundos para 1ª Parte
- Pop-up de intervalo com timeout
- Recálculo de forças após substituições e expulsões para a 2ª Parte
- IA a fazer substituições ao intervalo
- Potencial tempo extra (30s) + pop-up + grandes penalidades

### Implementação Correcta

```typescript
async function replayMatchViaSockets(
  io: Server,
  seasonId: string,
  match: Match,
): Promise<MatchResult> {
  // O resultado é calculado IN LOCO durante a simulação:
  // 1.ª Parte: 45 segundos de cálculo minuto-a-minuto
  // Intervalo: substituições e mudança de táctica (humanos e IA)
  // 2.ª Parte: 45 segundos de cálculo com dados actualizados (novos jogadores, nova táctica)
  // O resultado final só é conhecido quando a simulação termina.
  const roomId = `season_${seasonId}`;
  const matchRoom = `match_${match.id}`;

  // ===== EMITIR INÍCIO DO JOGO =====
  io.to(roomId).emit("match:start", {
    matchId: match.id,
    homeTeam: { id: match.homeTeamId, name: match.homeTeamName },
    awayTeam: { id: match.awayTeamId, name: match.awayTeamName },
    homeFormation: match.homeSubmission.formation,
    awayFormation: match.awaySubmission.formation,
    homeStyle: match.homeSubmission.style,
    awayStyle: match.awaySubmission.style,
    referee: result.referee,
    timestamp: new Date(),
  });

  // ===== 1ª PARTE: 45 SEGUNDOS =====
  console.log(`[Match ${match.id}] 1ª Parte iniciada`);

  const firstHalfStart = Date.now();
  const firstHalfEvents = result.events.filter((e) => e.minute <= 45);

  // Distribuir eventos ao longo de 45 segundos
  for (const event of firstHalfEvents) {
    // Tempo esperado do evento: (minuto / 45) * 45000ms
    const eventTime = (event.minute / 45) * 45000;
    const now = Date.now() - firstHalfStart;

    if (eventTime > now) {
      await sleep(eventTime - now);
    }

    // Emitir evento
    io.to(roomId).emit("match:event", {
      matchId: match.id,
      minute: event.minute,
      part: "1ST_HALF",
      type: event.type,
      team: event.team,
      player: event.player,
      isDecisive: event.isDecisive,
      timestamp: new Date(),
    });
  }

  // Aguardar que a 1ª Parte complete 45 segundos
  const elapsed = Date.now() - firstHalfStart;
  if (elapsed < 45000) {
    await sleep(45000 - elapsed);
  }

  console.log(`[Match ${match.id}] Intervalo`);

  // ===== INTERVALO: POP-UP SUBSTITUIÇÕES =====
  // Apenas treinadores humanos veem e podem agir

  const homeTeamTrainerId = await db.getTrainerIdForTeam(match.homeTeamId);
  const awayTeamTrainerId = await db.getTrainerIdForTeam(match.awayTeamId);

  // Pop-up para HOME
  if (homeTeamTrainerId && isHumanTrainer(homeTeamTrainerId)) {
    io.to(`trainer_${homeTeamTrainerId}`).emit(
      "match:interval_substitutions_available",
      {
        matchId: match.id,
        team: "HOME",
        currentScore: {
          home: result.events.filter(
            (e) => e.minute <= 45 && e.team === "HOME" && e.type === "GOAL",
          ).length,
          away: result.events.filter(
            (e) => e.minute <= 45 && e.team === "AWAY" && e.type === "GOAL",
          ).length,
        },
        remainingSubstitutions: 3,
        minute: 45,
        part: "1ST_HALF",
        timeout: 60000, // 60 segundos
        timestamp: new Date(),
      },
    );
  }

  // Pop-up para AWAY
  if (awayTeamTrainerId && isHumanTrainer(awayTeamTrainerId)) {
    io.to(`trainer_${awayTeamTrainerId}`).emit(
      "match:interval_substitutions_available",
      {
        matchId: match.id,
        team: "AWAY",
        currentScore: {
          /* ... */
        },
        remainingSubstitutions: 3,
        minute: 45,
        part: "1ST_HALF",
        timeout: 60000,
        timestamp: new Date(),
      },
    );
  }

  // Aguardar 60 segundos para substituições (timeout)
  await sleep(60000);

  // Aplicar substituições (se humanos submeteram)
  // Ou usar defaults da IA
  const homeSubstitutions = await db.getSubstitutionsSubmitted(
    match.id,
    "HOME",
  );
  const awaySubstitutions = await db.getSubstitutionsSubmitted(
    match.id,
    "AWAY",
  );

  // ===== IA DECIDE SUBSTITUIÇÕES AO INTERVALO =====
  // Se a equipa é gerida por IA e ainda não submeteu substituições,
  // a IA avalia se tem jogadores de maior qualidade no banco de suplentes
  // na mesma posição. Se sim, substitui para melhorar a equipa.
  if (!homeSubstitutions.length && !isHumanTrainer(homeTeamTrainerId)) {
    const aiHomeSubs = calculateAiSubstitutions(match, "HOME");
    await db.saveSubstitutions(match.id, "HOME", aiHomeSubs);
  }
  if (!awaySubstitutions.length && !isHumanTrainer(awayTeamTrainerId)) {
    const aiAwaySubs = calculateAiSubstitutions(match, "AWAY");
    await db.saveSubstitutions(match.id, "AWAY", aiAwaySubs);
  }

  // Aplicar substituições ao plantel em campo
  applySubstitutions(match, homeSubstitutions, awaySubstitutions);

  // ===== RECALCULAR FORÇAS PARA A 2ª PARTE =====
  // Após substituições e potencial mudança de táctica ao intervalo,
  // as forças ofensivas e defensivas são RECALCULADAS com os novos dados.
  // Se um jogador recebeu cartão vermelho na 1ª Parte, a equipa joga
  // com menos um jogador e a força é recalculada proporcionalmente.
  const updatedHomeSubmission = await db.getUpdatedSubmission(match.id, "HOME");
  const updatedAwaySubmission = await db.getUpdatedSubmission(match.id, "AWAY");

  // ===== 2ª PARTE: 45 SEGUNDOS (SIMULAÇÃO IN LOCO) =====
  // A 2ª parte é calculada minuto-a-minuto com os dados actualizados
  console.log(`[Match ${match.id}] 2ª Parte iniciada (dados recalculados)`);

  const secondHalfStart = Date.now();
  const secondHalfEvents = simulateHalf(
    match,
    updatedHomeSubmission,
    updatedAwaySubmission,
    46,
    90,
    rng,
  );

  for (const event of secondHalfEvents) {
    const eventTime = ((event.minute - 45) / 45) * 45000;
    const now = Date.now() - secondHalfStart;

    if (eventTime > now) {
      await sleep(eventTime - now);
    }

    io.to(roomId).emit("match:event", {
      matchId: match.id,
      minute: event.minute,
      part: "2ND_HALF",
      type: event.type,
      team: event.team,
      player: event.player,
      isDecisive: event.isDecisive,
      timestamp: new Date(),
    });
  }

  const elapsedSecondHalf = Date.now() - secondHalfStart;
  if (elapsedSecondHalf < 45000) {
    await sleep(45000 - elapsedSecondHalf);
  }

  // ===== DETERMINAR SE HÁ TEMPO EXTRA (TAÇA) =====
  const isTaça = match.type === "CUP";
  const isEmpatado = result.homeGoals === result.awayGoals;

  if (isTaça && isEmpatado) {
    console.log(`[Match ${match.id}] Tempo Extra (30 segundos)`);

    // Pop-up de intervalo antes do extra
    // ... (similar ao anterior)

    // ===== TEMPO EXTRA: 30 SEGUNDOS =====
    const extraTimeStart = Date.now();
    const extraTimeEvents = result.events.filter(
      (e) => e.minute > 90 && e.minute <= 120,
    );

    for (const event of extraTimeEvents) {
      const eventTime = ((event.minute - 90) / 30) * 30000;
      const now = Date.now() - extraTimeStart;

      if (eventTime > now) {
        await sleep(eventTime - now);
      }

      io.to(roomId).emit("match:event", {
        matchId: match.id,
        minute: event.minute,
        part: "EXTRA_TIME",
        type: event.type,
        team: event.team,
        player: event.player,
        timestamp: new Date(),
      });
    }

    const elapsedExtra = Date.now() - extraTimeStart;
    if (elapsedExtra < 30000) {
      await sleep(30000 - elapsedExtra);
    }

    // Se ainda empatado, grandes penalidades
    if (result.homeGoals === result.awayGoals) {
      console.log(`[Match ${match.id}] Grandes Penalidades`);

      // ===== GRANDES PENALIDADES (uma a uma) =====
      const penalties = result.penalties;

      for (const penalty of penalties.homeShots.concat(penalties.awayShots)) {
        await sleep(3000); // 3 segundos entre penaltis

        io.to(roomId).emit("match:event", {
          matchId: match.id,
          minute: 120 + penalty.order,
          part: "PENALTIES",
          type: penalty.scored ? "GOAL" : "PENALTY_MISS",
          team: penalty.team,
          player: penalty.player,
          timestamp: new Date(),
        });
      }
    }
  }

  // ===== FIM DO JOGO =====
  console.log(`[Match ${match.id}] Fim do jogo`);

  io.to(roomId).emit("match:end", {
    matchId: match.id,
    seasonId: seasonId,
    round: match.round,
    homeTeam: { id: match.homeTeamId, name: match.homeTeamName },
    awayTeam: { id: match.awayTeamId, name: match.awayTeamName },
    finalScore: { home: result.homeGoals, away: result.awayGoals },
    result: result.resultType,
    penalties: result.penalties,
    homeTeamMoralChange: result.homeTeamMoralChange,
    awayTeamMoralChange: result.awayTeamMoralChange,
    timestamp: new Date(),
  });
}

// ===== FUNÇÃO DE SUBSTITUIÇÕES DA IA AO INTERVALO =====
function calculateAiSubstitutions(
  match: Match,
  team: "HOME" | "AWAY",
): Substitution[] {
  const submission =
    team === "HOME" ? match.homeSubmission : match.awaySubmission;
  const squad =
    team === "HOME" ? match.homeTeam.players : match.awayTeam.players;
  const substitutes = squad.filter((p) =>
    submission.substitutes.includes(p.id),
  );
  const starters = squad.filter((p) => submission.startingXI.includes(p.id));
  const subs: Substitution[] = [];

  // Para cada suplente, verificar se há um titular da mesma posição com qualidade inferior
  for (const sub of substitutes) {
    if (subs.length >= 3) break; // Máximo 3 substituições

    // Encontrar o titular mais fraco na mesma posição
    const weakestStarter = starters
      .filter(
        (s) =>
          s.position === sub.position &&
          !subs.some((x) => x.playerOut.id === s.id),
      )
      .sort((a, b) => a.quality - b.quality)[0];

    // IA substitui se o suplente tiver qualidade superior ao titular
    if (weakestStarter && sub.quality > weakestStarter.quality) {
      subs.push({
        playerOut: { id: weakestStarter.id, name: weakestStarter.name },
        playerIn: { id: sub.id, name: sub.name },
      });
    }
  }

  return subs;
}
```

---

## 5. CÁLCULOS CORRECTOS (Sem Erros de Sintaxe)

### Probabilidade de Golo (CORRIGIDO)

```typescript
function calculateGoalProbabilityPerMinute(
  attackingTeamQuality: number,
  defendingTeamQuality: number,
  isHome: boolean,
): number {
  // Força ofensiva vs força defensiva
  // Quando forças iguais, probabilidade base é ~0.5%

  const baseRatio =
    attackingTeamQuality / (attackingTeamQuality + defendingTeamQuality * 2);

  // Normalizar para ~0.5% por minuto com forças iguais
  const probGoalPerMinute = baseRatio * 0.01; // 1% de chance base

  // Factor casa/fora
  const homeAwayFactor = isHome ? 1.05 : 0.95;

  return probGoalPerMinute * homeAwayFactor;
}

// Exemplo real:
// Ataque qualidade 30, Defesa qualidade 25
// ratio = 30 / (30 + 25*2) = 30 / 80 = 0.375
// prob = 0.375 * 0.01 = 0.00375 = 0.375% por minuto
// Em 45 minutos: ~16% chance de marcar pelo menos 1 golo
```

### Probabilidade de Cartão (CORRIGIDO)

```typescript
function calculateYellowCardProbabilityPerMinute(
  averageAggressivenessInField: number, // 1-5
): number {
  // Probabilidade base: 2% por minuto com agressividade = 3
  const probCartaoBase = 0.02;

  // Modificar com agressividade
  // Se agressividade = 1: factor = 1 + (1-3)*0.1 = 1 - 0.2 = 0.8
  // Se agressividade = 3: factor = 1 + (3-3)*0.1 = 1.0
  // Se agressividade = 5: factor = 1 + (5-3)*0.1 = 1.2

  const aggressionFactor = 1 + (averageAggressivenessInField - 3) * 0.1;

  return probCartaoBase * aggressionFactor;
}

function calculateRedCardProbability(yellowCardProbability: number): number {
  // 15% de chance de cartão amarelo vira vermelho
  return yellowCardProbability * 0.15;
}
```

### Cálculo de Força Ofensiva (CORRIGIDO)

```typescript
function calculateOffensiveForce(
  team: Team,
  submission: Submission,
  moral: number,
): number {
  // 1. Qualidade base (por posição)
  const midfieldersInField = team.players.filter(
    (p) => p.position === "MED" && submission.startingXI.includes(p.id),
  );
  const forwardsInField = team.players.filter(
    (p) => p.position === "ATA" && submission.startingXI.includes(p.id),
  );

  const avgMidfielderQuality = average(
    midfieldersInField.map((p) => p.quality),
  );
  const avgForwardQuality = average(forwardsInField.map((p) => p.quality));

  const baseOffensiveForce =
    avgMidfielderQuality * 0.4 + avgForwardQuality * 0.6;

  // 2. Factor formação
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
  const formationFactor = formationOffensiveFactors[submission.formation];

  // 3. Factor moral
  const moralFactor = 1 + (moral - 50) * 0.01; // -50% a +50%

  // 4. Factor estilo
  const styleFactors = {
    DEFENSIVO: 0.85,
    EQUILIBRADO: 1.0,
    OFENSIVO: 1.15,
  };
  const styleFactor = styleFactors[submission.style];

  // 5. Factor estilo adversário (penalização)
  // Se adversário é muito defensivo, menos probabilidade de golo
  // Isto é aplicado no cálculo de probabilidade, não aqui

  return baseOffensiveForce * formationFactor * moralFactor * styleFactor;
}
```

### Cálculo de Força Defensiva (CORRIGIDO)

```typescript
function calculateDefensiveForce(team: Team, submission: Submission): number {
  // 1. Qualidade base (por posição)
  const defendersInField = team.players.filter(
    (p) => p.position === "DEF" && submission.startingXI.includes(p.id),
  );
  const keepersInField = team.players.filter(
    (p) => p.position === "GR" && submission.startingXI.includes(p.id),
  );

  const avgDefenderQuality = average(defendersInField.map((p) => p.quality));
  const avgKeeperQuality = average(keepersInField.map((p) => p.quality));

  const baseDefensiveForce = avgDefenderQuality * 0.6 + avgKeeperQuality * 0.4;

  // 2. Factor formação
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
  const formationFactor = formationDefensiveFactors[submission.formation];

  // 3. Nota: Moral NÃO afecta defesa, apenas ataque

  // 4. Factor estilo (defesa torna-se mais resistente)
  const styleFactors = {
    DEFENSIVO: 1.15, // +15% defesa
    EQUILIBRADO: 1.0,
    OFENSIVO: 0.85, // -15% defesa
  };
  const styleFactor = styleFactors[submission.style];

  return baseDefensiveForce * formationFactor * styleFactor;
}
```

### Fórmula Final de Probabilidade (CORRIGIDO)

```typescript
function simulateGoalAttempt(
  attackingTeam: Team,
  defendingTeam: Team,
  attackingTeamSubmission: Submission,
  defendingTeamSubmission: Submission,
  attackingTeamMoral: number,
  isHome: boolean,
  rng: SeededRandom,
): MatchEvent | null {
  const offensiveForce = calculateOffensiveForce(
    attackingTeam,
    attackingTeamSubmission,
    attackingTeamMoral,
  );

  const defensiveForce = calculateDefensiveForce(
    defendingTeam,
    defendingTeamSubmission,
  );

  // Probabilidade base
  const ratio = offensiveForce / (offensiveForce + defensiveForce * 2);
  let probGoal = ratio * 0.01; // 1% de chance base

  // Factor casa/fora
  probGoal *= isHome ? 1.05 : 0.95;

  // Factor estilo adversário (penalização extra se é muito defensivo)
  if (defendingTeamSubmission.style === "DEFENSIVO") {
    probGoal *= 0.85; // -15% extra
  } else if (defendingTeamSubmission.style === "OFENSIVO") {
    probGoal *= 1.1; // +10% extra
  }

  // Determinar se há golo
  if (rng.next() < probGoal) {
    // Seleccionar jogador que marca
    const scorer = selectScorerFromTeam(
      attackingTeam,
      attackingTeamSubmission,
      rng,
    );

    // Determinar se é decisivo (craque)
    const craqueCount = countCraquesInField(
      attackingTeam,
      attackingTeamSubmission,
    );
    const craqueFactor = Math.min(0.6, 0.2 * craqueCount); // Cap em 60%
    const isDecisive = rng.next() < craqueFactor;

    return {
      minute: calculateCurrentMinute(), // contexto
      part: calculateCurrentPart(),
      type: "GOAL",
      team: isHome ? "HOME" : "AWAY",
      player: scorer,
      isDecisive: isDecisive,
    };
  }

  return null;
}
```

---

## 6. PROMOÇÃO APÓS DESCIDA (RANDOM PURO)

### Mecanismo

```typescript
async function finalizeSeasonPromotions(seasonId: string) {
  const season = await db.getSeason(seasonId);
  const standings = await db.getStandings(seasonId, "CHAMPIONSHIP");

  // 1. Identificar equipas despromovidas
  const relegated = getLastTwoTeams(standings.division4); // 2 equipas

  // 2. No final da época, sortear 2 de entre os clubes elegíveis
  // EXCLUIR os clubes que desceram NESTA mesma época (têm de esperar 1 época)
  const allTeams = await db.getAllTeamsInSeason(seasonId);
  const relegatedThisSeason = relegated.map((t) => t.id);
  const eligibleTeams = allTeams.filter(
    (t) => !relegatedThisSeason.includes(t.id),
  );
  const randomSelectedTeams = random.shuffle(eligibleTeams).slice(0, 2);

  // 3. Essas 2 são promovidas para divisão 4 (substituindo os 2 que desceram)
  for (const promotedTeam of randomSelectedTeams) {
    await db.setTeamDivision(promotedTeam.id, 4);
  }

  // 4. Os 2 despromovidos perdem seus postos (treinador fica observador)
  for (const relegatedTeam of relegated) {
    await db.setTeamDivision(relegatedTeam.id, null); // "fora de competição"
    const trainer = await db.getTrainerForTeam(relegatedTeam.id);
    if (trainer && isHumanTrainer(trainer.id)) {
      await db.setTrainerStatus(trainer.id, "OBSERVING");
    }
  }

  console.log(
    `Promoção random: ${randomSelectedTeams.map((t) => t.name).join(", ")} => Divisão 4`,
  );
  console.log(
    `Descida: ${relegated.map((t) => t.name).join(", ")} => Observadores`,
  );
}
```

### Clarificação

- **Random entre elegíveis**: Qualquer clube que não tenha descido nessa mesma época é elegível para o sorteio
- **Clubes relegados excluídos**: Os 2 clubes que desceram nessa mesma época NÃO entram no sorteio — têm de esperar 1 época completa
- **Sem critérios**: Não favorece equipas que desceram, equipas em forma, nada
- **Justo**: Cria incerteza e drama na competição

---

## CHECKLIST DE CLARIFICAÇÕES IMPLEMENTADAS

- [ ] Calendário fixo: Semanas 3, 6, 9, 12, 14 com duplo jogo
- [ ] 19 fases de submissão máximo (14 campeonato + 5 taça)
- [ ] Submissões independentes: Campeonato depois Taça na mesma semana
- [ ] 32 equipas totais, max 8 humanas, resto IA
- [ ] Simulação IN LOCO: 45s 1ª parte + intervalo (subs + táctica) + 45s 2ª parte (recalculada) + potencial 30s + penaltis
- [ ] Pop-up de substituições ao intervalo (timeout 60s) — IA também faz subs ao intervalo
- [ ] Cálculos sem erros de sintaxe, valores realistas
- [ ] Força ofensiva inclui: qualidade, formação (incl. 3-5-2), moral, estilo
- [ ] Força defensiva inclui: qualidade, formação (incl. 3-5-2), estilo (não moral)
- [ ] Probabilidade golo ~0.5-1% por minuto (realista)
- [ ] Cartão amarelo: 2% base \* factor agressividade
- [ ] Cartão vermelho: 15% de amarelo vira vermelho — equipa recalculada com -10% por jogador a menos
- [ ] Craques: +20% prob golo decisivo, capped em 60% — conflito de egos com 3+ craques
- [ ] Promoção: random de clubes elegíveis (exclui os que desceram nessa mesma época)
- [ ] Árbitro inclinação: gerado random por jogo (±15% em cartões/penaltis) — NÃO afecta grandes penalidades da Taça
- [ ] Moral pertence ao clube, não ao treinador — treinador despedido herda moral do novo clube
- [ ] Convites expiram em 10 minutos (não 24 horas)
- [ ] Empréstimos bancários: máximo 5 activos em simultâneo
- [ ] Estádio: capacidade máxima 120.000 lugares
- [ ] Preço mínimo de venda: 1€ (sem mínimo obrigatório)
- [ ] Clubes de IA que descem reaparecem no sorteio após 1 época de interregno
- [ ] Jogos da mesma jornada simulados em paralelo
- [ ] Auto-golos de defesas possíveis (probabilidade baixa)
- [ ] Evento PENALTY_MISS e OWN_GOAL definidos no contrato match:event
- [ ] Evolução qualidade: jogadores mesma posição com qualidade superior fazem evoluir os mais fracos
