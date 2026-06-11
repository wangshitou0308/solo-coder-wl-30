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
  LockOutlined,
  UnlockOutlined,
  ClearOutlined,
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
  const [selectedSeatIds, setSelectedSeatIds] = useState([]);
  const [selectedDiscountIds, setSelectedDiscountIds] = useState([]);
  const [seatsLocked, setSeatsLocked] = useState(false);
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
        setSeatsLocked(false);
        setSelectedSeatIds([]);
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

  useEffect(() => {
    return () => {
      if (seatsLocked && selectedSeatIds.length > 0) {
        orderAPI.releaseSeats({
          showId,
          seatIds: selectedSeatIds,
        }).catch(() => {});
      }
    };
  }, [seatsLocked, selectedSeatIds, showId]);

  const selectedSeats = useMemo(() => {
    return seats.filter((s) => selectedSeatIds.includes(s.id));
  }, [seats, selectedSeatIds]);

  const handleSeatClick = (seat) => {
    if (seat.status === 'sold') {
      message.info('已售座位不可选择');
      return;
    }
    if (seat.status === 'locked' || seat.status === 'reserved') {
      message.info('该座位暂不可选（已被锁定/预留）');
      return;
    }
    if (seat.status === 'held') {
      message.info('该座位已被电话预留');
      return;
    }

    const isSelected = selectedSeatIds.includes(seat.id);

    if (isSelected) {
      if (seatsLocked) {
        message.info('座位已锁定，如需修改请先清空选座');
        return;
      }
      setSelectedSeatIds(selectedSeatIds.filter((id) => id !== seat.id));
      return;
    }

    if (seatsLocked) {
      message.info('座位已锁定，如需添加请先清空选座后重新选择');
      return;
    }

    const orderType = form.getFieldValue('orderType');
    const maxSeats = orderType === 'group' ? 100 : 20;
    if (selectedSeatIds.length >= maxSeats) {
      message.warning(`最多可选择${maxSeats}个座位（团体票支持更多，可切换售票类型为"团体票"）`);
      return;
    }

    setSelectedSeatIds([...selectedSeatIds, seat.id]);
  };

  const handleLockSeats = async () => {
    if (selectedSeatIds.length === 0) {
      message.warning('请先选择座位');
      return;
    }

    try {
      const res = await orderAPI.holdSeats({
        showId,
        seatIds: selectedSeatIds,
        holdMinutes: 15,
        buyerPhone: form.getFieldValue('buyerPhone') || '',
      });

      setSeatsLocked(true);
      setHoldExpiresAt(res.data.expiresAt);
      message.success(`已锁定${selectedSeatIds.length}个座位，请在15分钟内完成下单`);
      fetchTicketVersion();
    } catch (err) {
      message.error(err.response?.data?.message || '锁座失败，部分座位可能已被占用，请重新选择');
      fetchTicketVersion();
    }
  };

  const getSeatStyle = (seat) => {
    const isSelected = selectedSeatIds.includes(seat.id);
    const baseStyle = {
      width: 36,
      height: 36,
      margin: 3,
      borderRadius: 4,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontSize: 11,
      cursor: 'not-allowed',
      border: isSelected ? '2px solid #1890ff' : '2px solid transparent',
      transition: 'all 0.2s',
      boxSizing: 'border-box',
      userSelect: 'none',
    };

    const isClickable = seat.status === 'available';

    if (isSelected) {
      return { ...baseStyle, backgroundColor: '#1890ff', color: '#fff', cursor: 'pointer' };
    }

    if (!isClickable) {
      const zoneColor = zoneColors[seat.zoneName] || '#8c8c8c';
      switch (seat.status) {
        case 'sold':
          return { ...baseStyle, backgroundColor: '#d9d9d9', color: '#bfbfbf' };
        case 'locked':
          return { ...baseStyle, backgroundColor: '#fa8c16', color: '#fff' };
        case 'reserved':
          return { ...baseStyle, backgroundColor: '#1890ff', color: '#fff' };
        case 'held':
          return { ...baseStyle, backgroundColor: '#13c2c2', color: '#fff' };
        default:
          return { ...baseStyle, backgroundColor: zoneColor, opacity: 0.5, color: '#fff' };
      }
    }

    const zoneColor = zoneColors[seat.zoneName] || '#8c8c8c';
    return { ...baseStyle, backgroundColor: zoneColor, color: '#fff', cursor: 'pointer' };
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

      if (!seatsLocked) {
        try {
          const holdRes = await orderAPI.holdSeats({
            showId,
            seatIds: selectedSeatIds,
            holdMinutes: 15,
            buyerPhone: values.buyerPhone || '',
          });
          setHoldExpiresAt(holdRes.data.expiresAt);
          setSeatsLocked(true);
        } catch (holdErr) {
          message.error(holdErr.response?.data?.message || '锁座失败，部分座位可能已被占用');
          fetchTicketVersion();
          return;
        }
      }

      const orderData = {
        showId,
        seatIds: selectedSeatIds,
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
      setSelectedSeatIds([]);
      setSelectedDiscountIds([]);
      setHoldExpiresAt(null);
      setSeatsLocked(false);
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
    if (selectedSeatIds.length === 0) return;

    Modal.confirm({
      title: seatsLocked ? '确认释放锁定的座位？' : '确认清空选择？',
      content: seatsLocked
        ? `将释放已锁定的${selectedSeatIds.length}个座位，其他用户可以购买`
        : `将清空已选择的${selectedSeatIds.length}个座位`,
      okText: '确认清空',
      cancelText: '取消',
      onOk: async () => {
        if (seatsLocked && selectedSeatIds.length > 0) {
          try {
            await orderAPI.releaseSeats({
              showId,
              seatIds: selectedSeatIds,
            });
            message.success('座位已释放');
          } catch (err) {
            message.error('释放座位失败');
          }
        }
        setSelectedSeatIds([]);
        setSeatsLocked(false);
        setHoldExpiresAt(null);
        fetchTicketVersion();
      },
    });
  };

  const handleDiscountChange = (value) => {
    setSelectedDiscountIds(value || []);
  };

  const handleOrderTypeChange = (e) => {
    const newType = e.target.value;
    const maxSeats = newType === 'group' ? 100 : 20;
    if (selectedSeatIds.length > maxSeats) {
      message.warning(`当前已选${selectedSeatIds.length}个座位，普通售票最多${maxSeats}个，建议使用团体票`);
    }
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
          {Object.entries(seatStatusMap).map(([key, info]) => (
            <span key={key} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <span
                style={{
                  display: 'inline-block',
                  width: 16,
                  height: 16,
                  backgroundColor: info.bgColor,
                  borderRadius: 2,
                }}
              />
              {info.text}
            </span>
          ))}
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <span
              style={{
                display: 'inline-block',
                width: 16,
                height: 16,
                backgroundColor: '#1890ff',
                border: '2px solid #1890ff',
                borderRadius: 2,
              }}
            />
            已选
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
    {
      title: '操作',
      key: 'action',
      width: 60,
      render: (_, record) => (
        !seatsLocked && (
          <Button
            type="link"
            size="small"
            danger
            onClick={() => setSelectedSeatIds(selectedSeatIds.filter((id) => id !== record.id))}
          >
            移除
          </Button>
        )
      ),
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
              <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/sales')}>
                返回售票列表
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
          {holdExpiresAt && seatsLocked && (
            <div style={{ padding: '8px 12px', background: '#fffbe6', borderRadius: 4, display: 'inline-block' }}>
              <Text type="warning" strong>
                <LockOutlined /> 座位已锁定，剩余时间：{countdown}，请尽快完成下单
              </Text>
            </div>
          )}
          {!seatsLocked && selectedSeatIds.length > 0 && (
            <div style={{ padding: '8px 12px', background: '#e6f7ff', borderRadius: 4, display: 'inline-block' }}>
              <Text type="info" strong>
                <UnlockOutlined /> 已预选{selectedSeatIds.length}个座位，座位尚未锁定，请尽快「锁定座位」或「确认下单」
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
                  <Tag color={seatsLocked ? 'orange' : 'blue'}>
                    {seatsLocked ? '已锁定' : '预选中'} {selectedSeats.length} 张
                  </Tag>
                )}
              </Space>
            }
            size="small"
            extra={
              selectedSeats.length > 0 && (
                <Space>
                  {!seatsLocked && (
                    <Button
                      size="small"
                      icon={<LockOutlined />}
                      type="primary"
                      ghost
                      onClick={handleLockSeats}
                    >
                      锁定座位
                    </Button>
                  )}
                  <Button size="small" danger icon={<ClearOutlined />} onClick={handleClearSelection}>
                    清空
                  </Button>
                </Space>
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
                  请在左侧座位图中选择座位（点击可售座位选择，再次点击已选座位可取消）
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
                <Radio.Group onChange={handleOrderTypeChange}>
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
                    ? `${seatsLocked ? '确认下单' : '锁定并下单'} ¥${actualPrice.toFixed(2)}`
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
