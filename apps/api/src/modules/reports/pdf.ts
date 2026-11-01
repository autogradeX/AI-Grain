import {
  CLASS_GROUPS,
  GROUP_LABELS,
  classLabel,
  roundPct,
  summarizePercentages,
  type ClassDef,
  type ClassGroup,
  type DimensionSummary,
  type GradeSpec,
  type LimitFailure,
} from "@ai-grain/core";
import PDFDocument from "pdfkit";
import type { ReportSettings } from "../../db/schema.js";
import type { SampleRow } from "../samples/service.js";
import { modelTier } from "../../config.js";

export interface ReportData {
  /** The organisation's report layout (Settings → Report layout). */
  layout: ReportSettings;
  orgName: string;
  sample: SampleRow;
  cropLabel: string;
  classes: ClassDef[];
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
  /** The sample's valid certificate; null while the sample is in progress. */
  certificate: {
    code: string;
    version: number;
    hash: string;
    url: string;
    qr: Buffer;
  } | null;
  /** Every kernel not judged sound, with its crop image, for the gallery pages. */
  gallery: {
    jpeg: Buffer;
    number: number;
    cell: string;
    batch: number;
    finalClass: string | null;
    aiClass: string | null;
    aiConfidence: string | null;
    reviewed: boolean;
  }[];
  galleryTotal: number;
  dimensions: DimensionSummary | null;
}

const fmt = (n: number | null | undefined, digits = 2) =>
  n === null || n === undefined ? "—" : n.toFixed(digits);

export function limitName(
  f: LimitFailure,
  classes: readonly ClassDef[],
): string {
  if (f.scope === "class") return classLabel(classes, f.limit);
  if (f.scope === "group") return GROUP_LABELS[f.limit as ClassGroup];
  if (f.scope === "total") return "Total defects";
  if (f.scope === "moisture") return "Moisture";
  return "Test weight";
}

function limitText(f: LimitFailure, classes: readonly ClassDef[]): string {
  const name = limitName(f, classes);
  const value = f.value === null ? "not measured" : fmt(f.value);
  return `${name}: ${value} (${f.kind === "max" ? "max" : "min"} ${fmt(f.allowed)})`;
}

