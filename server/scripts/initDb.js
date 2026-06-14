const { initDb, saveDb, getDb } = require('../database/db');
const bcrypt = require('bcryptjs');

const columnExists = (db, tableName, columnName) => {
  try {
    const result = db.prepare(`PRAGMA table_info(${tableName})`).all([]);
    return result.some(col => col.name === columnName);
  } catch (e) {
    return false;
  }
};

const tableExists = (db, tableName) => {
  try {
    const result = db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name=?`).get([tableName]);
    return !!result;
  } catch (e) {
    return false;
  }
};

const addColumnIfNotExists = (db, tableName, columnDef) => {
  const columnName = columnDef.split(/\s+/)[0];
  if (!columnExists(db, tableName, columnName)) {
    try {
      db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnDef}`);
      console.log(`  已添加列: ${tableName}.${columnName}`);
    } catch (err) {
      console.warn(`  添加列失败 ${tableName}.${columnName}: ${err.message}`);
    }
  }
};

const recreateShowsNullableSeatTemplate = (db) => {
  if (!tableExists(db, 'shows')) return;
  try {
    const cols = db.prepare(`PRAGMA table_info(shows)`).all([]);
    const seatCol = cols.find(c => c.name === 'seat_template_id');
    if (!seatCol || !seatCol.notnull) return;

    console.log('  正在迁移 shows 表 (seat_template_id 改为可空)...');
    db.exec('BEGIN TRANSACTION');
    
    db.exec(`ALTER TABLE shows RENAME TO shows_old`);
    
    db.exec(`CREATE TABLE shows (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      performance_id INTEGER NOT NULL,
      theater_id INTEGER NOT NULL,
      show_date DATE NOT NULL,
      start_time TIME NOT NULL,
      end_time TIME NOT NULL,
      status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft', 'onsale', 'soldout', 'cancelled', 'ended')),
      seat_template_id INTEGER,
      onsale_at DATETIME,
      endsale_at DATETIME,
      created_by INTEGER NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (performance_id) REFERENCES performances(id),
      FOREIGN KEY (theater_id) REFERENCES theaters(id),
      FOREIGN KEY (seat_template_id) REFERENCES seat_templates(id),
      FOREIGN KEY (created_by) REFERENCES users(id)
    )`);
    
    const oldCols = db.prepare(`PRAGMA table_info(shows_old)`).all([]).map(c => c.name).join(',');
    db.exec(`INSERT INTO shows (${oldCols}) SELECT ${oldCols} FROM shows_old`);
    
    db.exec(`DROP TABLE shows_old`);
    db.exec('COMMIT');
    console.log('  shows 表迁移完成');
  } catch (err) {
    try { db.exec('ROLLBACK'); } catch(e) {}
    console.warn('  shows 表迁移失败:', err.message);
  }
};

