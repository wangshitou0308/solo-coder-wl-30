const express = require('express');
const { saveDb } = require('../database/db');
const { authenticateToken, requireRole } = require('../middleware/auth');
const { writeAuditLog } = require('./audit');

const router = express.Router();

const STATUS_FLOW = {
  pending_generated: ['pending_confirm', 'void'],
  pending_confirm: ['confirmed', 'void'],
  confirmed: ['paid', 'void'],
  paid: ['void'],
  void: []
};

const SETTLEMENT_MODES = ['ratio', 'fixed', 'guaranteed', 'tiered'];

const SETTLEMENT_MODE_OPTIONS = {
  ratio: { label: '比例分成', desc: '按约定比例在剧团与剧院之间分配净票房（如剧团50%/剧院50%）' },
  fixed: { label: '固定费用', desc: '剧院收取固定场租，剩余票房全部归演出团体' },
  guaranteed: { label: '保底+分成', desc: '剧团票房收入=「比例分成」与「保底金额」两者取高，保障演出团体基本收益' },
  tiered: { label: '阶梯分成', desc: '按票房阶梯阈值动态切换分账比例，票房越高剧团分成比例越高' }
};

router.get('/mode/choices', authenticateToken, (req, res) => {
  res.json({ modes: SETTLEMENT_MODE_OPTIONS });
});

const validateSettlementConfig = (config) => {
  const errors = [];
  const { settlement_mode, share_ratio, fixed_fee, guaranteed_amount, tiered_config } = config;

  if (!SETTLEMENT_MODES.includes(settlement_mode)) {
    errors.push(`无效的结算模式: ${settlement_mode}`);
  }

  switch (settlement_mode) {
    case 'ratio':
      if (share_ratio === undefined || share_ratio < 0 || share_ratio > 100) {
        errors.push('分账比例必须在 0-100 之间');
      }
      break;
    case 'fixed':
      if (fixed_fee === undefined || fixed_fee < 0) {
        errors.push('固定费用不能为负数');
      }
      break;
    case 'guaranteed':
      if (share_ratio === undefined || share_ratio < 0 || share_ratio > 100) {
        errors.push('分账比例必须在 0-100 之间');
      }
      if (guaranteed_amount === undefined || guaranteed_amount < 0) {
        errors.push('保底金额不能为负数');
      }
      break;
    case 'tiered':
      if (!tiered_config || !Array.isArray(tiered_config) || tiered_config.length === 0) {
        errors.push('阶梯分成必须提供配置');
      } else {
        tiered_config.forEach((tier, idx) => {
          if (tier.threshold === undefined || tier.share_ratio === undefined) {
            errors.push(`阶梯配置第 ${idx + 1} 项缺少 threshold 或 share_ratio`);
          }
          if (tier.share_ratio < 0 || tier.share_ratio > 100) {
            errors.push(`阶梯配置第 ${idx + 1} 项分成比例必须在 0-100 之间`);
          }
        });
      }
      break;
  }

  return errors;
};

const calculateSettlement = (netRevenue, config) => {
  const { settlement_mode, share_ratio = 50, fixed_fee = 0, guaranteed_amount = 0, tiered_config = [] } = config;

  let groupShare = 0;
  let theaterShare = 0;

  switch (settlement_mode) {
    case 'ratio':
      groupShare = netRevenue * (share_ratio / 100);
      theaterShare = netRevenue - groupShare;
      break;
    case 'fixed':
      groupShare = netRevenue - fixed_fee;
      theaterShare = fixed_fee;
      break;
    case 'guaranteed':
      const ratioShare = netRevenue * (share_ratio / 100);
      groupShare = Math.max(ratioShare, guaranteed_amount);
      theaterShare = netRevenue - groupShare;
      break;
    case 'tiered':
      let appliedRatio = share_ratio || 50;
      const sortedTiers = [...tiered_config].sort((a, b) => a.threshold - b.threshold);
      for (const tier of sortedTiers) {
        if (netRevenue >= tier.threshold) {
          appliedRatio = tier.share_ratio;
        }
      }
      groupShare = netRevenue * (appliedRatio / 100);
      theaterShare = netRevenue - groupShare;
      break;
  }

  return {
    group_share: parseFloat(groupShare.toFixed(2)),
    theater_share: parseFloat(theaterShare.toFixed(2))
  };
};

