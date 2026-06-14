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
  Drawer,
  Descriptions,
  DatePicker,
  Form,
  Alert as AntAlert,
} from 'antd';
import {
  SearchOutlined,
  FileSearchOutlined,
  ReloadOutlined,
  DownloadOutlined,
  EyeOutlined,
  UserOutlined,
  HistoryOutlined,
  CalendarOutlined,
  TagOutlined,
  DatabaseOutlined,
  EnvironmentOutlined,
} from '@ant-design/icons';
import { auditAPI, exportAPI } from '../../services/api';
import dayjs from 'dayjs';

const { Title } = Typography;
const { Option } = Select;
const { RangePicker } = DatePicker;

const ACTION_LABEL_MAP = {
  create_performance: { label: '创建演出', color: 'blue' },
  approve_performance: { label: '审批通过演出', color: 'green' },
  reject_performance: { label: '驳回演出', color: 'red' },
  create_show: { label: '创建场次', color: 'blue' },
  onsale_show: { label: '场次上架', color: 'cyan' },
  end_show: { label: '结束场次', color: 'default' },
  cancel_show: { label: '取消场次', color: 'red' },
  update_show_status: { label: '更新场次状态', color: 'purple' },
  auto_end_show: { label: '系统自动结束场次', color: 'default' },
  create_order: { label: '创建订单', color: 'blue' },
  pay_order: { label: '订单支付', color: 'green' },
  refund_order: { label: '订单退票', color: 'orange' },
  auto_cancel_order: { label: '系统自动取消订单', color: 'default' },
  create_settlement: { label: '生成结算', color: 'blue' },
  confirm_settlement: { label: '确认结算', color: 'cyan' },
  pay_settlement: { label: '支付结算', color: 'green' },
  void_settlement: { label: '作废结算', color: 'red' },
  create_refund_rule: { label: '创建退票规则', color: 'blue' },
  update_refund_rule: { label: '更新退票规则', color: 'purple' },
  toggle_refund_rule: { label: '启停退票规则', color: 'orange' },
  login: { label: '登录系统', color: 'geekblue' },
  logout: { label: '退出登录', color: 'default' },
};

const TARGET_TYPE_LABEL_MAP = {
  performance: { label: '演出项目', color: 'blue' },
  show: { label: '场次', color: 'cyan' },
  order: { label: '订单', color: 'green' },
  settlement: { label: '结算单', color: 'purple' },
  refund_rule: { label: '退票规则', color: 'orange' },
  user: { label: '用户', color: 'geekblue' },
  system: { label: '系统', color: 'default' },
};

const getActionLabel = (action) => {
  const m = ACTION_LABEL_MAP[action];
  return m ? <Tag color={m.color}>{m.label}</Tag> : <Tag>{action}</Tag>;
};

const getTargetTypeLabel = (type) => {
  const m = TARGET_TYPE_LABEL_MAP[type];
  return m ? <Tag color={m.color}>{m.label}</Tag> : <Tag>{type}</Tag>;
};

