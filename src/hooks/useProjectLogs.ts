import { useEffect, useState } from "react";
import { projectsClient } from "../features/projects/services/projectsClient";

export function useProjectLogs(projectId: string | null): string[] {
  const [logs, setLogs] = useState<string[]>([]);

  useEffect(() => {
    setLogs([]);
    if (!projectId) {
      return;
    }

    let closed = false;
    const unsubscribe = projectsClient.subscribeProjectLogs(projectId, (payload) => {
      if (closed) {
        return;
      }

      if (payload.type === "snapshot") {
        setLogs(payload.logs);
        return;
      }

      if (payload.type === "log") {
        setLogs((current) => [...current.slice(-399), payload.line]);
      }
    });

    void projectsClient
      .getProjectLogs(projectId)
      .then((lines) => {
        if (!closed) {
          setLogs(lines);
        }
      })
      .catch(() => {
        // The desktop bridge subscription will still provide logs.
      });

    return () => {
      closed = true;
      unsubscribe();
    };
  }, [projectId]);

  return logs;
}
