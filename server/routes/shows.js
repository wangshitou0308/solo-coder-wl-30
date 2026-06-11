const express = require('express');
const { saveDb } = require('../database/db');
const { authenticateToken, requireRole } = require('../middleware/auth');

const router = express.Router();

const checkTheaterConflict = (db, theater_id, show_date, start_time, end_time, exclude_id = null) => {
  let query = `
    SELECT * FROM shows 
    WHERE theater_id = ? 
      AND show_date = ? 
      AND status != 'cancelled'
      AND (
        (start_time < ? AND end_time > ?) OR
        (start_time < ? AND end_time > ?) OR
        (start_time >= ? AND end_time <= ?)
      )
  `;
  const params = [theater_id, show_date, end_time, start_time, end_time, start_time, start_time, end_time];
  
  if (exclude_id) {
    query += ' AND id != ?';
    params.push(exclude_id);
  }

  const result = db.prepare(query).get(params);
  return result ? true : false;
};

const checkGroupConflict = (db, performance_id, show_date, start_time, end_time, exclude_id = null) => {
  const perf = db.prepare('SELECT group_id FROM performances WHERE id = ?').get([performance_id]);
  if (!perf) return false;

  let query = `
    SELECT s.* FROM shows s
    JOIN performances p ON s.performance_id = p.id
    WHERE p.group_id = ? 
      AND s.show_date = ? 
      AND s.status != 'cancelled'
      AND (
        (s.start_time < ? AND s.end_time > ?) OR
        (s.start_time < ? AND s.end_time > ?) OR
        (s.start_time >= ? AND s.end_time <= ?)
      )
  `;
  const params = [perf.group_id, show_date, end_time, start_time, end_time, start_time, start_time, end_time];
  
  if (exclude_id) {
    query += ' AND s.id != ?';
    params.push(exclude_id);
  }

  const result = db.prepare(query).get(params);
  return result ? true : false;
};

router.get('/', authenticateToken, (req, res) => {
  try {
    const { performance_id, status, start_date, end_date } = req.query;
    let query = `
      SELECT s.*, p.name as performance_name, p.type as performance_type, 
             t.name as theater_name, t.layout_type as theater_layout
      FROM shows s
      JOIN performances p ON s.performance_id = p.id
      JOIN theaters t ON s.theater_id = t.id
      WHERE 1=1
    `;
    const params = [];

    if (performance_id) {
      query += ' AND s.performance_id = ?';
      params.push(performance_id);
    }
    if (status) {
      query += ' AND s.status = ?';
      params.push(status);
    }
    if (start_date) {
      query += ' AND s.show_date >= ?';
      params.push(start_date);
    }
    if (end_date) {
      query += ' AND s.show_date <= ?';
      params.push(end_date);
    }
    query += ' ORDER BY s.show_date DESC, s.start_time DESC';

    const shows = req.db.prepare(query).all(params);
    res.json({ shows });
  } catch (err) {
    res.status(500).json({ message: '查询失败', error: err.message });
  }
});

router.get('/:id', authenticateToken, (req, res) => {
  try {
    const { id } = req.params;
    const show = req.db.prepare(`
      SELECT s.*, p.name as performance_name, p.type as performance_type, p.group_id,
             t.name as theater_name, t.layout_type as theater_layout,
             g.name as group_name
      FROM shows s
      JOIN performances p ON s.performance_id = p.id
      JOIN theaters t ON s.theater_id = t.id
      JOIN theater_groups g ON p.group_id = g.id
      WHERE s.id = ?
    `).get([id]);
    if (!show) return res.status(404).json({ message: '场次不存在' });
    res.json({ show });
  } catch (err) {
    res.status(500).json({ message: '查询失败', error: err.message });
  }
});

