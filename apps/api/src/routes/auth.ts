import { Router } from "express";
import { env } from "../config/env";
import { createOAuthClient, GOOGLE_SCOPES } from "../lib/google";
import { prisma } from "../lib/prisma";
import {
  clearOAuthTempCookies,
  createPkceChallenge,
  createPkceVerifier,
  createSession,
  createState,
  setOAuthTempCookies,
  setSessionCookie
} from "../lib/session";
import { encryptJson } from "../lib/crypto";

const router = Router();

router.get("/google", async (_req, res) => {
  if (env.MOCK_AUTH) {
    const mockUser = await prisma.user.upsert({
      where: { googleSub: "mock-google-sub" },
      create: {
        googleSub: "mock-google-sub",
        email: "mock@example.com",
        name: "Mock User"
      },
      update: {}
    });
    const session = await createSession(mockUser.id);
    setSessionCookie(res, session.id, env.NODE_ENV === "production");
    return res.redirect(`${env.APP_BASE_URL}/dashboard`);
  }

  const state = createState();
  const verifier = createPkceVerifier();
  const challenge = createPkceChallenge(verifier);
  const oauth2 = createOAuthClient();
  const isProd = env.NODE_ENV === "production";

  setOAuthTempCookies(
    res,
    {
      state,
      pkceVerifier: verifier
    },
    isProd
  );

  const url = oauth2.generateAuthUrl({
    access_type: "offline",
    include_granted_scopes: true,
    prompt: "consent",
    scope: GOOGLE_SCOPES,
    state,
    code_challenge: challenge,
    code_challenge_method: "S256"
  });

  res.redirect(url);
});

router.get("/google/callback", async (req, res) => {
  const state = req.query.state;
  const code = req.query.code;

  if (typeof state !== "string" || typeof code !== "string") {
    return res.status(400).send("Missing OAuth params.");
  }

  const storedState = req.cookies.oauth_state;
  const codeVerifier = req.cookies.oauth_pkce_verifier;

  if (!storedState || storedState !== state || !codeVerifier) {
    return res.status(400).send("Invalid OAuth state.");
  }

  const oauth2 = createOAuthClient();

  try {
    const tokenResponse = await oauth2.getToken({
      code,
      codeVerifier,
      redirect_uri: env.GOOGLE_REDIRECT_URI
    });

    oauth2.setCredentials(tokenResponse.tokens);

    const idToken = tokenResponse.tokens.id_token;
    if (!idToken) {
      return res.status(400).send("Missing ID token.");
    }

    const ticket = await oauth2.verifyIdToken({
      idToken,
      audience: env.GOOGLE_CLIENT_ID
    });
    const payload = ticket.getPayload();

    if (!payload.sub || !payload.email) {
      return res.status(400).send("Unable to identify user.");
    }

    const user = await prisma.user.upsert({
      where: { googleSub: payload.sub },
      create: {
        googleSub: payload.sub,
        email: payload.email,
        name: payload.name ?? null,
        picture: payload.picture ?? null
      },
      update: {
        email: payload.email,
        name: payload.name ?? null,
        picture: payload.picture ?? null
      }
    });

    await prisma.oauthToken.upsert({
      where: { userId: user.id },
      create: {
        userId: user.id,
        encryptedPayload: encryptJson(tokenResponse.tokens),
        scope: tokenResponse.tokens.scope ?? "",
        expiryDate: tokenResponse.tokens.expiry_date
          ? new Date(tokenResponse.tokens.expiry_date)
          : null
      },
      update: {
        encryptedPayload: encryptJson(tokenResponse.tokens),
        scope: tokenResponse.tokens.scope ?? "",
        expiryDate: tokenResponse.tokens.expiry_date
          ? new Date(tokenResponse.tokens.expiry_date)
          : null
      }
    });

    const session = await createSession(user.id);
    setSessionCookie(res, session.id, env.NODE_ENV === "production");
    clearOAuthTempCookies(res);

    return res.redirect(`${env.APP_BASE_URL}/dashboard`);
  } catch {
    return res.status(500).send("OAuth error.");
  }
});

export default router;
