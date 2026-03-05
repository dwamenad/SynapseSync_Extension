import { Router } from "express";
import { env } from "../config/env";
import { getOrIssueCsrfToken } from "../lib/csrf";

const router = Router();

router.get("/csrf", (req, res) => {
  const token = getOrIssueCsrfToken(req, res, env.NODE_ENV === "production");
  res.status(200).json({ csrfToken: token });
});

export default router;
