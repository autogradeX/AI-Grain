import {
  classLabel,
  type ClassDef,
  type RepeatabilityBand,
  type ValidationSummary,
} from "@ai-grain/core";
import PDFDocument from "pdfkit";

/** What the validation report shows. */
export interface ValidationReportData {
  orgName: string;
  crop: string | null;
  standardName: string | null;
  generatedAt: Date;
  target: { min: number; recommended: number };
  summary: ValidationSummary;
  classes: readonly ClassDef[];
  /** Each sample, newest first: grades and the largest class difference. */
  samples: {
    number: number;
    enamLotId: string | null;
    completedAt: Date | null;
    lab: string | null;
    reportNo: string | null;
    methodGrade: string | null;
    referenceGrade: string | null;
    largestDiff: { cls: string; diff: number } | null;
  }[];
  repeatability: {
    count: number;
    meanAgreementPct: number | null;
    minAgreementPct: number | null;
    bands: Record<RepeatabilityBand, number>;
  };
}

const fmt = (n: number | null | undefined, digits = 2) =>
  n === null || n === undefined ? "—" : n.toFixed(digits);
const pct = (share: number | null) =>
  share === null ? "—" : `${Math.round(share * 100)} %`;

/**
 * The validation as an A4 PDF for a tender or an audit: how many samples
 * were graded both ways, agreement per defect class and measurement within
 * the stated tolerances, grade agreement, repeatability, the method, and
 * every sample with its lab report number.
 */
