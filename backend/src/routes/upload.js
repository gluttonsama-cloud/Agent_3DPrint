const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const qiniu = require('../services/qiniu');
const taskStore = require('../services/taskStore');
const hunyuan3d = require('../services/hunyuan3d');
const hybridScheduler = require('../services/hybridScheduler');

const router = express.Router();

// 配置 multer（临时存储）
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

// 文件过滤（仅允许图片）
const fileFilter = (req, file, cb) => {
  const allowedTypes = /jpeg|jpg|png|webp/;
  const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
  const mimetype = allowedTypes.test(file.mimetype);
  
  if (extname && mimetype) {
    cb(null, true);
  } else {
    cb(new Error('仅支持图片格式（JPEG/PNG/WEBP）'), false);
  }
};

// 限制配置
const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 8 * 1024 * 1024,
    files: 5
  }
});

/**
 * POST /api/upload
 * 上传照片并创建 3D 任务
 */
router.post('/', upload.array('photos', 5), async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR',
        message: '至少需要上传 1 张照片'
      });
    }

    const files = req.files;
    const { mode = 'single', enableBackgroundRemoval = false } = req.body;

    console.log(`📤 收到上传请求：${files.length} 张照片，模式：${mode}`);

    // 1. 上传到七牛云
    const uploadPromises = files.map(async (file) => {
      const objectKey = `photos/${Date.now()}-${uuidv4()}.jpg`;
      
      try {
        const result = await qiniu.uploadFile(file.path, objectKey);
        
        // 删除临时文件
        fs.unlinkSync(file.path);
        
        return result.url;
      } catch (error) {
        console.error('上传到七牛云失败:', error);
        // 清理临时文件
        if (fs.existsSync(file.path)) {
          fs.unlinkSync(file.path);
        }
        throw error;
      }
    });

    const photoUrls = await Promise.all(uploadPromises);
    console.log(`✅ 照片上传到七牛云成功：${photoUrls.length} 张`);

    // 2. 创建任务记录
    const taskId = `task-${Date.now()}-${uuidv4().substring(0, 8)}`;
    const task = taskStore.saveTask(taskId, {
      type: mode === 'multiview' ? 'hunyuan-multiview' : 'hunyuan-single',
      photoUrls,
      status: 'PENDING',
      progress: 0,
      mode,
      enableBackgroundRemoval
    });

    console.log(`💾 任务已保存：${taskId}`);

    // 3. 异步提交到混合调度器（不阻塞响应）
    setImmediate(async () => {
      try {
        // 更新任务状态
        taskStore.updateTask(taskId, {
          status: 'IN_PROGRESS',
          progress: 10,
          statusMessage: '正在提交到 3D 生成服务...'
        });

        // 使用混合调度器提交
        const result = await hybridScheduler.submitTask(taskId, photoUrls, {
          mode
        });

        if (result.success) {
          console.log(`✅ 混合调度器提交成功：${result.provider}`);
          
          taskStore.updateTask(taskId, {
            progress: 20,
            statusMessage: `${result.provider === 'hunyuan' ? '混元 3D' : 'Replicate'} 正在处理中...`
          });
        } else {
          console.error('❌ 混合调度器提交失败:', result.error);
          
          taskStore.updateTask(taskId, {
            status: 'FAILED',
            error: result.error,
            errorCode: result.errorCode || 'SUBMIT_ERROR'
          });
        }

      } catch (error) {
        console.error('混合调度器错误:', error);
        taskStore.updateTask(taskId, {
          status: 'FAILED',
          error: `提交失败：${error.message}`,
          errorCode: 'SCHEDULER_ERROR'
        });
      }
    });

    // 4. 立即返回响应
    res.status(200).json({
      success: true,
      taskId,
      status: 'PENDING',
      message: '照片上传成功，任务已创建',
      photos: photoUrls,
      estimatedTime: mode === 'multiview' ? '4-6 分钟' : '3-5 分钟'
    });

  } catch (error) {
    console.error('上传 API 错误:', error);
    
    // 清理临时文件
    if (req.files) {
      req.files.forEach(file => {
        if (fs.existsSync(file.path)) {
          fs.unlinkSync(file.path);
        }
      });
    }

    res.status(500).json({
      success: false,
      error: 'UPLOAD_ERROR',
      message: error.message || '上传失败，请稍后重试'
    });
  }
});

module.exports = router;
