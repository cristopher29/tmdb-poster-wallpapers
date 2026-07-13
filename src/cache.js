import { createHash } from "node:crypto";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

export class DiskCache {
  constructor({ enabled = true, cacheDir = ".cache" } = {}) {
    this.enabled = enabled;
    this.cacheDir = cacheDir;
  }

  async getJson(namespace, key) {
    const filePath = this.pathFor(namespace, key, ".json");
    if (!filePath) {
      return null;
    }

    try {
      await access(filePath);
      return JSON.parse(await readFile(filePath, "utf8"));
    } catch {
      return null;
    }
  }

  async setJson(namespace, key, value) {
    const filePath = this.pathFor(namespace, key, ".json");
    if (!filePath) {
      return;
    }

    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, JSON.stringify(value, null, 2));
  }

  async getBuffer(namespace, key, extension = ".bin") {
    const filePath = this.pathFor(namespace, key, extension);
    if (!filePath) {
      return null;
    }

    try {
      await access(filePath);
      return readFile(filePath);
    } catch {
      return null;
    }
  }

  async setBuffer(namespace, key, extension, value) {
    const filePath = this.pathFor(namespace, key, extension);
    if (!filePath) {
      return;
    }

    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, value);
  }

  pathFor(namespace, key, extension) {
    if (!this.enabled) {
      return null;
    }

    const digest = createHash("sha256").update(String(key)).digest("hex");
    return path.join(this.cacheDir, namespace, `${digest}${extension}`);
  }
}

export function extensionFromTmdbPath(filePath) {
  const extension = path.extname(filePath);
  return extension || ".jpg";
}
