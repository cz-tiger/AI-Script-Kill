const api = require('../../services/api.js');

Page({
  data: { plans: [], currentTier: 'free', loading: true },
  onShow() {
    if (!api.getToken()) return wx.redirectTo({ url: '/pages/login/index' });
    this.fetchData();
  },
  async fetchData() {
    try {
      const [plans, status] = await Promise.all([api.getPlans(), api.getStatus()]);
      this.setData({ plans: plans.data.compare || [], currentTier: status.data.tier || 'free', loading: false });
    } catch { this.setData({ loading: false }); }
  },
  async onUpgrade(e) {
    const tier = e.currentTarget.dataset.tier;
    try {
      await api.upgrade(tier);
      wx.showToast({ title: '升级成功', icon: 'success' });
      this.fetchData();
    } catch { wx.showToast({ title: '升级失败', icon: 'none' }); }
  }
});