const formatDetail = (detail) => {
  if (!detail) return null;
  try {
    const obj = typeof detail === 'string' ? JSON.parse(detail) : detail;
    return obj;
  } catch (e) {
    return { raw: detail };
  }
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

const AuditLog = () => {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState([]);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [total, setTotal] = useState(0);
  const [meta, setMeta] = useState({ actions: [], targetTypes: [], userNames: [] });

  const [searchKeyword, setSearchKeyword] = useState('');
  const [searchUser, setSearchUser] = useState('');
  const [searchAction, setSearchAction] = useState('');
  const [searchTargetType, setSearchTargetType] = useState('');
  const [searchTargetId, setSearchTargetId] = useState('');
  const [searchDateRange, setSearchDateRange] = useState([
    dayjs().subtract(7, 'day').startOf('day'),
    dayjs().endOf('day'),
  ]);

  const [detailDrawerVisible, setDetailDrawerVisible] = useState(false);
  const [currentLog, setCurrentLog] = useState(null);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    fetchMeta();
  }, []);

  useEffect(() => {
    fetchData();
  }, [page, pageSize]);

  const fetchMeta = async () => {
    try {
      const res = await auditAPI.actions();
      setMeta(res.data || { actions: [], targetTypes: [], userNames: [] });
    } catch (err) {
      console.warn('获取审计元数据失败', err);
    }
  };

  const fetchData = async () => {
    setLoading(true);
    try {
      const params = { page, pageSize };
      if (searchKeyword) params.keyword = searchKeyword;
      if (searchUser) params.userId = searchUser;
      if (searchAction) params.action = searchAction;
      if (searchTargetType) params.targetType = searchTargetType;
      if (searchTargetId) params.targetId = searchTargetId;
      if (searchDateRange && searchDateRange.length === 2) {
        params.startDate = searchDateRange[0].format('YYYY-MM-DD HH:mm:ss');
        params.endDate = searchDateRange[1].format('YYYY-MM-DD HH:mm:ss');
      }
      const res = await auditAPI.list(params);
      setData(res.data?.logs || res.data?.data || []);
      setTotal(res.data?.total || 0);
    } catch (err) {
      message.error(err.response?.data?.message || '获取审计日志失败');
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = () => {
    setPage(1);
    fetchData();
  };

  const handleReset = () => {
    setSearchKeyword('');
    setSearchUser('');
    setSearchAction('');
    setSearchTargetType('');
    setSearchTargetId('');
    setSearchDateRange([
      dayjs().subtract(7, 'day').startOf('day'),
      dayjs().endOf('day'),
    ]);
    setPage(1);
    setTimeout(fetchData, 50);
  };

  const handleViewDetail = (record) => {
    setCurrentLog(record);
    setDetailDrawerVisible(true);
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      const params = {};
      if (searchKeyword) params.keyword = searchKeyword;
      if (searchUser) params.userId = searchUser;
      if (searchAction) params.action = searchAction;
      if (searchTargetType) params.targetType = searchTargetType;
      if (searchTargetId) params.targetId = searchTargetId;
      if (searchDateRange && searchDateRange.length === 2) {
        params.startDate = searchDateRange[0].format('YYYY-MM-DD HH:mm:ss');
        params.endDate = searchDateRange[1].format('YYYY-MM-DD HH:mm:ss');
      }
      const res = await auditAPI.export(params);
      const filename = `审计日志_${dayjs().format('YYYYMMDD_HHmmss')}.csv`;
      downloadBlob(res.data, filename);
      message.success('导出成功');
    } catch (err) {
      message.error('导出失败：' + (err.response?.data?.message || err.message));
    } finally {
      setExporting(false);
    }
  };

  const columns = [
    {
      title: '操作时间',
      dataIndex: 'createdAt',
      key: 'createdAt',
      width: 180,
      render: (v) => (
        <Space>
          <CalendarOutlined style={{ color: '#8c8c8c' }} />
          <span style={{ fontFamily: 'monospace', fontSize: 12 }}>{v}</span>
        </Space>
      ),
      sorter: true,
      defaultSortOrder: 'descend',
    },
    {
      title: '操作人',
      dataIndex: 'userName',
      key: 'userName',
      width: 130,
      render: (v, record) => (
        <Space>
          {record.userId === 0 || v === 'SYSTEM' ? (
            <Tag icon={<DatabaseOutlined />} color="default">SYSTEM</Tag>
          ) : (
            <Space size={4}>
              <UserOutlined style={{ color: '#1890ff' }} />
              <span>{v || `#${record.userId}`}</span>
            </Space>
          )}
        </Space>
      ),
    },
    {
      title: '操作',
      dataIndex: 'action',
      key: 'action',
      width: 160,
      render: (v) => getActionLabel(v),
    },
    {
      title: '对象类型',
      dataIndex: 'targetType',
      key: 'targetType',
      width: 120,
      render: (v) => getTargetTypeLabel(v),
    },
    {
      title: '对象ID',
      dataIndex: 'targetId',
      key: 'targetId',
      width: 90,
      align: 'right',
      render: (v) => v ? <code>#{v}</code> : '-',
    },
    {
      title: 'IP地址',
      dataIndex: 'ipAddress',
      key: 'ipAddress',
      width: 130,
      render: (v) => (
        v ? (
          <Space size={4}>
            <EnvironmentOutlined style={{ fontSize: 11, color: '#8c8c8c' }} />
            <span style={{ fontFamily: 'monospace', fontSize: 12 }}>{v}</span>
          </Space>
        ) : '-'
      ),
    },
    {
      title: '详情摘要',
      dataIndex: 'detail',
      key: 'detail',
      ellipsis: true,
      render: (v) => {
        const obj = formatDetail(v);
        if (!obj) return <span style={{ color: '#bfbfbf' }}>无</span>;
        const keys = Object.keys(obj);
        const preview = keys.slice(0, 3).map(k => `${k}: ${typeof obj[k] === 'object' ? JSON.stringify(obj[k]) : obj[k]}`).join(' | ');
        return <span style={{ fontSize: 12, color: '#595959' }}>{preview || '-'}</span>;
      },
    },
    {
      title: '操作',
      key: 'actions',
      width: 90,
      fixed: 'right',
      render: (_, record) => (
        <Button size="small" type="link" icon={<EyeOutlined />} onClick={() => handleViewDetail(record)}>
          详情
        </Button>
      ),
    },
  ];

  return (
    <div>
      <Title level={3} style={{ marginBottom: 24 }}>
        <Space>
          <HistoryOutlined />
          审计日志 · 操作追溯
        </Space>
      </Title>

      <AntAlert
        type="info"
        showIcon
        message="系统自动记录所有关键操作（演出审批、场次上架、订单支付退票、结算生成确认支付作废、退票规则变更等），形成完整操作追溯链，供审计与合规检查使用。"
        style={{ marginBottom: 24 }}
      />

      <Card
        bordered={false}
        style={{ borderRadius: 8, marginBottom: 24 }}
        title={
          <Space>
            <SearchOutlined /> 筛选条件
          </Space>
        }
        extra={
          <Button
            type="primary"
            ghost
            icon={<DownloadOutlined />}
            onClick={handleExport}
            loading={exporting}
          >
            导出CSV
          </Button>
        }
      >
        <Form layout="vertical">
          <Row gutter={[16, 16]} align="bottom">
            <Col xs={24} sm={12} md={6}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ whiteSpace: 'nowrap', color: '#595959' }}>关键字：</span>
                <Input
                  placeholder="操作/详情模糊搜索"
                  value={searchKeyword}
                  onChange={(e) => setSearchKeyword(e.target.value)}
                  onPressEnter={handleSearch}
                  allowClear
                  style={{ flex: 1 }}
                />
              </div>
            </Col>
            <Col xs={24} sm={12} md={5}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <UserOutlined style={{ color: '#8c8c8c' }} />
                <Select
                  placeholder="操作人"
                  allowClear
                  showSearch
                  value={searchUser || undefined}
                  onChange={(v) => setSearchUser(v)}
                  style={{ flex: 1 }}
                  filterOption={(input, option) =>
                    String(option.children || '').toLowerCase().includes(input.toLowerCase())
                  }
                >
                  <Option key="__system" value="0">
                    <Tag color="default">SYSTEM 系统</Tag>
                  </Option>
                  {(meta.userNames || []).map(u => (
                    <Option key={u.id || u} value={u.id || u}>{u.name || u}</Option>
                  ))}
                </Select>
              </div>
            </Col>
            <Col xs={24} sm={12} md={5}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <TagOutlined style={{ color: '#8c8c8c' }} />
                <Select
                  placeholder="操作类型"
                  allowClear
                  showSearch
                  value={searchAction || undefined}
                  onChange={(v) => setSearchAction(v)}
                  style={{ flex: 1 }}
                >
                  {(meta.actions || Object.keys(ACTION_LABEL_MAP)).map(a => (
                    <Option key={a} value={a}>
                      {ACTION_LABEL_MAP[a]?.label || a}
                    </Option>
                  ))}
                </Select>
              </div>
            </Col>
            <Col xs={24} sm={12} md={4}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <DatabaseOutlined style={{ color: '#8c8c8c' }} />
                <Select
                  placeholder="对象类型"
                  allowClear
                  value={searchTargetType || undefined}
                  onChange={(v) => setSearchTargetType(v)}
                  style={{ flex: 1 }}
                >
                  {(meta.targetTypes || Object.keys(TARGET_TYPE_LABEL_MAP)).map(t => (
                    <Option key={t} value={t}>
                      {TARGET_TYPE_LABEL_MAP[t]?.label || t}
                    </Option>
                  ))}
                </Select>
              </div>
            </Col>
            <Col xs={24} sm={12} md={4}>
              <Input
                placeholder="对象ID"
                value={searchTargetId}
                onChange={(e) => setSearchTargetId(e.target.value)}
                onPressEnter={handleSearch}
                allowClear
                prefix={<span style={{ color: '#bfbfbf' }}>#</span>}
              />
            </Col>
            <Col xs={24} md={11}>
              <RangePicker
                showTime
                style={{ width: '100%' }}
                value={searchDateRange}
                onChange={setSearchDateRange}
                placeholder={['起始时间', '结束时间']}
              />
            </Col>
            <Col xs={24} md={13} style={{ textAlign: 'right' }}>
              <Space>
                <Button icon={<ReloadOutlined />} onClick={handleReset}>重置</Button>
                <Button type="primary" icon={<SearchOutlined />} onClick={handleSearch}>查询</Button>
              </Space>
            </Col>
          </Row>
        </Form>
      </Card>

      <Card bordered={false} style={{ borderRadius: 8 }}>
        <Row justify="space-between" align="middle" style={{ marginBottom: 16 }}>
          <Col>
            <Space size="large">
              <span style={{ fontSize: 13, color: '#8c8c8c' }}>
                共 <strong style={{ color: '#262626' }}>{total.toLocaleString()}</strong> 条记录
              </span>
              {searchDateRange && searchDateRange.length === 2 && (
                <span style={{ fontSize: 12, color: '#8c8c8c' }}>
                  时间范围：{searchDateRange[0].format('YYYY-MM-DD')} ~ {searchDateRange[1].format('YYYY-MM-DD')}
                </span>
              )}
            </Space>
          </Col>
          <Col>
            <Space>
              <Button size="small" onClick={fetchData} icon={<ReloadOutlined />}>刷新</Button>
            </Space>
          </Col>
        </Row>

        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}>
            <Spin size="large" />
          </div>
        ) : data.length > 0 ? (
          <Table
            rowKey="id"
            dataSource={data}
            columns={columns}
            scroll={{ x: 1200 }}
            pagination={{
              current: page,
              pageSize,
              total,
              showSizeChanger: true,
              showQuickJumper: true,
              showTotal: (t) => `第 ${page} 页 / 共 ${Math.ceil(t / pageSize)} 页`,
              onChange: (p, ps) => { setPage(p); setPageSize(ps); },
            }}
          />
        ) : (
          <Empty
            description={
              <Space direction="vertical" size="small">
                <FileSearchOutlined style={{ fontSize: 48, color: '#d9d9d9' }} />
                <span>未找到匹配的审计记录</span>
                <Button size="small" onClick={handleReset}>清除筛选条件</Button>
              </Space>
            }
            style={{ padding: 60 }}
          />
        )}
      </Card>

      <Drawer
        title={
          <Space>
            <FileSearchOutlined />
            审计日志详情
          </Space>
        }
        open={detailDrawerVisible}
        onClose={() => setDetailDrawerVisible(false)}
        width={620}
      >
        {currentLog && (
          <div>
            <Descriptions column={1} bordered size="small" style={{ marginBottom: 20 }}>
              <Descriptions.Item label="操作时间">
                <span style={{ fontFamily: 'monospace' }}>{currentLog.createdAt}</span>
              </Descriptions.Item>
              <Descriptions.Item label="操作人">
                {currentLog.userId === 0 || currentLog.userName === 'SYSTEM' ? (
                  <Tag icon={<DatabaseOutlined />} color="default">SYSTEM（系统自动执行）</Tag>
                ) : (
                  <Space>
                    <UserOutlined style={{ color: '#1890ff' }} />
                    <span>{currentLog.userName || '-'}</span>
                    <span style={{ color: '#8c8c8c', fontSize: 12 }}>(ID: {currentLog.userId})</span>
                  </Space>
                )}
              </Descriptions.Item>
              <Descriptions.Item label="操作类型">
                <Space>
                  {getActionLabel(currentLog.action)}
                  <code style={{ fontSize: 11, color: '#8c8c8c' }}>{currentLog.action}</code>
                </Space>
              </Descriptions.Item>
              <Descriptions.Item label="操作对象">
                <Space>
                  {getTargetTypeLabel(currentLog.targetType)}
                  <span>对象 ID：</span>
                  <code>#{currentLog.targetId || '-'}</code>
                </Space>
              </Descriptions.Item>
              <Descriptions.Item label="操作来源 IP">
                {currentLog.ipAddress ? (
                  <Space>
                    <EnvironmentOutlined style={{ color: '#8c8c8c' }} />
                    <code style={{ fontFamily: 'monospace' }}>{currentLog.ipAddress}</code>
                  </Space>
                ) : '-'}
              </Descriptions.Item>
              <Descriptions.Item label="日志 ID">
                <code style={{ color: '#8c8c8c' }}>#{currentLog.id}</code>
              </Descriptions.Item>
            </Descriptions>

            <Title level={5} style={{ marginBottom: 12 }}>
              <Space><TagOutlined />操作详情</Space>
            </Title>
            <DetailDisplay detail={currentLog.detail} />
          </div>
        )}
      </Drawer>
    </div>
  );
};

