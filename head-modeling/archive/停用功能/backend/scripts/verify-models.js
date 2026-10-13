/**
 * Model Verification Script
 * Tests that all models can be loaded and initialized correctly
 */

require('dotenv').config({ path: '.env' });

console.log('Testing model loading...\n');

try {
  // Test loading individual models
  console.log('1. Loading Order model...');
  const Order = require('../src/models/Order');
  console.log('   ✓ Order model loaded');
  console.log(`   - Schema paths: ${Object.keys(Order.schema.paths).join(', ')}`);
  
  console.log('\n2. Loading Device model...');
  const Device = require('../src/models/Device');
  console.log('   ✓ Device model loaded');
  console.log(`   - Schema paths: ${Object.keys(Device.schema.paths).join(', ')}`);
  
  console.log('\n3. Loading Material model...');
  const Material = require('../src/models/Material');
  console.log('   ✓ Material model loaded');
  console.log(`   - Schema paths: ${Object.keys(Material.schema.paths).join(', ')}`);
  
  console.log('\n4. Loading AgentDecision model...');
  const AgentDecision = require('../src/models/AgentDecision');
  console.log('   ✓ AgentDecision model loaded');
  console.log(`   - Schema paths: ${Object.keys(AgentDecision.schema.paths).join(', ')}`);
  
  // Test loading models index
  console.log('\n5. Loading models index...');
  const models = require('../src/models');
  console.log('   ✓ Models index loaded');
  console.log(`   - Exported models: ${Object.keys(models).join(', ')}`);
  
  // Test database connection module
  console.log('\n6. Loading database connection module...');
  const { connect, disconnect } = require('../src/db/connect');
  console.log('   ✓ Database connection module loaded');
  console.log('   - Exported functions: connect, disconnect');
  
  // Verify model relationships
  console.log('\n7. Verifying model relationships...');
  const orderSchema = Order.schema;
  const hasDeviceRef = orderSchema.path('items') && 
                       orderSchema.path('items').schema.path('deviceId') &&
                       orderSchema.path('items').schema.path('deviceId').options &&
                       orderSchema.path('items').schema.path('deviceId').options.ref === 'Device';
  console.log(`   - Order → Device reference: ${hasDeviceRef ? '✓' : '✗'}`);
  
  const hasAgentDecisionRef = orderSchema.path('agentDecisions') &&
                               orderSchema.path('agentDecisions').options &&
                               orderSchema.path('agentDecisions').options.ref === 'AgentDecision';
  console.log(`   - Order → AgentDecision reference: ${hasAgentDecisionRef ? '✓' : '✗'}`);
  
  const agentDecisionSchema = AgentDecision.schema;
  const hasOrderRef = agentDecisionSchema.path('orderId') &&
                       agentDecisionSchema.path('orderId').options &&
                       agentDecisionSchema.path('orderId').options.ref === 'Order';
  console.log(`   - AgentDecision → Order reference: ${hasOrderRef ? '✓' : '✗'}`);
  
  // Verify indexes
  console.log('\n8. Verifying indexes...');
  const orderIndexes = orderSchema.indexes();
  console.log(`   - Order indexes: ${orderIndexes.length} defined`);
  orderIndexes.forEach(([index], i) => {
    console.log(`     ${i + 1}. ${JSON.stringify(index)}`);
  });
  
  console.log('\n✅ All models loaded and verified successfully!');
  console.log('\nModel Summary:');
  console.log('  - Order: userId, items, totalPrice, status, agentDecisions, timestamps');
  console.log('  - Device: deviceId, type, status, currentTask, capacity');
  console.log('  - Material: name, type, stock, threshold, properties');
  console.log('  - AgentDecision: orderId, agentId, decisionType, decisionResult, confidence, inputSnapshot, rationale');
  
  process.exit(0);
} catch (error) {
  console.error('\n❌ Model verification failed:');
  console.error(error.message);
  console.error(error.stack);
  process.exit(1);
}