const generateSettlementNo = () => {
  const now = new Date();
  const datePart = now.getFullYear().toString() +
    (now.getMonth() + 1).toString().padStart(2, '0') +
    now.getDate().toString().padStart(2, '0');
  const randPart = Math.random().toString(36).substr(2, 6).toUpperCase();
  return `SET${datePart}${randPart}`;
};

const getShowStatsForSettlement = (db, showId) => {
  const stats = db.prepare(`
    SELECT
      COUNT(DISTINCT CASE WHEN o.payment_status = 'paid' THEN st.id END) as total_tickets,
      COALESCE(SUM(CASE WHEN o.payment_status = 'paid' THEN oi.original_price END), 0) as total_original,
      COALESCE(SUM(CASE WHEN o.payment_status = 'paid' THEN (oi.original_price - oi.discount_price) END), 0) as total_discount,
      COALESCE(SUM(CASE WHEN o.payment_status = 'paid' THEN oi.discount_price END), 0) as total_revenue,
      COUNT(DISTINCT rf.id) as refund_count,
      COALESCE(SUM(rf.refund_amount), 0) as total_refunds_raw,
      COALESCE(SUM(rf.fee_amount), 0) as total_refund_fees
    FROM orders o
    LEFT JOIN order_items oi ON o.id = oi.order_id
    LEFT JOIN seats st ON oi.seat_id = st.id
    LEFT JOIN refunds rf ON oi.id = rf.order_item_id
    WHERE o.show_id = ? AND o.payment_status IN ('paid', 'refunded', 'partial_refunded')
  `).get([showId]);

  const totalTickets = stats.total_tickets || 0;
  const totalRevenue = parseFloat((stats.total_revenue || 0).toFixed(2));
  const totalRefunds = parseFloat(((stats.total_refunds_raw || 0) - (stats.total_refund_fees || 0)).toFixed(2));
  const netRevenue = parseFloat((totalRevenue - totalRefunds).toFixed(2));

  return {
    total_tickets: totalTickets,
    total_revenue: totalRevenue,
    total_discount: parseFloat((stats.total_discount || 0).toFixed(2)),
    total_original: parseFloat((stats.total_original || 0).toFixed(2)),
    total_refunds: Math.max(0, totalRefunds),
    total_refund_fees: parseFloat((stats.total_refund_fees || 0).toFixed(2)),
    refund_count: stats.refund_count || 0,
    net_revenue: Math.max(0, netRevenue)
  };
};

