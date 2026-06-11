import React, { useState, useEffect } from 'react';
import {
  Card,
  Descriptions,
  Table,
  Button,
  Tag,
  Space,
  Divider,
  message,
  Modal,
  Form,
  Input,
  Row,
  Col,
  Spin,
  Select,
} from 'antd';
import {
  ArrowLeftOutlined,
  PayCircleOutlined,
  RollbackOutlined,
  UserOutlined,
  PhoneOutlined,
  IdcardOutlined,
  InfoCircleOutlined,
  ShoppingCartOutlined,
  MoneyCollectOutlined,
  CalendarOutlined,
  EnvironmentOutlined,
} from '@ant-design/icons';
import { useParams, useNavigate } from 'react-router-dom';
import { orderAPI } from '../../services/api';
import dayjs from 'dayjs';

const { Option } = Select;

const statusMap = {
  pending: { text: '待支付', color: 'orange' },
  paid: { text: '已支付', color: 'green' },
  refunded: { text: '已退票', color: 'purple' },
  cancelled: { text: '已取消', color: 'default' },
};

const orderTypeMap = {
  online: '线上',
  offline: '线下窗口',
  phone: '电话预留',
  group: '团体票',
};

const paymentMethodMap = {
  cash: '现金',
  wechat: '微信',
  alipay: '支付宝',
  card: '刷卡',
  transfer: '转账',
  reservation: '预留',
};

const refundReasons = [
  '个人原因',
  '行程变更',
  '演出取消',
  '演出时间变更',
  '其他原因',
];

