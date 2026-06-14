import React, { useState, useEffect } from 'react';
import {
  Card,
  Table,
  Input,
  Select,
  Button,
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
  Form,
  DatePicker,
  Tabs,
  Drawer,
  List,
  Progress,
  Popconfirm,
  InputNumber,
  Divider,
  Tooltip,
} from 'antd';
import {
  SearchOutlined,
  DollarOutlined,
  FileTextOutlined,
  CheckCircleOutlined,
  PayCircleOutlined,
  CloseCircleOutlined,
  PlusOutlined,
  EyeOutlined,
  DownloadOutlined,
  ReloadOutlined,
  HistoryOutlined,
  TeamOutlined,
  CalendarOutlined,
  ExclamationCircleOutlined,
} from '@ant-design/icons';
import { settlementAPI, showAPI, exportAPI } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import dayjs from 'dayjs';

const { Title } = Typography;
const { Option } = Select;
const { RangePicker } = DatePicker;
const { TabPane } = Tabs;

const STATUS_MAP = {
  pending_generated: { text: '待生成', color: 'default' },
  pending_confirm: { text: '待确认', color: 'orange' },
  confirmed: { text: '已确认', color: 'blue' },
  paid: { text: '已支付', color: 'green' },
  void: { text: '已作废', color: 'red' },
};

const MODE_MAP = {
  ratio: { text: '比例分成', color: 'blue' },
  fixed: { text: '固定费用', color: 'purple' },
  guaranteed: { text: '保底+分成', color: 'cyan' },
  tiered: { text: '阶梯分成', color: 'geekblue' },
};

