// components/location-bar/location-bar.js
const location = require('../../utils/location.js');

// 复用 utils/location.js 的 reverseLocation(与 app.js bootstrapLocation 同一条后端路径)
function clientReverse(lat, lng) {
  return location.reverseLocation(lat, lng).then((r) => {
    if (!r || !r.city_name) return null
    return {
      city_adcode: r.city_adcode || '',
      city_name: r.city_name || '',
      area_adcode: r.area_adcode || '',
      area_name: r.area_name || '',
      lat: lat, lng: lng
    }
  })
}

Component({
  properties: { autoFetch: { type: Boolean, value: true } },
  data: {
    loaded: false,
    hasLocation: false,
    cityName: '',       // 主显示:城市名
    areaName: '',       // 区名(备用)
    cityAdcode: '',
    areaAdcode: '',
    pickerVisible: false,
    authStatus: '',     // 'granted' | 'denied' | 'failed' | ''
  },
  lifetimes: {
    attached() { this._init() }
  },
  pageLifetimes: {
    show() {
      // 从设置页返回,重新同步状态
      const app = getApp()
      const status = (app && app.globalData && app.globalData.bootstrapLocationStatus) || ''
      const cached = app && app.globalData && app.globalData.bootstrapLocation
      if (status === 'granted' && cached && cached.city_name) {
        this._applyLocation(cached)
        this.triggerEvent('change', { areaAdcode: cached.city_adcode, areaName: cached.city_name })
      }
    }
  },
  methods: {
    /**
     * 初始化:有缓存 → 显示;无缓存 → 立刻弹授权
     */
    _init() {
      const app = getApp()
      const appStatus = (app && app.globalData && app.globalData.bootstrapLocationStatus) || ''
      const appLoc = app && app.globalData && app.globalData.bootstrapLocation

      // 1) globalData 已有结果
      if (appStatus === 'granted' && appLoc && appLoc.city_name) {
        this._applyLocation(appLoc)
        return
      }

      // 2) storage 缓存
      if (this.properties.autoFetch) {
        const storageLoc = location.readLocation()
        if (storageLoc && Date.now() - (storageLoc.ts || 0) < 7 * 24 * 3600 * 1000) {
          this._applyLocation(storageLoc)
          return
        }
      }

      // 3) 用户已明确拒绝过 → 不打扰,等用户点 chip
      if (appStatus === 'denied') {
        this.setData({ loaded: true, hasLocation: false, authStatus: 'denied', cityName: '' })
        return
      }

      // 4) app.js bootstrap 还在跑 → 轮询等结果,8s 超时后弹授权
      this.setData({ loaded: false })
      if (!appStatus) {
        this._waitForBootstrap(8000)
        return
      }

      // app.js 已结束但没拿到结果 → 自己弹授权
      this._doAuthorize()
    },

    /**
     * 轮询 globalData.bootstrapLocation 直到有结果或超时
     * @param {number} maxMs 最大等待毫秒
     */
    _waitForBootstrap(maxMs) {
      const app = getApp()
      const start = Date.now()
      const tick = () => {
        const s = (app && app.globalData && app.globalData.bootstrapLocationStatus) || ''
        const loc = app && app.globalData && app.globalData.bootstrapLocation
        if (s === 'granted' && loc && loc.city_name) {
          this._applyLocation(loc)
          return
        }
        if (s === 'denied') {
          this.setData({ loaded: true, hasLocation: false, authStatus: 'denied', cityName: '' })
          return
        }
        if (s === 'granted' || s === 'failed' || s === 'throttled') {
          this._doAuthorize()
          return
        }
        if (Date.now() - start >= maxMs) {
          this._doAuthorize()
          return
        }
        setTimeout(tick, 200)
      }
      tick()
    },

    _applyLocation(loc) {
      this.setData({
        loaded: true,
        hasLocation: !!loc.city_name,
        cityName: loc.city_name || '',
        areaName: loc.area_name || '',
        cityAdcode: loc.city_adcode || '',
        areaAdcode: loc.area_adcode || '',
        authStatus: 'granted'
      })
    },

    /**
     * 点 chip:
     * - 已有位置 → 重新定位(用户可能去新城市了)
     * - 已拒绝 → openSetting modal
     * - 其他 → 弹授权
     */
    onOpenPicker() {
      if (this.data.hasLocation) {
        wx.showLoading({ title: '定位中...', mask: true })
        this._fetchAndApply().finally(() => wx.hideLoading())
        return
      }
      const app = getApp()
      const status = (app && app.globalData && app.globalData.bootstrapLocationStatus) || this.data.authStatus || ''
      if (status === 'denied') {
        this._goOpenSetting()
        return
      }
      this._doAuthorize()
    },

    /** 长按 chip:清除定位 */
    onLongPressChip() {
      if (!this.data.hasLocation) return
      try { wx.removeStorageSync('userLocation') } catch (_) {}
      const app = getApp()
      if (app && app.globalData) {
        app.globalData.bootstrapLocationStatus = ''
        app.globalData.bootstrapLocation = null
      }
      this.setData({
        loaded: true, hasLocation: false,
        cityName: '', areaName: '',
        cityAdcode: '', areaAdcode: '', authStatus: ''
      })
      this.triggerEvent('change', { areaAdcode: '', areaName: '' })
    },

    _doAuthorize() {
      wx.authorize({
        scope: 'scope.userLocation',
        success: () => {
          this._fetchAndApply()
        },
        fail: (err) => {
          const isAuthErr = err && err.errMsg && err.errMsg.indexOf('authorize') >= 0
          const status = isAuthErr ? 'denied' : 'failed'
          const app = getApp()
          if (app && app.globalData) app.globalData.bootstrapLocationStatus = status
          this.setData({ loaded: true, authStatus: status, cityName: '' })
          if (isAuthErr) this._goOpenSetting()
        }
      })
    },

    async _fetchAndApply() {
      this.setData({ loaded: false })
      try {
        const loc = await this._wxGetLocation()
        if (loc && loc.__err) {
          this._onLocationFailed(loc.__err)
          return
        }
        // 8s 兜底:reverse 即使没返回也强制结束,避免"一直定位中"挂死 UI
        const reverse = await Promise.race([
          clientReverse(loc.latitude, loc.longitude),
          new Promise((_, reject) => setTimeout(() => reject(new Error('reverse timeout')), 8000))
        ])
        if (!reverse) {
          this.setData({ loaded: true, authStatus: 'granted', pickerVisible: true })
          return
        }
        location.writeLocation(reverse)
        const app = getApp()
        if (app && app.globalData) {
          app.globalData.bootstrapLocationStatus = 'granted'
          app.globalData.bootstrapLocation = reverse
        }
        this._applyLocation(reverse)
        this.triggerEvent('change', {
          areaAdcode: reverse.city_adcode,
          areaName: reverse.city_name
        })
      } catch (e) {
        this.setData({ loaded: true, authStatus: 'failed', cityName: '' })
      }
    },

    _onLocationFailed(err) {
      // wx.getLocation 2.17.0 起频率限制,errMsg 为 "getLocation:fail 频繁调用会增加电量损耗..."
      const msg = (err && err.errMsg) || ''
      const isThrottled = msg.indexOf('频繁') >= 0
      this.setData({
        loaded: true,
        authStatus: isThrottled ? 'throttled' : 'failed',
        cityName: ''
      })
      const app = getApp()
      if (app && app.globalData) {
        app.globalData.bootstrapLocationStatus = isThrottled ? 'throttled' : 'failed'
      }
      wx.showToast({
        title: isThrottled ? '定位太频繁,请稍后再试' : '定位失败,请重试',
        icon: 'none'
      })
    },

    _wxGetLocation() {
      return new Promise(function (resolve) {
        wx.getLocation({
          type: 'gcj02',
          isHighAccuracy: false,
          success: function (res) { resolve(res) },
          // 不 reject,改用 {__err} 透传,让上层 catch 区分频率限制/权限失败
          fail: function (err) { resolve({ __err: err }) }
        })
      })
    },

    _goOpenSetting() {
      wx.showModal({
        title: '需要定位权限',
        content: '为了给您推荐附近的信息,需要获取您的位置。是否前往设置开启？',
        confirmText: '去设置',
        cancelText: '暂不',
        success: async (res) => {
          if (!res.confirm) return
          const opened = await location.openLocationSetting()
          if (opened) this._fetchAndApply()
        }
      })
    },

    // picker(仅作为兜底,reverse 失败时让用户选区)
    onPickerClose() { this.setData({ pickerVisible: false }) },
    onAreaSelected(e) {
      const { areaAdcode, areaName } = e.detail
      location.setLocationOverride({ area_adcode: areaAdcode, area_name: areaName })
      this.setData({ areaAdcode, areaName, pickerVisible: false })
      this.triggerEvent('change', { areaAdcode, areaName })
    },
    onCitySelected(e) {
      const { cityAdcode, cityName } = e.detail
      location.setLocationOverride({ city_adcode: cityAdcode, city_name: cityName })
      this.setData({ cityAdcode, pickerVisible: false })
      setTimeout(() => { this.setData({ pickerVisible: true }) }, 100)
    }
  }
})
