import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { ArrowLeft, CloudUpload, CheckCircle } from 'lucide-react';
import ParameterSelector from '../components/ParameterSelector';
import {
  MaterialType,
  SizeType,
  PrecisionType,
  calculateTotalPrice,
  getDiscountText,
} from '../utils/priceCalculator';
import { createOrder, OrderParameters, PriceDetails } from '../services/orderService';

export default function Order() {
  const navigate = useNavigate();
  const location = useLocation();
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  const [material, setMaterial] = useState<MaterialType>('sla_standard');
  const [size, setSize] = useState<SizeType>('medium');
  const [precision, setPrecision] = useState<PrecisionType>('standard');
  const [quantity, setQuantity] = useState<number>(1);
  const [enableBackgroundRemoval, setEnableBackgroundRemoval] = useState<boolean>(true);

  const priceDetails = calculateTotalPrice(material, size, precision, quantity);

  const handleSubmitOrder = async () => {
    setIsSubmitting(true);

    try {
      const parameters: OrderParameters = {
        material,
        size,
        precision,
        quantity,
        enableBackgroundRemoval,
      };

      const result = await createOrder([], parameters, priceDetails);

      if (result.success) {
        navigate('/processing', { 
          state: { 
            orderId: result.orderId,
            message: result.message 
          } 
        });
      } else {
        alert(`订单创建失败：${result.error}`);
      }
    } catch (error) {
      console.error('订单提交失败:', error);
      alert('订单提交失败，请重试');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col relative overflow-hidden bg-[var(--bg-sand)]">
      <header className="p-6 flex justify-between items-center z-10 relative">
        <button 
          onClick={() => navigate(-1)}
          className="w-10 h-10 flex items-center justify-center bg-white border-2 border-[var(--border-charcoal)] shadow-[3px_3px_0px_var(--border-charcoal)] active:translate-x-[1px] active:translate-y-[1px] active:shadow-[2px_2px_0px_var(--border-charcoal)] text-[var(--text-charcoal)] hover:bg-[var(--accent-beige)] transition-colors"
        >
          <ArrowLeft className="w-5 h-5 font-bold" strokeWidth={3} />
        </button>
        <h1 className="text-lg font-bold tracking-widest uppercase text-[var(--text-charcoal)]">提交订单</h1>
        <div className="w-10"></div>
      </header>

      <main className="flex-1 flex flex-col px-6 pb-6 z-10 relative overflow-y-auto">
        <div className="mb-6 mt-2">
          <div className="flex items-center gap-2 mb-2">
            <CheckCircle className="w-6 h-6 text-[var(--action-slate)]" />
            <h2 className="text-2xl font-bold leading-tight tracking-tight text-[var(--text-charcoal)]">3D 模型已就绪</h2>
          </div>
          <p className="text-sm font-medium text-[var(--text-charcoal)]/80">选择打印参数并提交订单</p>
        </div>

        <ParameterSelector
          material={material}
          size={size}
          precision={precision}
          quantity={quantity}
          onMaterialChange={setMaterial}
          onSizeChange={setSize}
          onPrecisionChange={setPrecision}
          onQuantityChange={setQuantity}
        />

        <div className="mt-6 bg-white border-2 border-[var(--border-charcoal)] p-6 shadow-[6px_6px_0px_var(--border-charcoal)] relative">
          <div className="mb-4 space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-[var(--text-charcoal)]/60">基础价格</span>
              <span className="font-bold text-[var(--text-charcoal)]">¥{priceDetails.basePrice}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-[var(--text-charcoal)]/60">材料费用</span>
              <span className="font-bold text-[var(--text-charcoal)]">¥{priceDetails.materialPrice}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-[var(--text-charcoal)]/60">尺寸加价</span>
              <span className="font-bold text-[var(--text-charcoal)]">¥{priceDetails.sizePrice}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-[var(--text-charcoal)]/60">精度加价</span>
              <span className="font-bold text-[var(--text-charcoal)]">¥{priceDetails.precisionPrice}</span>
            </div>
            {priceDetails.discount < 1 && (
              <div className="flex justify-between text-sm">
                <span className="text-[var(--text-charcoal)]/60">数量折扣 ({getDiscountText(quantity)})</span>
                <span className="font-bold text-green-600">-{Math.round(priceDetails.unitPrice * quantity * (1 - priceDetails.discount))}元</span>
              </div>
            )}
            <div className="border-t-2 border-[var(--border-charcoal)] pt-2 mt-2">
              <div className="flex justify-between items-center">
                <span className="font-bold text-lg text-[var(--text-charcoal)]">总价</span>
                <div className="text-right">
                  <span className="text-xs text-[var(--text-charcoal)]/60">单价 ¥{priceDetails.unitPrice} × {quantity}</span>
                  <div className="text-3xl font-bold text-[var(--action-slate)]">¥{priceDetails.totalPrice}</div>
                </div>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between mb-6 pb-4 border-b-2 border-[var(--border-charcoal)]">
            <div className="flex flex-col">
              <span className="font-bold text-sm text-[var(--text-charcoal)]">开启背景抠图</span>
              <span className="text-xs font-medium text-[var(--text-charcoal)]/60 mt-1">自动去除杂乱背景</span>
            </div>
            <label className="neo-toggle-wrapper">
              <input 
                type="checkbox" 
                className="neo-toggle-input" 
                checked={enableBackgroundRemoval}
                onChange={(e) => setEnableBackgroundRemoval(e.target.checked)}
              />
              <span className="neo-toggle-slider"></span>
            </label>
          </div>

          <button 
            onClick={handleSubmitOrder}
            disabled={isSubmitting}
            className="w-full h-14 bg-[var(--action-slate)] text-white text-lg font-bold tracking-widest uppercase border-2 border-[var(--border-charcoal)] shadow-[4px_4px_0px_var(--border-charcoal)] flex items-center justify-center gap-3 active:shadow-none active:translate-x-[4px] active:translate-y-[4px] transition-all hover:bg-[#5f6f7f] disabled:opacity-50 disabled:cursor-not-allowed disabled:active:translate-x-0 disabled:active:translate-y-0 disabled:active:shadow-[4px_4px_0px_var(--border-charcoal)]"
          >
            <CloudUpload className="w-6 h-6" />
            {isSubmitting ? '提交中...' : '确认提交订单'}
          </button>
        </div>
      </main>

      <div className="fixed top-32 right-[-40px] w-32 h-32 bg-[var(--accent-beige)] border-2 border-[var(--border-charcoal)] rotate-12 z-0 opacity-50"></div>
      <div className="fixed bottom-[30%] left-[-20px] w-16 h-16 bg-[#D4D4D8] border-2 border-[var(--border-charcoal)] -rotate-6 z-0 opacity-60"></div>
    </div>
  );
}
