// eslint-disable-next-line no-unused-vars
import { motion, AnimatePresence } from "framer-motion";
import { useEffect, useRef } from "react";

/**
 * Custom in-game dialog replacing window.prompt / window.confirm.
 *
 * @param {{
 *   dialog: {
 *     mode: "prompt"|"confirm",
 *     title: string,
 *     description?: string,
 *     defaultValue?: string,
 *     confirmLabel?: string,
 *     cancelLabel?: string,
 *     danger?: boolean,
 *     onConfirm: (value?: string) => void,
 *     onCancel: () => void,
 *   } | null,
 *   onClose: () => void,
 * }} props
 */
export function GameDialog({ dialog, onClose }) {
  const inputRef = useRef(null);

  useEffect(() => {
    if (dialog?.mode === "prompt" && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [dialog]);

  const handleConfirm = () => {
    if (!dialog) return;
    if (dialog.mode === "prompt") {
      dialog.onConfirm(inputRef.current?.value ?? "");
    } else {
      dialog.onConfirm();
    }
    onClose();
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter") handleConfirm();
    if (e.key === "Escape") {
      dialog?.onCancel?.();
      onClose();
    }
  };

  return (
    <AnimatePresence>
      {dialog && (
        <motion.div
          key="game-dialog-backdrop"
          className="fixed inset-0 z-[200] bg-zinc-950/80 backdrop-blur-sm flex items-center justify-center p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          onClick={() => {
            dialog?.onCancel?.();
            onClose();
          }}
        >
          <motion.div
            className="w-full max-w-sm rounded-lg border border-zinc-700/40 bg-zinc-900 shadow-2xl overflow-hidden"
            initial={{ scale: 0.92, y: 16 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.92, y: 16 }}
            transition={{ type: "spring", stiffness: 380, damping: 28 }}
            onClick={(e) => e.stopPropagation()}
            onKeyDown={handleKeyDown}
          >
            {/* Header */}
            <div className="px-5 pt-5 pb-3 border-b border-zinc-800">
              <p className="text-[10px] uppercase tracking-widest text-zinc-500 font-black mb-1">
                {dialog.mode === "prompt" ? "Inserir valor" : "Confirmação"}
              </p>
              <h3 className="text-base font-black text-white leading-snug">
                {dialog.title}
              </h3>
              {dialog.description && (
                <p className="text-xs text-zinc-400 mt-1">
                  {dialog.description}
                </p>
              )}
            </div>

            {/* Body */}
            <div className="px-5 py-4">
              {dialog.mode === "prompt" && (
                <input
                  ref={inputRef}
                  type="number"
                  min="0"
                  defaultValue={dialog.defaultValue ?? ""}
                  className="w-full rounded border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/40 transition-colors"
                />
              )}
            </div>

            {/* Actions */}
            <div className="flex gap-2 px-5 pb-5">
              <button
                onClick={() => {
                  dialog?.onCancel?.();
                  onClose();
                }}
                className="flex-1 rounded border border-zinc-700 bg-zinc-800 px-4 py-2 text-xs font-black uppercase tracking-widest text-zinc-300 hover:bg-zinc-700 transition-colors"
              >
                {dialog.cancelLabel ?? "Cancelar"}
              </button>
              <button
                onClick={handleConfirm}
                className={`flex-1 rounded px-4 py-2 text-xs font-black uppercase tracking-widest transition-colors ${
                  dialog.danger
                    ? "bg-red-600 hover:bg-red-500 text-white border border-red-500"
                    : "bg-emerald-600 hover:bg-emerald-500 text-white border border-emerald-500"
                }`}
              >
                {dialog.confirmLabel ?? "Confirmar"}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
