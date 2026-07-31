// pages/home/home.js
// 首页：公告 + 轮播 + 4 类目入口 + 本地推荐（本地小店 + 用户发帖混合流）
// 启动策略：缓存优先 → 骨架屏 → 静默刷新
const { request } = require('../../utils/api.js')
const { parseImages, defaultImg } = require('../../utils/util.js')
const { POST_TYPE_MAP, HIDDEN_POST_TYPE_IDS } = require('../../utils/constants.js')

// 首页 4 项快速入口显式顺序表(锁住产品决策,不依赖 POST_TYPES 数组顺序)
// 当前:1二手 / 2租房 / 4求助 / 9其他
const HOME_QUICK_ENTRY_IDS = [1, 2, 4, 9]

// 首页 4 项入口对应圆圈背景色
const HOME_QUICK_ENTRY_COLORS = {
  1: '#F4A78F', // 二手
  2: '#C8A24C', // 租房
  4: '#B085C4', // 求助
  9: '#7BA88E'  // 其他(沿用原招聘颜色)
}

// 运行时构建首页 4 个入口(过滤掉 HIDDEN_POST_TYPE_IDS 黑名单)
function buildQuickEntries() {
  return HOME_QUICK_ENTRY_IDS
    .filter(id => !HIDDEN_POST_TYPE_IDS.includes(id))
    .map(id => {
      const t = POST_TYPE_MAP[id]
      return {
        id: t.id,
        name: t.name,
        emoji: t.emoji,
        color: HOME_QUICK_ENTRY_COLORS[id],
        url: `/pages/posts/posts?type=${t.id}`
      }
    })
}

const HOME_CACHE_KEY = 'lhb_home_cache' // 老的(notices+banners+精选商家)
const HOME_CACHE_TTL = 5 * 60 * 1000 // 5 分钟

