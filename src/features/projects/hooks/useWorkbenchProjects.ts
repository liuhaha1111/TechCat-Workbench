import { useCallback, useEffect, useState } from "react";
import type { Project } from "../../../types/project";
import { projectsClient } from "../services/projectsClient";

export function useWorkbenchProjects(pollingMs = 2500) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      const next = await projectsClient.listProjects();
      setProjects(next);
      setError(null);
    } catch (requestError) {
      const message =
        requestError instanceof Error ? requestError.message : String(requestError);
      setError(message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
    const timer = window.setInterval(() => {
      void reload();
    }, pollingMs);

    return () => {
      window.clearInterval(timer);
    };
  }, [pollingMs, reload]);

  return {
    projects,
    loading,
    error,
    reload,
  };
}
