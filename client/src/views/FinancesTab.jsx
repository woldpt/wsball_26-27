import { socket } from "../socket.js";
import { formatCurrency } from "../utils/formatters.js";

/**
 * @param {{
 *   financeData: object|null,
 *   totalWeeklyWage: number,
 *   completedJornada: number,
 *   loanInterestPerWeek: number,
 *   loanAmount: number,
 *   currentBudget: number,
 *   seasonYear: number,
 *   capacityRevPerGame: number,
 *   mySquad: Array,
 *   showTransferSales: boolean,
 *   setShowTransferSales: function,
 *   showTransferPurchases: boolean,
 *   setShowTransferPurchases: function,
 *   setGameDialog: function,
 *   teamInfo: object,
 * }} props
 */
export function FinancesTab({
  financeData,
  totalWeeklyWage,
  completedJornada,
  loanInterestPerWeek,
  loanAmount,
  currentBudget,
  seasonYear,
  capacityRevPerGame,
  mySquad,
  showTransferSales,
  setShowTransferSales,
  showTransferPurchases,
  setShowTransferPurchases,
  setGameDialog,
  teamInfo,
}) {
  const totalSeasonIncome =
    (financeData?.totalTicketRevenue || 0) +
    (financeData?.sponsorRevenue || 0) +
    (financeData?.totalTransferIncome || 0);
  const totalSeasonExpenses =
    totalWeeklyWage * completedJornada +
    loanInterestPerWeek * completedJornada +
    (financeData?.totalTransferExpenses || 0) +
    (financeData?.totalStadiumExpenses || 0);
  const seasonResult =
    totalSeasonIncome - totalSeasonExpenses;
  const loanPct = Math.min(
    100,
    (loanAmount / 2500000) * 100,
  );
  const wageSharePct =
    totalSeasonIncome > 0
      ? Math.min(
          100,
          Math.round(
            ((totalWeeklyWage * completedJornada) /
              totalSeasonIncome) *
              100,
          ),
        )
      : 0;

  return (
    <div className="space-y-4">
      {/* ── HERO ──────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-0.5 bg-outline-variant/10 overflow-hidden rounded-xl">
        {/* Saldo Actual */}
        <div className="bg-surface-container p-6 flex flex-col justify-between relative overflow-hidden">
          <div className="absolute top-0 right-0 p-4 opacity-5 pointer-events-none select-none">
            <span className="material-symbols-outlined text-8xl">
              payments
            </span>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-widest text-on-surface-variant mb-1 font-label">
              Saldo Actual
            </p>
            <h2
              className={`font-headline text-4xl font-bold tracking-tighter ${currentBudget >= 0 ? "text-primary" : "text-error"}`}
            >
              {formatCurrency(currentBudget)}
            </h2>
          </div>
          <div className="mt-6 flex items-end gap-2">
            <div className="flex gap-1 h-8 items-end">
              <div className="w-1 bg-primary/20 h-2 rounded-t-sm" />
              <div className="w-1 bg-primary/40 h-4 rounded-t-sm" />
              <div className="w-1 bg-primary/60 h-3 rounded-t-sm" />
              <div className="w-1 bg-primary/80 h-6 rounded-t-sm" />
              <div className="w-1 bg-primary h-8 rounded-t-sm" />
            </div>
            <span className="text-[10px] text-primary font-bold font-label">
              época {seasonYear}
            </span>
          </div>
        </div>
        {/* Resultado da Época */}
        <div className="bg-surface-container p-6 flex flex-col justify-between">
          <div>
            <p className="text-[10px] uppercase tracking-widest text-on-surface-variant mb-1 font-label">
              Resultado da Época
            </p>
            <h2
              className={`font-headline text-4xl font-bold tracking-tighter ${seasonResult >= 0 ? "text-tertiary" : "text-error"}`}
            >
              {seasonResult >= 0 ? "+" : ""}
              {formatCurrency(seasonResult)}
            </h2>
          </div>
          <div className="mt-6 flex items-center gap-2">
            <span
              className={`material-symbols-outlined text-sm ${seasonResult >= 0 ? "text-tertiary" : "text-error"}`}
            >
              {seasonResult >= 0
                ? "trending_up"
                : "trending_down"}
            </span>
            <span className="text-[10px] text-on-surface-variant font-medium font-label uppercase">
              {completedJornada} / 14 jornadas concluídas
            </span>
          </div>
        </div>
        {/* Saldo previsto */}
        {(() => {
          const remainingJornadas = 14 - completedJornada;
          const remainingHomeMatches = Math.max(
            0,
            7 - (financeData?.homeMatchesPlayed || 0),
          );
          const avgTicketRevenue =
            (financeData?.homeMatchesPlayed || 0) > 0
              ? (financeData?.totalTicketRevenue || 0) /
                financeData.homeMatchesPlayed
              : capacityRevPerGame * 0.8;
          const projectedTicketRevenue =
            avgTicketRevenue * remainingHomeMatches;
          const projectedSalaries =
            totalWeeklyWage * remainingJornadas;

          const projectedEndBudget = Math.round(
            currentBudget +
              projectedTicketRevenue -
              projectedSalaries,
          );
          return (
            <div className="bg-surface-container p-6 flex flex-col justify-between relative overflow-hidden">
              <div className="absolute top-0 right-0 p-4 opacity-5 pointer-events-none select-none">
                <span className="material-symbols-outlined text-8xl">
                  savings
                </span>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-widest text-on-surface-variant mb-1 font-label">
                  Saldo previsto fim de época
                </p>
                <h2
                  className={`font-headline text-3xl font-bold tracking-tighter ${projectedEndBudget >= 0 ? "text-tertiary" : "text-error"}`}
                >
                  {projectedEndBudget >= 0 ? "+" : ""}
                  {formatCurrency(projectedEndBudget)}
                </h2>
              </div>
              <div className="mt-6">
                <p className="text-[10px] text-on-surface-variant uppercase mb-1">
                  Bilheteiras previstas - salários (
                  {remainingJornadas} jornadas)
                </p>
              </div>
            </div>
          );
        })()}
      </div>

      {/* ── RECEITAS / DESPESAS / CONTROLO ────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Receitas */}
        <div className="bg-surface-container-low rounded-lg p-5 flex flex-col space-y-3">
          <div className="flex justify-between items-center pb-2 border-b border-outline-variant/15">
            <h3 className="font-headline text-base uppercase tracking-tight flex items-center gap-2">
              <span className="material-symbols-outlined text-primary text-base">
                arrow_downward
              </span>
              Receitas
            </h3>
            <span className="font-headline text-primary font-bold text-sm">
              {formatCurrency(totalSeasonIncome)}
            </span>
          </div>
          <ul className="space-y-3">
            <li className="flex justify-between items-center">
              <div>
                <p className="text-sm text-on-surface-variant">
                  Bilheteiras
                </p>
                <p className="text-[10px] opacity-40 uppercase">
                  {financeData?.homeMatchesPlayed || 0}{" "}
                  jogos em casa
                </p>
              </div>
              <span className="font-headline text-sm font-bold">
                {formatCurrency(
                  financeData?.totalTicketRevenue || 0,
                )}
              </span>
            </li>
            <li className="flex justify-between items-center">
              <div>
                <p className="text-sm text-on-surface-variant">
                  Patrocinadores
                </p>
                <p className="text-[10px] opacity-40 uppercase">
                  Receita anual por divisão
                </p>
              </div>
              <span className="font-headline text-sm font-bold">
                {formatCurrency(
                  financeData?.sponsorRevenue || 0,
                )}
              </span>
            </li>
            {(financeData?.totalTransferIncome || 0) >
              0 && (
              <li className="space-y-1">
                <div
                  className="flex justify-between items-center cursor-pointer group"
                  onClick={() =>
                    setShowTransferSales((v) => !v)
                  }
                >
                  <div>
                    <p className="text-sm text-on-surface-variant group-hover:text-on-surface transition-colors">
                      Vendas de Jogadores
                    </p>
                    <p className="text-[10px] opacity-40 uppercase flex items-center gap-1">
                      <span
                        className="material-symbols-outlined"
                        style={{ fontSize: "10px" }}
                      >
                        {showTransferSales
                          ? "expand_less"
                          : "expand_more"}
                      </span>
                      {financeData.transferOutList
                        ?.length || 0}{" "}
                      transferência(s)
                    </p>
                  </div>
                  <span className="font-headline text-sm font-bold">
                    {formatCurrency(
                      financeData.totalTransferIncome,
                    )}
                  </span>
                </div>
                {showTransferSales &&
                  (financeData.transferOutList?.length ||
                    0) > 0 && (
                    <ul className="pl-3 space-y-1 border-l-2 border-primary/20 ml-1 mt-1">
                      {financeData.transferOutList.map(
                        (t, i) => (
                          <li
                            key={i}
                            className="flex justify-between items-center"
                          >
                            <div>
                              <p className="text-xs text-on-surface-variant/80">
                                {t.player_name || "Jogador"}
                                <span className="opacity-40 mx-1">
                                  →
                                </span>
                                {t.related_team_name || "—"}
                              </p>
                              {t.matchweek != null && (
                                <p className="text-[10px] opacity-30 uppercase">
                                  J{t.matchweek}
                                </p>
                              )}
                            </div>
                            <span className="text-xs font-bold">
                              {formatCurrency(t.amount)}
                            </span>
                          </li>
                        ),
                      )}
                    </ul>
                  )}
              </li>
            )}
          </ul>
        </div>

        {/* Despesas */}
        <div className="bg-surface-container-low rounded-lg p-5 flex flex-col space-y-3">
          <div className="flex justify-between items-center pb-2 border-b border-outline-variant/15">
            <h3 className="font-headline text-base uppercase tracking-tight flex items-center gap-2">
              <span className="material-symbols-outlined text-error text-base">
                arrow_upward
              </span>
              Despesas
            </h3>
            <span className="font-headline text-error font-bold text-sm">
              {formatCurrency(totalSeasonExpenses)}
            </span>
          </div>
          <ul className="space-y-3">
            <li className="flex justify-between items-center">
              <div>
                <p className="text-sm text-on-surface-variant">
                  Folha Salarial
                </p>
                <p className="text-[10px] opacity-40 uppercase">
                  {mySquad.length} atletas · pago por
                  jornada
                </p>
              </div>
              <span className="font-headline text-sm font-bold">
                {formatCurrency(
                  totalWeeklyWage * completedJornada,
                )}
              </span>
            </li>
            {loanAmount > 0 && (
              <li className="flex justify-between items-center">
                <div>
                  <p className="text-sm text-on-surface-variant">
                    Juros Bancários
                  </p>
                  <p className="text-[10px] opacity-40 uppercase">
                    2,5% da dívida / jornada
                  </p>
                </div>
                <span className="font-headline text-sm font-bold">
                  {formatCurrency(
                    loanInterestPerWeek * completedJornada,
                  )}
                </span>
              </li>
            )}
            {(financeData?.totalTransferExpenses || 0) >
              0 && (
              <li className="space-y-1">
                <div
                  className="flex justify-between items-center cursor-pointer group"
                  onClick={() =>
                    setShowTransferPurchases((v) => !v)
                  }
                >
                  <div>
                    <p className="text-sm text-on-surface-variant group-hover:text-on-surface transition-colors">
                      Compras de Jogadores
                    </p>
                    <p className="text-[10px] opacity-40 uppercase flex items-center gap-1">
                      <span
                        className="material-symbols-outlined"
                        style={{ fontSize: "10px" }}
                      >
                        {showTransferPurchases
                          ? "expand_less"
                          : "expand_more"}
                      </span>
                      {financeData.transferInList?.length ||
                        0}{" "}
                      transferência(s)
                    </p>
                  </div>
                  <span className="font-headline text-sm font-bold">
                    {formatCurrency(
                      financeData.totalTransferExpenses,
                    )}
                  </span>
                </div>
                {showTransferPurchases &&
                  (financeData.transferInList?.length ||
                    0) > 0 && (
                    <ul className="pl-3 space-y-1 border-l-2 border-error/20 ml-1 mt-1">
                      {financeData.transferInList.map(
                        (t, i) => (
                          <li
                            key={i}
                            className="flex justify-between items-center"
                          >
                            <div>
                              <p className="text-xs text-on-surface-variant/80">
                                {t.player_name || "Jogador"}
                                <span className="opacity-40 mx-1">
                                  ←
                                </span>
                                {t.related_team_name || "—"}
                              </p>
                              {t.matchweek != null && (
                                <p className="text-[10px] opacity-30 uppercase">
                                  J{t.matchweek}
                                </p>
                              )}
                            </div>
                            <span className="text-xs font-bold">
                              {formatCurrency(t.amount)}
                            </span>
                          </li>
                        ),
                      )}
                    </ul>
                  )}
              </li>
            )}
            {(financeData?.totalStadiumExpenses || 0) >
              0 && (
              <li className="flex justify-between items-center">
                <div>
                  <p className="text-sm text-on-surface-variant">
                    Obras no Estádio
                  </p>
                  <p className="text-[10px] opacity-40 uppercase">
                    300.000€ ×{" "}
                    {Math.round(
                      (financeData.totalStadiumExpenses ||
                        0) / 300000,
                    )}{" "}
                    obra(s)
                  </p>
                </div>
                <span className="font-headline text-sm font-bold">
                  {formatCurrency(
                    financeData.totalStadiumExpenses,
                  )}
                </span>
              </li>
            )}
          </ul>
        </div>

        {/* Centro de Controlo */}
        <div className="space-y-4">
          {/* Folha Salarial */}
          <div
            className={`bg-surface-container rounded-lg p-5 border-l-4 ${wageSharePct > 75 ? "border-error" : wageSharePct > 50 ? "border-tertiary" : "border-primary"} relative overflow-hidden`}
          >
            <div className="flex justify-between items-start mb-3">
              <div>
                <h3 className="font-headline text-xs uppercase tracking-widest text-on-surface-variant">
                  Folha Salarial
                </h3>
                <p className="font-headline text-xl font-bold mt-1">
                  {formatCurrency(totalWeeklyWage)}{" "}
                  <span className="text-xs font-normal opacity-50">
                    / jornada
                  </span>
                </p>
              </div>
              {wageSharePct > 75 && (
                <span
                  className="material-symbols-outlined text-error"
                  style={{
                    fontVariationSettings: "'FILL' 1",
                  }}
                >
                  warning
                </span>
              )}
            </div>
            <div className="space-y-1.5">
              <div className="flex justify-between text-[10px] font-bold uppercase tracking-wider">
                <span>% das receitas</span>
                <span
                  className={
                    wageSharePct > 75
                      ? "text-error"
                      : wageSharePct > 50
                        ? "text-tertiary"
                        : "text-primary"
                  }
                >
                  {wageSharePct}%
                </span>
              </div>
              <div className="h-2 w-full bg-surface-bright rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${wageSharePct > 75 ? "bg-error" : wageSharePct > 50 ? "bg-tertiary" : "bg-primary"}`}
                  style={{ width: `${wageSharePct}%` }}
                />
              </div>
              <div className="flex justify-between text-[10px] opacity-50 uppercase">
                <span>
                  {formatCurrency(totalWeeklyWage)}/jornada
                </span>
                <span>{mySquad.length} atletas</span>
              </div>
            </div>
          </div>

          {/* Dívida Bancária */}
          <div className="bg-surface-container rounded-lg p-5 border-t border-outline-variant/10">
            <h3 className="font-headline text-xs uppercase tracking-widest text-on-surface-variant mb-3">
              Empréstimos
            </h3>
            <div className="mb-4">
              <p className="text-[10px] opacity-50 uppercase mb-0.5">
                Dívida Actual
              </p>
              <p
                className={`font-headline text-2xl font-bold tracking-tight ${loanAmount > 0 ? "text-error" : "text-primary"}`}
              >
                {formatCurrency(loanAmount)}
              </p>
              {loanAmount > 0 && (
                <p className="text-[10px] text-error font-medium mt-0.5">
                  JUROS: 2,5% / JORNADA
                </p>
              )}
              <div className="mt-2 h-1.5 w-full bg-surface-bright rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${loanPct > 75 ? "bg-error" : loanPct > 40 ? "bg-tertiary" : "bg-amber-400"}`}
                  style={{ width: `${loanPct}%` }}
                />
              </div>
              <p className="text-[10px] opacity-40 text-right mt-0.5">
                {loanPct.toFixed(0)}% de 2.500.000€
              </p>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => socket.emit("payLoan")}
                disabled={
                  loanAmount < 500000 ||
                  currentBudget < 500000
                }
                className="bg-surface-container-high py-2 text-xs font-headline font-bold uppercase tracking-wider rounded hover:bg-surface-bright disabled:opacity-40 disabled:cursor-not-allowed transition-all"
              >
                Pagar -500K
              </button>
              <button
                onClick={() => {
                  setGameDialog({
                    mode: "confirm",
                    title: "Pedir Empréstimo de 500.000€",
                    description: `Juros semanais: ${formatCurrency(Math.round((loanAmount + 500000) * 0.025))}. Dívida total após: ${formatCurrency(loanAmount + 500000)}.`,
                    confirmLabel: "Confirmar Empréstimo",
                    danger: true,
                    onConfirm: () =>
                      socket.emit("takeLoan"),
                    onCancel: () => {},
                  });
                }}
                disabled={loanAmount >= 2500000}
                className="bg-surface-bright py-2 text-xs font-headline font-bold uppercase tracking-wider rounded hover:brightness-110 disabled:opacity-40 disabled:cursor-not-allowed transition-all border border-outline-variant/30"
              >
                Pedir +500K
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ── ESTÁDIO ───────────────────────────────────────────────────── */}
      <div className="bg-surface-container-low rounded-lg overflow-hidden">
        <div className="px-6 py-4 border-b border-outline-variant/10 flex justify-between items-center">
          <h3 className="font-headline text-xs uppercase tracking-widest flex items-center gap-2">
            <span className="material-symbols-outlined text-tertiary text-base">
              stadium
            </span>
            Expansão do Estádio
          </h3>
        </div>
        <div className="p-6">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6">
            <div className="bg-surface rounded-md border border-outline-variant/15 p-4 flex flex-col gap-1">
              <span className="text-on-surface-variant text-[10px] font-black uppercase tracking-wider">
                Capacidade Actual
              </span>
              <span className="text-on-surface font-headline font-bold text-2xl">
                {(
                  teamInfo?.stadium_capacity || 10000
                ).toLocaleString("pt-PT")}
              </span>
              <span className="text-on-surface-variant text-[10px]">
                lugares
              </span>
            </div>
            <div className="bg-surface rounded-md border border-outline-variant/15 p-4 flex flex-col gap-1">
              <span className="text-on-surface-variant text-[10px] font-black uppercase tracking-wider">
                Receita máx./jogo
              </span>
              <span className="text-primary font-headline font-bold text-xl">
                {formatCurrency(capacityRevPerGame)}
              </span>
              <span className="text-on-surface-variant text-[10px]">
                15€ × lotação
              </span>
            </div>
            <div className="bg-surface rounded-md border border-outline-variant/15 p-4 flex flex-col gap-1 col-span-2 md:col-span-1">
              <span className="text-on-surface-variant text-[10px] font-black uppercase tracking-wider">
                Custo de Expansão
              </span>
              <span className="text-tertiary font-headline font-bold text-xl">
                300.000€
              </span>
              <span className="text-on-surface-variant text-[10px]">
                +5.000 lugares por obra
              </span>
            </div>
          </div>
          <button
            onClick={() => {
              setGameDialog({
                mode: "confirm",
                title: "Expandir Estádio — 300.000€",
                description: `Aumenta a capacidade em 5.000 lugares. Receita máxima por jogo sobe ${formatCurrency(5000 * 15)}.`,
                confirmLabel: "Confirmar Expansão",
                onConfirm: () =>
                  socket.emit("buildStadium"),
                onCancel: () => {},
              });
            }}
            disabled={currentBudget < 300000}
            className="w-full bg-primary hover:brightness-110 disabled:opacity-40 disabled:cursor-not-allowed text-on-primary font-headline font-bold py-3 rounded text-sm transition-all uppercase tracking-wide"
          >
            Expandir Estádio — 300.000€
          </button>
          {currentBudget < 300000 && (
            <p className="text-on-surface-variant text-[10px] text-center mt-2 uppercase tracking-wider opacity-60">
              Saldo insuficiente · faltam{" "}
              {formatCurrency(300000 - currentBudget)}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
