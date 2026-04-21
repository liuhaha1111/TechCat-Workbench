import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer } from "node:http";
import path from "node:path";

const MIME_TYPES = {
  ".css": "text/css; charset=utf-8",
  ".gif": "image/gif",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".mjs": "text/javascript; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".webp": "image/webp",
};

const [rootArg, portArg] = process.argv.slice(2);

if (!rootArg || !portArg) {
  console.error("Usage: node staticPreviewServer.mjs <root-path> <port>");
  process.exit(1);
}

const rootPath = path.resolve(rootArg);
const port = Number(portArg);

if (!Number.isInteger(port) || port <= 0) {
  console.error(`Invalid port: ${portArg}`);
  process.exit(1);
}

function isInsideRoot(targetPath) {
  const relative = path.relative(rootPath, targetPath);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

async function resolveFile(requestPath) {
  const decodedPath = decodeURIComponent(requestPath);
  const relativePath = decodedPath.replace(/^\/+/, "");
  const requested = path.resolve(rootPath, relativePath || "index.html");

  if (!isInsideRoot(requested)) {
    return null;
  }

  let candidate = requested;
  let details = await stat(candidate).catch(() => null);

  if (details?.isDirectory()) {
    candidate = path.join(candidate, "index.html");
    details = await stat(candidate).catch(() => null);
  }

  if (details?.isFile()) {
    return candidate;
  }

  const fallback = path.join(rootPath, "index.html");
  const fallbackDetails = await stat(fallback).catch(() => null);
  if (fallbackDetails?.isFile()) {
    return fallback;
  }

  return null;
}

createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    const filePath = await resolveFile(url.pathname);
    if (!filePath) {
      res.statusCode = 404;
      res.end("Not found");
      return;
    }

    const extension = path.extname(filePath).toLowerCase();
    res.statusCode = 200;
    res.setHeader(
      "Content-Type",
      MIME_TYPES[extension] ?? "application/octet-stream"
    );
    createReadStream(filePath).pipe(res);
  } catch (error) {
    res.statusCode = 500;
    res.end(error instanceof Error ? error.message : String(error));
  }
}).listen(port, "0.0.0.0");
