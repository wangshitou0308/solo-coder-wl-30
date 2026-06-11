import React, { useState, useEffect } from 'react';
import {
  Card,
  Table,
  Button,
  Tag,
  Input,
  Select,
  Space,
  Row,
  Col,
  Statistic,
  DatePicker,
  message,
} from 'antd';
import {
  ShoppingCartOutlined,
  SearchOutlined,
  ReloadOutlined,
  ArrowRightOutlined,
  CalendarOutlined,
  UserOutlined,
  TeamOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import dayjs from 'dayjs';
import { showAPI } from '../../services/api';

const { RangePicker } = DatePicker;
const { Option } = Select;

const statusMap = {
  draft: { text: '待上架', color: 'default' },
  onsale: { text: '售票中', color: 'green' },
  soldout: { text: '售罄', color: 'orange' },
  cancelled: { text: '已取消', color: 'red' },
  ended: { text: '已结束', color: 'purple' },
};

const SalesList = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [showList, setShowList] = useState([]);
  const [searchName, setSearchName] = useState('');
  const [searchStatus, setSearchStatus] = useState('onsale');
  const [dateRange, setDateRange] = useState(null);

  const loadData = async () => {
    setLoading(true);
    try {
      const params = {};
      if (searchStatus) params.status = searchStatus;
      const res = await showAPI.list(params);
      let list = res.data.shows || res.data.list || res.data || [];

      if (searchName) {
        list = list.filter(
          (s) =>
            (s.performanceName || '').includes(searchName) ||
            (s.theaterName || '').includes(searchName)
        );
      }

      if (dateRange && dateRange.length === 2) {
        const start = dateRange[0].startOf('day');
        const end = dateRange[1].endOf('day');
        list = list.filter((s) => {
          if (!s.showDate) return false;
          const d = dayjs(s.showDate);
          return d.isAfter(start.subtract(1, 'day')) && d.isBefore(end.add(1, 'day'));
        });
      }

      setShowList(list);
    } catch (err) {
      message.error(err.response?.data?.message || '加载场次失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [searchStatus]);

  const onSaleCount = showList.filter((s) => s.status === 'onsale').length;
  const soldOutCount = showList.filter((s) => s.status === 'soldout').length;
  const totalSeats = showList.reduce((sum, s) => sum + (s.totalSeats || 0), 0);
  const soldSeats = showList.reduce((sum, s) => sum + (s.soldSeats || 0), 0);

  const columns = [
    {
      title: '演出剧目',
      dataIndex: 'performanceName',
      key: 'performanceName',
      render: (text, record) => (
        <Space direction="vertical" size={0}>
          <span style={{ fontWeight: 500 }}>{text || '-'}</span>
          <span style={{ fontSize: 12, color: '#8c8c8c' }}>
            <CalendarOutlined /> {record.theaterName || '-'}
          </span>
        </Space>
      ),
    },
    {
      title: '演出时间',
      key: 'showTime',
      width: 200,
      render: (_, record) => (
        <Space direction="vertical" size={0}>
          <span>{record.showDate ? dayjs(record.showDate).format('YYYY-MM-DD') : '-'}</span>
          <span style={{ fontSize: 12, color: '#8c8c8c' }}>
            {record.startTime || '-'} ~ {record.endTime || '-'}
          </span>
        </Space>
      ),
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 100,
      render: (status) => {
        const info = statusMap[status] || { text: status, color: 'default' };
        return <Tag color={info.color}>{info.text}</Tag>;
      },
    },
    {
      title: '售票进度',
      key: 'progress',
      width: 200,
      render: (_, record) => {
        const total = record.totalSeats || 0;
        const sold = record.soldSeats || 0;
        const percent = total > 0 ? Math.round((sold / total) * 100) : 0;
        return (
          <Space direction="vertical" size={2} style={{ width: '100%' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 12, color: '#8c8c8c' }}>
                <TeamOutlined /> {sold}/{total}
              </span>
              <span style={{ fontSize: 12, fontWeight: 500 }}>{percent}%</span>
            </div>
            <div
              style={{
                width: '100%',
                height: 6,
                background: '#f0f0f0',
                borderRadius: 3,
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  width: `${percent}%`,
                  height: '100%',
                  background: percent >= 100 ? '#f5222d' : percent >= 80 ? '#fa8c16' : '#52c41a',
                  transition: 'width 0.3s',
                }}
              />
            </div>
          </Space>
        );
      },
    },
    {
      title: '操作',
      key: 'action',
      width: 140,
      render: (_, record) => (
        <Space>
          <Button
            type="primary"
            size="small"
            icon={<ShoppingCartOutlined />}
            disabled={record.status !== 'onsale' && record.status !== 'soldout'}
            onClick={() => navigate(`/shows/${record.id}/sales`)}
          >
            售票
          </Button>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <h2 style={{ marginBottom: 24 }}>售票管理</h2>

      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={24} sm={12} lg={6}>
          <Card className="dashboard-card">
            <Statistic
              title="售票中场次"
              value={onSaleCount}
              valueStyle={{ color: '#52c41a' }}
              prefix={<ShoppingCartOutlined />}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card className="dashboard-card">
            <Statistic
              title="售罄场次"
              value={soldOutCount}
              valueStyle={{ color: '#fa8c16' }}
              prefix={<UserOutlined />}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card className="dashboard-card">
            <Statistic
              title="总座位数"
              value={totalSeats}
              prefix={<TeamOutlined />}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card className="dashboard-card">
            <Statistic
              title="已售票数"
              value={soldSeats}
              valueStyle={{ color: '#1890ff' }}
              suffix={totalSeats > 0 ? `/ ${totalSeats}` : ''}
            />
          </Card>
        </Col>
      </Row>

      <Card
        extra={
          <Button icon={<ReloadOutlined />} onClick={loadData}>
            刷新
          </Button>
        }
      >
        <Space style={{ marginBottom: 16 }} wrap>
          <Input
            placeholder="搜索剧目/剧场"
            prefix={<SearchOutlined />}
            value={searchName}
            onChange={(e) => setSearchName(e.target.value)}
            style={{ width: 220 }}
            allowClear
          />
          <Select
            placeholder="场次状态"
            value={searchStatus}
            onChange={setSearchStatus}
            style={{ width: 150 }}
            allowClear
          >
            <Option value="draft">待上架</Option>
            <Option value="onsale">售票中</Option>
            <Option value="soldout">售罄</Option>
            <Option value="ended">已结束</Option>
            <Option value="cancelled">已取消</Option>
          </Select>
          <RangePicker
            value={dateRange}
            onChange={setDateRange}
            placeholder={['开始日期', '结束日期']}
          />
          <Button type="primary" icon={<SearchOutlined />} onClick={loadData}>
            查询
          </Button>
        </Space>

        <Table
          columns={columns}
          dataSource={showList}
          rowKey="id"
          loading={loading}
          pagination={{ pageSize: 10, showSizeChanger: true }}
        />
      </Card>

      <Card style={{ marginTop: 16 }}>
        <div style={{ textAlign: 'center', color: '#8c8c8c', padding: '8px 0' }}>
          <ArrowRightOutlined /> 点击「售票」按钮进入选座购票界面，
          支持选座购票、团体票、电话预留、线下窗口售票等多种售票方式
        </div>
      </Card>
    </div>
  );
};

export default SalesList;
