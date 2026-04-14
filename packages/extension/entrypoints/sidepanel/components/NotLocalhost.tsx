export function NotLocalhost() {
  return (
    <div className="flex-1 flex flex-col items-center justify-center p-6 gap-3 animate-fade-in">
      <div className="w-10 h-10 rounded-full bg-ip-bg-tertiary flex items-center justify-center">
        <span className="text-lg text-ip-text-muted">&#128274;</span>
      </div>
      <p className="text-[13px] font-semibold text-ip-text-primary text-center">Localhost only</p>
      <p className="text-[11px] text-ip-text-muted text-center leading-relaxed">
        Inspatch works with locally-served pages.<br />
        Navigate to a <span className="font-code text-ip-text-secondary">localhost</span> URL to start inspecting.
      </p>
    </div>
  );
}
