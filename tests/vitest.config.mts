import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  // This file lives in tests/; paths below are from the repo root.
  root: fileURLToPath(new URL("..", import.meta.url)),
  resolve: {
    alias: { "@": fileURLToPath(new URL("../src", import.meta.url)) },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "tests/**/*.test.ts", "supabase/**/*.test.ts"],
  },
});
