// eslint-disable-next-line no-unused-vars
import { motion, AnimatePresence } from "framer-motion";
/**
 * @param {{ refereePopup: object|null, closeRefereePopup: function, teamInfo: object|null, nextMatchOpponent: object|null }} props
 */
export function RefereePopup({
  refereePopup,
  closeRefereePopup,
  teamInfo,
  nextMatchOpponent,
}) {
  return (
    <AnimatePresence>
      {refereePopup && (
        <motion.div
          key="referee-backdrop"
          className="fixed inset-0 z-130 bg-zinc-950/80 backdrop-blur-sm flex items-center justify-center p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          onClick={closeRefereePopup}
        >
          <motion.div
            className="w-full max-w-md rounded-lg border border-outline-variant/20 bg-surface-container shadow-2xl overflow-hidden"
            initial={{ scale: 0.92, y: 20 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.92, y: 20 }}
            transition={{ type: "spring", stiffness: 350, damping: 28 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-5 border-b border-zinc-800 bg-zinc-950/50">
              <p className="text-[10px] uppercase tracking-widest text-zinc-500 font-black mb-2">
                Árbitro
              </p>
              <h3 className="text-2xl font-black text-white">
                {refereePopup.name}
              </h3>
            </div>
            <div className="p-5 space-y-4">
              <div className="flex items-center justify-between text-xs uppercase tracking-widest font-black text-zinc-500">
                <span>{teamInfo?.name || "Equipa A"}</span>
                <span>{nextMatchOpponent?.name || "Equipa B"}</span>
              </div>
              <div className="relative h-4 rounded-full bg-zinc-950 border border-zinc-800 overflow-hidden">
                <div
                  className="absolute inset-y-0 left-0 opacity-85"
                  style={{
                    width: `${refereePopup.balance}%`,
                    background: teamInfo?.color_primary || "#16a34a",
                  }}
                />
                <div
                  className="absolute inset-y-0 right-0 opacity-85"
                  style={{
                    width: `${100 - refereePopup.balance}%`,
                    background: nextMatchOpponent?.color_primary || "#dc2626",
                  }}
                />
                <div className="absolute left-1/2 top-0 bottom-0 w-px bg-white/40" />
                <div
                  className="absolute -top-2 h-8 w-1 rounded-full bg-amber-400 shadow-[0_0_0_4px_rgba(251,191,36,0.18)]"
                  style={{ left: `calc(${refereePopup.balance}% - 2px)` }}
                />
              </div>
              <div className="flex items-center justify-between text-sm font-black">
                <span
                  style={{
                    color:
                      refereePopup.balance >= 50
                        ? teamInfo?.color_primary || "#16a34a"
                        : nextMatchOpponent?.color_primary || "#dc2626",
                  }}
                >
                  {refereePopup.balance >= 50
                    ? `${teamInfo?.name || "Equipa A"} ganha vantagem`
                    : `${nextMatchOpponent?.name || "Equipa B"} ganha vantagem`}
                </span>
                <span className="text-zinc-400">{refereePopup.balance}%</span>
              </div>
              <p className="text-sm text-zinc-400 leading-relaxed">
                A balança mostra para que lado este árbitro tende a inclinar a
                partida. Valores acima de 50 favorecem a tua equipa; abaixo de
                50 favorecem o adversário. Isso pode mexer nos cartões e nos
                penaltis assinalados.
              </p>
              <button
                type="button"
                onClick={closeRefereePopup}
                className="w-full rounded-sm bg-primary px-4 py-3 font-black uppercase tracking-widest text-on-primary"
              >
                Fechar
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