router.get('/', authenticateToken, requireRole('manager', 'finance'), (req, res) => {
  const { show_id, status, performance_id, theater_id, start_date, end_date, page = 1, page_size = 20 } = req.query;

  let countQuery = `
    SELECT COUNT(*) as total FROM settlements s
    JOIN shows sh ON s.show_id = sh.id
    JOIN performances p ON sh.performance_id = p.id
    JOIN theaters t ON sh.theater_id = t.id
    WHERE s.is_void = 0
  `;
  let query = `
    SELECT s.*, p.name as performance_name, p.type as performance_type,
           sh.show_date, sh.start_time, sh.status as show_status,
           t.name as theater_name, g.name as group_name,
           uc.name as created_by_name,
           ucf.name as confirmed_by_name,
           up.name as paid_by_name,
           uv.name as void_by_name
    FROM settlements s
    JOIN shows sh ON s.show_id = sh.id
    JOIN performances p ON sh.performance_id = p.id
    JOIN theaters t ON sh.theater_id = t.id
    JOIN theater_groups g ON p.group_id = g.id
    LEFT JOIN users uc ON s.created_by = uc.id
    LEFT JOIN users ucf ON s.confirmed_by = ucf.id
    LEFT JOIN users up ON s.paid_by = up.id
    LEFT JOIN users uv ON s.void_by = uv.id
    WHERE s.is_void = 0
  `;
  const params = [];
  const countParams = [];

  if (show_id) {
    query += ' AND s.show_id = ?';
    countQuery += ' AND s.show_id = ?';
    params.push(parseInt(show_id));
    countParams.push(parseInt(show_id));
  }
  if (status) {
    query += ' AND s.status = ?';
    countQuery += ' AND s.status = ?';
    params.push(status);
    countParams.push(status);
  }
  if (performance_id) {
    query += ' AND sh.performance_id = ?';
    countQuery += ' AND sh.performance_id = ?';
    params.push(parseInt(performance_id));
    countParams.push(parseInt(performance_id));
  }
  if (theater_id) {
    query += ' AND sh.theater_id = ?';
    countQuery += ' AND sh.theater_id = ?';
    params.push(parseInt(theater_id));
    countParams.push(parseInt(theater_id));
  }
  if (start_date) {
    query += ' AND sh.show_date >= ?';
    countQuery += ' AND sh.show_date >= ?';
    params.push(start_date);
    countParams.push(start_date);
  }
  if (end_date) {
    query += ' AND sh.show_date <= ?';
    countQuery += ' AND sh.show_date <= ?';
    params.push(end_date);
    countParams.push(end_date);
  }

  query += ' ORDER BY s.created_at DESC LIMIT ? OFFSET ?';
  const queryParams = [...params, parseInt(page_size), (parseInt(page) - 1) * parseInt(page_size)];

  try {
    const countResult = req.db.prepare(countQuery).get(countParams);
    const settlements = req.db.prepare(query).all(queryParams);

    const processed = settlements.map(s => ({
      ...s,
      is_void: !!s.is_void,
      total_tickets: s.total_tickets || 0,
      total_revenue: parseFloat(s.total_revenue || 0),
      total_refunds: parseFloat(s.total_refunds || 0),
      net_revenue: parseFloat(s.net_revenue || 0),
      group_share: parseFloat(s.group_share || 0),
      theater_share: parseFloat(s.theater_share || 0),
      share_ratio: parseFloat(s.share_ratio || 0),
      fixed_fee: parseFloat(s.fixed_fee || 0),
      guaranteed_amount: parseFloat(s.guaranteed_amount || 0),
      tiered_config: s.tiered_config ? JSON.parse(s.tiered_config) : null
    }));

    res.json({
      settlements: processed,
      total: countResult.total,
      page: parseInt(page),
      page_size: parseInt(page_size)
    });
  } catch (err) {
    return res.status(500).json({ message: '查询结算列表失败', error: err.message });
  }
});

