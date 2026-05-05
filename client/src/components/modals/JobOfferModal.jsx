import { socket } from "../../socket.js";
import { DIVISION_NAMES, POSITION_LABEL_MAP } from "../../constants/index.js";
// eslint-disable-next-line no-unused-vars
import { motion, AnimatePresence } from "framer-motion";

const POSITION_COLORS = {
  GR: "text-yellow-400",
  DEF: "text-blue-400",
  MED: "text-green-400",
  ATA: "text-rose-400",
};

const POSITION_BG_COLORS = {
  GR: "bg-yellow-500/20 border-yellow-500/40",
  DEF: "bg-blue-500/20 border-blue-500/40",
  MED: "bg-green-500/20 border-green-500/40",
  ATA: "bg-rose-500/20 border-rose-500/40",
};

/**
 * @param {{ jobOfferModal: object, setJobOfferModal: function }} props
 */
export function JobOfferModal({ jobOfferModal, setJobOfferModal }) {
  if (!jobOfferModal) return null;

  const to = jobOfferModal.toTeam;
  const gd = (to.goals_for ?? 0) - (to.goals_against ?? 0);
  const squad = jobOfferModal.toTeamSquad ?? [];

  return (
    <AnimatePresence>
      <motion.div
        key="joboffer-backdrop"
        className="fixed inset-0 z-200 bg-zinc-950/90 backdrop-blur-sm flex items-center justify-center p-4"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.18 }}
      >
        <motion.div
          className="w-full max-w-sm bg-surface-container border border-amber-500/40 rounded-lg shadow-2xl p-0 text-center overflow-hidden"
          initial={{ scale: 0.88, y: 32 }}
          animate={{ scale: 1, y: 0 }}
          exit={{ scale: 0.88, y: 32 }}
          transition={{ type: "spring", stiffness: 380, damping: 26 }}
        >
          {/* Header */}
          <div className="px-5 py-4 border-b border-zinc-700/50">
            <p className="text-amber-400 text-[10px] uppercase font-black tracking-widest mb-1">
              Convite de Clube
            </p>
            <h2 className="text-xl font-black text-white">{to.name}</h2>
            <p className="text-zinc-400 text-xs font-bold">
              {DIVISION_NAMES[to.division] ?? `Divisão ${to.division}`}
            </p>
          </div>

          {/* Classification */}
          <div className="px-5 py-3 border-b border-zinc-700/50">
            <div className="flex items-center justify-center gap-4 text-sm">
              <div className="text-center">
                <p className="text-zinc-500 text-[10px] uppercase font-black">Pos</p>
                <p className="text-white font-black text-lg leading-none">
                  {jobOfferModal.toTeamDivisionPosition}
                </p>
              </div>
              <div className="w-px h-8 bg-zinc-700" />
              <div className="text-center">
                <p className="text-zinc-500 text-[10px] uppercase font-black">Pts</p>
                <p className="text-white font-black text-lg leading-none">
                  {to.points ?? "?"}
                </p>
              </div>
              <div className="w-px h-8 bg-zinc-700" />
              <div className="text-center">
                <p className="text-zinc-500 text-[10px] uppercase font-black">Dif</p>
                <p className={`font-black text-lg leading-none ${gd > 0 ? "text-green-400" : gd < 0 ? "text-rose-400" : "text-zinc-400"}`}>
                  {gd > 0 ? `+${gd}` : gd}
                </p>
              </div>
            </div>
            <p className="text-zinc-500 text-[10px] mt-1.5">
              {to.wins ?? 0}V {to.draws ?? 0}E {to.losses ?? 0}D — GF:{to.goals_for ?? 0} GA:{to.goals_against ?? 0}
            </p>
          </div>

          {/* Squad */}
          <div className="px-5 py-3 border-b border-zinc-700/50">
            <p className="text-[10px] text-zinc-500 uppercase font-black tracking-widest mb-2">
              Plantel ({squad.length} jogadores)
            </p>
            <div className="max-h-40 overflow-y-auto space-y-0.5 pr-1 scrollbar-thin">
              {squad.length === 0 ? (
                <p className="text-zinc-600 text-xs py-2">Sem jogadores no plantel.</p>
              ) : (
                squad.map((player) => (
                  <div
                    key={player.id}
                    className="flex items-center justify-between px-2 py-1 rounded hover:bg-zinc-800/60 text-xs"
                  >
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className={`inline-block px-1.5 py-0.5 rounded text-[9px] font-black border ${POSITION_BG_COLORS[player.position] || "bg-zinc-500/20 border-zinc-500/40"} ${POSITION_COLORS[player.position] || "text-zinc-400"}`}>
                        {POSITION_LABEL_MAP[player.position] ?? player.position}
                      </span>
                      <span className="text-white font-bold truncate">
                        {player.name}
                      </span>
                      {player.is_star && (
                        <span className="text-amber-400 font-black text-[9px]" title="Craque">*</span>
                      )}
                    </div>
                    <span className="text-zinc-400 font-black text-[11px] shrink-0 ml-2">
                      {player.skill}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Footer */}
          <div className="px-5 py-4 border-t border-zinc-700/50">
            <div className="flex gap-3 justify-center">
              <button
                onClick={() => {
                  socket.emit("acceptJobOffer");
                  setJobOfferModal(null);
                }}
                className="bg-amber-500 hover:bg-amber-400 text-black font-bold px-5 py-2 rounded-lg transition-colors"
              >
                Aceitar
              </button>
              <button
                onClick={() => {
                  socket.emit("declineJobOffer");
                  setJobOfferModal(null);
                }}
                className="bg-zinc-700 hover:bg-zinc-600 text-white px-5 py-2 rounded-lg transition-colors"
              >
                Recusar
              </button>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
