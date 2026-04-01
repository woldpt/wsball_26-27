# Revisão do CashBall 26-27.md — Incongruências, Erros e Ambiguidades

---

## Contradições Internas no Documento

### 1. Fórmula da Moral — duas versões incompatíveis

- **Secção original** (~linha 647): `bónus_moral = (moral - 50) * 0.005` → moral 100 dá +25%
- **Secção "CORRIGIDO"** (~linha 2276): `moralFactor = 1 + (moral - 50) * 0.01` → moral 100 dá +50%
- São fórmulas diferentes com impacto muito distinto. Qual é a canónica?

### 2. Probabilidade de golo por minuto — duas versões

- **Secção original** (~linha 741): `prob_golo_por_minuto = prob_golo_base * 0.02` (2%)
- **Secção "CORRIGIDO"** (~linha 2199): `probGoalPerMinute = baseRatio * 0.01` (1%)
- Diferença de 2x no ritmo de golos é enorme para o equilíbrio do jogo.

### 3. Suplentes — 3 ou 5?

- Linha 242: "3 suplentes predefinidos para potenciais substituições"
- Linha 1540: `substitutes: string[] // array de player IDs (até 5)`
- O treinador submete 3 ou 5 suplentes na táctica?

### 4. Critério de desempate duplicado

Linhas 410-412:
> 1. Diferença de golos
> 2. Golos marcados
> 3. Diferença de golos marcados - golos sofridos

O critério 3 é **idêntico** ao critério 1. Provavelmente o critério 3 deveria ser outra coisa (confronto directo? fair-play?).

---

## Erros Factuais (Spec vs. Código)

### 5. Backend **não é** TypeScript

O spec diz repetidamente "Node.js + Express 5 no backend (TypeScript)" mas **todos os ficheiros do servidor são `.js`**, não há `tsconfig.json`, e o `package.json` não tem dependência de TypeScript. O backend é JavaScript puro.

### 6. Posições: G/D/M/A vs. GR/DEF/MED/ATA

O spec define `G`, `D`, `M`, `A`. O código usa consistentemente `GR`, `DEF`, `MED`, `ATA` (schema, seed, engine, frontend). O documento está desactualizado.

### 7. Path dos fixtures

O spec referencia `/db/players.json`. O caminho real é `/server/db/fixtures/players.json`. Há vários ficheiros de fixture (`all_teams.json`, `managers.json`, `players.json`, `referees.json`, `stadiums.json`, `teams.json`) não mencionados no spec.

### 8. Seeded random **não implementado**

O spec descreve extensamente um sistema de seeds reproduzíveis (`seededRandom(roundSeed)`, seed por jornada + matchId). O código usa `Math.random()` em todo o lado sem qualquer seeding. A secção 7 inteira ("SEED E CONSISTÊNCIA") não corresponde à realidade.

### 9. Craques: +20% vs. 3x weight

O spec diz "+20% de chance de marcar um golo decisivo". O engine.js implementa um peso 3x (`starMult = 3`) na selecção do marcador — que é um boost de 200%, não 20%.

---

## Ambiguidades e Situações Mal Explicadas

### 10. Agressividade: escala 1-5 com nomes, mas código usa TEXT

O spec define claramente 5 níveis (1=Cordeirinho a 5=Caceteiro). O schema.sql actual usa `TEXT DEFAULT 'Fair Play'`. A memória do repositório diz "Aggressiveness is numeric 1-50, Schema is INTEGER DEFAULT 25". Há **3 versões contraditórias** entre spec, repo memory, e código. Precisa de decisão definitiva.

### 11. Mercado de transferências aberto quando?

O spec diz que o mercado está aberto na PRE_EPOCA, mas não clarifica se está aberto **durante** a época (entre jornadas). Pode-se vender/comprar a meio de uma jornada aberta? E durante a simulação?

### 12. Sorteio de promoção dos Distritais — lógica estranha

> "2 clubes são sorteados aleatoriamente de entre todos os 32 (incluindo os que desceram) para serem promovidos"

Isto significa que um clube que acabou de descer pode ser imediatamente promovido de volta? E um clube que ficou em 1.º na Primeira Liga pode ser "promovido" (para onde, se já está no topo)? A lógica de "substituir os 2 que desceram" é confusa — se 2 sobem para a Liga 3 (promoção normal), quem fica no Campeonato de Portugal?

### 13. Substituições durante simulação vs. simulação pré-calculada

O spec diz que a simulação é pré-calculada com seed determinístico (secção 7), mas as substituições são decididas **ao intervalo em tempo real** (secção sobre substituições). Se o resultado já foi calculado antes da transmissão, como é que substituições ao intervalo afectam a 2.ª parte? A secção "CORRIGIDO" (secção 4) tenta resolver isto com `applySubstitutions()` mas isto muda o resultado pré-calculado, quebrando a reprodutibilidade.

### 14. Treinadores eliminados da Taça — submetem para quê?

Nas semanas com duplo jogo, o spec diz que "todos os treinadores" submetem para o campeonato, e depois apenas os que estão na Taça submetem para a Taça. Mas na jornada de campeonato, **todos os 32 treinadores** (incluindo IA) precisam submeter? Ou apenas os humanos? O spec não é consistente no uso de "todos os treinadores activos".

### 15. Convites — critério diz "Mora" em vez de "Moral"

Linha 816: `Mora de equipa > 70` — typo, deveria ser "Moral".

### 16. Empréstimos — juros por "semana" mas não há conceito de tempo real

Os juros são 5% **por semana**, mas o jogo não tem semanas reais — avança por submissão. "Semana" é sinónimo de "jornada"? Se sim, 5% por jornada em 14 jornadas é brutal (quase duplica a dívida).

### 17. Evolução de qualidade — pouco definida

> "Qualidade aumenta +1 se o jogador jogou em 5+ jornadas consecutivas ao lado de jogadores com qualidade acima da sua qualidade média"

"Ao lado" significa na mesma equipa? Na mesma posição? E a perda: "muitos maus resultados seguidos" — quantos? Quanto perde?

---

## Resumo por Gravidade

| Gravidade | # | Descrição |
|-----------|---|-----------|
| **Crítico** | 1, 2, 8, 13 | Contradições que causam bugs ou resultados imprevisíveis |
| **Erro factual** | 5, 6, 7, 9 | Spec não corresponde ao código existente |
| **Ambíguo** | 3, 10, 11, 12, 14, 16, 17 | Precisa de decisão/clarificação |
| **Typo** | 4, 15 | Erros menores de texto |
