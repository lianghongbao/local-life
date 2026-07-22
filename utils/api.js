// utils/api.js
// 统一 API 客户端
// 封装 wx.request：token 注入、统一响应、业务错误弹窗、详细 console 日志

const { BASE_URL } = require('../config/index.js')
const { commentApi } = require('./comment.js')

const TOKEN_KEY = 'lhb_token'
const USER_KEY = 'lhb_user'

function getToken() {
  return wx.getStorageSync(TOKEN_KEY) || ''
}

function setToken(token) {
  wx.setStorageSync(TOKEN_KEY, token)
}

function getStoredUser() {
  const raw = wx.getStorageSync(USER_KEY)
  if (!raw) return null
  // CDN 模式下 avatar 是永久 URL,直接渲染;不再做"已签 URL 1h 过期"的迁移
  return raw
}

// 缓存的 user 对象:
//   - nickname: 昵称(永久)
//   - avatar: 访问 URL(直接渲染,无需签名)
//   - avatar_file_key: OSS 文件 key(永久, 用于 dirty 比较和重传)
function setStoredUser(user) {
  if (!user) {
    wx.removeStorageSync(USER_KEY)
    return
  }
  // 合并而非覆盖:profile 响应不返 openid/unionid,如果用 user.openid || '' 会把 login 时
  // 已经写入的非空 openid 覆盖成空串,导致后续 getStoredUser().openid === '' →
  // "我发的评论" 判断 (target.author.id === myOpenid) 永远 false。
  // 保留已有字段,profile 缺什么就保留什么。
  const prev = wx.getStorageSync(USER_KEY) || {}
  const safe = {
    user_id: user.user_id || user.id || prev.user_id || '',
    openid: user.openid || prev.openid || '',
    unionid: user.unionid || prev.unionid || '',
    nickname: user.nickname || prev.nickname || '',
    avatar: user.avatar || prev.avatar || '',
    avatar_file_key: user.avatar_file_key || prev.avatar_file_key || ''
  }
  wx.setStorageSync(USER_KEY, safe)
}

function clearAuth() {
  wx.removeStorageSync(TOKEN_KEY)
  wx.removeStorageSync(USER_KEY)
}

/**
 * 统一请求
 * @param {object} opts
 * @param {string} opts.url  不含 baseURL，相对路径如 '/api/v1/login'
 * @param {string} opts.method GET/POST/PUT/DELETE
 * @param {object} opts.data body 或 query
 * @param {boolean} opts.auth 是否需要 token，默认 true
 * @param {boolean} opts.silent 失败时是否不弹 toast
 * @param {number} opts.timeout 超时 ms
 * @returns {Promise<any>} 后端的 data 字段
 */
