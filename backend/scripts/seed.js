/**
 * Database Seed Script
 * Populates MongoDB with sample data for testing
 */

require('dotenv').config({ path: '.env' });
const { connect, disconnect } = require('../src/db/connect');
const { Order, Device, Material, AgentDecision } = require('../src/models');

async function seed() {
  try {
    console.log('Starting database seed...');
    
    // Connect to MongoDB
    await connect();
    
    // Clear existing data
    console.log('Clearing existing data...');
    await Order.deleteMany({});
    await Device.deleteMany({});
    await Material.deleteMany({});
    await AgentDecision.deleteMany({});
    
    // Create Devices
    console.log('Creating devices...');
    const devices = await Device.create([
      {
        deviceId: 'PRINTER-001',
        type: 'sla',
        status: 'idle',
        capacity: {
          maxVolume: 100,
          currentLoad: 0
        },
        specifications: {
          buildVolume: { x: 200, y: 200, z: 250 },
          resolution: '0.05mm',
          supportedMaterials: ['resin-standard', 'resin-tough']
        },
        location: 'Lab A'
      },
      {
        deviceId: 'PRINTER-002',
        type: 'fdm',
        status: 'busy',
        currentTask: {
          orderId: null,
          startedAt: new Date(),
          estimatedCompletion: new Date(Date.now() + 2 * 60 * 60 * 1000)
        },
        capacity: {
          maxVolume: 100,
          currentLoad: 45
        },
        specifications: {
          buildVolume: { x: 300, y: 300, z: 400 },
          resolution: '0.2mm',
          supportedMaterials: ['pla', 'abs', 'petg']
        },
        location: 'Lab B'
      }
    ]);
    console.log(`Created ${devices.length} devices`);
    
    // Create Materials
    console.log('Creating materials...');
    const materials = await Material.create([
      {
        name: 'Standard Resin - Gray',
        type: 'resin',
        stock: {
          quantity: 25,
          unit: 'L'
        },
        threshold: 10,
        properties: {
          color: 'Gray',
          density: 1.1,
          tensileStrength: '65 MPa',
          printTemperature: { min: 25, max: 30 }
        },
        supplier: {
          name: 'Formlabs',
          contactInfo: 'supplier@formlabs.com',
          sku: 'RS-F2-GRY-1000'
        },
        costPerUnit: 150
      },
      {
        name: 'PLA Filament - Black',
        type: 'filament',
        stock: {
          quantity: 5,
          unit: 'spool'
        },
        threshold: 10,
        properties: {
          color: 'Black',
          density: 1.24,
          tensileStrength: '50 MPa',
          printTemperature: { min: 190, max: 220 }
        },
        supplier: {
          name: 'Prusament',
          contactInfo: 'info@prusament.com',
          sku: 'PLA-BLK-1KG'
        },
        costPerUnit: 25
      }
    ]);
    console.log(`Created ${materials.length} materials`);
    
    // Create AgentDecisions
    console.log('Creating agent decisions...');
    const agentDecisions = await AgentDecision.create([
      {
        orderId: null,
        agentId: 'scheduler-v1',
        decisionType: 'device_selection',
        decisionResult: 'PRINTER-001',
        confidence: 0.92,
        inputSnapshot: {
          orderPriority: 'high',
          requiredResolution: '0.05mm',
          availableDevices: ['PRINTER-001', 'PRINTER-002']
        },
        rationale: 'Selected SLA printer for higher resolution requirement',
        alternatives: [
          { option: 'PRINTER-002', score: 0.65, reason: 'Lower resolution but faster' }
        ],
        impact: {
          estimatedTime: 180,
          estimatedCost: 45,
          qualityScore: 0.95
        }
      },
      {
        orderId: null,
        agentId: 'material-selector-v1',
        decisionType: 'material_selection',
        decisionResult: 'Standard Resin - Gray',
        confidence: 0.88,
        inputSnapshot: {
          orderType: 'prototype',
          requiredStrength: 'medium',
          availableMaterials: ['Standard Resin - Gray', 'PLA Filament - Black']
        },
        rationale: 'Selected resin for better surface finish on prototype',
        alternatives: [
          { option: 'PLA Filament - Black', score: 0.72, reason: 'Lower cost but rougher finish' }
        ],
        impact: {
          estimatedTime: 0,
          estimatedCost: 15,
          qualityScore: 0.90
        }
      }
    ]);
    console.log(`Created ${agentDecisions.length} agent decisions`);
    
    // Create Orders
    console.log('Creating orders...');
    const orders = await Order.create([
      {
        userId: '507f1f77bcf86cd799439011',
        items: [
          {
            deviceId: devices[0]._id,
            materialId: materials[0]._id,
            quantity: 1,
            unitPrice: 45,
            specifications: {
              infill: '100%',
              layerHeight: '0.05mm'
            }
          }
        ],
        totalPrice: 45,
        status: 'processing',
        agentDecisions: [agentDecisions[0]._id],
        metadata: {
          sourcePhotos: ['photo1.jpg', 'photo2.jpg', 'photo3.jpg'],
          generatedModelUrl: 'http://example.com/model.obj',
          notes: 'High priority customer order'
        }
      },
      {
        userId: '507f1f77bcf86cd799439012',
        items: [
          {
            deviceId: devices[1]._id,
            materialId: materials[1]._id,
            quantity: 2,
            unitPrice: 25,
            specifications: {
              infill: '80%',
              layerHeight: '0.2mm'
            }
          }
        ],
        totalPrice: 50,
        status: 'pending',
        agentDecisions: [agentDecisions[1]._id],
        metadata: {
          sourcePhotos: ['photo4.jpg', 'photo5.jpg'],
          notes: 'Standard prototype order'
        }
      },
      {
        userId: '507f1f77bcf86cd799439011',
        items: [
          {
            deviceId: devices[0]._id,
            materialId: materials[0]._id,
            quantity: 3,
            unitPrice: 45,
            specifications: {
              infill: '100%',
              layerHeight: '0.05mm'
            }
          }
        ],
        totalPrice: 135,
        status: 'completed',
        metadata: {
          sourcePhotos: ['photo6.jpg', 'photo7.jpg', 'photo8.jpg', 'photo9.jpg'],
          generatedModelUrl: 'http://example.com/model2.obj',
          notes: 'Repeat customer - batch order'
        }
      }
    ]);
    console.log(`Created ${orders.length} orders`);
    
    // Link agent decisions to orders
    console.log('Linking agent decisions to orders...');
    agentDecisions[0].orderId = orders[0]._id;
    agentDecisions[1].orderId = orders[1]._id;
    await agentDecisions[0].save();
    await agentDecisions[1].save();
    
    orders[0].agentDecisions = [agentDecisions[0]._id];
    orders[1].agentDecisions = [agentDecisions[1]._id];
    await orders[0].save();
    await orders[1].save();
    
    console.log('Seed completed successfully!');
    console.log('\nSummary:');
    console.log(`  Devices: ${await Device.countDocuments()}`);
    console.log(`  Materials: ${await Material.countDocuments()}`);
    console.log(`  AgentDecisions: ${await AgentDecision.countDocuments()}`);
    console.log(`  Orders: ${await Order.countDocuments()}`);
    
  } catch (error) {
    console.error('Seed error:', error.message);
    throw error;
  } finally {
    await disconnect();
  }
}

// Run seed
seed().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
