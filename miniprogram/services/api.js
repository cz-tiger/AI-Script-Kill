const API_BASE = 'http://localhost:8789';

function getToken() {
  try { return wx.getStorageSync('auth_token'); } catch { return null; }
}
function setToken(token) { wx.setStorageSync('auth_token', token); }

function request(path, method = 'GET', data = null) {
  return new Promise((resolve, reject) => {
    const header = { 'Content-Type': 'application/json' };
    const token = getToken();
    if (token) header['Authorization'] = `Bearer ${token}`;

    wx.request({
      url: `${API_BASE}${path}`, method, header, data,
      success(res) {
        if (res.statusCode === 401) { wx.redirectTo({ url: '/pages/login/index' }); return reject(new Error('登录过期')); }
        if (res.statusCode === 429) {
          wx.showModal({ title: '额度已用完', content: res.data?.error || '请升级订阅', confirmText: '升级', success(r) { if (r.confirm) wx.navigateTo({ url: '/pages/subscription/index' }); } });
          return reject(new Error('额度已用完'));
        }
        resolve(res);
      },
      fail(err) { reject(err); }
    });
  });
}

module.exports = {
  API_BASE, getToken, setToken,
  request,
  login: (phone) => request('/api/auth/login', 'POST', { phone }),
  generateScript: (data) => request('/api/script/generate', 'POST', data),
  getScript: (id) => request(`/api/script/${id}`),
  getScripts: () => request('/api/scripts'),
  updateScript: (id, data) => request(`/api/script/${id}`, 'PATCH', data),
  reviseScript: (id, feedback) => request(`/api/script/${id}/revise`, 'POST', { feedback }),
  publishScript: (id) => request(`/api/script/${id}/publish`, 'POST'),
  deleteScript: (id) => request(`/api/script/${id}`, 'DELETE'),
  getPlans: () => request('/api/subscription/plans'),
  getStatus: () => request('/api/subscription/status'),
  upgrade: (tier) => request('/api/subscription/upgrade', 'POST', { tier })
};
