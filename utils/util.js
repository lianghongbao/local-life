// utils/util.js
// 时间格式化、图片容错、空状态

function pad(n) {
  return n < 10 ? '0' + n : '' + n
}

function formatTime(date) {
  if (!date) return ''
  const d = typeof date === 'string' || typeof date === 'number' ? new Date(date) : date
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function relativeTime(input) {
  if (!input) return ''
  const d = typeof input === 'string' || typeof input === 'number' ? new Date(input) : input
  const diff = Date.now() - d.getTime()
  const min = Math.floor(diff / 60000)
  if (min < 1) return '刚刚'
  if (min < 60) return `${min} 分钟前`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr} 小时前`
  const day = Math.floor(hr / 24)
  if (day < 30) return `${day} 天前`
  return formatTime(d).slice(0, 10)
}

// JSON 字符串解析为数组(防后端空字符串)
function parseImages(jsonStr) {
  if (!jsonStr) return []
  if (Array.isArray(jsonStr)) return jsonStr
  try {
    const arr = JSON.parse(jsonStr)
    return Array.isArray(arr) ? arr : []
  } catch (e) {
    return []
  }
}

// 图片缺省占位
function defaultImg() {
  return 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 4 3"><rect width="4" height="3" fill="%23F0E8DC"/></svg>'
}

module.exports = {
  formatTime,
  relativeTime,
  parseImages,
  defaultImg
}
