const express = require('express');
const cors = require('cors');
const { initDb, saveDb, getDb } = require('./database/db');

const authRoutes = require('./routes/auth');
const performanceRoutes = require('./routes/performances');
const showRoutes = require('./routes/shows');
const theaterRoutes = require('./routes/theaters');
const ticketRoutes = require('./routes/tickets');
const orderRoutes = require('./routes/orders');
const statRoutes = require('./routes/statistics');

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
  } catch (err) {
    console.error('启动失败:', err);
    process.exit(1);
  }
};

startServer();
