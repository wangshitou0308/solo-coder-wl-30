import React, { useState, useEffect } from 'react';
import {
  Card,
  Table,
  Input,
  Select,
  Button,
  Progress,
  Row,
  Col,
  Space,
  Tag,
  Typography,
  Spin,
  message,
  Empty,
  Modal,
  Descriptions,
  List,
} from 'antd';
import {
  SearchOutlined,
  PlayCircleOutlined,
  DollarOutlined,
  TeamOutlined,
  RiseOutlined,
  FileTextOutlined,
  EyeOutlined,
  SortAscendingOutlined,
} from '@ant-design/icons';
import { statsAPI } from '../../services/api';

const { Title } = Typography;
const { Option } = Select;

const TYPE_OPTIONS = ['话剧', '音乐剧', '儿童剧', '戏曲', '音乐会', '舞蹈', '其他'];

const TYPE_COLOR_MAP = {
  '话剧': '#1890ff',
  '音乐剧': '#722ed1',
  '儿童剧': '#f5222d',
  '戏曲': '#faad14',
  '音乐会': '#52c41a',
  '舞蹈': '#eb2f96',
  '其他': '#8c8c8c',
};

const SORT_OPTIONS = [
  { value: 'showCount', label: '演出次数' },
  { value: 'avgOccupancy', label: '平均上座率' },
  { value: 'totalRevenue', label: '累计票房' },
];

