// utils/profile-edit.js
// profile-edit 页用的纯函数（抽出来便于手测 / 后续加 jest）
//
// 不依赖 wx.* 或 Page，可独立 require 测

const MAX_NICKNAME_LEN = 16

/**
 * 校验昵称（trim + 长度）
 * @param {string} raw 用户在 input 里输入的原始字符串（可能含前后空格）
 * @returns {{ok: true, value: string} | {ok: false, msg: string}}
 */
function validateNickname(raw) {
  const t = (raw || '').trim()
  if (t.length === 0) {
    return { ok: false, msg: '昵称不能为空' }
  }
  if (t.length > MAX_NICKNAME_LEN) {
    return { ok: false, msg: `昵称 1-${MAX_NICKNAME_LEN} 个字符` }
  }
  return { ok: true, value: t }
}

/**
 * 计算提交到后端的 payload（只含变化字段）
 * @param {object} args
 * @param {string} args.originalNickname 进入页面时的昵称
 * @param {string} args.nickname          当前昵称（已 trim）
 * @param {string} args.originalAvatar    进入页面时的 file_key
 * @param {string} args.avatarFileKey     当前 file_key
 * @returns {object} 可能为 {}（表示无改动）
 */
function buildUpdatePayload(args) {
  const payload = {}
  if (args.nickname !== args.originalNickname) {
    payload.nickname = args.nickname
  }
  if (args.avatarFileKey !== args.originalAvatar) {
    payload.avatar = args.avatarFileKey
  }
  return payload
}

module.exports = {
  validateNickname,
  buildUpdatePayload,
  MAX_NICKNAME_LEN
}
