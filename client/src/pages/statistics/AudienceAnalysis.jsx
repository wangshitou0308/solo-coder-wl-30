import React, { useState, useEffect } from 'react';
import {
  Card,
  Row,
  Col,
  DatePicker,
  Statistic,
  List,
  Tag,
  Space,
  Typography,
  Spin,
  message,
  Empty,
  Select,
} from 'antd';
import {
  RiseOutlined,
  ClockCircleOutlined,
  DollarOutlined,
  TrophyOutlined,
  AreaChartOutlined,
} from '@ant-design/icons';
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { statsAPI } from '../../services/api';
import dayjs from 'dayjs';

const { Title } = Typography;
const { RangePicker } = DatePicker;
const { Option } = Select;

const COLORS = ['#1890ff', '#52c41a', '#faad14', '#f5222d', '#722ed1', '#13c2c2', '#eb2f96', '#fa8c16'];

const TIME_SLOTS = [
  { key: 'morning', label: '上午', range: [6, 12] },
  { key: 'afternoon', label: '下午', range: [12, 18] },
  { key: 'evening', label: '晚上', range: [18, 22] },
  { key: 'lateNight', label: '深夜', range: [22, 6] },
];

const SEAT_AREAS = ['VIP区', 'A区', 'B区', 'C区', '看台'];

const TYPE_COLOR_MAP = {
  '话剧': '#1890ff',
  '音乐剧': '#722ed1',
  '儿童剧': '#f5222d',
  '戏曲': '#faad14',
  '音乐会': '#52c41a',
  '舞蹈': '#eb2f96',
  '其他': '#8c8c8c',
};