const DetailDisplay = ({ detail }) => {
  const obj = formatDetail(detail);
  if (!obj) {
    return <AntAlert type="info" message="该操作没有附带额外详情" />;
  }
  const entries = Object.entries(obj);
  if (entries.length === 0) {
    return <AntAlert type="info" message="该操作没有附带额外详情" />;
  }

  return (
    <div
      style={{
        background: '#fafafa',
        border: '1px solid #f0f0f0',
        borderRadius: 8,
        padding: 16,
      }}
    >
      <Descriptions column={1} size="small" bordered>
        {entries.map(([key, value]) => (
          <Descriptions.Item
            key={key}
            label={
              <span style={{ color: '#595959', fontWeight: 500 }}>{formatKeyLabel(key)}</span>
            }
          >
            {renderDetailValue(key, value)}
          </Descriptions.Item>
        ))}
      </Descriptions>
    </div>
  );
};

const KEY_LABEL_MAP = {
  previous_status: '变更前状态',
  new_status: '变更后状态',
  approver: '审批人',
  reject_reason: '驳回原因',
  show_date: '演出日期',
  start_time: '开始时间',
  seat_ids: '座位ID列表',
  buyer_name: '购票人',
  buyer_phone: '联系电话',
  channel: '购票渠道',
  payment_method: '支付方式',
  total_amount: '订单总额',
  discount_amount: '优惠金额',
  actual_amount: '实付金额',
  expires_at: '过期时间',
  paid_at: '支付时间',
  refund_amount: '退票金额',
  fee_amount: '手续费',
  net_refund_amount: '净退金额',
  refund_seats: '退票座位',
  rule_id: '退票规则ID',
  allow_partial: '支持部分退票',
  deadline_hours_before: '演出前N小时不可退',
  fee_rate: '手续费率',
  fee_minimum_amount: '最低手续费',
  allow_refund_after_settlement: '已结算可退',
  settlement_mode: '结算模式',
  version: '版本号',
  parent_id: '父版本ID',
  void_reason: '作废原因',
  ip_address: 'IP地址',
  seat_count: '座位数',
  ticket_count: '票数',
  order_no: '订单号',
  settlement_no: '结算单号',
  reason: '原因',
  payment_status: '支付状态',
  gross_revenue: '总票房',
  refund_amount_total: '退票金额合计',
  net_revenue: '净收入',
  group_share: '团体分成',
  theater_share: '剧场分成',
  force_regenerate: '强制重新生成',
  order_count: '订单数量',
  refund_count: '退票数量',
};

