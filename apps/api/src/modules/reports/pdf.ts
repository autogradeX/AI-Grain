import {
  CLASS_LABELS,
  DEFECT_CLASSES,
  roundPct,
  type GradeSpec,
  type LimitFailure,
} from "@ai-grain/core";
import PDFDocument from "pdfkit";
import type { SampleRow } from "../samples/service.js";

export interface ReportData {
  orgName: string;
  sample: SampleRow;
  standard: { name: string; grades: GradeSpec[] } | null;
  createdByName: string | null;
  completedByName: string | null;
  model: string;
  kernels: {
    total: number;
    flagged: number;
    reviewed: number;
    byClass: Record<string, number>;
  };
  boards: { side: string; image: Buffer }[];
}

const fmt = (n: number | null | undefined, digits = 2) =>
  n === null || n === undefined ? "—" : n.toFixed(digits);

function limitText(f: LimitFailure): string {
  const name =
    f.limit === "total"
      ? "Total defects"
      : f.limit === "moisture"
        ? "Moisture"
        : f.limit === "testWeight"
          ? "Test weight"
          : CLASS_LABELS[f.limit];
  const value = f.value === null ? "not measured" : fmt(f.value);
  return `${name}: ${value} (${f.kind === "max" ? "max" : "min"} ${fmt(f.allowed)})`;
}

export function renderReport(data: ReportData): Promise<Buffer> {
  const { sample, standard } = data;
  const doc = new PDFDocument({
    size: "A4",
    margin: 48,
    info: { Title: `Sample #${sample.number}` },
  });
  const chunks: Buffer[] = [];
  doc.on("data", (c: Buffer) => chunks.push(c));
  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });

  const left = doc.page.margins.left;
  const width = doc.page.width - left - doc.page.margins.right;

  doc
    .font("Helvetica-Bold")
    .fontSize(18)
    .text(`Grain screening report: sample #${sample.number}`);
  doc.moveDown(0.3).font("Helvetica").fontSize(10).fillColor("#555");
  doc.text(
    `${data.orgName} · ${sample.crop}${sample.source ? ` · ${sample.source}` : ""} · ${
      sample.status === "completed"
        ? `completed ${sample.completedAt?.toISOString().slice(0, 10)}`
        : "in progress"
    }`,
  );
  doc.moveDown(0.6).fillColor("#8a4b00").fontSize(9);
  doc.text(
    "Screening and pre-check result. Kernels were flagged by AI and confirmed by a person; percentages come from weighing. Not acceptable for official trade grading unless this method has been validated and approved.",
    { width },
  );
  doc.fillColor("#000").moveDown(1);

  const line = (label: string, value: string) => {
    doc
      .font("Helvetica-Bold")
      .fontSize(10)
      .text(`${label}: `, { continued: true });
    doc.font("Helvetica").text(value);
  };
  line("Standard", standard?.name ?? "none selected");
  line("Sample mass", `${fmt(sample.sampleMassG)} g`);
  line(
    "Moisture",
    sample.moisturePct === null
      ? "not measured"
      : `${fmt(sample.moisturePct, 1)} %`,
  );
  line(
    "Test weight",
    sample.testWeightKgPerHl === null
      ? "not measured"
      : `${fmt(sample.testWeightKgPerHl, 1)} kg/hl`,
  );
  line(
    "Operator",
    [data.createdByName, data.completedByName]
      .filter(Boolean)
      .filter((v, i, a) => a.indexOf(v) === i)
      .join(", ") || "—",
  );
  line(
    "Kernels photographed",
    `${data.kernels.total} (${data.kernels.flagged} flagged, ${data.kernels.reviewed} checked by the operator)`,
  );
  line("AI model", data.model);

  doc.moveDown(1);
  const grade = sample.result?.grade.grade;
  doc
    .font("Helvetica-Bold")
    .fontSize(14)
    .text(
      sample.result
        ? `Result: ${grade ? `grade ${grade}` : standard ? "below all grades" : "no standard selected"}`
        : "Result: weights not entered",
    );
  if (sample.result) {
    doc
      .font("Helvetica")
      .fontSize(10)
      .text(`Total defects ${fmt(sample.result.totalDefectsPct)} % by mass`);
  }

  // Per-class table
  const gradeSpec =
    standard?.grades.find((g) => g.grade === grade) ?? standard?.grades[0];
  doc.moveDown(0.8);
  const cols = [0, 150, 230, 310, 410];
  const header = [
    "Class",
    "Cup (g)",
    "Mass %",
    gradeSpec ? `Limit (grade ${gradeSpec.grade})` : "Limit",
    "Kernels",
  ];
  let y = doc.y;
  doc.font("Helvetica-Bold").fontSize(9);
  header.forEach((h, i) => doc.text(h, left + cols[i]!, y));
  y += 14;
  doc
    .moveTo(left, y - 3)
    .lineTo(left + width, y - 3)
    .strokeColor("#999")
    .stroke();
  doc.font("Helvetica");
  for (const cls of DEFECT_CLASSES) {
    const pct = sample.result?.byClassPct[cls];
    const limit = gradeSpec?.maxDefectPct[cls];
    const over = pct !== undefined && limit !== undefined && pct > limit;
    doc.fillColor(over ? "#b00020" : "#000");
    const cells = [
      CLASS_LABELS[cls],
      fmt(sample.cupMassG[cls] ?? 0),
      pct === undefined ? "—" : fmt(roundPct(pct)),
      limit === undefined ? "—" : `max ${fmt(limit)}`,
      String(data.kernels.byClass[cls] ?? 0),
    ];
    cells.forEach((c, i) => doc.text(c, left + cols[i]!, y));
    y += 13;
  }
  doc.fillColor("#000");
  doc.y = y + 6;
  doc.x = left;

  const failures = Object.entries(sample.result?.grade.failures ?? {});
  if (failures.length) {
    doc
      .moveDown(0.5)
      .font("Helvetica-Bold")
      .fontSize(10)
      .text("Why stricter grades were not met");
    doc.font("Helvetica").fontSize(9);
    for (const [g, list] of failures) {
      doc.text(`Grade ${g}: ${list.map(limitText).join("; ")}`, { width });
    }
  }

  if (sample.aiSummary) {
    doc
      .moveDown(0.8)
      .font("Helvetica-Bold")
      .fontSize(10)
      .text("Summary (written by Claude from the figures above)");
    doc.font("Helvetica").fontSize(9.5).text(sample.aiSummary, { width });
  }

  if (data.boards.length) {
    doc.addPage();
    doc.font("Helvetica-Bold").fontSize(12).text("Photos (defects circled)");
    doc.moveDown(0.5);
    const perRow = 2;
    const imgW = (width - 16) / perRow;
    const imgH = imgW * 1.4;
    data.boards.forEach((b, i) => {
      if (i > 0 && i % 4 === 0) doc.addPage();
      const slot = i % 4;
      const x = left + (slot % perRow) * (imgW + 16);
      const top = (slot < 2 ? 90 : 90 + imgH + 30) - (i < 4 ? 0 : 40);
      doc.image(b.image, x, top, { width: imgW, height: imgH });
      doc.fontSize(8).text(`Batch ${i + 1} (${b.side})`, x, top + imgH + 4);
    });
  }

  doc.end();
  return done;
}
