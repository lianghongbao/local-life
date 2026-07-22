// pages/post-detail/post-detail.js
const { postApi, userApi, commentApi, getStoredUser } = require('../../utils/api.js')
const { POST_TYPE_MAP, POST_STATUS_MAP } = require('../../utils/constants.js')
const { parseImages, defaultImg, formatTime } = require('../../utils/util.js')
const { TENCENT_MAP_KEY } = require('../../utils/config.js')

Page({
  data: {
    id: null,
    item: null,
    images: [],
    loading: true,
    // ===== 评论 =====
    commentCount: 0,
    commentExpanded: false,
    comments: [],
    commentLoading: false,
    commentHasMore: false,
    commentCursor: '',
    replyTarget: null,
    commentInput: '',
    commentInputSending: false,
  },

  onLoad(query) {
    const from = query.from || 'public'
    this.setData({ id: query.id, from })
    this.loadDetail(query.id, from)
  },

  async loadDetail(id, from) {
    this.setData({ loading: true })
    try {
      // 入口决定接口：
      //   - mine  → 带 JWT 的作者详情（可查看自己非公开状态）
      //   - 其他 → 公开详情（未登录用户也能看已发布帖子）
      const it = from === 'mine'
        ? await userApi.myPostDetail(id)
        : await postApi.detail(id)
      const t = POST_TYPE_MAP[it.type] || { name: '', emoji: '📌' }
      const images = parseImages(it.images)
      const statusInfo = POST_STATUS_MAP[it.status] || { name: '', color: '#999' }

      // 地图 marker 已废弃:详情页不再内嵌 <map> 原生组件（Android touchmove 拦截问题）,
      // 改为腾讯静态图 API 真实地图缩略图 + 暖色遮罩,位置信息通过 wx.openLocation 跳转微信原生地图展示。

      // 拼腾讯静态图 URL(按 lat/lng 渲染)
      const mapStaticUrl = it.latitude && it.longitude
        ? `https://apis.map.qq.com/ws/staticmap/v2?center=${it.latitude},${it.longitude}&zoom=16&size=600x300&key=${TENCENT_MAP_KEY}&format=png`
        : ''

      this.setData({
        item: {
          ...it,
          typeName: t.name,
          typeEmoji: t.emoji,
          statusInfo,
          timeText: formatTime(it.created_at),
          mapStaticUrl,
        },
        images,
        commentCount: it.comment_count || 0,
      })
    } catch (e) {
      // 已 toast
    } finally {
      this.setData({ loading: false })
    }
  },

  /**
   * 预览图片
   */
  onPreview(e) {
    const idx = e.currentTarget.dataset.idx
    if (!this.data.images.length) return
    wx.previewImage({
      current: this.data.images[idx],
      urls: this.data.images
    })
  },

  /**
   * 联系（复制联系方式到剪贴板）
   */
  onContact() {
    const { contact } = this.data.item || {}
    if (!contact) return
    wx.setClipboardData({
      data: contact,
      success: () => wx.showToast({ title: '已复制联系方式' })
    })
  },

  /**
   * 打开地图查看位置
   *   - 复用信息行 + 地图区两个入口,都用同一个 handler
   *   - 没有经纬度时(发布时未填位置)走 toast 降级,避免 wx.openLocation 报 invalid coord
   *   - wx.openLocation 走微信原生地图界面,用户可"导航/收藏/分享",不需要自建地图
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
      name: it.title || it.area || '信息位置',
      address: it.area || '',
      scale: 16,
    })
  },

  // ========== 评论 ==========

  async toggleExpand() {
    const next = !this.data.commentExpanded
    this.setData({ commentExpanded: next })
    if (next && this.data.comments.length === 0) {
      await this.loadComments()
    }
  },

  async loadComments() {
    if (this.data.commentLoading) return
    if (!this.data.commentHasMore && this.data.comments.length > 0) return
    this.setData({ commentLoading: true })
    try {
      const resp = await commentApi.list(this.data.id, {
        cursor: this.data.commentCursor,
        limit: 20,
      })
      this.setData({
        comments: (this.data.comments || []).concat(resp.items || []),
        commentHasMore: !!resp.has_more,
        commentCursor: resp.next_cursor || '',
      })
    } catch (e) {
      // toast 已统一处理
    } finally {
      this.setData({ commentLoading: false })
    }
  },

  onInputChange(e) {
    this.setData({ commentInput: e.detail.value })
  },

  async onSendComment() {
    // 未登录先去登录页(发评论是写操作)
    if (getApp().requireLogin()) {
      wx.navigateTo({ url: '/pages/login/login' })
      return
    }
    const text = (this.data.commentInput || '').trim()
    if (!text || this.data.commentInputSending) return
    this.setData({ commentInputSending: true })
    let resp
    try {
      resp = await commentApi.create(this.data.id, {
        content: text,
        parent_id: this.data.replyTarget ? this.data.replyTarget.id : 0,
      })
      const item = resp && resp.item
      if (!item) {
        throw { msg: '评论提交失败，请稍后重试' }
      }

      if (item.parent_id === 0) {
        this.setData({
          comments: [item].concat(this.data.comments),
          commentInput: '',
          replyTarget: null,
          commentCount: this.data.commentCount + 1,
        })
        return
      }

      const comments = this.data.comments.map((comment) => {
        if (comment.id !== item.parent_id) return comment
        const replies = (comment.top_replies || []).concat([item]).slice(-3)
        return {
          ...comment,
          top_replies: replies,
          reply_count: (comment.reply_count || 0) + 1,
          has_more_replies: comment.has_more_replies || replies.length >= 3,
        }
      })
      this.setData({ comments, commentInput: '', replyTarget: null })
    } catch (err) {
      // 401 跳登录页(api.js 已经清 token + toast,这里再主动 navigateTo)
      if (err && err.code === 401) {
        wx.navigateTo({ url: '/pages/login/login' })
        return
      }
      const message = err && err.msg ? err.msg : '评论提交失败，请稍后重试'
      wx.showToast({ title: message, icon: 'none' })
    } finally {
      this.setData({ commentInputSending: false })
    }
  },

  onReplyTap(e) {
    const { commentId, name } = e.currentTarget.dataset
    this.setData({ replyTarget: { id: commentId, name } })
  },

  onCancelReply() {
    this.setData({ replyTarget: null })
  },

  onLikeTap(e) {
    // 未登录先去登录页(点赞是写操作,后端会 401)
    if (getApp().requireLogin()) {
      wx.navigateTo({ url: '/pages/login/login' })
      return
    }
    const { commentId, parentId } = e.currentTarget.dataset
    const target = parentId
      ? this.findChildById(this.data.comments, commentId)
      : this.data.comments.find(c => c.id === commentId)
    if (!target) return
    // 乐观更新
    target.is_liked = !target.is_liked
    target.like_count += target.is_liked ? 1 : -1
    this.setData({ comments: this.data.comments.slice() })
    commentApi.like(this.data.id, commentId).then((resp) => {
      target.like_count = resp.like_count
      target.is_liked = resp.liked
      this.setData({ comments: this.data.comments.slice() })
    }).catch((e) => {
      target.is_liked = !target.is_liked
      target.like_count += target.is_liked ? 1 : -1
      this.setData({ comments: this.data.comments.slice() })
      // 401 跳登录页(此时已清 token);其他业务错 api.js 已 toast
      if (e && e.code === 401) {
        wx.navigateTo({ url: '/pages/login/login' })
      }
    })
  },

  onMoreTap(e) {
    const { action } = e.currentTarget.dataset
    if (action === 'more') {
      const { commentId, parentId } = e.currentTarget.dataset
      const isChild = !!parentId
      const target = isChild
        ? this.findChildById(this.data.comments, commentId)
        : this.data.comments.find(c => c.id === commentId)
      // 按作者身份动态生成菜单:
      //   - 不是自己 → 只显示「复制 + 举报」(不能删别人的评论)
      //   - 是自己   → 显示「复制 + 删除」(举报自己的评论没意义)
      // 避免非作者点删除触发后端 403 + api.js 误清 token + catch 又跳登录页
      const me = getStoredUser()
      const myOpenid = me && me.openid
      const isMine = target && target.author && target.author.id === myOpenid
      const itemList = isMine ? ['复制', '删除'] : ['复制', '举报']
      const handlers = isMine
        ? [() => this.copyComment(commentId, parentId), () => this.confirmDelete(commentId, parentId)]
        : [() => this.copyComment(commentId, parentId), () => this.reportComment(commentId)]
      wx.showActionSheet({
        itemList,
        success: (r) => {
          const fn = handlers[r.tapIndex]
          if (fn) fn()
        },
      })
    }
  },

  copyComment(commentId, parentId) {
    const t = parentId
      ? this.findChildById(this.data.comments, commentId)
      : this.data.comments.find(c => c.id === commentId)
    if (t) wx.setClipboardData({ data: t.content })
  },

  reportComment(commentId) {
    // 未登录先去登录页(举报是写操作)
    if (getApp().requireLogin()) {
      wx.navigateTo({ url: '/pages/login/login' })
      return
    }
    wx.showActionSheet({
      itemList: ['垃圾广告', '辱骂攻击', '违法违规', '其他'],
      success: (r) => {
        const reasons = ['spam', 'abuse', 'illegal', 'other']
        const reason = reasons[r.tapIndex] || 'other'
        commentApi.report(this.data.id, commentId, reason).then((resp) => {
          if (resp.already_reported) wx.showToast({ title: '已举报', icon: 'none' })
          else wx.showToast({ title: '举报已提交' })
        }).catch((e) => {
          // 401 跳登录页;其他业务错 api.js 已 toast
          if (e && e.code === 401) {
            wx.navigateTo({ url: '/pages/login/login' })
          }
        })
      },
    })
  },

  confirmDelete(commentId, parentId) {
    // 未登录先去登录页,避免 401 弹"服务异常"
    if (getApp().requireLogin()) {
      wx.navigateTo({ url: '/pages/login/login' })
      return
    }
    wx.showModal({
      title: '确认删除',
      content: '删除后无法恢复',
      success: (r) => {
        if (r.confirm) {
          commentApi.delete(this.data.id, commentId).then(() => {
            const t = parentId
              ? this.findChildById(this.data.comments, commentId)
              : this.data.comments.find(c => c.id === commentId)
            if (t) {
              t.status = 2
              t.content = ''
              // 子回复被删,前端预先递减父级 reply_count(后端也会同步 -1)
              if (parentId) {
                const parent = this.data.comments.find(c => c.id === parentId)
                if (parent && parent.reply_count > 0) parent.reply_count -= 1
              }
              this.setData({ comments: this.data.comments.slice() })
            }
          }).catch((e) => {
            // 401 = 未登录(api.js 已经清 token + toast) → 跳登录页
            // 403 = 已登录但无权限(不该走到这里:onMoreTap 已按作者过滤了删除项)
            //      api.js 在 403 也会 clearAuth,这是 api.js 的过激策略;
            //      这里只 toast,不主动跳登录页,避免清掉刚登录成功的 token。
            if (e && e.code === 401) {
              wx.navigateTo({ url: '/pages/login/login' })
            }
            // 其他业务错(api.js 已经 toast 了)不重复弹
          })
        }
      },
    })
  },

  findChildById(list, id) {
    for (const c of list) {
      if (c.id === id) return c
      for (const sub of (c.top_replies || [])) {
        if (sub.id === id) return sub
      }
    }
    return null
  },

  async onLoadReplies(e) {
    const { rootId } = e.currentTarget.dataset
    // 二次拉子回复
    commentApi.replies(this.data.id, rootId, { limit: 50 }).then((resp) => {
      const comments = this.data.comments.slice()
      const parent = comments.find(c => c.id === rootId)
      if (parent) {
        parent.top_replies = resp.items || []
        parent.has_more_replies = false
        parent.total_replies = (resp.items || []).length
        this.setData({ comments })
      }
    })
  },

  /**
   * 评论头像 URL 加载失败 → 把 author.avatar 置空,
   * wxml 的 || fallback 会自动切到全站 cat avatar (永不失效的 OSS 静态图)。
   * 用空字符串 '' 作为"已尝试过失败"的标记,后续 binderror 不会再触发。
   */
  onCommentAvatarError(e) {
    const idx = e.currentTarget.dataset.idx
    if (idx == null) return
    const comments = this.data.comments.slice()
    const target = comments[idx]
    if (!target || !target.author || target.author.avatar === '') return
    target.author = { ...target.author, avatar: '' }
    this.setData({ comments })
  },

  onShareAppMessage() {
    const it = this.data.item
    return {
      title: it ? it.title : '小城便利贴',
      path: `/pages/post-detail/post-detail?id=${this.data.id}`
    }
  }

  // 详情页为纯阅读页：编辑、重新上架、下架等操作入口全部放在「我的发布」列表卡片。
  // 这里不挂 onEdit / onResubmit / onDelete。
})
