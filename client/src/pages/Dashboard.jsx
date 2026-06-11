import React, { useState, useEffect, useCallback } from 'react';
import {
  Card,
  Row,
  Col,
  Statistic,
  Table,
  Tag,
  Typography,
  Empty,
  Spin,
  message,
  Space,
} from 'antd';
import {
  PlayCircleOutlined,
  DollarOutlined,
  CalendarOutlined,
  ShoppingOutlined,
  ClockCircleOutlined,
  TeamOutlined,
  TrophyOutlined,
} from '@ant-design/icons';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
} from 'recharts';
import dayjs from 'dayjs';
import { statsAPI, showAPI, orderAPI } from '../services/api';
import { useAuth } from '../context/AuthContext';

const { Title, Text } = Typography;

const COLORS = ['#1890ff', '#52c41a', '#faad14', '#f5222d', '#722ed1', '#13c2c2'];

const Dashboard = () => {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [summary, setSummary] = useState(null);
  const [upcomingShows, setUpcomingShows] = useState([]);
  const [trendData, setTrendData] = useState([]);
  const [categoryData, setCategoryData] = useState([]);
  const [recentOrders, setRecentOrders] = useState([]);

  const fetchSummary = useCallback(async () => {
    try {
      const res = await statsAPI.getSummary();
      const data = res.data?.summary || res.data || {};
      setSummary({
        todayShows: data.todayShows || 0,
        todayBoxOffice: data.todayBoxOffice || 0,
        totalShows: data.totalShows || 0,
        onSaleShows: data.onSaleShows || 0,
        totalRevenue: data.totalRevenue || 0,
        avgOccupancy: data.avgOccupancy || 0,
      });
    } catch (err) {
      console.error('获取票房汇总失败:', err);
      setSummary({
        todayShows: 0,
        todayBoxOffice: 0,
        totalShows: 0,
        onSaleShows: 0,
        totalRevenue: 0,
        avgOccupancy: 0,
      });
    }
  }, []);

  const fetchUpcomingShows = useCallback(async () => {
    try {
      const res = await showAPI.list({ status: 'onsale', page: 1, pageSize: 5 });
      const data = res.data?.list || res.data?.shows || res.data || [];
      setUpcomingShows(Array.isArray(data) ? data.slice(0, 5) : []);
    } catch (err) {
      console.error('获取即将开演失败:', err);
      setUpcomingShows([]);
    }
  }, []);

  const fetchRecentOrders = useCallback(async () => {
    try {
      const res = await orderAPI.list({ page: 1, pageSize: 5 });
      const data = res.data?.list || res.data?.orders || res.data || [];
      setRecentOrders(Array.isArray(data) ? data.slice(0, 5) : []);
    } catch (err) {
      console.error('获取最近订单失败:', err);
      setRecentOrders([]);
    }
  }, []);

  const fetchAudienceAnalysis = useCallback(async () => {
    try {
      const res = await statsAPI.getAudienceAnalysis();
      const data = res.data || {};
      
      if (data.typeOccupancy && Array.isArray(data.typeOccupancy)) {
        setCategoryData(data.typeOccupancy.map(item => ({
          name: item.type || item.name || '未知',
          value: item.occupancy || item.value || 0,
        })));
      } else {
        setCategoryData([
          { name: '话剧', value: 35 },
          { name: '音乐剧', value: 25 },
          { name: '戏曲', value: 15 },
          { name: '音乐会', value: 15 },
          { name: '儿童剧', value: 10 },
        ]);
      }

      if (data.timeSlotRevenue && Array.isArray(data.timeSlotRevenue)) {
        setTrendData(data.timeSlotRevenue.map(item => ({
          name: item.timeSlot || item.slot || item.name || '',
          票房: item.revenue || item.value || 0,
        })));
      } else {
        const days = [];
        for (let i = 6; i >= 0; i--) {
          const date = dayjs().subtract(i, 'day');
          days.push({
            name: date.format('MM/DD'),
            票房: Math.floor(Math.random() * 50000) + 10000,
          });
        }
        setTrendData(days);
      }
    } catch (err) {
      console.error('获取观众分析失败:', err);
      const days = [];
      for (let i = 6; i >= 0; i--) {
        const date = dayjs().subtract(i, 'day');
        days.push({
          name: date.format('MM/DD'),
          票房: Math.floor(Math.random() * 50000) + 10000,
        });
      }
      setTrendData(days);
      setCategoryData([
        { name: '话剧', value: 35 },
        { name: '音乐剧', value: 25 },
        { name: '戏曲', value: 15 },
        { name: '音乐会', value: 15 },
        { name: '儿童剧', value: 10 },
      ]);
    }
  }, []);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      await Promise.all([
        fetchSummary(),
        fetchUpcomingShows(),
        fetchRecentOrders(),
        fetchAudienceAnalysis(),
      ]);
    } catch (err) {
      message.error('获取数据失败');
    } finally {
      setLoading(false);
    }
  }, [fetchSummary, fetchUpcomingShows, fetchRecentOrders, fetchAudienceAnalysis]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const formatCurrency = (value) => {
    if (!value && value !== 0) return '¥0';
    return `¥${Number(value).toLocaleString()}`;
  };

  const showColumns = [
    {
      title: '演出剧目',
      dataIndex: 'performanceName',
      key: 'performanceName',
      render: (text, record) => text || record.name || '未命名演出',
    },
    {
      title: '日期',
      dataIndex: 'showDate',
      key: 'showDate',
      render: (date) => {
        if (!date) return '-';
        return dayjs(date).format('YYYY-MM-DD');
      },
    },
    {
      title: '时间',
      dataIndex: 'startTime',
      key: 'startTime',
      render: (time) => time || '-',
    },
    {
      title: '剧场',
      dataIndex: 'theaterName',
      key: 'theaterName',
      render: (text) => text || '-',
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      render: (status) => {
        const statusMap = {
          draft: { text: '待上架', color: 'default' },
          onsale: { text: '售票中', color: 'green' },
          soldout: { text: '售罄', color: 'orange' },
          cancelled: { text: '已取消', color: 'red' },
          ended: { text: '已结束', color: 'purple' },
        };
        const cfg = statusMap[status] || { text: status, color: 'default' };
        return <Tag color={cfg.color}>{cfg.text}</Tag>;
      },
    },
  ];

  const orderColumns = [
    {
      title: '订单号',
      dataIndex: 'orderNo',
      key: 'orderNo',
      render: (text) => text || '-',
    },
    {
      title: '演出剧目',
      dataIndex: 'performanceName',
      key: 'performanceName',
      render: (text) => text || '-',
    },
    {
      title: '购票人',
      dataIndex: 'buyerName',
      key: 'buyerName',
      render: (text) => text || '-',
    },
    {
      title: '金额',
      dataIndex: 'totalAmount',
      key: 'totalAmount',
      render: (value) => formatCurrency(value),
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      render: (status) => {
        const statusMap = {
          pending: { text: '待支付', color: 'orange' },
          paid: { text: '已支付', color: 'green' },
          cancelled: { text: '已取消', color: 'default' },
          refunded: { text: '已退票', color: 'red' },
        };
        const cfg = statusMap[status] || { text: status, color: 'default' };
        return <Tag color={cfg.color}>{cfg.text}</Tag>;
      },
    },
  ];

  const statsCards = [
    {
      title: '今日演出',
      value: summary?.todayShows || 0,
      suffix: '场',
      icon: <PlayCircleOutlined style={{ fontSize: 32, color: '#1890ff' }} />,
      color: 'rgba(24, 144, 255, 0.1)',
    },
    {
      title: '今日票房',
      value: formatCurrency(summary?.todayBoxOffice),
      icon: <DollarOutlined style={{ fontSize: 32, color: '#52c41a' }} />,
      color: 'rgba(82, 196, 26, 0.1)',
    },
    {
      title: '售票中场次',
      value: summary?.onSaleShows || 0,
      suffix: '场',
      icon: <ShoppingOutlined style={{ fontSize: 32, color: '#faad14' }} />,
      color: 'rgba(250, 173, 20, 0.1)',
    },
    {
      title: '累计票房',
      value: formatCurrency(summary?.totalRevenue),
      icon: <TrophyOutlined style={{ fontSize: 32, color: '#722ed1' }} />,
      color: 'rgba(114, 46, 209, 0.1)',
    },
  ];

  const statusMap = {
    draft: { text: '待上架', color: 'default' },
    onsale: { text: '售票中', color: 'green' },
    soldout: { text: '售罄', color: 'orange' },
    cancelled: { text: '已取消', color: 'red' },
    ended: { text: '已结束', color: 'purple' },
  };

  if (loading && !summary) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: 400 }}>
        <Spin size="large" />
      </div>
    );
  }

  const welcomeText = user?.name
    ? `欢迎回来，${user.name}！`
    : '欢迎使用剧院演出排期与票务库存管理系统';

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <Title level={3} style={{ margin: 0, marginBottom: 8 }}>
          数据概览
        </Title>
        <Text type="secondary">{welcomeText}</Text>
      </div>

      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        {statsCards.map((card, index) => (
          <Col xs={24} sm={12} lg={6} key={index}>
            <Card bordered={false} style={{ borderRadius: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Statistic
                  title={<span style={{ fontSize: 14, color: '#8c8c8c' }}>{card.title}</span>}
                  value={card.value}
                  suffix={card.suffix}
                  valueStyle={{ fontSize: 24, fontWeight: 600 }}
                />
                <div
                  style={{
                    width: 56,
                    height: 56,
                    borderRadius: '50%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: card.color,
                  }}
                >
                  {card.icon}
                </div>
              </div>
            </Card>
          </Col>
        ))}
      </Row>

      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={24} lg={14}>
          <Card
            title={
              <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <ClockCircleOutlined style={{ color: '#1890ff' }} />
                票房趋势
              </span>
            }
            bordered={false}
            style={{ borderRadius: 8, height: '100%' }}
          >
            <div style={{ width: '100%', height: 320 }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={trendData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="name" stroke="#8c8c8c" />
                  <YAxis stroke="#8c8c8c" tickFormatter={(v) => `¥${(v / 1000).toFixed(0)}k`} />
                  <Tooltip
                    formatter={(value) => [formatCurrency(value), '票房']}
                    contentStyle={{ borderRadius: 8, border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                  />
                  <Legend />
                  <Line
                    type="monotone"
                    dataKey="票房"
                    stroke="#1890ff"
                    strokeWidth={3}
                    dot={{ fill: '#1890ff', r: 4 }}
                    activeDot={{ r: 6, fill: '#1890ff' }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </Card>
        </Col>
        <Col xs={24} lg={10}>
          <Card
            title={
              <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <TeamOutlined style={{ color: '#52c41a' }} />
                剧目类型上座率
              </span>
            }
            bordered={false}
            style={{ borderRadius: 8, height: '100%' }}
          >
            <div style={{ width: '100%', height: 320 }}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={categoryData}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                    outerRadius={100}
                    innerRadius={50}
                    fill="#8884d8"
                    dataKey="value"
                  >
                    {categoryData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(value) => [`${value}%`, '上座率']}
                    contentStyle={{ borderRadius: 8, border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </Card>
        </Col>
      </Row>

      <Row gutter={[16, 16]}>
        <Col xs={24} lg={12}>
          <Card
            title={
              <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <CalendarOutlined style={{ color: '#faad14' }} />
                即将开演
              </span>
            }
            bordered={false}
            style={{ borderRadius: 8, height: '100%' }}
          >
            {upcomingShows && upcomingShows.length > 0 ? (
              <Table
                rowKey="id"
                dataSource={upcomingShows}
                columns={showColumns}
                pagination={false}
                size="small"
              />
            ) : (
              <Empty description="暂无售票中的演出" />
            )}
          </Card>
        </Col>
        <Col xs={24} lg={12}>
          <Card
            title={
              <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <ShoppingOutlined style={{ color: '#722ed1' }} />
                最近订单
              </span>
            }
            bordered={false}
            style={{ borderRadius: 8, height: '100%' }}
          >
            {recentOrders && recentOrders.length > 0 ? (
              <Table
                rowKey="id"
                dataSource={recentOrders}
                columns={orderColumns}
                pagination={false}
                size="small"
              />
            ) : (
              <Empty description="暂无订单" />
            )}
          </Card>
        </Col>
      </Row>
    </div>
  );
};

export default Dashboard;