router.post('/', authenticateToken, requireRole('scheduler', 'manager'), (req, res) => {
  try {
    const { performance_id, theater_id, show_date, start_time, end_time, seat_template_id } = req.body;

    const perf = req.db.prepare('SELECT * FROM performances WHERE id = ? AND status = ?').get([performance_id, 'approved']);

    if (!perf) {
      return res.status(400).json({ message: '演出项目不存在或未通过审批' });
    }

    const theaterConflict = checkTheaterConflict(req.db, theater_id, show_date, start_time, end_time);
    if (theaterConflict) {
      return res.status(400).json({ message: '该剧场时段已有演出安排，存在档期冲突' });
    }

    const groupConflict = checkGroupConflict(req.db, performance_id, show_date, start_time, end_time);
    if (groupConflict) {
      return res.status(400).json({ message: '该演出团体此时段已有其他演出安排' });
    }

    const stmt = req.db.prepare(`
      INSERT INTO shows (performance_id, theater_id, show_date, start_time, end_time, seat_template_id, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    const result = stmt.run([performance_id, theater_id, show_date, start_time, end_time, seat_template_id, req.user.id]);
    const lastId = result.lastInsertRowid;
    saveDb();
    res.status(201).json({ message: '场次创建成功', id: lastId });
  } catch (err) {
    res.status(500).json({ message: '创建失败：' + (err.message || '未知错误') });
  }
});

router.post('/batch', authenticateToken, requireRole('scheduler', 'manager'), (req, res) => {
  try {
    const { performance_id, theater_id, start_date, end_date, weekdays, start_time, end_time, seat_template_id } = req.body;

    const perf = req.db.prepare('SELECT * FROM performances WHERE id = ? AND status = ?').get([performance_id, 'approved']);

    if (!perf) {
      return res.status(400).json({ message: '演出项目不存在或未通过审批' });
    }

    const start = new Date(start_date);
    const end = new Date(end_date);
    const createdShows = [];
    const skippedDates = [];

    const insertShow = req.db.prepare(`
      INSERT INTO shows (performance_id, theater_id, show_date, start_time, end_time, seat_template_id, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    req.db.run('BEGIN TRANSACTION');
    
    try {
      for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        const dayOfWeek = d.getDay();
        if (weekdays && weekdays.length > 0 && !weekdays.includes(dayOfWeek)) {
          continue;
        }

        const dateStr = d.toISOString().split('T')[0];
        
        const theaterConflict = checkTheaterConflict(req.db, theater_id, dateStr, start_time, end_time);
        const groupConflict = checkGroupConflict(req.db, performance_id, dateStr, start_time, end_time);

        if (theaterConflict || groupConflict) {
          skippedDates.push(dateStr);
          continue;
        }

        const insertResult = insertShow.run([performance_id, theater_id, dateStr, start_time, end_time, seat_template_id, req.user.id]);
        const lastId = insertResult.lastInsertRowid;
        createdShows.push({ id: lastId, date: dateStr });
      }
      
      req.db.run('COMMIT');
      saveDb();
    } catch (err) {
      req.db.run('ROLLBACK');
      throw err;
    }

    res.json({ 
      message: `批量创建完成，成功创建${createdShows.length}场，跳过${skippedDates.length}场`,
      created: createdShows,
      skipped: skippedDates
    });
  } catch (err) {
    res.status(500).json({ message: '批量创建失败', error: err.message });
  }
});

router.put('/:id/status', authenticateToken, requireRole('scheduler', 'manager'), (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    const validTransitions = {
      draft: ['onsale', 'cancelled'],
      onsale: ['soldout', 'cancelled', 'ended'],
      soldout: ['ended', 'cancelled'],
      cancelled: [],
      ended: []
    };

    const show = req.db.prepare('SELECT * FROM shows WHERE id = ?').get([id]);
    if (!show) return res.status(404).json({ message: '场次不存在' });

    if (!validTransitions[show.status].includes(status)) {
      return res.status(400).json({ message: `无法从${show.status}状态转换为${status}` });
    }

    req.db.prepare('UPDATE shows SET status = ? WHERE id = ?').run([status, id]);
    saveDb();
    res.json({ message: `场次状态已更新为${status}` });
  } catch (err) {
    res.status(500).json({ message: '更新失败', error: err.message });
  }
});

router.post('/:id/add-show', authenticateToken, requireRole('scheduler', 'manager'), (req, res) => {
  try {
    const { id } = req.params;
    const { show_date, start_time, end_time } = req.body;

    const originalShow = req.db.prepare('SELECT * FROM shows WHERE id = ?').get([id]);

    if (!originalShow) {
      return res.status(404).json({ message: '原场次不存在' });
    }

    const theaterConflict = checkTheaterConflict(req.db, originalShow.theater_id, show_date, start_time, end_time);
    if (theaterConflict) {
      return res.status(400).json({ message: '该剧场时段已有演出安排，存在档期冲突' });
    }

    const groupConflict = checkGroupConflict(req.db, originalShow.performance_id, show_date, start_time, end_time);
    if (groupConflict) {
      return res.status(400).json({ message: '该演出团体此时段已有其他演出安排' });
    }

    const stmt = req.db.prepare(`
      INSERT INTO shows (performance_id, theater_id, show_date, start_time, end_time, seat_template_id, created_by, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'draft')
    `);
    const addResult = stmt.run([originalShow.performance_id, originalShow.theater_id, show_date, start_time, end_time, originalShow.seat_template_id, req.user.id]);
    const lastId = addResult.lastInsertRowid;
    saveDb();
    res.status(201).json({ message: '加场成功，请配置票版后上架', id: lastId });
  } catch (err) {
    res.status(500).json({ message: '加场失败', error: err.message });
  }
});

router.get('/conflicts/check', authenticateToken, requireRole('scheduler', 'manager'), (req, res) => {
  try {
    const { theater_id, performance_id, show_date, start_time, end_time, exclude_id } = req.query;

    const theaterConflict = checkTheaterConflict(req.db, theater_id, show_date, start_time, end_time, exclude_id);
    const groupConflict = checkGroupConflict(req.db, performance_id, show_date, start_time, end_time, exclude_id);

    res.json({
      hasConflict: theaterConflict || groupConflict,
      theaterConflict,
      groupConflict
    });
  } catch (err) {
    res.status(500).json({ message: '检查失败', error: err.message });
  }
});

module.exports = router;
