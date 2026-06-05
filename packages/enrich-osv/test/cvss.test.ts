import { describe, it, expect } from "vitest";
import {
  parseCvssVector,
  cvssFromSeverities,
  severityFromCvss,
} from "../src/cvss";

describe("parseCvssVector", () => {
  it("v3.1 Scope Unchanged 최대 영향 벡터를 계산한다", () => {
    // AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H → 9.8.
    expect(
      parseCvssVector("CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H"),
    ).toBe(9.8);
  });

  it("v3.1 Scope Changed 벡터를 1.08 배율로 계산한다", () => {
    // CVE-2021-44228(Log4Shell) 벡터 — Scope Changed라 10.0.
    expect(
      parseCvssVector("CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:C/C:H/I:H/A:H"),
    ).toBe(10);
  });

  it("v3.1 중간 점수 벡터를 정확히 산출한다", () => {
    // 잘 알려진 예시: AV:N/AC:H/PR:N/UI:R/S:U/C:L/I:L/A:N → 4.2(MEDIUM).
    expect(
      parseCvssVector("CVSS:3.1/AV:N/AC:H/PR:N/UI:R/S:U/C:L/I:L/A:N"),
    ).toBe(4.2);
  });

  it("영향이 0이면 Base Score는 0", () => {
    expect(
      parseCvssVector("CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:N/I:N/A:N"),
    ).toBe(0);
  });

  it("v3.0 Roundup(올림) 규칙을 적용한다", () => {
    const score = parseCvssVector("CVSS:3.0/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H");
    expect(score).toBe(9.8);
  });

  it("미지원 버전(v2/v4)·빈 문자열은 null", () => {
    expect(parseCvssVector("AV:N/AC:L/Au:N/C:P/I:P/A:P")).toBeNull(); // v2
    expect(parseCvssVector("CVSS:4.0/AV:N/AC:L/AT:N/PR:N/UI:N")).toBeNull();
    expect(parseCvssVector("")).toBeNull();
  });

  it("메트릭이 누락/오타면 null", () => {
    expect(parseCvssVector("CVSS:3.1/AV:N/AC:L")).toBeNull();
    expect(parseCvssVector("CVSS:3.1/AV:X/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H")).toBeNull();
  });
});

describe("cvssFromSeverities", () => {
  it("CVSS_V3 항목을 우선 선택한다", () => {
    const score = cvssFromSeverities([
      { type: "CVSS_V3", score: "CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H" },
    ]);
    expect(score).toBe(9.8);
  });

  it("파싱 불가하거나 비어 있으면 null", () => {
    expect(cvssFromSeverities(undefined)).toBeNull();
    expect(cvssFromSeverities([])).toBeNull();
    expect(cvssFromSeverities([{ type: "CVSS_V2", score: "AV:N/AC:L/Au:N/C:P/I:P/A:P" }])).toBeNull();
  });
});

describe("severityFromCvss", () => {
  it("CVSS v3.x 정성 등급 구간으로 매핑한다", () => {
    expect(severityFromCvss(0)).toBe("INFO");
    expect(severityFromCvss(3.9)).toBe("LOW");
    expect(severityFromCvss(4.0)).toBe("MEDIUM");
    expect(severityFromCvss(6.9)).toBe("MEDIUM");
    expect(severityFromCvss(7.0)).toBe("HIGH");
    expect(severityFromCvss(8.9)).toBe("HIGH");
    expect(severityFromCvss(9.0)).toBe("CRITICAL");
    expect(severityFromCvss(10)).toBe("CRITICAL");
  });
});
