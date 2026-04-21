'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { ResultEvent, UIEvent } from '@/lib/types/events';
import { ATTO_MODEL_OPTIONS, PORTKEY_MODEL_OPTIONS, APP_TYPE_OPTIONS, type ProxyMode } from '@/lib/agent/atto-config';

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

const PROVIDER_COLORS: Record<string, string> = {
  Anthropic: '#c96442',
  Google: '#4285f4',
  OpenAI: '#10a37f',
  Meta: '#0866ff',
  Mistral: '#f54e42',
  Ollama: '#8b5cf6',
};

const EXAMPLE_PROMPTS = [
  'Generate login test cases — happy path and invalid credentials',
  'Generate an e-commerce checkout flow with 3 steps',
  'Generate password reset flow test cases',
  'Generate search functionality test cases',
];

/* ================================================================== component */

export function AttoChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [proxyMode, setProxyMode] = useState<ProxyMode>('cloudflare');
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
  const [activeModel, setActiveModel] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

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
          setActiveModel(event.data.model);
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

  const handleSend = useCallback(async (overrideInput?: string) => {
    const text = overrideInput ?? input;
    if (pending || !text.trim()) return;
    setPending(true);
    setError(null);
    setUsage(null);
    assistantIndexRef.current = null;

    const controller = new AbortController();
    abortRef.current?.abort();
    abortRef.current = controller;

    appendMessage({ id: crypto.randomUUID(), role: 'user', content: text.trim() });
    setInput('');

    try {
      const payload: Record<string, unknown> = {
        query: text.trim(),
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
    setActiveModel(null);
  }, []);

  const handleCopy = useCallback(async (text: string) => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }, []);

  const activeModelOptions = proxyMode === 'portkey' ? PORTKEY_MODEL_OPTIONS : ATTO_MODEL_OPTIONS;
  const selectedModelInfo = activeModelOptions.find((m) => m.value === model);
  const selectedFileContent = generatedFiles.find((f) => f.name === selectedFile)?.content;
  const providerColor = selectedModelInfo ? PROVIDER_COLORS[selectedModelInfo.provider] ?? '#7c8fb3' : '#7c8fb3';
  const modelSupportsThinking = selectedModelInfo?.thinking ?? false;
  const modelToolUse = selectedModelInfo?.toolUse ?? 'full';

  const TOOL_USE_BADGE: Record<string, { label: string; color: string }> = {
    full:    { label: '✓ Tools', color: '#16a34a' },
    limited: { label: '⚠ Tools limited', color: '#d97706' },
    poor:    { label: '✗ Tools unreliable', color: '#dc2626' },
  };

  return (
    <div className="ac-shell">
      {/* ── Left sidebar ─────────────────────────────── */}
      <aside className="ac-sidebar">
        <div className="ac-brand">
          <span className="ac-brand-logo">Atto</span>
          <span className="ac-brand-sub">Test Case Generator</span>
        </div>

        {/* Proxy mode toggle */}
        <div className="ac-section">
          <span className="ac-section-label">Proxy Mode</span>
          <div style={{ display: 'flex', gap: '0.25rem' }}>
            {(['cloudflare', 'portkey'] as ProxyMode[]).map((mode) => {
              const active = proxyMode === mode;
              const color = mode === 'portkey' ? '#8b5cf6' : '#3b82f6';
              const label = mode === 'cloudflare' ? '☁ Cloudflare' : '🔑 Portkey';
              const first = mode === 'cloudflare' ? ATTO_MODEL_OPTIONS[0].value : PORTKEY_MODEL_OPTIONS[0].value;
              return (
                <button
                  key={mode}
                  disabled={pending}
                  onClick={() => { setProxyMode(mode); setModel(first); }}
                  style={{
                    flex: 1, padding: '0.35rem 0.5rem', fontSize: '0.75rem', fontWeight: 600,
                    borderRadius: '6px', border: `1px solid ${active ? color : '#334155'}`,
                    background: active ? `${color}18` : 'transparent',
                    color: active ? color : '#94a3b8',
                    cursor: pending ? 'not-allowed' : 'pointer', transition: 'all 0.15s',
                  }}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Model selector */}
        <div className="ac-section">
          <span className="ac-section-label">AI Model</span>
          <div className="ac-model-selector">
            <select
              value={model}
              onChange={(e) => { setModel(e.target.value); }}
              disabled={pending}
              className="ac-select"
            >
              {Array.from(new Set(activeModelOptions.map((o) => o.provider))).map((provider) => (
                <optgroup key={provider} label={provider === 'Ollama' ? '⚡ Local (Ollama)' : provider}>
                  {activeModelOptions.filter((o) => o.provider === provider).map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </optgroup>
              ))}
            </select>
            {selectedModelInfo && (
              <span
                className="ac-provider-pill"
                style={{ background: `${providerColor}22`, color: providerColor, borderColor: `${providerColor}44` }}
              >
                {selectedModelInfo.provider}
              </span>
            )}
          </div>
          {selectedModelInfo && (
            <div style={{ display: 'flex', gap: '0.35rem', marginTop: '0.4rem', flexWrap: 'wrap' }}>
              <span
                style={{
                  fontSize: '0.7rem', fontWeight: 600, padding: '0.1rem 0.45rem',
                  borderRadius: '999px', border: `1px solid ${TOOL_USE_BADGE[modelToolUse].color}44`,
                  color: TOOL_USE_BADGE[modelToolUse].color,
                  background: `${TOOL_USE_BADGE[modelToolUse].color}11`,
                }}
              >
                {TOOL_USE_BADGE[modelToolUse].label}
              </span>
              {modelSupportsThinking && (
                <span style={{ fontSize: '0.7rem', fontWeight: 600, padding: '0.1rem 0.45rem', borderRadius: '999px', border: '1px solid #6d28d944', color: '#6d28d9', background: '#6d28d911' }}>
                  💡 Thinking
                </span>
              )}
            </div>
          )}
          {selectedModelInfo?.note && modelToolUse !== 'full' && (
            <p style={{ fontSize: '0.7rem', color: '#d97706', marginTop: '0.3rem', lineHeight: 1.4 }}>
              {selectedModelInfo.note}
            </p>
          )}
        </div>

        {/* App type */}
        <div className="ac-section">
          <span className="ac-section-label">App Type</span>
          <select value={appType} onChange={(e) => setAppType(e.target.value)} disabled={pending} className="ac-select">
            {APP_TYPE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>

        {/* Thinking (Claude only) */}
        <div className="ac-section">
          <label className="ac-toggle" title={!modelSupportsThinking ? 'Extended thinking is only supported on Claude models' : undefined}>
            <input
              type="checkbox"
              checked={thinkingEnabled && modelSupportsThinking}
              onChange={(e) => setThinkingEnabled(e.target.checked)}
              disabled={pending || !modelSupportsThinking}
            />
            <span className="ac-toggle-track" />
            <span className="ac-toggle-label" style={{ opacity: modelSupportsThinking ? 1 : 0.4 }}>
              Extended thinking{!modelSupportsThinking ? ' (Claude only)' : ''}
            </span>
          </label>

          {thinkingEnabled && (
            <>
              <label className="ac-section-label" style={{ marginTop: '0.5rem' }}>
                Budget: {thinkingBudget.toLocaleString()} tokens
              </label>
              <input
                type="range"
                min={THINKING_MIN}
                max={THINKING_MAX}
                step={THINKING_STEP}
                value={thinkingBudget}
                disabled={pending}
                onChange={(e) => setThinkingBudget(Number(e.target.value))}
                className="ac-range"
              />
            </>
          )}

          <label className="ac-toggle" style={{ marginTop: '0.25rem' }}>
            <input
              type="checkbox"
              checked={showThinking}
              onChange={(e) => setShowThinking(e.target.checked)}
            />
            <span className="ac-toggle-track" />
            <span className="ac-toggle-label">Show thinking</span>
          </label>
        </div>

        {/* Usage stats */}
        {usage && (
          <div className="ac-usage">
            <span className="ac-usage-title">Last run</span>
            <div className="ac-usage-grid">
              <span>Input</span><span>{usage.usage.input_tokens.toLocaleString()}</span>
              <span>Output</span><span>{usage.usage.output_tokens.toLocaleString()}</span>
              {usage.duration_ms != null && (
                <><span>Time</span><span>{(usage.duration_ms / 1000).toFixed(1)}s</span></>
              )}
              {usage.total_cost_usd != null && (
                <><span className="ac-cost-label">Cost</span><span className="ac-cost-value">${usage.total_cost_usd.toFixed(4)}</span></>
              )}
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="ac-actions">
          <button type="button" onClick={handleReset} disabled={pending} className="ac-btn-ghost">
            New chat
          </button>
          <button type="button" onClick={handleClearWorkspace} disabled={pending || clearing} className="ac-btn-danger">
            Clear files
          </button>
        </div>
      </aside>

      {/* ── Centre: conversation ──────────────────────── */}
      <main className="ac-main">
        {/* Top bar showing active model */}
        <div className="ac-topbar">
          <div className="ac-topbar-model">
            <span className="ac-topbar-dot" style={{ background: providerColor }} />
            <span>{selectedModelInfo?.label ?? model}</span>
            {sessionId && <span className="ac-topbar-session">session active</span>}
          </div>
          {pending && (
            <div className="ac-topbar-status">
              <span className="ac-spinner" />
              Generating…
            </div>
          )}
        </div>

        {/* Messages */}
        <div className="ac-messages">
          {messages.length === 0 && !pending && (
            <div className="ac-empty">
              <div className="ac-empty-icon">✦</div>
              <p className="ac-empty-title">What test cases do you need?</p>
              <p className="ac-empty-sub">Describe a feature or flow and Atto will write structured XML test cases.</p>
              <div className="ac-prompts">
                {EXAMPLE_PROMPTS.map((p) => (
                  <button
                    key={p}
                    type="button"
                    className="ac-prompt-chip"
                    onClick={() => handleSend(p)}
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((msg, i) => {
            if (!showThinking && msg.role === 'thinking') return null;

            if (msg.role === 'user') {
              return (
                <div key={`${msg.id}-${i}`} className="ac-row ac-row-user">
                  <div className="ac-bubble ac-bubble-user">{msg.content}</div>
                </div>
              );
            }

            if (msg.role === 'assistant') {
              return (
                <div key={`${msg.id}-${i}`} className="ac-row ac-row-assistant">
                  <div className="ac-avatar" style={{ background: providerColor }}>
                    {selectedModelInfo?.provider?.charAt(0) ?? 'A'}
                  </div>
                  <div className="ac-bubble ac-bubble-assistant">
                    {msg.content || <span className="ac-placeholder">…</span>}
                  </div>
                </div>
              );
            }

            if (msg.role === 'tool' && msg.toolCall) {
              return (
                <div key={`${msg.id}-${i}`} className="ac-row ac-row-tool">
                  <AttoToolCard tool={msg.toolCall} />
                </div>
              );
            }

            if (msg.role === 'thinking' && msg.thinking) {
              return (
                <div key={`${msg.id}-${i}`} className="ac-row ac-row-thinking">
                  <AttoThinkingCard thinking={msg.thinking} />
                </div>
              );
            }

            if (msg.role === 'error') {
              return (
                <div key={`${msg.id}-${i}`} className="ac-row">
                  <div className="ac-bubble ac-bubble-error">{msg.content}</div>
                </div>
              );
            }

            return null;
          })}

          {pending && messages.filter(m => m.role !== 'user').length === 0 && (
            <div className="ac-row ac-row-assistant">
              <div className="ac-avatar" style={{ background: providerColor }}>
                {selectedModelInfo?.provider?.charAt(0) ?? 'A'}
              </div>
              <div className="ac-bubble ac-bubble-assistant">
                <div className="ac-typing"><span /><span /><span /></div>
              </div>
            </div>
          )}

          <div ref={bottomRef} />
        </div>

        {error && <div className="ac-error-bar">{error}</div>}

        {/* Input */}
        <div className="ac-input-row">
          <textarea
            rows={3}
            value={input}
            placeholder="Describe the test cases you want to generate…"
            disabled={pending}
            className="ac-textarea"
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
          />
          <div className="ac-send-row">
            <span className="ac-hint">Enter to send · Shift+Enter for newline</span>
            <div className="ac-send-btns">
              {pending && (
                <button type="button" onClick={() => abortRef.current?.abort()} className="ac-btn-ghost">
                  Stop
                </button>
              )}
              <button
                type="button"
                onClick={() => handleSend()}
                disabled={pending || !input.trim()}
                className="ac-btn-primary"
              >
                {pending ? 'Generating…' : 'Generate'}
              </button>
            </div>
          </div>
        </div>
      </main>

      {/* ── Right panel: generated files ─────────────── */}
      <aside className="ac-panel">
        <div className="ac-panel-head">
          <span className="ac-panel-title">Generated Files</span>
          <span className="ac-panel-badge">{generatedFiles.length}</span>
        </div>

        {generatedFiles.length === 0 ? (
          <div className="ac-panel-empty">
            <div className="ac-panel-empty-icon">📂</div>
            <p>No files yet.</p>
            <p>Run a generation and XML test cases will appear here.</p>
          </div>
        ) : (
          <>
            <div className="ac-file-list">
              {generatedFiles.map((f) => (
                <button
                  key={f.name}
                  type="button"
                  className={`ac-file-btn ${selectedFile === f.name ? 'active' : ''}`}
                  onClick={() => setSelectedFile(f.name)}
                >
                  <svg className="ac-file-icon" viewBox="0 0 16 16" fill="none">
                    <path d="M3 2h7l3 3v9H3V2z" stroke="currentColor" strokeWidth="1.2" fill="none"/>
                    <path d="M10 2v3h3" stroke="currentColor" strokeWidth="1.2"/>
                    <path d="M5 7h6M5 9.5h4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
                  </svg>
                  <span className="ac-file-name">{f.name.replace('.xml', '')}</span>
                  <span className="ac-file-ext">.xml</span>
                </button>
              ))}
            </div>

            {selectedFileContent && (
              <div className="ac-viewer">
                <div className="ac-viewer-head">
                  <span className="ac-viewer-name">{selectedFile}</span>
                  <button
                    type="button"
                    className="ac-copy-btn"
                    onClick={() => handleCopy(selectedFileContent)}
                  >
                    {copied ? 'Copied!' : 'Copy'}
                  </button>
                </div>
                <pre className="ac-viewer-code">{selectedFileContent}</pre>
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
  const [expanded, setExpanded] = useState(false);

  const icon = tool.name === 'Write' ? '✎' : tool.name === 'Read' ? '◎' : tool.name === 'Glob' ? '⊞' : '⊡';
  const isWrite = tool.name === 'Write';
  const filePath = (tool.input as { file_path?: string })?.file_path?.split('/').pop() ?? '';

  const statusColor = tool.isError ? '#d66d6d' : tool.status === 'result' ? '#6dbf7e' : '#d4a830';
  const statusLabel = tool.isError ? 'failed' : tool.status === 'call' ? 'calling' : tool.status === 'progress' ? 'running' : 'done';

  return (
    <div className={`ac-tool ${tool.status} ${tool.isError ? 'error' : ''}`}>
      <button type="button" className="ac-tool-header" onClick={() => setExpanded((x) => !x)}>
        <span className="ac-tool-icon">{icon}</span>
        <span className="ac-tool-name">{tool.name}</span>
        {filePath && <span className="ac-tool-path">{filePath}</span>}
        <span className="ac-tool-status" style={{ color: statusColor }}>{statusLabel}</span>
        {tool.elapsedTimeSeconds != null && (
          <span className="ac-tool-time">{tool.elapsedTimeSeconds.toFixed(1)}s</span>
        )}
        <span className="ac-tool-chevron">{expanded ? '▲' : '▼'}</span>
      </button>

      {expanded && tool.input != null && (
        <pre className="ac-tool-body">{formatData(tool.input)}</pre>
      )}

      {isWrite && tool.status === 'result' && (
        <div className="ac-tool-written">
          <svg viewBox="0 0 16 16" width="12" height="12" fill="none">
            <path d="M2 8l4 4 8-8" stroke="#6dbf7e" strokeWidth="2" strokeLinecap="round"/>
          </svg>
          Test case written
        </div>
      )}
    </div>
  );
}

function AttoThinkingCard({ thinking }: { thinking: ThinkingState }) {
  const [collapsed, setCollapsed] = useState(false);
  const streaming = thinking.status !== 'complete';

  return (
    <div className={`ac-thinking ${thinking.status}`}>
      <div className="ac-thinking-head">
        <span className="ac-thinking-dot" />
        <span>{streaming ? 'Thinking…' : 'Thought process'}</span>
        {!streaming && (
          <button type="button" onClick={() => setCollapsed((c) => !c)} className="ac-thinking-toggle">
            {collapsed ? 'Show' : 'Hide'}
          </button>
        )}
      </div>
      {!collapsed && (
        <pre className="ac-thinking-body">
          {thinking.redacted ? '[Redacted by provider]' : thinking.text || '…'}
        </pre>
      )}
    </div>
  );
}

function formatData(value: unknown): string {
  if (typeof value === 'string') return value;
  try { return JSON.stringify(value, null, 2); } catch { return String(value); }
}
