const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { saveDb } = require('../database/db');
const { authenticateToken, requireRole } = require('../middleware/auth');

const router = express.Router();

const calculatePrice = (basePrice, discountRule) => {
  if (!discountRule) return basePrice;
  
  switch (discountRule.discount_type) {
    case 'percentage':
      return basePrice * (1 - discountRule.discount_value / 100);
    case 'fixed':
      return Math.max(0, basePrice - discountRule.discount_value);
    default:
      return basePrice;
  }
};

router.post('/hold-seats', authenticateToken, (req, res) => {
  const { show_id, seat_ids, hold_minutes = 15, buyer_phone } = req.body;

  if (!show_id || !seat_ids || seat_ids.length === 0) {
    return res.status(400).json({ message: '请选择座位' });
  }

  try {
    req.db.run('BEGIN IMMEDIATE');

    const placeholders = seat_ids.map(() => '?').join(',');
    const userIdentifier = buyer_phone || req.user.username;
    
    const seats = req.db.prepare(`
      SELECT * FROM seats 
      WHERE id IN (${placeholders}) AND show_id = ? 
        AND (status = 'available' OR (status = 'held' AND held_by_phone = ?))
    `).all([...seat_ids, show_id, userIdentifier]);

    if (seats.length !== seat_ids.length) {
      req.db.run('ROLLBACK');
      return res.status(400).json({ message: '部分座位已被占用，请重新选择' });
    }

    const heldExpiresAt = new Date(Date.now() + hold_minutes * 60 * 1000).toISOString();

    seat_ids.forEach(id => {
      req.db.run(`
        UPDATE seats 
        SET status = 'held', held_by_phone = ?, held_expires_at = ?
        WHERE id = ?
      `, [userIdentifier, heldExpiresAt, id]);
    });

    req.db.run('COMMIT');
    saveDb();

    res.json({ 
      message: '座位已预留，请在规定时间内完成支付',
      expires_at: heldExpiresAt
    });
  } catch (err) {
    try { req.db.run('ROLLBACK'); } catch (e) {}
    if (err.message === '部分座位已被占用，请重新选择') {
      return res.status(400).json({ message: err.message });
    }
    return res.status(500).json({ message: '锁座失败：' + (err.message || '未知错误') });
  }
});

router.post('/release-seats', authenticateToken, (req, res) => {
  const { show_id, seat_ids } = req.body;

  if (!show_id || !seat_ids || seat_ids.length === 0) {
    return res.status(400).json({ message: '请选择要释放的座位' });
  }

  try {
    req.db.run('BEGIN IMMEDIATE');

    const placeholders = seat_ids.map(() => '?').join(',');
    const userIdentifier = req.user.username;
    
    req.db.prepare(`
      UPDATE seats 
      SET status = 'available', held_by_phone = NULL, held_expires_at = NULL
      WHERE id IN (${placeholders}) AND show_id = ? 
        AND status = 'held'
    `).run([...seat_ids, show_id]);

    req.db.run('COMMIT');
    saveDb();

    res.json({ message: '座位已释放' });
  } catch (err) {
    try { req.db.run('ROLLBACK'); } catch (e) {}
    return res.status(500).json({ message: '释放座位失败：' + (err.message || '未知错误') });
  }
});

