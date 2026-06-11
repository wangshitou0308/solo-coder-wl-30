import React, { useState, useEffect } from 'react';
import { Table, Button, Select, DatePicker, Modal, Form, Input, message, Space, Popconfirm, Tag } from 'antd';
import { PlusOutlined, CalendarOutlined, PlayCircleOutlined, StopOutlined, CloseOutlined, EyeOutlined, BarChartOutlined, PayCircleOutlined, ScheduleOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import dayjs from 'dayjs';
import { showAPI, performanceAPI, theaterAPI } from '../../services/api';
import { useAuth } from '../../context/AuthContext';

const { Option } = Select;
const { RangePicker } = DatePicker;

const statusMap = {
  draft: { text: '待上架', color: 'default' },
  onsale: { text: '售票中', color: 'green' },
  soldout: { text: '售罄', color: 'orange' },
  cancelled: { text: '已取消', color: 'red' },
  ended: { text: '已结束', color: 'purple' },
};

const ShowList = () => {
  const [data, setData] = useState([]);
  const [performances, setPerformances] = useState([]);
  const [theaters, setTheaters] = useState([]);
  const [loading, setLoading] = useState(false);
  const [performanceId, setPerformanceId] = useState('');
  const [status, setStatus] = useState('');
  const [dateRange, setDateRange] = useState(null);
  const [batchModalVisible, setBatchModalVisible] = useState(false);
  const [addShowModalVisible, setAddShowModalVisible] = useState(false);
  const [batchForm] = Form.useForm();
  const [addShowForm] = Form.useForm();
  const [currentShow, setCurrentShow] = useState(null);
  const { hasRole } = useAuth();
  const navigate = useNavigate();
  const canEdit = hasRole('scheduler', 'manager');

  const fetchData = async () => {
    setLoading(true);
    try {
      const params = {};
      if (performanceId) params.performanceId = performanceId;
      if (status) params.status = status;
      if (dateRange && dateRange.length === 2) {
        params.startDate = dateRange[0].format('YYYY-MM-DD');
        params.endDate = dateRange[1].format('YYYY-MM-DD');
      }
      const res = await showAPI.list(params);
      const shows = res.data.shows || res.data || [];
      setData(shows);
    } catch (err) {
      message.error(err.response?.data?.message || '获取列表失败');
    } finally {
      setLoading(false);
    }
  };

  const fetchPerformances = async () => {
    try {
      const res = await performanceAPI.list();
      setPerformances(res.data.performances || res.data || []);
    } catch (err) {
      console.error('获取演出项目失败:', err);
    }
  };

  const fetchTheaters = async () => {
    try {
      const res = await theaterAPI.listTheaters();
      setTheaters(res.data.theaters || res.data || []);
    } catch (err) {
      console.error('获取剧场列表失败:', err);
    }
  };

  useEffect(() => {
    fetchData();
    fetchPerformances();
    fetchTheaters();
  }, [performanceId, status, dateRange]);

  const handleSearch = () => {
    fetchData();
  };

  const handleReset = () => {
    setPerformanceId('');
    setStatus('');
    setDateRange(null);
  };

  const handleUpdateStatus = async (id, newStatus, confirmText) => {
    try {
      await showAPI.updateStatus(id, newStatus);
      message.success(confirmText);
      fetchData();
    } catch (err) {
      message.error(err.response?.data?.message || '操作失败');
    }
  };

  const handleBatchCreate = async () => {
    try {
      const values = await batchForm.validateFields();
      const formattedValues = {
        ...values,
        startDate: values.startDate.format('YYYY-MM-DD'),
        endDate: values.endDate.format('YYYY-MM-DD'),
        weekdays: values.weekdays,
      };
      const res = await showAPI.batchCreate(formattedValues);
      message.success(res.data.message || '批量创建成功');
      setBatchModalVisible(false);
      batchForm.resetFields();
      fetchData();
    } catch (err) {
      if (err.errorFields) return;
      message.error(err.response?.data?.message || '批量创建失败');
    }
  };

  const handleAddShow = (record) => {
    setCurrentShow(record);
    setAddShowModalVisible(true);
    addShowForm.resetFields();
  };

  const handleAddShowSubmit = async () => {
    try {
      const values = await addShowForm.validateFields();
      const formattedValues = {
        showDate: values.showDate.format('YYYY-MM-DD'),
        startTime: values.startTime,
        endTime: values.endTime,
      };
      await showAPI.addShow(currentShow.id, formattedValues);
      message.success('加场成功');
      setAddShowModalVisible(false);
      addShowForm.resetFields();
      fetchData();
    } catch (err) {
      if (err.errorFields) return;
      message.error(err.response?.data?.message || '加场失败');
    }
  };

  const getTheaterName = (theaterId) => {
    const theater = theaters.find(t => t.id === theaterId);
    return theater?.name || '-';
  };

  const getPerformanceName = (perfId) => {
    const perf = performances.find(p => p.id === perfId);
    return perf?.name || '-';
  };

  const renderActions = (_, record) => {
    return (
      <Space size="small" wrap>
        {record.status === 'draft' && canEdit && (
          <>
            <Button
              type="link"
              size="small"
              icon={<EyeOutlined />}
              onClick={() => navigate(`/shows/${record.id}/ticket-design`)}
            >
              设计票版
            </Button>
            <Popconfirm
              title="确定要上架该场次吗？"
              onConfirm={() => handleUpdateStatus(record.id, 'onsale', '上架成功')}
              okText="确定"
              cancelText="取消"
            >
              <Button
                type="link"
                size="small"
                icon={<PlayCircleOutlined />}
              >
                上架
              </Button>
            </Popconfirm>
            <Popconfirm
              title="确定要取消该场次吗？"
              onConfirm={() => handleUpdateStatus(record.id, 'cancelled', '取消成功')}
              okText="确定"
              cancelText="取消"
            >
              <Button
                type="link"
                size="small"
                danger
                icon={<CloseOutlined />}
              >
                取消
              </Button>
            </Popconfirm>
            <Button
              type="link"
              size="small"
              icon={<CalendarOutlined />}
              onClick={() => handleAddShow(record)}
            >
              加场
            </Button>
          </>
        )}

        {record.status === 'onsale' && (
          <>
            <Button
              type="link"
              size="small"
              icon={<EyeOutlined />}
              onClick={() => navigate(`/shows/${record.id}/ticket-design`)}
            >
              查看票版
            </Button>
            <Button
              type="link"
              size="small"
              icon={<ScheduleOutlined />}
              onClick={() => navigate(`/shows/${record.id}/sales`)}
            >
              售票
            </Button>
            {canEdit && (
              <>
                <Popconfirm
                  title="确定要结束该场次吗？"
                  onConfirm={() => handleUpdateStatus(record.id, 'ended', '已结束')}
                  okText="确定"
                  cancelText="取消"
                >
                  <Button
                    type="link"
                    size="small"
                    icon={<StopOutlined />}
                  >
                    结束
                  </Button>
                </Popconfirm>
                <Popconfirm
                  title="确定要取消该场次吗？"
                  onConfirm={() => handleUpdateStatus(record.id, 'cancelled', '取消成功')}
                  okText="确定"
                  cancelText="取消"
                >
                  <Button
                    type="link"
                    size="small"
                    danger
                    icon={<CloseOutlined />}
                  >
                    取消
                  </Button>
                </Popconfirm>
              </>
            )}
          </>
        )}

        {record.status === 'soldout' && (
          <>
            <Button
              type="link"
              size="small"
              icon={<ScheduleOutlined />}
              disabled
            >
              售罄
            </Button>
            {canEdit && (
              <>
                <Popconfirm
                  title="确定要结束该场次吗？"
                  onConfirm={() => handleUpdateStatus(record.id, 'ended', '已结束')}
                  okText="确定"
                  cancelText="取消"
                >
                  <Button
                    type="link"
                    size="small"
                    icon={<StopOutlined />}
                  >
                    结束
                  </Button>
                </Popconfirm>
                <Popconfirm
                  title="确定要取消该场次吗？"
                  onConfirm={() => handleUpdateStatus(record.id, 'cancelled', '取消成功')}
                  okText="确定"
                  cancelText="取消"
                >
                  <Button
                    type="link"
                    size="small"
                    danger
                    icon={<CloseOutlined />}
                  >
                    取消
                  </Button>
                </Popconfirm>
              </>
            )}
          </>
        )}

        {record.status === 'ended' && (
          <>
            <Button
              type="link"
              size="small"
              icon={<BarChartOutlined />}
              onClick={() => navigate(`/statistics/box-office?showId=${record.id}`)}
            >
              票房统计
            </Button>
            {canEdit && (
              <Button
                type="link"
                size="small"
                icon={<PayCircleOutlined />}
                onClick={() => navigate(`/statistics/settlement?showId=${record.id}`)}
              >
                结算
              </Button>
            )}
          </>
        )}

        {record.status === 'cancelled' && (
          <Button
            type="link"
            size="small"
            icon={<EyeOutlined />}
            onClick={() => navigate(`/shows/${record.id}/ticket-design`)}
          >
            查看
          </Button>
        )}
      </Space>
    );
  };

  const columns = [
    {
      title: '演出名称',
      dataIndex: 'performanceName',
      key: 'performanceName',
      width: 180,
    },
    {
      title: '剧场',
      dataIndex: 'theaterName',
      key: 'theaterName',
      width: 150,
    },
    {
      title: '日期',
      dataIndex: 'showDate',
      key: 'showDate',
      width: 120,
      render: (date) => date ? dayjs(date).format('YYYY-MM-DD') : '-',
    },
    {
      title: '开始时间',
      dataIndex: 'startTime',
      key: 'startTime',
      width: 100,
    },
    {
      title: '结束时间',
      dataIndex: 'endTime',
      key: 'endTime',
      width: 100,
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 100,
      render: (status) => {
        const statusInfo = statusMap[status] || { text: status, color: 'default' };
        return <Tag color={statusInfo.color}>{statusInfo.text}</Tag>;
      },
    },
    {
      title: '操作',
      key: 'action',
      width: 380,
      fixed: 'right',
      render: renderActions,
    },
  ];

  return (
    <div>
      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2 style={{ margin: 0 }}>场次排期</h2>
        <Space>
          {canEdit && (
            <Button
              icon={<CalendarOutlined />}
              onClick={() => setBatchModalVisible(true)}
            >
              批量创建
            </Button>
          )}
          {canEdit && (
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={() => navigate('/shows/new')}
            >
              新建场次
            </Button>
          )}
        </Space>
      </div>

      <div style={{ marginBottom: 16, padding: 16, background: '#fafafa', borderRadius: 8 }}>
        <Space wrap>
          <Select
            placeholder="请选择演出项目"
            value={performanceId || undefined}
            onChange={(value) => setPerformanceId(value)}
            style={{ width: 200 }}
            allowClear
            showSearch
            optionFilterProp="children"
          >
            {performances.map((p) => (
              <Option key={p.id} value={p.id}>
                {p.name}
              </Option>
            ))}
          </Select>
          <Select
            placeholder="请选择状态"
            value={status || undefined}
            onChange={(value) => setStatus(value)}
            style={{ width: 150 }}
            allowClear
          >
            <Option value="draft">待上架</Option>
            <Option value="onsale">售票中</Option>
            <Option value="soldout">售罄</Option>
            <Option value="cancelled">已取消</Option>
            <Option value="ended">已结束</Option>
          </Select>
          <RangePicker
            value={dateRange}
            onChange={(value) => setDateRange(value)}
            style={{ width: 280 }}
          />
          <Button type="primary" onClick={handleSearch}>搜索</Button>
          <Button onClick={handleReset}>重置</Button>
        </Space>
      </div>

      <Table
        columns={columns}
        dataSource={data}
        rowKey="id"
        loading={loading}
        scroll={{ x: 1300 }}
      />

      <Modal
        title="批量创建周期场次"
        open={batchModalVisible}
        onOk={handleBatchCreate}
        onCancel={() => setBatchModalVisible(false)}
        okText="确定"
        cancelText="取消"
        width={600}
        destroyOnClose
      >
        <Form form={batchForm} layout="vertical">
          <Form.Item
            name="performanceId"
            label="演出项目"
            rules={[{ required: true, message: '请选择演出项目' }]}
          >
            <Select placeholder="请选择演出项目" showSearch optionFilterProp="children">
              {performances.filter(p => p.status === 'approved').map((p) => (
                <Option key={p.id} value={p.id}>
                  {p.name}
                </Option>
              ))}
            </Select>
          </Form.Item>
          <Form.Item
            name="theaterId"
            label="剧场"
            rules={[{ required: true, message: '请选择剧场' }]}
          >
            <Select placeholder="请选择剧场">
              {theaters.map((t) => (
                <Option key={t.id} value={t.id}>
                  {t.name}
                </Option>
              ))}
            </Select>
          </Form.Item>
          <Form.Item
            name="seatTemplateId"
            label="座位模板"
            rules={[{ required: true, message: '请选择座位模板' }]}
          >
            <Select placeholder="请选择座位模板">
              <Option value={1}>默认模板</Option>
            </Select>
          </Form.Item>
          <Form.Item
            name="startDate"
            label="开始日期"
            rules={[{ required: true, message: '请选择开始日期' }]}
          >
            <DatePicker style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item
            name="endDate"
            label="结束日期"
            rules={[{ required: true, message: '请选择结束日期' }]}
          >
            <DatePicker style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item
            name="weekdays"
            label="星期"
            rules={[{ required: true, message: '请选择星期' }]}
          >
            <Select mode="multiple" placeholder="请选择星期">
              <Option value={1}>周一</Option>
              <Option value={2}>周二</Option>
              <Option value={3}>周三</Option>
              <Option value={4}>周四</Option>
              <Option value={5}>周五</Option>
              <Option value={6}>周六</Option>
              <Option value={0}>周日</Option>
            </Select>
          </Form.Item>
          <Form.Item
            name="startTime"
            label="开始时间"
            rules={[{ required: true, message: '请输入开始时间' }]}
          >
            <Input placeholder="例如: 19:30" />
          </Form.Item>
          <Form.Item
            name="endTime"
            label="结束时间"
            rules={[{ required: true, message: '请输入结束时间' }]}
          >
            <Input placeholder="例如: 21:30" />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="加场"
        open={addShowModalVisible}
        onOk={handleAddShowSubmit}
        onCancel={() => setAddShowModalVisible(false)}
        okText="确定"
        cancelText="取消"
        destroyOnClose
      >
        <Form form={addShowForm} layout="vertical">
          <Form.Item
            name="showDate"
            label="日期"
            rules={[{ required: true, message: '请选择日期' }]}
          >
            <DatePicker style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item
            name="startTime"
            label="开始时间"
            rules={[{ required: true, message: '请输入开始时间' }]}
          >
            <Input placeholder="例如: 19:30" />
          </Form.Item>
          <Form.Item
            name="endTime"
            label="结束时间"
            rules={[{ required: true, message: '请输入结束时间' }]}
          >
            <Input placeholder="例如: 21:30" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default ShowList;
