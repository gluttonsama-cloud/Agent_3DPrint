import { ChevronDown, ChevronUp } from 'lucide-react';
import {
  MaterialType,
  SizeType,
  PrecisionType,
  getMaterialOptions,
  getSizeOptions,
  getPrecisionOptions,
  getMaterialName,
  getSizeName,
  getPrecisionName,
} from '../utils/priceCalculator';

interface ParameterSelectorProps {
  material: MaterialType;
  size: SizeType;
  precision: PrecisionType;
  quantity: number;
  onMaterialChange: (material: MaterialType) => void;
  onSizeChange: (size: SizeType) => void;
  onPrecisionChange: (precision: PrecisionType) => void;
  onQuantityChange: (quantity: number) => void;
}

export default function ParameterSelector({
  material,
  size,
  precision,
  quantity,
  onMaterialChange,
  onSizeChange,
  onPrecisionChange,
  onQuantityChange,
}: ParameterSelectorProps) {
  const materialOptions = getMaterialOptions();
  const sizeOptions = getSizeOptions();
  const precisionOptions = getPrecisionOptions();

  return (
    <div className="space-y-4">
      {/* 材料选择 */}
      <div className="neo-box bg-white p-4">
        <label className="block text-sm font-bold mb-3 text-[var(--text-charcoal)]">
          打印材料
        </label>
        <div className="grid grid-cols-1 gap-2">
          {materialOptions.map((option) => (
            <button
              key={option.value}
              onClick={() => onMaterialChange(option.value)}
              className={`w-full p-3 border-2 text-left transition-all ${
                material === option.value
                  ? 'bg-[var(--action-slate)] text-white border-[var(--border-charcoal)] shadow-[2px_2px_0px_var(--border-charcoal)]'
                  : 'bg-white text-[var(--text-charcoal)] border-[var(--border-charcoal)] hover:bg-[var(--accent-beige)]'
              }`}
            >
              <div className="flex justify-between items-center">
                <span className="font-bold">{option.label}</span>
                <span className="text-sm font-medium">+¥{option.price}</span>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* 尺寸选择 */}
      <div className="neo-box bg-white p-4">
        <label className="block text-sm font-bold mb-3 text-[var(--text-charcoal)]">
          模型尺寸
        </label>
        <div className="grid grid-cols-3 gap-2">
          {sizeOptions.map((option) => (
            <button
              key={option.value}
              onClick={() => onSizeChange(option.value)}
              className={`p-3 border-2 transition-all ${
                size === option.value
                  ? 'bg-[var(--action-slate)] text-white border-[var(--border-charcoal)] shadow-[2px_2px_0px_var(--border-charcoal)]'
                  : 'bg-white text-[var(--text-charcoal)] border-[var(--border-charcoal)] hover:bg-[var(--accent-beige)]'
              }`}
            >
              <div className="text-xs font-bold mb-1">{option.label.split('(')[0]}</div>
              <div className="text-[10px] font-medium opacity-80">{option.label.split('(')[1]}</div>
              {option.price > 0 && (
                <div className="text-xs font-bold mt-1">+¥{option.price}</div>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* 精度选择 */}
      <div className="neo-box bg-white p-4">
        <label className="block text-sm font-bold mb-3 text-[var(--text-charcoal)]">
          打印精度
        </label>
        <div className="grid grid-cols-2 gap-2">
          {precisionOptions.map((option) => (
            <button
              key={option.value}
              onClick={() => onPrecisionChange(option.value)}
              className={`p-3 border-2 transition-all ${
                precision === option.value
                  ? 'bg-[var(--action-slate)] text-white border-[var(--border-charcoal)] shadow-[2px_2px_0px_var(--border-charcoal)]'
                  : 'bg-white text-[var(--text-charcoal)] border-[var(--border-charcoal)] hover:bg-[var(--accent-beige)]'
              }`}
            >
              <div className="text-sm font-bold">{option.label}</div>
              {option.price > 0 && (
                <div className="text-xs font-medium mt-1">+¥{option.price}</div>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* 数量选择 */}
      <div className="neo-box bg-white p-4">
        <label className="block text-sm font-bold mb-3 text-[var(--text-charcoal)]">
          打印数量
        </label>
        <div className="flex items-center gap-3">
          <button
            onClick={() => onQuantityChange(Math.max(1, quantity - 1))}
            disabled={quantity <= 1}
            className="w-12 h-12 flex items-center justify-center bg-white border-2 border-[var(--border-charcoal)] disabled:opacity-50 disabled:cursor-not-allowed hover:bg-[var(--accent-beige)] transition-colors"
          >
            <ChevronDown className="w-6 h-6 font-bold" strokeWidth={3} />
          </button>
          <div className="flex-1 text-center">
            <div className="text-3xl font-bold text-[var(--text-charcoal)]">{quantity}</div>
            <div className="text-xs font-medium text-[var(--text-charcoal)]/60">件</div>
          </div>
          <button
            onClick={() => onQuantityChange(quantity + 1)}
            className="w-12 h-12 flex items-center justify-center bg-white border-2 border-[var(--border-charcoal)] hover:bg-[var(--accent-beige)] transition-colors"
          >
            <ChevronUp className="w-6 h-6 font-bold" strokeWidth={3} />
          </button>
        </div>
        
        {quantity >= 2 && (
          <div className="mt-3 text-center">
            <span className="inline-block px-3 py-1 bg-[var(--action-slate)] text-white text-xs font-bold rounded">
              数量优惠：{quantity >= 10 ? '8 折' : quantity >= 5 ? '85 折' : quantity >= 3 ? '9 折' : '95 折'}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
