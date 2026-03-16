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
    
    // 如果没有 providerJobId，说明还没提交到 API
    if (!localTask.providerJobId) {
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
      status = apiStatus.Status === 'SUCCESS' ? 'SUCCEEDED' :
               apiStatus.Status === 'FAILED' ? 'FAILED' : 'IN_PROGRESS';
      progress = apiStatus.Progress || 0;
      modelUrls = apiStatus.ModelUrls;
      error = apiStatus.Message;
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
    
    res.json({
      success: true,
      taskId,
      status,
      progress,
      modelUrls,
      error: error,
      provider: localTask.provider,
      photoCount: localTask.photoUrls?.length || 0
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
