import { useState, useEffect } from "react";
import { PlayerAvatar } from "../components/shared/PlayerAvatar.jsx";

export function UserSettingsPage({
  me,
  teamInfo,
  palmares,
  backendUrl,
  onBack,
  onLogout,
  onLeaveRoom,
}) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [changingPassword, setChangingPassword] = useState(false);
  const [passwordMsg, setPasswordMsg] = useState(null);
  const [rooms, setRooms] = useState([]);
  const [roomsLoading, setRoomsLoading] = useState(true);
  const [avatarSeed, setAvatarSeed] = useState(() => {
    try {
      return window.localStorage.getItem("cashballAvatarSeed") || "";
    } catch { return ""; }
  });

  useEffect(() => {
    if (!me?.name) return;
    fetch(`${backendUrl}/auth/manager-info?name=${encodeURIComponent(me.name)}`)
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data?.rooms)) setRooms(data.rooms);
      })
      .catch(() => { /* ignorar */ })
      .finally(() => setRoomsLoading(false));
  }, [me?.name, backendUrl]);

  const handleChangePassword = async (e) => {
    e.preventDefault();
    setPasswordMsg(null);

    if (!currentPassword || !newPassword || !confirmPassword) {
      setPasswordMsg({ type: "error", text: "Preenche todos os campos." });
      return;
    }
    if (newPassword.length < 3) {
      setPasswordMsg({
        type: "error",
        text: "A nova palavra-passe deve ter pelo menos 3 caracteres.",
      });
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordMsg({ type: "error", text: "As novas palavras-passe não coincidem." });
      return;
    }

    setChangingPassword(true);
    try {
      const res = await fetch(`${backendUrl}/auth/change-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: me.name,
          currentPassword,
          newPassword,
        }),
      });
      const data = await res.json();
      if (!data.ok) {
        setPasswordMsg({ type: "error", text: data.error || "Erro ao alterar palavra-passe." });
      } else {
        setPasswordMsg({ type: "success", text: "Palavra-passe alterada com sucesso!" });
        setCurrentPassword("");
        setNewPassword("");
        setConfirmPassword("");
        try {
          const s = JSON.parse(window.localStorage.getItem("cashballSession") || "{}");
          s.password = newPassword;
          window.localStorage.setItem("cashballSession", JSON.stringify(s));
        } catch (_a) { _a && undefined; /* ignorar */ }
      }
    } catch (_b) { _b && undefined; /* ignorar */
      setPasswordMsg({ type: "error", text: "Erro de ligação ao servidor." });
    } finally {
      setChangingPassword(false);
    }
  };

  const handleSwitchRoom = (roomCode) => {
    if (typeof window !== "undefined") {
      if (me?.roomCode) {
        try {
          window.localStorage.setItem(
            "cashballSession",
            JSON.stringify({
              name: me.name,
              password: me.password,
              roomCode,
            }),
          );
        } catch (_e) { _e && undefined; /* ignorar */ }
      }
      window.location.reload();
    }
  };

  const trophies = palmares?.trophies || [];

  return (
    <div className="max-w-xl mx-auto px-4 py-8 space-y-8">
      {/* Back */}
      <button
        onClick={onBack}
        className="flex items-center gap-2 text-sm font-bold text-on-surface-variant hover:text-on-surface transition-colors"
      >
        <span className="material-symbols-outlined text-[18px]">arrow_back</span>
        Voltar
      </button>

      {/* Profile */}
      <div className="bg-surface-container-low border border-outline-variant/20 rounded-xl p-6 flex flex-col sm:flex-row items-center gap-5">
        <div className="relative group shrink-0">
          <PlayerAvatar seed={`${me?.name || "?"}|${avatarSeed}`} size="xl" />
          <button
            onClick={() => {
              const newSeed = Math.random().toString(36).slice(2, 10);
              setAvatarSeed(newSeed);
              try {
                window.localStorage.setItem("cashballAvatarSeed", newSeed);
              } catch { /* ignorar */ }
            }}
            title="Gerar novo avatar"
            className="absolute -bottom-1 -right-1 w-8 h-8 rounded-full bg-surface-container-high border border-outline-variant/40 text-on-surface flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow-lg hover:bg-surface-bright"
          >
            <span className="material-symbols-outlined text-[16px] leading-none">refresh</span>
          </button>
        </div>
        <div className="text-center sm:text-left">
          <h2 className="text-xl font-headline font-black tracking-tight">{me?.name}</h2>
          <p className="text-sm text-on-surface-variant font-bold mt-1">
            {teamInfo?.name || "Sem equipa"}
          </p>
          <p className="text-xs text-on-surface-variant/60 font-medium mt-0.5">
            Sala: {me?.roomName || me?.roomCode || "—"}
          </p>
        </div>
      </div>

      {/* Change Password */}
      <section>
        <h3 className="text-sm font-black uppercase tracking-widest text-on-surface-variant mb-3 flex items-center gap-2">
          <span className="material-symbols-outlined text-[18px]">lock</span>
          Alterar Palavra-Passe
        </h3>
        <form
          onSubmit={handleChangePassword}
          className="bg-surface-container-low border border-outline-variant/20 rounded-xl p-5 space-y-4"
        >
          <div>
            <label className="text-xs font-bold text-on-surface-variant block mb-1">
              Palavra-passe actual
            </label>
            <input
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              className="w-full bg-surface border border-outline-variant/30 rounded-lg px-4 py-2.5 text-sm font-bold text-on-surface placeholder:text-on-surface-variant/40 focus:outline-none focus:border-primary/60 transition-colors"
              placeholder="••••••••"
            />
          </div>
          <div>
            <label className="text-xs font-bold text-on-surface-variant block mb-1">
              Nova palavra-passe
            </label>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="w-full bg-surface border border-outline-variant/30 rounded-lg px-4 py-2.5 text-sm font-bold text-on-surface placeholder:text-on-surface-variant/40 focus:outline-none focus:border-primary/60 transition-colors"
              placeholder="••••••••"
            />
          </div>
          <div>
            <label className="text-xs font-bold text-on-surface-variant block mb-1">
              Confirmar nova palavra-passe
            </label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="w-full bg-surface border border-outline-variant/30 rounded-lg px-4 py-2.5 text-sm font-bold text-on-surface placeholder:text-on-surface-variant/40 focus:outline-none focus:border-primary/60 transition-colors"
              placeholder="••••••••"
            />
          </div>

          {passwordMsg && (
            <div
              className={`text-xs font-bold px-4 py-2 rounded-lg ${
                passwordMsg.type === "success"
                  ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                  : "bg-red-500/10 text-red-400 border border-red-500/20"
              }`}
            >
              <span className="material-symbols-outlined text-[14px] align-text-bottom mr-1">
                {passwordMsg.type === "success" ? "check_circle" : "error"}
              </span>
              {passwordMsg.text}
            </div>
          )}

          <button
            type="submit"
            disabled={changingPassword}
            className="w-full bg-primary text-on-primary font-black text-sm uppercase tracking-widest rounded-lg px-5 py-3 hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            {changingPassword ? "A guardar..." : "Guardar"}
          </button>
        </form>
      </section>

      {/* My Rooms */}
      <section>
        <h3 className="text-sm font-black uppercase tracking-widest text-on-surface-variant mb-3 flex items-center gap-2">
          <span className="material-symbols-outlined text-[18px]">meeting_room</span>
          As Minhas Salas
        </h3>
        <div className="bg-surface-container-low border border-outline-variant/20 rounded-xl p-5 space-y-2">
          {roomsLoading ? (
            <p className="text-sm text-on-surface-variant/60 font-medium">A carregar...</p>
          ) : rooms.length === 0 ? (
            <p className="text-sm text-on-surface-variant/60 font-medium">Nenhuma sala encontrada.</p>
          ) : (
            rooms.map((r) => {
              const isActive = r.roomCode === me?.roomCode;
              return (
                <div
                  key={r.roomCode}
                  className="flex items-center justify-between py-2.5 px-3 rounded-lg bg-surface/50 border border-outline-variant/10"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="material-symbols-outlined text-[18px] text-on-surface-variant shrink-0">
                      meeting_room
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm font-bold truncate">{r.roomName}</p>
                      <p className="text-xs text-on-surface-variant/50 font-medium truncate">
                        {r.roomCode}
                      </p>
                    </div>
                    {isActive && (
                      <span className="text-[10px] font-black uppercase tracking-wider text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full shrink-0">
                        Sala Actual
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    {r.teamName && (
                      <span className="text-xs font-bold text-on-surface-variant/80 hidden sm:block">
                        {r.teamName}
                      </span>
                    )}
                    <button
                      onClick={() => handleSwitchRoom(r.roomCode)}
                      disabled={isActive}
                      className={`text-xs font-black uppercase tracking-widest px-3 py-1.5 rounded-lg transition-colors ${
                        isActive
                          ? "text-on-surface-variant/30 bg-surface-container cursor-not-allowed"
                          : "text-primary bg-primary/10 hover:bg-primary/20"
                      }`}
                    >
                      {isActive ? "Actual" : "Entrar"}
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </section>

      {/* Palmarés */}
      <section>
        <h3 className="text-sm font-black uppercase tracking-widest text-on-surface-variant mb-3 flex items-center gap-2">
          <span className="material-symbols-outlined text-[18px]">emoji_events</span>
          Conquistas / Palmarés
        </h3>
        <div className="bg-surface-container-low border border-outline-variant/20 rounded-xl p-5">
          {trophies.length === 0 ? (
            <p className="text-sm text-on-surface-variant/60 font-medium text-center py-4">
              Ainda sem conquistas nesta sala.
            </p>
          ) : (
            <div className="space-y-3">
              {trophies.map((t, i) => (
                <div
                  key={i}
                  className="flex items-center gap-3 py-2 px-3 rounded-lg bg-surface/40 border border-outline-variant/10"
                >
                  <span className="text-xl">🏆</span>
                  <div>
                    <p className="text-sm font-bold">{t.achievement}</p>
                    <p className="text-xs text-on-surface-variant/60 font-medium">
                      Temporada {t.season} · {t.team_name}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Actions */}
      <section>
        <h3 className="text-sm font-black uppercase tracking-widest text-on-surface-variant mb-3 flex items-center gap-2">
          <span className="material-symbols-outlined text-[18px]">settings</span>
          Acções
        </h3>
        <div className="flex flex-col sm:flex-row gap-3">
          <button
            onClick={onLeaveRoom}
            className="flex-1 flex items-center justify-center gap-2 bg-surface-container-low border border-outline-variant/20 text-on-surface font-black text-xs uppercase tracking-widest rounded-xl px-5 py-3 hover:bg-surface-bright transition-colors"
          >
            <span className="material-symbols-outlined text-[18px]">logout</span>
            Sair da Sala
          </button>
          <button
            onClick={onLogout}
            className="flex-1 flex items-center justify-center gap-2 bg-red-500/10 border border-red-500/20 text-red-400 font-black text-xs uppercase tracking-widest rounded-xl px-5 py-3 hover:bg-red-500/20 transition-colors"
          >
            <span className="material-symbols-outlined text-[18px]">switch_account</span>
            Trocar Conta
          </button>
        </div>
      </section>
    </div>
  );
}
