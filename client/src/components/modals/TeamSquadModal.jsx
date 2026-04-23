import { AggBadge } from "../shared/AggBadge.jsx";
import { PlayerLink } from "../shared/PlayerLink.jsx";
import {
  FLAG_TO_COUNTRY,
  DIVISION_NAMES,
  ENABLE_ROW_BG,
  POSITION_TEXT_CLASS,
  POSITION_BG_CLASS,
  POSITION_BORDER_CLASS,
  POSITION_LABEL_MAP,
} from "../../constants/index.js";
import { getPlayerStat } from "../../utils/playerHelpers.js";
import { isSameTeamId } from "../../utils/teamHelpers.js";
// eslint-disable-next-line no-unused-vars
import { motion, AnimatePresence } from "framer-motion";

/**
 * @param {{
 *   selectedTeam: object|null,
 *   selectedTeamSquad: Array,
 *   selectedTeamLoading: boolean,
 *   me: object|null,
 *   players: Array,
 *   palmares: object,
 *   palmaresTeamId: number|null,
 *   handleCloseTeamSquad: function,
 *   setTransferProposalModal: function,
 *   myBudget: number,
 * }} props
 */
export function TeamSquadModal({
  selectedTeam,
  selectedTeamSquad,
  selectedTeamLoading,
  me,
  players,
  palmares,
  palmaresTeamId,
  handleCloseTeamSquad,
  setTransferProposalModal,
  myBudget = 0,
}) {
  const getPrimaryAttr = (player) => {
    if (!player) return 0;
    if (player.position === "GR") return player.gk ?? player.skill ?? 0;
    if (player.position === "DEF") return player.defesa ?? player.skill ?? 0;
    if (player.position === "MED") return player.passe ?? player.skill ?? 0;
    return player.finalizacao ?? player.skill ?? 0;
  };
  const getAttrTooltipContent = (player) => {
    const pos = player?.position;
    const attrs = [
      {
        key: "gk",
        label: "GR",
        value: Number(player?.gk ?? player?.skill ?? 1),
        color: "#eab308",
        hi: pos === "GR",
      },
      {
        key: "def",
        label: "DEF",
        value: Number(player?.defesa ?? player?.skill ?? 1),
        color: "#3b82f6",
        hi: pos === "DEF",
      },
      {
        key: "pas",
        label: "MED",
        value: Number(player?.passe ?? player?.skill ?? 1),
        color: "#10b981",
        hi: pos === "MED",
      },
      {
        key: "fin",
        label: "ATA",
        value: Number(player?.finalizacao ?? player?.skill ?? 1),
        color: "#f43f5e",
        hi: pos === "ATA",
      },
      {
        key: "frm",
        label: "Frm",
        value: Number(player?.form ?? 50),
        color: "#a1a1aa",
        hi: false,
      },
      {
        key: "res",
        label: "Res",
        value: Number(player?.resistencia ?? 50),
        color: "#a1a1aa",
        hi: false,
      },
    ];
    return attrs;
  };
  const isOwnTeam = isSameTeamId(selectedTeam?.id, me?.teamId);
  const isNpcTeam =
    !isOwnTeam &&
    !players.some((p) => isSameTeamId(p.teamId, selectedTeam?.id));
  const showProposalCol = isNpcTeam;
  const colCount = showProposalCol ? 10 : 9;

  return (
    <AnimatePresence>
      {selectedTeam && (
        <motion.div
          key="teamsquad-backdrop"
          className="fixed inset-0 z-120 bg-zinc-950/85 backdrop-blur-sm p-4 md:p-8 flex items-center justify-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          onClick={handleCloseTeamSquad}
        >
          <motion.div
            className="w-full max-w-5xl max-h-[90vh] overflow-hidden bg-surface-container border border-outline-variant/20 rounded-lg shadow-2xl flex flex-col"
            initial={{ scale: 0.95, y: 28 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.95, y: 28 }}
            transition={{ type: "spring", stiffness: 300, damping: 28 }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div
              className="px-5 py-4 border-b border-zinc-800 flex items-start justify-between gap-4"
              style={{ background: selectedTeam.color_primary || "#18181b" }}
            >
              <div>
                <p
                  className="text-xs uppercase tracking-widest font-black"
                  style={{ color: selectedTeam.color_secondary || "#ffffff" }}
                >
                  Plantel
                </p>
                <h3
                  className="text-2xl md:text-3xl font-black"
                  style={{ color: selectedTeam.color_secondary || "#ffffff" }}
                >
                  {selectedTeam.name}
                </h3>
                <p
                  className="text-sm font-bold"
                  style={{ color: selectedTeam.color_secondary || "#ffffff" }}
                >
                  {DIVISION_NAMES[selectedTeam.division] ||
                    `Divisão ${selectedTeam.division}`}
                </p>
              </div>
              <button
                onClick={handleCloseTeamSquad}
                className="shrink-0 px-4 py-2 rounded bg-surface-container/40 font-black uppercase text-sm border border-outline-variant/20 hover:bg-surface-container"
                style={{
                  color: selectedTeam.color_secondary || "#ffffff",
                  borderColor: selectedTeam.color_secondary || "#ffffff",
                }}
              >
                Fechar
              </button>
            </div>

            {/* Palmarés */}
            {palmaresTeamId === selectedTeam?.id &&
              palmares.trophies?.length > 0 && (
                <div className="border-t border-zinc-800 px-6 py-4">
                  <h4 className="text-xs text-amber-400 font-black uppercase tracking-widest mb-3 flex items-center gap-2">
                    🏆 Palmarés
                  </h4>
                  <div className="flex flex-wrap gap-2">
                    {palmares.trophies.map((trophy, idx) => (
                      <span
                        key={idx}
                        className="px-3 py-1 rounded-full bg-amber-900/30 border border-amber-700/40 text-amber-300 text-xs font-black"
                      >
                        🏆 {trophy.achievement} ({trophy.season})
                      </span>
                    ))}
                  </div>
                </div>
              )}

            <div className="overflow-auto">
              {selectedTeamLoading ? (
                <div className="p-8 text-center text-zinc-400 font-bold">
                  A carregar plantel...
                </div>
              ) : (
                <table className="w-full min-w-170 text-left text-sm border-collapse">
                  <thead className="sticky top-0 bg-surface text-on-surface-variant uppercase text-[11px] tracking-widest border-b border-outline-variant/20">
                    <tr>
                      <th className="px-4 py-3 font-black">Pos</th>
                      <th className="px-4 py-3 font-black">Nome</th>
                      <th className="px-4 py-3 font-black text-center">Nac.</th>
                      <th className="px-4 py-3 font-black text-center">
                        Atributo
                      </th>
                      <th className="px-4 py-3 font-black text-center">Agr.</th>
                      <th className="px-4 py-3 font-black text-center">
                        Golos
                      </th>
                      <th className="px-4 py-3 font-black text-center">
                        Vermelhos
                      </th>
                      <th className="px-4 py-3 font-black text-center">
                        Lesões
                      </th>
                      <th className="px-4 py-3 font-black text-center">
                        Susp.
                      </th>
                      {showProposalCol && (
                        <th className="px-4 py-3 font-black text-center">
                          Proposta
                        </th>
                      )}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800/60">
                    {selectedTeamSquad.length === 0 ? (
                      <tr>
                        <td
                          colSpan={colCount}
                          className="px-4 py-8 text-center text-zinc-500 font-bold"
                        >
                          Sem jogadores encontrados.
                        </td>
                      </tr>
                    ) : (
                      selectedTeamSquad.map((player) => (
                        <tr
                          key={player.id}
                          className={`hover:bg-zinc-800/50 transition-colors ${ENABLE_ROW_BG ? POSITION_BG_CLASS[player.position] : ""}`}
                        >
                          <td className="px-4 py-2.5 text-center">
                            <span
                              className={`px-2 py-0.5 bg-surface-bright rounded-sm text-[10px] font-black border-l-2 ${POSITION_BORDER_CLASS[player.position] || "border-zinc-500"} ${POSITION_TEXT_CLASS[player.position] || "text-zinc-300"}`}
                            >
                              {POSITION_LABEL_MAP[player.position] ||
                                player.position}
                            </span>
                          </td>
                          <td className="px-4 py-2.5 font-bold text-white">
                            <PlayerLink playerId={player.id}>
                              {player.name}
                            </PlayerLink>
                            {player.isJunior && (
                              <span className="ml-1 text-[9px] font-black uppercase px-1 py-0.5 rounded bg-indigo-500/20 text-indigo-400 border border-indigo-500/30">
                                🎓
                              </span>
                            )}
                            {!!player.is_star &&
                              (player.position === "MED" ||
                                player.position === "ATA") && (
                                <span
                                  className="ml-1 text-amber-400 font-black"
                                  title="Craque"
                                >
                                  *
                                </span>
                              )}
                          </td>
                          <td
                            className="px-4 py-2.5 text-center text-lg"
                            title={
                              FLAG_TO_COUNTRY[player.nationality] ||
                              player.nationality ||
                              "—"
                            }
                          >
                            {player.nationality || "—"}
                          </td>
                          <td className="px-4 py-2.5 text-center">
                            <span className="relative group/attr inline-flex items-center cursor-default">
                              <span className="bg-zinc-950 text-white font-black px-2 py-1.5 rounded text-sm border border-zinc-800">
                                {getPrimaryAttr(player)}
                              </span>
                              {player.prev_skill !== null &&
                                player.prev_skill !== undefined &&
                                player.prev_skill !==
                                  getPrimaryAttr(player) && (
                                  <span
                                    className={`ml-1 text-xs font-black ${getPrimaryAttr(player) > player.prev_skill ? "text-emerald-400" : "text-red-400"}`}
                                  >
                                    {getPrimaryAttr(player) > player.prev_skill
                                      ? "▲"
                                      : "▼"}
                                  </span>
                                )}
                              <span
                                className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 z-60 hidden group-hover/attr:grid grid-cols-2 gap-x-3 gap-y-1 rounded-md px-2.5 py-2 shadow-xl"
                                style={{
                                  background: "#13131f",
                                  border: "1px solid #26263a",
                                  minWidth: "7.5rem",
                                }}
                              >
                                {getAttrTooltipContent(player).map(
                                  ({ key, label, value, color, hi }) => (
                                    <div
                                      key={key}
                                      className="flex items-center justify-between gap-1"
                                    >
                                      <span
                                        className="text-[9px] font-black uppercase leading-none"
                                        style={{
                                          color: hi ? color : "#52525b",
                                        }}
                                      >
                                        {label}
                                      </span>
                                      <span
                                        className="text-[11px] tabular-nums leading-none"
                                        style={{
                                          color: hi ? color : "#a1a1aa",
                                          fontWeight: hi ? 900 : 600,
                                        }}
                                      >
                                        {value}
                                      </span>
                                    </div>
                                  ),
                                )}
                              </span>
                            </span>
                          </td>
                          <td className="px-4 py-2.5 text-center">
                            <AggBadge value={player.aggressiveness} />
                          </td>
                          <td className="px-4 py-2.5 text-center font-black text-emerald-400">
                            {getPlayerStat(player, ["goals"])}{" "}
                            <span className="text-zinc-500 text-xs font-normal">
                              ({getPlayerStat(player, ["career_goals"])})
                            </span>
                          </td>
                          <td className="px-4 py-2.5 text-center font-black text-red-400">
                            {getPlayerStat(player, ["red_cards"])}{" "}
                            <span className="text-zinc-500 text-xs font-normal">
                              ({getPlayerStat(player, ["career_reds"])})
                            </span>
                          </td>
                          <td className="px-4 py-2.5 text-center font-black text-orange-400">
                            {getPlayerStat(player, ["injuries"])}{" "}
                            <span className="text-zinc-500 text-xs font-normal">
                              ({getPlayerStat(player, ["career_injuries"])})
                            </span>
                          </td>
                          <td className="px-4 py-2.5 text-center font-black text-amber-400">
                            {getPlayerStat(player, ["suspension_games"])}
                          </td>
                          {showProposalCol && (
                            <td className="px-4 py-2.5 text-center">
                              {!player.isJunior &&
                              Math.round((player.value || 0) * 1.35) <=
                                myBudget ? (
                                <button
                                  onClick={() =>
                                    setTransferProposalModal({
                                      player,
                                      suggestedPrice: Math.round(
                                        (player.value || 0) * 1.35,
                                      ),
                                    })
                                  }
                                  className="px-3 py-1.5 rounded text-xs font-black uppercase bg-emerald-700 hover:bg-emerald-600 text-white border border-emerald-500 transition-colors whitespace-nowrap"
                                >
                                  Proposta
                                </button>
                              ) : (
                                <span className="text-[10px] text-zinc-600 font-bold uppercase">
                                  Sem saldo
                                </span>
                              )}
                            </td>
                          )}
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
