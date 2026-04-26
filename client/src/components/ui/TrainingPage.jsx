import React, { useState, useEffect } from "react";
import { socket } from "../../socket";

const TRAINING_OPTIONS = [
  { key: "GR", label: "Guarda-redes", description: "Melhorar skill dos GR (+0.5)", icon: "sports_soccer", color: "from-yellow-500/20 to-yellow-600/10" },
  { key: "Defesas", label: "Defesas", description: "Melhorar skill dos defensas (+0.5)", icon: "security", color: "from-blue-500/20 to-blue-600/10" },
  { key: "Médios", label: "Médios", description: "Melhorar skill dos médios (+0.5)", icon: "pivot_table_chart", color: "from-emerald-500/20 to-emerald-600/10" },
  { key: "Avançados", label: "Avançados", description: "Melhorar skill dos avançados (+0.5)", icon: "target", color: "from-rose-500/20 to-rose-600/10" },
  { key: "Forma", label: "Forma", description: "Melhorar forma geral (+10 pontos)", icon: "favorite", color: "from-orange-500/20 to-orange-600/10" },
  { key: "Resistência", label: "Resistência", description: "Melhorar resistência (+0.2)", icon: "bolt", color: "from-purple-500/20 to-purple-600/10" },
];

const POSITION_LABELS = {
  GR: "Guarda-redes",
  DEF: "Defesas",
  MED: "Médios",
  ATA: "Avançados",
};

const POSITION_TEXT_CLASS = {
  GR: "text-yellow-500",
  DEF: "text-blue-500",
  MED: "text-emerald-500",
  ATA: "text-rose-500",
};

