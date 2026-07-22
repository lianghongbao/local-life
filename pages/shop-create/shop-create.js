// pages/shop-create/shop-create.js
// 本地收录：图片 OSS 直传 + 表单提交
// 进页不强制弹定位授权 —— 用户主动点 📍 才拉起，避免一进页就打扰
const { shopApi } = require('../../utils/api.js')
const { SHOP_CATEGORIES } = require('../../utils/constants.js')
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
    categories: SHOP_CATEGORIES.filter((c) => c.id > 0),
    form: {
      name: '',
      category: 1,
      address: '',
      latitude: 0,
      longitude: 0,
      phone: '',
      description: '',
      images: []
    },
    locationPicked: false,

    // ===== 定位状态机（用户主动点 📍 才触发）=====
    // locating: wx.getLocation 进行中
    // locatingForPicking: GPS 拿到,正在 chooseLocation 让用户点选 address
    // locationFailed: 拒绝授权/取消选点,提示用户重试
    locating: false,
    locatingForPicking: false,
    locationFailed: false,

    /** 编辑模式 */
    isEdit: false,
    editId: 0,
    existingImages: [],
    submitting: false,
    uploading: false
  },

  onLoad(query) {
    // 编辑模式:从 query 恢复表单,跳过定位流程（已有 lat/lng 不应要求重选）
    if (query.edit === '1' && query.data) {
      try {
        const d = JSON.parse(decodeURIComponent(query.data))
        const existingImages = parseImgList(d.images)
        const hasLocation = d.latitude > 0 && d.longitude > 0
        this.setData({
          isEdit: true,
          editId: d.id,
          'form.name': d.name,
          'form.category': d.category,
          'form.address': d.address,
          'form.latitude': d.latitude || 0,
          'form.longitude': d.longitude || 0,
          'form.phone': d.phone,
          'form.description': d.description || '',
          existingImages,
          // 编辑场景:image 字段已是 URL(后端转过),直接复用
          'form.images': existingImages.map((url) => ({ fileKey: url, url: url })),
          locationPicked: hasLocation
        })
        wx.setNavigationBarTitle({ title: '编辑收录' })
        return
      } catch (e) {
      }
    }

    // 普通收录模式:仅预填手机号,不弹任何定位授权
    const user = getApp().globalData.userInfo
    const patch = {}
    if (user && user.phone) {
      patch['form.phone'] = user.phone
    }
    // 本地页选中分类跳过来时,预填分类(编辑模式已被上方分支处理,不会落到这里)
    const qCat = parseInt(query.category || '', 10)
    if (!isNaN(qCat) && qCat > 0) {
      patch['form.category'] = qCat
    }
    if (Object.keys(patch).length) this.setData(patch)
  },

  onCategorySelect(e) {
    const c = parseInt(e.currentTarget.dataset.id, 10)
    this.setData({ 'form.category': c })
  },

  onInput(e) {
    const field = e.currentTarget.dataset.field
    this.setData({ [`form.${field}`]: e.detail.value })
  },

  /**
   * address input 聚焦:
   *   - 未定位(locationPicked=false) → 关掉键盘,直接拉起 📍 授权+选点
   *   - 已定位 → 放行,正常出键盘让用户编辑文案
   */
  onAddressFocus() {
    if (this.data.locationPicked) return
    if (this.data.locating || this.data.locatingForPicking) return
    // 关掉 focus 弹出的键盘(我们不让用户首次就手输)
    wx.hideKeyboard()
    this._requireLocation()
  },

  /**
   * address input 编辑（已定位之后才触发,因为 onAddressFocus 在未定位时拉起了定位并不出键盘）
   *   - 改字 → 清掉 locationPicked + 清坐标,强制用户重选（保证 lat/lng 对应当前 address）
   *   - 例外：编辑模式下,已有 lat/lng 时只微调文案不算"地址变更",放行
   */
  onAddressInput(e) {
    this.setData({ 'form.address': e.detail.value })
    if (this.data.locationPicked && !this.data.isEdit) {
      this.setData({
        locationPicked: false,
        locationFailed: false,
        'form.latitude': 0,
        'form.longitude': 0
      })
    }
  },

  onChooseImage() {
    const remain = 6 - this.data.form.images.length
    if (remain <= 0) {
      wx.showToast({ title: '最多 6 张图', icon: 'none' })
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
            const r = await uploadFile(f.tempFilePath, { biz: 'shop' })
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

  onRemoveImage(e) {
    const idx = e.currentTarget.dataset.idx
    const list = this.data.form.images.slice()
    list.splice(idx, 1)
    this.setData({ 'form.images': list })
  },

  onPreview(e) {
    const urls = this.data.form.images.map((i) => i.url)
    wx.previewImage({ current: urls[e.currentTarget.dataset.idx], urls })
  },

  /**
   * 用户点 📍 → 触发强制定位流
   *   - wx.getLocation 失败 → toast 提示 + locationFailed=true 让用户看到红字
   *   - 拿到坐标 → 弹 chooseLocation 让用户选 address
   *   - chooseLocation 取消 → 回到 locationFailed,可再点
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
          'form.address': res.address || res.name || '',
          'form.latitude': res.latitude || lat,
          'form.longitude': res.longitude || lng,
          locationPicked: true,
          locatingForPicking: false,
          locationFailed: false
        })
      },
      fail: (err) => {
        // 用户取消选点:如果已有 address 保留,否则提示重试
        this.setData({
          locatingForPicking: false,
          locationFailed: !this.data.form.address
        })
      }
    })
  },

  async onSubmit() {
    // 硬底线:没定位不让提交(用户必须点过 📍 并完成 chooseLocation)
    if (!this.data.locationPicked) {
      wx.showToast({ title: '请先点击 📍 选择位置', icon: 'none' })
      // 顺便帮忙拉起一次,让用户少一步操作
      setTimeout(() => this._requireLocation(), 600)
      return
    }

    const { name, category, address, latitude, longitude, phone, description, images } = this.data.form
    if (!name.trim()) return wx.showToast({ title: '请输入名称', icon: 'none' })
    if (!address.trim()) return wx.showToast({ title: '请输入地址', icon: 'none' })
    if (!phone.trim()) return wx.showToast({ title: '请输入电话', icon: 'none' })
    if (!PHONE_RE.test(phone.trim())) return wx.showToast({ title: '请输入正确的手机号', icon: 'none' })
    if (images.length === 0) return wx.showToast({ title: '请至少上传一张图片', icon: 'none' })

    this.setData({ submitting: true })
    wx.showLoading({ title: '提交中...' })
    try {
      const payload = {
        name: name.trim(),
        category,
        address: address.trim(),
        latitude,
        longitude,
        phone: phone.trim(),
        description: description.trim(),
        // 入库用 URL(永久有效,后端原样存)
        images: JSON.stringify(images.map((i) => i.url))
      }

      if (this.data.isEdit) {
        await shopApi.update(this.data.editId, payload)
        wx.hideLoading()
        wx.showToast({ title: '已提交修改，待审核', icon: 'success' })
      } else {
        await shopApi.create(payload)
        wx.hideLoading()
        wx.showToast({ title: '申请已提交，审核中', icon: 'success' })
      }
      setTimeout(() => wx.navigateBack(), 800)
    } catch (e) {
      wx.hideLoading()
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
