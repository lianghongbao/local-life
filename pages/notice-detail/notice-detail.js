// pages/notice-detail/notice-detail.js
const { noticeApi } = require('../../utils/api.js')
const { formatTime } = require('../../utils/util.js')

Page({
  data: {
    item: null,
    loading: true
  },

  onLoad(query) {
    this.loadDetail(query.id)
  },

  async loadDetail(id) {
    this.setData({ loading: true })
    try {
      const it = await noticeApi.detail(id)
      this.setData({ item: { ...it, timeText: formatTime(it.created_at) } })
    } catch (e) {
      // toast
    } finally {
      this.setData({ loading: false })
    }
  }
})
