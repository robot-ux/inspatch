import ReactMarkdown from "react-markdown";
import { mdComponents } from "./markdown";
import { CheckIcon, XIcon } from "./icons";
import { InspatchMark } from "./InspatchWordmark";
import { Pill } from "./Pill";

interface PlanProposalProps {
  plan: string;
  onApprove: () => void;
  onCancel: () => void;
  disabled?: boolean;
}

export function PlanProposal({ plan, onApprove, onCancel, disabled = false }: PlanProposalProps) {
  // Claude's plan is sent without the leading `## Plan` heading (stripped by
  // extractPlanBlock on the server). Render with a local header so the section
  // looks consistent with Inspatch's other cards.
  const body = plan.replace(/^##\s*Plan\s*\n?/i, "").trim();

  return (
    <div className="animate-fade-in-scale overflow-hidden rounded-ip-lg border border-ip-text-accent/30 bg-ip-info-muted">
      <div className="flex items-center gap-2 border-b border-ip-border-subtle bg-linear-[180deg] from-ip-warning-muted to-transparent px-4 py-2.5">
        <InspatchMark size={14} className="text-ip-text-primary" accent="#a3a6ff" />
        <span className="text-[13px] font-semibold tracking-tight text-ip-text-primary">
          inspatch · plan
        </span>
        <Pill tone="warning">auto-escalated</Pill>
      </div>

      <div className="space-y-3 px-4 py-3">
        <div className="rounded-ip-sm bg-ip-bg-primary p-3">
          <ReactMarkdown components={mdComponents}>{body}</ReactMarkdown>
        </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onApprove}
          disabled={disabled}
          className="flex items-center gap-1.5 rounded-ip-sm bg-linear-[135deg] from-ip-gradient-start to-ip-gradient-end px-3 py-1.5 text-[12px] font-semibold text-white transition-all duration-150 hover:brightness-110 hover:shadow-ip-glow-accent active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <CheckIcon size={12} />
          Apply plan
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={disabled}
          className="flex items-center gap-1.5 rounded-ip-sm border border-ip-border-subtle bg-ip-bg-tertiary/40 px-3 py-1.5 text-[12px] font-semibold text-ip-text-secondary transition-all duration-150 hover:border-ip-border-accent hover:bg-ip-bg-tertiary/70 hover:text-ip-text-primary active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <XIcon size={12} />
          Cancel
        </button>
      </div>

        <p className="text-[10px] text-ip-text-muted/60">
          Approving will re-run Claude to execute the plan. Cancel discards it.
        </p>
      </div>
    </div>
  );
}
