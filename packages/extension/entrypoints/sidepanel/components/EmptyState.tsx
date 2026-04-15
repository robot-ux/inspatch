interface EmptyStateProps {
  state: 'idle' | 'inspecting';
}

export function EmptyState({ state }: EmptyStateProps) {
  if (state === 'inspecting') {
    return (
      <div className="flex items-center justify-center h-full animate-fade-in">
        <div className="flex flex-col items-center gap-4">
          <div className="relative flex items-center justify-center w-10 h-10">
            <div className="absolute inset-0 rounded-full border border-ip-border-subtle" />
            <div className="w-5 h-5 rounded-full border-2 border-ip-gradient-start border-t-transparent animate-spin" />
          </div>
          <p className="text-[12px] text-ip-text-secondary text-center leading-relaxed">
            Click any element on the page
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center h-full gap-2 animate-fade-in">
      <p className="text-[11px] text-ip-text-muted text-center tracking-wide">
        Select an element to get started
      </p>
      <p className="text-[10px] text-ip-text-muted/40 text-center select-none">
        ↵ Send · ⇧↵ New line
      </p>
    </div>
  );
}
