import { useState } from "react";
import { HeaderBar } from "../components/HeaderBar";
import { ChevronDownIcon, GlobeLockIcon, SparklesIcon } from "../components/icons";

const DOCS_URL = "https://github.com/robot-ux/inspatch#supported-urls";

interface NonLocalhostBlockedProps {
  currentUrl: string | undefined;
  lastSupportedUrl: string | undefined;
  firstTime: boolean;
}

export function NonLocalhostBlocked({
  currentUrl,
  lastSupportedUrl,
  firstTime,
}: NonLocalhostBlockedProps) {
  const [whyOpen, setWhyOpen] = useState(firstTime);

  const canOpen = typeof chrome !== "undefined" && !!chrome.tabs;
  const openDocs = () => {
    if (!canOpen) return;
    chrome.tabs.create({ url: DOCS_URL });
  };

  const title = firstTime
    ? "Welcome to Inspatch"
    : "Inspatch works on localhost or local HTML files";
  const subtitle = firstTime
    ? "Open your localhost dev server — or a local .html file — in this tab and Inspatch will pick up automatically."
    : "Open a localhost dev server or a local .html file in this tab to start inspecting.";
  const Icon = firstTime ? SparklesIcon : GlobeLockIcon;

  return (
    <div className="flex h-screen flex-col bg-ip-bg-primary">
      <HeaderBar notApplicable />

      <div className="flex-1 animate-fade-in space-y-3 overflow-y-auto p-4">
        <section className="flex flex-col items-center gap-4 rounded-ip-lg border border-ip-border-subtle bg-ip-bg-card px-5 py-6 shadow-ip-card">
          <div className="relative flex h-11 w-11 items-center justify-center">
            <div className="absolute inset-0 rounded-full bg-linear-[135deg] from-ip-gradient-start/20 to-ip-gradient-end/10 blur-md" />
            <div className="relative flex h-11 w-11 items-center justify-center rounded-ip-lg border border-ip-border-subtle bg-ip-bg-tertiary/60 text-ip-text-accent">
              <Icon size={20} />
            </div>
          </div>

          <div className="flex flex-col items-center gap-1 text-center">
            <h2 className="text-[14px] font-semibold leading-tight text-ip-text-primary">
              {title}
            </h2>
            <p className="max-w-[260px] text-[12px] leading-snug text-ip-text-muted">{subtitle}</p>
          </div>

          <div className="w-full space-y-1 rounded-ip-md border border-ip-border-subtle bg-ip-bg-primary/60 px-3 py-2">
            <p className="text-[10px] uppercase tracking-wider text-ip-text-muted">Current tab</p>
            <p
              className="truncate font-code text-[11px] text-ip-text-secondary"
              title={currentUrl || "Unknown URL"}
            >
              {currentUrl || "—"}
            </p>
          </div>

          {lastSupportedUrl && (
            <p className="flex items-center gap-1.5 text-[11px] text-ip-text-muted">
              <span>Last session</span>
              <span className="font-code text-ip-text-secondary">{lastSupportedUrl}</span>
            </p>
          )}

          <button
            type="button"
            onClick={openDocs}
            disabled={!canOpen}
            aria-label="Open Inspatch supported-URLs docs"
            className="text-[11px] text-ip-text-accent underline-offset-2 transition-colors hover:underline disabled:cursor-not-allowed disabled:opacity-50"
          >
            See docs
          </button>
        </section>

        <section className="overflow-hidden rounded-ip-md border border-ip-border-subtle bg-ip-bg-card">
          <button
            type="button"
            onClick={() => setWhyOpen((v) => !v)}
            className="flex w-full items-center justify-between px-3 py-2 text-[11px] text-ip-text-secondary transition-colors hover:text-ip-text-primary"
            aria-expanded={whyOpen}
          >
            <span>Why?</span>
            <ChevronDownIcon
              size={11}
              className={`text-ip-text-muted transition-transform duration-150 ${whyOpen ? "rotate-180" : ""}`}
            />
          </button>
          <div
            className="grid transition-[grid-template-rows] duration-200 ease-out"
            style={{ gridTemplateRows: whyOpen ? "1fr" : "0fr" }}
          >
            <div className="overflow-hidden">
              <div className="space-y-1.5 border-t border-ip-border-subtle px-3 pb-3 pt-2 text-[11px] leading-relaxed text-ip-text-muted">
                <p>
                  Inspatch edits source files on your machine. It attaches to localhost dev
                  servers and to local <span className="font-code">.html</span> files — both
                  cases where your source lives on disk.
                </p>
                <p>Production sites and other file types have no editable source to target.</p>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
