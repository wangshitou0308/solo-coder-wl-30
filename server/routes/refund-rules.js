const express = require('express');
const { saveDb } = require('../database/db');
const { authenticateToken, requireRole } = require('../middleware/auth');

const router = express.Router();

const insertAuditLogRefund = (db, userId, userName, action, targetType, targetId, detail, ipAddress) => {
  try {
    db.prepare(`
      INSERT INTO audit_logs (user_id, user_name, action, target_type, target_id, detail, ip_address, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `).run([userId, userName, action, targetType, targetId, detail, ipAddress || null]);
  } catch (err) {
    console.warn('audit_log insert failed:', err.message);
  }
};

router.get('/', authenticateToken, requireRole('manager', 'finance'), (req, res) => {
  const { is_active, page = 1, page_size = 50 } = req.query;

  let countQuery = 'SELECT COUNT(*) as total FROM refund_rules WHERE 1=1';
  let query = 'SELECT * FROM refund_rules WHERE 1=1';
  const params = [];
  const countParams = [];

  if (is_active !== undefined) {
    const activeFlag = is_active === '1' || is_active === 'true' || is_active === true ? 1 : 0;
    query += ' AND is_active = ?';
    countQuery += ' AND is_active = ?';
    params.push(activeFlag);
    countParams.push(activeFlag);
  }

  query += ' ORDER BY is_active DESC, id DESC LIMIT ? OFFSET ?';
  const queryParams = [...params, parseInt(page_size), (parseInt(page) - 1) * parseInt(page_size)];

  try {
    const countResult = req.db.prepare(countQuery).get(countParams);
    const rules = req.db.prepare(query).all(queryParams);

    const processedRules = rules.map(r => ({
      ...r,
      allow_partial: !!r.allow_partial,
      allow_refund_after_settlement: !!r.allow_refund_after_settlement,
      is_active: !!r.is_active,
      deadline_hours_before: r.deadline_hours_before || 0,
      fee_rate: parseFloat(r.fee_rate) || 0,
      fee_minimum_amount: parseFloat(r.fee_minimum_amount) || 0
    }));

    res.json({
      rules: processedRules,
      total: countResult.total,
      page: parseInt(page),
      page_size: parseInt(page_size)
    });
  } catch (err) {
    return res.status(500).json({ message: '查询退票规则失败', error: err.message });
  }
});

router.get('/active', authenticateToken, (req, res) => {
  try {
    const rule = req.db.prepare(`
      SELECT * FROM refund_rules WHERE is_active = 1 ORDER BY id ASC LIMIT 1
    `).get([]);

    if (!rule) {
      return res.status(404).json({ message: '没有激活的退票规则' });
    }

    res.json({
      rule: {
        ...rule,
        allow_partial: !!rule.allow_partial,
        allow_refund_after_settlement: !!rule.allow_refund_after_settlement,
        is_active: !!rule.is_active,
        deadline_hours_before: rule.deadline_hours_before || 0,
        fee_rate: parseFloat(rule.fee_rate) || 0,
        fee_minimum_amount: parseFloat(rule.fee_minimum_amount) || 0
      }
    });
  } catch (err) {
    return res.status(500).json({ message: '查询失败', error: err.message });
  }
});