const AudienceAnalysis = () => {
  const [loading, setLoading] = useState(false);
  const [dateRange, setDateRange] = useState(null);
  const [typeOccupancy, setTypeOccupancy] = useState([]);
  const [timeSlotRevenue, setTimeSlotRevenue] = useState([]);
  const [areaSales, setAreaSales] = useState([]);
  const [topRepertoires, setTopRepertoires] = useState([]);
  const [summary, setSummary] = useState(null);

  useEffect(() => {
    fetchData();
  }, [dateRange]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const params = {};
      if (dateRange && dateRange.length === 2) {
        params.startDate = dateRange[0].format('YYYY-MM-DD');
        params.endDate = dateRange[1].format('YYYY-MM-DD');
      }

      const res = await statsAPI.getAudienceAnalysis(params);
      const data = res.data || {};

      const typeData = data.typeOccupancy || generateMockTypeOccupancy();
      const timeData = data.timeSlotRevenue || generateMockTimeSlotRevenue();
      const areaData = data.areaSales || generateMockAreaSales();
      const topData = data.topRepertoires || generateMockTopRepertoires();

      setTypeOccupancy(typeData);
      setTimeSlotRevenue(timeData);
      setAreaSales(areaData);
      setTopRepertoires(topData);

      const totalRevenue = timeData.reduce((sum, item) => sum + (item.revenue || 0), 0);
      const avgOccupancy = typeData.length > 0
        ? typeData.reduce((sum, item) => sum + parseFloat(item.avgOccupancy || 0), 0) / typeData.length
        : 0;
      const topType = typeData.length > 0
        ? [...typeData].sort((a, b) => parseFloat(b.avgOccupancy) - parseFloat(a.avgOccupancy))[0]
        : null;

      setSummary({
        totalRevenue,
        avgOccupancy,
        topType,
        repertoiresCount: topData.length,
      });
    } catch (err) {
      message.error('获取分析数据失败');
    } finally {
      setLoading(false);
    }
  };

  const generateMockTypeOccupancy = () => {
    const types = ['话剧', '音乐剧', '儿童剧', '戏曲', '音乐会', '舞蹈'];
    return types.map((type, index) => ({
      type,
      showCount: Math.floor(Math.random() * 50) + 10,
      totalAudience: Math.floor(Math.random() * 20000) + 5000,
      avgOccupancy: (Math.random() * 30 + 60).toFixed(1),
      color: TYPE_COLOR_MAP[type] || COLORS[index % COLORS.length],
    }));
  };

  const generateMockTimeSlotRevenue = () => {
    return TIME_SLOTS.map((slot, index) => ({
      timeSlot: slot.label,
      timeSlotKey: slot.key,
      showCount: Math.floor(Math.random() * 100) + 20,
      revenue: Math.floor(Math.random() * 800000) + 100000,
      avgOccupancy: (Math.random() * 30 + 50).toFixed(1),
    }));
  };

  const generateMockAreaSales = () => {
    return SEAT_AREAS.map((area, index) => ({
      area,
      ticketsSold: Math.floor(Math.random() * 5000) + 1000,
      revenue: Math.floor(Math.random() * 600000) + 50000,
      value: Math.floor(Math.random() * 500000) + 100000,
    }));
  };

  const generateMockTopRepertoires = () => {
    const repertoires = [
      { name: '《雷雨》', type: '话剧' },
      { name: '《茶馆》', type: '话剧' },
      { name: '《猫》', type: '音乐剧' },
      { name: '《天鹅湖》', type: '舞蹈' },
      { name: '《梁祝》', type: '戏曲' },
      { name: '《花木兰》', type: '儿童剧' },
      { name: '《巴黎圣母院》', type: '音乐剧' },
      { name: '《仲夏夜之梦》', type: '话剧' },
      { name: '《命运交响曲》', type: '音乐会' },
      { name: '《胡桃夹子》', type: '舞蹈' },
    ];
    return repertoires.map((item, index) => ({
      id: index + 1,
      rank: index + 1,
      name: item.name,
      type: item.type,
      showCount: Math.floor(Math.random() * 50) + 10,
      totalAudience: Math.floor(Math.random() * 15000) + 3000,
      totalRevenue: Math.floor(Math.random() * 2000000) + 300000,
      avgOccupancy: (Math.random() * 30 + 65).toFixed(1),
    })).sort((a, b) => b.totalRevenue - a.totalRevenue).map((item, idx) => ({
      ...item,
      rank: idx + 1,
    }));
  };

  const formatCurrency = (value) => {
    if (!value && value !== 0) return '¥0';
    return `¥${Number(value).toLocaleString()}`;
  };

  const formatPercent = (value) => {
    if (!value && value !== 0) return '0%';
    return `${parseFloat(value).toFixed(1)}%`;
  };

  const getRankColor = (rank) => {
    if (rank === 1) return '#faad14';
    if (rank === 2) return '#bfbfbf';
    if (rank === 3) return '#d48806';
    return '#8c8c8c';
  };

  const getRankBgColor = (rank) => {
    if (rank === 1) return 'rgba(250, 173, 20, 0.1)';
    if (rank === 2) return 'rgba(191, 191, 191, 0.1)';
    if (rank === 3) return 'rgba(212, 136, 6, 0.1)';
    return 'rgba(140, 140, 140, 0.05)';
  };

  const statsCards = [
    {
      title: '分析时段总票房',
      value: summary ? formatCurrency(summary.totalRevenue) : '¥0',
      icon: <DollarOutlined style={{ fontSize: 32, color: '#1890ff' }} />,
      color: 'rgba(24, 144, 255, 0.1)',
    },
    {
      title: '平均上座率',
      value: summary ? formatPercent(summary.avgOccupancy) : '0%',
      icon: <RiseOutlined style={{ fontSize: 32, color: '#52c41a' }} />,
      color: 'rgba(82, 196, 26, 0.1)',
    },
    {
      title: '最受欢迎类型',
      value: summary?.topType?.type || '-',
      suffix: summary?.topType ? (
        <Tag color="#faad14" style={{ marginLeft: 8 }}>
          {formatPercent(summary.topType.avgOccupancy)}
        </Tag>
      ) : null,
      icon: <AreaChartOutlined style={{ fontSize: 32, color: '#faad14' }} />,
      color: 'rgba(250, 173, 20, 0.1)',
    },
    {
      title: '上榜剧目数',
      value: summary?.repertoiresCount || 0,
      icon: <TrophyOutlined style={{ fontSize: 32, color: '#722ed1' }} />,
      color: 'rgba(114, 46, 209, 0.1)',
    },
  ];

  if (loading && !summary) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: 400 }}>
        <Spin size="large" />
      </div>
    );
  }

  return (
    <div>
      <Title level={3} style={{ marginBottom: 24 }}>
        观众偏好分析
      </Title>

      <Card bordered={false} style={{ borderRadius: 8, marginBottom: 24 }}>
        <Row gutter={[16, 16]} align="middle">
          <Col xs={24} sm={12} md={8}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ whiteSpace: 'nowrap' }}>时间范围：</span>
              <RangePicker
                style={{ width: '100%' }}
                value={dateRange}
                onChange={setDateRange}
                format="YYYY-MM-DD"
              />
            </div>
          </Col>
          <Col xs={24} sm={12} md={8}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ whiteSpace: 'nowrap' }}>快速选择：</span>
              <Select
                style={{ width: 160 }}
                placeholder="选择时间范围"
                onChange={(value) => {
                  const end = dayjs();
                  let start;
                  switch (value) {
                    case '7days':
                      start = dayjs().subtract(6, 'day');
                      break;
                    case '30days':
                      start = dayjs().subtract(29, 'day');
                      break;
                    case '90days':
                      start = dayjs().subtract(89, 'day');
                      break;
                    case 'year':
                      start = dayjs().startOf('year');
                      break;
                    default:
                      start = null;
                  }
                  setDateRange(start ? [start, end] : null);
                }}
                allowClear
              >
                <Option value="7days">最近7天</Option>
                <Option value="30days">最近30天</Option>
                <Option value="90days">最近90天</Option>
                <Option value="year">本年度</Option>
              </Select>
            </div>
          </Col>
        </Row>
      </Card>

      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        {statsCards.map((card, index) => (
          <Col xs={24} sm={12} lg={6} key={index}>
            <Card bordered={false} style={{ borderRadius: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Statistic
                  title={<span style={{ fontSize: 14, color: '#8c8c8c' }}>{card.title}</span>}
                  value={card.value}
                  valueStyle={{ fontSize: 26, fontWeight: 600 }}
                  suffix={card.suffix}
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
        <Col xs={24} lg={12}>
          <Card
            title={
              <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <RiseOutlined style={{ color: '#1890ff' }} />
                各类型上座率对比
              </span>
            }
            bordered={false}
            style={{ borderRadius: 8, height: '100%' }}
          >
            {typeOccupancy.length > 0 ? (
              <div style={{ width: '100%', height: 320 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={typeOccupancy} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="type" stroke="#8c8c8c" />
                    <YAxis
                      stroke="#8c8c8c"
                      domain={[0, 100]}
                      tickFormatter={(v) => `${v}%`}
                    />
                    <Tooltip
                      formatter={(value) => [`${Number(value).toFixed(1)}%`, '平均上座率']}
                      contentStyle={{ borderRadius: 8, border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                    />
                    <Legend />
                    <Bar
                      dataKey="avgOccupancy"
                      name="平均上座率"
                      radius={[4, 4, 0, 0]}
                    >
                      {typeOccupancy.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={TYPE_COLOR_MAP[entry.type] || COLORS[index % COLORS.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <Empty description="暂无数据" style={{ padding: '60px 0' }} />
            )}
          </Card>
        </Col>

        <Col xs={24} lg={12}>
          <Card
            title={
              <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <ClockCircleOutlined style={{ color: '#52c41a' }} />
                各时段票房表现
              </span>
            }
            bordered={false}
            style={{ borderRadius: 8, height: '100%' }}
          >
            {timeSlotRevenue.length > 0 ? (
              <div style={{ width: '100%', height: 320 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={timeSlotRevenue} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="timeSlot" stroke="#8c8c8c" />
                    <YAxis
                      stroke="#8c8c8c"
                      tickFormatter={(v) => `¥${(v / 10000).toFixed(0)}万`}
                    />
                    <Tooltip
                      formatter={(value) => [formatCurrency(value), '票房收入']}
                      contentStyle={{ borderRadius: 8, border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                    />
                    <Legend />
                    <Line
                      type="monotone"
                      dataKey="revenue"
                      name="票房收入"
                      stroke="#52c41a"
                      strokeWidth={3}
                      dot={{ fill: '#52c41a', r: 6, strokeWidth: 2, stroke: '#fff' }}
                      activeDot={{ r: 8, fill: '#52c41a' }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <Empty description="暂无数据" style={{ padding: '60px 0' }} />
            )}
          </Card>
        </Col>
      </Row>

      <Row gutter={[16, 16]}>
        <Col xs={24} lg={12}>
          <Card
            title={
              <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <AreaChartOutlined style={{ color: '#faad14' }} />
                各区域销售分析
              </span>
            }
            bordered={false}
            style={{ borderRadius: 8, height: '100%' }}
          >
            {areaSales.length > 0 ? (
              <div style={{ width: '100%', height: 320 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={areaSales}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={({ area, percent }) => `${area} ${(percent * 100).toFixed(0)}%`}
                      outerRadius={100}
                      innerRadius={60}
                      fill="#8884d8"
                      dataKey="value"
                    >
                      {areaSales.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(value, name, props) => {
                        const item = props.payload;
                        return [
                          <div>
                            <div>{formatCurrency(item.revenue)}</div>
                            <div style={{ fontSize: 12, color: '#8c8c8c' }}>售出 {item.ticketsSold} 张</div>
                          </div>,
                          item.area,
                        ];
                      }}
                      contentStyle={{ borderRadius: 8, border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                    />
                    <Legend
                      verticalAlign="bottom"
                      height={36}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <Empty description="暂无数据" style={{ padding: '60px 0' }} />
            )}
          </Card>
        </Col>

        <Col xs={24} lg={12}>
          <Card
            title={
              <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <TrophyOutlined style={{ color: '#722ed1' }} />
                热门剧目排行 TOP 10
              </span>
            }
            bordered={false}
            style={{ borderRadius: 8, height: '100%' }}
          >
            {topRepertoires.length > 0 ? (
              <List
                size="small"
                dataSource={topRepertoires}
                renderItem={(item) => (
                  <List.Item
                    style={{
                      padding: '12px 16px',
                      background: getRankBgColor(item.rank),
                      borderRadius: 6,
                      marginBottom: 8,
                    }}
                  >
                    <List.Item.Meta
                      avatar={
                        <div
                          style={{
                            width: 28,
                            height: 28,
                            borderRadius: item.rank <= 3 ? '50%' : 4,
                            background: getRankColor(item.rank),
                            color: '#fff',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontWeight: 600,
                            fontSize: item.rank <= 3 ? 14 : 12,
                          }}
                        >
                          {item.rank}
                        </div>
                      }
                      title={
                        <Space>
                          <span style={{ fontWeight: 500 }}>{item.name}</span>
                          <Tag color={TYPE_COLOR_MAP[item.type]} style={{ margin: 0 }}>
                            {item.type}
                          </Tag>
                        </Space>
                      }
                      description={
                        <Space size="large" style={{ fontSize: 12, color: '#8c8c8c' }}>
                          <span>演出 {item.showCount} 场</span>
                          <span>观众 {(item.totalAudience || 0).toLocaleString()} 人</span>
                          <span>上座率 {formatPercent(item.avgOccupancy)}</span>
                        </Space>
                      }
                    />
                    <div style={{ fontWeight: 600, color: '#52c41a' }}>
                      {formatCurrency(item.totalRevenue)}
                    </div>
                  </List.Item>
                )}
              />
            ) : (
              <Empty description="暂无数据" style={{ padding: '60px 0' }} />
            )}
          </Card>
        </Col>
      </Row>
    </div>
  );
};

export default AudienceAnalysis;
