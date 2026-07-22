// utils/config.js
// 全局配置文件(key / secret / URL 等)
// 注意:key 暴露在小程序客户端,生产环境建议:
//   1. 用服务端转发(当前架构,需 reverse 接口正常)
//   2. 或申请专用 key + 腾讯后台配置"允许的小程序 appid"白名单

module.exports = {
  // 腾讯位置服务 LBS key(微信小程序 SDK 用)
  // dev / 体验版共用一个 key
  TENCENT_MAP_KEY: 'CHANGE_ME_TENCENT_MAP_KEY'
}
