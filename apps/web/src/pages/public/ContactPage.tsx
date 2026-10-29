import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "../../api/client";
import { ErrorNote, Field } from "../../components/ui";
import { usePublicSite } from "./PublicLayout";

export function ContactPage() {
  const site = usePublicSite();
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
        <span className="eyebrow">Contact</span>
        <h1>Talk to our grain analysis team</h1>
        <p className="hero-lead">
          Tell us about your crops, standards and volumes, or book a time to
          talk.
        </p>
      </section>
      <section className="site-section contact">
        <div className="stack">
          {site.data?.bookingUrl && (
            <div className="card">
              <strong>Book a meeting</strong>
              <p className="muted small">
                Pick a slot for a live walkthrough on your grain.
              </p>
              <a
                className="button primary"
                href={site.data.bookingUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                Book a meeting
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
            <p>
              Thank you, {form.name}. Your message has been sent and we&apos;ll
              reply to {form.email}.
            </p>
          ) : (
            <form
              className="stack"
              onSubmit={(e) => {
                e.preventDefault();
                send.mutate();
              }}
            >
              <div className="grid-2">
                <Field label="Name">
                  <input
                    required
                    autoComplete="name"
                    value={form.name}
                    onChange={set("name")}
                  />
                </Field>
                <Field label="Email">
                  <input
                    required
                    type="email"
                    autoComplete="email"
                    value={form.email}
                    onChange={set("email")}
                  />
                </Field>
                <Field label="Company (optional)">
                  <input
                    autoComplete="organization"
                    value={form.company}
                    onChange={set("company")}
                  />
                </Field>
                <Field label="Phone (optional)">
                  <input
                    type="tel"
                    autoComplete="tel"
                    value={form.phone}
                    onChange={set("phone")}
                  />
                </Field>
              </div>
              <Field label="Message">
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
                I agree that my details are stored to answer this message.
              </label>
              <ErrorNote error={send.error} />
              <button className="primary" disabled={send.isPending}>
                {send.isPending ? "Sending…" : "Send message"}
              </button>
            </form>
          )}
        </div>
      </section>
    </div>
  );
}
