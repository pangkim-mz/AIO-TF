"use client";

import { Fragment, useState, type ReactNode } from "react";
import type { ImpactDetail } from "../lib/impact";
import { SeverityBadge } from "./components";

const ASSET_TYPE_LABEL: Record<string, string> = {
  software_component: "SW 패키지",
  vendor: "벤더",
  cloud_resource: "클라우드 리소스",
  service: "서비스",
  web_asset: "웹 자산",
};

const REL_LABEL: Record<string, string> = {
  depends_on: "의존",
  hosted_on: "호스팅",
  provided_by: "제공",
  contains: "포함",
};

/** 영향도 점수 → 위계 색 구간(요약 바 좌측 보더). */
function level(score: number): "high" | "med" | "low" {
  if (score >= 70) return "high";
  if (score >= 40) return "med";
  return "low";
}

function interpret(row: ImpactDetail): string {
  if (!row.inherited) {
    return `자체 발견에서 나온 직접 위험 ${row.impactScore}점입니다. 전파로 올라가지 않았습니다.`;
  }
  if (row.ownScore === 0) {
    return `자체 취약점은 없지만, 의존하는 ${row.rootCause ?? "하위 자산"}의 위험 ${row.impactScore}점을 그래프 전파로 상속했습니다.`;
  }
  return `자체 위험 ${row.ownScore}점이지만, 하위 ${row.rootCause ?? "자산"}의 더 큰 위험 ${row.impactScore}점을 상속했습니다(+${row.inheritedDelta}).`;
}

function ScoreCompare({ own, impact }: { own: number; impact: number }): ReactNode {
  return (
    <div className="cmp">
      <div className="cmp-row">
        <span className="cmp-label">자체</span>
        <span className="cmp-bar" aria-hidden>
          <span className="cmp-fill own" style={{ width: `${own}%` }} />
        </span>
        <span className="cmp-num">{own}</span>
      </div>
      <div className="cmp-row">
        <span className="cmp-label">전파 후</span>
        <span className="cmp-bar" aria-hidden>
          <span className="cmp-fill impact" style={{ width: `${impact}%` }} />
        </span>
        <span className="cmp-num">{impact}</span>
      </div>
      {impact > own && (
        <p className="cmp-delta">상속으로 +{impact - own}점 상승</p>
      )}
    </div>
  );
}

function DetailPanel({ row }: { row: ImpactDetail }): ReactNode {
  return (
    <div className="finding-detail">
      <div className={`fd-summary lvl-${level(row.impactScore)}`}>
        <span className="fd-summary-title">{row.assetName}</span>
        <span className="fd-chips">
          <span className="fd-chip">{ASSET_TYPE_LABEL[row.assetType] ?? row.assetType}</span>
          {row.inherited && row.rootCause && (
            <span className="fd-chip">← 근원: {row.rootCause}</span>
          )}
          <span className="fd-chip fd-chip-score">영향도 {row.impactScore}/100</span>
        </span>
      </div>

      <div className="fd-cards">
        <section className="fd-card fd-card-wide">
          <h4>해석</h4>
          <p>{interpret(row)}</p>
        </section>

        <section className="fd-card">
          <h4>자체 ↔ 전파 위험</h4>
          <ScoreCompare own={row.ownScore} impact={row.impactScore} />
        </section>

        <section className="fd-card">
          <h4>전파 경로 (이 자산의 의존)</h4>
          {row.dependencies.length > 0 ? (
            <ul className="dep-list">
              {row.dependencies.map((d) => (
                <li key={`${d.relType}-${d.name}`} className={d.name === row.rootCause ? "is-root" : ""}>
                  <span className="dep-rel">{REL_LABEL[d.relType] ?? d.relType}</span>
                  <span className="dep-name">
                    {d.name}
                    <span className="muted"> · {ASSET_TYPE_LABEL[d.type] ?? d.type}</span>
                  </span>
                  <span className="dep-score">{d.impactScore}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted">나가는 의존이 없습니다(말단 자산).</p>
          )}
        </section>

        <section className="fd-card">
          <h4>직접 걸린 발견</h4>
          {row.directFindings.length > 0 ? (
            <ul className="direct-find-list">
              {row.directFindings.map((f) => (
                <li key={f.sourceFindingId}>
                  <SeverityBadge severity={f.severity} />
                  <span className="df-title">{f.title}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted">이 자산에 직접 걸린 발견은 없습니다(위험은 전적으로 상속).</p>
          )}
        </section>
      </div>
    </div>
  );
}

export function ImpactTable({ rows }: { rows: ImpactDetail[] }): ReactNode {
  const [openIds, setOpenIds] = useState<ReadonlySet<string>>(new Set());

  const toggle = (id: string): void => {
    setOpenIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <table className="findings-table">
      <thead>
        <tr>
          <th scope="col" aria-label="펼치기" />
          <th scope="col">자산</th>
          <th scope="col" className="num">직접</th>
          <th scope="col" className="num">영향도</th>
          <th scope="col">상속</th>
          <th scope="col">근원</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => {
          const open = openIds.has(row.assetId);
          return (
            <Fragment key={row.assetId}>
              <tr
                className={`finding-row${open ? " open" : ""}`}
                onClick={() => toggle(row.assetId)}
              >
                <td className="caret-cell">
                  <button
                    type="button"
                    className="caret"
                    aria-expanded={open}
                    aria-label={open ? "접기" : "펼치기"}
                    onClick={(e) => {
                      e.stopPropagation();
                      toggle(row.assetId);
                    }}
                  >
                    {open ? "▼" : "▶"}
                  </button>
                </td>
                <td>{row.assetName}</td>
                <td className="num">{row.ownScore}</td>
                <td className="num">{row.impactScore}</td>
                <td>{row.inherited ? "예" : "—"}</td>
                <td>{row.rootCause ?? "—"}</td>
              </tr>
              {open && (
                <tr className="finding-detail-row">
                  <td colSpan={6}>
                    <DetailPanel row={row} />
                  </td>
                </tr>
              )}
            </Fragment>
          );
        })}
      </tbody>
    </table>
  );
}