router.get('/:id', authenticateToken, requireRole('manager', 'finance'), (req, res) => {
  const { id } = req.params;

  try {
    const settlement = req.db.prepare(`
      SELECT s.*, p.name as performance_name, p.type as performance_type, p.group_id,
             sh.show_date, sh.start_time, sh.end_time, sh.status as show_status,
             t.name as theater_name, g.name as group_name,
             uc.name as created_by_name,
             ucf.name as confirmed_by_name,
             up.name as paid_by_name,
             uv.name as void_by_name
      FROM settlements s
      JOIN shows sh ON s.show_id = sh.id
      JOIN performances p ON sh.performance_id = p.id
      JOIN theaters t ON sh.theater_id = t.id
      JOIN theater_groups g ON p.group_id = g.id
      LEFT JOIN users uc ON s.created_by = uc.id
      LEFT JOIN users ucf ON s.confirmed_by = ucf.id
      LEFT JOIN users up ON s.paid_by = up.id
      LEFT JOIN users uv ON s.void_by = uv.id
      WHERE s.id = ?
    `).get([id]);

    if (!settlement) {
      return res.status(404).json({ message: '结算单不存在' });
    }

    const stats = getShowStatsForSettlement(req.db, settlement.show_id);

    const versionHistory = req.db.prepare(`
      SELECT s.*, u.name as created_by_name
      FROM settlements s
      LEFT JOIN users u ON s.created_by = u.id
      WHERE s.show_id = ?
      ORDER BY s.version DESC, s.created_at DESC
    `).all([settlement.show_id]);

    const orders = req.db.prepare(`
      SELECT
        o.order_no,
        o.buyer_name,
        o.buyer_phone,
        o.payment_method,
        o.paid_at,
        o.payment_status,
        COUNT(DISTINCT oi.seat_id) as seat_count,
        COALESCE(SUM(CASE WHEN o.payment_status = 'paid' THEN oi.original_price END), 0) as original_total,
        COALESCE(SUM(CASE WHEN o.payment_status = 'paid' THEN (oi.original_price - oi.discount_price) END), 0) as discount_amount,
        COALESCE(CASE WHEN o.payment_status = 'paid' THEN o.actual_amount END, 0) as actual_amount,
        GROUP_CONCAT(st.row_label || st.seat_number, '、') as seats
      FROM orders o
      LEFT JOIN order_items oi ON o.id = oi.order_id
      LEFT JOIN seats st ON oi.seat_id = st.id
      WHERE o.show_id = ? AND o.payment_status IN ('paid', 'refunded', 'partial_refunded')
      GROUP BY o.id
      ORDER BY o.paid_at
    `).all([settlement.show_id]);

    const refunds = req.db.prepare(`
      SELECT
        rf.refund_no,
        o.order_no,
        st.row_label || st.seat_number as seat,
        sz.zone_name,
        oi.original_price,
        oi.discount_price,
        rf.refund_amount,
        rf.fee_amount,
        rf.reason,
        u.name as operator_name,
        rf.created_at as refund_at
      FROM refunds rf
      JOIN orders o ON rf.order_id = o.id
      JOIN order_items oi ON rf.order_item_id = oi.id
      JOIN seats st ON rf.seat_id = st.id
      LEFT JOIN seat_zones sz ON st.zone_id = sz.id
      JOIN users u ON rf.operator_id = u.id
      WHERE o.show_id = ?
      ORDER BY rf.created_at DESC
    `).all([settlement.show_id]);

    const result = {
      ...settlement,
      is_void: !!settlement.is_void,
      total_tickets: settlement.total_tickets || 0,
      total_revenue: parseFloat(settlement.total_revenue || 0),
      total_refunds: parseFloat(settlement.total_refunds || 0),
      net_revenue: parseFloat(settlement.net_revenue || 0),
      group_share: parseFloat(settlement.group_share || 0),
      theater_share: parseFloat(settlement.theater_share || 0),
      share_ratio: parseFloat(settlement.share_ratio || 0),
      fixed_fee: parseFloat(settlement.fixed_fee || 0),
      guaranteed_amount: parseFloat(settlement.guaranteed_amount || 0),
      tiered_config: settlement.tiered_config ? JSON.parse(settlement.tiered_config) : null,
      live_stats: stats,
      version_history: versionHistory.map(v => ({
        ...v,
        is_void: !!v.is_void,
        total_revenue: parseFloat(v.total_revenue || 0),
        net_revenue: parseFloat(v.net_revenue || 0)
      })),
      orders: orders.map(o => ({
        ...o,
        original_total: parseFloat(o.original_total || 0),
        discount_amount: parseFloat(o.discount_amount || 0),
        actual_amount: parseFloat(o.actual_amount || 0)
      })),
      refunds: refunds.map(r => ({
        ...r,
        original_price: parseFloat(r.original_price || 0),
        discount_price: parseFloat(r.discount_price || 0),
        refund_amount: parseFloat(r.refund_amount || 0),
        fee_amount: parseFloat(r.fee_amount || 0)
      }))
    };

    res.json({ settlement: result });
  } catch (err) {
    return res.status(500).json({ message: '查询结算详情失败', error: err.message });
  }
});

