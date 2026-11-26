import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: { "@": path.resolve(__dirname, "src") },
  },
  test: {
    environment: "node",
    include: ["tests/unit/**/*.test.ts", "tests/integration/**/*.test.ts"],
    // Integration tests self-skip (describe.skipIf) unless enabled:
    //   RUN_DRIVEBASE_INTEGRATION=1 DRIVEBASE_API_KEY=db_live_... \
    //   DRIVEBASE_API_BASE_URL=https://drivebaseaz.vercel.app/api/v1 \
    //   npm run test:integration
    testTimeout: 120_000,
  },
});
