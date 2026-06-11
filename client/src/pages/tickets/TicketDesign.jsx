import React, { useState, useEffect, useCallback } from 'react';
import {
  Tabs,
  Form,
  List,
  Card,
  Button,
  Modal,
  DatePicker,
  Select,
  InputNumber,
  Table,
  Space,
  Typography,
  message,
  Tag,
  Row,
  Col,
  Divider,
  Popconfirm,
  Input,
} from 'antd';
import {
  PlusOutlined,
  DeleteOutlined,
  LockOutlined,
  UnlockOutlined,
  ReloadOutlined,
  SaveOutlined,
  ArrowLeftOutlined,
} from '@ant-design/icons';
import { useParams, useNavigate } from 'react-router-dom';
import dayjs from 'dayjs';
import { ticketAPI, showAPI } from '../../services/api';
import { useAuth } from '../../context/AuthContext';

const { Title, Text } = Typography;
const { Option } = Select;
const { RangePicker } = DatePicker;
const { TextArea } = Input;

const zoneOptions = [
  { label: 'VIP区', value: 'VIP' },
  { label: 'A区', value: 'A' },
  { label: 'B区', value: 'B' },
  { label: 'C区', value: 'C' },
];

const ruleTypeOptions = [
  { label: '早鸟优惠', value: 'early_bird' },
  { label: '学生优惠', value: 'student' },
  { label: '双人优惠', value: 'couple' },
  { label: '家庭优惠', value: 'family' },
  { label: '团体优惠', value: 'group' },
];

const discountTypeOptions = [
  { label: '百分比折扣', value: 'percentage' },
  { label: '固定金额减免', value: 'fixed' },
];

const lockTypeOptions = [
  { label: '媒体锁座', value: 'media' },
  { label: '嘉宾锁座', value: 'guest' },
];

const seatStatusMap = {
  available: { color: 'green', text: '可售' },
  locked: { color: 'orange', text: '已锁' },
  sold: { color: 'red', text: '已售' },
  reserved: { color: 'blue', text: '预留' },
  held: { color: 'cyan', text: '电话预留' },
};

