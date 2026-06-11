const express = require('express');
const { saveDb } = require('../database/db');
const { authenticateToken, requireRole } = require('../middleware/auth');

const router = express.Router();

router.get('/', authenticateToken, (req, res) => {
  const { status } = req.query;
  let query = `
    SELECT p.*, g.name as group_name, g.contact as group_contact, g.phone as group_phone,
           u.name as creator_name, ap.name as approver_name
    FROM performances p
    LEFT JOIN theater_groups g ON p.group_id = g.id
    LEFT JOIN users u ON p.created_by = u.id
    LEFT JOIN users ap ON p.approver_id = ap.id
  `;
  const params = [];

  if (status) {
    query += ' WHERE p.status = ?';
    params.push(status);
  }
  query += ' ORDER BY p.created_at DESC';

  try {
    const performances = req.db.prepare(query).all(params);
    res.json({ performances });
  } catch (err) {
    return res.status(500).json({ message: '查询失败', error: err.message });
  }
});

router.get('/:id', authenticateToken, (req, res) => {
  const { id } = req.params;
  try {
    const performance = req.db.prepare(`
      SELECT p.*, g.name as group_name, u.name as creator_name, ap.name as approver_name
      FROM performances p
      LEFT JOIN theater_groups g ON p.group_id = g.id
      LEFT JOIN users u ON p.created_by = u.id
      LEFT JOIN users ap ON p.approver_id = ap.id
      WHERE p.id = ?
    `).get([id]);
    if (!performance) return res.status(404).json({ message: '演出项目不存在' });
    res.json({ performance });
  } catch (err) {
    return res.status(500).json({ message: '查询失败', error: err.message });
  }
});

router.post('/', authenticateToken, requireRole('scheduler', 'manager'), (req, res) => {
  const { name, type, group_id, cast, poster_url, description, duration } = req.body;
  
  if (!name || !type || !group_id) {
    return res.status(400).json({ message: '请填写必填字段' });
  }

  try {
    const sql = `
      INSERT INTO performances (name, type, group_id, cast, poster_url, description, duration, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `;
    req.db.run(sql, [name, type, group_id, cast, poster_url, description, duration, req.user.id]);
    const id = req.db.exec('SELECT last_insert_rowid() as id')[0].values[0][0];
    saveDb();
    res.status(201).json({ message: '演出项目创建成功，等待审批', id });
  } catch (err) {
    return res.status(500).json({ message: '创建失败', error: err.message });
  }
});

router.put('/:id', authenticateToken, requireRole('scheduler', 'manager'), (req, res) => {
  const { id } = req.params;
  const { name, type, group_id, cast, poster_url, description, duration } = req.body;

  try {
    const perf = req.db.prepare('SELECT * FROM performances WHERE id = ?').get([id]);
    if (!perf) return res.status(404).json({ message: '演出项目不存在' });
    if (perf.status !== 'pending') {
      return res.status(400).json({ message: '只能编辑待审批的演出项目' });
    }

    const sql = `
      UPDATE performances 
      SET name = ?, type = ?, group_id = ?, cast = ?, poster_url = ?, description = ?, duration = ?
      WHERE id = ?
    `;
    req.db.run(sql, [name, type, group_id, cast, poster_url, description, duration, id]);
    saveDb();
    res.json({ message: '演出项目更新成功' });
  } catch (err) {
    return res.status(500).json({ message: '更新失败', error: err.message });
  }
});

router.post('/:id/approve', authenticateToken, requireRole('manager'), (req, res) => {
  const { id } = req.params;

  try {
    const perf = req.db.prepare('SELECT * FROM performances WHERE id = ?').get([id]);
    if (!perf) return res.status(404).json({ message: '演出项目不存在' });
    if (perf.status !== 'pending') {
      return res.status(400).json({ message: '只能审批待审批的演出项目' });
    }

    const sql = `
      UPDATE performances 
      SET status = 'approved', approver_id = ?, approved_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `;
    req.db.run(sql, [req.user.id, id]);
    saveDb();
    res.json({ message: '演出项目审批通过' });
  } catch (err) {
    return res.status(500).json({ message: '审批失败', error: err.message });
  }
});

router.post('/:id/reject', authenticateToken, requireRole('manager'), (req, res) => {
  const { id } = req.params;
  const { reject_reason } = req.body;

  if (!reject_reason) {
    return res.status(400).json({ message: '请填写驳回原因' });
  }

  try {
    const perf = req.db.prepare('SELECT * FROM performances WHERE id = ?').get([id]);
    if (!perf) return res.status(404).json({ message: '演出项目不存在' });
    if (perf.status !== 'pending') {
      return res.status(400).json({ message: '只能驳回待审批的演出项目' });
    }

    const sql = `
      UPDATE performances 
      SET status = 'rejected', approver_id = ?, reject_reason = ?, approved_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `;
    req.db.run(sql, [req.user.id, reject_reason, id]);
    saveDb();
    res.json({ message: '演出项目已驳回' });
  } catch (err) {
    return res.status(500).json({ message: '驳回失败', error: err.message });
  }
});

router.delete('/:id', authenticateToken, requireRole('manager'), (req, res) => {
  const { id } = req.params;

  try {
    const sql = 'DELETE FROM performances WHERE id = ? AND status = ?';
    req.db.run(sql, [id, 'pending']);
    const changes = req.db.exec('SELECT changes() as changes')[0].values[0][0];
    if (changes === 0) {
      return res.status(400).json({ message: '只能删除待审批的演出项目' });
    }
    saveDb();
    res.json({ message: '演出项目删除成功' });
  } catch (err) {
    return res.status(500).json({ message: '删除失败', error: err.message });
  }
});

module.exports = router;
