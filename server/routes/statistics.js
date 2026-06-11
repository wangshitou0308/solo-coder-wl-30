const express = require('express');
const { saveDb } = require('../database/db');
const { authenticateToken, requireRole } = require('../middleware/auth');

const router = express.Router();

router.get('/shows/:showId/box-office', authenticateToken, (req, res) => {
  const { showId } = req.params;

  try {
    const show = req.db.prepare(`
      SELECT s.*, p.name as performance_name, p.type as performance_type,
             t.name as theater_name
      FROM shows s
      JOIN performances p ON s.performance_id = p.id
      JOIN theaters t ON s.theater_id = t.id
      WHERE s.id = ?
    `).get([showId]);

    if (!show) return res.status(404).json({ message: '场次不存在' });

    const seatStats = req.db.prepare(`
      SELECT 
        COUNT(*) as total_seats,
        SUM(CASE WHEN status = 'sold' THEN 1 ELSE 0 END) as sold_seats,
        SUM(CASE WHEN status = 'locked' THEN 1 ELSE 0 END) as locked_seats,
        SUM(CASE WHEN status = 'available' THEN 1 ELSE 0 END) as available_seats
      FROM seats WHERE show_id = ?
    `).get([showId]);

    const orderStats = req.db.prepare(`
      SELECT 
        COALESCE(SUM(o.actual_amount), 0) as total_revenue,
        COALESCE(COUNT(DISTINCT o.id), 0) as total_orders,
        COALESCE(SUM(o.discount_amount), 0) as total_discount
      FROM orders o
      WHERE o.show_id = ? AND o.payment_status = 'paid'
    `).get([showId]);

    const zoneStats = req.db.prepare(`
      SELECT 
        sz.zone_name,
        sz.base_price,
        COUNT(s.id) as total_seats,
        SUM(CASE WHEN s.status = 'sold' THEN 1 ELSE 0 END) as sold_seats,
        COALESCE(SUM(CASE WHEN s.status = 'sold' THEN oi.discount_price ELSE 0 END), 0) as zone_revenue
      FROM seat_zones sz
      JOIN seats s ON sz.id = s.zone_id
      LEFT JOIN order_items oi ON s.id = oi.seat_id
      LEFT JOIN orders o ON oi.order_id = o.id AND o.payment_status = 'paid'
      WHERE sz.ticket_version_id = (
        SELECT id FROM ticket_versions WHERE show_id = ? ORDER BY created_at DESC LIMIT 1
      )
      GROUP BY sz.id
      ORDER BY sz.zone_name
    `).all([showId]);

    const occupancyRate = seatStats.total_seats > 0 
      ? ((seatStats.sold_seats / seatStats.total_seats) * 100).toFixed(2) 
      : 0;

    res.json({
      show,
      seat_stats: seatStats,
      order_stats: orderStats,
      zone_stats: zoneStats,
      occupancy_rate: parseFloat(occupancyRate),
      avg_ticket_price: seatStats.sold_seats > 0 
        ? (orderStats.total_revenue / seatStats.sold_seats).toFixed(2) 
        : 0
    });
  } catch (err) {
    return res.status(500).json({ message: '查询失败', error: err.message });
  }
});

