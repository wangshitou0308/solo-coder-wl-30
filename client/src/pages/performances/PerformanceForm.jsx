import React, { useState, useEffect } from 'react';
import { Form, Input, Select, InputNumber, Button, Card, message, Space, Typography } from 'antd';
import { useParams, useNavigate } from 'react-router-dom';
import { performanceAPI, theaterAPI } from '../../services/api';

const { Title } = Typography;
const { TextArea } = Input;
const { Option } = Select;

const PerformanceForm = () => {
  const [form] = Form.useForm();
  const { id } = useParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(false);
  const [groups, setGroups] = useState([]);
  const isEdit = !!id;

  const typeOptions = [
    { label: '话剧', value: '话剧' },
    { label: '音乐剧', value: '音乐剧' },
    { label: '戏曲', value: '戏曲' },
    { label: '音乐会', value: '音乐会' },
    { label: '舞剧', value: '舞剧' },
    { label: '儿童剧', value: '儿童剧' },
    { label: '其他', value: '其他' },
  ];

  useEffect(() => {
    fetchGroups();
    if (isEdit) {
      fetchPerformanceDetail();
    }
  }, [id]);

  const fetchGroups = async () => {
    try {
      const response = await theaterAPI.listGroups();
      setGroups(response.data.groups || response.data || []);
    } catch (err) {
      message.error('获取演出团体列表失败');
    }
  };

  const fetchPerformanceDetail = async () => {
    setInitialLoading(true);
    try {
      const response = await performanceAPI.get(id);
      const data = response.data.performance || response.data;
      form.setFieldsValue({
        name: data.name,
        type: data.type,
        groupId: data.groupId,
        cast: data.cast,
        posterUrl: data.posterUrl,
        description: data.description,
        duration: data.duration,
      });
    } catch (err) {
      message.error('获取演出详情失败');
    } finally {
      setInitialLoading(false);
    }
  };

  const handleSubmit = async (values) => {
    setLoading(true);
    try {
      if (isEdit) {
        await performanceAPI.update(id, values);
        message.success('更新成功');
      } else {
        await performanceAPI.create(values);
        message.success('创建成功');
      }
      navigate('/performances');
    } catch (err) {
      message.error(err.response?.data?.message || '提交失败');
    } finally {
      setLoading(false);
    }
  };

  const handleBack = () => {
    navigate('/performances');
  };

  if (initialLoading) {
    return (
      <div style={{ textAlign: 'center', padding: '50px' }}>
        <div>加载中...</div>
      </div>
    );
  }

  return (
    <Card>
      <Title level={4} style={{ marginBottom: 24 }}>
        {isEdit ? '编辑演出项目' : '新增演出项目'}
      </Title>
      <Form
        form={form}
        layout="vertical"
        onFinish={handleSubmit}
        initialValues={{ duration: 120 }}
      >
        <Form.Item
          name="name"
          label="剧目名称"
          rules={[{ required: true, message: '请输入剧目名称' }]}
          required
        >
          <Input placeholder="请输入剧目名称" maxLength={100} showCount />
        </Form.Item>

        <Form.Item
          name="type"
          label="类型"
          rules={[{ required: true, message: '请选择演出类型' }]}
          required
        >
          <Select placeholder="请选择演出类型">
            {typeOptions.map((item) => (
              <Option key={item.value} value={item.value}>
                {item.label}
              </Option>
            ))}
          </Select>
        </Form.Item>

        <Form.Item
          name="groupId"
          label="演出团体"
          rules={[{ required: true, message: '请选择演出团体' }]}
          required
        >
          <Select placeholder="请选择演出团体" showSearch optionFilterProp="children">
            {groups.map((group) => (
              <Option key={group.id} value={group.id}>
                {group.name}
              </Option>
            ))}
          </Select>
        </Form.Item>

        <Form.Item
          name="duration"
          label="时长（分钟）"
          rules={[
            { required: true, message: '请输入演出时长' },
            { type: 'number', min: 1, message: '时长至少为1分钟' },
          ]}
          required
        >
          <InputNumber
            min={1}
            max={600}
            placeholder="请输入演出时长"
            style={{ width: '100%' }}
          />
        </Form.Item>

        <Form.Item
          name="cast"
          label="阵容"
          rules={[{ required: true, message: '请输入演出阵容' }]}
          required
        >
          <TextArea
            rows={4}
            placeholder="请输入主要演员、导演等信息"
            maxLength={500}
            showCount
          />
        </Form.Item>

        <Form.Item
          name="posterUrl"
          label="海报URL"
          rules={[
            { type: 'url', message: '请输入有效的URL地址' },
          ]}
        >
          <Input placeholder="请输入海报图片URL" />
        </Form.Item>

        <Form.Item
          name="description"
          label="简介"
          rules={[{ required: true, message: '请输入剧目简介' }]}
          required
        >
          <TextArea
            rows={6}
            placeholder="请输入剧目简介"
            maxLength={2000}
            showCount
          />
        </Form.Item>

        <Form.Item style={{ marginTop: 32, marginBottom: 0 }}>
          <Space>
            <Button type="primary" htmlType="submit" loading={loading}>
              {isEdit ? '保存修改' : '创建演出'}
            </Button>
            <Button onClick={handleBack}>
              返回列表
            </Button>
          </Space>
        </Form.Item>
      </Form>
    </Card>
  );
};

export default PerformanceForm;
