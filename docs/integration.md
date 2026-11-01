# Connecting APMC, eNAM and ERP systems

AI-Grain sends each completed sample's result to other systems in one JSON
format, `ai-grain/assaying-result@1`. There are two ways to receive it:

- **Webhook (push):** set a receiver URL under **Integrations**. Every sample
  that completes is POSTed there as it happens.
- **API (pull):** create an API key under **Integrations** and read results
  with `GET /api/v1/results`.

Use both for reliability: the webhook for speed, and the API to catch up on
anything the receiver missed (it was down, or a delivery failed three times).

## The result

```json
{
  "schema": "ai-grain/assaying-result@1",
  "sampleId": "6f0c…",
  "sampleNumber": 128,
  "lot": "Lot 42 / truck CG04 AB 1234",
  "organisation": "Krishi Upaj Mandi Samiti Raipur",
  "commodity": { "key": "paddy", "name": "Paddy" },
  "status": "completed",
  "assayedAt": "2026-11-23T05:41:09.000Z",
  "standard": "Paddy FAQ (Mandi)",
  "grade": "FAQ",
  "resultSource": "estimate",
  "purityPct": 96.4,
  "totalDefectsPct": 3.6,
  "sampleMassG": null,
  "parameters": [
    {
      "code": "admixture",
      "name": "Grain admixtures",
      "kind": "group",
      "value": 0.8,
      "unit": "%"
    },
    {
      "code": "lower_class",
      "name": "Admixture of lower class",
      "kind": "class",
      "group": "admixture",
      "value": 0.8,
      "unit": "%"
    },
    {
      "code": "damaged",
      "name": "Damaged / discoloured / sprouted / weevilled",
      "kind": "class",
      "group": "broken_defective",
      "value": 1.1,
      "unit": "%"
    },
    {
      "code": "moisture",
      "name": "Moisture",
      "kind": "measurement",
      "value": 16.5,
      "unit": "%"
    },
    {
      "code": "length",
      "name": "Mean kernel length",
      "kind": "measurement",
      "value": 8.92,
      "unit": "mm"
    },
    {
      "code": "lb_ratio",
      "name": "Length / breadth ratio",
      "kind": "measurement",
      "value": 3.41,
      "unit": ""
    }
  ],
  "kernels": { "analysed": 412, "checkedByPerson": 31 },
  "repeatOf": null,
  "certificate": {
    "code": "BQDC-G5RV-T9Q7",
    "version": 1,
    "sha256": "9a3f…",
    "verifyUrl": "https://grain.example.org/verify/BQDC-G5RV-T9Q7"
  }
}
```

- **`parameters`:** one entry per defect group, per defect class of the
  commodity (as set up under **Crops and classes**), and per measurement.
  `code` is stable: map it once to the receiving system's parameter names.
- **`resultSource`:** says whether mass percentages come from weighing the
  cups (`weighed`) or from kernel areas in the photos (`estimate`).
- **`certificate.verifyUrl`:** a public page that confirms the result, the
  same one the QR code on the printed report opens.

## Webhook

Each delivery is a `POST` with a JSON body:

```json
{ "id": "a1b2c3…", "event": "sample.completed", "createdAt": "…", "data": { …result… } }
```

Headers:

| Header                | Meaning                                                                              |
| --------------------- | ------------------------------------------------------------------------------------ |
| `X-AIGrain-Event`     | `sample.completed`, or `test` from the **Send a test** button                        |
| `X-AIGrain-Delivery`  | The delivery's id. The same id is sent on retries, so use it to ignore duplicates.   |
| `X-AIGrain-Signature` | `sha256=` followed by the HMAC-SHA256 of the raw body, keyed with the signing secret |

Check the signature before trusting a delivery. In Node.js:

```js
import { createHmac, timingSafeEqual } from "node:crypto";

function verified(rawBody, header, secret) {
  const expected =
    "sha256=" + createHmac("sha256", secret).update(rawBody).digest("hex");
  return (
    header.length === expected.length &&
    timingSafeEqual(Buffer.from(header), Buffer.from(expected))
  );
}
```

Answer with any 2xx status. Anything else, or no answer within 10 seconds,
is retried twice (after 1 and 4 seconds). Every delivery and failure is
written to the activity log under **Settings**.

## API

Send the key in `Authorization: Bearer agk_…` (or `X-API-Key: agk_…`).
Keys are read-only and belong to one organisation. They are shown once, when
created, and can be revoked at any time.

| Request                                                    | Returns                                                                                                                              |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `GET /api/v1/results?since=<ISO time>&limit=50&crop=paddy` | Completed results, oldest first, completed after `since`. Poll with the `next` value of the previous page (or the last `assayedAt`). |
| `GET /api/v1/results/<sample number or id>`                | One result                                                                                                                           |

```sh
curl -H "Authorization: Bearer $AIGRAIN_KEY" \
  "https://grain.example.org/api/v1/results?since=2026-11-01T00:00:00Z"
```

A signed-in user can download the same JSON for any sample from its page
(**Result file**), or from `GET /api/samples/<id>/result.json`.
