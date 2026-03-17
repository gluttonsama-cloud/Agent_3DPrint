const tencentcloud = require("tencentcloud-sdk-nodejs-ai3d");
const fs = require('fs');
const axios = require('axios');

const Ai3dClient = tencentcloud.ai3d.v20250513.Client;

const SECRET_ID = process.env.HUNYUAN_SECRET_ID;
const SECRET_KEY = process.env.HUNYUAN_SECRET_KEY;
const REGION = process.env.HUNYUAN_REGION || 'ap-guangzhou';

const clientConfig = {
  credential: {
    secretId: SECRET_ID,
    secretKey: SECRET_KEY,
  },
  region: REGION,
  profile: {
    httpProfile: {
      endpoint: "ai3d.tencentcloudapi.com",
    },
  },
};

const client = new Ai3dClient(clientConfig);

async function downloadAsBase64(url) {
  try {
    const response = await axios.get(url, { 
      responseType: 'arraybuffer',
      timeout: 30000
    });
    return Buffer.from(response.data, 'binary').toString('base64');
  } catch (error) {
    console.error('下载图片失败:', error.message);
    throw new Error(`下载图片失败：${error.message}`);
  }
}

async function createTask(imageData, options = {}) {
  try {
    if (!imageData || imageData.length === 0) {
      throw new Error('至少需要一张图片');
    }

    const { useBase64 = false } = options;

    console.log('📤 提交到混元 3D API');

    let params = {
      Model: '3.0',
      ResultFormat: 'GLB'
    };

    if (useBase64) {
      params.ImageBase64 = imageData[0];
      console.log('📷 使用 Base64 图片数据');
    } else {
      const imageUrl = imageData[0];
      const isQiniuInternal = imageUrl.includes('qiniucs.com');
      
      if (isQiniuInternal) {
        console.log('🔄 检测到内网域名，下载图片转 Base64...');
        const base64Data = await downloadAsBase64(imageUrl);
        params.ImageBase64 = base64Data;
      } else {
        params.ImageUrl = imageUrl;
        console.log('📷 使用图片 URL:', imageUrl);
      }
    }

    const response = await client.SubmitHunyuanTo3DProJob(params);

    console.log('✅ 混元 3D 任务创建成功:', response.JobId);

    return {
      JobId: response.JobId,
      RequestId: response.RequestId
    };
  } catch (error) {
    console.error('❌ 混元 3D API 调用失败:', error);
    throw new Error(`混元 3D API 错误：${error.message}`);
  }
}

async function getTaskStatus(jobId) {
  try {
    const params = {
      JobId: jobId
    };

    const response = await client.QueryHunyuanTo3DProJob(params);

    console.log('🔍 任务状态:', response.Status);

    return {
      JobId: jobId,
      Status: response.Status,
      ErrorMessage: response.ErrorMessage,
      ErrorCode: response.ErrorCode,
      ResultFile3Ds: response.ResultFile3Ds,
      ResultCreditConsumed: response.ResultCreditConsumed
    };
  } catch (error) {
    console.error('❌ 查询任务状态失败:', error);
    throw new Error(`查询任务状态失败：${error.message}`);
  }
}

async function getModelUrls(taskId) {
  const status = await getTaskStatus(taskId);
  
  if (status.Status !== 'SUCCESS') {
    throw new Error(`任务未完成，当前状态：${status.Status}`);
  }
  
  return status.ModelUrls;
}

module.exports = {
  createTask,
  getTaskStatus,
  getModelUrls
};