const recreateSetlementsTable = (db) => {
  if (!tableExists(db, 'settlements')) return;
  
  const hasOldStatus = columnExists(db, 'settlements', 'status');
  const hasSettlementNo = columnExists(db, 'settlements', 'settlement_no');
  
  if (!hasOldStatus || hasSettlementNo) return;

  try {
    console.log('  正在迁移 settlements 表...');
    db.exec('BEGIN TRANSACTION');
    
    db.exec(`ALTER TABLE settlements RENAME TO settlements_old`);
    
    db.exec(`CREATE TABLE settlements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      show_id INTEGER NOT NULL,
      settlement_no TEXT UNIQUE,
      version INTEGER DEFAULT 1,
      parent_id INTEGER,
      total_tickets INTEGER NOT NULL,
      total_revenue DECIMAL(12,2) NOT NULL,
      total_refunds DECIMAL(12,2) DEFAULT 0,
      net_revenue DECIMAL(12,2) NOT NULL,
      group_share DECIMAL(12,2) NOT NULL,
      theater_share DECIMAL(12,2) NOT NULL,
      share_ratio DECIMAL(5,2) NOT NULL DEFAULT 50,
      settlement_mode TEXT DEFAULT 'ratio' CHECK(settlement_mode IN ('ratio', 'fixed', 'guaranteed', 'tiered')),
      fixed_fee DECIMAL(12,2) DEFAULT 0,
      guaranteed_amount DECIMAL(12,2) DEFAULT 0,
      tiered_config TEXT,
      status TEXT DEFAULT 'pending_generated' CHECK(status IN ('pending_generated', 'pending_confirm', 'confirmed', 'paid', 'void')),
      is_void BOOLEAN DEFAULT 0,
      void_reason TEXT,
      void_by INTEGER,
      void_at DATETIME,
      confirmed_by INTEGER,
      confirmed_at DATETIME,
      paid_by INTEGER,
      paid_at DATETIME,
      created_by INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (show_id) REFERENCES shows(id),
      FOREIGN KEY (parent_id) REFERENCES settlements(id),
      FOREIGN KEY (void_by) REFERENCES users(id),
      FOREIGN KEY (confirmed_by) REFERENCES users(id),
      FOREIGN KEY (paid_by) REFERENCES users(id),
      FOREIGN KEY (created_by) REFERENCES users(id)
    )`);
    
    const oldData = db.prepare('SELECT * FROM settlements_old').all([]);
    const insertStmt = db.prepare(`INSERT INTO settlements 
      (id, show_id, total_tickets, total_revenue, total_refunds, net_revenue, group_share, theater_share, share_ratio, status, created_at, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    
    oldData.forEach(row => {
      let newStatus = 'pending_generated';
      if (row.status === 'confirmed') newStatus = 'confirmed';
      else if (row.status === 'paid') newStatus = 'paid';
      else if (row.status === 'pending') newStatus = 'pending_confirm';
      
      insertStmt.run([
        row.id, row.show_id, row.total_tickets, row.total_revenue, row.total_refunds,
        row.net_revenue, row.group_share, row.theater_share, row.share_ratio, newStatus, row.created_at, null
      ]);
    });
    
    db.exec(`DROP TABLE settlements_old`);
    db.exec('COMMIT');
    console.log('  settlements 表迁移完成');
  } catch (err) {
    try { db.exec('ROLLBACK'); } catch (e) {}
    console.warn(`  settlements 表迁移失败: ${err.message}`);
  }
};

const recreateRefundsTable = (db) => {
  if (!tableExists(db, 'refunds')) return;
  
  const hasRefundNo = columnExists(db, 'refunds', 'refund_no');
  if (hasRefundNo) return;

  try {
    console.log('  正在迁移 refunds 表...');
    db.exec('BEGIN TRANSACTION');
    
    db.exec(`ALTER TABLE refunds RENAME TO refunds_old`);
    
    db.exec(`CREATE TABLE refunds (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER NOT NULL,
      order_item_id INTEGER,
      seat_id INTEGER NOT NULL,
      refund_no TEXT UNIQUE,
      refund_amount DECIMAL(10,2) NOT NULL,
      fee_amount DECIMAL(10,2) DEFAULT 0,
      reason TEXT NOT NULL,
      operator_id INTEGER NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (order_id) REFERENCES orders(id),
      FOREIGN KEY (order_item_id) REFERENCES order_items(id),
      FOREIGN KEY (seat_id) REFERENCES seats(id),
      FOREIGN KEY (operator_id) REFERENCES users(id)
    )`);
    
    const oldData = db.prepare('SELECT * FROM refunds_old').all([]);
    const insertStmt = db.prepare(`INSERT INTO refunds 
      (id, order_id, order_item_id, seat_id, refund_amount, reason, operator_id, created_at, refund_no, fee_amount)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    
    oldData.forEach(row => {
      const refundNo = 'REF' + Date.now() + Math.random().toString(36).substr(2, 4).toUpperCase() + row.id;
      insertStmt.run([
        row.id, row.order_id, row.order_item_id, row.seat_id, row.refund_amount,
        row.reason, row.operator_id, row.created_at, refundNo, 0
      ]);
    });
    
    db.exec(`DROP TABLE refunds_old`);
    db.exec('COMMIT');
    console.log('  refunds 表迁移完成');
  } catch (err) {
    try { db.exec('ROLLBACK'); } catch (e) {}
    console.warn(`  refunds 表迁移失败: ${err.message}`);
  }
};

const createTables = (db) => {
  console.log('创建/检查表结构...');

  const coreTables = [
    `CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      name TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('seller', 'scheduler', 'manager', 'finance')),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`,

    `CREATE TABLE IF NOT EXISTS theater_groups (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      contact TEXT,
      phone TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`,

    `CREATE TABLE IF NOT EXISTS theaters (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      layout_type TEXT NOT NULL CHECK(layout_type IN ('proscenium', 'thrust', 'blackbox')),
      total_seats INTEGER NOT NULL,
      description TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`,

    `CREATE TABLE IF NOT EXISTS seat_templates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      theater_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      layout_data TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (theater_id) REFERENCES theaters(id)
    )`,

    `CREATE TABLE IF NOT EXISTS performances (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      group_id INTEGER NOT NULL,
      cast TEXT,
      poster_url TEXT,
      description TEXT,
      duration INTEGER,
      status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'approved', 'rejected')),
      approver_id INTEGER,
      approved_at DATETIME,
      reject_reason TEXT,
      created_by INTEGER NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (group_id) REFERENCES theater_groups(id),
      FOREIGN KEY (approver_id) REFERENCES users(id),
      FOREIGN KEY (created_by) REFERENCES users(id)
    )`,

    `CREATE TABLE IF NOT EXISTS shows (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      performance_id INTEGER NOT NULL,
      theater_id INTEGER NOT NULL,
      show_date DATE NOT NULL,
      start_time TIME NOT NULL,
      end_time TIME NOT NULL,
      status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft', 'onsale', 'soldout', 'cancelled', 'ended')),
      seat_template_id INTEGER,
      onsale_at DATETIME,
      endsale_at DATETIME,
      created_by INTEGER NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (performance_id) REFERENCES performances(id),
      FOREIGN KEY (theater_id) REFERENCES theaters(id),
      FOREIGN KEY (seat_template_id) REFERENCES seat_templates(id),
      FOREIGN KEY (created_by) REFERENCES users(id)
    )`,

    `CREATE TABLE IF NOT EXISTS ticket_versions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      show_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (show_id) REFERENCES shows(id)
    )`,

    `CREATE TABLE IF NOT EXISTS seat_zones (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ticket_version_id INTEGER NOT NULL,
      zone_name TEXT NOT NULL CHECK(zone_name IN ('VIP', 'A', 'B', 'C')),
      base_price DECIMAL(10,2) NOT NULL,
      seat_count INTEGER NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (ticket_version_id) REFERENCES ticket_versions(id)
    )`,

    `CREATE TABLE IF NOT EXISTS seats (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      show_id INTEGER NOT NULL,
      zone_id INTEGER,
      row_label TEXT,
      seat_number TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'available' CHECK(status IN ('available', 'reserved', 'sold', 'locked', 'held')),
      price DECIMAL(10,2),
      lock_expires_at DATETIME,
      lock_type TEXT CHECK(lock_type IN ('media', 'guest', 'order', 'reservation')),
      locked_by INTEGER,
      held_by_phone TEXT,
      held_expires_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (show_id) REFERENCES shows(id),
      FOREIGN KEY (zone_id) REFERENCES seat_zones(id),
      FOREIGN KEY (locked_by) REFERENCES users(id)
    )`,

    `CREATE TABLE IF NOT EXISTS discount_rules (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ticket_version_id INTEGER NOT NULL,
      rule_type TEXT NOT NULL CHECK(rule_type IN ('early_bird', 'student', 'couple', 'family', 'group')),
      name TEXT NOT NULL,
      discount_type TEXT NOT NULL CHECK(discount_type IN ('percentage', 'fixed', 'bundle')),
      discount_value DECIMAL(10,2) NOT NULL,
      min_tickets INTEGER DEFAULT 1,
      max_tickets INTEGER,
      start_date DATETIME,
      end_date DATETIME,
      is_active BOOLEAN DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (ticket_version_id) REFERENCES ticket_versions(id)
    )`,

    `CREATE TABLE IF NOT EXISTS orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_no TEXT UNIQUE NOT NULL,
      show_id INTEGER NOT NULL,
      buyer_name TEXT,
      buyer_phone TEXT,
      id_card TEXT,
      channel TEXT DEFAULT 'box_office' CHECK(channel IN ('box_office', 'online', 'agent', 'partner')),
      total_amount DECIMAL(10,2) NOT NULL,
      discount_amount DECIMAL(10,2) DEFAULT 0,
      actual_amount DECIMAL(10,2) NOT NULL,
      refund_fee DECIMAL(12,2) DEFAULT 0,
      payment_method TEXT CHECK(payment_method IN ('cash', 'wechat', 'alipay', 'card', 'transfer', 'reservation')),
      payment_status TEXT NOT NULL DEFAULT 'pending' CHECK(payment_status IN ('pending', 'paid', 'cancelled', 'refunded', 'partial_refunded')),
      order_type TEXT NOT NULL DEFAULT 'online' CHECK(order_type IN ('online', 'offline', 'phone', 'group')),
      seller_id INTEGER,
      paid_at DATETIME,
      expires_at DATETIME,
      remark TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (show_id) REFERENCES shows(id),
      FOREIGN KEY (seller_id) REFERENCES users(id)
    )`,

    `CREATE TABLE IF NOT EXISTS order_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER NOT NULL,
      seat_id INTEGER NOT NULL,
      original_price DECIMAL(10,2) NOT NULL,
      discount_price DECIMAL(10,2) NOT NULL,
      discount_rule_id INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (order_id) REFERENCES orders(id),
      FOREIGN KEY (seat_id) REFERENCES seats(id),
      FOREIGN KEY (discount_rule_id) REFERENCES discount_rules(id)
    )`,
  ];

  const newTables = [
    `CREATE TABLE IF NOT EXISTS audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      user_name TEXT,
      action TEXT NOT NULL,
      target_type TEXT CHECK(target_type IN ('performance', 'show', 'order', 'settlement', 'seat')),
      target_id INTEGER,
      detail TEXT,
      ip_address TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id)
    )`,

    `CREATE TABLE IF NOT EXISTS refund_rules (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      allow_partial BOOLEAN DEFAULT 1,
      deadline_hours_before INTEGER DEFAULT 2,
      fee_rate DECIMAL(5,2) DEFAULT 0,
      fee_minimum_amount DECIMAL(10,2) DEFAULT 0,
      allow_refund_after_settlement BOOLEAN DEFAULT 0,
      is_active BOOLEAN DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`,

    `CREATE TABLE IF NOT EXISTS settlements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      show_id INTEGER NOT NULL,
      settlement_no TEXT UNIQUE,
      version INTEGER DEFAULT 1,
      parent_id INTEGER,
      total_tickets INTEGER NOT NULL,
      total_revenue DECIMAL(12,2) NOT NULL,
      total_refunds DECIMAL(12,2) DEFAULT 0,
      net_revenue DECIMAL(12,2) NOT NULL,
      group_share DECIMAL(12,2) NOT NULL,
      theater_share DECIMAL(12,2) NOT NULL,
      share_ratio DECIMAL(5,2) NOT NULL DEFAULT 50,
      settlement_mode TEXT DEFAULT 'ratio' CHECK(settlement_mode IN ('ratio', 'fixed', 'guaranteed', 'tiered')),
      fixed_fee DECIMAL(12,2) DEFAULT 0,
      guaranteed_amount DECIMAL(12,2) DEFAULT 0,
      tiered_config TEXT,
      status TEXT DEFAULT 'pending_generated' CHECK(status IN ('pending_generated', 'pending_confirm', 'confirmed', 'paid', 'void')),
      is_void BOOLEAN DEFAULT 0,
      void_reason TEXT,
      void_by INTEGER,
      void_at DATETIME,
      confirmed_by INTEGER,
      confirmed_at DATETIME,
      paid_by INTEGER,
      paid_at DATETIME,
      created_by INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (show_id) REFERENCES shows(id),
      FOREIGN KEY (parent_id) REFERENCES settlements(id),
      FOREIGN KEY (void_by) REFERENCES users(id),
      FOREIGN KEY (confirmed_by) REFERENCES users(id),
      FOREIGN KEY (paid_by) REFERENCES users(id),
      FOREIGN KEY (created_by) REFERENCES users(id)
    )`,

    `CREATE TABLE IF NOT EXISTS refunds (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER NOT NULL,
      order_item_id INTEGER,
      seat_id INTEGER NOT NULL,
      refund_no TEXT UNIQUE,
      refund_amount DECIMAL(10,2) NOT NULL,
      fee_amount DECIMAL(10,2) DEFAULT 0,
      reason TEXT NOT NULL,
      operator_id INTEGER NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (order_id) REFERENCES orders(id),
      FOREIGN KEY (order_item_id) REFERENCES order_items(id),
      FOREIGN KEY (seat_id) REFERENCES seats(id),
      FOREIGN KEY (operator_id) REFERENCES users(id)
    )`,

    `CREATE TABLE IF NOT EXISTS performance_repertoire (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      type TEXT,
      total_shows INTEGER DEFAULT 0,
      total_audience INTEGER DEFAULT 0,
      avg_occupancy_rate DECIMAL(5,2) DEFAULT 0,
      total_revenue DECIMAL(12,2) DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`,

    `CREATE TABLE IF NOT EXISTS repertoire_stats (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      performance_id INTEGER UNIQUE,
      last_show_date DATE,
      total_reruns INTEGER DEFAULT 0,
      avg_revenue_per_show DECIMAL(12,2) DEFAULT 0,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (performance_id) REFERENCES performances(id)
    )`,
  ];

  const indexes = [
    `CREATE INDEX IF NOT EXISTS idx_shows_date ON shows(show_date)`,
    `CREATE INDEX IF NOT EXISTS idx_shows_status ON shows(status)`,
    `CREATE INDEX IF NOT EXISTS idx_shows_onsale ON shows(onsale_at, endsale_at)`,
    `CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(payment_status)`,
    `CREATE INDEX IF NOT EXISTS idx_orders_channel ON orders(channel)`,
    `CREATE INDEX IF NOT EXISTS idx_orders_expires ON orders(expires_at)`,
    `CREATE INDEX IF NOT EXISTS idx_seats_show ON seats(show_id)`,
    `CREATE INDEX IF NOT EXISTS idx_seats_status ON seats(status)`,
    `CREATE INDEX IF NOT EXISTS idx_seats_lock_expires ON seats(lock_expires_at)`,
    `CREATE INDEX IF NOT EXISTS idx_seats_held_expires ON seats(held_expires_at)`,
    `CREATE INDEX IF NOT EXISTS idx_performances_status ON performances(status)`,
    `CREATE INDEX IF NOT EXISTS idx_audit_logs_user ON audit_logs(user_id)`,
    `CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action)`,
    `CREATE INDEX IF NOT EXISTS idx_audit_logs_target ON audit_logs(target_type, target_id)`,
    `CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON audit_logs(created_at)`,
    `CREATE INDEX IF NOT EXISTS idx_settlements_show ON settlements(show_id)`,
    `CREATE INDEX IF NOT EXISTS idx_settlements_status ON settlements(status)`,
    `CREATE INDEX IF NOT EXISTS idx_settlements_no ON settlements(settlement_no)`,
    `CREATE INDEX IF NOT EXISTS idx_refunds_order ON refunds(order_id)`,
    `CREATE INDEX IF NOT EXISTS idx_refunds_no ON refunds(refund_no)`,
  ];

  db.exec('BEGIN TRANSACTION');
  try {
    for (const sql of coreTables) {
      db.exec(sql);
    }
    for (const sql of newTables) {
      db.exec(sql);
    }
    db.exec('COMMIT');
    console.log('基础表创建完成');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }

  console.log('执行表结构迁移...');
  recreateSetlementsTable(db);
  recreateShowsNullableSeatTemplate(db);
  recreateRefundsTable(db);

  console.log('添加缺失列...');
  addColumnIfNotExists(db, 'shows', 'onsale_at DATETIME');
  addColumnIfNotExists(db, 'shows', 'endsale_at DATETIME');
  addColumnIfNotExists(db, 'orders', "channel TEXT DEFAULT 'box_office' CHECK(channel IN ('box_office', 'online', 'agent', 'partner'))");
  addColumnIfNotExists(db, 'orders', 'refund_fee DECIMAL(12,2) DEFAULT 0');
  addColumnIfNotExists(db, 'settlements', 'created_by INTEGER');

  console.log('创建索引...');
  db.exec('BEGIN TRANSACTION');
  try {
    for (const sql of indexes) {
      db.exec(sql);
    }
    db.exec('COMMIT');
    console.log('索引创建完成');
  } catch (err) {
    db.exec('ROLLBACK');
    console.warn('部分索引创建失败:', err.message);
  }
};

const insertInitialData = async (db) => {
  const salt = await bcrypt.genSalt(10);
  
  const users = [
    { username: 'admin', password: 'admin123', name: '系统管理员', role: 'manager' },
    { username: 'scheduler', password: '123456', name: '排期员小李', role: 'scheduler' },
    { username: 'seller', password: '123456', name: '售票员小王', role: 'seller' },
    { username: 'finance', password: '123456', name: '财务小张', role: 'finance' },
  ];

  const groups = [
    { name: '北京人民艺术剧院', contact: '李老师', phone: '010-12345678' },
    { name: '上海话剧艺术中心', contact: '王老师', phone: '021-87654321' },
    { name: '国家京剧院', contact: '张老师', phone: '010-11112222' },
  ];

  const theaters = [
    { name: '大剧院-主剧场', layout_type: 'proscenium', total_seats: 1200, description: '镜框式舞台，可容纳1200人' },
    { name: '实验剧场', layout_type: 'thrust', total_seats: 500, description: '三面台，适合小剧场演出' },
    { name: '黑匣子剧场', layout_type: 'blackbox', total_seats: 200, description: '灵活布局，可根据演出调整' },
  ];

  const refundRules = [
    { name: '标准退票规则', allow_partial: 1, deadline_hours_before: 2, fee_rate: 0, fee_minimum_amount: 0, allow_refund_after_settlement: 0 },
    { name: '演出前24小时可退(5%手续费)', allow_partial: 1, deadline_hours_before: 24, fee_rate: 5, fee_minimum_amount: 2, allow_refund_after_settlement: 0 },
  ];

  db.exec('BEGIN TRANSACTION');
  try {
    const userStmt = db.prepare('INSERT OR IGNORE INTO users (username, password, name, role) VALUES (?, ?, ?, ?)');
    for (const user of users) {
      const hashedPassword = bcrypt.hashSync(user.password, salt);
      userStmt.run(user.username, hashedPassword, user.name, user.role);
    }

    const groupStmt = db.prepare('INSERT OR IGNORE INTO theater_groups (name, contact, phone) VALUES (?, ?, ?)');
    for (const group of groups) {
      groupStmt.run(group.name, group.contact, group.phone);
    }

    const theaterStmt = db.prepare('INSERT OR IGNORE INTO theaters (name, layout_type, total_seats, description) VALUES (?, ?, ?, ?)');
    for (const theater of theaters) {
      theaterStmt.run(theater.name, theater.layout_type, theater.total_seats, theater.description);
    }

    const refundRuleStmt = db.prepare(`INSERT OR IGNORE INTO refund_rules 
      (name, allow_partial, deadline_hours_before, fee_rate, fee_minimum_amount, allow_refund_after_settlement, is_active, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`);
    for (const rule of refundRules) {
      refundRuleStmt.run([
        rule.name, rule.allow_partial, rule.deadline_hours_before, 
        rule.fee_rate, rule.fee_minimum_amount, rule.allow_refund_after_settlement, 1
      ]);
    }

    db.exec('COMMIT');
    console.log('初始数据插入完成');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
};

const initDbScript = async () => {
  try {
    const db = await initDb();
    createTables(db);
    await insertInitialData(db);
    saveDb();
    console.log('数据库初始化完成！');
    console.log('默认账号：');
    console.log('  经理: admin / admin123');
    console.log('  排期员: scheduler / 123456');
    console.log('  售票员: seller / 123456');
    console.log('  财务: finance / 123456');
    process.exit(0);
  } catch (err) {
    console.error('数据库初始化失败:', err);
    process.exit(1);
  }
};

initDbScript();
