import { useState } from "react";

interface ScreenshotViewProps {
  screenshotUrl: string | null;
  isCapturing: boolean;
}

export function ScreenshotView({ screenshotUrl, isCapturing }: ScreenshotViewProps) {
  const [expanded, setExpanded] = useState(false);

  if (isCapturing) {
    return (
      <div className="flex items-center justify-center h-32 bg-gray-100 rounded-md border border-gray-200">
        <span className="text-xs text-gray-400">Capturing…</span>
      </div>
    );
  }

  if (!screenshotUrl) return null;

  return (
    <div>
      <img
        src={screenshotUrl}
        alt="Selected element"
        onClick={() => setExpanded(!expanded)}
        className={
          expanded
            ? "w-full object-contain rounded-md border border-blue-400 cursor-pointer"
            : "w-full max-h-32 object-contain rounded-md border border-gray-200 cursor-pointer hover:border-blue-400 transition-colors"
        }
      />
      <p className="text-[10px] text-gray-400 text-center mt-1">
        {expanded ? "click to collapse" : "click to expand"}
      </p>
    </div>
  );
}
