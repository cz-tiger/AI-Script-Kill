/**
 * AI 剧本杀 Prompt 模板系统
 *
 * 按 role 定义系统提示和温度，动态拼接生成/审核/修订提示词。
 * 遵循 server/ai/prompts.js 的 { system, user, temperature } 约定。
 */

// ============ Role 定义 ============

export const ROLES = {
  /** 剧本生成师 */
  scriptGenerator: {
    temperature: 0.8,
    system: '你是一位资深剧本杀作者，拥有多年谋杀之谜创作经验。'
      + '你擅长设计逻辑严密、角色丰满、动机合理、时间线自洽的剧本。'
      + '你笔下每个角色都有独特的性格、秘密和任务。'
      + '你的线索设计环环相扣，分幕节奏张弛有度。只返回 JSON。',
    output: '{"title":"","background":"","characters":[{"name":"","age":0,"gender":"","occupation":"","personality":"","background":"","secret":"","mission":"","relations":[{"with":"","type":"","detail":""}]}],"timeline":[{"phase":"","time":"","location":"","events":""}],"clues":[{"id":"","name":"","type":"public|personal|hidden","category":"","content":"","obtain_method":"","reveal_timing":""}],"acts":[{"act_number":1,"title":"","scene_setting":"","narrative":"","dialogue_guide":""}],"host_manual":{"opening":"","pace_notes":"","truth":"","ending_branches":[]}}'
  },

  /** 剧本审核编辑 */
  scriptReviewer: {
    temperature: 0.3,
    system: '你是一位严格的剧本杀编辑，擅长发现剧情漏洞、逻辑矛盾和不平衡设计。'
      + '你会检查：不在场证明是否成立、动机是否合理、线索是否足够推导真相、'
      + '角色任务是否冲突、分幕节奏是否得当。只返回 JSON。',
    output: '{"score":0,"issues":[{"severity":"critical|major|minor","category":"logic|motivation|balance|pacing|clue","detail":"","suggestion":""}],"summary":""}'
  },

  /** 剧本修订师 */
  scriptRevise: {
    temperature: 0.6,
    system: '你是一位剧本杀修改专家，擅长根据反馈精准修改剧本内容。'
      + '你只修改被指出的问题部分，保留其他内容的完整性。只返回 JSON。',
    output: '{"revised_section":"","changes_summary":"","revised_content":{}}'
  }
};

// ============ 主题/难度映射 ============

export const THEMES = ['古风', '民国', '现代', '科幻', '日式', '欧式', '校园'];
export const DIFFICULTIES = { beginner: '新手', intermediate: '进阶', hardcore: '硬核' };
export const SPECIAL_MODES = ['反串', '无性别', 'CP线', '阵营本', '机制本'];

// ============ 提示词构建函数 ============

/**
 * 构建剧本生成提示
 */
export function buildScriptPrompt({
  playerCount = 6,
  theme = '现代',
  difficulty = 'intermediate',
  duration = 120,
  specialReqs = [],
  inspiration = ''
}) {
  const role = ROLES.scriptGenerator;
  const diffLabel = DIFFICULTIES[difficulty] || '进阶';
  const hours = Math.floor(duration / 60);
  const mins = duration % 60;

  const userPrompt = `请创作一个完整的谋杀之谜剧本，参数如下：

【基本信息】
- 玩家人数：${playerCount} 人（请设计恰好 ${playerCount} 个角色，其中 1 个是凶手或幕后黑手）
- 主题风格：${theme}
- 难度等级：${diffLabel}
- 游戏时长：约 ${hours > 0 ? hours + '小时' : ''}${mins > 0 ? mins + '分钟' : ''}
${specialReqs.length ? '- 特殊要求：' + specialReqs.join('、') : ''}
${inspiration ? '- 创作灵感：' + inspiration : ''}

【创作要求】
1. 角色设计：每个角色必须有——姓名(中文)、年龄、性别、职业、性格(2-3个关键词)、详细背景故事(200-400字)、不为人知的秘密、秘密任务、与其他至少2个角色的关系
2. 时间线：分"案发前""案发时""案发后"三个阶段，每个阶段列出具体时间和关键事件
3. 线索设计：至少 ${Math.max(playerCount * 2, 8)} 条线索，包含公共线索(所有玩家可见)、个人线索(特定角色获得)、隐藏线索(需要特定条件触发)，每条线索标注获取方式和揭示时机
4. 分幕剧本：至少3幕，每幕包含场景设定、剧情推进描述、角色对话引导
5. 主持人手册：包含开场白(直接可念)、节奏控制提示(何时推进/何时放任)、真相复盘(完整还原)、至少2个结局分支

【核心原则】
- 真凶必须在角色之中，有充足的作案动机和合理的不在场证明漏洞
- 所有线索拼在一起能指向真相，但不能过于明显
- 每个角色都有"想隐藏的事"和"想达成的事"
- 避免"完美犯罪"——必须留下可推理的破绽

返回格式：${role.output}`;

  return { system: role.system, user: userPrompt, temperature: role.temperature };
}

/**
 * 构建剧本审核提示
 */
export function buildReviewPrompt({ script, reviewFocus = [] }) {
  const role = ROLES.scriptReviewer;

  const userPrompt = `请审核以下剧本杀剧本，检查逻辑自洽性和可玩性：
${reviewFocus.length ? '\n重点检查：' + reviewFocus.join('、') : ''}

剧本内容：
${JSON.stringify(script, null, 2)}

请检查：
1. 时间线是否自洽（能否从时间线排除/锁定凶手）
2. 每个角色的动机是否合理
3. 线索链是否完整（能否从线索推导出真相）
4. 角色任务是否有足够的冲突和互动
5. 分幕节奏是否张弛有度
6. 主持人手册是否可操作

返回格式：${role.output}`;

  return { system: role.system, user: userPrompt, temperature: role.temperature };
}

/**
 * 构建剧本修订提示
 */
export function buildRevisePrompt({ script, feedback }) {
  const role = ROLES.scriptRevise;

  const userPrompt = `请根据以下反馈修改剧本的指定部分：

【修改意见】
${feedback}

【当前剧本】
${JSON.stringify(script, null, 2)}

请只修改反馈中提到的部分，保留其他内容不变。说明修改了哪些内容以及修改理由。

返回格式：${role.output}`;

  return { system: role.system, user: userPrompt, temperature: role.temperature };
}