router.post('/', authenticateToken, requireRole('manager'), (req, res) => {
  const {
    name,
    allow_partial = true,
    deadline_hours_before = 2,
    fee_rate = 0,
    fee_minimum_amount = 0,
    allow_refund_after_settlement = false,
    is_active = false,
    set_as_default = false
  } = req.body;

  if (!name || name.trim().length === 0) {
    return res.status(400).json({ message: '请填写规则名称' });
  }

  const deadlineHours = parseInt(deadline_hours_before) || 0;
  if (deadlineHours < 0) {
    return res.status(400).json({ message: '演出前截止时间不能为负数' });
  }

  const rate = parseFloat(fee_rate) || 0;
  if (rate < 0 || rate > 100) {
    return res.status(400).json({ message: '手续费率必须在 0-100 之间' });
  }

  const minFee = parseFloat(fee_minimum_amount) || 0;
  if (minFee < 0) {
    return res.status(400).json({ message: '最低手续费不能为负数' });
  }

  try {
    req.db.run('BEGIN IMMEDIATE');

    if (set_as_default || is_active) {
      req.db.prepare(`UPDATE refund_rules SET is_active = 0 WHERE is_active = 1`).run([]);
    }

    const insertStmt = req.db.prepare(`
      INSERT INTO refund_rules (
        name, allow_partial, deadline_hours_before,
        fee_rate, fee_minimum_amount, allow_refund_after_settlement,
        is_active, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `);

    const result = insertStmt.run([
      name.trim(),
      allow_partial ? 1 : 0,
      deadlineHours,
      rate,
      minFee,
      allow_refund_after_settlement ? 1 : 0,
      is_active ? 1 : 0
    ]);

    const ruleId = result.lastInsertRowid;

    const auditDetail = JSON.stringify({
      rule_id: ruleId,
      name: name.trim(),
      allow_partial,
      deadline_hours_before: deadlineHours,
      fee_rate: rate,
      fee_minimum_amount: minFee,
      allow_refund_after_settlement,
      is_active: is_active,
      set_as_default
    });
    insertAuditLogRefund(req.db, req.user.id, req.user.name, 'create_refund_rule', 'settlement', ruleId, auditDetail, req.ip);

    req.db.run('COMMIT');
    saveDb();

    res.json({
      message: '退票规则创建成功',
      id: ruleId,
      rule: {
        id: ruleId,
        name: name.trim(),
        allow_partial,
        deadline_hours_before: deadlineHours,
        fee_rate: rate,
        fee_minimum_amount: minFee,
        allow_refund_after_settlement,
        is_active
      }
    });
  } catch (err) {
    try { req.db.run('ROLLBACK'); } catch (e) {}
    return res.status(500).json({ message: '创建退票规则失败', error: err.message });
  }
});

