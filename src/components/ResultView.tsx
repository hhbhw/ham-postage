import type { EstimateResult } from "../engine/types";

interface Props {
  result: EstimateResult;
}

const fmt = (n: number) => n.toFixed(2);

export function ResultView({ result }: Props) {
  const { recommended, options, notes, card_count, weight_g, tracking_required } = result;

  if (!recommended) {
    return (
      <section class="card empty-result">
        <p>没有可行的寄送方式。</p>
        {notes.map((n) => (
          <p class="note">{n}</p>
        ))}
      </section>
    );
  }

  const perCard = recommended.cost / card_count;

  return (
    <>
      <section class="card recommended">
        <div class="rec-label">推荐最省{tracking_required ? "（含追踪）" : ""}</div>
        <div class="rec-name">{recommended.label}</div>
        <div class="rec-price">
          ¥<span class="big">{fmt(recommended.cost)}</span>
        </div>
        <div class="rec-meta">
          单张 ¥{perCard.toFixed(3)} · 总重 {weight_g.toLocaleString()}g · {card_count} 张
        </div>
      </section>

      <section class="card alternatives">
        <h3>所有方式（按总价）</h3>
        <ul class="opt-list">
          {options.map((o) => {
            const isRec = o.method === recommended.method;
            return (
              <li class={`opt ${isRec ? "opt-rec" : ""} ${o.feasible ? "" : "opt-infeasible"}`}>
                <div class="opt-head">
                  <span class="opt-label">{o.label}</span>
                  <span class="opt-cost">
                    {o.feasible ? `¥${fmt(o.cost)}` : "—"}
                  </span>
                </div>
                <div class="opt-sub">
                  {o.feasible && (
                    <>
                      单张 ¥{(o.cost / card_count).toFixed(3)}
                      {o.pieces > 1 && ` · 拆 ${o.pieces} 件`}
                    </>
                  )}
                  {!tracking_required && !o.has_tracking && (
                    <span class="opt-track-note">
                      {" · "}加挂号后 ¥{fmt(o.cost_with_tracking)}
                    </span>
                  )}
                  {o.has_tracking && <span class="opt-track-note"> · 自带追踪</span>}
                </div>
                {o.notes.length > 0 && (
                  <ul class="opt-notes">
                    {o.notes.map((n) => (
                      <li>{n}</li>
                    ))}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
        {notes.length > 0 && (
          <div class="estimate-notes">
            {notes.map((n) => (
              <p class="note">⚠ {n}</p>
            ))}
          </div>
        )}
      </section>
    </>
  );
}
