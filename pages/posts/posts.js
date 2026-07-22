// pages/posts/posts.js
// 信息分类页：4 大类目切换 + 列表
const { request } = require('../../utils/api.js')
const { POST_TYPES, POST_TYPE_MAP, POST_STATUS_MAP, HIDDEN_POST_TYPE_IDS } = require('../../utils/constants.js')
const { parseImages, defaultImg, relativeTime } = require('../../utils/util.js')

Page({
  data: {
    types: POST_TYPES.filter((t) => !HIDDEN_POST_TYPE_IDS.includes(t.id)),
    activeType: 0,
    list: [],
    loading: false,
    finished: false,
    page: 1,
    pageSize: 10,
    areaAdcode: '',
    cityAdcode: ''
  },

  onLoad(query) {
    // 支持 home 跳过来带 type（navigateTo 场景）
    const t = parseInt(query.type || '0', 10)
    if (!isNaN(t)) {
      this.setData({ activeType: t })
    }
    // 启动时尝试读 storage 里的 adcode
    try {
      const cached = wx.getStorageSync('userLocation')
      if (cached && cached.city_adcode) {
        this.setData({ cityAdcode: cached.city_adcode })
      } else if (cached && cached.area_adcode) {
        this.setData({ areaAdcode: cached.area_adcode })
      }
    } catch (_) {}
    this.loadList(true)
  },

  onShow() {
    // 支持 home 通过 switchTab 跳过来（tabBar 页无法 navigateTo）
    const pending = getApp().globalData._pendingPostType
    if (pending != null) {
      getApp().globalData._pendingPostType = null
      if (pending !== this.data.activeType) {
        this.setData({ activeType: pending })
        this.loadList(true)
      }
    }
  },

  onPullDownRefresh() {
    this.loadList(true).finally(() => wx.stopPullDownRefresh())
  },

  onReachBottom() {
    if (this.data.finished || this.data.loading) return
    this.loadList(false)
  },

  onTypeChange(e) {
    const t = parseInt(e.currentTarget.dataset.id, 10)
    if (t === this.data.activeType) return
    this.setData({ activeType: t })
    this.loadList(true)
  },

  async loadList(reset) {
    const page = reset ? 1 : this.data.page
    this.setData({ loading: true })
    try {
      const queryData = {
        type: this.data.activeType,
        page,
        page_size: this.data.pageSize
      }
      if (this.data.cityAdcode) {
        queryData.city_adcode = this.data.cityAdcode
      } else if (this.data.areaAdcode) {
        queryData.area_adcode = this.data.areaAdcode
      }
      const res = (await request({
        url: '/api/v1/posts',
        data: queryData,
        auth: false,
        // reset 时（首屏 / 切类目 / 下拉刷新）首次加载 silent，避免冷启动弹错
        silent: reset && page === 1
      })) || { list: [], total: 0 }
      const list = (res.list || []).map((it) => this.formatItem(it))
      this.setData({
        list: reset ? list : this.data.list.concat(list),
        page: page + 1,
        finished: list.length < this.data.pageSize
      })
    } catch (e) {
    } finally {
      this.setData({ loading: false })
    }
  },

  onLocationChange(e) {
    const cityAdcode = (e && e.detail && e.detail.areaAdcode) || ''
    if (cityAdcode === this.data.cityAdcode) return
    this.setData({ cityAdcode })
    // 切换区/镇后刷新当前类目列表
    this.loadList(true)
  },

  formatItem(it) {
    const imgs = parseImages(it.images)
    const t = POST_TYPE_MAP[it.type] || { name: '' }
    return {
      ...it,
      cover: imgs[0] || defaultImg(),
      typeName: t.name,
      typeEmoji: t.emoji || '📌',
      time: relativeTime(it.created_at),
      statusInfo: POST_STATUS_MAP[it.status] || { name: '', color: '#999' }
    }
  },

  onItemTap(e) {
    const id = e.currentTarget.dataset.id
    wx.navigateTo({ url: `/pages/post-detail/post-detail?id=${id}` })
  },

  onPublish() {
    if (getApp().requireLogin()) {
      wx.navigateTo({ url: '/pages/login/login' })
      return
    }
    wx.navigateTo({ url: `/pages/post-create/post-create?type=${this.data.activeType || 1}` })
  }
})
