# Fix: Ecrã Preto — Error Boundary e Substitution

## Problema Atualizado
O ecrã fica **preto imediatamente** quando o utilizador pede uma substitution (minuto ~17), não apenas no intervalo. O error boundary adicionado não está a capturar o erro.

## Causas Identificadas
1. **Erro não capturado pelo error boundary** — O error boundary atual captura `window.addEventListener("error")` e `unhandledrejection`, mas pode não capturar erros React durante render
2. **matchActionRequired crash** — Quando o servidor emite `matchActionRequired` para substitution, o cliente tenta renderizar o painel de ação e algo crasha
3. **Error boundary pode crashar ele próprio** — Se `renderError?.stack` não é string válida, pode causar outro erro

## Soluções

### 1. Melhorar error boundary com melhor logging e fallback
**Ficheiro:** `client/src/App.jsx` (~linha 568-588)

Adicionar `console.error` antes de `setRenderError` para diagnosticar erros não capturados.

### 2. Tornar error boundary mais resistente a crashes
**Ficheiro:** `client/src/App.jsx` (~linha 2205-2222)

Adicionar try/catch na renderização do stack trace para evitar crash em cascata.

### 3. Adicionar try/catch adicional no handler matchActionRequired
**Ficheiro:** `client/src/hooks/useSocketListeners.js` (~linha 976-1091)

O handler já tem try/catch, mas pode precisar de mais guards para valores null/undefined.

## Ordem de Execução
1. Adicionar logging detalhado ao error boundary
2. Tornar error boundary mais resistente a crashes
3. Testar com simulação de jogo
4. Analisar logs do browser para identificar erro exato
5. Corrigir erro específico reportado

## Notas
- O utilizador confirma que o ecrã fica preto "imediatamente no pedido" de substitution
- O backend para de mostrar logs quando o utilizador pede substitution
- O timeout de 60 segundos no servidor deve continuar, mas o cliente crasha antes
