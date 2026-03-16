/**
 * 背景抠图 API 路由
 * POST /api/remove-background - 去除图片背景
 */

const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const qiniu = require('../services/qiniu');
const backgroundRemoval = require('../services/backgroundRemoval');

const router = express.Router();

// 配置 multer
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, '../../uploads');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueName = `${Date.now()}-${uuidv4()}${path.extname(file.originalname)}`;
    cb(null, uniqueName);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|webp/;
    if (allowedTypes.test(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('仅支持图片格式'), false);
    }
  }
});

/**
 * POST /api/remove-background
 * 去除图片背景
 */
router.post('/', upload.single('image'), async (req, res) => {
  const startTime = Date.now();
  
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR',
        message: '请上传图片文件'
      });
    }

    console.log(`🎨 收到背景抠图请求：${req.file.filename}`);

    // 1. 调用背景抠图服务（从本地文件）
    const processedBuffer = await backgroundRemoval.removeBackgroundFromFile(req.file.path, {
      format: 'png'
    });

    // 2. 上传处理后的图片到七牛云
    const objectKey = `processed/${Date.now()}-${uuidv4()}.png`;
    const uploadResult = await qiniu.uploadBuffer(processedBuffer, objectKey, {
      contentType: 'image/png'
    });

    // 3. 清理临时文件
    fs.unlinkSync(req.file.path);

    const processingTime = ((Date.now() - startTime) / 1000).toFixed(2);

    console.log(`✅ 背景抠图完成，耗时：${processingTime}秒`);

    res.json({
      success: true,
      originalUrl: req.file.originalname,
      processedUrl: uploadResult.url,
      format: 'png',
      processingTime: `${processingTime}秒`
    });

  } catch (error) {
    console.error('背景抠图失败:', error);
    
    // 清理临时文件
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }

    res.status(500).json({
      success: false,
      error: 'BACKGROUND_REMOVAL_ERROR',
      message: error.message || '背景抠图失败'
    });
  }
});

/**
 * POST /api/remove-background/url
 * 从 URL 去除背景
 */
router.post('/url', async (req, res) => {
  const startTime = Date.now();
  
  try {
    const { imageUrl, format = 'png' } = req.body;

    if (!imageUrl) {
      return res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR',
        message: '请提供图片 URL'
      });
    }

    console.log(`🎨 收到 URL 背景抠图请求：${imageUrl}`);

    // 1. 调用背景抠图服务
    const processedBuffer = await backgroundRemoval.removeBackground(imageUrl, {
      format
    });

    // 2. 上传处理后的图片到七牛云
    const objectKey = `processed/${Date.now()}-${uuidv4()}.${format}`;
    const uploadResult = await qiniu.uploadBuffer(processedBuffer, objectKey, {
      contentType: `image/${format}`
    });

    const processingTime = ((Date.now() - startTime) / 1000).toFixed(2);

    console.log(`✅ URL 背景抠图完成，耗时：${processingTime}秒`);

    res.json({
      success: true,
      originalUrl: imageUrl,
      processedUrl: uploadResult.url,
      format,
      processingTime: `${processingTime}秒`
    });

  } catch (error) {
    console.error('URL 背景抠图失败:', error);

    res.status(500).json({
      success: false,
      error: 'BACKGROUND_REMOVAL_ERROR',
      message: error.message || '背景抠图失败'
    });
  }
});

/**
 * GET /api/remove-background/balance
 * 查询账户余额
 */
router.get('/balance', async (req, res) => {
  try {
    const balance = await backgroundRemoval.getAccountBalance();
    
    res.json({
      success: true,
      balance: balance.balance,
      unit: balance.unit,
      available: balance.balance > 0
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'QUERY_ERROR',
      message: error.message
    });
  }
});

/**
 * GET /api/remove-background/health
 * 健康检查
 */
router.get('/health', async (req, res) => {
  try {
    const healthy = await backgroundRemoval.checkHealth();
    
    res.json({
      success: true,
      healthy,
      provider: 'PicWish',
      message: healthy ? 'API 可用' : 'API 不可用'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      healthy: false,
      error: error.message
    });
  }
});

module.exports = router;