const formatKeyLabel = (key) => KEY_LABEL_MAP[key] || key;

const renderDetailValue = (key, value) => {
  if (value === null || value === undefined || value === '') {
    return <span style={{ color: '#bfbfbf' }}>（空）</span>;
  }

  if (typeof value === 'boolean') {
    return <Tag color={value ? 'green' : 'red'}>{value ? '是' : '否'}</Tag>;
  }

  if (Array.isArray(value)) {
    if (value.length === 0) return <span style={{ color: '#bfbfbf' }}>（空数组）</span>;
    if (value.every(v => typeof v !== 'object')) {
      return (
        <Space size={[4, 4]} wrap>
          {value.map((v, i) => (
            <Tag key={i}>{String(v)}</Tag>
          ))}
        </Space>
      );
    }
    return (
      <pre
        style={{
          background: '#fff',
          padding: 8,
          borderRadius: 4,
          border: '1px solid #f0f0f0',
          fontSize: 12,
          maxHeight: 200,
          overflow: 'auto',
          margin: 0,
        }}
      >
        {JSON.stringify(value, null, 2)}
      </pre>
    );
  }

  if (typeof value === 'object') {
    return (
      <pre
        style={{
          background: '#fff',
          padding: 8,
          borderRadius: 4,
          border: '1px solid #f0f0f0',
          fontSize: 12,
          maxHeight: 200,
          overflow: 'auto',
          margin: 0,
        }}
      >
        {JSON.stringify(value, null, 2)}
      </pre>
    );
  }

  if (['total_amount', 'discount_amount', 'actual_amount', 'refund_amount', 'fee_amount',
       'net_refund_amount', 'gross_revenue', 'refund_amount_total', 'net_revenue',
       'group_share', 'theater_share', 'fee_minimum_amount'].includes(key)) {
    return <strong style={{ color: '#52c41a' }}>¥{Number(value).toLocaleString('zh-CN', { minimumFractionDigits: 2 })}</strong>;
  }

  if (key === 'fee_rate' || key === 'ratio' || key === 'guaranteed_ratio') {
    return <span>{Number(value)}%</span>;
  }

  if (key === 'deadline_hours_before') {
    return <span>{Number(value)} 小时</span>;
  }

  if (['expires_at', 'paid_at', 'created_at', 'show_date', 'start_time'].includes(key) || /_at$/.test(key)) {
    return <span style={{ fontFamily: 'monospace', fontSize: 12 }}>{String(value)}</span>;
  }

  if (['payment_method', 'channel', 'order_type'].includes(key)) {
    return <Tag>{String(value)}</Tag>;
  }

  if (['previous_status', 'new_status', 'payment_status', 'settlement_mode'].includes(key)) {
    const statusColor = {
      pending: 'orange', paid: 'green', cancelled: 'default', refunded: 'purple',
      partial_refunded: 'orange', approved: 'green', rejected: 'red',
      draft: 'default', onsale: 'cyan', soldout: 'blue', ended: 'green',
      pending_confirm: 'orange', confirmed: 'blue', void: 'red',
      pending_generated: 'default',
      ratio: 'blue', fixed: 'purple', guaranteed: 'cyan', tiered: 'geekblue',
    };
    return <Tag color={statusColor[String(value)] || 'default'}>{String(value)}</Tag>;
  }

  return String(value);
};

export default AuditLog;
