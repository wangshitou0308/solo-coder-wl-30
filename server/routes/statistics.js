const express = require('express');
const { saveDb } = require('../database/db');
const { authenticateToken, requireRole } = require('../middleware/auth');

const router = express.Router();

const buildShowFilterClause = (query, params, prefix = 's') => {
  const { start_date, end_date, performance_id, theater_id, channel, zone_name, payment_method } = query;
  let clauses = [];

  clauses.push(`${prefix}.status IN ('onsale', 'soldout', 'ended')`);

  if (start_date) {
    clauses.push(`${prefix}.show_date >= ?`);
    params.push(start_date);
  }
  if (end_date) {
    clauses.push(`${prefix}.show_date <= ?`);
    params.push(end_date);
  }
  if (performance_id) {
    clauses.push(`${prefix}.performance_id = ?`);
    params.push(performance_id);
  }
  if (theater_id) {
    clauses.push(`${prefix}.theater_id = ?`);
    params.push(theater_id);
  }

  return clauses.length > 0 ? ' WHERE ' + clauses.join(' AND ') : '';
};

const buildOrderJoinAndFilter = (query, params) => {
  const { channel, zone_name, payment_method } = query;
  let joinClause = `
    LEFT JOIN orders o ON s.id = o.show_id AND o.payment_status IN ('paid', 'refunded')
    LEFT JOIN order_items oi ON o.id = oi.order_id
    LEFT JOIN seats st ON oi.seat_id = st.id
    LEFT JOIN seat_zones sz ON st.zone_id = sz.id
  `;
  let clauses = [];

  if (channel) {
    clauses.push('o.order_type = ?');
    params.push(channel);
  }
  if (zone_name) {
    clauses.push('sz.zone_name = ?');
    params.push(zone_name);
  }
  if (payment_method) {
    clauses.push('o.payment_method = ?');
    params.push(payment_method);
  }

  return {
    joinClause,
    whereClause: clauses.length > 0 ? ' AND ' + clauses.join(' AND ') : ''
  };
};

const computeMetrics = (rawItems) => {
  const result = {};

  rawItems.forEach(item => {
    const totalSeats = item.total_seats || 0;
    const soldSeats = item.sold_seats || 0;
    const refundedSeats = item.refunded_seats || 0;
    const netSold = Math.max(0, soldSeats - refundedSeats);
    const revenue = item.total_revenue || 0;
    const discount = item.total_discount || 0;
    const originalTotal = revenue + discount;

    item._total_seats = totalSeats;
    item._net_sold = netSold;
    item._revenue = revenue;
    item._discount = discount;
    item._original_total = originalTotal;
    item._refunded_seats = refundedSeats;
    item._soldout_rate = totalSeats > 0 ? ((soldSeats / totalSeats) * 100) : 0;
  });

  const shows = {};
  rawItems.forEach(item => {
    if (!shows[item.show_id]) {
      shows[item.show_id] = {
        total_seats: item._total_seats,
        sold_seats: (item.sold_seats || 0),
        refunded_seats: item._refunded_seats,
        soldout_rate: item._soldout_rate
      };
    }
  });

  let totalShows = Object.keys(shows).length;
  let soldTickets = 0;
  let totalRevenue = 0;
  let totalDiscount = 0;
  let totalOriginal = 0;
  let totalRefunded = 0;
  let totalSoldoutRate = 0;
  let totalSeatsAll = 0;
  let totalSoldSeatsAll = 0;

  Object.values(shows).forEach(s => {
    soldTickets += Math.max(0, s.sold_seats - s.refunded_seats);
    totalSoldoutRate += s.soldout_rate;
    totalSeatsAll += s.total_seats;
    totalSoldSeatsAll += s.sold_seats;
  });

  rawItems.forEach(item => {
    totalRevenue += item._revenue;
    totalDiscount += item._discount;
    totalOriginal += item._original_total;
    totalRefunded += item._refunded_seats;
  });

  result.total_shows = totalShows;
  result.sold_tickets = soldTickets;
  result.total_revenue = parseFloat(totalRevenue.toFixed(2));
  result.avg_ticket_price = soldTickets > 0 ? parseFloat((totalRevenue / soldTickets).toFixed(2)) : 0;
  result.soldout_rate = totalShows > 0 ? parseFloat((totalSoldoutRate / totalShows).toFixed(2)) : 0;
  result.refund_rate = totalSoldSeatsAll > 0 ? parseFloat(((totalRefunded / totalSoldSeatsAll) * 100).toFixed(2)) : 0;
  result.discount_rate = totalOriginal > 0 ? parseFloat(((totalDiscount / totalOriginal) * 100).toFixed(2)) : 0;

  return result;
};

