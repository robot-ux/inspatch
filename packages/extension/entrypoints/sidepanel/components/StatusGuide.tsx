interface StatusGuideProps {
  onReconnect: () => void;
}

export function StatusGuide({ onReconnect }: StatusGuideProps) {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-4 px-2 animate-fade-in">
      <p className="text-[13px] text-ip-text-secondary text-center">
        Server not connected. Start the Inspatch server:
      </p>
      <div className="w-full bg-ip-bg-primary rounded-ip-md p-3">
        <code className="text-[12px] font-code text-ip-success block whitespace-pre-wrap">
          {`cd your-project\nnpx @inspatch/server --project .`}
        </code>
      </div>
      <button
        onClick={onReconnect}
        className="px-4 py-1.5 text-white text-[11px] font-semibold rounded-ip-md transition-all bg-linear-[135deg] from-ip-gradient-start to-ip-gradient-end hover:brightness-110"
      >
        Reconnect
      </button>
      <p className="text-[11px] text-ip-text-muted text-center">
        Requires <span className="font-code">bun</span> and <span className="font-code">claude</span> CLI to be installed
      </p>
    </div>
  );
}
