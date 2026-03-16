import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Search, Filter, Calendar, Package, XCircle } from 'lucide-react';
import OrderHistoryCard from '../components/OrderHistoryCard';
import { fetchOrderHistory, reorderOrder } from '../services/orderService';

// 订单状态选项
const STATUS_OPTIONS = [
  { value: 'all', label: '全部状态' },
  { value: 'submitted', label: '已提交' },
  { value: 'pending_review', label: '待审核' },
  { value: 'reviewing', label: '审核中' },
  { value: 'scheduled', label: '已排程' },
  { value: 'printing', label: '打印中' },
  { value: 'post_processing', label: '后处理' },
  { value: 'completed', label: '已完成' },
  { value: 'shipped', label: '已发货' },
  { value: 'cancelled', label: '已取消' }
];

export default function OrderHistory() {
  const navigate = useNavigate();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  
  // 筛选状态
  const [statusFilter, setStatusFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [dateRange, setDateRange] = useState({
    startDate: '',
    endDate: ''
  });
  
  // 分页状态
  const [pagination, setPagination] = useState({
    currentPage: 1,
    pageSize: 10,
    total: 0,
    totalPages: 0
  });

  // 加载历史订单
  const loadOrderHistory = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const params = {
        page: pagination.currentPage,
        limit: pagination.pageSize,
        status: statusFilter !== 'all' ? statusFilter : undefined,
        search: searchQuery || undefined,
        startDate: dateRange.startDate || undefined,
        endDate: dateRange.endDate || undefined
      };
      
      const result = await fetchOrderHistory(params);
      
      if (result.success) {
        setOrders(result.data.orders);
        setPagination(prev => ({
          ...prev,
          total: result.data.total,
          totalPages: result.data.totalPages
        }));
      } else {
        setError(result.error);
      }
    } catch (err) {
      console.error('加载历史订单失败:', err);
      setError('加载失败，请重试');
    } finally {
      setLoading(false);
    }
  };

  // 初始加载和筛选条件变化时重新加载
  useEffect(() => {
    const debounceTimer = setTimeout(() => {
      loadOrderHistory();
    }, 300);
    
    return () => clearTimeout(debounceTimer);
  }, [pagination.currentPage, statusFilter, searchQuery, dateRange]);

  // 处理查看详情
  const handleViewDetail = (order) => {
    navigate(`/order-status/${order.id}`);
  };

  // 处理重新下单
  const handleReorder = async (order) => {
    try {
      const result = await reorderOrder(order.id);
      
      if (result.success) {
        // 跳转到订单提交页，带上原订单参数
        navigate('/order', {
          state: {
            reorderFrom: order.id,
            parameters: order.parameters,
            quantity: order.quantity
          }
        });
      } else {
        alert(`重新下单失败：${result.error}`);
      }
    } catch (err) {
      console.error('重新下单失败:', err);
      alert('重新下单失败，请重试');
    }
  };

  // 处理下载发票
  const handleDownloadInvoice = (order) => {
    if (order.invoiceUrl) {
      window.open(order.invoiceUrl, '_blank');
    }
  };

  // 处理筛选条件变化
  const handleStatusFilterChange = (e) => {
    setStatusFilter(e.target.value);
    setPagination(prev => ({ ...prev, currentPage: 1 }));
  };

  const handleSearchChange = (e) => {
    setSearchQuery(e.target.value);
    setPagination(prev => ({ ...prev, currentPage: 1 }));
  };

  const handleDateRangeChange = (field, value) => {
    setDateRange(prev => ({ ...prev, [field]: value }));
    setPagination(prev => ({ ...prev, currentPage: 1 }));
  };

  // 清空筛选条件
  const clearFilters = () => {
    setStatusFilter('all');
    setSearchQuery('');
    setDateRange({ startDate: '', endDate: '' });
  };

  // 过滤后的订单列表（前端二次筛选）
  const filteredOrders = orders.filter(order => {
    // 状态筛选
    if (statusFilter !== 'all' && order.status !== statusFilter) {
      return false;
    }
    
    // 搜索筛选（订单号）
    if (searchQuery) {
      const orderNumber = order.orderNumber || order.id || '';
      if (!orderNumber.toLowerCase().includes(searchQuery.toLowerCase())) {
        return false;
      }
    }
    
    // 日期范围筛选
    if (dateRange.startDate) {
      const orderDate = new Date(order.createdAt);
      const startDate = new Date(dateRange.startDate);
      if (orderDate < startDate) {
        return false;
      }
    }
    
    if (dateRange.endDate) {
      const orderDate = new Date(order.createdAt);
      const endDate = new Date(dateRange.endDate);
      endDate.setHours(23, 59, 59, 999);
      if (orderDate > endDate) {
        return false;
      }
    }
    
    return true;
  });

  return (
    <div className="min-h-screen flex flex-col relative overflow-hidden bg-[var(--bg-sand)]">
      {/* 装饰背景 */}
      <div className="fixed top-20 right-[-60px] w-40 h-40 bg-[var(--accent-beige)] border-2 border-[var(--border-charcoal)] rotate-12 z-0 opacity-50"></div>
      <div className="fixed bottom-[30%] left-[-30px] w-24 h-24 bg-[#D4D4D8] border-2 border-[var(--border-charcoal)] -rotate-6 z-0 opacity-60"></div>
      <div className="fixed top-1/2 right-[15%] w-16 h-16 bg-[var(--action-slate)] border-2 border-[var(--border-charcoal)] rotate-45 z-0 opacity-30"></div>

      {/* 头部 */}
      <header className="p-6 flex justify-between items-center z-10 relative">
        <button 
          onClick={() => navigate(-1)}
          className="w-10 h-10 flex items-center justify-center bg-white border-2 border-[var(--border-charcoal)] shadow-[3px_3px_0px_var(--border-charcoal)] active:translate-x-[1px] active:translate-y-[1px] active:shadow-[2px_2px_0px_var(--border-charcoal)] text-[var(--text-charcoal)] hover:bg-[var(--accent-beige)] transition-colors"
        >
          <ArrowLeft className="w-5 h-5 font-bold" strokeWidth={3} />
        </button>
        <h1 className="text-lg font-bold tracking-widest uppercase text-[var(--text-charcoal)]">历史订单</h1>
        <div className="w-10"></div>
      </header>

      {/* 主内容区 */}
      <main className="flex-1 px-6 pb-6 z-10 relative overflow-y-auto">
        {/* 标题和统计 */}
        <div className="mb-6">
          <h2 className="text-2xl font-bold text-[var(--text-charcoal)] mb-2">订单记录</h2>
          <p className="text-sm text-[var(--text-charcoal)]/60">
            共 {pagination.total} 个订单
          </p>
        </div>

        {/* 筛选区域 */}
        <div className="bg-white border-2 border-[var(--border-charcoal)] shadow-[4px_4px_0px_var(--border-charcoal)] p-4 mb-6">
          <div className="flex items-center gap-2 mb-4">
            <Filter className="w-5 h-5 text-[var(--action-slate)]" />
            <span className="font-bold text-[var(--text-charcoal)]">筛选条件</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* 搜索框 */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-charcoal)]/40" />
              <input
                type="text"
                placeholder="搜索订单号"
                value={searchQuery}
                onChange={handleSearchChange}
                className="w-full pl-10 pr-4 py-2.5 bg-white border-2 border-[var(--border-charcoal)] text-[var(--text-charcoal)] font-medium placeholder:text-[var(--text-charcoal)]/40 focus:outline-none focus:ring-2 focus:ring-[var(--action-slate)]/20"
              />
            </div>

            {/* 状态筛选 */}
            <select
              value={statusFilter}
              onChange={handleStatusFilterChange}
              className="w-full px-4 py-2.5 bg-white border-2 border-[var(--border-charcoal)] text-[var(--text-charcoal)] font-medium focus:outline-none focus:ring-2 focus:ring-[var(--action-slate)]/20 cursor-pointer"
            >
              {STATUS_OPTIONS.map(option => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>

            {/* 开始日期 */}
            <div className="relative">
              <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-charcoal)]/40" />
              <input
                type="date"
                value={dateRange.startDate}
                onChange={(e) => handleDateRangeChange('startDate', e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 bg-white border-2 border-[var(--border-charcoal)] text-[var(--text-charcoal)] font-medium focus:outline-none focus:ring-2 focus:ring-[var(--action-slate)]/20"
              />
            </div>

            {/* 结束日期 */}
            <div className="relative">
              <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-charcoal)]/40" />
              <input
                type="date"
                value={dateRange.endDate}
                onChange={(e) => handleDateRangeChange('endDate', e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 bg-white border-2 border-[var(--border-charcoal)] text-[var(--text-charcoal)] font-medium focus:outline-none focus:ring-2 focus:ring-[var(--action-slate)]/20"
              />
            </div>
          </div>

          {/* 清空筛选按钮 */}
          {(statusFilter !== 'all' || searchQuery || dateRange.startDate || dateRange.endDate) && (
            <button
              onClick={clearFilters}
              className="mt-4 px-4 py-2 text-sm font-bold text-[var(--text-charcoal)]/60 hover:text-[var(--text-charcoal)] transition-colors flex items-center gap-1"
            >
              <XCircle className="w-4 h-4" />
              清空筛选条件
            </button>
          )}
        </div>

        {/* 加载状态 */}
        {loading && (
          <div className="flex items-center justify-center py-12">
            <div className="w-12 h-12 border-4 border-[var(--border-charcoal)] border-t-[var(--action-slate)] rounded-full animate-spin"></div>
          </div>
        )}

        {/* 错误状态 */}
        {error && !loading && (
          <div className="bg-white border-2 border-[var(--border-charcoal)] shadow-[4px_4px_0px_var(--border-charcoal)] p-8 text-center">
            <Package className="w-16 h-16 text-[var(--text-charcoal)]/40 mx-auto mb-4" />
            <p className="text-[var(--text-charcoal)] font-bold mb-4">{error}</p>
            <button
              onClick={loadOrderHistory}
              className="px-6 py-3 bg-[var(--action-slate)] text-white font-bold border-2 border-[var(--border-charcoal)] shadow-[3px_3px_0px_var(--border-charcoal)] active:translate-x-[2px] active:translate-y-[2px] active:shadow-[1px_1px_0px_var(--border-charcoal)]"
            >
              重试
            </button>
          </div>
        )}

        {/* 订单列表 */}
        {!loading && !error && filteredOrders.length === 0 && (
          <div className="bg-white border-2 border-[var(--border-charcoal)] shadow-[4px_4px_0px_var(--border-charcoal)] p-12 text-center">
            <Package className="w-20 h-20 text-[var(--text-charcoal)]/30 mx-auto mb-4" />
            <h3 className="text-xl font-bold text-[var(--text-charcoal)] mb-2">暂无订单</h3>
            <p className="text-[var(--text-charcoal)]/60 mb-6">
              {searchQuery || statusFilter !== 'all' || dateRange.startDate || dateRange.endDate
                ? '没有符合条件的订单'
                : '您还没有任何订单记录'}
            </p>
            {!searchQuery && statusFilter === 'all' && !dateRange.startDate && !dateRange.endDate && (
              <button
                onClick={() => navigate('/upload')}
                className="px-6 py-3 bg-[var(--action-slate)] text-white font-bold border-2 border-[var(--border-charcoal)] shadow-[3px_3px_0px_var(--border-charcoal)] hover:bg-[#5f6f7f] active:translate-x-[2px] active:translate-y-[2px] active:shadow-[1px_1px_0px_var(--border-charcoal)]"
              >
                创建第一个订单
              </button>
            )}
          </div>
        )}

        {/* 订单卡片列表 */}
        {!loading && !error && filteredOrders.length > 0 && (
          <>
            <div className="space-y-4">
              {filteredOrders.map(order => (
                <OrderHistoryCard
                  key={order.id}
                  order={order}
                  onViewDetail={handleViewDetail}
                  onReorder={handleReorder}
                  onDownloadInvoice={handleDownloadInvoice}
                />
              ))}
            </div>

            {/* 分页控件 */}
            {pagination.totalPages > 1 && (
              <div className="mt-6 flex items-center justify-center gap-2">
                <button
                  onClick={() => setPagination(prev => ({ ...prev, currentPage: Math.max(1, prev.currentPage - 1) }))}
                  disabled={pagination.currentPage === 1}
                  className="px-4 py-2 bg-white text-[var(--text-charcoal)] font-bold border-2 border-[var(--border-charcoal)] shadow-[2px_2px_0px_var(--border-charcoal)] disabled:opacity-50 disabled:cursor-not-allowed hover:bg-[var(--accent-beige)] active:translate-x-[1px] active:translate-y-[1px] active:shadow-[1px_1px_0px_var(--border-charcoal)] transition-all"
                >
                  上一页
                </button>
                
                <div className="flex items-center gap-1">
                  {Array.from({ length: pagination.totalPages }, (_, i) => i + 1).map(page => (
                    <button
                      key={page}
                      onClick={() => setPagination(prev => ({ ...prev, currentPage: page }))}
                      className={`w-10 h-10 font-bold border-2 transition-all ${
                        pagination.currentPage === page
                          ? 'bg-[var(--action-slate)] text-white border-[var(--border-charcoal)] shadow-[2px_2px_0px_var(--border-charcoal)]'
                          : 'bg-white text-[var(--text-charcoal)] border-[var(--border-charcoal)] shadow-[2px_2px_0px_var(--border-charcoal)] hover:bg-[var(--accent-beige)] active:translate-x-[1px] active:translate-y-[1px] active:shadow-[1px_1px_0px_var(--border-charcoal)]'
                      }`}
                    >
                      {page}
                    </button>
                  ))}
                </div>

                <button
                  onClick={() => setPagination(prev => ({ ...prev, currentPage: Math.min(pagination.totalPages, prev.currentPage + 1) }))}
                  disabled={pagination.currentPage === pagination.totalPages}
                  className="px-4 py-2 bg-white text-[var(--text-charcoal)] font-bold border-2 border-[var(--border-charcoal)] shadow-[2px_2px_0px_var(--border-charcoal)] disabled:opacity-50 disabled:cursor-not-allowed hover:bg-[var(--accent-beige)] active:translate-x-[1px] active:translate-y-[1px] active:shadow-[1px_1px_0px_var(--border-charcoal)] transition-all"
                >
                  下一页
                </button>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}

