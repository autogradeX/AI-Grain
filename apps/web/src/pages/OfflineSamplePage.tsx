import { CROP_PRESETS } from "@ai-grain/core";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useCrops } from "../api/crops";
import { Card, ErrorNote } from "../components/ui";
import { useT } from "../i18n";
import { useGrainLabels } from "../i18n/common";
import {
  createdSamples,
  deviceStore,
  enqueue,
  newRef,
  refreshStatus,
  useQueueStatus,
  type QueuedPhoto,
  type QueuedSample,
} from "../offline/queue";
import { m } from "./OfflineSamplePage.i18n";

/** Thumbnails for queued photos, revoked when the page closes. */
function useThumbs(photos: QueuedPhoto[]) {
  const urls = useMemo(
    () =>
      Object.fromEntries(
        photos.map((p) => [p.ref, URL.createObjectURL(p.photo)]),
      ) as Record<string, string>,
    [photos],
  );
  useEffect(
    () => () => Object.values(urls).forEach((u) => URL.revokeObjectURL(u)),
    [urls],
  );
  return urls;
}

/**
 * A sample created without a connection: its photos are taken and kept on
 * the device until the queue uploads them.
 */
export function OfflineSamplePage() {
  const t = useT(m);
  const { cropLabel } = useGrainLabels();
  const crops = useCrops();
  const { ref = "" } = useParams();
  const status = useQueueStatus();
  const [sample, setSample] = useState<QueuedSample | null | undefined>();
  const [photos, setPhotos] = useState<QueuedPhoto[]>([]);
  const [error, setError] = useState<unknown>(null);
  const camera = useRef<HTMLInputElement>(null);
  const gallery = useRef<HTMLInputElement>(null);
  const thumbs = useThumbs(photos);

  const apply = useCallback(
    (items: Awaited<ReturnType<typeof deviceStore.list>>) => {
      setSample(
        (items.find((i) => i.kind === "sample" && i.ref === ref) as
          QueuedSample | undefined) ?? null,
      );
      setPhotos(
        items
          .filter(
            (i): i is QueuedPhoto => i.kind === "photo" && i.sampleRef === ref,
          )
          .sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
      );
    },
    [ref],
  );
  const load = useCallback(() => deviceStore.list().then(apply), [apply]);
  // Reload whenever the queue changes (photos added, or uploaded).
  useEffect(() => {
    let alive = true;
    deviceStore
      .list()
      .then((items) => alive && apply(items))
      .catch((err: unknown) => alive && setError(err));
    return () => {
      alive = false;
    };
  }, [apply, status.photos, status.samples, status.syncing]);

  const add = async (files: FileList | null) => {
    if (!files?.length) return;
    try {
      for (const f of files) {
        await enqueue({
          kind: "photo",
          ref: newRef(),
          createdAt: new Date().toISOString(),
          sampleRef: ref,
          photo: f,
          side: "auto",
          finish: false,
        });
      }
      await load();
    } catch (err) {
      setError(err);
    }
  };
  const finishOnLast = async (on: boolean) => {
    const last = photos.at(-1);
    for (const p of photos)
      await deviceStore.put({ ...p, finish: on && p.ref === last?.ref });
    await load();
  };
  const remove = async (p: QueuedPhoto) => {
    await deviceStore.remove(p.ref);
    await refreshStatus();
    await load();
  };

  if (sample === undefined) return null;
  if (sample === null || (sample.sampleId && photos.length === 0)) {
    const created = sample?.sampleId
      ? { id: sample.sampleId, number: sample.sampleNumber ?? 0 }
      : createdSamples()[ref];
    return (
      <div className="stack">
        <h1>{t("uploaded")}</h1>
        <div className="row wrap">
          {created && (
            <Link to={`/app/samples/${created.id}`} className="button primary">
              {t("openSample", { number: created.number })}
            </Link>
          )}
          <Link to="/app" className="button">
            {t("toSamples")}
          </Link>
        </div>
      </div>
    );
  }

  const finishing = photos.some((p) => p.finish);
  return (
    <div className="stack">
      <div>
        <Link to="/app" className="muted small">
          {t("toSamples")}
        </Link>
        <h1>{t("title")}</h1>
        <p className="muted small">{t("intro")}</p>
      </div>
      <Card>
        <dl className="facts">
          <dt>{t("crop")}</dt>
          <dd>
            {cropLabel(
              crops.data?.find((c) => c.key === sample.data.crop)?.label ??
                CROP_PRESETS[sample.data.crop]?.label ??
                sample.data.crop,
            )}
          </dd>
          {sample.data.source && (
            <>
              <dt>{t("lot")}</dt>
              <dd>{sample.data.source}</dd>
            </>
          )}
        </dl>
      </Card>
      <Card title={photos.length ? t.n("photos", photos.length) : undefined}>
        {photos.length === 0 && <p className="muted">{t("noPhotos")}</p>}
        {photos.length > 0 && (
          <ul className="capture-many">
            {photos.map((p) => (
              <li key={p.ref}>
                {thumbs[p.ref] && <img src={thumbs[p.ref]} alt="" />}
                {p.error ? (
                  <span className="error small">
                    {t("refused", { reason: p.error })}
                  </span>
                ) : null}
                <button
                  type="button"
                  className="link small"
                  onClick={() => void remove(p)}
                >
                  {t("remove")}
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="row wrap">
          <button className="primary" onClick={() => camera.current?.click()}>
            {t("takePhoto")}
          </button>
          <button onClick={() => gallery.current?.click()}>
            {t("choosePhotos")}
          </button>
        </div>
        <input
          ref={camera}
          type="file"
          accept="image/*"
          capture="environment"
          hidden
          onChange={(e) => void add(e.target.files)}
        />
        <input
          ref={gallery}
          type="file"
          accept="image/*"
          multiple
          hidden
          onChange={(e) => void add(e.target.files)}
        />
        {photos.length > 0 && (
          <label className="row small">
            <input
              type="checkbox"
              checked={finishing}
              onChange={(e) => void finishOnLast(e.target.checked)}
            />
            {t("allPhotos")}
          </label>
        )}
        {finishing && <p className="muted small">{t("willFinish")}</p>}
        <ErrorNote error={error} />
      </Card>
    </div>
  );
}
