const api = require('../../services/api.js');
Page({
  data: { scripts: [], loading: true },
  onShow() {
    if (!api.getToken()) return wx.redirectTo({ url: '/pages/login/index' });
    this.fetchScripts();
  },
  async fetchScripts() {
    try {
      const res = await api.getScripts();
      this.setData({ scripts: res.data.scripts || [], loading: false });
    } catch { this.setData({ loading: false }); }
  },
  onCreate() { wx.switchTab({ url: '/pages/script-kill/index' }); },
  onViewScript(e) { wx.navigateTo({ url: `/pages/script-detail/index?id=${e.currentTarget.dataset.id}` }); },
  onViewLibrary() { wx.switchTab({ url: '/pages/script-library/index' }); }
});