router.get('/box-office/summary', authenticateToken, requireRole('manager', 'finance'), (req, res) => {
  const { start_date, end_date, performance_id } = req.query;

  let query = `
    SELECT 
      COUNT(DISTINCT s.id) as total_shows,
      COUNT(DISTINCT p.id) as total_performances,
      COALESCE(SUM(o.actual_amount), 0) as total_revenue,
      COALESCE(SUM(o.discount_amount), 0) as total_discount,
      COUNT(DISTINCT CASE WHEN o.payment_status = 'paid' THEN o.id END) as total_orders
    FROM shows s
    JOIN performances p ON s.performance_id = p.id
    LEFT JOIN orders o ON s.id = o.show_id AND o.payment_status = 'paid'
    WHERE s.status IN ('onsale', 'soldout', 'ended')
  `;
  const params = [];

  if (start_date) {
    query += ' AND s.show_date >= ?';
    params.push(start_date);
  }
  if (end_date) {
    query += ' AND s.show_date <= ?';
    params.push(end_date);
  }
  if (performance_id) {
    query += ' AND s.performance_id = ?';
    params.push(performance_id);
  }

  try {
    const summary = req.db.prepare(query).get(params);

    const shows = req.db.prepare(`
      SELECT 
        s.id as show_id,
        p.name as performance_name,
        p.type as performance_type,
        s.show_date,
        s.start_time,
        s.status,
        t.name as theater_name,
        (SELECT COUNT(*) FROM seats WHERE show_id = s.id) as total_seats,
        (SELECT COUNT(*) FROM seats WHERE show_id = s.id AND status = 'sold') as sold_seats,
        COALESCE((SELECT SUM(o.actual_amount) FROM orders o WHERE o.show_id = s.id AND o.payment_status = 'paid'), 0) as revenue
      FROM shows s
      JOIN performances p ON s.performance_id = p.id
      JOIN theaters t ON s.theater_id = t.id
      WHERE s.status IN ('onsale', 'soldout', 'ended')
      ${start_date ? 'AND s.show_date >= ?' : ''}
      ${end_date ? 'AND s.show_date <= ?' : ''}
      ${performance_id ? 'AND s.performance_id = ?' : ''}
      ORDER BY s.show_date DESC, s.start_time DESC
    `).all(params);

    const showsWithRates = shows.map(s => ({
      ...s,
      occupancy_rate: s.total_seats > 0 ? ((s.sold_seats / s.total_seats) * 100).toFixed(2) : 0
    }));

    const avgOccupancy = showsWithRates.length > 0
      ? (showsWithRates.reduce((sum, s) => sum + parseFloat(s.occupancy_rate), 0) / showsWithRates.length).toFixed(2)
      : 0;

    res.json({
      summary: {
        ...summary,
        avg_occupancy_rate: parseFloat(avgOccupancy)
      },
      shows: showsWithRates
    });
  } catch (err) {
    return res.status(500).json({ message: '查询失败', error: err.message });
  }
});

router.get('/shows/:showId/settlement', authenticateToken, requireRole('manager', 'finance'), (req, res) => {
  const { showId } = req.params;

  try {
    const show = req.db.prepare(`
      SELECT s.*, p.name as performance_name, g.name as group_name
      FROM shows s
      JOIN performances p ON s.performance_id = p.id
      JOIN theater_groups g ON p.group_id = g.id
      WHERE s.id = ? AND s.status = 'ended'
    `).get([showId]);

    if (!show) return res.status(400).json({ message: '演出未结束或不存在' });

    const stats = req.db.prepare(`
      SELECT 
        COUNT(DISTINCT CASE WHEN o.payment_status = 'paid' THEN o.id END) as total_tickets_sold,
        COALESCE(SUM(CASE WHEN o.payment_status = 'paid' THEN o.actual_amount END), 0) as total_revenue,
        COALESCE(SUM(CASE WHEN o.payment_status = 'refunded' THEN oi.discount_price END), 0) as total_refunds,
        COUNT(DISTINCT CASE WHEN o.payment_status = 'refunded' THEN o.id END) as refund_count
      FROM orders o
      LEFT JOIN order_items oi ON o.id = oi.order_id
      WHERE o.show_id = ?
    `).get([showId]);

    const tickets = req.db.prepare(`
      SELECT 
        o.order_no,
        o.buyer_name,
        o.buyer_phone,
        o.actual_amount,
        o.payment_method,
        o.paid_at,
        GROUP_CONCAT(s.row_label || s.seat_number, ', ') as seats
      FROM orders o
      JOIN order_items oi ON o.id = oi.order_id
      JOIN seats s ON oi.seat_id = s.id
      WHERE o.show_id = ? AND o.payment_status = 'paid'
      GROUP BY o.id
      ORDER BY o.paid_at
    `).all([showId]);

    const refunds = req.db.prepare(`
      SELECT 
        r.order_no,
        r.buyer_name,
        r.refund_amount,
        r.reason,
        r.created_at as refund_at,
        u.name as operator_name,
        s.row_label || s.seat_number as seat
      FROM refunds rf
      JOIN orders r ON rf.order_id = r.id
      JOIN seats s ON rf.seat_id = s.id
      JOIN users u ON rf.operator_id = u.id
      WHERE r.show_id = ?
      ORDER BY rf.created_at
    `).all([showId]);

    const netRevenue = stats.total_revenue - stats.total_refunds;
    const shareRatio = 50;
    const groupShare = netRevenue * (shareRatio / 100);
    const theaterShare = netRevenue - groupShare;

    res.json({
      show,
      stats: {
        ...stats,
        net_revenue: netRevenue,
        share_ratio: shareRatio,
        group_share: groupShare,
        theater_share: theaterShare
      },
      tickets,
      refunds
    });
  } catch (err) {
    return res.status(500).json({ message: '查询失败', error: err.message });
  }
});

