import { describe, it, expect, vi, beforeEach, beforeAll, afterAll } from 'vitest';

// 强制 OpenAI client 返回空 JSON，触发降级到 demo
vi.mock('openai', () => {
  return {
    default: function () {
      return {
        chat: {
          completions: {
            create: () => Promise.resolve({
              choices: [{ message: { content: '{}' } }]
            })
          }
        }
      };
    }
  };
});

// ============ Prompt Builder Tests ============
import { buildScriptPrompt, buildReviewPrompt, buildRevisePrompt, ROLES } from '../../server/script-kill/prompts.js';

describe('Script Kill Prompts', () => {
  describe('buildScriptPrompt', () => {
    it('returns { system, user, temperature } tuple', () => {
      const result = buildScriptPrompt({ playerCount: 6, theme: '现代', difficulty: 'intermediate', duration: 120 });
      expect(result).toHaveProperty('system');
      expect(result).toHaveProperty('user');
      expect(result).toHaveProperty('temperature');
      expect(typeof result.system).toBe('string');
      expect(typeof result.user).toBe('string');
      expect(typeof result.temperature).toBe('number');
    });

    it('includes player count in user prompt', () => {
      const result = buildScriptPrompt({ playerCount: 8 });
      expect(result.user).toContain('8');
      expect(result.user).toContain('8 个角色');
    });

    it('includes theme in user prompt', () => {
      const result = buildScriptPrompt({ theme: '古风' });
      expect(result.user).toContain('古风');
    });

    it('includes difficulty label in user prompt', () => {
      const result = buildScriptPrompt({ difficulty: 'hardcore' });
      expect(result.user).toContain('硬核');
    });

    it('includes duration in hours and minutes', () => {
      const result = buildScriptPrompt({ duration: 150 });
      expect(result.user).toContain('2小时');
      expect(result.user).toContain('30分钟');
    });

    it('includes special requirements when provided', () => {
      const result = buildScriptPrompt({ specialReqs: ['阵营本', '反串'] });
      expect(result.user).toContain('阵营本');
      expect(result.user).toContain('反串');
    });

    it('includes inspiration when provided', () => {
      const result = buildScriptPrompt({ inspiration: '赛博朋克重庆' });
      expect(result.user).toContain('赛博朋克重庆');
    });

    it('has high temperature for creativity', () => {
      const result = buildScriptPrompt({});
      expect(result.temperature).toBe(0.8);
    });
  });

  describe('buildReviewPrompt', () => {
    it('includes script content', () => {
      const script = { title: '测试剧本', characters: [{ name: 'A' }] };
      const result = buildReviewPrompt({ script });
      expect(result.user).toContain('测试剧本');
    });

    it('has low temperature for consistency', () => {
      const result = buildReviewPrompt({ script: {} });
      expect(result.temperature).toBe(0.3);
    });

    it('includes review focus when provided', () => {
      const result = buildReviewPrompt({ script: {}, reviewFocus: ['时间线', '动机'] });
      expect(result.user).toContain('时间线');
      expect(result.user).toContain('动机');
    });
  });

  describe('buildRevisePrompt', () => {
    it('includes feedback in user prompt', () => {
      const result = buildRevisePrompt({ script: {}, feedback: '增强凶手动机' });
      expect(result.user).toContain('增强凶手动机');
    });
  });

  describe('ROLES', () => {
    it('defines scriptGenerator role with output schema', () => {
      expect(ROLES.scriptGenerator).toHaveProperty('temperature');
      expect(ROLES.scriptGenerator).toHaveProperty('system');
      expect(ROLES.scriptGenerator).toHaveProperty('output');
      expect(ROLES.scriptGenerator.output).toContain('characters');
      expect(ROLES.scriptGenerator.output).toContain('timeline');
      expect(ROLES.scriptGenerator.output).toContain('clues');
      expect(ROLES.scriptGenerator.output).toContain('acts');
      expect(ROLES.scriptGenerator.output).toContain('host_manual');
    });

    it('defines scriptReviewer role', () => {
      expect(ROLES.scriptReviewer).toHaveProperty('temperature', 0.3);
      expect(ROLES.scriptReviewer.output).toContain('score');
      expect(ROLES.scriptReviewer.output).toContain('issues');
    });
  });
});

// ============ Script Validator Tests ============
import { validateScript, generateScript } from '../../server/script-kill/generator.js';