function request(opts) {
  const {
    url,
    method = 'GET',
    data = {},
    auth = true,
    silent = false,
    timeout = 15000
  } = opts

  // 请求日志:开 tag [api] 一眼能筛,带耗时方便排查慢请求
  const tag = '[api]'
  const logKey = `${method} ${url}`
  const start = Date.now()
  console.log(`${tag} → ${logKey}`, { auth, hasToken: !!getToken(), data })

  return new Promise((resolve, reject) => {
    try {
      const header = { 'Content-Type': 'application/json' }
      if (auth) {
        const token = getToken()
        if (token) header.Authorization = 'Bearer ' + token
      }

      const fullURL = BASE_URL + url

      wx.request({
        url: fullURL,
        method,
        data,
        header,
        timeout,
        success(res) {
        const cost = Date.now() - start
        const body = res.data || {}

        // HTTP 状态码检查
        if (res.statusCode !== 200) {
          console.warn(`${tag} ✗ ${logKey} HTTP=${res.statusCode} cost=${cost}ms`, body)
          const message = body && body.msg ? body.msg : `服务异常 (${res.statusCode})`
          if (!silent) {
            wx.showToast({ title: message, icon: 'none' })
          }
          reject({ code: res.statusCode, msg: message, statusCode: res.statusCode })
          return
        }

        // 统一信封: {code:0, msg:"ok", data:{...}} (后端用 zeromicro/x 包装)
        if (body && typeof body.code === 'number') {
          // 成功
          if (body.code === 0) {
            console.log(`${tag} ✓ ${logKey} code=0 cost=${cost}ms`, body)
            resolve(body.data)
            return
          }
          // 401/403 token 失效
          //   silent 模式（启动静默校验/登录后立即拉 profile）: 只标记 needLogin,不清 token
          //     - 避免"刚登录 → 立即 profile → 401 → 清 token → 又跳登录页"的死循环
          //   非 silent: 清 token + 弹 toast,引导用户重新登录
          if (body.code === 401 || body.code === 403) {
            console.warn(`${tag} ✗ ${logKey} code=${body.code} cost=${cost}ms (auth)`, body)
            if (!silent) {
              clearAuth()
              wx.showToast({ title: '请先登录', icon: 'none' })
            }
            getApp() && getApp().globalData && (getApp().globalData.needLogin = true)
            reject(body)
            return
          }
          // 业务错
          console.warn(`${tag} ✗ ${logKey} code=${body.code} cost=${cost}ms (biz)`, body)
          if (!silent) {
            wx.showToast({ title: body.msg || '请求失败', icon: 'none' })
          }
          reject(body)
          return
        }

        // 兜底：非信封响应（不应该出现）
        console.log(`${tag} ✓ ${logKey} no-envelope cost=${cost}ms`, body)
        resolve(body)
      },
      fail(err) {
        const cost = Date.now() - start
        console.error(`${tag} ✗ ${logKey} fail cost=${cost}ms`, err)
        // err.errMsg 常见值：
        //   "request:fail url not in domain list"  → 后端地址未加入 request 合法域名
        //   "request:fail timeout"                 → 超时
        //   "request:fail "                        → 网络不通
        let hint = '网络异常'
        if (err && err.errMsg) {
          if (err.errMsg.includes('url not in domain list')) {
            hint = '请在开发者工具勾选"不校验合法域名"'
          } else if (err.errMsg.includes('timeout')) {
            hint = '请求超时'
          } else if (err.errMsg.includes('connect')) {
            hint = '无法连接服务器'
          }
        }
        if (!silent) wx.showToast({ title: hint, icon: 'none' })
        reject(err)
      }
    })
    } catch (e) {
      console.error(`${tag} ✗ ${logKey} exception`, e)
      reject({ code: -1, msg: (e && e.message) || '请求初始化失败' })
    }
  })
}

// ==================== 用户模块 ====================
const userApi = {
  // 微信登录:前端拿 code 走后端换 token
  // 响应里 { token, user_id, openid, unionid } 一并存到 storage
  //   - openid/unionid 用于问题排查时提供给运维(不用翻 DB)
  //   - 业务层不要直接用 openid 当业务主键,统一用 user_id
  async login(code) {
    const data = await request({
      url: '/api/v1/login',
      method: 'POST',
      data: { code },
      auth: false
    })
    if (data && data.token) {
      setToken(data.token)
      setStoredUser({
        user_id: data.user_id,
        openid: data.openid || '',
        unionid: data.unionid || ''
      })
    }
    return data
  },

  // 用户资料
  //   opts.silent=true 时，401 不弹 toast（用于启动时静默校验登录态）
  profile(opts = {}) {
    return request({ url: '/api/v1/user/profile', silent: !!opts.silent })
  },

  // 更新资料（昵称 + 头像 file_key，均为可选部分更新）
  updateProfile(payload) {
    return request({
      url: '/api/v1/user/profile',
      method: 'POST',
      data: payload
    })
  },

  // 我的发布
  myPosts(page = 1, pageSize = 10, opts = {}) {
    return request({
      url: '/api/v1/user/posts',
      data: { page, page_size: pageSize },
      silent: !!opts.silent
    })
  },

  // 我的发布详情（带认证，允许作者查看非公开状态）
  myPostDetail(id, opts = {}) {
    return request({
      url: `/api/v1/user/posts/${id}`,
      silent: !!opts.silent
    })
  },

  // 我的商家
  myShops(page = 1, pageSize = 10, opts = {}) {
    return request({
      url: '/api/v1/user/shops',
      data: { page, page_size: pageSize },
      silent: !!opts.silent
    })
  },

  // 下架发布
  updatePost(id, payload) {
    return request({
      url: `/api/v1/posts/${id}`,
      method: 'PUT',
      data: payload
    })
  },

  offlinePost(id) {
    return request({
      url: `/api/v1/posts/${id}/offline`,
      method: 'PUT'
    })
  },

  // 下架发布(等同于对作者本人可见性删除)
  deletePost(id) {
    return request({
      url: `/api/v1/posts/${id}/offline`,
      method: 'PUT'
    })
  }
}

