// pages/post-create/post-create.js
// 发布信息：图片 OSS 直传 + 表单提交
// 进页不强制弹定位授权 —— 用户主动点 📍 才拉起，避免一进页就打扰
const { postApi } = require('../../utils/api.js')
const { POST_TYPES, HIDDEN_POST_TYPE_IDS } = require('../../utils/constants.js')
const { uploadFile } = require('../../utils/upload.js')

// 中国大陆手机号正则
const PHONE_RE = /^1[3-9]\d{9}$/

/** 解析图片 JSON 字符串为 URL 数组 */
function parseImgList(raw) {
  if (!raw) return []
  try { const arr = JSON.parse(raw); return Array.isArray(arr) ? arr : [] } catch { return [] }
}

Page({
  data: {
    types: POST_TYPES.filter((t) => t.id > 0 && !HIDDEN_POST_TYPE_IDS.includes(t.id)), // 排除"全部"和黑名单 type
    form: {
      type: 1,
      title: '',
      content: '',
      area: '',
      latitude: 0,
      longitude: 0,
      contact: '',
      images: [] // [{fileKey, url}]
    },
    locationPicked: false,

    // ===== 定位状态机（用户主动点 📍 才触发）=====
    // locating: wx.getLocation 进行中
    // locatingForPicking: GPS 拿到,正在 chooseLocation 让用户点选 area
    // locationFailed: 拒绝授权/取消选点,提示用户重试
    locating: false,
    locatingForPicking: false,
    locationFailed: false,

    /** 编辑模式 */
    isEdit: false,
    editId: 0,
    submitting: false,
    uploading: false
  },

  onLoad(query) {
    // 编辑模式：保留原数据,跳过定位流程（编辑已有帖子不应该要求用户重新定位）
    if (query.edit === '1' && query.data) {
      try {
        const d = JSON.parse(decodeURIComponent(query.data))
        const existingImages = parseImgList(d.images)
        const hasLocation = d.latitude > 0 && d.longitude > 0
        this.setData({
          isEdit: true,
          editId: d.id,
          'form.type': d.type,
          'form.title': d.title,
          'form.content': d.content || '',
          'form.area': d.area,
          'form.latitude': d.latitude || 0,
          'form.longitude': d.longitude || 0,
          'form.contact': d.contact,
          'form.images': existingImages.map((url) => ({ fileKey: url, url: url })),
          locationPicked: hasLocation
        })
        wx.setNavigationBarTitle({ title: '编辑信息' })
        return
      } catch (e) {
      }
    }

    // 普通发布模式：仅填 type + contact,不弹任何定位授权
    const t = parseInt(query.type || '1', 10)
    this.setData({
      'form.type': t,
      'form.contact': (getApp().globalData.userInfo && getApp().globalData.userInfo.phone) || ''
    })
  },

  onTypeSelect(e) {
    const t = parseInt(e.currentTarget.dataset.id, 10)
    this.setData({ 'form.type': t })
  },

  onInput(e) {
    const field = e.currentTarget.dataset.field
    this.setData({ [`form.${field}`]: e.detail.value })
  },

  /**
   * area input 聚焦：
   *   - 未定位(locationPicked=false) → 关掉键盘,直接拉起 📍 授权+选点
   *   - 已定位 → 放行,正常出键盘让用户编辑文案
   */
  onAreaFocus() {
    if (this.data.locationPicked) return
    if (this.data.locating || this.data.locatingForPicking) return
    // 关掉 focus 弹出的键盘(我们不让用户首次就手输)
    wx.hideKeyboard()
    this._requireLocation()
  },

  /**
   * area input 编辑（已定位之后才触发,因为 onAreaFocus 在未定位时拉起了定位并不出键盘）
   *   - 改字 → 清掉 locationPicked + 清坐标,强制用户重选（保证 lat/lng 对应当前 area）
   *   - 例外：编辑模式下,已有 lat/lng 时只微调文案不算"区域变更",放行
   */
  onAreaInput(e) {
    this.setData({ 'form.area': e.detail.value })
    if (this.data.locationPicked && !this.data.isEdit) {
      this.setData({
        locationPicked: false,
        locationFailed: false,
        'form.latitude': 0,
        'form.longitude': 0
      })
    }
  },

  /**
   * 选择图片
   */
  onChooseImage() {
    const remain = 9 - this.data.form.images.length
    if (remain <= 0) {
      wx.showToast({ title: '最多 9 张图', icon: 'none' })
      return
    }
    wx.chooseMedia({
      count: remain,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      sizeType: ['compressed'],
      success: async (res) => {
        const files = res.tempFiles || []
        if (!files.length) return
        this.setData({ uploading: true })
        wx.showLoading({ title: '上传中...' })
        try {
          for (const f of files) {
            const r = await uploadFile(f.tempFilePath, { biz: 'post' })
            const list = this.data.form.images.concat([r])
            this.setData({ 'form.images': list })
          }
        } catch (err) {
          wx.showToast({ title: '上传失败', icon: 'none' })
        } finally {
          wx.hideLoading()
          this.setData({ uploading: false })
        }
      }
    })
  },

  /**
   * 删除图片
   */
  onRemoveImage(e) {
    const idx = e.currentTarget.dataset.idx
    const list = this.data.form.images.slice()
    list.splice(idx, 1)
    this.setData({ 'form.images': list })
  },

  /**
   * 预览图片
   */
  onPreview(e) {
    const urls = this.data.form.images.map((i) => i.url)
    wx.previewImage({ current: urls[e.currentTarget.dataset.idx], urls })
  },

  /**
   * 用户点 📍（或点整个地址行） → 触发强制定位流
   *   - wx.getLocation 失败 → toast 提示 + locationFailed=true 让用户看到红字
   *   - 拿到坐标 → 弹 chooseLocation 让用户选 area
   *   - chooseLocation 取消 → 回到 locationFailed,可再点
   *   - 已定位后再点 → 复用 onChooseLocationRePick
   */
  onChooseLocation() {
    if (this.data.locating || this.data.locatingForPicking) return // 防重入
    this._requireLocation()
  },

  _requireLocation() {
    this.setData({ locating: true, locationFailed: false, locatingForPicking: false })
    wx.getLocation({
      type: 'gcj02',
      isHighAccuracy: false,
      success: (res) => {
        this.setData({
          'form.latitude': res.latitude,
          'form.longitude': res.longitude
        })
        this._pickLocationOnMap(res.latitude, res.longitude)
      },
      fail: (err) => {
        this.setData({ locating: false, locationFailed: true })
        // wx.getLocation 2.17.0 起频率限制,errMsg 为 "getLocation:fail 频繁调用会增加电量损耗..."
        const msg = (err && err.errMsg) || ''
        const toast = msg.indexOf('频繁') >= 0 ? '定位太频繁,请稍后再试' : '请允许位置权限'
        wx.showToast({ title: toast, icon: 'none' })
      }
    })
  },

  _pickLocationOnMap(lat, lng) {
    this.setData({ locating: false, locatingForPicking: true })
    wx.chooseLocation({
      latitude: lat,
      longitude: lng,
      success: (res) => {
        this.setData({
          'form.area': res.address || res.name || '',
          'form.latitude': res.latitude || lat,
          'form.longitude': res.longitude || lng,
          locationPicked: true,
          locatingForPicking: false,
          locationFailed: false
        })
      },
      fail: (err) => {
        // 用户取消选点：坐标已经拿到,不算失败,只是没选 area
        //   - 如果用户已经选过(area 非空),保留
        //   - 如果用户从未选过(area 空),则让他再点
        this.setData({
          locatingForPicking: false,
          locationFailed: !this.data.form.area
        })
      }
    })
  },

  /**
   * 校验并提交
   */
  async onSubmit() {
    // 硬底线：没定位不让提交（用户必须点过 📍 并完成 chooseLocation）
    if (!this.data.locationPicked) {
      wx.showToast({ title: '请先点击 📍 选择位置', icon: 'none' })
      // 顺便帮忙拉起一次,让用户少一步操作
      setTimeout(() => this._requireLocation(), 600)
      return
    }

    const { type, title, content, area, latitude, longitude, contact, images } = this.data.form
    if (!title.trim()) return wx.showToast({ title: '请输入标题', icon: 'none' })
    if (!content.trim()) return wx.showToast({ title: '请输入描述', icon: 'none' })
    if (!area.trim()) return wx.showToast({ title: '请输入区域', icon: 'none' })
    if (!contact.trim()) return wx.showToast({ title: '请输入联系方式', icon: 'none' })
    if (!PHONE_RE.test(contact.trim())) return wx.showToast({ title: '请输入正确的手机号', icon: 'none' })
    if (images.length === 0) return wx.showToast({ title: '请至少上传一张图片', icon: 'none' })

    this.setData({ submitting: true })
    wx.showLoading({ title: '提交中...' })
    try {
      const payload = {
        type,
        title: title.trim(),
        content: content.trim(),
        area: area.trim(),
        latitude,
        longitude,
        contact: contact.trim(),
        // 入库用 URL(永久有效,后端原样存)
        images: JSON.stringify(images.map((i) => i.url))
      }

      if (this.data.isEdit) {
        await postApi.updatePost(this.data.editId, payload)
        wx.hideLoading()
        wx.showToast({ title: '已提交修改，待审核', icon: 'success' })
      } else {
        await postApi.create(payload)
        wx.hideLoading()
        wx.showToast({ title: '发布成功，待审核', icon: 'success' })
      }
      setTimeout(() => wx.navigateBack(), 800)
    } catch (e) {
      wx.hideLoading()
      // 401 跳登录页(api.js 已经清 token)
      if (e && e.code === 401) {
        wx.navigateTo({ url: '/pages/login/login' })
        return
      }
      wx.showToast({ title: e.msg || '保存失败', icon: 'none' })
    } finally {
      this.setData({ submitting: false })
    }
  }
})
