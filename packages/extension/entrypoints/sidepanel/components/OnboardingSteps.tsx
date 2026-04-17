import { CrosshairIcon } from "./icons";

const STEPS: ReadonlyArray<{ title: string; hint: string }> = [
  { title: "Inspect an element", hint: "Click any DOM node on your localhost page" },
  { title: "Describe the change", hint: "Type a prompt or paste a screenshot" },
  { title: "Claude edits your code", hint: "Source file updated live in your editor" },
];

interface OnboardingStepsProps {
  onStartInspect: () => void;
  disabled?: boolean;
}

export function OnboardingSteps({ onStartInspect, disabled = false }: OnboardingStepsProps) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-7 px-6">
      <ol className="flex w-full flex-col gap-4">
        {STEPS.map((step, idx) => (
          <li
            key={step.title}
            className="flex items-start gap-3 opacity-0 animate-fade-in"
            style={{ animationDelay: `${idx * 60}ms` }}
          >
            <span className="mt-[3px] w-5 flex-shrink-0 select-none font-code text-[10px] text-ip-border-muted">
              {String(idx + 1).padStart(2, "0")}
            </span>
            <div className="flex flex-col gap-0.5">
              <span className="text-[12px] font-medium leading-tight text-ip-text-secondary">
                {step.title}
              </span>
              <span className="text-[11px] leading-snug text-ip-text-muted">{step.hint}</span>
            </div>
          </li>
        ))}
      </ol>

      <div
        className="h-px w-full animate-fade-in bg-ip-border-subtle opacity-60"
        style={{ animationDelay: "200ms" }}
      />

      <div
        className="flex flex-col items-center gap-2.5 animate-fade-in"
        style={{ animationDelay: "240ms" }}
      >
        <button
          type="button"
          onClick={onStartInspect}
          disabled={disabled}
          className="inline-flex items-center gap-2 rounded-ip-lg bg-linear-[135deg] from-ip-gradient-start to-ip-gradient-end px-6 py-2.5 text-[13px] font-semibold text-white shadow-ip-card transition-all duration-150 hover:brightness-110 hover:shadow-ip-glow-accent active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <CrosshairIcon size={14} />
          Start Inspect
        </button>
        <p className="select-none text-[11px] tracking-wide text-ip-text-muted">
          Click any element on the page
        </p>
      </div>
    </div>
  );
}
