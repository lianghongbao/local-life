// utils/upload.js
// OSS 上传工具：先请求后端拿 STS + V4 签名,再用 wx.uploadFile 直传 OSS
// 上传后从后端返回拿 URL,直接拿来做 <image src> 和入库,免再签
// 后端返回字段见 api/oss.api:host / file_key / url / oss / v4 / policy / expire_at

const { ossApi } = require('./api.js')

/**
 * 单文件直传
 * @param {string} filePath  本地临时路径(wx.chooseMedia 后拿到)
 * @param {object} opts
 * @param {'image'|'video'|'avatar'} opts.biz  业务场景,决定 dir 前缀
 * @returns {Promise<{fileKey: string, url: string}>}
 *   fileKey 纯 file_key(用于 dirty 比较 / 重传)
 *   url  URL(用于预览 / 入库)
 */
async function uploadFile(filePath, opts = {}) {
  const biz = opts.biz || 'post'
  const fileType = biz === 'avatar' ? 'avatar' : 'image'

  // 1. 从文件路径取后缀
  const dotIdx = filePath.lastIndexOf('.')
  const ext = dotIdx >= 0 ? filePath.slice(dotIdx + 1).toLowerCase() : 'jpg'
  const size = await getFileSize(filePath)

  // 2. 拿上传凭证
  const tok = await ossApi.getUploadToken({
    file_type: fileType,
    biz,
    ext,
    size
  })

  // 3. 拼 formData(V4 签名所需字段)
  //    后端 JSON 字段用 underscore(x_oss_*),前端读取后转成 dash(x-oss-*)作为 form 字段名
  //    OSS PostObject 严格要求 dash 形式
  //    form 顺序:key → policy → x-oss-* → success_action_status
  const formData = {
    key: tok.file_key,
    policy: tok.policy,
    'x-oss-signature-version': tok.v4.x_oss_signature_version,
    'x-oss-credential':        tok.v4.x_oss_credential,
    'x-oss-date':              tok.v4.x_oss_date,
    'x-oss-signature':         tok.v4.x_oss_signature,
    'x-oss-security-token':    tok.oss.security_token,
    success_action_status: '200'
  }

  // 4. 直传 OSS(不上走后端)
  await new Promise((resolve, reject) => {
    wx.uploadFile({
      url: tok.host,
      filePath,
      name: 'file',
      formData,
      success: (res) => {
        // OSS 返回 200 字符串,判断 statusCode
        if (res.statusCode >= 200 && res.statusCode < 300) resolve(res)
        else reject(new Error('OSS 上传失败: ' + res.statusCode))
      },
      fail: (err) => reject(err)
    })
  })

  return {
    fileKey: tok.file_key,
    url: tok.url
  }
}

function getFileSize(filePath) {
  return new Promise((resolve) => {
    // wx.getFileInfo 只能拿到已下载的文件,本地临时路径拿不到 size
    // 这里给个估算值或 0(不强制服务端按 size 校验)
    resolve(0)
  })
}

module.exports = {
  uploadFile
}