const formatCurrency = (value) => {
  if (value === null || value === undefined || isNaN(value)) return '¥0';
  return `¥${Number(value).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

const downloadBlob = (blob, filename) => {
  const url = window.URL.createObjectURL(new Blob([blob]));
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  link.parentNode.removeChild(link);
  window.URL.revokeObjectURL(url);
};

const SettlementManage = () => {
  const { hasRole, user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [data, setData] = useState([]);
  const [summary, setSummary] = useState({
    totalCount: 0, pendingConfirm: 0, confirmed: 0, paid: 0, totalPaidAmount: 0,
  });
  const [activeTab, setActiveTab] = useState('all');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [total, setTotal] = useState(0);

  const [searchKeyword, setSearchKeyword] = useState('');
  const [searchStatus, setSearchStatus] = useState('');
  const [searchMode, setSearchMode] = useState('');
  const [searchDateRange, setSearchDateRange] = useState(null);

  const [generateModalVisible, setGenerateModalVisible] = useState(false);
  const [detailDrawerVisible, setDetailDrawerVisible] = useState(false);
  const [voidModalVisible, setVoidModalVisible] = useState(false);
  const [currentSettlement, setCurrentSettlement] = useState(null);
  const [currentShow, setCurrentShow] = useState(null);
  const [showList, setShowList] = useState([]);
  const [previewData, setPreviewData] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [generateForm] = Form.useForm();
  const [voidForm] = Form.useForm();
  const [generating, setGenerating] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  const canConfirm = hasRole('manager', 'finance');
  const canPay = hasRole('finance');
  const canVoid = hasRole('manager', 'finance');
  const canGenerate = hasRole('manager', 'finance');

  useEffect(() => {
    fetchSummary();
  }, []);

  useEffect(() => {
    fetchData();
  }, [activeTab, page, pageSize, searchKeyword, searchStatus, searchMode, searchDateRange]);

  useEffect(() => {
    if (generateModalVisible) {
      fetchShowList();
    }
  }, [generateModalVisible]);

  const fetchSummary = async () => {
    setSummaryLoading(true);
    try {
      const res = await settlementAPI.summary();
      setSummary(res.data?.summary || res.data || summary);
    } catch (err) {
      console.warn('获取结算汇总失败', err);
    } finally {
      setSummaryLoading(false);
    }
  };

  const fetchData = async () => {
    setLoading(true);
    try {
      const params = { page, pageSize };
      if (activeTab !== 'all') params.status = activeTab;
      if (searchStatus) params.status = searchStatus;
      if (searchMode) params.settlementMode = searchMode;
      if (searchKeyword) params.keyword = searchKeyword;
      if (searchDateRange && searchDateRange.length === 2) {
        params.startDate = searchDateRange[0].format('YYYY-MM-DD');
        params.endDate = searchDateRange[1].format('YYYY-MM-DD');
      }
      const res = await settlementAPI.list(params);
      setData(res.data?.settlements || res.data?.data || []);
      setTotal(res.data?.total || 0);
    } catch (err) {
      message.error(err.response?.data?.message || '获取结算列表失败');
    } finally {
      setLoading(false);
    }
  };

  const fetchShowList = async () => {
    try {
      const res = await showAPI.list({ status: 'ended', pageSize: 200 });
      const shows = res.data?.shows || res.data?.data || [];
      setShowList(shows);
    } catch (err) {
      message.error('获取场次列表失败');
    }
  };

  const handleSearch = () => {
    setPage(1);
    fetchData();
  };

  const handleReset = () => {
    setSearchKeyword('');
    setSearchStatus('');
    setSearchMode('');
    setSearchDateRange(null);
    setPage(1);
  };

  const handleTabChange = (key) => {
    setActiveTab(key);
    setPage(1);
  };

  const handleGenerateClick = () => {
    generateForm.resetFields();
    generateForm.setFieldsValue({ settlementMode: 'ratio', ratio: 50 });
    setPreviewData(null);
    setCurrentShow(null);
    setGenerateModalVisible(true);
  };

  const handleShowChange = async (showId) => {
    const show = showList.find(s => s.id === showId);
    setCurrentShow(show);
    setPreviewData(null);
  };

  const handleModeChange = () => {
    setPreviewData(null);
  };

  const handlePreview = async () => {
    try {
      const values = await generateForm.validateFields(['showId', 'settlementMode']);
      const mode = values.settlementMode;
      const allValues = generateForm.getFieldsValue();
      const params = { settlement_mode: mode };

      if (mode === 'ratio') {
        if (!allValues.ratio) throw { errorFields: [{ name: ['ratio'], errors: ['请输入分成比例'] }] };
        params.ratio = allValues.ratio;
      } else if (mode === 'fixed') {
        if (!allValues.fixedAmount) throw { errorFields: [{ name: ['fixedAmount'], errors: ['请输入固定费用金额'] }] };
        params.fixed_amount = allValues.fixedAmount;
      } else if (mode === 'guaranteed') {
        if (!allValues.guaranteedAmount) throw { errorFields: [{ name: ['guaranteedAmount'], errors: ['请输入保底金额'] }] };
        if (!allValues.guaranteedRatio) throw { errorFields: [{ name: ['guaranteedRatio'], errors: ['请输入超出保底后分成比例'] }] };
        params.guaranteed_amount = allValues.guaranteedAmount;
        params.guaranteed_ratio = allValues.guaranteedRatio;
      } else if (mode === 'tiered') {
        const tiers = allValues.tiers || [];
        if (!tiers.length) throw { errorFields: [{ name: ['tiers'], errors: ['请至少添加一个阶梯'] }] };
        params.tiered_config = JSON.stringify(tiers);
      }

      setPreviewLoading(true);
      const res = await settlementAPI.preview(values.showId, params);
      setPreviewData(res.data || null);
      message.success('预览成功');
    } catch (err) {
      if (err.errorFields) return;
      message.error(err.response?.data?.message || '预览失败');
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleGenerateSubmit = async (forceRegenerate = false) => {
    try {
      const values = await generateForm.validateFields();
      const mode = values.settlementMode;
      const payload = { show_id: values.showId, settlement_mode: mode, force_regenerate: forceRegenerate };

      if (mode === 'ratio') {
        payload.ratio = values.ratio;
      } else if (mode === 'fixed') {
        payload.fixed_amount = values.fixedAmount;
      } else if (mode === 'guaranteed') {
        payload.guaranteed_amount = values.guaranteedAmount;
        payload.guaranteed_ratio = values.guaranteedRatio;
      } else if (mode === 'tiered') {
        payload.tiered_config = JSON.stringify(values.tiers || []);
      }

      setGenerating(true);
      const res = await settlementAPI.generate(payload);
      message.success(forceRegenerate ? '重新生成结算成功' : '生成结算成功');
      setGenerateModalVisible(false);
      setCurrentSettlement(res.data?.settlement || res.data);
      setDetailDrawerVisible(true);
      fetchData();
      fetchSummary();
    } catch (err) {
      if (err.errorFields) return;
      if (err.response?.status === 409 && !forceRegenerate) {
        Modal.confirm({
          title: '该场次已存在有效结算',
          icon: <ExclamationCircleOutlined />,
          content: (
            <div>
              <p>{err.response?.data?.message || '检测到同一场次已有未作废的结算单。'}</p>
              <p>是否<strong style={{ color: '#f5222d' }}>作废旧版本并重新生成</strong>？</p>
            </div>
          ),
          okText: '重新生成（作废旧版）',
          cancelText: '取消',
          onOk: () => handleGenerateSubmit(true),
        });
        return;
      }
      message.error(err.response?.data?.message || '生成结算失败');
    } finally {
      setGenerating(false);
    }
  };

  const handleViewDetail = (record) => {
    setCurrentSettlement(record);
    setDetailDrawerVisible(true);
  };

  const handleConfirm = async () => {
    if (!currentSettlement) return;
    setActionLoading(true);
    try {
      await settlementAPI.confirm(currentSettlement.id);
      message.success('确认成功');
      setDetailDrawerVisible(false);
      fetchData();
      fetchSummary();
    } catch (err) {
      message.error(err.response?.data?.message || '确认失败');
    } finally {
      setActionLoading(false);
    }
  };

  const handlePay = async () => {
    if (!currentSettlement) return;
    Modal.confirm({
      title: '确认完成支付',
      content: (
        <div>
          <p>确认已经向演出团体完成<strong style={{ color: '#52c41a' }}> {formatCurrency(currentSettlement.groupShare)} </strong>的支付？</p>
          <p style={{ color: '#8c8c8c', fontSize: 12 }}>结算单号：{currentSettlement.settlementNo}</p>
        </div>
      ),
      onOk: async () => {
        setActionLoading(true);
        try {
          await settlementAPI.pay(currentSettlement.id);
          message.success('支付完成');
          setDetailDrawerVisible(false);
          fetchData();
          fetchSummary();
        } catch (err) {
          message.error(err.response?.data?.message || '支付失败');
        } finally {
          setActionLoading(false);
        }
      },
    });
  };

  const handleVoidClick = () => {
    voidForm.resetFields();
    setVoidModalVisible(true);
  };

  const handleVoidSubmit = async () => {
    if (!currentSettlement) return;
    try {
      const values = await voidForm.validateFields();
      setActionLoading(true);
      await settlementAPI.void(currentSettlement.id, { void_reason: values.voidReason });
      message.success('作废成功');
      setVoidModalVisible(false);
      setDetailDrawerVisible(false);
      fetchData();
      fetchSummary();
    } catch (err) {
      if (err.errorFields) return;
      message.error(err.response?.data?.message || '作废失败');
    } finally {
      setActionLoading(false);
    }
  };

  const handleExport = async (record) => {
    try {
      const res = await exportAPI.settlement(record.id);
      const filename = `结算单_${record.settlementNo || record.id}_v${record.version || 1}.csv`;
      downloadBlob(res.data, filename);
      message.success('导出成功');
    } catch (err) {
      message.error('导出失败');
    }
  };

  const summaryCards = [
    {
      title: '结算单总数',
      value: summary.totalCount || 0,
      icon: <FileTextOutlined style={{ fontSize: 28, color: '#1890ff' }} />,
      color: 'rgba(24, 144, 255, 0.1)',
    },
    {
      title: '待确认',
      value: summary.pendingConfirm || 0,
      icon: <ExclamationCircleOutlined style={{ fontSize: 28, color: '#faad14' }} />,
      color: 'rgba(250, 173, 20, 0.1)',
    },
    {
      title: '已确认待支付',
      value: summary.confirmed || 0,
      icon: <CheckCircleOutlined style={{ fontSize: 28, color: '#1890ff' }} />,
      color: 'rgba(24, 144, 255, 0.08)',
    },
    {
      title: '已支付总额',
      value: formatCurrency(summary.totalPaidAmount || 0),
      icon: <DollarOutlined style={{ fontSize: 28, color: '#52c41a' }} />,
      color: 'rgba(82, 196, 26, 0.1)',
    },
  ];

  const columns = [
    {
      title: '结算单号',
      dataIndex: 'settlementNo',
      key: 'settlementNo',
      width: 180,
      render: (text, record) => (
        <Space>
          <Button type="link" icon={<EyeOutlined />} onClick={() => handleViewDetail(record)} style={{ padding: 0 }}>
            {text || `#${record.id}`}
          </Button>
          {record.version > 1 && <Tag color="purple">v{record.version}</Tag>}
        </Space>
      ),
    },
    {
      title: '剧目',
      dataIndex: 'performanceName',
      key: 'performanceName',
      width: 160,
      ellipsis: true,
      render: (text) => text || '-',
    },
    {
      title: '场次时间',
      dataIndex: 'showDate',
      key: 'showDate',
      width: 160,
      render: (text, record) => {
        const d = text || record.showDate;
        const t = record.startTime || '';
        return d ? `${d}${t ? ' ' + t : ''}` : '-';
      },
    },
    {
      title: '剧场',
      dataIndex: 'theaterName',
      key: 'theaterName',
      width: 120,
      ellipsis: true,
      render: (text) => text || '-',
    },
    {
      title: '结算模式',
      dataIndex: 'settlementMode',
      key: 'settlementMode',
      width: 110,
      render: (mode) => {
        const m = MODE_MAP[mode];
        return m ? <Tag color={m.color}>{m.text}</Tag> : '-';
      },
    },
    {
      title: '总票房',
      dataIndex: 'grossRevenue',
      key: 'grossRevenue',
      width: 120,
      align: 'right',
      render: (v) => formatCurrency(v),
    },
    {
      title: '退票金额',
      dataIndex: 'refundAmount',
      key: 'refundAmount',
      width: 110,
      align: 'right',
      render: (v) => <span style={{ color: '#f5222d' }}>-{formatCurrency(v)}</span>,
    },
    {
      title: '净收入',
      dataIndex: 'netRevenue',
      key: 'netRevenue',
      width: 120,
      align: 'right',
      render: (v) => <strong>{formatCurrency(v)}</strong>,
    },
    {
      title: '团体分成',
      dataIndex: 'groupShare',
      key: 'groupShare',
      width: 120,
      align: 'right',
      render: (v) => <span style={{ color: '#722ed1' }}>{formatCurrency(v)}</span>,
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 100,
      render: (s) => {
        const m = STATUS_MAP[s];
        return m ? <Tag color={m.color}>{m.text}</Tag> : s;
      },
    },
    {
      title: '操作',
      key: 'actions',
      width: 180,
      fixed: 'right',
      render: (_, record) => (
        <Space size="small">
          <Button size="small" icon={<EyeOutlined />} onClick={() => handleViewDetail(record)}>详情</Button>
          {record.status === 'pending_confirm' && canConfirm && (
            <Popconfirm title="确认该结算单？" onConfirm={() => { setCurrentSettlement(record); handleConfirm(); }}>
              <Button size="small" type="primary">确认</Button>
            </Popconfirm>
          )}
          {record.status === 'confirmed' && canPay && (
            <Button size="small" type="primary" icon={<PayCircleOutlined />} onClick={() => { setCurrentSettlement(record); handlePay(); }}>
              支付
            </Button>
          )}
          {['pending_confirm', 'confirmed'].includes(record.status) && canVoid && (
            <Button size="small" danger onClick={() => { setCurrentSettlement(record); handleVoidClick(); }}>
              作废
            </Button>
          )}
          <Button size="small" icon={<DownloadOutlined />} onClick={() => handleExport(record)}>导出</Button>
        </Space>
      ),
    },
  ];

  const tieredInitial = [
    { threshold: 0, ratio: 50 },
  ];

  const renderModeConfigFields = () => {
    const mode = generateForm.getFieldValue('settlementMode');
    if (mode === 'ratio') {
      return (
        <Form.Item
          label="剧场分成比例"
          name="ratio"
          rules={[{ required: true, message: '请输入分成比例' }]}
          extra="例如：50 表示剧场分得 50%，团体分得 50%"
        >
          <InputNumber min={0} max={100} step={1} style={{ width: '100%' }} addonAfter="%" />
        </Form.Item>
      );
    }
    if (mode === 'fixed') {
      return (
        <Form.Item
          label="固定费用"
          name="fixedAmount"
          rules={[{ required: true, message: '请输入固定费用金额' }]}
          extra="剧场向团体收取的固定场租费用"
        >
          <InputNumber min={0} step={100} style={{ width: '100%' }} addonBefore="¥" />
        </Form.Item>
      );
    }
    if (mode === 'guaranteed') {
      return (
        <>
          <Form.Item
            label="保底金额"
            name="guaranteedAmount"
            rules={[{ required: true, message: '请输入保底金额' }]}
          >
            <InputNumber min={0} step={1000} style={{ width: '100%' }} addonBefore="¥" />
          </Form.Item>
          <Form.Item
            label="超出保底后剧场分成"
            name="guaranteedRatio"
            rules={[{ required: true, message: '请输入分成比例' }]}
            extra="净收入超出保底金额部分，剧场按此比例分成"
          >
            <InputNumber min={0} max={100} step={1} style={{ width: '100%' }} addonAfter="%" />
          </Form.Item>
        </>
      );
    }
    if (mode === 'tiered') {
      return (
        <Form.Item label="阶梯配置" name="tiers" initialValue={tieredInitial}>
          <TieredConfigEditor />
        </Form.Item>
      );
    }
    return null;
  };

  return (
    <div>
      <Title level={3} style={{ marginBottom: 24 }}>
        <Space>
          <TeamOutlined />
          财务结算管理
        </Space>
      </Title>

      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        {summaryCards.map((card, idx) => (
          <Col xs={24} sm={12} lg={6} key={idx}>
            <Card bordered={false} style={{ borderRadius: 8 }} loading={summaryLoading}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontSize: 13, color: '#8c8c8c', marginBottom: 4 }}>{card.title}</div>
                  <div style={{ fontSize: 24, fontWeight: 600 }}>{card.value}</div>
                </div>
                <div
                  style={{
                    width: 50,
                    height: 50,
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
        bordered={false}
        style={{ borderRadius: 8, marginBottom: 24 }}
        title={
          <Space>
            <SearchOutlined /> 筛选条件
          </Space>
        }
      >
        <Row gutter={[16, 16]} align="middle">
          <Col xs={24} sm={12} md={6}>
            <Input
              placeholder="剧目/结算单号/剧场关键字"
              value={searchKeyword}
              onChange={(e) => setSearchKeyword(e.target.value)}
              onPressEnter={handleSearch}
              allowClear
              prefix={<SearchOutlined style={{ color: '#bfbfbf' }} />}
            />
          </Col>
          <Col xs={24} sm={12} md={5}>
            <Select
              placeholder="状态"
              allowClear
              value={searchStatus || undefined}
              onChange={(v) => setSearchStatus(v)}
              style={{ width: '100%' }}
            >
              {Object.entries(STATUS_MAP).map(([k, v]) => (
                <Option key={k} value={k}>{v.text}</Option>
              ))}
            </Select>
          </Col>
          <Col xs={24} sm={12} md={5}>
            <Select
              placeholder="结算模式"
              allowClear
              value={searchMode || undefined}
              onChange={(v) => setSearchMode(v)}
              style={{ width: '100%' }}
            >
              {Object.entries(MODE_MAP).map(([k, v]) => (
                <Option key={k} value={k}>{v.text}</Option>
              ))}
            </Select>
          </Col>
          <Col xs={24} sm={12} md={8}>
            <RangePicker
              style={{ width: '100%' }}
              value={searchDateRange}
              onChange={setSearchDateRange}
              placeholder={['结算开始日期', '结束日期']}
            />
          </Col>
          <Col xs={24} sm={24} md={0} />
          <Col xs={24} sm={12} md={12} style={{ textAlign: 'right' }}>
            <Space>
              <Button icon={<ReloadOutlined />} onClick={handleReset}>重置</Button>
              <Button type="primary" icon={<SearchOutlined />} onClick={handleSearch}>查询</Button>
              {canGenerate && (
                <Button type="primary" icon={<PlusOutlined />} onClick={handleGenerateClick}>
                  生成结算
                </Button>
              )}
            </Space>
          </Col>
        </Row>
      </Card>

      <Card bordered={false} style={{ borderRadius: 8 }}>
        <Tabs activeKey={activeTab} onChange={handleTabChange}>
          <TabPane tab="全部" key="all" />
          <TabPane tab={`待确认 ${summary.pendingConfirm ? `(${summary.pendingConfirm})` : ''}`} key="pending_confirm" />
          <TabPane tab="已确认" key="confirmed" />
          <TabPane tab="已支付" key="paid" />
          <TabPane tab="已作废" key="void" />
        </Tabs>

        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}>
            <Spin size="large" />
          </div>
        ) : data.length > 0 ? (
          <Table
            rowKey="id"
            dataSource={data}
            columns={columns}
            scroll={{ x: 1400 }}
            pagination={{
              current: page,
              pageSize,
              total,
              showSizeChanger: true,
              showQuickJumper: true,
              showTotal: (t) => `共 ${t} 条`,
              onChange: (p, ps) => { setPage(p); setPageSize(ps); },
            }}
          />
        ) : (
          <Empty
            description={
              <Space direction="vertical" size="small">
                <span>暂无结算数据</span>
                {canGenerate && (
                  <Button type="primary" icon={<PlusOutlined />} onClick={handleGenerateClick}>
                    去生成结算
                  </Button>
                )}
              </Space>
            }
            style={{ padding: 60 }}
          />
        )}
      </Card>

      <Modal
        title={<Space><PlusOutlined /><span>生成结算单</span></Space>}
        open={generateModalVisible}
        onCancel={() => setGenerateModalVisible(false)}
        width={760}
        footer={
          <Space>
            <Button onClick={() => setGenerateModalVisible(false)}>取消</Button>
            <Button onClick={handlePreview} icon={<EyeOutlined />} loading={previewLoading}>
              预览结算
            </Button>
            <Button type="primary" onClick={() => handleGenerateSubmit(false)} loading={generating} icon={<FileTextOutlined />}>
              生成结算
            </Button>
          </Space>
        }
        destroyOnClose
      >
        <Form form={generateForm} layout="vertical">
          <Row gutter={16}>
            <Col xs={24} md={12}>
              <Form.Item
                label="选择场次"
                name="showId"
                rules={[{ required: true, message: '请选择要结算的场次' }]}
              >
                <Select
                  placeholder="请选择已结束的场次"
                  showSearch
                  onChange={handleShowChange}
                  filterOption={(input, option) =>
                    String(option.children || '').toLowerCase().includes(input.toLowerCase())
                  }
                  style={{ width: '100%' }}
                >
                  {showList.map(s => (
                    <Option key={s.id} value={s.id}>
                      [{s.performanceName}] {s.showDate} {s.startTime} @{s.theaterName || '剧场'}
                    </Option>
                  ))}
                </Select>
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item
                label="结算模式"
                name="settlementMode"
                rules={[{ required: true }]}
              >
                <Select onChange={handleModeChange}>
                  <Option value="ratio">比例分成</Option>
                  <Option value="fixed">固定费用（场租）</Option>
                  <Option value="guaranteed">保底金额 + 分成</Option>
                  <Option value="tiered">阶梯分成</Option>
                </Select>
              </Form.Item>
            </Col>
          </Row>
          {renderModeConfigFields()}

          {previewData && (
            <>
              <Divider orientation="left"><Space><EyeOutlined />结算预览</Space></Divider>
              <Card size="small" style={{ background: '#fafafa' }}>
                <Descriptions column={2} size="small" bordered>
                  <Descriptions.Item label="总票房（折扣后实收）">
                    <strong>{formatCurrency(previewData.grossRevenue)}</strong>
                  </Descriptions.Item>
                  <Descriptions.Item label="退票金额（扣除手续费）">
                    <span style={{ color: '#f5222d' }}>-{formatCurrency(previewData.refundAmount)}</span>
                  </Descriptions.Item>
                  <Descriptions.Item label="净收入">
                    <strong style={{ color: '#1890ff' }}>{formatCurrency(previewData.netRevenue)}</strong>
                  </Descriptions.Item>
                  <Descriptions.Item label="结算模式">
                    {MODE_MAP[previewData.settlementMode]?.text || previewData.settlementMode}
                  </Descriptions.Item>
                  <Descriptions.Item label="剧场分成" span={2}>
                    <span style={{ color: '#1890ff' }}>{formatCurrency(previewData.theaterShare)}</span>
                  </Descriptions.Item>
                  <Descriptions.Item label="演出团体分成" span={2}>
                    <strong style={{ color: '#52c41a', fontSize: 16 }}>
                      {formatCurrency(previewData.groupShare)}
                    </strong>
                  </Descriptions.Item>
                </Descriptions>
                {previewData.tieredResult && previewData.tieredResult.length > 1 && (
                  <>
                    <Divider orientation="left" plain style={{ fontSize: 12 }}>阶梯明细</Divider>
                    <List size="small" dataSource={previewData.tieredResult} renderItem={(tier, idx) => (
                      <List.Item>
                        阶梯 {idx + 1}：净收入 {formatCurrency(tier.thresholdStart)} ~ {formatCurrency(tier.thresholdEnd || '∞')}
                        ，分成比例 {tier.ratio}%，应分 <strong>{formatCurrency(tier.theaterShare)}</strong>
                      </List.Item>
                    )} />
                  </>
                )}
              </Card>
            </>
          )}
        </Form>
      </Modal>

      <Drawer
        title={<Space><FileTextOutlined /><span>结算单详情</span></Space>}
        open={detailDrawerVisible}
        onClose={() => setDetailDrawerVisible(false)}
        width={780}
        extra={
          <Space>
            <Button icon={<DownloadOutlined />} onClick={() => currentSettlement && handleExport(currentSettlement)}>
              导出CSV
            </Button>
            {currentSettlement?.status === 'pending_confirm' && canConfirm && (
              <Button type="primary" icon={<CheckCircleOutlined />} onClick={handleConfirm} loading={actionLoading}>
                确认结算
              </Button>
            )}
            {currentSettlement?.status === 'confirmed' && canPay && (
              <Button type="primary" icon={<PayCircleOutlined />} onClick={handlePay} loading={actionLoading}>
                完成支付
              </Button>
            )}
            {['pending_confirm', 'confirmed'].includes(currentSettlement?.status) && canVoid && (
              <Button danger icon={<CloseCircleOutlined />} onClick={handleVoidClick} loading={actionLoading}>
                作废
              </Button>
            )}
          </Space>
        }
      >
        {currentSettlement && (
          <div>
            <Descriptions column={2} size="small" bordered style={{ marginBottom: 16 }}>
              <Descriptions.Item label="结算单号">
                <Space>
                  <strong>{currentSettlement.settlementNo || `#${currentSettlement.id}`}</strong>
                  <Tag color={STATUS_MAP[currentSettlement.status]?.color}>
                    {STATUS_MAP[currentSettlement.status]?.text}
                  </Tag>
                </Space>
              </Descriptions.Item>
              <Descriptions.Item label="版本号">
                v{currentSettlement.version || 1}
                {currentSettlement.parentId && (
                  <Tooltip title={`由旧版本 #${currentSettlement.parentId} 重新生成`}>
                    <Tag icon={<HistoryOutlined />} color="purple" style={{ marginLeft: 8 }}>
                      版本链
                    </Tag>
                  </Tooltip>
                )}
              </Descriptions.Item>
              <Descriptions.Item label="剧目">{currentSettlement.performanceName || '-'}</Descriptions.Item>
              <Descriptions.Item label="演出团体">{currentSettlement.groupName || '-'}</Descriptions.Item>
              <Descriptions.Item label="剧场">{currentSettlement.theaterName || '-'}</Descriptions.Item>
              <Descriptions.Item label="场次">
                {currentSettlement.showDate} {currentSettlement.startTime}
              </Descriptions.Item>
              <Descriptions.Item label="结算模式">
                {MODE_MAP[currentSettlement.settlementMode]?.text || '-'}
              </Descriptions.Item>
              <Descriptions.Item label="创建人">
                {currentSettlement.createdByName || currentSettlement.createdBy || '-'}
              </Descriptions.Item>
              <Descriptions.Item label="创建时间">{currentSettlement.createdAt || '-'}</Descriptions.Item>
              <Descriptions.Item label="支付时间">{currentSettlement.paidAt || '-'}</Descriptions.Item>
            </Descriptions>

            <Title level={5}><DollarOutlined /> 金额明细</Title>
            <Card size="small" style={{ marginBottom: 16, background: 'linear-gradient(135deg, #f6ffed 0%, #e6f7ff 100%)' }}>
              <Descriptions column={3} size="small" bordered>
                <Descriptions.Item label="总票房（折扣后实收）">
                  <strong>{formatCurrency(currentSettlement.grossRevenue)}</strong>
                </Descriptions.Item>
                <Descriptions.Item label="退票金额（扣手续费后）">
                  <span style={{ color: '#f5222d' }}>-{formatCurrency(currentSettlement.refundAmount)}</span>
                </Descriptions.Item>
                <Descriptions.Item label="净收入">
                  <strong style={{ color: '#1890ff' }}>{formatCurrency(currentSettlement.netRevenue)}</strong>
                </Descriptions.Item>
                <Descriptions.Item label="剧场分成">
                  <span style={{ color: '#1890ff' }}>{formatCurrency(currentSettlement.theaterShare)}</span>
                </Descriptions.Item>
                <Descriptions.Item label="演出团体分成">
                  <strong style={{ color: '#52c41a', fontSize: 16 }}>
                    {formatCurrency(currentSettlement.groupShare)}
                  </strong>
                </Descriptions.Item>
                <Descriptions.Item label="订单数/退票数">
                  {currentSettlement.orderCount || 0} / {currentSettlement.refundCount || 0}
                </Descriptions.Item>
              </Descriptions>
            </Card>

            {currentSettlement.settlementConfig && (
              <>
                <Divider orientation="left" plain>结算配置</Divider>
                <SettlementConfigDisplay mode={currentSettlement.settlementMode} config={currentSettlement.settlementConfig} />
              </>
            )}

            {currentSettlement.versionHistory && currentSettlement.versionHistory.length > 0 && (
              <>
                <Divider orientation="left" plain>
                  <Space><HistoryOutlined />版本历史（共 {currentSettlement.versionHistory.length} 个版本）</Space>
                </Divider>
                <TimelineHistory list={currentSettlement.versionHistory} currentId={currentSettlement.id} />
              </>
            )}

            {currentSettlement.voidReason && (
              <Alert
                type="warning"
                showIcon
                icon={<CloseCircleOutlined />}
                message={`作废原因：${currentSettlement.voidReason}`}
                style={{ marginTop: 16 }}
              />
            )}
          </div>
        )}
      </Drawer>

      <Modal
        title={<Space><CloseCircleOutlined /><span>作废结算单</span></Space>}
        open={voidModalVisible}
        onCancel={() => setVoidModalVisible(false)}
        onOk={handleVoidSubmit}
        confirmLoading={actionLoading}
        okText="确认作废"
        okButtonProps={{ danger: true }}
      >
        <Form form={voidForm} layout="vertical">
          <Form.Item
            label="作废原因"
            name="voidReason"
            rules={[{ required: true, message: '请填写作废原因' }]}
          >
            <Input.TextArea rows={4} placeholder="请说明作废该结算单的原因..." />
          </Form.Item>
          <Alert
            type="warning"
            showIcon
            message="作废后该结算单将不再计入已支付统计，但记录会保留。如需重新生成，可在生成结算时选择同一场次。"
          />
        </Form>
      </Modal>
    </div>
  );
};

