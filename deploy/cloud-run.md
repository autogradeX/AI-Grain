# Deploying to Google Cloud Run with Cloud SQL

The app runs as one container on Cloud Run, with PostgreSQL on Cloud SQL and photos in a Cloud Storage bucket.

```
phone browser ──HTTPS──▶ Cloud Run (API + web app) ──Unix socket──▶ Cloud SQL (PostgreSQL 16)
                                   │
                                   ├──▶ Cloud Storage bucket (photos, kernel crops, reference images)
                                   └──▶ Claude API
```

## Settings that matter on Cloud Run

| Setting                                   | Why                                                                                                                                                                                                      |
| ----------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--no-cpu-throttling`                     | Kernel detection and Claude classification run after the upload request returns. With the default CPU throttling, they get almost no CPU and stall. This switches the service to instance-based billing. |
| `STORAGE_BUCKET`                          | The container disk is temporary and not shared between instances. Without a bucket, photos vanish on restart and other instances can't read them.                                                        |
| `DATABASE_URL` with `?host=/cloudsql/...` | Connects to Cloud SQL through the socket Cloud Run mounts for `--add-cloudsql-instances`. Without it the app uses an embedded database that is lost on restart.                                          |
| `DB_POOL_MAX` × `--max-instances`         | Must stay below the Cloud SQL instance's connection limit.                                                                                                                                               |
| `--memory=2Gi --cpu=2`                    | Straightening a 12 MP photo holds a few hundred MB of pixels.                                                                                                                                            |
| `RUN_MIGRATIONS=false` + migration job    | Run migrations once per release, as a job. (Migrations at start-up also work: a database lock stops instances from migrating at the same time.)                                                          |

Interrupted jobs are safe: when an instance stops during detection or classification, the batch is marked failed after 10 minutes without progress, and the operator can retry. Already-classified kernels are kept.

## One-time setup

```sh
PROJECT=your-project-id
REGION=europe-west1
BUCKET=$PROJECT-ai-grain-files
IMAGE=$REGION-docker.pkg.dev/$PROJECT/ai-grain/app
SA=ai-grain-run@$PROJECT.iam.gserviceaccount.com
gcloud config set project $PROJECT

gcloud services enable run.googleapis.com sqladmin.googleapis.com artifactregistry.googleapis.com \
  cloudbuild.googleapis.com secretmanager.googleapis.com storage.googleapis.com

# Container registry
gcloud artifacts repositories create ai-grain --repository-format=docker --location=$REGION

# Cloud SQL for PostgreSQL 16
gcloud sql instances create aigrain-db --database-version=POSTGRES_16 \
  --edition=enterprise --tier=db-g1-small --region=$REGION
gcloud sql databases create aigrain --instance=aigrain-db
DB_PASSWORD=$(openssl rand -base64 24 | tr -d '/+=')
gcloud sql users create aigrain --instance=aigrain-db --password="$DB_PASSWORD"

# Bucket for photos
gcloud storage buckets create gs://$BUCKET --location=$REGION --uniform-bucket-level-access

# Service account for the service and the migration job
gcloud iam service-accounts create ai-grain-run
gcloud projects add-iam-policy-binding $PROJECT --member=serviceAccount:$SA --role=roles/cloudsql.client
gcloud storage buckets add-iam-policy-binding gs://$BUCKET --member=serviceAccount:$SA --role=roles/storage.objectAdmin

# Secrets
printf %s "$(openssl rand -base64 48)" | gcloud secrets create jwt-secret --data-file=-
printf %s "sk-ant-..." | gcloud secrets create anthropic-api-key --data-file=-
printf %s "postgres://aigrain:$DB_PASSWORD@/aigrain?host=/cloudsql/$PROJECT:$REGION:aigrain-db" \
  | gcloud secrets create database-url --data-file=-
for s in jwt-secret anthropic-api-key database-url; do
  gcloud secrets add-iam-policy-binding $s --member=serviceAccount:$SA --role=roles/secretmanager.secretAccessor
done
```

Add `smtp-url` the same way for real emails (verification, password reset, invites), and pass it as `SMTP_URL`. Until then, emails go to the service logs.

## Each release

```sh
# Build the image (Cloud Build builds for linux/amd64, which Cloud Run needs)
gcloud builds submit --tag $IMAGE:latest

# Apply migrations (first release: create the job; later: update its image)
gcloud run jobs create ai-grain-migrate --image=$IMAGE:latest --region=$REGION \
  --service-account=$SA --set-cloudsql-instances=$PROJECT:$REGION:aigrain-db \
  --set-secrets=DATABASE_URL=database-url:latest,JWT_SECRET=jwt-secret:latest \
  --command=node --args=apps/api/dist/src/db/migrate-cli.js
# later releases: gcloud run jobs update ai-grain-migrate --image=$IMAGE:latest --region=$REGION
gcloud run jobs execute ai-grain-migrate --region=$REGION --wait

# Deploy the service
gcloud run deploy ai-grain --image=$IMAGE:latest --region=$REGION \
  --service-account=$SA --allow-unauthenticated \
  --add-cloudsql-instances=$PROJECT:$REGION:aigrain-db \
  --set-secrets=JWT_SECRET=jwt-secret:latest,ANTHROPIC_API_KEY=anthropic-api-key:latest,DATABASE_URL=database-url:latest \
  --set-env-vars=STORAGE_BUCKET=$BUCKET,RUN_MIGRATIONS=false,DB_POOL_MAX=5 \
  --no-cpu-throttling --cpu=2 --memory=2Gi --concurrency=40 \
  --min-instances=0 --max-instances=5 --timeout=300
```

`--allow-unauthenticated` lets phones reach the app; the app does its own sign-in. After the first deploy, set the public URL used in emailed links:

```sh
URL=$(gcloud run services describe ai-grain --region=$REGION --format='value(status.url)')
gcloud run services update ai-grain --region=$REGION --update-env-vars=APP_URL=$URL
```

Open the URL and create the first account: it becomes the admin of a new organisation. To stop strangers from signing up after that, set `ALLOW_SIGNUP=false` and add people by invite.

## Checking it

```sh
curl $URL/api/health                                        # {"ok":true}
gcloud run services logs read ai-grain --region=$REGION     # startup warnings list anything missing
```

The startup log warns when `ANTHROPIC_API_KEY`, `SMTP_URL`, `DATABASE_URL` or `STORAGE_BUCKET` is missing.

## Costs to expect

- Cloud Run with `--no-cpu-throttling` bills for the whole time an instance is up. With `--min-instances=0` it scales to zero when nobody is using the app.
- Cloud SQL bills continuously; `db-g1-small` is a small shared-core instance. Use a larger tier and enable backups and high availability for production use.
- Claude API usage per sample appears under the sample (`/api/samples/:id/usage`). Claude Haiku 5.5 is the lowest-cost model.
