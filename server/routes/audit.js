const express = require('express');
const { saveDb } = require('../database/db');
const { authenticateToken, requireRole } = require('../middleware/auth');

const router = express.Router();

const writeAuditLog = (db, { user_id, user_name, action, target_type, target_id, detail, ip_address }) => {
  try {
    const detailStr = typeof detail === 'object' ? JSON.stringify(detail) : (detail || null);
    db.run(`
      INSERT INTO audit_logs (user_id, user_name, action, target_type, target_id, detail, ip_address)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `, [user_id || null, user_name || null, action, target_type || null, target_id || null, detailStr, ip_address || null]);
  } catch (e) {
    console.warn('写入审计日志失败:', e.message);
  }
};

router.post('/log', authenticateToken, (req, res) => {
  try {
    const { action, target_type, target_id, detail } = req.body;
    if (!action) {
      return res.status(400).json({ message: 'action 是必填项' });
    }
    const ip_address = (req.headers['x-forwarded-for'] || req.connection.remoteAddress || '').split(',')[0].trim();
    writeAuditLog(req.db, {
      user_id: req.user.id,
      user_name: req.user.name || req.user.username,
      action,
      target_type,
      target_id,
      detail,
      ip_address
    });
    saveDb();
    res.json({ message: '日志记录成功' });
  } catch (err) {
    res.status(500).json({ message: '记录失败', error: err.message });
  }
});

router.post('/system-log', (req, res) => {
  try {
    const { user_id, user_name, action, target_type, target_id, detail, ip_address } = req.body;
    if (!action) {
      return res.status(400).json({ message: 'action 是必填项' });
    }
    writeAuditLog(req.db, { user_id, user_name, action, target_type, target_id, detail, ip_address });
    saveDb();
    res.json({ message: '日志记录成功' });
  } catch (err) {
    res.status(500).json({ message: '记录失败', error: err.message });
  }
});

router.get('/', authenticateToken, requireRole('manager', 'finance'), (req, res) => {
  try {
    const { user_id, action, target_type, target_id, start_date, end_date, page = 1, page_size = 20, format } = req.query;
    
    let countQuery = 'SELECT COUNT(*) as total FROM audit_logs WHERE 1=1';
    let query = `
      SELECT a.*, u.username as user_username
      FROM audit_logs a
      LEFT JOIN users u ON a.user_id = u.id
      WHERE 1=1
    `;
    const params = [];
    const countParams = [];

    if (user_id) {
      query += ' AND a.user_id = ?';
      countQuery += ' AND user_id = ?';
      params.push(parseInt(user_id));
      countParams.push(parseInt(user_id));
    }
    if (action) {
      query += ' AND a.action = ?';
      countQuery += ' AND action = ?';
      params.push(action);
      countParams.push(action);
    }
    if (target_type) {
      query += ' AND a.target_type = ?';
      countQuery += ' AND target_type = ?';
      params.push(target_type);
      countParams.push(target_type);
    }
    if (target_id) {
      query += ' AND a.target_id = ?';
      countQuery += ' AND target_id = ?';
      params.push(parseInt(target_id));
      countParams.push(parseInt(target_id));
    }
    if (start_date) {
      query += ' AND a.created_at >= ?';
      countQuery += ' AND created_at >= ?';
      params.push(start_date);
      countParams.push(start_date);
    }
    if (end_date) {
      query += ' AND a.created_at <= ?';
      countQuery += ' AND created_at <= ?';
      params.push(end_date);
      countParams.push(end_date);
    }

    if (format === 'csv') {
      query += ' ORDER BY a.created_at DESC';
      const logs = req.db.prepare(query).all(params);
      const headers = ['ID', '用户ID', '用户名', '操作', '对象类型', '对象ID', '详情', 'IP地址', '创建时间'];
      const csvRows = [headers.join(',')];
      logs.forEach(log => {
        const row = [
          log.id,
          log.user_id || '',
          (log.user_name || log.user_username || '').replace(/"/g, '""'),
          log.action.replace(/"/g, '""'),
          log.target_type || '',
          log.target_id || '',
          (log.detail || '').replace(/"/g, '""'),
          (log.ip_address || '').replace(/"/g, '""'),
          log.created_at || ''
        ].map(v => `"${v}"`);
        csvRows.push(row.join(','));
      });
      const csv = '\uFEFF' + csvRows.join('\n');
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="audit_logs_${Date.now()}.csv"`);
      return res.send(csv);
    }

    query += ' ORDER BY a.created_at DESC LIMIT ? OFFSET ?';
    const queryParams = [...params, parseInt(page_size), (parseInt(page) - 1) * parseInt(page_size)];

    const countResult = req.db.prepare(countQuery).get(countParams);
    const logs = req.db.prepare(query).all(queryParams);
    
    logs.forEach(log => {
      if (log.detail) {
        try { log.detail_parsed = JSON.parse(log.detail); } catch (e) { log.detail_parsed = log.detail; }
      }
    });

    res.json({ 
      logs, 
      total: countResult.total,
      page: parseInt(page),
      page_size: parseInt(page_size)
    });
  } catch (err) {
    res.status(500).json({ message: '查询失败', error: err.message });
  }
});

router.get('/actions', authenticateToken, (req, res) => {
  try {
    const users = req.db.prepare(`
      SELECT id, name, username, role FROM users ORDER BY id
    `).all([]);
    const auditUsers = req.db.prepare(`
      SELECT DISTINCT user_id, user_name FROM audit_logs
      WHERE user_id IS NOT NULL AND user_name IS NOT NULL
    `).all([]);
    const idSet = new Set();
    const merged = [];
    users.forEach(u => { if(!idSet.has(u.id)){ idSet.add(u.id); merged.push({ id: u.id, name: u.name, username: u.username, role: u.role }); } });
    auditUsers.forEach(a => { if(!idSet.has(a.user_id)){ idSet.add(a.user_id); merged.push({ id: a.user_id, name: a.user_name }); } });
    res.json({
      actions: [
        'approve_performance', 'approve_show', 'create_order', 'refund_order',
        'create_settlement', 'confirm_settlement', 'pay_settlement', 'void_settlement',
        'cancel_order', 'end_show', 'lock_seat', 'unlock_seat',
        'create_performance', 'update_performance', 'delete_performance',
        'create_show', 'update_show', 'delete_show', 'onsale_show', 'cancel_show',
        'create_ticket_version', 'update_ticket_version', 'design_seat_template'
      ],
      target_types: ['performance', 'show', 'order', 'settlement', 'seat', 'ticket_version', 'seat_template', 'refund_rule'],
      user_names: merged
    });
  } catch (err) {
    res.json({
      actions: [
        'approve_performance', 'approve_show', 'create_order', 'refund_order',
        'create_settlement', 'confirm_settlement', 'pay_settlement', 'void_settlement',
        'cancel_order', 'end_show', 'lock_seat', 'unlock_seat'
      ],
      target_types: ['performance', 'show', 'order', 'settlement', 'seat'],
      user_names: []
    });
  }
});

module.exports = router;
module.exports.writeAuditLog = writeAuditLog;