export function renderReport(data: ReportData): Promise<Buffer> {
  const { sample, standard } = data;
  const layout = data.layout;
  const show = (flag: boolean | undefined) => flag !== false;
  const doc = new PDFDocument({
    size: "A4",
    margin: 48,
    // Pages stay open so the footer and page numbers go on at the end.
    bufferPages: true,
    info: { Title: `Sample #${sample.number}` },
  });
  const chunks: Buffer[] = [];
  doc.on("data", (c: Buffer) => chunks.push(c));
  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });

  const pct = sample.result
    ? summarizePercentages(sample.result.byClassPct, data.classes)
    : null;
  const left = doc.page.margins.left;
  const width = doc.page.width - left - doc.page.margins.right;
  // The header shares page 1 with the verification box on the right.
  const boxW = 120;
  const headW = width - boxW - 16;
  const top = doc.page.margins.top;

  const cert = data.certificate;
  const bx = left + width - boxW;
  if (cert) {
    doc.image(cert.qr, bx + (boxW - 84) / 2, top, { width: 84, height: 84 });
    doc
      .font("Helvetica-Bold")
      .fontSize(9)
      .text(cert.code, bx, top + 88, { width: boxW, align: "center" });
    doc
      .font("Helvetica")
      .fontSize(6.5)
      .fillColor("#555")
      .text(`Version ${cert.version} · verify at`, bx, top + 100, {
        width: boxW,
        align: "center",
      })
      .text(cert.url, { width: boxW, align: "center" })
      .text(`SHA-256 ${cert.hash.slice(0, 16)}…`, {
        width: boxW,
        align: "center",
      })
      .fillColor("#000");
  } else {
    doc
      .font("Helvetica-Bold")
      .fontSize(11)
      .fillColor("#b00020")
      .text("DRAFT", bx, top + 20, { width: boxW, align: "center" })
      .font("Helvetica")
      .fontSize(8)
      .text("Not verified: the sample is not completed.", {
        width: boxW,
        align: "center",
      })
      .fillColor("#000");
  }

  doc
    .font("Helvetica-Bold")
    .fontSize(18)
    .text(
      `${layout.title?.trim() || "Grain screening report"}: sample #${sample.number}`,
      left,
      top,
      { width: headW },
    );
  if (layout.header?.trim()) {
    doc
      .moveDown(0.2)
      .font("Helvetica")
      .fontSize(9)
      .fillColor("#333")
      .text(layout.header.trim(), { width: headW });
  }
  doc.moveDown(0.3).font("Helvetica").fontSize(10).fillColor("#555");
  doc.text(
    `${data.orgName} · ${data.cropLabel}${sample.source ? ` · ${sample.source}` : ""} · ${
      sample.status === "completed"
        ? `completed ${sample.completedAt?.toISOString().slice(0, 10)}`
        : "in progress"
    }`,
    { width: headW },
  );
  doc.moveDown(0.6).fillColor("#8a4b00").fontSize(9);
  doc.text(
    `Screening and pre-check result. Kernels were flagged by AI and confirmed by a person; percentages come from ${
      sample.result?.source === "estimate"
        ? "kernel areas in the photos"
        : "weighing"
    }. Not acceptable for official trade grading unless this method has been validated and approved.`,
    { width: headW },
  );
  doc.y = Math.max(doc.y, top + 150);
  doc.x = left;
  doc.fillColor("#000").moveDown(1);

  const line = (label: string, value: string) => {
    doc
      .font("Helvetica-Bold")
      .fontSize(10)
      .text(`${label}: `, { continued: true });
    doc.font("Helvetica").text(value);
  };
  line("Crop", data.cropLabel);
  line("Standard", standard?.name ?? "none selected");
  line(
    "Sample mass",
    sample.sampleMassG === null
      ? "not weighed"
      : `${fmt(sample.sampleMassG)} g`,
  );
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
  line("Model Orchestration", modelTier(data.model));
  const dims = data.dimensions;
  if (dims && show(layout.showDimensions)) {
    line(
      "Kernel size (sound kernels)",
      `length ${fmt(dims.meanLengthMm)} mm · breadth ${fmt(dims.meanBreadthMm)} mm · L/B ${fmt(dims.meanLb)} (${dims.kernels} measured)`,
    );
  }

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
      .text(
        `Purity ${fmt(pct!.purityPct)} % · total defects ${fmt(pct!.totalDefectsPct)} % by mass`,
      );
    if (sample.result.source === "estimate") {
      doc
        .fillColor("#8a4b00")
        .fontSize(9)
        .text(
          "Estimated from the photos (kernel areas), not weighed. The standard allows completing on the estimate.",
          { width },
        )
        .fillColor("#000");
    }
  }

  // Per-class table
  const gradeSpec =
    standard?.grades.find((g) => g.grade === grade) ?? standard?.grades[0];
  doc.moveDown(0.8);
  const cols = [0, 195, 255, 315, 425];
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
  const row = (cells: string[], bold: boolean, over: boolean) => {
    if (y > doc.page.height - doc.page.margins.bottom - 20) {
      doc.addPage();
      y = doc.page.margins.top;
    }
    doc
      .font(bold ? "Helvetica-Bold" : "Helvetica")
      .fillColor(over ? "#b00020" : "#000");
    cells.forEach((c, i) =>
      doc.text(c, left + cols[i]!, y, { lineBreak: false }),
    );
    y += 13;
  };
  // Cups are only meaningful when the result comes from the scale.
  const weighed = sample.result?.source !== "estimate";
  for (const group of CLASS_GROUPS) {
    const inGroup = data.classes.filter((c) => c.group === group);
    if (!inGroup.length) continue;
    const gPct = pct?.byGroup[group];
    const gLimit = gradeSpec?.maxGroupPct?.[group];
    row(
      [
        GROUP_LABELS[group],
        weighed
          ? fmt(inGroup.reduce((n, c) => n + (sample.cupMassG[c.id] ?? 0), 0))
          : "—",
        gPct === undefined ? "—" : fmt(roundPct(gPct)),
        gLimit === undefined ? "" : `max ${fmt(gLimit)}`,
        String(
          inGroup.reduce((n, c) => n + (data.kernels.byClass[c.id] ?? 0), 0),
        ),
      ],
      true,
      gPct !== undefined && gLimit !== undefined && gPct > gLimit,
    );
    for (const c of inGroup) {
      const value = pct?.byClass[c.id];
      const limit = gradeSpec?.maxDefectPct[c.id];
      row(
        [
          `   ${c.label}`,
          weighed ? fmt(sample.cupMassG[c.id] ?? 0) : "—",
          value === undefined ? "—" : fmt(roundPct(value)),
          limit === undefined ? "—" : `max ${fmt(limit)}`,
          String(data.kernels.byClass[c.id] ?? 0),
        ],
        false,
        value !== undefined && limit !== undefined && value > limit,
      );
    }
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
      doc.text(
        `Grade ${g}: ${list.map((f) => limitText(f, data.classes)).join("; ")}`,
        { width },
      );
    }
  }

  if (sample.aiSummary && show(layout.showSummary)) {
    doc
      .moveDown(0.8)
      .font("Helvetica-Bold")
      .fontSize(10)
      .text("Summary (written by Model Orchestration from the figures above)");
    doc.font("Helvetica").fontSize(9.5).text(sample.aiSummary, { width });
  }

  const signatures = (layout.signatures ?? []).filter((x) => x.trim());
  if (signatures.length) {
    doc.moveDown(2);
    const slot = width / signatures.length;
    let sy = doc.y + 24;
    if (sy > doc.page.height - doc.page.margins.bottom - 40) {
      doc.addPage();
      sy = doc.page.margins.top + 24;
    }
    signatures.forEach((who, i) => {
      const sx = left + i * slot;
      doc
        .moveTo(sx, sy)
        .lineTo(sx + slot - 24, sy)
        .strokeColor("#333")
        .stroke();
      doc
        .font("Helvetica")
        .fontSize(9)
        .fillColor("#000")
        .text(who, sx, sy + 4, { width: slot - 24 });
    });
    doc.x = left;
  }

  if (data.boards.length && show(layout.showBoards)) {
    doc.addPage();
    doc
      .font("Helvetica-Bold")
      .fontSize(12)
      .fillColor("#000")
      .text("Photos (defects circled)", left, doc.page.margins.top);
    const imgW = (width - 16) / 2;
    const imgH = imgW * 1.4;
    let y = doc.page.margins.top + 24;
    data.boards.forEach((b, i) => {
      const col = i % 2;
      if (col === 0 && i > 0) y += imgH + 26;
      if (y + imgH + 20 > doc.page.height - doc.page.margins.bottom) {
        doc.addPage();
        y = doc.page.margins.top;
      }
      const x = left + col * (imgW + 16);
      doc.image(b.image, x, y, { width: imgW, height: imgH });
      doc
        .font("Helvetica")
        .fontSize(8)
        .text(`Batch ${i + 1} (${b.side} side)`, x, y + imgH + 4);
    });
  }

  if (data.gallery.length && show(layout.showGallery)) {
    doc.addPage();
    doc
      .font("Helvetica-Bold")
      .fontSize(12)
      .fillColor("#000")
      .text(
        "Kernel images: everything not judged sound",
        left,
        doc.page.margins.top,
      );
    doc
      .font("Helvetica")
      .fontSize(8)
      .fillColor("#555")
      .text(
        `Each image is the crop Model Orchestration classified, at the same scale. "Decided" is the operator's call after checking the kernel by eye.${
          data.galleryTotal > data.gallery.length
            ? ` First ${data.gallery.length} of ${data.galleryTotal} shown.`
            : ""
        }`,
        { width },
      )
      .fillColor("#000");
    const perRow = 5;
    const gap = 8;
    const tile = (width - gap * (perRow - 1)) / perRow;
    const rowH = tile + 34;
    let y = doc.y + 8;
    data.gallery.forEach((k, i) => {
      const col = i % perRow;
      if (col === 0 && i > 0) y += rowH;
      if (y + rowH > doc.page.height - doc.page.margins.bottom) {
        doc.addPage();
        y = doc.page.margins.top;
      }
      const x = left + col * (tile + gap);
      doc.image(k.jpeg, x, y, { width: tile, height: tile });
      const decided = k.reviewed
        ? classLabel(data.classes, k.finalClass)
        : "not checked";
      doc
        .font("Helvetica-Bold")
        .fontSize(6.5)
        .text(`#${k.number} · ${k.cell} · batch ${k.batch}`, x, y + tile + 2, {
          width: tile,
          lineBreak: false,
        })
        .font("Helvetica")
        .text(`Decided: ${decided}`, x, y + tile + 11, {
          width: tile,
          lineBreak: false,
        })
        .fillColor("#555")
        .text(
          `Model Orchestration: ${classLabel(data.classes, k.aiClass)}${k.aiConfidence ? ` (${k.aiConfidence})` : ""}`,
          x,
          y + tile + 20,
          {
            width: tile,
            lineBreak: false,
          },
        )
        .fillColor("#000");
    });
  }

  // Footer and page numbers on every page.
  const pages = doc.bufferedPageRange();
  for (let i = 0; i < pages.count; i++) {
    doc.switchToPage(pages.start + i);
    const fy = doc.page.height - doc.page.margins.bottom + 16;
    doc.font("Helvetica").fontSize(7).fillColor("#666");
    if (layout.footer?.trim()) {
      doc.text(layout.footer.trim(), left, fy, {
        width: width - 60,
        lineBreak: false,
      });
    }
    doc.text(`Page ${i + 1} of ${pages.count}`, left + width - 60, fy, {
      width: 60,
      align: "right",
      lineBreak: false,
    });
  }
  doc.end();
  return done;
}