const Repertoire = () => {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState([]);
  const [filteredData, setFilteredData] = useState([]);
  const [searchName, setSearchName] = useState('');
  const [searchType, setSearchType] = useState(null);
  const [searchGroup, setSearchGroup] = useState('');
  const [sortField, setSortField] = useState('totalRevenue');
  const [sortOrder, setSortOrder] = useState('descend');
  const [modalVisible, setModalVisible] = useState(false);
  const [selectedRepertoire, setSelectedRepertoire] = useState(null);
  const [performanceHistory, setPerformanceHistory] = useState([]);

  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    filterAndSortData();
  }, [data, searchName, searchType, searchGroup, sortField, sortOrder]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const res = await statsAPI.getRepertoire();
      const repertoire = res.data?.repertoire || res.data || [];
      setData(repertoire);
    } catch (err) {
      message.error('获取剧目数据失败');
    } finally {
      setLoading(false);
    }
  };

  const filterAndSortData = () => {
    let result = [...data];

    if (searchName) {
      result = result.filter(item =>
        item.name?.toLowerCase().includes(searchName.toLowerCase())
      );
    }
    if (searchType) {
      result = result.filter(item => item.type === searchType);
    }
    if (searchGroup) {
      result = result.filter(item =>
        item.groupName?.toLowerCase().includes(searchGroup.toLowerCase())
      );
    }

    result.sort((a, b) => {
      const aVal = parseFloat(a[sortField]) || 0;
      const bVal = parseFloat(b[sortField]) || 0;
      return sortOrder === 'ascend' ? aVal - bVal : bVal - aVal;
    });

    setFilteredData(result);
  };

  const formatCurrency = (value) => {
    if (!value && value !== 0) return '¥0';
    return `¥${Number(value).toLocaleString()}`;
  };

  const getGroupList = () => {
    const groups = [...new Set(data.map(item => item.groupName).filter(Boolean))];
    return groups;
  };

  const getTypeColor = (type) => {
    return TYPE_COLOR_MAP[type] || '#8c8c8c';
  };

  const handleViewDetail = async (record) => {
    setSelectedRepertoire(record);
    setModalVisible(true);
    const mockHistory = generateMockHistory(record);
    setPerformanceHistory(mockHistory);
  };

  const generateMockHistory = (record) => {
    const theaters = ['大剧场', '小剧场', '实验剧场', '音乐厅'];
    const count = Math.min(record.showCount || 10, 20);
    return Array.from({ length: count }, (_, i) => {
      const date = new Date();
      date.setDate(date.getDate() - (i + 1) * Math.floor(Math.random() * 30 + 7));
      const totalSeats = Math.floor(Math.random() * 500) + 300;
      const soldSeats = Math.floor(totalSeats * (0.4 + Math.random() * 0.5));
      return {
        id: i + 1,
        date: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')} ${String(Math.floor(Math.random() * 12) + 10).padStart(2, '0')}:${['00', '30'][Math.floor(Math.random() * 2)]}`,
        theater: theaters[Math.floor(Math.random() * theaters.length)],
        totalSeats,
        soldSeats,
        occupancy: totalSeats > 0 ? Math.round((soldSeats / totalSeats) * 100) : 0,
        revenue: soldSeats * (Math.floor(Math.random() * 300) + 100),
      };
    }).sort((a, b) => new Date(b.date) - new Date(a.date));
  };

  const handleSearch = () => {
    filterAndSortData();
  };

  const handleReset = () => {
    setSearchName('');
    setSearchType(null);
    setSearchGroup('');
    setSortField('totalRevenue');
    setSortOrder('descend');
  };

  const handleSortChange = (value) => {
    setSortField(value);
  };

  const handleTableChange = (pagination, filters, sorter) => {
    if (sorter.field && sorter.order) {
      setSortField(sorter.field);
      setSortOrder(sorter.order);
    }
  };

  const summaryStats = {
    totalRepertoires: data.length,
    totalShows: data.reduce((sum, item) => sum + (item.showCount || 0), 0),
    totalAudience: data.reduce((sum, item) => sum + (item.totalAudience || 0), 0),
    totalRevenue: data.reduce((sum, item) => sum + (item.totalRevenue || 0), 0),
  };

  const statsCards = [
    {
      title: '剧目总数',
      value: summaryStats.totalRepertoires,
      icon: <FileTextOutlined style={{ fontSize: 32, color: '#1890ff' }} />,
      color: 'rgba(24, 144, 255, 0.1)',
    },
    {
      title: '总演出场次',
      value: summaryStats.totalShows.toLocaleString(),
      icon: <PlayCircleOutlined style={{ fontSize: 32, color: '#52c41a' }} />,
      color: 'rgba(82, 196, 26, 0.1)',
    },
    {
      title: '累计观众',
      value: summaryStats.totalAudience.toLocaleString(),
      icon: <TeamOutlined style={{ fontSize: 32, color: '#faad14' }} />,
      color: 'rgba(250, 173, 20, 0.1)',
    },
    {
      title: '累计票房',
      value: formatCurrency(summaryStats.totalRevenue),
      icon: <DollarOutlined style={{ fontSize: 32, color: '#722ed1' }} />,
      color: 'rgba(114, 46, 209, 0.1)',
    },
  ];

  const columns = [
    {
      title: '剧目名称',
      dataIndex: 'name',
      key: 'name',
      render: (text, record) => (
        <Button
          type="link"
          icon={<EyeOutlined />}
          onClick={() => handleViewDetail(record)}
          style={{ padding: 0 }}
        >
          {text}
        </Button>
      ),
    },
    {
      title: '剧目类型',
      dataIndex: 'type',
      key: 'type',
      width: 110,
      render: (type) => (
        <Tag color={getTypeColor(type)}>{type || '-'}</Tag>
      ),
    },
    {
      title: '演出团体',
      dataIndex: 'groupName',
      key: 'groupName',
      width: 160,
      ellipsis: true,
      render: (text) => text || '-',
    },
    {
      title: '演出次数',
      dataIndex: 'showCount',
      key: 'showCount',
      width: 100,
      align: 'right',
      sorter: true,
      sortOrder: sortField === 'showCount' ? sortOrder : null,
      render: (value) => <strong>{value || 0}</strong>,
    },
    {
      title: '累计观众数',
      dataIndex: 'totalAudience',
      key: 'totalAudience',
      width: 120,
      align: 'right',
      render: (value) => (value || 0).toLocaleString(),
    },
    {
      title: '平均上座率',
      dataIndex: 'avgOccupancy',
      key: 'avgOccupancy',
      width: 180,
      sorter: true,
      sortOrder: sortField === 'avgOccupancy' ? sortOrder : null,
      render: (value) => {
        const rate = parseFloat(value) || 0;
        return (
          <Progress
            percent={rate}
            size="small"
            strokeColor={rate >= 80 ? '#52c41a' : rate >= 50 ? '#faad14' : '#f5222d'}
            format={(percent) => `${percent.toFixed(1)}%`}
          />
        );
      },
    },
    {
      title: '累计票房收入',
      dataIndex: 'totalRevenue',
      key: 'totalRevenue',
      width: 140,
      align: 'right',
      sorter: true,
      sortOrder: sortField === 'totalRevenue' ? sortOrder : null,
      render: (value) => (
        <span style={{ fontWeight: 600, color: '#52c41a' }}>{formatCurrency(value)}</span>
      ),
    },
  ];

  if (loading && !data.length) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: 400 }}>
        <Spin size="large" />
      </div>
    );
  }

  return (
    <div>
      <Title level={3} style={{ marginBottom: 24 }}>
        剧目库
      </Title>

      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        {statsCards.map((card, index) => (
          <Col xs={24} sm={12} lg={6} key={index}>
            <Card bordered={false} style={{ borderRadius: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontSize: 14, color: '#8c8c8c', marginBottom: 4 }}>{card.title}</div>
                  <div style={{ fontSize: 28, fontWeight: 600 }}>{card.value}</div>
                </div>
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

      <Card bordered={false} style={{ borderRadius: 8, marginBottom: 24 }}>
        <Row gutter={[16, 16]} align="middle">
          <Col xs={24} sm={12} md={6}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ whiteSpace: 'nowrap' }}>剧目名称：</span>
              <Input
                placeholder="请输入剧目名称"
                value={searchName}
                onChange={(e) => setSearchName(e.target.value)}
                onPressEnter={handleSearch}
                allowClear
              />
            </div>
          </Col>
          <Col xs={24} sm={12} md={6}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ whiteSpace: 'nowrap' }}>剧目类型：</span>
              <Select
                style={{ width: '100%' }}
                placeholder="请选择剧目类型"
                allowClear
                value={searchType}
                onChange={setSearchType}
              >
                {TYPE_OPTIONS.map((type) => (
                  <Option key={type} value={type}>
                    {type}
                  </Option>
                ))}
              </Select>
            </div>
          </Col>
          <Col xs={24} sm={12} md={6}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ whiteSpace: 'nowrap' }}>演出团体：</span>
              <Select
                style={{ width: '100%' }}
                placeholder="请选择演出团体"
                allowClear
                showSearch
                value={searchGroup || undefined}
                onChange={setSearchGroup}
                filterOption={(input, option) =>
                  option.children.toLowerCase().includes(input.toLowerCase())
                }
              >
                {getGroupList().map((group) => (
                  <Option key={group} value={group}>
                    {group}
                  </Option>
                ))}
              </Select>
            </div>
          </Col>
          <Col xs={24} sm={12} md={6}>
            <Space>
              <Button
                type="primary"
                icon={<SearchOutlined />}
                onClick={handleSearch}
              >
                查询
              </Button>
              <Button onClick={handleReset}>重置</Button>
            </Space>
          </Col>
        </Row>
      </Card>

      <Card
        bordered={false}
        style={{ borderRadius: 8 }}
        extra={
          <Space>
            <SortAscendingOutlined style={{ color: '#8c8c8c' }} />
            <span style={{ color: '#8c8c8c', fontSize: 13 }}>排序：</span>
            <Select
              size="small"
              style={{ width: 120 }}
              value={sortField}
              onChange={handleSortChange}
            >
              {SORT_OPTIONS.map((opt) => (
                <Option key={opt.value} value={opt.value}>
                  {opt.label}
                </Option>
              ))}
            </Select>
            <Button
              size="small"
              type={sortOrder === 'descend' ? 'primary' : 'default'}
              onClick={() => setSortOrder(sortOrder === 'descend' ? 'ascend' : 'descend')}
            >
              {sortOrder === 'descend' ? '降序' : '升序'}
            </Button>
          </Space>
        }
      >
        {filteredData && filteredData.length > 0 ? (
          <Table
            rowKey="id"
            dataSource={filteredData}
            columns={columns}
            loading={loading}
            onChange={handleTableChange}
            pagination={{
              pageSize: 10,
              showSizeChanger: true,
              showQuickJumper: true,
              showTotal: (total) => `共 ${total} 条记录`,
            }}
          />
        ) : (
          <Empty description="暂无剧目数据" />
        )}
      </Card>

      <Modal
        title={
          <Space>
            <span style={{ fontWeight: 600, fontSize: 16 }}>{selectedRepertoire?.name}</span>
            <Tag color={getTypeColor(selectedRepertoire?.type)}>{selectedRepertoire?.type}</Tag>
          </Space>
        }
        open={modalVisible}
        onCancel={() => setModalVisible(false)}
        footer={null}
        width={900}
      >
        {selectedRepertoire && (
          <div>
            <Descriptions
              bordered
              size="small"
              column={2}
              style={{ marginBottom: 16 }}
            >
              <Descriptions.Item label="演出团体">
                {selectedRepertoire.groupName || '-'}
              </Descriptions.Item>
              <Descriptions.Item label="剧目类型">
                {selectedRepertoire.type || '-'}
              </Descriptions.Item>
              <Descriptions.Item label="演出次数">
                <strong>{selectedRepertoire.showCount || 0}</strong> 场
              </Descriptions.Item>
              <Descriptions.Item label="累计观众">
                {(selectedRepertoire.totalAudience || 0).toLocaleString()} 人
              </Descriptions.Item>
              <Descriptions.Item label="平均上座率">
                <Tag color={parseFloat(selectedRepertoire.avgOccupancy) >= 80 ? 'success' : parseFloat(selectedRepertoire.avgOccupancy) >= 50 ? 'warning' : 'error'}>
                  {parseFloat(selectedRepertoire.avgOccupancy || 0).toFixed(1)}%
                </Tag>
              </Descriptions.Item>
              <Descriptions.Item label="累计票房">
                <span style={{ fontWeight: 600, color: '#52c41a' }}>
                  {formatCurrency(selectedRepertoire.totalRevenue)}
                </span>
              </Descriptions.Item>
            </Descriptions>

            <Title level={5} style={{ marginBottom: 12 }}>
              历史演出记录
            </Title>

            <List
              size="small"
              dataSource={performanceHistory}
              renderItem={(item) => (
                <List.Item
                  actions={[
                    <span key="occupancy">
                      上座率：
                      <Tag color={item.occupancy >= 80 ? 'success' : item.occupancy >= 50 ? 'warning' : 'error'}>
                        {item.occupancy}%
                      </Tag>
                    </span>,
                    <span key="revenue" style={{ color: '#52c41a', fontWeight: 600 }}>
                      {formatCurrency(item.revenue)}
                    </span>,
                  ]}
                >
                  <List.Item.Meta
                    title={item.date}
                    description={
                      <Space size="middle">
                        <span>剧场：{item.theater}</span>
                        <span>总座位：{item.totalSeats}</span>
                        <span>已售：{item.soldSeats}</span>
                      </Space>
                    }
                  />
                </List.Item>
              )}
              pagination={{
                pageSize: 5,
                size: 'small',
                showTotal: (total) => `共 ${total} 场演出`,
              }}
            />
          </div>
        )}
      </Modal>
    </div>
  );
};

export default Repertoire;