router.get('/repertoire', authenticateToken, requireRole('manager', 'finance'), (req, res) => {
  try {
    const repertoire = req.db.prepare(`
      SELECT 
        p.name,
        p.type,
        COUNT(DISTINCT s.id) as total_shows,
        COALESCE(SUM(CASE WHEN s2.status = 'sold' THEN 1 ELSE 0 END), 0) as total_audience,
        COALESCE(SUM(CASE WHEN o.payment_status = 'paid' THEN o.actual_amount END), 0) as total_revenue,
        (SELECT COUNT(*) FROM seats WHERE show_id = s.id) as show_seats
      FROM performances p
      LEFT JOIN shows s ON p.id = s.performance_id AND s.status = 'ended'
      LEFT JOIN seats s2 ON s.id = s2.show_id AND s2.status = 'sold'
      LEFT JOIN orders o ON s.id = o.show_id AND o.payment_status = 'paid'
      WHERE p.status = 'approved'
      GROUP BY p.id
      ORDER BY total_revenue DESC
    `).all([]);

    const result = repertoire.map(r => {
      const showsWithSeats = r.show_seats > 0 ? 1 : 0;
      const avgOccupancy = showsWithSeats > 0 && r.show_seats > 0
        ? ((r.total_audience / (r.show_seats * r.total_shows)) * 100).toFixed(2)
        : 0;
      
      return {
        ...r,
        avg_occupancy_rate: parseFloat(avgOccupancy)
      };
    });

    res.json({ repertoire: result });
  } catch (err) {
    return res.status(500).json({ message: '查询失败', error: err.message });
  }
});

