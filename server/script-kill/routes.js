import { Router } from 'express';
import { authMiddleware } from '../auth/middleware.js';
import { scriptQuotaMiddleware } from './middleware.js';
import { generateScript } from './generator.js';
import { buildReviewPrompt, buildRevisePrompt } from './prompts.js';
import { safeAI, extractJSON } from '../ai/validator.js';
import { pool } from '../db.js';
import OpenAI from 'openai';

const router = Router();

const client = process.env.OPENAI_API_KEY
  ? new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
      baseURL: process.env.OPENAI_BASE_URL || undefined,
      timeout: 20000,
      maxRetries: 1
    })
  : null;

// ============ 辅助函数 ============

function toScript(row) {
  return {
    id: row.id,
    title: row.title,
    theme: row.theme,
    difficulty: row.difficulty,
    playerCount: row.player_count,
    duration: row.duration,
    characters: typeof row.characters === 'string' ? JSON.parse(row.characters) : row.characters,
    timeline: typeof row.timeline === 'string' ? JSON.parse(row.timeline) : row.timeline,
    clues: typeof row.clues === 'string' ? JSON.parse(row.clues) : row.clues,
    acts: typeof row.acts === 'string' ? JSON.parse(row.acts) : row.acts,
    hostManual: typeof row.host_manual === 'string' ? JSON.parse(row.host_manual) : row.host_manual,
    background: row.background,
    status: row.status,
    source: row.source,
    wordCount: row.word_count,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

/**
 * POST /api/script/generate — 生成剧本
 * Body: { playerCount, theme, difficulty, duration, specialReqs, inspiration }
 */
router.post('/script/generate', authMiddleware, scriptQuotaMiddleware, async (req, res) => {
  const { playerCount, theme, difficulty, duration, specialReqs, inspiration } = req.body || {};

  if (!playerCount || playerCount < 3 || playerCount > 10) {
    return res.status(400).json({ error: '玩家人数需在 3-10 之间' });
  }

  const validThemes = ['古风', '民国', '现代', '科幻', '日式', '欧式', '校园'];
  if (theme && !validThemes.includes(theme)) {
    return res.status(400).json({ error: `主题需为：${validThemes.join('、')}` });
  }

  try {
    const script = await generateScript({
      playerCount: Number(playerCount),
      theme: theme || '现代',
      difficulty: difficulty || 'intermediate',
      duration: Number(duration) || 120,
      specialReqs: Array.isArray(specialReqs) ? specialReqs : [],
      inspiration: String(inspiration || '')
    });

    // 计算字数
    const jsonStr = JSON.stringify(script);
    const wordCount = jsonStr.length;

    // 存入数据库
    const result = await pool.query(
      `insert into scripts (id, user_id, title, theme, difficulty, player_count, duration,
         characters, timeline, clues, acts, host_manual, background, status, source, word_count)
       values (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb, $9::jsonb, $10::jsonb, $11::jsonb, $12, 'draft', $13, $14)
       returning *`,
      [
        req.user.userId,
        script.title,
        script.theme,
        script.difficulty || 'intermediate',
        playerCount,
        Number(duration) || 120,
        JSON.stringify(script.characters || []),
        JSON.stringify(script.timeline || []),
        JSON.stringify(script.clues || []),
        JSON.stringify(script.acts || []),
        JSON.stringify(script.host_manual || {}),
        script.background || '',
        script.source || 'ai',
        wordCount
      ]
    );

    console.log(`[script-kill:generate] user=${req.user.userId} title="${script.title}" source=${script.source} quota=${req.scriptQuota?.remaining}`);

    res.json({
      script: toScript(result.rows[0]),
      quota: req.scriptQuota,
      source: script.source
    });
  } catch (error) {
    console.error('[script-kill:generate]', error);
    res.status(500).json({ error: '剧本生成失败' });
  }
});

/**
 * GET /api/scripts — 获取用户所有剧本
 */
router.get('/scripts', authMiddleware, async (req, res) => {
  try {
    const { status, limit = 20, offset = 0 } = req.query;
    let query = 'select * from scripts where user_id = $1';
    const params = [req.user.userId];

    if (status) {
      query += ' and status = $2';
      params.push(status);
    }

    query += ' order by created_at desc limit $' + (params.length + 1) + ' offset $' + (params.length + 2);
    params.push(Math.min(Number(limit), 50), Number(offset));

    const result = await pool.query(query, params);

    res.json({
      scripts: result.rows.map(toScript),
      total: result.rows.length,
      offset: Number(offset)
    });
  } catch (error) {
    console.error('[script-kill:list]', error);
    res.status(500).json({ error: '获取剧本列表失败' });
  }
});

/**
 * GET /api/script/:id — 获取单个剧本
 */
router.get('/script/:id', authMiddleware, async (req, res) => {
  try {
    const result = await pool.query(
      'select * from scripts where id = $1 and user_id = $2',
      [req.params.id, req.user.userId]
    );

    if (!result.rows[0]) {
      return res.status(404).json({ error: '剧本不存在' });
    }

    res.json({ script: toScript(result.rows[0]) });
  } catch (error) {
    console.error('[script-kill:detail]', error);
    res.status(500).json({ error: '获取剧本失败' });
  }
});

/**
 * PATCH /api/script/:id — 编辑剧本
 */
router.patch('/script/:id', authMiddleware, async (req, res) => {
  const { title, background, characters, timeline, clues, acts, hostManual } = req.body || {};

  try {
    // 先获取当前版本
    const current = await pool.query(
      'select * from scripts where id = $1 and user_id = $2',
      [req.params.id, req.user.userId]
    );
    if (!current.rows[0]) {
      return res.status(404).json({ error: '剧本不存在' });
    }

    const curr = current.rows[0];

    // 保存修改前的版本
    const versionResult = await pool.query(
      'select count(*)::int as cnt from script_versions where script_id = $1',
      [req.params.id]
    );
    const nextVersion = versionResult.rows[0].cnt + 1;

    await pool.query(
      `insert into script_versions (id, script_id, version_number, characters, timeline, clues, acts, host_manual, change_description)
       values (gen_random_uuid(), $1, $2, $3::jsonb, $4::jsonb, $5::jsonb, $6::jsonb, $7::jsonb, '手动编辑')`,
      [req.params.id, nextVersion, curr.characters, curr.timeline, curr.clues, curr.acts, curr.host_manual]
    );

    // 更新
    const updateFields = [];
    const params = [req.params.id, req.user.userId];
    let paramIdx = 3;

    if (title !== undefined) { updateFields.push(`title = $${paramIdx++}`); params.push(String(title).slice(0, 200)); }
    if (background !== undefined) { updateFields.push(`background = $${paramIdx++}`); params.push(String(background).slice(0, 2000)); }
    if (characters !== undefined) { updateFields.push(`characters = $${paramIdx++}::jsonb`); params.push(JSON.stringify(characters)); }
    if (timeline !== undefined) { updateFields.push(`timeline = $${paramIdx++}::jsonb`); params.push(JSON.stringify(timeline)); }
    if (clues !== undefined) { updateFields.push(`clues = $${paramIdx++}::jsonb`); params.push(JSON.stringify(clues)); }
    if (acts !== undefined) { updateFields.push(`acts = $${paramIdx++}::jsonb`); params.push(JSON.stringify(acts)); }
    if (hostManual !== undefined) { updateFields.push(`host_manual = $${paramIdx++}::jsonb`); params.push(JSON.stringify(hostManual)); }

    if (updateFields.length === 0) {
      return res.status(400).json({ error: '没有提供需要修改的字段' });
    }

    updateFields.push('updated_at = now()');

    const result = await pool.query(
      `update scripts set ${updateFields.join(', ')} where id = $1 and user_id = $2 returning *`,
      params
    );

    res.json({ script: toScript(result.rows[0]) });
  } catch (error) {
    console.error('[script-kill:edit]', error);
    res.status(500).json({ error: '编辑剧本失败' });
  }
});

/**
 * POST /api/script/:id/revise — AI 修订剧本
 */
router.post('/script/:id/revise', authMiddleware, async (req, res) => {
  const { feedback } = req.body || {};

  if (!feedback || !String(feedback).trim()) {
    return res.status(400).json({ error: '请提供修改意见' });
  }

  try {
    const current = await pool.query(
      'select * from scripts where id = $1 and user_id = $2',
      [req.params.id, req.user.userId]
    );
    if (!current.rows[0]) {
      return res.status(404).json({ error: '剧本不存在' });
    }

    const script = toScript(current.rows[0]);

    if (!client) {
      return res.status(503).json({ error: 'AI 服务暂不可用，请手动编辑' });
    }

    // 使用 buildRevisePrompt 构建修订请求
    const { system, user, temperature } = buildRevisePrompt({ script, feedback: String(feedback) });

    const completion = await client.chat.completions.create({
      model: process.env.OPENAI_MODEL || 'deepseek-chat',
      temperature,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user }
      ]
    });

    const text = completion.choices?.[0]?.message?.content || '';
    const parsed = extractJSON(text);

    if (!parsed || !parsed.revised_content) {
      return res.status(422).json({ error: 'AI 修订失败，请尝试更具体的修改意见' });
    }

    const revised = parsed.revised_content;

    // 合并修订内容
    const merged = { ...script };
    if (revised.characters) {
      const chars = JSON.stringify(revised.characters);
      await pool.query(
        'update scripts set characters = $1::jsonb, updated_at = now() where id = $2',
        [chars, req.params.id]
      );
    }
    if (revised.timeline) {
      const tl = JSON.stringify(revised.timeline);
      await pool.query(
        'update scripts set timeline = $1::jsonb, updated_at = now() where id = $2',
        [tl, req.params.id]
      );
    }
    if (revised.clues) {
      const cl = JSON.stringify(revised.clues);
      await pool.query(
        'update scripts set clues = $1::jsonb, updated_at = now() where id = $2',
        [cl, req.params.id]
      );
    }
    if (revised.acts) {
      const acts = JSON.stringify(revised.acts);
      await pool.query(
        'update scripts set acts = $1::jsonb, updated_at = now() where id = $2',
        [acts, req.params.id]
      );
    }
    if (revised.host_manual) {
      const hm = JSON.stringify(revised.host_manual);
      await pool.query(
        'update scripts set host_manual = $1::jsonb, updated_at = now() where id = $2',
        [hm, req.params.id]
      );
    }

    // 返回更新后的剧本
    const updated = await pool.query('select * from scripts where id = $1', [req.params.id]);

    res.json({
      script: toScript(updated.rows[0]),
      changes: parsed.changes_summary || '已根据反馈修订'
    });
  } catch (error) {
    console.error('[script-kill:revise]', error);
    res.status(500).json({ error: '修订失败' });
  }
});

