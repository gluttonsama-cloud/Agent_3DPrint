/**
 * Socket.IO 客户端工具函数
 * 用于实时更新订单状态
 */

import { io, Socket } from 'socket.io-client';

let socketInstance = null;

/**
 * 初始化 Socket.IO 连接
 * @returns Socket 实例
 */
export function initSocket() {
  if (socketInstance) {
    return socketInstance;
  }

  const socketUrl = import.meta.env.VITE_SOCKET_URL || 'http://localhost:3001';
  
  socketInstance = io(socketUrl, {
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionAttempts: 5,
  });

  socketInstance.on('connect_error', (error) => {
    console.error('Socket 连接错误:', error);
  });

  return socketInstance;
}

/**
 * 获取 Socket 实例
 * @returns Socket 实例
 */
export function getSocket() {
  return socketInstance;
}

/**
 * 断开 Socket 连接
 */
export function disconnectSocket() {
  if (socketInstance) {
    socketInstance.disconnect();
    socketInstance = null;
  }
}

/**
 * 加入订单房间
 * @param socket Socket 实例
 * @param orderId 订单 ID
 */
export function joinOrderRoom(socket, orderId) {
  if (!socket || !orderId) return;
  socket.emit('join-order-room', orderId);
}

/**
 * 离开订单房间
 * @param socket Socket 实例
 * @param orderId 订单 ID
 */
export function leaveOrderRoom(socket, orderId) {
  if (!socket || !orderId) return;
  socket.emit('leave-order-room', orderId);
}

/**
 * 监听订单状态变更
 * @param socket Socket 实例
 * @param callback 回调函数
 */
export function onOrderStatusChanged(socket, callback) {
  if (!socket || !callback) return;
  socket.on('order-status-changed', callback);
}

/**
 * 移除订单状态变更监听
 * @param socket Socket 实例
 */
export function offOrderStatusChanged(socket) {
  if (!socket) return;
  socket.off('order-status-changed');
}

/**
 * 监听连接状态
 * @param socket Socket 实例
 * @param callbacks 回调函数对象
 */
export function onConnectionStatus(socket, callbacks) {
  if (!socket || !callbacks) return;
  
  if (callbacks.onConnect) {
    socket.on('connect', callbacks.onConnect);
  }
  if (callbacks.onDisconnect) {
    socket.on('disconnect', callbacks.onDisconnect);
  }
  if (callbacks.onError) {
    socket.on('connect_error', callbacks.onError);
  }
}

/**
 * 移除连接状态监听
 * @param socket Socket 实例
 * @param callbacks 回调函数对象
 */
export function offConnectionStatus(socket, callbacks) {
  if (!socket || !callbacks) return;
  
  if (callbacks.onConnect) {
    socket.off('connect', callbacks.onConnect);
  }
  if (callbacks.onDisconnect) {
    socket.off('disconnect', callbacks.onDisconnect);
  }
  if (callbacks.onError) {
    socket.off('connect_error', callbacks.onError);
  }
}