router.post('/generate', authenticateToken, requireRole('manager', 'finance'), (req, res) => {
  const {
    show_id,
    settlement_mode = 'ratio',
    share_ratio = 50,
    fixed_fee = 0,
    guaranteed_amount = 0,
    tiered_config,
    force_regenerate = false
  } = req.body;

  if (!show_id) {
    return res.status(400).json({ message: '必须指定场次 ID' });
  }

  const errors = validateSettlementConfig({ settlement_mode, share_ratio, fixed_fee, guaranteed_amount, tiered_config });
  if (errors.length > 0) {
    return res.status(400).json({ message: errors.join('; ') });
  }

  try {
    const show = req.db.prepare(`
      SELECT sh.*, p.status as performance_status
      FROM shows sh
      JOIN performances p ON sh.performance_id = p.id
      WHERE sh.id = ?
    `).get([show_id]);

    if (!show) {
      return res.status(404).json({ message: '场次不存在' });
    }
    if (show.status !== 'ended') {
      return res.status(400).json({ message: `仅可对已结束的场次生成结算（当前状态: ${show.status}）` });
    }
    if (show.performance_status !== 'approved') {
      return res.status(400).json({ message: '演出项目未通过审批，无法结算' });
    }

    const ticketVersion = req.db.prepare(`
      SELECT id FROM ticket_versions WHERE show_id = ? LIMIT 1
    `).get([show_id]);
    if (!ticketVersion) {
      return res.status(400).json({ message: '该场次未配置票版，无法结算' });
    }

    const existing = req.db.prepare(`
      SELECT * FROM settlements
      WHERE show_id = ? AND is_void = 0
      ORDER BY version DESC
      LIMIT 1
    `).get([show_id]);

    let parentId = null;
    let newVersion = 1;

    if (existing) {
      if (!force_regenerate) {
        return res.status(409).json({
          message: `该场次已存在有效结算单（单号: ${existing.settlement_no}，版本: ${existing.version}），如需重新生成请使用 force_regenerate 参数`,
          existing_settlement: {
            id: existing.id,
            settlement_no: existing.settlement_no,
            version: existing.version,
            status: existing.status
          }
        });
      }
      parentId = existing.id;
      newVersion = existing.version + 1;
    }

    const stats = getShowStatsForSettlement(req.db, show_id);
    const shares = calculateSettlement(stats.net_revenue, {
      settlement_mode,
      share_ratio: parseFloat(share_ratio),
      fixed_fee: parseFloat(fixed_fee),
      guaranteed_amount: parseFloat(guaranteed_amount),
      tiered_config
    });

    const settlementNo = generateSettlementNo();

    req.db.run('BEGIN IMMEDIATE');

    const insertStmt = req.db.prepare(`
      INSERT INTO settlements (
        show_id, settlement_no, version, parent_id,
        total_tickets, total_revenue, total_refunds, net_revenue,
        group_share, theater_share, share_ratio,
        settlement_mode, fixed_fee, guaranteed_amount, tiered_config,
        status, is_void, created_by, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending_confirm', 0, ?, CURRENT_TIMESTAMP)
    `);

    const insertResult = insertStmt.run([
      show_id, settlementNo, newVersion, parentId,
      stats.total_tickets, stats.total_revenue, stats.total_refunds, stats.net_revenue,
      shares.group_share, shares.theater_share, parseFloat(share_ratio),
      settlement_mode, parseFloat(fixed_fee), parseFloat(guaranteed_amount),
      tiered_config ? JSON.stringify(tiered_config) : null,
      req.user.id
    ]);

    const newId = insertResult.lastInsertRowid;

    if (existing) {
      req.db.prepare(`
        UPDATE settlements SET is_void = 1, void_reason = ?, void_by = ?, void_at = CURRENT_TIMESTAMP, status = 'void'
        WHERE id = ?
      `).run(['重新生成新版本结算单', req.user.id, existing.id]);

      writeAuditLog(req.db, {
        user_id: req.user.id,
        user_name: req.user.name,
        action: 'void_settlement',
        target_type: 'settlement',
        target_id: existing.id,
        detail: JSON.stringify({
          settlement_no: existing.settlement_no,
          void_reason: '重新生成新版本结算单',
          replaced_by: settlementNo,
          new_version: newVersion
        }),
        ip_address: req.ip
      });
    }

    writeAuditLog(req.db, {
      user_id: req.user.id,
      user_name: req.user.name,
      action: 'create_settlement',
      target_type: 'settlement',
      target_id: newId,
      detail: JSON.stringify({
        settlement_no: settlementNo,
        show_id,
        version: newVersion,
        parent_id: parentId,
        settlement_mode,
        share_ratio: parseFloat(share_ratio),
        fixed_fee: parseFloat(fixed_fee),
        guaranteed_amount: parseFloat(guaranteed_amount),
        tiered_config: tiered_config || null,
        stats,
        shares
      }),
      ip_address: req.ip
    });

    req.db.run('COMMIT');
    saveDb();

    res.status(201).json({
      message: force_regenerate ? '结算单重新生成成功，旧版本已作废' : '结算单生成成功',
      id: newId,
      settlement_no: settlementNo,
      version: newVersion,
      status: 'pending_confirm',
      settlement: {
        total_tickets: stats.total_tickets,
        total_revenue: stats.total_revenue,
        total_discount: stats.total_discount,
        total_refunds: stats.total_refunds,
        net_revenue: stats.net_revenue,
        group_share: shares.group_share,
        theater_share: shares.theater_share
      }
    });
  } catch (err) {
    try { req.db.run('ROLLBACK'); } catch (e) {}
    return res.status(500).json({ message: '生成结算单失败', error: err.message });
  }
});

