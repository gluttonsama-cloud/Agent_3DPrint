const { DecisionEngine, Decision, DecisionResult } = require('../../src/agents/DecisionEngine');

jest.mock('../../src/config/qiniuLLM', () => ({
  QiniuLLMClient: jest.fn().mockImplementation(() => ({
    invoke: jest.fn().mockResolvedValue({
      content: JSON.stringify({
        result: 'AUTO_APPROVE',
        confidence: 0.85,
        rationale: '测试决策'
      })
    })
  }))
}));

describe('DecisionEngine', () => {
  let engine;

  beforeEach(() => {
    engine = new DecisionEngine({
      enableLogging: false,
      enableLLM: false
    });
  });

  describe('constructor', () => {
    it('should create engine with rules', () => {
      expect(engine.rules).toBeDefined();
      expect(engine.rules.length).toBeGreaterThan(0);
    });

    it('should sort rules by priority', () => {
      for (let i = 1; i < engine.rules.length; i++) {
        expect(engine.rules[i].priority).toBeGreaterThanOrEqual(
          engine.rules[i - 1].priority
        );
      }
    });
  });

  describe('addRule', () => {
    it('should add a new rule', () => {
      const initialCount = engine.rules.length;
      const result = engine.addRule({
        id: 'test_rule',
        name: 'Test Rule',
        priority: 100,
        condition: () => true,
        action: () => ({ result: DecisionResult.AUTO_APPROVE })
      });
      expect(result).toBe(true);
      expect(engine.rules.length).toBe(initialCount + 1);
    });

    it('should reject invalid rule', () => {
      expect(engine.addRule({ id: 'test' })).toBe(false);
    });
  });

  describe('removeRule', () => {
    it('should remove existing rule', () => {
      engine.addRule({
        id: 'removable_rule',
        name: 'Removable Rule',
        priority: 100,
        condition: () => true,
        action: () => ({ result: DecisionResult.AUTO_APPROVE })
      });
      const result = engine.removeRule('removable_rule');
      expect(result).toBe(true);
    });

    it('should return false for non-existent rule', () => {
      expect(engine.removeRule('non_existent')).toBe(false);
    });
  });

  describe('evaluateRule', () => {
    it('should evaluate matching rule', () => {
      const rule = {
        id: 'test',
        name: 'Test',
        priority: 1,
        condition: () => true,
        action: () => ({ result: DecisionResult.AUTO_APPROVE, confidence: 0.9 })
      };
      const result = engine.evaluateRule(rule, {});
      expect(result.matched).toBe(true);
      expect(result.result).toBe(DecisionResult.AUTO_APPROVE);
    });

    it('should return null for non-matching rule', () => {
      const rule = {
        id: 'test',
        name: 'Test',
        priority: 1,
        condition: () => false,
        action: () => ({ result: DecisionResult.AUTO_APPROVE })
      };
      const result = engine.evaluateRule(rule, {});
      expect(result).toBeNull();
    });
  });

  describe('resolveConflict', () => {
    it('should prioritize REJECT results', () => {
      const results = [
        { result: DecisionResult.AUTO_APPROVE, priority: 1, confidence: 0.9 },
        { result: DecisionResult.REJECT, priority: 2, confidence: 0.8 }
      ];
      const resolved = engine.resolveConflict(results);
      expect(resolved.result).toBe(DecisionResult.REJECT);
    });

    it('should prioritize MANUAL_REVIEW over AUTO_APPROVE', () => {
      const results = [
        { result: DecisionResult.AUTO_APPROVE, priority: 1, confidence: 0.9 },
        { result: DecisionResult.MANUAL_REVIEW, priority: 2, confidence: 0.8 }
      ];
      const resolved = engine.resolveConflict(results);
      expect(resolved.result).toBe(DecisionResult.MANUAL_REVIEW);
    });

    it('should return highest priority when no conflicts', () => {
      const results = [
        { result: DecisionResult.AUTO_APPROVE, priority: 2, confidence: 0.8 },
        { result: DecisionResult.AUTO_APPROVE, priority: 1, confidence: 0.9 }
      ];
      const resolved = engine.resolveConflict(results);
      expect(resolved.priority).toBe(1);
    });
  });

  describe('makeDecision', () => {
    it('should return decision for order', async () => {
      const order = {
        _id: 'order-123',
        status: 'pending',
        items: [{ price: 100 }],
        totalPrice: 100
      };
      const decision = await engine.makeDecision(order);
      expect(decision).toBeInstanceOf(Decision);
      expect(decision.timestamp).toBeDefined();
    });
  });
});

describe('Decision', () => {
  it('should create decision with all properties', () => {
    const decision = new Decision({
      result: DecisionResult.AUTO_APPROVE,
      confidence: 0.85,
      reason: 'Test reason',
      details: { key: 'value' },
      rationale: 'Test rationale'
    });
    expect(decision.result).toBe(DecisionResult.AUTO_APPROVE);
    expect(decision.confidence).toBe(0.85);
    expect(decision.reason).toBe('Test reason');
  });

  it('should convert to JSON', () => {
    const decision = new Decision({
      result: DecisionResult.AUTO_APPROVE,
      confidence: 0.85,
      reason: 'Test reason'
    });
    const json = decision.toJSON();
    expect(json.result).toBe(DecisionResult.AUTO_APPROVE);
    expect(json.timestamp).toBeDefined();
  });
});