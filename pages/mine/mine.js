// pages/mine/mine.js
// 我的:登录态展示 + 入口(我的发布/我的商家/设置)
//
// 登录态来源:app.globalData.logged(由 app.js 统一管理)
// 缓存读取:app.globalData.userInfo(昵称/头像等展示用)
//   注意:即使未登录,也可能展示上次缓存的 userInfo(用于快速恢复)
//         但入口交互判断一律用 logged
//
// 头像 URL 策略:
//   - storage 存 avatar(URL) + avatar_file_key(纯 file_key)
//   - onShow 时调 profile 拿最新 userInfo(URL 永久有效,无需再签)

const { userApi, setStoredUser } = require('../../utils/api.js')

Page({
  data: {
    user: null,
    logged: false
  },

  async onShow() {
    const app = getApp()
    // 登录后每次切回 mine 都先拉 fresh profile(URL 永久有效,这里主要是拉最新昵称)
    if (app.globalData.logged) {
      await this._refreshProfile()
    } else {
      // 未登录时直接展示缓存(让用户能看到上次的昵称)
      this.setData({
        user: app.globalData.userInfo,
        logged: false
      })
    }
  },

  async _refreshProfile() {
    try {
      const profile = await userApi.profile({ silent: true })
      setStoredUser(profile)
      const app = getApp()
      app.globalData.userInfo = profile
      this.setData({ user: profile, logged: true })
    } catch (e) {
      // 失败降级:用 globalData 兜底(不阻塞页面)
      const app = getApp()
      this.setData({
        user: app.globalData.userInfo,
        logged: true
      })
    }
  },

  onLoginTap() {
    wx.navigateTo({ url: '/pages/login/login' })
  },

  onMyPosts() {
    if (getApp().requireLogin()) return this.onLoginTap()
    wx.navigateTo({ url: '/pages/my-posts/my-posts' })
  },

  onMyShops() {
    if (getApp().requireLogin()) return this.onLoginTap()
    wx.navigateTo({ url: '/pages/my-shops/my-shops' })
  },

  onNotices() {
    wx.navigateTo({ url: '/pages/notices/notices' })
  },

  onContact() {
    // 反馈入口仅保留邮箱(用户点"我的→反馈/联系"即把邮箱复制到剪贴板)
    wx.setClipboardData({
      data: 'lhb2438@163.com',
      success: () => wx.showToast({ title: '邮箱已复制:lhb2438@163.com', icon: 'none' })
    })
  },

  onAbout() {
    wx.showModal({
      title: '关于小城便利贴',
      content: '小城便利贴 v1.0\n一个温暖的本方便民信息站',
      showCancel: false
    })
  },

  async onLogout() {
    const confirm = await new Promise((resolve) => {
      wx.showModal({
        title: '退出登录',
        content: '确定要退出吗？',
        success: (res) => resolve(res.confirm)
      })
    })
    if (!confirm) return
    getApp().logout()
    this.setData({ user: null, logged: false })
    wx.showToast({ title: '已退出', icon: 'success' })
  },

  onEditProfile() {
    if (getApp().requireLogin()) return this.onLoginTap()
    wx.navigateTo({ url: '/pages/profile-edit/profile-edit' })
  },

  // 兜底图加载失败(OSS 404/网络问题):静默,不弹错
  // 圆形头像会显示背景色,不影响布局
  onAvatarError(e) {
  }
})