router.post('/create', authenticateToken, (req, res) => {
  const { 
    show_id, seat_ids, buyer_name, buyer_phone, id_card,
    discount_rule_ids, payment_method, order_type, remark 
  } = req.body;

  if (!show_id || !seat_ids || seat_ids.length === 0) {
    return res.status(400).json({ message: '请选择座位' });
  }

  try {
    req.db.run('BEGIN IMMEDIATE');

    const placeholders = seat_ids.map(() => '?').join(',');
    const seats = req.db.prepare(`
      SELECT s.*, sz.zone_name, sz.base_price 
      FROM seats s
      LEFT JOIN seat_zones sz ON s.zone_id = sz.id
      WHERE s.id IN (${placeholders}) AND s.show_id = ? 
        AND s.status IN ('available', 'held')
    `).all([...seat_ids, show_id]);

    if (seats.length !== seat_ids.length) {
      req.db.run('ROLLBACK');
      return res.status(400).json({ message: '部分座位已被售出，请重新选择' });
    }

    const discounts = req.db.prepare(`
      SELECT * FROM discount_rules 
      WHERE id IN (${discount_rule_ids ? discount_rule_ids.map(() => '?').join(',') : '0'})
        AND is_active = 1
        AND (start_date IS NULL OR start_date <= CURRENT_TIMESTAMP)
        AND (end_date IS NULL OR end_date >= CURRENT_TIMESTAMP)
    `).all(discount_rule_ids || []);

    let totalAmount = 0;
    let discountAmount = 0;
    const orderItems = [];

    seats.forEach((seat, index) => {
      const discount = discounts[index] || null;
      const originalPrice = seat.price || seat.base_price;
      const discountPrice = calculatePrice(originalPrice, discount);
      
      totalAmount += originalPrice;
      discountAmount += (originalPrice - discountPrice);
      
      orderItems.push({
        seat_id: seat.id,
        original_price: originalPrice,
        discount_price: discountPrice,
        discount_rule_id: discount ? discount.id : null
      });
    });

    const actualAmount = totalAmount - discountAmount;
    const orderNo = 'ORD' + Date.now() + Math.random().toString(36).substr(2, 4).toUpperCase();
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();
    const paymentStatus = payment_method ? 'paid' : 'pending';
    const paidAt = payment_method ? new Date().toISOString() : null;

    const insertOrderStmt = req.db.prepare(`
      INSERT INTO orders (
        order_no, show_id, buyer_name, buyer_phone, id_card,
        total_amount, discount_amount, actual_amount, payment_method,
        payment_status, order_type, seller_id, paid_at, expires_at, remark
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const insertOrderResult = insertOrderStmt.run([
      orderNo, show_id, buyer_name, buyer_phone, id_card,
      totalAmount, discountAmount, actualAmount, payment_method,
      paymentStatus, order_type || 'online', req.user.id, paidAt, expiresAt, remark
    ]);
    const orderId = insertOrderResult.lastInsertRowid;

    orderItems.forEach(item => {
      req.db.run(`
        INSERT INTO order_items (order_id, seat_id, original_price, discount_price, discount_rule_id)
        VALUES (?, ?, ?, ?, ?)
      `, [orderId, item.seat_id, item.original_price, item.discount_price, item.discount_rule_id]);
      
      req.db.run(`
        UPDATE seats SET status = ?, lock_type = 'order' WHERE id = ?
      `, [paymentStatus === 'paid' ? 'sold' : 'reserved', item.seat_id]);
    });

    req.db.run(`
      UPDATE shows 
      SET status = CASE 
        WHEN (SELECT COUNT(*) FROM seats WHERE show_id = ? AND status IN ('available', 'locked')) = 0 
        THEN 'soldout' 
        ELSE status 
      END
      WHERE id = ?
    `, [show_id, show_id]);

    req.db.run('COMMIT');
    saveDb();

    const result = {
      orderId,
      orderNo,
      totalAmount,
      discountAmount,
      actualAmount,
      paymentStatus
    };

    res.json({ 
      message: result.paymentStatus === 'paid' ? '订单创建并支付成功' : '订单创建成功，请尽快支付',
      order_id: result.orderId,
      order_no: result.orderNo,
      total_amount: result.totalAmount,
      discount_amount: result.discountAmount,
      actual_amount: result.actualAmount,
      payment_status: result.paymentStatus
    });
  } catch (err) {
    try { req.db.run('ROLLBACK'); } catch (e) {}
    if (err.message === '部分座位已被售出，请重新选择') {
      return res.status(400).json({ message: err.message });
    }
    return res.status(500).json({ message: '创建订单失败', error: err.message });
  }
});

router.post('/:id/pay', authenticateToken, (req, res) => {
  const { id } = req.params;
  const { payment_method } = req.body;

  if (!payment_method) {
    return res.status(400).json({ message: '请选择支付方式' });
  }

  try {
    const order = req.db.prepare('SELECT * FROM orders WHERE id = ? AND payment_status = ?').get([id, 'pending']);
    if (!order) return res.status(404).json({ message: '订单不存在或已支付' });

    req.db.run('BEGIN IMMEDIATE');

    req.db.run(`
      UPDATE orders 
      SET payment_status = 'paid', payment_method = ?, paid_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `, [payment_method, id]);

    req.db.run(`
      UPDATE seats 
      SET status = 'sold', lock_type = 'order'
      WHERE status = 'reserved' AND id IN (
        SELECT seat_id FROM order_items WHERE order_id = ?
      )
    `, [id]);

    req.db.run(`
      UPDATE shows 
      SET status = CASE 
        WHEN (SELECT COUNT(*) FROM seats WHERE show_id = ? AND status IN ('available', 'locked')) = 0 
        THEN 'soldout' 
        ELSE status 
      END
      WHERE id = ?
    `, [order.show_id, order.show_id]);

    req.db.run('COMMIT');
    saveDb();

    res.json({ message: '支付成功' });
  } catch (err) {
    try { req.db.run('ROLLBACK'); } catch (e) {}
    return res.status(500).json({ message: '支付失败', error: err.message });
  }
});

router.post('/cancel-expired', authenticateToken, (req, res) => {
  try {
    const orders = req.db.prepare(`
      SELECT o.id, o.show_id FROM orders o
      WHERE o.payment_status = 'pending' AND o.expires_at < CURRENT_TIMESTAMP
    `).all([]);

    let cancelled = 0;

    orders.forEach(order => {
      try {
        req.db.run('BEGIN IMMEDIATE');

        req.db.run(`
          UPDATE orders SET payment_status = 'cancelled' WHERE id = ?
        `, [order.id]);
        
        req.db.run(`
          UPDATE seats SET status = 'available', lock_type = NULL, held_by_phone = NULL, held_expires_at = NULL
          WHERE status = 'reserved' AND id IN (
            SELECT seat_id FROM order_items WHERE order_id = ?
          )
        `, [order.id]);

        req.db.run('COMMIT');
        cancelled++;
      } catch (err) {
        try { req.db.run('ROLLBACK'); } catch (e) {}
      }
    });

    if (cancelled > 0) {
      saveDb();
    }

    res.json({ message: `已取消${cancelled}个过期订单` });
  } catch (err) {
    return res.status(500).json({ message: '查询失败', error: err.message });
  }
});

router.get('/', authenticateToken, (req, res) => {
  const { show_id, payment_status, order_type, start_date, end_date, page = 1, page_size = 20 } = req.query;
  
  let countQuery = 'SELECT COUNT(*) as total FROM orders WHERE 1=1';
  let query = `
    SELECT o.*, p.name as performance_name, s.show_date, s.start_time,
           u.name as seller_name
    FROM orders o
    JOIN shows s ON o.show_id = s.id
    JOIN performances p ON s.performance_id = p.id
    LEFT JOIN users u ON o.seller_id = u.id
    WHERE 1=1
  `;
  const params = [];

  if (show_id) {
    query += ' AND o.show_id = ?';
    countQuery += ' AND show_id = ?';
    params.push(show_id);
  }
  if (payment_status) {
    query += ' AND o.payment_status = ?';
    countQuery += ' AND payment_status = ?';
    params.push(payment_status);
  }
  if (order_type) {
    query += ' AND o.order_type = ?';
    countQuery += ' AND order_type = ?';
    params.push(order_type);
  }
  if (start_date) {
    query += ' AND o.created_at >= ?';
    countQuery += ' AND created_at >= ?';
    params.push(start_date);
  }
  if (end_date) {
    query += ' AND o.created_at <= ?';
    countQuery += ' AND created_at <= ?';
    params.push(end_date);
  }

  query += ' ORDER BY o.created_at DESC LIMIT ? OFFSET ?';
  const queryParams = [...params, parseInt(page_size), (parseInt(page) - 1) * parseInt(page_size)];

  try {
    const countResult = req.db.prepare(countQuery).get(params);
    const orders = req.db.prepare(query).all(queryParams);
    
    res.json({ 
      orders, 
      total: countResult.total,
      page: parseInt(page),
      page_size: parseInt(page_size)
    });
  } catch (err) {
    return res.status(500).json({ message: '查询失败', error: err.message });
  }
});

router.get('/:id', authenticateToken, (req, res) => {
  const { id } = req.params;
  
  try {
    const order = req.db.prepare(`
      SELECT o.*, p.name as performance_name, s.show_date, s.start_time,
             t.name as theater_name, u.name as seller_name
      FROM orders o
      JOIN shows s ON o.show_id = s.id
      JOIN performances p ON s.performance_id = p.id
      JOIN theaters t ON s.theater_id = t.id
      LEFT JOIN users u ON o.seller_id = u.id
      WHERE o.id = ?
    `).get([id]);
    
    if (!order) return res.status(404).json({ message: '订单不存在' });

    const items = req.db.prepare(`
      SELECT oi.*, s.row_label, s.seat_number, sz.zone_name,
             d.name as discount_name
      FROM order_items oi
      JOIN seats s ON oi.seat_id = s.id
      LEFT JOIN seat_zones sz ON s.zone_id = sz.id
      LEFT JOIN discount_rules d ON oi.discount_rule_id = d.id
      WHERE oi.order_id = ?
    `).all([id]);
    
    res.json({ order, items });
  } catch (err) {
    return res.status(500).json({ message: '查询失败', error: err.message });
  }
});

router.post('/:id/refund', authenticateToken, requireRole('seller', 'scheduler', 'manager'), (req, res) => {
  const { id } = req.params;
  const { reason } = req.body;

  if (!reason) {
    return res.status(400).json({ message: '请填写退票原因' });
  }

  try {
    const order = req.db.prepare(`
      SELECT o.* FROM orders o
      JOIN shows s ON o.show_id = s.id
      WHERE o.id = ? AND o.payment_status = 'paid' AND s.status != 'ended'
    `).get([id]);
    
    if (!order) return res.status(400).json({ message: '订单不存在或不可退票' });

    req.db.run('BEGIN IMMEDIATE');

    const items = req.db.prepare('SELECT * FROM order_items WHERE order_id = ?').all([id]);

    let totalRefund = 0;
    items.forEach(item => {
      req.db.run(`
        INSERT INTO refunds (order_id, order_item_id, seat_id, refund_amount, reason, operator_id)
        VALUES (?, ?, ?, ?, ?, ?)
      `, [id, item.id, item.seat_id, item.discount_price, reason, req.user.id]);
      
      req.db.run(`
        UPDATE seats SET status = 'available', lock_type = NULL WHERE id = ?
      `, [item.seat_id]);
      
      totalRefund += item.discount_price;
    });

    req.db.run(`
      UPDATE orders 
      SET payment_status = 'refunded' 
      WHERE id = ?
    `, [id]);

    req.db.run(`
      UPDATE shows SET status = 'onsale' 
      WHERE id = ? AND status = 'soldout'
        AND (SELECT COUNT(*) FROM seats WHERE show_id = ? AND status IN ('available', 'locked')) > 0
    `, [order.show_id, order.show_id]);

    req.db.run('COMMIT');
    saveDb();

    res.json({ message: '退票成功', refund_amount: totalRefund });
  } catch (err) {
    try { req.db.run('ROLLBACK'); } catch (e) {}
    return res.status(500).json({ message: '退票失败', error: err.message });
  }
});

module.exports = router;
