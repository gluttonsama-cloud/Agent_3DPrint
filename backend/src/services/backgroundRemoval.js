/**
 * 背景抠图服务
 * 集成 PicWish 佐糖 API
 * 文档：https://picwish.cn/api-pricing
 */

const axios = require('axios');
const fs = require('fs');
const path = require('path');

const PICWISH_API_BASE = 'https://api.picwish.cn/api';
const API_KEY = process.env.PICWISH_API_KEY;

if (!API_KEY) {
  console.warn('⚠️  WARNING: PICWISH_API_KEY 未设置，背景抠图功能将不可用');
}

/**
 * 移除背景（PicWish API）
 * @param {string} imageUrl - 图片 URL 或本地路径
 * @param {Object} options - 可选配置
 * @param {string} options.format - 输出格式（png/jpg）
 * @param {string} options.bgColor - 背景颜色（jpg 格式时有效）
 * @returns {Promise<Buffer>} 处理后的图片 Buffer
 */
async function removeBackground(imageUrl, options = {}) {
  if (!API_KEY) {
    throw new Error('PICWISH_API_KEY 未配置');
  }

  try {
    console.log(`🎨 开始背景抠图（PicWish）：${imageUrl}`);

    const {
      format = 'png',
      bgColor = null
    } = options;

    // 构建请求参数
    const formData = new FormData();
    formData.append('image_url', imageUrl);
    formData.append('format', format);
    
    if (bgColor && format === 'jpg') {
      formData.append('bg_color', bgColor);
    }

    // 调用 PicWish API
    const response = await axios.post(
      `${PICWISH_API_BASE}/remove-background`,
      formData,
      {
        headers: {
          'Authorization': `Bearer ${API_KEY}`,
          'Content-Type': 'multipart/form-data'
        },
        responseType: 'arraybuffer',
        timeout: 30000
      }
    );

    console.log(`✅ 背景抠图完成，大小：${response.data.length} bytes`);
    
    return Buffer.from(response.data);

  } catch (error) {
    console.error('❌ PicWish API 调用失败:', error);
    
    if (error.response) {
      const statusCode = error.response.status;
      let errorMessage = '未知错误';
      
      try {
        const errorData = JSON.parse(Buffer.from(error.response.data).toString());
        errorMessage = errorData.message || errorData.error || 'API 错误';
      } catch (e) {
        errorMessage = error.response.statusText || 'HTTP 错误';
      }
      
      throw new Error(`PicWish API 错误 (${statusCode}): ${errorMessage}`);
    }
    
    throw new Error(`背景抠图失败：${error.message}`);
  }
}

/**
 * 批量移除背景
 * @param {string[]} imageUrls - 图片 URL 数组
 * @param {Object} options - 可选配置
 * @returns {Promise<Buffer[]>} 处理后的图片 Buffer 数组
 */
async function removeBackgrounds(imageUrls, options = {}) {
  console.log(`🎨 批量背景抠图：${imageUrls.length} 张`);
  
  const tasks = imageUrls.map(url => removeBackground(url, options));
  const results = await Promise.all(tasks);
  
  console.log(`✅ 批量抠图完成：${results.length} 张`);
  
  return results;
}

/**
 * 从本地文件移除背景
 * @param {string} filePath - 本地文件路径
 * @param {Object} options - 可选配置
 * @returns {Promise<Buffer>} 处理后的图片 Buffer
 */
async function removeBackgroundFromFile(filePath, options = {}) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`文件不存在：${filePath}`);
  }

  try {
    console.log(`🎨 从本地文件抠图：${filePath}`);

    const fileBuffer = fs.readFileSync(filePath);
    
    const formData = new FormData();
    formData.append('image_file', fileBuffer, {
      filename: path.basename(filePath),
      contentType: 'image/jpeg'
    });
    
    formData.append('format', options.format || 'png');

    const response = await axios.post(
      `${PICWISH_API_BASE}/remove-background`,
      formData,
      {
        headers: {
          'Authorization': `Bearer ${API_KEY}`,
          'Content-Type': 'multipart/form-data'
        },
        responseType: 'arraybuffer',
        timeout: 30000
      }
    );

    console.log(`✅ 本地文件抠图完成，大小：${response.data.length} bytes`);
    
    return Buffer.from(response.data);

  } catch (error) {
    console.error('❌ 本地文件抠图失败:', error);
    throw new Error(`抠图失败：${error.message}`);
  }
}

/**
 * 检查 API 可用性
 * @returns {Promise<boolean>}
 */
async function checkHealth() {
  try {
    if (!API_KEY) {
      return false;
    }
    
    // 简单测试：发送一个空请求检查 API Key 是否有效
    const response = await axios.get(
      `${PICWISH_API_BASE}/account/info`,
      {
        headers: {
          'Authorization': `Bearer ${API_KEY}`
        },
        timeout: 5000
      }
    );
    
    return response.status === 200;
  } catch (error) {
    console.error('PicWish API 健康检查失败:', error.message);
    return false;
  }
}

/**
 * 获取账户余额（算粒）
 * @returns {Promise<Object>}
 */
async function getAccountBalance() {
  try {
    if (!API_KEY) {
      throw new Error('API Key 未配置');
    }
    
    const response = await axios.get(
      `${PICWISH_API_BASE}/account/balance`,
      {
        headers: {
          'Authorization': `Bearer ${API_KEY}`
        },
        timeout: 5000
      }
    );
    
    return {
      balance: response.data.balance || 0,
      unit: response.data.unit || '点'
    };
  } catch (error) {
    console.error('获取账户余额失败:', error.message);
    return {
      balance: -1,
      unit: '点',
      error: error.message
    };
  }
}

module.exports = {
  removeBackground,
  removeBackgrounds,
  removeBackgroundFromFile,
  checkHealth,
  getAccountBalance
};
