import React, { useState, useEffect } from 'react';
import { Table, Button, Input, Select, Modal, Form, message, Space, Popconfirm, Tag } from 'antd';
import { PlusOutlined, EditOutlined, CheckOutlined, CloseOutlined, EyeOutlined, CalendarOutlined, DeleteOutlined, SearchOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { performanceAPI } from '../../services/api';
import { useAuth } from '../../context/AuthContext';

const { Option } = Select;
const { TextArea } = Input;

const statusMap = {
  pending: { text: '待审批', color: 'orange' },
  approved: { text: '已通过', color: 'green' },
  rejected: { text: '已驳回', color: 'red' },
};

const PerformanceList = () => {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searchStatus, setSearchStatus] = useState('');
  const [rejectModalVisible, setRejectModalVisible] = useState(false);
  const [rejectForm] = Form.useForm();
  const [currentPerformance, setCurrentPerformance] = useState(null);
  const { hasRole } = useAuth();
  const navigate = useNavigate();

  const fetchData = async () => {
    setLoading(true);
    try {
      const params = {};
      if (searchStatus) params.status = searchStatus;
      const res = await performanceAPI.list(params);
      const performances = res.data.performances || res.data || [];
      setData(performances);
    } catch (err) {
      message.error(err.response?.data?.message || '获取列表失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [searchStatus]);

  const handleSearch = () => {
    fetchData();
  };

  const handleReset = () => {
    setSearchStatus('');
  };

  const handleApprove = async (id) => {
    try {
      await performanceAPI.approve(id);
      message.success('审批通过');
      fetchData();
    } catch (err) {
      message.error(err.response?.data?.message || '审批失败');
    }
  };

  const handleReject = (record) => {
    setCurrentPerformance(record);
    setRejectModalVisible(true);
    rejectForm.resetFields();
  };

  const handleRejectSubmit = async () => {
    try {
      const values = await rejectForm.validateFields();
      await performanceAPI.reject(currentPerformance.id, { rejectReason: values.rejectReason });
      message.success('已驳回');
      setRejectModalVisible(false);
      fetchData();
    } catch (err) {
      if (err.errorFields) return;
      message.error(err.response?.data?.message || '驳回失败');
    }
  };

  const handleDelete = async (id) => {
    try {
      await performanceAPI.delete(id);
      message.success('删除成功');
      fetchData();
    } catch (err) {
      message.error(err.response?.data?.message || '删除失败');
    }
  };

  const columns = [
    {
      title: '剧目名称',
      dataIndex: 'name',
      key: 'name',
      width: 200,
    },
    {
      title: '类型',
      dataIndex: 'type',
      key: 'type',
      width: 100,
    },
    {
      title: '演出团体',
      dataIndex: 'groupName',
      key: 'groupName',
      width: 180,
    },
    {
      title: '时长',
      dataIndex: 'duration',
      key: 'duration',
      width: 80,
      render: (duration) => duration ? `${duration}分钟` : '-',
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
      title: '创建人',
      dataIndex: 'creatorName',
      key: 'creatorName',
      width: 100,
      render: (name) => name || '-',
    },
    {
      title: '创建时间',
      dataIndex: 'createdAt',
      key: 'createdAt',
      width: 160,
      render: (date) => date ? new Date(date).toLocaleString('zh-CN') : '-',
    },
    {
      title: '操作',
      key: 'action',
      width: 300,
      fixed: 'right',
      render: (_, record) => (
        <Space size="small" wrap>
          <Button
            type="link"
            size="small"
            icon={<EyeOutlined />}
            onClick={() => navigate(`/performances/edit/${record.id}`)}
          >
            详情
          </Button>
          {record.status === 'pending' && (
            <>
              <Button
                type="link"
                size="small"
                icon={<EditOutlined />}
                onClick={() => navigate(`/performances/edit/${record.id}`)}
              >
                编辑
              </Button>
              {hasRole('manager') && (
                <>
                  <Button
                    type="link"
                    size="small"
                    icon={<CheckOutlined />}
                    onClick={() => handleApprove(record.id)}
                  >
                    通过
                  </Button>
                  <Button
                    type="link"
                    size="small"
                    danger
                    icon={<CloseOutlined />}
                    onClick={() => handleReject(record)}
                  >
                    驳回
                  </Button>
                </>
              )}
            </>
          )}
          {record.status === 'approved' && (
            <Button
              type="link"
              size="small"
              icon={<CalendarOutlined />}
              onClick={() => navigate(`/shows/new?performanceId=${record.id}`)}
            >
              排期
            </Button>
          )}
          {hasRole('manager') && record.status === 'pending' && (
            <Popconfirm
              title="确定要删除这个演出项目吗？"
              onConfirm={() => handleDelete(record.id)}
              okText="确定"
              cancelText="取消"
            >
              <Button
                type="link"
                size="small"
                danger
                icon={<DeleteOutlined />}
              >
                删除
              </Button>
            </Popconfirm>
          )}
        </Space>
      ),
    },
  ];

  return (
    <div>
      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2 style={{ margin: 0 }}>演出项目</h2>
        <Button
          type="primary"
          icon={<PlusOutlined />}
          onClick={() => navigate('/performances/new')}
        >
          新建演出项目
        </Button>
      </div>

      <div style={{ marginBottom: 16, padding: 16, background: '#fafafa', borderRadius: 8 }}>
        <Space wrap>
          <Select
            placeholder="请选择状态"
            value={searchStatus || undefined}
            onChange={(value) => setSearchStatus(value)}
            style={{ width: 150 }}
            allowClear
          >
            <Option value="pending">待审批</Option>
            <Option value="approved">已通过</Option>
            <Option value="rejected">已驳回</Option>
          </Select>
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
        title="驳回演出项目"
        open={rejectModalVisible}
        onOk={handleRejectSubmit}
        onCancel={() => setRejectModalVisible(false)}
        okText="确定"
        cancelText="取消"
        width={500}
      >
        <Form form={rejectForm} layout="vertical">
          <Form.Item
            name="rejectReason"
            label="驳回原因"
            rules={[{ required: true, message: '请输入驳回原因' }]}
          >
            <TextArea
              rows={4}
              placeholder="请输入驳回原因"
              maxLength={500}
              showCount
            />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default PerformanceList;
