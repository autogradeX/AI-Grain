# AI-Grain

Low-cost grain screening with a mobile phone, a precise scale and Claude.

Claude finds and flags suspect kernels, a person confirms and removes them, and the scale produces the mass percentage. The final number comes from weighing, not from AI estimation, which keeps the method close to how official grading works.

> **Scope.** This is a screening and pre-check tool for farms, intake points and training. It will not match a dedicated grading machine, and it is not acceptable for official trade grading unless validated and approved.

## The method

1. Weigh the working sample (for example 20–25 g on a 0.01 g scale, about 500–600 wheat kernels).
2. Spread 100–150 kernels on the grid board in one layer, not touching. Repeat in batches until the whole sample is done.
3. Photograph straight down from the stand, with every grid cell visible. Optionally flip the kernels and take a crease-side photo.
4. The app straightens the photo, finds every kernel with classic image processing, and sends numbered close-ups to Claude, which classifies each one with a confidence and a reason.
5. Remove the flagged kernels with tweezers, check each one by eye (the person makes the final call), and drop it into the cup for its class.
6. Weigh each cup. Mass % per class = cup weight ÷ sample weight × 100.
7. The app grades the sample against your standard's limits and produces a PDF report.

### Equipment (about US$50 on top of a phone)

| Item                    | Specification                                                                        | Approx. cost (USD) |
| ----------------------- | ------------------------------------------------------------------------------------ | ------------------ |
| Mobile phone            | Any recent Android or iPhone, 12 MP or better                                        | Existing           |
| Scale                   | Pocket or jewellery scale, 0.01 g resolution, 100–200 g capacity                     | 15–40              |
| Background board        | Matte black or dark blue A4 card with a printed 1 cm grid, columns A–T and rows 1–28 | 2                  |
| Phone stand             | Holds the phone flat, 20–25 cm above the board                                       | 10–20              |
| Lighting                | LED ring light, or two desk lamps at 45° (no direct sun, no shadows)                 | 15–25              |
| Tweezers and small cups | One cup per defect class                                                             | 5                  |

A kitchen scale with 1 g steps is too coarse: on a 50 g sample, 1 g is already 2 %. If only a kitchen scale is available, use one with 0.1 g steps and a 100 g sample.

## Two levels

- **Level 1: Claude app only.** No programming. The app's _Claude app prompt_ page writes the prompt for your standard; paste it into the Claude app with a board photo and a few reference photos.
- **Level 2: this app.** Camera with an alignment guide, perspective correction, kernel detection without AI, classification of close-up crops with the Claude API, operator review, weighing, grading, PDF reports and history.

## Modules

| Module                     | What it does                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Auth**                   | Sign-up (creates an organisation), sign-in, short-lived access tokens with rotating refresh cookies and reuse detection, sign out everywhere, password change and email reset, email verification, invites, lockout after repeated failures, rate limits, audit log                                                                                                                                                                                                                                                                                                          |
| **Users and organisation** | Roles (admin, grader, viewer), invites, disabling accounts, organisation default model                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| **Standards**              | Grade limits per defect class, total defects, moisture and test weight, plus the defect definitions given to Claude. No official standards are built in: copy the limits from the standard you grade against                                                                                                                                                                                                                                                                                                                                                                 |
| **Reference images**       | Close-ups of your own kernels per class, sent with every Claude request (prompt-cached)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| **Samples**                | Sample mass, moisture, test weight, source, standard and model per sample                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| **Imaging**                | Perspective correction to the 20 × 28 cm grid, Otsu thresholding against the board, morphological opening to drop grid lines, connected components, touching-kernel detection, fixed-scale crops and numbered sheets of 30                                                                                                                                                                                                                                                                                                                                                   |
| **Classification**         | Sheets sent to the Claude API in parallel with structured JSON output: kernel number, class, confidence and reason. Refusals fall back server-side to another model where supported. Token usage is recorded per run                                                                                                                                                                                                                                                                                                                                                         |
| **Review**                 | Flagged kernels (any defect, low confidence or touching kernels) queued for the operator to confirm or correct                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| **Weighing and grading**   | Cup weights → mass % → the first grade whose limits are met, with the reasons stricter grades failed                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| **Reports**                | PDF report with circled defects, CSV export, optional plain-language summary written by Claude from the computed figures                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| **Validation**             | Enter a certified grader's result for the same sample; per-class bias and agreement across 30–50 samples                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| **Dataset**                | Every operator-confirmed kernel is a training label: ZIP export of crops sorted by class with a labels CSV                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| **Autopilot**              | The AI does the routine work: finds the grid's corners, counts and classifies every kernel, gets an independent second opinion on each defect, and finishes the sample with its report and summary. A person reviews only what the AI isn't sure about: kernels where the two passes disagree, low-confidence or unclear verdicts, touching kernels, harmful classes such as ergot, and a small random spot check (3% by default) that keeps measuring accuracy. Weighing the cups is an optional check unless the standard requires it. On by default; Settings → Autopilot |
| **Crops and classes**      | Per-crop class lists grouped like EN 15587 (grain admixtures, broken & defective, impurities & foreign material, harmful & disease; sound kernels give purity). Presets for wheat, barley, oats, rapeseed and hemp, editable, plus your own crops                                                                                                                                                                                                                                                                                                                            |
| **Instant estimate**       | Mass % estimated from kernel areas as soon as the photos are classified. Weighing stays the verified result; a standard can allow completing a sample on the estimate                                                                                                                                                                                                                                                                                                                                                                                                        |
| **Verified reports**       | Completing a sample issues a certificate with a code and QR code; anyone can check it at `/verify`. Reopening withdraws it, and the next completion issues a new version                                                                                                                                                                                                                                                                                                                                                                                                     |
| **Analytics**              | Throughput, grades, purity and defect groups over time and by source, operator overrides of Claude's verdicts, and photo estimate against scale                                                                                                                                                                                                                                                                                                                                                                                                                              |
| **Public website**         | Landing page, interactive demo of published samples, ROI calculator, contact form with enquiries inbox, knowledge hub (guides, glossary, news, case studies) and report verification. Run by the site-owner organisation (`SITE_OWNER_ORG_ID`, or the first organisation created); its admins manage it under _Website_ in the app, and publish demos from a completed sample                                                                                                                                                                                                |
| **Languages**              | English and Hindi interface, switched from the header, sign-in page or Settings and remembered per device. Unchanged preset crop and class names are translated; names an organisation types are shown as typed. Server messages, PDF reports, Claude's reasons and the Claude prompt stay in English                                                                                                                                                                                                                                                                        |
| **Mobile app (PWA)**       | Installable from the browser (Install app in the menu or Settings; Add to Home Screen steps on iPhone). Runs full screen with a native-style phone layout: bottom tabs, a new-sample button and back navigation, switchable to the classic menu in Settings. A service worker caches the app shell so it opens offline and offers a reload when a new version is deployed; `/api` responses are never cached                                                                                                                                                                 |
| **Search (SEO, AEO, GEO)** | Public pages are server-rendered with their own title, description, canonical URL, social preview and Schema.org data, so search engines and AI answer engines that don't run JavaScript read the full page. `robots.txt`, `sitemap.xml` and `llms.txt` are generated from the published content; the app and sign-in pages are kept out of search. See `docs/seo/SEO-AUDIT.md`                                                                                                                                                                                              |

