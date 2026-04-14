import { useState, useCallback } from "react";
import { createLogger } from "@inspatch/shared";

const logger = createLogger("screenshot");

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Failed to load screenshot image"));
    img.src = src;
  });
}

async function cropScreenshot(
  fullDataUrl: string,
  rect: { x: number; y: number; width: number; height: number },
  dpr: number,
): Promise<string> {
  const img = await loadImage(fullDataUrl);
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d")!;

  let sx = Math.max(0, rect.x * dpr);
  let sy = Math.max(0, rect.y * dpr);
  let sw = Math.min(rect.width * dpr, img.width - sx);
  let sh = Math.min(rect.height * dpr, img.height - sy);

  const MAX_DIM = 1920;
  let outputW = sw;
  let outputH = sh;
  if (outputW > MAX_DIM || outputH > MAX_DIM) {
    const scale = MAX_DIM / Math.max(outputW, outputH);
    outputW = Math.round(outputW * scale);
    outputH = Math.round(outputH * scale);
  }

  canvas.width = outputW;
  canvas.height = outputH;
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, outputW, outputH);

  if (rect.width <= 200 && rect.height <= 200) {
    return canvas.toDataURL("image/png");
  }
  return canvas.toDataURL("image/jpeg", 0.80);
}

export function useScreenshot() {
  const [screenshotUrl, setScreenshotUrl] = useState<string | null>(null);
  const [isCapturing, setIsCapturing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const capture = useCallback(
    async (
      boundingRect: { x: number; y: number; width: number; height: number },
      devicePixelRatio: number,
    ): Promise<string | null> => {
      setIsCapturing(true);
      setError(null);
      try {
        const fullDataUrl = await chrome.tabs.captureVisibleTab(undefined as unknown as number, {
          format: "png",
          quality: 100,
        });
        const cropped = await cropScreenshot(fullDataUrl, boundingRect, devicePixelRatio);
        setScreenshotUrl(cropped);
        setIsCapturing(false);
        return cropped;
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Screenshot capture failed";
        logger.error(msg);
        setError(msg);
        setIsCapturing(false);
        return null;
      }
    },
    [],
  );

  const clear = useCallback(() => setScreenshotUrl(null), []);

  return { screenshotUrl, isCapturing, error, capture, clear };
}