/**
 * POST /api/script/:id/publish — 发布剧本
 */
router.post('/script/:id/publish', authMiddleware, async (req, res) => {
  try {
    const current = await pool.query(
      'select * from scripts where id = $1 and user_id = $2',
      [req.params.id, req.user.userId]
    );
    if (!current.rows[0]) {
      return res.status(404).json({ error: '剧本不存在' });
    }

    if (current.rows[0].status === 'published') {
      return res.status(400).json({ error: '剧本已发布' });
    }

    const result = await pool.query(
      `update scripts set status = 'published', updated_at = now()
       where id = $1 and user_id = $2 returning *`,
      [req.params.id, req.user.userId]
    );

    res.json({ script: toScript(result.rows[0]) });
  } catch (error) {
    console.error('[script-kill:publish]', error);
    res.status(500).json({ error: '发布失败' });
  }
});

/**
 * DELETE /api/script/:id — 删除剧本
 */
router.delete('/script/:id', authMiddleware, async (req, res) => {
  try {
    const result = await pool.query(
      'delete from scripts where id = $1 and user_id = $2 returning id',
      [req.params.id, req.user.userId]
    );

    if (!result.rows[0]) {
      return res.status(404).json({ error: '剧本不存在' });
    }

    res.json({ success: true });
  } catch (error) {
    console.error('[script-kill:delete]', error);
    res.status(500).json({ error: '删除失败' });
  }
});

export default router;
