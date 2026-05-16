# CashBall 26/27

Jogo de gestão de futebol baseado em texto/dados, inspirado no **Elifoot 98**, a correr no browser com suporte a **multiplayer assíncrono**. 1 a 8 treinadores humanos submetem tácticas quando podem; a simulação corre em directo quando todos confirmam "Pronto". Sem horários fixos — o ritmo é ditado pelos jogadores.

## 🚀 Visão Geral

CashBall oferece uma experiência de gestão profunda onde o tempo é o teu aliado. Não precisas de estar online ao mesmo tempo que outros treinadores; submete a tua tática e espera que a simulação avance.

### Stack Tecnológica

- **Frontend:** React 19, Tailwind CSS 4
- **Backend:** Node.js, Express 5, Socket.io
- **Base de Dados:** SQLite

---

## ⚽ Mecânicas de Jogo

### Atributos e Craques

A qualidade do teu plantel define o teu sucesso.

- **Atributos:** Cada jogador possui `skill` (qualidade), `wage` (salário) e `aggressiveness` (agressividade).
- **Craques (`is_star`):** Apenas jogadores de MED e ATA podem ser craques.
  - Um craque tem **+20% de chance de marcar um golo decisivo**.
  - **Cuidado com o Ego:** Ter demasiados craques no onze titular (3+) pode prejudicar a harmonia e reduzir a probabilidade de golo.

### Simulação de Jogos

As partidas são decididas minuto a minuto em tempo real:

- **Dinâmica:** 45' de 1ª parte $\rightarrow$ Intervalo (substituições) $\rightarrow$ 45' de 2ª parte.
- **Taça:** Se empatar, passamos para o **Tempo Extra** e, se necessário, para a tensão dos **Penalties**.
- **Juniores:** Se o teu plantel estiver incompleto, o clube fornece automaticamente jogadores juniores para garantir que podes competir.

### Competições e Calendário

O futebol é linear e organizado. O campeonato e a taça intercalam-se para manter o ritmo constante.

#### **Campeonato (4 Divisões)**

- **Divisões:** Primeira Liga, Segunda Liga, Liga 3 e Campeonato de Portugal.
- **Formato:** Todos-contra-todos (ida e volta), 14 jornadas por época.
- **Promoções/Descidas:** O topo sobe, o fundo desce. A sobrevivência é fundamental.

#### **Taça de Portugal**

- **Formato:** Knock-out (eliminação direta). 5 rondas até à grande final.
- **Glória:** Ganhar a taça é o caminho mais rápido para o prestígio e prémios financeiros.

### Mercado e Finanças

A gestão económica é tão importante quanto a tática de campo.

- **Transferências:** Compra e vende jogadores com preços negociados ou através de **Leilões Rápidos** de 15 segundos.
- **Gestão Financeira:** Controla os teus salários, receitas de bilheteira e patrocínios.
- **Atenção:** O orçamento negativo e os maus resultados podem levar ao teu **despedimento**.

---

## 👥 Gestão de Treinadores

- **Início:** Começas na base, no Campeonato de Portugal.
- **Multiplayer:** Até 8 treinadores humanos por sala.
- **Carreira:** Recebe convites de clubes maiores, gere o teu prestígio e evita o despedimento através de uma gestão sólida.

## 📊 Dados e Estatísticas

O jogo baseia-se em dados persistentes. Os clubes, plantéis e resultados são geridos de forma a garantir uma experiência contínua e competitiva.
