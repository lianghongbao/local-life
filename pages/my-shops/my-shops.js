// pages/my-shops/my-shops.js
const { userApi } = require('../../utils/api.js')
const { SHOP_CATEGORY_MAP, SHOP_STATUS_MAP } = require('../../utils/constants.js')
const { parseImages, defaultImg, relativeTime } = require('../../utils/util.js')

Page({
  data: {
    list: [],
    loading: false,
    finished: false,
    page: 1,
    pageSize: 10
  },

  onLoad() {
    this.loadList(true)
  },

  onPullDownRefresh() {
    this.loadList(true).finally(() => wx.stopPullDownRefresh())
  },

  onReachBottom() {
    if (this.data.finished || this.data.loading) return
    this.loadList(false)
  },

  async loadList(reset) {
    const page = reset ? 1 : this.data.page
    this.setData({ loading: true })
    try {
      const res = (await userApi.myShops(page, this.data.pageSize, {
        silent: reset && page === 1
      })) || { list: [], total: 0 }
      const list = (res.list || []).map((it) => {
        const imgs = parseImages(it.images)
        const c = SHOP_CATEGORY_MAP[it.category] || { name: '未知', emoji: '🏪' }
        return {
          ...it,
          cover: imgs[0] || defaultImg(),
          catName: c.name,
          catEmoji: c.emoji,
          time: relativeTime(it.created_at),
          statusInfo: SHOP_STATUS_MAP[it.status] || { name: '未知', color: '#999' }
        }
      })
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

  onItemTap(e) {
    const id = e.currentTarget.dataset.id
    wx.navigateTo({ url: `/pages/shop-detail/shop-detail?id=${id}` })
  },

  onEdit(e) {
    const id = e.currentTarget.dataset.id
    const item = this.data.list.find(it => it.id == id)
    if (!item) return
    // 把当前商家数据编码到 URL，编辑页复用 shop-create
    const data = encodeURIComponent(JSON.stringify({
      id: item.id,
      name: item.name,
      category: item.category,
      address: item.address,
      latitude: item.latitude || 0,
      longitude: item.longitude || 0,
      phone: item.phone,
      description: item.description || '',
      images: item.images || ''
    }))
    wx.navigateTo({ url: `/pages/shop-create/shop-create?edit=1&data=${data}` })
  }
})
