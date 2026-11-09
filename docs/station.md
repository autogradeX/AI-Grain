# Running AI-Grain as a station at a mandi

A station is AI-Grain on a small computer at the mandi. Phones and tablets
reach it over the mandi's own Wi-Fi, so assaying goes on when the internet is
down. Whenever there is internet, the station sends each result and its
certificate to the central AI-Grain server.

```
 Phones / tablet ──Wi-Fi (no internet needed)──▶  Station (mini PC)
                                                  AI-Grain + database + printer
                                                        │
                                       when internet is up │ results and certificates,
                                                        ▼   retried until delivered
                                  Central server (AI-Grain cloud, APMC / eNAM bridge)
```

## What works without internet

| Works offline                                                   | Waits for internet                                                                                                                                                                                                                                                          |
| --------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Photos, finding the board, counting, splitting touching kernels | Classification by Model Orchestration: photos are classified by the **local model** when it has passed its checks (see below), otherwise they show **Waiting for internet** and carry on by themselves when it is back (the assayer can classify kernels by hand meanwhile) |
| Kernel size, the photo estimate, weighing, grading              | The plain-language summary                                                                                                                                                                                                                                                  |
| Review, PDF reports, 80 mm slips, printing, the scale           | Sending results to the central server and the webhook (kept in the outbox until delivered)                                                                                                                                                                                  |
| Certificates (verifiable on the central site once sent)         | Email (only if set up)                                                                                                                                                                                                                                                      |

## The local model

A model for each crop that runs on the station itself, with no internet, and
classifies kernel crops (**Quality → Local model**). Counting and corner
finding don't change.

- **What it reads:** each crop is described by a pretrained image model
  (MobileNetV2 from the ONNX model zoo, Apache-2.0, about 5 ms per kernel on
  the CPU), plus its size and colour relative to the photo. A small network
  learns the crop's classes on top. The image model ships in the Docker
  image (`npm run fetch-model` downloads it at build time and checks its
  checksum); without it, the model falls back to kernel measurements.
- **Altered copies:** classes with few real kernels are filled up to about
  1000 training examples with turned, mirrored and relit copies of their real
  crops. The quality check below uses real, unaltered crops from photos held
  back from training, never copies.

- **What it learns from:** kernels a person reviewed (full weight) and
  kernels Model Orchestration settled confidently (half weight). Unclear
  kernels and clusters are left out. Each class needs at least 12 examples
  and the crop at least 100; classes with fewer are left out of the model.
- **Checked before use:** about a fifth of the photos are held back from
  training. The model is used only if, on those, it catches at least 80% of
  defects, its confident verdicts are at least 95% right, and at least 20
  kernels were checked. The page shows these numbers, per-class precision and
  recall, and what is missing when it isn't used yet.
- **Modes:** _Only when offline_ (default: used when Model Orchestration
  can't be reached), _Always_ (never calls Model Orchestration for that
  crop), _Off_ (photos wait for internet).
- **Who reviews what:** only high-confidence verdicts on non-harmful
  kernels stand. Harmful classes, medium- and low-confidence verdicts,
  clusters, unclear kernels and spot checks go to a person. Locally
  classified photos skip the second opinion and expert pass; reports say
  **Classified offline**.
- **Retraining:** train again after more samples are reviewed; each training
  makes a new version and the previous one is kept for comparison. Training
  runs on a worker thread, so the station keeps answering meanwhile.

### One model for the whole network

When a station is connected to a central server (below), every completed
sample also sends its checked kernels there: the crop image, its class,
and its size and colour relative to the photo. Unchecked sound kernels are
sampled (at most 40 per photo). They go through the outbox like results, so
nothing is lost offline, and a resent kernel replaces itself.

1. On the central server, **Local model → Train a new version** trains on its
   own kernels plus everything its stations sent ("From stations" column).
2. Each station asks the central server for newer models every half hour
   (or at once with **Check for a newer one**) and keeps the latest one.
