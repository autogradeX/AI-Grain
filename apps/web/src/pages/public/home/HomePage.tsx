import { CROP_PRESETS } from "@ai-grain/core";
import { useQuery } from "@tanstack/react-query";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import {
  Fragment,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type PointerEvent,
} from "react";
import { Link } from "react-router-dom";
import { api } from "../../../api/client";
import { useLang, useT } from "../../../i18n";
import { useGrainLabels } from "../../../i18n/common";
import { CategorySection } from "../CategorySection";
import type { ArticleItem } from "../HubPage";
import { m } from "./HomePage.i18n";
import { countByKind, CUP_GROUPS, buildSample } from "./scene/layout";
import type { GrainScene } from "./scene/GrainScene";
import "./home.css";

gsap.registerPlugin(ScrollTrigger);

const FEATURES = [
  ["feature1Title", "feature1Text"],
  ["feature2Title", "feature2Text"],
  ["feature3Title", "feature3Text"],
  ["feature4Title", "feature4Text"],
  ["feature5Title", "feature5Text"],
  ["feature6Title", "feature6Text"],
] as const;

const EQUIPMENT = [
  ["phone", "phoneSpec", null],
  ["scale", "scaleSpec", "15–40"],
  ["board", "boardSpec", "2"],
  ["stand", "standSpec", "10–20"],
  ["lighting", "lightingSpec", "15–25"],
  ["tweezers", "tweezersSpec", "5"],
] as const;

const FAQ = [
  ["faq1Q", "faq1A"],
  ["faq2Q", "faq2A"],
  ["faq3Q", "faq3A"],
  ["faq4Q", "faq4A"],
  ["faq5Q", "faq5A"],
  ["faq6Q", "faq6A"],
  ["faq7Q", "faq7A"],
  ["faq8Q", "faq8A"],
] as const;

const MANUAL = ["manual1", "manual2", "manual3", "manual4"] as const;
const WITH_AI = ["withAi1", "withAi2", "withAi3", "withAi4"] as const;
const FACTS = [
  "fact1",
  "fact2",
  "fact3",
  "fact4",
  "fact5",
  "fact6",
  "fact7",
] as const;

/** Story captions and the share of the scroll each one is shown for. */
const STORY = [
  ["story1Title", "story1Text", 0.17, 0.33],
  ["story2Title", "story2Text", 0.35, 0.45],
  ["story3Title", "story3Text", 0.47, 0.61],
  ["story4Title", "story4Text", 0.63, 0.8],
  ["story5Title", "story5Text", 0.83, 1.01],
] as const;

const SAMPLE_COUNTS = countByKind(buildSample());
const SAMPLE_TOTAL = Object.values(SAMPLE_COUNTS).reduce((a, b) => a + b, 0);

type Mode = "3d" | "still" | "flat";

/** 3D with scroll animation; a still frame for reduced motion; no canvas without WebGL. */
function detectMode(): Mode {
  const canvas = document.createElement("canvas");
  const webgl = !!(canvas.getContext("webgl2") ?? canvas.getContext("webgl"));
  if (!webgl) return "flat";
  return matchMedia("(prefers-reduced-motion: reduce)").matches
    ? "still"
    : "3d";
}

const prefersMotion = () =>
  !matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Splits a heading into words that rise into view; screen readers get the plain text. */
function Words({ text }: { text: string }) {
  return (
    <>
      <span className="sr-only">{text}</span>
      <span aria-hidden className="words">
        {text.split(" ").map((w, i) => (
          <Fragment key={i}>
            {i > 0 && " "}
            <span className="word">
              <span className="word-inner">{w}</span>
            </span>
          </Fragment>
        ))}
      </span>
    </>
  );
}

