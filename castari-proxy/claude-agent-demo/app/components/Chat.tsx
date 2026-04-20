'use client';
/* eslint-disable @next/next/no-img-element */

import type {
  ChangeEvent,
  ClipboardEvent,
  DragEvent
} from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { ResultEvent, UIEvent } from '@/lib/types/events';
import type { ToolMode } from '@/lib/policy/permission';
import type { ImagePayload } from '@/lib/types/api';

type ChatImage = {
  id: string;
  url: string;
  mimeType: string;
};

type ToolCallState = {
  toolUseId: string;
  name: string;
  status: 'call' | 'progress' | 'result';
  input?: unknown;
  output?: unknown;
  elapsedTimeSeconds?: number;
  isError?: boolean;
  message?: string;
};

type ThinkingState = {
  id: string;
  text: string;
  status: 'stream' | 'complete';
  redacted?: boolean;
};

type ChatMessage = {
  id: string;
  role: 'user' | 'assistant' | 'system' | 'error' | 'tool' | 'thinking';
  content?: string;
  images?: ChatImage[];
  toolCall?: ToolCallState;
  thinking?: ThinkingState;
};

type PendingAttachment = {
  id: string;
  file: File;
  previewUrl: string;
};

type EncodedImage = ImagePayload;

const TOOL_MODE_LABELS: Record<ToolMode, string> = {
  safe: 'Safe tools',
  full: 'Full tools',
  atto: 'Atto tools'
};

const MODEL_OPTIONS = [
  { value: 'claude-sonnet-4-5-20250929', label: 'Claude Sonnet 4.5' },
  { value: 'claude-opus-4-1-20250805', label: 'Claude Opus 4.1' },
  { value: 'claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5' },
  { value: 'or:openai/gpt-5.1-codex', label: 'GPT-5.1 Codex (OpenAI)' },
  { value: 'or:openai/gpt-5.1-codex-mini', label: 'GPT-5.1 Codex Mini (OpenAI)' },
  { value: 'or:google/gemini-2.5-pro', label: 'Gemini 2.5 Pro (Google)' },
  { value: 'or:google/gemini-2.5-flash', label: 'Gemini 2.5 Flash (Google)' },
  { value: 'or:x-ai/grok-4', label: 'Grok 4 (xAI)' },
  { value: 'or:x-ai/grok-4-fast', label: 'Grok 4 Fast (xAI)' },
  { value: 'or:x-ai/grok-code-fast-1', label: 'Grok Code Fast (xAI)' },
  { value: 'or:moonshotai/kimi-k2-thinking', label: 'Kimi K2 Thinking (Moonshot)' },
  { value: 'or:z-ai/glm-4.6', label: 'GLM 4.6 (Z-AI)' },
];

const THINKING_BUDGET_MIN = 1_024;
const THINKING_BUDGET_MAX = 64_000;
const THINKING_BUDGET_STEP = 512;
const DEFAULT_THINKING_BUDGET = 8_000;

const MAX_ATTACHMENTS = 4;
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

