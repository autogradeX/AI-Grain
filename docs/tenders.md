# Tenders and pilots

What buyers of grain-analysis systems (APMCs, state agencies, FPO
federations, warehouses) usually ask for, and where AI-Grain stands.

## Evidence of accuracy

**Quality → Validation** compares AI-Grain with a reference laboratory or a
certified grader on the same physical samples:

1. Grade at least 30 samples (50 recommended) at the station as usual.
2. Send the same samples to the lab; enter its results on each sample, or
   import the lab's CSV (rows by sample number or e-NAM lot ID, with the
   lab's report number).
3. Set the tolerances the tender states (defect classes, moisture, protein,
   oil, in percentage points).
4. **Download report for tenders (PDF)**: samples graded both ways, grade
   agreement, per-class bias and agreement within tolerance, measurements,
   repeatability of repeat runs, the method, every sample with the lab's
   report number, and signature lines for the station and the lab. The CSV
   has the same figures for a spreadsheet.

A pilot needs the samples and the lab; the software only reports what they
show. Run it per crop: tenders usually ask for figures per commodity.

## Commonly asked

| Requirement                                    | In AI-Grain                                                                                                      |
| ---------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Physical parameters per commodity (FAQ limits) | Standards with grade limits per class and group; draft them from a document with Model Orchestration, then check |
| Moisture                                       | Moisture meter over USB/serial, or typed in                                                                      |
| Protein / oil                                  | NIR analyser CSV import                                                                                          |
| Aflatoxin                                      | Test strip reader or lab value (typed in or CSV); grade maximum                                                  |
| Works without internet                         | Station mode: classification waits or runs on the local model; results are sent later                            |
| e-NAM                                          | Lot ID, gate entry and farmer on each sample; results sent to the e-NAM bridge                                   |
| Tamper-evident results                         | Certificates with a QR code and a SHA-256 fingerprint, verifiable on the central site                            |
| Farmer receives the result                     | SMS / WhatsApp with consent, in seven languages                                                                  |
| Price discovery                                | Prices per grade and deductions on the standard                                                                  |
| Data protection (DPDP Act)                     | Farmer data export, erasure and retention period                                                                 |

## Not built, and why

- **Variety identification.** Telling varieties apart (for example basmati
  types, or durum from bread wheat) from photos needs a large set of kernels
  labelled by variety from certified seed, per crop, and is reliable only for
  some varieties; DNA or lab methods remain the reference. The local model
  could later learn variety as a class once such labelled data exists; it is
  not offered today, so reports never claim a variety.
- **e-NWR (electronic negotiable warehouse receipts).** e-NWRs are issued by
  WDRA-registered warehouses through the repositories (NERL, CCRL). Linking a
  quality result to an e-NWR needs the warehouse's registration and access to
  a repository's API, which AI-Grain doesn't have. The result format
  (`ai-grain/assaying-result@1`, see [integration.md](integration.md)) has
  what a warehouse system would attach; the connection is built per
  repository when a warehouse partner provides access.
- **The device itself.** Cameras, tray, lighting, balance and printer are
  bought separately (see [station.md](station.md#hardware)); there is no
  certified AI-Grain enclosure yet.
