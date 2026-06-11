const express = require('express');
const { saveDb } = require('../database/db');
const { authenticateToken, requireRole } = require('../middleware/auth');

const router = express.Router();

router.get('/shows/:showId/ticket-version', authenticateToken, (req, res) => {
  const { showId } = req.params;
  
  try {
    const version = req.db.prepare(`
      SELECT tv.* FROM ticket_versions tv
      WHERE tv.show_id = ?
      ORDER BY tv.created_at DESC
      LIMIT 1
    `).get([showId]);
    
    if (!version) return res.json({ version: null, zones: [], discounts: [], seats: [] });

    const zones = req.db.prepare(`
      SELECT * FROM seat_zones WHERE ticket_version_id = ?
    `).all([version.id]);

    const discounts = req.db.prepare(`
      SELECT * FROM discount_rules WHERE ticket_version_id = ? AND is_active = 1
    `).all([version.id]);

    const seats = req.db.prepare(`
      SELECT s.*, sz.zone_name, sz.base_price
      FROM seats s
      LEFT JOIN seat_zones sz ON s.zone_id = sz.id
      WHERE s.show_id = ?
      ORDER BY s.row_label, s.seat_number
    `).all([showId]);

    res.json({ version, zones, discounts, seats });
  } catch (err) {
    return res.status(500).json({ message: '查询失败', error: err.message });
  }
});

