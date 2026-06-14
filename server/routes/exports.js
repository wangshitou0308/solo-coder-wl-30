const express = require('express');
const { authenticateToken, requireRole } = require('../middleware/auth');

const router = express.Router();

const escapeCsv = (value) => {
  if (value === null || value === undefined) return '';
  const str = String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return '"' + str.replace(/"/g, '""') + '"';
  }
  return str;
};

const buildCsv = (headers, rows) => {
  const headerLine = headers.map(h => escapeCsv(h)).join(',');
  const dataLines = rows.map(row =>
    headers.map(h => escapeCsv(row[h])).join(',')
  );
  return '\ufeff' + [headerLine, ...dataLines].join('\n');
};

const setCsvResponse = (res, filename) => {
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`);
};

const getPaymentStatusText = (status) => {
  const map = {
    pending: '待支付',
    paid: '已支付',
    cancelled: '已取消',
    refunded: '已退票'
  };
  return map[status] || status;
};

const getOrderTypeText = (type) => {
  const map = {
    online: '线上',
    offline: '线下',
    phone: '电话',
    group: '团购'
  };
  return map[type] || type;
};

const getPaymentMethodText = (method) => {
  const map = {
    cash: '现金',
    wechat: '微信',
    alipay: '支付宝',
    card: '银行卡',
    transfer: '转账',
    reservation: '挂账'
  };
  return map[method] || (method || '');
};

router.get('/orders', authenticateToken, requireRole('manager', 'finance'), (req, res) => {
  const { format = 'csv', show_id, payment_status, order_type, start_date, end_date } = req.query;

  let query = `
    SELECT 
      o.order_no,
      p.name as performance_name,
      s.show_date,
      s.start_time,
      t.name as theater_name,
      o.order_type,
      sz.zone_name,
      COUNT(DISTINCT oi.seat_id) as seat_count,
      COALESCE(SUM(oi.original_price), 0) as total_original,
      COALESCE(SUM(oi.original_price - oi.discount_price), 0) as total_discount,
      COALESCE(o.actual_amount, 0) as actual_amount,
      o.payment_method,
      o.buyer_name,
      o.buyer_phone,
      o.payment_status,
      o.created_at,
      o.paid_at
    FROM orders o
    JOIN shows s ON o.show_id = s.id
    JOIN performances p ON s.performance_id = p.id
    JOIN theaters t ON s.theater_id = t.id
    LEFT JOIN order_items oi ON o.id = oi.order_id
    LEFT JOIN seats st ON oi.seat_id = st.id
    LEFT JOIN seat_zones sz ON st.zone_id = sz.id
    WHERE 1=1
  `;
  const params = [];

  if (show_id) {
    query += ' AND o.show_id = ?';
    params.push(show_id);
  }
  if (payment_status) {
    query += ' AND o.payment_status = ?';
    params.push(payment_status);
  }
  if (order_type) {
    query += ' AND o.order_type = ?';
    params.push(order_type);
  }
  if (start_date) {
    query += ' AND o.created_at >= ?';
    params.push(start_date);
  }
  if (end_date) {
    query += ' AND o.created_at <= ?';
    params.push(end_date);
  }

  query += ' GROUP BY o.id ORDER BY o.created_at DESC';

  try {
    const orders = req.db.prepare(query).all(params);

    const zoneMap = {};
    for (const o of orders) {
      if (!zoneMap[o.order_no]) {
        const zones = req.db.prepare(`
          SELECT DISTINCT sz.zone_name
          FROM order_items oi
          JOIN seats st ON oi.seat_id = st.id
          JOIN seat_zones sz ON st.zone_id = sz.id
          JOIN orders o2 ON oi.order_id = o2.id
          WHERE o2.order_no = ?
        `).all([o.order_no]);
        zoneMap[o.order_no] = zones.map(z => z.zone_name).filter(Boolean).join('/');
      }
    }

    const rows = orders.map(o => ({
      '订单号': o.order_no,
      '剧目': o.performance_name,
      '日期': `${o.show_date} ${o.start_time || ''}`,
      '剧场': o.theater_name,
      '渠道': getOrderTypeText(o.order_type),
      '票区': zoneMap[o.order_no] || (o.zone_name || ''),
      '座位数': o.seat_count || 0,
      '原价总额': parseFloat((o.total_original || 0).toFixed(2)),
      '折扣金额': parseFloat((o.total_discount || 0).toFixed(2)),
      '实收金额': parseFloat((o.actual_amount || 0).toFixed(2)),
      '支付方式': getPaymentMethodText(o.payment_method),
      '购票人': o.buyer_name || '',
      '手机号': o.buyer_phone || '',
      '状态': getPaymentStatusText(o.payment_status),
      '下单时间': o.created_at || '',
      '支付时间': o.paid_at || ''
    }));

    const headers = ['订单号', '剧目', '日期', '剧场', '渠道', '票区', '座位数', '原价总额', '折扣金额', '实收金额', '支付方式', '购票人', '手机号', '状态', '下单时间', '支付时间'];
    const csv = buildCsv(headers, rows);
    const timestamp = new Date().toISOString().slice(0, 10);
    setCsvResponse(res, `订单列表_${timestamp}.csv`);
    res.send(csv);
  } catch (err) {
    return res.status(500).json({ message: '导出失败', error: err.message });
  }
});

router.get('/box-office', authenticateToken, requireRole('manager', 'finance'), (req, res) => {
  const { start_date, end_date, performance_id, theater_id, channel, zone_name, payment_method } = req.query;

  let baseQuery = `
    SELECT 
      s.id as show_id,
      p.name as performance_name,
      s.show_date,
      t.name as theater_name,
      (SELECT COUNT(*) FROM seats WHERE show_id = s.id) as total_seats,
      (SELECT COUNT(*) FROM seats WHERE show_id = s.id AND status = 'sold') as sold_seats
    FROM shows s
    JOIN performances p ON s.performance_id = p.id
    JOIN theaters t ON s.theater_id = t.id
    WHERE s.status IN ('onsale', 'soldout', 'ended')
  `;
  const params = [];

  if (start_date) {
    baseQuery += ' AND s.show_date >= ?';
    params.push(start_date);
  }
  if (end_date) {
    baseQuery += ' AND s.show_date <= ?';
    params.push(end_date);
  }
  if (performance_id) {
    baseQuery += ' AND s.performance_id = ?';
    params.push(performance_id);
  }
  if (theater_id) {
    baseQuery += ' AND s.theater_id = ?';
    params.push(theater_id);
  }

  baseQuery += ' ORDER BY s.show_date DESC';

  try {
    const shows = req.db.prepare(baseQuery).all(params);

    const rows = [];
    for (const show of shows) {
      const orderParams = [show.show_id];
      let orderWhere = ' WHERE o.show_id = ?';

      if (channel) {
        orderWhere += ' AND o.order_type = ?';
        orderParams.push(channel);
      }
      if (zone_name) {
        orderWhere += ' AND sz.zone_name = ?';
        orderParams.push(zone_name);
      }
      if (payment_method) {
        orderWhere += ' AND o.payment_method = ?';
        orderParams.push(payment_method);
      }

      const stats = req.db.prepare(`
        SELECT
          COUNT(DISTINCT CASE WHEN o.payment_status = 'paid' THEN st.id END) as paid_seats_count,
          COALESCE(SUM(CASE WHEN o.payment_status = 'paid' THEN oi.discount_price END), 0) as total_revenue,
          COALESCE(SUM(CASE WHEN o.payment_status = 'paid' THEN (oi.original_price - oi.discount_price) END), 0) as discount_amount,
          COALESCE(SUM(CASE WHEN o.payment_status = 'paid' THEN oi.original_price END), 0) as original_total,
          COUNT(DISTINCT rf.id) as refund_count,
          COALESCE(SUM(CASE WHEN rf.id IS NOT NULL THEN rf.refund_amount END), 0) as refund_total
        FROM orders o
        LEFT JOIN order_items oi ON o.id = oi.order_id
        LEFT JOIN seats st ON oi.seat_id = st.id
        LEFT JOIN seat_zones sz ON st.zone_id = sz.id
        LEFT JOIN refunds rf ON oi.id = rf.order_item_id
        ${orderWhere}
      `).get(orderParams);

      const totalSeats = show.total_seats || 0;
      const soldSeats = show.sold_seats || 0;
      const revenue = stats.total_revenue || 0;
      const paidCount = stats.paid_seats_count || 0;
      const refundCount = stats.refund_count || 0;
      const originalTotal = stats.original_total || 0;
      const discountAmount = stats.discount_amount || 0;

      const occupancyRate = totalSeats > 0 ? parseFloat(((soldSeats / totalSeats) * 100).toFixed(2)) : 0;
      const avgTicketPrice = paidCount > 0 ? parseFloat((revenue / paidCount).toFixed(2)) : 0;
      const refundRate = (paidCount + refundCount) > 0 ? parseFloat(((refundCount / (paidCount + refundCount)) * 100).toFixed(2)) : 0;
      const discountRate = originalTotal > 0 ? parseFloat(((discountAmount / originalTotal) * 100).toFixed(2)) : 0;

      rows.push({
        '剧目': show.performance_name,
        '演出日期': show.show_date,
        '剧场': show.theater_name,
        '总座位': totalSeats,
        '已售票': paidCount,
        '上座率%': occupancyRate,
        '平均票价': avgTicketPrice,
        '总票房': parseFloat(revenue.toFixed(2)),
        '退票数': refundCount,
        '退票率': refundRate,
        '折扣额': parseFloat(discountAmount.toFixed(2)),
        '折扣率': discountRate
      });
    }

    const headers = ['剧目', '演出日期', '剧场', '总座位', '已售票', '上座率%', '平均票价', '总票房', '退票数', '退票率', '折扣额', '折扣率'];
    const csv = buildCsv(headers, rows);
    const timestamp = new Date().toISOString().slice(0, 10);
    setCsvResponse(res, `票房统计_${timestamp}.csv`);
    res.send(csv);
  } catch (err) {
    return res.status(500).json({ message: '导出失败', error: err.message });
  }
});

router.get('/settlements/:id', authenticateToken, requireRole('manager', 'finance'), (req, res) => {
  const { id } = req.params;

  try {
    const settlement = req.db.prepare(`
      SELECT 
        st.*,
        p.name as performance_name,
        s.show_date,
        s.start_time,
        t.name as theater_name,
        g.name as group_name
      FROM settlements st
      JOIN shows s ON st.show_id = s.id
      JOIN performances p ON s.performance_id = p.id
      JOIN theaters t ON s.theater_id = t.id
      JOIN theater_groups g ON p.group_id = g.id
      WHERE st.id = ?
    `).get([id]);

    if (!settlement) {
      return res.status(404).json({ message: '结算单不存在' });
    }

    const settlementModeText = {
      ratio: '比例分成',
      fixed: '固定费用',
      guaranteed: '保底+分成',
      tiered: '阶梯分成'
    };

    const statusText = {
      pending_generated: '待生成',
      pending_confirm: '待确认',
      confirmed: '已确认',
      paid: '已支付',
      void: '已作废'
    };

    const orderItems = req.db.prepare(`
      SELECT
        o.order_no,
        p.name as performance_name,
        s.show_date,
        o.buyer_name,
        o.buyer_phone,
        GROUP_CONCAT(st.row_label || st.seat_number, '、') as seats,
        COUNT(DISTINCT oi.seat_id) as seat_count,
        COALESCE(SUM(CASE WHEN o.payment_status = 'paid' THEN oi.original_price END), 0) as original_total,
        COALESCE(SUM(CASE WHEN o.payment_status = 'paid' THEN (oi.original_price - oi.discount_price) END), 0) as discount_amount,
        COALESCE(CASE WHEN o.payment_status = 'paid' THEN o.actual_amount END, 0) as actual_amount,
        o.payment_method,
        o.paid_at
      FROM orders o
      JOIN shows s ON o.show_id = s.id
      JOIN performances p ON s.performance_id = p.id
      LEFT JOIN order_items oi ON o.id = oi.order_id
      LEFT JOIN seats st ON oi.seat_id = st.id
      WHERE o.show_id = ? AND o.payment_status IN ('paid', 'refunded', 'partial_refunded')
      GROUP BY o.id
      ORDER BY o.paid_at
    `).all([settlement.show_id]);

    orderItems.forEach(item => {
      item.payment_method = getPaymentMethodText(item.payment_method);
    });

    const refundItems = req.db.prepare(`
      SELECT
        rf.refund_no,
        o.order_no,
        p.name as performance_name,
        s.show_date,
        t.name as theater_name,
        st.row_label || st.seat_number as seat,
        oi.original_price as original_price,
        oi.discount_price as ticket_price,
        rf.refund_amount,
        rf.fee_amount,
        rf.reason,
        u.name as operator_name,
        rf.created_at as refund_time
      FROM refunds rf
      JOIN orders o ON rf.order_id = o.id
      JOIN order_items oi ON rf.order_item_id = oi.id
      JOIN seats st ON rf.seat_id = st.id
      JOIN shows s ON o.show_id = s.id
      JOIN performances p ON s.performance_id = p.id
      JOIN theaters t ON s.theater_id = t.id
      JOIN users u ON rf.operator_id = u.id
      WHERE o.show_id = ?
      ORDER BY rf.created_at
    `).all([settlement.show_id]);

    let tieredInfo = '';
    if (settlement.tiered_config) {
      try {
        const tiers = JSON.parse(settlement.tiered_config);
        tieredInfo = tiers.map(t => `净收入≥${t.threshold}元 → ${t.share_ratio}%`).join('；');
      } catch (e) {
        tieredInfo = settlement.tiered_config;
      }
    }

    const infoHeaders = ['项目', '内容'];
    const infoRows = [
      { '项目': '结算单号', '内容': settlement.settlement_no || ('SET' + settlement.id) },
      { '项目': '版本号', '内容': `v${settlement.version || 1}${settlement.parent_id ? ' (基于 v' + (settlement.version - 1) + ' 修改)' : ''}` },
      { '项目': '结算状态', '内容': statusText[settlement.status] || settlement.status },
      { '项目': '结算模式', '内容': settlementModeText[settlement.settlement_mode] || settlement.settlement_mode },
      { '项目': '剧目', '内容': settlement.performance_name },
      { '项目': '演出日期', '内容': `${settlement.show_date} ${settlement.start_time || ''}` },
      { '项目': '剧场', '内容': settlement.theater_name },
      { '项目': '演出团体', '内容': settlement.group_name },
      { '项目': '售票数', '内容': settlement.total_tickets + ' 张' },
    ];

    if (settlement.settlement_mode === 'ratio') {
      infoRows.push({ '项目': '分成参数', '内容': `团体比例: ${settlement.share_ratio}%, 剧场比例: ${100 - parseFloat(settlement.share_ratio || 0)}%` });
    } else if (settlement.settlement_mode === 'fixed') {
      infoRows.push({ '项目': '分成参数', '内容': `剧场固定费用: ${parseFloat(settlement.fixed_fee || 0).toFixed(2)} 元` });
    } else if (settlement.settlement_mode === 'guaranteed') {
      infoRows.push({ '项目': '分成参数', '内容': `团体比例: ${settlement.share_ratio}%, 保底金额: ${parseFloat(settlement.guaranteed_amount || 0).toFixed(2)} 元（取较高者）` });
    } else if (settlement.settlement_mode === 'tiered') {
      infoRows.push({ '项目': '分成参数', '内容': `基准比例: ${settlement.share_ratio}%, 阶梯规则: ${tieredInfo || '无'}` });
    }

    infoRows.push(
      { '项目': '总票房(折扣后实收)', '内容': parseFloat((settlement.total_revenue || 0)).toFixed(2) + ' 元' },
      { '项目': '退票金额(扣除手续费)', '内容': parseFloat((settlement.total_refunds || 0)).toFixed(2) + ' 元' },
      { '项目': '净收入(票房-退票)', '内容': parseFloat((settlement.net_revenue || 0)).toFixed(2) + ' 元' },
      { '项目': '演出团体分成', '内容': parseFloat((settlement.group_share || 0)).toFixed(2) + ' 元' },
      { '项目': '剧场分成', '内容': parseFloat((settlement.theater_share || 0)).toFixed(2) + ' 元' },
      { '项目': '创建人', '内容': settlement.created_by_name || '系统' },
      { '项目': '创建时间', '内容': settlement.created_at || '' },
      { '项目': '确认人/时间', '内容': settlement.confirmed_by_name ? `${settlement.confirmed_by_name} / ${settlement.confirmed_at || ''}` : '未确认' },
      { '项目': '支付人/时间', '内容': settlement.paid_by_name ? `${settlement.paid_by_name} / ${settlement.paid_at || ''}` : '未支付' },
    );

    if (settlement.is_void) {
      infoRows.push({ '项目': '作废原因', '内容': settlement.void_reason || '无' });
      infoRows.push({ '项目': '作废人/时间', '内容': `${settlement.void_by_name || '系统'} / ${settlement.void_at || ''}` });
    }

    const orderHeaders = ['订单号', '剧目', '演出日期', '购票人', '手机号', '座位', '座位数', '原价总额', '折扣金额', '实收金额', '支付方式', '支付时间'];
    const orderRowData = orderItems.map(o => ({
      '订单号': o.order_no,
      '剧目': o.performance_name,
      '演出日期': o.show_date,
      '购票人': o.buyer_name || '',
      '手机号': o.buyer_phone || '',
      '座位': o.seats || '',
      '座位数': o.seat_count || 0,
      '原价总额': parseFloat((o.original_total || 0).toFixed(2)),
      '折扣金额': parseFloat((o.discount_amount || 0).toFixed(2)),
      '实收金额': parseFloat((o.actual_amount || 0).toFixed(2)),
      '支付方式': o.payment_method || '',
      '支付时间': o.paid_at || ''
    }));

    const refundHeaders = ['退票单号', '原订单号', '剧目', '演出日期', '剧场', '座位', '原票价', '实付票价', '申请退票额', '手续费', '实退金额', '原因', '操作人', '退票时间'];
    const refundRowData = refundItems.map(r => ({
      '退票单号': r.refund_no,
      '原订单号': r.order_no,
      '剧目': r.performance_name,
      '演出日期': r.show_date,
      '剧场': r.theater_name,
      '座位': r.seat,
      '原票价': parseFloat((r.original_price || 0).toFixed(2)),
      '实付票价': parseFloat((r.ticket_price || 0).toFixed(2)),
      '申请退票额': parseFloat((r.refund_amount || 0).toFixed(2)),
      '手续费': parseFloat((r.fee_amount || 0).toFixed(2)),
      '实退金额': parseFloat(((r.refund_amount || 0) - (r.fee_amount || 0)).toFixed(2)),
      '原因': r.reason || '',
      '操作人': r.operator_name || '',
      '退票时间': r.refund_time || ''
    }));

    const infoCsv = buildCsv(infoHeaders, infoRows);
    const orderCsv = buildCsv(orderHeaders, orderRowData);
    const refundCsv = buildCsv(refundHeaders, refundRowData);

    const fullCsv = infoCsv + '\n\n【订单明细】\n' + orderCsv + '\n\n【退票明细】\n' + refundCsv;

    const timestamp = new Date().toISOString().slice(0, 10);
    setCsvResponse(res, `结算单_${settlement.performance_name}_v${settlement.version || 1}_${timestamp}.csv`);
    res.send(fullCsv);
  } catch (err) {
    return res.status(500).json({ message: '导出失败', error: err.message });
  }
});

router.get('/refunds', authenticateToken, requireRole('manager', 'finance'), (req, res) => {
  const { start_date, end_date, show_id, performance_id } = req.query;

  let query = `
    SELECT
      'REF' || rf.id as refund_no,
      o.order_no,
      p.name as performance_name,
      s.show_date,
      t.name as theater_name,
      st.row_label || st.seat_number as seat,
      oi.original_price as original_price,
      rf.refund_amount,
      CASE 
        WHEN (oi.discount_price - rf.refund_amount) > 0 THEN (oi.discount_price - rf.refund_amount)
        ELSE 0 
      END as fee,
      rf.reason,
      u.name as operator_name,
      rf.created_at as refund_time
    FROM refunds rf
    JOIN orders o ON rf.order_id = o.id
    JOIN order_items oi ON rf.order_item_id = oi.id
    JOIN seats st ON rf.seat_id = st.id
    JOIN shows s ON o.show_id = s.id
    JOIN performances p ON s.performance_id = p.id
    JOIN theaters t ON s.theater_id = t.id
    JOIN users u ON rf.operator_id = u.id
    WHERE 1=1
  `;
  const params = [];

  if (start_date) {
    query += ' AND rf.created_at >= ?';
    params.push(start_date);
  }
  if (end_date) {
    query += ' AND rf.created_at <= ?';
    params.push(end_date);
  }
  if (show_id) {
    query += ' AND o.show_id = ?';
    params.push(show_id);
  }
  if (performance_id) {
    query += ' AND s.performance_id = ?';
    params.push(performance_id);
  }

  query += ' ORDER BY rf.created_at DESC';

  try {
    const refunds = req.db.prepare(query).all(params);

    const rows = refunds.map(r => ({
      '退票单号': r.refund_no,
      '原订单号': r.order_no,
      '剧目': r.performance_name,
      '演出日期': r.show_date,
      '剧场': r.theater_name,
      '座位': r.seat,
      '原票价': parseFloat((r.original_price || 0).toFixed(2)),
      '退票金额': parseFloat((r.refund_amount || 0).toFixed(2)),
      '手续费': parseFloat((r.fee || 0).toFixed(2)),
      '实退金额': parseFloat(((r.refund_amount || 0) - (r.fee || 0)).toFixed(2)),
      '原因': r.reason || '',
      '操作人': r.operator_name || '',
      '退票时间': r.refund_time || ''
    }));

    const headers = ['退票单号', '原订单号', '剧目', '演出日期', '剧场', '座位', '原票价', '退票金额', '手续费', '实退金额', '原因', '操作人', '退票时间'];
    const csv = buildCsv(headers, rows);
    const timestamp = new Date().toISOString().slice(0, 10);
    setCsvResponse(res, `退票明细_${timestamp}.csv`);
    res.send(csv);
  } catch (err) {
    return res.status(500).json({ message: '导出失败', error: err.message });
  }
});

module.exports = router;
