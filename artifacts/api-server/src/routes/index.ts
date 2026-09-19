import { Router, type IRouter } from "express";
import healthRouter from "./health";
import webhooksRouter from "./webhooks";
import authRouter from "./auth";
import passkeysRouter from "./passkeys";
import biometricKeyRouter from "./biometricKey";
import usersRouter from "./users";
import securityRouter from "./security";
import paymentsRouter from "./payments";
import uploadsRouter from "./uploads";
import behaviorRouter from "./behavior";
import contentProfileRouter from "./contentProfile";

const router: IRouter = Router();

// webhooksRouter has no session/auth requirement (server-to-server, HMAC verified) — must be mounted before any router with a path-less `router.use(middleware)` (e.g. security.ts's blanket MFA gate), or that gate would intercept it first.
router.use(healthRouter);
router.use(webhooksRouter);
router.use(authRouter);
router.use(passkeysRouter);
router.use(biometricKeyRouter);
router.use(usersRouter);
router.use(securityRouter);
router.use(paymentsRouter);
router.use(uploadsRouter);
router.use(behaviorRouter);
router.use(contentProfileRouter);

export default router;
