const tasks = new Map();

function saveTask(taskId, taskInfo) {
  const task = {
    ...taskInfo,
    id: taskId,
    createdAt: new Date(),
    updatedAt: new Date()
  };
  tasks.set(taskId, task);
  console.log(`💾 任务已保存：${taskId}`);
  return task;
}

function getTask(taskId) {
  return tasks.get(taskId) || null;
}

function updateTask(taskId, updates) {
  const task = tasks.get(taskId);
  if (task) {
    tasks.set(taskId, {
      ...task,
      ...updates,
      updatedAt: new Date()
    });
  }
}

function getAllTasks() {
  return Array.from(tasks.entries()).map(([id, info]) => ({
    id,
    ...info
  }));
}

function deleteTask(taskId) {
  return tasks.delete(taskId);
}

module.exports = {
  saveTask,
  getTask,
  updateTask,
  getAllTasks,
  deleteTask
};
