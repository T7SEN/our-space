import { withSerwist } from "@serwist/turbopack";

export default withSerwist({
  reactStrictMode: true,
  swSrc: "src/sw.ts",
  // In Turbo mode, swDest is usually handled by the route handler,
  // but we can omit it to let Serwist use its defaults.
  disable: process.env.NODE_ENV === "development",
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
} as any);