// ==================== 首页 ====================
const homeApi = {
  // silent: true → 失败不弹 toast（首页允许空白/重试，不打扰用户）
  index(opts = {}) {
    return request({ url: '/api/v1/home', auth: false, silent: !!opts.silent })
  },
  // 首页本地推荐混合流（本地小店 + 用户发帖,view_count × 时间衰减加权）
  // opts.silent: 失败不弹 toast（首页允许空白/重试）
  // opts.page: 页码(默认 1)
  // opts.page_size: 每页条数(默认 12)
  // opts.area_adcode / opts.city_adcode: 同城/同区过滤
  feed(opts = {}) {
    const { page = 1, page_size = 12, area_adcode = '', city_adcode = '', silent } = opts
    const data = { page, page_size }
    if (area_adcode) data.area_adcode = area_adcode
    if (city_adcode) data.city_adcode = city_adcode
    return request({
      url: '/api/v1/home/feed',
      data,
      auth: false,
      silent: !!silent
    })
  }
}

// ==================== 信息分类 ====================
const postApi = {
  list(opts = {}) {
    const { type = 0, page = 1, page_size = 10, silent } = opts
    return request({
      url: '/api/v1/posts',
      data: { type, page, page_size },
      auth: false,
      silent
    })
  },
  detail(id, opts = {}) {
    return request({ url: `/api/v1/posts/${id}`, silent: !!opts.silent })
  },
  create(payload) {
    return request({
      url: '/api/v1/posts',
      method: 'POST',
      data: payload
    })
  },
  updatePost(id, payload) {
    return request({
      url: `/api/v1/posts/${id}`,
      method: 'PUT',
      data: payload
    })
  }
}

// ==================== 商家黄页 ====================
const shopApi = {
  list(opts = {}) {
    const { category = 0, page = 1, page_size = 10, silent } = opts
    return request({
      url: '/api/v1/shops',
      data: { category, page, page_size },
      auth: false,
      silent
    })
  },
  detail(id, opts = {}) {
    return request({ url: `/api/v1/shops/${id}`, auth: false, silent: !!opts.silent })
  },
  create(payload) {
    return request({
      url: '/api/v1/shops',
      method: 'POST',
      data: payload
    })
  },
  update(id, payload) {
    return request({
      url: `/api/v1/shops/${id}`,
      method: 'PUT',
      data: payload
    })
  }
}

// ==================== 公告 ====================
const noticeApi = {
  list(page = 1, pageSize = 10, opts = {}) {
    return request({
      url: '/api/v1/notices',
      data: { page, page_size: pageSize },
      auth: false,
      silent: !!opts.silent
    })
  },
  detail(id) {
    return request({ url: `/api/v1/notices/${id}`, auth: false })
  }
}

// ==================== OSS 上传 ====================
const ossApi = {
  getUploadToken({ file_type, biz, ext, size }) {
    return request({
      url: '/api/v1/oss/upload-token',
      method: 'POST',
      data: { file_type, biz, ext, size }
    })
  }
}

module.exports = {
  request,
  getToken,
  setToken,
  getStoredUser,
  setStoredUser,
  clearAuth,
  userApi,
  homeApi,
  postApi,
  shopApi,
  noticeApi,
  ossApi,
  commentApi
}
