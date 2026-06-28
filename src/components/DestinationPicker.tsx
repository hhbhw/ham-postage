// 输入框 = 国家名（中文 / 全拼 / 首字母） + 呼号自动解析。
// 键盘流：Enter / Tab 都采用第一候选；候选包含拼音命中。
import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import { resolve } from "../engine/dxcc";
import { allDestinations } from "../engine/rates";
import pinyinRaw from "../data/destination_pinyin.json";

const PINYIN = pinyinRaw as Record<string, { full: string; initials: string }>;
const DESTINATIONS = allDestinations();

interface Props {
  value: string;
  onChange: (v: string) => void;
}

// 呼号判定：仅由字母/数字/斜杠 + 至少一个数字 + 长度≥3
function looksLikeCallsign(input: string): boolean {
  const t = input.trim().toUpperCase();
  if (!t || t.length < 3) return false;
  if (!/^[A-Z0-9/]+$/.test(t)) return false;
  return /\d/.test(t);
}

// 纯字母短串（看起来像拼音/首字母）— 排除呼号特征
function looksLikePinyin(input: string): boolean {
  const t = input.trim();
  return /^[a-zA-Z]+$/.test(t);
}

interface Match {
  dest: string;
  rank: number; // 越小越靠前
}

function search(query: string): Match[] {
  const q = query.trim();
  if (!q) return [];
  // 中文/混合：直接 substring
  if (!looksLikePinyin(q)) {
    return DESTINATIONS.filter((d) => d.includes(q)).map((d) => ({ dest: d, rank: 0 }));
  }
  const lower = q.toLowerCase();
  const out: Match[] = [];
  for (const d of DESTINATIONS) {
    const p = PINYIN[d];
    if (!p) continue;
    // 1. 首字母精确等同 → 最高优先
    if (p.initials === lower) out.push({ dest: d, rank: 0 });
    // 2. 首字母前缀
    else if (p.initials.startsWith(lower)) out.push({ dest: d, rank: 1 });
    // 3. 全拼前缀
    else if (p.full.startsWith(lower)) out.push({ dest: d, rank: 2 });
    // 不做全拼内部子串匹配 —— 噪音过多（如 "rb" 会命中 "ae|rb|aniya"）
  }
  out.sort((a, b) => a.rank - b.rank || a.dest.localeCompare(b.dest, "zh"));
  return out;
}

export function DestinationPicker({ value, onChange }: Props) {
  const [text, setText] = useState(value);
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setText(value);
  }, [value]);

  const callsignResolution = useMemo(() => {
    if (!looksLikeCallsign(text)) return null;
    return resolve(text);
  }, [text]);

  const matches = useMemo(() => {
    if (callsignResolution) return [];
    return search(text).slice(0, 8).map((m) => m.dest);
  }, [text, callsignResolution]);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!wrapRef.current) return;
      if (!wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const pick = (dest: string) => {
    onChange(dest);
    setText(dest);
    setOpen(false);
  };

  const applyCallsign = () => {
    if (callsignResolution?.dest_zh) {
      pick(callsignResolution.dest_zh);
    }
  };

  // Enter / Tab：第一候选优先；呼号识别次之
  const acceptFirst = (e: KeyboardEvent) => {
    if (callsignResolution?.dest_zh) {
      e.preventDefault();
      applyCallsign();
      return true;
    }
    if (matches[0]) {
      e.preventDefault();
      pick(matches[0]);
      return true;
    }
    return false;
  };

  return (
    <div class="dest-picker" ref={wrapRef}>
      <input
        id="dest-input"
        type="text"
        autoComplete="off"
        autoCapitalize="off"
        autoCorrect="off"
        spellcheck={false}
        placeholder="日本 / rb / JA1ABC ..."
        value={text}
        onInput={(e) => {
          setText((e.target as HTMLInputElement).value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === "Tab") {
            acceptFirst(e);
          } else if (e.key === "Escape") {
            setOpen(false);
          }
        }}
      />
      {callsignResolution && (
        <div class="callsign-hint">
          {callsignResolution.dest_zh ? (
            <button type="button" class="link" onClick={applyCallsign}>
              <strong>{callsignResolution.call.toUpperCase()}</strong>
              {" → "}
              <em>{callsignResolution.dest_zh}</em>
              {" "}
              <span class="hint-inline">（{callsignResolution.entity_en}）回车采用</span>
            </button>
          ) : callsignResolution.entity_en ? (
            <span class="warn">
              呼号 <strong>{callsignResolution.call.toUpperCase()}</strong> 识别为{" "}
              <em>{callsignResolution.entity_en}</em>，但该实体不在中国邮政资费目的地表里——请改用国家名。
            </span>
          ) : (
            <span class="warn">未识别的呼号前缀。</span>
          )}
        </div>
      )}
      {open && matches.length > 0 && (
        <ul class="dropdown">
          {matches.map((d, i) => (
            <li>
              <button
                type="button"
                class={i === 0 ? "first" : ""}
                onClick={() => pick(d)}
              >
                {d}
                {i === 0 && <span class="hint-inline kbd">Enter/Tab</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
