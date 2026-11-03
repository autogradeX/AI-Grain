import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import sharp, { type Sharp } from "sharp";

/**
 * Describes a kernel crop as a vector of numbers for the local model.
 * MobileNetEmbedder is the real one; tests use a small fake.
 */
export interface Embedder {
  /** Stored with each model, so a model only runs with the embedder it was trained with. */
  readonly name: string;
  embed(jpegs: Buffer[]): Promise<number[][]>;
}

const SIZE = 224;
const MEAN = [0.485, 0.456, 0.406];
const STD = [0.229, 0.224, 0.225];
/** The pooled layer just before MobileNetV2's ImageNet classifier: 1280 numbers. */
const FEATURE_OUTPUT = "472";
const BATCH = 16;

type Ort = typeof import("onnxruntime-node");

/**
 * Pretrained MobileNetV2 (ImageNet, Apache-2.0) on the CPU through ONNX
 * Runtime: its last pooled layer describes a crop's colour, texture and
 * shape, and the local model learns the crop's classes on top of it. About
 * 5 ms per crop on a mini PC; nothing leaves the machine.
 */
export class MobileNetEmbedder implements Embedder {
  readonly name = "mobilenet-v2";

  private constructor(
    private readonly ort: Ort,
    private readonly session: import("onnxruntime-node").InferenceSession,
  ) {}

  /** Loads the model file (see scripts/fetch-model.mjs); null when it isn't there. */
  static async load(path: string): Promise<MobileNetEmbedder | null> {
    if (!existsSync(path)) return null;
    const ort = await import("onnxruntime-node");
    // A CommonJS package: under Node its exports sit on `default`.
    const proto =
      (await import("onnx-proto")) as typeof import("onnx-proto") & {
        default?: typeof import("onnx-proto");
      };
    const onnx = proto.default?.onnx ?? proto.onnx;
    // Expose the pooled features as an output beside the classifier's.
    const model = onnx.ModelProto.decode(await readFile(path));
    model.graph!.output!.push(
      onnx.ValueInfoProto.create({
        name: FEATURE_OUTPUT,
        type: {
          tensorType: {
            elemType: 1,
            shape: { dim: [{ dimParam: "batch_size" }, { dimValue: 1280 }] },
          },
        },
      }),
    );
    const session = await ort.InferenceSession.create(
      onnx.ModelProto.encode(model).finish(),
      { graphOptimizationLevel: "all" },
    );
    return new MobileNetEmbedder(ort, session);
  }

  async embed(jpegs: Buffer[]): Promise<number[][]> {
    const out: number[][] = [];
    for (let i = 0; i < jpegs.length; i += BATCH) {
      const chunk = jpegs.slice(i, i + BATCH);
      const plane = SIZE * SIZE;
      const input = new Float32Array(chunk.length * 3 * plane);
      await Promise.all(
        chunk.map(async (jpeg, n) => {
          const data = await sharp(jpeg)
            .removeAlpha()
            .resize(SIZE, SIZE, { fit: "fill" })
            .raw()
            .toBuffer();
          const base = n * 3 * plane;
          for (let p = 0; p < plane; p++)
            for (let c = 0; c < 3; c++)
              input[base + c * plane + p] =
                (data[p * 3 + c]! / 255 - MEAN[c]!) / STD[c]!;
        }),
      );
      const result = await this.session.run(
        {
          input: new this.ort.Tensor("float32", input, [
            chunk.length,
            3,
            SIZE,
            SIZE,
          ]),
        },
        [FEATURE_OUTPUT],
      );
      const data = result[FEATURE_OUTPUT]!.data as Float32Array;
      const width = data.length / chunk.length;
      for (let n = 0; n < chunk.length; n++)
        out.push(
          Array.from(
            data.subarray(n * width, (n + 1) * width),
            (v) => Math.round(v * 1e4) / 1e4,
          ),
        );
    }
    return out;
  }
}

/**
 * Variants of a crop for training: turned, mirrored and lit a little
 * differently. A kernel looks the same any way round, so a model that sees
 * these learns the kernel, not how it happened to lie. Variant 0 is the crop
 * itself.
 */
export async function augment(jpeg: Buffer, variant: number): Promise<Buffer> {
  if (variant === 0) return jpeg;
  const steps: ((s: Sharp) => Sharp)[] = [
    (s) => s.rotate(90),
    (s) => s.rotate(180),
    (s) => s.rotate(270),
    (s) => s.flop(),
    (s) => s.flip(),
    (s) => s.flop().modulate({ brightness: 1.1 }),
    (s) => s.rotate(90).modulate({ brightness: 0.9 }),
    (s) => s.flip().modulate({ saturation: 1.1 }),
  ];
  const step = steps[(variant - 1) % steps.length]!;
  return step(sharp(jpeg)).jpeg({ quality: 90 }).toBuffer();
}

/** How many variants (with the original) give a class about `target` training examples. */
export function variantsFor(count: number, target = 1000): number {
  return Math.max(1, Math.min(9, Math.round(target / Math.max(1, count))));
}
