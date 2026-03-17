const express = require('express');
const taskStore = require('../services/taskStore');
const hunyuan3d = require('../services/hunyuan3d');
const replicate = require('../services/replicate');

const router = express.Router();

router.get('/:taskId', async (req, res) => {
  try {
    const { taskId } = req.params;
    
    const localTask = taskStore.getTask(taskId);
    
    if (!localTask) {
      return res.status(404).json({
        error: '任务不存在',
        message: 'Task not found'
      });
    }
    
    // 如果任务还在 PENDING 状态，还没提交到 API
    if (localTask.status === 'PENDING') {
      return res.json({
        success: true,
        taskId,
        status: 'PENDING',
        progress: localTask.progress || 0,
        statusMessage: '正在准备提交任务...',
        createdAt: localTask.createdAt
      });
    }
    
    // 如果没有 providerJobId，说明还没提交到 API 或者提交失败
    if (!localTask.providerJobId) {
      // 检查是否提交失败
      if (localTask.status === 'FAILED' || localTask.schedulerStatus === 'FAILED') {
        return res.json({
          success: true,
          taskId,
          status: 'FAILED',
          progress: localTask.progress || 10,
          statusMessage: localTask.schedulerMessage || localTask.statusMessage || '任务处理失败',
          error: localTask.hunyuanError?.message || localTask.errorMessage || '任务处理失败',
          debug: {
            schedulerStatus: localTask.schedulerStatus,
            hunyuanError: localTask.hunyuanError
          }
        });
      }
      
      return res.json({
        success: true,
        taskId,
        status: localTask.status || 'IN_PROGRESS',
        progress: localTask.progress || 10,
        statusMessage: localTask.statusMessage || '正在提交到 3D API...'
      });
    }
    
    let apiStatus;
    if (localTask.provider === 'hunyuan') {
      apiStatus = await hunyuan3d.getTaskStatus(localTask.providerJobId);
    } else if (localTask.provider === 'replicate') {
      apiStatus = await replicate.getTaskStatus(localTask.providerJobId);
    } else {
      throw new Error(`未知的 provider: ${localTask.provider}`);
    }
    
    let status, progress, modelUrls, error;
    
    if (localTask.provider === 'hunyuan') {
      const hunyuanStatus = apiStatus.Status;
      status = hunyuanStatus === 'DONE' ? 'SUCCEEDED' :
               hunyuanStatus === 'FAIL' ? 'FAILED' : 'IN_PROGRESS';
      
      const progressMap = { 'WAIT': 10, 'RUN': 50, 'DONE': 100, 'FAIL': 0 };
      progress = progressMap[hunyuanStatus] || 0;
      
      modelUrls = apiStatus.ResultFile3Ds?.map(f => f.Url) || [];
      error = apiStatus.ErrorMessage;
    } else {
      status = apiStatus.status === 'succeeded' ? 'SUCCEEDED' :
               apiStatus.status === 'failed' ? 'FAILED' : 'IN_PROGRESS';
      progress = status === 'SUCCEEDED' ? 100 : status === 'IN_PROGRESS' ? 50 : 0;
      modelUrls = apiStatus.output;
      error = apiStatus.error;
    }
    
taskStore.updateTask(taskId, {
      status,
      progress,
      modelUrls,
      errorMessage: error
    });

    if (status === 'SUCCEEDED' && modelUrls && modelUrls.length > 0) {
      try {
        const qiniu = require('../services/qiniu');
        const axios = require('axios');
        
        const uploadedUrls = [];
        for (let i = 0; i < modelUrls.length; i++) {
          const url = modelUrls[i];
          if (url.endsWith('.glb') || url.endsWith('.zip')) {
            console.log(`📥 下载模型文件: ${url.substring(0, 60)}...`);
            
            const response = await axios.get(url, { responseType: 'arraybuffer', timeout: 60000 });
            const buffer = Buffer.from(response.data);
            
            const ext = url.endsWith('.glb') ? 'glb' : 'zip';
            const fileName = `models/${taskId}-${Date.now()}-${i}.${ext}`;
            
            const tempPath = require('path').join(require('os').tmpdir(), fileName.replace('/', '_'));
            require('fs').writeFileSync(tempPath, buffer);
            
            const uploadResult = await qiniu.uploadFile(tempPath, fileName);
            require('fs').unlinkSync(tempPath);
            
            uploadedUrls.push(uploadResult.url);
            console.log(`✅ 模型已上传到七牛云: ${uploadResult.url}`);
          }
        }
        
        if (uploadedUrls.length > 0) {
          taskStore.updateTask(taskId, {
            modelUrls: uploadedUrls
          });
          modelUrls = uploadedUrls;
        }
      } catch (uploadError) {
        console.error('上传模型到七牛云失败:', uploadError.message);
      }
    }
    
    res.json({
      success: true,
      taskId,
      status,
      progress,
      modelUrls,
      error: error,
      provider: localTask.provider,
      photoCount: localTask.photoUrls?.length || 0,
      providerJobId: localTask.providerJobId
    });
    
  } catch (error) {
    console.error('查询状态错误:', error);
    res.status(500).json({
      error: '查询失败',
      message: error.message
    });
  }
});

module.exports = router;