const TieredConfigEditor = ({ value = [], onChange }) => {
  const list = value.length ? value : [{ threshold: 0, ratio: 50 }];

  const updateItem = (idx, patch) => {
    const next = list.map((item, i) => (i === idx ? { ...item, ...patch } : item));
    onChange && onChange(next);
  };

  const removeItem = (idx) => {
    if (list.length <= 1) return;
    const next = list.filter((_, i) => i !== idx);
    onChange && onChange(next);
  };

  const addItem = () => {
    const maxThreshold = Math.max(...list.map(i => i.threshold || 0));
    onChange && onChange([...list, { threshold: maxThreshold + 10000, ratio: 50 }]);
  };

  return (
    <div style={{ border: '1px solid #f0f0f0', padding: 12, borderRadius: 6, background: '#fafafa' }}>
      {list.map((item, idx) => (
        <Row gutter={8} align="middle" key={idx} style={{ marginBottom: idx === list.length - 1 ? 0 : 8 }}>
          <Col flex="220px">
            <span style={{ fontSize: 12, color: '#8c8c8c' }}>净收入 ≥ </span>
            <InputNumber
              min={idx === 0 ? 0 : 1}
              step={1000}
              value={item.threshold}
              addonBefore="¥"
              onChange={(v) => updateItem(idx, { threshold: v || 0 })}
              style={{ width: 160 }}
            />
          </Col>
          <Col flex="220px">
            <span style={{ fontSize: 12, color: '#8c8c8c' }}>剧场分成 </span>
            <InputNumber
              min={0}
              max={100}
              step={1}
              value={item.ratio}
              addonAfter="%"
              onChange={(v) => updateItem(idx, { ratio: v || 0 })}
              style={{ width: 140 }}
            />
          </Col>
          <Col>
            <Button
              size="small"
              danger
              icon={<CloseCircleOutlined />}
              onClick={() => removeItem(idx)}
              disabled={list.length <= 1}
            >删除</Button>
          </Col>
        </Row>
      ))}
      <Button size="small" icon={<PlusOutlined />} onClick={addItem} style={{ marginTop: 8 }}>
        添加阶梯
      </Button>
    </div>
  );
};