/** 80 mm thermal printers: about 72 mm printable. */
const SLIP_WIDTH = 204;

/**
 * A short result slip for 80 mm receipt printers at the intake desk: result,
 * groups, moisture, kernel size, certificate code and QR, signature line.
 */
export function renderSlip(data: ReportData): Promise<Buffer> {
  const { sample, standard } = data;
  const doc = new PDFDocument({
    size: [SLIP_WIDTH + 16, 640],
    margins: { top: 10, bottom: 10, left: 8, right: 8 },
    info: { Title: `Sample #${sample.number} slip` },
  });
  const chunks: Buffer[] = [];
  doc.on("data", (c: Buffer) => chunks.push(c));
  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });
  const w = SLIP_WIDTH;
  const rule = () => {
    doc.moveDown(0.3);
    doc
      .moveTo(8, doc.y)
      .lineTo(8 + w, doc.y)
      .dash(2, { space: 2 })
      .strokeColor("#000")
      .stroke()
      .undash();
    doc.moveDown(0.4);
  };
  const pair = (label: string, value: string) => {
    const y = doc.y;
    doc
      .font("Helvetica")
      .fontSize(8)
      .text(label, 8, y, { width: w * 0.55 });
    doc
      .font("Helvetica-Bold")
      .text(value, 8 + w * 0.55, y, { width: w * 0.45, align: "right" });
    doc.x = 8;
  };
  const center = { width: w, align: "center" as const };
  doc.font("Helvetica-Bold").fontSize(11).text(data.orgName, center);
  if (data.layout.header?.trim())
    doc.font("Helvetica").fontSize(7).text(data.layout.header.trim(), center);
  doc
    .font("Helvetica")
    .fontSize(8)
    .text(data.layout.title?.trim() || "Grain screening result", center);
  rule();
  pair("Sample", `#${sample.number}`);
  pair("Crop", data.cropLabel);
  if (sample.source) pair("Lot", sample.source);
  pair(
    "Date",
    (sample.completedAt ?? sample.createdAt)
      .toISOString()
      .slice(0, 16)
      .replace("T", " "),
  );
  pair("Standard", standard?.name ?? "none");
  rule();
  const pct = sample.result
    ? summarizePercentages(sample.result.byClassPct, data.classes)
    : null;
  const grade = sample.result?.grade.grade;
  doc
    .font("Helvetica-Bold")
    .fontSize(13)
    .text(
      sample.result
        ? grade
          ? `Grade ${grade}`
          : standard
            ? "Below all grades"
            : "No standard"
        : "No result yet",
      center,
    );
  if (pct) {
    doc.moveDown(0.3);
    pair("Purity", `${fmt(pct.purityPct)} %`);
    pair("Total defects", `${fmt(pct.totalDefectsPct)} %`);
    for (const g of CLASS_GROUPS)
      if (data.classes.some((c) => c.group === g))
        pair(GROUP_LABELS[g], `${fmt(roundPct(pct.byGroup[g]))} %`);
    const top = Object.entries(pct.byClass)
      .filter(([, v]) => v > 0)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4);
    if (top.length) {
      doc.moveDown(0.2);
      for (const [id, v] of top)
        pair(`  ${classLabel(data.classes, id)}`, `${fmt(roundPct(v))} %`);
    }
    doc
      .font("Helvetica")
      .fontSize(6.5)
      .text(
        sample.result?.source === "estimate"
          ? "Estimated from the photos, not weighed."
          : "Weighed on the scale.",
        center,
      );
  }
  rule();
  if (sample.moisturePct !== null)
    pair("Moisture", `${fmt(sample.moisturePct, 1)} %`);
  if (sample.testWeightKgPerHl !== null)
    pair("Test weight", `${fmt(sample.testWeightKgPerHl, 1)} kg/hl`);
  if (data.dimensions) {
    pair("Length", `${fmt(data.dimensions.meanLengthMm)} mm`);
    pair("Breadth", `${fmt(data.dimensions.meanBreadthMm)} mm`);
    pair("L/B", fmt(data.dimensions.meanLb));
  }
  pair("Kernels", String(data.kernels.total));
  const cert = data.certificate;
  if (cert) {
    rule();
    const size = 90;
    doc.image(cert.qr, 8 + (w - size) / 2, doc.y, { width: size });
    doc.y += size + 4;
    doc.font("Helvetica-Bold").fontSize(9).text(cert.code, 8, doc.y, center);
    doc.font("Helvetica").fontSize(6).text(cert.url, center);
  } else {
    doc
      .moveDown(0.4)
      .font("Helvetica-Bold")
      .fontSize(9)
      .text("DRAFT: not completed", center);
  }
  const signatures = (data.layout.signatures ?? []).filter((x) => x.trim());
  for (const who of signatures.length ? signatures : ["Assayer"]) {
    doc.moveDown(1.6);
    doc
      .moveTo(30, doc.y)
      .lineTo(8 + w - 22, doc.y)
      .stroke();
    doc
      .font("Helvetica")
      .fontSize(7)
      .text(who, 8, doc.y + 2, center);
  }
  if (data.layout.footer?.trim()) {
    doc.moveDown(0.8);
    doc.font("Helvetica").fontSize(6).text(data.layout.footer.trim(), center);
  }
  doc.end();
  return done;
}
