import { useState } from 'react';

export default function App() {
  const [connected] = useState(false);

  return (
    <div className="flex flex-col h-screen bg-white">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
        <h1 className="text-lg font-semibold text-gray-900">Inspatch</h1>
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${connected ? 'bg-green-500' : 'bg-gray-400'}`} />
          <span className="text-xs text-gray-500">
            {connected ? 'Connected' : 'Disconnected'}
          </span>
        </div>
      </div>

      <div className="flex-1 flex items-center justify-center p-6">
        <p className="text-sm text-gray-400 text-center">
          Select an element to get started
        </p>
      </div>
    </div>
  );
}
