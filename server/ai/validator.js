/**
 * AI 输出校验器
 *
 * 防止 AI 返回格式错误导致系统异常。
 * 支持 JSON 结构校验 + 自动重试 + 断点续验。
 */

const MAX_RETRIES = 2;

/**
 * 从文本中提取 JSON（兼容 Markdown 代码块）
 */
export function extractJSON(text) {
  if (!text) return null;
  try { return JSON.parse(text); } catch {}

  // 移除 markdown 代码块
  const clean = text.replace(/```(?:json)?\s*/g, '').replace(/```\s*/g, '');
  try { return JSON.parse(clean); } catch {}

  // 匹配第一个 JSON 对象
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try { return JSON.parse(match[0]); } catch {}

  return null;
}

/**
 * 校验分析结果 ({ error_type, knowledge_point, reason, explanation, suggestions, difficulty_level, confidence })
 */
export function validateAnalysis(obj) {
  if (!obj || typeof obj !== 'object') return null;

  const errors = ['concept_error', 'calculation_error', 'misreading', 'logic_error', 'careless'];
  const diffs = ['基础', '中等', '较难'];

  return {
    error_type: errors.includes(obj.error_type) ? obj.error_type : 'concept_error',
    knowledge_point: String(obj.knowledge_point || '待确认').slice(0, 80),
    reason: String(obj.reason || '需要进一步分析').slice(0, 300),
    explanation: String(obj.explanation || '暂无详细解析').slice(0, 800),
    suggestions: Array.isArray(obj.suggestions)
      ? obj.suggestions.slice(0, 3).map(s => String(s).slice(0, 200))
      : ['回顾相关概念', '多做同类练习', '整理错题笔记'],
    difficulty_level: diffs.includes(obj.difficulty_level) ? obj.difficulty_level : '中等',
    confidence: Math.min(1, Math.max(0, Number(obj.confidence) || 0.5)),
    valid: true
  };
}

/**
 * 校验训练题目结果
 */
export function validateQuestions(obj) {
  if (!obj || typeof obj !== 'object') return null;
  const questions = Array.isArray(obj.questions) ? obj.questions : [];

  return {
    questions: questions.slice(0, 10).map((q, i) => ({
      id: q.id || String(i + 1),
      type: ['choice', 'fill', 'answer'].includes(q.type) ? q.type : 'choice',
      difficulty: String(q.difficulty || '中等'),
      knowledge_point: String(q.knowledge_point || ''),
      content: q.content || { stem: q.stem || '' },
      answer: String(q.answer || ''),
      explanation: String(q.explanation || '')
    })),
    focus: String(obj.focus || '综合训练'),
    difficulty: String(obj.difficulty || '中等'),
    valid: true
  };
}

/**
 * 带重试的 AI 调用 + 校验管道
 *
 * @param {Function} callFn       — AI 调用函数，返回原始文本
 * @param {Function} validateFn   — 校验函数 (parsed) => { valid, ... }
 * @param {Function} buildRetryPrompt — 构建重试提示 (原始prompt, 上次错误)
 * @returns {Promise<object>}
 */
export async function callWithValidation(callFn, validateFn, buildRetryPrompt) {
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const text = await callFn(attempt);
    if (!text) continue;

    const parsed = extractJSON(text);
    if (!parsed) {
      if (attempt < MAX_RETRIES) {
        // 告知 AI 输出格式有问题
        const correction = buildRetryPrompt
          ? buildRetryPrompt(attempt)
          : '请只返回 JSON 对象，不要添加任何额外文字。';
        console.log(`[validator] retry ${attempt + 1}: JSON parse failed, asking AI: ${correction.slice(0, 60)}`);
        continue;
      }
      return null;
    }

    const validated = validateFn(parsed);
    if (validated && validated.valid) return validated;

    if (attempt < MAX_RETRIES) {
      console.log(`[validator] retry ${attempt + 1}: validation failed`);
      continue;
    }
  }
  return null;
}

/**
 * 从 AI 调用到有效输出的完整管道（出错时有默认值兜底）
 *
 * @param {Function} callFn        — 返回原始文本的 AI 调用
 * @param {Function} validateFn    — 校验函数
 * @param {object}   fallback      — 失败时的默认返回值
 * @returns {Promise<object>}
 */
export async function safeAI(callFn, validateFn, fallback) {
  try {
    const result = await callWithValidation(
      callFn,
      validateFn,
      (attempt) => {
        if (attempt === 0) return '你的输出格式不正确。请严格按 JSON 格式返回结果。';
        return '最后一次机会：只返回严格的 JSON 对象，不要任何其他内容。';
      }
    );
    return result || { ...fallback, source: 'fallback', validationFailed: true };
  } catch (err) {
    console.error('[safeAI]', err.message);
    return { ...fallback, source: 'fallback', error: err.message };
  }
}