const aggregateByDimension = (db, dimensionConfig, filterParams, queryParams) => {
  const params = [...filterParams];
  const { joinClause, whereClause } = buildOrderJoinAndFilter(queryParams, params);

  const sql = `
    SELECT
      ${dimensionConfig.select},
      s.id as show_id,
      COUNT(DISTINCT CASE WHEN o.payment_status = 'paid' THEN st.id END) as sold_seats,
      COUNT(DISTINCT CASE WHEN o.payment_status = 'refunded' THEN st.id END) as refunded_seats,
      COALESCE(SUM(CASE WHEN o.payment_status = 'paid' THEN oi.discount_price END), 0) as total_revenue,
      COALESCE(SUM(CASE WHEN o.payment_status = 'paid' THEN (oi.original_price - oi.discount_price) END), 0) as total_discount,
      (SELECT COUNT(*) FROM seats WHERE show_id = s.id) as total_seats
    FROM shows s
    JOIN performances p ON s.performance_id = p.id
    JOIN theaters t ON s.theater_id = t.id
    ${joinClause}
    ${buildShowFilterClause(queryParams, [], 's').replace('WHERE', 'AND')}
    ${whereClause}
    GROUP BY ${dimensionConfig.groupBy}, s.id
    ORDER BY ${dimensionConfig.orderBy || dimensionConfig.groupBy}
  `;

  const rawData = db.prepare(sql).all(params);

  const grouped = {};
  rawData.forEach(row => {
    const key = row[dimensionConfig.keyField];
    if (!grouped[key]) {
      grouped[key] = {
        key,
        label: row[dimensionConfig.labelField || dimensionConfig.keyField],
        items: []
      };
    }
    grouped[key].items.push(row);
  });

  return Object.values(grouped).map(g => {
    const metrics = computeMetrics(g.items);
    const result = {};
    if (dimensionConfig.keyField === 'performance_id') {
      result.performance_id = g.key;
      result.performance_name = g.label;
    } else if (dimensionConfig.keyField === 'theater_id') {
      result.theater_id = g.key;
      result.theater_name = g.label;
    } else if (dimensionConfig.keyField === 'show_date') {
      result.date = g.key;
    } else if (dimensionConfig.keyField === 'order_type') {
      result.channel = g.key || '未知';
    } else if (dimensionConfig.keyField === 'zone_name') {
      result.zone_name = g.key || '未知';
    } else if (dimensionConfig.keyField === 'payment_method') {
      result.payment_method = g.key || '未知';
    }
    return { ...result, ...metrics };
  });
};

router.get('/box-office/multi-dim', authenticateToken, requireRole('manager', 'finance'), (req, res) => {
  const queryParams = req.query;

  try {
    const dimensions = {
      by_performance: {
        select: 'p.id as performance_id, p.name as performance_name',
        groupBy: 'p.id',
        keyField: 'performance_id',
        labelField: 'performance_name',
        orderBy: 'performance_name'
      },
      by_theater: {
        select: 't.id as theater_id, t.name as theater_name',
        groupBy: 't.id',
        keyField: 'theater_id',
        labelField: 'theater_name',
        orderBy: 'theater_name'
      },
      by_date: {
        select: 's.show_date',
        groupBy: 's.show_date',
        keyField: 'show_date',
        orderBy: 'show_date DESC'
      },
      by_channel: {
        select: 'o.order_type',
        groupBy: 'o.order_type',
        keyField: 'order_type',
        orderBy: 'order_type'
      },
      by_zone: {
        select: 'sz.zone_name',
        groupBy: 'sz.zone_name',
        keyField: 'zone_name',
        orderBy: 'zone_name'
      },
      by_payment: {
        select: 'o.payment_method',
        groupBy: 'o.payment_method',
        keyField: 'payment_method',
        orderBy: 'payment_method'
      }
    };

    const result = {};
    for (const [key, config] of Object.entries(dimensions)) {
      result[key] = aggregateByDimension(req.db, config, [], queryParams);
    }

    res.json(result);
  } catch (err) {
    return res.status(500).json({ message: '查询失败', error: err.message });
  }
});

