// app.js
// 入口文件：登录态管理、用户信息缓存、跨页面事件分发
//
// 启动流程（友好版）：
//   onLaunch
//     1. 看本地有没有 token
//        ├─ 没有 → 不请求 profile，logged=false，等用户主动登录
//        └─ 有   → 静默请求 profile（silent:true）
//                  ├─ 200 → 写入 globalData.userInfo，logged=true
//                  └─ 401 → 清 token，logged=false，不弹错
const { getToken, getStoredUser, setStoredUser, clearAuth, userApi } = require('./utils/api.js')
const location = require('./utils/location.js')

App({
  onLaunch() {
    this.bootstrapLoginState()
    this.bootstrapLocation()
  },

  globalData: {
    userInfo: null,
    /** 是否已登录：根据 token + profile 综合判断 */
    logged: false,
    /** 是否需要引导去登录（401 后由 api.js 标记） */
    needLogin: false,
    systemInfo: null,
    /** 启动时定位授权状态:'granted' | 'denied' | 'failed' | '' (未尝试) */
    bootstrapLocationStatus: '',
    /** 启动时拿到的位置信息(granted 时有值) */
    bootstrapLocation: null
  },

  /**
   * 启动时拉起登录态（静默，失败不弹错）
   */
  async bootstrapLoginState() {
    const token = getToken()
    if (!token) {
      // 首次启动或清退后：从缓存恢复用户资料（即使没 token 也可能展示昵称）
      const cached = getStoredUser()
      if (cached) {
        this.globalData.userInfo = cached
        this.globalData.logged = false // 资料缓存 ≠ 登录态
      }
      return
    }

    // 有 token：先展示缓存的 userInfo（避免首屏空白），后台静默刷新
    const cached = getStoredUser()
    if (cached) this.globalData.userInfo = cached

    try {
      const profile = await userApi.profile({ silent: true })
      setStoredUser(profile)
      this.globalData.userInfo = profile
      this.globalData.logged = true
    } catch (e) {
      // 401 已经 silent 处理：不弹 toast，只清 token
      // 其他错误（网络/500）也不打扰用户
      this.globalData.userInfo = null
      this.globalData.logged = false
    }
  },

  /**
   * 启动时主动弹定位授权 + 拿经纬度 + reverse
   * 失败/拒绝不 throw,只更新 globalData.bootstrapLocationStatus
   * 注意:不要在 onShow 重复调,只在 onLaunch 调一次
   */
  async bootstrapLocation() {
    try {
      const result = await location.bootstrapLocation()
      this.globalData.bootstrapLocationStatus = result.status
      if (result.location) {
        this.globalData.bootstrapLocation = result.location
      }
    } catch (e) {
      this.globalData.bootstrapLocationStatus = 'failed'
    }
  },

  /**
   * 登录成功后调用：写 token、拉 profile、广播给所有页面
   */
  async onLoginSuccess() {
    // 重新走一遍静默拉取流程
    const cached = getStoredUser()
    if (cached) this.globalData.userInfo = cached
    try {
      const profile = await userApi.profile({ silent: true })
      setStoredUser(profile)
      this.globalData.userInfo = profile
    } catch (e) {
      // 登录刚成功 profile 拉不到，兜底用空对象
      this.globalData.userInfo = this.globalData.userInfo || {}
    }
    this.globalData.logged = true
    this.globalData.needLogin = false
    // 通知所有页面登录态变化
    this.emitLoginChange(true)
  },

  /**
   * 退出登录
   */
  logout() {
    clearAuth()
    this.globalData.userInfo = null
    this.globalData.logged = false
    this.globalData.needLogin = false
    this.emitLoginChange(false)
  },

  /**
   * 跨页面事件：登录态变化
   *   pages/mine/mine 等页面在 onShow 监听 wx.eventCenter / getApp().globalData
   *   简单实现：pages 在 onShow 里直接读 globalData.logged
   */
  emitLoginChange(logged) {
    // 占位：留给后续 wx.$emit 风格的全局事件总线
    // 当前实现：依赖页面的 onShow 轮询 globalData（简单可靠）
  },

  /**
   * 检查是否需要登录
   *   返回 true 表示未登录，需要引导
   *   返回 false 表示已登录
   */
  requireLogin() {
    if (!this.globalData.logged) {
      this.globalData.needLogin = true
      return true
    }
    return false
  }
})
