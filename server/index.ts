import express from "express";
import { ProjectApplicationService } from "./application/projectApplicationService";
import { createDatabase } from "./db/client";
import { createProjectsRouter } from "./routes/projects";
import { LogService } from "./infrastructure/logService";
import { ProjectRepository } from "./infrastructure/projectRepository";
import { ProjectService } from "./services/projectService";

export function createWorkbenchServices() {
  const db = createDatabase(process.env.AI_WORKBENCH_DB_PATH);
  const projectRepository = new ProjectRepository(db);
  const logService = new LogService();
  const projectService = new ProjectService(projectRepository, logService);
  const projectApplicationService = new ProjectApplicationService(projectService);

  return {
    db,
    projectRepository,
    logService,
    projectService,
    projectApplicationService,
  };
}

export function createApp() {
  const app = express();
  const { projectApplicationService } = createWorkbenchServices();

  app.use(express.json({ limit: "10mb" }));
  app.use(express.urlencoded({ extended: true }));

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true });
  });

  app.use("/api/projects", createProjectsRouter(projectApplicationService));

  app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    const message = error instanceof Error ? error.message : "Unexpected error";
    res.status(500).json({ error: message });
  });

  return app;
}
