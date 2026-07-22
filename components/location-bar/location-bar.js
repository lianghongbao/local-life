// components/location-bar/location-bar.js
const location = require('../../utils/location.js');
const QQMapWX = require('../../utils/qqmap-wx-jssdk.js');
const { TENCENT_MAP_KEY } = require('../../utils/config.js');

const qqmapsdk = new QQMapWX({ key: TENCENT_MAP_KEY })

function clientReverse(lat, lng) {
  return new Promise((resolve, reject) => {
    qqmapsdk.reverseGeocoder({
      location: { latitude: lat, longitude: lng },
      coord_type: 5,
      get_poi: 0,
      success: (res) => {
        const r = (res && res.result) || {}
        const ac = r.address_component || {}
        const ad = r.ad_info || {}
        const cityAdcode = ad.city_code ? ad.city_code.slice(-6) : ''
        const cityName = ac.city || ''
        if (!cityAdcode || !cityName) {
          resolve(null)
          return
        }
        resolve({
          city_adcode: cityAdcode,
          city_name: cityName,
          area_adcode: ad.adcode || '',
          area_name: ac.district || '',
          lat: lat, lng: lng
        })
      },
      fail: (err) => {
        reject(err)
      }
    })
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

      // 4) 首次/未知:主动弹授权(如果 app.js 的 bootstrap 没调)
      //   关键:进入页面就弹授权,不等用户点
      this.setData({ loaded: false })
      // 如果 app.js bootstrap 还在跑,等它 800ms
      if (!appStatus) {
        setTimeout(() => {
          const s = (app && app.globalData && app.globalData.bootstrapLocationStatus) || ''
          if (s === 'granted') {
            const loc = app && app.globalData && app.globalData.bootstrapLocation
            if (loc) this._applyLocation(loc)
          } else if (s === 'denied') {
            this.setData({ loaded: true, hasLocation: false, authStatus: 'denied', cityName: '' })
          } else {
            // 连 bootstrap 都没结果,自己弹授权
            this._doAuthorize()
          }
        }, 800)
        return
      }

      // app.js 已经跑完但没有结果(failed 或者别的)
      this._doAuthorize()
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
        const reverse = await clientReverse(loc.latitude, loc.longitude)
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
