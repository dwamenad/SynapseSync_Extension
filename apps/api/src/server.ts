import { env } from "./config/env";
import { cleanupExpiredSessions } from "./lib/session";
import { createApp } from "./app";

const app = createApp();

function runCleanupSafe() {
  void cleanupExpiredSessions().catch(() => {
    // Startup may occur before migrations in local/test flows.
  });
}

runCleanupSafe();
setInterval(() => {
  runCleanupSafe();
}, 1000 * 60 * 60);

app.listen(env.PORT, () => {
  console.log(`API running on http://localhost:${env.PORT}`);
});
