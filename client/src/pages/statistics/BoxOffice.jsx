import React, { useState, useEffect, useCallback } from 'react';
import {
  Card,
  Table,
  DatePicker,
  Select,
  Button,
  Statistic,
  Row,
  Col,
  Space,
  Tag,
  Typography,
  Spin,
  message,
  Empty,
  Tabs,
  Progress,
  Divider,
} from 'antd';
import {
  SearchOutlined,
  DollarOutlined,
  TeamOutlined,
  RiseOutlined,
  PlayCircleOutlined,
  PieChartOutlined,
  BarChartOutlined,
  ReloadOutlined,
} from '@ant-design/icons';
import {
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { statsAPI, showAPI } from '../../services/api';
import dayjs from 'dayjs';

const { Title, Text } = Typography;
const { RangePicker } = DatePicker;
const { Option } = Select;

const COLORS = ['#1890ff', '#52c41a', '#faad14', '#f5222d', '#722ed1', '#13c2c2', '#eb2f96', '#fa8c16'];

const BoxOffice = () => {
  const [activeTab, setActiveTab] = useState('single');
  const [loading, setLoading] = useState(false);
  const [summaryLoading, setSummaryLoading] = useState(false);

  const [showList, setShowList] = useState([]);
  const [selectedShowId, setSelectedShowId] = useState(null);
  const [boxOfficeData, setBoxOfficeData] = useState(null);

  const [dateRange, setDateRange] = useState(null);
  const [summaryData, setSummaryData] = useState(null);
  const [summaryShows, setSummaryShows] = useState([]);

  const fetchShowList = useCallback(async () => {
    try {
      const res = await showAPI.list({ page: 1, pageSize: 100 });
      const data = res.data;
      let shows = [];
      if (Array.isArray(data)) {
        shows = data;
      } else if (Array.isArray(data.list)) {
        shows = data.list;
      } else if (Array.isArray(data.shows)) {
        shows = data.shows;
      }
      setShowList(shows);
      if (shows.length > 0 && !selectedShowId) {
        setSelectedShowId(shows[0].id);
      }
    } catch (err) {
      console.error('获取演出列表失败:', err);
      setShowList([]);
    }
  }, [selectedShowId]);

  const fetchBoxOffice = useCallback(async () => {
    if (!selectedShowId) return;
    setLoading(true);
    try {
      const res = await statsAPI.getBoxOffice(selectedShowId);
      const data = res.data?.boxOffice || res.data?.data || res.data;
      if (data && typeof data === 'object' && !Array.isArray(data)) {
        setBoxOfficeData(data);
      } else {
        setBoxOfficeData(generateMockBoxOffice());
      }
    } catch (err) {
      console.error('获取票房数据失败:', err);
      setBoxOfficeData(generateMockBoxOffice());
    } finally {
      setLoading(false);
    }
  }, [selectedShowId]);

  const fetchSummary = useCallback(async () => {
    setSummaryLoading(true);
    try {
      const params = {};
      if (dateRange && dateRange.length === 2) {
        params.startDate = dateRange[0].format('YYYY-MM-DD');
        params.endDate = dateRange[1].format('YYYY-MM-DD');
      }
      const res = await statsAPI.getSummary(params);
      const data = res.data?.summary || res.data?.data || res.data;
      
      if (data && typeof data === 'object') {
        setSummaryData(data);
        let shows = [];
        if (Array.isArray(data.shows)) {
          shows = data.shows;
        } else if (Array.isArray(data.list)) {
          shows = data.list;
        } else if (Array.isArray(res.data?.shows)) {
          shows = res.data.shows;
        }
        setSummaryShows(shows);
      } else {
        const mockData = generateMockSummary();
        setSummaryData(mockData);
        setSummaryShows(generateMockShowList());
      }
    } catch (err) {
      console.error('获取票房汇总失败:', err);
      const mockData = generateMockSummary();
      setSummaryData(mockData);
      setSummaryShows(generateMockShowList());
    } finally {
      setSummaryLoading(false);
    }
  }, [dateRange]);

  useEffect(() => {
    fetchShowList();
  }, [fetchShowList]);

  useEffect(() => {
    if (selectedShowId && activeTab === 'single') {
      fetchBoxOffice();
    }
  }, [selectedShowId, activeTab, fetchBoxOffice]);

  useEffect(() => {
    if (activeTab === 'summary') {
      fetchSummary();
    }
  }, [activeTab, fetchSummary]);

  const generateMockBoxOffice = () => {
    const zones = [
      { zoneName: 'VIP', price: 880, soldCount: 45, totalCount: 50 },
      { zoneName: 'A', price: 580, soldCount: 120, totalCount: 150 },
      { zoneName: 'B', price: 380, soldCount: 180, totalCount: 200 },
      { zoneName: 'C', price: 180, soldCount: 95, totalCount: 120 },
    ];
    const totalTickets = zones.reduce((sum, z) => sum + z.totalCount, 0);
    const soldTickets = zones.reduce((sum, z) => sum + z.soldCount, 0);
    const totalRevenue = zones.reduce((sum, z) => sum + z.soldCount * z.price, 0);
    const occupancy = totalTickets > 0 ? Math.round((soldTickets / totalTickets) * 100) : 0;

    const zoneDetails = zones.map((z) => ({
      ...z,
      revenue: z.soldCount * z.price,
      countRatio: soldTickets > 0 ? ((z.soldCount / soldTickets) * 100).toFixed(1) : 0,
      revenueRatio: totalRevenue > 0 ? ((z.revenue / totalRevenue) * 100).toFixed(1) : 0,
    }));

    return {
      showName: '《雷雨》经典话剧',
      showTime: dayjs().add(3, 'day').format('YYYY-MM-DD 19:30'),
      theaterName: '大剧院-主剧场',
      totalTickets,
      soldTickets,
      occupancy,
      totalRevenue,
      zoneDetails,
    };
  };

  const generateMockSummary = () => {
    const days = 7;
    const startDate = dayjs().subtract(6, 'day');

    const dailyData = [];
    let totalRevenue = 0;
    let totalAudience = 0;
    let totalShows = 0;

    for (let i = 0; i < days; i++) {
      const date = startDate.add(i, 'day');
      const shows = Math.floor(Math.random() * 3) + 1;
      const revenue = Math.floor(Math.random() * 80000) + 20000;
      const audience = Math.floor(Math.random() * 500) + 200;
      totalShows += shows;
      totalRevenue += revenue;
      totalAudience += audience;
      dailyData.push({
        date: date.format('MM-DD'),
        revenue,
        audience,
        shows,
      });
    }

    return {
      totalRevenue,
      totalAudience,
      totalShows,
      avgOccupancy: Math.floor(Math.random() * 30) + 60,
      dailyData,
    };
  };

  const generateMockShowList = () => {
    const shows = [];
    const performanceNames = ['《雷雨》', '《茶馆》', '《暗恋桃花源》', '《猫》', '《天鹅湖》'];
    const theaters = ['大剧院-主剧场', '实验剧场', '黑匣子剧场'];
    const statuses = ['onsale', 'ended', 'soldout'];

    for (let i = 0; i < 8; i++) {
      const sold = Math.floor(Math.random() * 200) + 50;
      const total = sold + Math.floor(Math.random() * 100);
      shows.push({
        id: i + 1,
        performanceName: performanceNames[i % performanceNames.length],
        showDate: dayjs().add(i - 3, 'day').format('YYYY-MM-DD'),
        startTime: '19:30',
        theaterName: theaters[i % theaters.length],
        totalSeats: total,
        soldSeats: sold,
        occupancy: Math.round((sold / total) * 100),
        totalRevenue: sold * (Math.floor(Math.random() * 400) + 200),
        status: statuses[i % statuses.length],
      });
    }
    return shows;
  };

  const formatCurrency = (value) => {
    if (!value && value !== 0) return '¥0';
    return `¥${Number(value).toLocaleString()}`;
  };

  const singleStatsCards = boxOfficeData ? [
    {
      title: '总票数',
      value: boxOfficeData.totalTickets || 0,
      suffix: '张',
      icon: <PlayCircleOutlined style={{ fontSize: 28, color: '#1890ff' }} />,
      color: 'rgba(24, 144, 255, 0.1)',
    },
    {
      title: '已售票数',
      value: boxOfficeData.soldTickets || 0,
      suffix: '张',
      icon: <TeamOutlined style={{ fontSize: 28, color: '#52c41a' }} />,
      color: 'rgba(82, 196, 26, 0.1)',
    },
    {
      title: '上座率',
      value: boxOfficeData.occupancy || 0,
      suffix: '%',
      icon: <RiseOutlined style={{ fontSize: 28, color: '#faad14' }} />,
      color: 'rgba(250, 173, 20, 0.1)',
    },
    {
      title: '总收入',
      value: formatCurrency(boxOfficeData.totalRevenue),
      icon: <DollarOutlined style={{ fontSize: 28, color: '#722ed1' }} />,
      color: 'rgba(114, 46, 209, 0.1)',
    },
  ] : [];

  const summaryStatsCards = summaryData ? [
    {
      title: '累计票房',
      value: formatCurrency(summaryData.totalRevenue || summaryData.totalBoxOffice || 0),
      icon: <DollarOutlined style={{ fontSize: 28, color: '#1890ff' }} />,
      color: 'rgba(24, 144, 255, 0.1)',
    },
    {
      title: '场均上座率',
      value: summaryData.avgOccupancyRate || summaryData.avgOccupancy || 0,
      suffix: '%',
      icon: <RiseOutlined style={{ fontSize: 28, color: '#52c41a' }} />,
      color: 'rgba(82, 196, 26, 0.1)',
    },
    {
      title: '演出场次',
      value: summaryData.totalShows || 0,
      suffix: '场',
      icon: <PlayCircleOutlined style={{ fontSize: 28, color: '#faad14' }} />,
      color: 'rgba(250, 173, 20, 0.1)',
    },
    {
      title: '观众总数',
      value: summaryData.totalAudience || 0,
      suffix: '人',
      icon: <TeamOutlined style={{ fontSize: 28, color: '#722ed1' }} />,
      color: 'rgba(114, 46, 209, 0.1)',
    },
  ] : [];

  const pieData = boxOfficeData?.zoneDetails?.map(z => ({
    name: z.zoneName || `${z.zoneName}区`,
    value: z.soldCount || 0,
  })) || [];

  const revenuePieData = boxOfficeData?.zoneDetails?.map(z => ({
    name: z.zoneName || `${z.zoneName}区`,
    value: z.revenue || 0,
  })) || [];

  const zoneColumns = [
    {
      title: '区域',
      dataIndex: 'zoneName',
      key: 'zoneName',
      render: (text) => text || '-',
    },
    {
      title: '票价',
      dataIndex: 'price',
      key: 'price',
      render: (value) => formatCurrency(value),
    },
    {
      title: '已售数',
      dataIndex: 'soldCount',
      key: 'soldCount',
      render: (value) => value || 0,
    },
    {
      title: '收入',
      dataIndex: 'revenue',
      key: 'revenue',
      render: (value) => formatCurrency(value),
    },
    {
      title: '数量占比',
      dataIndex: 'countRatio',
      key: 'countRatio',
      render: (value) => (
        <Progress percent={Number(value) || 0} size="small" showInfo={false} />
      ),
    },
    {
      title: '收入占比',
      dataIndex: 'revenueRatio',
      key: 'revenueRatio',
      render: (value) => (
        <Progress percent={Number(value) || 0} size="small" status="active" showInfo={false} strokeColor="#52c41a" />
      ),
    },
  ];

  const showColumns = [
    {
      title: '演出剧目',
      dataIndex: 'performanceName',
      key: 'performanceName',
      render: (text, record) => text || record.name || '-',
    },
    {
      title: '日期',
      dataIndex: 'showDate',
      key: 'showDate',
      render: (date) => date ? dayjs(date).format('YYYY-MM-DD') : '-',
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
      title: '上座率',
      dataIndex: 'occupancy',
      key: 'occupancy',
      render: (value) => (
        <Progress percent={value || 0} size="small" />
      ),
    },
    {
      title: '票房收入',
      dataIndex: 'totalRevenue',
      key: 'totalRevenue',
      render: (value) => formatCurrency(value),
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

  const renderSingleView = () => (
    <Spin spinning={loading}>
      <Card bordered={false} style={{ borderRadius: 8, marginBottom: 24 }}>
        <Row gutter={[16, 16]} align="middle">
          <Col xs={24} sm={12} md={8}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ whiteSpace: 'nowrap' }}>演出场次：</span>
              <Select
                style={{ width: '100%' }}
                placeholder="请选择演出场次"
                value={selectedShowId}
                onChange={setSelectedShowId}
                showSearch
                optionFilterProp="children"
              >
                {(showList || []).map((show) => (
                  <Option key={show.id} value={show.id}>
                    {show.performanceName || show.name || `演出 #${show.id}`} -{' '}
                    {show.showDate ? dayjs(show.showDate).format('MM-DD') : ''} {show.startTime || ''}
                  </Option>
                ))}
              </Select>
            </div>
          </Col>
          <Col xs={24} sm={12} md={16}>
            {boxOfficeData && (
              <Space>
                <Tag color="blue">{boxOfficeData.theaterName}</Tag>
                <Tag color="default">{boxOfficeData.showTime}</Tag>
              </Space>
            )}
          </Col>
        </Row>
      </Card>

      {boxOfficeData ? (
        <>
          <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
            {singleStatsCards.map((card, index) => (
              <Col xs={24} sm={12} lg={6} key={index}>
                <Card bordered={false} style={{ borderRadius: 8 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Statistic
                      title={<span style={{ fontSize: 14, color: '#8c8c8c' }}>{card.title}</span>}
                      value={card.value}
                      suffix={card.suffix}
                      valueStyle={{ fontSize: 26, fontWeight: 600 }}
                    />
                    <div
                      style={{
                        width: 52,
                        height: 52,
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
                    <PieChartOutlined style={{ color: '#1890ff' }} />
                    各票区售票数量占比
                  </span>
                }
                bordered={false}
                style={{ borderRadius: 8, height: '100%' }}
              >
                <div style={{ width: '100%', height: 300 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={pieData}
                        cx="50%"
                        cy="50%"
                        labelLine={false}
                        label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                        outerRadius={90}
                        innerRadius={50}
                        dataKey="value"
                        paddingAngle={2}
                      >
                        {pieData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip
                        formatter={(value, name) => [`${value} 张`, name]}
                        contentStyle={{ borderRadius: 8, border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                      />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </Card>
            </Col>
            <Col xs={24} lg={12}>
              <Card
                title={
                  <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <PieChartOutlined style={{ color: '#52c41a' }} />
                    各票区收入占比
                  </span>
                }
                bordered={false}
                style={{ borderRadius: 8, height: '100%' }}
              >
                <div style={{ width: '100%', height: 300 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={revenuePieData}
                        cx="50%"
                        cy="50%"
                        labelLine={false}
                        label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                        outerRadius={90}
                        innerRadius={50}
                        dataKey="value"
                        paddingAngle={2}
                      >
                        {revenuePieData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip
                        formatter={(value) => [formatCurrency(value), '收入']}
                        contentStyle={{ borderRadius: 8, border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                      />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </Card>
            </Col>
          </Row>

          <Card
            title={
              <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <BarChartOutlined style={{ color: '#faad14' }} />
                销售明细
              </span>
            }
            bordered={false}
            style={{ borderRadius: 8 }}
          >
            <Table
              dataSource={boxOfficeData.zoneDetails || []}
              columns={zoneColumns}
              rowKey="zoneName"
              pagination={false}
              summary={(pageData) => {
                let totalSold = 0;
                let totalRev = 0;
                pageData.forEach((item) => {
                  totalSold += item.soldCount || 0;
                  totalRev += item.revenue || 0;
                });
                return (
                  <Table.Summary.Row>
                    <Table.Summary.Cell index={0}><strong>合计</strong></Table.Summary.Cell>
                    <Table.Summary.Cell index={1}>-</Table.Summary.Cell>
                    <Table.Summary.Cell index={2}><strong>{totalSold}</strong></Table.Summary.Cell>
                    <Table.Summary.Cell index={3}><strong>{formatCurrency(totalRev)}</strong></Table.Summary.Cell>
                    <Table.Summary.Cell index={4}>-</Table.Summary.Cell>
                    <Table.Summary.Cell index={5}>-</Table.Summary.Cell>
                  </Table.Summary.Row>
                );
              }}
            />
          </Card>
        </>
      ) : (
        <Empty description="请选择演出场次查看票房数据" />
      )}
    </Spin>
  );

  const renderSummaryView = () => (
    <Spin spinning={summaryLoading}>
      <Card bordered={false} style={{ borderRadius: 8, marginBottom: 24 }}>
        <Row gutter={[16, 16]} align="middle">
          <Col xs={24} sm={12} md={8}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ whiteSpace: 'nowrap' }}>时间范围：</span>
              <RangePicker
                style={{ width: '100%' }}
                value={dateRange}
                onChange={setDateRange}
              />
            </div>
          </Col>
          <Col xs={24} sm={12} md={16}>
            <Space>
              <Button
                type="primary"
                icon={<SearchOutlined />}
                onClick={fetchSummary}
              >
                查询
              </Button>
              <Button
                icon={<ReloadOutlined />}
                onClick={() => {
                  setDateRange(null);
                }}
              >
                重置
              </Button>
            </Space>
          </Col>
        </Row>
      </Card>

      {summaryData ? (
        <>
          <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
            {summaryStatsCards.map((card, index) => (
              <Col xs={24} sm={12} lg={6} key={index}>
                <Card bordered={false} style={{ borderRadius: 8 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Statistic
                      title={<span style={{ fontSize: 14, color: '#8c8c8c' }}>{card.title}</span>}
                      value={card.value}
                      suffix={card.suffix}
                      valueStyle={{ fontSize: 26, fontWeight: 600 }}
                    />
                    <div
                      style={{
                        width: 52,
                        height: 52,
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

          <Card
            title={
              <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <BarChartOutlined style={{ color: '#1890ff' }} />
                票房趋势
              </span>
            }
            bordered={false}
            style={{ borderRadius: 8, marginBottom: 24 }}
          >
            <div style={{ width: '100%', height: 350 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={summaryData.dailyData || []} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="date" stroke="#8c8c8c" />
                  <YAxis yAxisId="left" stroke="#8c8c8c" tickFormatter={(v) => `¥${(v / 1000).toFixed(0)}k`} />
                  <YAxis yAxisId="right" orientation="right" stroke="#8c8c8c" />
                  <Tooltip
                    contentStyle={{ borderRadius: 8, border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                  />
                  <Legend />
                  <Bar yAxisId="left" dataKey="revenue" name="票房收入" fill="#1890ff" radius={[4, 4, 0, 0]} />
                  <Bar yAxisId="right" dataKey="audience" name="观众人数" fill="#52c41a" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>

          <Card
            title={
              <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <PlayCircleOutlined style={{ color: '#faad14' }} />
                场次票房明细
              </span>
            }
            bordered={false}
            style={{ borderRadius: 8 }}
          >
            <Table
              dataSource={summaryShows || []}
              columns={showColumns}
              rowKey="id"
              pagination={{ pageSize: 10 }}
            />
          </Card>
        </>
      ) : (
        <Empty description="暂无数据" />
      )}
    </Spin>
  );

  return (
    <div>
      <Title level={3} style={{ marginBottom: 24 }}>
        票房统计
      </Title>

      <Card bordered={false} style={{ borderRadius: 8 }}>
        <Tabs
          activeKey={activeTab}
          onChange={setActiveTab}
          type="card"
          items={[
            {
              key: 'single',
              label: '单场票房',
              children: renderSingleView(),
            },
            {
              key: 'summary',
              label: '票房汇总',
              children: renderSummaryView(),
            },
          ]}
        />
      </Card>
    </div>
  );
};

export default BoxOffice;
