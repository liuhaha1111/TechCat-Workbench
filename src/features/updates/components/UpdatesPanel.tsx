import type { VersionSnapshot } from "../../../../electron/services/updateContracts";

interface UpdatesPanelProps {
  snapshot: VersionSnapshot;
  busy: boolean;
  onCheckApp: () => void;
  onCheckContent: () => void;
  onApplyAppUpdate: () => void;
  message?: string | null;
  theme?: "dark" | "light";
}

function formatStatus(
  state: VersionSnapshot["appUpdate"] | VersionSnapshot["contentUpdate"]
): string {
  switch (state.kind) {
    case "idle":
      return "Idle";
    case "checking":
      return "Checking for updates";
    case "available":
      return `Update ${state.version} available`;
    case "downloading":
      return `Downloading ${state.version}`;
    case "downloaded":
      return `Update ${state.version} ready`;
    case "error":
      return state.message;
    default:
      return "Unknown";
  }
}

export function UpdatesPanel({
  snapshot,
  busy,
  onCheckApp,
  onCheckContent,
  onApplyAppUpdate,
  message = null,
  theme = "dark",
}: UpdatesPanelProps) {
  const isLight = theme === "light";
  const canApplyAppUpdate = snapshot.appUpdate.kind === "downloaded";

  return (
    <section
      className={`rounded-2xl border px-4 py-4 backdrop-blur md:px-5 ${
        isLight
          ? "border-slate-200 bg-white/80 shadow-[0_20px_40px_-32px_rgba(15,23,42,0.18)]"
          : "border-white/10 bg-slate-900/40 shadow-[0_20px_40px_-32px_rgba(15,23,42,0.75)]"
      }`}
    >
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <p className={`text-xs uppercase tracking-[0.22em] ${isLight ? "text-slate-500" : "text-slate-400"}`}>
              App Version
            </p>
            <p className={`mt-1 font-heading text-lg font-semibold ${isLight ? "text-slate-900" : "text-slate-50"}`}>
              {snapshot.appVersion}
            </p>
          </div>
          <div>
            <p className={`text-xs uppercase tracking-[0.22em] ${isLight ? "text-slate-500" : "text-slate-400"}`}>
              Content Bundle
            </p>
            <p className={`mt-1 font-heading text-lg font-semibold ${isLight ? "text-slate-900" : "text-slate-50"}`}>
              {snapshot.contentVersion ?? "Built-in"}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={onCheckApp}
            disabled={busy}
            className={`inline-flex items-center rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
              isLight
                ? "border-slate-300 bg-white text-slate-700 hover:bg-slate-100 disabled:bg-slate-100 disabled:text-slate-400"
                : "border-white/15 bg-white/10 text-slate-100 hover:bg-white/15 disabled:bg-white/5 disabled:text-slate-500"
            }`}
          >
            Check App Updates
          </button>
          <button
            type="button"
            onClick={onCheckContent}
            disabled={busy}
            className={`inline-flex items-center rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
              isLight
                ? "border-slate-300 bg-white text-slate-700 hover:bg-slate-100 disabled:bg-slate-100 disabled:text-slate-400"
                : "border-white/15 bg-white/10 text-slate-100 hover:bg-white/15 disabled:bg-white/5 disabled:text-slate-500"
            }`}
          >
            Check Content Updates
          </button>
          {canApplyAppUpdate ? (
            <button
              type="button"
              onClick={onApplyAppUpdate}
              disabled={busy}
              className={`inline-flex items-center rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                isLight
                  ? "border-emerald-300 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 disabled:bg-emerald-50/60 disabled:text-emerald-400"
                  : "border-emerald-500/40 bg-emerald-500/15 text-emerald-100 hover:bg-emerald-500/25 disabled:bg-emerald-500/10 disabled:text-emerald-300/60"
              }`}
            >
              Restart to Update
            </button>
          ) : null}
        </div>
      </div>

      <div className="mt-4 grid gap-2 text-sm md:grid-cols-2">
        <div
          className={`rounded-xl border px-3 py-3 ${
            isLight ? "border-slate-200 bg-slate-50 text-slate-700" : "border-white/10 bg-slate-950/45 text-slate-200"
          }`}
        >
          <span className={`text-xs uppercase tracking-[0.18em] ${isLight ? "text-slate-500" : "text-slate-400"}`}>
            App Update Status
          </span>
          <p className="mt-1">{formatStatus(snapshot.appUpdate)}</p>
        </div>
        <div
          className={`rounded-xl border px-3 py-3 ${
            isLight ? "border-slate-200 bg-slate-50 text-slate-700" : "border-white/10 bg-slate-950/45 text-slate-200"
          }`}
        >
          <span className={`text-xs uppercase tracking-[0.18em] ${isLight ? "text-slate-500" : "text-slate-400"}`}>
            Content Update Status
          </span>
          <p className="mt-1">{formatStatus(snapshot.contentUpdate)}</p>
        </div>
      </div>

      {message ? (
        <p className={`mt-3 text-sm ${isLight ? "text-[var(--wb-danger-text)]" : "text-[var(--wb-danger-text)]"}`}>
          {message}
        </p>
      ) : null}
    </section>
  );
}
