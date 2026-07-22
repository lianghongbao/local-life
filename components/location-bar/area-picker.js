// components/location-bar/area-picker.js
// 区/镇选择器:
//   - cityAdcode 非空 → 显示该城市的区(可切镇)
//   - cityAdcode 为空 → 显示"全国热门城市"列表,选完城市再选区
//   - 顶部搜索框:有 cityAdcode 时按区名搜;无 cityAdcode 时按城市名搜
const { request } = require('../../utils/api.js');

Component({
  properties: {
    cityAdcode: { type: String, value: '' },
    areaAdcode: { type: String, value: '' },
  },
  data: {
    tab: 'area',          // 'area' | 'street'
    items: [],            // 当前 tab 下的列表(区或城市)
    streets: [],
    loading: false,
    error: '',
    keyword: '',          // 搜索框
    searching: false,
  },
  observers: {
    'cityAdcode, areaAdcode': function (cityAdcode, areaAdcode) {
      // cityAdcode 为空 → 显示城市列表
      // cityAdcode 非空 → 加载该城市的区
      if (cityAdcode) {
        this._loadAreas(cityAdcode);
        if (areaAdcode) this._loadStreets(areaAdcode);
      } else {
        this._loadCities();
      }
    },
    'keyword': function (kw) {
      // 防抖搜索
      if (this._searchTimer) clearTimeout(this._searchTimer)
      this._searchTimer = setTimeout(() => {
        this._doSearch(kw)
      }, 300)
    },
  },
  methods: {
    switchTab(e) {
      const tab = e.currentTarget.dataset.tab;
      this.setData({ tab });
    },
    onKeywordInput(e) {
      this.setData({ keyword: e.detail.value });
    },
    onClearKeyword() {
      this.setData({ keyword: '' });
    },
    /**
     * 防抖触发的实际搜索
     */
    _doSearch(kw) {
      const app = getApp()
      const cityAdcode = app && app.globalData && app.globalData.bootstrapLocation
        ? app.globalData.bootstrapLocation.city_adcode
        : ''
      // 注意:这里直接用 properties.cityAdcode,因为 picker 关闭后 globalData 会被外部更新
      const targetCity = this.data.cityAdcode || cityAdcode

      if (!targetCity) {
        // 没城市 → 按城市名搜
        this._loadCities(kw)
      } else {
        // 有城市 → 按区名搜
        this._loadAreas(targetCity, kw)
      }
    },

    /**
     * 加载城市列表(无 cityAdcode 时)
     * @param {string} keyword 可选,城市名搜索
     */
    async _loadCities(keyword) {
      this.setData({ loading: true, error: '' });
      try {
        const data = await request({
          url: '/api/v1/geo/cities',
          auth: false,
          silent: true,
          data: keyword ? { keyword, limit: 50 } : { limit: 50 }
        });
        this.setData({
          items: data.items || [],
          loading: false,
          tab: 'area' // 切回 area tab 显示城市列表
        });
      } catch (e) {
        this.setData({ loading: false, error: '城市列表加载失败' });
      }
    },

    async _loadAreas(cityAdcode, keyword) {
      this.setData({ loading: true, error: '' });
      try {
        const data = await request({
          url: '/api/v1/geo/areas',
          auth: false,
          silent: true,
          data: { city_adcode: cityAdcode, keyword: keyword || '', limit: 50 }
        });
        this.setData({ items: data.items || [], loading: false });
      } catch (e) {
        this.setData({ loading: false, error: '区列表加载失败' });
      }
    },

    async _loadStreets(areaAdcode) {
      try {
        const data = await request({
          url: `/api/v1/geo/streets?area_adcode=${areaAdcode}`,
          auth: false,
          silent: true,
        });
        this.setData({ streets: data.items || [] });
      } catch (e) {
        this.setData({ error: '镇列表加载失败' });
      }
    },

    /**
     * 当前 items 是城市还是区,由 tab + cityAdcode 决定
     * - 没 cityAdcode:items 是城市,onSelectItem 触发 selectCity
     * - 有 cityAdcode:items 是区,onSelectItem 触发 select
     */
    onSelectItem(e) {
      const item = e.currentTarget.dataset.item;
      const app = getApp();
      if (!this.data.cityAdcode) {
        // 选城市 → 切换 picker 模式加载该城市的区
        this.triggerEvent('selectCity', { cityAdcode: item.city_adcode, cityName: item.city_name });
        return;
      }
      // 选区
      this.triggerEvent('select', { areaAdcode: item.area_adcode, areaName: item.area_name });
    },

    onSelectStreet(e) {
      const item = e.currentTarget.dataset.item;
      const app = getApp();
      if (app && app.globalData) {
        app.globalData.selectedStreet = item.street_name;
      }
      this.triggerEvent('select', { areaAdcode: this.data.areaAdcode, streetName: item.street_name });
    },

    onClose() {
      this.triggerEvent('close');
    },
  },
});