const crypto = require('crypto');
const axios = require('axios');

const HUNYUAN_API_BASE = 'https://api.hunyuan.tencentcloudapi.com/v1';
const SECRET_ID = process.env.HUNYUAN_SECRET_ID;
const SECRET_KEY = process.env.HUNYUAN_SECRET_KEY;
const REGION = process.env.HUNYUAN_REGION || 'ap-guangzhou';

/**
 * 生成腾讯 API 签名
 */
function generateSignature(action, timestamp) {
  const date = new Date(timestamp * 1000).toISOString().split('T')[0];
  const secretDate = crypto
    .createHmac('sha256', 'TC3' + SECRET_KEY)
    .update(date)
    .digest();
  
  const secretService = crypto
    .createHmac('sha256', secretDate)
    .update('hunyuan')
    .digest();
  
  const secretSigning = crypto
    .createHmac('sha256', secretService)
    .update('tc3_request')
    .digest();
  
  return crypto
    .createHmac('sha256', secretSigning)
    .update(action)
    .digest('hex');
}

/**
 * 创建 3D 生成任务
 * @param {string[]} imageUrls - 照片 URL 数组
 * @param {Object} options - 可选配置
 * @param {boolean} options.multiView - 是否多视角模式
 * @returns {Promise<Object>} 任务信息
 */
async function createTask(imageUrls, options = {}) {
  const { multiView = false } = options;

  try {
    if (!imageUrls || imageUrls.length === 0) {
      throw new Error('至少需要一张图片');
    }

    const timestamp = Math.floor(Date.now() / 1000);
    const action = 'ImageTo3D';
    
    const payload = {
      ImageUrl: imageUrls[0], // 主图（正面）
      Model: '3.0',
      FaceCount: 500000,
      ResultFormat: 'GLB'
    };

    // 多视角模式
    if (multiView && imageUrls.length >= 4) {
      payload.MultiViewImages = [];
      
      // 背面
      if (imageUrls[1]) {
        payload.MultiViewImages.push({
          ViewType: 'back',
          ViewImageUrl: imageUrls[1]
        });
      }
      
      // 左侧
      if (imageUrls[2]) {
        payload.MultiViewImages.push({
          ViewType: 'left',
          ViewImageUrl: imageUrls[2]
        });
      }
      
      // 右侧
      if (imageUrls[3]) {
        payload.MultiViewImages.push({
          ViewType: 'right',
          ViewImageUrl: imageUrls[3]
        });
      }
      
      // 顶视图（如果有第 5 张）
      if (imageUrls.length >= 5) {
        payload.MultiViewImages.push({
          ViewType: 'top',
          ViewImageUrl: imageUrls[4]
        });
      }
    }

    const signature = generateSignature(action, timestamp);

    console.log('📤 提交到混元 3D API:', JSON.stringify(payload, null, 2));

    const response = await axios.post(
      `${HUNYUAN_API_BASE}/images/3d`,
      payload,
      {
        headers: {
          'Authorization': `TC3-HMAC-SHA256 Credential=${SECRET_ID}/${timestamp}/${REGION}/hunyuan/tc3_request`,
          'X-TC-Action': action,
          'X-TC-Timestamp': timestamp.toString(),
          'X-TC-Signature': signature,
          'X-TC-Version': '2023-09-01',
          'Content-Type': 'application/json'
        }
      }
    );

    console.log('✅ 混元 3D 任务创建成功:', response.data.JobId);

    return {
      JobId: response.data.JobId,
      RequestId: response.data.RequestId
    };
  } catch (error) {
    console.error('❌ 混元 3D API 调用失败:', error);
    throw new Error(`混元 3D API 错误：${error.response?.data?.Message || error.message}`);
  }
}

/**
 * 查询任务状态
 * @param {string} jobId - 任务 ID
 * @returns {Promise<Object>} 任务状态
 */
async function getTaskStatus(jobId) {
  try {
    const timestamp = Math.floor(Date.now() / 1000);
    const action = 'QueryHunyuan3DTo3DProJob';
    
    const signature = generateSignature(action, timestamp);

    const response = await axios.post(
      `${HUNYUAN_API_BASE}/images/3d/describe`,
      {
        JobId: jobId
      },
      {
        headers: {
          'Authorization': `TC3-HMAC-SHA256 Credential=${SECRET_ID}/${timestamp}/${REGION}/hunyuan/tc3_request`,
          'X-TC-Action': action,
          'X-TC-Timestamp': timestamp.toString(),
          'X-TC-Signature': signature,
          'X-TC-Version': '2023-09-01',
          'Content-Type': 'application/json'
        }
      }
    );

    const data = response.data;
    
    console.log('🔍 任务状态:', data.Status);
    
    return {
      JobId: data.JobId,
      Status: data.Status,
      Message: data.Message,
      ModelUrls: data.ModelUrls,
      PreviewUrls: data.PreviewUrls
    };
  } catch (error) {
    console.error('❌ 查询任务状态失败:', error);
    throw new Error(`查询任务状态失败：${error.response?.data?.Message || error.message}`);
  }
}

/**
 * 获取模型下载 URL
 * @param {string} taskId - 任务 ID
 * @returns {Promise<Object>} 模型 URLs
 */
async function getModelUrls(taskId) {
  const status = await getTaskStatus(taskId);
  
  if (status.status !== 'SUCCEEDED') {
    throw new Error(`任务未完成，当前状态：${status.status}`);
  }
  
  return status.modelUrls;
}

module.exports = {
  createTask,
  getTaskStatus,
  getModelUrls,
  generateSignature
};
