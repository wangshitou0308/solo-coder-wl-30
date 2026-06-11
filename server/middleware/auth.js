const jwt = require('jsonwebtoken');
const db = require('../database/db');

const JWT_SECRET = 'theater-management-secret-key-2024';

const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ message: '未提供认证令牌' });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ message: '认证令牌无效' });
    }
    req.user = user;
    next();
  });
};

const requireRole = (...roles) => {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ message: '权限不足，无法执行此操作' });
    }
    next();
  };
};

module.exports = { authenticateToken, requireRole, JWT_SECRET };
