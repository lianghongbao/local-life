// pages/webview/webview.js
// 兜底外链跳转页，url 通过 wx.setStorageSync('webview_url', url) 传入
Page({
  data: { url: '' },
  onLoad() {
    this.setData({ url: wx.getStorageSync('webview_url') || '' })
  }
})