export function renderValidationReport(
  data: ValidationReportData,
): Promise<Buffer> {
  const doc = new PDFDocument({
    size: "A4",
    margins: { top: 48, bottom: 48, left: 48, right: 48 },
    info: { Title: "Validation against reference results" },
  });
  const chunks: Buffer[] = [];
  doc.on("data", (c: Buffer) => chunks.push(c));
  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });
  const left = 48;
  const width = doc.page.width - 96;
  const s = data.summary;

  doc
    .font("Helvetica-Bold")
    .fontSize(16)
    .text(data.orgName || "AI-Grain");
  doc
    .font("Helvetica")
    .fontSize(12)
    .text("Validation of the grain analysis against reference results");
  doc
    .fontSize(9)
    .fillColor("#555")
    .text(
      [
        `Generated ${data.generatedAt.toISOString().slice(0, 10)}`,
        data.crop && `crop: ${data.crop}`,
        data.standardName && `standard: ${data.standardName}`,
      ]
        .filter(Boolean)
        .join(" · "),
    )
    .fillColor("#000");
  doc.moveDown(1);

  // Headline figures.
  const enough = s.samples >= data.target.min;
  doc.font("Helvetica-Bold").fontSize(11).text("Summary");
  doc.font("Helvetica").fontSize(10);
  doc.text(
    `Samples graded both ways: ${s.samples} (at least ${data.target.min} needed, ${data.target.recommended} recommended)${enough ? "" : " — not enough yet"}.`,
    { width },
  );
  doc.text(
    `Grade agreement: ${pct(s.gradeAgreement)} of ${s.gradeComparable} samples with both grades.`,
  );
  const classWithin = s.byClass.length
    ? s.byClass.reduce((a, c) => a + c.withinTolerance * c.n, 0) /
      s.byClass.reduce((a, c) => a + c.n, 0)
    : null;
  doc.text(
    `Defect classes within ±${s.tolerances.classPct} percentage points of the reference: ${pct(classWithin)} of comparisons.`,
    { width },
  );
  const r = data.repeatability;
  doc.text(
    r.count
      ? `Repeatability: ${r.count} repeat runs, mean agreement ${fmt(r.meanAgreementPct)} % (lowest ${fmt(r.minAgreementPct)} %); ${r.bands["99+"]} at 99 % or more, ${r.bands["97-99"]} at 97–99 %, ${r.bands["95-97"]} at 95–97 %, ${r.bands.below95} below 95 %.`
      : "Repeatability: no repeat runs yet.",
    { width },
  );
  doc.moveDown(1);

  // Table helper.
  const table = (
    headers: string[],
    rows: string[][],
    widths: number[],
    align: ("left" | "right")[],
  ) => {
    const drawRow = (cells: string[], bold: boolean) => {
      if (doc.y > doc.page.height - 80) doc.addPage();
      const y = doc.y;
      let x = left;
      doc.font(bold ? "Helvetica-Bold" : "Helvetica").fontSize(8.5);
      let h = 0;
      cells.forEach((c, i) => {
        const w = widths[i]! * width;
        doc.text(c, x + 2, y, { width: w - 4, align: align[i] ?? "left" });
        h = Math.max(h, doc.y - y);
        x += w;
      });
      doc.y = y + h + 3;
      doc
        .moveTo(left, doc.y - 1.5)
        .lineTo(left + width, doc.y - 1.5)
        .strokeColor(bold ? "#999" : "#ddd")
        .stroke();
      doc.x = left;
    };
    drawRow(headers, true);
    for (const row of rows) drawRow(row, false);
    doc.moveDown(0.8);
  };

  doc.font("Helvetica-Bold").fontSize(11).text("Per defect class (mass %)");
  doc.moveDown(0.3);
  table(
    [
      "Class",
      "Samples",
      "Mean here",
      "Mean reference",
      "Bias",
      "Mean |diff|",
      "Largest",
      "Within tol.",
    ],
    s.byClass.map((c) => [
      classLabel(data.classes, c.cls),
      String(c.n),
      fmt(c.meanMethodPct),
      fmt(c.meanReferencePct),
      `${c.meanBiasPct >= 0 ? "+" : ""}${fmt(c.meanBiasPct)}`,
      fmt(c.meanAbsDiffPct),
      fmt(c.maxAbsDiffPct),
      pct(c.withinTolerance),
    ]),
    [0.26, 0.08, 0.1, 0.12, 0.1, 0.11, 0.1, 0.13],
    ["left", "right", "right", "right", "right", "right", "right", "right"],
  );

  if (s.measurements.length) {
    doc.font("Helvetica-Bold").fontSize(11).text("Measurements");
    doc.moveDown(0.3);
    table(
      [
        "Measurement",
        "Samples",
        "Bias",
        "Mean |diff|",
        "Largest",
        "Tolerance",
        "Within tol.",
      ],
      s.measurements.map((m) => [
        m.field[0]!.toUpperCase() + m.field.slice(1),
        String(m.n),
        `${m.meanBias >= 0 ? "+" : ""}${fmt(m.meanBias)}`,
        fmt(m.meanAbsDiff),
        fmt(m.maxAbsDiff),
        `±${s.tolerances[m.field]}`,
        pct(m.withinTolerance),
      ]),
      [0.24, 0.1, 0.12, 0.14, 0.12, 0.14, 0.14],
      ["left", "right", "right", "right", "right", "right", "right"],
    );
  }

  doc.font("Helvetica-Bold").fontSize(11).text("Method");
  doc
    .font("Helvetica")
    .fontSize(9)
    .text(
      "Each sample was photographed on the grading board (or a plain light background) and analysed: kernels are found and counted by image processing, each kernel image is classified, and kernels the analysis is not sure of, harmful classes and a random share of the rest are checked by the operator. Mass percentages come from weighing each class or, where the standard allows it, from kernel areas in the photos. The same physical samples were graded by the reference laboratory or a certified grader; their results were entered or imported with the lab's report number. Bias is the mean of (this method − reference); a positive bias means this method reads higher. Repeatability compares repeat runs of the same physical sample.",
      { width },
    );
  doc.moveDown(1);

  doc.font("Helvetica-Bold").fontSize(11).text("Samples");
  doc.moveDown(0.3);
  table(
    [
      "Sample",
      "e-NAM lot",
      "Date",
      "Lab / report",
      "Grade here",
      "Grade ref.",
      "Largest difference",
    ],
    data.samples.map((x) => [
      `#${x.number}`,
      x.enamLotId ?? "",
      x.completedAt?.toISOString().slice(0, 10) ?? "",
      [x.lab, x.reportNo].filter(Boolean).join(" / "),
      x.methodGrade ?? "—",
      x.referenceGrade ?? "—",
      x.largestDiff
        ? `${classLabel(data.classes, x.largestDiff.cls)} ${x.largestDiff.diff >= 0 ? "+" : ""}${fmt(x.largestDiff.diff)}`
        : "—",
    ]),
    [0.09, 0.15, 0.12, 0.2, 0.1, 0.1, 0.24],
    ["left", "left", "left", "left", "left", "left", "left"],
  );

  if (doc.y > doc.page.height - 140) doc.addPage();
  doc.moveDown(2);
  for (const who of ["Prepared by", "Checked by (reference laboratory)"]) {
    const y = doc.y + 24;
    doc
      .moveTo(left, y)
      .lineTo(left + 220, y)
      .strokeColor("#000")
      .stroke();
    doc
      .font("Helvetica")
      .fontSize(8)
      .text(`${who}, date`, left, y + 3);
    doc.moveDown(1.5);
  }
  doc.end();
  return done;
}
