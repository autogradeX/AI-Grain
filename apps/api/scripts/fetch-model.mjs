// Downloads the pretrained MobileNetV2 image model (ONNX model zoo,
// Apache-2.0) used by the local model, and checks it. Run at build time:
// the running server, and a station without internet, find it on disk.
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const URL_ =
  "https://media.githubusercontent.com/media/onnx/models/main/validated/vision/classification/mobilenet/model/mobilenetv2-12.onnx";
const SHA256 =
  "c0c3f76d93fa3fd6580652a45618618a220fced18babf65774ed169de0432ad5";
const target = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "models",
  "mobilenetv2-12.onnx",
);

const sha = (buf) => createHash("sha256").update(buf).digest("hex");

if (existsSync(target) && sha(readFileSync(target)) === SHA256) {
  console.log(`MobileNetV2 already in ${target}`);
} else {
  const res = await fetch(URL_);
  if (!res.ok) throw new Error(`Download failed: HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (sha(buf) !== SHA256)
    throw new Error("The downloaded model doesn't match its checksum");
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, buf);
  console.log(`MobileNetV2 saved to ${target} (${buf.length} bytes)`);
}
