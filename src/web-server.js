#!/usr/bin/env node
import { createServer } from "node:http";
import { extname, join, normalize, resolve } from "node:path";
import { readFile, writeFile } from "node:fs/promises";

const ROOT = resolve(".");
const PUBLIC_DIR = join(ROOT, "public");
const CONFIG_PATH = join(ROOT, "config", "weekly.json");
const PORT = Number(process.env.PORT ?? 4173);

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml"
};

createServer(async (request, response) => {
  try {
    const url = new URL(request.url ?? "/", `http://${request.headers.host}`);

    if (request.method === "GET" && url.pathname === "/api/config") {
      return sendJson(response, JSON.parse(await readFile(CONFIG_PATH, "utf8")));
    }

    if (request.method === "POST" && url.pathname === "/api/config") {
      const body = await readBody(request);
      const config = JSON.parse(body);
      validateConfig(config);
      await writeFile(CONFIG_PATH, `${JSON.stringify(config, null, 2)}\n`);
      return sendJson(response, { ok: true });
    }

    if (request.method === "GET") {
      return serveStatic(url.pathname, response);
    }

    response.writeHead(405);
    response.end("Method not allowed");
  } catch (error) {
    response.writeHead(500, { "content-type": "application/json; charset=utf-8" });
    response.end(JSON.stringify({ error: error.message }));
  }
}).listen(PORT, "127.0.0.1", () => {
  console.log(`Config editor running at http://127.0.0.1:${PORT}`);
});

function validateConfig(config) {
  if (!config || typeof config !== "object" || Array.isArray(config)) {
    throw new Error("Config must be an object.");
  }

  if (!config.defaults || typeof config.defaults !== "object" || Array.isArray(config.defaults)) {
    throw new Error("Config must contain a defaults object.");
  }

  if (!Array.isArray(config.jobs)) {
    throw new Error("Config must contain a jobs array.");
  }
}

async function serveStatic(pathname, response) {
  const cleanPath = pathname === "/" ? "/index.html" : pathname;
  const filePath = normalize(join(PUBLIC_DIR, cleanPath));
  if (!filePath.startsWith(PUBLIC_DIR)) {
    response.writeHead(403);
    response.end("Forbidden");
    return;
  }

  const data = await readFile(filePath);
  const type = MIME_TYPES[extname(filePath)] ?? "application/octet-stream";
  response.writeHead(200, { "content-type": type });
  response.end(data);
}

function sendJson(response, value) {
  response.writeHead(200, { "content-type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(value));
}

function readBody(request) {
  return new Promise((resolveBody, reject) => {
    let body = "";
    request.setEncoding("utf8");
    request.on("data", (chunk) => {
      body += chunk;
      if (body.length > 1_000_000) {
        request.destroy(new Error("Request body too large."));
      }
    });
    request.on("end", () => resolveBody(body));
    request.on("error", reject);
  });
}
