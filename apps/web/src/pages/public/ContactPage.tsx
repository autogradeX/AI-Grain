import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "../../api/client";
import { ErrorNote, Field } from "../../components/ui";
import { useT } from "../../i18n";
import { m } from "./ContactPage.i18n";
import { usePublicSite } from "./PublicLayout";

export function ContactPage() {
  const site = usePublicSite();
  const t = useT(m);
  const [form, setForm] = useState({
    name: "",
    email: "",
    company: "",
    phone: "",
    message: "",
    website: "",
  });
  const [consent, setConsent] = useState(false);
  const send = useMutation({
    mutationFn: () =>
      api.post("/public/contact", {
        name: form.name,
        email: form.email,
        message: form.message,
        consent,
        ...(form.company && { company: form.company }),
        ...(form.phone && { phone: form.phone }),
        ...(form.website && { website: form.website }),
      }),
  });
  const set =
    (k: keyof typeof form) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm({ ...form, [k]: e.target.value });

  return (
    <div className="site-page">
      <section className="hero compact">
        <span className="eyebrow">{t("eyebrow")}</span>
        <h1>{t("title")}</h1>
        <p className="hero-lead">{t("lead")}</p>
      </section>
      <section className="site-section contact">
        <div className="stack">
          {site.data?.bookingUrl && (
            <div className="card">
              <strong>{t("bookMeeting")}</strong>
              <p className="muted small">{t("bookText")}</p>
              <a
                className="button primary"
                href={site.data.bookingUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                {t("bookMeeting")}
              </a>
            </div>
          )}
          <div className="card stack-sm small">
            <strong>{site.data?.name}</strong>
            {site.data?.contactEmail && (
              <a href={`mailto:${site.data.contactEmail}`}>
                {site.data.contactEmail}
              </a>
            )}
            {site.data?.phone && (
              <a href={`tel:${site.data.phone.replace(/\s/g, "")}`}>
                {site.data.phone}
              </a>
            )}
            {site.data?.address && (
              <span className="muted">{site.data.address}</span>
            )}
          </div>
        </div>
        <div className="card">
          {send.isSuccess ? (
            <p>{t("thanks", { name: form.name, email: form.email })}</p>
          ) : (
            <form
              className="stack"
              onSubmit={(e) => {
                e.preventDefault();
                send.mutate();
              }}
            >
              <div className="grid-2">
                <Field label={t("name")}>
                  <input
                    required
                    autoComplete="name"
                    value={form.name}
                    onChange={set("name")}
                  />
                </Field>
                <Field label={t("email")}>
                  <input
                    required
                    type="email"
                    autoComplete="email"
                    value={form.email}
                    onChange={set("email")}
                  />
                </Field>
                <Field label={t("company")}>
                  <input
                    autoComplete="organization"
                    value={form.company}
                    onChange={set("company")}
                  />
                </Field>
                <Field label={t("phone")}>
                  <input
                    type="tel"
                    autoComplete="tel"
                    value={form.phone}
                    onChange={set("phone")}
                  />
                </Field>
              </div>
              <Field label={t("message")}>
                <textarea
                  required
                  rows={5}
                  maxLength={5000}
                  value={form.message}
                  onChange={set("message")}
                />
              </Field>
              {/* Hidden from people; bots fill it in and the server rejects the message. */}
              <input
                className="hp"
                tabIndex={-1}
                autoComplete="off"
                aria-hidden="true"
                name="website"
                value={form.website}
                onChange={set("website")}
              />
              <label className="row small">
                <input
                  type="checkbox"
                  required
                  checked={consent}
                  onChange={(e) => setConsent(e.target.checked)}
                />{" "}
                {t("consent")}
              </label>
              <ErrorNote error={send.error} />
              <button className="primary" disabled={send.isPending}>
                {send.isPending ? t("sending") : t("send")}
              </button>
            </form>
          )}
        </div>
      </section>
    </div>
  );
}