router.post('/:id/confirm', authenticateToken, requireRole('manager', 'finance'), (req, res) => {
  const { id } = req.params;

  try {
    const settlement = req.db.prepare('SELECT * FROM settlements WHERE id = ?').get([id]);
    if (!settlement) {
      return res.status(404).json({ message: '结算单不存在' });
    }
    if (settlement.is_void) {
      return res.status(400).json({ message: '该结算单已作废，无法确认' });
    }
    if (!STATUS_FLOW.pending_confirm.includes('confirmed')) {
      return res.status(400).json({ message: `状态异常: 当前 ${settlement.status}` });
    }
    if (settlement.status !== 'pending_confirm') {
      return res.status(400).json({ message: `仅待确认的结算单可确认（当前状态: ${settlement.status}）` });
    }

    req.db.run('BEGIN IMMEDIATE');

    req.db.prepare(`
      UPDATE settlements SET status = 'confirmed', confirmed_by = ?, confirmed_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run([req.user.id, id]);

    writeAuditLog(req.db, {
      user_id: req.user.id,
      user_name: req.user.name,
      action: 'confirm_settlement',
      target_type: 'settlement',
      target_id: parseInt(id),
      detail: JSON.stringify({
        settlement_no: settlement.settlement_no,
        previous_status: settlement.status,
        new_status: 'confirmed',
        net_revenue: parseFloat(settlement.net_revenue || 0),
        group_share: parseFloat(settlement.group_share || 0),
        theater_share: parseFloat(settlement.theater_share || 0)
      }),
      ip_address: req.ip
    });

    req.db.run('COMMIT');
    saveDb();

    res.json({ message: '结算单已确认' });
  } catch (err) {
    try { req.db.run('ROLLBACK'); } catch (e) {}
    return res.status(500).json({ message: '确认结算单失败', error: err.message });
  }
});

router.post('/:id/pay', authenticateToken, requireRole('finance'), (req, res) => {
  const { id } = req.params;

  try {
    const settlement = req.db.prepare('SELECT * FROM settlements WHERE id = ?').get([id]);
    if (!settlement) {
      return res.status(404).json({ message: '结算单不存在' });
    }
    if (settlement.is_void) {
      return res.status(400).json({ message: '该结算单已作废，无法支付' });
    }
    if (settlement.status !== 'confirmed') {
      return res.status(400).json({ message: `仅已确认的结算单可支付（当前状态: ${settlement.status}）` });
    }

    req.db.run('BEGIN IMMEDIATE');

    req.db.prepare(`
      UPDATE settlements SET status = 'paid', paid_by = ?, paid_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run([req.user.id, id]);

    writeAuditLog(req.db, {
      user_id: req.user.id,
      user_name: req.user.name,
      action: 'pay_settlement',
      target_type: 'settlement',
      target_id: parseInt(id),
      detail: JSON.stringify({
        settlement_no: settlement.settlement_no,
        previous_status: settlement.status,
        new_status: 'paid',
        group_share: parseFloat(settlement.group_share || 0),
        theater_share: parseFloat(settlement.theater_share || 0)
      }),
      ip_address: req.ip
    });

    req.db.run('COMMIT');
    saveDb();

    res.json({ message: '结算单已标记为已支付' });
  } catch (err) {
    try { req.db.run('ROLLBACK'); } catch (e) {}
    return res.status(500).json({ message: '结算支付操作失败', error: err.message });
  }
});

router.post('/:id/void', authenticateToken, requireRole('manager', 'finance'), (req, res) => {
  const { id } = req.params;
  const { void_reason = '手动作废' } = req.body;

  try {
    const settlement = req.db.prepare('SELECT * FROM settlements WHERE id = ?').get([id]);
    if (!settlement) {
      return res.status(404).json({ message: '结算单不存在' });
    }
    if (settlement.is_void) {
      return res.status(400).json({ message: '该结算单已作废' });
    }
    if (settlement.status === 'paid') {
      return res.status(400).json({ message: '已支付的结算单不可作废，请先处理财务冲销' });
    }

    req.db.run('BEGIN IMMEDIATE');

    req.db.prepare(`
      UPDATE settlements SET status = 'void', is_void = 1, void_reason = ?, void_by = ?, void_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run([void_reason, req.user.id, id]);

    writeAuditLog(req.db, {
      user_id: req.user.id,
      user_name: req.user.name,
      action: 'void_settlement',
      target_type: 'settlement',
      target_id: parseInt(id),
      detail: JSON.stringify({
        settlement_no: settlement.settlement_no,
        previous_status: settlement.status,
        new_status: 'void',
        void_reason
      }),
      ip_address: req.ip
    });

    req.db.run('COMMIT');
    saveDb();

    res.json({ message: '结算单已作废' });
  } catch (err) {
    try { req.db.run('ROLLBACK'); } catch (e) {}
    return res.status(500).json({ message: '作废结算单失败', error: err.message });
  }
});

router.get('/preview/:showId', authenticateToken, requireRole('manager', 'finance'), (req, res) => {
  const { showId } = req.params;
  const {
    settlement_mode = 'ratio',
    share_ratio = 50,
    fixed_fee = 0,
    guaranteed_amount = 0,
    tiered_config_str
  } = req.query;

  try {
    let tiered_config = null;
    if (tiered_config_str) {
      try {
        tiered_config = JSON.parse(tiered_config_str);
      } catch (e) {
        return res.status(400).json({ message: 'tiered_config_str 不是有效的 JSON' });
      }
    }

    const errors = validateSettlementConfig({
      settlement_mode,
      share_ratio: parseFloat(share_ratio),
      fixed_fee: parseFloat(fixed_fee),
      guaranteed_amount: parseFloat(guaranteed_amount),
      tiered_config
    });
    if (errors.length > 0) {
      return res.status(400).json({ message: errors.join('; ') });
    }

    const show = req.db.prepare(`
      SELECT sh.*, p.name as performance_name, g.name as group_name,
             t.name as theater_name
      FROM shows sh
      JOIN performances p ON sh.performance_id = p.id
      JOIN theaters t ON sh.theater_id = t.id
      JOIN theater_groups g ON p.group_id = g.id
      WHERE sh.id = ?
    `).get([showId]);

    if (!show) {
      return res.status(404).json({ message: '场次不存在' });
    }

    const stats = getShowStatsForSettlement(req.db, showId);
    const shares = calculateSettlement(stats.net_revenue, {
      settlement_mode,
      share_ratio: parseFloat(share_ratio),
      fixed_fee: parseFloat(fixed_fee),
      guaranteed_amount: parseFloat(guaranteed_amount),
      tiered_config
    });

    res.json({
      show: {
        id: show.id,
        performance_name: show.performance_name,
        group_name: show.group_name,
        theater_name: show.theater_name,
        show_date: show.show_date,
        start_time: show.start_time,
        status: show.status
      },
      stats,
      settlement_config: {
        settlement_mode,
        share_ratio: parseFloat(share_ratio),
        fixed_fee: parseFloat(fixed_fee),
        guaranteed_amount: parseFloat(guaranteed_amount),
        tiered_config: tiered_config || null
      },
      shares
    });
  } catch (err) {
    return res.status(500).json({ message: '预览失败', error: err.message });
  }
});

router.get('/summary/stats', authenticateToken, requireRole('manager', 'finance'), (req, res) => {
  try {
    const statusCounts = req.db.prepare(`
      SELECT status, COUNT(*) as count,
             COALESCE(SUM(CASE WHEN is_void = 0 THEN total_revenue END), 0) as total_revenue,
             COALESCE(SUM(CASE WHEN is_void = 0 THEN net_revenue END), 0) as net_revenue,
             COALESCE(SUM(CASE WHEN is_void = 0 THEN group_share END), 0) as group_share,
             COALESCE(SUM(CASE WHEN is_void = 0 THEN theater_share END), 0) as theater_share
      FROM settlements
      WHERE is_void = 0
      GROUP BY status
    `).all([]);

    const overall = req.db.prepare(`
      SELECT COUNT(*) as total_count,
             COALESCE(SUM(CASE WHEN is_void = 0 THEN total_revenue END), 0) as total_revenue_all,
             COALESCE(SUM(CASE WHEN is_void = 0 THEN net_revenue END), 0) as net_revenue_all,
             COALESCE(SUM(CASE WHEN is_void = 0 THEN group_share END), 0) as group_share_all,
             COALESCE(SUM(CASE WHEN is_void = 0 THEN theater_share END), 0) as theater_share_all,
             COALESCE(SUM(CASE WHEN is_void = 0 AND status = 'paid' THEN group_share END), 0) as paid_group_share,
             COALESCE(SUM(CASE WHEN is_void = 0 AND status = 'paid' THEN theater_share END), 0) as paid_theater_share
      FROM settlements
    `).get([]);

    res.json({
      by_status: statusCounts.map(s => ({
        status: s.status,
        count: s.count,
        total_revenue: parseFloat(s.total_revenue || 0),
        net_revenue: parseFloat(s.net_revenue || 0),
        group_share: parseFloat(s.group_share || 0),
        theater_share: parseFloat(s.theater_share || 0)
      })),
      overall: {
        total_count: overall.total_count,
        total_revenue: parseFloat(overall.total_revenue_all || 0),
        net_revenue: parseFloat(overall.net_revenue_all || 0),
        group_share: parseFloat(overall.group_share_all || 0),
        theater_share: parseFloat(overall.theater_share_all || 0),
        paid_group_share: parseFloat(overall.paid_group_share || 0),
        paid_theater_share: parseFloat(overall.paid_theater_share || 0)
      }
    });
  } catch (err) {
    return res.status(500).json({ message: '获取结算统计失败', error: err.message });
  }
});

module.exports = router;
module.exports.calculateSettlement = calculateSettlement;
module.exports.getShowStatsForSettlement = getShowStatsForSettlement;
