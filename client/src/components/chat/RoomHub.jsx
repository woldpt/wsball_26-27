import { socket } from "../../socket.js";
import { useState, useEffect } from "react";

const QUICK_MESSAGES = ["👍", "🔥", "Vamos!", "Boa sorte", "⚽", "😂"];

/**
 * @param {{
 *   me: object|null,
 *   roomHubRef: object,
 *   roomHubOpen: boolean,
 *   setRoomHubOpen: function,
 *   roomMessages: Array,
 *   globalMessages: Array,
 *   globalPlayers: Array,
 *   players: Array,
 *   teams: Array,
 *   roomCreator: string,
 *   matchweekCount: number,
 *   unreadRoom: number,
 *   unreadGlobal: number,
 *   chatInput: string,
 *   setChatInput: function,
 *   chatMessagesRef: object,
 *   addToast: function,
 *   awaitingCoaches: Array,
 *   chatOpenRef: object,
 *   activeChatTabRef: object,
 * }} props
 */
export function RoomHub({
  me,
  roomHubRef,
  roomHubOpen,
  setRoomHubOpen,
  roomMessages,
  globalMessages,
  globalPlayers,
  players,
  teams,
  roomCreator,
  matchweekCount,
  unreadRoom,
  unreadGlobal,
  chatInput,
  setChatInput,
  chatMessagesRef,
  addToast,
  awaitingCoaches,
  chatOpenRef,
  activeChatTabRef,
}) {
  const [chatSubTab, setChatSubTab] = useState("room");
  const [systemMessages, setSystemMessages] = useState([]);

  // Sync RoomHub state → parent refs for unread logic
  useEffect(() => {
    chatOpenRef && (chatOpenRef.current = roomHubOpen);
    activeChatTabRef && (activeChatTabRef.current = chatSubTab);
  }, [roomHubOpen, chatSubTab, chatOpenRef, activeChatTabRef]);

  useEffect(() => {
    const onSystemMessage = (data) => {
      setSystemMessages((prev) => [
        ...prev,
        { id: Date.now() + Math.random(), text: data.text, timestamp: Date.now() },
      ]);
    };

    socket.on("systemMessage", onSystemMessage);

    return () => {
      socket.off("systemMessage", onSystemMessage);
    };
  }, []);

  const activeMessages = chatSubTab === "room" ? roomMessages : globalMessages;

  const sendChat = () => {
    const trimmed = chatInput.trim();
    if (!trimmed) return;
    socket.emit("sendChatMessage", {
      channel: chatSubTab,
      message: trimmed,
    });
    setChatInput("");
  };

  const sendQuickMessage = (text) => {
    socket.emit("sendChatMessage", {
      channel: chatSubTab,
      message: text,
    });
  };

  const formatChatTime = (ts) => {
    const d = new Date(ts);
    return d.toLocaleTimeString("pt-PT", {
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const formatSystemTime = (ts) => {
    const d = new Date(ts);
    return d.toLocaleTimeString("pt-PT", {
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const getCoachStatus = (coach) => {
    if (!coach.online) return { label: "Offline", color: "text-on-surface-variant/40", dotColor: "bg-surface-bright" };
    if (coach.submitted) return { label: "Vamos! ⚡", color: "text-emerald-400", dotColor: "bg-emerald-400" };
    return { label: "Queimando neurónios 🧠", color: "text-amber-400", dotColor: "bg-amber-400" };
  };

  if (!me) return null;

  return (
    <div
      ref={roomHubRef}
      className="fixed top-14 right-4 z-50 flex flex-col items-end gap-2"
    >
      {roomHubOpen && (
        <div
          className="flex flex-col rounded-xl shadow-2xl overflow-hidden border border-outline-variant/40"
          style={{
            width: "min(360px, calc(100vw - 2rem))",
            height: 480,
            background: "#1a1a1a",
          }}
        >
          {/* Header */}
          <div
            className="flex items-center justify-between px-4 py-2.5 shrink-0"
            style={{ background: "#111" }}
          >
            <div className="flex items-center gap-2">
              <span className="text-sm font-black uppercase tracking-widest text-on-surface">
                WSBALL
              </span>
              {me.roomName && (
                <span className="text-[10px] text-on-surface-variant font-semibold truncate max-w-[120px]">
                  · {me.roomName}
                </span>
              )}
            </div>
            <button
              onClick={() => setRoomHubOpen(false)}
              className="text-on-surface-variant hover:text-on-surface transition-colors"
            >
              <span className="material-symbols-outlined text-[18px] leading-none">
                close
              </span>
            </button>
          </div>

          {/* Room info */}
          <div
            className="px-4 py-2.5 flex flex-col gap-1.5 border-b border-outline-variant/20"
            style={{ background: "#111" }}
          >
            <div className="flex items-center justify-between">
              <span className="text-[10px] uppercase tracking-widest font-black text-on-surface-variant truncate">
                {me.roomName || me.roomCode}
              </span>
              <span className="text-[10px] font-black text-emerald-400 uppercase tracking-widest shrink-0 ml-2">
                {players.length} online
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="font-mono text-xs font-black text-primary tracking-widest">
                {me.roomCode?.toUpperCase()}
              </span>
              <button
                onClick={() => {
                  navigator.clipboard
                    .writeText(me.roomCode?.toUpperCase() || "")
                    .then(() => addToast("Código copiado!"))
                    .catch(() => {});
                }}
                className="text-[9px] font-black uppercase tracking-widest text-zinc-500 hover:text-primary transition-colors px-1.5 py-0.5 rounded bg-zinc-800 hover:bg-zinc-700"
                title="Copiar código de convite"
              >
                Copiar
              </button>
            </div>
          </div>

          {/* Players list */}
          <div className="divide-y divide-outline-variant/10">
            {[
              ...players.map((p) => ({
                name: p.name,
                teamId: p.teamId,
                online: true,
                submitted: p.ready,
              })),
              ...awaitingCoaches
                .filter((n) => !players.some((p) => p.name === n))
                .map((n) => ({
                  name: n,
                  teamId: null,
                  online: false,
                  submitted: false,
                })),
            ].map((coach, i) => {
              const coachTeam = coach.teamId
                ? teams.find((t) => t.id == coach.teamId)
                : null;
              const status = getCoachStatus(coach);
              return (
                <div
                  key={coach.name || i}
                  className="flex items-center gap-3 px-4 py-2.5"
                >
                  <span
                    className={`w-2 h-2 rounded-full shrink-0 ${status.dotColor}`}
                  />
                  <div className="flex-1 min-w-0">
                    <p
                      className={`text-xs font-black truncate ${
                        coach.online
                          ? "text-on-surface"
                          : "text-on-surface-variant"
                      }`}
                    >
                      {coach.name}
                      {coach.name === me.name && (
                        <span className="ml-1.5 text-[9px] font-bold text-on-surface-variant">
                          (tu)
                        </span>
                      )}
                      {coach.name === roomCreator && (
                        <span className="ml-1.5 text-[9px] font-black uppercase tracking-widest text-amber-400 bg-amber-400/10 px-2 py-0.5 rounded shrink-0">
                          Admin
                        </span>
                      )}
                    </p>
                    {coachTeam && (
                      <p
                        className="text-[10px] truncate"
                        style={{
                          color: coachTeam.color_primary || "#71717a",
                        }}
                      >
                        {coachTeam.name}
                      </p>
                    )}
                  </div>
                  {/* Botão kick: só Admin no lobby, não se pode expulsar a si mesmo */}
                  {me.name === roomCreator &&
                    coach.name !== me.name &&
                    matchweekCount === 0 && (
                      <button
                        onClick={() => {
                          socket.emit("kickCoach", {
                            targetName: coach.name,
                          });
                        }}
                        className="shrink-0 text-[9px] font-black uppercase tracking-widest text-rose-400 hover:text-rose-300 bg-rose-400/10 hover:bg-rose-400/20 px-1.5 py-0.5 rounded transition-colors"
                        title={`Expulsar ${coach.name}`}
                      >
                        Kick
                      </button>
                    )}
                  {!(
                    me.name === roomCreator &&
                    coach.name !== me.name &&
                    matchweekCount === 0
                  ) && (
                    <span
                      className={`shrink-0 text-[10px] font-black ${status.color}`}
                    >
                      {status.label}
                    </span>
                  )}
                </div>
              );
            })}
          </div>

          {/* Room/Global sub-tabs */}
          <div
            className="flex shrink-0 border-b border-outline-variant/20"
            style={{ background: "#111" }}
          >
            {[
              { key: "room", label: "Sala" },
              { key: "global", label: "Global" },
            ].map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setChatSubTab(key)}
                className={`flex-1 py-1.5 text-[10px] font-black uppercase tracking-widest transition-colors ${
                  chatSubTab === key
                    ? "text-primary"
                    : "text-on-surface-variant hover:text-on-surface"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Global players online list */}
          {chatSubTab === "global" && globalPlayers.length > 0 && (
            <div
              className="shrink-0 border-b border-outline-variant/20"
              style={{ background: "#111" }}
            >
              <div className="flex items-center gap-1.5 px-3 py-1.5">
                <span className="inline-block w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
                <span className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant">
                  {globalPlayers.length} online
                </span>
              </div>
              <div
                className="flex flex-wrap gap-1.5 px-3 pb-2 overflow-y-auto"
                style={{ maxHeight: 72 }}
              >
                {globalPlayers.map((p) => (
                  <span
                    key={p.name}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-surface-container text-on-surface border border-outline-variant/30"
                  >
                    {p.name}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Quick messages */}
          <div
            className="shrink-0 flex items-center gap-1.5 px-3 py-2 overflow-x-auto border-b border-outline-variant/20"
            style={{ background: "#111" }}
          >
            {QUICK_MESSAGES.map((msg) => (
              <button
                key={msg}
                onClick={() => sendQuickMessage(msg)}
                className="shrink-0 px-2.5 py-1 rounded-full text-xs bg-surface-container hover:bg-surface-container-high text-on-surface border border-outline-variant/20 transition-colors"
              >
                {msg}
              </button>
            ))}
          </div>

          {/* Messages */}
          <div
            ref={chatMessagesRef}
            className="flex-1 overflow-y-auto px-3 py-3 space-y-2"
            style={{ scrollBehavior: "smooth" }}
          >
            {systemMessages.map((sm) => (
              <div
                key={sm.id}
                className="text-center text-[10px] italic text-on-surface-variant/50 py-1"
              >
                {sm.text} — <span className="text-[9px]">{formatSystemTime(sm.timestamp)}</span>
              </div>
            ))}
            {activeMessages.length === 0 && systemMessages.length === 0 ? (
              <p className="text-center text-on-surface-variant text-xs italic mt-8">
                {chatSubTab === "room"
                  ? "Nenhuma mensagem nesta sala ainda."
                  : "Nenhuma mensagem global ainda."}
              </p>
            ) : (
              activeMessages.map((msg) => {
                const isOwn = msg.coachName === me.name;
                return (
                  <div
                    key={msg.id}
                    className={`flex flex-col gap-0.5 ${isOwn ? "items-end" : "items-start"}`}
                  >
                    {!isOwn && (
                      <span className="text-[10px] text-on-surface-variant font-semibold px-1">
                        {msg.coachName}
                      </span>
                    )}
                    <div
                      className={`max-w-[80%] px-3 py-1.5 rounded-xl text-sm leading-snug ${
                        isOwn
                          ? "bg-primary text-on-primary rounded-br-sm"
                          : "bg-surface-container text-on-surface rounded-bl-sm"
                      }`}
                    >
                      {msg.message}
                    </div>
                    <span className="text-[9px] text-on-surface-variant px-1">
                      {formatChatTime(msg.timestamp)}
                    </span>
                  </div>
                );
              })
            )}
          </div>

          {/* Input */}
          <div
            className="flex items-center gap-2 px-3 py-2.5 shrink-0 border-t border-outline-variant/20"
            style={{ background: "#111" }}
          >
            <input
              type="text"
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") sendChat();
              }}
              placeholder="Escreve uma mensagem…"
              maxLength={500}
              className="flex-1 bg-surface-container text-on-surface text-sm px-3 py-1.5 rounded-lg outline-none placeholder:text-on-surface-variant/50 border border-outline-variant/30 focus:border-primary/60 transition-colors"
            />
            <button
              onClick={sendChat}
              disabled={!chatInput.trim()}
              className="shrink-0 p-1.5 rounded-lg bg-primary text-on-primary disabled:opacity-30 hover:opacity-90 transition-opacity"
            >
              <span className="material-symbols-outlined text-[18px] leading-none">
                send
              </span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
