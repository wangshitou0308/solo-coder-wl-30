import React, { useState, useEffect } from 'react';
import {
  Card,
  Table,
  Button,
  Space,
  Tag,
  Typography,
  Spin,
  message,
  Empty,
  Modal,
  Form,
  InputNumber,
  Switch,
  Popconfirm,
  Alert as AntAlert,
  Descriptions,
  Divider,
  Tooltip,
  Row,
  Col,
  Statistic,
} from 'antd';
import {
  PlusOutlined,
  ReloadOutlined,
  EditOutlined,
  StopOutlined,
  PlayCircleOutlined,
  ExclamationCircleOutlined,
  DollarOutlined,
  ClockCircleOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  FileTextOutlined,
} from '@ant-design/icons';
import { refundRuleAPI } from '../../services/api';
import { useAuth } from '../../context/AuthContext';

const { Title } = Typography;

const formatCurrency = (v) => `¥${Number(v || 0).toLocaleString('zh-CN', { minimumFractionDigits: 2 })}`;

const RefundRules = () => {
  const { hasRole } = useAuth();
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState([]);
  const [activeRule, setActiveRule] = useState(null);

  const [modalVisible, setModalVisible] = useState(false);
  const [editingRule, setEditingRule] = useState(null);
  const [form] = Form.useForm();
  const [submitting, setSubmitting] = useState(false);

  const canEdit = hasRole('manager');

  useEffect(() => {
    fetchData();
    fetchActive();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const res = await refundRuleAPI.list();
      setData(res.data?.rules || res.data?.data || []);
    } catch (err) {
      message.error(err.response?.data?.message || '获取退票规则列表失败');
    } finally {
      setLoading(false);
    }
  };

  const fetchActive = async () => {
    try {
      const res = await refundRuleAPI.active();
      setActiveRule(res.data?.rule || res.data || null);
    } catch (err) {
      console.warn('获取当前生效规则失败', err);
    }
  };

  const handleCreate = () => {
    setEditingRule(null);
    form.resetFields();
    form.setFieldsValue({
      allowPartial: true,
      deadlineHoursBefore: 24,
      feeRate: 10,
      feeMinimumAmount: 0,
      allowRefundAfterSettlement: false,
      isActive: true,
    });
    setModalVisible(true);
  };

  const handleEdit = (record) => {
    setEditingRule(record);
    form.setFieldsValue({
      ruleName: record.ruleName,
      description: record.description,
      allowPartial: record.allowPartial,
      deadlineHoursBefore: record.deadlineHoursBefore,
      feeRate: record.feeRate,
      feeMinimumAmount: record.feeMinimumAmount,
      allowRefundAfterSettlement: record.allowRefundAfterSettlement,
      priority: record.priority,
    });
    setModalVisible(true);
  };

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      setSubmitting(true);
      const payload = {
        rule_name: values.ruleName,
        description: values.description,
        allow_partial: values.allowPartial ? 1 : 0,
        deadline_hours_before: values.deadlineHoursBefore,
        fee_rate: values.feeRate,
        fee_minimum_amount: values.feeMinimumAmount,
        allow_refund_after_settlement: values.allowRefundAfterSettlement ? 1 : 0,
        priority: values.priority || 1,
        is_active: 1,
      };

      if (editingRule) {
        await refundRuleAPI.update(editingRule.id, payload);
        message.success('规则更新成功');
      } else {
        await refundRuleAPI.create(payload);
        message.success('规则创建成功');
      }

      setModalVisible(false);
      fetchData();
      fetchActive();
    } catch (err) {
      if (err.errorFields) return;
      message.error(err.response?.data?.message || '保存失败');
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggle = (record) => {
    const nextActive = record.isActive ? 0 : 1;
    Modal.confirm({
      title: nextActive ? '启用该退票规则？' : '停用该退票规则？',
      icon: <ExclamationCircleOutlined />,
      content: nextActive
        ? '启用后，新的退票申请将按此规则计算手续费与限制条件。系统将自动停用其他规则以确保唯一性。'
        : '停用后，该规则不再用于新的退票申请。若当前没有其他启用的规则，需先创建并启用新规则。',
      onOk: async () => {
        try {
          await refundRuleAPI.toggle(record.id, { is_active: nextActive });
          message.success(nextActive ? '已启用' : '已停用');
          fetchData();
          fetchActive();
        } catch (err) {
          message.error(err.response?.data?.message || '操作失败');
        }
      },
    });
  };

  const summaryStats = [
    {
      title: '规则总数',
      value: data.length,
      icon: <FileTextOutlined style={{ color: '#1890ff' }} />,
      bg: 'rgba(24, 144, 255, 0.08)',
    },
    {
      title: '已启用规则',
      value: data.filter(r => r.isActive).length,
      icon: <CheckCircleOutlined style={{ color: '#52c41a' }} />,
      bg: 'rgba(82, 196, 26, 0.08)',
    },
    {
      title: '演出前不可退票窗口',
      value: activeRule ? `${activeRule.deadlineHoursBefore} 小时` : '-',
      icon: <ClockCircleOutlined style={{ color: '#faad14' }} />,
      bg: 'rgba(250, 173, 20, 0.08)',
    },
    {
      title: '当前退票手续费率',
      value: activeRule ? `${activeRule.feeRate}%` : '-',
      icon: <DollarOutlined style={{ color: '#722ed1' }} />,
      bg: 'rgba(114, 46, 209, 0.08)',
    },
  ];

  const columns = [
    {
      title: '规则名称',
      dataIndex: 'ruleName',
      key: 'ruleName',
      width: 180,
      render: (v, record) => (
        <Space>
          <strong>{v || `规则 #${record.id}`}</strong>
          {record.isActive && <Tag color="green">生效中</Tag>}
          {!record.isActive && <Tag color="default">已停用</Tag>}
          {activeRule?.id === record.id && <Tag color="blue">当前使用</Tag>}
        </Space>
      ),
    },
    {
      title: '支持部分退票',
      dataIndex: 'allowPartial',
      key: 'allowPartial',
      width: 120,
      align: 'center',
      render: (v) => v
        ? <Tag icon={<CheckCircleOutlined />} color="green">支持</Tag>
        : <Tag icon={<CloseCircleOutlined />} color="red">整单退</Tag>,
    },
    {
      title: '演出前退票截止',
      dataIndex: 'deadlineHoursBefore',
      key: 'deadlineHoursBefore',
      width: 150,
      align: 'center',
      render: (v) => (
        <Space>
          <ClockCircleOutlined style={{ color: '#faad14' }} />
          <span><strong>{v}</strong> 小时前</span>
        </Space>
      ),
    },
    {
      title: '手续费率',
      dataIndex: 'feeRate',
      key: 'feeRate',
      width: 120,
      align: 'center',
      render: (v, record) => (
        <Space direction="vertical" size={0}>
          <span><strong>{v}</strong>%</span>
          {record.feeMinimumAmount > 0 && (
            <span style={{ fontSize: 11, color: '#8c8c8c' }}>
              最低 {formatCurrency(record.feeMinimumAmount)}
            </span>
          )}
        </Space>
      ),
    },
    {
      title: '已结算场次可退',
      dataIndex: 'allowRefundAfterSettlement',
      key: 'allowRefundAfterSettlement',
      width: 140,
      align: 'center',
      render: (v) => v
        ? <Tag color="orange">允许</Tag>
        : <Tag color="default">禁止</Tag>,
    },
    {
      title: '备注',
      dataIndex: 'description',
      key: 'description',
      ellipsis: true,
      render: (v) => v || '-',
    },
    {
      title: '操作',
      key: 'actions',
      width: 200,
      fixed: 'right',
      render: (_, record) => (
        <Space size="small">
          {canEdit && (
            <Button size="small" icon={<EditOutlined />} onClick={() => handleEdit(record)}>
              编辑
            </Button>
          )}
          {canEdit && (
            <Tooltip title={record.isActive ? '停用此规则' : '启用此规则'}>
              <Button
                size="small"
                type={record.isActive ? 'text' : 'primary'}
                danger={record.isActive}
                icon={record.isActive ? <StopOutlined /> : <PlayCircleOutlined />}
                onClick={() => handleToggle(record)}
              >
                {record.isActive ? '停用' : '启用'}
              </Button>
            </Tooltip>
          )}
        </Space>
      ),
    },
  ];

  return (
    <div>
      <Title level={3} style={{ marginBottom: 24 }}>
        <Space>
          <ExclamationCircleOutlined />
          退票规则管理
        </Space>
      </Title>

      {activeRule && (
        <AntAlert
          type="success"
          showIcon
          icon={<CheckCircleOutlined />}
          message={
            <Space>
              <span>当前生效规则：</span>
              <strong>{activeRule.ruleName}</strong>
              <span style={{ color: '#595959' }}>
                （{activeRule.allowPartial ? '支持部分退票' : '仅支持整单退票'} ·
                演出前 <strong>{activeRule.deadlineHoursBefore}</strong> 小时截止 ·
                手续费 <strong>{activeRule.feeRate}%</strong>
                {activeRule.feeMinimumAmount > 0 && `，最低 ${formatCurrency(activeRule.feeMinimumAmount)}`}
                {activeRule.allowRefundAfterSettlement ? ' · 已结算场次允许退票' : ' · 已结算场次禁止退票'}）
              </span>
            </Space>
          }
          style={{ marginBottom: 24 }}
        />
      )}

      {!activeRule && data.length > 0 && (
        <AntAlert
          type="warning"
          showIcon
          message="当前没有启用的退票规则！请至少启用一条规则，否则退票操作可能会被拒绝。"
          style={{ marginBottom: 24 }}
        />
      )}

      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        {summaryStats.map((s, idx) => (
          <Col xs={24} sm={12} lg={6} key={idx}>
            <Card bordered={false} style={{ borderRadius: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontSize: 13, color: '#8c8c8c', marginBottom: 4 }}>{s.title}</div>
                  <div style={{ fontSize: 22, fontWeight: 600 }}>{s.value}</div>
                </div>
                <div
                  style={{
                    width: 48, height: 48, borderRadius: '50%',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 22, background: s.bg,
                  }}
                >
                  {s.icon}
                </div>
              </div>
            </Card>
          </Col>
        ))}
      </Row>

      <Card
        bordered={false}
        style={{ borderRadius: 8 }}
        title="退票规则列表"
        extra={
          <Space>
            <Button icon={<ReloadOutlined />} onClick={fetchData}>刷新</Button>
            {canEdit && (
              <Button type="primary" icon={<PlusOutlined />} onClick={handleCreate}>
                创建规则
              </Button>
            )}
          </Space>
        }
      >
        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}>
            <Spin size="large" />
          </div>
        ) : data.length > 0 ? (
          <Table
            rowKey="id"
            dataSource={data}
            columns={columns}
            scroll={{ x: 1000 }}
            pagination={{ pageSize: 10, showSizeChanger: true, showTotal: t => `共 ${t} 条规则` }}
          />
        ) : (
          <Empty
            description={
              <Space direction="vertical" size="small">
                <span>暂无退票规则</span>
                {canEdit && (
                  <Button type="primary" icon={<PlusOutlined />} onClick={handleCreate}>
                    创建第一条规则
                  </Button>
                )}
              </Space>
            }
            style={{ padding: 60 }}
          />
        )}
      </Card>

      <Modal
        title={
          <Space>
            {editingRule ? <EditOutlined /> : <PlusOutlined />}
            {editingRule ? '编辑退票规则' : '创建退票规则'}
          </Space>
        }
        open={modalVisible}
        onCancel={() => setModalVisible(false)}
        onOk={handleSubmit}
        confirmLoading={submitting}
        okText="保存规则"
        width={620}
        destroyOnClose
      >
        <Form form={form} layout="vertical">
          <Row gutter={16}>
            <Col xs={24} md={14}>
              <Form.Item
                label="规则名称"
                name="ruleName"
                rules={[{ required: true, message: '请输入规则名称' }]}
              >
                <input
                  type="text"
                  style={{
                    width: '100%', padding: '6px 12px', border: '1px solid #d9d9d9',
                    borderRadius: 6, fontSize: 14,
                  }}
                  placeholder="如：2024Q4 标准退票规则"
                  onChange={(e) => form.setFieldsValue({ ruleName: e.target.value })}
                  value={form.getFieldValue('ruleName') || ''}
                />
              </Form.Item>
            </Col>
            <Col xs={24} md={10}>
              <Form.Item label="优先级" name="priority" initialValue={1} extra="数字越大优先级越高">
                <InputNumber min={1} max={999} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
          </Row>

          <Form.Item label="规则说明（可选）" name="description">
            <textarea
              style={{
                width: '100%', padding: '6px 12px', border: '1px solid #d9d9d9',
                borderRadius: 6, fontSize: 14, minHeight: 60, resize: 'vertical',
              }}
              placeholder="描述此规则适用场景或注意事项..."
              onChange={(e) => form.setFieldsValue({ description: e.target.value })}
              value={form.getFieldValue('description') || ''}
            />
          </Form.Item>

          <Divider orientation="left" plain style={{ fontSize: 13 }}>退票限制条件</Divider>

          <Row gutter={16}>
            <Col xs={24} md={12}>
              <Form.Item
                label="是否支持部分退票"
                name="allowPartial"
                valuePropName="checked"
                extra="关闭后只能整张订单退票"
              >
                <Switch checkedChildren="支持" unCheckedChildren="仅整单退" />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item
                label="演出前多久不可退票"
                name="deadlineHoursBefore"
                rules={[{ required: true, message: '请输入小时数' }]}
                extra="在此时间范围内的演出不接受退票"
              >
                <InputNumber min={0} max={24 * 30} step={1} addonAfter="小时" style={{ width: '100%' }} />
              </Form.Item>
            </Col>
          </Row>

          <Divider orientation="left" plain style={{ fontSize: 13 }}>手续费配置</Divider>

          <Row gutter={16}>
            <Col xs={24} md={12}>
              <Form.Item
                label="退票手续费率"
                name="feeRate"
                rules={[{ required: true, message: '请输入手续费率' }]}
                extra="按申请退票金额的百分比扣除"
              >
                <InputNumber min={0} max={100} step={1} addonAfter="%" style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item label="每笔最低手续费" name="feeMinimumAmount" initialValue={0} extra="不足此额按此额收取">
                <InputNumber min={0} step={1} addonBefore="¥" style={{ width: '100%' }} />
              </Form.Item>
            </Col>
          </Row>

          <Divider orientation="left" plain style={{ fontSize: 13 }}>高级设置</Divider>

          <Form.Item
            label="已结算场次是否允许退票"
            name="allowRefundAfterSettlement"
            valuePropName="checked"
            extra="开启后，已生成结算单的场次仍可退票（需重算结算）"
          >
            <Switch checkedChildren="允许" unCheckedChildren="禁止" />
          </Form.Item>

          {!editingRule && (
            <AntAlert
              type="info"
              showIcon
              message="保存后若勾选启用，系统将自动停用其他已启用规则，确保任意时刻仅有一条规则生效。"
            />
          )}
        </Form>
      </Modal>
    </div>
  );
};

export default RefundRules;