3. A station classifies with the network's model while it clears the quality
   bar, and with its own model otherwise. Verdicts in a class the station
   doesn't use become "unclear" and go to a person.

Stations download models with their station key (`GET /api/v1/local-models`,
`GET /api/v1/local-models/{crop}`); read keys can't.

## Hardware

- Mini PC or laptop: 4 cores, 8–16 GB RAM, 256 GB SSD, Linux (Ubuntu 24.04 LTS) or Windows with Docker Desktop.
- Wi-Fi router for the mandi (it doesn't need internet; plug its WAN port into the internet line when there is one).
- Optional: 80 mm thermal printer (USB), lab balance with USB/RS-232 (read in Chrome or Edge on the station itself), UPS.
- Optional: two USB cameras for both sides of every grain at once (see **Two cameras** below).
- Optional: grain moisture meter with a USB or RS-232 output. The drop button beside **Moisture** waits for the meter's next result (press its print or test key); most layouts are understood ("MOISTURE: 13.4 %", "13.4% T=27.1C", "Wheat,13.4,27.1"). The balance and the meter each remember their own port.
- Optional: NIR analyser for protein and oil. Export its results as CSV and use **Samples → Import NIR results**: rows are matched by sample number or e-NAM lot ID, previewed, and only change samples still in progress.

Give the station a fixed address on the router (DHCP reservation), for example `192.168.1.20`.

## Two cameras (top and bottom)

A rig with one camera above and one below a clear glass or acrylic tray
photographs both sides of every grain in one go. On the capture screen choose
**Two USB cameras (top and bottom)**, pick which camera is which (remembered
on that computer), and press **Take both photos**.

- **Same view:** both cameras must frame the same area of the glass,
  ideally the whole tray. A close-up from one camera and the whole tray
  from the other can't be lined up: the bottom photo is then refused
  ("couldn't be lined up … kernels paired").
- **Nothing printed in view:** no boxes, labels or text behind the glass or
  around the tray: lettering is counted as small grains. A plain backdrop
  (or the light panel) is best. Dark plain areas are ignored.
- **Pictures:** two-camera photos always use the whole picture (no board is
  looked for). Wide webcam pictures are turned a quarter turn to fill the
  upright frame.
- **Tray:** clear glass or acrylic, clean, with no printed grid (the grid
  board is opaque). Spread the kernels in one layer, not touching. Without
  the board, sizes in mm need a reference coin on the tray (Settings).
- **Light:** even, diffused light from both sides (a light panel under the
  glass and a ring or panel above), so neither camera sees glare or deep
  shadows.
- **Cameras:** 8 MP or more, fixed focus at the tray, mounted firmly. They may
  sit at different heights or be turned against each other: the server lines
  the two photos up from the kernels themselves, no calibration needed. The
  bottom camera's photo is mirrored on arrival.
- **USB:** both cameras run at once, opened one after the other, at Full HD
  and 15 frames a second (enough for still photos); a camera that can't start
  steps down to 1280×720, then 640×480. The size each runs at shows under its
  preview. If one still won't start ("Could not start video source"), the
  two usually share one USB controller: plug one into a port on the other
  side of the computer or a USB 3 port, or use a powered hub, close other
  apps using a camera, and press **Try again**. Both cameras run at the same
  size, stepping down together until both fit. When the remembered pair
  won't run (a laptop's built-in camera or a camera listed twice is in the
  list), every camera is tried until two give pictures together; **Find my
  cameras** does the same on demand. Two cameras of the same model are
  numbered; **Swap top and bottom** fixes a mix-up (the top camera shows the
  grains against the tray, the bottom one sees them from below).
- **Blank pictures:** before sending, each picture is checked. A camera that
  is covered, out of focus (a bottom camera touching the glass) or washed out
  by a light panel between it and the glass gives an even picture: the screen
  says which camera and what to check, and nothing is sent.

