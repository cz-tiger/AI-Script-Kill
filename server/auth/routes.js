import { Router } from 'express';
import { signToken, authMiddleware } from './middleware.js';
import { pool } from '../db.js';
const router = Router();

router.post('/login', async (req, res) => {
  const { phone } = req.body || {};
  if (!phone) return res.status(400).json({ error: '请输入手机号' });
  try {
    let r = await pool.query('select * from users where phone = $1', [phone]);
    if (!r.rows[0]) r = await pool.query('insert into users (id, phone) values (gen_random_uuid(), $1) returning *', [phone]);
    res.json({ token: signToken(r.rows[0].id), user: r.rows[0] });
  } catch { res.status(500).json({ error: '登录失败' }); }
});

router.get('/me', authMiddleware, async (req, res) => {
  const r = await pool.query('select id, phone, nickname from users where id = $1', [req.user.userId]);
  res.json({ user: r.rows[0] });
});

export default router;
