import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Card,
  Form,
  Input,
  Select,
  Button,
  Table,
  Space,
  Typography,
  Tag,
  message,
  Modal,
  Divider,
  Row,
  Col,
  Radio,
  Spin,
} from 'antd';
import {
  ShoppingCartOutlined,
  ReloadOutlined,
  CheckOutlined,
  UserOutlined,
  PhoneOutlined,
  IdcardOutlined,
  ArrowLeftOutlined,
} from '@ant-design/icons';
import { useParams, useNavigate } from 'react-router-dom';
import dayjs from 'dayjs';
import { ticketAPI, orderAPI, showAPI } from '../../services/api';

const { Title, Text } = Typography;
const { Option } = Select;
const { TextArea } = Input;

const seatStatusMap = {
  available: { color: 'green', text: '可售', bgColor: '#52c41a' },
  sold: { color: 'default', text: '已售', bgColor: '#d9d9d9' },
  locked: { color: 'orange', text: '已锁', bgColor: '#fa8c16' },
  reserved: { color: 'blue', text: '预留', bgColor: '#1890ff' },
  held: { color: 'cyan', text: '电话预留', bgColor: '#13c2c2' },
};

const paymentMethodOptions = [
  { label: '线下现金', value: 'cash' },
  { label: '微信支付', value: 'wechat' },
  { label: '支付宝', value: 'alipay' },
  { label: '银行卡', value: 'card' },
];

const orderTypeOptions = [
  { label: '普通售票', value: 'normal' },
  { label: '电话预留', value: 'phone' },
  { label: '团体票', value: 'group' },
];

const zoneColors = {
  VIP: '#faad14',
  A: '#f5222d',
  B: '#52c41a',
  C: '#1890ff',
};

