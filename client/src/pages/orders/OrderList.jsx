import React, { useState, useEffect } from 'react';
import {
  Table,
  Button,
  Input,
  Select,
  Modal,
  Form,
  DatePicker,
  message,
  Space,
  Popconfirm,
  Tag,
  Tooltip,
} from 'antd';
import {
  EyeOutlined,
  PayCircleOutlined,
  RollbackOutlined,
  SearchOutlined,
  ReloadOutlined,
  CloseOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { orderAPI } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import dayjs from 'dayjs';

const { Option } = Select;
const { RangePicker } = DatePicker;

const statusMap = {
  pending: { text: '待支付', color: 'orange' },
  paid: { text: '已支付', color: 'green' },
  cancelled: { text: '已取消', color: 'default' },
  refunded: { text: '已退票', color: 'purple' },
};

const paymentMethodMap = {
  cash: '现金',
  wechat: '微信',
  alipay: '支付宝',
  card: '刷卡',
  transfer: '转账',
  reservation: '预留',
};

const orderTypeMap = {
  online: '线上',
  offline: '线下窗口',
  phone: '电话预留',
  group: '团体票',
};

const refundReasons = [
  '个人原因',
  '行程变更',
  '演出取消',
  '演出时间变更',
  '其他原因',
];

const OrderList = () => {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState('');
  const [keyword, setKeyword] = useState('');
  const [dateRange, setDateRange] = useState(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [total, setTotal] = useState(0);
  const [payModalVisible, setPayModalVisible] = useState(false);
  const [refundModalVisible, setRefundModalVisible] = useState(false);
  const [currentOrder, setCurrentOrder] = useState(null);
  const [payForm] = Form.useForm();
  const [refundForm] = Form.useForm();
  const { hasRole } = useAuth();
  const navigate = useNavigate();
  const canRefund = hasRole('seller', 'scheduler', 'manager');
  const canCancel = hasRole('seller', 'scheduler', 'manager');

  const fetchData = async () => {
    setLoading(true);
    try {
      const params = { page, pageSize };
      if (status) params.paymentStatus = status;
      if (keyword) params.keyword = keyword;
      if (dateRange && dateRange.length === 2) {
        params.startDate = dateRange[0].format('YYYY-MM-DD');
        params.endDate = dateRange[1].format('YYYY-MM-DD');
      }
      const res = await orderAPI.list(params);
      setData(res.data.orders || res.data.data || []);
      setTotal(res.data.total || 0);
    } catch (err) {
      message.error(err.response?.data?.message || '获取订单列表失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [status, keyword, dateRange, page, pageSize]);

  const handleSearch = () => {
    setPage(1);
    fetchData();
  };

  const handleReset = () => {
    setStatus('');
    setKeyword('');
    setDateRange(null);
    setPage(1);
  };

  const handleViewDetail = (record) => {
    navigate(`/orders/${record.id}`);
  };

  const handlePay = (record) => {
    setCurrentOrder(record);
    setPayModalVisible(true);
    payForm.resetFields();
  };

  const handlePaySubmit = async () => {
    try {
      const values = await payForm.validateFields();
      await orderAPI.pay(currentOrder.id, { paymentMethod: values.paymentMethod });
      message.success('支付成功');
      setPayModalVisible(false);
      fetchData();
    } catch (err) {
      if (err.errorFields) return;
      message.error(err.response?.data?.message || '支付失败');
    }
  };

  const handleRefund = (record) => {
    setCurrentOrder(record);
    setRefundModalVisible(true);
    refundForm.resetFields();
  };

  const handleRefundSubmit = async () => {
    try {
      const values = await refundForm.validateFields();
      await orderAPI.refund(currentOrder.id, { reason: values.reason });
      message.success('退票成功');
      setRefundModalVisible(false);
      fetchData();
    } catch (err) {
      if (err.errorFields) return;
      message.error(err.response?.data?.message || '退票失败');
    }
  };

  const handleCancel = async (record) => {
    try {
      message.info('取消订单功能暂未开放');
    } catch (err) {
      message.error(err.response?.data?.message || '取消失败');
    }
  };

  const formatTime = (showDate, startTime) => {
    if (showDate && startTime) {
      return `${dayjs(showDate).format('YYYY-MM-DD')} ${startTime}`;
    }
    return '-';
  };

  const formatCurrency = (value) => {
    if (!value && value !== 0) return '¥0.00';
    return `¥${Number(value).toFixed(2)}`;
  };

  const renderEllipsis = (text, maxLength = 12) => {
    if (!text) return '-';
    if (text.length <= maxLength) return text;
    return (
      <Tooltip title={text}>
        <span>{text.slice(0, maxLength)}...</span>
      </Tooltip>
    );
  };

  const columns = [
    {
      title: '订单号',
      dataIndex: 'orderNo',
      key: 'orderNo',
      width: 160,
      ellipsis: { showTitle: false },
      render: (text) => renderEllipsis(text, 15),
    },
    {
      title: '演出剧目',
      dataIndex: 'performanceName',
      key: 'performanceName',
      width: 180,
      ellipsis: { showTitle: false },
      render: (text) => renderEllipsis(text, 12),
    },
    {
      title: '场次时间',
      key: 'showTime',
      width: 160,
      render: (_, record) => formatTime(record.showDate, record.startTime),
    },
    {
      title: '总金额',
      dataIndex: 'totalAmount',
      key: 'totalAmount',
      width: 110,
      render: (amount) => formatCurrency(amount),
    },
    {
      title: '订单状态',
      dataIndex: 'paymentStatus',
      key: 'paymentStatus',
      width: 100,
      render: (status) => {
        const statusInfo = statusMap[status] || { text: status, color: 'default' };
        return <Tag color={statusInfo.color}>{statusInfo.text}</Tag>;
      },
    },
    {
      title: '订单类型',
      dataIndex: 'orderType',
      key: 'orderType',
      width: 110,
      render: (type) => orderTypeMap[type] || type || '-',
    },
    {
      title: '购票人',
      dataIndex: 'buyerName',
      key: 'buyerName',
      width: 100,
      render: (text) => text || '-',
    },
    {
      title: '手机号',
      dataIndex: 'buyerPhone',
      key: 'buyerPhone',
      width: 130,
      render: (text) => text || '-',
    },
    {
      title: '创建时间',
      dataIndex: 'createdAt',
      key: 'createdAt',
      width: 170,
      render: (date) => (date ? dayjs(date).format('YYYY-MM-DD HH:mm:ss') : '-'),
    },
    {
      title: '操作',
      key: 'action',
      width: 260,
      fixed: 'right',
      render: (_, record) => (
        <Space size="small" wrap>
          <Button
            type="link"
            size="small"
            icon={<EyeOutlined />}
            onClick={() => handleViewDetail(record)}
          >
            详情
          </Button>
          {record.paymentStatus === 'pending' && (
            <Button
              type="link"
              size="small"
              icon={<PayCircleOutlined />}
              onClick={() => handlePay(record)}
            >
              支付
            </Button>
          )}
          {record.paymentStatus === 'pending' && record.orderType === 'phone' && canCancel && (
            <Popconfirm
              title="确认取消该订单？"
              description="取消后座位将被释放"
              onConfirm={() => handleCancel(record)}
              okText="确认"
              cancelText="取消"
            >
              <Button type="link" size="small" danger icon={<CloseOutlined />}>
                取消
              </Button>
            </Popconfirm>
          )}
          {record.paymentStatus === 'paid' && canRefund && (
            <Button
              type="link"
              size="small"
              danger
              icon={<RollbackOutlined />}
              onClick={() => handleRefund(record)}
            >
              退票
            </Button>
          )}
        </Space>
      ),
    },
  ];

  const paginationConfig = {
    current: page,
    pageSize,
    total,
    showSizeChanger: true,
    showQuickJumper: true,
    showTotal: (total) => `共 ${total} 条记录`,
    pageSizeOptions: ['10', '20', '50', '100'],
    onChange: (page, pageSize) => {
      setPage(page);
      setPageSize(pageSize);
    },
    onShowSizeChange: (page, pageSize) => {
      setPage(1);
      setPageSize(pageSize);
    },
  };

  return (
    <div>
      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2 style={{ margin: 0 }}>订单管理</h2>
        <Button icon={<ReloadOutlined />} onClick={fetchData}>
          刷新
        </Button>
      </div>

      <div style={{ marginBottom: 16, padding: 16, background: '#fafafa', borderRadius: 8 }}>
        <Space wrap size="middle">
          <Select
            placeholder="订单状态"
            value={status || undefined}
            onChange={(value) => setStatus(value)}
            style={{ width: 140 }}
            allowClear
          >
            <Option value="pending">待支付</Option>
            <Option value="paid">已支付</Option>
            <Option value="cancelled">已取消</Option>
            <Option value="refunded">已退票</Option>
          </Select>
          <RangePicker
            value={dateRange}
            onChange={(value) => setDateRange(value)}
            style={{ width: 280 }}
          />
          <Input
            placeholder="搜索订单号/购票人/手机号"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            style={{ width: 240 }}
            prefix={<SearchOutlined />}
            allowClear
            onPressEnter={handleSearch}
          />
          <Button type="primary" onClick={handleSearch}>
            搜索
          </Button>
          <Button onClick={handleReset}>重置</Button>
        </Space>
      </div>

      <Table
        columns={columns}
        dataSource={data}
        rowKey="id"
        loading={loading}
        scroll={{ x: 1500 }}
        pagination={paginationConfig}
      />

      <Modal
        title="确认支付"
        open={payModalVisible}
        onOk={handlePaySubmit}
        onCancel={() => setPayModalVisible(false)}
        okText="确认支付"
        cancelText="取消"
        width={480}
      >
        <Form form={payForm} layout="vertical">
          <div style={{ marginBottom: 16, padding: 16, background: '#f6ffed', borderRadius: 8 }}>
            <div style={{ marginBottom: 8 }}>
              <strong>订单号：</strong>{currentOrder?.orderNo}
            </div>
            <div>
              <strong>待支付金额：</strong>
              <span style={{ color: '#52c41a', fontSize: 20, fontWeight: 'bold', marginLeft: 8 }}>
                {formatCurrency(currentOrder?.actualAmount)}
              </span>
            </div>
          </div>
          <Form.Item
            name="paymentMethod"
            label="支付方式"
            rules={[{ required: true, message: '请选择支付方式' }]}
          >
            <Select placeholder="请选择支付方式">
              <Option value="cash">现金</Option>
              <Option value="wechat">微信</Option>
              <Option value="alipay">支付宝</Option>
              <Option value="card">刷卡</Option>
              <Option value="transfer">转账</Option>
            </Select>
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="申请退票"
        open={refundModalVisible}
        onOk={handleRefundSubmit}
        onCancel={() => setRefundModalVisible(false)}
        okText="确认退票"
        cancelText="取消"
        okButtonProps={{ danger: true }}
        width={480}
      >
        <Form form={refundForm} layout="vertical">
          <div style={{ marginBottom: 16, padding: 16, background: '#fff1f0', borderRadius: 8 }}>
            <div style={{ marginBottom: 8 }}>
              <strong>订单号：</strong>{currentOrder?.orderNo}
            </div>
            <div>
              <strong>退票金额：</strong>
              <span style={{ color: '#f5222d', fontSize: 20, fontWeight: 'bold', marginLeft: 8 }}>
                {formatCurrency(currentOrder?.actualAmount)}
              </span>
            </div>
          </div>
          <Form.Item
            name="reason"
            label="退票原因"
            rules={[{ required: true, message: '请选择退票原因' }]}
          >
            <Select placeholder="请选择退票原因">
              {refundReasons.map((reason) => (
                <Option key={reason} value={reason}>
                  {reason}
                </Option>
              ))}
            </Select>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default OrderList;
