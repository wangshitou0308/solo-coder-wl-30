import React, { useState, useEffect } from 'react';
import {
  Table,
  Card,
  Modal,
  Button,
  Select,
  DatePicker,
  Tag,
  Descriptions,
  Row,
  Col,
  Space,
  message,
  Form,
  InputNumber,
  Spin,
  Typography,
  Divider,
  Popconfirm,
  Progress,
  Empty,
  Input,
} from 'antd';
import {
  SearchOutlined,
  ReloadOutlined,
  EyeOutlined,
  FileTextOutlined,
  PrinterOutlined,
  PlusOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  DollarOutlined,
  TeamOutlined,
  RiseOutlined,
  ArrowUpOutlined,
  ArrowDownOutlined,
} from '@ant-design/icons';
import { statsAPI, showAPI, performanceAPI } from '../../services/api';
import dayjs from 'dayjs';

const { Title, Text } = Typography;
const { Option } = Select;
const { RangePicker } = DatePicker;
const { Search } = Input;

const SETTLEMENT_STATUS = {
  unsettled: { text: '未结算', color: 'default', icon: <ClockCircleOutlined /> },
  settled: { text: '已结算', color: 'success', icon: <CheckCircleOutlined /> },
};

const formatCurrency = (value) => {
  if (!value && value !== 0) return '¥0.00';
  return `¥${Number(value).toLocaleString('zh-CN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
};

const Settlement = () => {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [creating, setCreating] = useState(false);

  const [settlements, setSettlements] = useState([]);
  const [shows, setShows] = useState([]);
  const [performances, setPerformances] = useState([]);

  const [detailModalVisible, setDetailModalVisible] = useState(false);
  const [createModalVisible, setCreateModalVisible] = useState(false);
  const [selectedSettlement, setSelectedSettlement] = useState(null);
  const [selectedShowId, setSelectedShowId] = useState(null);
  const [settlementDetail, setSettlementDetail] = useState(null);

  const [filters, setFilters] = useState({
    dateRange: null,
    performanceId: null,
    status: null,
    keyword: '',
  });

  const [pagination, setPagination] = useState({
    current: 1,
    pageSize: 10,
    total: 0,
  });

  useEffect(() => {
    fetchPerformances();
    fetchShows();
    fetchSettlements();
  }, []);

  const fetchPerformances = async () => {
    try {
      const res = await performanceAPI.list({ page: 1, pageSize: 100 });
      setPerformances(res.data?.list || res.data || []);
    } catch (err) {
      message.error('获取演出项目失败');
    }
  };

  const fetchShows = async () => {
    try {
      const res = await showAPI.list({ status: 'ended', page: 1, pageSize: 100 });
      setShows(res.data?.list || res.data || []);
    } catch (err) {
      message.error('获取演出场次失败');
    }
  };

  const fetchSettlements = async (page = 1, pageSize = 10) => {
    setLoading(true);
    try {
      const params = { page, pageSize };
      if (filters.dateRange && filters.dateRange.length === 2) {
        params.startDate = filters.dateRange[0].format('YYYY-MM-DD');
        params.endDate = filters.dateRange[1].format('YYYY-MM-DD');
      }
      if (filters.performanceId) {
        params.performanceId = filters.performanceId;
      }
      if (filters.status) {
        params.status = filters.status;
      }

      const res = await statsAPI.getSettlements(params);
      const data = res.data?.list || res.data || generateMockSettlements();
      const total = res.data?.total || data.length;

      const processedData = data.map((item) => ({
        ...item,
        key: item.id || item.showId,
        status: item.status || 'unsettled',
        netIncome: (item.totalBoxOffice || item.totalIncome || 0) - (item.refundAmount || 0),
        troupeShare:
          ((((item.totalBoxOffice || item.totalIncome || 0) - (item.refundAmount || 0)) *
            (item.shareRatio || 50)) /
            100),
        theaterShare:
          ((((item.totalBoxOffice || item.totalIncome || 0) - (item.refundAmount || 0)) *
            (100 - (item.shareRatio || 50))) /
            100),
        refundRate: item.totalTickets > 0
          ? ((item.refundCount || 0) / item.totalTickets * 100).toFixed(1)
          : 0,
      }));

      setSettlements(processedData);
      setPagination({
        current: page,
        pageSize,
        total,
      });
    } catch (err) {
      const mockData = generateMockSettlements();
      setSettlements(mockData);
      setPagination({
        current: page,
        pageSize,
        total: mockData.length,
      });
      message.warning('使用模拟数据展示');
    } finally {
      setLoading(false);
    }
  };

  const generateMockSettlements = () => {
    const performances = ['《雷雨》', '《茶馆》', '《猫》', '《天鹅湖》', '《梁祝》', '《花木兰》', '《茶花女》', '《费加罗的婚礼》'];
    const theaters = ['大剧场', '小剧场', '实验剧场', '音乐厅'];
    const troupes = ['国家话剧院', '北京人民艺术剧院', '上海话剧艺术中心', '中央芭蕾舞团'];
    const statuses = ['settled', 'unsettled', 'settled', 'settled', 'unsettled'];

    return Array.from({ length: 15 }, (_, i) => {
      const totalTickets = Math.floor(Math.random() * 500) + 300;
      const soldTickets = Math.floor(totalTickets * (Math.random() * 0.5 + 0.35));
      const refundCount = Math.floor(soldTickets * (Math.random() * 0.08 + 0.02));
      const actualSold = soldTickets - refundCount;
      const avgPrice = Math.floor(Math.random() * 300) + 150;
      const totalBoxOffice = actualSold * avgPrice;
      const refundAmount = refundCount * avgPrice * 0.9;
      const shareRatio = Math.floor(Math.random() * 20) + 40;
      const occupancy = totalTickets > 0 ? Math.round((actualSold / totalTickets) * 100) : 0;

      return {
        id: i + 1,
        showId: 1000 + i,
        showName: performances[i % performances.length],
        showTime: dayjs().subtract(i * 2 + 1, 'day').format('YYYY-MM-DD HH:mm'),
        theaterName: theaters[i % theaters.length],
        troupeName: troupes[i % troupes.length],
        totalTickets,
        soldTickets: actualSold,
        occupancy,
        totalBoxOffice,
        refundCount,
        refundAmount,
        refundRate: totalTickets > 0 ? ((refundCount / totalTickets) * 100).toFixed(1) : 0,
        shareRatio,
        status: statuses[i % statuses.length],
        settlementTime: statuses[i % statuses.length] === 'settled'
          ? dayjs().subtract(i, 'day').format('YYYY-MM-DD HH:mm:ss')
          : null,
        settlementNo: statuses[i % statuses.length] === 'settled'
          ? `JS${dayjs().format('YYYYMM')}${String(i + 1).padStart(4, '0')}`
          : null,
      };
    });
  };

  const handleSearch = () => {
    fetchSettlements(1, pagination.pageSize);
  };

  const handleReset = () => {
    setFilters({
      dateRange: null,
      performanceId: null,
      status: null,
      keyword: '',
    });
    form.resetFields();
    fetchSettlements(1, pagination.pageSize);
  };

  const handleTableChange = (pagination) => {
    fetchSettlements(pagination.current, pagination.pageSize);
  };

  const handleCreateSettlement = (showId) => {
    setSelectedShowId(showId);
    form.setFieldsValue({ shareRatio: 50 });
    setCreateModalVisible(true);
  };

  const handleConfirmCreate = async () => {
    try {
      const values = await form.validateFields();
      setCreating(true);
      await statsAPI.createSettlement(selectedShowId, {
        shareRatio: values.shareRatio,
      });
      message.success('结算报表创建成功');
      setCreateModalVisible(false);
      fetchSettlements(pagination.current, pagination.pageSize);
    } catch (err) {
      message.error(err.response?.data?.message || '创建结算失败');
    } finally {
      setCreating(false);
    }
  };

  const handleViewDetail = async (record) => {
    setSelectedSettlement(record);
    setDetailModalVisible(true);
    setDetailLoading(true);
    try {
      const res = await statsAPI.getSettlement(record.showId);
      const data = res.data?.data || res.data || generateMockDetail(record);
      setSettlementDetail(data);
    } catch (err) {
      setSettlementDetail(generateMockDetail(record));
      message.warning('使用模拟数据展示');
    } finally {
      setDetailLoading(false);
    }
  };

  const generateMockDetail = (record) => {
    const zones = [
      { zoneName: 'VIP区', price: 880, soldCount: 45, refundCount: 2, totalCount: 50 },
      { zoneName: 'A区', price: 580, soldCount: 120, refundCount: 8, totalCount: 150 },
      { zoneName: 'B区', price: 380, soldCount: 180, refundCount: 12, totalCount: 200 },
      { zoneName: 'C区', price: 180, soldCount: 95, refundCount: 5, totalCount: 120 },
    ];

    const zoneDetails = zones.map((z) => ({
      ...z,
      revenue: z.soldCount * z.price,
      refundRevenue: z.refundCount * z.price * 0.9,
    }));

    const totalTickets = zones.reduce((sum, z) => sum + z.totalCount, 0);
    const totalSold = zones.reduce((sum, z) => sum + z.soldCount, 0);
    const totalRefund = zones.reduce((sum, z) => sum + z.refundCount, 0);
    const totalBoxOffice = zones.reduce((sum, z) => sum + z.revenue, 0);
    const totalRefundAmount = zones.reduce((sum, z) => sum + z.refundRevenue, 0);
    const netIncome = totalBoxOffice - totalRefundAmount;
    const shareRatio = record?.shareRatio || 50;
    const occupancy = totalTickets > 0 ? Math.round((totalSold / totalTickets) * 100) : 0;

    const refundDetails = Array.from({ length: 10 }, (_, i) => ({
      id: i + 1,
      orderNo: `DD${dayjs().format('YYYYMMDD')}${String(1000 + i).padStart(4, '0')}`,
      seat: `${String.fromCharCode(65 + (i % 5))}区${Math.floor(i / 5) + 1}排${i + 1}座`,
      zoneName: ['VIP区', 'A区', 'B区', 'C区'][i % 4],
      refundAmount: Math.floor(Math.random() * 500) + 100,
      refundReason: ['个人原因', '时间冲突', '身体不适', '其他'][i % 4],
      operator: ['管理员', '售票员小王', '售票员小李'][i % 3],
      refundTime: dayjs().subtract(i, 'hour').format('YYYY-MM-DD HH:mm:ss'),
    }));

    return {
      ...record,
      totalTickets,
      soldTickets: totalSold,
      occupancy,
      totalBoxOffice,
      refundCount: totalRefund,
      refundAmount: totalRefundAmount,
      refundRate: totalTickets > 0 ? ((totalRefund / totalTickets) * 100).toFixed(1) : 0,
      netIncome,
      shareRatio,
      troupeShare: (netIncome * shareRatio) / 100,
      theaterShare: (netIncome * (100 - shareRatio)) / 100,
      zoneDetails,
      refundDetails,
    };
  };

  const handlePrint = () => {
    message.success('打印功能已触发');
    const printContent = document.getElementById('settlement-print-content');
    if (printContent) {
      const printWindow = window.open('', '_blank');
      printWindow.document.write(`
        <html>
          <head>
            <title>结算单 - ${selectedSettlement?.showName || '演出结算'}</title>
            <style>
              body { font-family: 'Microsoft YaHei', 'SimHei', sans-serif; padding: 30px; }
              .title { text-align: center; font-size: 24px; font-weight: bold; margin-bottom: 20px; }
              .subtitle { text-align: center; color: #666; margin-bottom: 30px; }
              .info-section { margin-bottom: 20px; }
              .info-title { font-size: 16px; font-weight: bold; margin-bottom: 10px; border-bottom: 2px solid #1890ff; padding-bottom: 5px; }
              table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
              th, td { border: 1px solid #ddd; padding: 10px; text-align: left; font-size: 14px; }
              th { background-color: #f5f5f5; font-weight: 600; }
              .total-row { font-weight: bold; background-color: #fafafa; }
              .amount { text-align: right; }
              .positive { color: #52c41a; }
              .negative { color: #f5222d; }
              .summary-grid { display: grid; grid-template-columns: 1fr 1fr 1fr 1fr; gap: 15px; margin-bottom: 20px; }
              .summary-item { text-align: center; padding: 15px; background: #f9f9f9; border-radius: 4px; }
              .summary-value { font-size: 20px; font-weight: bold; }
              .summary-label { color: #666; margin-bottom: 5px; font-size: 13px; }
              .footer { margin-top: 50px; display: flex; justify-content: space-between; }
              .sign-box { width: 200px; text-align: center; }
              .sign-line { border-bottom: 1px solid #000; height: 40px; }
            </style>
          </head>
          <body>
            ${printContent.innerHTML}
          </body>
        </html>
      `);
      printWindow.document.close();
      setTimeout(() => printWindow.print(), 500);
    }
  };

  const columns = [
    {
      title: '结算单号',
      dataIndex: 'settlementNo',
      key: 'settlementNo',
      width: 160,
      render: (v) => v || <Text type="secondary">-</Text>,
    },
    {
      title: '演出名称',
      dataIndex: 'showName',
      key: 'showName',
      render: (text) => <span style={{ fontWeight: 500 }}>{text}</span>,
    },
    {
      title: '场次时间',
      dataIndex: 'showTime',
      key: 'showTime',
      width: 160,
      render: (v) => v || '-',
    },
    {
      title: '剧场',
      dataIndex: 'theaterName',
      key: 'theaterName',
      width: 100,
    },
    {
      title: '演出团体',
      dataIndex: 'troupeName',
      key: 'troupeName',
      width: 160,
      render: (v) => v || '-',
    },
    {
      title: '总票房',
      dataIndex: 'totalBoxOffice',
      key: 'totalBoxOffice',
      width: 120,
      align: 'right',
      render: (v) => <span style={{ fontWeight: 500 }}>{formatCurrency(v)}</span>,
    },
    {
      title: '退票金额',
      dataIndex: 'refundAmount',
      key: 'refundAmount',
      width: 120,
      align: 'right',
      render: (v) => <Text type="danger">{formatCurrency(v)}</Text>,
    },
    {
      title: '净票房',
      dataIndex: 'netIncome',
      key: 'netIncome',
      width: 120,
      align: 'right',
      render: (v) => <Text strong style={{ color: '#52c41a' }}>{formatCurrency(v)}</Text>,
    },
    {
      title: '分账比例',
      dataIndex: 'shareRatio',
      key: 'shareRatio',
      width: 100,
      align: 'center',
      render: (v) => (
        <Tag color="blue">{v || 50}%</Tag>
      ),
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 100,
      render: (status) => {
        const cfg = SETTLEMENT_STATUS[status] || SETTLEMENT_STATUS.unsettled;
        return <Tag color={cfg.color}>{cfg.text}</Tag>;
      },
    },
    {
      title: '操作',
      key: 'action',
      width: 140,
      fixed: 'right',
      render: (_, record) => (
        <Space size="small">
          {record.status === 'unsettled' ? (
            <Button
              type="primary"
              size="small"
              icon={<PlusOutlined />}
              onClick={() => handleCreateSettlement(record.showId)}
            >
              生成结算
            </Button>
          ) : (
            <Button
              size="small"
              icon={<EyeOutlined />}
              onClick={() => handleViewDetail(record)}
            >
              查看详情
            </Button>
          )}
        </Space>
      ),
    },
  ];

  const zoneDetailColumns = [
    {
      title: '票区',
      dataIndex: 'zoneName',
      key: 'zoneName',
      width: 100,
    },
    {
      title: '票价',
      dataIndex: 'price',
      key: 'price',
      align: 'right',
      render: (v) => formatCurrency(v),
    },
    {
      title: '总座位',
      dataIndex: 'totalCount',
      key: 'totalCount',
      align: 'right',
    },
    {
      title: '已售票数',
      dataIndex: 'soldCount',
      key: 'soldCount',
      align: 'right',
      render: (v, record) => (
        <span>
          {v}
          <Text type="secondary" style={{ fontSize: 12, marginLeft: 4 }}>
            ({record.totalCount > 0 ? ((v / record.totalCount) * 100).toFixed(0) : 0}%)
          </Text>
        </span>
      ),
    },
    {
      title: '退票数',
      dataIndex: 'refundCount',
      key: 'refundCount',
      align: 'right',
      render: (v) => <Text type="danger">{v}</Text>,
    },
    {
      title: '实际售出',
      dataIndex: 'actualSold',
      key: 'actualSold',
      align: 'right',
      render: (_, record) => record.soldCount - record.refundCount,
    },
    {
      title: '票款收入',
      dataIndex: 'revenue',
      key: 'revenue',
      align: 'right',
      render: (v) => <span style={{ fontWeight: 500, color: '#52c41a' }}>{formatCurrency(v)}</span>,
    },
    {
      title: '退票金额',
      dataIndex: 'refundRevenue',
      key: 'refundRevenue',
      align: 'right',
      render: (v) => <Text type="danger">{formatCurrency(v)}</Text>,
    },
  ];

  const refundDetailColumns = [
    {
      title: '订单号',
      dataIndex: 'orderNo',
      key: 'orderNo',
      width: 160,
    },
    {
      title: '座位',
      dataIndex: 'seat',
      key: 'seat',
      width: 120,
    },
    {
      title: '票区',
      dataIndex: 'zoneName',
      key: 'zoneName',
      width: 80,
    },
    {
      title: '退票金额',
      dataIndex: 'refundAmount',
      key: 'refundAmount',
      align: 'right',
      render: (v) => <Text type="danger">{formatCurrency(v)}</Text>,
    },
    {
      title: '退票原因',
      dataIndex: 'refundReason',
      key: 'refundReason',
    },
    {
      title: '操作人',
      dataIndex: 'operator',
      key: 'operator',
      width: 100,
    },
    {
      title: '退票时间',
      dataIndex: 'refundTime',
      key: 'refundTime',
      width: 160,
    },
  ];

  const renderDetailContent = () => {
    if (!settlementDetail) return null;

    const statsItems = [
      {
        title: '总票数',
        value: settlementDetail.totalTickets,
        suffix: '张',
        icon: <TeamOutlined style={{ color: '#1890ff' }} />,
        color: 'rgba(24, 144, 255, 0.1)',
      },
      {
        title: '已售票数',
        value: settlementDetail.soldTickets,
        suffix: '张',
        icon: <CheckCircleOutlined style={{ color: '#52c41a' }} />,
        color: 'rgba(82, 196, 26, 0.1)',
      },
      {
        title: '上座率',
        value: `${settlementDetail.occupancy}%`,
        icon: <RiseOutlined style={{ color: '#faad14' }} />,
        color: 'rgba(250, 173, 20, 0.1)',
      },
      {
        title: '总票房',
        value: formatCurrency(settlementDetail.totalBoxOffice),
        icon: <DollarOutlined style={{ color: '#722ed1' }} />,
        color: 'rgba(114, 46, 209, 0.1)',
      },
    ];

    return (
      <div id="settlement-print-content">
        <div style={{ textAlign: 'center', marginBottom: 20 }}>
          <div style={{ fontSize: 20, fontWeight: 'bold', marginBottom: 4 }}>演出结算单</div>
          {settlementDetail.settlementNo && (
            <div style={{ color: '#8c8c8c', fontSize: 13 }}>
              结算单号：{settlementDetail.settlementNo}
            </div>
          )}
        </div>

        <Divider style={{ margin: '12px 0' }} />

        <Card title="演出信息" size="small" style={{ marginBottom: 16 }} bodyStyle={{ padding: 16 }}>
          <Descriptions column={2} size="small">
            <Descriptions.Item label="剧目名称">
              {settlementDetail.showName || selectedSettlement?.showName || '-'}
            </Descriptions.Item>
            <Descriptions.Item label="场次时间">
              {settlementDetail.showTime || selectedSettlement?.showTime || '-'}
            </Descriptions.Item>
            <Descriptions.Item label="演出剧场">
              {settlementDetail.theaterName || selectedSettlement?.theaterName || '-'}
            </Descriptions.Item>
            <Descriptions.Item label="演出团体">
              {settlementDetail.troupeName || selectedSettlement?.troupeName || '-'}
            </Descriptions.Item>
          </Descriptions>
        </Card>

        <Card title="票房统计" size="small" style={{ marginBottom: 16 }} bodyStyle={{ padding: 16 }}>
          <Row gutter={[12, 12]}>
            {statsItems.map((item, index) => (
              <Col xs={12} sm={12} md={6} key={index}>
                <div
                  style={{
                    padding: 12,
                    borderRadius: 6,
                    background: item.color,
                    textAlign: 'center',
                  }}
                >
                  <div style={{ color: '#8c8c8c', fontSize: 12, marginBottom: 4 }}>{item.title}</div>
                  <div style={{ fontSize: 20, fontWeight: 'bold' }}>
                    {item.value}
                    {item.suffix && <span style={{ fontSize: 12, marginLeft: 2 }}>{item.suffix}</span>}
                  </div>
                </div>
              </Col>
            ))}
          </Row>
        </Card>

        <Card title="票款明细" size="small" style={{ marginBottom: 16 }} bodyStyle={{ padding: '12px 16px' }}>
          <Table
            rowKey="zoneName"
            size="small"
            dataSource={settlementDetail.zoneDetails || []}
            columns={zoneDetailColumns}
            pagination={false}
            summary={(pageData) => {
              let totalCount = 0;
              let totalSold = 0;
              let totalRefund = 0;
              let totalRevenue = 0;
              let totalRefundRevenue = 0;
              pageData.forEach((item) => {
                totalCount += item.totalCount || 0;
                totalSold += item.soldCount || 0;
                totalRefund += item.refundCount || 0;
                totalRevenue += item.revenue || 0;
                totalRefundRevenue += item.refundRevenue || 0;
              });
              return (
                <Table.Summary.Row>
                  <Table.Summary.Cell index={0}>
                    <Text strong>合计</Text>
                  </Table.Summary.Cell>
                  <Table.Summary.Cell index={1} />
                  <Table.Summary.Cell index={2} align="right">
                    <Text strong>{totalCount}</Text>
                  </Table.Summary.Cell>
                  <Table.Summary.Cell index={3} align="right">
                    <Text strong>{totalSold}</Text>
                  </Table.Summary.Cell>
                  <Table.Summary.Cell index={4} align="right">
                    <Text strong type="danger">{totalRefund}</Text>
                  </Table.Summary.Cell>
                  <Table.Summary.Cell index={5} align="right">
                    <Text strong>{totalSold - totalRefund}</Text>
                  </Table.Summary.Cell>
                  <Table.Summary.Cell index={6} align="right">
                    <Text strong style={{ color: '#52c41a' }}>{formatCurrency(totalRevenue)}</Text>
                  </Table.Summary.Cell>
                  <Table.Summary.Cell index={7} align="right">
                    <Text strong type="danger">{formatCurrency(totalRefundRevenue)}</Text>
                  </Table.Summary.Cell>
                </Table.Summary.Row>
              );
            }}
          />
        </Card>

        <Card
          title={
            <span>
              退票明细
              <Tag color="red" style={{ marginLeft: 8 }}>
                {settlementDetail.refundCount} 张
              </Tag>
              <Tag color="default" style={{ marginLeft: 4 }}>
                退票率 {settlementDetail.refundRate}%
              </Tag>
            </span>
          }
          size="small"
          style={{ marginBottom: 16 }}
          bodyStyle={{ padding: '12px 16px' }}
        >
          <Table
            rowKey="id"
            size="small"
            dataSource={settlementDetail.refundDetails || []}
            columns={refundDetailColumns}
            pagination={false}
            scroll={{ y: 200 }}
          />
        </Card>

        <Card title="分账结算" size="small" bodyStyle={{ padding: 16 }}>
          <Row gutter={[16, 16]}>
            <Col xs={24} sm={8}>
              <div style={{ textAlign: 'center', padding: 16, background: '#f5f5f5', borderRadius: 6 }}>
                <div style={{ color: '#8c8c8c', marginBottom: 6 }}>总票房</div>
                <div style={{ fontSize: 20, fontWeight: 'bold', color: '#1890ff' }}>
                  {formatCurrency(settlementDetail.totalBoxOffice)}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#faad14', marginTop: 4 }}>
                  <ArrowDownOutlined style={{ marginRight: 4 }} />
                  <span style={{ fontSize: 12 }}>扣除退票</span>
                </div>
              </div>
            </Col>
            <Col xs={24} sm={8}>
              <div style={{ textAlign: 'center', padding: 16, background: '#fff7e6', borderRadius: 6 }}>
                <div style={{ color: '#8c8c8c', marginBottom: 6 }}>退票金额</div>
                <div style={{ fontSize: 20, fontWeight: 'bold', color: '#f5222d' }}>
                  {formatCurrency(settlementDetail.refundAmount)}
                </div>
                <div style={{ fontSize: 12, color: '#8c8c8c', marginTop: 4 }}>
                  退票率 {settlementDetail.refundRate}%
                </div>
              </div>
            </Col>
            <Col xs={24} sm={8}>
              <div style={{ textAlign: 'center', padding: 16, background: '#f6ffed', borderRadius: 6 }}>
                <div style={{ color: '#8c8c8c', marginBottom: 6 }}>净票房收入</div>
                <div style={{ fontSize: 20, fontWeight: 'bold', color: '#52c41a' }}>
                  {formatCurrency(settlementDetail.netIncome)}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#52c41a', marginTop: 4 }}>
                  <ArrowUpOutlined style={{ marginRight: 4 }} />
                  <span style={{ fontSize: 12 }}>按此分账</span>
                </div>
              </div>
            </Col>
          </Row>

          <Divider style={{ margin: '16px 0' }} />

          <Row gutter={[16, 16]}>
            <Col xs={24} sm={12}>
              <div style={{ textAlign: 'center', padding: 20, border: '2px solid #1890ff', borderRadius: 8 }}>
                <div style={{ color: '#8c8c8c', marginBottom: 8 }}>
                  演出团体分账
                  <Tag color="blue" style={{ marginLeft: 6 }}>
                    {settlementDetail.shareRatio}%
                  </Tag>
                </div>
                <div style={{ fontSize: 28, fontWeight: 'bold', color: '#1890ff' }}>
                  {formatCurrency(settlementDetail.troupeShare)}
                </div>
                <div style={{ fontSize: 12, color: '#8c8c8c', marginTop: 6 }}>应付演出费</div>
              </div>
            </Col>
            <Col xs={24} sm={12}>
              <div style={{ textAlign: 'center', padding: 20, border: '2px solid #52c41a', borderRadius: 8 }}>
                <div style={{ color: '#8c8c8c', marginBottom: 8 }}>
                  剧院分账
                  <Tag color="green" style={{ marginLeft: 6 }}>
                    {100 - settlementDetail.shareRatio}%
                  </Tag>
                </div>
                <div style={{ fontSize: 28, fontWeight: 'bold', color: '#52c41a' }}>
                  {formatCurrency(settlementDetail.theaterShare)}
                </div>
                <div style={{ fontSize: 12, color: '#8c8c8c', marginTop: 6 }}>剧院收入</div>
              </div>
            </Col>
          </Row>
        </Card>
      </div>
    );
  };

  return (
    <div>
      <div
        style={{
          marginBottom: 16,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <Title level={3} style={{ margin: 0 }}>
          <FileTextOutlined style={{ marginRight: 8 }} />
          结算报表
        </Title>
        <Button icon={<ReloadOutlined />} onClick={() => fetchSettlements(pagination.current, pagination.pageSize)}>
          刷新
        </Button>
      </div>

      <Card style={{ marginBottom: 16 }}>
        <Row gutter={[16, 16]} align="middle">
          <Col xs={24} sm={12} md={6}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ whiteSpace: 'nowrap' }}>日期范围：</span>
              <RangePicker
                style={{ flex: 1 }}
                value={filters.dateRange}
                onChange={(value) => setFilters({ ...filters, dateRange: value })}
                format="YYYY-MM-DD"
              />
            </div>
          </Col>
          <Col xs={24} sm={12} md={5}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ whiteSpace: 'nowrap' }}>演出项目：</span>
              <Select
                placeholder="请选择"
                allowClear
                style={{ flex: 1 }}
                value={filters.performanceId}
                onChange={(value) => setFilters({ ...filters, performanceId: value })}
              >
                {performances.map((p) => (
                  <Option key={p.id} value={p.id}>
                    {p.name}
                  </Option>
                ))}
              </Select>
            </div>
          </Col>
          <Col xs={24} sm={12} md={4}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ whiteSpace: 'nowrap' }}>结算状态：</span>
              <Select
                placeholder="请选择"
                allowClear
                style={{ flex: 1 }}
                value={filters.status}
                onChange={(value) => setFilters({ ...filters, status: value })}
              >
                {Object.entries(SETTLEMENT_STATUS).map(([value, cfg]) => (
                  <Option key={value} value={value}>
                    {cfg.text}
                  </Option>
                ))}
              </Select>
            </div>
          </Col>
          <Col xs={24} sm={12} md={5}>
            <Search
              placeholder="搜索演出名称"
              allowClear
              value={filters.keyword}
              onChange={(e) => setFilters({ ...filters, keyword: e.target.value })}
              onSearch={handleSearch}
              style={{ width: '100%' }}
            />
          </Col>
          <Col xs={24} sm={24} md={4}>
            <Space>
              <Button type="primary" icon={<SearchOutlined />} onClick={handleSearch}>
                查询
              </Button>
              <Button onClick={handleReset}>重置</Button>
            </Space>
          </Col>
        </Row>
      </Card>

      <Card>
        <Table
          rowKey="id"
          loading={loading}
          dataSource={settlements}
          columns={columns}
          scroll={{ x: 1200 }}
          pagination={{
            ...pagination,
            showSizeChanger: true,
            showQuickJumper: true,
            showTotal: (total) => `共 ${total} 条记录`,
          }}
          onChange={handleTableChange}
        />
      </Card>

      <Modal
        title="生成结算报表"
        open={createModalVisible}
        onOk={handleConfirmCreate}
        onCancel={() => setCreateModalVisible(false)}
        confirmLoading={creating}
        width={480}
        okText="确认生成"
        cancelText="取消"
      >
        <Form form={form} layout="vertical">
          <Form.Item
            name="shareRatio"
            label="演出团体分账比例"
            rules={[
              { required: true, message: '请输入分账比例' },
              {
                type: 'number',
                min: 0,
                max: 100,
                message: '分账比例应在0-100之间',
              },
            ]}
          >
            <InputNumber
              min={0}
              max={100}
              style={{ width: '100%' }}
              placeholder="请输入分账比例"
              addonAfter="%"
              precision={2}
            />
          </Form.Item>
          <div
            style={{
              padding: 16,
              background: '#f5f5f5',
              borderRadius: 6,
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <div>
              <span style={{ color: '#8c8c8c' }}>剧院分账比例：</span>
              <Text strong style={{ color: '#52c41a', fontSize: 16 }}>
                {100 - (form.getFieldValue('shareRatio') || 50)}%
              </Text>
            </div>
            <Text type="secondary" style={{ fontSize: 12 }}>
              按净票房收入分账
            </Text>
          </div>
        </Form>
      </Modal>

      <Modal
        title={
          <Space>
            <EyeOutlined />
            <span>结算明细</span>
            {settlementDetail && (
              <Tag color={SETTLEMENT_STATUS[settlementDetail.status]?.color || 'default'}>
                {SETTLEMENT_STATUS[settlementDetail.status]?.text || settlementDetail.status}
              </Tag>
            )}
          </Space>
        }
        open={detailModalVisible}
        onCancel={() => setDetailModalVisible(false)}
        width={960}
        footer={[
          <Button key="print" icon={<PrinterOutlined />} onClick={handlePrint}>
            打印结算单
          </Button>,
          <Button key="close" onClick={() => setDetailModalVisible(false)}>
            关闭
          </Button>,
        ]}
      >
        {detailLoading ? (
          <div
            style={{
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
              height: 400,
            }}
          >
            <Spin size="large" />
          </div>
        ) : settlementDetail ? (
          renderDetailContent()
        ) : (
          <Empty description="暂无数据" style={{ padding: '60px 0' }} />
        )}
      </Modal>
    </div>
  );
};

export default Settlement;
