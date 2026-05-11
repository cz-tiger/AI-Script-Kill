import { pool } from '../db.js';

const TIER_SCRIPT_LIMITS = {
  free: 1,
  qa: 10,
  premium: -1
};

/**
 * 获取用户当前档位和剧本配额
 */
async function getScriptQuota(userId) {
  try {
    const result = await pool.query(
      'select plan_tier, expire_at from subscriptions where user_id = $1',
      [userId]
    );
    const sub = result.rows[0];
    if (!sub) return { tier: 'free', limit: TIER_SCRIPT_LIMITS.free };

    const expired = sub.expire_at && new Date(sub.expire_at) < new Date();
    const tier = expired ? 'free' : (sub.plan_tier || 'free');
    return { tier, limit: TIER_SCRIPT_LIMITS[tier] ?? TIER_SCRIPT_LIMITS.free };
  } catch {
    return { tier: 'free', limit: TIER_SCRIPT_LIMITS.free };
  }
}

/**
 * 获取用户本月已生成剧本数
 */
async function getMonthlyScriptCount(userId) {
  try {
    const result = await pool.query(
      `select count(*)::int as cnt from scripts
       where user_id = $1
         and date_trunc('month', created_at) = date_trunc('month', now())`,
      [userId]
    );
    return result.rows[0]?.cnt || 0;
  } catch {
    return 0;
  }
}

/**
 * 剧本生成配额中间件
 * 检查用户本月的剧本生成次数是否超出档位限制
 */
export async function scriptQuotaMiddleware(req, res, next) {
  const userId = req.user?.userId;
  if (!userId) return res.status(401).json({ error: '未登录' });

  try {
    const { tier, limit } = await getScriptQuota(userId);

    if (limit === -1) {
      req.scriptQuota = { tier, limit: -1, used: 0, remaining: -1 };
      return next();
    }

    const used = await getMonthlyScriptCount(userId);

    if (used >= limit) {
      return res.status(429).json({
        error: `本月剧本生成次数已用完（${used}/${limit}）`,
        type: 'script',
        limit,
        used,
        remaining: 0,
        upgradeTiers: tier === 'free' ? ['qa', 'premium'] : ['premium']
      });
    }

    req.scriptQuota = { tier, limit, used, remaining: limit - used };
    next();
  } catch (error) {
    console.error('[scriptQuota]', error);
    next();
  }
}
