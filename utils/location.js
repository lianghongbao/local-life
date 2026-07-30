// utils/location.js
// 同城推荐:封装 wx.getLocation + 后端 reverse + storage 读写
// 7 天内复用 storage,过期重调
//
// 复用 utils/api.js 的 request() (统一信封/日志/toast) + config/index.js 的 BASE_URL
// 不直接 wx.request:保持项目惯例

const { request } = require('./api.js')

const STORAGE_KEY = 'userLocation'
const STORAGE_TTL_MS = 7 * 24 * 3600 * 1000

/**
 * 从 storage 读用户位置信息
 * @returns {object|null} {city_adcode, city_name, area_adcode, area_name, street_name, lat, lng, ts}
 */
function readLocation() {
  try {
    return wx.getStorageSync(STORAGE_KEY) || null
  } catch (e) {
    return null
  }
}

/**
 * 写 storage(自动加 ts)
 */
function writeLocation(loc) {
  wx.setStorageSync(STORAGE_KEY, Object.assign({}, loc, { ts: Date.now() }))
}

/**
 * 调 wx.getLocation + 后端 reverse;若 storage 7 天内有效,直接返回
 * @param {boolean} forceRefresh 强制重新定位
 * @returns {Promise<object>} {city_adcode, city_name, area_adcode, area_name, street_name, lat, lng, ts}
 */
async function fetchLocation(forceRefresh) {
  if (!forceRefresh) {
    const cached = readLocation()
    if (cached && Date.now() - (cached.ts || 0) < STORAGE_TTL_MS) {
      return cached
    }
  }

  // 1) 拿经纬度
  let lat = 0
  let lng = 0
  try {
    const loc = await wxGetLocation()
    lat = loc && loc.latitude ? loc.latitude : 0
    lng = loc && loc.longitude ? loc.longitude : 0
  } catch (e) {
    // 失败:返回空位置(上层可继续走全国/兜底)
    return {
      city_adcode: '',
      city_name: '',
      area_adcode: '',
      area_name: '',
      street_name: '',
      lat: 0,
      lng: 0,
      ts: Date.now()
    }
  }

  if (!lat || !lng) {
    // 没拿到经纬度(返回 0,0 之类)也当失败处理
    return {
      city_adcode: '',
      city_name: '',
      area_adcode: '',
      area_name: '',
      street_name: '',
      lat: 0,
      lng: 0,
      ts: Date.now()
    }
  }

  // 2) 调后端 reverse
  try {
    const data = await request({
      url: '/api/v1/geo/reverse',
      method: 'GET',
      data: { lat, lng },
      auth: false,
      silent: true
    })
    const result = {
      city_adcode: (data && data.city_adcode) || '',
      city_name: (data && data.city_name) || '',
      area_adcode: (data && data.area_adcode) || '',
      area_name: (data && data.area_name) || '',
      street_name: (data && data.street_name) || '',
      lat: lat,
      lng: lng,
      ts: Date.now()
    }
    writeLocation(result)
    return result
  } catch (e) {
    return {
      city_adcode: '',
      city_name: '',
      area_adcode: '',
      area_name: '',
      street_name: '',
      lat: lat,
      lng: lng,
      ts: Date.now()
    }
  }
}

/**
 * 用户切换区/镇后写新值(保留原 lat/lng/ts,只覆盖区域信息)
 * @param {object} override {city_adcode?, city_name?, area_adcode?, area_name?, street_name?}
 */
function setLocationOverride(override) {
  if (!override || typeof override !== 'object') {
    return readLocation()
  }
  const cur = readLocation() || {}
  const next = Object.assign({}, cur, override, { ts: Date.now() })
  writeLocation(next)
  return next
}

function wxGetLocation() {
  return new Promise(function (resolve, reject) {
    wx.getLocation({
      type: 'gcj02',
      isHighAccuracy: false,
      success: function (res) { resolve(res) },
      fail: function (err) { reject(err) }
    })
  })
}

/**
 * 主動請求定位授權 + 拿經緯度
 * 注意:wx.authorize 第二次調用(用戶已拒絕過)會直接 fail 不再彈框,
 *       這時 caller 應該走 wx.openSetting 引導用戶去設置頁手動開
 * @returns {Promise<{status: 'granted'|'denied'|'failed', loc?: {latitude, longitude}, errMsg?: string}>}
 */
