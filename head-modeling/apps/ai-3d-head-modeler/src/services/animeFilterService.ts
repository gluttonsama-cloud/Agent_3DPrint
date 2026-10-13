import * as tf from '@tensorflow/tfjs';

let model: tf.GraphModel | null = null;

// 模型源：首选 JSDelivr CDN（更好的 CORS 支持），备选本地路径
const MODEL_CDN_URL = 'https://cdn.jsdelivr.net/gh/tonylianlong/AnimeGAN.js@gh-pages/model_full/model.json';
const MODEL_LOCAL_URL = '/models/animegan/model.json';

/**
 * 加载动漫化模型
 */
export async function loadAnimeModel() {
  if (model) return model;
  
  // 尝试顺序：1. 本地模型 2. CDN 模型
  const urls = [MODEL_LOCAL_URL, MODEL_CDN_URL];
  let lastError = null;

  for (const url of urls) {
    try {
      console.log(`[AnimeFilter] 尝试加载模型: ${url}`);
      model = await tf.loadGraphModel(url);
      console.log(`[AnimeFilter] 模型加载成功: ${url}`);
      return model;
    } catch (error) {
      console.warn(`[AnimeFilter] 无法从 ${url} 加载模型: (尝试下一个)`);
      lastError = error;
    }
  }

  throw new Error(`无法加载动漫化模型。请确保网络连接正常或已配置本地模型。详情: ${lastError}`);
}

/**
 * 将普通照片转换为动漫风格
 * @param imgElement HTMLImageElement
 * @returns Promise<string> Base64 DataURL
 */
export async function stylizeImage(imgElement: HTMLImageElement): Promise<string> {
  if (!model) {
    await loadAnimeModel();
  }

  const output = tf.tidy(() => {
    // 1. 预处理：调整大小至 256x256 (模型要求)
    const tensor = tf.browser.fromPixels(imgElement)
      .resizeNearestNeighbor([256, 256])
      .toFloat();
    
    // 2. 归一化 [-1, 1]
    const offset = tf.scalar(127.5);
    const normalized = tensor.sub(offset).div(offset).expandDims(0);
    
    // 3. 推理
    const result = model!.predict(normalized) as tf.Tensor;
    
    // 4. 后处理：缩放回 [0, 255]
    const squeezed = result.squeeze();
    return squeezed.mul(offset).add(offset).clipByValue(0, 255).toInt() as tf.Tensor3D;
  });

  // 异步像素读取必须在 tidy 作用域之外完成，结束后显式释放输出张量。
  try {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    await tf.browser.toPixels(output, canvas);
    return canvas.toDataURL('image/png');
  } finally {
    output.dispose();
  }
}
