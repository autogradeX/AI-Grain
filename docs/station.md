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

Each organisation can train a small model for each crop from its own reviewed
samples (**Quality → Local model**). It runs on the station itself, with no
internet, and classifies kernel crops from measurements made by classic image
processing (shape, colour, texture, size relative to the photo). Counting and
corner finding don't change.

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
  makes a new version and the previous one is kept for comparison.

## Hardware

- Mini PC or laptop: 4 cores, 8–16 GB RAM, 256 GB SSD, Linux (Ubuntu 24.04 LTS) or Windows with Docker Desktop.
- Wi-Fi router for the mandi (it doesn't need internet; plug its WAN port into the internet line when there is one).
- Optional: 80 mm thermal printer (USB), lab balance with USB/RS-232 (read in Chrome or Edge on the station itself), UPS.

Give the station a fixed address on the router (DHCP reservation), for example `192.168.1.20`.

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
