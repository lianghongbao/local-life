// pages/profile-edit/profile-edit.js
// 编辑资料：官方 chooseAvatar + nickname input
//
// 状态机：
//   avatarUploading = true 时锁住头像按钮 + 保存按钮
//   saving          = true 时锁住保存按钮
//   dirty           = true 时保存按钮才可点
//
// 流程：
//   选头像 → uploadFile (OSS) → 拿 fileKey → setData → dirty
//   输入昵称 → bindblur → trim → setData → dirty
//   点保存 → validateNickname → buildUpdatePayload → userApi.updateProfile
//          → 成功后拉 fresh profile 写缓存 → navigateBack

const { uploadFile } = require('../../utils/upload.js')
const { userApi, setStoredUser } = require('../../utils/api.js')
const { validateNickname, buildUpdatePayload } = require('../../utils/profile-edit.js')

Page({
  data: {
    // 原始值
    originalNickname: '',
    originalAvatar: '',
    // 当前值
    nickname: '',
    avatarFileKey: '',
    avatarPreviewUrl: '',
    // UI 状态
    saving: false,
    avatarUploading: false,
    dirty: false
  },

  onLoad() {
    const app = getApp()
    const u = (app.globalData.userInfo) || {}
    const nickname = u.nickname || ''
    // avatar: URL(直接渲染)
    // avatar_file_key: 纯 file_key,用于 dirty 比较和重传
    const avatar = u.avatar || ''
    const avatarFileKey = u.avatar_file_key || ''
    this.setData({
      originalNickname: nickname,
      originalAvatar: avatarFileKey,
      nickname,
      avatarFileKey,
      avatarPreviewUrl: avatar, // URL,直接渲染
      dirty: false
    })
  },

  /**
   * 官方 chooseAvatar 事件：拿微信头像临时路径
   */
  async onChooseAvatar(e) {
    const { avatarUrl } = e.detail || {}
    if (!avatarUrl) {
      return
    }
    if (this.data.avatarUploading) return

    this.setData({ avatarUploading: true })
    try {
      // 上传后端返回: fileKey(纯路径) + url(URL)
      const { fileKey, url } = await uploadFile(avatarUrl, { biz: 'avatar' })
      this.setData({
        avatarFileKey: fileKey,
        avatarPreviewUrl: url,
        dirty: this.isDirty(fileKey)
      })
    } catch (err) {
      wx.showToast({ title: '头像上传失败', icon: 'none' })
      // 不更新 data.avatarFileKey，保留旧值
    } finally {
      this.setData({ avatarUploading: false })
    }
  },

  /**
   * 昵称 input 完成（官方要求 bindblur）
   */
  onNicknameBlur(e) {
    const raw = (e.detail && e.detail.value) || ''
    this._commitNickname(raw)
  },

  /**
   * 昵称 input 实时输入（兼容微信官方 nickname 类型的"一键填写"场景）
   * type="nickname" 点开后底部弹微信昵称面板，点选后会触发 bindinput，
   * 而 bindblur 不会触发（因为 input 始终保持 focus）。
   */
  onNicknameInput(e) {
    const raw = (e.detail && e.detail.value) || ''
    this._commitNickname(raw, { silent: true })
  },

  /**
   * 昵称 input 按"完成"键
   */
  onNicknameConfirm(e) {
    const raw = (e.detail && e.detail.value) || ''
    this._commitNickname(raw)
  },

  /**
   * 统一处理昵称变化：trim + 长度校验 + setData
   * @param {string} raw
   * @param {{silent?: boolean}} [opts] silent=true 时超长只截断不 toast（input 实时触发用）
   */
  _commitNickname(raw, opts = {}) {
    const trimmed = raw.trim()
    if (trimmed.length > 16) {
      if (!opts.silent) {
        wx.showToast({ title: '昵称 1-16 个字符', icon: 'none' })
      }
      // 静默场景不打断输入，让 maxlength 自然截断
      if (!opts.silent) {
        this.setData({ nickname: this.data.nickname })
      }
      return
    }
    this.setData({
      nickname: trimmed,
      dirty: this.isDirty(this.data.avatarFileKey, trimmed)
    })
  },

  /**
   * 保存按钮
   */
  async onSave() {
    if (!this.data.dirty || this.data.saving) return

    const v = validateNickname(this.data.nickname)
    if (!v.ok) {
      wx.showToast({ title: v.msg, icon: 'none' })
      return
    }
    const nickname = v.value

    const payload = buildUpdatePayload({
      originalNickname: this.data.originalNickname,
      nickname,
      originalAvatar: this.data.originalAvatar,
      avatarFileKey: this.data.avatarFileKey
    })
    if (Object.keys(payload).length === 0) {
      wx.navigateBack()
      return
    }

    this.setData({ saving: true, nickname })
    try {
      await userApi.updateProfile(payload)
      // 拉 fresh profile 写缓存 + globalData
      const fresh = await userApi.profile({ silent: true })
      setStoredUser(fresh)
      const app = getApp()
      app.globalData.userInfo = fresh

      wx.showToast({ title: '保存成功', icon: 'success' })
      setTimeout(() => wx.navigateBack(), 400)
    } catch (err) {
      // 401 跳登录页(api.js 已经清 token)
      if (err && err.code === 401) {
        wx.navigateTo({ url: '/pages/login/login' })
        return
      }
      // 其他业务错 api.js 已 toast
    } finally {
      this.setData({ saving: false })
    }
  },

  /**
   * 计算 dirty：nickname 或 avatar 任一变化
   */
  isDirty(avatarFileKey = this.data.avatarFileKey, nickname = this.data.nickname) {
    return nickname !== this.data.originalNickname ||
           avatarFileKey !== this.data.originalAvatar
  }
})