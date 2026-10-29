import { classLabel, kernelClassIds } from "@ai-grain/core";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { api } from "../api/client";
import { useCrop } from "../api/crops";
import { CropSelect } from "../components/CropSelect";
import type { ReferenceImage } from "../api/types";
import { useCan } from "../auth/AuthContext";
import { AuthImage, Card, ErrorNote, Field, Spinner } from "../components/ui";

export function ReferencesPage() {
  const can = useCan();
  const qc = useQueryClient();
  const [crop, setCrop] = useState("wheat");
  const refs = useQuery({
    queryKey: ["references", crop],
    queryFn: () =>
      api.get<ReferenceImage[]>(
        `/reference-images?crop=${encodeURIComponent(crop)}`,
      ),
  });
  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/reference-images/${id}`),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["references"] }),
  });
  const cropProfile = useCrop(crop);
  const classes = cropProfile?.classes ?? [];
  const byClass = new Map<string, ReferenceImage[]>();
  for (const r of refs.data ?? [])
    byClass.set(r.cls, [...(byClass.get(r.cls) ?? []), r]);

  return (
    <div className="stack">
      <h1>Reference images</h1>
      <p className="muted small">
        Close-ups of kernels from your own grain, one per defect type or more.
        Up to 12 per crop, spread across classes, are sent to Claude with every
        request. They improve accuracy more than anything else you can add. The
        quickest way to add one is “Use as a reference example” on a reviewed
        kernel.
      </p>
      <Field label="Crop">
        <CropSelect value={crop} onChange={setCrop} />
      </Field>
      {can.write && <UploadReference crop={crop} />}
      {refs.isPending && <Spinner />}
      <ErrorNote error={refs.error ?? remove.error} />
      {[
        ...kernelClassIds(classes),
        ...[...byClass.keys()].filter(
          (k) => !kernelClassIds(classes).includes(k),
        ),
      ]
        .filter((c) => byClass.has(c))
        .map((c) => (
          <Card
            key={c}
            title={`${classLabel(classes, c)} (${byClass.get(c)!.length})`}
          >
            <div className="thumb-grid">
              {byClass.get(c)!.map((r) => (
                <figure key={r.id}>
                  <AuthImage
                    path={`/reference-images/${r.id}/image`}
                    alt={classLabel(classes, c)}
                    className="crop"
                  />
                  {r.note && (
                    <figcaption className="small">{r.note}</figcaption>
                  )}
                  {can.write && (
                    <button
                      className="link small"
                      onClick={() => remove.mutate(r.id)}
                    >
                      Remove
                    </button>
                  )}
                </figure>
              ))}
            </div>
          </Card>
        ))}
      {refs.data?.length === 0 && (
        <p className="muted">
          No reference images for {cropProfile?.label ?? crop} yet.
        </p>
      )}
    </div>
  );
}

function UploadReference({ crop }: { crop: string }) {
  const qc = useQueryClient();
  const input = useRef<HTMLInputElement>(null);
  const classes = useCrop(crop)?.classes ?? [];
  const [cls, setCls] = useState("broken");
  const [note, setNote] = useState("");
  const upload = useMutation({
    mutationFn: (file: File) => {
      const form = new FormData();
      form.set("crop", crop);
      form.set("cls", cls);
      if (note) form.set("note", note);
      form.set("image", file);
      return api.upload("/reference-images", form);
    },
    onSuccess: () => {
      setNote("");
      void qc.invalidateQueries({ queryKey: ["references"] });
    },
  });
  return (
    <Card title="Add from a photo">
      <p className="muted small">
        Use a close-up of a single kernel, cropped square, on the same dark
        board.
      </p>
      <div className="grid-3">
        <Field label="Class">
          <select value={cls} onChange={(e) => setCls(e.target.value)}>
            {kernelClassIds(classes).map((c) => (
              <option key={c} value={c}>
                {classLabel(classes, c)}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Note (optional)">
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="e.g. early sprouting"
          />
        </Field>
        <div className="field">
          <span className="field-label">&nbsp;</span>
          <button
            className="primary"
            disabled={upload.isPending}
            onClick={() => input.current?.click()}
          >
            Choose image
          </button>
        </div>
      </div>
      <input
        ref={input}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) upload.mutate(file);
          e.target.value = "";
        }}
      />
      <ErrorNote error={upload.error} />
    </Card>
  );
}
