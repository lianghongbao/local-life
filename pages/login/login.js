// pages/login/login.js
// 微信一键登录：wx.login 拿 code → 后端换 token
//
// 防"连点 + 闪烁"设计：
//   1. data._locked = true 期间完全忽略后续点击（即使 wx.showToast 中）
//   2. 拿到 wx.login() code 后，失败重试只复用 code，不再调 wx.login()
//      （wx code 只能用一次，重复调 wx.login 会让旧 code 失效）
//   3. 后端失败时给明确指引：超时/网络/业务错分类提示

const { userApi, setToken } = require('../../utils/api.js')

Page({
  data: {
    loading: false,
    agreed: false
  },

  /**
   * 触发登录按钮（带锁）
   */
  async onLoginTap() {
    // 防连点：loading 期间直接 return
    if (this.data.loading) {
      return
    }
    if (!this.data.agreed) {
      wx.showToast({ title: '请先同意用户协议', icon: 'none' })
      return
    }

    this.setData({ loading: true })
    try {
      // 1. 拿微信 code（整个流程只调一次 wx.login！）
      const loginRes = await this.wxLogin()
      const code = loginRes.code
      if (!code) throw new Error('微信登录失败：未拿到 code')

      // 2. 后端换 token（失败重试一次，复用同一个 code）
      const res = await this.loginWithRetry(code)
      if (!res || !res.token) {
        throw new Error('登录失败：后端未返回 token')
      }

      setToken(res.token)
      // 3. 通知 app 登录成功
      const app = getApp()
      await app.onLoginSuccess()

      wx.showToast({ title: '欢迎回来', icon: 'success' })
      setTimeout(() => {
        const pages = getCurrentPages()
        if (pages.length > 1) wx.navigateBack()
        else wx.switchTab({ url: '/pages/home/home' })
      }, 600)
    } catch (e) {
      const msg = this.friendlyMsg(e)
      wx.showToast({ title: msg, icon: 'none', duration: 3000 })
    } finally {
      this.setData({ loading: false })
    }
  },

  /**
   * 后端登录 + 失败重试一次（复用同一 code）
   *   - 微信 code 只能用一次，重试不能调 wx.login()
   *   - 只对"网络/超时"重试；业务错误（code 无效等）直接抛
   *   - 通过 error.code 区分：-1 = 网络/超时，可重试；其他 = 业务错，不重试
   */
  async loginWithRetry(code) {
    const maxAttempts = 2
    let lastErr = null
    for (let i = 1; i <= maxAttempts; i++) {
      try {
        const res = await userApi.login(code)
        if (res && res.token) return res
        throw Object.assign(new Error('后端未返回 token'), { code: -999 })
      } catch (e) {
        lastErr = e
        const code = e && e.code
        // 业务错误（code 是业务码如 40029 等）不重试
        // 网络/超时（code === -1 或 code === -999）才重试
        if (typeof code === 'number' && code > 0) {
          throw e
        }
        if (i < maxAttempts) {
          await new Promise((r) => setTimeout(r, 500))
        }
      }
    }
    throw lastErr
  },

  /**
   * 把后端 error 转成用户可读消息
   */
  friendlyMsg(e) {
    const raw = (e && (e.msg || e.message)) || ''
    if (raw.includes('deadline exceeded') || raw.includes('timeout')) {
      return '请求超时，请检查后端服务'
    }
    if (raw.includes('url not in domain list')) {
      return '请在开发者工具勾选"不校验合法域名"'
    }
    if (raw.includes('fail') && raw.length < 30) {
      return '网络异常，请稍后重试'
    }
    return raw || '登录失败，请稍后重试'
  },

  wxLogin() {
    return new Promise((resolve, reject) => {
      wx.login({
        success: (res) => resolve(res),
        fail: (err) => reject(err)
      })
    })
  },

  toggleAgree() {
    this.setData({ agreed: !this.data.agreed })
  },

  goAgreement() {
    wx.showModal({
      title: '用户协议',
      content: '本平台为本地便民信息展示服务，用户发布的信息需经审核后展示。',
      showCancel: false
    })
  }
})
