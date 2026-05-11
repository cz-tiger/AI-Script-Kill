const auth = require('../../services/auth.js');

Page({
  data: {
    scripts: [],
    loading: true,
    error: '',
    filter: 'all'
  },

  onLoad() {
    if (!auth.getToken()) {
      wx.redirectTo({ url: '/pages/login/index' });
      return;
    }
  },

  onShow() {
    this.fetchScripts();
  },

  async fetchScripts() {
    this.setData({ loading: true, error: '' });
    try {
      const token = auth.getToken();
      const res = await new Promise((resolve, reject) => {
        wx.request({
          url: `${auth.API_BASE}/api/scripts`,
          method: 'GET',
          header: { 'Authorization': `Bearer ${token}` },
          data: { limit: 50 },
          success: resolve,
          fail: reject
        });
      });

      if (res.statusCode !== 200) throw new Error(res.data?.error || '获取失败');

      this.setData({ scripts: res.data.scripts, loading: false });
    } catch (err) {
      this.setData({ loading: false, error: err.message });
    }
  },

  onFilterTap(e) {
    this.setData({ filter: e.currentTarget.dataset.filter });
  },

  onScriptTap(e) {
    const id = e.currentTarget.dataset.id;
    wx.navigateTo({ url: `/pages/script-detail/index?id=${id}` });
  },

  onCreateNew() {
    wx.navigateTo({ url: '/pages/script-kill/index' });
  }
});