What happens: each grain the top camera sees is paired with its underside;
it is counted once, and a defect seen only from below counts (a "sound" top
with a confident underside defect takes the defect). An unsure underside
verdict, two different defects, or anything harmful on either side goes to a
person, who sees both crops in review. Grains only one camera saw count on
their own. If the two photos can't be lined up (different trays, the tray
moved, a camera knocked), the bottom photo is marked failed with that reason:
delete both and take them again.

## Install

```sh
# Docker and the code
sudo apt install -y docker.io docker-compose-v2 git
sudo systemctl enable --now docker          # Docker, and so AI-Grain, starts at boot
sudo git clone https://github.com/autogradex/ai-grain /opt/ai-grain
cd /opt/ai-grain
sudo cp .env.example .env
```

Edit `.env`:

```sh
JWT_SECRET=<a long random string: openssl rand -hex 32>
POSTGRES_PASSWORD=<another long random string>
ANTHROPIC_API_KEY=<the key for Model Orchestration>
APP_URL=http://192.168.1.20:3000
STATION_MODE=true
STATION_ADDRESS=http://192.168.1.20:3000
```

Then start it:

```sh
sudo docker compose up -d --build
```

Open `http://192.168.1.20:3000` on the station, create the first account (it
becomes the admin), and go to **Settings**: the **This station** card shows the
address and a QR code that phones scan to open the app. Containers restart by
themselves after a power cut (`restart: unless-stopped`).

## Connect it to the central server

1. On the **central** server: **Integrations → API keys**, name it after the
   station, choose **Station: send results here**, create, and copy the key.
2. On the **station**: **Integrations → Central server**, enter the central
   address (`https://…`) and the key, save, then **Send a test**.

From then on every completed sample goes into **Sending results** on the
station's Integrations page and is delivered whenever there is internet,
oldest first, retried with growing pauses (1 minute up to an hour) until the
central server accepts it. Reopening a sample withdraws its certificate on
the central site too. Report QR codes open the central site, so a buyer can
verify a station's report from anywhere.

## Phones on the station's Wi-Fi

- Phones open `http://192.168.1.20:3000` (scan the QR code in Settings).
- Taking photos with the phone camera works over this plain address. The
  installable app and the live camera guide need https. For those, put the
  station behind a reverse proxy with a certificate the phones trust (for
  example Caddy with `tls internal`, and its root certificate installed on
  the phones), or use a domain with a public certificate.
- Phones that lose the Wi-Fi keep new samples and photos on the phone and
  upload them when they are back on it.

## Updates

```sh
cd /opt/ai-grain
sudo git pull
sudo docker compose up -d --build     # database changes run by themselves at start
```

Do it when the mandi is closed; it takes a few minutes.

## Backups

```sh
sudo sh deploy/station/backup.sh      # database + photos into backups/<date>
```

Schedule it every night (see the comment at the top of the script) and copy
`backups/` to a USB drive now and then. To restore: `docker compose up -d db`,
then `docker compose exec -T db pg_restore -U aigrain -d aigrain --clean < backups/<date>/database.dump`,
and unpack `files.tar.gz` into the `files` volume.

## When something looks wrong

| You see                                         | Do                                                                                                                                    |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| **Local model** says **Not used yet**           | It needs more reviewed samples of that crop, or it doesn't separate the classes well enough yet. Review more samples and train again. |
| Photos stay **Waiting for internet**            | Check the router's internet line. They carry on by themselves; **Try now** on the sample retries at once.                             |
| **Sending results** keeps growing               | Same; then check the central address and key with **Send a test**. An HTTP 401 means the key was revoked on the central server.       |
| Phones can't open the station                   | The phone is on another Wi-Fi, or the station's address changed (reserve it on the router).                                           |
| The station doesn't come back after a power cut | `sudo systemctl enable docker`, then `sudo docker compose up -d`.                                                                     |
