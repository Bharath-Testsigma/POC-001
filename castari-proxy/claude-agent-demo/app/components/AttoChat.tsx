'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { ResultEvent, UIEvent } from '@/lib/types/events';
import { ATTO_MODEL_OPTIONS, APP_TYPE_OPTIONS } from '@/lib/agent/atto-config';

/* ------------------------------------------------------------------ types */

type ToolCallState = {
  toolUseId: string;
  name: string;
  status: 'call' | 'progress' | 'result';
  input?: unknown;
  output?: unknown;
  elapsedTimeSeconds?: number;
  isError?: boolean;
};

type ThinkingState = {
  id: string;
  text: string;
  status: 'stream' | 'complete';
  redacted?: boolean;
};

type GeneratedFile = {
  name: string;
  content: string;
};

type ChatMessage = {
  id: string;
  role: 'user' | 'assistant' | 'system' | 'error' | 'tool' | 'thinking';
  content?: string;
  toolCall?: ToolCallState;
  thinking?: ThinkingState;
};

/* ------------------------------------------------------------------ constants */

const THINKING_MIN = 1024;
const THINKING_MAX = 64000;
const THINKING_STEP = 1024;
const DEFAULT_THINKING_BUDGET = 8000;

/* ================================================================== component */

export function AttoChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [model, setModel] = useState<string>(ATTO_MODEL_OPTIONS[0].value);
  const [appType, setAppType] = useState<string>(APP_TYPE_OPTIONS[0].value);
  const [usage, setUsage] = useState<ResultEvent['data'] | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [thinkingEnabled, setThinkingEnabled] = useState(false);
  const [thinkingBudget, setThinkingBudget] = useState(DEFAULT_THINKING_BUDGET);
  const [showThinking, setShowThinking] = useState(true);
  const [generatedFiles, setGeneratedFiles] = useState<GeneratedFile[]>([]);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [clearing, setClearing] = useState(false);

  const assistantIndexRef = useRef<number | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const appendMessage = useCallback((msg: ChatMessage) => {
    setMessages((prev) => [...prev, msg]);
  }, []);

  const updateAssistantMessage = useCallback((updater: (cur: string) => string) => {
    setMessages((prev) => {
      const next = [...prev];
      if (assistantIndexRef.current === null || next[assistantIndexRef.current] === undefined) {
        assistantIndexRef.current = next.length;
        next.push({ id: crypto.randomUUID(), role: 'assistant', content: '' });
      }
      const idx = assistantIndexRef.current!;
      next[idx] = { ...next[idx], content: updater(next[idx]?.content ?? '') };
      return next;
    });
  }, []);

  const finishAssistant = useCallback(() => {
    assistantIndexRef.current = null;
  }, []);

  const handleEvent = useCallback(
    (event: UIEvent) => {
      switch (event.type) {
        case 'system':
          setSessionId(event.data.session_id);
          appendMessage({
            id: crypto.randomUUID(),
            role: 'system',
            content: `Session started — model: ${event.data.model}`,
          });
          break;

        case 'partial':
          updateAssistantMessage((cur) => cur + event.data.textDelta);
          break;

        case 'assistant':
          updateAssistantMessage(() => event.data.text);
          finishAssistant();
          break;

        case 'result':
          setUsage(event.data);
          break;

        case 'error':
          setError(event.data.message);
          appendMessage({ id: crypto.randomUUID(), role: 'error', content: event.data.message });
          break;

        case 'thinking':
          setMessages((prev) => {
            const next = [...prev];
            const idx = next.findIndex(
              (m) => m.role === 'thinking' && m.thinking?.id === event.data.blockId
            );
            const updated: ThinkingState = (() => {
              const existing = idx >= 0 ? next[idx].thinking : undefined;
              const nextText =
                event.data.status === 'delta'
                  ? `${existing?.text ?? ''}${event.data.text ?? ''}`
                  : event.data.text ?? existing?.text ?? '';
              return {
                id: event.data.blockId,
                text: nextText,
                status: event.data.status === 'complete' ? 'complete' : 'stream',
                redacted: event.data.redacted ?? existing?.redacted,
              };
            })();
            if (idx >= 0) {
              next[idx] = { ...next[idx], thinking: updated };
            } else {
              next.push({ id: event.data.blockId, role: 'thinking', thinking: updated });
            }
            return next;
          });
          break;

        case 'tool':
          setMessages((prev) => {
            const next = [...prev];
            const idx = next.findIndex(
              (m) => m.role === 'tool' && m.toolCall?.toolUseId === event.data.toolUseId
            );
            const prev_tc = idx >= 0 ? next[idx].toolCall : undefined;
            const merged: ToolCallState = {
              toolUseId: event.data.toolUseId,
              name: event.data.name,
              status: event.data.status,
              input: event.data.input ?? prev_tc?.input,
              output: event.data.output ?? prev_tc?.output,
              elapsedTimeSeconds: event.data.elapsedTimeSeconds ?? prev_tc?.elapsedTimeSeconds,
              isError: event.data.isError ?? prev_tc?.isError,
            };

            // Extract generated XML files from Write tool calls
            if (
              event.data.name === 'Write' &&
              event.data.status === 'call' &&
              event.data.input
            ) {
              const inp = event.data.input as { file_path?: string; content?: string };
              if (inp.file_path && inp.content && inp.file_path.endsWith('.xml')) {
                const fname = inp.file_path.split('/').pop() ?? inp.file_path;
                setGeneratedFiles((files) => {
                  const existing = files.findIndex((f) => f.name === fname);
                  if (existing >= 0) {
                    const updated = [...files];
                    updated[existing] = { name: fname, content: inp.content! };
                    return updated;
                  }
                  return [...files, { name: fname, content: inp.content! }];
                });
                setSelectedFile((cur) => cur ?? fname);
              }
            }

            if (idx >= 0) {
              next[idx] = { ...next[idx], toolCall: merged };
            } else {
              next.push({ id: crypto.randomUUID(), role: 'tool', toolCall: merged });
            }
            return next;
          });
          break;

        default:
          break;
      }
    },
    [appendMessage, finishAssistant, updateAssistantMessage]
  );

  const consumeStream = useCallback(
    async (response: Response) => {
      if (!response.body) throw new Error('Missing response body');
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';
        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            handleEvent(JSON.parse(line) as UIEvent);
          } catch {
            // ignore malformed lines
          }
        }
      }
      if (buffer.trim()) {
        try { handleEvent(JSON.parse(buffer) as UIEvent); } catch { /* ignore */ }
      }
    },
    [handleEvent]
  );

  const handleSend = useCallback(async () => {
    if (pending || !input.trim()) return;
    setPending(true);
    setError(null);
    setUsage(null);
    assistantIndexRef.current = null;

    const controller = new AbortController();
    abortRef.current?.abort();
    abortRef.current = controller;

    appendMessage({ id: crypto.randomUUID(), role: 'user', content: input.trim() });
    setInput('');

    try {
      const payload: Record<string, unknown> = {
        query: input.trim(),
        appType,
        model,
        ...(sessionId ? { sessionId } : {}),
        ...(thinkingEnabled ? { thinkingBudget } : {}),
      };

      const response = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`Request failed (${response.status}): ${await response.text()}`);
      }
      await consumeStream(response);
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      const msg = err instanceof Error ? err.message : 'Unknown error';
      setError(msg);
      appendMessage({ id: crypto.randomUUID(), role: 'error', content: msg });
    } finally {
      setPending(false);
      finishAssistant();
    }
  }, [appendMessage, appType, consumeStream, finishAssistant, input, model, pending, sessionId, thinkingBudget, thinkingEnabled]);

  const handleClearWorkspace = useCallback(async () => {
    setClearing(true);
    try {
      await fetch('/api/workspace', { method: 'DELETE' });
      setGeneratedFiles([]);
      setSelectedFile(null);
    } finally {
      setClearing(false);
    }
  }, []);

  const handleReset = useCallback(() => {
    abortRef.current?.abort();
    assistantIndexRef.current = null;
    setMessages([]);
    setUsage(null);
    setError(null);
    setSessionId(null);
  }, []);

  const selectedModelInfo = ATTO_MODEL_OPTIONS.find((m) => m.value === model);
  const selectedFileContent = generatedFiles.find((f) => f.name === selectedFile)?.content;

  return (
    <div className="atto-shell">
      {/* ── Sidebar ─────────────────────────────────── */}
      <aside className="atto-sidebar">
        <div className="atto-sidebar-brand">
          <h1>Atto</h1>
          <p>AI Test Case Generator</p>
          <p className="atto-powered">Powered by castari-proxy</p>
        </div>

        <div className="atto-sidebar-section">
          <label className="atto-label">
            <span>Model</span>
            <select value={model} onChange={(e) => setModel(e.target.value)} disabled={pending}>
              {ATTO_MODEL_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label} ({opt.provider})
                </option>
              ))}
            </select>
          </label>
          {selectedModelInfo && (
            <div className="atto-model-badge">{selectedModelInfo.provider}</div>
          )}
        </div>

        <div className="atto-sidebar-section">
          <label className="atto-label">
            <span>Application Type</span>
            <select value={appType} onChange={(e) => setAppType(e.target.value)} disabled={pending}>
              {APP_TYPE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </label>
        </div>

        <div className="atto-sidebar-section">
          <label className="atto-inline">
            <input
              type="checkbox"
              checked={thinkingEnabled}
              onChange={(e) => setThinkingEnabled(e.target.checked)}
              disabled={pending}
            />
            <span>Extended thinking</span>
          </label>

          {thinkingEnabled && (
            <label className="atto-label">
              <span>Thinking budget (tokens)</span>
              <input
                type="number"
                min={THINKING_MIN}
                max={THINKING_MAX}
                step={THINKING_STEP}
                value={thinkingBudget}
                disabled={pending}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  if (!Number.isNaN(v)) setThinkingBudget(Math.max(THINKING_MIN, Math.min(THINKING_MAX, v)));
                }}
              />
            </label>
          )}

          <label className="atto-inline">
            <input
              type="checkbox"
              checked={showThinking}
              onChange={(e) => setShowThinking(e.target.checked)}
            />
            <span>Show thinking blocks</span>
          </label>
        </div>

        {usage && (
          <div className="atto-usage">
            <div className="atto-usage-title">Last run</div>
            <div className="atto-usage-row">
              <span>Input tokens</span>
              <span>{usage.usage.input_tokens.toLocaleString()}</span>
            </div>
            <div className="atto-usage-row">
              <span>Output tokens</span>
              <span>{usage.usage.output_tokens.toLocaleString()}</span>
            </div>
            {usage.total_cost_usd != null && (
              <div className="atto-usage-row atto-usage-cost">
                <span>Cost</span>
                <span>${usage.total_cost_usd.toFixed(4)}</span>
              </div>
            )}
            {usage.duration_ms != null && (
              <div className="atto-usage-row">
                <span>Duration</span>
                <span>{(usage.duration_ms / 1000).toFixed(1)}s</span>
              </div>
            )}
          </div>
        )}

        <div className="atto-sidebar-actions">
          <button type="button" onClick={handleReset} disabled={pending} className="atto-btn-secondary">
            New session
          </button>
          <button
            type="button"
            onClick={handleClearWorkspace}
            disabled={pending || clearing}
            className="atto-btn-danger"
          >
            Clear workspace
          </button>
        </div>
      </aside>

      {/* ── Main: conversation ──────────────────────── */}
      <main className="atto-main">
        <div className="atto-messages">
          {messages.length === 0 && (
            <div className="atto-empty">
              <p>Describe the test cases you need.</p>
              <p className="atto-empty-hint">
                e.g. &quot;Generate login test cases for happy path and invalid credentials&quot;
              </p>
            </div>
          )}

          {messages.map((msg, i) => {
            if (!showThinking && msg.role === 'thinking') return null;
            return (
              <div key={`${msg.id}-${i}`} className={`atto-msg atto-msg-${msg.role}`}>
                <div className="atto-msg-role">{msg.role}</div>
                <div className="atto-msg-body">
                  {msg.role === 'tool' && msg.toolCall ? (
                    <AttoToolCard tool={msg.toolCall} />
                  ) : msg.role === 'thinking' && msg.thinking ? (
                    <AttoThinkingCard thinking={msg.thinking} />
                  ) : (
                    <p>{msg.content}</p>
                  )}
                </div>
              </div>
            );
          })}

          {pending && (
            <div className="atto-msg atto-msg-system">
              <div className="atto-msg-role">agent</div>
              <div className="atto-msg-body atto-typing">
                <span /><span /><span />
              </div>
            </div>
          )}

          <div ref={bottomRef} />
        </div>

        {error && <div className="atto-error">{error}</div>}

        <div className="atto-input-area">
          <textarea
            rows={3}
            value={input}
            placeholder="Describe the test case(s) you want to generate…"
            disabled={pending}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
          />
          <div className="atto-input-actions">
            <button
              type="button"
              onClick={handleSend}
              disabled={pending || !input.trim()}
              className="atto-btn-primary"
            >
              {pending ? 'Generating…' : 'Generate'}
            </button>
            {pending && (
              <button type="button" onClick={() => abortRef.current?.abort()} className="atto-btn-secondary">
                Stop
              </button>
            )}
          </div>
        </div>
      </main>

      {/* ── Right panel: generated test cases ───────── */}
      <aside className="atto-panel">
        <div className="atto-panel-header">
          <h2>Generated Test Cases</h2>
          <span className="atto-panel-count">{generatedFiles.length}</span>
        </div>

        {generatedFiles.length === 0 ? (
          <div className="atto-panel-empty">No test cases yet. Run a generation to see results here.</div>
        ) : (
          <>
            <div className="atto-file-list">
              {generatedFiles.map((f) => (
                <button
                  key={f.name}
                  type="button"
                  className={`atto-file-item ${selectedFile === f.name ? 'active' : ''}`}
                  onClick={() => setSelectedFile(f.name)}
                >
                  <span className="atto-file-icon">📄</span>
                  <span className="atto-file-name">{f.name}</span>
                </button>
              ))}
            </div>

            {selectedFileContent && (
              <div className="atto-file-viewer">
                <div className="atto-file-viewer-header">
                  <span>{selectedFile}</span>
                  <button
                    type="button"
                    className="atto-copy-btn"
                    onClick={() => navigator.clipboard.writeText(selectedFileContent)}
                  >
                    Copy
                  </button>
                </div>
                <pre className="atto-xml">{selectedFileContent}</pre>
              </div>
            )}
          </>
        )}
      </aside>
    </div>
  );
}