/** The example result; in the 3D story it also carries the last step's caption. */
function ResultCard({ step }: { step?: boolean }) {
  const t = useT(m);
  const { groupLabel } = useGrainLabels();
  const purity = (SAMPLE_COUNTS.sound / SAMPLE_TOTAL) * 100;
  const max = Math.max(...CUP_GROUPS.map((g) => SAMPLE_COUNTS[g]));
  return (
    <div className="result-card" data-story-result>
      {step && (
        <div className="result-step">
          <span className="story-index">05</span>
          <h2>{t("story5Title")}</h2>
          <p>{t("story5Text")}</p>
        </div>
      )}
      <div className="result-head">
        <span className="eyebrow">{t("exampleResult")}</span>
        <span className="result-badge">✓ {t("verifiable")}</span>
      </div>
      <div className="result-purity">
        <span className="result-number">{purity.toFixed(1)}</span>
        <span className="result-unit">%</span>
      </div>
      <div className="muted small">
        {t("purityByCount")} · {t.n("kernels", SAMPLE_TOTAL)}
      </div>
      <ul className="result-bars">
        {CUP_GROUPS.map((g) => (
          <li key={g}>
            <span className="small">{groupLabel(g)}</span>
            <span className="result-track">
              <span
                className="result-bar"
                style={{ width: `${(SAMPLE_COUNTS[g] / max) * 100}%` }}
              />
            </span>
            <span className="small num">
              {t.n("kernels", SAMPLE_COUNTS[g])}
            </span>
          </li>
        ))}
      </ul>
      <p className="muted small">{t("exampleNote")}</p>
    </div>
  );
}

