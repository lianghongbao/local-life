// pages/shops/shops.js
// 本地小店：9 类目 + 列表
const { request } = require('../../utils/api.js')
const { SHOP_CATEGORIES, SHOP_CATEGORY_MAP } = require('../../utils/constants.js')
const { parseImages, defaultImg } = require('../../utils/util.js')

Page({
  data: {
    categories: SHOP_CATEGORIES,
    activeCategory: 0,
    list: [],
    loading: false,
    finished: false,
    page: 1,
    pageSize: 10,
    areaAdcode: '',
    cityAdcode: ''
  },

  onLoad(query) {
    const c = parseInt(query.category || '0', 10)
    if (!isNaN(c)) this.setData({ activeCategory: c })
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

  onPullDownRefresh() {
    this.loadList(true).finally(() => wx.stopPullDownRefresh())
  },

  onReachBottom() {
    if (this.data.finished || this.data.loading) return
    this.loadList(false)
  },

  onCategoryChange(e) {
    const c = parseInt(e.currentTarget.dataset.id, 10)
    if (c === this.data.activeCategory) return
    this.setData({ activeCategory: c })
    this.loadList(true)
  },

  async loadList(reset) {
    const page = reset ? 1 : this.data.page
    this.setData({ loading: true })
    try {
      const queryData = {
        category: this.data.activeCategory,
        page,
        page_size: this.data.pageSize
      }
      if (this.data.cityAdcode) {
        queryData.city_adcode = this.data.cityAdcode
      } else if (this.data.areaAdcode) {
        queryData.area_adcode = this.data.areaAdcode
      }
      const res = (await request({
        url: '/api/v1/shops',
        data: queryData,
        auth: false,
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
    const c = SHOP_CATEGORY_MAP[it.category] || { name: '', emoji: '🌿' }
    return {
      ...it,
      cover: imgs[0] || defaultImg(),
      catName: c.name,
      catEmoji: c.emoji
    }
  },

  onItemTap(e) {
    const id = e.currentTarget.dataset.id
    wx.navigateTo({ url: `/pages/shop-detail/shop-detail?id=${id}` })
  },

  onShopIn() {
    if (getApp().requireLogin()) {
      wx.navigateTo({ url: '/pages/login/login' })
      return
    }
    // 把当前选中的分类带过去,避免进入收录页时分类回退到默认值
    wx.navigateTo({ url: `/pages/shop-create/shop-create?category=${this.data.activeCategory}` })
  }
})
