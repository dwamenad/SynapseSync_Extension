import { env } from "./config/env";
import { cleanupExpiredSessions } from "./lib/session";
import { createApp } from "./app";

const app = createApp();

void cleanupExpiredSessions();
setInterval(() => {
  void cleanupExpiredSessions();
}, 1000 * 60 * 60);

app.listen(env.PORT, () => {
  console.log(`API running on http://localhost:${env.PORT}`);
});
