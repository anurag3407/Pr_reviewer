"use client";

/**
 * ChatPanel — conversation about a review (PR-level) or a specific finding.
 * Asks the model with full code context; when focused on a finding, a converged
 * code fix in the reply is captured server-side as that finding's suggested fix.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import type { ChatMessage } from "@/lib/types";

export function ChatPanel({
  reviewId,
  focus,
  onClearFocus,
}: {
  reviewId: string;
  focus: { id: string; title: string } | null;
  onClearFocus: () => void;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const listRef = useRef<HTMLDivElement | null>(null);

  const findingId = focus?.id ?? null;

  const loadHistory = useCallback(async () => {
    const qs = findingId ? `?finding_id=${encodeURIComponent(findingId)}` : "";
    try {
      const res = await fetch(`/api/reviews/${reviewId}/chat${qs}`, { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        setMessages(Array.isArray(data.messages) ? data.messages : []);
      }
    } catch {
      /* ignore */
    }
  }, [reviewId, findingId]);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [messages, sending]);

  async function send() {
    const content = input.trim();
    if (!content || sending) return;
    setInput("");
    setSending(true);
    // optimistic user bubble
    const temp: ChatMessage = {
      id: `tmp-${Date.now()}`,
      owner_id: "",
      review_id: reviewId,
      finding_id: findingId,
      role: "user",
      content,
    };
    setMessages((m) => [...m, temp]);
    try {
      const res = await fetch(`/api/reviews/${reviewId}/chat`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ content, finding_id: findingId }),
      });
      const data = await res.json();
      if (res.ok && data.message) {
        setMessages((m) => [...m, data.message as ChatMessage]);
      } else {
        setMessages((m) => [
          ...m,
          { ...temp, id: `err-${Date.now()}`, role: "assistant", content: `⚠ ${data.error ?? "chat failed"}` },
        ]);
      }
    } catch (e) {
      setMessages((m) => [
        ...m,
        { ...temp, id: `err-${Date.now()}`, role: "assistant", content: `⚠ ${(e as Error).message}` },
      ]);
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="panel chat">
      <div className="panel__head">
        <span className="eyebrow">Ask Autoheal</span>
        {focus ? (
          <button className="linkbtn" onClick={onClearFocus}>
            ← whole PR
          </button>
        ) : (
          <span className="panel__hint">about this PR</span>
        )}
      </div>

      {focus && (
        <div className="chat__focus">
          discussing: <b>{focus.title}</b>
        </div>
      )}

      <div className="chat__msgs" ref={listRef}>
        {messages.length === 0 && (
          <div className="chat__empty">
            Ask why an issue is happening, request a better approach, or ask for the final fix.
          </div>
        )}
        {messages.map((m) => (
          <div key={m.id} className={`msg msg--${m.role}`}>
            <div className="msg__role">{m.role === "user" ? "you" : "autoheal"}</div>
            <div className="msg__body">{m.content}</div>
          </div>
        ))}
        {sending && (
          <div className="msg msg--assistant">
            <div className="msg__role">autoheal</div>
            <div className="msg__body msg__body--typing">thinking…</div>
          </div>
        )}
      </div>

      <div className="chat__input">
        <textarea
          value={input}
          placeholder={focus ? "Ask about this finding…" : "Ask about this PR…"}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) send();
          }}
          rows={2}
        />
        <button className="btn btn--go" onClick={send} disabled={sending || !input.trim()}>
          {sending ? "…" : "Send"}
        </button>
      </div>
    </div>
  );
}
