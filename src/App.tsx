import { useEffect, useMemo, useState } from "preact/hooks";
import { DestinationPicker } from "./components/DestinationPicker";
import { ResultView } from "./components/ResultView";
import { DEFAULT_CARD_WEIGHT_G, estimate } from "./engine/postage";

const QUICK_PICKS = [
  "日本",
  "美国",
  "德国",
  "英国",
  "澳大利亚",
  "新西兰",
  "香港",
  "澳门",
  "台湾",
];

interface HistoryItem {
  destination: string;
  cardCount: number;
  trackingRequired: boolean;
  ts: number;
}

const HISTORY_KEY = "ham-postage:history";

function loadHistory(): HistoryItem[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as HistoryItem[];
  } catch {
    return [];
  }
}

export function App() {
  const [destination, setDestination] = useState("");
  const [cardCount, setCardCount] = useState(100);
  const [trackingRequired, setTrackingRequired] = useState(false);
  const [cardWeightG, setCardWeightG] = useState(DEFAULT_CARD_WEIGHT_G);
  const [showWeightTweak, setShowWeightTweak] = useState(false);
  const [history, setHistory] = useState<HistoryItem[]>(() => loadHistory());

  const weightG = cardCount * cardWeightG;

  const result = useMemo(() => {
    if (!destination || cardCount <= 0) return null;
    return estimate({
      destination,
      cardCount,
      trackingRequired,
      cardWeightG,
    });
  }, [destination, cardCount, trackingRequired, cardWeightG]);

  // 写入历史：destination 变更且有结果时（防抖：换目的地后保存）
  useEffect(() => {
    if (!result || !result.recommended) return;
    const item: HistoryItem = {
      destination,
      cardCount,
      trackingRequired,
      ts: Date.now(),
    };
    setHistory((prev) => {
      const filtered = prev.filter(
        (h) =>
          !(
            h.destination === item.destination &&
            h.cardCount === item.cardCount &&
            h.trackingRequired === item.trackingRequired
          ),
      );
      const next = [item, ...filtered].slice(0, 5);
      try {
        localStorage.setItem(HISTORY_KEY, JSON.stringify(next));
      } catch {
        // ignore
      }
      return next;
    });
  }, [destination, cardCount, trackingRequired, result?.recommended?.method]);

  return (
    <main class="container">
      <header class="title">
        <h1>HAM 寄卡资费比价器</h1>
        <p class="sub">中国邮政国际/港澳台 · 客观比价</p>
      </header>

      <section class="card">
        <label class="lbl" for="dest-input">
          目的地 <span class="hint-inline">国家名 / 呼号</span>
        </label>
        <DestinationPicker value={destination} onChange={setDestination} />
        <div class="quick-picks">
          {QUICK_PICKS.map((d) => (
            <button
              type="button"
              class={`pick ${destination === d ? "pick-active" : ""}`}
              onClick={() => setDestination(d)}
            >
              {d}
            </button>
          ))}
        </div>
      </section>

      <section class="card">
        <label class="lbl" for="count-input">
          卡片数量
        </label>
        <div class="count-row">
          <button
            type="button"
            class="step"
            onClick={() => setCardCount((c) => Math.max(1, c - 10))}
            aria-label="减 10"
          >
            −10
          </button>
          <input
            id="count-input"
            type="number"
            inputMode="numeric"
            min={1}
            value={cardCount}
            onInput={(e) =>
              setCardCount(Math.max(1, Number((e.target as HTMLInputElement).value) || 1))
            }
          />
          <button
            type="button"
            class="step"
            onClick={() => setCardCount((c) => c + 10)}
            aria-label="加 10"
          >
            +10
          </button>
        </div>
        <small class="weight-hint">
          ≈ <strong>{weightG.toLocaleString()}g</strong>
          {" · "}
          <button
            type="button"
            class="link"
            onClick={() => setShowWeightTweak((v) => !v)}
          >
            每张 {cardWeightG}g {showWeightTweak ? "收起" : "调整"}
          </button>
        </small>
        {showWeightTweak && (
          <div class="weight-tweak">
            <input
              type="range"
              min={5}
              max={40}
              step={1}
              value={cardWeightG}
              onInput={(e) =>
                setCardWeightG(Number((e.target as HTMLInputElement).value))
              }
            />
            <span>{cardWeightG} g/张</span>
          </div>
        )}
      </section>

      <section class="card toggle-row">
        <div>
          <div class="lbl">需要追踪 / 单号</div>
          <small class="hint">无追踪的方式将自动加挂号费</small>
        </div>
        <label class="switch">
          <input
            type="checkbox"
            checked={trackingRequired}
            onChange={(e) =>
              setTrackingRequired((e.target as HTMLInputElement).checked)
            }
          />
          <span class="slider" />
        </label>
      </section>

      {result && <ResultView result={result} />}

      {!result && destination === "" && (
        <p class="empty">↑ 选个目的地（或填呼号自动识别）开始比价</p>
      )}

      {history.length > 0 && (
        <section class="card history">
          <h3>最近查询</h3>
          <ul>
            {history.map((h) => (
              <li>
                <button
                  type="button"
                  class="link"
                  onClick={() => {
                    setDestination(h.destination);
                    setCardCount(h.cardCount);
                    setTrackingRequired(h.trackingRequired);
                  }}
                >
                  {h.destination} · {h.cardCount} 张
                  {h.trackingRequired ? " · 追踪" : ""}
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <footer class="footer">
        <a
          href="https://dey.11185.cn/wx/#/tariffQuery"
          target="_blank"
          rel="noopener noreferrer"
        >
          向邮政官方核验当前资费 ↗
        </a>
        <p class="disclaimer">
          数据为本地内置，仅供参考；以邮局实际收寄为准。<br />
          单张卡按 {cardWeightG}g 估重，可在上方调整。
        </p>
      </footer>
    </main>
  );
}
