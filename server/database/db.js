const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');

let rawDb = null;
let SQL = null;

const dbPath = path.join(__dirname, 'theater.db');

class Statement {
  constructor(stmt) {
    this.stmt = stmt;
  }

  get(...args) {
    let params = args;
    if (args.length === 1 && Array.isArray(args[0])) {
      params = args[0];
    }
    this.stmt.bind(params);
    if (this.stmt.step()) {
      const result = this.stmt.getAsObject();
      this.stmt.reset();
      return result;
    }
    this.stmt.reset();
    return undefined;
  }

  all(...args) {
    let params = args;
    if (args.length === 1 && Array.isArray(args[0])) {
      params = args[0];
    }
    const results = [];
    this.stmt.bind(params);
    while (this.stmt.step()) {
      results.push(this.stmt.getAsObject());
    }
    this.stmt.reset();
    return results;
  }

  run(...args) {
    let params = args;
    if (args.length === 1 && Array.isArray(args[0])) {
      params = args[0];
    }
    this.stmt.bind(params);
    this.stmt.step();
    this.stmt.reset();
    return {
      changes: rawDb.getRowsModified(),
      lastInsertRowid: rawDb.exec('SELECT last_insert_rowid() as id')[0].values[0][0]
    };
  }
}

class Database {
  constructor(db) {
    this.db = db;
  }

  prepare(sql) {
    return new Statement(this.db.prepare(sql));
  }

  run(sql, ...args) {
    if (args.length === 0) {
      this.db.run(sql);
    } else if (args.length === 1 && Array.isArray(args[0])) {
      this.db.run(sql, args[0]);
    } else {
      this.db.run(sql, args);
    }
    return {
      changes: this.db.getRowsModified(),
      lastInsertRowid: this.db.exec('SELECT last_insert_rowid() as id')[0].values[0][0]
    };
  }

  exec(sql) {
    return this.db.exec(sql);
  }

  pragma(sql) {
    return this.db.run(sql);
  }

  export() {
    return this.db.export();
  }
}

const initDb = async () => {
  if (rawDb) return new Database(rawDb);
  
  SQL = await initSqlJs();
  
  let dbData = null;
  if (fs.existsSync(dbPath)) {
    dbData = fs.readFileSync(dbPath);
  }
  
  rawDb = new SQL.Database(dbData);
  rawDb.run('PRAGMA foreign_keys = ON');
  
  return new Database(rawDb);
};

const saveDb = () => {
  if (rawDb) {
    const data = rawDb.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(dbPath, buffer);
  }
};

const getDb = () => rawDb ? new Database(rawDb) : null;

module.exports = { initDb, saveDb, getDb };
