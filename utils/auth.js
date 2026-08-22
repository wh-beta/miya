const { API_BASE_URL, DEV_MOCK_LOGIN } = require('./config.js');

let _openid = null;

function getOpenid() {
  return _openid;
}

function _navigateTo(role) {
  const page = role === 'parent' ? '/pages/parent_home/parent_home' : '/pages/student_home/student_home';
  wx.reLaunch({ url: page });
}

function loginAndRoute(role) {
  if (DEV_MOCK_LOGIN) {
    _openid = '__dev_' + role;
    wx.showToast({ title: '开发模式 (模拟登录)', icon: 'none', duration: 2000 });
    _navigateTo(role);
    return Promise.resolve(_openid);
  }

  return new Promise((resolve, reject) => {
    wx.login({
      success: (res) => {
        wx.request({
          url: `${API_BASE_URL}/auth/login`,
          method: 'POST',
          header: { 'Content-Type': 'application/json' },
          data: { code: res.code, role },
          success: (r) => {
            if (r.statusCode >= 400) {
              reject(new Error((r.data && r.data.detail) || '登录失败'));
              return;
            }
            _openid = r.data.openid;
            _navigateTo(role);
            resolve(_openid);
          },
          fail: (err) => reject(new Error(err.errMsg || '网络错误')),
        });
      },
      fail: (err) => reject(new Error(err.errMsg || 'wx.login 失败')),
    });
  });
}

module.exports = { loginAndRoute, getOpenid };
