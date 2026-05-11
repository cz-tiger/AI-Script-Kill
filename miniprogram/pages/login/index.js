const api = require('../../services/api.js');
Page({
  data: { phone: '', loading: false },
  onInput(e) { this.setData({ phone: e.detail.value }); },
  async onLogin() {
    if (!this.data.phone || this.data.phone.length < 11) return wx.showToast({ title: '请输入手机号', icon: 'none' });
    this.setData({ loading: true });
    try {
      const res = await api.login(this.data.phone);
      api.setToken(res.data.token);
      wx.switchTab({ url: '/pages/home/index' });
    } catch { wx.showToast({ title: '登录失败', icon: 'none' }); }
    finally { this.setData({ loading: false }); }
  }
});
