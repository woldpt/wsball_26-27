import { socket } from "../../socket.js";
import { formatCurrency } from "../../utils/formatters.js";
import { FLAG_TO_COUNTRY, POSITION_TEXT_CLASS } from "../../constants/index.js";
// eslint-disable-next-line no-unused-vars
import { motion, AnimatePresence } from "framer-motion";

/**
 * @param {{
 *   transferProposalModal: { player: object, suggestedPrice: number }|null,
 *   setTransferProposalModal: function,
 * }} props
 */
export function TransferProposalModal({
  transferProposalModal,
  setTransferProposalModal,
}) {
  const player = transferProposalModal?.player;
  const suggestedPrice = transferProposalModal?.suggestedPrice;

  return (
    <AnimatePresence>
      {transferProposalModal && (
        <motion.div
          key="transfer-backdrop"
          className="fixed inset-0 z-130 bg-zinc-950/90 backdrop-blur-sm p-4 md:p-8 flex items-center justify-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          onClick={() => setTransferProposalModal(null)}
        >
          <motion.div
            className="w-full max-w-md bg-surface-container border border-outline-variant/20 rounded-2xl shadow-2xl overflow-hidden"
            initial={{ scale: 0.93, y: 20 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.93, y: 20 }}
            transition={{ type: "spring", stiffness: 340, damping: 28 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 py-4 border-b border-zinc-800 bg-emerald-900/40">
              <p className="text-xs uppercase tracking-widest font-black text-emerald-400 mb-1">
                Proposta de Transferência
              </p>
              <h3 className="text-xl font-black text-white">
                {player.nationality && (
                  <span className="mr-2">{player.nationality}</span>
                )}
                {player.name}
              </h3>
              <p className="text-sm text-zinc-400 mt-0.5">
                <span
                  className={`font-black ${POSITION_TEXT_CLASS[player.position] || "text-zinc-300"}`}
                >
                  {player.position}
                </span>
                {" · "}
                <span className="font-black text-white">
                  Qualidade {player.skill}
                </span>
                {" · "}
                <span className="text-zinc-400">
                  {FLAG_TO_COUNTRY[player.nationality] || ""}
                </span>
              </p>
            </div>
            <div className="px-5 py-5 space-y-4">
              <div className="bg-zinc-900 rounded-lg p-4 space-y-2 text-sm">
                <div className="flex justify-between items-center text-zinc-400">
                  <span>Valor de mercado</span>
                  <span className="font-bold text-white">
                    {formatCurrency(player.value || 0)}
                  </span>
                </div>
                <div className="flex justify-between items-center border-t border-zinc-700 pt-2">
                  <span className="text-zinc-300 font-bold">
                    Clausula de Rescisão
                  </span>
                  <span className="font-black text-emerald-400 text-base">
                    {formatCurrency(suggestedPrice)}
                  </span>
                </div>
                <p className="text-zinc-500 text-xs pt-1">
                  A equipa adversária aceitará este prémio sobre o valor de
                  mercado.
                </p>
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => setTransferProposalModal(null)}
                  className="flex-1 px-4 py-2.5 rounded-lg font-black uppercase text-sm bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border border-zinc-700 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  onClick={() => {
                    socket.emit("makeTransferProposal", {
                      playerId: player.id,
                    });
                  }}
                  className="flex-1 px-4 py-2.5 rounded-lg font-black uppercase text-sm bg-emerald-700 hover:bg-emerald-600 text-white border border-emerald-500 transition-colors"
                >
                  Confirmar Proposta
                </button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
