const auth = require('../../services/auth.js');

const THEMES = ['古风', '民国', '现代', '科幻', '日式', '欧式', '校园'];
const DIFFICULTIES = [
  { value: 'beginner', label: '新手' },
  { value: 'intermediate', label: '进阶' },
  { value: 'hardcore', label: '硬核' }
];
const DURATIONS = [
  { value: 60, label: '1小时' },
  { value: 120, label: '2小时' },
  { value: 180, label: '3小时' },
  { value: 240, label: '4小时+' }
];

Page({
  data: {
    themes: THEMES,
    difficulties: DIFFICULTIES,
    durations: DURATIONS,
    playerCount: 6,
    selectedTheme: '现代',
    selectedDifficulty: 'intermediate',
    selectedDuration: 120,
    inspiration: '',
    specialReqs: [],
    generating: false,
    script: null,
    error: ''
  },

  onLoad() {
    if (!auth.getToken()) {
      wx.redirectTo({ url: '/pages/login/index' });
    }
  },

  onPlayerCountChange(e) {
    this.setData({ playerCount: Number(e.detail.value) });
  },

  onThemeSelect(e) {
    this.setData({ selectedTheme: e.currentTarget.dataset.theme });
  },

  onDifficultySelect(e) {
    this.setData({ selectedDifficulty: e.currentTarget.dataset.value });
  },

  onDurationSelect(e) {
    this.setData({ selectedDuration: Number(e.currentTarget.dataset.value) });
  },

  onInspirationInput(e) {
    this.setData({ inspiration: e.detail.value });
  },

  async onGenerate() {
    this.setData({ generating: true, error: '', script: null });

    try {
      const token = auth.getToken();
      const res = await new Promise((resolve, reject) => {
        wx.request({
          url: `${auth.API_BASE}/api/script/generate`,
          method: 'POST',
          header: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
          data: {
            playerCount: this.data.playerCount,
            theme: this.data.selectedTheme,
            difficulty: this.data.selectedDifficulty,
            duration: this.data.selectedDuration,
            inspiration: this.data.inspiration,
            specialReqs: this.data.specialReqs
          },
          success: resolve,
          fail: reject
        });
      });

      if (res.statusCode === 429) {
        this.setData({
          error: '本月剧本生成次数已用完，请升级订阅',
          generating: false
        });
        return;
      }

      if (res.statusCode !== 200) {
        throw new Error(res.data?.error || '生成失败');
      }

      this.setData({
        script: res.data.script,
        generating: false
      });

      wx.showToast({ title: '剧本生成成功！', icon: 'success' });
    } catch (err) {
      this.setData({
        error: err.message || '生成失败，请重试',
        generating: false
      });
    }
  },

  onViewDetail() {
    const { script } = this.data;
    if (script?.id) {
      wx.navigateTo({ url: `/pages/script-detail/index?id=${script.id}` });
    }
  },

  onViewLibrary() {
    wx.navigateTo({ url: '/pages/script-library/index' });
  }
});
