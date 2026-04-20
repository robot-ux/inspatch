import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type ClipboardEvent,
  type KeyboardEvent,
} from "react";
import type { ChangeMode } from "@inspatch/shared";
import { PaperclipIcon, SendIcon, XIcon } from "./icons";

interface Attachment {
  id: string;
  dataUrl: string;
}

interface ChangeInputProps {
  onSend: (description: string, imageDataUrl?: string, mode?: ChangeMode) => void;
  disabled?: boolean;
}

const MODE_LABELS: Record<ChangeMode, { label: string; hint: string }> = {
  quick: { label: "Quick", hint: "Apply directly · Claude escalates risky changes" },
  discuss: { label: "Discuss", hint: "Plan first · review before applying" },
};

const SUGGESTIONS: readonly string[] = [
  "Tighten spacing",
  "Make it look premium",
  "Use the brand accent",
  "Explain this component",
  "Improve accessibility",
];

const MAX_HEIGHT = 160;

function readImageFromFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("Failed to read image"));
    reader.readAsDataURL(file);
  });
}

export function ChangeInput({ onSend, disabled = false }: ChangeInputProps) {
  const [value, setValue] = useState("");
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [mode, setMode] = useState<ChangeMode>("quick");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const trimmed = value.trim();
  const canSend = (trimmed.length > 0 || attachments.length > 0) && !disabled;

  const adjustHeight = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    const next = Math.min(el.scrollHeight, MAX_HEIGHT);
    el.style.height = `${next}px`;
    el.style.overflowY = el.scrollHeight > MAX_HEIGHT ? "auto" : "hidden";
  }, []);

  useEffect(() => {
    adjustHeight();
  }, [adjustHeight, value]);

  const handleSend = useCallback(() => {
    if (!canSend) return;
    const first = attachments[0]?.dataUrl;
    onSend(trimmed || "(see attached screenshot)", first, mode);
    setValue("");
    setAttachments([]);
    requestAnimationFrame(() => {
      const el = textareaRef.current;
      if (el) {
        el.style.height = "auto";
        el.style.overflowY = "hidden";
      }
    });
  }, [canSend, trimmed, attachments, mode, onSend]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend],
  );

  const addAttachmentFromFile = useCallback(async (file: File) => {
    try {
      const dataUrl = await readImageFromFile(file);
      setAttachments((prev) => [...prev, { id: crypto.randomUUID(), dataUrl }]);
    } catch {
      // ignore read failures
    }
  }, []);

  const handlePaste = useCallback(
    async (e: ClipboardEvent<HTMLTextAreaElement>) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const item of items) {
        if (item.type.startsWith("image/")) {
          e.preventDefault();
          const file = item.getAsFile();
          if (file) await addAttachmentFromFile(file);
          return;
        }
      }
    },
    [addAttachmentFromFile],
  );

  const removeAttachment = useCallback((id: string) => {
    setAttachments((prev) => prev.filter((a) => a.id !== id));
  }, []);

  const handleFileInput = useCallback(
    async (e: ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (!files) return;
      for (const file of files) {
        if (file.type.startsWith("image/")) await addAttachmentFromFile(file);
      }
      e.target.value = "";
    },
    [addAttachmentFromFile],
  );

  const applySuggestion = useCallback((text: string) => {
    setValue(text);
    requestAnimationFrame(() => {
      const el = textareaRef.current;
      if (!el) return;
      el.focus();
      const end = el.value.length;
      el.setSelectionRange(end, end);
    });
  }, []);

  return (
    <div className="animate-slide-up border-t border-ip-border-subtle bg-ip-bg-secondary px-3 py-2">
      <div
        className={`flex items-end gap-2 rounded-ip-md border bg-ip-bg-input px-2 py-1.5 transition-colors ${
          disabled
            ? "border-ip-border-subtle opacity-60"
            : "border-ip-border-subtle focus-within:border-ip-border-accent"
        }`}
      >
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={disabled}
          aria-label="Attach screenshot"
          title="Attach screenshot"
          className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-ip-sm text-ip-text-muted transition-colors hover:bg-ip-bg-tertiary/50 hover:text-ip-text-accent active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <PaperclipIcon size={14} />
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={handleFileInput}
        />

        <div className="flex min-w-0 flex-1 flex-wrap items-end gap-1.5 py-0.5">
          {attachments.map((a) => (
            <div key={a.id} className="group relative flex-shrink-0 animate-fade-in-scale">
              <img
                src={a.dataUrl}
                alt="Attachment"
                className="h-8 w-8 rounded-ip-sm border border-ip-border-subtle object-cover"
              />
              <button
                type="button"
                onClick={() => removeAttachment(a.id)}
                aria-label="Remove attachment"
                className="absolute -right-1 -top-1 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-ip-bg-tertiary text-[9px] leading-none text-ip-text-primary opacity-0 transition-opacity group-hover:opacity-100 focus:opacity-100"
              >
                <XIcon size={10} />
              </button>
            </div>
          ))}

          <textarea
            ref={textareaRef}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            disabled={disabled}
            rows={1}
            placeholder="Describe the change… (⌘V to paste screenshot)"
            className="min-w-[120px] flex-1 resize-none bg-transparent text-[13px] leading-5 text-ip-text-primary placeholder:text-ip-text-muted focus:outline-none disabled:cursor-not-allowed"
            style={{ maxHeight: `${MAX_HEIGHT}px`, overflowY: "hidden" }}
          />
        </div>

        <button
          type="button"
          onClick={handleSend}
          disabled={!canSend}
          aria-label="Send"
          title="Send (Enter)"
          className={`flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-ip-sm transition-all duration-150 ${
            canSend
              ? "bg-linear-[135deg] from-ip-gradient-start to-ip-gradient-end text-white hover:brightness-110 hover:shadow-ip-glow-accent active:scale-95"
              : "cursor-not-allowed bg-ip-bg-tertiary text-ip-text-muted opacity-40"
          }`}
        >
          <SendIcon size={13} />
        </button>
      </div>

      <div className="-mx-1 mt-1.5 flex items-center gap-1.5 overflow-x-auto px-1 pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <button
          type="button"
          onClick={() => setMode((m) => (m === "quick" ? "discuss" : "quick"))}
          disabled={disabled}
          title={MODE_LABELS[mode].hint}
          aria-label={`Mode: ${MODE_LABELS[mode].label}. Click to switch.`}
          className={`h-6 flex-shrink-0 whitespace-nowrap rounded-full border px-2 text-[11px] font-medium transition-all duration-150 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40 ${
            mode === "quick"
              ? "border-ip-border-accent bg-ip-bg-tertiary/70 text-ip-text-accent"
              : "border-[rgba(163,166,255,0.40)] bg-ip-info-muted text-ip-info"
          }`}
        >
          {mode === "quick" ? "⚡ Quick" : "💬 Discuss"}
        </button>
        <div className="h-4 w-px flex-shrink-0 bg-ip-border-subtle" />
        {SUGGESTIONS.map((text) => (
          <button
            key={text}
            type="button"
            onClick={() => applySuggestion(text)}
            disabled={disabled}
            className="h-6 flex-shrink-0 whitespace-nowrap rounded-full border border-ip-border-subtle bg-ip-bg-tertiary/40 px-2 text-[11px] text-ip-text-secondary transition-all duration-150 hover:border-ip-border-accent hover:bg-ip-bg-tertiary/70 hover:text-ip-text-primary active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {text}
          </button>
        ))}
      </div>

      <p className="mt-1 select-none text-center text-[10px] text-ip-text-muted/50">
        ↵ Send · ⇧↵ New line
      </p>
    </div>
  );
}
