import {
  createContext,
  Fragment,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export type Lang = "en" | "hi";

/** Each language's name, written in that language, for the switcher. */
export const LANGS: Record<Lang, string> = { en: "English", hi: "हिन्दी" };

export interface Message {
  en: string;
  hi: string;
}

export type Messages<K extends string = string> = Record<K, Message>;

/**
 * A module's strings in every language. The type requires a Hindi string for
 * every English one, so a missing translation fails the typecheck.
 * Placeholders are written {name}.
 */
export function defineMessages<K extends string>(m: Messages<K>): Messages<K> {
  return m;
}

const STORAGE_KEY = "ai-grain.lang";

/** The language in use, for code outside React such as date formatting. */
export function currentLang(): Lang {
  return current;
}

/** The locale for dates and numbers. Hindi keeps Latin digits, as is usual on forms and scales. */
export function locale(lang: Lang = current): string {
  return lang === "hi" ? "hi-IN-u-nu-latn" : "en-GB";
}

function initialLang(): Lang {
  // Server rendering: pages are rendered in English, then the browser
  // switches to the visitor's language.
  if (typeof window === "undefined") return "en";
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === "en" || saved === "hi") return saved;
  } catch {
    // Storage can be blocked; fall back to the browser's language.
  }
  return navigator.language.toLowerCase().startsWith("hi") ? "hi" : "en";
}

let current: Lang = initialLang();

const LangContext = createContext<{
  lang: Lang;
  setLang: (lang: Lang) => void;
}>({ lang: "en", setLang: () => undefined });

export function LangProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(current);
  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);
  const value = useMemo(
    () => ({
      lang,
      setLang: (next: Lang) => {
        try {
          localStorage.setItem(STORAGE_KEY, next);
        } catch {
          // Not remembered; still switches for this visit.
        }
        current = next;
        setLangState(next);
      },
    }),
    [lang],
  );
  return <LangContext value={value}>{children}</LangContext>;
}

export function useLang() {
  return useContext(LangContext);
}

type Vars = Record<string, string | number>;

function fill(text: string, vars?: Vars): string {
  if (!vars) return text;
  return text.replace(/\{(\w+)\}/g, (all, name: string) =>
    name in vars ? String(vars[name]) : all,
  );
}

/** Keys that come in `_one` / `_other` pairs, by their base name. */
type PluralBase<K extends string> = K extends `${infer B}_one` ? B : never;

export interface Translate<K extends string> {
  (key: K, vars?: Vars): string;
  /** `{count}` picks `key_one` for 1 and `key_other` otherwise. */
  n(key: PluralBase<K>, count: number, vars?: Vars): string;
  /** Like t(), but placeholders may be React nodes such as links. */
  rich(key: K, nodes: Record<string, ReactNode>): ReactNode;
}

/** The translate function for one module's messages, in the current language. */
export function useT<K extends string>(messages: Messages<K>): Translate<K> {
  const { lang } = useLang();
  return useMemo(() => {
    const text = (key: K) => messages[key][lang];
    return Object.assign((key: K, vars?: Vars) => fill(text(key), vars), {
      n: (key: PluralBase<K>, count: number, vars?: Vars) =>
        fill(text(`${key}_${count === 1 ? "one" : "other"}` as K), {
          count,
          ...vars,
        }),
      rich: (key: K, nodes: Record<string, ReactNode>) =>
        text(key)
          .split(/(\{\w+\})/)
          .map((part, i) => {
            const name = /^\{(\w+)\}$/.exec(part)?.[1];
            return (
              <Fragment key={i}>
                {name && name in nodes ? nodes[name] : part}
              </Fragment>
            );
          }),
    });
  }, [messages, lang]);
}

/** Switches the interface language; remembered on this device. */
export function LanguageSelect({ className }: { className?: string }) {
  const { lang, setLang } = useLang();
  return (
    <select
      className={`lang-select ${className ?? ""}`}
      aria-label="Language / भाषा"
      value={lang}
      onChange={(e) => setLang(e.target.value as Lang)}
    >
      {(Object.keys(LANGS) as Lang[]).map((l) => (
        <option key={l} value={l} lang={l}>
          {LANGS[l]}
        </option>
      ))}
    </select>
  );
}
