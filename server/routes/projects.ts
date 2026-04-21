import { promises as fs } from "node:fs";
import path from "node:path";
import { Router } from "express";
import multer from "multer";
import type { ProjectApplicationService } from "../application/projectApplicationService";
import type { UploadedFile } from "../types";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 50 * 1024 * 1024,
    files: 5000,
  },
});

const deploymentRootValidationMessages = [
  "deploymentRootPath is required",
  "deploymentRootPath must be an absolute path",
  "deploymentRootPath must exist and be a directory",
] as const;

function formatError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

function countMatches(value: string, pattern: RegExp): number {
  return value.match(pattern)?.length ?? 0;
}

function decodeLatin1ToUtf8(value: string): string {
  try {
    return Buffer.from(value, "latin1").toString("utf8");
  } catch {
    return value;
  }
}

function decodePercentEncodedUtf8(value: string): string {
  if (!value) {
    return value;
  }

  const normalized = value.replace(/^utf-8''/i, "");
  if (!/%[0-9a-fA-F]{2}/.test(normalized)) {
    return value;
  }

  try {
    return decodeURIComponent(normalized);
  } catch {
    return value;
  }
}

function scoreDecodedText(value: string): number {
  const cjkCount = countMatches(value, /[\u3400-\u9fff]/g);
  const asciiPrintableCount = countMatches(value, /[ -~]/g);
  const replacementCount = countMatches(value, /\uFFFD/g);
  const controlCount = countMatches(value, /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g);
  const latin1SupplementCount = countMatches(value, /[\u00a1-\u00ff]/g);
  const percentEncodedByteCount = countMatches(value, /%[0-9a-fA-F]{2}/g);

  return (
    cjkCount * 8 +
    asciiPrintableCount -
    replacementCount * 4 -
    controlCount * 30 -
    latin1SupplementCount * 2 -
    percentEncodedByteCount * 6
  );
}

export function decodeMultipartText(value: string): string {
  if (!value) {
    return value;
  }

  const candidates = new Set<string>([value]);
  const firstPass = decodeLatin1ToUtf8(value);
  if (firstPass !== value) {
    candidates.add(firstPass);
  }
  const secondPass = decodeLatin1ToUtf8(firstPass);
  if (secondPass !== firstPass) {
    candidates.add(secondPass);
  }

  const percentDecoded = decodePercentEncodedUtf8(value);
  if (percentDecoded !== value) {
    candidates.add(percentDecoded);
  }
  const percentDecodedFromFirst = decodePercentEncodedUtf8(firstPass);
  if (percentDecodedFromFirst !== firstPass) {
    candidates.add(percentDecodedFromFirst);
  }

  let best = value;
  let bestScore = scoreDecodedText(value);
  for (const candidate of candidates.values()) {
    const score = scoreDecodedText(candidate);
    if (score > bestScore) {
      best = candidate;
      bestScore = score;
    }
  }

  return best;
}

function isDeploymentRootValidationError(message: string): boolean {
  return deploymentRootValidationMessages.some(
    (candidate) => candidate === message
  );
}

async function resolveDeploymentRootPath(
  value: unknown
): Promise<string> {
  const deploymentRootPath = decodeMultipartText(
    String(value ?? "").trim()
  );

  if (!deploymentRootPath) {
    throw new Error("deploymentRootPath is required");
  }
  if (!path.isAbsolute(deploymentRootPath)) {
    throw new Error("deploymentRootPath must be an absolute path");
  }

  const resolvedDeploymentRoot = path.resolve(deploymentRootPath);
  const stats = await fs.stat(resolvedDeploymentRoot).catch(() => null);
  if (!stats || !stats.isDirectory()) {
    throw new Error("deploymentRootPath must exist and be a directory");
  }

  return resolvedDeploymentRoot;
}

