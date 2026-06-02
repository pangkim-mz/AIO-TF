import type { FastifyReply } from "fastify";

/**
 * 일관 응답 포맷.
 * 성공: { ok: true, data }
 * 실패: { ok: false, error: { code, message } }
 *  - code: 클라이언트/디버깅용 식별자
 *  - message: 사용자에게 보여줄 메시지
 */
export interface SuccessBody<T> {
  ok: true;
  data: T;
}
export interface ErrorBody {
  ok: false;
  error: { code: string; message: string };
}

/** 도메인/요청 오류. 에러 핸들러가 이 형태를 응답 포맷으로 변환한다. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export function sendOk<T>(reply: FastifyReply, data: T, status = 200): void {
  const body: SuccessBody<T> = { ok: true, data };
  reply.code(status).send(body);
}

export function sendError(
  reply: FastifyReply,
  status: number,
  code: string,
  message: string,
): void {
  const body: ErrorBody = { ok: false, error: { code, message } };
  reply.code(status).send(body);
}