const SettlementConfigDisplay = ({ mode, config }) => {
  if (!config) return null;
  const cfg = typeof config === 'string' ? JSON.parse(config) : config;

  if (mode === 'ratio') {
    return (
      <Descriptions column={1} size="small">
        <Descriptions.Item label="剧场分成比例">{cfg.ratio}%</Descriptions.Item>
      </Descriptions>
    );
  }
  if (mode === 'fixed') {
    return (
      <Descriptions column={1} size="small">
        <Descriptions.Item label="固定场租费用">{formatCurrency(cfg.fixedAmount)}</Descriptions.Item>
      </Descriptions>
    );
  }
  if (mode === 'guaranteed') {
    return (
      <Descriptions column={1} size="small">
        <Descriptions.Item label="保底金额">{formatCurrency(cfg.guaranteedAmount)}</Descriptions.Item>
        <Descriptions.Item label="超出保底部分剧场分成">{cfg.guaranteedRatio}%</Descriptions.Item>
      </Descriptions>
    );
  }
  if (mode === 'tiered') {
    const tiers = typeof cfg.tieredConfig === 'string' ? JSON.parse(cfg.tieredConfig) : (cfg.tieredConfig || cfg.tiers || []);
    return (
      <List
        size="small"
        header={<span style={{ fontWeight: 600 }}>阶梯配置（共 {tiers.length} 档）</span>}
        bordered
        dataSource={tiers.sort((a, b) => (a.threshold || 0) - (b.threshold || 0))}
        renderItem={(tier, idx) => (
          <List.Item>
            <Tag color="blue">阶梯 {idx + 1}</Tag>
            <span>
              当净收入 ≥ <strong>{formatCurrency(tier.threshold)}</strong> 时，剧场分成 <strong>{tier.ratio}%</strong>
            </span>
          </List.Item>
        )}
      />
    );
  }
  return null;
};

