// utils/comment.js
// 评论 6 个 API 封装;统一走 utils/api.js 的 request
//
// 不能在模块顶层 `const { request } = require('./api.js')`:
//   utils/api.js 顶层又 require 本文件,形成循环 require。
//   CommonJS 循环 require 时,顶层解构拿到的是对方"还没执行完的部分导出"{},
//   → `request` 解析为 undefined → 调用即抛 TypeError。
// 改为函数体内 lazy require,此时 require 缓存命中,api.js 已执行完。

const commentApi = {
  // 1. 拉一级评论 + 每条 top 3 子回复
  list(postId, opts = {}) {
    const { request } = require('./api.js')
    return request({
      url: `/api/v1/posts/${postId}/comments`,
      method: 'GET',
      data: { cursor: opts.cursor || '', limit: opts.limit || 20, sort: opts.sort || 'time' },
      auth: false,  // 公开接口,JWT 由后端决定 is_liked
    })
  },
  // 2. 拉某 root 下的全部回复
  replies(postId, rootId, opts = {}) {
    const { request } = require('./api.js')
    return request({
      url: `/api/v1/posts/${postId}/comments/${rootId}/replies`,
      method: 'GET',
      data: { cursor: opts.cursor || '', limit: opts.limit || 20 },
      auth: false,
    })
  },
  // 3. 发评论 / 回复
  create(postId, payload) {
    const { request } = require('./api.js')
    const { content, parent_id = 0 } = payload || {}
    return request({
      url: `/api/v1/posts/${postId}/comments`,
      method: 'POST',
      data: { parent_id, content },
      auth: true,
    })
  },
  // 4. 删除(作者自删 / admin 强删共用)
  delete(postId, commentId) {
    const { request } = require('./api.js')
    return request({
      url: `/api/v1/posts/${postId}/comments/${commentId}`,
      method: 'DELETE',
      auth: true,
    })
  },
  // 5. 点赞 toggle
  like(postId, commentId) {
    const { request } = require('./api.js')
    return request({
      url: `/api/v1/posts/${postId}/comments/${commentId}/like`,
      method: 'POST',
      auth: true,
    })
  },
  // 6. 举报
  report(postId, commentId, reason, description = '') {
    const { request } = require('./api.js')
    return request({
      url: `/api/v1/posts/${postId}/comments/${commentId}/report`,
      method: 'POST',
      data: { reason, description },
      auth: true,
    })
  },
}

module.exports = { commentApi }
