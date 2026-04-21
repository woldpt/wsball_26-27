// eslint-disable-next-line no-unused-vars
import { motion, AnimatePresence } from "framer-motion";
import { DIVISION_NAMES } from "../../constants/index.js";
import { formatCurrency } from "../../utils/formatters.js";
import {
  markWelcomeSeen,
  markWelcomeSeenThisSession,
} from "../../utils/localStorage.js";

/**
 * @param {{ welcomeModal: object, me: object, setWelcomeModal: function }} props
 */
export function WelcomeModal({ welcomeModal, me, setWelcomeModal }) {
  return (
    <AnimatePresence>
      {welcomeModal && me?.teamId && (
        <motion.div
          key="welcome-backdrop"
          className="fixed inset-0 z-200 flex items-center justify-center p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.22 }}
          style={{
            background:
              "radial-gradient(ellipse at center, rgba(45,106,79,0.18) 0%, rgba(10,10,10,0.97) 70%)",
            backdropFilter: "blur(8px)",
          }}
        >
          {/* Technical grid overlay */}
          <div
            className="absolute inset-0 pointer-events-none opacity-30"
            style={{
              backgroundImage:
                "radial-gradient(circle at 2px 2px, rgba(45,106,79,0.25) 1px, transparent 0)",
              backgroundSize: "24px 24px",
            }}
          />

          {/* Modal card — two-column layout */}
          <motion.div
            className="relative w-full max-w-2xl bg-zinc-900/90 border border-emerald-900/40 rounded-xl shadow-2xl overflow-hidden flex flex-col sm:flex-row"
            initial={{ scale: 0.93, y: 24 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.93, y: 24 }}
            transition={{ type: "spring", stiffness: 320, damping: 28 }}
          >
            {/* ── Left column: team identity ── */}
            <div
              className="sm:w-2/5 flex flex-col items-center justify-center gap-4 p-8 border-b sm:border-b-0 sm:border-r border-emerald-900/30"
              style={{
                background: welcomeModal.colorPrimary
                  ? `linear-gradient(160deg, ${welcomeModal.colorPrimary}22 0%, rgba(10,10,10,0.6) 100%)`
                  : "linear-gradient(160deg, rgba(45,106,79,0.15) 0%, rgba(10,10,10,0.6) 100%)",
              }}
            >
              {/* Colour swatch / crest placeholder */}
              <div className="relative flex items-center justify-center">
                <div
                  className="absolute w-28 h-28 rounded-full blur-3xl opacity-30"
                  style={{
                    backgroundColor: welcomeModal.colorPrimary || "#2d6a4f",
                  }}
                />
                <div
                  className="relative w-20 h-20 rounded-lg border-2 border-white/20 shadow-xl flex items-center justify-center text-4xl"
                  style={{
                    backgroundColor: welcomeModal.colorPrimary || "#2d6a4f",
                  }}
                >
                  ⚽
                </div>
              </div>

              {/* Team name */}
              <div className="text-center">
                <h2 className="font-black text-2xl text-white tracking-tight leading-tight uppercase">
                  {welcomeModal.teamName}
                </h2>
                {welcomeModal.division != null && (
                  <span
                    className="inline-block mt-2 px-3 py-1 rounded border text-[10px] font-black tracking-widest uppercase"
                    style={{
                      borderColor:
                        (welcomeModal.colorPrimary || "#2d6a4f") + "60",
                      color: welcomeModal.colorPrimary || "#95d4b3",
                      backgroundColor:
                        (welcomeModal.colorPrimary || "#2d6a4f") + "18",
                    }}
                  >
                    {DIVISION_NAMES[welcomeModal.division] ||
                      `Divisão ${welcomeModal.division}`}
                  </span>
                )}
              </div>
            </div>

            {/* ── Right column: content ── */}
            <div className="sm:w-3/5 flex flex-col justify-center p-8">
              {/* Eyebrow tag */}
              <p
                className={`text-[10px] font-black uppercase tracking-widest mb-2 ${welcomeModal.isNew ? "text-amber-400" : "text-emerald-400"}`}
              >
                {welcomeModal.isNew ? "🎲 Sorteio" : "👋 Bem-vindo de volta"}
              </p>

              {/* Headline */}
              <h1 className="font-black text-3xl sm:text-4xl text-white leading-tight tracking-tight mb-3">
                {welcomeModal.isNew ? (
                  <>
                    A TUA JORNADA
                    <br />
                    <span className="text-emerald-400">COMEÇA AGORA</span>
                  </>
                ) : (
                  <>
                    CONTINUA
                    <br />
                    <span className="text-emerald-400">A MISSÃO</span>
                  </>
                )}
              </h1>

              <p className="text-zinc-400 text-sm mb-6 leading-relaxed">
                {welcomeModal.isNew
                  ? `Foste sorteado para liderar o ${welcomeModal.teamName}. O sucesso do clube está nas tuas mãos.`
                  : `Retoma o comando do ${welcomeModal.teamName} e continua a lutar por mais.`}
              </p>

              {/* Bento stats grid */}
              {welcomeModal.isNew ? (
                <div className="grid grid-cols-2 gap-3 mb-6">
                  <div className="bg-zinc-800/60 rounded-lg p-3 border border-emerald-900/20 hover:border-emerald-500/30 transition-colors">
                    <p className="text-[10px] uppercase font-bold text-zinc-500 tracking-wider mb-1">
                      Orçamento Inicial
                    </p>
                    <p className="text-white font-black text-base">
                      {formatCurrency(welcomeModal.budget ?? 0)}
                    </p>
                  </div>
                  {welcomeModal.stadiumCapacity > 0 && (
                    <div className="bg-zinc-800/60 rounded-lg p-3 border border-emerald-900/20 hover:border-emerald-500/30 transition-colors">
                      <p className="text-[10px] uppercase font-bold text-zinc-500 tracking-wider mb-1">
                        Estádio
                      </p>
                      <p className="text-white font-black text-base">
                        {(welcomeModal.stadiumCapacity ?? 0).toLocaleString(
                          "pt-PT",
                        )}{" "}
                        lug.
                      </p>
                    </div>
                  )}
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3 mb-6">
                  <div className="bg-zinc-800/60 rounded-lg p-3 border border-emerald-900/20 hover:border-emerald-500/30 transition-colors">
                    <p className="text-[10px] uppercase font-bold text-zinc-500 tracking-wider mb-1">
                      Pontos
                    </p>
                    <p className="text-white font-black text-base">
                      {welcomeModal.points ?? 0} pts
                    </p>
                  </div>
                  <div className="bg-zinc-800/60 rounded-lg p-3 border border-emerald-900/20 hover:border-emerald-500/30 transition-colors">
                    <p className="text-[10px] uppercase font-bold text-zinc-500 tracking-wider mb-1">
                      V / E / D
                    </p>
                    <p className="text-white font-black text-base">
                      {welcomeModal.wins ?? 0} / {welcomeModal.draws ?? 0} /{" "}
                      {welcomeModal.losses ?? 0}
                    </p>
                  </div>
                  <div className="bg-zinc-800/60 rounded-lg p-3 border border-emerald-900/20 hover:border-emerald-500/30 transition-colors">
                    <p className="text-[10px] uppercase font-bold text-zinc-500 tracking-wider mb-1">
                      Golos
                    </p>
                    <p className="text-white font-black text-base">
                      {welcomeModal.goalsFor ?? 0} –{" "}
                      {welcomeModal.goalsAgainst ?? 0}
                    </p>
                  </div>
                  <div className="bg-zinc-800/60 rounded-lg p-3 border border-emerald-900/20 hover:border-emerald-500/30 transition-colors">
                    <p className="text-[10px] uppercase font-bold text-zinc-500 tracking-wider mb-1">
                      Orçamento
                    </p>
                    <p className="text-white font-black text-base">
                      {formatCurrency(welcomeModal.budget ?? 0)}
                    </p>
                  </div>
                </div>
              )}

              {/* Action button */}
              <button
                onClick={() => {
                  if (welcomeModal.isNew) {
                    markWelcomeSeen(me.name, me.roomCode);
                  } else {
                    markWelcomeSeenThisSession(me.name, me.roomCode);
                  }
                  setWelcomeModal(null);
                }}
                className="w-full font-black py-4 rounded-lg text-sm uppercase tracking-widest transition-all active:scale-95 hover:-translate-y-px shadow-lg"
                style={{
                  backgroundColor: welcomeModal.colorPrimary || "#95d4b3",
                  color: welcomeModal.colorSecondary || "#003824",
                  boxShadow: `0 8px 24px ${welcomeModal.colorPrimary || "#95d4b3"}30`,
                }}
              >
                {welcomeModal.isNew ? "Vamos lá! 🚀" : "Continuar 🎯"}
              </button>

              {/* Footer microcopy */}
              <div className="mt-5 pt-4 border-t border-emerald-900/20 flex justify-between text-[9px] text-zinc-600 font-bold uppercase tracking-widest">
                <span>{me.name}</span>
                <span>{me.roomCode}</span>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
