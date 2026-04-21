import { useEffect, useState } from "react";
import type { VersionSnapshot } from "../../../../electron/services/updateContracts";
import { hasWorkbenchBridge } from "../../../lib/workbenchBridge";
import { updatesClient } from "../services/updatesClient";

export const DESKTOP_UPDATES_ONLY_MESSAGE =
  "Desktop update controls are available in the Electron app.";

const INITIAL_SNAPSHOT: VersionSnapshot = {
  appVersion: "0.0.0",
  contentVersion: null,
  appUpdate: { kind: "idle" },
  contentUpdate: { kind: "idle" },
};

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function useWorkbenchUpdates() {
  const [snapshot, setSnapshot] = useState<VersionSnapshot>(INITIAL_SNAPSHOT);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function refreshSnapshot(): Promise<void> {
    const nextSnapshot = await updatesClient.getStatus();
    setSnapshot(nextSnapshot);
    setError(null);
  }

  useEffect(() => {
    if (!hasWorkbenchBridge()) {
      setError(DESKTOP_UPDATES_ONLY_MESSAGE);
      return;
    }

    void refreshSnapshot().catch((requestError) => {
      setError(getErrorMessage(requestError));
    });
  }, []);

  async function runAction(
    action: () => Promise<unknown>,
    refreshAfter = true
  ): Promise<void> {
    if (!hasWorkbenchBridge()) {
      setError(DESKTOP_UPDATES_ONLY_MESSAGE);
      return;
    }

    setBusy(true);
    try {
      await action();
      if (refreshAfter) {
        await refreshSnapshot();
      } else {
        setError(null);
      }
    } catch (requestError) {
      setError(getErrorMessage(requestError));
    } finally {
      setBusy(false);
    }
  }

  return {
    snapshot,
    busy,
    error,
    refreshSnapshot: () => runAction(() => updatesClient.getStatus()),
    checkAppUpdate: () => runAction(() => updatesClient.checkAppUpdate()),
    checkContentUpdate: () => runAction(() => updatesClient.checkContentUpdate()),
    applyAppUpdate: () => runAction(() => updatesClient.applyAppUpdate(), false),
  };
}
