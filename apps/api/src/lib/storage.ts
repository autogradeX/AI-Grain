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

/** The part of a Cloud Storage bucket this app uses, so tests can pass a fake. */
export interface BucketLike {
  file(name: string): {
    save(
      data: Buffer,
      options: { resumable: boolean; contentType: string },
    ): Promise<unknown>;
    download(): Promise<[Buffer]>;
    delete(options: { ignoreNotFound: boolean }): Promise<unknown>;
  };
  deleteFiles(query: { prefix: string }): Promise<unknown>;
}

/**
 * Stores files in a Google Cloud Storage bucket. Use this on Cloud Run, where
 * the container's disk is temporary and not shared between instances.
 */
export class GcsStorage implements Storage {
  constructor(
    private readonly bucket: BucketLike,
    private readonly prefix = "",
  ) {}

  private name(key: string): string {
    if (key.includes("..") || key.startsWith("/"))
      throw new Error(`Invalid storage key: ${key}`);
    return this.prefix ? `${this.prefix.replace(/\/+$/, "")}/${key}` : key;
  }

  async put(key: string, data: Buffer): Promise<void> {
    await this.bucket.file(this.name(key)).save(data, {
      resumable: false,
      contentType: key.endsWith(".jpg")
        ? "image/jpeg"
        : "application/octet-stream",
    });
  }

  async get(key: string): Promise<Buffer> {
    const [data] = await this.bucket.file(this.name(key)).download();
    return data;
  }

  /** Removes the object named `prefix` and everything under `prefix/`. */
  async remove(prefix: string): Promise<void> {
    const name = this.name(prefix);
    await Promise.all([
      this.bucket.file(name).delete({ ignoreNotFound: true }),
      this.bucket.deleteFiles({ prefix: `${name}/` }),
    ]);
  }
}
