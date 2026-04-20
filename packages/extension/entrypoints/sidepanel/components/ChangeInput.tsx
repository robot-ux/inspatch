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

const MIN_HEIGHT = 28;
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
    const next = Math.max(MIN_HEIGHT, Math.min(el.scrollHeight, MAX_HEIGHT));
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
        el.style.height = `${MIN_HEIGHT}px`;
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

  const hasAttachments = attachments.length > 0;

  return (
    <div className="animate-slide-up border-t border-ip-border-subtle bg-ip-bg-secondary px-3 py-2">
      <div
        className={`rounded-ip-md border bg-ip-bg-input transition-[border-color,box-shadow] duration-150 ${
          disabled
            ? "border-ip-border-subtle opacity-60"
            : "border-ip-border-subtle focus-within:border-ip-border-accent focus-within:shadow-ip-glow-accent"
        }`}
      >
        {hasAttachments && (
          <div className="flex flex-wrap gap-1.5 px-3 pb-1 pt-2.5">
            {attachments.map((a) => (
              <div key={a.id} className="group relative animate-fade-in-scale">
                <img
                  src={a.dataUrl}
                  alt="Attachment"
                  className="h-10 w-10 rounded-ip-sm border border-ip-border-subtle object-cover"
                />
                <button
                  type="button"
                  onClick={() => removeAttachment(a.id)}
                  aria-label="Remove attachment"
                  className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-ip-bg-tertiary text-ip-text-primary opacity-0 transition-opacity group-hover:opacity-100 focus:opacity-100"
                >
                  <XIcon size={10} />
                </button>
              </div>
            ))}
          </div>
        )}

        <div className={`px-3 pb-2 ${hasAttachments ? "pt-1" : "pt-2.5"}`}>
          <textarea
            ref={textareaRef}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            disabled={disabled}
            placeholder="Describe the change… (⌘V to paste screenshot)"
            className="block w-full resize-none appearance-none border-0 bg-transparent p-0 text-[13px] leading-5 text-ip-text-primary placeholder:text-ip-text-muted outline-none focus:outline-none focus:ring-0 disabled:cursor-not-allowed"
            style={{ minHeight: `${MIN_HEIGHT}px`, maxHeight: `${MAX_HEIGHT}px`, overflowY: "hidden" }}
          />
        </div>

        <div className="flex items-center gap-1.5 border-t border-ip-border-subtle/60 px-2 py-1.5">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={disabled}
            aria-label="Attach screenshot"
            title="Attach screenshot"
            className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-ip-sm text-ip-text-muted transition-colors hover:bg-ip-bg-tertiary/60 hover:text-ip-text-accent active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
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

          <ModeSegmented mode={mode} onChange={setMode} disabled={disabled} />

          <div className="flex-1" />

          <button
            type="button"
            onClick={handleSend}
            disabled={!canSend}
            aria-label="Send"
            title="Send (Enter)"
            className={`flex h-7 items-center gap-1.5 rounded-ip-sm px-2.5 text-[12px] font-medium transition-all duration-150 ${
              canSend
                ? "bg-linear-[135deg] from-ip-gradient-start to-ip-gradient-end text-white hover:brightness-110 hover:shadow-ip-glow-accent active:scale-95"
                : "cursor-not-allowed bg-ip-bg-tertiary text-ip-text-muted opacity-40"
            }`}
          >
            <SendIcon size={12} />
            <span>Send</span>
          </button>
        </div>
      </div>

      <div className="-mx-1 mt-1.5 flex items-center gap-1.5 overflow-x-auto px-1 pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
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

interface ModeSegmentedProps {
  mode: ChangeMode;
  onChange: (mode: ChangeMode) => void;
  disabled: boolean;
}

function ModeSegmented({ mode, onChange, disabled }: ModeSegmentedProps) {
  const options: ChangeMode[] = ["quick", "discuss"];
  return (
    <div
      role="radiogroup"
      aria-label="Change mode"
      className="inline-flex h-7 flex-none items-center rounded-ip-sm border border-ip-border-subtle bg-ip-bg-tertiary/30 p-0.5"
    >
      {options.map((opt) => {
        const active = mode === opt;
        return (
          <button
            key={opt}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(opt)}
            disabled={disabled}
            title={MODE_LABELS[opt].hint}
            className={`inline-flex h-6 items-center rounded-[5px] px-2 text-[11px] font-medium transition-all duration-150 disabled:cursor-not-allowed disabled:opacity-40 ${
              active
                ? "bg-ip-bg-primary text-ip-text-primary shadow-ip-card"
                : "text-ip-text-muted hover:text-ip-text-secondary"
            }`}
          >
            {MODE_LABELS[opt].label}
          </button>
        );
      })}
    </div>
  );
}
