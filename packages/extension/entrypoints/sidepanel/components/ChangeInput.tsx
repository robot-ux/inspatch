import { useState, useCallback, useRef, type KeyboardEvent, type ClipboardEvent } from "react";

interface ChangeInputProps {
  onSend: (description: string, imageDataUrl?: string) => void;
  disabled?: boolean;
}

function readImageFromClipboard(item: DataTransferItem): Promise<string> {
  return new Promise((resolve, reject) => {
    const blob = item.getAsFile();
    if (!blob) return reject(new Error("No file in clipboard"));
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("Failed to read image"));
    reader.readAsDataURL(blob);
  });
}

export function ChangeInput({ onSend, disabled }: ChangeInputProps) {
  const [value, setValue] = useState("");
  const [imageDataUrl, setImageDataUrl] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const trimmed = value.trim();
  const canSend = (trimmed.length > 0 || !!imageDataUrl) && !disabled;

  const handleSend = useCallback(() => {
    if (!canSend) return;
    onSend(trimmed || "(see attached screenshot)", imageDataUrl ?? undefined);
    setValue("");
    setImageDataUrl(null);
  }, [canSend, trimmed, imageDataUrl, onSend]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend],
  );

  const handlePaste = useCallback(async (e: ClipboardEvent<HTMLTextAreaElement>) => {
    const items = e.clipboardData?.items;
    if (!items) return;

    for (const item of items) {
      if (item.type.startsWith("image/")) {
        e.preventDefault();
        try {
          const dataUrl = await readImageFromClipboard(item);
          setImageDataUrl(dataUrl);
        } catch { /* ignore read failures */ }
        return;
      }
    }
  }, []);

  const removeImage = useCallback(() => setImageDataUrl(null), []);

  return (
    <div className="border-t border-ip-border-subtle p-3 bg-ip-bg-secondary animate-slide-up">
      {imageDataUrl && (
        <div className="relative mb-2 inline-block animate-fade-in-scale">
          <img
            src={imageDataUrl}
            alt="Pasted screenshot"
            className="max-h-28 rounded-ip-md border border-ip-border-subtle object-contain"
          />
          <button
            onClick={removeImage}
            aria-label="Remove image"
            className="absolute -top-1.5 -right-1.5 w-5 h-5 flex items-center justify-center bg-ip-bg-tertiary hover:bg-ip-text-muted text-white text-xs rounded-full leading-none"
            title="Remove image"
          >
            &times;
          </button>
        </div>
      )}
      <textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        onPaste={handlePaste}
        disabled={disabled}
        rows={3}
        placeholder={"Describe the change you want…\nPaste a screenshot with Cmd/Ctrl+V"}
        className="w-full resize-none rounded-ip-md border border-ip-border-subtle bg-ip-bg-input px-3 py-2 text-[13px] text-ip-text-primary focus:outline-none focus:ring-2 focus:ring-[rgba(99,102,241,0.2)] focus:border-ip-border-accent placeholder:text-ip-text-muted disabled:opacity-50 disabled:cursor-not-allowed"
      />
      <div className="flex justify-end mt-2">
        <button
          onClick={handleSend}
          disabled={!canSend}
          className={`px-4 py-1.5 text-[13px] font-semibold rounded-ip-md transition-all ${
            canSend
              ? 'bg-linear-[135deg] from-ip-gradient-start to-ip-gradient-end hover:brightness-110 text-white'
              : 'opacity-40 bg-ip-bg-tertiary text-ip-text-muted cursor-not-allowed'
          }`}
        >
          Send Change
        </button>
      </div>
    </div>
  );
}
