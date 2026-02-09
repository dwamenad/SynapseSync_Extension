import { env } from "./config/env";
import { createApp } from "./app";

const app = createApp();

app.listen(env.PORT, () => {
  // No secrets in logs.
  console.log(`API running on http://localhost:${env.PORT}`);
});