const TicketDesign = () => {
  const [form] = Form.useForm();
  const [lockForm] = Form.useForm();
  const { id: showId } = useParams();
  const navigate = useNavigate();
  const { hasRole } = useAuth();
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [showInfo, setShowInfo] = useState(null);
  const [zones, setZones] = useState([]);
  const [discounts, setDiscounts] = useState([]);
  const [seats, setSeats] = useState([]);
  const [selectedSeats, setSelectedSeats] = useState([]);
  const [lockModalVisible, setLockModalVisible] = useState(false);
  const [activeTab, setActiveTab] = useState('zones');
  const [versionInfo, setVersionInfo] = useState(null);
  const canEdit = hasRole('scheduler', 'manager');

  const fetchShowInfo = useCallback(async () => {
    try {
      const res = await showAPI.get(showId);
      setShowInfo(res.data.show || res.data);
    } catch (err) {
      console.error('获取场次信息失败:', err);
    }
  }, [showId]);

  const fetchTicketVersion = useCallback(async () => {
    setInitialLoading(true);
    try {
      const res = await ticketAPI.getTicketVersion(showId);
      const data = res.data;
      setVersionInfo(data.version || null);
      setZones(data.zones || []);
      setDiscounts(data.discounts || []);
      setSeats(data.seats || []);
      
      if (data.zones && data.zones.length > 0) {
        form.setFieldsValue({
          zones: data.zones.map(z => ({
            zoneName: z.zoneName,
            basePrice: z.basePrice,
            seatCount: z.seatCount,
          })),
          discounts: data.discounts || [],
        });
      }
    } catch (err) {
      console.error('获取票版信息失败:', err);
      setZones([]);
      setDiscounts([]);
      setSeats([]);
    } finally {
      setInitialLoading(false);
    }
  }, [showId, form]);

  useEffect(() => {
    fetchShowInfo();
    fetchTicketVersion();
  }, [fetchShowInfo, fetchTicketVersion]);

  const handleSaveTicketVersion = async () => {
    try {
      const values = await form.validateFields();
      setLoading(true);
      
      const submitData = {
        name: '标准票版',
        zones: values.zones || [],
        discounts: values.discounts?.map(d => ({
          ...d,
          startDate: d.dateRange?.[0]?.format('YYYY-MM-DD HH:mm:ss'),
          endDate: d.dateRange?.[1]?.format('YYYY-MM-DD HH:mm:ss'),
        })) || [],
      };

      await ticketAPI.createTicketVersion(showId, submitData);
      message.success('票版保存成功');
      fetchTicketVersion();
    } catch (err) {
      if (err.errorFields) {
        message.error('请检查表单填写是否正确');
      } else {
        message.error(err.response?.data?.message || '保存失败');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSeatClick = (seat) => {
    if (seat.status === 'sold') {
      message.info('已售座位不可操作');
      return;
    }
    const isSelected = selectedSeats.some((s) => s.id === seat.id);
    if (isSelected) {
      setSelectedSeats(selectedSeats.filter((s) => s.id !== seat.id));
    } else {
      setSelectedSeats([...selectedSeats, seat]);
    }
  };

  const handleLockSeats = async () => {
    if (selectedSeats.length === 0) {
      message.warning('请先选择要锁座的座位');
      return;
    }
    try {
      const values = await lockForm.validateFields();
      setLoading(true);
      
      const lockData = {
        lockType: values.lockType,
        lockExpiresAt: values.lockExpiresAt?.toISOString(),
      };

      for (const seat of selectedSeats) {
        try {
          await ticketAPI.lockSeat(showId, seat.id, lockData);
        } catch (e) {
          console.error('锁座失败:', e);
        }
      }
      
      message.success(`成功锁定 ${selectedSeats.length} 个座位`);
      setLockModalVisible(false);
      setSelectedSeats([]);
      lockForm.resetFields();
      fetchTicketVersion();
    } catch (err) {
      message.error(err.response?.data?.message || '锁座失败');
    } finally {
      setLoading(false);
    }
  };

  const handleUnlockSeats = async () => {
    if (selectedSeats.length === 0) {
      message.warning('请先选择要解锁的座位');
      return;
    }
    const lockedSeats = selectedSeats.filter((s) => s.status === 'locked');
    if (lockedSeats.length === 0) {
      message.warning('所选座位中没有已锁定的座位');
      return;
    }
    try {
      setLoading(true);
      for (const seat of lockedSeats) {
        try {
          await ticketAPI.unlockSeat(showId, seat.id);
        } catch (e) {
          console.error('解锁失败:', e);
        }
      }
      message.success(`成功解锁 ${lockedSeats.length} 个座位`);
      setSelectedSeats([]);
      fetchTicketVersion();
    } catch (err) {
      message.error(err.response?.data?.message || '解锁失败');
    } finally {
      setLoading(false);
    }
  };

  const handleReleaseExpiredLocks = async () => {
    try {
      setLoading(true);
      const res = await ticketAPI.releaseExpiredLocks();
      message.success(res.data.message || '释放过期锁座成功');
      fetchTicketVersion();
    } catch (err) {
      message.error(err.response?.data?.message || '释放过期锁座失败');
    } finally {
      setLoading(false);
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
      cursor: seat.status === 'sold' ? 'not-allowed' : 'pointer',
      border: isSelected ? '2px solid #1890ff' : '1px solid transparent',
      transition: 'all 0.2s',
    };

    const zoneColors = {
      VIP: '#faad14',
      A: '#f5222d',
      B: '#52c41a',
      C: '#1890ff',
    };

    const bgColor = zoneColors[seat.zoneName] || '#8c8c8c';

    switch (seat.status) {
      case 'available':
        return { ...baseStyle, backgroundColor: bgColor, color: '#fff' };
      case 'locked':
        return { ...baseStyle, backgroundColor: '#fa8c16', color: '#fff' };
      case 'sold':
        return { ...baseStyle, backgroundColor: '#d9d9d9', color: '#bfbfbf' };
      case 'reserved':
        return { ...baseStyle, backgroundColor: '#1890ff', color: '#fff' };
      case 'held':
        return { ...baseStyle, backgroundColor: '#13c2c2', color: '#fff' };
      default:
        return { ...baseStyle, backgroundColor: bgColor, color: '#fff' };
    }
  };

  const seatColumns = [
    {
      title: '座位号',
      dataIndex: 'id',
      key: 'id',
      width: 80,
    },
    {
      title: '区域',
      dataIndex: 'zoneName',
      key: 'zoneName',
      width: 80,
      render: (text) => text ? <Tag color="blue">{text}区</Tag> : '-',
    },
    {
      title: '排号',
      dataIndex: 'rowLabel',
      key: 'rowLabel',
      width: 80,
      render: (text) => text || '-',
    },
    {
      title: '座号',
      dataIndex: 'seatNumber',
      key: 'seatNumber',
      width: 80,
      render: (text) => text || '-',
    },
    {
      title: '票价',
      dataIndex: 'price',
      key: 'price',
      width: 100,
      render: (text) => text ? `¥${text}` : '-',
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 100,
      render: (status) => {
        const info = seatStatusMap[status] || { color: 'default', text: status };
        return <Tag color={info.color}>{info.text}</Tag>;
      },
    },
    {
      title: '锁座类型',
      dataIndex: 'lockType',
      key: 'lockType',
      width: 100,
      render: (text) => {
        if (!text) return '-';
        const map = { media: '媒体', guest: '嘉宾', order: '订单', reservation: '预留' };
        return map[text] || text;
      },
    },
    {
      title: '过期时间',
      dataIndex: 'lockExpiresAt',
      key: 'lockExpiresAt',
      render: (text) => (text ? dayjs(text).format('YYYY-MM-DD HH:mm') : '-'),
    },
  ];

  const renderZonesTab = () => (
    <Form.List name="zones">
      {(fields, { add, remove }) => (
        <>
          <Card
            title="座位分区配置"
            extra={
              canEdit && (
                <Button
                  type="primary"
                  icon={<PlusOutlined />}
                  onClick={() => add({ zoneName: 'VIP', basePrice: 0, seatCount: 0 })}
                  disabled={showInfo?.status !== 'draft'}
                >
                  添加分区
                </Button>
              )
            }
          >
            <List
              dataSource={fields}
              renderItem={(field, index) => (
                <Card
                  size="small"
                  style={{ marginBottom: 16 }}
                  extra={
                    canEdit && showInfo?.status === 'draft' ? (
                      <Button
                        type="text"
                        danger
                        icon={<DeleteOutlined />}
                        onClick={() => remove(field.name)}
                      >
                        删除
                      </Button>
                    ) : null
                  }
                >
                  <Row gutter={16} align="middle">
                    <Col span={6}>
                      <Form.Item
                        name={[field.name, 'zoneName']}
                        label="分区名称"
                        rules={[{ required: true, message: '请选择分区' }]}
                        style={{ marginBottom: 0 }}
                      >
                        <Select placeholder="请选择分区">
                          {zoneOptions.map((option) => (
                            <Option key={option.value} value={option.value}>
                              {option.label}
                            </Option>
                          ))}
                        </Select>
                      </Form.Item>
                    </Col>
                    <Col span={6}>
                      <Form.Item
                        name={[field.name, 'basePrice']}
                        label="基础票价"
                        rules={[
                          { required: true, message: '请输入票价' },
                          { type: 'number', min: 0, message: '票价不能为负数' },
                        ]}
                        style={{ marginBottom: 0 }}
                      >
                        <InputNumber
                          min={0}
                          placeholder="请输入票价"
                          style={{ width: '100%' }}
                          prefix="¥"
                        />
                      </Form.Item>
                    </Col>
                    <Col span={6}>
                      <Form.Item
                        name={[field.name, 'seatCount']}
                        label="座位数量"
                        rules={[
                          { required: true, message: '请输入座位数' },
                          { type: 'number', min: 1, message: '座位数至少为1' },
                        ]}
                        style={{ marginBottom: 0 }}
                      >
                        <InputNumber
                          min={1}
                          placeholder="请输入座位数"
                          style={{ width: '100%' }}
                          suffix="个"
                        />
                      </Form.Item>
                    </Col>
                    <Col span={6}>
                      <Text type="secondary">
                        预计收入：¥
                        {(form.getFieldValue('zones')?.[index]?.basePrice || 0) *
                          (form.getFieldValue('zones')?.[index]?.seatCount || 0)}
                      </Text>
                    </Col>
                  </Row>
                </Card>
              )}
            />
            {fields.length === 0 && (
              <div style={{ textAlign: 'center', padding: '40px 0', color: '#999' }}>
                暂无分区配置，点击上方"添加分区"按钮开始配置
              </div>
            )}
          </Card>
        </>
      )}
    </Form.List>
  );

  const renderDiscountRulesTab = () => (
    <Form.List name="discounts">
      {(fields, { add, remove }) => (
        <>
          <Card
            title="优惠规则配置"
            extra={
              canEdit && (
                <Button
                  type="primary"
                  icon={<PlusOutlined />}
                  onClick={() => add({
                    ruleType: 'early_bird',
                    name: '',
                    discountType: 'percentage',
                    discountValue: 0,
                    minTickets: 1,
                  })}
                  disabled={showInfo?.status !== 'draft'}
                >
                  添加规则
                </Button>
              )
            }
          >
            <List
              dataSource={fields}
              renderItem={(field, index) => (
                <Card
                  size="small"
                  style={{ marginBottom: 16 }}
                  extra={
                    canEdit && showInfo?.status === 'draft' ? (
                      <Button
                        type="text"
                        danger
                        icon={<DeleteOutlined />}
                        onClick={() => remove(field.name)}
                      >
                        删除
                      </Button>
                    ) : null
                  }
                >
                  <Row gutter={16}>
                    <Col span={8}>
                      <Form.Item
                        name={[field.name, 'ruleType']}
                        label="规则类型"
                        rules={[{ required: true, message: '请选择规则类型' }]}
                      >
                        <Select placeholder="请选择规则类型">
                          {ruleTypeOptions.map((option) => (
                            <Option key={option.value} value={option.value}>
                              {option.label}
                            </Option>
                          ))}
                        </Select>
                      </Form.Item>
                    </Col>
                    <Col span={8}>
                      <Form.Item
                        name={[field.name, 'name']}
                        label="规则名称"
                        rules={[{ required: true, message: '请输入规则名称' }]}
                      >
                        <Input placeholder="请输入规则名称" />
                      </Form.Item>
                    </Col>
                    <Col span={8}>
                      <Form.Item
                        name={[field.name, 'discountType']}
                        label="折扣类型"
                        rules={[{ required: true, message: '请选择折扣类型' }]}
                      >
                        <Select placeholder="请选择折扣类型">
                          {discountTypeOptions.map((option) => (
                            <Option key={option.value} value={option.value}>
                              {option.label}
                            </Option>
                          ))}
                        </Select>
                      </Form.Item>
                    </Col>
                    <Col span={8}>
                      <Form.Item
                        name={[field.name, 'discountValue']}
                        label="折扣值"
                        rules={[
                          { required: true, message: '请输入折扣值' },
                          { type: 'number', min: 0, message: '折扣值不能为负数' },
                        ]}
                      >
                        <InputNumber
                          min={0}
                          max={
                            form.getFieldValue('discounts')?.[index]?.discountType ===
                            'percentage'
                              ? 100
                              : undefined
                          }
                          placeholder="请输入折扣值"
                          style={{ width: '100%' }}
                          suffix={
                            form.getFieldValue('discounts')?.[index]?.discountType ===
                            'percentage'
                              ? '%'
                              : '元'
                          }
                        />
                      </Form.Item>
                    </Col>
                    <Col span={8}>
                      <Form.Item
                        name={[field.name, 'minTickets']}
                        label="最少票数"
                      >
                        <InputNumber
                          min={1}
                          placeholder="最少票数"
                          style={{ width: '100%' }}
                        />
                      </Form.Item>
                    </Col>
                    <Col span={8}>
                      <Form.Item
                        name={[field.name, 'dateRange']}
                        label="有效期"
                        rules={[{ required: true, message: '请选择有效期' }]}
                      >
                        <RangePicker
                          showTime
                          style={{ width: '100%' }}
                          format="YYYY-MM-DD HH:mm"
                        />
                      </Form.Item>
                    </Col>
                  </Row>
                </Card>
              )}
            />
            {fields.length === 0 && (
              <div style={{ textAlign: 'center', padding: '40px 0', color: '#999' }}>
                暂无优惠规则，点击上方"添加规则"按钮开始配置
              </div>
            )}
          </Card>
        </>
      )}
    </Form.List>
  );

  const renderSeatManagementTab = () => {
    const uniqueZones = [...new Set(seats.map((s) => s.zoneName))].filter(Boolean);

    return (
      <>
        <Card
          title="座位管理"
          extra={
            canEdit && (
              <Space>
                <Button
                  icon={<ReloadOutlined />}
                  onClick={handleReleaseExpiredLocks}
                  loading={loading}
                >
                  一键释放过期锁座
                </Button>
                <Button
                  type="primary"
                  icon={<LockOutlined />}
                  onClick={() => setLockModalVisible(true)}
                  disabled={selectedSeats.length === 0}
                >
                  锁座 ({selectedSeats.length})
                </Button>
                <Button
                  danger
                  icon={<UnlockOutlined />}
                  onClick={handleUnlockSeats}
                  disabled={selectedSeats.length === 0}
                  loading={loading}
                >
                  解锁座位
                </Button>
              </Space>
            )
          }
        >
          <Space style={{ marginBottom: 16 }}>
            <span>图例：</span>
            {Object.entries(seatStatusMap).map(([key, value]) => (
              <span key={key} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                <span
                  style={{
                    display: 'inline-block',
                    width: 16,
                    height: 16,
                    backgroundColor: value.color === 'green' ? '#52c41a' :
                                    value.color === 'orange' ? '#fa8c16' :
                                    value.color === 'red' ? '#f5222d' :
                                    value.color === 'blue' ? '#1890ff' :
                                    value.color === 'cyan' ? '#13c2c2' : '#8c8c8c',
                    borderRadius: 2,
                  }}
                />
                {value.text}
              </span>
            ))}
          </Space>

          {seats.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px 0', color: '#999' }}>
              请先在"座位分区"Tab中配置分区和座位数量，然后保存票版
            </div>
          ) : (
            uniqueZones.map((zone) => {
              const zoneSeats = seats.filter((s) => s.zoneName === zone);
              const rows = [...new Set(zoneSeats.map((s) => s.rowLabel))];
              return (
                <Card
                  key={zone}
                  title={`${zone}区 - ${zoneSeats.length}个座位`}
                  style={{ marginBottom: 16 }}
                  size="small"
                >
                  <div style={{ overflowX: 'auto', padding: '0 20px' }}>
                    <div style={{ textAlign: 'center', marginBottom: 16, color: '#8c8c8c' }}>
                      ━━━ 舞台 ━━━
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
                        <Text style={{ width: 40, textAlign: 'right', marginRight: 8, fontSize: 12 }}>
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
                              onClick={() => canEdit && handleSeatClick(seat)}
                              title={`${seat.rowLabel}排${seat.seatNumber}号 - ¥${seat.price}`}
                            >
                              {seat.seatNumber}
                            </div>
                          ))}
                        <Text style={{ width: 40, textAlign: 'left', marginLeft: 8, fontSize: 12 }}>
                          {row}
                        </Text>
                      </div>
                    ))}
                  </div>
                </Card>
              );
            })
          )}

          <Divider />

          <Card title="座位列表" size="small">
            <Table
              dataSource={seats}
              columns={seatColumns}
              rowKey="id"
              pagination={{ pageSize: 10 }}
              rowSelection={{
                selectedRowKeys: selectedSeats.map((s) => s.id),
                onChange: (_, selectedRows) => setSelectedSeats(selectedRows),
                getCheckboxProps: (record) => ({
                  disabled: !canEdit || record.status === 'sold',
                }),
              }}
              scroll={{ x: 800 }}
              size="small"
            />
          </Card>
        </Card>

        <Modal
          title="锁座"
          open={lockModalVisible}
          onOk={handleLockSeats}
          onCancel={() => {
            setLockModalVisible(false);
            lockForm.resetFields();
          }}
          confirmLoading={loading}
          okText="确认锁座"
          cancelText="取消"
          width={500}
        >
          <Form form={lockForm} layout="vertical">
            <Form.Item
              name="lockType"
              label="锁座类型"
              rules={[{ required: true, message: '请选择锁座类型' }]}
            >
              <Select placeholder="请选择锁座类型">
                {lockTypeOptions.map((option) => (
                  <Option key={option.value} value={option.value}>
                    {option.label}
                  </Option>
                ))}
              </Select>
            </Form.Item>
            <Form.Item
              name="lockExpiresAt"
              label="过期时间"
              rules={[{ required: true, message: '请选择过期时间' }]}
            >
              <DatePicker
                showTime
                style={{ width: '100%' }}
                format="YYYY-MM-DD HH:mm"
                minDate={dayjs()}
                placeholder="请选择过期时间"
              />
            </Form.Item>
            <div style={{ marginBottom: 16 }}>
              <Text type="secondary">
                已选择 {selectedSeats.length} 个座位进行锁座
              </Text>
            </div>
          </Form>
        </Modal>
      </>
    );
  };

  if (initialLoading) {
    return (
      <div style={{ textAlign: 'center', padding: '50px' }}>
        <div>加载中...</div>
      </div>
    );
  }

  const tabItems = [
    {
      key: 'zones',
      label: '座位分区',
      children: renderZonesTab(),
    },
    {
      key: 'discounts',
      label: '优惠规则',
      children: renderDiscountRulesTab(),
    },
    {
      key: 'seats',
      label: '座位管理',
      children: renderSeatManagementTab(),
    },
  ];

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
          <Space>
            <Button
              icon={<ArrowLeftOutlined />}
              onClick={() => navigate('/shows')}
            >
              返回列表
            </Button>
            <Title level={4} style={{ margin: 0 }}>
              票版设计
            </Title>
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
        </Space>
      </Card>

      <Form form={form} layout="vertical">
        <Card>
          <Tabs
            activeKey={activeTab}
            onChange={setActiveTab}
            items={tabItems}
            type="card"
          />

          {canEdit && showInfo?.status === 'draft' && activeTab !== 'seats' && (
            <div style={{ marginTop: 24, textAlign: 'right' }}>
              <Space>
                <Button onClick={() => navigate('/shows')}>取消</Button>
                <Popconfirm
                  title="确认保存票版？"
                  description="保存后将生成本场次的票版信息"
                  onConfirm={handleSaveTicketVersion}
                  okText="确认"
                  cancelText="取消"
                >
                  <Button
                    type="primary"
                    icon={<SaveOutlined />}
                    loading={loading}
                  >
                    保存票版
                  </Button>
                </Popconfirm>
              </Space>
            </div>
          )}
        </Card>
      </Form>
    </div>
  );
};

export default TicketDesign;
