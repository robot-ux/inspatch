import { CrosshairIcon } from "./icons";

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
    <div className="flex h-full flex-col gap-6 animate-fade-in">
      <header className="flex flex-col gap-3">
        <h1 className="text-[28px] font-semibold leading-[1.05] tracking-tight text-ip-text-primary">
          Click. Describe.
          <br />
          <span className="bg-linear-[135deg] from-ip-gradient-start to-ip-gradient-end bg-clip-text text-transparent">
            Watch the diff land.
          </span>
        </h1>
        <span
          aria-hidden="true"
          className="h-[3px] w-10 rounded-full bg-linear-[135deg] from-ip-gradient-start to-ip-gradient-end"
        />
        <p className="max-w-[320px] text-[13px] leading-relaxed text-ip-text-secondary">
          Inspatch lets you point at a UI element and have Claude edit the source — without leaving the browser.
        </p>
      </header>

      <section className="flex flex-col gap-2.5">
        <p className="select-none text-[10px] font-medium uppercase tracking-[0.16em] text-ip-text-accent/70">
          Get started
        </p>
        <ol className="flex flex-col gap-2">
          {STEPS.map((step, idx) => (
            <li
              key={step.n}
              className="flex items-start gap-3 rounded-ip-md border border-ip-border-subtle bg-ip-bg-card px-3 py-2.5 opacity-0 animate-fade-in"
              style={{ animationDelay: `${idx * 70}ms` }}
            >
              <span className="flex h-7 w-7 flex-none select-none items-center justify-center rounded-ip-sm border border-ip-border-subtle bg-ip-bg-tertiary/60 font-code text-[11px] font-medium text-ip-text-accent">
                {step.n}
              </span>
              <div className="flex min-w-0 flex-col gap-0.5 pt-[2px]">
                <span className="text-[13px] font-semibold leading-tight text-ip-text-primary">
                  {step.title}
                </span>
                <span className="text-[11.5px] leading-snug text-ip-text-muted">{step.hint}</span>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <CodeTeaser />

      <div className="mt-auto flex flex-col items-stretch gap-2">
        <button
          type="button"
          onClick={onStartInspect}
          disabled={disabled}
          className="inline-flex items-center justify-center gap-2 rounded-ip-lg bg-linear-[135deg] from-ip-gradient-start to-ip-gradient-end px-6 py-3 text-[12px] font-semibold uppercase tracking-[0.14em] text-white shadow-ip-card transition-all duration-150 hover:brightness-110 hover:shadow-ip-glow-accent active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
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

// Decorative code teaser shown above the CTA. Pure ornament — fades into the
// background and is not selectable, so it never competes with the button.
function CodeTeaser() {
  return (
    <pre
      aria-hidden="true"
      className="select-none overflow-hidden rounded-ip-md border border-ip-border-subtle/60 bg-ip-bg-card/40 px-3 py-2 font-code text-[10.5px] leading-[1.55] text-ip-text-muted/70"
    >
      <span className="text-ip-text-muted/40">// pick · describe · ship</span>
      {"\n"}
      <span className="text-ip-text-secondary/70">{"<Button "}</span>
      <span className="text-ip-text-accent/70">onClick</span>
      <span className="text-ip-text-secondary/70">{"={inspatch}>"}</span>
      {"\n  Send change…\n"}
      <span className="text-ip-text-secondary/70">{"</Button>"}</span>
    </pre>
  );
}
