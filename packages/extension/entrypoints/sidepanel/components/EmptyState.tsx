interface EmptyStateProps {
  state: 'idle' | 'inspecting';
}

export function EmptyState({ state }: EmptyStateProps) {
  if (state === 'inspecting') {
    return (
      <div className="flex items-center justify-center h-full animate-fade-in">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 rounded-full border-2 border-ip-gradient-start border-t-transparent animate-spin" />
          <p className="text-[13px] text-ip-text-secondary text-center">
            Click any element on the page to select it
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center h-full animate-fade-in">
      <p className="text-[13px] text-ip-text-muted text-center">
        Select an element to get started
      </p>
    </div>
  );
}
