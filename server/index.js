const express = require('express');
const cors = require('cors');
const { initDb, saveDb, getDb } = require('./database/db');
const { writeAuditLog } = require('./routes/audit');

const authRoutes = require('./routes/auth');
const performanceRoutes = require('./routes/performances');
const showRoutes = require('./routes/shows');
const theaterRoutes = require('./routes/theaters');
const ticketRoutes = require('./routes/tickets');
const orderRoutes = require('./routes/orders');
const statRoutes = require('./routes/statistics');
const exportRoutes = require('./routes/exports');
const settlementRoutes = require('./routes/settlements');
const refundRuleRoutes = require('./routes/refund-rules');
const auditRoutes = require('./routes/audit');

const app = express();
const PORT = 5000;

app.use(cors());
app.use(express.json());

app.use((req, res, next) => {
  req.db = getDb();
  next();
});

app.use('/api/auth', authRoutes);
app.use('/api/performances', performanceRoutes);
app.use('/api/shows', showRoutes);
app.use('/api', theaterRoutes);
app.use('/api/tickets', ticketRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/statistics', statRoutes);
app.use('/api/exports', exportRoutes);
app.use('/api/settlements', settlementRoutes);
app.use('/api/refund-rules', refundRuleRoutes);
app.use('/api/audit', auditRoutes);

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: '剧院管理系统API运行正常' });
});

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ message: '服务器内部错误', error: err.message });
});

const startServer = async () => {
  try {
    await initDb();
    console.log('数据库初始化完成');
    
    app.listen(PORT, () => {
      console.log(`服务器运行在 http://localhost:${PORT}`);
      console.log(`API文档: GET http://localhost:${PORT}/api/health`);
    });

    setInterval(() => {
      saveDb();
    }, 5000);

    setInterval(() => {
      try {
        const db = getDb();
        if (!db) return;
        console.log('[定时任务] 开始取消过期订单+释放锁座...');
        let cancelledCount = 0;
        let releasedSeats = 0;
        const orders = db.prepare(`
          SELECT o.id, o.show_id, o.order_no FROM orders o
          WHERE o.payment_status = 'pending' AND o.expires_at < CURRENT_TIMESTAMP
        `).all([]);
        db.exec('BEGIN IMMEDIATE');
        try {
          orders.forEach(order => {
            db.run(`UPDATE orders SET payment_status = 'cancelled' WHERE id = ?`, [order.id]);
            const seatUpdate = db.run(`
              UPDATE seats SET status = 'available', lock_type = NULL, held_by_phone = NULL, held_expires_at = NULL
              WHERE status = 'reserved' AND id IN (
                SELECT seat_id FROM order_items WHERE order_id = ?
              )
            `, [order.id]);
            releasedSeats += seatUpdate.changes || 0;
            try {
              writeAuditLog(db, {
                user_id: null,
                user_name: 'SYSTEM',
                action: 'auto_cancel_order',
                target_type: 'order',
                target_id: order.id,
                detail: JSON.stringify({
                  order_id: order.id,
                  order_no: order.order_no,
                  show_id: order.show_id,
                  cancel_reason: '订单超时自动取消',
                  released_seats: seatUpdate.changes || 0,
                  cancelled_by: 'system_scheduler'
                }),
                ip_address: '127.0.0.1'
              });
            } catch (ae) {
              console.warn('[定时任务] 审计日志写入失败:', ae.message);
            }
            cancelledCount++;
          });
          const heldRelease = db.run(`
            UPDATE seats SET status = 'available', held_by_phone = NULL, held_expires_at = NULL
            WHERE status = 'held' AND held_expires_at < CURRENT_TIMESTAMP
          `);
          releasedSeats += heldRelease.changes || 0;
          const lockRelease = db.run(`
            UPDATE seats SET status = 'available', lock_type = NULL, lock_expires_at = NULL, locked_by = NULL
            WHERE status = 'locked' AND lock_expires_at < CURRENT_TIMESTAMP
          `);
          releasedSeats += lockRelease.changes || 0;
          db.exec('COMMIT');
        } catch (e) {
          try { db.exec('ROLLBACK'); } catch (re) {}
          throw e;
        }
        if (cancelledCount > 0 || releasedSeats > 0) {
          saveDb();
        }
        console.log(`[定时任务] 取消过期订单完成: 取消${cancelledCount}个订单, 释放${releasedSeats}个座位`);
      } catch (err) {
        console.error('[定时任务] 取消过期订单出错:', err.message);
      }
    }, 60 * 1000);

    setInterval(() => {
      try {
        const db = getDb();
        if (!db) return;
        console.log('[定时任务] 开始自动结束已过演出时间的场次...');
        const now = new Date();
        const dateStr = now.toISOString().split('T')[0];
        const timeStr = now.toTimeString().split(' ')[0];

        const endingShows = db.prepare(`
          SELECT id, performance_id, theater_id, show_date, start_time, end_time, status
          FROM shows
          WHERE status IN ('onsale', 'soldout')
            AND (show_date < ? OR (show_date = ? AND end_time < ?))
        `).all([dateStr, dateStr, timeStr]);

        db.exec('BEGIN IMMEDIATE');
        try {
          const result = db.run(`
            UPDATE shows SET status = 'ended'
            WHERE status IN ('onsale', 'soldout')
              AND (show_date < ? OR (show_date = ? AND end_time < ?))
          `, [dateStr, dateStr, timeStr]);
          const endedCount = result.changes || 0;

          if (endingShows && endingShows.length > 0) {
            endingShows.forEach(show => {
              try {
                writeAuditLog(db, {
                  user_id: null,
                  user_name: 'SYSTEM',
                  action: 'auto_end_show',
                  target_type: 'show',
                  target_id: show.id,
                  detail: JSON.stringify({
                    show_id: show.id,
                    performance_id: show.performance_id,
                    theater_id: show.theater_id,
                    show_date: show.show_date,
                    start_time: show.start_time,
                    end_time: show.end_time,
                    previous_status: show.status,
                    new_status: 'ended',
                    end_reason: '演出时间已过自动结束',
                    ended_by: 'system_scheduler'
                  }),
                  ip_address: '127.0.0.1'
                });
              } catch (ae) {
                console.warn('[定时任务] 场次结束审计日志写入失败:', ae.message);
              }
            });
          }
          db.exec('COMMIT');
          if (endedCount > 0) {
            saveDb();
          }
          console.log(`[定时任务] 自动结束场次完成: 结束${endedCount}个场次`);
        } catch (e) {
          try { db.exec('ROLLBACK'); } catch (re) {}
          throw e;
        }
      } catch (err) {
        console.error('[定时任务] 自动结束场次出错:', err.message);
      }
    }, 5 * 60 * 1000);

  } catch (err) {
    console.error('启动失败:', err);
    process.exit(1);
  }
};

startServer();
