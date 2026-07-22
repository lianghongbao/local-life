# 首页推荐规则

首页「**本地推荐**」是一段**混合流**(本地小店 + 用户发帖),按"热度 × 新鲜度"加权后,在前端 UI 上以两列瀑布流呈现。本文档说明推荐内容是怎么来的。

> 实际打分逻辑在后端 [local-life-api/internal/logic/user/home_feed_logic.go](../../local-life-api/internal/logic/user/home_feed_logic.go),本文档只描述产品视角的规则,便于前端 / 运营理解。

---

## 推荐池

| 来源表 | 候选池大小 | 取值路径 |
| ------ | ---------- | -------- |
| `shop` | 60 条 | 后端按当前定位范围(area / city / 全市)取最近 60 条本地收录商家 |
| `post_info` | 60 条 | 同上,最近 60 条通过审核的本地信息 |

候选池远大于一页大小(`homeFeedDefaultPageSize = 12`),**保证混合排序后真正的 topN 不会被某个表的候选挤压掉**。

## 过滤范围

`city_adcode` 优先 > `area_adcode` > 全市(空),跟 [首页聚合 (`/api/v1/home`)](../../local-life-api/internal/logic/user/home_index_logic.go)、[信息列表 (`/api/v1/posts`)](../../local-life-api/internal/logic/user/post_list_logic.go) 保持一致,避免不同接口过滤粒度不一致导致结果跳变。

## 排序权重

```
weight = view_count × exp(-age_days / 7.0)
```

| 项 | 含义 |
| --- | ---- |
| `view_count` | **实时**值,来源是 Redis Hash(`HINCRBY` 累加),不是 MySQL(`mysql.view_count` 是 30 秒前的镜像)。读不到 HMGET 时降级为单条 `HGET` |
| `age_days` | 自创建以来的天数 |
| `decayDays = 7` | 时间衰减系数。一周前的同等 view_count 项,权重约等于当天项的 37% |

权重相等时按 `id desc` 兜底(让新入选的优先排在前面,缓解快速衰减带来的跳变)。

## 缓存

按 `(scope, adcode, page, page_size)` 分桶,TTL **60 秒**:

- `home:feed:v1:city:<adcode>:p1:s12`
- `home:feed:v1:area:<adcode>:p1:s12`
- …

60 秒取的是"新鲜感"和"缓存命中率"的折中——内容更新频次不高,但切区域后用户期望立刻看到新范围的内容。

## 前端瀑布流

后端一次性返回混合流(已按 weight desc 排好),前端 [pages/home/home.js:244-255](pages/home/home.js#L244-L255) 把 `list` 拆两列:

```js
items.forEach((it, i) => {
  const baseIdx = (reset ? 0 : newLeft.length + newRight.length)
  if ((baseIdx + i) % 2 === 0) leftAdd.push(it)
  else rightAdd.push(it)
})
```

- 接续下拉时,新条目仍按奇偶交替:左右列总量始终平衡(不会出现"左边长右边短")
- 顶部 12 条大约是小店 6 / 帖 6,后续页可能因为不同位项类型不一样而比例略有偏移(混合流本身的随机性)

## 显示字段

| 字段 | 来源 | 说明 |
| ---- | ---- | ---- |
| `type` | `shop` 或 `post` | 前端按这个字段分发卡片模板 |
| `weight` | (可选)打分值 | 用于联调排序效果,不展示给用户 |
| 时间/状态/封面 | 后端 DTO | `post_*` 或 `shop_*` 前缀字段,前端按 `type` 取对应路径渲染 |

## 降级与缓存

- 后端 Redis 拿不到 view_count:降级单条 `HGET`,不抛错(不阻塞首屏)
- 后端 DB 候选查询失败:接口返 500,前端 banner 弹"网络异常"重试
- 整体 5 分钟内不会再请求列表(由 `[pages/home/home.js:11](pages/home/home.js#L11)` 的 `FEED_CACHE_KEY_PREFIX` 控制 storage 缓存)

## 设计取舍

| 取舍 | 说明 |
| ---- | ---- |
| **候选池而非整列混排** | 120 条候选里排序,可以避免"店铺池里第 2 名但评分比帖子池第 1 名高"被埋没 |
| **view_count 走 Redis 不走 MySQL** | 首页要"实时热度",MySQL 30s 滞后会让用户看到"刚发的被冷启动压底" |
| **时间衰减 7 天** | 1 周前的旧帖不应长期占据首页,但完全没衰减会让老帖子永远高居榜首 |
| **不分类型加权** | 小店和帖子目前等权,不做差异化打分 — 后续如果要"小店优先"在 `weight` 上再加倍数即可 |

## 相关代码

| 文件 | 作用 |
| ---- | ---- |
| [pages/home/home.js:200-272](pages/home/home.js#L200-L272) | 前端分页 / 缓存 / 拆双列瀑布 |
| [pages/home/home.wxml:116-...](pages/home/home.wxml#L116) | 模板:`本地推荐` section 入口 |
| [internal/logic/user/home_feed_logic.go](../../local-life-api/internal/logic/user/home_feed_logic.go) | 后端打分逻辑完整实现 |
| [internal/background/view_count_flusher.go](../../local-life-api/internal/background/view_count_flusher.go) | Redis view_count → MySQL 落库(不参与首页计算,只用于后台落盘) |
