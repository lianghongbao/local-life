// pages/my-posts/my-posts.js
const { userApi, postApi } = require('../../utils/api.js')
const { POST_TYPE_MAP, POST_STATUS_MAP } = require('../../utils/constants.js')
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
      const res = (await userApi.myPosts(page, this.data.pageSize, {
        silent: reset && page === 1
      })) || { list: [], total: 0 }
      const list = (res.list || []).map((it) => {
        const imgs = parseImages(it.images)
        const t = POST_TYPE_MAP[it.type] || { name: '', emoji: '📌' }
        return {
          ...it,
          cover: imgs[0] || defaultImg(),
          typeName: t.name,
          typeEmoji: t.emoji,
          time: relativeTime(it.created_at),
          statusInfo: POST_STATUS_MAP[it.status] || { name: '', color: '#999' }
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
    wx.navigateTo({ url: `/pages/post-detail/post-detail?id=${id}&from=mine` })
  },

  onEdit(e) {
    const id = e.currentTarget.dataset.id
    const item = this.data.list.find(it => it.id == id)
    if (!item) return
    const data = encodeURIComponent(JSON.stringify({
      id: item.id,
      type: item.type,
      title: item.title,
      content: item.content || '',
      area: item.area,
      latitude: item.latitude || 0,
      longitude: item.longitude || 0,
      contact: item.contact,
      images: item.images || ''
    }))
    wx.navigateTo({ url: `/pages/post-create/post-create?edit=1&data=${data}` })
  },

  async onOffline(e) {
    const id = e.currentTarget.dataset.id
    const ok = await new Promise((resolve) => {
      wx.showModal({
        title: '下架确认',
        content: '下架后用户将无法查看此信息',
        success: (res) => resolve(res.confirm)
      })
    })
    if (!ok) return
    try {
      await userApi.offlinePost(id)
      // 更新本地状态
      const list = this.data.list.map((it) =>
        it.id === id ? { ...it, status: 3, statusInfo: POST_STATUS_MAP[3] } : it
      )
      this.setData({ list })
      wx.showToast({ title: '已下架', icon: 'success' })
    } catch (err) {
      if (err && err.code === 401) {
        wx.navigateTo({ url: '/pages/login/login' })
      }
    }
  },

  // 重新上架: status=3/4 → 1(审核中)
  // 复用 postApi.updatePost,后端会把 status 重置为 1
  async onResubmit(e) {
    const id = e.currentTarget.dataset.id
    const item = this.data.list.find(it => it.id == id)
    if (!item) return
    try {
      await postApi.updatePost(id, {
        type: item.type,
        title: item.title,
        content: item.content || '',
        area: item.area,
        latitude: item.latitude || 0,
        longitude: item.longitude || 0,
        contact: item.contact,
        images: typeof item.images === 'string' ? item.images : JSON.stringify(item.images || [])
      })
      // 更新本地状态
      const list = this.data.list.map((it) =>
        it.id === id ? { ...it, status: 1, statusInfo: POST_STATUS_MAP[1] } : it
      )
      this.setData({ list })
      wx.showToast({ title: '已重新提交，待审核', icon: 'success' })
    } catch (err) {
      if (err && err.code === 401) {
        wx.navigateTo({ url: '/pages/login/login' })
      }
    }
  }
})
