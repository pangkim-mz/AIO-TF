"use client";

import { Fragment, useState, type ReactNode } from "react";
import type { Severity } from "@omniguard/schema";
import type { AssetDetail, AssetSeverityCounts } from "../lib/assets";
import { ASSET_TYPE_LABEL } from "../lib/assets";
import { CriticalityBadge, SeverityBadge } from "./components";

const CATEGORY_LABEL: Record<string, string> = {
  vulnerability: "취약점",
  license: "라이선스",
  misconfiguration: "설정 오류",
  integrity: "무결성",
  availability: "가용성",
  compliance: "컴플라이언스",
};

const SEVERITY_ORDER: Severity[] = ["CRITICAL", "HIGH", "MEDIUM", "LOW", "INFO"];

/** 영향도 점수 → 위계 색 구간(요약 바 좌측 보더). */
function level(score: number): "high" | "med" | "low" {
  if (score >= 70) return "high";
  if (score >= 40) return "med";
  return "low";
}

function dateLabel(iso: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString("ko-KR");
}

function SeverityCounts({ counts }: { counts: AssetSeverityCounts }): ReactNode {
  const nonzero = SEVERITY_ORDER.filter((s) => counts[s] > 0);
  if (nonzero.length === 0) {
    return <p className="muted">걸린 발견이 없습니다.</p>;
  }
  return (
    <ul className="sev-counts">
      {nonzero.map((s) => (
        <li key={s}>
          <SeverityBadge severity={s} />
          <span className="sev-count-num">{counts[s]}</span>
        </li>
      ))}
    </ul>
  );
}

function riskInterpretation(row: AssetDetail): string {
  if (row.impactScore === 0) {
    return "이 자산에는 위험이 산정되지 않았습니다(걸린 발견 없음).";
  }
  if (row.inherited && row.ownScore === 0) {
    return `자체 취약점은 없지만, 의존하는 ${row.rootCause ?? "하위 자산"}의 위험 ${row.impactScore}점을 그래프 전파로 상속했습니다.`;
  }
  if (row.inherited) {
    return `자체 위험 ${row.ownScore}점에 더해, 하위 ${row.rootCause ?? "자산"}의 더 큰 위험 ${row.impactScore}점을 상속했습니다.`;
  }
  return `자체 발견에서 나온 직접 위험 ${row.impactScore}점입니다(전파로 올라가지 않음).`;
}

function DetailPanel({ row }: { row: AssetDetail }): ReactNode {
  return (
    <div className="finding-detail">
      <div className={`fd-summary lvl-${level(row.impactScore)}`}>
        <span className="fd-summary-title">{row.name}</span>
        <span className="fd-chips">
          <span className="fd-chip">{ASSET_TYPE_LABEL[row.type] ?? row.type}</span>
          <span className="fd-chip">중요도 {row.criticality}</span>
          {row.inherited && row.rootCause && (
            <span className="fd-chip">← 근원: {row.rootCause}</span>
          )}
          <span className="fd-chip fd-chip-score">영향도 {row.impactScore}/100</span>
        </span>
      </div>

      <div className="fd-cards">
        <section className="fd-card fd-card-wide">
          <h4>개요</h4>
          <dl className="kv">
            <dt>식별자</dt>
            <dd className="mono">{row.identifier}</dd>
            <dt>담당자</dt>
            <dd>{row.owner ?? "—"}</dd>
            <dt>의존 / 피의존</dt>
            <dd>
              {row.dependencyCount}개 의존 · {row.dependentCount}개가 이 자산에 의존
            </dd>
            <dt>최초 발견</dt>
            <dd>{dateLabel(row.firstSeen)}</dd>
            <dt>최근 확인</dt>
            <dd>{dateLabel(row.lastSeen)}</dd>
          </dl>
          {row.tags.length > 0 && (
            <p className="asset-tags">
              {row.tags.map((t) => (
                <span key={t.key} className="fd-chip">
                  {t.key}: {t.value}
                </span>
              ))}
            </p>
          )}
        </section>

        <section className="fd-card">
          <h4>{ASSET_TYPE_LABEL[row.type] ?? row.type} 속성</h4>
          <dl className="kv">
            {row.attributes.map((a) => (
              <Fragment key={a.label}>
                <dt>{a.label}</dt>
                <dd className={a.label.includes("URL") || a.label.includes("PURL") || a.label.includes("ID") ? "mono" : undefined}>
                  {a.value}
                </dd>
              </Fragment>
            ))}
          </dl>
        </section>

        <section className="fd-card">
          <h4>위험 요약</h4>
          <SeverityCounts counts={row.severityCounts} />
          <p className="fd-risk-note">{riskInterpretation(row)}</p>
        </section>

        <section className="fd-card">
          <h4>걸린 발견 ({row.severityCounts.total})</h4>
          {row.findings.length > 0 ? (
            <ul className="direct-find-list">
              {row.findings.map((f) => (
                <li key={f.sourceFindingId}>
                  <SeverityBadge severity={f.severity} />
                  <span className="df-title">
                    {f.title}
                    <span className="muted"> · {CATEGORY_LABEL[f.category] ?? f.category}</span>
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted">이 자산에 직접 걸린 발견이 없습니다.</p>
          )}
        </section>
      </div>
    </div>
  );
}

export function AssetsTable({ rows }: { rows: AssetDetail[] }): ReactNode {
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
          <th scope="col">이름</th>
          <th scope="col">유형</th>
          <th scope="col">식별자</th>
          <th scope="col">중요도</th>
          <th scope="col" className="num">
            발견
          </th>
          <th scope="col" className="num">
            영향도
          </th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => {
          const open = openIds.has(row.id);
          return (
            <Fragment key={row.id}>
              <tr
                className={`finding-row${open ? " open" : ""}`}
                onClick={() => toggle(row.id)}
              >
                <td className="caret-cell">
                  <button
                    type="button"
                    className="caret"
                    aria-expanded={open}
                    aria-label={open ? "접기" : "펼치기"}
                    onClick={(e) => {
                      e.stopPropagation();
                      toggle(row.id);
                    }}
                  >
                    {open ? "▼" : "▶"}
                  </button>
                </td>
                <td>{row.name}</td>
                <td>{ASSET_TYPE_LABEL[row.type] ?? row.type}</td>
                <td className="mono">{row.identifier}</td>
                <td>
                  <CriticalityBadge criticality={row.criticality} />
                </td>
                <td className="num">
                  {row.severityCounts.total > 0 ? row.severityCounts.total : "—"}
                </td>
                <td className="num">{row.impactScore}</td>
              </tr>
              {open && (
                <tr className="finding-detail-row">
                  <td colSpan={7}>
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
