import { isLightTheme, type WorkbenchTheme } from "./projectUi";

interface RuntimeLogsPanelProps {
  logs: string[];
  theme: WorkbenchTheme;
}

export function RuntimeLogsPanel({ logs, theme }: RuntimeLogsPanelProps) {
  const isLight = isLightTheme(theme);

  return (
    <div
      className={`rounded-2xl border p-4 ${
        isLight ? "border-slate-200 bg-white" : "border-white/10 bg-slate-900/70"
      }`}
    >
      <h3 className={`text-sm font-semibold uppercase tracking-wide ${isLight ? "text-slate-700" : "text-slate-200"}`}>
        Runtime Logs
      </h3>
      <div className="mt-3 h-64 overflow-y-auto rounded-lg border border-slate-700 bg-[#020617] p-3 font-mono text-xs text-slate-200">
        {logs.length === 0 ? (
          <div className="text-slate-500">No logs yet.</div>
        ) : (
          logs.map((line, index) => (
            <div key={`${index}-${line.slice(0, 20)}`} className="whitespace-pre-wrap">
              {line}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