export function Chat() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [model, setModel] = useState(MODEL_OPTIONS[0].value);
  const [toolMode, setToolMode] = useState<ToolMode>('safe');
  const [useProjectInstructions, setUseProjectInstructions] = useState(true);
  const [usage, setUsage] = useState<ResultEvent['data'] | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [thinkingEnabled, setThinkingEnabled] = useState(true);
  const [thinkingBudget, setThinkingBudget] = useState(DEFAULT_THINKING_BUDGET);
  const [showThinking, setShowThinking] = useState(true);
  const [attachments, setAttachments] = useState<PendingAttachment[]>([]);
  const [dragActive, setDragActive] = useState(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const assistantIndexRef = useRef<number | null>(null);
  const attachmentsRef = useRef<PendingAttachment[]>([]);

  useEffect(() => {
    attachmentsRef.current = attachments;
  }, [attachments]);

  useEffect(() => {
    return () => {
      attachmentsRef.current.forEach((attachment) => {
        URL.revokeObjectURL(attachment.previewUrl);
      });
    };
  }, []);

  const appendMessage = useCallback((message: ChatMessage) => {
    setMessages((prev) => [...prev, message]);
  }, []);

  const updateAssistantMessage = useCallback(
    (updater: (current: string) => string) => {
      setMessages((prev) => {
        const next = [...prev];
        if (assistantIndexRef.current === null) {
          assistantIndexRef.current = next.length;
          next.push({
            id: crypto.randomUUID(),
            role: 'assistant',
            content: ''
          });
        }
        const idx = assistantIndexRef.current!;
        const current = next[idx];
        next[idx] = {
          ...current,
          content: updater(current?.content ?? '')
        };
        return next;
      });
    },
    []
  );

  const finishAssistantMessage = useCallback(() => {
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
            content: `Session started with ${event.data.model}`
          });
          break;
        case 'partial':
          updateAssistantMessage((current) => current + event.data.textDelta);
          break;
        case 'assistant':
          updateAssistantMessage(() => event.data.text);
          finishAssistantMessage();
          break;
        case 'result':
          setUsage(event.data);
          break;
        case 'error':
          setError(event.data.message);
          appendMessage({
            id: crypto.randomUUID(),
            role: 'error',
            content: event.data.message
          });
          break;
        case 'thinking':
          setMessages((prev) => {
            const next = [...prev];
            const existingIndex = next.findIndex(
              (message) =>
                message.role === 'thinking' && message.thinking?.id === event.data.blockId
            );

            const updatedState: ThinkingState = (() => {
              if (existingIndex >= 0 && next[existingIndex].thinking) {
                const current = next[existingIndex].thinking!;
                const nextText =
                  event.data.status === 'delta'
                    ? `${current.text}${event.data.text ?? ''}`
                    : event.data.text ?? current.text;
                return {
                  id: current.id,
                  text: nextText,
                  status: event.data.status === 'complete' ? 'complete' : 'stream',
                  redacted: event.data.redacted ?? current.redacted
                };
              }
              return {
                id: event.data.blockId,
                text:
                  event.data.status === 'delta'
                    ? event.data.text ?? ''
                    : event.data.text ?? '',
                status: event.data.status === 'complete' ? 'complete' : 'stream',
                redacted: event.data.redacted
              };
            })();

            if (existingIndex >= 0) {
              next[existingIndex] = {
                ...next[existingIndex],
                thinking: updatedState
              };
            } else {
              next.push({
                id: event.data.blockId,
                role: 'thinking',
                thinking: updatedState
              });
            }
            return next;
          });
          break;
        case 'tool':
          setMessages((prev) => {
            const next = [...prev];
            const existingIndex = next.findIndex(
              (message) =>
                message.role === 'tool' && message.toolCall?.toolUseId === event.data.toolUseId
            );
            const previous = existingIndex >= 0 ? next[existingIndex].toolCall : undefined;
            const merged: ToolCallState = {
              toolUseId: event.data.toolUseId,
              name: event.data.name,
              status: event.data.status,
              input: event.data.input ?? previous?.input,
              output: event.data.output ?? previous?.output,
              elapsedTimeSeconds:
                event.data.elapsedTimeSeconds ?? previous?.elapsedTimeSeconds,
              isError: event.data.isError ?? previous?.isError,
              message: event.data.message ?? previous?.message
            };

            if (existingIndex >= 0) {
              next[existingIndex] = {
                ...next[existingIndex],
                toolCall: merged
              };
            } else {
              next.push({
                id: crypto.randomUUID(),
                role: 'tool',
                toolCall: merged
              });
            }
            return next;
          });
          break;
        case 'compact_boundary':
          appendMessage({
            id: crypto.randomUUID(),
            role: 'system',
            content: `Conversation compacted (${event.data.trigger})`
          });
          break;
        default:
          break;
      }
    },
    [appendMessage, finishAssistantMessage, updateAssistantMessage]
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
            const event = JSON.parse(line) as UIEvent;
            handleEvent(event);
          } catch (err) {
            console.error('Failed to parse stream line', err);
          }
        }
      }

      if (buffer.trim()) {
        try {
          const event = JSON.parse(buffer) as UIEvent;
          handleEvent(event);
        } catch (err) {
          console.error('Failed to parse trailing buffer', err);
        }
      }
    },
    [handleEvent]
  );

  const clearAttachments = useCallback(() => {
    setAttachments((prev) => {
      prev.forEach((attachment) => {
        URL.revokeObjectURL(attachment.previewUrl);
      });
      return [];
    });
  }, []);

  const handleFiles = useCallback(
    (files: FileList | File[]) => {
      const nextFiles = Array.from(files ?? []);
      if (nextFiles.length === 0) return;

      setAttachments((prev) => {
        const next = [...prev];
        for (const file of nextFiles) {
          if (next.length >= MAX_ATTACHMENTS) {
            setError(`You can attach up to ${MAX_ATTACHMENTS} images per turn.`);
            break;
          }
          if (!file.type.startsWith('image/')) {
            setError('Only image files are supported.');
            continue;
          }
          if (file.size > MAX_FILE_SIZE) {
            setError(`Images must be smaller than ${MAX_FILE_SIZE / (1024 * 1024)}MB.`);
            continue;
          }
          next.push({
            id: crypto.randomUUID(),
            file,
            previewUrl: URL.createObjectURL(file)
          });
        }
        return next;
      });
    },
    [setError]
  );

  const removeAttachment = useCallback((id: string) => {
    setAttachments((prev) => {
      const next: PendingAttachment[] = [];
      for (const attachment of prev) {
        if (attachment.id === id) {
          URL.revokeObjectURL(attachment.previewUrl);
          continue;
        }
        next.push(attachment);
      }
      return next;
    });
  }, []);

  const encodeAttachments = useCallback(async (): Promise<EncodedImage[]> => {
    const encodings: EncodedImage[] = [];
    for (const attachment of attachments) {
      const dataUrl = await readFileAsDataUrl(attachment.file);
      const base64 = dataUrl.split(',')[1];
      if (!base64) {
        throw new Error('Invalid image encoding');
      }
      encodings.push({
        id: attachment.id,
        mimeType: attachment.file.type,
        base64,
        size: attachment.file.size
      });
    }
    return encodings;
  }, [attachments]);

  const handleSend = useCallback(async () => {
    if (pending) return;

    const trimmed = input.trim();
    if (!trimmed && attachments.length === 0) {
      setError('Add a message or attach at least one image.');
      return;
    }

    setPending(true);
    setError(null);
    setUsage(null);
    assistantIndexRef.current = null;

    const controller = new AbortController();
    abortRef.current?.abort();
    abortRef.current = controller;

    let encodedImages: EncodedImage[] = [];
    try {
      encodedImages = await encodeAttachments();
    } catch {
      setPending(false);
      setError('Failed to process image attachment.');
      return;
    }

    const displayImages =
      encodedImages.length > 0
        ? encodedImages.map((image) => ({
            id: image.id,
            url: `data:${image.mimeType};base64,${image.base64}`,
            mimeType: image.mimeType
          }))
        : undefined;

    if (trimmed || (displayImages && displayImages.length > 0)) {
      appendMessage({
        id: crypto.randomUUID(),
        role: 'user',
        content: trimmed || undefined,
        images: displayImages
      });
    }

    setInput('');
    clearAttachments();

    try {
      const payload: Record<string, unknown> = {
        message: trimmed,
        model,
        toolMode,
        useProjectInstructions
      };

      if (sessionId) payload.sessionId = sessionId;
      if (encodedImages.length > 0) payload.images = encodedImages;
      payload.thinking = {
        enabled: thinkingEnabled,
        budgetTokens: thinkingBudget
      };

      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal
      });

      if (!response.ok) {
        const details = await response.text();
        throw new Error(details || `Request failed (${response.status})`);
      }

      await consumeStream(response);
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        return;
      }
      const message = err instanceof Error ? err.message : 'Unknown stream error';
      setError(message);
      appendMessage({
        id: crypto.randomUUID(),
        role: 'error',
        content: message
      });
    } finally {
      setPending(false);
      finishAssistantMessage();
    }
  }, [
    appendMessage,
    attachments.length,
    clearAttachments,
    consumeStream,
    encodeAttachments,
    finishAssistantMessage,
    input,
    model,
    pending,
    sessionId,
    thinkingEnabled,
    thinkingBudget,
    toolMode,
    useProjectInstructions
  ]);

  const handleStop = useCallback(() => {
    abortRef.current?.abort();
    setPending(false);
    finishAssistantMessage();
  }, [finishAssistantMessage]);

  const handleReset = useCallback(() => {
    abortRef.current?.abort();
    assistantIndexRef.current = null;
    setMessages([]);
    setUsage(null);
    setError(null);
    setSessionId(null);
    clearAttachments();
  }, [clearAttachments]);

  const handlePaste = useCallback(
    (event: ClipboardEvent<HTMLTextAreaElement>) => {
      if (event.clipboardData?.files?.length) {
        event.preventDefault();
        handleFiles(event.clipboardData.files);
      }
    },
    [handleFiles]
  );

  const handleDragEnter = useCallback((event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setDragActive(true);
  }, []);

  const handleDragLeave = useCallback((event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    if (event.currentTarget === event.target) {
      setDragActive(false);
    }
  }, []);

  const handleDrop = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      event.stopPropagation();
      setDragActive(false);
      if (event.dataTransfer?.files?.length) {
        handleFiles(event.dataTransfer.files);
      }
    },
    [handleFiles]
  );

  const handleFileInputChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      if (event.target.files) {
        handleFiles(event.target.files);
        event.target.value = '';
      }
    },
    [handleFiles]
  );

  const canSend = input.trim().length > 0 || attachments.length > 0;

  return (
    <>
      <div className="chat-sidebar">
        <div className="chat-sidebar-header">
          <h1>Claude Agent SDK Chat</h1>
          <p>Demo of using claude agent sdk with castari proxy for provider interoperability</p>
        </div>

        <div className="chat-sidebar-section">
          <label>
            <span>Model</span>
            <select
              value={model}
              onChange={(event) => setModel(event.target.value)}
              disabled={pending}
            >
              {MODEL_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <h2>Settings</h2>

        <div className="chat-sidebar-section">
          <label>
            <span>Tool mode</span>
            <select
              value={toolMode}
              onChange={(event) => setToolMode(event.target.value as ToolMode)}
              disabled={pending}
            >
              {Object.entries(TOOL_MODE_LABELS).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
          </label>

          <label className="inline">
            <input
              type="checkbox"
              checked={useProjectInstructions}
              disabled={pending}
              onChange={(event) => setUseProjectInstructions(event.target.checked)}
            />
            <span>Project instructions</span>
          </label>

          <label className="inline">
            <input
              type="checkbox"
              checked={showThinking}
              onChange={(event) => setShowThinking(event.target.checked)}
              disabled={pending}
            />
            <span>Show thinking</span>
          </label>
        </div>

        <div className="chat-sidebar-section">
          <label className="inline">
            <input
              type="checkbox"
              checked={thinkingEnabled}
              onChange={(event) => setThinkingEnabled(event.target.checked)}
              disabled={pending}
            />
            <span>Enable extended thinking</span>
          </label>

          <label>
            <span>Thinking budget (tokens)</span>
            <input
              type="number"
              min={THINKING_BUDGET_MIN}
              max={THINKING_BUDGET_MAX}
              step={THINKING_BUDGET_STEP}
              value={thinkingBudget}
              disabled={!thinkingEnabled || pending}
              onChange={(event: ChangeEvent<HTMLInputElement>) => {
                const value = Number(event.target.value);
                if (!Number.isNaN(value)) {
                  setThinkingBudget(
                    Math.max(THINKING_BUDGET_MIN, Math.min(THINKING_BUDGET_MAX, value))
                  );
                }
              }}
              onBlur={() =>
                setThinkingBudget((current) =>
                  Math.max(
                    THINKING_BUDGET_MIN,
                    Math.min(THINKING_BUDGET_MAX, Math.round(current / THINKING_BUDGET_STEP) * THINKING_BUDGET_STEP)
                  )
                )
              }
            />
          </label>
        </div>

        <button
          type="button"
          onClick={handleReset}
          disabled={pending}
        >
          New chat
        </button>
      </div>

      <div className="chat-main">
        <div className="chat-root">
          <div className="chat-window">
        {messages.length === 0 && (
          <div className="chat-empty">Send a message to start the conversation.</div>
        )}
        {messages.map((message, index) => {
          if (!showThinking && message.role === 'thinking') {
            return null;
          }
          return (
            <div key={`${message.id}-${index}`} className={`chat-message ${message.role}`}>
              <div className="chat-role">{message.role}</div>
              <div className="chat-content">
                {message.role === 'tool' && message.toolCall ? (
                  <ToolCallCard tool={message.toolCall} />
                ) : message.role === 'thinking' && message.thinking ? (
                  <ThinkingCard thinking={message.thinking} />
                ) : (
                  <>
                    {message.content && <p>{message.content}</p>}
                    {message.images && message.images.length > 0 && (
                      <div className="chat-images">
                        {message.images.map((image) => (
                          <img
                            key={image.id}
                            src={image.url}
                            alt="User attachment"
                            className="chat-image"
                          />
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {usage && (
        <div className="chat-usage">
          <span>Input tokens: {usage.usage.input_tokens}</span>
          <span>Output tokens: {usage.usage.output_tokens}</span>
          {usage.total_cost_usd != null && (
            <span>Cost: ${usage.total_cost_usd.toFixed(4)}</span>
          )}
        </div>
      )}

      {error && <div className="chat-error">{error}</div>}

      <div
        className={`chat-input ${dragActive ? 'drag-active' : ''}`}
        onDragEnter={handleDragEnter}
        onDragOver={(event) => {
          event.preventDefault();
          event.stopPropagation();
        }}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <div className="chat-input-container">
          <div className="chat-attachment-bar">
            <button
              type="button"
              className="chat-attach"
              onClick={() => fileInputRef.current?.click()}
              disabled={pending || attachments.length >= MAX_ATTACHMENTS}
            >
              Attach image
            </button>
            <span className="chat-attach-hint">
              Paste, drag &amp; drop, or upload images ({attachments.length}/{MAX_ATTACHMENTS})
            </span>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              hidden
              onChange={handleFileInputChange}
            />
          </div>

          {attachments.length > 0 && (
            <div className="chat-attachment-list">
              {attachments.map((attachment) => (
                <div key={attachment.id} className="chat-attachment">
                  <img src={attachment.previewUrl} alt="Attachment preview" />
                  <button
                    type="button"
                    aria-label="Remove attachment"
                    onClick={() => removeAttachment(attachment.id)}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="chat-input-wrapper">
            <textarea
              rows={1}
              value={input}
              placeholder="Ask the agent anything..."
              onChange={(event) => setInput(event.target.value)}
              onPaste={handlePaste}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault();
                  handleSend();
                }
              }}
              disabled={pending}
            />
            <div className="chat-input-actions">
              <button onClick={handleSend} disabled={pending || !canSend}>
                Send
              </button>
              <button onClick={handleStop} disabled={!pending}>
                Stop
              </button>
            </div>
          </div>
        </div>
      </div>
        </div>
      </div>
    </>
  );
}

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error ?? new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
}

function ThinkingCard({ thinking }: { thinking: ThinkingState }) {
  const [collapsed, setCollapsed] = useState(false);
  const isStreaming = thinking.status !== 'complete';
  const effectiveCollapsed = isStreaming ? false : collapsed;

  return (
    <div className={`thinking-card ${thinking.status}`}>
      <div className="thinking-card-header">
        <div>
          <div className="thinking-card-title">
            {thinking.status === 'complete' ? 'Thinking complete' : 'Thinking...'}
          </div>
          {thinking.redacted && <span className="thinking-card-redacted">Redacted</span>}
        </div>
        <button
          type="button"
          className="thinking-card-toggle"
          onClick={() => setCollapsed((prev) => !prev)}
          disabled={isStreaming}
        >
          {effectiveCollapsed ? 'Show' : 'Hide'}
        </button>
      </div>
      {!effectiveCollapsed && (
        <div className="thinking-card-body">
          {thinking.redacted ? (
            <p>Some reasoning steps were redacted for safety.</p>
          ) : (
            <pre>{thinking.text || '...'}</pre>
          )}
        </div>
      )}
    </div>
  );
}

function ToolCallCard({ tool }: { tool: ToolCallState }) {
  return (
    <div className={`tool-card status-${tool.status} ${tool.isError ? 'status-error' : ''}`}>
      <div className="tool-card-header">
        <div>
          <div className="tool-card-name">{tool.name}</div>
          <div className="tool-card-meta">
            <span className={`tool-card-badge status-${tool.status}`}>
              {getToolStatusLabel(tool)}
            </span>
            {typeof tool.elapsedTimeSeconds === 'number' && (
              <span>{tool.elapsedTimeSeconds.toFixed(1)}s</span>
            )}
          </div>
        </div>
      </div>
      {tool.input !== undefined && (
        <div className="tool-card-section">
          <span>Input</span>
          <pre>{formatStructuredData(tool.input)}</pre>
        </div>
      )}
      {tool.output !== undefined && (
        <div className="tool-card-section">
          <span>Output</span>
          <pre>{formatStructuredData(tool.output)}</pre>
        </div>
      )}
      {tool.message && <div className="tool-card-message">{tool.message}</div>}
    </div>
  );
}

function getToolStatusLabel(tool: ToolCallState) {
  if (tool.status === 'call') return 'Requested';
  if (tool.status === 'progress') return 'Running';
  if (tool.status === 'result') {
    return tool.isError ? 'Failed' : 'Completed';
  }
  return 'Tool';
}

function formatStructuredData(value: unknown) {
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}
