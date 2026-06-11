const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { saveDb } = require('../database/db');
const { JWT_SECRET, authenticateToken } = require('../middleware/auth');

const router = express.Router();

router.post('/login', async (req, res) => {
  const { username, password } = req.body;

  try {
    const user = req.db.prepare('SELECT * FROM users WHERE username = ?').get([username]);

    if (!user) {
      return res.status(401).json({ message: '用户名或密码错误' });
    }

    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
      return res.status(401).json({ message: '用户名或密码错误' });
    }

    const token = jwt.sign(
      { id: user.id, username: user.username, role: user.role, name: user.name },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.json({
      token,
      user: {
        id: user.id,
        username: user.username,
        name: user.name,
        role: user.role,
      },
    });
  } catch (err) {
    console.error('登录错误:', err);
    return res.status(500).json({ message: '数据库错误', error: err.message });
  }
});

router.get('/me', authenticateToken, (req, res) => {
  res.json({
    user: {
      id: req.user.id,
      username: req.user.username,
      name: req.user.name,
      role: req.user.role,
    },
  });
});

router.post('/logout', authenticateToken, (req, res) => {
  res.json({ message: '退出成功' });
});

module.exports = router;
