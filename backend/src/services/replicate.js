const axios = require('axios');

const REPLICATE_API = 'https://api.replicate.com/v1';
const API_KEY = process.env.REPLICATE_API_KEY;

async function createTask(imageUrl) {
  try {
    const response = await axios.post(
      `${REPLICATE_API}/predictions`,
      {
        version: '93e292f171540b18e3e8b10c5dc8b229ecc4f2e8b1c8b1e8b1c8b1e8b1c8b1e8',
        input: { 
          image: imageUrl,
          num_inference_steps: 30,
          guidance_scale: 7.5
        }
      },
      {
        headers: {
          'Authorization': `Token ${API_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );

    return response.data.id;
  } catch (error) {
    console.error('Replicate API Error:', error.response?.data || error.message);
    throw new Error(`创建 Replicate 任务失败：${error.message}`);
  }
}

async function getTaskStatus(predictionId) {
  try {
    const response = await axios.get(
      `${REPLICATE_API}/predictions/${predictionId}`,
      {
        headers: {
          'Authorization': `Token ${API_KEY}`
        }
      }
    );

    const data = response.data;
    
    return {
      status: data.status,
      output: data.output || null,
      error: data.error || null
    };
  } catch (error) {
    console.error('Replicate API Error:', error.response?.data || error.message);
    throw new Error(`查询 Replicate 任务状态失败：${error.message}`);
  }
}

async function getModelUrls(predictionId) {
  const status = await getTaskStatus(predictionId);
  
  if (status.status !== 'succeeded') {
    throw new Error(`Replicate 任务未完成，当前状态：${status.status}`);
  }
  
  return {
    glb: status.output?.[0] || null,
    obj: status.output?.[0] || null
  };
}

module.exports = {
  createTask,
  getTaskStatus,
  getModelUrls
};