describe('validateScript', () => {
  it('returns null for non-object input', () => {
    expect(validateScript(null)).toBeNull();
    expect(validateScript(undefined)).toBeNull();
    expect(validateScript('string')).toBeNull();
  });

  it('returns valid script with defaults for empty object', () => {
    const result = validateScript({});
    expect(result).toHaveProperty('valid', true);
    expect(result).toHaveProperty('title', '未命名剧本');
    expect(result).toHaveProperty('theme', '现代');
    expect(result.characters).toEqual([]);
    expect(result.timeline).toEqual([]);
    expect(result.clues).toEqual([]);
    expect(result.acts).toEqual([]);
  });

  it('normalizes theme to valid values only', () => {
    const valid = validateScript({ theme: '古风' });
    expect(valid.theme).toBe('古风');

    const invalid = validateScript({ theme: '赛博朋克' });
    expect(invalid.theme).toBe('现代'); // fallback
  });

  it('caps characters at 10', () => {
    const chars = Array.from({ length: 15 }, (_, i) => ({ name: `角色${i}` }));
    const result = validateScript({ characters: chars });
    expect(result.characters.length).toBe(10);
  });

  it('normalizes each character with defaults', () => {
    const result = validateScript({
      characters: [{ name: '张三' }]
    });
    const c = result.characters[0];
    expect(c.name).toBe('张三');
    expect(c.age).toBe(25);
    expect(c.gender).toBe('未知');
    expect(c.occupation).toBe('');
    expect(c.personality).toBe('');
    expect(c.background).toBe('');
    expect(c.secret).toBe('');
    expect(c.mission).toBe('');
    expect(c.relations).toEqual([]);
  });

  it('normalizes clue types to valid values', () => {
    const result = validateScript({
      clues: [
        { type: 'public' },
        { type: 'INVALID' },
        { type: 'hidden' }
      ]
    });
    expect(result.clues[0].type).toBe('public');
    expect(result.clues[1].type).toBe('public'); // fallback
    expect(result.clues[2].type).toBe('hidden');
  });

  it('normalizes timeline phases', () => {
    const result = validateScript({
      timeline: [
        { phase: '案发前' },
        { phase: 'UNKNOWN' }
      ]
    });
    expect(result.timeline[0].phase).toBe('案发前');
    expect(result.timeline[1].phase).toBe('案发前'); // fallback
  });

  it('normalizes host_manual with defaults', () => {
    const result = validateScript({});
    expect(result.host_manual).toHaveProperty('opening');
    expect(result.host_manual).toHaveProperty('pace_notes');
    expect(result.host_manual).toHaveProperty('truth');
    expect(result.host_manual.ending_branches).toEqual([]);
  });

  it('caps strings to max lengths', () => {
    const longStr = 'x'.repeat(5000);
    const result = validateScript({ title: longStr, background: longStr });
    expect(result.title.length).toBeLessThanOrEqual(200);
    expect(result.background.length).toBeLessThanOrEqual(2000);
  });
});

// ============ Demo Script Tests ============
describe('generateScript demo fallback', () => {
  it('returns a valid demo script', async () => {
    const result = await generateScript({ playerCount: 4, theme: '现代' });

    expect(result).toHaveProperty('source', 'demo');
    expect(result).toHaveProperty('title');
    expect(result).toHaveProperty('characters');
    expect(result).toHaveProperty('timeline');
    expect(result).toHaveProperty('clues');
    expect(result).toHaveProperty('acts');
    expect(result).toHaveProperty('host_manual');
    expect(result.characters.length).toBe(4);
  }, 10000);

  it('respects playerCount in demo', async () => {
    const result = await generateScript({ playerCount: 3, theme: '民国' });
    expect(result.characters.length).toBe(3);
  }, 10000);

  it('includes all 5 required script elements', async () => {
    const result = await generateScript({ playerCount: 4 });

    // Elements
    expect(result.characters.every(c => c.name && c.background && c.secret && c.mission)).toBe(true);
    expect(result.timeline.length).toBeGreaterThan(0);
    expect(result.clues.length).toBeGreaterThan(0);
    expect(result.acts.length).toBeGreaterThan(0);
    expect(result.host_manual.opening).toBeTruthy();
    expect(result.host_manual.truth).toBeTruthy();
  }, 10000);
});

// ============ Script Quota Middleware Tests ============
vi.mock('../../server/db.js', () => ({
  pool: { query: vi.fn() }
}));

const { pool } = await import('../../server/db.js');
const { scriptQuotaMiddleware } = await import('../../server/script-kill/middleware.js');

describe('scriptQuotaMiddleware', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 when user is not logged in', async () => {
    const req = { user: null };
    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn()
    };
    await scriptQuotaMiddleware(req, res, vi.fn());
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it('passes for premium users (unlimited)', async () => {
    pool.query.mockResolvedValueOnce({
      rows: [{ plan_tier: 'premium', expire_at: '2027-01-01' }]
    });

    const req = { user: { userId: 'premium-user' } };
    const res = {};
    const next = vi.fn();

    await scriptQuotaMiddleware(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(req.scriptQuota).toEqual({ tier: 'premium', limit: -1, used: 0, remaining: -1 });
  });

  it('blocks free user when monthly limit exceeded', async () => {
    pool.query
      .mockResolvedValueOnce({ rows: [{ plan_tier: 'free', expire_at: null }] })
      .mockResolvedValueOnce({ rows: [{ cnt: 1 }] }); // used 1/1

    const req = { user: { userId: 'free-user' } };
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
    const next = vi.fn();

    await scriptQuotaMiddleware(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(429);
  });

  it('allows free user within monthly limit', async () => {
    pool.query
      .mockResolvedValueOnce({ rows: [{ plan_tier: 'free', expire_at: null }] })
      .mockResolvedValueOnce({ rows: [{ cnt: 0 }] }); // used 0/1

    const req = { user: { userId: 'free-user' } };
    const res = {};
    const next = vi.fn();

    await scriptQuotaMiddleware(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(req.scriptQuota.remaining).toBe(1);
  });

  it('allows qa user within 10/month limit', async () => {
    pool.query
      .mockResolvedValueOnce({ rows: [{ plan_tier: 'qa', expire_at: '2027-01-01' }] })
      .mockResolvedValueOnce({ rows: [{ cnt: 5 }] });

    const req = { user: { userId: 'qa-user' } };
    const res = {};
    const next = vi.fn();

    await scriptQuotaMiddleware(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(req.scriptQuota.remaining).toBe(5);
  });
});
