import OpenAI from 'openai';
import { safeAI, extractJSON } from '../ai/validator.js';
import { buildScriptPrompt } from './prompts.js';

const client = process.env.OPENAI_API_KEY
  ? new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
      baseURL: process.env.OPENAI_BASE_URL || undefined,
      timeout: 30000,
      maxRetries: 2
    })
  : null;

// ============ 剧本校验 ============

const VALID_THEMES = ['古风', '民国', '现代', '科幻', '日式', '欧式', '校园'];

/**
 * 校验 AI 生成的剧本结构
 */
export function validateScript(obj) {
  if (!obj || typeof obj !== 'object') return null;

  const characters = Array.isArray(obj.characters) ? obj.characters : [];
  const clues = Array.isArray(obj.clues) ? obj.clues : [];
  const acts = Array.isArray(obj.acts) ? obj.acts : [];
  const timeline = Array.isArray(obj.timeline) ? obj.timeline : [];

  return {
    title: String(obj.title || '未命名剧本').slice(0, 200),
    theme: VALID_THEMES.includes(obj.theme) ? obj.theme : '现代',
    background: String(obj.background || '').slice(0, 2000),
    characters: characters.slice(0, 10).map((c, i) => ({
      name: String(c.name || `角色${i + 1}`).slice(0, 50),
      age: Number(c.age) || 25,
      gender: String(c.gender || '未知').slice(0, 10),
      occupation: String(c.occupation || '').slice(0, 100),
      personality: String(c.personality || '').slice(0, 200),
      background: String(c.background || '').slice(0, 800),
      secret: String(c.secret || '').slice(0, 500),
      mission: String(c.mission || '').slice(0, 500),
      relations: Array.isArray(c.relations) ? c.relations.slice(0, 10).map(r => ({
        with: String(r.with || ''),
        type: String(r.type || ''),
        detail: String(r.detail || '')
      })) : []
    })),
    timeline: timeline.slice(0, 30).map(t => ({
      phase: ['案发前', '案发时', '案发后'].includes(t.phase) ? t.phase : '案发前',
      time: String(t.time || ''),
      location: String(t.location || ''),
      events: String(t.events || '')
    })),
    clues: clues.slice(0, 30).map((c, i) => ({
      id: String(c.id || `C${i + 1}`).slice(0, 20),
      name: String(c.name || '').slice(0, 100),
      type: ['public', 'personal', 'hidden'].includes(c.type) ? c.type : 'public',
      category: String(c.category || '').slice(0, 50),
      content: String(c.content || '').slice(0, 500),
      obtain_method: String(c.obtain_method || '').slice(0, 200),
      reveal_timing: String(c.reveal_timing || '')
    })),
    acts: acts.slice(0, 10).map((a, i) => ({
      act_number: Number(a.act_number) || i + 1,
      title: String(a.title || `第${i + 1}幕`).slice(0, 200),
      scene_setting: String(a.scene_setting || '').slice(0, 500),
      narrative: String(a.narrative || '').slice(0, 3000),
      dialogue_guide: String(a.dialogue_guide || '').slice(0, 2000)
    })),
    host_manual: {
      opening: String(obj.host_manual?.opening || '').slice(0, 2000),
      pace_notes: String(obj.host_manual?.pace_notes || '').slice(0, 1000),
      truth: String(obj.host_manual?.truth || '').slice(0, 3000),
      ending_branches: Array.isArray(obj.host_manual?.ending_branches)
        ? obj.host_manual.ending_branches.slice(0, 5).map(e => String(e).slice(0, 500))
        : []
    },
    valid: true
  };
}

// ============ AI 调用（带超时） ============

async function callWithDeadline(params, deadlineMs = 25000) {
  if (!client) return null;

  const { system, user, temperature } = buildScriptPrompt(params);

  return safeAI(
    async () => {
      const aiPromise = client.chat.completions.create({
        model: process.env.OPENAI_MODEL || 'deepseek-chat',
        temperature,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user }
        ]
      });
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('AI 生成超时')), deadlineMs)
      );
      const completion = await Promise.race([aiPromise, timeoutPromise]);
      return completion.choices?.[0]?.message?.content || '';
    },
    validateScript,
    null
  );
}

// ============ 演示剧本（降级兜底） ============

