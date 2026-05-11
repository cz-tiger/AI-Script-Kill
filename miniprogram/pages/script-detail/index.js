const auth = require('../../services/auth.js');

Page({
  data: {
    scriptId: '',
    script: null,
    loading: true,
    activeTab: 'characters',
    tabs: [
      { key: 'characters', label: '角色' },
      { key: 'timeline', label: '时间线' },
      { key: 'clues', label: '线索' },
      { key: 'acts', label: '分幕' },
      { key: 'host_manual', label: '主持人' }
    ],
    editing: false,
    editField: '',
    editContent: '',
    reviseFeedback: '',
    revising: false
  },

  onLoad(options) {
    if (!auth.getToken()) {
      wx.redirectTo({ url: '/pages/login/index' });
      return;
    }
    if (options.id) {
      this.setData({ scriptId: options.id });
      this.fetchScript();
    } else {
      this.setData({ loading: false, error: '剧本 ID 缺失' });
    }
  },

  async fetchScript() {
    this.setData({ loading: true });
    try {
      const token = auth.getToken();
      const res = await new Promise((resolve, reject) => {
        wx.request({
          url: `${auth.API_BASE}/api/script/${this.data.scriptId}`,
          method: 'GET',
          header: { 'Authorization': `Bearer ${token}` },
          success: resolve,
          fail: reject
        });
      });

      if (res.statusCode !== 200) throw new Error(res.data?.error || '获取失败');

      this.setData({ script: res.data.script, loading: false });
    } catch (err) {
      this.setData({ loading: false, error: err.message });
    }
  },

  onTabTap(e) {
    this.setData({ activeTab: e.currentTarget.dataset.key });
  },

  onStartEdit(e) {
    const field = e.currentTarget.dataset.field;
    const script = this.data.script;
    let content = '';
    if (field === 'title') content = script.title;
    else if (field === 'background') content = script.background;
    this.setData({ editing: true, editField: field, editContent: content });
  },

  onEditInput(e) {
    this.setData({ editContent: e.detail.value });
  },

  async onSaveEdit() {
    const { editField, editContent } = this.data;
    try {
      const token = auth.getToken();
      const body = {};
      body[editField] = editContent;

      const res = await new Promise((resolve, reject) => {
        wx.request({
          url: `${auth.API_BASE}/api/script/${this.data.scriptId}`,
          method: 'PATCH',
          header: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
          data: body,
          success: resolve,
          fail: reject
        });
      });

      if (res.statusCode !== 200) throw new Error(res.data?.error || '保存失败');

      this.setData({ script: res.data.script, editing: false });
      wx.showToast({ title: '已保存', icon: 'success' });
    } catch (err) {
      wx.showToast({ title: err.message, icon: 'none' });
    }
  },

  onCancelEdit() {
    this.setData({ editing: false });
  },

  onReviseInput(e) {
    this.setData({ reviseFeedback: e.detail.value });
  },

  async onRevise() {
    const feedback = this.data.reviseFeedback.trim();
    if (!feedback) return wx.showToast({ title: '请输入修改意见', icon: 'none' });

    this.setData({ revising: true });
    try {
      const token = auth.getToken();
      const res = await new Promise((resolve, reject) => {
        wx.request({
          url: `${auth.API_BASE}/api/script/${this.data.scriptId}/revise`,
          method: 'POST',
          header: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
          data: { feedback },
          success: resolve,
          fail: reject
        });
      });

      if (res.statusCode !== 200) throw new Error(res.data?.error || '修订失败');

      this.setData({ script: res.data.script, revising: false, reviseFeedback: '' });
      wx.showToast({ title: '修订完成', icon: 'success' });
    } catch (err) {
      this.setData({ revising: false });
      wx.showToast({ title: err.message, icon: 'none' });
    }
  },

  async onPublish() {
    try {
      const token = auth.getToken();
      const res = await new Promise((resolve, reject) => {
        wx.request({
          url: `${auth.API_BASE}/api/script/${this.data.scriptId}/publish`,
          method: 'POST',
          header: { 'Authorization': `Bearer ${token}` },
          success: resolve,
          fail: reject
        });
      });

      if (res.statusCode !== 200) throw new Error(res.data?.error || '发布失败');

      this.setData({ script: res.data.script });
      wx.showToast({ title: '已发布', icon: 'success' });
    } catch (err) {
      wx.showToast({ title: err.message, icon: 'none' });
    }
  },

  async onDelete() {
    wx.showModal({
      title: '确认删除',
      content: '删除后不可恢复',
      success: async (res) => {
        if (!res.confirm) return;
        try {
          const token = auth.getToken();
          const result = await new Promise((resolve, reject) => {
            wx.request({
              url: `${auth.API_BASE}/api/script/${this.data.scriptId}`,
              method: 'DELETE',
              header: { 'Authorization': `Bearer ${token}` },
              success: resolve,
              fail: reject
            });
          });

          if (result.statusCode !== 200) throw new Error(result.data?.error || '删除失败');

          wx.showToast({ title: '已删除', icon: 'success' });
          setTimeout(() => wx.navigateBack(), 1500);
        } catch (err) {
          wx.showToast({ title: err.message, icon: 'none' });
        }
      }
    });
  },

  onShareAppMessage() {
    const s = this.data.script;
    return {
      title: `剧本杀《${s?.title || '未命名'}》邀你体验`,
      path: `/pages/script-detail/index?id=${this.data.scriptId}`
    };
  }
});