/** The hero and the scroll story: a sticky WebGL stage with captions. */
function Story() {
  const t = useT(m);
  const { lang } = useLang();
  const [mode] = useState(detectMode);
  const sectionRef = useRef<HTMLElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<GrainScene | null>(null);
  const progressRef = useRef(0);
  const [failed, setFailed] = useState(false);

  // Three.js loads after the page shows, in its own chunk.
  useEffect(() => {
    if (mode === "flat") return;
    const canvas = canvasRef.current!;
    let cancelled = false;
    let cleanup = () => {};
    import("./scene/GrainScene")
      .then(({ GrainScene }) => {
        if (cancelled) return;
        const small = innerWidth < 760;
        const scene = new GrainScene(canvas, {
          dpr: Math.min(devicePixelRatio, small ? 1.5 : 2),
          shadows: !small,
          dust: small ? 900 : 2200,
        });
        sceneRef.current = scene;
        const fit = () => scene.resize(canvas.clientWidth, canvas.clientHeight);
        fit();
        const ro = new ResizeObserver(fit);
        ro.observe(canvas);
        if (mode === "still") {
          scene.renderStill(0.02);
          cleanup = () => {
            ro.disconnect();
            scene.dispose();
          };
          return;
        }
        scene.setProgress(progressRef.current);
        // Only animate while the stage is on screen.
        const io = new IntersectionObserver(([entry]) =>
          entry?.isIntersecting ? scene.start() : scene.stop(),
        );
        io.observe(canvas);
        const onPointer = (e: globalThis.PointerEvent) =>
          scene.setPointer(
            (e.clientX / innerWidth) * 2 - 1,
            -((e.clientY / innerHeight) * 2 - 1),
          );
        addEventListener("pointermove", onPointer, { passive: true });
        cleanup = () => {
          io.disconnect();
          ro.disconnect();
          removeEventListener("pointermove", onPointer);
          scene.dispose();
        };
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
      cleanup();
      sceneRef.current = null;
    };
  }, [mode]);

  // Scroll drives the scene and the captions together.
  useLayoutEffect(() => {
    if (mode !== "3d") return;
    const section = sectionRef.current!;
    const ctx = gsap.context(() => {
      const tl = gsap.timeline({
        defaults: { ease: "power2.out" },
        scrollTrigger: {
          trigger: section,
          start: "top top",
          end: "bottom bottom",
          scrub: 0.6,
          onUpdate: (self) => {
            progressRef.current = self.progress;
            sceneRef.current?.setProgress(self.progress);
            const active = STORY.findIndex(
              ([, , a, b]) => self.progress >= a - 0.02 && self.progress < b,
            );
            section
              .querySelectorAll<HTMLElement>(".story-rail li")
              .forEach((li, i) => li.classList.toggle("active", i === active));
          },
        },
      });
      tl.to(".story-hero", { autoAlpha: 0, y: -60, duration: 0.06 }, 0.08);
      tl.to(".scroll-hint", { autoAlpha: 0, duration: 0.03 }, 0.02);
      section.querySelectorAll<HTMLElement>(".story-step").forEach((el, i) => {
        const [, , a, b] = STORY[i]!;
        tl.fromTo(
          el,
          { autoAlpha: 0, y: 50 },
          { autoAlpha: 1, y: 0, duration: 0.03 },
          a,
        );
        if (b < 1)
          tl.to(el, { autoAlpha: 0, y: -50, duration: 0.03 }, b - 0.03);
      });
      tl.fromTo(
        "[data-story-result]",
        { autoAlpha: 0, y: 40, scale: 0.94 },
        { autoAlpha: 1, y: 0, scale: 1, duration: 0.05 },
        STORY[4][2],
      );
      tl.fromTo(
        ".result-bar",
        { scaleX: 0 },
        { scaleX: 1, duration: 0.05, stagger: 0.01 },
        0.88,
      );
      tl.set({}, {}, 1);
      // Hero entrance, once.
      gsap.from(".story-hero .word-inner", {
        yPercent: 110,
        duration: 1.1,
        ease: "power4.out",
        stagger: 0.05,
        delay: 0.15,
      });
      gsap.from(".story-hero .hero-fade", {
        autoAlpha: 0,
        y: 24,
        duration: 1,
        stagger: 0.12,
        delay: 0.6,
      });
    }, section);
    return () => ctx.revert();
  }, [mode, lang]);

  const flat = mode !== "3d" || failed;
  return (
    <section
      ref={sectionRef}
      className={`story ${flat ? "story--flat" : ""}`}
      aria-label={t("storyLabel")}
    >
      <div className="story-stage">
        {mode !== "flat" && !failed && (
          <canvas ref={canvasRef} className="story-canvas" aria-hidden />
        )}
        <div className="story-vignette" aria-hidden />
        <div className="story-hero">
          <span className="eyebrow hero-fade">{t("eyebrow")}</span>
          <h1>
            <Words text={t("heroTitle")} />
          </h1>
          <p className="hero-lead hero-fade">{t("heroLead")}</p>
          <div className="row wrap center hero-fade">
            <Link to="/demo" className="button primary">
              {t("tryDemo")}
            </Link>
            <Link to="/contact" className="button ghost">
              {t("talkToUs")}
            </Link>
          </div>
        </div>
        {!flat && (
          <>
            <div className="scroll-hint" aria-hidden>
              <span className="scroll-mouse" />
              {t("scrollHint")}
            </div>
            <ol className="story-rail" aria-hidden>
              {STORY.map(([title]) => (
                <li key={title} />
              ))}
            </ol>
          </>
        )}
        {!flat && (
          <div className="story-steps">
            {STORY.slice(0, 4).map(([title, text], i) => (
              <div key={title} className="story-step">
                <span className="story-index">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <h2>{t(title)}</h2>
                <p>{t(text)}</p>
              </div>
            ))}
          </div>
        )}
        {!flat && <ResultCard step />}
      </div>
      {flat && (
        <div className="site-section">
          <h2>{t("stepsTitle")}</h2>
          <ol className="steps-grid">
            {STORY.map(([title, text], i) => (
              <li key={title} className="card">
                <span className="step-number">{i + 1}</span>
                <strong>{t(title)}</strong>
                <p className="muted small">{t(text)}</p>
              </li>
            ))}
          </ol>
          <ResultCard />
        </div>
      )}
    </section>
  );
}

function Marquee() {
  const t = useT(m);
  const items = FACTS.map((k) => t(k));
  return (
    <section className="marquee" aria-label={t("factsLabel")}>
      <ul className="marquee-track">
        {[...items, ...items].map((text, i) => (
          <li key={i} aria-hidden={i >= items.length}>
            <span className="marquee-dot" aria-hidden />
            {text}
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Cards lean towards the pointer, with a light that follows it. */
function tilt(e: PointerEvent<HTMLElement>) {
  if (e.pointerType !== "mouse") return;
  const el = e.currentTarget;
  const r = el.getBoundingClientRect();
  const x = (e.clientX - r.left) / r.width;
  const y = (e.clientY - r.top) / r.height;
  el.style.setProperty("--rx", `${(0.5 - y) * 8}deg`);
  el.style.setProperty("--ry", `${(x - 0.5) * 10}deg`);
  el.style.setProperty("--mx", `${x * 100}%`);
  el.style.setProperty("--my", `${y * 100}%`);
}

function untilt(e: PointerEvent<HTMLElement>) {
  const el = e.currentTarget;
  el.style.setProperty("--rx", "0deg");
  el.style.setProperty("--ry", "0deg");
}

function CropsSection() {
  const t = useT(m);
  const { cropLabel } = useGrainLabels();
  return (
    <section className="site-section">
      <h2 data-heading>
        <Words text={t("cropsTitle")} />
      </h2>
      <p className="muted" data-reveal>
        {t("cropsText")}
      </p>
      <div className="crop-grid">
        {Object.entries(CROP_PRESETS).map(([key, p]) => (
          <div
            key={key}
            className="card tilt"
            data-reveal
            onPointerMove={tilt}
            onPointerLeave={untilt}
          >
            <span className={`crop-glyph crop-${key}`} aria-hidden />
            <strong>{cropLabel(p.label)}</strong>
            <span className="muted small">
              {t.n("classCount", p.classes.length)}
            </span>
          </div>
        ))}
        <div className="card crop-add" data-reveal>
          <strong>{t("yourCrop")}</strong>
          <span className="muted small">{t("yourCropText")}</span>
        </div>
      </div>
      <Link to="/demo" className="button" data-reveal>
        {t("exploreDemo")}
      </Link>
    </section>
  );
}

/** Case studies the site owner published in the knowledge hub; nothing shows until there are some. */
function CaseStudies() {
  const t = useT(m);
  const list = useQuery({
    queryKey: ["articles", "case_study"],
    queryFn: () => api.get<ArticleItem[]>("/public/articles?kind=case_study"),
  });
  if (!list.data?.length) return null;
  return (
    <section className="site-section">
      <h2>{t("resultsTitle")}</h2>
      <div className="feature-grid">
        {list.data.slice(0, 3).map((a) => (
          <Link
            key={a.slug}
            to={`/hub/${a.slug}`}
            className="card article-card"
          >
            <strong>{a.title}</strong>
            {a.summary && <p className="muted small">{a.summary}</p>}
          </Link>
        ))}
      </div>
    </section>
  );
}

/**
 * Content below the story: headings rise word by word, blocks fade up as they
 * enter. Visibility comes from IntersectionObserver rather than measured
 * scroll positions, so late layout changes (fonts, language) can't leave
 * anything hidden.
 */
function useReveals(root: React.RefObject<HTMLElement | null>, lang: string) {
  useLayoutEffect(() => {
    if (!prefersMotion()) return;
    const el = root.current!;
    const ctx = gsap.context(() => {
      gsap.set("[data-reveal]", { autoAlpha: 0, y: 40 });
      gsap.set("[data-heading] .word-inner", { yPercent: 110 });
      gsap.set(".compare-old", { xPercent: -12, autoAlpha: 0 });
      gsap.set(".compare-new", { xPercent: 12, autoAlpha: 0 });
    }, el);
    const show = (target: Element) =>
      ctx.add(() => {
        if (target.matches("[data-heading]"))
          gsap.to(target.querySelectorAll(".word-inner"), {
            yPercent: 0,
            duration: 0.9,
            ease: "power4.out",
            stagger: 0.04,
          });
        else if (target.matches(".compare"))
          gsap.to(target.children, {
            xPercent: 0,
            autoAlpha: 1,
            duration: 1,
            ease: "power3.out",
          });
        else
          gsap.to(target, {
            autoAlpha: 1,
            y: 0,
            duration: 0.8,
            ease: "power3.out",
            // Siblings entering together come in one after another.
            delay:
              (Array.from(target.parentElement?.children ?? []).indexOf(
                target,
              ) %
                6) *
              0.07,
          });
      });
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          io.unobserve(entry.target);
          show(entry.target);
        }
      },
      { rootMargin: "0px 0px -10% 0px" },
    );
    el.querySelectorAll("[data-reveal], [data-heading], .compare").forEach(
      (target) => io.observe(target),
    );
    return () => {
      io.disconnect();
      ctx.revert();
    };
  }, [root, lang]);
}

export function HomePage() {
  const t = useT(m);
  const { lang } = useLang();
  const { cropLabel } = useGrainLabels();
  const rest = useRef<HTMLDivElement>(null);
  useReveals(rest, lang);
  const crops = Object.values(CROP_PRESETS)
    .map((p) => (lang === "en" ? p.label.toLowerCase() : cropLabel(p.label)))
    .join(", ");
  return (
    <div className="landing">
      <Story />
      <Marquee />
      <div ref={rest}>
        <section className="site-section">
          <h2 data-heading>
            <Words text={t("compareTitle")} />
          </h2>
          <div className="compare">
            <div className="card compare-old">
              <span className="eyebrow muted">{t("manualTitle")}</span>
              <ul>
                {MANUAL.map((k) => (
                  <li key={k}>{t(k)}</li>
                ))}
              </ul>
            </div>
            <div className="card compare-new">
              <span className="eyebrow">{t("withAiTitle")}</span>
              <ul>
                {WITH_AI.map((k) => (
                  <li key={k}>{t(k)}</li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        <CategorySection />

        <section className="site-section">
          <h2 data-heading>
            <Words text={t("featuresTitle")} />
          </h2>
          <div className="feature-grid">
            {FEATURES.map(([title, text], i) => (
              <div
                key={title}
                className="card tilt feature"
                data-reveal
                onPointerMove={tilt}
                onPointerLeave={untilt}
              >
                <span className="feature-index">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <strong>{t(title)}</strong>
                <p className="muted small">{t(text)}</p>
              </div>
            ))}
          </div>
        </section>

        <CropsSection />

        <CaseStudies />

        <section className="site-section">
          <h2 data-heading>
            <Words text={t("equipmentTitle")} />
          </h2>
          <div className="table-scroll" data-reveal>
            <table className="table">
              <thead>
                <tr>
                  <th>{t("item")}</th>
                  <th>{t("specification")}</th>
                  <th className="num">{t("cost")}</th>
                </tr>
              </thead>
              <tbody>
                {EQUIPMENT.map(([item, spec, cost]) => (
                  <tr key={item}>
                    <td>{t(item)}</td>
                    <td>{t(spec)}</td>
                    <td className="num">{cost ?? t("existing")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="site-section narrow">
          <h2 data-heading>
            <Words text={t("faqTitle")} />
          </h2>
          <div className="faq">
            {FAQ.map(([q, a]) => (
              <details key={q} className="card" data-reveal>
                <summary>{t(q)}</summary>
                <p>{t(a, { crops })}</p>
              </details>
            ))}
          </div>
        </section>

        <section className="site-band landing-band">
          <div className="band-grains" aria-hidden>
            {Array.from({ length: 18 }, (_, i) => (
              <span key={i} style={{ "--i": i } as React.CSSProperties} />
            ))}
          </div>
          <h2>{t("bandTitle")}</h2>
          <p>{t("bandText")}</p>
          <Link to="/contact" className="button">
            {t("bookMeeting")}
          </Link>
        </section>
      </div>
    </div>
  );
}
