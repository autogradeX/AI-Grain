import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, normalize, sep } from "node:path";

/** Stores files under a root directory. Keys are relative paths built by the server, never by clients. */
export interface Storage {
  put(key: string, data: Buffer): Promise<void>;
  get(key: string): Promise<Buffer>;
  remove(prefix: string): Promise<void>;
}

export class DiskStorage implements Storage {
  constructor(private readonly root: string) {}

  private path(key: string): string {
    const full = normalize(join(this.root, key));
    if (!full.startsWith(normalize(this.root) + sep)) {
      throw new Error(`Invalid storage key: ${key}`);
    }
    return full;
  }

  async put(key: string, data: Buffer): Promise<void> {
    const path = this.path(key);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, data);
  }

  get(key: string): Promise<Buffer> {
    return readFile(this.path(key));
  }

  async remove(prefix: string): Promise<void> {
    await rm(this.path(prefix), { recursive: true, force: true });
  }
}

export class MemoryStorage implements Storage {
  readonly files = new Map<string, Buffer>();

  put(key: string, data: Buffer): Promise<void> {
    this.files.set(key, data);
    return Promise.resolve();
  }

  get(key: string): Promise<Buffer> {
    const data = this.files.get(key);
    if (!data) return Promise.reject(new Error(`No file at ${key}`));
    return Promise.resolve(data);
  }

  remove(prefix: string): Promise<void> {
    for (const key of this.files.keys()) {
      if (key === prefix || key.startsWith(`${prefix}/`))
        this.files.delete(key);
    }
    return Promise.resolve();
  }
}
