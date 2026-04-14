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
    <div className="border-t border-gray-200 p-3 bg-white animate-slide-up">
      {imageDataUrl && (
        <div className="relative mb-2 inline-block animate-fade-in-scale">
          <img
            src={imageDataUrl}
            alt="Pasted screenshot"
            className="max-h-28 rounded-md border border-gray-200 object-contain"
          />
          <button
            onClick={removeImage}
            className="absolute -top-1.5 -right-1.5 w-5 h-5 flex items-center justify-center bg-gray-700 hover:bg-gray-900 text-white text-xs rounded-full leading-none"
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
        className="w-full resize-none rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent placeholder:text-gray-400 disabled:bg-gray-50 disabled:text-gray-400"
      />
      <div className="flex justify-end mt-2">
        <button
          onClick={handleSend}
          disabled={!canSend}
          className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors"
        >
          Send
        </button>
      </div>
    </div>
  );
}