router.put('/:id', authenticateToken, requireRole('manager'), (req, res) => {
  const { id } = req.params;
  const {
    name,
    allow_partial,
    deadline_hours_before,
    fee_rate,
    fee_minimum_amount,
    allow_refund_after_settlement,
    set_as_default = false
  } = req.body;

  try {
    const existingRule = req.db.prepare('SELECT * FROM refund_rules WHERE id = ?').get([id]);
    if (!existingRule) {
      return res.status(404).json({ message: '退票规则不存在' });
    }

    const updates = [];
    const params = [];

    if (name !== undefined) {
      if (typeof name !== 'string' || name.trim().length === 0) {
        return res.status(400).json({ message: '规则名称不能为空' });
      }
      updates.push('name = ?');
      params.push(name.trim());
    }
    if (allow_partial !== undefined) {
      updates.push('allow_partial = ?');
      params.push(allow_partial ? 1 : 0);
    }
    if (deadline_hours_before !== undefined) {
      const val = parseInt(deadline_hours_before);
      if (isNaN(val) || val < 0) {
        return res.status(400).json({ message: '演出前截止时间必须是非负整数' });
      }
      updates.push('deadline_hours_before = ?');
      params.push(val);
    }
    if (fee_rate !== undefined) {
      const val = parseFloat(fee_rate);
      if (isNaN(val) || val < 0 || val > 100) {
        return res.status(400).json({ message: '手续费率必须在 0-100 之间' });
      }
      updates.push('fee_rate = ?');
      params.push(val);
    }
    if (fee_minimum_amount !== undefined) {
      const val = parseFloat(fee_minimum_amount);
      if (isNaN(val) || val < 0) {
        return res.status(400).json({ message: '最低手续费不能为负数' });
      }
      updates.push('fee_minimum_amount = ?');
      params.push(val);
    }
    if (allow_refund_after_settlement !== undefined) {
      updates.push('allow_refund_after_settlement = ?');
      params.push(allow_refund_after_settlement ? 1 : 0);
    }

    if (updates.length === 0 && !set_as_default) {
      return res.status(400).json({ message: '没有提供要更新的字段' });
    }

    req.db.run('BEGIN IMMEDIATE');

    if (updates.length > 0) {
      const updateSql = `UPDATE refund_rules SET ${updates.join(', ')} WHERE id = ?`;
      params.push(id);
      req.db.prepare(updateSql).run(params);
    }

    if (set_as_default) {
      req.db.prepare(`UPDATE refund_rules SET is_active = 0 WHERE is_active = 1 AND id != ?`).run([id]);
      req.db.prepare(`UPDATE refund_rules SET is_active = 1 WHERE id = ?`).run([id]);
    }

    const auditDetail = JSON.stringify({
      rule_id: id,
      changes: req.body,
      set_as_default
    });
    insertAuditLogRefund(req.db, req.user.id, req.user.name, 'update_refund_rule', 'settlement', parseInt(id), auditDetail, req.ip);

    req.db.run('COMMIT');
    saveDb();

    const updatedRule = req.db.prepare('SELECT * FROM refund_rules WHERE id = ?').get([id]);
    res.json({
      message: '退票规则更新成功',
      id,
      rule: {
        ...updatedRule,
        allow_partial: !!updatedRule.allow_partial,
        allow_refund_after_settlement: !!updatedRule.allow_refund_after_settlement,
        is_active: !!updatedRule.is_active,
        deadline_hours_before: updatedRule.deadline_hours_before || 0,
        fee_rate: parseFloat(updatedRule.fee_rate) || 0,
        fee_minimum_amount: parseFloat(updatedRule.fee_minimum_amount) || 0
      }
    });
  } catch (err) {
    try { req.db.run('ROLLBACK'); } catch (e) {}
    return res.status(500).json({ message: '更新退票规则失败', error: err.message });
  }
});

router.post('/:id/delete', authenticateToken, requireRole('manager'), (req, res) => {
  const { id } = req.params;
  const { is_active } = req.body;

  try {
    const existingRule = req.db.prepare('SELECT * FROM refund_rules WHERE id = ?').get([id]);
    if (!existingRule) {
      return res.status(404).json({ message: '退票规则不存在' });
    }

    let newStatus;
    let actionType;
    let actionMessage;

    if (is_active === undefined) {
      newStatus = existingRule.is_active ? 0 : 1;
    } else {
      newStatus = is_active ? 1 : 0;
    }

    if (newStatus === 1) {
      actionType = 'enable_refund_rule';
      actionMessage = '启用';
      req.db.run('BEGIN IMMEDIATE');
      req.db.prepare(`UPDATE refund_rules SET is_active = 0 WHERE is_active = 1 AND id != ?`).run([id]);
    } else {
      actionType = 'disable_refund_rule';
      actionMessage = '停用';
      req.db.run('BEGIN IMMEDIATE');
    }

    req.db.prepare(`UPDATE refund_rules SET is_active = ? WHERE id = ?`).run([newStatus, id]);

    const auditDetail = JSON.stringify({
      rule_id: id,
      name: existingRule.name,
      previous_status: existingRule.is_active ? 'active' : 'inactive',
      new_status: newStatus ? 'active' : 'inactive',
      action: actionMessage
    });
    insertAuditLogRefund(req.db, req.user.id, req.user.name, actionType, 'settlement', parseInt(id), auditDetail, req.ip);

    req.db.run('COMMIT');
    saveDb();

    res.json({
      message: `退票规则已${actionMessage}`,
      id,
      is_active: !!newStatus
    });
  } catch (err) {
    try { req.db.run('ROLLBACK'); } catch (e) {}
    return res.status(500).json({ message: '操作失败', error: err.message });
  }
});

module.exports = router;