Models: Claude Sonnet 5.5 by default, Claude Haiku 5.5 for lower cost, Claude Opus 5.5 for difficult samples. Set per organisation or per sample.

## Running it

Requires Node.js 22 or newer.

```sh
cp .env.example .env      # set JWT_SECRET and ANTHROPIC_API_KEY
npm install
npm run dev               # API on :3000, web app on :5173
```

Without `DATABASE_URL`, the API uses an embedded PGlite database in `DATA_DIR`. Without `SMTP_URL`, emails are written to the API log, so links can be copied from there. The first account you create becomes the admin of a new organisation.

To try the camera on a phone during development, open `http://<your-computer's-ip>:5173`. Browsers only allow the live camera on HTTPS or localhost; the _Take photo_ button works everywhere.

### Production

```sh
cp .env.example .env      # set JWT_SECRET, ANTHROPIC_API_KEY, POSTGRES_PASSWORD, APP_URL, SMTP_URL
docker compose up -d --build
```

This runs the app on port 3000 with Postgres. Put it behind an HTTPS reverse proxy: the refresh cookie is `Secure` in production, and phones need HTTPS for the live camera. Migrations run on start-up. Photos and crops are stored in the `files` volume.

### Google Cloud Run and Cloud SQL

See [deploy/cloud-run.md](deploy/cloud-run.md): Cloud SQL for PostgreSQL, photos in a Cloud Storage bucket, secrets in Secret Manager, migrations as a Cloud Run job. Deploy with `--no-cpu-throttling`, because kernel detection and Claude requests run after the upload request returns.

### Database migrations

SQL migrations are in [`apps/api/drizzle`](apps/api/drizzle), generated from `apps/api/src/db/schema.ts`. They are applied in order and recorded in the `drizzle.__drizzle_migrations` table:

- at start-up (default; a database lock keeps several instances from migrating at once), or
- with `npm run db:migrate`, or `node apps/api/dist/src/db/migrate-cli.js` in the container, and `RUN_MIGRATIONS=false` on the server.

The `.sql` files also run as-is in `psql`. If the tables were created that way, the app notices at start-up, records the matching migrations as applied and runs only newer ones.

## Development

```sh
npm run check      # typecheck, lint, format check and tests (what CI runs)
npm run build      # build everything
npm run db:generate -- --name <change>   # after editing apps/api/src/db/schema.ts
```

```
packages/core   grading logic shared by API and web: classes, mass %, grades, validation statistics, homography
apps/api        Fastify API, organised by module under src/modules
apps/web        React web app for phones and desktops
```

Tests cover the grading logic, the imaging pipeline on synthetic board photos, the auth flows, the request sent to Claude, file storage, recovery of interrupted jobs, and a full sample from photo to report. They use an in-memory database and a fake classifier, so they need no API key. To run the API tests against a real Postgres server, set `TEST_DATABASE_URL` (for example `postgres://postgres@localhost:5432/postgres`); each test file gets its own new database there.

## Limits, and how to check them

- Claude is a general-purpose AI, not trained on your grain. Accuracy is unknown until tested, and subtle defects (light heat damage, early sprouting, Fusarium versus weather bleaching) will be the weakest.
- One phone photo gives one or two views and no NIR or UV light, so internal and fluorescent defects are invisible.
- Results change with lighting and phone model, so keep the setup fixed.
- Validate before relying on it: grade 30–50 samples both ways (certified grader and this method) and compare per class on the Validation page.
