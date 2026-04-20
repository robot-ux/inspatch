import { CrosshairIcon } from "./icons";
import { InspatchWordmark } from "./InspatchWordmark";

const STEPS: ReadonlyArray<{ n: string; title: string; hint: string }> = [
  { n: "01", title: "Click Inspect", hint: "Pick any element. We capture component, file, line." },
  { n: "02", title: "Describe in plain English", hint: "\u201Cmake this button red, slightly larger radius\u201D." },
  { n: "03", title: "Diff lands here", hint: "Status streams live; git diff appears when done." },
];

interface OnboardingStepsProps {
  onStartInspect: () => void;
  disabled?: boolean;
}

export function OnboardingSteps({ onStartInspect, disabled = false }: OnboardingStepsProps) {
  return (
    <div className="flex h-full flex-col gap-5 animate-fade-in">
      <InspatchWordmark size="sm" />

      <div>
        <h1 className="text-[22px] font-semibold leading-[1.1] tracking-tight text-ip-text-primary">
          Click. Describe.
          <br />
          <span className="bg-linear-[135deg] from-ip-gradient-start to-ip-gradient-end bg-clip-text text-transparent">
            Watch the diff land.
          </span>
        </h1>
        <p className="mt-2.5 max-w-[320px] text-[12px] leading-relaxed text-ip-text-secondary">
          Inspatch lets you point at a UI element and have Claude edit the source — without leaving the browser.
        </p>
      </div>

      <ol className="rounded-ip-lg border border-ip-border-subtle bg-ip-bg-card px-3.5 py-1 backdrop-blur-sm">
        {STEPS.map((step, idx) => (
          <li
            key={step.n}
            className="flex gap-3.5 py-3 opacity-0 animate-fade-in [&:not(:last-child)]:border-b [&:not(:last-child)]:border-ip-border-muted"
            style={{ animationDelay: `${idx * 60}ms` }}
          >
            <span className="w-[22px] flex-none select-none font-code text-[11px] font-medium leading-[1.4] text-ip-text-accent">
              {step.n}
            </span>
            <div className="flex flex-col gap-0.5">
              <span className="text-[12.5px] font-medium leading-tight text-ip-text-primary">{step.title}</span>
              <span className="text-[11px] leading-snug text-ip-text-muted">{step.hint}</span>
            </div>
          </li>
        ))}
      </ol>

      <div className="mt-auto flex flex-col items-stretch gap-2">
        <button
          type="button"
          onClick={onStartInspect}
          disabled={disabled}
          className="inline-flex items-center justify-center gap-2 rounded-ip-lg bg-linear-[135deg] from-ip-gradient-start to-ip-gradient-end px-6 py-2.5 text-[13px] font-semibold text-white shadow-ip-card transition-all duration-150 hover:brightness-110 hover:shadow-ip-glow-accent active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
        >
          <CrosshairIcon size={14} />
          Start inspecting
        </button>
        <p className="select-none text-center text-[11px] tracking-wide text-ip-text-muted">
          Click any element on the page
        </p>
      </div>
    </div>
  );
}
