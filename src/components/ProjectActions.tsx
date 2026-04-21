import type { ProjectStatus } from "../types/project";

interface ProjectActionsProps {
  status: ProjectStatus;
  busy: boolean;
  onExecute: () => void;
  onStart: () => void;
  onStop: () => void;
  onRestart: () => void;
  onDelete: () => void;
}

export function ProjectActions({
  status,
  busy,
  onExecute,
  onStart,
  onStop,
  onRestart,
  onDelete,
}: ProjectActionsProps) {
  return (
    <div className="flex flex-wrap gap-2">
      <button
        type="button"
        onClick={onExecute}
        disabled={busy}
        className="cursor-pointer rounded-md bg-[var(--wb-accent)] px-3 py-2 text-sm font-semibold text-slate-950 transition-colors duration-200 ease-out hover:bg-emerald-300 disabled:cursor-not-allowed disabled:opacity-60"
      >
        Execute
      </button>
      {status === "stopped" || status === "error" ? (
        <button
          type="button"
          onClick={onStart}
          disabled={busy}
          className="cursor-pointer rounded-md border border-emerald-300/40 bg-emerald-500/10 px-3 py-2 text-sm font-medium text-[color:var(--wb-success-text)] transition-colors duration-200 ease-out hover:bg-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-60"
        >
          Start
        </button>
      ) : null}
      <button
        type="button"
        onClick={onRestart}
        disabled={busy}
        className="cursor-pointer rounded-md border border-[color:var(--wb-button-border)] bg-[color:var(--wb-button-bg)] px-3 py-2 text-sm font-medium text-[color:var(--wb-button-text)] transition-colors duration-200 ease-out hover:bg-[color:var(--wb-button-bg-hover)] disabled:cursor-not-allowed disabled:opacity-60"
      >
        Restart
      </button>
      {status !== "stopped" ? (
        <button
          type="button"
          onClick={onStop}
          disabled={busy}
          className="cursor-pointer rounded-md border border-rose-300/40 bg-rose-500/10 px-3 py-2 text-sm font-medium text-[color:var(--wb-danger-text)] transition-colors duration-200 ease-out hover:bg-rose-500/20 disabled:cursor-not-allowed disabled:opacity-60"
        >
          Stop
        </button>
      ) : null}
      <button
        type="button"
        onClick={onDelete}
        disabled={busy}
        className="cursor-pointer rounded-md border border-rose-400/50 bg-rose-500/15 px-3 py-2 text-sm font-medium text-[color:var(--wb-danger-text)] transition-colors duration-200 ease-out hover:bg-rose-500/25 disabled:cursor-not-allowed disabled:opacity-60"
      >
        Delete
      </button>
    </div>
  );
}