export function TrainingPage({ me, players, matchweek }) {
  const [selectedTraining, setSelectedTraining] = useState(null);
  const [trainingHistory, setTrainingHistory] = useState([]);
  const [savedTraining, setSavedTraining] = useState(null);
  const [loading, setLoading] = useState(false);
  const [saved, setSaved] = useState(false);

  // Fetch current training and history on component mount
  useEffect(() => {
    if (!me?.teamId) return;

    // Get current training focus
    socket.emit("getTrainingFocus", (focus) => {
      setSavedTraining(focus);
      setSelectedTraining(focus);
    });

    // Get last week's history
    socket.emit("getTrainingHistory", matchweek - 1, (history) => {
      setTrainingHistory(history);
    });
  }, [me?.teamId, matchweek]);

  // Listen for training focus updates
  useEffect(() => {
    const handleTrainingUpdated = (data) => {
      if (data.teamId === me?.teamId) {
        setSavedTraining(data.trainingFocus);
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
      }
    };

    socket.on("trainingFocusUpdated", handleTrainingUpdated);
    return () => socket.off("trainingFocusUpdated", handleTrainingUpdated);
  }, [me?.teamId]);

  const handleSetTraining = (trainingKey) => {
    if (!me?.teamId) return;
    setLoading(true);

    socket.emit("setTrainingFocus", trainingKey, () => {
      setSelectedTraining(trainingKey);
      setSavedTraining(trainingKey);
      setLoading(false);
    });
  };

  // Group history by position
  const historyByPosition = {};
  trainingHistory.forEach((record) => {
    if (!historyByPosition[record.position]) {
      historyByPosition[record.position] = [];
    }
    historyByPosition[record.position].push(record);
  });

  return (
    <div className="space-y-6">
      {/* ── HEADER ────────────────────────────────────────────────────────── */}
      <div>
        <h1 className="text-3xl font-black text-white uppercase tracking-tight mb-1">
          Treino Semanal
        </h1>
        <p className="text-zinc-400 text-sm">
          Escolha o foco de treino para melhorar os atributos da sua equipa
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* ── TRAINING SELECTION ────────────────────────────────────────── */}
        <div className="space-y-3">
          <h2 className="text-lg font-bold text-white mb-3">
            Foco de Treino - Jornada {matchweek}
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {TRAINING_OPTIONS.map(({ key, label, description, icon, color }) => (
              <button
                key={key}
                onClick={() => handleSetTraining(key)}
                disabled={loading}
                className={`text-left p-4 rounded-lg border-2 transition-all group ${
                  selectedTraining === key
                    ? "border-primary bg-gradient-to-br from-primary/25 to-primary/10 text-white shadow-lg"
                    : "border-outline-variant/20 bg-gradient-to-br " + color + " hover:border-outline-variant/40 text-zinc-300"
                } ${loading ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
              >
                <div className="flex items-start justify-between mb-2">
                  <div className="font-bold text-sm">{label}</div>
                  <span className="material-symbols-outlined text-[20px] shrink-0 text-zinc-400 group-hover:text-zinc-300 transition-colors">
                    {icon}
                  </span>
                </div>
                <div className="text-xs text-zinc-400">{description}</div>
                {savedTraining === key && (
                  <div className={`text-xs font-semibold mt-2 flex items-center gap-1 ${saved ? "text-green-400" : "text-primary"}`}>
                    <span className="material-symbols-outlined text-[14px]">check_circle</span>
                    {saved ? "Guardado!" : "Ativo"}
                  </div>
                )}
              </button>
            ))}
          </div>

          <div className="bg-gradient-to-br from-blue-500/10 to-cyan-500/5 rounded-lg p-4 border border-blue-500/20 mt-4">
            <div className="flex items-start gap-3">
              <span className="material-symbols-outlined text-blue-400 shrink-0 mt-0.5">info</span>
              <div>
                <h3 className="font-bold text-white mb-2">Como funciona?</h3>
                <ul className="text-xs text-zinc-300 space-y-1.5">
                  <li className="flex items-start gap-2"><span className="text-blue-400">→</span> Escolha um foco de treino no início da jornada</li>
                  <li className="flex items-start gap-2"><span className="text-blue-400">→</span> Apenas jogadores que jogam beneficiam</li>
                  <li className="flex items-start gap-2"><span className="text-blue-400">→</span> <strong>Posições:</strong> +0.5 skill | <strong>Forma:</strong> +10 pts | <strong>Resistência:</strong> +0.2</li>
                  <li className="flex items-start gap-2"><span className="text-blue-400">→</span> Aplicado automaticamente após a jornada</li>
                </ul>
              </div>
            </div>
          </div>
        </div>

        {/* ── TRAINING HISTORY ──────────────────────────────────────────── */}
        <div className="space-y-3">
          <h2 className="text-lg font-bold text-white mb-3">
            Relatório - Jornada {matchweek - 1}
          </h2>

          {trainingHistory.length === 0 ? (
            <div className="bg-surface-container rounded-lg p-6 text-center">
              <p className="text-zinc-400 text-sm">
                Nenhum treino foi aplicado ainda nesta jornada.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {Object.entries(historyByPosition).map(([position, records]) => (
                <div key={position} className={`bg-gradient-to-br rounded-lg p-4 border border-outline-variant/20 ${
                  position === "GR" ? "from-yellow-500/5 to-yellow-600/5" :
                  position === "DEF" ? "from-blue-500/5 to-blue-600/5" :
                  position === "MED" ? "from-emerald-500/5 to-emerald-600/5" :
                  "from-rose-500/5 to-rose-600/5"
                }`}>
                  <h3 className={`font-bold mb-3 flex items-center gap-2 ${POSITION_TEXT_CLASS[position] || "text-white"}`}>
                    <span className="material-symbols-outlined text-[18px]">group</span>
                    {POSITION_LABELS[position] || position}
                  </h3>

                  <div className="space-y-1">
                    {records.map((record, idx) => (
                      <div key={idx} className="flex items-center justify-between text-sm p-2 rounded hover:bg-white/5 transition-colors">
                        <div className="flex items-center gap-2 flex-1 min-w-0">
                          <span className="text-zinc-300 truncate text-xs">{record.player_name}</span>
                          <span className={`text-xs px-2 py-0.5 bg-surface-container-high rounded whitespace-nowrap ${
                            record.attribute === "skill" ? "text-yellow-300" :
                            record.attribute === "form" ? "text-orange-300" :
                            "text-purple-300"
                          }`}>
                            {record.attribute === "skill"
                              ? "Skill"
                              : record.attribute === "form"
                                ? "Forma"
                                : "Resistência"}
                          </span>
                        </div>
                        <div className="flex items-center gap-1 shrink-0 ml-2">
                          <span className="text-zinc-500 text-xs w-8 text-right">
                            {Math.round(record.old_value * 10) / 10}
                          </span>
                          <span className="text-zinc-600">→</span>
                          <span className="text-green-400 font-semibold text-xs w-8 text-right">
                            {Math.round(record.new_value * 10) / 10}
                          </span>
                          <span className="text-green-500/70 text-xs ml-1 w-12 text-right">
                            +{Math.round((record.new_value - record.old_value) * 10) / 10}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