router.get('/analysis/audience-preference', authenticateToken, requireRole('manager', 'finance'), (req, res) => {
  const { start_date, end_date } = req.query;

  let dateFilter = '';
  const params = [];
  if (start_date) {
    dateFilter += ' AND s.show_date >= ?';
    params.push(start_date);
  }
  if (end_date) {
    dateFilter += ' AND s.show_date <= ?';
    params.push(end_date);
  }

  try {
    const typeStats = req.db.prepare(`
      SELECT 
        p.type,
        COUNT(DISTINCT s.id) as show_count,
        SUM(CASE WHEN st.status = 'sold' THEN 1 ELSE 0 END) as total_sold,
        COUNT(st.id) as total_seats
      FROM performances p
      JOIN shows s ON p.id = s.performance_id AND s.status = 'ended'
      JOIN seats st ON s.id = st.show_id
      WHERE 1=1 ${dateFilter}
      GROUP BY p.type
    `).all(params);

    const typeAnalysis = typeStats.map(t => ({
      ...t,
      occupancy_rate: t.total_seats > 0 ? ((t.total_sold / t.total_seats) * 100).toFixed(2) : 0
    }));

    const timeStats = req.db.prepare(`
      SELECT 
        CAST(strftime('%H', s.start_time) as INTEGER) as hour,
        SUM(CASE WHEN st.status = 'sold' THEN 1 ELSE 0 END) as total_sold,
        COALESCE(SUM(CASE WHEN o.payment_status = 'paid' THEN o.actual_amount END), 0) as revenue
      FROM shows s
      JOIN seats st ON s.id = st.show_id
      LEFT JOIN orders o ON s.id = o.show_id AND o.payment_status = 'paid'
      WHERE s.status = 'ended' ${dateFilter}
      GROUP BY strftime('%H', s.start_time)
      ORDER BY hour
    `).all(params);

    const monthlyStats = req.db.prepare(`
      SELECT 
        strftime('%Y-%m', s.show_date) as month,
        COALESCE(SUM(CASE WHEN o.payment_status = 'paid' THEN o.actual_amount END), 0) as revenue,
        COUNT(DISTINCT s.id) as show_count
      FROM shows s
      LEFT JOIN orders o ON s.id = o.show_id AND o.payment_status = 'paid'
      WHERE s.status = 'ended' ${dateFilter}
      GROUP BY strftime('%Y-%m', s.show_date)
      ORDER BY month
      LIMIT 12
    `).all(params);

    res.json({
      type_analysis: typeAnalysis,
      time_analysis: timeStats,
      monthly_trend: monthlyStats
    });
  } catch (err) {
    return res.status(500).json({ message: '查询失败', error: err.message });
  }
});

router.get('/settlements', authenticateToken, requireRole('manager', 'finance'), (req, res) => {
  const { status } = req.query;
  
  let query = `
    SELECT 
      st.*,
      p.name as performance_name,
      s.show_date,
      g.name as group_name
    FROM settlements st
    JOIN shows s ON st.show_id = s.id
    JOIN performances p ON s.performance_id = p.id
    JOIN theater_groups g ON p.group_id = g.id
  `;
  const params = [];
  
  if (status) {
    query += ' WHERE st.status = ?';
    params.push(status);
  }
  query += ' ORDER BY st.created_at DESC';

  try {
    const settlements = req.db.prepare(query).all(params);
    res.json({ settlements });
  } catch (err) {
    return res.status(500).json({ message: '查询失败', error: err.message });
  }
});

router.post('/shows/:showId/settlement/create', authenticateToken, requireRole('finance'), (req, res) => {
  const { showId } = req.params;
  const { share_ratio = 50 } = req.body;

  try {
    const stats = req.db.prepare(`
      SELECT 
        s.id,
        COALESCE(SUM(CASE WHEN o.payment_status = 'paid' THEN o.actual_amount END), 0) as total_revenue,
        COALESCE(SUM(CASE WHEN o.payment_status = 'refunded' THEN oi.discount_price END), 0) as total_refunds,
        COUNT(DISTINCT CASE WHEN o.payment_status = 'paid' THEN o.id END) as total_tickets
      FROM shows s
      LEFT JOIN orders o ON s.id = o.show_id
      LEFT JOIN order_items oi ON o.id = oi.order_id
      WHERE s.id = ? AND s.status = 'ended'
      GROUP BY s.id
    `).get([showId]);

    if (!stats) return res.status(400).json({ message: '演出未结束或不存在' });

    const netRevenue = stats.total_revenue - stats.total_refunds;
    const groupShare = netRevenue * (share_ratio / 100);
    const theaterShare = netRevenue - groupShare;

    const stmt = req.db.prepare(`
      INSERT INTO settlements (
        show_id, total_tickets, total_revenue, total_refunds, 
        net_revenue, group_share, theater_share, share_ratio
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const result = stmt.run([showId, stats.total_tickets, stats.total_revenue, stats.total_refunds,
        netRevenue, groupShare, theaterShare, share_ratio]);
    
    const id = result.lastInsertRowid;
    saveDb();
    
    res.json({ message: '结算报表创建成功', id });
  } catch (err) {
    return res.status(500).json({ message: '创建结算失败', error: err.message });
  }
});

module.exports = router;