const Alert = ({ type = 'info', showIcon = false, icon, message, style }) => (
  <div
    style={{
      padding: '10px 14px',
      borderRadius: 6,
      display: 'flex',
      alignItems: 'flex-start',
      gap: 8,
      background: type === 'warning' ? '#fffbe6' : type === 'error' ? '#fff2f0' : type === 'success' ? '#f6ffed' : '#e6f7ff',
      border: `1px solid ${type === 'warning' ? '#ffe58f' : type === 'error' ? '#ffccc7' : type === 'success' ? '#b7eb8f' : '#91d5ff'}`,
      color: type === 'warning' ? '#d48806' : type === 'error' ? '#cf1322' : type === 'success' ? '#389e0d' : '#096dd9',
      ...style,
    }}
  >
    {showIcon && icon && <span style={{ marginTop: 2 }}>{icon}</span>}
    <span>{message}</span>
  </div>
);

const TimelineHistory = ({ list = [], currentId }) => {
  const sorted = [...list].sort((a, b) => (a.version || 0) - (b.version || 0));
  return (
    <div style={{ padding: '4px 12px' }}>
      {sorted.map((item, idx) => {
        const isCurrent = item.id === currentId;
        const status = STATUS_MAP[item.status] || {};
        return (
          <div key={item.id} style={{ display: 'flex', gap: 12, marginBottom: idx === sorted.length - 1 ? 0 : 16, position: 'relative' }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: 24 }}>
              <div
                style={{
                  width: 16,
                  height: 16,
                  borderRadius: '50%',
                  background: isCurrent ? '#1890ff' : '#d9d9d9',
                  border: `3px solid ${isCurrent ? '#bae7ff' : '#f5f5f5'}`,
                  zIndex: 1,
                  flexShrink: 0,
                }}
              />
              {idx < sorted.length - 1 && (
                <div style={{ flex: 1, width: 2, background: '#f0f0f0', margin: '4px 0' }} />
              )}
            </div>
            <div style={{ flex: 1, paddingBottom: 8 }}>
              <Space>
                <Tag color={isCurrent ? 'blue' : 'default'}>
                  v{item.version} {isCurrent && '(当前)'}
                </Tag>
                <Tag color={status.color}>{status.text}</Tag>
                {item.isVoid && <Tag color="red">已作废</Tag>}
              </Space>
              <div style={{ fontSize: 12, color: '#8c8c8c', marginTop: 4 }}>
                {item.createdAt} · 由 {item.createdByName || '系统'} 创建
              </div>
              {item.voidReason && (
                <div style={{ fontSize: 12, color: '#f5222d', marginTop: 2 }}>
                  作废原因：{item.voidReason}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default SettlementManage;
