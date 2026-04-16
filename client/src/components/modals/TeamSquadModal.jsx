import { socket } from "../../socket.js";
import { AggBadge } from "../shared/AggBadge.jsx";
import { PlayerLink } from "../shared/PlayerLink.jsx";
import { formatCurrency } from "../../utils/formatters.js";
import {
  FLAG_TO_COUNTRY,
  DIVISION_NAMES,
  ENABLE_ROW_BG,
  POSITION_TEXT_CLASS,
  POSITION_BG_CLASS,
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
}) {
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
                      <th className="px-4 py-3 font-black text-center">Qual</th>
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
                          <td
                            className={`px-4 py-2.5 font-black text-sm tracking-wider ${POSITION_TEXT_CLASS[player.position] || "text-zinc-300"}`}
                          >
                            {player.position}
                          </td>
                          <td className="px-4 py-2.5 font-bold text-white">
                            <PlayerLink playerId={player.id}>
                              {player.name}
                            </PlayerLink>
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
                            <span className="bg-zinc-950 text-white font-black px-2 py-1.5 rounded text-sm border border-zinc-800">
                              {player.skill}
                            </span>
                            {player.prev_skill !== null &&
                              player.prev_skill !== undefined &&
                              player.prev_skill !== player.skill && (
                                <span
                                  className={`ml-1 text-xs font-black ${player.skill > player.prev_skill ? "text-emerald-400" : "text-red-400"}`}
                                >
                                  {player.skill > player.prev_skill ? "▲" : "▼"}
                                </span>
                              )}
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