const formatCurrency = (value) => {
  if (!value && value !== 0) return '¥0.00';
  return `¥${Number(value).toLocaleString('zh-CN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
};

const formatDateTime = (date) => {
  if (!date) return '-';
  return dayjs(date).format('YYYY-MM-DD HH:mm:ss');
};

const maskIdCard = (idCard) => {
  if (!idCard) return '-';
  if (idCard.length <= 10) return idCard;
  return idCard.slice(0, 6) + '********' + idCard.slice(-4);
};

const maskPhone = (phone) => {
  if (!phone) return '-';
  if (phone.length <= 7) return phone;
  return phone.slice(0, 3) + '****' + phone.slice(-4);
};

const OrderDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [order, setOrder] = useState(null);
  const [items, setItems] = useState([]);
  const [payModalVisible, setPayModalVisible] = useState(false);
  const [refundModalVisible, setRefundModalVisible] = useState(false);
  const [payForm] = Form.useForm();
  const [refundForm] = Form.useForm();

  const fetchOrderDetail = async () => {
    setLoading(true);
    try {
      const res = await orderAPI.get(id);
      setOrder(res.data.order || res.data);
      setItems(res.data.items || []);
    } catch (err) {
      message.error(err.response?.data?.message || '获取订单详情失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (id) {
      fetchOrderDetail();
    }
  }, [id]);

  const handlePay = async () => {
    try {
      const values = await payForm.validateFields();
      await orderAPI.pay(id, { paymentMethod: values.paymentMethod });
      message.success('支付成功');
      setPayModalVisible(false);
      fetchOrderDetail();
    } catch (err) {
      if (err.errorFields) return;
      message.error(err.response?.data?.message || '支付失败');
    }
  };

  const handleRefund = async () => {
    try {
      const values = await refundForm.validateFields();
      await orderAPI.refund(id, { reason: values.reason });
      message.success('退票成功');
      setRefundModalVisible(false);
      fetchOrderDetail();
    } catch (err) {
      if (err.errorFields) return;
      message.error(err.response?.data?.message || '退票失败');
    }
  };

  const openPayModal = () => {
    payForm.resetFields();
    setPayModalVisible(true);
  };

  const openRefundModal = () => {
    refundForm.resetFields();
    setRefundModalVisible(true);
  };

  const statusInfo = order?.paymentStatus
    ? statusMap[order.paymentStatus]
    : { text: '未知', color: 'default' };

  const seatColumns = [
    {
      title: '座位号',
      key: 'seat',
      width: 120,
      render: (_, record) =>
        record.rowLabel && record.seatNumber
          ? `${record.rowLabel}排${record.seatNumber}号`
          : '-',
    },
    {
      title: '区域',
      dataIndex: 'zoneName',
      key: 'zoneName',
      width: 120,
      render: (text) => text || '-',
    },
    {
      title: '单价',
      dataIndex: 'originalPrice',
      key: 'originalPrice',
      width: 120,
      render: (price) => formatCurrency(price),
    },
    {
      title: '优惠价',
      dataIndex: 'discountPrice',
      key: 'discountPrice',
      width: 120,
      render: (price) => formatCurrency(price),
    },
    {
      title: '优惠名称',
      dataIndex: 'discountName',
      key: 'discountName',
      render: (text) => text || '-',
    },
  ];

  if (loading && !order) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: 400 }}>
        <Spin size="large" />
      </div>
    );
  }

  return (
    <div>
      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Space>
          <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/orders')}>
            返回列表
          </Button>
          <h2 style={{ margin: 0 }}>订单详情</h2>
        </Space>
        <Space>
          {order?.paymentStatus === 'pending' && (
            <Button type="primary" icon={<PayCircleOutlined />} onClick={openPayModal}>
              立即支付
            </Button>
          )}
          {order?.paymentStatus === 'paid' && (
            <Button danger icon={<RollbackOutlined />} onClick={openRefundModal}>
              申请退票
            </Button>
          )}
        </Space>
      </div>

      <Card bordered={false} style={{ borderRadius: 8, marginBottom: 16 }}>
        <Descriptions column={4} size="middle">
          <Descriptions.Item
            label={
              <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <ShoppingCartOutlined style={{ color: '#1890ff' }} />
                订单号
              </span>
            }
          >
            {order?.orderNo || '-'}
          </Descriptions.Item>
          <Descriptions.Item
            label={
              <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <InfoCircleOutlined style={{ color: '#1890ff' }} />
                订单状态
              </span>
            }
          >
            <Tag color={statusInfo.color}>{statusInfo.text}</Tag>
          </Descriptions.Item>
          <Descriptions.Item label="创建时间">{formatDateTime(order?.createdAt)}</Descriptions.Item>
          <Descriptions.Item label="支付时间">{formatDateTime(order?.paidAt)}</Descriptions.Item>
        </Descriptions>
      </Card>

      <Card
        title={
          <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <CalendarOutlined style={{ color: '#722ed1' }} />
            演出信息
          </span>
        }
        bordered={false}
        style={{ borderRadius: 8, marginBottom: 16 }}
      >
        <Descriptions column={3} size="middle">
          <Descriptions.Item
            label={
              <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <InfoCircleOutlined />
                剧目名称
              </span>
            }
          >
            {order?.performanceName || '-'}
          </Descriptions.Item>
          <Descriptions.Item
            label={
              <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <CalendarOutlined />
                场次时间
              </span>
            }
          >
            {order?.showDate && order?.startTime
              ? `${dayjs(order.showDate).format('YYYY-MM-DD')} ${order.startTime}`
              : '-'}
          </Descriptions.Item>
          <Descriptions.Item
            label={
              <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <EnvironmentOutlined />
                剧场
              </span>
            }
          >
            {order?.theaterName || '-'}
          </Descriptions.Item>
        </Descriptions>
      </Card>

      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={24} lg={12}>
          <Card
            title={
              <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <UserOutlined style={{ color: '#1890ff' }} />
                购票人信息
              </span>
            }
            bordered={false}
            style={{ borderRadius: 8, height: '100%' }}
          >
            <Descriptions column={1} size="middle">
              <Descriptions.Item
                label={
                  <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <UserOutlined />
                    姓名
                  </span>
                }
              >
                {order?.buyerName || '-'}
              </Descriptions.Item>
              <Descriptions.Item
                label={
                  <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <PhoneOutlined />
                    电话
                  </span>
                }
              >
                {maskPhone(order?.buyerPhone)}
              </Descriptions.Item>
              <Descriptions.Item
                label={
                  <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <IdcardOutlined />
                    证件号
                  </span>
                }
              >
                {maskIdCard(order?.idCard)}
              </Descriptions.Item>
            </Descriptions>
          </Card>
        </Col>
        <Col xs={24} lg={12}>
          <Card
            title={
              <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <MoneyCollectOutlined style={{ color: '#52c41a' }} />
                价格明细
              </span>
            }
            bordered={false}
            style={{ borderRadius: 8, height: '100%' }}
          >
            <Descriptions column={1} size="middle">
              <Descriptions.Item label="原价">{formatCurrency(order?.totalAmount)}</Descriptions.Item>
              <Descriptions.Item label="优惠">
                <span style={{ color: '#f5222d' }}>-{formatCurrency(order?.discountAmount)}</span>
              </Descriptions.Item>
              <Descriptions.Item label="实付">
                <span style={{ fontSize: 18, fontWeight: 600, color: '#52c41a' }}>
                  {formatCurrency(order?.actualAmount)}
                </span>
              </Descriptions.Item>
              <Descriptions.Item label="支付方式">
                {order?.paymentMethod ? paymentMethodMap[order.paymentMethod] || order.paymentMethod : '-'}
              </Descriptions.Item>
              <Descriptions.Item label="售票类型">
                {order?.orderType ? orderTypeMap[order.orderType] || order.orderType : '-'}
              </Descriptions.Item>
            </Descriptions>
          </Card>
        </Col>
      </Row>

      <Card
        title={
          <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <ShoppingCartOutlined style={{ color: '#faad14' }} />
            座位明细
          </span>
        }
        bordered={false}
        style={{ borderRadius: 8 }}
      >
        <Table
          columns={seatColumns}
          dataSource={items}
          rowKey="id"
          pagination={false}
          loading={loading}
        />
      </Card>

      {order?.remark && (
        <>
          <Divider style={{ margin: '24px 0 16px' }} />
          <Card title="备注" bordered={false} style={{ borderRadius: 8 }}>
            {order.remark}
          </Card>
        </>
      )}

      <Modal
        title="订单支付"
        open={payModalVisible}
        onOk={handlePay}
        onCancel={() => setPayModalVisible(false)}
        okText="确认支付"
        cancelText="取消"
        width={420}
      >
        <Form form={payForm} layout="vertical">
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
          <div
            style={{
              padding: 16,
              background: '#f6ffed',
              borderRadius: 8,
              textAlign: 'center',
            }}
          >
            <div style={{ color: '#8c8c8c', marginBottom: 8 }}>待支付金额</div>
            <div style={{ fontSize: 28, fontWeight: 600, color: '#52c41a' }}>
              {formatCurrency(order?.actualAmount)}
            </div>
          </div>
        </Form>
      </Modal>

      <Modal
        title="申请退票"
        open={refundModalVisible}
        onOk={handleRefund}
        onCancel={() => setRefundModalVisible(false)}
        okText="确认退票"
        cancelText="取消"
        okButtonProps={{ danger: true }}
        width={420}
      >
        <Form form={refundForm} layout="vertical">
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
          <div
            style={{
              padding: 16,
              background: '#fff1f0',
              borderRadius: 8,
              textAlign: 'center',
            }}
          >
            <div style={{ color: '#8c8c8c', marginBottom: 8 }}>预计退票金额</div>
            <div style={{ fontSize: 28, fontWeight: 600, color: '#f5222d' }}>
              {formatCurrency(order?.actualAmount)}
            </div>
          </div>
        </Form>
      </Modal>
    </div>
  );
};

export default OrderDetail;