function requestAuthorize() {
  return new Promise(function (resolve) {
    // 第一步:彈原生授權框
    wx.authorize({
      scope: 'scope.userLocation',
      success: function () {
        // 第二步:用戶同意 → 拿精確經緯度
        wx.getLocation({
          type: 'gcj02',
          isHighAccuracy: false,
          success: function (loc) {
            resolve({ status: 'granted', loc: loc })
          },
          fail: function (err) {
            resolve({ status: 'failed', errMsg: (err && err.errMsg) || 'location failed' })
          }
        })
      },
      fail: function (err) {
        // 用戶拒絕 / 系統不允許 / 已拒絕過(這次直接 fail)
        resolve({ status: 'denied', errMsg: (err && err.errMsg) || 'denied' })
      }
    })
  })
}

/**
 * 啟動時主動定位一次:彈授權 → 拿經緯度 → reverse → 寫 storage
 * 失敗/拒絕不 throw,返回 status 字段
 * @returns {Promise<{status: 'granted'|'denied'|'failed', location?: object, fromCache?: boolean, errMsg?: string, lat?: number, lng?: number}>}
 */
async function bootstrapLocation() {
  // 7 天內有緩存 → 直接用,不彈授權(避免重複打擾)
  const cached = readLocation()
  if (cached && Date.now() - (cached.ts || 0) < STORAGE_TTL_MS) {
    return { status: 'granted', location: cached, fromCache: true }
  }

  const auth = await requestAuthorize()
  if (auth.status !== 'granted' || !auth.loc) {
    return { status: auth.status, errMsg: auth.errMsg }
  }

  // 經緯度拿到 → reverse → 寫緩存
  const lat = auth.loc.latitude
  const lng = auth.loc.longitude
  try {
    const data = await request({
      url: '/api/v1/geo/reverse',
      method: 'GET',
      data: { lat: lat, lng: lng },
      auth: false,
      silent: true
    })
    const result = {
      city_adcode: (data && data.city_adcode) || '',
      city_name: (data && data.city_name) || '',
      area_adcode: (data && data.area_adcode) || '',
      area_name: (data && data.area_name) || '',
      street_name: (data && data.street_name) || '',
      lat: lat,
      lng: lng,
      ts: Date.now()
    }
    writeLocation(result)
    return { status: 'granted', location: result }
  } catch (e) {
    return { status: 'failed', errMsg: (e && e.msg) || 'reverse failed', lat: lat, lng: lng }
  }
}

/**
 * 打開設置頁(用於 denied 後讓用戶手動開權限)
 * 注意:只能在用戶點擊事件裡調用,不能在 onLaunch/onShow 自動調
 * @returns {Promise<boolean>} 用戶最終是否開了權限
 */
function openLocationSetting() {
  return new Promise(function (resolve) {
    wx.openSetting({
      success: function (res) {
        const enabled = res.authSetting && res.authSetting['scope.userLocation']
        resolve(!!enabled)
      },
      fail: function () {
        resolve(false)
      }
    })
  })
}

/**
 * 拿经纬度后调后端 reverse，返回标准化结果
 * @param {number} lat
 * @param {number} lng
 * @returns {Promise<object>} {city_adcode, city_name, area_adcode, area_name, street_name, lat, lng, ts}
 */
async function reverseLocation(lat, lng) {
  // 失败立刻弹 toast + 8s 超时(短于默认 15s),避免定位长时间无反馈
  const data = await request({
    url: '/api/v1/geo/reverse',
    method: 'GET',
    data: { lat, lng },
    auth: false,
    silent: false,
    timeout: 8000
  })
  return {
    city_adcode: (data && data.city_adcode) || '',
    city_name: (data && data.city_name) || '',
    area_adcode: (data && data.area_adcode) || '',
    area_name: (data && data.area_name) || '',
    street_name: (data && data.street_name) || '',
    lat: lat,
    lng: lng,
    ts: Date.now()
  }
}

module.exports = {
  readLocation: readLocation,
  writeLocation: writeLocation,
  fetchLocation: fetchLocation,
  setLocationOverride: setLocationOverride,
  requestAuthorize: requestAuthorize,
  bootstrapLocation: bootstrapLocation,
  openLocationSetting: openLocationSetting,
  reverseLocation: reverseLocation
}
