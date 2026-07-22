// utils/constants.js
// 业务常量：分类映射、状态映射

// 信息分类：1二手 2租房 3招聘 4求助 9其他（其他仅在信息页/发布页可见，首页不显示）
const POST_TYPES = [
  { id: 0, name: '全部', emoji: '✨' },
  { id: 1, name: '二手', emoji: '🛒' },
  { id: 2, name: '租房', emoji: '🏠' },
  { id: 3, name: '招聘', emoji: '💼' },
  { id: 4, name: '求助', emoji: '🤝' },
  { id: 9, name: '其他', emoji: '🌿' }
]

const POST_TYPE_MAP = POST_TYPES.reduce((acc, t) => {
  acc[t.id] = t
  return acc
}, {})

// 隐藏的 type（前端 UI 不展示，type 编号和数据保留）
// 用途：未来加资质后只需清空数组 = [] 即可复开
// 当前隐藏：3=招聘（人力资源许可证暂缺）
const HIDDEN_POST_TYPE_IDS = [3]

// 商家分类：1家政 2维修 3开锁 4搬家 5跑腿 6美业 7教育 8美食 9其他
const SHOP_CATEGORIES = [
  { id: 0, name: '全部', emoji: '🔍' },
  { id: 1, name: '家政', emoji: '🧹' },
  { id: 2, name: '维修', emoji: '🔧' },
  { id: 3, name: '开锁', emoji: '🔑' },
  { id: 4, name: '搬家', emoji: '📦' },
  { id: 5, name: '跑腿', emoji: '🏃' },
  { id: 6, name: '美业', emoji: '💇' },
  { id: 7, name: '教育', emoji: '📚' },
  { id: 8, name: '美食', emoji: '🍜' },
  { id: 9, name: '其他', emoji: '🌿' }
]

const SHOP_CATEGORY_MAP = SHOP_CATEGORIES.reduce((acc, c) => {
  acc[c.id] = c
  return acc
}, {})

// 发布状态：1待审 2通过 3下架 4拒绝
const POST_STATUS_MAP = {
  1: { name: '审核中', color: '#C8A24C', short: '审核中', tone: 'audit', hint: '正在审核中，审核通过后所有人可见' },
  2: { name: '已发布', color: '#4A9F6A', short: '已发布', tone: 'live', hint: '' },
  3: { name: '已下架', color: '#999',    short: '已下架', tone: 'offline', hint: '已下架，仅你可见。可重新编辑后再提交' },
  4: { name: '已拒绝', color: '#C24A4A', short: '已拒绝', tone: 'rejected', hint: '未通过审核，请按原因修改后重新提交' }
}

// 商家状态：1待审 2通过 3下架 4拒绝
const SHOP_STATUS_MAP = {
  1: { name: '审核中', color: '#C8A24C' },
  2: { name: '已收录', color: '#4A9F6A' },
  3: { name: '已下架', color: '#999' },
  4: { name: '已拒绝', color: '#C24A4A' }
}

// 用户状态：1正常 2封禁
const USER_STATUS_MAP = {
  1: '正常',
  2: '已封禁'
}

module.exports = {
  POST_TYPES,
  POST_TYPE_MAP,
  HIDDEN_POST_TYPE_IDS,
  SHOP_CATEGORIES,
  SHOP_CATEGORY_MAP,
  POST_STATUS_MAP,
  SHOP_STATUS_MAP,
  USER_STATUS_MAP
}
