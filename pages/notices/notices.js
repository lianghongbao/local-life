// pages/notices/notices.js
const { noticeApi } = require('../../utils/api.js')
const { formatTime } = require('../../utils/util.js')

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
      const res = (await noticeApi.list(page, this.data.pageSize, {
        silent: reset && page === 1
      })) || { list: [], total: 0 }
      const list = (res.list || []).map((it) => ({
        ...it,
        timeText: formatTime(it.created_at)
      }))
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
    wx.navigateTo({ url: `/pages/notice-detail/notice-detail?id=${id}` })
  }
})
