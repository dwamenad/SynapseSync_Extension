import { Router } from "express";

const router = Router();

router.get("/me", (req, res) => {
  if (!req.user) {
    return res.status(401).json({ authenticated: false });
  }

  return res.status(200).json({
    authenticated: true,
    user: {
      id: req.user.id,
      email: req.user.email,
      name: req.user.name,
      picture: req.user.picture
    }
  });
});

export default router;