/* ------------------------------------------------------------------ sub-components */

function AttoToolCard({ tool }: { tool: ToolCallState }) {
  const statusLabel =
    tool.status === 'call' ? 'Calling' : tool.status === 'progress' ? 'Running' : tool.isError ? 'Failed' : 'Done';

  return (
    <div className={`atto-tool status-${tool.status} ${tool.isError ? 'is-error' : ''}`}>
      <div className="atto-tool-header">
        <span className="atto-tool-name">{tool.name}</span>
        <span className={`atto-tool-badge status-${tool.status}`}>{statusLabel}</span>
        {tool.elapsedTimeSeconds != null && (
          <span className="atto-tool-time">{tool.elapsedTimeSeconds.toFixed(1)}s</span>
        )}
      </div>
      {tool.input != null && (
        <pre className="atto-tool-pre">{formatData(tool.input)}</pre>
      )}
    </div>
  );
}

function AttoThinkingCard({ thinking }: { thinking: ThinkingState }) {
  const [collapsed, setCollapsed] = useState(false);
  const streaming = thinking.status !== 'complete';

  return (
    <div className={`atto-thinking ${thinking.status}`}>
      <div className="atto-thinking-header">
        <span>{streaming ? 'Thinking…' : 'Thinking complete'}</span>
        {!streaming && (
          <button type="button" onClick={() => setCollapsed((c) => !c)}>
            {collapsed ? 'Show' : 'Hide'}
          </button>
        )}
      </div>
      {!collapsed && (
        <pre className="atto-thinking-body">
          {thinking.redacted ? '[Redacted]' : thinking.text || '…'}
        </pre>
      )}
    </div>
  );
}

function formatData(value: unknown): string {
  if (typeof value === 'string') return value;
  try { return JSON.stringify(value, null, 2); } catch { return String(value); }
}