router.post('/shows/:showId/ticket-version', authenticateToken, requireRole('scheduler', 'manager'), (req, res) => {
  const { showId } = req.params;
  const { name, zones, discounts, layout_data } = req.body;

  try {
    const show = req.db.prepare('SELECT * FROM shows WHERE id = ?').get([showId]);
    if (!show) return res.status(404).json({ message: '场次不存在' });
    if (show.status !== 'draft') {
      return res.status(400).json({ message: '只能为待上架状态的场次设计票版' });
    }

    req.db.run('BEGIN TRANSACTION');
    
    try {
      req.db.prepare(`
        INSERT INTO ticket_versions (show_id, name)
        VALUES (?, ?)
      `).run([showId, name || '标准票版']);
      
      const versionId = req.db.exec('SELECT last_insert_rowid() as id')[0].values[0][0];
      const zoneStmt = req.db.prepare(`
        INSERT INTO seat_zones (ticket_version_id, zone_name, base_price, seat_count)
        VALUES (?, ?, ?, ?)
      `);
      const zoneMap = {};
      
      zones.forEach(zone => {
        zoneStmt.run(versionId, zone.zone_name, zone.base_price, zone.seat_count);
        const zoneId = req.db.exec('SELECT last_insert_rowid() as id')[0].values[0][0];
        zoneMap[zone.zone_name] = zoneId;
      });

      if (discounts && discounts.length > 0) {
        const discountStmt = req.db.prepare(`
          INSERT INTO discount_rules (ticket_version_id, rule_type, name, discount_type, discount_value, min_tickets, max_tickets, start_date, end_date)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        discounts.forEach(d => {
          discountStmt.run(versionId, d.rule_type, d.name, d.discount_type, d.discount_value, 
                         d.min_tickets || 1, d.max_tickets || null, d.start_date || null, d.end_date || null);
        });
      }

      req.db.prepare('DELETE FROM seats WHERE show_id = ?').run([showId]);

      const seatStmt = req.db.prepare(`
        INSERT INTO seats (show_id, zone_id, row_label, seat_number, status, price)
        VALUES (?, ?, ?, ?, 'available', ?)
      `);

      if (layout_data && layout_data.rows) {
        layout_data.rows.forEach(row => {
          row.seats.forEach(seat => {
            const zoneId = zoneMap[seat.zone];
            const zone = zones.find(z => z.zone_name === seat.zone);
            if (zoneId && zone) {
              seatStmt.run(showId, zoneId, row.label, seat.number, zone.base_price);
            }
          });
        });
      } else {
        zones.forEach(zone => {
          const seatsPerRow = Math.ceil(Math.sqrt(zone.seat_count));
          const rowsCount = Math.ceil(zone.seat_count / seatsPerRow);
          let seatCount = 0;
          
          for (let r = 1; r <= rowsCount && seatCount < zone.seat_count; r++) {
            const rowLabel = String.fromCharCode(64 + r);
            for (let s = 1; s <= seatsPerRow && seatCount < zone.seat_count; s++) {
              seatStmt.run(showId, zoneMap[zone.zone_name], rowLabel, s, zone.base_price);
              seatCount++;
            }
          }
        });
      }
      
      req.db.run('COMMIT');
      saveDb();
      res.json({ message: '票版设计成功', versionId });
    } catch (err) {
      req.db.run('ROLLBACK');
      throw err;
    }
  } catch (err) {
    return res.status(500).json({ message: '创建票版失败', error: err.message });
  }
});

router.post('/shows/:showId/seats/:seatId/lock', authenticateToken, requireRole('scheduler', 'manager'), (req, res) => {
  const { showId, seatId } = req.params;
  const { lock_type, lock_expires_at } = req.body;

  if (!['media', 'guest'].includes(lock_type)) {
    return res.status(400).json({ message: '无效的锁座类型' });
  }

  try {
    const seat = req.db.prepare('SELECT * FROM seats WHERE id = ? AND show_id = ?').get([seatId, showId]);
    if (!seat) return res.status(404).json({ message: '座位不存在' });
    if (seat.status !== 'available') {
      return res.status(400).json({ message: '座位不可用' });
    }

    req.db.prepare(`
      UPDATE seats 
      SET status = 'locked', lock_type = ?, lock_expires_at = ?, locked_by = ?
      WHERE id = ?
    `).run([lock_type, lock_expires_at || null, req.user.id, seatId]);
    saveDb();

    res.json({ message: '锁座成功' });
  } catch (err) {
    return res.status(500).json({ message: '锁座失败', error: err.message });
  }
});

router.post('/shows/:showId/seats/:seatId/unlock', authenticateToken, requireRole('scheduler', 'manager'), (req, res) => {
  const { showId, seatId } = req.params;

  try {
    const seat = req.db.prepare('SELECT * FROM seats WHERE id = ? AND show_id = ?').get([seatId, showId]);
    if (!seat) return res.status(404).json({ message: '座位不存在' });
    if (seat.status !== 'locked') {
      return res.status(400).json({ message: '座位未被锁定' });
    }

    req.db.prepare(`
      UPDATE seats 
      SET status = 'available', lock_type = NULL, lock_expires_at = NULL, locked_by = NULL
      WHERE id = ?
    `).run([seatId]);
    saveDb();

    res.json({ message: '解锁成功' });
  } catch (err) {
    return res.status(500).json({ message: '解锁失败', error: err.message });
  }
});

router.post('/release-expired-locks', authenticateToken, requireRole('scheduler', 'manager'), (req, res) => {
  try {
    const result = req.db.prepare(`
      UPDATE seats 
      SET status = 'available', lock_type = NULL, lock_expires_at = NULL, locked_by = NULL
      WHERE status = 'locked' 
        AND lock_type IN ('media', 'guest')
        AND lock_expires_at IS NOT NULL 
        AND lock_expires_at < CURRENT_TIMESTAMP
    `).run();
    
    const changes = req.db.exec('SELECT changes() as cnt')[0].values[0][0];
    saveDb();
    
    res.json({ message: `已释放${changes}个过期锁座` });
  } catch (err) {
    return res.status(500).json({ message: '释放失败', error: err.message });
  }
});

router.get('/shows/:showId/discounts', authenticateToken, (req, res) => {
  const { showId } = req.params;
  
  try {
    const discounts = req.db.prepare(`
      SELECT d.* FROM discount_rules d
      JOIN ticket_versions tv ON d.ticket_version_id = tv.id
      WHERE tv.show_id = ? AND d.is_active = 1
    `).all([showId]);
    
    res.json({ discounts });
  } catch (err) {
    return res.status(500).json({ message: '查询失败', error: err.message });
  }
});

module.exports = router;
