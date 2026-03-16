const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  
  console.log('=== 开始全流程测试 ===\n');
  
  try {
    // 测试 1: 订单列表页
    console.log('📋 测试 1: 订单列表页');
    await page.goto('http://localhost:3000/orders', { waitUntil: 'networkidle' });
    const orderTitle = await page.textContent('h2');
    console.log('   页面标题:', orderTitle);
    await page.screenshot({ path: 'screenshots/orders-page.png' });
    console.log('   ✅ 截图保存\n');
    
    // 测试 2: 设备管理页
    console.log('🔧 测试 2: 设备管理页');
    await page.goto('http://localhost:3000/devices', { waitUntil: 'networkidle' });
    const deviceTitle = await page.textContent('h2');
    console.log('   页面标题:', deviceTitle);
    await page.screenshot({ path: 'screenshots/devices-page.png' });
    console.log('   ✅ 截图保存\n');
    
    // 测试 3: 库存管理页
    console.log('📦 测试 3: 库存管理页');
    await page.goto('http://localhost:3000/inventory', { waitUntil: 'networkidle' });
    const inventoryTitle = await page.textContent('h2');
    console.log('   页面标题:', inventoryTitle);
    await page.screenshot({ path: 'screenshots/inventory-page.png' });
    console.log('   ✅ 截图保存\n');
    
    // 测试 4: 仪表盘
    console.log('📊 测试 4: 仪表盘');
    await page.goto('http://localhost:3000/dashboard', { waitUntil: 'networkidle' });
    const dashboardTitle = await page.textContent('h2');
    console.log('   页面标题:', dashboardTitle);
    await page.screenshot({ path: 'screenshots/dashboard-page.png' });
    console.log('   ✅ 截图保存\n');
    
    console.log('=== ✅ 所有测试完成 ===');
  } catch (error) {
    console.error('❌ 测试失败:', error.message);
  } finally {
    await browser.close();
  }
})();
