// config/index.js
// 全局配置:BASE_URL 决定请求发到哪
//
// 环境判断规则(根据 wx.getAccountInfoSync 的 envVersion):
//   develop    → 开发者工具自带的模拟器    → dev  (localhost:8888)
//   trial      → 体验版(扫码体验)         → prod (正式域名)
//   release    → 正式版(已上线)           → prod (正式域名)
//
// 开发者工具「真机调试」按钮虽然 envVersion 也是 develop,但走 prod 域名。
// 真机调试需要小程序后台已配置正式 API 域名为 request 合法域名。
//
// 微信开发者工具调试步骤:
//   1. 顶部菜单 → 详情 → 本地设置 → 勾选「不校验合法域名、web-view(业务域名)、TLS 版本以及 HTTPS 证书」
//   2. 改完 baseURL 后保存,开发者工具会自动重载

const isDevtoolsSimulator = (function () {
  // 仅当是开发者工具自带的「模拟器」时才走 dev。
  // 真机调试(手机连 USB)虽然 envVersion === 'develop',但 systemInfo 是真实手机,
  // 用 systemInfo.platform !== 'devtools' 把它排除掉,强制走 prod。
  try {
    const accountInfo = wx.getAccountInfoSync()
    if (accountInfo.miniProgram.envVersion !== 'develop') return false
    const sys = wx.getSystemInfoSync()
    return sys.platform === 'devtools'
  } catch (e) {
    return true
  }
})()

const ENV = isDevtoolsSimulator ? 'dev' : 'prod'

const CONFIG = {
  dev: {
    // 仅开发者工具模拟器内可用
    baseURL: 'http://localhost:8888'
  },
  prod: {
    // API 域名直连后端 nginx;静态资源走 CDN 域名
    baseURL: 'https://api.lamborai.com'
  }
}

module.exports = {
  BASE_URL: CONFIG[ENV].baseURL,
  ENV: ENV
}

