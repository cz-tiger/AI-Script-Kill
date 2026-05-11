import { Router } from 'express';
import { authMiddleware } from '../auth/middleware.js';
import { pool } from '../db.js';

const router = Router();

const TIERS = {
  free: { name: '免费版', price: 0, monthlyScripts: 1, features: { players: 3, wordLimit: 2000, characters: 3, hostManual: false } },
  qa: { name: '创作版', price: 1900, monthlyScripts: 10, features: { players: 6, wordLimit: 5000, characters: 6, hostManual: true } },
  premium: { name: '大师版', price: 4900, monthlyScripts: -1, features: { players: 10, wordLimit: 10000, characters: 10, hostManual: true, advanced: true } }
};

router.get('/plans', (_req, res) => {
  res.json({
    tiers: TIERS,
    compare: [
      { tier: 'free', name: '免费版', price: '¥0', scripts: '1本/月', players: '最多3人', hostManual: '❌', characters: '❌' },
      { tier: 'qa', name: '创作版', price: '¥19/月', scripts: '10本/月', players: '最多6人', hostManual: '✅', characters: '✅ 详细角色' },
      { tier: 'premium', name: '大师版', price: '¥49/月', scripts: '✅ 无限', players: '最多10人', hostManual: '✅ 完整手册', characters: '✅ 关系图谱' }
    ]
  });
});

router.post('/upgrade', authMiddleware, async (req, res) => {
  const { tier } = req.body || {};
  if (!['qa', 'premium'].includes(tier)) return res.status(400).json({ error: '无效的档位' });

  try {
    const expireAt = new Date(Date.now() + 30 * 24 * 3600 * 1000);
    await pool.query(
      `insert into subscriptions (id, user_id, plan_tier, expire_at)
       values (gen_random_uuid(), $1, $2, $3)
       on conflict (user_id) do update set plan_tier = $2, expire_at = $3`,
      [req.user.userId, tier, expireAt.toISOString()]
    );
    res.json({ success: true, tier, expireAt: expireAt.toISOString() });
  } catch { res.status(500).json({ error: '升级失败' }); }
});

router.get('/status', authMiddleware, async (req, res) => {
  try {
    const r = await pool.query('select plan_tier, expire_at from subscriptions where user_id = $1', [req.user.userId]);
    if (!r.rows[0]) return res.json({ tier: 'free', features: TIERS.free.features, expired: false });
    const s = r.rows[0];
    const expired = s.expire_at && new Date(s.expire_at) < new Date();
    res.json({ tier: expired ? 'free' : s.plan_tier, expireAt: s.expire_at, expired });
  } catch { res.json({ tier: 'free', expired: false }); }
});

export default router;
