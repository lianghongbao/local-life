# 小城便利贴 · C 端小程序

微信小程序客户端,提供给周边居民发布信息、查找本地服务、点赞评论的生活类工具。

配套后端:[local-life-api/](../local-life-api)(在相邻子项目仓库)。

---

## 目录

- [产品定位](#产品定位)
- [技术栈](#技术栈)
- [页面清单](#页面清单)
- [目录结构](#目录结构)
- [设计系统](#设计系统)
- [开发](#开发)
- [后端对接](#后端对接)
- [OSS 直传](#oss-直传)
- [位置授权](#位置授权)
- [测试与发布](#测试与发布)
- [隐私合规](#隐私合规)
- [配套关系](#配套关系)

---

## 产品定位

面向某城 / 区 / 街道的小型本地化社区:用户可在小程序内浏览附近邻居发的信息(二手 / 租房 / 招聘 / 求助 / 其他)、查找本地商家服务(家政 / 维修 / 开锁 / 搬家 / 跑腿 / 美业 / 教育 / 美食 / 其他)、一键发布自己的信息或商家收录申请。**核心能力 = 同城同区同镇的内容分发 + 微信小程序登录 / 支付 / 分享闭环**。

对应后台配套:

- [local-life-api](../local-life-api/) — 后端 API + 鉴权 + 内容审核逻辑 + 评论系统
- [local-life-admin](../local-life-admin/) — 后台管理界面

---

## 技术栈

微信小程序原生开发,**无前端框架 / 无 npm 依赖 / 无构建工具**。代码即运行时。

| 类别 | 选型 | 说明 |
| ---- | ---- | ---- |
| 运行时 | 微信小程序基础库(目标 `libVersion: 3.16.1` 见 `project.config.json`) | 真机运行时由微信提供 |
| 语言 | JavaScript (ES2017+ CommonJS) | 不引入 TypeScript / babel |
| 样式 | WXSS + CSS 变量(`app.wxss`) | 主题令牌在 `page { --color-primary: ... }` |
| 持久化 | `wx.setStorageSync` / `wx.getStorageSync` | 单 key:token / user / location |
| 网络 | `wx.request` + `wx.uploadFile`(统一封装在 [utils/api.js](utils/api.js) 与 [utils/upload.js](utils/upload.js)) | 不使用 async/await 之外的并发原语 |
| 位置 | `wx.getLocation` + `wx.chooseLocation` + `wx.openSetting` | 7 天内 storage 缓存复用 |

未引入 npm / TypeScript / Vue / React,所有依赖复用微信小程序原生 API。

---

## 页面清单

`app.json` 里注册的 15 个页面路由:

| 路由 | 文件 | 功能 |
| ---- | ---- | ---- |
| `pages/home/home` | [pages/home/home.js](pages/home/home.js) | 首页:公告 + 轮播 + 精选商家 + 本地推荐混合流 |
| `pages/posts/posts` | [pages/posts/posts.js](pages/posts/posts.js) | 信息列表(分类 + 筛选) |
| `pages/posts/post-detail` | [pages/post-detail/post-detail.js](pages/post-detail/post-detail.js) | 信息详情 + 评论 |
| `pages/posts/post-create` | [pages/post-create/post-create.js](pages/post-create/post-create.js) | 发布信息 / 编辑我的发布 |
| `pages/shops/shops` | [pages/shops/shops.js](pages/shops/shops.js) | 商家列表(分类) |
| `pages/shops/shop-detail` | [pages/shop-detail/shop-detail.js](pages/shop-detail/shop-detail.js) | 商家详情 |
| `pages/shops/shop-create` | [pages/shop-create/shop-create.js](pages/shop-create/shop-create.js) | 入驻商家 / 编辑我的商家 |
| `pages/notices/notices` | [pages/notices/notices.js](pages/notices/notices.js) | 公告列表 |
| `pages/notices/notice-detail` | [pages/notice-detail/notice-detail.js](pages/notice-detail/notice-detail.js) | 公告详情 |
| `pages/mine/mine` | [pages/mine/mine.js](pages/mine/mine.js) | 我的(个人中心) |
| `pages/login/login` | [pages/login/login.js](pages/login/login.js) | 微信登录 |
| `pages/my-posts/my-posts` | [pages/my-posts/my-posts.js](pages/my-posts/my-posts.js) | 我的发布(管理入口:编辑 / 重新上架) |
| `pages/my-shops/my-shops` | [pages/my-shops/my-shops.js](pages/my-shops/my-shops.js) | 我的商家 |
| `pages/profile-edit/profile-edit` | [pages/profile-edit/profile-edit.js](pages/profile-edit/profile-edit.js) | 个人资料编辑 |
| `pages/webview/webview` | [pages/webview/webview.js](pages/webview/webview.js) | 通用 webview 容器(运营 H5 跳转) |

---

## 目录结构

```
local-life/
├── app.js                        # 入口:登录态管理 + 启动定位
├── app.json                      # 注册路由 + tabBar + 隐私声明 + requiredPrivateInfos
├── app.wxss                      # 全局样式 + CSS 设计令牌(Warm Neighborhood)
├── project.config.json           # 微信开发者工具工程配置
├── project.private.config.json   # 本地开发调试设置(不提交)
├── sitemap.json                  # 微信搜索收录规则
│
├── pages/                        # 15 个页面目录(每页 .js / .wxml / .wxss / .json)
├── components/                   # 自定义组件(仅 location-bar 一组)
│   └── location-bar/             # 顶栏定位条:已定位 / 未定位 / loading 三态 + 切区切镇弹层
│
├── utils/                        # 通用工具
│   ├── api.js                    # 统一 wx.request 封装 + 信封解析 + 401 处理
│   ├── config.js                 # 腾讯地图 key 等常量
│   ├── constants.js              # 业务枚举(分类 / 状态)
│   ├── location.js               # 同城推荐:定位 + reverse + 7d storage 缓存
│   ├── profile-edit.js           # 昵称校验 + payload 构造(纯函数,可独立 require)
│   ├── upload.js                 # OSS 直传封装:从后端拿 V4 凭证 → wx.uploadFile
│   ├── comment.js                # 评论 6 个 API 封装(lazy require 防循环依赖)
│   ├── qqmap-wx-jssdk.js         # 腾讯 LBS 官方 SDK(原样保留)
│   └── util.js                   # 时间格式化 / 图片占位
│
├── config/
│   └── index.js                  # BASE_URL(根据 envVersion 自动 dev / prod 切换)
│
└── assets/                       # tabBar 图标等图片资源
```

---

## 设计系统

主题:**Warm Neighborhood**(温暖的新本地化社区感)。主色暖橙红 + 米白 + 深墨。

CSS 变量集中在 [app.wxss:8-42](app.wxss#L8-L42),全组件可用:

```css
/* 颜色 */
--color-primary     #E8533F  /* 主品牌色 */
--color-primary-soft #F4A78F
--color-primary-deep #C13825
--color-warm-bg     #FAF6F1  /* 米白背景 */
--color-paper       #FFFFFF  /* 卡片白 */
--color-ink         #1A1A1A  /* 主文字 */
--color-ink-2       #4A4A4A  /* 次文字 */
--color-ink-3       #8A8A8A  /* 辅助文字 */
--color-line        #EDE6DC  /* 分割线 */
--color-accent      #C8A24C  /* 古铜金 - 装饰 */

/* 语义色 */
--color-success #4A9F6A
--color-warn    #E0853F
--color-error   #C24A4A
```

通用组件类:`.container` / `.card` / `.btn .btn-primary` / `.tag .tag-success` / `.divider` / `.empty` / `.font-{12..28}`。新页面统一复用这些类,不要写 inline style。

---

## 开发

### 工具

- 微信开发者工具(Stable):https://developers.weixin.qq.com/miniprogram/dev/devtools/download.html
- 进入项目时"导入本地代码 → 选择 `local-life/` 目录"
- 顶部"详情 → 本地设置":**勾选"不校验合法域名、web-view(业务域名)、TLS 版本以及 HTTPS 证书"** — 否则 `localhost:8888` 调不到

### 准备

没有 `npm install`。所有依赖(微信小程序基础库 + 业务 JS)在 `local-life/` 目录下,直接打开即可。

### dev 后端地址

`config/index.js` 根据 `wx.getAccountInfoSync().envVersion` 自动选:

| 环境 | envVersion | 含义 | BASE_URL |
| ---- | ---------- | ---- | -------- |
| 开发者工具自带模拟器 | `develop` | 用 `systemInfo.platform === 'devtools'` 判定,避免真机调试也走 dev | `http://localhost:8888` |
| 真机调试 | `develop` | 同上但 systemInfo 是真实手机 → 走 prod | `https://<your-api-domain>` |
| 体验版 | `trial` | 扫码体验 → prod | `https://<your-api-domain>` |
| 正式版 | `release` | 已上线 → prod | `https://<your-api-domain>` |

> 想固定某个环境,改 `config/index.js` 里的 `ENV` 常量。但**生产不要改回 dev**。

### 后端启动

[C 端 API 项目](../local-life-api/) 在 `:8888`,`go-zero + MySQL + Redis` 三件套。dev 启动:

```bash
cd ../local-life-api
GO_CONFIG_FILE=etc/mini-api-dev.yaml go run .
```

---

## 后端对接

### baseURL

`config/index.js` 的 `BASE_URL`(自动按 envVersion 选 dev / prod)→ 所有 API 拼接 `${BASE_URL}/api/v1/...`。

### 统一信封

后端用 `zeromicro/x` 返回 `{code, msg, data}`。[utils/api.js:67-175](utils/api.js#L67-L175) 的响应拦截器:

| `code` | 前端处理 |
| ------ | -------- |
| `0` | 业务成功:返回 `data` 给 caller |
| `401 / 403` | token 失效:`silent` 模式只标 `needLogin`(避免"刚登录即 401 → 清 token → 又跳登录"死循环);非 silent:清 token + 弹 toast |
| 其他非 0 | toast `msg`,reject `body` |

### JWT 鉴权

- 登录成功:[utils/api.js:188-198](utils/api.js#L188-L198) 把 `{token, user_id, openid, unionid}` 写到 `wx.setStorageSync('lhb_token')` + `'lhb_user'`
- 每个请求 [utils/api.js:84-92](utils/api.js#L84-L92) 自动带 `Authorization: Bearer <token>`
- 业务身份用 `openid`(JWT 主载荷),**不**用 `user_id` 当业务主键

---

## OSS 直传

[utils/upload.js](utils/upload.js) 封装完整链路:

1. `ossApi.getUploadToken({file_type, biz, ext, size})` → 后端给 `{file_key, url, oss, v4, policy, host, expire_at}`
2. 用 `wx.uploadFile` 直传 OSS(后端 V4 Policy 已签名;前端无需 secret)
3. 返回 `{fileKey, url}`:`url` 直接渲染 + 入库(永久有效)

`formData` 字段名 / 顺序要求严格(OSS PostObject V4):

```
key → policy → x-oss-signature-version → x-oss-credential →
x-oss-date → x-oss-signature → x-oss-security-token → success_action_status → file
```

---

## 位置授权

[utils/location.js](utils/location.js) + [components/location-bar/](components/location-bar/) 处理同城推荐 / 选点:

- `wx.authorize` 弹原生授权框(用户拒绝过则**直接 fail 不再弹框**,要引导走 `wx.openSetting`)
- `wx.getLocation` 拿经纬度(GCJ02,`isHighAccuracy: false`)
- 经纬度 + 后端 `/api/v1/geo/reverse` → 城市 / 区 / 街道
- 结果缓存到 `wx.setStorageSync('userLocation')`,**7 天内复用**,过期重新走网络

启动时由 [app.js:70-80](app.js#L70-L80) 的 `bootstrapLocation()` 主动跑一次;失败不 throw,只更新 `bootstrapLocationStatus` 让上层降级显示。

---

## 测试与发布

### 测试场景(微信开发者工具)

| 场景 | 工具路径 |
| ---- | -------- |
| 模拟器自测 | 默认 "普通编译" 即可 |
| 真机调试 | 顶部"真机调试"→ 扫码连接 → 这条链路走 prod 域名 |
| 体验版 | 顶部"上传"→ 选 `trial` → 拿到体验码 → 其他同事扫码访问 |
| 性能 / 包体 | "代码质量" 面板 |

### 发布

1. [微信公众平台](https://mp.weixin.qq.com/) → 登录 → 版本管理
2. 上传新版本(选 `release`)→ 取得版本号(如 `1.2.0`)
3. 提交审核 → 通过后点"发布"

详见微信小程序"发布上线"流程文档。

---

## 隐私合规

`app.json` 里声明的位置权限:

```json
"permission": {
  "scope.userLocation": {
    "desc": "用于发布信息时定位,及首页同城推荐"
  }
},
"requiredPrivateInfos": [
  "getLocation",
  "chooseLocation"
]
```

| 用法 | 说明 |
| ---- | ---- |
| `wx.getLocation` (type:gcj02) | 启动时 / 发布时拿经纬度,经后端 reverse 出城市区街道 |
| `wx.chooseLocation` | 用户手动选点定位,真实坐标以用户选择为准 |

隐私政策由运营在微信公众平台"设置 → 服务设置 → 隐私设置"里维护,文案需列出**真实场景**:发布本地信息时定位 / 同城推荐 / 切区切镇 / 拒绝后降级全市推荐 / 7 天缓存复用 / 不主动上传第三方等。

> 上线前必须同步更新隐私政策,否则审核会被拒。

---

## 配套关系

| 维度 | local-life (C 端) | local-life-api (后端) | local-life-admin (后台) |
| ---- | ------------------ | ---------------------- | ----------------------- |
| 端口(dev) | 微信开发者工具自带模拟器 | `:8888` | `:5174` |
| 鉴权 | `wx.getStorageSync('lhb_token')` | `Auth.AccessSecret` 签发 | `AdminAuth.AccessSecret` 签发 |
| baseURL | `config/index.js` 自动切换 | - | `/api/*` proxy 到 8888 |
| 上传凭证 | `/api/v1/oss/upload-token` | `internal/logic/shared/uploadtoken.Builder` | `/api/v1/admin/oss/upload-token` |
| 部署形态 | 微信平台审核 + 体验版 | Docker + ACR + GitHub Actions | 静态 dist + nginx + GitHub Actions |
| 文档 | 本 README | [../local-life-api/README.md](../local-life-api/README.md) | [../local-life-admin/README.md](../local-life-admin/README.md) |

升版顺序:**先升后端**,再升 admin,最后升 C 端小程序(三方对接口契约的容忍度:后端可前向兼容,小程序要同步生效,admin 跟进)。
