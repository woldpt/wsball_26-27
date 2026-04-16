import { useRef } from "react";
import { socket } from "../../socket.js";

/**
 * @param {{
 *   me: object|null,
 *   chatOpen: boolean,
 *   setChatOpen: function,
 *   activeChatTab: string,
 *   setActiveChatTab: function,
 *   roomMessages: Array,
 *   globalMessages: Array,
 *   unreadRoom: number,
 *   unreadGlobal: number,
 *   chatInput: string,
 *   setChatInput: function,
 *   chatMessagesRef: object,
 * }} props
 */
export function ChatWidget({
  me,
  chatOpen,
  setChatOpen,
  activeChatTab,
  setActiveChatTab,
  roomMessages,
  globalMessages,
  unreadRoom,
  unreadGlobal,
  chatInput,
  setChatInput,
  chatMessagesRef,
}) {
  if (!me) return null;

  const totalUnread = unreadRoom + unreadGlobal;
  const activeMessages =
    activeChatTab === "room" ? roomMessages : globalMessages;

  const sendChat = () => {
    const trimmed = chatInput.trim();
    if (!trimmed) return;
    socket.emit("sendChatMessage", {
      channel: activeChatTab,
      message: trimmed,
    });
    setChatInput("");
  };

  const formatChatTime = (ts) => {
    const d = new Date(ts);
    return d.toLocaleTimeString("pt-PT", {
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <div className="fixed top-14 right-4 z-50 flex flex-col items-end gap-2">
      {/* Expanded panel */}
      {chatOpen && (
        <div
          className="flex flex-col rounded-xl shadow-2xl overflow-hidden border border-outline-variant/40"
          style={{
            width: "min(340px, calc(100vw - 2rem))",
            height: 430,
            background: "#1a1a1a",
          }}
        >
          {/* Header */}
          <div
            className="flex items-center justify-between px-4 py-2.5 shrink-0"
            style={{ background: "#111" }}
          >
            <span className="text-sm font-black uppercase tracking-widest text-on-surface">
              Chat
            </span>
            <button
              onClick={() => setChatOpen(false)}
              className="text-on-surface-variant hover:text-on-surface transition-colors"
            >
              <span className="material-symbols-outlined text-[18px] leading-none">
                close
              </span>
            </button>
          </div>

          {/* Tabs */}
          <div
            className="flex shrink-0 border-b border-outline-variant/20"
            style={{ background: "#111" }}
          >
            {[
              { key: "room", label: "Sala", unread: unreadRoom },
              { key: "global", label: "Global", unread: unreadGlobal },
            ].map(({ key, label, unread }) => (
              <button
                key={key}
                onClick={() => setActiveChatTab(key)}
                className={`flex-1 py-2 text-xs font-black uppercase tracking-widest transition-colors relative ${
                  activeChatTab === key
                    ? "text-primary border-b-2 border-primary"
                    : "text-on-surface-variant hover:text-on-surface"
                }`}
              >
                {label}
                {unread > 0 && (
                  <span className="ml-1.5 inline-flex items-center justify-center rounded-full bg-rose-500 text-white text-[9px] font-black leading-none px-1.5 py-0.5">
                    {unread > 9 ? "9+" : unread}
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* Messages */}
          <div
            ref={chatMessagesRef}
            className="flex-1 overflow-y-auto px-3 py-3 space-y-2"
            style={{ scrollBehavior: "smooth" }}
          >
            {activeMessages.length === 0 ? (
              <p className="text-center text-on-surface-variant text-xs italic mt-8">
                {activeChatTab === "room"
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