export function createProjectsRouter(
  projectApplicationService: ProjectApplicationService
): Router {
  const router = Router();

  router.get("/", (_req, res) => {
    const projects = projectApplicationService.listProjects();
    res.json({ projects });
  });

  router.get("/:id", (req, res) => {
    const project = projectApplicationService.getProject(req.params.id);
    if (!project) {
      res.status(404).json({ error: "Project not found" });
      return;
    }
    res.json({ project });
  });

  router.get("/:id/logs", (req, res) => {
    const project = projectApplicationService.getProject(req.params.id);
    if (!project) {
      res.status(404).json({ error: "Project not found" });
      return;
    }
    const logs = projectApplicationService.getProjectLogs(project.id);
    res.json({ logs });
  });

  router.get("/:id/logs/stream", (req, res) => {
    const project = projectApplicationService.getProject(req.params.id);
    if (!project) {
      res.status(404).json({ error: "Project not found" });
      return;
    }

    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      Connection: "keep-alive",
      "Cache-Control": "no-cache",
    });

    const existingLogs = projectApplicationService.getProjectLogs(project.id);
    res.write(`data: ${JSON.stringify({ type: "snapshot", logs: existingLogs })}\n\n`);

    const unsubscribe = projectApplicationService.subscribeLogs(project.id, (event) => {
      res.write(
        `data: ${JSON.stringify({
          type: "log",
          line: event.line,
          stream: event.stream,
          createdAt: event.createdAt,
        })}\n\n`
      );
    });

    req.on("close", () => {
      unsubscribe();
      res.end();
    });
  });

  router.post(
    "/import-zip",
    upload.single("file"),
    async (req, res): Promise<void> => {
      if (!req.file) {
        res.status(400).json({ error: "zip file is required" });
        return;
      }

      const fallbackName = decodeMultipartText(req.file.originalname);
      const rawName = (req.body?.name as string | undefined) ?? fallbackName;
      const name = decodeMultipartText(rawName);

      try {
        const deploymentRootPath = await resolveDeploymentRootPath(
          req.body?.deploymentRootPath
        );
        const project = await projectApplicationService.importZipBuffer(
          name,
          req.file.buffer,
          deploymentRootPath
        );
        res.status(201).json({ project });
      } catch (error) {
        const message = formatError(error);
        res.status(isDeploymentRootValidationError(message) ? 400 : 500).json({
          error: message,
        });
      }
    }
  );

  router.post(
    "/import-folder",
    upload.array("files"),
    async (req, res): Promise<void> => {
      const files = (req.files as Express.Multer.File[] | undefined) ?? [];
      if (files.length === 0) {
        res.status(400).json({ error: "folder files are required" });
        return;
      }

      const uploadedFiles: UploadedFile[] = files.map((file) => ({
        relativePath: decodeMultipartText(file.originalname),
        buffer: file.buffer,
      }));

      const defaultName = `folder-import-${new Date().toISOString().slice(0, 19)}`;
      const rawName = (req.body?.name as string | undefined) ?? defaultName;
      const name = decodeMultipartText(rawName);

      try {
        const deploymentRootPath = await resolveDeploymentRootPath(
          req.body?.deploymentRootPath
        );
        const project = await projectApplicationService.importFolderUpload(
          name,
          uploadedFiles,
          deploymentRootPath
        );
        res.status(201).json({ project });
      } catch (error) {
        const message = formatError(error);
        res.status(isDeploymentRootValidationError(message) ? 400 : 500).json({
          error: message,
        });
      }
    }
  );

  router.post("/:id/start", async (req, res): Promise<void> => {
    try {
      const project = await projectApplicationService.startProject(req.params.id);
      res.json({ project });
    } catch (error) {
      res.status(400).json({ error: formatError(error) });
    }
  });

  router.post("/:id/stop", async (req, res): Promise<void> => {
    try {
      const project = await projectApplicationService.stopProject(req.params.id);
      res.json({ project });
    } catch (error) {
      res.status(400).json({ error: formatError(error) });
    }
  });

  router.post("/:id/restart", async (req, res): Promise<void> => {
    try {
      const project = await projectApplicationService.restartProject(req.params.id);
      res.json({ project });
    } catch (error) {
      res.status(400).json({ error: formatError(error) });
    }
  });

  router.delete("/:id", async (req, res): Promise<void> => {
    try {
      const result = await projectApplicationService.deleteProject(req.params.id);
      res.json(result);
    } catch (error) {
      const message = formatError(error);
      const status = message.toLowerCase().includes("not found") ? 404 : 400;
      res.status(status).json({ error: message });
    }
  });

  router.get("/:id/preview-info", (req, res) => {
    try {
      const info = projectApplicationService.getPreviewInfo(req.params.id);
      res.json({ preview: info });
    } catch (error) {
      res.status(404).json({ error: formatError(error) });
    }
  });

  return router;
}
