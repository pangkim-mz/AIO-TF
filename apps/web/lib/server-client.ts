import { ApiClient } from "./api";

/**
 * 서버 컴포넌트용 API 클라이언트. 토큰은 서버 환경변수에서만 읽어
 * 클라이언트로 노출되지 않는다.
 */
export function serverClient(): ApiClient {
  return new ApiClient({
    baseUrl: process.env.API_BASE_URL ?? "http://localhost:3000",
    token: process.env.API_TOKEN ?? "dev-token",
  });
}