Page({
  data: {
    loading: true,
    /** 骨架屏：缓存命中时跳过，首次/过期才显示 */
    showSkeleton: true,
    notices: [],
    banners: [],
    // 本地推荐混合流(已分流到两列)
    feedLeft: [],
    feedRight: [],
    feedLoading: false,
    feedFinished: false,
    feedPage: 1,
    feedPageSize: 12,
    areaAdcode: '',
    cityAdcode: '',
    quickEntries: []
  },

  onLoad() {
    // 构建首页 4 个快速入口(运行时从 POST_TYPES 过滤,招聘 type=3 已被黑名单过滤)
    this.setData({ quickEntries: buildQuickEntries() })
    // 启动时尝试读 storage 里的 adcode,首次进入也能按区推荐
    try {
      const cached = wx.getStorageSync('userLocation')
      if (cached && cached.city_adcode) {
        this.setData({ cityAdcode: cached.city_adcode })
      } else if (cached && cached.area_adcode) {
        this.setData({ areaAdcode: cached.area_adcode })
      }
    } catch (_) {}
    this._loadWithCache()
  },

  onShow() {
    // 从 tabBar 切回来:缓存还新鲜就跳过,否则静默刷新
    if (this._hasLoaded) {
      const cached = this._readCache()
      if (!cached) this.loadHome(true)
    }
  },

  onPullDownRefresh() {
    this.loadHome(false).finally(() => wx.stopPullDownRefresh())
  },

  onReachBottom() {
    // 无限下滑:触底加载下一页
    if (this.data.feedLoading || this.data.feedFinished) return
    this.loadFeed(false)
  },

  /**
   * 缓存优先加载:命中缓存直接渲染,后台静默刷新
   */
  _loadWithCache() {
    const cached = this._readCache()
    if (cached) {
      // 缓存命中:秒渲染,跳过骨架屏,后台再刷一次
      this._applyData(cached)
      this.setData({ loading: false, showSkeleton: false })
      this._hasLoaded = true
      // 后台静默刷新(不阻塞 UI)
      this.loadHome(true)
    } else {
      // 无缓存:展示骨架屏,等网络返回
      this.setData({ showSkeleton: true })
      this.loadHome(true)
    }
  },

  /**
   * 读首页基础数据本地缓存(notices+banners),过期返回 null
   */
  _readCache() {
    try {
      const raw = wx.getStorageSync(HOME_CACHE_KEY)
      if (raw && raw.data && raw.ts && Date.now() - raw.ts < HOME_CACHE_TTL) {
        return raw.data
      }
    } catch (_) {}
    return null
  },

  /**
   * 写首页基础数据缓存
   */
  _writeCache(data) {
    try {
      wx.setStorageSync(HOME_CACHE_KEY, { data, ts: Date.now() })
    } catch (_) {}
  },

  /**
   /**
   * 将 API 数据渲染到页面(抽成独立方法,缓存和网络共用)
   */
  _applyData(data) {
    const banners = (data.banners || []).map((b) => ({
      ...b,
      image: b.image || defaultImg()
    }))
    // 仅更新公告 + 轮播;推荐区交给 loadFeed() 用 /home/feed 接管
    // (老 schema 的 data.shops 不再渲染,避免和混合流重复)
    this.setData({
      notices: data.notices || [],
      banners
    })
  },

  /**
   * 把 list 分流到左右两列(估算高度,奇偶交替分配)
   * 同尺寸双列:左右交替放,视觉上"混合感"最强
   */
  _splitFeed(items) {
    if (!items || !items.length) return { feedLeft: [], feedRight: [] }
    const left = []
    const right = []
    items.forEach((it, i) => {
      if (i % 2 === 0) {
        left.push(it)
      } else {
        right.push(it)
      }
    })
    return { feedLeft: left, feedRight: right }
  },

  async loadHome(silent = false) {
    this.setData({ loading: true })
    try {
      const params = {}
      if (this.data.cityAdcode) {
        params.city_adcode = this.data.cityAdcode
      } else if (this.data.areaAdcode) {
        params.area_adcode = this.data.areaAdcode
      }
      const data = (await request({
        url: '/api/v1/home',
        data: params,
        auth: false,
        silent: !!silent
      })) || {}
      this._applyData(data)
      this._writeCache(data)
      this._hasLoaded = true
    } catch (e) {
    } finally {
      this.setData({ loading: false, showSkeleton: false })
    }

    // 同时加载混合流(page=1)
    this.loadFeed(true)
  },

  /**
   * 加载混合流
   * @param {boolean} reset true=重置 page=1(下拉刷新/首次),false=下一页
   */
  async loadFeed(reset = false) {
    if (this.data.feedLoading) return
    this.setData({ feedLoading: true })

    const page = reset ? 1 : this.data.feedPage

    await this._fetchFeed(page, reset)
  },

  async _fetchFeed(page, reset) {
    try {
      const data = {}
      if (this.data.cityAdcode) {
        data.city_adcode = this.data.cityAdcode
      } else if (this.data.areaAdcode) {
        data.area_adcode = this.data.areaAdcode
      }
      const res = (await request({
        url: '/api/v1/home/feed',
        data: { ...data, page, page_size: this.data.feedPageSize },
        auth: false,
        silent: !reset // 仅首页首次失败才弹 toast
      })) || { list: [], has_more: false }

      const items = (res.list || []).map((it) => this.formatFeedItem(it))
      const newLeft = reset ? [] : this.data.feedLeft
      const newRight = reset ? [] : this.data.feedRight

      // 分流
      const leftAdd = []
      const rightAdd = []
      items.forEach((it, i) => {
        // 接续已有列奇偶:让左右总量平衡
        const baseIdx = (reset ? 0 : newLeft.length + newRight.length)
        if ((baseIdx + i) % 2 === 0) {
          leftAdd.push(it)
        } else {
          rightAdd.push(it)
        }
      })

      this.setData({
        feedLeft: newLeft.concat(leftAdd),
        feedRight: newRight.concat(rightAdd),
        feedPage: page + 1,
        feedFinished: !res.has_more,
        feedLoading: false
      })
    } catch (e) {
      this.setData({ feedLoading: false })
    }
  },

  /**
   * 把后端 HomeFeedItem 标准化成前端渲染数据
   * 按 type 字段分发:shop 走 formatShop 风格,post 走 formatPost 风格
   */
  formatFeedItem(it) {
    if (it.type === 'shop') {
      return this.formatShopFromFeed(it)
    }
    return this.formatPostFromFeed(it)
  },

  formatShopFromFeed(it) {
    // 后端已返回完整 OSS URL,无需再 parseImages
    return {
      ...it,
      // 渲染层统一用 _feedType 区分
      _feedType: 'shop',
      id: it.shop_id,
      cover: it.shop_cover || defaultImg(),
      catEmoji: it.shop_cat_emoji || '🌿',
      catName: it.shop_cat_name || '',
      name: it.shop_name || '',
      view_count: it.shop_view_count || 0,
      address: it.shop_address || '',
      nickname: it.shop_nickname || ''
    }
  },

  formatPostFromFeed(it) {
    return {
      ...it,
      _feedType: 'post',
      id: it.post_id,
      cover: it.post_cover || '',
      // 帖子卡片不带地址(节省高度),只显示标题 + 类型 + 浏览
      title: it.post_title || '',
      typeEmoji: it.post_type_emoji || '🌿',
      typeName: it.post_type_name || '',
      view_count: it.post_view_count || 0,
      nickname: it.post_nickname || '',
      comment_count: it.post_comment_count || 0
    }
  },

  // 兼容老 HomeIndex 返回的 ShopItem
  formatShop(s) {
    const imgs = parseImages(s.images)
    return {
      ...s,
      _feedType: 'shop',
      cover: imgs[0] || defaultImg(),
      desc: (s.description || '').slice(0, 40),
      catEmoji: this._inferShopCatEmoji(s.category),
      catName: s.name || '',
      view_count: s.view_count || 0
    }
  },

  _inferShopCatEmoji(category) {
    const map = { 1: '🧹', 2: '🔧', 3: '🔑', 4: '📦', 5: '🏃', 6: '💇', 7: '📚', 8: '🍜', 9: '🌿' }
    return map[category] || '🌿'
  },

  onLocationChange(e) {
    const cityAdcode = (e && e.detail && e.detail.areaAdcode) || ''
    if (cityAdcode === this.data.cityAdcode) return
    this.setData({ cityAdcode })
    // 切换定位后强制刷新首页推荐(按同城)+ 混合流
    this.loadHome(true)
  },

  onNoticeTap(e) {
    const id = e.currentTarget.dataset.id
    wx.navigateTo({ url: `/pages/notice-detail/notice-detail?id=${id}` })
  },

  onSeeAllNotices() {
    wx.navigateTo({ url: '/pages/notices/notices' })
  },

  onBannerTap(e) {
    const { jump_type, jump_target } = e.currentTarget.dataset
    // jump_type: 0无 1公告 2商家 3信息 4外部链接（与后台一致）
    if (jump_type === 1 && jump_target) {
      wx.navigateTo({ url: `/pages/notice-detail/notice-detail?id=${jump_target}` })
    } else if (jump_type === 2 && jump_target) {
      wx.navigateTo({ url: `/pages/shop-detail/shop-detail?id=${jump_target}` })
    } else if (jump_type === 3 && jump_target) {
      wx.navigateTo({ url: `/pages/post-detail/post-detail?id=${jump_target}` })
    } else if (jump_type === 4 && jump_target) {
      wx.setStorageSync('webview_url', jump_target)
      wx.navigateTo({ url: '/pages/webview/webview' })
    }
  },

  onQuickEntry(e) {
    const { url } = e.currentTarget.dataset
    // tabBar 页无法 navigateTo,改用 switchTab + globalData 传参
    // url 格式: /pages/posts/posts?type=1
    const match = url.match(/^\/pages\/(\w+)\/\w+\?type=(\d+)$/)
    if (match) {
      const page = match[1] // posts
      const type = parseInt(match[2], 10)
      getApp().globalData._pendingPostType = type
      wx.switchTab({ url: `/pages/${page}/${page}` })
    } else {
      wx.navigateTo({ url })
    }
  },

  /**
   * 混合流卡片点击:按 _feedType 分发
   */
  onFeedTap(e) {
    const { type, id } = e.currentTarget.dataset
    if (type === 'shop') {
      wx.navigateTo({ url: `/pages/shop-detail/shop-detail?id=${id}` })
    } else if (type === 'post') {
      wx.navigateTo({ url: `/pages/post-detail/post-detail?id=${id}` })
    }
  },

  onPublishPost() {
    if (getApp().requireLogin()) {
      wx.navigateTo({ url: '/pages/login/login' })
      return
    }
    wx.navigateTo({ url: '/pages/post-create/post-create' })
  },

  onShopIn() {
    if (getApp().requireLogin()) {
      wx.navigateTo({ url: '/pages/login/login' })
      return
    }
    wx.navigateTo({ url: '/pages/shop-create/shop-create' })
  }
})