const SeatSales = () => {
  const { id: showId } = useParams();
  const navigate = useNavigate();
  const [form] = Form.useForm();

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [showInfo, setShowInfo] = useState(null);
  const [zones, setZones] = useState([]);
  const [discounts, setDiscounts] = useState([]);
  const [seats, setSeats] = useState([]);
  const [selectedSeats, setSelectedSeats] = useState([]);
  const [selectedDiscountIds, setSelectedDiscountIds] = useState([]);
  const [holdExpiresAt, setHoldExpiresAt] = useState(null);
  const [countdown, setCountdown] = useState('');

  const fetchShowInfo = useCallback(async () => {
    try {
      const res = await showAPI.get(showId);
      const data = res.data.show || res.data;
      setShowInfo(data);
    } catch (err) {
      message.error(err.response?.data?.message || '获取场次信息失败');
    }
  }, [showId]);

  const fetchTicketVersion = useCallback(async () => {
    try {
      const res = await ticketAPI.getTicketVersion(showId);
      const data = res.data;
      setZones(data.zones || []);
      setDiscounts(data.discounts || []);
      setSeats(data.seats || []);
    } catch (err) {
      message.error(err.response?.data?.message || '获取座位信息失败');
    }
  }, [showId]);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      await Promise.all([fetchShowInfo(), fetchTicketVersion()]);
    } finally {
      setLoading(false);
    }
  }, [fetchShowInfo, fetchTicketVersion]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    if (!holdExpiresAt) {
      setCountdown('');
      return;
    }

    const updateCountdown = () => {
      const now = dayjs();
      const expire = dayjs(holdExpiresAt);
      const diff = expire.diff(now, 'second');

      if (diff <= 0) {
        setHoldExpiresAt(null);
        setSelectedSeats([]);
        message.warning('锁座已过期，请重新选座');
        fetchTicketVersion();
        return;
      }

      const minutes = Math.floor(diff / 60);
      const seconds = diff % 60;
      setCountdown(`${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`);
    };

    updateCountdown();
    const timer = setInterval(updateCountdown, 1000);
    return () => clearInterval(timer);
  }, [holdExpiresAt, fetchTicketVersion]);

  const handleSeatClick = async (seat) => {
    if (seat.status === 'sold') {
      message.info('已售座位不可选择');
      return;
    }
    if (seat.status === 'locked' || seat.status === 'reserved' || seat.status === 'held') {
      message.info('该座位暂不可选');
      return;
    }

    const isSelected = selectedSeats.some((s) => s.id === seat.id);

    if (isSelected) {
      setSelectedSeats(selectedSeats.filter((s) => s.id !== seat.id));
      return;
    }

    if (selectedSeats.length >= 10) {
      message.warning('最多可选择10个座位');
      return;
    }

    const newSelectedSeats = [...selectedSeats, seat];

    try {
      const res = await orderAPI.holdSeats({
        showId,
        seatIds: newSelectedSeats.map((s) => s.id),
        holdMinutes: 15,
        buyerPhone: form.getFieldValue('buyerPhone') || '',
      });

      setSelectedSeats(newSelectedSeats);
      setHoldExpiresAt(res.data.expiresAt);

      setSeats((prevSeats) =>
        prevSeats.map((s) =>
          newSelectedSeats.some((ns) => ns.id === s.id)
            ? { ...s, status: 'held' }
            : s
        )
      );
    } catch (err) {
      message.error(err.response?.data?.message || '锁座失败');
    }
  };

  const getSeatStyle = (seat) => {
    const isSelected = selectedSeats.some((s) => s.id === seat.id);
    const baseStyle = {
      width: 36,
      height: 36,
      margin: 3,
      borderRadius: 4,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontSize: 11,
      cursor: seat.status === 'sold' || seat.status === 'locked' || seat.status === 'reserved' || seat.status === 'held'
        ? 'not-allowed'
        : 'pointer',
      border: isSelected ? '2px solid #1890ff' : '2px solid transparent',
      transition: 'all 0.2s',
      boxSizing: 'border-box',
    };

    if (isSelected) {
      return { ...baseStyle, backgroundColor: '#1890ff', color: '#fff' };
    }

    const zoneColor = zoneColors[seat.zoneName] || '#8c8c8c';

    switch (seat.status) {
      case 'available':
        return { ...baseStyle, backgroundColor: zoneColor, color: '#fff' };
      case 'sold':
        return { ...baseStyle, backgroundColor: '#d9d9d9', color: '#bfbfbf' };
      case 'locked':
        return { ...baseStyle, backgroundColor: '#fa8c16', color: '#fff' };
      case 'reserved':
        return { ...baseStyle, backgroundColor: '#1890ff', color: '#fff' };
      case 'held':
        return { ...baseStyle, backgroundColor: '#13c2c2', color: '#fff' };
      default:
        return { ...baseStyle, backgroundColor: zoneColor, color: '#fff' };
    }
  };

  const calculateDiscount = useCallback(() => {
    if (selectedDiscountIds.length === 0 || selectedSeats.length === 0) {
      return 0;
    }

    let totalDiscount = 0;
    const selectedDiscounts = discounts.filter((d) => selectedDiscountIds.includes(d.id));

    selectedSeats.forEach((seat, index) => {
      const discount = selectedDiscounts[index % selectedDiscounts.length];
      if (!discount) return;

      const basePrice = seat.price || seat.basePrice || 0;
      if (discount.discountType === 'percentage') {
        totalDiscount += basePrice * (discount.discountValue / 100);
      } else if (discount.discountType === 'fixed') {
        totalDiscount += Math.min(discount.discountValue, basePrice);
      }
    });

    return totalDiscount;
  }, [selectedDiscountIds, selectedSeats, discounts]);

  const totalPrice = useMemo(() => {
    return selectedSeats.reduce((sum, seat) => {
      return sum + (seat.price || seat.basePrice || 0);
    }, 0);
  }, [selectedSeats]);

  const discountAmount = useMemo(() => calculateDiscount(), [calculateDiscount]);
  const actualPrice = totalPrice - discountAmount;

  const handleSubmit = async () => {
    if (selectedSeats.length === 0) {
      message.warning('请先选择座位');
      return;
    }

    try {
      const values = await form.validateFields();
      setSubmitting(true);

      const orderData = {
        showId,
        seatIds: selectedSeats.map((s) => s.id),
        buyerName: values.buyerName,
        buyerPhone: values.buyerPhone,
        idCard: values.idCard,
        discountRuleIds: selectedDiscountIds.length > 0 ? selectedDiscountIds : undefined,
        paymentMethod: values.payNow ? values.paymentMethod : undefined,
        orderType: values.orderType,
        remark: values.remark,
      };

      const res = await orderAPI.create(orderData);
      const orderId = res.data.orderId;

      if (orderId && values.payNow && values.paymentMethod) {
        try {
          await orderAPI.pay(orderId, { paymentMethod: values.paymentMethod });
          message.success('订单创建并支付成功');
        } catch (payErr) {
          message.warning('订单创建成功，但支付失败，请稍后重试');
        }
      } else {
        message.success('订单创建成功');
      }

      form.resetFields();
      setSelectedSeats([]);
      setSelectedDiscountIds([]);
      setHoldExpiresAt(null);
      fetchTicketVersion();

      setTimeout(() => {
        navigate(`/orders/${orderId}`);
      }, 1000);
    } catch (err) {
      if (err.errorFields) {
        message.error('请检查表单填写是否正确');
      } else {
        message.error(err.response?.data?.message || '提交订单失败');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleClearSelection = () => {
    Modal.confirm({
      title: '确认清空选择？',
      content: '清空后已锁座位将被释放',
      onOk: () => {
        setSelectedSeats([]);
        setHoldExpiresAt(null);
        fetchTicketVersion();
      },
    });
  };

  const handleDiscountChange = (value) => {
    setSelectedDiscountIds(value || []);
  };

  const uniqueZones = useMemo(() => {
    return [...new Set(seats.map((s) => s.zoneName))].filter(Boolean);
  }, [seats]);

  const renderSeatChart = () => {
    if (seats.length === 0) {
      return (
        <div style={{ textAlign: 'center', padding: '60px 0', color: '#999' }}>
          暂无座位数据，请先配置票版
        </div>
      );
    }

    return (
      <div>
        <Space style={{ marginBottom: 16, flexWrap: 'wrap' }}>
          <span>图例：</span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <span
              style={{
                display: 'inline-block',
                width: 16,
                height: 16,
                backgroundColor: '#52c41a',
                borderRadius: 2,
              }}
            />
            可售
          </span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <span
              style={{
                display: 'inline-block',
                width: 16,
                height: 16,
                backgroundColor: '#1890ff',
                borderRadius: 2,
              }}
            />
            已选
          </span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <span
              style={{
                display: 'inline-block',
                width: 16,
                height: 16,
                backgroundColor: '#d9d9d9',
                borderRadius: 2,
              }}
            />
            已售
          </span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <span
              style={{
                display: 'inline-block',
                width: 16,
                height: 16,
                backgroundColor: '#fa8c16',
                borderRadius: 2,
              }}
            />
            已锁
          </span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <span
              style={{
                display: 'inline-block',
                width: 16,
                height: 16,
                backgroundColor: '#13c2c2',
                borderRadius: 2,
              }}
            />
            电话预留
          </span>
        </Space>

        {uniqueZones.map((zone) => {
          const zoneSeats = seats.filter((s) => s.zoneName === zone);
          const rows = [...new Set(zoneSeats.map((s) => s.rowLabel))];
          const zoneInfo = zones.find((z) => z.zoneName === zone);

          return (
            <Card
              key={zone}
              title={
                <Space>
                  <span>{zone}区</span>
                  <Tag color="blue">{zoneSeats.length}个座位</Tag>
                  {zoneInfo && <Tag color="orange">¥{zoneInfo.basePrice}</Tag>}
                </Space>
              }
              style={{ marginBottom: 16 }}
              size="small"
            >
              <div style={{ overflowX: 'auto', padding: '0 20px' }}>
                <div style={{ textAlign: 'center', marginBottom: 16, color: '#8c8c8c', fontWeight: 500 }}>
                  ━━━━━ 舞台方向 ━━━━━
                </div>
                {rows.map((row) => (
                  <div
                    key={row}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      marginBottom: 4,
                      justifyContent: 'center',
                    }}
                  >
                    <Text style={{ width: 40, textAlign: 'right', marginRight: 8, fontSize: 12, color: '#8c8c8c' }}>
                      {row}
                    </Text>
                    {zoneSeats
                      .filter((s) => s.rowLabel === row)
                      .sort((a, b) => {
                        const aNum = parseInt(a.seatNumber) || 0;
                        const bNum = parseInt(b.seatNumber) || 0;
                        return aNum - bNum;
                      })
                      .map((seat) => (
                        <div
                          key={seat.id}
                          style={getSeatStyle(seat)}
                          onClick={() => handleSeatClick(seat)}
                          title={`${seat.rowLabel}排${seat.seatNumber}号 - ${seatStatusMap[seat.status]?.text || seat.status} - ¥${seat.price || seat.basePrice}`}
                        >
                          {seat.seatNumber}
                        </div>
                      ))}
                    <Text style={{ width: 40, textAlign: 'left', marginLeft: 8, fontSize: 12, color: '#8c8c8c' }}>
                      {row}
                    </Text>
                  </div>
                ))}
              </div>
            </Card>
          );
        })}
      </div>
    );
  };

  const selectedSeatsColumns = [
    {
      title: '座位',
      key: 'seat',
      render: (_, record) => (
        <Space>
          <span>{record.rowLabel}排{record.seatNumber}号</span>
          <Tag color="blue">{record.zoneName}区</Tag>
        </Space>
      ),
    },
    {
      title: '票价',
      dataIndex: 'price',
      key: 'price',
      width: 80,
      render: (text, record) => `¥${record.price || record.basePrice || 0}`,
    },
  ];

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '80vh' }}>
        <Spin size="large" />
      </div>
    );
  }

  const statusMap = {
    draft: { text: '待上架', color: 'default' },
    onsale: { text: '售票中', color: 'green' },
    soldout: { text: '售罄', color: 'orange' },
    cancelled: { text: '已取消', color: 'red' },
    ended: { text: '已结束', color: 'purple' },
  };

  return (
    <div>
      <Card style={{ marginBottom: 16 }}>
        <Space direction="vertical" size="small" style={{ width: '100%' }}>
          <Space style={{ width: '100%', justifyContent: 'space-between' }}>
            <Space>
              <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/shows')}>
                返回列表
              </Button>
              <Title level={4} style={{ margin: 0 }}>
                售票选座
              </Title>
            </Space>
            <Button icon={<ReloadOutlined />} onClick={loadData}>
              刷新
            </Button>
          </Space>
          {showInfo && (
            <Row gutter={24}>
              <Col span={6}>
                <Text strong>演出剧目：</Text>
                <Text>{showInfo.performanceName || '-'}</Text>
              </Col>
              <Col span={6}>
                <Text strong>演出时间：</Text>
                <Text>
                  {showInfo.showDate ? dayjs(showInfo.showDate).format('YYYY-MM-DD') : '-'}
                  {' '}{showInfo.startTime || '-'}
                </Text>
              </Col>
              <Col span={6}>
                <Text strong>演出剧场：</Text>
                <Text>{showInfo.theaterName || '-'}</Text>
              </Col>
              <Col span={6}>
                <Text strong>状态：</Text>
                <Tag color={statusMap[showInfo.status]?.color || 'default'}>
                  {statusMap[showInfo.status]?.text || showInfo.status}
                </Tag>
              </Col>
            </Row>
          )}
          {holdExpiresAt && (
            <div style={{ padding: '8px 12px', background: '#fffbe6', borderRadius: 4, display: 'inline-block' }}>
              <Text type="warning" strong>
                ⏱ 锁座剩余时间：{countdown}，请尽快完成下单
              </Text>
            </div>
          )}
        </Space>
      </Card>

      <Row gutter={16}>
        <Col span={16}>
          <Card title="座位图" size="small">
            {renderSeatChart()}
          </Card>
        </Col>

        <Col span={8}>
          <Card
            title={
              <Space>
                <ShoppingCartOutlined />
                <span>订单信息</span>
                {selectedSeats.length > 0 && (
                  <Tag color="blue">{selectedSeats.length} 张</Tag>
                )}
              </Space>
            }
            size="small"
            extra={
              selectedSeats.length > 0 && (
                <Button size="small" danger onClick={handleClearSelection}>
                  清空
                </Button>
              )
            }
          >
            <Form
              form={form}
              layout="vertical"
              initialValues={{
                paymentMethod: 'cash',
                orderType: 'normal',
                payNow: true,
              }}
            >
              <Title level={5} style={{ marginTop: 0 }}>已选座位</Title>
              {selectedSeats.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '24px 0', color: '#999' }}>
                  请在左侧座位图中选择座位
                </div>
              ) : (
                <Table
                  size="small"
                  dataSource={selectedSeats}
                  columns={selectedSeatsColumns}
                  rowKey="id"
                  pagination={false}
                />
              )}

              <Divider style={{ margin: '16px 0' }} />

              <Title level={5}>票价汇总</Title>
              <div style={{ marginBottom: 16, padding: '12px', background: '#fafafa', borderRadius: 4 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                  <Text type="secondary">票价总计：</Text>
                  <Text>¥{totalPrice.toFixed(2)}</Text>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                  <Text type="secondary">优惠金额：</Text>
                  <Text type="success">-¥{discountAmount.toFixed(2)}</Text>
                </div>
                <Divider style={{ margin: '8px 0' }} />
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 18, fontWeight: 'bold' }}>
                  <Text>实付金额：</Text>
                  <Text type="danger">¥{actualPrice.toFixed(2)}</Text>
                </div>
              </div>

              <Form.Item label="优惠选择">
                <Select
                  mode="multiple"
                  placeholder="请选择优惠（可选）"
                  allowClear
                  value={selectedDiscountIds}
                  onChange={handleDiscountChange}
                  maxTagCount="responsive"
                >
                  {discounts.map((d) => (
                    <Option key={d.id} value={d.id}>
                      {d.name} ({d.discountType === 'percentage' ? `${d.discountValue}%折扣` : `立减${d.discountValue}元`})
                    </Option>
                  ))}
                </Select>
              </Form.Item>

              <Divider style={{ margin: '16px 0' }} />

              <Title level={5}>购票人信息</Title>

              <Form.Item
                name="buyerName"
                label="姓名"
                rules={[{ required: true, message: '请输入姓名' }]}
              >
                <Input prefix={<UserOutlined />} placeholder="请输入购票人姓名" />
              </Form.Item>

              <Form.Item
                name="buyerPhone"
                label="电话"
                rules={[
                  { required: true, message: '请输入手机号' },
                  { pattern: /^1[3-9]\d{9}$/, message: '请输入正确的手机号' },
                ]}
              >
                <Input prefix={<PhoneOutlined />} placeholder="请输入手机号" maxLength={11} />
              </Form.Item>

              <Form.Item
                name="idCard"
                label="证件号"
                rules={[
                  {
                    pattern: /(^\d{15}$)|(^\d{17}(\d|X|x)$)/,
                    message: '请输入正确的身份证号',
                  },
                ]}
              >
                <Input prefix={<IdcardOutlined />} placeholder="请输入身份证号（可选）" maxLength={18} />
              </Form.Item>

              <Divider style={{ margin: '16px 0' }} />

              <Title level={5}>售票类型</Title>

              <Form.Item
                name="orderType"
                rules={[{ required: true, message: '请选择售票类型' }]}
              >
                <Radio.Group>
                  {orderTypeOptions.map((opt) => (
                    <Radio key={opt.value} value={opt.value}>
                      {opt.label}
                    </Radio>
                  ))}
                </Radio.Group>
              </Form.Item>

              <Divider style={{ margin: '16px 0' }} />

              <Title level={5}>支付方式</Title>

              <Form.Item
                name="paymentMethod"
                rules={[{ required: true, message: '请选择支付方式' }]}
              >
                <Select placeholder="请选择支付方式">
                  {paymentMethodOptions.map((opt) => (
                    <Option key={opt.value} value={opt.value}>
                      {opt.label}
                    </Option>
                  ))}
                </Select>
              </Form.Item>

              <Form.Item name="payNow" valuePropName="checked">
                <Radio.Group>
                  <Radio value={true}>立即支付</Radio>
                  <Radio value={false}>仅创建订单</Radio>
                </Radio.Group>
              </Form.Item>

              <Form.Item name="remark" label="备注">
                <TextArea rows={2} placeholder="请输入备注（可选）" maxLength={200} showCount />
              </Form.Item>

              <Form.Item style={{ marginBottom: 0 }}>
                <Button
                  type="primary"
                  icon={<CheckOutlined />}
                  loading={submitting}
                  disabled={selectedSeats.length === 0}
                  onClick={handleSubmit}
                  block
                  size="large"
                >
                  {selectedSeats.length > 0
                    ? `确认下单 ¥${actualPrice.toFixed(2)}`
                    : '请先选择座位'}
                </Button>
              </Form.Item>
            </Form>
          </Card>
        </Col>
      </Row>
    </div>
  );
};

export default SeatSales;
