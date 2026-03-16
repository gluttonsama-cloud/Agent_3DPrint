/**
 * Mock 数据库连接测试脚本
 * 验证 MongoDB 和 Redis Mock 模式是否正常工作
 */

const { connect } = require('./src/db/connect');
const redis = require('./src/config/redis');

async function testMockDB() {
  console.log('\n=== 🧪 Mock 数据库连接测试 ===\n');
  
  let db;
  let redisClient;
  
  try {
    // ========== MongoDB 测试 ==========
    console.log('📦 1. 测试 MongoDB 连接...');
    db = await connect();
    console.log('   ✅ MongoDB 连接成功\n');
    
    console.log('📦 2. 测试 MongoDB 插入...');
    const testCollection = db.collection('test-models');
    const insertResult = await testCollection.insertOne({
      name: 'Test 3D Model',
      status: 'pending',
      createdAt: new Date(),
      metadata: {
        views: 0,
        tags: ['test', 'mock']
      }
    });
    console.log('   ✅ 插入成功，ID:', insertResult.insertedId);
    
    console.log('\n📦 3. 测试 MongoDB 查询...');
    const found = await testCollection.findOne({ name: 'Test 3D Model' });
    console.log('   ✅ 查询结果:', {
      name: found.name,
      status: found.status,
      tags: found.metadata.tags
    });
    
    console.log('\n📦 4. 测试 MongoDB 更新...');
    const updateResult = await testCollection.updateOne(
      { name: 'Test 3D Model' },
      { $set: { status: 'completed', 'metadata.views': 1 } }
    );
    console.log('   ✅ 更新成功，修改了', updateResult.modifiedCount, '个文档');
    
    console.log('\n📦 5. 验证更新结果...');
    const updated = await testCollection.findOne({ name: 'Test 3D Model' });
    console.log('   ✅ 当前状态:', updated.status, ', 浏览次数:', updated.metadata.views);
    
    console.log('\n📦 6. 测试 MongoDB 计数...');
    const count = await testCollection.countDocuments({});
    console.log('   ✅ 文档总数:', count);
    
    console.log('\n📦 7. 测试 MongoDB 查询（带条件）...');
    const withFilter = await testCollection.find({ status: 'completed' }).toArray();
    console.log('   ✅ 找到', withFilter.length, '个已完成的文档');
    
    // ========== Redis 测试 ==========
    console.log('\n🔴 8. 测试 Redis 连接...');
    redisClient = redis.createRedisClient();
    const pingResult = await redisClient.ping();
    console.log('   ✅ Redis PING 响应:', pingResult);
    
    console.log('\n🔴 9. 测试 Redis SET/GET...');
    await redisClient.set('test-key', 'test-value');
    const getValue = await redisClient.get('test-key');
    console.log('   ✅ SET/GET 测试:', getValue);
    
    console.log('\n🔴 10. 测试 Redis 过期时间...');
    await redisClient.set('expiring-key', 'will-expire', 'EX', 5); // 5 秒过期
    const ttl = await redisClient.ttl('expiring-key');
    console.log('   ✅ 设置过期时间，剩余 TTL:', ttl, '秒');
    
    console.log('\n🔴 11. 测试 Redis 列表...');
    await redisClient.lpush('queue', 'task-3', 'task-2', 'task-1');
    const queueLength = await redisClient.llen('queue');
    console.log('   ✅ 列表长度:', queueLength);
    
    const firstTask = await redisClient.lpop('queue');
    console.log('   ✅ 弹出第一个任务:', firstTask);
    
    console.log('\n🔴 12. 测试 Redis 哈希...');
    await redisClient.hset('user:1001', 
      'name', '张三',
      'email', 'zhangsan@example.com',
      'age', '25'
    );
    const userName = await redisClient.hget('user:1001', 'name');
    console.log('   ✅ 哈希字段 name:', userName);
    
    const allFields = await redisClient.hgetall('user:1001');
    console.log('   ✅ 所有哈希字段:', allFields);
    
    console.log('\n🔴 13. 测试 Redis 计数器...');
    await redisClient.set('counter', '0');
    await redisClient.incr('counter');
    await redisClient.incrby('counter', 10);
    const counterValue = await redisClient.get('counter');
    console.log('   ✅ 计数器当前值:', counterValue);
    
    console.log('\n🔴 14. 测试 Redis KEYS 模式匹配...');
    const keys = await redisClient.keys('user:*');
    console.log('   ✅ 匹配到的键:', keys);
    
    // ========== 清理 ==========
    console.log('\n🧹 清理测试数据...');
    await testCollection.deleteMany({});
    await redisClient.del('test-key', 'expiring-key', 'queue', 'user:1001', 'counter');
    console.log('   ✅ 测试数据已清理');
    
    // ========== 总结 ==========
    console.log('\n=== ✅ 所有测试通过！===\n');
    console.log('MongoDB Mock: ✅ 正常');
    console.log('Redis Mock:   ✅ 正常');
    console.log('\n可以开始使用 Mock 模式进行开发测试了！\n');
    
  } catch (error) {
    console.error('\n❌ 测试失败:\n');
    console.error('错误信息:', error.message);
    console.error('堆栈跟踪:', error.stack);
    console.error('\n请检查:\n');
    console.error('1. 是否设置了 MOCK_DB=true');
    console.error('2. 是否正确安装了 Mock 模块\n');
    
    process.exit(1);
  } finally {
    // 清理连接
    if (redisClient) {
      await redisClient.quit();
    }
    if (db) {
      await db.close();
    }
    
    // 延迟退出，确保清理完成
    setTimeout(() => {
      process.exit(0);
    }, 500);
  }
}

// 运行测试
console.log('\n按 Ctrl+C 可以随时退出测试\n');
testMockDB().catch(err => {
  console.error('未捕获的错误:', err);
  process.exit(1);
});
