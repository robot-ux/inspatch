import { useState, useCallback, type KeyboardEvent } from "react";

interface ChangeInputProps {
  onSend: (description: string) => void;
  disabled?: boolean;
}

export function ChangeInput({ onSend, disabled }: ChangeInputProps) {
  const [value, setValue] = useState("");

  const trimmed = value.trim();
  const canSend = trimmed.length > 0 && !disabled;

  const handleSend = useCallback(() => {
    if (!canSend) return;
    onSend(trimmed);
    setValue("");
  }, [canSend, trimmed, onSend]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend],
  );

  return (
    <div className="border-t border-gray-200 p-3 bg-white">
      <textarea
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        disabled={disabled}
        rows={3}
        placeholder={"Describe the change you want…\ne.g., Make this button larger\ne.g., Change the text color to purple"}
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
