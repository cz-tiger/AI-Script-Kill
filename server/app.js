import 'dotenv/config';
import cors from 'cors';
import express from 'express';
import { checkDb, initDb } from './db.js';
import authRouter from './auth/routes.js';
import scriptKillRouter from './script-kill/routes.js';
import subscriptionRouter from './subscription/routes.js';

const app = express();
const port = Number(process.env.PORT || 8789);

app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use((_req, res, next) => { res.setTimeout(30000, () => res.status(503).json({ error: 'timeout' })); next(); });

app.get('/api/health', async (_req, res) => {
  res.json({ ok: true, ai: !!process.env.OPENAI_API_KEY, mode: process.env.OPENAI_API_KEY ? 'ai' : 'demo' });
});

app.use('/api/auth', authRouter);
app.use('/api', scriptKillRouter);
app.use('/api/subscription', subscriptionRouter);

export { app, port };
