interface FileUrlPermissionBannerProps {
  extensionId: string;
}

// Chrome blocks programmatic navigation to chrome:// URLs, so we show the user
// the exact deep-link string instead and let them paste it themselves.
export function FileUrlPermissionBanner({ extensionId }: FileUrlPermissionBannerProps) {
  const deepLink = extensionId
    ? `chrome://extensions/?id=${extensionId}`
    : "chrome://extensions";

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(deepLink);
    } catch {
      // Clipboard blocked — the user can still copy the text manually.
    }
  };

  return (
    <div className="animate-slide-down border-b border-ip-warning/30 bg-ip-warning-muted px-4 py-3">
      <p className="text-[12px] font-medium text-ip-warning">
        Inspatch needs &ldquo;Allow access to file URLs&rdquo; for local HTML files
      </p>
      <ol className="mt-1.5 list-decimal space-y-0.5 pl-4 text-[11px] text-ip-warning">
        <li>Open the address below in Chrome</li>
        <li>Toggle <span className="font-semibold">Allow access to file URLs</span> on</li>
        <li>Reload the file:// tab</li>
      </ol>
      <div className="mt-2 flex items-center gap-2">
        <code className="flex-1 truncate rounded-ip-sm bg-black/25 px-2 py-1 font-code text-[11px] text-ip-warning">
          {deepLink}
        </code>
        <button
          type="button"
          onClick={copy}
          className="rounded-ip-sm border border-ip-warning/40 px-2 py-1 font-code text-[11px] text-ip-warning transition-colors hover:bg-ip-warning-muted"
        >
          Copy
        </button>
      </div>
    </div>
  );
}