function buildDemoScript(params) {
  const { playerCount = 4, theme = '现代' } = params;

  const demoCharacters = [
    {
      name: '林若溪', age: 28, gender: '女', occupation: '画廊老板',
      personality: '优雅、敏锐、隐忍',
      background: '毕业于巴黎美术学院，三年前回到这座城市开设画廊。与前男友分手后一直单身，将全部精力投入事业。',
      secret: '她与死者有过一段不为人知的恋情，死者曾威胁要毁掉她的画廊。',
      mission: '隐瞒与死者的关系，找出真凶以洗清自己的嫌疑。',
      relations: [
        { with: '陆正阳', type: '商业合作', detail: '死者曾投资她的画廊，但最近因分红问题产生矛盾' },
        { with: '苏念', type: '闺蜜', detail: '大学时代的密友，但最近因一个男人产生了隔阂' }
      ]
    },
    {
      name: '陆正阳', age: 35, gender: '男', occupation: '投资公司CEO',
      personality: '冷静、果断、城府深',
      background: '白手起家的投资人，掌控着城市最大的私募基金。行事果断，在商界人脉广泛。',
      secret: '他的公司在死者去世前一天签署了一份对他极为不利的合同，死者一死，合同自动作废。',
      mission: '证明自己的不在场证明，同时推动合同条款的生效。',
      relations: [
        { with: '林若溪', type: '商业合作', detail: '投资了林若溪的画廊，正在谈判追加投资' },
        { with: '沈默', type: '商业对手', detail: '与沈默的公司有直接的商业竞争关系' }
      ]
    },
    {
      name: '苏念', age: 27, gender: '女', occupation: '自由撰稿人',
      personality: '感性、聪明、有些神经质',
      background: '曾是报社记者，现在靠写剧本杀剧本维生。观察力极强，但对人对己都很苛刻。',
      secret: '她欠死者一大笔钱，还钱期限正是今天。死者曾威胁要曝光她的秘密。',
      mission: '找到死者留下的借据并销毁，同时洗清嫌疑。',
      relations: [
        { with: '林若溪', type: '闺蜜', detail: '从大学到现在最好的朋友' },
        { with: '赵云帆', type: '旧识', detail: '曾采访过赵云帆，对他有好感' }
      ]
    },
    {
      name: '沈默', age: 32, gender: '男', occupation: '律师',
      personality: '理性、正直、有原则',
      background: '知名律所合伙人，专攻商业纠纷。最近接了一个敏感案子，备受压力。',
      secret: '死者掌握他曾经帮助客户做伪证的证据，今晚就要交给警方。',
      mission: '找到并销毁那份证据，同时不能让任何人发现自己与死者的交易。',
      relations: [
        { with: '陆正阳', type: '商业对手', detail: '代表对方公司起诉陆正阳的公司' },
        { with: '赵云帆', type: '医患', detail: '是赵云帆的患者（失眠症）' }
      ]
    }
  ].slice(0, playerCount);

  const demoClues = [
    { id: 'C1', name: '死亡时间报告', type: 'public', category: '法医证据', content: '死者死亡时间约为今晚20:00-21:00之间，死因为后脑受到钝器击打。', obtain_method: '警方现场通报', reveal_timing: '第一幕开始' },
    { id: 'C2', name: '破碎的酒杯', type: 'public', category: '现场物证', content: '死者身旁有一只破碎的红酒杯，杯沿上有口红印。经检测，杯中的酒含有安眠药成分。', obtain_method: '现场勘查', reveal_timing: '第一幕开始' },
    { id: 'C3', name: '投资合同副本', type: 'personal', category: '文件证据', content: '一份陆正阳公司与死者签署的投资合同，其中包含一个对陆正阳极为不利的对赌条款。签署日期为案发前一天。', obtain_method: '陆正阳的公文包', reveal_timing: '第二幕搜索环节' },
    { id: 'C4', name: '借条', type: 'personal', category: '文件证据', content: '一张手写借条："今借到周明远人民币伍拾万元整，约定三个月内归还。借款人：苏念。"落款日期正好是三个月前。', obtain_method: '死者的书房抽屉', reveal_timing: '第二幕搜索环节' },
    { id: 'C5', name: '情书', type: 'hidden', category: '个人物品', content: '一封没有署名的情书，笔迹娟秀："我知道我们不能公开，但我愿意等..."信纸上有淡淡的香水味。', obtain_method: '死者的日记本夹层', reveal_timing: '需要触发特殊条件' },
    { id: 'C6', name: '监控录像片段', type: 'hidden', category: '电子证据', content: '大厅监控显示，20:30有一位戴手套的人影进入死者房间，但因角度问题看不清面容。', obtain_method: '破解密码后获取', reveal_timing: '第三幕关键转折' }
  ];

  const demoTimeline = [
    { phase: '案发前', time: '18:00', location: '别墅大厅', events: '宾客陆续抵达，死者周明远在门口迎接。一切看起来正常。' },
    { phase: '案发前', time: '19:00', location: '餐厅', events: '晚宴开始，周明远举杯致辞。席间气氛有些微妙，部分宾客之间似有暗流。' },
    { phase: '案发时', time: '20:00', location: '书房', events: '周明远独自回到书房处理文件。这是最后一次有人确认他活着。' },
    { phase: '案发时', time: '20:30', location: '书房门口', events: '监控拍到有人影进入书房，此人戴着手套，无法辨认身份。' },
    { phase: '案发后', time: '21:00', location: '书房', events: '女仆打扫时发现周明远倒在血泊中，惊叫引来了所有人。' },
    { phase: '案发后', time: '21:15', location: '大厅', events: '所有宾客被要求留在大厅，等待警方到来。众人各怀心思。' }
  ];

  return {
    title: `${theme}谋杀之谜 - ${playerCount}人本`,
    theme,
    background: `在一个普通的周末夜晚，富商周明远邀请了几位密友和合作伙伴来到他的私人别墅。然而，晚宴之后，他被人发现死在自己的书房中。每个人似乎都有不在场证明，但每个人也都有杀他的理由...`,
    characters: demoCharacters,
    timeline: demoTimeline,
    clues: demoClues,
    acts: [
      { act_number: 1, title: '夜宴', scene_setting: '死者别墅的客厅与餐厅', narrative: '宾客到达，晚宴进行。死者周明远表现出异常的情绪波动。晚餐后，各个角色展开自由交流，建立人物关系。', dialogue_guide: '引导玩家互相介绍，分享自己对死者的印象。鼓励提及"今晚死者看起来不太对劲"。' },
      { act_number: 2, title: '血案', scene_setting: '别墅各处（书房/客厅/花园）', narrative: '死者被发现死在书房。警方封锁现场后，众人被告知需要留在此地。在等待期间，大家开始私下调查，搜集线索。', dialogue_guide: '组织搜索环节，每个玩家获得1-2条个人线索。鼓励互相质询，制造矛盾。' },
      { act_number: 3, title: '真相', scene_setting: '大厅集结', narrative: '所有线索汇集。时间线拼接完成。不在场证明逐个被击破。众人围坐大厅，开始最后的推理...', dialogue_guide: '主持人逐条朗读线索，引导玩家进行最终推理。给每个玩家陈述自己的不在场证明和指控他人的机会。' }
    ],
    host_manual: {
      opening: '各位晚上好。今晚，你们中的每一个人都收到了一封来自富商周明远的邀请函，邀请你们来到他的私人别墅共进晚餐。你们有各自不同的原因来到这里——有人是为了生意，有人是为了友情，有人则怀揣着不为人知的秘密。然而，晚宴之后，周明远被发现死在了自己的书房中。你们所有人都被困在了这栋别墅里，直到真相大白。欢迎来到——谋杀之谜。',
      pace_notes: '第一幕控制在30分钟内，重点让玩家熟悉角色关系。第二幕是核心搜索环节，给足40分钟，确保每个线索都有人找到。第三幕是高潮，控制反转节奏，留15分钟给最终投票。如果玩家卡住，通过"男仆送来新证据"的方式推动。',
      truth: '真凶是苏念。她因欠死者巨款无力偿还，且死者威胁要公开她在上一份工作中的丑闻（她曾剽窃他人作品），于是她铤而走险。案发当晚，她在红酒中下入安眠药，等到死者昏迷后用书房里的青铜雕塑击中其后脑。她戴着手套作案，之后将手套藏在花园的玫瑰丛下。她的不在场证明漏洞在于：她声称20:20-20:50一直在阳台打电话，但阳台正对花园，如果她真的在那里，应该能目击"戴手套的人影"进入房间——她选择了不提及，恰恰暴露了自己。',
      ending_branches: [
        '结局A（全票指认真凶）：苏念被警方带走。她在离开前向林若溪道歉，承认了自己的罪行和苦衷。众人唏嘘不已。',
        '结局B（真凶逃脱）：真凶成功将嫌疑引向陆正阳。警方逮捕了陆正阳。苏念得以脱身，但内心的愧疚将永远折磨她。'
      ]
    },
    source: 'demo',
    timestamp: new Date().toISOString()
  };
}

// ============ 主生成函数（三层降级） ============

/**
 * 生成剧本杀剧本（AI → 演示兜底）
 * @param {object} params — { playerCount, theme, difficulty, duration, specialReqs, inspiration }
 * @returns {Promise<object>}
 */
export async function generateScript(params) {
  const {
    playerCount = 4,
    theme = '现代',
    difficulty = 'intermediate',
    duration = 120,
    specialReqs = [],
    inspiration = ''
  } = params;

  // 1. 尝试 AI 生成（带 25 秒超时）
  if (client) {
    try {
      const aiResult = await callWithDeadline(params, 25000);
      if (aiResult && aiResult.valid && aiResult.characters?.length >= params.playerCount) {
        return { ...aiResult, source: 'ai', timestamp: new Date().toISOString() };
      }
      console.log('[script-kill:generate] AI result insufficient, falling back to demo');
    } catch (err) {
      console.error('[script-kill:generate] AI generation failed:', err.message);
    }
  }

  // 2. 降级到演示剧本
  return buildDemoScript(params);
}