router.get('/box-office/summary', authenticateToken, requireRole('manager', 'finance'), (req, res) => {
  const queryParams = req.query;

  try {
    const params = [];
    const baseFilter = buildShowFilterClause(queryParams, params, 's');
    const { joinClause, whereClause } = buildOrderJoinAndFilter(queryParams, params);

    const rawAggregate = req.db.prepare(`
      SELECT
        s.id as show_id,
        COUNT(DISTINCT CASE WHEN o.payment_status = 'paid' THEN st.id END) as sold_seats,
        COUNT(DISTINCT CASE WHEN o.payment_status = 'refunded' THEN st.id END) as refunded_seats,
        COALESCE(SUM(CASE WHEN o.payment_status = 'paid' THEN oi.discount_price END), 0) as total_revenue,
        COALESCE(SUM(CASE WHEN o.payment_status = 'paid' THEN (oi.original_price - oi.discount_price) END), 0) as total_discount,
        (SELECT COUNT(*) FROM seats WHERE show_id = s.id) as total_seats
      FROM shows s
      JOIN performances p ON s.performance_id = p.id
      JOIN theaters t ON s.theater_id = t.id
      ${joinClause}
      ${baseFilter}
      ${whereClause}
      GROUP BY s.id
    `).all(params);

    const summaryMetrics = computeMetrics(rawAggregate);

    const showParams = [];
    const showBaseFilter = buildShowFilterClause(queryParams, showParams, 's');
    const { joinClause: showJoin, whereClause: showWhere } = buildOrderJoinAndFilter(queryParams, showParams);

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
        COALESCE((SELECT SUM(CASE WHEN o2.payment_status = 'paid' THEN o2.actual_amount END) FROM orders o2 WHERE o2.show_id = s.id), 0) as revenue
      FROM shows s
      JOIN performances p ON s.performance_id = p.id
      JOIN theaters t ON s.theater_id = t.id
      ${showJoin}
      ${showBaseFilter}
      ${showWhere}
      GROUP BY s.id
      ORDER BY s.show_date DESC, s.start_time DESC
    `).all(showParams);

    const showsWithRates = shows.map(s => ({
      ...s,
      occupancy_rate: s.total_seats > 0 ? ((s.sold_seats / s.total_seats) * 100).toFixed(2) : 0
    }));

    const avgOccupancy = showsWithRates.length > 0
      ? (showsWithRates.reduce((sum, s) => sum + parseFloat(s.occupancy_rate), 0) / showsWithRates.length).toFixed(2)
      : 0;

    res.json({
      summary: {
        ...summaryMetrics,
        avg_occupancy_rate: parseFloat(avgOccupancy)
      },
      shows: showsWithRates
    });
  } catch (err) {
    return res.status(500).json({ message: '查询失败', error: err.message });
  }
});

router.get('/repertoire', authenticateToken, requireRole('manager', 'finance'), (req, res) => {
  try {
    const repertoire = req.db.prepare(`
      SELECT 
        p.id as performance_id,
        p.name,
        p.type,
        COUNT(DISTINCT s.id) as total_shows
      FROM performances p
      LEFT JOIN shows s ON p.id = s.performance_id AND s.status IN ('ended', 'onsale', 'soldout')
      WHERE p.status = 'approved'
      GROUP BY p.id
    `).all([]);

    const result = [];
    for (const r of repertoire) {
      const showSeatsData = req.db.prepare(`
        SELECT
          s.id as show_id,
          s.show_date,
          (SELECT COUNT(*) FROM seats WHERE show_id = s.id) as total_seats,
          (SELECT COUNT(*) FROM seats WHERE show_id = s.id AND status = 'sold') as sold_seats,
          COALESCE((SELECT SUM(CASE WHEN o.payment_status = 'paid' THEN o.actual_amount END) FROM orders o WHERE o.show_id = s.id), 0) as show_revenue
        FROM shows s
        WHERE s.performance_id = ? AND s.status IN ('ended', 'onsale', 'soldout')
        ORDER BY s.show_date DESC, s.start_time DESC
      `).all([r.performance_id]);

      let occupancySum = 0;
      let lastShowDate = null;
      const occupancyTrend = [];
      let totalAudience = 0;
      let totalRevenue = 0;

      showSeatsData.forEach((sd, idx) => {
        const rate = sd.total_seats > 0 ? ((sd.sold_seats / sd.total_seats) * 100) : 0;
        occupancySum += rate;
        totalAudience += sd.sold_seats || 0;
        totalRevenue += sd.show_revenue || 0;
        if (idx === 0) lastShowDate = sd.show_date;
        if (idx < 5) {
          occupancyTrend.unshift(parseFloat(rate.toFixed(2)));
        }
      });

      const avgOccupancy = showSeatsData.length > 0
        ? parseFloat((occupancySum / showSeatsData.length).toFixed(2))
        : 0;

      result.push({
        name: r.name,
        type: r.type,
        total_shows: r.total_shows,
        total_audience: totalAudience,
        total_revenue: parseFloat((totalRevenue || 0).toFixed(2)),
        avg_occupancy_rate: avgOccupancy,
        reruns: Math.max(0, r.total_shows - 1),
        avg_revenue_per_show: r.total_shows > 0 ? parseFloat(((totalRevenue || 0) / r.total_shows).toFixed(2)) : 0,
        last_show_date: lastShowDate,
        occupancy_trend: occupancyTrend
      });
    }

    result.sort((a, b) => b.total_revenue - a.total_revenue);

    res.json({ repertoire: result });
  } catch (err) {
    return res.status(500).json({ message: '查询失败', error: err.message });
  }
});

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
        COALESCE(SUM(CASE WHEN o.payment_status = 'paid' THEN o.actual_amount END), 0) as total_revenue,
        COALESCE(COUNT(DISTINCT CASE WHEN o.payment_status = 'paid' THEN o.id END), 0) as total_orders,
        COALESCE(SUM(CASE WHEN o.payment_status = 'paid' THEN o.discount_amount END), 0) as total_discount,
        COALESCE(SUM(CASE WHEN o.payment_status = 'paid' THEN o.total_amount END), 0) as total_original,
        COALESCE(COUNT(DISTINCT CASE WHEN o.payment_status = 'refunded' THEN o.id END), 0) as refunded_orders,
        COALESCE(SUM(CASE WHEN o.payment_status = 'refunded' THEN o.actual_amount END), 0) as total_refund_amount
      FROM orders o
      WHERE o.show_id = ?
    `).get([showId]);

    const refundedSeats = req.db.prepare(`
      SELECT COUNT(DISTINCT rf.seat_id) as refunded_seats
      FROM refunds rf
      JOIN orders o ON rf.order_id = o.id
      WHERE o.show_id = ?
    `).get([showId]);

    const soldSeatsForCalc = seatStats.sold_seats || 0;
    const refundedCount = refundedSeats.refunded_seats || 0;
    const netSold = Math.max(0, soldSeatsForCalc - refundedCount);
    const totalSoldSeatsRaw = soldSeatsForCalc + refundedCount;

    const soldoutRate = seatStats.total_seats > 0
      ? parseFloat(((soldSeatsForCalc / seatStats.total_seats) * 100).toFixed(2))
      : 0;

    const refundRate = totalSoldSeatsRaw > 0
      ? parseFloat(((refundedCount / totalSoldSeatsRaw) * 100).toFixed(2))
      : 0;

    const avgTicketPrice = netSold > 0
      ? parseFloat((orderStats.total_revenue / netSold).toFixed(2))
      : 0;

    const discountRate = (orderStats.total_original || 0) > 0
      ? parseFloat(((orderStats.total_discount / orderStats.total_original) * 100).toFixed(2))
      : 0;

    const channelStats = req.db.prepare(`
      SELECT
        o.order_type as channel,
        COUNT(DISTINCT CASE WHEN o.payment_status = 'paid' THEN st.id END) as sold_tickets,
        COALESCE(SUM(CASE WHEN o.payment_status = 'paid' THEN oi.discount_price END), 0) as total_revenue
      FROM orders o
      LEFT JOIN order_items oi ON o.id = oi.order_id
      LEFT JOIN seats st ON oi.seat_id = st.id
      WHERE o.show_id = ?
      GROUP BY o.order_type
    `).all([showId]);

    const paymentStats = req.db.prepare(`
      SELECT
        o.payment_method,
        COUNT(DISTINCT CASE WHEN o.payment_status = 'paid' THEN st.id END) as sold_tickets,
        COALESCE(SUM(CASE WHEN o.payment_status = 'paid' THEN oi.discount_price END), 0) as total_revenue,
        COUNT(DISTINCT CASE WHEN o.payment_status = 'paid' THEN o.id END) as order_count
      FROM orders o
      LEFT JOIN order_items oi ON o.id = oi.order_id
      LEFT JOIN seats st ON oi.seat_id = st.id
      WHERE o.show_id = ? AND o.payment_method IS NOT NULL
      GROUP BY o.payment_method
    `).all([showId]);

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
      avg_ticket_price: avgTicketPrice,
      soldout_rate: soldoutRate,
      refund_rate: refundRate,
      discount_rate: discountRate,
      channel_stats: channelStats.map(c => ({
        channel: c.channel || '未知',
        sold_tickets: c.sold_tickets || 0,
        total_revenue: parseFloat((c.total_revenue || 0).toFixed(2))
      })),
      payment_stats: paymentStats.map(p => ({
        payment_method: p.payment_method || '未知',
        sold_tickets: p.sold_tickets || 0,
        total_revenue: parseFloat((p.total_revenue || 0).toFixed(2)),
        order_count: p.order_count || 0
      }))
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
        rf.refund_amount,
        rf.reason,
        rf.created_at as refund_at,
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
        strftime('%Y-%m', s.show_date) as month,
        COUNT(DISTINCT s.id) as show_count,
        SUM(CASE WHEN st.status = 'sold' THEN 1 ELSE 0 END) as total_sold,
        COALESCE(SUM(CASE WHEN o.payment_status = 'paid' THEN o.actual_amount END), 0) as total_revenue
      FROM shows s
      JOIN seats st ON s.id = st.show_id
      LEFT JOIN orders o ON s.id = o.show_id AND o.payment_status = 'paid'
      WHERE s.status = 'ended' ${dateFilter}
      GROUP BY strftime('%Y-%m', s.show_date)
      ORDER BY month DESC
      LIMIT 24
    `).all(params);

    const groupStats = req.db.prepare(`
      SELECT
        g.name as group_name,
        COUNT(DISTINCT s.id) as show_count,
        SUM(CASE WHEN st.status = 'sold' THEN 1 ELSE 0 END) as total_sold,
        COUNT(st.id) as total_seats
      FROM theater_groups g
      JOIN performances p ON p.group_id = g.id
      JOIN shows s ON p.id = s.performance_id AND s.status = 'ended'
      JOIN seats st ON s.id = st.show_id
      WHERE 1=1 ${dateFilter}
      GROUP BY g.id
      ORDER BY total_sold DESC
      LIMIT 10
    `).all(params);

    const groupAnalysis = groupStats.map(g => ({
      ...g,
      occupancy_rate: g.total_seats > 0 ? ((g.total_sold / g.total_seats) * 100).toFixed(2) : 0
    }));

    const totalAudience = typeStats.reduce((sum, t) => sum + (t.total_sold || 0), 0);
    const totalShows = typeStats.reduce((sum, t) => sum + (t.show_count || 0), 0);
    const avgOccupancy = typeStats.reduce((sum, t) => sum + (t.total_seats > 0 ? (t.total_sold / t.total_seats) * 100 : 0), 0) / (typeStats.length || 1);

    res.json({
      summary: {
        total_audience: totalAudience,
        total_shows: totalShows,
        avg_occupancy: Number(avgOccupancy.toFixed(2))
      },
      type_analysis: typeAnalysis,
      month_trend: timeStats,
      group_ranking: groupAnalysis
    });
  } catch (err) {
    return res.status(500).json({ message: '查询失败', error: err.message });
  }
});

module.exports = router;