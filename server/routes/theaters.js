const express = require('express');
const { saveDb } = require('../database/db');
const { authenticateToken, requireRole } = require('../middleware/auth');

const router = express.Router();

router.get('/theaters', authenticateToken, (req, res) => {
  try {
    const theaters = req.db.prepare('SELECT * FROM theaters ORDER BY created_at DESC').all();
    res.json({ theaters });
  } catch (err) {
    res.status(500).json({ message: '查询失败', error: err.message });
  }
});

router.post('/theaters', authenticateToken, requireRole('manager'), (req, res) => {
  try {
    const { name, layout_type, total_seats, description } = req.body;
    
    if (!name || !layout_type || !total_seats) {
      return res.status(400).json({ message: '请填写必填字段' });
    }

    const stmt = req.db.prepare(`
      INSERT INTO theaters (name, layout_type, total_seats, description)
      VALUES (?, ?, ?, ?)
    `);
    const result = stmt.run([name, layout_type, total_seats, description]);
    const id = result.lastInsertRowid;
    saveDb();
    res.status(201).json({ message: '剧场创建成功', id });
  } catch (err) {
    res.status(500).json({ message: '创建失败：' + (err.message || '未知错误') });
  }
});

router.get('/groups', authenticateToken, (req, res) => {
  try {
    const groups = req.db.prepare('SELECT * FROM theater_groups ORDER BY created_at DESC').all();
    res.json({ groups });
  } catch (err) {
    res.status(500).json({ message: '查询失败', error: err.message });
  }
});

router.post('/groups', authenticateToken, requireRole('manager'), (req, res) => {
  try {
    const { name, contact, phone } = req.body;
    
    if (!name) {
      return res.status(400).json({ message: '请填写剧团名称' });
    }

    const stmt = req.db.prepare(`
      INSERT INTO theater_groups (name, contact, phone)
      VALUES (?, ?, ?)
    `);
    const result = stmt.run([name, contact, phone]);
    const id = result.lastInsertRowid;
    saveDb();
    res.status(201).json({ message: '剧团创建成功', id });
  } catch (err) {
    res.status(500).json({ message: '创建失败：' + (err.message || '未知错误') });
  }
});

router.get('/seat-templates', authenticateToken, (req, res) => {
  try {
    const { theater_id } = req.query;
    let query = `
      SELECT st.*, t.name as theater_name
      FROM seat_templates st
      LEFT JOIN theaters t ON st.theater_id = t.id
    `;
    const params = [];
    
    if (theater_id) {
      query += ' WHERE st.theater_id = ?';
      params.push(theater_id);
    }
    query += ' ORDER BY st.created_at DESC';

    let templates = req.db.prepare(query).all(params);
    templates = templates.map(t => ({
      ...t,
      layout_data: JSON.parse(t.layout_data)
    }));
    res.json({ templates });
  } catch (err) {
    res.status(500).json({ message: '查询失败', error: err.message });
  }
});

router.post('/seat-templates', authenticateToken, requireRole('scheduler', 'manager'), (req, res) => {
  try {
    const { theater_id, name, layout_data } = req.body;
    
    if (!theater_id || !name || !layout_data) {
      return res.status(400).json({ message: '请填写必填字段' });
    }

    const stmt = req.db.prepare(`
      INSERT INTO seat_templates (theater_id, name, layout_data)
      VALUES (?, ?, ?)
    `);
    const result = stmt.run([theater_id, name, JSON.stringify(layout_data)]);
    const id = result.lastInsertRowid;
    saveDb();
    res.status(201).json({ message: '座位模板创建成功', id });
  } catch (err) {
    res.status(500).json({ message: '创建失败：' + (err.message || '未知错误') });
  }
});

const generateDefaultLayout = (layoutType, totalSeats) => {
  const zones = ['VIP', 'A', 'B', 'C'];
  const layout = { rows: [], zones: {} };
  const seatsPerRow = Math.ceil(Math.sqrt(totalSeats * 1.5));
  const rowsCount = Math.ceil(totalSeats / seatsPerRow);
  
  for (let r = 1; r <= rowsCount; r++) {
    const rowLabel = String.fromCharCode(64 + r);
    const row = { label: rowLabel, seats: [] };
    const seatsInRow = r <= Math.ceil(rowsCount * 0.2) ? Math.ceil(seatsPerRow * 0.8) : seatsPerRow;
    
    for (let s = 1; s <= seatsInRow; s++) {
      const zoneIndex = r <= Math.ceil(rowsCount * 0.15) ? 0 :
                       r <= Math.ceil(rowsCount * 0.35) ? 1 :
                       r <= Math.ceil(rowsCount * 0.65) ? 2 : 3;
      row.seats.push({
        number: s,
        zone: zones[zoneIndex],
        x: (s - 1) * 40 + 50,
        y: (r - 1) * 40 + 50
      });
    }
    layout.rows.push(row);
  }
  
  zones.forEach(zone => {
    layout.zones[zone] = { price: 0, color: zone === 'VIP' ? '#FFD700' : zone === 'A' ? '#FF6B6B' : zone === 'B' ? '#4ECDC4' : '#95A5A6' };
  });
  
  return layout;
};

router.post('/theaters/:id/generate-template', authenticateToken, requireRole('scheduler', 'manager'), (req, res) => {
  try {
    const { id } = req.params;
    const { name } = req.body;

    const theater = req.db.prepare('SELECT * FROM theaters WHERE id = ?').get([id]);
    if (!theater) return res.status(404).json({ message: '剧场不存在' });

    const layout_data = generateDefaultLayout(theater.layout_type, theater.total_seats);
    
    const stmt = req.db.prepare(`
      INSERT INTO seat_templates (theater_id, name, layout_data)
      VALUES (?, ?, ?)
    `);
    const result = stmt.run([id, name || `${theater.name}-默认模板`, JSON.stringify(layout_data)]);
    const templateId = result.lastInsertRowid;
    saveDb();
    res.status(201).json({ message: '座位模板生成成功', id: templateId, layout_data });
  } catch (err) {
    res.status(500).json({ message: '生成失败：' + (err.message || '未知错误') });
  }
});

module.exports = router;
