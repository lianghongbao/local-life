// pages/shop-detail/shop-detail.js
const { shopApi } = require('../../utils/api.js')
const { SHOP_CATEGORY_MAP } = require('../../utils/constants.js')
const { parseImages, defaultImg, formatTime } = require('../../utils/util.js')
const { TENCENT_MAP_KEY } = require('../../utils/config.js')

Page({
  data: {
    id: null,
    item: null,
    images: [],
    loading: true
  },

  onLoad(query) {
    this.setData({ id: query.id })
    this.loadDetail(query.id)
  },

  async loadDetail(id) {
    this.setData({ loading: true })
    try {
      const it = await shopApi.detail(id)
      const images = parseImages(it.images)
      const c = SHOP_CATEGORY_MAP[it.category] || { name: '', emoji: '🌿' }
      // 地图 marker 已废弃:详情页不再内嵌 <map> 原生组件（Android touchmove 拦截问题）,
      // 改为腾讯静态图 API 真实地图缩略图 + 暖色遮罩,位置信息通过 wx.openLocation 跳转微信原生地图展示。

      // 拼腾讯静态图 URL(按 lat/lng 渲染)
      const mapStaticUrl = it.latitude && it.longitude
        ? `https://apis.map.qq.com/ws/staticmap/v2?center=${it.latitude},${it.longitude}&zoom=16&size=600x300&key=${TENCENT_MAP_KEY}&format=png`
        : ''

      const timeText = formatTime(it.created_at) || ''
      this.setData({
        item: { ...it, catName: c.name, catEmoji: c.emoji, timeText, joinYear: timeText.slice(0, 4), mapStaticUrl },
        images
      })
    } catch (e) {
      // toast
    } finally {
      this.setData({ loading: false })
    }
  },

  onPreview(e) {
    const idx = e.currentTarget.dataset.idx
    if (!this.data.images.length) return
    wx.previewImage({
      current: this.data.images[idx],
      urls: this.data.images
    })
  },

  onCall() {
    const phone = this.data.item && this.data.item.phone
    if (!phone) return
    wx.makePhoneCall({
      phoneNumber: phone,
      fail: () => {
        wx.setClipboardData({
          data: phone,
          success: () => wx.showToast({ title: '已复制号码' })
        })
      }
    })
  },

  onCopyPhone() {
    const phone = this.data.item && this.data.item.phone
    if (!phone) return
    wx.setClipboardData({
      data: phone,
      success: () => wx.showToast({ title: '已复制' })
    })
  },

  /**
   * 打开地图查看商家位置
   *   - 复用"地址行"和"地图卡"两个入口,走同一个 handler
   *   - 没有经纬度时(老数据未补)走 toast 降级,避免 wx.openLocation 报 invalid coord
   *   - wx.openLocation 走微信原生地图界面,用户可"导航/收藏/分享"
   */
  onOpenMap() {
    const it = this.data.item || {}
    if (!it.latitude || !it.longitude) {
      wx.showToast({ title: '暂无位置信息', icon: 'none' })
      return
    }
    wx.openLocation({
      latitude: Number(it.latitude),
      longitude: Number(it.longitude),
      name: it.name || it.address || '商家位置',
      address: it.address || '',
      scale: 16,
    })
  },

  onShareAppMessage() {
    const it = this.data.item
    return {
      title: it ? it.name : '小城便利贴',
      path: `/pages/shop-detail/shop-detail?id=${this.data.id}`
    }
  }
})
