"use client";

import { Fragment, useState, type ReactNode } from "react";
import type { RiskFactor } from "@omniguard/schema";
import type { FindingDetail } from "../lib/findings";
import { SeverityBadge } from "./components";

/** 점수 기여 요인의 내부 이름 → 한국어 라벨. */
const FACTOR_LABEL: Record<string, string> = {
  severity: "심각도",
  assetCriticality: "자산 중요도",
};

/** 자산 타입 → 한국어 라벨. */
const ASSET_TYPE_LABEL: Record<string, string> = {
  software_component: "SW 패키지",
  vendor: "벤더",
  cloud_resource: "클라우드 리소스",
  service: "서비스",
  web_asset: "웹 자산",
};

function FactorBars({ factors }: { factors: RiskFactor[] }): ReactNode {
  if (factors.length === 0) return <span className="muted">분해 정보 없음</span>;
  const max = Math.max(...factors.map((f) => f.contribution), 1);
  return (
    <ul className="factor-list">
      {factors.map((f) => (
        <li key={f.name}>
          <span className="factor-name">{FACTOR_LABEL[f.name] ?? f.name}</span>
          <span className="factor-bar" aria-hidden>
            <span
              className="factor-fill"
              style={{ width: `${Math.round((f.contribution / max) * 100)}%` }}
            />
          </span>
          <span className="factor-num">
            {Math.round(f.contribution)}
            <span className="muted"> (값 {f.value} × 가중치 {f.weight})</span>
          </span>
        </li>
      ))}
    </ul>
  );
}

function DetailPanel({ row }: { row: FindingDetail }): ReactNode {
  return (
    <div className="finding-detail-grid">
      <section>
        <h4>설명</h4>
        <p>{row.description?.trim() ? row.description : "추가 설명이 제공되지 않았습니다."}</p>
      </section>

      <section>
        <h4>위험 점수 분해</h4>
        {row.score !== null ? (
          <>
            <p className="score-headline">
              종합 <strong>{row.score}</strong> / 100
            </p>
            <FactorBars factors={row.factors} />
          </>
        ) : (
          <p className="muted">점수가 아직 산정되지 않았습니다.</p>
        )}
      </section>

      <section>
        <h4>대상 자산</h4>
        <dl className="kv">
          <dt>이름</dt>
          <dd>{row.assetName}</dd>
          <dt>종류</dt>
          <dd>{ASSET_TYPE_LABEL[row.assetType] ?? row.assetType}</dd>
          <dt>CVSS</dt>
          <dd>{row.cvss !== null ? row.cvss.toFixed(1) : "—"}</dd>
          <dt>상태</dt>
          <dd>{row.status}</dd>
          <dt>탐지 시각</dt>
          <dd>{new Date(row.detectedAt).toLocaleString("ko-KR")}</dd>
        </dl>
      </section>

      <section>
        <h4>미치는 영향 (그래프 전파)</h4>
        {row.impacted.length > 0 ? (
          <>
            <p className="muted">
              이 자산을 근원으로 위험을 상속한 하위 자산 {row.impacted.length}개:
            </p>
            <ul className="impacted-list">
              {row.impacted.map((i) => (
                <li key={i.asset}>
                  <span>{i.asset}</span>
                  <span className="impact-score">영향도 {i.impactScore}</span>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <p className="muted">이 발견이 전파한 하위 자산은 없습니다(직접 위험).</p>
        )}
      </section>
    </div>
  );
}

export function FindingsTable({ rows }: { rows: FindingDetail[] }): ReactNode {
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
          <th scope="col">심각도</th>
          <th scope="col">분류</th>
          <th scope="col">자산</th>
          <th scope="col">발견 ID</th>
          <th scope="col">제목</th>
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
                <td>
                  <SeverityBadge severity={row.severity} />
                </td>
                <td>{row.category}</td>
                <td>{row.assetName}</td>
                <td className="mono">{row.sourceFindingId}</td>
                <td>{row.title}</td>
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
