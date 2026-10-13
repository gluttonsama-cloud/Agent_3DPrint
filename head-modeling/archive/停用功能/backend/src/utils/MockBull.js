/**
 * Mock Bull Queue - 简单队列实现
 * 用于 Mock 模式，不需要真实 Redis
 */

class MockJob {
  constructor(id, data, options = {}) {
    this.id = id;
    this.data = data;
    this.opts = options;
    this.timestamp = Date.now();
  }

  async log() {
    console.log(`[Mock Job] ${this.id}:`, this.data);
  }
}

class MockQueue {
  constructor(name, connection, options = {}) {
    this.name = name;
    this.connection = connection;
    this.options = options;
    this.jobs = new Map();
    this.processors = [];
    this.jobCounter = 0;
    
    console.log(`[Mock Queue] 创建队列：${name}`);
  }

  async add(data, options = {}) {
    const jobId = ++this.jobCounter;
    const job = new MockJob(jobId, data, options);
    this.jobs.set(jobId, job);
    
    // 异步触发处理器
    setTimeout(() => {
      this.processors.forEach(processor => {
        processor(job).catch(err => {
          console.error(`[Mock Queue] 处理错误:`, err);
        });
      });
    }, 0);
    
    return job;
  }

  async addBulk(jobs) {
    return Promise.all(jobs.map(job => this.add(job.data, job.opts)));
  }

  process(...args) {
    const processor = args.length === 1 ? args[0] : args[1];
    this.processors.push(processor);
  }

  async getJobs(types) {
    return Array.from(this.jobs.values());
  }

  async getJobCounts() {
    return {
      active: 0,
      completed: 0,
      failed: 0,
      delayed: 0,
      waiting: this.jobs.size
    };
  }

  async close() {
    console.log(`[Mock Queue] 关闭队列：${this.name}`);
    this.jobs.clear();
    this.processors = [];
  }

  async empty() {
    this.jobs.clear();
  }

  async pause() {
    console.log(`[Mock Queue] 暂停队列：${this.name}`);
  }

  async resume() {
    console.log(`[Mock Queue] 恢复队列：${this.name}`);
  }

  async clean(grace, status) {
    console.log(`[Mock Queue] 清理队列：${this.name}`);
  }

  async obliterate() {
    await this.empty();
    await this.close();
  }

  on(event, callback) {
    // Mock 事件监听
  }

  async isReady() {
    return true;
  }
}

// Mock Bull 主函数
function createQueue(name, connection, options) {
  return new MockQueue(name, connection, options);
}

// 导出
module.exports = createQueue;
module.exports.Queue = createQueue;
