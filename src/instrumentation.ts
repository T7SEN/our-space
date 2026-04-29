// src/instrumentation.ts
import { registerOTel } from "@vercel/otel";

export function register() {
  // 'our-space' will be the service name appearing in your traces
  registerOTel({ serviceName: "our-space" });
}
