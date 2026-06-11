const { initDb, saveDb, getDb } = require('../database/db');
const bcrypt = require('bcryptjs');

const createTables = (db) => {
  const tables = [
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
      seat_template_id INTEGER NOT NULL,
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
      total_amount DECIMAL(10,2) NOT NULL,
      discount_amount DECIMAL(10,2) DEFAULT 0,
      actual_amount DECIMAL(10,2) NOT NULL,
      payment_method TEXT CHECK(payment_method IN ('cash', 'wechat', 'alipay', 'card', 'transfer', 'reservation')),
      payment_status TEXT NOT NULL DEFAULT 'pending' CHECK(payment_status IN ('pending', 'paid', 'cancelled', 'refunded')),
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

    `CREATE TABLE IF NOT EXISTS refunds (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER NOT NULL,
      order_item_id INTEGER NOT NULL,
      seat_id INTEGER NOT NULL,
      refund_amount DECIMAL(10,2) NOT NULL,
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

    `CREATE TABLE IF NOT EXISTS settlements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      show_id INTEGER NOT NULL,
      total_tickets INTEGER NOT NULL,
      total_revenue DECIMAL(12,2) NOT NULL,
      total_refunds DECIMAL(12,2) DEFAULT 0,
      net_revenue DECIMAL(12,2) NOT NULL,
      group_share DECIMAL(12,2) NOT NULL,
      theater_share DECIMAL(12,2) NOT NULL,
      share_ratio DECIMAL(5,2) NOT NULL DEFAULT 50,
      status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'confirmed', 'paid')),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (show_id) REFERENCES shows(id)
    )`,
  ];

  const indexes = [
    `CREATE INDEX IF NOT EXISTS idx_shows_date ON shows(show_date)`,
    `CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(payment_status)`,
    `CREATE INDEX IF NOT EXISTS idx_seats_show ON seats(show_id)`,
    `CREATE INDEX IF NOT EXISTS idx_performances_status ON performances(status)`,
  ];

  db.exec('BEGIN TRANSACTION');
  try {
    for (const sql of tables) {
      db.exec(sql);
    }
    for (const sql of indexes) {
      db.exec(sql);
    }
    db.exec('COMMIT');
    console.log('数据库表创建完成');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
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
